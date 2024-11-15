const { ValidationError } = require('../utils/validation');
const EmbedBuilderUtils = require('../utils/embed-builder');

class BaseCommand {
  constructor() {
    this.data = null;
    this.permissions = [];
  }

  async execute(interaction) {
    throw new Error('Execute method must be implemented');
  }

  async validate(interaction) {
    return true;
  }

  async handleError(interaction, error) {
    console.error(`Command error in ${this.data?.name}:`, error);

    let errorMessage = 'An unexpected error occurred while processing your command.';
    let ephemeral = true;

    if (error instanceof ValidationError) {
      errorMessage = error.message;
    } else if (error.message && error.isOperational) {
      errorMessage = error.message;
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(
          EmbedBuilderUtils.createErrorEmbed('Error', errorMessage, ephemeral)
        );
      } else {
        await interaction.reply(
          EmbedBuilderUtils.createErrorEmbed('Error', errorMessage, ephemeral)
        );
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }

  async sendSuccess(interaction, title, message, ephemeral = false) {
    try {
      const response = EmbedBuilderUtils.createSuccessEmbed(title, message, ephemeral);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(response);
      } else {
        await interaction.reply(response);
      }
    } catch (error) {
      console.error('Failed to send success message:', error);
    }
  }

  async deferReply(interaction, ephemeral = false) {
    try {
      await interaction.deferReply({ ephemeral });
    } catch (error) {
      console.error('Failed to defer reply:', error);
    }
  }

  checkPermissions(interaction) {
    if (this.permissions.length === 0) return true;

    const member = interaction.member;
    if (!member) return false;

    return this.permissions.some(permission =>
      member.permissions.has(permission)
    );
  }

  async ensureUserExists(interaction) {
    const UserRepository = require('../database/models/user');
    const userRepo = new UserRepository();

    try {
      // Try to find existing user first
      const existingUser = await userRepo.findById(interaction.user.id);
      if (!existingUser) {
        await userRepo.create({
          id: interaction.user.id,
          username: interaction.user.username,
          display_name: interaction.user.displayName || interaction.user.username
        });
      }
    } catch (error) {
      // Ignore UNIQUE constraint errors - user already exists
      if (!error.message.includes('UNIQUE constraint')) {
        console.error('Failed to ensure user exists:', error);
      }
    }
  }

  parseTimeInput(timeString) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = timeString.match(timeRegex);

    if (!match) {
      throw new ValidationError('Invalid time format. Use HH:MM (24-hour format)');
    }

    return timeString;
  }

  parseDateInput(dateString) {
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateString.match(dateRegex);

    if (!match) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid date');
    }

    return dateString;
  }

  formatUserMention(userId) {
    return `<@${userId}>`;
  }

  formatTimestamp(date, style = 'F') {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${style}>`;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  async isRateLimited(userId, commandName) {
    const rateLimiter = require('../middleware/rate-limiting');
    return !rateLimiter.checkRateLimit(userId, commandName);
  }
}

module.exports = BaseCommand;