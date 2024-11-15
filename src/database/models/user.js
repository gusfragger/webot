const { database } = require('../database');

class UserRepository {
  constructor() {
    this.db = database;
  }

  async create(userData) {
    const {
      id,
      username,
      display_name,
      timezone = 'UTC',
      working_hours_start = 9,
      working_hours_end = 17,
      notification_preferences = ['24h', '1h', '15m']
    } = userData;

    const sql = `
      INSERT INTO users (
        id, username, display_name, timezone,
        working_hours_start, working_hours_end, notification_preferences
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      username,
      display_name,
      timezone,
      working_hours_start,
      working_hours_end,
      JSON.stringify(notification_preferences)
    ];

    try {
      await this.db.run(sql, params);
      return await this.findById(id);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return await this.findById(id);
      }
      throw error;
    }
  }

  async findById(id) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const user = await this.db.get(sql, [id]);

    if (user) {
      user.notification_preferences = JSON.parse(user.notification_preferences || '[]');
      user.achievements = JSON.parse(user.achievements || '[]');
    }

    return user;
  }

  async findByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const user = await this.db.get(sql, [username]);

    if (user) {
      user.notification_preferences = JSON.parse(user.notification_preferences || '[]');
      user.achievements = JSON.parse(user.achievements || '[]');
    }

    return user;
  }

  async update(id, updateData) {
    const allowedFields = [
      'username', 'display_name', 'timezone',
      'working_hours_start', 'working_hours_end',
      'notification_preferences', 'points', 'achievements'
    ];

    const updates = [];
    const params = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);

        if (key === 'notification_preferences' || key === 'achievements') {
          params.push(JSON.stringify(updateData[key]));
        } else {
          params.push(updateData[key]);
        }
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    await this.db.run(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    const sql = 'DELETE FROM users WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async findAll(limit = 50, offset = 0) {
    const sql = 'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const users = await this.db.all(sql, [limit, offset]);

    return users.map(user => ({
      ...user,
      notification_preferences: JSON.parse(user.notification_preferences || '[]'),
      achievements: JSON.parse(user.achievements || '[]')
    }));
  }

  async updateTimezone(id, timezone) {
    return await this.update(id, { timezone });
  }

  async updateWorkingHours(id, startHour, endHour) {
    return await this.update(id, {
      working_hours_start: startHour,
      working_hours_end: endHour
    });
  }

  async addPoints(id, points) {
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');

    const newPoints = (user.points || 0) + points;
    return await this.update(id, { points: newPoints });
  }

  async addAchievement(id, achievement) {
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');

    const achievements = user.achievements || [];
    if (!achievements.includes(achievement)) {
      achievements.push(achievement);
      return await this.update(id, { achievements });
    }

    return user;
  }

  async getLeaderboard(limit = 10) {
    const sql = `
      SELECT id, username, display_name, points, achievements
      FROM users
      WHERE points > 0
      ORDER BY points DESC
      LIMIT ?
    `;

    const users = await this.db.all(sql, [limit]);

    return users.map(user => ({
      ...user,
      achievements: JSON.parse(user.achievements || '[]')
    }));
  }

  async getUsersByTimezone(timezone) {
    const sql = 'SELECT * FROM users WHERE timezone = ?';
    const users = await this.db.all(sql, [timezone]);

    return users.map(user => ({
      ...user,
      notification_preferences: JSON.parse(user.notification_preferences || '[]'),
      achievements: JSON.parse(user.achievements || '[]')
    }));
  }
}

module.exports = UserRepository;