const test = require('node:test');
const assert = require('node:assert');
const { ConcurrencyLimiter } = require('../src/core/concurrencyLimiter');

test('ConcurrencyLimiter: acquires slots and rejects when limit reached', () => {
  const limiter = new ConcurrencyLimiter({ initialLimit: 3, minLimit: 2, maxLimit: 10 });

  const slot1 = limiter.acquire();
  const slot2 = limiter.acquire();
  const slot3 = limiter.acquire();

  assert.strictEqual(slot1.allowed, true);
  assert.strictEqual(slot2.allowed, true);
  assert.strictEqual(slot3.allowed, true);

  // 4th request should be shed
  const slot4 = limiter.acquire();
  assert.strictEqual(slot4.allowed, false);
  assert.strictEqual(slot4.reason, 'concurrency_limit_exceeded');

  // Release one slot
  limiter.release(15);
  assert.strictEqual(limiter.inFlight, 2);

  const slot5 = limiter.acquire();
  assert.strictEqual(slot5.allowed, true);
});

test('ConcurrencyLimiter: adapts limit dynamically based on RTT gradient', () => {
  const limiter = new ConcurrencyLimiter({ initialLimit: 20, minLimit: 5, maxLimit: 50 });

  // Baseline healthy requests (10ms)
  for (let i = 0; i < 5; i++) {
    limiter.acquire();
    limiter.release(10);
  }

  const initialLimit = limiter.currentLimit;

  // Severe latency spike (e.g. database degradation: 500ms)
  for (let i = 0; i < 10; i++) {
    limiter.acquire();
    limiter.release(500);
  }

  assert.ok(
    limiter.currentLimit < initialLimit,
    `Concurrency limit should shrink under latency spike (was ${initialLimit}, now ${limiter.currentLimit})`
  );
});
