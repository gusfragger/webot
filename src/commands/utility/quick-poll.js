const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../base-command');
const UserRepository = require('../../database/models/user');
const { ValidationUtils } = require('../../utils/validation');
const EmbedBuilderUtils = require('../../utils/embed-builder');

class QuickPollCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('quick-poll')
      .setDescription('Create a quick poll for team decisions')
      .addStringOption(option =>
        option
          .setName('question')
          .setDescription('Poll question')
          .setRequired(true)
          .setMaxLength(200)
      )
      .addStringOption(option =>
        option
          .setName('options')
          .setDescription('Poll options separated by semicolons (;)')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('timeout')
          .setDescription('Poll timeout in minutes (default: 30)')
          .setMinValue(1)
          .setMaxValue(1440)
      );

    this.userRepo = new UserRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      if (await this.isRateLimited(interaction.user.id, 'quick-poll')) {
        await this.handleError(interaction, new Error('Rate limit exceeded. Please wait before creating another poll.'));
        return;
      }

      await this.ensureUserExists(interaction);

      const inputData = this.extractInputData(interaction);
      const validation = this.validatePollInput(inputData);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map(e => e.message).join('\n');
        await this.handleError(interaction, new Error(errorMessage));
        return;
      }

      const poll = await this.createPoll(validation.sanitizedInput, interaction);

      await this.userRepo.addPoints(interaction.user.id, 5);

      const embed = EmbedBuilderUtils.createPollEmbed(poll, []);
      const actionRow = EmbedBuilderUtils.createPollActionRow(poll.id, JSON.parse(poll.options));

      await interaction.editReply({
        content: '📊 **Quick Poll Created!** Cast your votes below.',
        embeds: [embed],
        components: [actionRow]
      });

      this.schedulePollTimeout(poll);

      console.log(`Poll ${poll.id} created by ${interaction.user.username}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  extractInputData(interaction) {
    const optionsString = interaction.options.getString('options');
    const options = optionsString.split(';').map(opt => opt.trim()).filter(opt => opt.length > 0);

    return {
      question: interaction.options.getString('question'),
      options: options,
      timeout: interaction.options.getInteger('timeout') || 30
    };
  }

  validatePollInput(inputData) {
    return ValidationUtils.validatePollInput(inputData);
  }

  async createPoll(sanitizedInput, interaction) {
    const { database } = require('../../database/database');

    const expiresAt = new Date(Date.now() + (sanitizedInput.timeout * 60 * 1000));

    const sql = `
      INSERT INTO quick_polls (
        creator_id, question, options, timeout_minutes, expires_at
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const result = await database.run(sql, [
      interaction.user.id,
      sanitizedInput.question,
      JSON.stringify(sanitizedInput.options),
      sanitizedInput.timeout,
      expiresAt.toISOString()
    ]);

    const poll = await database.get('SELECT * FROM quick_polls WHERE id = ?', [result.id]);

    return poll;
  }

  schedulePollTimeout(poll) {
    const timeoutMs = new Date(poll.expires_at).getTime() - Date.now();

    if (timeoutMs > 0) {
      setTimeout(async () => {
        await this.closePoll(poll.id);
      }, timeoutMs);
    }
  }

  async closePoll(pollId) {
    try {
      const { database } = require('../../database/database');

      await database.run(
        'UPDATE quick_polls SET status = ? WHERE id = ?',
        ['closed', pollId]
      );

      console.log(`Poll ${pollId} automatically closed due to timeout`);
    } catch (error) {
      console.error(`Failed to close poll ${pollId}:`, error);
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

module.exports = new QuickPollCommand();