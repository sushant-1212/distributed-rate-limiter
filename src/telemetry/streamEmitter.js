/**
 * Redis Streams Telemetry Emitter.
 * Asynchronously publishes audit logs off the request hot path.
 */

const redis = require('../redisClient');

const STREAM_NAME = 'stream:traffic_telemetry';
const MAX_STREAM_LEN = 10000;

class StreamEmitter {
  constructor() {
    this.buffer = [];
    this.isFlushing = false;
  }

  /**
   * Non-blocking emit of a request audit record.
   */
  emit(record) {
    if (!redis.isReady && typeof redis.xadd !== 'function') {
      return; // Redis unavailable, skip telemetry without penalty
    }

    const payload = [
      'timestamp', String(record.timestamp || Date.now()),
      'sourceId', String(record.sourceId || 'unknown'),
      'tier', String(record.tier || 'anonymous'),
      'path', String(record.path || '/'),
      'cost', String(record.cost || 1),
      'allowed', record.allowed ? '1' : '0',
      'latencyMs', String(record.latencyMs || 0),
    ];

    redis.xadd(STREAM_NAME, 'MAXLEN', '~', MAX_STREAM_LEN, '*', ...payload).catch(() => {
      // Intentionally suppress errors to prevent request pipeline interruption
    });
  }
}

module.exports = new StreamEmitter();
module.exports.STREAM_NAME = STREAM_NAME;
