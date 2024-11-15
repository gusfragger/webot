const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const MeetingRepository = require('../../database/models/meeting');
const UserRepository = require('../../database/models/user');
const TimezoneUtils = require('../../utils/timezone-utils');
const { ValidationUtils } = require('../../utils/validation');
const EmbedBuilderUtils = require('../../utils/embed-builder');
const { MEETING_TEMPLATES, RECURRING_PATTERNS } = require('../../config/templates');

class ScheduleRecurringCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('schedule-recurring')
      .setDescription('Schedule a recurring meeting series')
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
          .setDescription('First meeting date (YYYY-MM-DD)')
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
          .setDescription('Your timezone')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('pattern')
          .setDescription('Recurrence pattern')
          .setRequired(true)
          .addChoices(
            { name: 'Daily', value: 'daily' },
            { name: 'Weekly', value: 'weekly' },
            { name: 'Bi-weekly', value: 'biweekly' },
            { name: 'Monthly', value: 'monthly' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Meeting duration in minutes')
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
            { name: 'All Hands', value: 'all_hands' }
          )
      )
      .addStringOption(option =>
        option
          .setName('end-date')
          .setDescription('End date for the recurring series (YYYY-MM-DD)')
      )
      .addIntegerOption(option =>
        option
          .setName('max-occurrences')
          .setDescription('Maximum number of meetings to create')
          .setMinValue(1)
          .setMaxValue(52)
      );

    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      if (await this.isRateLimited(interaction.user.id, 'schedule-recurring')) {
        await this.handleError(interaction, new Error('Rate limit exceeded. Please wait before scheduling another recurring meeting.'));
        return;
      }

      await this.ensureUserExists(interaction);

      const inputData = this.extractInputData(interaction);
      const validation = this.validateRecurringInput(inputData);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join('\n');
        await this.handleError(interaction, new Error(errorMessage));
        return;
      }

      const meetings = await this.createRecurringMeetings(validation.sanitizedInput, interaction);

      await this.userRepo.addPoints(interaction.user.id, 25);
      await this.userRepo.addAchievement(interaction.user.id, 'scheduler');

      const embed = this.createRecurringMeetingSummaryEmbed(meetings, inputData);

      await interaction.editReply({
        content: `🔄 **Recurring meeting series created!** ${meetings.length} meetings scheduled.`,
        embeds: [embed]
      });

      console.log(`Recurring meeting series created by ${interaction.user.username}: ${meetings.length} meetings`);
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
      pattern: interaction.options.getString('pattern'),
      duration: interaction.options.getInteger('duration'),
      description: interaction.options.getString('description'),
      end_date: interaction.options.getString('end-date'),
      max_occurrences: interaction.options.getInteger('max-occurrences')
    };

    if (templateType && MEETING_TEMPLATES[templateType]) {
      const template = MEETING_TEMPLATES[templateType];

      inputData.duration = inputData.duration || template.duration;

      if (!inputData.description) {
        inputData.description = template.description;
      }

      inputData.template_type = templateType;

      if (!inputData.pattern && template.recurring_pattern) {
        inputData.pattern = template.recurring_pattern;
      }
    }

    return inputData;
  }

  validateRecurringInput(inputData) {
    const baseValidation = ValidationUtils.validateMeetingInput(inputData);

    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors = [...baseValidation.errors];

    if (!inputData.pattern || !RECURRING_PATTERNS[inputData.pattern]) {
      errors.push({ field: 'pattern', message: 'Invalid recurrence pattern' });
    }

    if (inputData.end_date) {
      const endDateValidation = ValidationUtils.validateMeetingInput({
        ...inputData,
        date: inputData.end_date,
        time: inputData.time
      });

      if (!endDateValidation.isValid) {
        errors.push({ field: 'end_date', message: 'Invalid end date' });
      } else {
        const startTime = baseValidation.sanitizedInput.parsed_datetime.utcTime;
        const endTime = endDateValidation.sanitizedInput.parsed_datetime.utcTime;

        if (endTime <= startTime) {
          errors.push({ field: 'end_date', message: 'End date must be after start date' });
        }

        baseValidation.sanitizedInput.parsed_end_date = endDateValidation.sanitizedInput.parsed_datetime;
      }
    }

    if (inputData.max_occurrences && (inputData.max_occurrences < 1 || inputData.max_occurrences > 52)) {
      errors.push({ field: 'max_occurrences', message: 'Max occurrences must be between 1 and 52' });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: baseValidation.sanitizedInput
    };
  }

  async createRecurringMeetings(sanitizedInput, interaction) {
    const pattern = RECURRING_PATTERNS[sanitizedInput.pattern];
    const startDate = sanitizedInput.parsed_datetime.utcTime;
    const maxOccurrences = sanitizedInput.max_occurrences || 10;

    const endDate = sanitizedInput.parsed_end_date
      ? sanitizedInput.parsed_end_date.utcTime
      : new Date(startDate.getTime() + (365 * 24 * 60 * 60 * 1000));

    const meetings = [];
    let currentDate = new Date(startDate);
    let occurrenceCount = 0;

    while (currentDate <= endDate && occurrenceCount < maxOccurrences) {
      const meetingData = {
        title: sanitizedInput.title,
        description: sanitizedInput.description,
        proposer_id: interaction.user.id,
        proposed_datetime: currentDate.toISOString(),
        timezone: sanitizedInput.timezone,
        duration_minutes: sanitizedInput.duration || 60,
        meeting_type: 'recurring',
        template_type: sanitizedInput.template_type
      };

      const meeting = await this.meetingRepo.create(meetingData);

      await this.createRecurrenceRecord(meeting.id, sanitizedInput.pattern, sanitizedInput);

      meetings.push(meeting);
      occurrenceCount++;

      currentDate = this.calculateNextOccurrence(currentDate, pattern);
    }

    return meetings;
  }

  calculateNextOccurrence(currentDate, pattern) {
    const nextDate = new Date(currentDate);

    switch (pattern.type) {
      case 'days':
        nextDate.setDate(nextDate.getDate() + pattern.interval);
        break;
      case 'weeks':
        nextDate.setDate(nextDate.getDate() + (pattern.interval * 7));
        break;
      case 'months':
        nextDate.setMonth(nextDate.getMonth() + pattern.interval);
        break;
    }

    return nextDate;
  }

  async createRecurrenceRecord(meetingId, pattern, inputData) {
    const { database } = require('../../database/database');

    const sql = `
      INSERT INTO recurring_meetings (
        meeting_id, recurrence_pattern, recurrence_interval, end_date, max_occurrences
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const endDate = inputData.parsed_end_date ? inputData.parsed_end_date.utcTime.toISOString() : null;

    await database.run(sql, [
      meetingId,
      pattern,
      RECURRING_PATTERNS[pattern].interval,
      endDate,
      inputData.max_occurrences
    ]);
  }

  createRecurringMeetingSummaryEmbed(meetings, inputData) {
    const embed = EmbedBuilderUtils.createSuccessEmbed(
      'Recurring Meeting Series Created',
      `Successfully created ${meetings.length} meetings in the "${inputData.title}" series.`
    );

    const firstMeeting = meetings[0];
    const lastMeeting = meetings[meetings.length - 1];

    embed.embeds[0].addFields(
      { name: '📅 Pattern', value: RECURRING_PATTERNS[inputData.pattern].name, inline: true },
      { name: '📊 Total Meetings', value: meetings.length.toString(), inline: true },
      { name: '⏱️ Duration', value: `${inputData.duration || 60} minutes`, inline: true },
      {
        name: '🗓️ First Meeting',
        value: TimezoneUtils.formatTimeForDisplay(
          firstMeeting.proposed_datetime,
          inputData.timezone,
          'PPP p'
        ),
        inline: false
      },
      {
        name: '🏁 Last Meeting',
        value: TimezoneUtils.formatTimeForDisplay(
          lastMeeting.proposed_datetime,
          inputData.timezone,
          'PPP p'
        ),
        inline: false
      }
    );

    if (inputData.template_type) {
      embed.embeds[0].addFields(
        { name: '📋 Template', value: MEETING_TEMPLATES[inputData.template_type].name, inline: true }
      );
    }

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

module.exports = new ScheduleRecurringCommand();