const { format, parseISO, isValid } = require('date-fns');
const { zonedTimeToUtc, utcToZonedTime, formatInTimeZone } = require('date-fns-tz');

const COMMON_TIMEZONES = {
  'UTC': 'UTC',
  'GMT': 'UTC',
  'EST': 'America/New_York',
  'EDT': 'America/New_York',
  'CST': 'America/Chicago',
  'CDT': 'America/Chicago',
  'MST': 'America/Denver',
  'MDT': 'America/Denver',
  'PST': 'America/Los_Angeles',
  'PDT': 'America/Los_Angeles',
  'CET': 'Europe/Paris',
  'CEST': 'Europe/Paris',
  'JST': 'Asia/Tokyo',
  'AEST': 'Australia/Sydney',
  'AEDT': 'Australia/Sydney'
};

const TIMEZONE_ALIASES = {
  'helsinki': 'Europe/Helsinki',
  'berlin': 'Europe/Berlin',
  'london': 'Europe/London',
  'paris': 'Europe/Paris',
  'tokyo': 'Asia/Tokyo',
  'sydney': 'Australia/Sydney',
  'new york': 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  'chicago': 'America/Chicago',
  'denver': 'America/Denver'
};

class TimezoneUtils {
  static normalizeTimezone(timezone) {
    if (!timezone) return 'UTC';

    const tz = timezone.toString().trim();

    if (COMMON_TIMEZONES[tz.toUpperCase()]) {
      return COMMON_TIMEZONES[tz.toUpperCase()];
    }

    if (TIMEZONE_ALIASES[tz.toLowerCase()]) {
      return TIMEZONE_ALIASES[tz.toLowerCase()];
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch (error) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
  }

  static validateTimezone(timezone) {
    try {
      TimezoneUtils.normalizeTimezone(timezone);
      return { isValid: true, normalized: TimezoneUtils.normalizeTimezone(timezone) };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }

  static convertToUserTimezone(utcTime, userTimezone) {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(userTimezone);

      let date;
      if (typeof utcTime === 'string') {
        date = parseISO(utcTime);
      } else if (utcTime instanceof Date) {
        date = utcTime;
      } else {
        throw new Error('Invalid date format');
      }

      if (!isValid(date)) {
        throw new Error('Invalid date');
      }

      return utcToZonedTime(date, normalizedTimezone);
    } catch (error) {
      throw new Error(`Timezone conversion failed: ${error.message}`);
    }
  }

  static convertToUtc(localTime, fromTimezone) {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(fromTimezone);

      let date;
      if (typeof localTime === 'string') {
        date = parseISO(localTime);
      } else if (localTime instanceof Date) {
        date = localTime;
      } else {
        throw new Error('Invalid date format');
      }

      if (!isValid(date)) {
        throw new Error('Invalid date');
      }

      return zonedTimeToUtc(date, normalizedTimezone);
    } catch (error) {
      throw new Error(`UTC conversion failed: ${error.message}`);
    }
  }

  static formatTimeForDisplay(time, timezone, formatString = 'PPP p') {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(timezone);

      let date;
      if (typeof time === 'string') {
        date = parseISO(time);
      } else if (time instanceof Date) {
        date = time;
      } else {
        throw new Error('Invalid date format');
      }

      if (!isValid(date)) {
        throw new Error('Invalid date');
      }

      return formatInTimeZone(date, normalizedTimezone, formatString);
    } catch (error) {
      throw new Error(`Time formatting failed: ${error.message}`);
    }
  }

  static formatTimeForMultipleTimezones(utcTime, timezones) {
    const results = {};

    timezones.forEach(tz => {
      try {
        const normalizedTz = TimezoneUtils.normalizeTimezone(tz);
        const localTime = TimezoneUtils.convertToUserTimezone(utcTime, normalizedTz);
        results[tz] = {
          timezone: normalizedTz,
          localTime: localTime,
          formatted: TimezoneUtils.formatTimeForDisplay(localTime, normalizedTz),
          shortFormat: TimezoneUtils.formatTimeForDisplay(localTime, normalizedTz, 'MMM d, HH:mm')
        };
      } catch (error) {
        results[tz] = {
          timezone: tz,
          error: error.message
        };
      }
    });

    return results;
  }

  static getTimezoneOffset(timezone) {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(timezone);
      const now = new Date();
      const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
      const targetTime = new Date(utc.toLocaleString('en-US', { timeZone: normalizedTimezone }));
      const offset = (targetTime.getTime() - utc.getTime()) / (1000 * 60 * 60);

      return {
        offset: offset,
        formatted: offset >= 0 ? `+${offset}` : `${offset}`,
        timezone: normalizedTimezone
      };
    } catch (error) {
      throw new Error(`Failed to get timezone offset: ${error.message}`);
    }
  }

  static parseUserDateTime(dateString, timeString, timezone) {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(timezone);

      const dateTimeString = `${dateString}T${timeString}`;
      const localDate = parseISO(dateTimeString);

      if (!isValid(localDate)) {
        throw new Error('Invalid date/time format');
      }

      const utcDate = TimezoneUtils.convertToUtc(localDate, normalizedTimezone);

      return {
        localTime: localDate,
        utcTime: utcDate,
        timezone: normalizedTimezone,
        formatted: TimezoneUtils.formatTimeForDisplay(localDate, normalizedTimezone)
      };
    } catch (error) {
      throw new Error(`Date parsing failed: ${error.message}`);
    }
  }

  static isWithinWorkingHours(dateTime, timezone, workingHours = { start: 9, end: 17 }) {
    try {
      const localTime = TimezoneUtils.convertToUserTimezone(dateTime, timezone);
      const hour = localTime.getHours();

      return hour >= workingHours.start && hour < workingHours.end;
    } catch (error) {
      return false;
    }
  }

  static suggestBetterTimes(meetingTime, userTimezones, workingHours = {}) {
    const suggestions = [];
    const baseTime = new Date(meetingTime);

    for (let hourOffset = -3; hourOffset <= 3; hourOffset++) {
      if (hourOffset === 0) continue;

      const suggestedTime = new Date(baseTime.getTime() + (hourOffset * 60 * 60 * 1000));
      let goodForAll = true;
      let workingHourMatches = 0;

      for (const [userId, timezone] of Object.entries(userTimezones)) {
        const userWorkingHours = workingHours[userId] || { start: 9, end: 17 };

        if (TimezoneUtils.isWithinWorkingHours(suggestedTime, timezone, userWorkingHours)) {
          workingHourMatches++;
        }
      }

      if (workingHourMatches > 0) {
        suggestions.push({
          time: suggestedTime,
          score: workingHourMatches / Object.keys(userTimezones).length,
          workingHourMatches,
          totalUsers: Object.keys(userTimezones).length
        });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  static getCommonTimezones() {
    return [
      { name: 'UTC', value: 'UTC', description: 'Coordinated Universal Time' },
      { name: 'New York (EST/EDT)', value: 'America/New_York', description: 'Eastern Time' },
      { name: 'Chicago (CST/CDT)', value: 'America/Chicago', description: 'Central Time' },
      { name: 'Denver (MST/MDT)', value: 'America/Denver', description: 'Mountain Time' },
      { name: 'Los Angeles (PST/PDT)', value: 'America/Los_Angeles', description: 'Pacific Time' },
      { name: 'London (GMT/BST)', value: 'Europe/London', description: 'Greenwich Mean Time' },
      { name: 'Paris (CET/CEST)', value: 'Europe/Paris', description: 'Central European Time' },
      { name: 'Berlin (CET/CEST)', value: 'Europe/Berlin', description: 'Central European Time' },
      { name: 'Helsinki (EET/EEST)', value: 'Europe/Helsinki', description: 'Eastern European Time' },
      { name: 'Tokyo (JST)', value: 'Asia/Tokyo', description: 'Japan Standard Time' },
      { name: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney', description: 'Australian Eastern Time' },
      { name: 'Mumbai (IST)', value: 'Asia/Kolkata', description: 'India Standard Time' }
    ];
  }

  static isDaylightSavingTime(timezone, date = new Date()) {
    try {
      const normalizedTimezone = TimezoneUtils.normalizeTimezone(timezone);
      const jan = new Date(date.getFullYear(), 0, 1);
      const jul = new Date(date.getFullYear(), 6, 1);

      const janOffset = TimezoneUtils.getTimezoneOffset(normalizedTimezone, jan).offset;
      const julOffset = TimezoneUtils.getTimezoneOffset(normalizedTimezone, jul).offset;
      const currentOffset = TimezoneUtils.getTimezoneOffset(normalizedTimezone, date).offset;

      return currentOffset !== Math.max(janOffset, julOffset);
    } catch (error) {
      return false;
    }
  }
}

module.exports = TimezoneUtils;