const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const TimezoneUtils = require('./timezone-utils');

class EmbedBuilderUtils {
  static createMeetingEmbed(meeting, responses = null, userTimezones = []) {
    const embed = new EmbedBuilder()
      .setTitle(`📅 ${meeting.title}`)
      .setColor(0x5865F2)
      .setTimestamp();

    if (meeting.description) {
      embed.setDescription(meeting.description);
    }

    const meetingDateTime = new Date(meeting.proposed_datetime);

    const timeFields = TimezoneUtils.formatTimeForMultipleTimezones(
      meetingDateTime,
      [meeting.timezone, ...userTimezones.filter(tz => tz !== meeting.timezone)]
    );

    let timeFieldValue = '';
    Object.entries(timeFields).forEach(([tz, data]) => {
      if (data.error) {
        timeFieldValue += `**${tz}:** Error\n`;
      } else {
        const isOriginal = tz === meeting.timezone;
        timeFieldValue += `${isOriginal ? '🎯 ' : ''}**${data.timezone}:** ${data.shortFormat}\n`;
      }
    });

    embed.addFields(
      { name: '⏰ Meeting Time', value: timeFieldValue || 'No timezone data', inline: false },
      { name: '⏱️ Duration', value: `${meeting.duration_minutes} minutes`, inline: true },
      { name: '👤 Proposed by', value: meeting.proposer_display_name || meeting.proposer_username, inline: true }
    );

    if (meeting.template_type) {
      embed.addFields(
        { name: '📋 Type', value: meeting.template_type.replace('_', ' ').toUpperCase(), inline: true }
      );
    }

    if (responses) {
      const responseText = [
        `✅ Available: ${responses.available.count}`,
        `❓ Maybe: ${responses.maybe.count}`,
        `❌ Unavailable: ${responses.unavailable.count}`
      ].join('\n');

      embed.addFields(
        { name: '📊 Responses', value: responseText, inline: true }
      );
    }

    embed.setFooter({ text: `Meeting ID: ${meeting.id} • Status: ${meeting.status}` });

    return embed;
  }

  static createMeetingActionRow(meetingId, disabled = false) {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`meeting_available_${meetingId}`)
          .setLabel('Available ✅')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`meeting_maybe_${meetingId}`)
          .setLabel('Maybe ❓')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`meeting_unavailable_${meetingId}`)
          .setLabel('Unavailable ❌')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled)
      );
  }

  static createAvailabilityEmbed(userId, availability, timezone) {
    const embed = new EmbedBuilder()
      .setTitle('📅 Your Availability')
      .setColor(0x00FF00)
      .setTimestamp();

    if (availability.length === 0) {
      embed.setDescription('No availability periods set. You appear to be available for all meetings!');
      return embed;
    }

    let availabilityText = '';
    availability.forEach(period => {
      const startTime = TimezoneUtils.formatTimeForDisplay(
        period.start_datetime,
        timezone,
        'MMM d, HH:mm'
      );
      const endTime = TimezoneUtils.formatTimeForDisplay(
        period.end_datetime,
        timezone,
        'MMM d, HH:mm'
      );

      const typeEmoji = period.availability_type === 'busy' ? '❌' : '✅';
      availabilityText += `${typeEmoji} ${startTime} - ${endTime}`;

      if (period.reason) {
        availabilityText += ` (${period.reason})`;
      }

      availabilityText += '\n';
    });

    embed.setDescription(availabilityText);
    embed.setFooter({ text: `Times shown in ${timezone}` });

    return embed;
  }

  static createTeamAvailabilityEmbed(teamAvailability, startDate, endDate) {
    const embed = new EmbedBuilder()
      .setTitle('👥 Team Availability Overview')
      .setColor(0x9932CC)
      .setTimestamp();

    const dateRange = `${TimezoneUtils.formatTimeForDisplay(startDate, 'UTC', 'MMM d')} - ${TimezoneUtils.formatTimeForDisplay(endDate, 'UTC', 'MMM d')}`;
    embed.setDescription(`Availability for ${dateRange}`);

    const userGroups = {};
    teamAvailability.forEach(period => {
      if (!userGroups[period.user_id]) {
        userGroups[period.user_id] = {
          name: period.display_name || period.username,
          timezone: period.timezone,
          periods: []
        };
      }
      userGroups[period.user_id].periods.push(period);
    });

    Object.values(userGroups).forEach(user => {
      let userText = `🌍 ${user.timezone}\n`;

      if (user.periods.length === 0) {
        userText += '✅ Available all week';
      } else {
        user.periods.forEach(period => {
          const startTime = TimezoneUtils.formatTimeForDisplay(
            period.start_datetime,
            user.timezone,
            'E HH:mm'
          );
          const endTime = TimezoneUtils.formatTimeForDisplay(
            period.end_datetime,
            user.timezone,
            'E HH:mm'
          );

          const typeEmoji = period.availability_type === 'busy' ? '❌' : '✅';
          userText += `${typeEmoji} ${startTime}-${endTime}`;

          if (period.reason) {
            userText += ` (${period.reason})`;
          }

          userText += '\n';
        });
      }

      embed.addFields({
        name: user.name,
        value: userText,
        inline: true
      });
    });

    return embed;
  }

  static createPollEmbed(poll, votes = []) {
    const embed = new EmbedBuilder()
      .setTitle('📊 Quick Poll')
      .setDescription(poll.question)
      .setColor(0xFF6B6B)
      .setTimestamp();

    const options = JSON.parse(poll.options);
    const voteCounts = {};

    options.forEach((option, index) => {
      voteCounts[index] = votes.filter(vote => vote.option_index === index).length;
    });

    const totalVotes = votes.length;

    let optionsText = '';
    options.forEach((option, index) => {
      const count = voteCounts[index] || 0;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const progressBar = EmbedBuilderUtils.createProgressBar(percentage, 10);

      optionsText += `**${index + 1}.** ${option}\n`;
      optionsText += `${progressBar} ${count} votes (${percentage}%)\n\n`;
    });

    embed.addFields({
      name: 'Options',
      value: optionsText || 'No options available',
      inline: false
    });

    const expiresAt = new Date(poll.expires_at);
    const now = new Date();
    const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
    const minutesRemaining = Math.floor(timeRemaining / (1000 * 60));

    embed.addFields(
      { name: '📊 Total Votes', value: totalVotes.toString(), inline: true },
      { name: '⏰ Time Remaining', value: `${minutesRemaining} minutes`, inline: true },
      { name: '📈 Status', value: poll.status.toUpperCase(), inline: true }
    );

    embed.setFooter({ text: `Poll ID: ${poll.id}` });

    return embed;
  }

  static createPollActionRow(pollId, options, disabled = false) {
    const buttons = [];

    options.slice(0, 5).forEach((option, index) => {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`poll_vote_${pollId}_${index}`)
          .setLabel(`${index + 1}. ${option.substring(0, 20)}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    });

    return new ActionRowBuilder().addComponents(buttons);
  }

  static createMeetingStatsEmbed(stats, userId) {
    const embed = new EmbedBuilder()
      .setTitle('📈 Meeting Statistics')
      .setColor(0x36393F)
      .setTimestamp();

    embed.addFields(
      { name: '📊 Total Meetings', value: stats.total_meetings?.toString() || '0', inline: true },
      { name: '✅ Confirmed', value: stats.confirmed_meetings?.toString() || '0', inline: true },
      { name: '❌ Cancelled', value: stats.cancelled_meetings?.toString() || '0', inline: true },
      { name: '📈 Average Attendance', value: `${Math.round(stats.avg_attendance || 0)}%`, inline: true }
    );

    const successRate = stats.total_meetings > 0
      ? Math.round((stats.confirmed_meetings / stats.total_meetings) * 100)
      : 0;

    embed.addFields(
      { name: '🎯 Success Rate', value: `${successRate}%`, inline: true }
    );

    embed.setFooter({ text: `Statistics for user ${userId}` });

    return embed;
  }

  static createReminderEmbed(meeting, timeUntilMeeting) {
    const embed = new EmbedBuilder()
      .setTitle('⏰ Meeting Reminder')
      .setDescription(`**${meeting.title}** is starting ${timeUntilMeeting}!`)
      .setColor(0xFFA500)
      .setTimestamp();

    const meetingTime = TimezoneUtils.formatTimeForDisplay(
      meeting.proposed_datetime,
      meeting.timezone
    );

    embed.addFields(
      { name: '📅 Meeting Time', value: meetingTime, inline: true },
      { name: '⏱️ Duration', value: `${meeting.duration_minutes} minutes`, inline: true }
    );

    if (meeting.description) {
      embed.addFields(
        { name: '📝 Description', value: meeting.description, inline: false }
      );
    }

    return embed;
  }

  static createErrorEmbed(title, description, ephemeral = true) {
    const embed = new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setColor(0xFF0000)
      .setTimestamp();

    return { embeds: [embed], ephemeral };
  }

  static createSuccessEmbed(title, description, ephemeral = false) {
    const embed = new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x00FF00)
      .setTimestamp();

    return { embeds: [embed], ephemeral };
  }

  static createProgressBar(percentage, length = 10) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  static createMeetingTemplateEmbed(templates) {
    const embed = new EmbedBuilder()
      .setTitle('📋 Meeting Templates')
      .setDescription('Choose a template to quickly create common meeting types')
      .setColor(0x7289DA)
      .setTimestamp();

    let templateText = '';
    templates.forEach(template => {
      templateText += `**${template.name}**\n`;
      templateText += `⏱️ Duration: ${template.duration} minutes\n`;
      templateText += `📝 ${template.description}\n\n`;
    });

    embed.addFields({
      name: 'Available Templates',
      value: templateText || 'No templates available',
      inline: false
    });

    return embed;
  }
}

module.exports = EmbedBuilderUtils;