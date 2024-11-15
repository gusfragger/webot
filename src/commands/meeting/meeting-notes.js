const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../base-command');
const MeetingRepository = require('../../database/models/meeting');
const EmbedBuilderUtils = require('../../utils/embed-builder');

class MeetingNotesCommand extends BaseCommand {
  constructor() {
    super();

    this.data = new SlashCommandBuilder()
      .setName('meeting-notes')
      .setDescription('Create a thread for collaborative meeting notes')
      .addIntegerOption(option =>
        option
          .setName('meeting-id')
          .setDescription('Meeting ID to create notes for')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('agenda')
          .setDescription('Meeting agenda or initial notes')
          .setMaxLength(1000)
      );

    this.permissions = [PermissionFlagsBits.CreatePublicThreads];
    this.meetingRepo = new MeetingRepository();
  }

  async execute(interaction) {
    try {
      await this.deferReply(interaction);

      if (!this.checkPermissions(interaction)) {
        await this.handleError(interaction, new Error('You need permission to create threads to use this command.'));
        return;
      }

      const meetingId = interaction.options.getInteger('meeting-id');
      const agenda = interaction.options.getString('agenda');

      const meeting = await this.meetingRepo.findById(meetingId);

      if (!meeting) {
        await this.handleError(interaction, new Error('Meeting not found.'));
        return;
      }

      if (meeting.proposer_id !== interaction.user.id) {
        const member = interaction.member;
        if (!member || !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          await this.handleError(interaction, new Error('Only the meeting proposer or moderators can create meeting notes.'));
          return;
        }
      }

      const notesEmbed = this.createMeetingNotesEmbed(meeting, agenda);

      const message = await interaction.editReply({
        embeds: [notesEmbed],
        fetchReply: true
      });

      const threadName = `📝 ${meeting.title} - Meeting Notes`;

      const thread = await message.startThread({
        name: threadName.substring(0, 100),
        reason: `Meeting notes for "${meeting.title}"`
      });

      const initialMessage = this.createInitialNotesMessage(meeting, agenda);

      await thread.send(initialMessage);

      await this.updateMeetingWithNotesThread(meetingId, thread.id);

      await interaction.followUp({
        content: `✅ Meeting notes thread created: ${thread}`,
        ephemeral: true
      });

      console.log(`Meeting notes thread created for meeting ${meetingId} by ${interaction.user.username}`);
    } catch (error) {
      await this.handleError(interaction, error);
    }
  }

  createMeetingNotesEmbed(meeting, agenda) {
    const embed = EmbedBuilderUtils.createMeetingEmbed(meeting);

    embed.setTitle(`📝 Meeting Notes: ${meeting.title}`);
    embed.setColor(0x9932CC);

    if (agenda) {
      embed.addFields({
        name: '📋 Agenda',
        value: agenda,
        inline: false
      });
    }

    embed.addFields({
      name: '💡 How to use',
      value: [
        '• Use the thread below for collaborative notes',
        '• Add action items with `**Action:** Description`',
        '• Use `**Decision:** What was decided`',
        '• Tag participants with @mentions for assignments'
      ].join('\n'),
      inline: false
    });

    return embed;
  }

  createInitialNotesMessage(meeting, agenda) {
    let message = `# 📝 Meeting Notes\n\n`;
    message += `**Meeting:** ${meeting.title}\n`;
    message += `**Date:** ${this.formatTimestamp(new Date(meeting.proposed_datetime))}\n`;
    message += `**Duration:** ${meeting.duration_minutes} minutes\n`;
    message += `**Proposer:** <@${meeting.proposer_id}>\n\n`;

    if (agenda) {
      message += `## 📋 Agenda\n${agenda}\n\n`;
    }

    message += `## 👥 Attendees\n`;
    message += `_Add attendees here as they join_\n\n`;

    message += `## 📝 Notes\n`;
    message += `_Use this space for meeting notes_\n\n`;

    message += `## ✅ Action Items\n`;
    message += `_Format: **Action:** Description - Assigned to @user - Due: YYYY-MM-DD_\n\n`;

    message += `## 🎯 Decisions Made\n`;
    message += `_Format: **Decision:** What was decided and why_\n\n`;

    message += `## 🔄 Next Steps\n`;
    message += `_What happens after this meeting_\n\n`;

    message += `---\n`;
    message += `💡 **Tip:** Pin important messages in this thread for easy reference!`;

    return message;
  }

  async updateMeetingWithNotesThread(meetingId, threadId) {
    try {
      await this.meetingRepo.update(meetingId, {
        description: `${await this.getMeetingDescription(meetingId)} | Notes Thread: <#${threadId}>`
      });
    } catch (error) {
      console.error('Failed to update meeting with notes thread:', error);
    }
  }

  async getMeetingDescription(meetingId) {
    const meeting = await this.meetingRepo.findById(meetingId);
    return meeting?.description || '';
  }

  async validate(interaction) {
    if (!interaction.guild) {
      await this.handleError(interaction, new Error('This command can only be used in a server.'));
      return false;
    }

    if (interaction.channel.type === ChannelType.DM) {
      await this.handleError(interaction, new Error('This command cannot be used in DMs.'));
      return false;
    }

    return true;
  }
}

module.exports = new MeetingNotesCommand();