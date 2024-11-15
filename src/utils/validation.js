const { parseISO, isValid, isFuture, isAfter, isBefore } = require('date-fns');
const sanitizeHtml = require('sanitize-html');
const TimezoneUtils = require('./timezone-utils');

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.isOperational = true;
  }
}

class ValidationUtils {
  static validateMeetingInput(input) {
    const errors = [];
    const sanitizedInput = { ...input };

    if (!input.title || typeof input.title !== 'string') {
      errors.push({ field: 'title', message: 'Title is required and must be a string' });
    } else if (input.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title cannot be empty' });
    } else if (input.title.length > 100) {
      errors.push({ field: 'title', message: 'Title must be 100 characters or less' });
    } else {
      sanitizedInput.title = sanitizeHtml(input.title.trim(), { allowedTags: [] });
    }

    if (input.description && typeof input.description === 'string') {
      if (input.description.length > 500) {
        errors.push({ field: 'description', message: 'Description must be 500 characters or less' });
      } else {
        sanitizedInput.description = sanitizeHtml(input.description.trim(), { allowedTags: [] });
      }
    }

    if (!input.date || typeof input.date !== 'string') {
      errors.push({ field: 'date', message: 'Date is required in YYYY-MM-DD format' });
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(input.date)) {
        errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
      } else {
        const date = parseISO(input.date);
        if (!isValid(date)) {
          errors.push({ field: 'date', message: 'Invalid date' });
        }
      }
    }

    if (!input.time || typeof input.time !== 'string') {
      errors.push({ field: 'time', message: 'Time is required in HH:MM format' });
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(input.time)) {
        errors.push({ field: 'time', message: 'Time must be in HH:MM format (24-hour)' });
      }
    }

    if (!input.timezone || typeof input.timezone !== 'string') {
      errors.push({ field: 'timezone', message: 'Timezone is required' });
    } else {
      const timezoneValidation = TimezoneUtils.validateTimezone(input.timezone);
      if (!timezoneValidation.isValid) {
        errors.push({ field: 'timezone', message: timezoneValidation.error });
      } else {
        sanitizedInput.timezone = timezoneValidation.normalized;
      }
    }

    if (input.duration && typeof input.duration === 'number') {
      if (input.duration < 15 || input.duration > 480) {
        errors.push({ field: 'duration', message: 'Duration must be between 15 and 480 minutes' });
      }
    } else if (input.duration && typeof input.duration !== 'number') {
      errors.push({ field: 'duration', message: 'Duration must be a number' });
    }

    if (input.max_participants && typeof input.max_participants === 'number') {
      if (input.max_participants < 2 || input.max_participants > 50) {
        errors.push({ field: 'max_participants', message: 'Max participants must be between 2 and 50' });
      }
    }

    if (errors.length === 0 && input.date && input.time && input.timezone) {
      try {
        const dateTimeResult = TimezoneUtils.parseUserDateTime(
          input.date,
          input.time,
          sanitizedInput.timezone
        );

        if (!isFuture(dateTimeResult.utcTime)) {
          errors.push({ field: 'datetime', message: 'Meeting time must be in the future' });
        }

        const maxFutureDate = new Date();
        maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);

        if (isAfter(dateTimeResult.utcTime, maxFutureDate)) {
          errors.push({ field: 'datetime', message: 'Meeting time cannot be more than 1 year in the future' });
        }

        sanitizedInput.parsed_datetime = dateTimeResult;
      } catch (error) {
        errors.push({ field: 'datetime', message: error.message });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput
    };
  }

  static validateAvailabilityInput(input) {
    const errors = [];
    const sanitizedInput = { ...input };

    if (!input.start_date || typeof input.start_date !== 'string') {
      errors.push({ field: 'start_date', message: 'Start date is required in YYYY-MM-DD format' });
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(input.start_date)) {
        errors.push({ field: 'start_date', message: 'Start date must be in YYYY-MM-DD format' });
      }
    }

    if (!input.start_time || typeof input.start_time !== 'string') {
      errors.push({ field: 'start_time', message: 'Start time is required in HH:MM format' });
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(input.start_time)) {
        errors.push({ field: 'start_time', message: 'Start time must be in HH:MM format' });
      }
    }

    if (!input.end_date || typeof input.end_date !== 'string') {
      errors.push({ field: 'end_date', message: 'End date is required in YYYY-MM-DD format' });
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(input.end_date)) {
        errors.push({ field: 'end_date', message: 'End date must be in YYYY-MM-DD format' });
      }
    }

    if (!input.end_time || typeof input.end_time !== 'string') {
      errors.push({ field: 'end_time', message: 'End time is required in HH:MM format' });
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(input.end_time)) {
        errors.push({ field: 'end_time', message: 'End time must be in HH:MM format' });
      }
    }

    if (!input.timezone || typeof input.timezone !== 'string') {
      errors.push({ field: 'timezone', message: 'Timezone is required' });
    } else {
      const timezoneValidation = TimezoneUtils.validateTimezone(input.timezone);
      if (!timezoneValidation.isValid) {
        errors.push({ field: 'timezone', message: timezoneValidation.error });
      } else {
        sanitizedInput.timezone = timezoneValidation.normalized;
      }
    }

    if (input.reason && typeof input.reason === 'string') {
      if (input.reason.length > 200) {
        errors.push({ field: 'reason', message: 'Reason must be 200 characters or less' });
      } else {
        sanitizedInput.reason = sanitizeHtml(input.reason.trim(), { allowedTags: [] });
      }
    }

    if (errors.length === 0) {
      try {
        const startDateTime = TimezoneUtils.parseUserDateTime(
          input.start_date,
          input.start_time,
          sanitizedInput.timezone
        );

        const endDateTime = TimezoneUtils.parseUserDateTime(
          input.end_date,
          input.end_time,
          sanitizedInput.timezone
        );

        if (!isBefore(startDateTime.utcTime, endDateTime.utcTime)) {
          errors.push({ field: 'datetime', message: 'End time must be after start time' });
        }

        const duration = endDateTime.utcTime.getTime() - startDateTime.utcTime.getTime();
        const maxDuration = 7 * 24 * 60 * 60 * 1000;

        if (duration > maxDuration) {
          errors.push({ field: 'datetime', message: 'Availability period cannot be longer than 7 days' });
        }

        sanitizedInput.parsed_start = startDateTime;
        sanitizedInput.parsed_end = endDateTime;
      } catch (error) {
        errors.push({ field: 'datetime', message: error.message });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput
    };
  }

  static validatePollInput(input) {
    const errors = [];
    const sanitizedInput = { ...input };

    if (!input.question || typeof input.question !== 'string') {
      errors.push({ field: 'question', message: 'Question is required' });
    } else if (input.question.trim().length === 0) {
      errors.push({ field: 'question', message: 'Question cannot be empty' });
    } else if (input.question.length > 200) {
      errors.push({ field: 'question', message: 'Question must be 200 characters or less' });
    } else {
      sanitizedInput.question = sanitizeHtml(input.question.trim(), { allowedTags: [] });
    }

    if (!input.options || !Array.isArray(input.options)) {
      errors.push({ field: 'options', message: 'Options must be an array' });
    } else if (input.options.length < 2) {
      errors.push({ field: 'options', message: 'At least 2 options are required' });
    } else if (input.options.length > 5) {
      errors.push({ field: 'options', message: 'Maximum 5 options allowed' });
    } else {
      const sanitizedOptions = [];
      let optionErrors = false;

      input.options.forEach((option, index) => {
        if (typeof option !== 'string') {
          errors.push({ field: `option_${index}`, message: `Option ${index + 1} must be a string` });
          optionErrors = true;
        } else if (option.trim().length === 0) {
          errors.push({ field: `option_${index}`, message: `Option ${index + 1} cannot be empty` });
          optionErrors = true;
        } else if (option.length > 50) {
          errors.push({ field: `option_${index}`, message: `Option ${index + 1} must be 50 characters or less` });
          optionErrors = true;
        } else {
          sanitizedOptions.push(sanitizeHtml(option.trim(), { allowedTags: [] }));
        }
      });

      if (!optionErrors) {
        sanitizedInput.options = sanitizedOptions;
      }
    }

    if (input.timeout && typeof input.timeout === 'number') {
      if (input.timeout < 1 || input.timeout > 1440) {
        errors.push({ field: 'timeout', message: 'Timeout must be between 1 and 1440 minutes (24 hours)' });
      }
    } else if (input.timeout && typeof input.timeout !== 'number') {
      errors.push({ field: 'timeout', message: 'Timeout must be a number' });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput
    };
  }

  static validateWorkingHours(startHour, endHour) {
    const errors = [];

    if (typeof startHour !== 'number' || startHour < 0 || startHour > 23) {
      errors.push({ field: 'start_hour', message: 'Start hour must be between 0 and 23' });
    }

    if (typeof endHour !== 'number' || endHour < 0 || endHour > 23) {
      errors.push({ field: 'end_hour', message: 'End hour must be between 0 and 23' });
    }

    if (errors.length === 0 && startHour >= endHour) {
      errors.push({ field: 'working_hours', message: 'End hour must be after start hour' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitizeUserInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return sanitizeHtml(input.trim(), {
      allowedTags: [],
      allowedAttributes: {}
    });
  }

  static validateDiscordSnowflake(id) {
    if (typeof id !== 'string') {
      return false;
    }

    const snowflakeRegex = /^\d{17,19}$/;
    return snowflakeRegex.test(id);
  }

  static createValidationError(errors) {
    if (errors.length === 0) {
      return null;
    }

    const errorMessages = errors.map(error =>
      error.field ? `${error.field}: ${error.message}` : error.message
    );

    return new ValidationError(errorMessages.join('\n'));
  }
}

module.exports = {
  ValidationUtils,
  ValidationError
};