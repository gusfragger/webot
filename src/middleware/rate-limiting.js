const { rateLimiting } = require('../config/environment');

const rateLimiter = new Map();

const checkRateLimit = (userId, commandName, limit = null, window = null) => {
  const effectiveLimit = limit || rateLimiting.maxRequests;
  const effectiveWindow = window || rateLimiting.window;

  const key = `${userId}:${commandName}`;
  const now = Date.now();

  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, {
      count: 1,
      resetTime: now + effectiveWindow
    });
    return true;
  }

  const userLimit = rateLimiter.get(key);

  if (now > userLimit.resetTime) {
    rateLimiter.set(key, {
      count: 1,
      resetTime: now + effectiveWindow
    });
    return true;
  }

  if (userLimit.count >= effectiveLimit) {
    return false;
  }

  userLimit.count++;
  return true;
};

const getRemainingRequests = (userId, commandName) => {
  const key = `${userId}:${commandName}`;
  const userLimit = rateLimiter.get(key);

  if (!userLimit) {
    return rateLimiting.maxRequests;
  }

  const now = Date.now();
  if (now > userLimit.resetTime) {
    return rateLimiting.maxRequests;
  }

  return Math.max(0, rateLimiting.maxRequests - userLimit.count);
};

const getResetTime = (userId, commandName) => {
  const key = `${userId}:${commandName}`;
  const userLimit = rateLimiter.get(key);

  if (!userLimit) {
    return null;
  }

  return new Date(userLimit.resetTime);
};

const clearUserLimits = (userId) => {
  const keysToDelete = [];

  for (const key of rateLimiter.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => rateLimiter.delete(key));
};

const cleanupExpiredLimits = () => {
  const now = Date.now();
  const keysToDelete = [];

  for (const [key, data] of rateLimiter.entries()) {
    if (now > data.resetTime) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => rateLimiter.delete(key));
};

setInterval(cleanupExpiredLimits, 60000);

module.exports = {
  checkRateLimit,
  getRemainingRequests,
  getResetTime,
  clearUserLimits
};