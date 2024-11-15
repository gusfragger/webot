const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const UserRepository = require('../../database/models/user');
const TimezoneUtils = require('../../utils/timezone-utils');
// const { ValidationUtils } = require('../../utils/validation');
const EmbedBuilderUtils = require('../../utils/embed-builder');

class SetAvailabilityCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('set-availability')
      .setDescription('Set your working hours and timezone preferences')
      .addStringOption(option =>
        option
          .setName('timezone')
          .setDescription('Your timezone (e.g., UTC, Europe/Helsinki, America/New_York)')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('start-hour')
          .setDescription('Working hours start (0-23, default: 9)')
          .setMinValue(0)
          .setMaxValue(23)
      )
      .addIntegerOption(option =>
        option
          .setName('end-hour')
          .setDescription('Working hours end (0-23, default: 17)')
          .setMinValue(0)
          .setMaxValue(23)
      )
      .addStringOption(option =>
        option
          .setName('notifications')
          .setDescription('Reminder preferences (comma-separated: 24h, 1h, 15m, 5m)')
      );

    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction, true);

      await this.ensureUserExists(interaction);

      const inputData = this.extractInputData(interaction);
      const validation = this.validateAvailabilitySettings(inputData);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join('\n');
        await this.handleError(interaction, new Error(errorMessage));
        return;
      }

      const updateData = {
        timezone: validation.normalizedTimezone,
        working_hours_start: inputData.start_hour || 9,
        working_hours_end: inputData.end_hour || 17
      };

      if (validation.notificationPreferences) {
        updateData.notification_preferences = validation.notificationPreferences;
      }

      const updatedUser = await this.userRepo.update(interaction.user.id, updateData);

      await this.userRepo.addPoints(interaction.user.id, 5);

      const embed = this.createAvailabilitySettingsEmbed(updatedUser);

      await interaction.editReply({
        embeds: [embed],
        ephemeral: true
      });

      console.log(`${interaction.user.username} updated availability settings`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  extractInputData(interaction) {
    return {
      timezone: interaction.options.getString('timezone'),
      start_hour: interaction.options.getInteger('start-hour'),
      end_hour: interaction.options.getInteger('end-hour'),
      notifications: interaction.options.getString('notifications')
    };
  }

  validateAvailabilitySettings(inputData) {
    const errors = [];

    const timezoneValidation = TimezoneUtils.validateTimezone(inputData.timezone);
    if (!timezoneValidation.isValid) {
      errors.push({ field: 'timezone', message: timezoneValidation.error });
    }

    let workingHoursValid = true;
    const startHour = inputData.start_hour || 9;
    const endHour = inputData.end_hour || 17;

    if (startHour < 0 || startHour > 23) {
      errors.push({ field: 'start_hour', message: 'Start hour must be between 0 and 23' });
      workingHoursValid = false;
    }

    if (endHour < 0 || endHour > 23) {
      errors.push({ field: 'end_hour', message: 'End hour must be between 0 and 23' });
      workingHoursValid = false;
    }

    if (workingHoursValid && startHour >= endHour) {
      errors.push({ field: 'working_hours', message: 'End hour must be after start hour' });
    }

    let notificationPreferences = null;
    if (inputData.notifications) {
      const validNotifications = ['24h', '12h', '6h', '3h', '1h', '30m', '15m', '5m'];
      const notifications = inputData.notifications.split(',').map(n => n.trim());

      const invalidNotifications = notifications.filter(n => !validNotifications.includes(n));

      if (invalidNotifications.length > 0) {
        errors.push({
          field: 'notifications',
          message: `Invalid notification preferences: ${invalidNotifications.join(', ')}. Valid options: ${validNotifications.join(', ')}`
        });
      } else {
        notificationPreferences = notifications;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      normalizedTimezone: timezoneValidation.isValid ? timezoneValidation.normalized : null,
      notificationPreferences
    };
  }

  createAvailabilitySettingsEmbed(user) {
    const embed = EmbedBuilderUtils.createSuccessEmbed(
      'Availability Settings Updated',
      'Your working hours and timezone preferences have been saved.'
    );

    const workingHours = `${user.working_hours_start}:00 - ${user.working_hours_end}:00`;

    const sampleTime = new Date();
    sampleTime.setHours(12, 0, 0, 0);

    const currentTime = TimezoneUtils.formatTimeForDisplay(
      sampleTime,
      user.timezone,
      'HH:mm'
    );

    embed.embeds[0].addFields(
      { name: '🌍 Timezone', value: user.timezone, inline: true },
      { name: '⏰ Working Hours', value: workingHours, inline: true },
      { name: '🕐 Current Time', value: currentTime, inline: true }
    );

    if (user.notification_preferences && user.notification_preferences.length > 0) {
      embed.embeds[0].addFields(
        {
          name: '🔔 Notifications',
          value: user.notification_preferences.join(', '),
          inline: false
        }
      );
    }

    const timezoneOffset = TimezoneUtils.getTimezoneOffset(user.timezone);
    embed.embeds[0].addFields(
      { name: '🌐 UTC Offset', value: `UTC${timezoneOffset.formatted}`, inline: true }
    );

    embed.embeds[0].setFooter({
      text: 'These settings will be used for meeting scheduling and notifications'
    });

    return embed.embeds[0];
  }

  async validate(interaction) {
    if (!interaction.guild) {
      await this.handleError(interaction, new Error('This command can only be used in a server.'));
      return false;
    }

    return true;
  }
}

module.exports = new SetAvailabilityCommand();
