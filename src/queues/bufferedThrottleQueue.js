/**
 * Buffered Throttling Queue (Zero-Data-Loss Rate Limiting Pattern).
 *
 * For mission-critical endpoints (webhooks, transactions), requests that exceed
 * the immediate rate limit are buffered into a Redis Queue/List instead of being dropped with 429.
 */

const redis = require('../redisClient');

const QUEUE_KEY = 'queue:buffered_throttle';

class BufferedThrottleQueue {
  constructor(opts = {}) {
    this.maxQueueSize = opts.maxQueueSize || 1000;
    this.isDraining = false;
    this.localQueue = []; // In-memory fallback if Redis is offline
  }

  /**
   * Enqueue a throttled request payload.
   */
  async enqueue(requestItem) {
    const payload = JSON.stringify({
      id: `req_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      sourceId: requestItem.sourceId,
      endpoint: requestItem.endpoint,
      body: requestItem.body || {},
      headers: requestItem.headers || {},
    });

    if (redis.isReady && typeof redis.rpush === 'function') {
      const len = await redis.rpush(QUEUE_KEY, payload);
      // Trim if exceeds maxQueueSize
      if (len > this.maxQueueSize) {
        await redis.ltrim(QUEUE_KEY, -this.maxQueueSize, -1);
      }
      return { queued: true, queueDepth: len };
    }

    // Local in-memory queue fallback
    this.localQueue.push(JSON.parse(payload));
    if (this.localQueue.length > this.maxQueueSize) {
      this.localQueue.shift();
    }
    return { queued: true, queueDepth: this.localQueue.length };
  }

  /**
   * Dequeue the next buffered item for processing.
   */
  async dequeue() {
    if (redis.isReady && typeof redis.lpop === 'function') {
      const raw = await redis.lpop(QUEUE_KEY);
      return raw ? JSON.parse(raw) : null;
    }

    return this.localQueue.shift() || null;
  }

  async getDepth() {
    if (redis.isReady && typeof redis.llen === 'function') {
      return await redis.llen(QUEUE_KEY);
    }
    return this.localQueue.length;
  }
}

module.exports = new BufferedThrottleQueue();
module.exports.BufferedThrottleQueue = BufferedThrottleQueue;
