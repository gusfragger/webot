const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const MeetingRepository = require('../../database/models/meeting');
const UserRepository = require('../../database/models/user');
const EmbedBuilderUtils = require('../../utils/embed-builder');

class MeetingStatsCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('meeting-stats')
      .setDescription('View meeting statistics and insights')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('View stats for a specific user (default: yourself)')
      )
      .addStringOption(option =>
        option
          .setName('period')
          .setDescription('Time period for statistics')
          .addChoices(
            { name: 'Last 7 days', value: '7d' },
            { name: 'Last 30 days', value: '30d' },
            { name: 'Last 90 days', value: '90d' },
            { name: 'All time', value: 'all' }
          )
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of statistics to show')
          .addChoices(
            { name: 'Personal Stats', value: 'personal' },
            { name: 'Team Overview', value: 'team' },
            { name: 'Leaderboard', value: 'leaderboard' }
          )
      );

    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      await this.ensureUserExists(interaction);

      const inputData = this.extractInputData(interaction);
      const period = this.calculateDateRange(inputData.period);

      let embed;

      switch (inputData.type) {
        case 'team':
          embed = await this.createTeamStatsEmbed(period);
          break;
        case 'leaderboard':
          embed = await this.createLeaderboardEmbed(period);
          break;
        case 'personal':
        default:
          embed = await this.createPersonalStatsEmbed(inputData.targetUser, period);
          break;
      }

      await interaction.editReply({
        embeds: [embed]
      });

      console.log(`Meeting stats viewed by ${interaction.user.username}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  extractInputData(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const period = interaction.options.getString('period') || '30d';
    const type = interaction.options.getString('type') || 'personal';

    return { targetUser, period, type };
  }

  calculateDateRange(period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case '30d':
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case '90d':
        startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case 'all':
      default:
        startDate = new Date('2020-01-01');
        break;
    }

    return { startDate, endDate: now };
  }

  async createPersonalStatsEmbed(user, period) {
    const stats = await this.getPersonalStats(user.id, period);

    const embed = EmbedBuilderUtils.createMeetingStatsEmbed(stats, user.id);

    embed.setTitle(`📈 Meeting Statistics - ${user.displayName || user.username}`);

    embed.addFields(
      { name: '🎯 Response Rate', value: `${stats.response_rate || 0}%`, inline: true },
      { name: '⚡ Avg Response Time', value: this.formatResponseTime(stats.avg_response_time), inline: true },
      { name: '🏆 Points Earned', value: (stats.points || 0).toString(), inline: true }
    );

    if (stats.favorite_time) {
      embed.addFields(
        { name: '⏰ Favorite Meeting Time', value: stats.favorite_time, inline: true }
      );
    }

    if (stats.achievements && stats.achievements.length > 0) {
      const achievementList = stats.achievements.slice(0, 5).map(a => `🏅 ${a}`).join('\n');
      embed.addFields(
        { name: '🏆 Recent Achievements', value: achievementList, inline: false }
      );
    }

    embed.setFooter({
      text: `Statistics for ${this.formatPeriod(period.startDate, period.endDate)}`
    });

    return embed;
  }

  async createTeamStatsEmbed(period) {
    const teamStats = await this.getTeamStats(period);

    const embed = EmbedBuilderUtils.createSuccessEmbed(
      '👥 Team Meeting Statistics',
      'Overview of team meeting activity and engagement'
    );

    embed.embeds[0].addFields(
      { name: '📊 Total Meetings', value: teamStats.total_meetings.toString(), inline: true },
      { name: '✅ Confirmed Meetings', value: teamStats.confirmed_meetings.toString(), inline: true },
      { name: '👥 Active Users', value: teamStats.active_users.toString(), inline: true },
      { name: '📈 Avg Attendance', value: `${teamStats.avg_attendance}%`, inline: true },
      { name: '⚡ Avg Response Time', value: this.formatResponseTime(teamStats.avg_response_time), inline: true },
      { name: '🎯 Success Rate', value: `${teamStats.success_rate}%`, inline: true }
    );

    if (teamStats.popular_times && teamStats.popular_times.length > 0) {
      const timesList = teamStats.popular_times.slice(0, 3).map((time, index) =>
        `${index + 1}. ${time.hour}:00 (${time.count} meetings)`
      ).join('\n');

      embed.embeds[0].addFields(
        { name: '⏰ Most Popular Meeting Times', value: timesList, inline: false }
      );
    }

    if (teamStats.busiest_days && teamStats.busiest_days.length > 0) {
      const daysList = teamStats.busiest_days.slice(0, 3).map((day, index) =>
        `${index + 1}. ${day.day_name} (${day.count} meetings)`
      ).join('\n');

      embed.embeds[0].addFields(
        { name: '📅 Busiest Days', value: daysList, inline: false }
      );
    }

    embed.embeds[0].setFooter({
      text: `Team statistics for ${this.formatPeriod(period.startDate, period.endDate)}`
    });

    return embed.embeds[0];
  }

  async createLeaderboardEmbed(period) {
    const leaderboard = await this.getLeaderboard(period);

    const embed = EmbedBuilderUtils.createSuccessEmbed(
      '🏆 Meeting Leaderboard',
      'Top contributors in meeting organization and participation'
    );

    if (leaderboard.most_meetings && leaderboard.most_meetings.length > 0) {
      const meetingsList = leaderboard.most_meetings.slice(0, 5).map((user, index) =>
        `${this.getRankEmoji(index)} ${user.display_name} - ${user.meeting_count} meetings`
      ).join('\n');

      embed.embeds[0].addFields(
        { name: '📅 Most Meetings Organized', value: meetingsList, inline: false }
      );
    }

    if (leaderboard.highest_points && leaderboard.highest_points.length > 0) {
      const pointsList = leaderboard.highest_points.slice(0, 5).map((user, index) =>
        `${this.getRankEmoji(index)} ${user.display_name} - ${user.points} points`
      ).join('\n');

      embed.embeds[0].addFields(
        { name: '🎯 Highest Points', value: pointsList, inline: false }
      );
    }

    if (leaderboard.fastest_responders && leaderboard.fastest_responders.length > 0) {
      const respondersList = leaderboard.fastest_responders.slice(0, 5).map((user, index) =>
        `${this.getRankEmoji(index)} ${user.display_name} - ${this.formatResponseTime(user.avg_response_time)}`
      ).join('\n');

      embed.embeds[0].addFields(
        { name: '⚡ Fastest Responders', value: respondersList, inline: false }
      );
    }

    embed.embeds[0].setFooter({
      text: `Leaderboard for ${this.formatPeriod(period.startDate, period.endDate)}`
    });

    return embed.embeds[0];
  }

  async getPersonalStats(userId, period) {
    const { database } = require('../../database/database');

    const meetingStats = await database.get(`
      SELECT
        COUNT(*) as total_meetings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_meetings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_meetings
      FROM meetings
      WHERE proposer_id = ?
      AND created_at >= ?
    `, [userId, period.startDate.toISOString()]);

    const responseStats = await database.get(`
      SELECT
        COUNT(*) as total_responses,
        AVG(
          CASE WHEN responded_at IS NOT NULL THEN
            (julianday(responded_at) - julianday(m.created_at)) * 24 * 60
          END
        ) as avg_response_time_minutes
      FROM meeting_responses mr
      JOIN meetings m ON mr.meeting_id = m.id
      WHERE mr.user_id = ?
      AND mr.responded_at >= ?
    `, [userId, period.startDate.toISOString()]);

    const user = await this.userRepo.findById(userId);

    const favoriteTime = await this.getFavoriteTime(userId, period);

    return {
      total_meetings: meetingStats?.total_meetings || 0,
      confirmed_meetings: meetingStats?.confirmed_meetings || 0,
      cancelled_meetings: meetingStats?.cancelled_meetings || 0,
      response_rate: this.calculateResponseRate(responseStats?.total_responses || 0, meetingStats?.total_meetings || 0),
      avg_response_time: responseStats?.avg_response_time_minutes || 0,
      points: user?.points || 0,
      achievements: user?.achievements || [],
      favorite_time: favoriteTime
    };
  }

  async getTeamStats(period) {
    const { database } = require('../../database/database');

    const totalStats = await database.get(`
      SELECT
        COUNT(*) as total_meetings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_meetings,
        COUNT(DISTINCT proposer_id) as active_users,
        AVG(
          CASE WHEN status = 'confirmed' THEN
            (SELECT COUNT(*) FROM meeting_responses WHERE meeting_id = m.id AND response = 'available')
          END
        ) as avg_attendance
      FROM meetings m
      WHERE created_at >= ?
    `, [period.startDate.toISOString()]);

    const responseStats = await database.get(`
      SELECT
        AVG(
          CASE WHEN responded_at IS NOT NULL THEN
            (julianday(responded_at) - julianday(m.created_at)) * 24 * 60
          END
        ) as avg_response_time_minutes
      FROM meeting_responses mr
      JOIN meetings m ON mr.meeting_id = m.id
      WHERE mr.responded_at >= ?
    `, [period.startDate.toISOString()]);

    const popularTimes = await database.all(`
      SELECT
        CAST(strftime('%H', proposed_datetime) AS INTEGER) as hour,
        COUNT(*) as count
      FROM meetings
      WHERE created_at >= ?
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 5
    `, [period.startDate.toISOString()]);

    const busiestDays = await database.all(`
      SELECT
        CASE CAST(strftime('%w', proposed_datetime) AS INTEGER)
          WHEN 0 THEN 'Sunday'
          WHEN 1 THEN 'Monday'
          WHEN 2 THEN 'Tuesday'
          WHEN 3 THEN 'Wednesday'
          WHEN 4 THEN 'Thursday'
          WHEN 5 THEN 'Friday'
          WHEN 6 THEN 'Saturday'
        END as day_name,
        COUNT(*) as count
      FROM meetings
      WHERE created_at >= ?
      GROUP BY strftime('%w', proposed_datetime)
      ORDER BY count DESC
      LIMIT 3
    `, [period.startDate.toISOString()]);

    return {
      total_meetings: totalStats?.total_meetings || 0,
      confirmed_meetings: totalStats?.confirmed_meetings || 0,
      active_users: totalStats?.active_users || 0,
      avg_attendance: Math.round(totalStats?.avg_attendance || 0),
      avg_response_time: responseStats?.avg_response_time_minutes || 0,
      success_rate: Math.round(((totalStats?.confirmed_meetings || 0) / Math.max(1, totalStats?.total_meetings || 1)) * 100),
      popular_times: popularTimes,
      busiest_days: busiestDays
    };
  }

  async getLeaderboard(period) {
    const { database } = require('../../database/database');

    const mostMeetings = await database.all(`
      SELECT
        u.display_name,
        u.username,
        COUNT(*) as meeting_count
      FROM meetings m
      JOIN users u ON m.proposer_id = u.id
      WHERE m.created_at >= ?
      GROUP BY m.proposer_id
      ORDER BY meeting_count DESC
      LIMIT 10
    `, [period.startDate.toISOString()]);

    const highestPoints = await database.all(`
      SELECT display_name, username, points
      FROM users
      WHERE points > 0
      ORDER BY points DESC
      LIMIT 10
    `);

    const fastestResponders = await database.all(`
      SELECT
        u.display_name,
        u.username,
        AVG(
          CASE WHEN mr.responded_at IS NOT NULL THEN
            (julianday(mr.responded_at) - julianday(m.created_at)) * 24 * 60
          END
        ) as avg_response_time
      FROM meeting_responses mr
      JOIN meetings m ON mr.meeting_id = m.id
      JOIN users u ON mr.user_id = u.id
      WHERE mr.responded_at >= ?
      GROUP BY mr.user_id
      HAVING COUNT(*) >= 3
      ORDER BY avg_response_time ASC
      LIMIT 10
    `, [period.startDate.toISOString()]);

    return {
      most_meetings: mostMeetings,
      highest_points: highestPoints,
      fastest_responders: fastestResponders
    };
  }

  async getFavoriteTime(userId, period) {
    const { database } = require('../../database/database');

    const favoriteTime = await database.get(`
      SELECT
        CAST(strftime('%H', proposed_datetime) AS INTEGER) as hour,
        COUNT(*) as count
      FROM meetings
      WHERE proposer_id = ?
      AND created_at >= ?
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `, [userId, period.startDate.toISOString()]);

    if (favoriteTime && favoriteTime.count > 0) {
      return `${favoriteTime.hour}:00`;
    }

    return null;
  }

  calculateResponseRate(responses, meetings) {
    if (meetings === 0) return 0;
    return Math.round((responses / meetings) * 100);
  }

  formatResponseTime(minutes) {
    if (!minutes || minutes === 0) return 'No data';

    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    } else if (minutes < 1440) {
      const hours = Math.round(minutes / 60);
      return `${hours}h`;
    } else {
      const days = Math.round(minutes / 1440);
      return `${days}d`;
    }
  }

  formatPeriod(startDate, endDate) {
    const now = new Date();
    const daysDiff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 7) return 'last 7 days';
    if (daysDiff <= 30) return 'last 30 days';
    if (daysDiff <= 90) return 'last 90 days';
    return 'all time';
  }

  getRankEmoji(index) {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    return emojis[index] || '🏅';
  }

  async validate(interaction) {
    if (!interaction.guild) {
      await this.handleError(interaction, new Error('This command can only be used in a server.'));
      return false;
    }

    return true;
  }
}

module.exports = new MeetingStatsCommand();