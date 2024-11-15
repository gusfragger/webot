const requiredEnvVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID'
];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
};

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID
  },
  database: {
    url: process.env.DATABASE_URL || './data/webot.db'
  },
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
  },
  features: {
    enableWebhooks: process.env.ENABLE_WEBHOOKS === 'true',
    enableGithubIntegration: process.env.ENABLE_GITHUB_INTEGRATION === 'true'
  },
  notifications: {
    defaultReminderTimes: (process.env.DEFAULT_REMINDER_TIMES || '24h,1h,15m').split(','),
    timezoneCacheTtl: parseInt(process.env.TIMEZONE_CACHE_TTL || '300000')
  },
  rateLimiting: {
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5')
  },
  development: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  validateEnvironment
};