const test = require('node:test');
const assert = require('node:assert');
const RedisMock = require('ioredis-mock');
const { checkSlidingWindow } = require('../src/algorithms/slidingWindowCounter');

test('Sliding Window Counter: enforces request window capacity', async () => {
  const redis = new RedisMock();
  const keyPrefix = 'test:swc:user1';

  for (let i = 0; i < 4; i++) {
    const res = await checkSlidingWindow(redis, keyPrefix, { limit: 4, windowMs: 5000, cost: 1 });
    assert.strictEqual(res.allowed, true);
  }

  // 5th request should be blocked
  const blocked = await checkSlidingWindow(redis, keyPrefix, { limit: 4, windowMs: 5000, cost: 1 });
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs > 0);
});
