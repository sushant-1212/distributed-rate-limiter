const Redis = require('ioredis');
require('dotenv').config();

let client;
let isConnected = false;

function createClient() {
  if (
    process.env.USE_MOCK_REDIS === 'true' ||
    process.env.NODE_ENV === 'test' ||
    (!process.env.REDIS_URL && process.env.USE_REAL_REDIS !== 'true')
  ) {
    const RedisMock = require('ioredis-mock');
    const mock = new RedisMock();
    isConnected = true;
    return mock;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const instance = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: false,
    retryStrategy(times) {
      // Reconnect indefinitely with backoff capped at 2000ms
      return Math.min(times * 100, 2000);
    },
  });

  instance.on('connect', () => {
    isConnected = true;
  });

  instance.on('ready', () => {
    isConnected = true;
  });

  instance.on('error', (err) => {
    isConnected = false;
  });

  instance.on('close', () => {
    isConnected = false;
  });

  return instance;
}

client = createClient();

module.exports = client;
module.exports.isReady = () => isConnected;
