const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 2,
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

module.exports = redis;
