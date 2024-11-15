const { describe, test, expect } = require('@jest/globals');
const TimezoneUtils = require('../../../src/utils/timezone-utils');

describe('TimezoneUtils', () => {
  describe('normalizeTimezone', () => {
    test('should normalize common timezone abbreviations', () => {
      expect(TimezoneUtils.normalizeTimezone('EST')).toBe('America/New_York');
      expect(TimezoneUtils.normalizeTimezone('CET')).toBe('Europe/Paris');
      expect(TimezoneUtils.normalizeTimezone('JST')).toBe('Asia/Tokyo');
    });

    test('should handle timezone aliases', () => {
      expect(TimezoneUtils.normalizeTimezone('helsinki')).toBe('Europe/Helsinki');
      expect(TimezoneUtils.normalizeTimezone('tokyo')).toBe('Asia/Tokyo');
      expect(TimezoneUtils.normalizeTimezone('new york')).toBe('America/New_York');
    });

    test('should return valid IANA timezones as-is', () => {
      expect(TimezoneUtils.normalizeTimezone('Europe/Helsinki')).toBe('Europe/Helsinki');
      expect(TimezoneUtils.normalizeTimezone('America/New_York')).toBe('America/New_York');
    });

    test('should default to UTC for null/undefined', () => {
      expect(TimezoneUtils.normalizeTimezone(null)).toBe('UTC');
      expect(TimezoneUtils.normalizeTimezone(undefined)).toBe('UTC');
      expect(TimezoneUtils.normalizeTimezone('')).toBe('UTC');
    });

    test('should throw error for invalid timezones', () => {
      expect(() => TimezoneUtils.normalizeTimezone('Invalid/Timezone')).toThrow('Invalid timezone');
    });
  });

  describe('validateTimezone', () => {
    test('should validate correct timezones', () => {
      const result = TimezoneUtils.validateTimezone('Europe/Helsinki');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('Europe/Helsinki');
    });

    test('should invalidate incorrect timezones', () => {
      const result = TimezoneUtils.validateTimezone('Invalid/Timezone');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid timezone');
    });
  });

  describe('convertToUserTimezone', () => {
    test('should convert UTC time to user timezone', () => {
      const utcTime = new Date('2024-01-01T12:00:00Z');
      const helsinkiTime = TimezoneUtils.convertToUserTimezone(utcTime, 'Europe/Helsinki');

      expect(helsinkiTime.getHours()).toBe(14);
    });

    test('should handle string input', () => {
      const utcTimeString = '2024-01-01T12:00:00Z';
      const tokyoTime = TimezoneUtils.convertToUserTimezone(utcTimeString, 'Asia/Tokyo');

      expect(tokyoTime.getHours()).toBe(21);
    });

    test('should throw error for invalid date', () => {
      expect(() => {
        TimezoneUtils.convertToUserTimezone('invalid-date', 'UTC');
      }).toThrow('Timezone conversion failed');
    });
  });

  describe('convertToUtc', () => {
    test('should convert local time to UTC', () => {
      const localTime = new Date('2024-01-01T14:00:00');
      const utcTime = TimezoneUtils.convertToUtc(localTime, 'Europe/Helsinki');

      expect(utcTime.getHours()).toBe(12);
    });

    test('should throw error for invalid timezone', () => {
      expect(() => {
        TimezoneUtils.convertToUtc(new Date(), 'Invalid/Timezone');
      }).toThrow('UTC conversion failed');
    });
  });

  describe('formatTimeForDisplay', () => {
    test('should format time for display', () => {
      const time = new Date('2024-01-01T12:00:00Z');
      const formatted = TimezoneUtils.formatTimeForDisplay(time, 'Europe/Helsinki', 'PPP p');

      expect(formatted).toContain('Jan');
      expect(formatted).toContain('2024');
    });

    test('should use default format', () => {
      const time = new Date('2024-01-01T12:00:00Z');
      const formatted = TimezoneUtils.formatTimeForDisplay(time, 'UTC');

      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatTimeForMultipleTimezones', () => {
    test('should format time for multiple timezones', () => {
      const utcTime = new Date('2024-01-01T12:00:00Z');
      const timezones = ['UTC', 'Europe/Helsinki', 'Asia/Tokyo'];

      const results = TimezoneUtils.formatTimeForMultipleTimezones(utcTime, timezones);

      expect(Object.keys(results)).toHaveLength(3);
      expect(results['UTC'].timezone).toBe('UTC');
      expect(results['Europe/Helsinki'].timezone).toBe('Europe/Helsinki');
      expect(results['Asia/Tokyo'].timezone).toBe('Asia/Tokyo');
    });

    test('should handle invalid timezones in list', () => {
      const utcTime = new Date('2024-01-01T12:00:00Z');
      const timezones = ['UTC', 'Invalid/Timezone'];

      const results = TimezoneUtils.formatTimeForMultipleTimezones(utcTime, timezones);

      expect(results['UTC'].timezone).toBe('UTC');
      expect(results['Invalid/Timezone'].error).toBeDefined();
    });
  });

  describe('parseUserDateTime', () => {
    test('should parse user date and time', () => {
      const result = TimezoneUtils.parseUserDateTime('2024-01-01', '14:30', 'Europe/Helsinki');

      expect(result.localTime).toBeInstanceOf(Date);
      expect(result.utcTime).toBeInstanceOf(Date);
      expect(result.timezone).toBe('Europe/Helsinki');
      expect(result.formatted).toBeDefined();
    });

    test('should throw error for invalid date format', () => {
      expect(() => {
        TimezoneUtils.parseUserDateTime('invalid-date', '14:30', 'UTC');
      }).toThrow('Date parsing failed');
    });
  });

  describe('isWithinWorkingHours', () => {
    test('should check if time is within working hours', () => {
      const workingTime = new Date('2024-01-01T14:00:00Z');
      const nonWorkingTime = new Date('2024-01-01T02:00:00Z');

      expect(TimezoneUtils.isWithinWorkingHours(workingTime, 'UTC')).toBe(true);
      expect(TimezoneUtils.isWithinWorkingHours(nonWorkingTime, 'UTC')).toBe(false);
    });

    test('should use custom working hours', () => {
      const time = new Date('2024-01-01T20:00:00Z');
      const workingHours = { start: 18, end: 22 };

      expect(TimezoneUtils.isWithinWorkingHours(time, 'UTC', workingHours)).toBe(true);
    });
  });

  describe('getCommonTimezones', () => {
    test('should return array of common timezones', () => {
      const timezones = TimezoneUtils.getCommonTimezones();

      expect(Array.isArray(timezones)).toBe(true);
      expect(timezones.length).toBeGreaterThan(0);
      expect(timezones[0]).toHaveProperty('name');
      expect(timezones[0]).toHaveProperty('value');
      expect(timezones[0]).toHaveProperty('description');
    });
  });

  describe('suggestBetterTimes', () => {
    test('should suggest better meeting times', () => {
      const meetingTime = new Date('2024-01-01T02:00:00Z');
      const userTimezones = {
        'user1': 'UTC',
        'user2': 'Europe/Helsinki'
      };

      const suggestions = TimezoneUtils.suggestBetterTimes(meetingTime, userTimezones);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeLessThanOrEqual(3);

      if (suggestions.length > 0) {
        expect(suggestions[0]).toHaveProperty('time');
        expect(suggestions[0]).toHaveProperty('score');
        expect(suggestions[0]).toHaveProperty('workingHourMatches');
      }
    });
  });
});