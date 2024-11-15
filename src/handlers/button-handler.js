const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const MeetingRepository = require('../database/models/meeting');
const UserRepository = require('../database/models/user');
const EmbedBuilderUtils = require('../utils/embed-builder');

class ButtonHandler {
  constructor() {
    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
  }

  async handleButton(interaction) {
    const [action, type, ...params] = interaction.customId.split('_');

    try {
      switch (action) {
        case 'meeting':
          await this.handleMeetingButton(interaction, type, params);
          break;
        case 'poll':
          await this.handlePollButton(interaction, type, params);
          break;
        case 'template':
          await this.handleTemplateButton(interaction, type, params);
          break;
        default:
          await interaction.reply({
            content: 'Unknown button action',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);

      const errorMessage = 'Sorry, something went wrong while processing your response.';

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  async handleMeetingButton(interaction, responseType, params) {
    const meetingId = parseInt(params[0]);

    if (!meetingId) {
      await interaction.reply({
        content: 'Invalid meeting ID',
        ephemeral: true
      });
      return;
    }

    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      await interaction.reply({
        content: 'Meeting not found',
        ephemeral: true
      });
      return;
    }

    const userId = interaction.user.id;

    await this.userRepo.create({
      id: userId,
      username: interaction.user.username,
      display_name: interaction.user.displayName || interaction.user.username
    });

    if (responseType === 'unavailable') {
      const modal = new ModalBuilder()
        .setCustomId(`meeting_response_${meetingId}_unavailable`)
        .setTitle('Meeting Response - Unavailable');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder('Why are you unavailable? (optional)');

      const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
      return;
    }

    await this.recordMeetingResponse(meetingId, userId, responseType);

    await interaction.reply({
      content: `✅ Your response (${responseType}) has been recorded!`,
      ephemeral: true
    });

    await this.updateMeetingEmbed(interaction, meeting);
  }

  async handlePollButton(interaction, action, params) {
    const pollId = parseInt(params[0]);
    const optionIndex = parseInt(params[1]);

    if (!pollId || isNaN(optionIndex)) {
      await interaction.reply({
        content: 'Invalid poll data',
        ephemeral: true
      });
      return;
    }

    try {
      await this.recordPollVote(pollId, interaction.user.id, optionIndex);

      await interaction.reply({
        content: '✅ Your vote has been recorded!',
        ephemeral: true
      });

      await this.updatePollEmbed(interaction, pollId);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        await interaction.reply({
          content: 'You have already voted in this poll!',
          ephemeral: true
        });
      } else {
        throw error;
      }
    }
  }

  async handleTemplateButton(interaction, templateType, params) {
    const modal = new ModalBuilder()
      .setCustomId(`template_${templateType}`)
      .setTitle(`Create ${templateType.replace('_', ' ')} Meeting`);

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Meeting Title')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('2024-12-25');

    const timeInput = new TextInputBuilder()
      .setCustomId('time')
      .setLabel('Time (HH:MM)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('14:30');

    const timezoneInput = new TextInputBuilder()
      .setCustomId('timezone')
      .setLabel('Timezone')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('UTC, Europe/Helsinki, America/New_York');

    const firstRow = new ActionRowBuilder().addComponents(titleInput);
    const secondRow = new ActionRowBuilder().addComponents(dateInput);
    const thirdRow = new ActionRowBuilder().addComponents(timeInput);
    const fourthRow = new ActionRowBuilder().addComponents(timezoneInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    await interaction.showModal(modal);
  }

  async handleModal(interaction) {
    const [action, ...params] = interaction.customId.split('_');

    try {
      switch (action) {
        case 'meeting':
          await this.handleMeetingResponseModal(interaction, params);
          break;
        case 'template':
          await this.handleTemplateModal(interaction, params);
          break;
        default:
          await interaction.reply({
            content: 'Unknown modal action',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error handling modal interaction:', error);

      const errorMessage = 'Sorry, something went wrong while processing your submission.';

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  async handleMeetingResponseModal(interaction, params) {
    const meetingId = parseInt(params[1]);
    const responseType = params[2];

    const reason = interaction.fields.getTextInputValue('reason');

    await this.recordMeetingResponse(meetingId, interaction.user.id, responseType, reason);

    await interaction.reply({
      content: `✅ Your response (${responseType}) has been recorded!`,
      ephemeral: true
    });

    const meeting = await this.meetingRepo.findById(meetingId);
    await this.updateMeetingEmbed(interaction, meeting);
  }

  async handleTemplateModal(interaction, params) {
    const templateType = params[0];

    const title = interaction.fields.getTextInputValue('title');
    const date = interaction.fields.getTextInputValue('date');
    const time = interaction.fields.getTextInputValue('time');
    const timezone = interaction.fields.getTextInputValue('timezone');

    const ProposeMeetingCommand = require('../commands/meeting/propose-meeting');
    const proposeMeetingCommand = new ProposeMeetingCommand();

    const fakeInteraction = {
      ...interaction,
      options: {
        getString: (key) => {
          switch (key) {
            case 'title': return title;
            case 'date': return date;
            case 'time': return time;
            case 'timezone': return timezone;
            case 'template': return templateType;
            default: return null;
          }
        },
        getInteger: () => null
      }
    };

    await proposeMeetingCommand.execute(fakeInteraction);
  }

  async recordMeetingResponse(meetingId, userId, response, reason = null) {
    const { database } = require('../database/database');

    const sql = `
      INSERT OR REPLACE INTO meeting_responses
      (meeting_id, user_id, response, reason, responded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await database.run(sql, [meetingId, userId, response, reason]);

    await this.userRepo.addPoints(userId, 5);
  }

  async recordPollVote(pollId, userId, optionIndex) {
    const { database } = require('../database/database');

    const sql = `
      INSERT INTO poll_votes (poll_id, user_id, option_index)
      VALUES (?, ?, ?)
    `;

    await database.run(sql, [pollId, userId, optionIndex]);

    await this.userRepo.addPoints(userId, 2);
  }

  async updateMeetingEmbed(interaction, meeting) {
    try {
      const responses = await this.meetingRepo.getResponseSummary(meeting.id);

      const embed = EmbedBuilderUtils.createMeetingEmbed(meeting, responses);
      const actionRow = EmbedBuilderUtils.createMeetingActionRow(meeting.id);

      // Try to edit the message, if it fails due to cache, fetch and edit
      try {
        await interaction.message.edit({
          embeds: [embed],
          components: [actionRow]
        });
      } catch (editError) {
        if (editError.code === 'ChannelNotCached') {
          // Fetch the message and try again
          const channel = await interaction.client.channels.fetch(interaction.channelId);
          const message = await channel.messages.fetch(interaction.message.id);
          await message.edit({
            embeds: [embed],
            components: [actionRow]
          });
        } else {
          throw editError;
        }
      }

      console.log(`Updated meeting embed for meeting ${meeting.id}`);
    } catch (error) {
      console.error('Failed to update meeting embed:', error);
    }
  }

  async updatePollEmbed(interaction, pollId) {
    try {
      const { database } = require('../database/database');

      const pollSql = 'SELECT * FROM quick_polls WHERE id = ?';
      const poll = await database.get(pollSql, [pollId]);

      if (!poll) return;

      const votesSql = 'SELECT * FROM poll_votes WHERE poll_id = ?';
      const votes = await database.all(votesSql, [pollId]);

      const embed = EmbedBuilderUtils.createPollEmbed(poll, votes);
      const options = JSON.parse(poll.options);
      const actionRow = EmbedBuilderUtils.createPollActionRow(pollId, options, poll.status !== 'active');

      // Try to edit the message, if it fails due to cache, fetch and edit
      try {
        await interaction.message.edit({
          embeds: [embed],
          components: [actionRow]
        });
      } catch (editError) {
        if (editError.code === 'ChannelNotCached') {
          // Fetch the message and try again
          const channel = await interaction.client.channels.fetch(interaction.channelId);
          const message = await channel.messages.fetch(interaction.message.id);
          await message.edit({
            embeds: [embed],
            components: [actionRow]
          });
        } else {
          throw editError;
        }
      }

      console.log(`Updated poll embed for poll ${pollId}`);
    } catch (error) {
      console.error('Failed to update poll embed:', error);
    }
  }
}

module.exports = new ButtonHandler();