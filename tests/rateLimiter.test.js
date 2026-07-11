const test = require('node:test');
const assert = require('node:assert');
const { checkLimit } = require('../src/rateLimiter');
const redis = require('../src/redisClient');

test('allows requests within capacity', async () => {
  const source = 'test-user-' + Date.now();
  for (let i = 0; i < 5; i++) {
    const { allowed } = await checkLimit(source, { capacity: 5, refillRate: 1 });
    assert.strictEqual(allowed, true, `request ${i} should be allowed`);
  }
});

test('blocks requests once bucket is empty', async () => {
  const source = 'test-user-' + Date.now();
  for (let i = 0; i < 3; i++) {
    await checkLimit(source, { capacity: 3, refillRate: 0.001 });
  }
  const { allowed } = await checkLimit(source, { capacity: 3, refillRate: 0.001 });
  assert.strictEqual(allowed, false, 'bucket should be empty and block the next request');
});

test('refills over time', async () => {
  const source = 'test-user-' + Date.now();
  for (let i = 0; i < 3; i++) {
    await checkLimit(source, { capacity: 3, refillRate: 10 }); // fast refill: 10 tokens/sec
  }
  await new Promise((r) => setTimeout(r, 200)); // ~2 tokens should regenerate
  const { allowed, tokensLeft } = await checkLimit(source, { capacity: 3, refillRate: 10 });
  assert.strictEqual(allowed, true, 'bucket should have refilled enough to allow one more request');
  assert.ok(tokensLeft >= 0);
});

test.after(async () => {
  await redis.quit();
});
