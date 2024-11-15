const cron = require('node-cron');
const { Client } = require('discord.js');
const MeetingRepository = require('../database/models/meeting');
const UserRepository = require('../database/models/user');
const TimezoneUtils = require('../utils/timezone-utils');
const EmbedBuilderUtils = require('../utils/embed-builder');

class NotificationService {
  constructor(client) {
    this.client = client;
    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
    this.scheduledNotifications = new Map();

    this.initializeCronJobs();
  }

  initializeCronJobs() {
    cron.schedule('*/5 * * * *', () => {
      this.processScheduledNotifications();
    });

    cron.schedule('0 */6 * * *', () => {
      this.cleanupOldNotifications();
    });

    console.log('📅 Notification service cron jobs initialized');
  }

  async scheduleNotifications(meeting) {
    try {
      const responses = await this.meetingRepo.getResponseSummary(meeting.id);
      const participants = await this.meetingRepo.getParticipants(meeting.id);

      const interestedUsers = participants.filter(p =>
        p.response === 'available' || p.response === 'maybe'
      );

      if (interestedUsers.length === 0) {
        console.log(`No interested users for meeting ${meeting.id}, skipping notifications`);
        return;
      }

      for (const participant of interestedUsers) {
        await this.scheduleUserNotifications(meeting, participant);
      }

      console.log(`Notifications scheduled for meeting ${meeting.id}`);
    } catch (error) {
      console.error(`Failed to schedule notifications for meeting ${meeting.id}:`, error);
    }
  }

  async scheduleUserNotifications(meeting, participant) {
    const user = await this.userRepo.findById(participant.id);
    if (!user) return;

    const meetingTime = new Date(meeting.proposed_datetime);
    const userMeetingTime = TimezoneUtils.convertToUserTimezone(meetingTime, user.timezone);

    const reminderTimes = user.notification_preferences || ['24h', '1h', '15m'];

    for (const reminderTime of reminderTimes) {
      const notificationTime = this.calculateNotificationTime(userMeetingTime, reminderTime);

      if (notificationTime > new Date()) {
        await this.createNotificationRecord(meeting.id, user.id, notificationTime, reminderTime);
      }
    }
  }

  calculateNotificationTime(meetingTime, reminderTime) {
    const notificationTime = new Date(meetingTime);

    const timeUnit = reminderTime.slice(-1);
    const timeValue = parseInt(reminderTime.slice(0, -1));

    switch (timeUnit) {
      case 'h':
        notificationTime.setHours(notificationTime.getHours() - timeValue);
        break;
      case 'm':
        notificationTime.setMinutes(notificationTime.getMinutes() - timeValue);
        break;
      case 'd':
        notificationTime.setDate(notificationTime.getDate() - timeValue);
        break;
    }

    return notificationTime;
  }

  async createNotificationRecord(meetingId, userId, notificationTime, notificationType) {
    const { database } = require('../database/database');

    const sql = `
      INSERT INTO notifications (meeting_id, user_id, notification_time, notification_type)
      VALUES (?, ?, ?, ?)
    `;

    await database.run(sql, [
      meetingId,
      userId,
      notificationTime.toISOString(),
      notificationType
    ]);
  }

  async processScheduledNotifications() {
    try {
      const { database } = require('../database/database');

      const now = new Date();
      const sql = `
        SELECT n.*, m.*, u.username, u.display_name, u.timezone
        FROM notifications n
        JOIN meetings m ON n.meeting_id = m.id
        JOIN users u ON n.user_id = u.id
        WHERE n.status = 'pending'
        AND n.notification_time <= ?
        ORDER BY n.notification_time ASC
        LIMIT 50
      `;

      const pendingNotifications = await database.all(sql, [now.toISOString()]);

      for (const notification of pendingNotifications) {
        await this.sendNotification(notification);
      }

      if (pendingNotifications.length > 0) {
        console.log(`Processed ${pendingNotifications.length} notifications`);
      }
    } catch (error) {
      console.error('Failed to process scheduled notifications:', error);
    }
  }

  async sendNotification(notification) {
    try {
      const user = await this.client.users.fetch(notification.user_id);
      if (!user) {
        await this.markNotificationSent(notification.id, 'user_not_found');
        return;
      }

      const timeUntilMeeting = this.getTimeUntilMeeting(
        notification.proposed_datetime,
        notification.notification_type
      );

      const embed = EmbedBuilderUtils.createReminderEmbed(notification, timeUntilMeeting);

      await user.send({
        embeds: [embed]
      });

      await this.markNotificationSent(notification.id, 'sent');

      console.log(`Notification sent to ${notification.username} for meeting ${notification.meeting_id}`);
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error);
      await this.markNotificationSent(notification.id, 'failed');
    }
  }

  async markNotificationSent(notificationId, status) {
    const { database } = require('../database/database');

    const sql = `
      UPDATE notifications
      SET status = ?, sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await database.run(sql, [status, notificationId]);
  }

  getTimeUntilMeeting(meetingDateTime, notificationType) {
    const timeUnit = notificationType.slice(-1);
    const timeValue = parseInt(notificationType.slice(0, -1));

    switch (timeUnit) {
      case 'h':
        return timeValue === 1 ? 'in 1 hour' : `in ${timeValue} hours`;
      case 'm':
        return timeValue === 1 ? 'in 1 minute' : `in ${timeValue} minutes`;
      case 'd':
        return timeValue === 1 ? 'tomorrow' : `in ${timeValue} days`;
      default:
        return 'soon';
    }
  }

  async rescheduleNotifications(meetingId, newDateTime) {
    try {
      const { database } = require('../database/database');

      await database.run(
        'DELETE FROM notifications WHERE meeting_id = ? AND status = ?',
        [meetingId, 'pending']
      );

      const meeting = await this.meetingRepo.findById(meetingId);
      if (meeting) {
        meeting.proposed_datetime = newDateTime;
        await this.scheduleNotifications(meeting);
      }

      console.log(`Notifications rescheduled for meeting ${meetingId}`);
    } catch (error) {
      console.error(`Failed to reschedule notifications for meeting ${meetingId}:`, error);
    }
  }

  async cancelNotifications(meetingId) {
    try {
      const { database } = require('../database/database');

      await database.run(
        'UPDATE notifications SET status = ? WHERE meeting_id = ? AND status = ?',
        ['cancelled', meetingId, 'pending']
      );

      console.log(`Notifications cancelled for meeting ${meetingId}`);
    } catch (error) {
      console.error(`Failed to cancel notifications for meeting ${meetingId}:`, error);
    }
  }

  async sendImmediateNotification(userId, meetingId, message) {
    try {
      const user = await this.client.users.fetch(userId);
      const meeting = await this.meetingRepo.findById(meetingId);

      if (!user || !meeting) return;

      const embed = EmbedBuilderUtils.createMeetingEmbed(meeting);
      embed.setTitle('📢 Meeting Update');
      embed.setDescription(message);
      embed.setColor(0xFFA500);

      await user.send({
        embeds: [embed]
      });

      console.log(`Immediate notification sent to ${userId} for meeting ${meetingId}`);
    } catch (error) {
      console.error(`Failed to send immediate notification:`, error);
    }
  }

  async cleanupOldNotifications() {
    try {
      const { database } = require('../database/database');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const result = await database.run(
        'DELETE FROM notifications WHERE created_at < ? AND status != ?',
        [cutoffDate.toISOString(), 'pending']
      );

      if (result.changes > 0) {
        console.log(`Cleaned up ${result.changes} old notifications`);
      }
    } catch (error) {
      console.error('Failed to cleanup old notifications:', error);
    }
  }

  async getNotificationStats(userId) {
    try {
      const { database } = require('../database/database');

      const stats = await database.get(`
        SELECT
          COUNT(*) as total_notifications,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_notifications,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_notifications
        FROM notifications
        WHERE user_id = ?
        AND created_at >= datetime('now', '-30 days')
      `, [userId]);

      return stats || { total_notifications: 0, sent_notifications: 0, failed_notifications: 0 };
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return { total_notifications: 0, sent_notifications: 0, failed_notifications: 0 };
    }
  }

  async updateUserNotificationPreferences(userId, preferences) {
    try {
      await this.userRepo.update(userId, {
        notification_preferences: preferences
      });

      console.log(`Notification preferences updated for user ${userId}`);
    } catch (error) {
      console.error(`Failed to update notification preferences for user ${userId}:`, error);
    }
  }

  async sendBulkNotification(userIds, title, message) {
    const results = {
      sent: 0,
      failed: 0
    };

    for (const userId of userIds) {
      try {
        const user = await this.client.users.fetch(userId);

        const embed = EmbedBuilderUtils.createSuccessEmbed(title, message);

        await user.send({
          embeds: [embed.embeds[0]]
        });

        results.sent++;
      } catch (error) {
        console.error(`Failed to send bulk notification to ${userId}:`, error);
        results.failed++;
      }
    }

    console.log(`Bulk notification sent: ${results.sent} success, ${results.failed} failed`);
    return results;
  }
}

module.exports = NotificationService;