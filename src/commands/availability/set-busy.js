const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const AvailabilityRepository = require('../../database/models/availability');
const UserRepository = require('../../database/models/user');
const TimezoneUtils = require('../../utils/timezone-utils');
const { ValidationUtils } = require('../../utils/validation');
const EmbedBuilderUtils = require('../../utils/embed-builder');

class SetBusyCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('set-busy')
      .setDescription('Mark yourself as busy during specific times')
      .addStringOption(option =>
        option
          .setName('start-date')
          .setDescription('Start date (YYYY-MM-DD)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('start-time')
          .setDescription('Start time (HH:MM)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('end-date')
          .setDescription('End date (YYYY-MM-DD)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('end-time')
          .setDescription('End time (HH:MM)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('timezone')
          .setDescription('Your timezone (optional, uses your saved timezone)')
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for being busy (optional)')
          .setMaxLength(200)
      );

    this.availabilityRepo = new AvailabilityRepository();
    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction, true);

      await this.ensureUserExists(interaction);

      const inputData = await this.extractInputData(interaction);
      const validation = ValidationUtils.validateAvailabilityInput(inputData);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join('\n');
        await this.handleError(interaction, new Error(errorMessage));
        return;
      }

      const conflicts = await this.availabilityRepo.findConflicts(
        interaction.user.id,
        validation.sanitizedInput.parsed_start.utcTime.toISOString(),
        validation.sanitizedInput.parsed_end.utcTime.toISOString()
      );

      if (conflicts.length > 0) {
        const conflictList = conflicts.map(conflict => {
          const start = TimezoneUtils.formatTimeForDisplay(
            conflict.start_datetime,
            inputData.timezone,
            'MMM d, HH:mm'
          );
          const end = TimezoneUtils.formatTimeForDisplay(
            conflict.end_datetime,
            inputData.timezone,
            'HH:mm'
          );
          return `• ${start} - ${end}${conflict.reason ? ` (${conflict.reason})` : ''}`;
        }).join('\n');

        await interaction.editReply({
          embeds: [EmbedBuilderUtils.createErrorEmbed(
            'Scheduling Conflict',
            `You already have busy periods during this time:\n\n${conflictList}\n\nPlease choose a different time or update your existing availability.`
          ).embeds[0]],
          ephemeral: true
        });
        return;
      }

      const busyPeriod = await this.availabilityRepo.setBusyPeriod(
        interaction.user.id,
        validation.sanitizedInput.parsed_start.utcTime.toISOString(),
        validation.sanitizedInput.parsed_end.utcTime.toISOString(),
        validation.sanitizedInput.reason
      );

      await this.userRepo.addPoints(interaction.user.id, 3);

      const embed = this.createBusyPeriodEmbed(busyPeriod, inputData.timezone);

      await interaction.editReply({
        embeds: [embed],
        ephemeral: true
      });

      console.log(`${interaction.user.username} set busy period: ${busyPeriod.id}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  async extractInputData(interaction) {
    let timezone = interaction.options.getString('timezone');

    if (!timezone) {
      const user = await this.userRepo.findById(interaction.user.id);
      timezone = user?.timezone || 'UTC';
    }

    return {
      start_date: interaction.options.getString('start-date'),
      start_time: interaction.options.getString('start-time'),
      end_date: interaction.options.getString('end-date'),
      end_time: interaction.options.getString('end-time'),
      timezone: timezone,
      reason: interaction.options.getString('reason')
    };
  }

  createBusyPeriodEmbed(busyPeriod, timezone) {
    const embed = EmbedBuilderUtils.createSuccessEmbed(
      'Busy Period Set',
      'Your busy period has been recorded. You won\'t be suggested for meetings during this time.'
    );

    const startTime = TimezoneUtils.formatTimeForDisplay(
      busyPeriod.start_datetime,
      timezone,
      'PPP p'
    );

    const endTime = TimezoneUtils.formatTimeForDisplay(
      busyPeriod.end_datetime,
      timezone,
      'PPP p'
    );

    embed.embeds[0].addFields(
      { name: '📅 Start', value: startTime, inline: true },
      { name: '🏁 End', value: endTime, inline: true },
      { name: '🌍 Timezone', value: timezone, inline: true }
    );

    if (busyPeriod.reason) {
      embed.embeds[0].addFields(
        { name: '📝 Reason', value: busyPeriod.reason, inline: false }
      );
    }

    embed.embeds[0].setFooter({ text: `Busy Period ID: ${busyPeriod.id}` });

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

module.exports = new SetBusyCommand();