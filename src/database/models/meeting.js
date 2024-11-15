const { database } = require('../database');

class MeetingRepository {
  constructor() {
    this.db = database;
  }

  async create(meetingData) {
    const {
      title,
      description,
      proposer_id,
      proposed_datetime,
      timezone,
      duration_minutes = 60,
      meeting_type = 'one-time',
      template_type,
      max_participants
    } = meetingData;

    const sql = `
      INSERT INTO meetings (
        title, description, proposer_id, proposed_datetime,
        timezone, duration_minutes, meeting_type, template_type, max_participants
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      title,
      description,
      proposer_id,
      proposed_datetime,
      timezone,
      duration_minutes,
      meeting_type,
      template_type,
      max_participants
    ];

    const result = await this.db.run(sql, params);
    return await this.findById(result.id);
  }

  async findById(id) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.id = ?
    `;

    return await this.db.get(sql, [id]);
  }

  async findByProposer(proposerId, limit = 20) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.proposer_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `;

    return await this.db.all(sql, [proposerId, limit]);
  }

  async findUpcoming(limit = 10) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.proposed_datetime > datetime('now')
      AND m.status IN ('proposed', 'confirmed')
      ORDER BY m.proposed_datetime ASC
      LIMIT ?
    `;

    return await this.db.all(sql, [limit]);
  }

  async findByDateRange(startDate, endDate, limit = 50) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.proposed_datetime BETWEEN ? AND ?
      ORDER BY m.proposed_datetime ASC
      LIMIT ?
    `;

    return await this.db.all(sql, [startDate, endDate, limit]);
  }

  async update(id, updateData) {
    const allowedFields = [
      'title', 'description', 'proposed_datetime', 'timezone',
      'duration_minutes', 'status', 'max_participants'
    ];

    const updates = [];
    const params = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`;

    await this.db.run(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    const sql = 'DELETE FROM meetings WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  async updateStatus(id, status) {
    return await this.update(id, { status });
  }

  async getResponseSummary(meetingId) {
    const sql = `
      SELECT
        mr.response,
        COUNT(*) as count,
        GROUP_CONCAT(u.display_name || ' (' || u.username || ')') as users
      FROM meeting_responses mr
      LEFT JOIN users u ON mr.user_id = u.id
      WHERE mr.meeting_id = ?
      GROUP BY mr.response
    `;

    const responses = await this.db.all(sql, [meetingId]);

    return {
      available: responses.find(r => r.response === 'available') || { count: 0, users: '' },
      maybe: responses.find(r => r.response === 'maybe') || { count: 0, users: '' },
      unavailable: responses.find(r => r.response === 'unavailable') || { count: 0, users: '' }
    };
  }

  async getParticipants(meetingId) {
    const sql = `
      SELECT DISTINCT
        u.id,
        u.username,
        u.display_name,
        u.timezone,
        mr.response,
        mr.reason,
        mr.responded_at
      FROM meeting_responses mr
      LEFT JOIN users u ON mr.user_id = u.id
      WHERE mr.meeting_id = ?
      ORDER BY mr.responded_at ASC
    `;

    return await this.db.all(sql, [meetingId]);
  }

  async getMeetingsByTemplate(templateType, limit = 10) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.template_type = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `;

    return await this.db.all(sql, [templateType, limit]);
  }

  async searchMeetings(query, limit = 20) {
    const sql = `
      SELECT m.*, u.username as proposer_username, u.display_name as proposer_display_name
      FROM meetings m
      LEFT JOIN users u ON m.proposer_id = u.id
      WHERE m.title LIKE ? OR m.description LIKE ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `;

    const searchTerm = `%${query}%`;
    return await this.db.all(sql, [searchTerm, searchTerm, limit]);
  }

  async getMeetingStats(proposerId) {
    const sql = `
      SELECT
        COUNT(*) as total_meetings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_meetings,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_meetings,
        AVG(
          CASE WHEN status = 'confirmed' THEN
            (SELECT COUNT(*) FROM meeting_responses WHERE meeting_id = m.id AND response = 'available')
          END
        ) as avg_attendance
      FROM meetings m
      WHERE m.proposer_id = ?
    `;

    return await this.db.get(sql, [proposerId]);
  }
}

module.exports = MeetingRepository;