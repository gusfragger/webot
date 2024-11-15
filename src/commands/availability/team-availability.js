const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const AvailabilityRepository = require('../../database/models/availability');
const UserRepository = require('../../database/models/user');
const TimezoneUtils = require('../../utils/timezone-utils');
const EmbedBuilderUtils = require('../../utils/embed-builder');
const { addDays, startOfWeek, endOfWeek, parseISO, isValid } = require('date-fns');

class TeamAvailabilityCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('team-availability')
      .setDescription('View team availability for the week')
      .addStringOption(option =>
        option
          .setName('start-date')
          .setDescription('Start date (YYYY-MM-DD, default: this week)')
      )
      .addStringOption(option =>
        option
          .setName('timezone')
          .setDescription('Timezone to display times in (default: your timezone)')
      )
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('View specific user\'s availability')
      );

    this.availabilityRepo = new AvailabilityRepository();
    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      const inputData = await this.extractInputData(interaction);

      const { startDate, endDate } = this.calculateDateRange(inputData.start_date);

      let userIds;
      if (inputData.specific_user) {
        userIds = [inputData.specific_user.id];

        await this.userRepo.create({
          id: inputData.specific_user.id,
          username: inputData.specific_user.username,
          display_name: inputData.specific_user.displayName || inputData.specific_user.username
        });
      } else {
        const guildMembers = await this.getGuildMembers(interaction);
        userIds = guildMembers;
      }

      if (userIds.length === 0) {
        await interaction.editReply({
          embeds: [EmbedBuilderUtils.createErrorEmbed(
            'No Users Found',
            'No users found to check availability for.'
          ).embeds[0]]
        });
        return;
      }

      const teamAvailability = await this.availabilityRepo.getTeamAvailability(
        userIds,
        startDate.toISOString(),
        endDate.toISOString()
      );

      const embed = inputData.specific_user
        ? await this.createUserAvailabilityEmbed(teamAvailability, inputData, startDate, endDate)
        : await this.createTeamAvailabilityEmbed(teamAvailability, inputData, startDate, endDate);

      const optimalTimes = await this.suggestOptimalMeetingTimes(userIds, startDate, endDate);

      if (optimalTimes.length > 0 && !inputData.specific_user) {
        embed.addFields({
          name: '💡 Suggested Meeting Times',
          value: optimalTimes.slice(0, 3).map(time => {
            const timeStr = TimezoneUtils.formatTimeForDisplay(
              time.datetime,
              inputData.timezone,
              'E MMM d, HH:mm'
            );
            return `• ${timeStr} (${time.available_users}/${userIds.length} available)`;
          }).join('\n') || 'No optimal times found',
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [embed]
      });

      console.log(`Team availability viewed by ${interaction.user.username}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  async extractInputData(interaction) {
    let timezone = interaction.options.getString('timezone');

    if (!timezone) {
      await this.ensureUserExists(interaction);
      const user = await this.userRepo.findById(interaction.user.id);
      timezone = user?.timezone || 'UTC';
    }

    return {
      start_date: interaction.options.getString('start-date'),
      timezone: timezone,
      specific_user: interaction.options.getUser('user')
    };
  }

  calculateDateRange(startDateStr) {
    let startDate;

    if (startDateStr) {
      startDate = parseISO(startDateStr);
      if (!isValid(startDate)) {
        throw new Error('Invalid start date format. Use YYYY-MM-DD.');
      }
    } else {
      startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    }

    const endDate = addDays(startDate, 7);

    return { startDate, endDate };
  }

  async getGuildMembers(interaction) {
    try {
      const guild = interaction.guild;
      const members = await guild.members.fetch({ limit: 100 });

      const userIds = members
        .filter(member => !member.user.bot)
        .map(member => member.user.id);

      for (const member of members.values()) {
        if (!member.user.bot) {
          await this.userRepo.create({
            id: member.user.id,
            username: member.user.username,
            display_name: member.displayName || member.user.username
          });
        }
      }

      return userIds.slice(0, 20);
    } catch (error) {
      console.error('Failed to fetch guild members:', error);
      return [];
    }
  }

  async createTeamAvailabilityEmbed(teamAvailability, inputData, startDate, endDate) {
    const embed = EmbedBuilderUtils.createTeamAvailabilityEmbed(
      teamAvailability,
      startDate,
      endDate
    );

    embed.setTitle('👥 Team Availability Overview');

    const dateRange = `${TimezoneUtils.formatTimeForDisplay(startDate, inputData.timezone, 'MMM d')} - ${TimezoneUtils.formatTimeForDisplay(endDate, inputData.timezone, 'MMM d, yyyy')}`;

    embed.setDescription(`Team availability for ${dateRange}\nShowing times in **${inputData.timezone}**`);

    const heatmap = this.generateAvailabilityHeatmap(teamAvailability, inputData.timezone);

    if (heatmap) {
      embed.addFields({
        name: '📊 Weekly Heatmap',
        value: heatmap,
        inline: false
      });
    }

    return embed;
  }

  async createUserAvailabilityEmbed(teamAvailability, inputData, startDate, endDate) {
    const embed = EmbedBuilderUtils.createAvailabilityEmbed(
      inputData.specific_user.id,
      teamAvailability,
      inputData.timezone
    );

    embed.setTitle(`📅 ${inputData.specific_user.displayName || inputData.specific_user.username}'s Availability`);

    const dateRange = `${TimezoneUtils.formatTimeForDisplay(startDate, inputData.timezone, 'MMM d')} - ${TimezoneUtils.formatTimeForDisplay(endDate, inputData.timezone, 'MMM d, yyyy')}`;

    embed.setDescription(`Availability for ${dateRange}\nShowing times in **${inputData.timezone}**`);

    return embed;
  }

  generateAvailabilityHeatmap(teamAvailability, timezone) {
    try {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const hours = Array.from({ length: 24 }, (_, i) => i);

      let heatmap = '```\n     ';

      for (let hour = 8; hour <= 18; hour++) {
        heatmap += `${hour.toString().padStart(2, '0')} `;
      }

      heatmap += '\n';

      for (const day of days) {
        heatmap += `${day}  `;

        for (let hour = 8; hour <= 18; hour++) {
          const availability = this.calculateHourAvailability(teamAvailability, day, hour, timezone);
          const indicator = this.getAvailabilityIndicator(availability);
          heatmap += `${indicator}  `;
        }

        heatmap += '\n';
      }

      heatmap += '\nLegend: ██ High  ▓▓ Medium  ░░ Low  ·· None\n```';

      return heatmap;
    } catch (error) {
      console.error('Failed to generate heatmap:', error);
      return null;
    }
  }

  calculateHourAvailability(teamAvailability, dayName, hour, timezone) {
    const totalUsers = new Set(teamAvailability.map(a => a.user_id)).size;

    if (totalUsers === 0) return 0;

    const busyUsers = teamAvailability.filter(period => {
      if (period.availability_type !== 'busy') return false;

      const startTime = TimezoneUtils.convertToUserTimezone(period.start_datetime, timezone);
      const endTime = TimezoneUtils.convertToUserTimezone(period.end_datetime, timezone);

      const startHour = startTime.getHours();
      const endHour = endTime.getHours();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const periodDayName = dayNames[startTime.getDay()];

      return periodDayName === dayName && hour >= startHour && hour < endHour;
    });

    const availableUsers = totalUsers - new Set(busyUsers.map(b => b.user_id)).size;

    return totalUsers > 0 ? availableUsers / totalUsers : 0;
  }

  getAvailabilityIndicator(availability) {
    if (availability >= 0.8) return '██';
    if (availability >= 0.6) return '▓▓';
    if (availability >= 0.3) return '░░';
    return '··';
  }

  async suggestOptimalMeetingTimes(userIds, startDate, endDate) {
    try {
      const suggestions = [];
      const duration = 60;

      const current = new Date(startDate);
      while (current < endDate) {
        if (current.getDay() >= 1 && current.getDay() <= 5) {
          for (let hour = 9; hour <= 17; hour++) {
            const meetingTime = new Date(current);
            meetingTime.setHours(hour, 0, 0, 0);

            const endTime = new Date(meetingTime.getTime() + (duration * 60 * 1000));

            const conflicts = await this.availabilityRepo.getTeamAvailability(
              userIds,
              meetingTime.toISOString(),
              endTime.toISOString()
            );

            const busyUserIds = new Set(
              conflicts
                .filter(c => c.availability_type === 'busy')
                .map(c => c.user_id)
            );

            const availableUsers = userIds.length - busyUserIds.size;

            if (availableUsers > 0) {
              suggestions.push({
                datetime: meetingTime,
                available_users: availableUsers,
                total_users: userIds.length,
                score: availableUsers / userIds.length
              });
            }
          }
        }

        current.setDate(current.getDate() + 1);
      }

      return suggestions
        .sort((a, b) => b.score - a.score || b.available_users - a.available_users)
        .slice(0, 5);
    } catch (error) {
      console.error('Failed to suggest optimal meeting times:', error);
      return [];
    }
  }

  async validate(interaction) {
    if (!interaction.guild) {
      await this.handleError(interaction, new Error('This command can only be used in a server.'));
      return false;
    }

    return true;
  }
}

module.exports = new TeamAvailabilityCommand();