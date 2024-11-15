const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const MeetingRepository = require('../../database/models/meeting');
const UserRepository = require('../../database/models/user');
const TimezoneUtils = require('../../utils/timezone-utils');
const { ValidationUtils } = require('../../utils/validation');
const EmbedBuilderUtils = require('../../utils/embed-builder');
const { MEETING_TEMPLATES } = require('../../config/templates');

class ProposeMeetingCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('propose-meeting')
      .setDescription('Propose a meeting with timezone-aware scheduling')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Meeting title')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('date')
          .setDescription('Meeting date (YYYY-MM-DD)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('time')
          .setDescription('Meeting time (HH:MM in 24-hour format)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('timezone')
          .setDescription('Your timezone (e.g., UTC, Europe/Helsinki, America/New_York)')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Meeting duration in minutes (default: 60)')
          .setMinValue(15)
          .setMaxValue(480)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Meeting description')
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('template')
          .setDescription('Use a predefined meeting template')
          .addChoices(
            { name: 'Daily Standup', value: 'standup' },
            { name: 'Sprint Planning', value: 'sprint_planning' },
            { name: 'Code Review', value: 'code_review' },
            { name: 'Retrospective', value: 'retrospective' },
            { name: 'Gaming Session', value: 'gaming_session' },
            { name: 'One-on-One', value: 'one_on_one' },
            { name: 'All Hands', value: 'all_hands' },
            { name: 'Brainstorming', value: 'brainstorming' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('max-participants')
          .setDescription('Maximum number of participants (default: unlimited)')
          .setMinValue(2)
          .setMaxValue(50)
      );

    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      if (await this.isRateLimited(interaction.user.id, 'propose-meeting')) {
        await this.handleError(interaction, new Error('Rate limit exceeded. Please wait before proposing another meeting.'));
        return;
      }

      await this.ensureUserExists(interaction);

      const inputData = this.extractInputData(interaction);
      const validation = ValidationUtils.validateMeetingInput(inputData);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join('\n');
        await this.handleError(interaction, new Error(errorMessage));
        return;
      }

      const meetingData = await this.prepareMeetingData(validation.sanitizedInput, interaction);
      const meeting = await this.meetingRepo.create(meetingData);

      await this.userRepo.addPoints(interaction.user.id, 10);

      const userTimezones = await this.getUserTimezones(interaction.guildId);
      const responses = await this.meetingRepo.getResponseSummary(meeting.id);

      const embed = EmbedBuilderUtils.createMeetingEmbed(meeting, responses, userTimezones);
      const actionRow = EmbedBuilderUtils.createMeetingActionRow(meeting.id);

      await interaction.editReply({
        content: '📅 **Meeting proposed!** Team members can now respond with their availability.',
        embeds: [embed],
        components: [actionRow]
      });

      console.log(`Meeting ${meeting.id} proposed by ${interaction.user.username}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  extractInputData(interaction) {
    const templateType = interaction.options.getString('template');
    let inputData = {
      title: interaction.options.getString('title'),
      date: interaction.options.getString('date'),
      time: interaction.options.getString('time'),
      timezone: interaction.options.getString('timezone'),
      duration: interaction.options.getInteger('duration'),
      description: interaction.options.getString('description'),
      max_participants: interaction.options.getInteger('max-participants')
    };

    if (templateType && MEETING_TEMPLATES[templateType]) {
      const template = MEETING_TEMPLATES[templateType];

      inputData.duration = inputData.duration || template.duration;
      inputData.max_participants = inputData.max_participants || template.max_participants;

      if (!inputData.description) {
        inputData.description = template.description;
      }

      inputData.template_type = templateType;
    }

    return inputData;
  }

  async prepareMeetingData(sanitizedInput, interaction) {
    const meetingData = {
      title: sanitizedInput.title,
      description: sanitizedInput.description,
      proposer_id: interaction.user.id,
      proposed_datetime: sanitizedInput.parsed_datetime.utcTime.toISOString(),
      timezone: sanitizedInput.timezone,
      duration_minutes: sanitizedInput.duration || 60,
      template_type: sanitizedInput.template_type,
      max_participants: sanitizedInput.max_participants
    };

    return meetingData;
  }

  async getUserTimezones(guildId) {
    try {
      const users = await this.userRepo.findAll(100);
      return users.map(user => user.timezone).filter((tz, index, arr) => arr.indexOf(tz) === index);
    } catch (error) {
      console.error('Failed to get user timezones:', error);
      return ['UTC'];
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

module.exports = new ProposeMeetingCommand();