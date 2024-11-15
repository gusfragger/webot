const { database } = require('../database');

class AvailabilityRepository {
  constructor() {
    this.db = database;
  }

  async create(availabilityData) {
    const {
      user_id,
      start_datetime,
      end_datetime,
      availability_type,
      reason,
      is_recurring = false,
      recurrence_data
    } = availabilityData;

    const sql = `
      INSERT INTO user_availability (
        user_id, start_datetime, end_datetime, availability_type,
        reason, is_recurring, recurrence_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      user_id,
      start_datetime,
      end_datetime,
      availability_type,
      reason,
      is_recurring,
      recurrence_data ? JSON.stringify(recurrence_data) : null
    ];

    const result = await this.db.run(sql, params);
    return await this.findById(result.id);
  }

  async findById(id) {
    const sql = `
      SELECT ua.*, u.username, u.display_name
      FROM user_availability ua
      LEFT JOIN users u ON ua.user_id = u.id
      WHERE ua.id = ?
    `;

    const availability = await this.db.get(sql, [id]);

    if (availability && availability.recurrence_data) {
      availability.recurrence_data = JSON.parse(availability.recurrence_data);
    }

    return availability;
  }

  async findByUser(userId, startDate, endDate) {
    const sql = `
      SELECT ua.*, u.username, u.display_name
      FROM user_availability ua
      LEFT JOIN users u ON ua.user_id = u.id
      WHERE ua.user_id = ?
      AND ua.start_datetime <= ?
      AND ua.end_datetime >= ?
      ORDER BY ua.start_datetime ASC
    `;

    const availabilities = await this.db.all(sql, [userId, endDate, startDate]);

    return availabilities.map(availability => ({
      ...availability,
      recurrence_data: availability.recurrence_data
        ? JSON.parse(availability.recurrence_data)
        : null
    }));
  }

  async findConflicts(userId, startDateTime, endDateTime, excludeId = null) {
    let sql = `
      SELECT ua.*, u.username, u.display_name
      FROM user_availability ua
      LEFT JOIN users u ON ua.user_id = u.id
      WHERE ua.user_id = ?
      AND ua.availability_type = 'busy'
      AND (
        (ua.start_datetime <= ? AND ua.end_datetime > ?)
        OR (ua.start_datetime < ? AND ua.end_datetime >= ?)
        OR (ua.start_datetime >= ? AND ua.end_datetime <= ?)
      )
    `;

    const params = [userId, startDateTime, startDateTime, endDateTime, endDateTime, startDateTime, endDateTime];

    if (excludeId) {
      sql += ' AND ua.id != ?';
      params.push(excludeId);
    }

    sql += ' ORDER BY ua.start_datetime ASC';

    const conflicts = await this.db.all(sql, params);

    return conflicts.map(conflict => ({
      ...conflict,
      recurrence_data: conflict.recurrence_data
        ? JSON.parse(conflict.recurrence_data)
        : null
    }));
  }

  async update(id, updateData) {
    const allowedFields = [
      'start_datetime', 'end_datetime', 'availability_type',
      'reason', 'is_recurring', 'recurrence_data'
    ];

    const updates = [];
    const params = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);

        if (key === 'recurrence_data') {
          params.push(updateData[key] ? JSON.stringify(updateData[key]) : null);
        } else {
          params.push(updateData[key]);
        }
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id);

    const sql = `UPDATE user_availability SET ${updates.join(', ')} WHERE id = ?`;

    await this.db.run(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    const sql = 'DELETE FROM user_availability WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async deleteByUser(userId, startDate, endDate) {
    const sql = `
      DELETE FROM user_availability
      WHERE user_id = ?
      AND start_datetime >= ?
      AND end_datetime <= ?
    `;

    const result = await this.db.run(sql, [userId, startDate, endDate]);
    return result.changes;
  }

  async setBusyPeriod(userId, startDateTime, endDateTime, reason = null) {
    return await this.create({
      user_id: userId,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      availability_type: 'busy',
      reason,
      is_recurring: false
    });
  }

  async setRecurringBusy(userId, recurrenceData, reason = null) {
    return await this.create({
      user_id: userId,
      start_datetime: recurrenceData.start_datetime,
      end_datetime: recurrenceData.end_datetime,
      availability_type: 'busy',
      reason,
      is_recurring: true,
      recurrence_data: recurrenceData
    });
  }

  async getTeamAvailability(userIds, startDate, endDate) {
    const placeholders = userIds.map(() => '?').join(',');

    const sql = `
      SELECT
        ua.user_id,
        u.username,
        u.display_name,
        u.timezone,
        ua.start_datetime,
        ua.end_datetime,
        ua.availability_type,
        ua.reason
      FROM user_availability ua
      LEFT JOIN users u ON ua.user_id = u.id
      WHERE ua.user_id IN (${placeholders})
      AND ua.start_datetime <= ?
      AND ua.end_datetime >= ?
      ORDER BY ua.user_id, ua.start_datetime ASC
    `;

    const params = [...userIds, endDate, startDate];

    return await this.db.all(sql, params);
  }

  async findOptimalMeetingTimes(userIds, duration, startDate, endDate, workingHoursOnly = true) {
    const teamAvailability = await this.getTeamAvailability(userIds, startDate, endDate);

    const busyPeriods = teamAvailability
      .filter(period => period.availability_type === 'busy')
      .reduce((acc, period) => {
        if (!acc[period.user_id]) acc[period.user_id] = [];
        acc[period.user_id].push({
          start: new Date(period.start_datetime),
          end: new Date(period.end_datetime)
        });
        return acc;
      }, {});

    const userTimezones = {};
    const workingHours = {};

    const userDetailsSql = `
      SELECT id, timezone, working_hours_start, working_hours_end
      FROM users
      WHERE id IN (${userIds.map(() => '?').join(',')})
    `;

    const userDetails = await this.db.all(userDetailsSql, userIds);

    userDetails.forEach(user => {
      userTimezones[user.id] = user.timezone;
      workingHours[user.id] = {
        start: user.working_hours_start,
        end: user.working_hours_end
      };
    });

    return {
      busyPeriods,
      userTimezones,
      workingHours
    };
  }

  async getUserBusyPeriods(userId, startDate, endDate) {
    const sql = `
      SELECT start_datetime, end_datetime, reason
      FROM user_availability
      WHERE user_id = ?
      AND availability_type = 'busy'
      AND start_datetime <= ?
      AND end_datetime >= ?
      ORDER BY start_datetime ASC
    `;

    return await this.db.all(sql, [userId, endDate, startDate]);
  }

  async clearUserAvailability(userId, startDate, endDate) {
    const sql = `
      DELETE FROM user_availability
      WHERE user_id = ?
      AND start_datetime >= ?
      AND end_datetime <= ?
    `;

    const result = await this.db.run(sql, [userId, startDate, endDate]);
    return result.changes;
  }
}

module.exports = AvailabilityRepository;