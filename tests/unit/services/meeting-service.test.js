const { describe, test, expect, beforeEach } = require('@jest/globals');
const MeetingService = require('../../../src/services/meeting-service');

describe('MeetingService', () => {
  let meetingService;
  let mockNotificationService;

  beforeEach(async () => {
    const { jest } = require('@jest/globals');

    mockNotificationService = {
      scheduleNotifications: jest.fn(),
      rescheduleNotifications: jest.fn(),
      cancelNotifications: jest.fn(),
      sendBulkNotification: jest.fn()
    };

    meetingService = new MeetingService(mockNotificationService);

    await global.createTestUser();
  });

  describe('proposeMeeting', () => {
    test('should create a meeting with valid data', async () => {
      const meetingData = {
        title: 'Test Meeting',
        description: 'A test meeting',
        proposer_id: '123456789',
        proposed_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'UTC',
        duration_minutes: 60
      };

      const meeting = await meetingService.proposeMeeting(meetingData);

      expect(meeting).toBeDefined();
      expect(meeting.title).toBe('Test Meeting');
      expect(meeting.proposer_id).toBe('123456789');
      expect(mockNotificationService.scheduleNotifications).toHaveBeenCalledWith(meeting);
    });

    test('should throw validation error for missing title', async () => {
      const meetingData = {
        proposer_id: '123456789',
        proposed_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'UTC'
      };

      await expect(meetingService.proposeMeeting(meetingData)).rejects.toThrow('Meeting title is required');
    });

    test('should throw validation error for past date', async () => {
      const meetingData = {
        title: 'Test Meeting',
        proposer_id: '123456789',
        proposed_datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'UTC'
      };

      await expect(meetingService.proposeMeeting(meetingData)).rejects.toThrow('Meeting time must be in the future');
    });
  });

  describe('updateMeeting', () => {
    test('should update meeting by proposer', async () => {
      const meeting = await global.createTestMeeting();

      const updateData = {
        title: 'Updated Meeting Title'
      };

      const updatedMeeting = await meetingService.updateMeeting(meeting.id, updateData, '123456789');

      expect(updatedMeeting.title).toBe('Updated Meeting Title');
    });

    test('should throw error if user is not proposer', async () => {
      const meeting = await global.createTestMeeting();

      const updateData = {
        title: 'Updated Meeting Title'
      };

      await expect(
        meetingService.updateMeeting(meeting.id, updateData, 'different-user')
      ).rejects.toThrow('Only the meeting proposer can update the meeting');
    });

    test('should reschedule notifications when datetime is updated', async () => {
      const meeting = await global.createTestMeeting();

      const updateData = {
        proposed_datetime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      };

      await meetingService.updateMeeting(meeting.id, updateData, '123456789');

      expect(mockNotificationService.rescheduleNotifications).toHaveBeenCalledWith(
        meeting.id,
        updateData.proposed_datetime
      );
    });
  });

  describe('confirmMeeting', () => {
    test('should confirm meeting with available participants', async () => {
      const meeting = await global.createTestMeeting();

      await meetingService.recordResponse(meeting.id, 'user1', 'available');
      await meetingService.recordResponse(meeting.id, 'user2', 'maybe');

      const confirmedMeeting = await meetingService.confirmMeeting(meeting.id, '123456789');

      expect(confirmedMeeting.status).toBe('confirmed');
      expect(mockNotificationService.sendBulkNotification).toHaveBeenCalled();
    });

    test('should throw error if no available participants', async () => {
      const meeting = await global.createTestMeeting();

      await meetingService.recordResponse(meeting.id, 'user1', 'unavailable');

      await expect(
        meetingService.confirmMeeting(meeting.id, '123456789')
      ).rejects.toThrow('Cannot confirm meeting with no available participants');
    });
  });

  describe('cancelMeeting', () => {
    test('should cancel meeting and notify participants', async () => {
      const meeting = await global.createTestMeeting();

      await meetingService.recordResponse(meeting.id, 'user1', 'available');

      const cancelledMeeting = await meetingService.cancelMeeting(meeting.id, '123456789', 'Changed plans');

      expect(cancelledMeeting.status).toBe('cancelled');
      expect(mockNotificationService.cancelNotifications).toHaveBeenCalledWith(meeting.id);
      expect(mockNotificationService.sendBulkNotification).toHaveBeenCalled();
    });
  });

  describe('recordResponse', () => {
    test('should record user response to meeting', async () => {
      const meeting = await global.createTestMeeting();

      const result = await meetingService.recordResponse(meeting.id, 'user1', 'available', 'Looking forward to it');

      expect(result).toBe(true);
    });

    test('should throw error for cancelled meeting', async () => {
      const meeting = await global.createTestMeeting({
        status: 'cancelled'
      });

      await expect(
        meetingService.recordResponse(meeting.id, 'user1', 'available')
      ).rejects.toThrow('Cannot respond to a cancelled meeting');
    });
  });

  describe('suggestAlternativeTimes', () => {
    test('should suggest alternative times for unavailable users', async () => {
      const meeting = await global.createTestMeeting();

      await global.createTestUser({
        id: 'user1',
        username: 'user1',
        timezone: 'UTC'
      });

      await meetingService.recordResponse(meeting.id, 'user1', 'unavailable');

      const suggestions = await meetingService.suggestAlternativeTimes(meeting.id);

      expect(Array.isArray(suggestions)).toBe(true);
    });

    test('should return empty array if no unavailable users', async () => {
      const meeting = await global.createTestMeeting();

      await meetingService.recordResponse(meeting.id, 'user1', 'available');

      const suggestions = await meetingService.suggestAlternativeTimes(meeting.id);

      expect(suggestions).toEqual([]);
    });
  });

  describe('validateMeetingProposal', () => {
    test('should validate correct meeting data', async () => {
      const meetingData = {
        title: 'Valid Meeting',
        proposed_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'UTC',
        duration_minutes: 60
      };

      const validation = await meetingService.validateMeetingProposal(meetingData);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should validate incorrect meeting data', async () => {
      const meetingData = {
        proposed_datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 1000
      };

      const validation = await meetingService.validateMeetingProposal(meetingData);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getMeetingInsights', () => {
    test('should provide meeting insights', async () => {
      const meeting = await global.createTestMeeting();

      await meetingService.recordResponse(meeting.id, 'user1', 'available');
      await meetingService.recordResponse(meeting.id, 'user2', 'maybe');
      await meetingService.recordResponse(meeting.id, 'user3', 'unavailable');

      const insights = await meetingService.getMeetingInsights(meeting.id);

      expect(insights).toHaveProperty('meeting');
      expect(insights).toHaveProperty('responses');
      expect(insights).toHaveProperty('participants');
      expect(insights).toHaveProperty('responseRate');
      expect(insights).toHaveProperty('insights');
      expect(Array.isArray(insights.insights)).toBe(true);
    });

    test('should throw error for non-existent meeting', async () => {
      await expect(
        meetingService.getMeetingInsights(99999)
      ).rejects.toThrow('Meeting not found');
    });
  });
});