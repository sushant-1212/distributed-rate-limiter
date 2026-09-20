const test = require('node:test');
const assert = require('node:assert');
const RedisMock = require('ioredis-mock');
const { checkTokenBucket } = require('../src/algorithms/tokenBucket');

test('TokenBucket: consumes tokens and refills', async () => {
  const redis = new RedisMock();
  const key = 'test:tb:user1';

  // Capacity 3, refill 1/sec
  for (let i = 0; i < 3; i++) {
    const res = await checkTokenBucket(redis, key, { capacity: 3, refillRate: 1, cost: 1 });
    assert.strictEqual(res.allowed, true);
  }

  // Next request should be blocked
  const blocked = await checkTokenBucket(redis, key, { capacity: 3, refillRate: 1, cost: 1 });
  assert.strictEqual(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});
