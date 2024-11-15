const { database, initializeDatabase } = require('../src/database/database');
require('dotenv').config({ path: '.env.test' });

beforeAll(async () => {
  process.env.DATABASE_URL = ':memory:';
  process.env.NODE_ENV = 'test';

  await initializeDatabase();

  console.log('✅ Test database setup complete');
});

afterAll(async () => {
  await database.close();
  console.log('✅ Test database cleanup complete');
});

beforeEach(async () => {
  await database.run('DELETE FROM meeting_responses');
  await database.run('DELETE FROM notifications');
  await database.run('DELETE FROM recurring_meetings');
  await database.run('DELETE FROM user_availability');
  await database.run('DELETE FROM quick_polls');
  await database.run('DELETE FROM poll_votes');
  await database.run('DELETE FROM meeting_analytics');
  await database.run('DELETE FROM meetings');
  await database.run('DELETE FROM users');
});

global.createTestUser = async (userData = {}) => {
  const UserRepository = require('../src/database/models/user');
  const userRepo = new UserRepository();

  const defaultUser = {
    id: '123456789',
    username: 'testuser',
    display_name: 'Test User',
    timezone: 'UTC',
    working_hours_start: 9,
    working_hours_end: 17,
    ...userData
  };

  return await userRepo.create(defaultUser);
};

global.createTestMeeting = async (meetingData = {}) => {
  const MeetingRepository = require('../src/database/models/meeting');
  const meetingRepo = new MeetingRepository();

  const defaultMeeting = {
    title: 'Test Meeting',
    description: 'A test meeting',
    proposer_id: '123456789',
    proposed_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    duration_minutes: 60,
    ...meetingData
  };

  return await meetingRepo.create(defaultMeeting);
};

global.mockDiscordInteraction = (overrides = {}) => {
  const defaultInteraction = {
    user: {
      id: '123456789',
      username: 'testuser',
      displayName: 'Test User'
    },
    guild: {
      id: '987654321'
    },
    member: {
      permissions: {
        has: jest.fn().mockReturnValue(true)
      }
    },
    options: {
      getString: jest.fn(),
      getInteger: jest.fn(),
      getUser: jest.fn()
    },
    reply: jest.fn(),
    editReply: jest.fn(),
    deferReply: jest.fn(),
    followUp: jest.fn(),
    replied: false,
    deferred: false,
    ...overrides
  };

  return defaultInteraction;
};