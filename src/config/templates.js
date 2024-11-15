const MEETING_TEMPLATES = {
  standup: {
    name: 'Daily Standup',
    description: 'Quick daily team sync to discuss progress and blockers',
    duration: 30,
    template_type: 'standup',
    max_participants: 10,
    suggested_times: ['09:00', '10:00', '15:00'],
    recurring_pattern: 'daily'
  },

  sprint_planning: {
    name: 'Sprint Planning',
    description: 'Plan upcoming sprint goals and tasks',
    duration: 120,
    template_type: 'sprint_planning',
    max_participants: 8,
    suggested_times: ['09:00', '14:00'],
    recurring_pattern: 'biweekly'
  },

  code_review: {
    name: 'Code Review',
    description: 'Review code changes and discuss implementation',
    duration: 60,
    template_type: 'code_review',
    max_participants: 5,
    suggested_times: ['10:00', '14:00', '16:00'],
    recurring_pattern: 'weekly'
  },

  retrospective: {
    name: 'Sprint Retrospective',
    description: 'Reflect on sprint and identify improvements',
    duration: 90,
    template_type: 'retrospective',
    max_participants: 8,
    suggested_times: ['14:00', '15:00'],
    recurring_pattern: 'biweekly'
  },

  gaming_session: {
    name: 'Gaming Session',
    description: 'Fun gaming time with the team',
    duration: 120,
    template_type: 'gaming_session',
    max_participants: 20,
    suggested_times: ['18:00', '19:00', '20:00', '21:00'],
    recurring_pattern: 'weekly'
  },

  one_on_one: {
    name: 'One-on-One',
    description: 'Private discussion between team members',
    duration: 30,
    template_type: 'one_on_one',
    max_participants: 2,
    suggested_times: ['10:00', '11:00', '14:00', '15:00'],
    recurring_pattern: 'weekly'
  },

  all_hands: {
    name: 'All Hands',
    description: 'Company-wide meeting for updates and announcements',
    duration: 60,
    template_type: 'all_hands',
    max_participants: 50,
    suggested_times: ['10:00', '15:00'],
    recurring_pattern: 'monthly'
  },

  brainstorming: {
    name: 'Brainstorming Session',
    description: 'Creative session to generate ideas and solutions',
    duration: 90,
    template_type: 'brainstorming',
    max_participants: 8,
    suggested_times: ['10:00', '14:00'],
    recurring_pattern: null
  }
};

const RECURRING_PATTERNS = {
  daily: {
    name: 'Daily',
    description: 'Every day',
    interval: 1,
    type: 'days'
  },

  weekly: {
    name: 'Weekly',
    description: 'Every week',
    interval: 7,
    type: 'days'
  },

  biweekly: {
    name: 'Bi-weekly',
    description: 'Every 2 weeks',
    interval: 14,
    type: 'days'
  },

  monthly: {
    name: 'Monthly',
    description: 'Every month',
    interval: 1,
    type: 'months'
  }
};

const ACHIEVEMENTS = {
  time_lord: {
    name: 'Time Lord',
    description: 'Successfully scheduled 10 meetings',
    icon: '⏰',
    requirement: { type: 'meetings_created', count: 10 }
  },

  early_bird: {
    name: 'Early Bird',
    description: 'Always responds to meetings within 1 hour',
    icon: '🐦',
    requirement: { type: 'response_time', threshold: 3600 }
  },

  meeting_master: {
    name: 'Meeting Master',
    description: 'Created 50 meetings',
    icon: '👑',
    requirement: { type: 'meetings_created', count: 50 }
  },

  team_player: {
    name: 'Team Player',
    description: 'Responded to 100 meetings',
    icon: '🤝',
    requirement: { type: 'responses_given', count: 100 }
  },

  punctual: {
    name: 'Punctual',
    description: 'Never missed a confirmed meeting',
    icon: '🎯',
    requirement: { type: 'attendance_rate', threshold: 100 }
  },

  scheduler: {
    name: 'Scheduler',
    description: 'Set up recurring meetings',
    icon: '🔄',
    requirement: { type: 'recurring_meetings', count: 1 }
  },

  efficient: {
    name: 'Efficient',
    description: 'Keep average meeting duration under 60 minutes',
    icon: '⚡',
    requirement: { type: 'avg_duration', threshold: 60 }
  },

  global_coordinator: {
    name: 'Global Coordinator',
    description: 'Scheduled meetings across 5+ timezones',
    icon: '🌍',
    requirement: { type: 'timezones_coordinated', count: 5 }
  }
};

module.exports = {
  MEETING_TEMPLATES,
  RECURRING_PATTERNS,
  ACHIEVEMENTS
};