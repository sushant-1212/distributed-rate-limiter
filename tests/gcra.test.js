const test = require('node:test');
const assert = require('node:assert');
const RedisMock = require('ioredis-mock');
const { checkGcra } = require('../src/algorithms/gcra');

test('GCRA: allows initial requests up to limit', async () => {
  const redis = new RedisMock();
  const key = 'test:gcra:user1';

  // Limit 5 req per 10 seconds
  for (let i = 0; i < 5; i++) {
    const res = await checkGcra(redis, key, { limit: 5, periodMs: 10000, cost: 1 });
    assert.strictEqual(res.allowed, true, `Request ${i + 1} should be allowed`);
  }

  // 6th request should be throttled
  const throttled = await checkGcra(redis, key, { limit: 5, periodMs: 10000, cost: 1 });
  assert.strictEqual(throttled.allowed, false, '6th request should exceed limit');
  assert.ok(throttled.retryAfterMs > 0, 'Retry-After should be greater than 0');
});

test('GCRA: honors custom request cost', async () => {
  const redis = new RedisMock();
  const key = 'test:gcra:user2';

  // Cost of 3 out of limit 5
  const res1 = await checkGcra(redis, key, { limit: 5, periodMs: 10000, cost: 3 });
  assert.strictEqual(res1.allowed, true);

  // Remaining should be around 2
  assert.strictEqual(res1.remaining <= 2, true);

  // Another cost of 3 should be blocked because 3 + 3 > 5
  const res2 = await checkGcra(redis, key, { limit: 5, periodMs: 10000, cost: 3 });
  assert.strictEqual(res2.allowed, false);
});
