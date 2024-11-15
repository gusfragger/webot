const MeetingRepository = require('../database/models/meeting');
const UserRepository = require('../database/models/user');
const AvailabilityRepository = require('../database/models/availability');
const TimezoneUtils = require('../utils/timezone-utils');
const { ValidationError } = require('../utils/validation');

class MeetingService {
  constructor(notificationService = null) {
    this.meetingRepo = new MeetingRepository();
    this.userRepo = new UserRepository();
    this.availabilityRepo = new AvailabilityRepository();
    this.notificationService = notificationService;
  }

  async proposeMeeting(meetingData) {
    const validation = await this.validateMeetingProposal(meetingData);
    if (!validation.isValid) {
      throw new ValidationError(validation.errors.join('\n'));
    }

    const meeting = await this.meetingRepo.create(meetingData);

    if (this.notificationService) {
      await this.notificationService.scheduleNotifications(meeting);
    }

    await this.userRepo.addPoints(meetingData.proposer_id, 10);

    return meeting;
  }

  async updateMeeting(meetingId, updateData, userId) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.proposer_id !== userId) {
      throw new Error('Only the meeting proposer can update the meeting');
    }

    if (updateData.proposed_datetime && this.notificationService) {
      await this.notificationService.rescheduleNotifications(meetingId, updateData.proposed_datetime);
    }

    const updatedMeeting = await this.meetingRepo.update(meetingId, updateData);

    return updatedMeeting;
  }

  async confirmMeeting(meetingId, userId) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.proposer_id !== userId) {
      throw new Error('Only the meeting proposer can confirm the meeting');
    }

    const responses = await this.meetingRepo.getResponseSummary(meetingId);

    if (responses.available.count === 0) {
      throw new Error('Cannot confirm meeting with no available participants');
    }

    const confirmedMeeting = await this.meetingRepo.updateStatus(meetingId, 'confirmed');

    if (this.notificationService) {
      const participants = await this.meetingRepo.getParticipants(meetingId);
      const availableUsers = participants
        .filter(p => p.response === 'available')
        .map(p => p.id);

      await this.notificationService.sendBulkNotification(
        availableUsers,
        '✅ Meeting Confirmed',
        `The meeting "${meeting.title}" has been confirmed. See you there!`
      );
    }

    await this.userRepo.addPoints(userId, 15);

    return confirmedMeeting;
  }

  async cancelMeeting(meetingId, userId, reason = null) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.proposer_id !== userId) {
      throw new Error('Only the meeting proposer can cancel the meeting');
    }

    const cancelledMeeting = await this.meetingRepo.updateStatus(meetingId, 'cancelled');

    if (this.notificationService) {
      await this.notificationService.cancelNotifications(meetingId);

      const participants = await this.meetingRepo.getParticipants(meetingId);
      const participantIds = participants.map(p => p.id);

      const message = reason
        ? `The meeting "${meeting.title}" has been cancelled. Reason: ${reason}`
        : `The meeting "${meeting.title}" has been cancelled.`;

      await this.notificationService.sendBulkNotification(
        participantIds,
        '❌ Meeting Cancelled',
        message
      );
    }

    return cancelledMeeting;
  }

  async recordResponse(meetingId, userId, response, reason = null) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.status === 'cancelled') {
      throw new Error('Cannot respond to a cancelled meeting');
    }

    const { database } = require('../database/database');

    const sql = `
      INSERT OR REPLACE INTO meeting_responses
      (meeting_id, user_id, response, reason, responded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await database.run(sql, [meetingId, userId, response, reason]);

    await this.userRepo.addPoints(userId, 5);

    const responseTime = await this.calculateResponseTime(meetingId, userId);
    if (responseTime && responseTime < 60) {
      await this.userRepo.addAchievement(userId, 'early_bird');
    }

    return true;
  }

  async calculateResponseTime(meetingId, userId) {
    const { database } = require('../database/database');

    const result = await database.get(`
      SELECT
        (julianday(mr.responded_at) - julianday(m.created_at)) * 24 * 60 as response_time_minutes
      FROM meeting_responses mr
      JOIN meetings m ON mr.meeting_id = m.id
      WHERE mr.meeting_id = ? AND mr.user_id = ?
      ORDER BY mr.responded_at DESC
      LIMIT 1
    `, [meetingId, userId]);

    return result?.response_time_minutes || null;
  }

  async suggestAlternativeTimes(meetingId) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const participants = await this.meetingRepo.getParticipants(meetingId);
    const unavailableUsers = participants
      .filter(p => p.response === 'unavailable')
      .map(p => p.id);

    if (unavailableUsers.length === 0) {
      return [];
    }

    const userTimezones = {};
    const workingHours = {};

    for (const userId of unavailableUsers) {
      const user = await this.userRepo.findById(userId);
      if (user) {
        userTimezones[userId] = user.timezone;
        workingHours[userId] = {
          start: user.working_hours_start,
          end: user.working_hours_end
        };
      }
    }

    const originalTime = new Date(meeting.proposed_datetime);
    const suggestions = TimezoneUtils.suggestBetterTimes(
      originalTime,
      userTimezones,
      workingHours
    );

    return suggestions.map(suggestion => ({
      time: suggestion.time,
      score: suggestion.score,
      workingHourMatches: suggestion.workingHourMatches,
      totalUsers: suggestion.totalUsers,
      improvement: suggestion.workingHourMatches > 0 ? 'Better for unavailable users' : 'No improvement'
    }));
  }

  async findOptimalMeetingTime(userIds, duration = 60, preferences = {}) {
    const startDate = preferences.startDate || new Date();
    const endDate = preferences.endDate || new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

    const availabilityData = await this.availabilityRepo.findOptimalMeetingTimes(
      userIds,
      duration,
      startDate,
      endDate,
      preferences.workingHoursOnly !== false
    );

    const suggestions = [];
    const current = new Date(startDate);

    while (current < endDate) {
      if (current.getDay() >= 1 && current.getDay() <= 5) {
        for (let hour = 9; hour <= 17; hour++) {
          const meetingTime = new Date(current);
          meetingTime.setHours(hour, 0, 0, 0);

          const endTime = new Date(meetingTime.getTime() + (duration * 60 * 1000));

          let availableUsers = 0;

          for (const userId of userIds) {
            const userBusyPeriods = availabilityData.busyPeriods[userId] || [];
            const userTimezone = availabilityData.userTimezones[userId] || 'UTC';
            const userWorkingHours = availabilityData.workingHours[userId] || { start: 9, end: 17 };

            const isInWorkingHours = TimezoneUtils.isWithinWorkingHours(
              meetingTime,
              userTimezone,
              userWorkingHours
            );

            const hasConflict = userBusyPeriods.some(period =>
              meetingTime < period.end && endTime > period.start
            );

            if (isInWorkingHours && !hasConflict) {
              availableUsers++;
            }
          }

          if (availableUsers > 0) {
            suggestions.push({
              time: meetingTime,
              availableUsers,
              totalUsers: userIds.length,
              score: availableUsers / userIds.length
            });
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return suggestions
      .sort((a, b) => b.score - a.score || b.availableUsers - a.availableUsers)
      .slice(0, 10);
  }

  async getConflictingMeetings(userId, startTime, endTime) {
    const { database } = require('../database/database');

    const sql = `
      SELECT m.*, mr.response
      FROM meetings m
      JOIN meeting_responses mr ON m.id = mr.meeting_id
      WHERE mr.user_id = ?
      AND mr.response IN ('available', 'maybe')
      AND m.status != 'cancelled'
      AND (
        (m.proposed_datetime <= ? AND datetime(m.proposed_datetime, '+' || m.duration_minutes || ' minutes') > ?)
        OR (m.proposed_datetime < ? AND datetime(m.proposed_datetime, '+' || m.duration_minutes || ' minutes') >= ?)
        OR (m.proposed_datetime >= ? AND m.proposed_datetime < ?)
      )
    `;

    return await database.all(sql, [
      userId,
      startTime,
      startTime,
      endTime,
      endTime,
      startTime,
      endTime
    ]);
  }

  async validateMeetingProposal(meetingData) {
    const errors = [];

    if (!meetingData.title || meetingData.title.trim().length === 0) {
      errors.push('Meeting title is required');
    }

    if (!meetingData.proposed_datetime) {
      errors.push('Meeting date and time is required');
    } else {
      const meetingTime = new Date(meetingData.proposed_datetime);
      if (meetingTime <= new Date()) {
        errors.push('Meeting time must be in the future');
      }
    }

    if (!meetingData.timezone) {
      errors.push('Timezone is required');
    }

    if (meetingData.duration_minutes && (meetingData.duration_minutes < 15 || meetingData.duration_minutes > 480)) {
      errors.push('Meeting duration must be between 15 and 480 minutes');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getMeetingInsights(meetingId) {
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const responses = await this.meetingRepo.getResponseSummary(meetingId);
    const participants = await this.meetingRepo.getParticipants(meetingId);

    const totalResponses = responses.available.count + responses.maybe.count + responses.unavailable.count;
    const responseRate = totalResponses > 0 ? Math.round((totalResponses / participants.length) * 100) : 0;

    const averageResponseTime = await this.calculateAverageResponseTime(meetingId);

    const timezoneDistribution = participants.reduce((acc, participant) => {
      acc[participant.timezone] = (acc[participant.timezone] || 0) + 1;
      return acc;
    }, {});

    const optimalTimeScore = await this.calculateOptimalTimeScore(meeting, participants);

    return {
      meeting,
      responses,
      participants,
      responseRate,
      averageResponseTime,
      timezoneDistribution,
      optimalTimeScore,
      insights: this.generateInsights(responses, participants, optimalTimeScore)
    };
  }

  async calculateAverageResponseTime(meetingId) {
    const { database } = require('../database/database');

    const result = await database.get(`
      SELECT
        AVG((julianday(mr.responded_at) - julianday(m.created_at)) * 24 * 60) as avg_response_time
      FROM meeting_responses mr
      JOIN meetings m ON mr.meeting_id = m.id
      WHERE mr.meeting_id = ?
      AND mr.responded_at IS NOT NULL
    `, [meetingId]);

    return result?.avg_response_time || 0;
  }

  async calculateOptimalTimeScore(meeting, participants) {
    let score = 0;
    const totalParticipants = participants.length;

    if (totalParticipants === 0) return 0;

    for (const participant of participants) {
      const user = await this.userRepo.findById(participant.id);
      if (!user) continue;

      const isInWorkingHours = TimezoneUtils.isWithinWorkingHours(
        meeting.proposed_datetime,
        user.timezone,
        { start: user.working_hours_start, end: user.working_hours_end }
      );

      if (isInWorkingHours) {
        score += 1;
      }
    }

    return Math.round((score / totalParticipants) * 100);
  }

  generateInsights(responses, participants, optimalTimeScore) {
    const insights = [];

    const totalResponses = responses.available.count + responses.maybe.count + responses.unavailable.count;
    const responseRate = totalResponses > 0 ? Math.round((totalResponses / participants.length) * 100) : 0;

    if (responseRate < 50) {
      insights.push('⚠️ Low response rate - consider sending reminders');
    }

    if (responses.unavailable.count > responses.available.count) {
      insights.push('📅 More people are unavailable than available - consider rescheduling');
    }

    if (optimalTimeScore < 50) {
      insights.push('🕐 The meeting time is outside working hours for many participants');
    }

    if (responses.available.count >= 3) {
      insights.push('✅ Good attendance expected - meeting can proceed');
    }

    if (insights.length === 0) {
      insights.push('👍 Meeting looks good to go!');
    }

    return insights;
  }
}

module.exports = MeetingService;