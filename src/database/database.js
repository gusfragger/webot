const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DATABASE_URL || './data/webot.db';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const dbDir = path.dirname(this.dbPath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('📊 Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('📊 Database connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async executeTransaction(operations) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        const promises = operations.map(({ sql, params }) =>
          this.run(sql, params).catch(err => {
            this.db.run('ROLLBACK');
            throw err;
          })
        );

        Promise.all(promises)
          .then(results => {
            this.db.run('COMMIT', (err) => {
              if (err) {
                this.db.run('ROLLBACK');
                reject(err);
              } else {
                resolve(results);
              }
            });
          })
          .catch(err => {
            this.db.run('ROLLBACK');
            reject(err);
          });
      });
    });
  }
}

const database = new Database();

const initializeDatabase = async () => {
  try {
    await database.connect();
    await runMigrations();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
};

const runMigrations = async () => {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT,
      timezone TEXT DEFAULT 'UTC',
      working_hours_start INTEGER DEFAULT 9,
      working_hours_end INTEGER DEFAULT 17,
      notification_preferences TEXT DEFAULT '["24h","1h","15m"]',
      points INTEGER DEFAULT 0,
      achievements TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      proposer_id TEXT NOT NULL,
      proposed_datetime DATETIME NOT NULL,
      timezone TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'proposed',
      meeting_type TEXT DEFAULT 'one-time',
      template_type TEXT,
      max_participants INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposer_id) REFERENCES users (id)
    )`,

    `CREATE TABLE IF NOT EXISTS meeting_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      response TEXT NOT NULL CHECK (response IN ('available', 'maybe', 'unavailable')),
      reason TEXT,
      responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(meeting_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS recurring_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      recurrence_pattern TEXT NOT NULL,
      recurrence_interval INTEGER DEFAULT 1,
      days_of_week TEXT,
      end_date DATETIME,
      max_occurrences INTEGER,
      current_occurrences INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS user_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      start_datetime DATETIME NOT NULL,
      end_datetime DATETIME NOT NULL,
      availability_type TEXT NOT NULL CHECK (availability_type IN ('busy', 'available')),
      reason TEXT,
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      notification_time DATETIME NOT NULL,
      notification_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`,

    `CREATE TABLE IF NOT EXISTS quick_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      timeout_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (creator_id) REFERENCES users (id)
    )`,

    `CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (poll_id) REFERENCES quick_polls (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(poll_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS meeting_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      response_time_avg REAL,
      response_rate REAL,
      timezone_distribution TEXT,
      optimal_time_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    )`,

    `CREATE INDEX IF NOT EXISTS idx_meetings_datetime ON meetings(proposed_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_meetings_proposer ON meetings(proposer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_responses_meeting ON meeting_responses(meeting_id)`,
    `CREATE INDEX IF NOT EXISTS idx_responses_user ON meeting_responses(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_availability_user ON user_availability(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_availability_datetime ON user_availability(start_datetime, end_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_time ON notifications(notification_time)`,
    `CREATE INDEX IF NOT EXISTS idx_polls_expires ON quick_polls(expires_at)`
  ];

  for (const migration of migrations) {
    try {
      await database.run(migration);
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  console.log('✅ Database migrations completed');
};

module.exports = {
  database,
  initializeDatabase
};