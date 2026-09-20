const test = require('node:test');
const assert = require('node:assert');
const TrafficShieldClient = require('../sdk/trafficShieldClient');

test('TrafficShieldClient: computes AWS full and decorrelated jitter', () => {
  const client = new TrafficShieldClient({ baseDelayMs: 50, maxDelayMs: 1000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    const fullJitter = client.calculateFullJitter(attempt);
    assert.ok(fullJitter >= 0 && fullJitter <= 1000);
  }

  let prev = 50;
  for (let i = 0; i < 5; i++) {
    const decorrJitter = client.calculateDecorrelatedJitter(prev);
    assert.ok(decorrJitter >= 50 && decorrJitter <= 1000);
    prev = decorrJitter;
  }
});

test('TrafficShieldClient: maintains speculative quota cache', () => {
  const client = new TrafficShieldClient();
  const endpoint = '/api/v1/products';

  // Initially empty
  assert.strictEqual(client.getQuotaState(endpoint), null);

  // Manually prime cache to test state
  client.quotaCache.set(endpoint, {
    remaining: 10,
    resetAt: Date.now() + 5000,
  });

  const state = client.getQuotaState(endpoint);
  assert.strictEqual(state.remaining, 10);
});
