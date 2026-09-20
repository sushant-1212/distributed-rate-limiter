const test = require('node:test');
const assert = require('node:assert');
const RedisMock = require('ioredis-mock');
const HierarchicalLimiter = require('../src/core/hierarchicalLimiter');

test('HierarchicalLimiter: serves subsequent requests from L1 memory', async () => {
  const redis = new RedisMock();
  const limiter = new HierarchicalLimiter(redis, { defaultBatchSize: 10, leaseTtlMs: 5000 });
  const key = 'tenant:corp_1';

  // First check requests lease from L2
  const res1 = await limiter.check(key, { capacity: 20, refillRate: 5, batchSize: 5 });
  assert.strictEqual(res1.allowed, true);
  assert.strictEqual(res1.source, 'L2_REDIS_LEASE');

  // Next 4 requests should be served from L1 memory cache directly without hitting L2
  for (let i = 0; i < 4; i++) {
    const res = await limiter.check(key, { capacity: 20, refillRate: 5 });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.source, 'L1_MEMORY');
  }

  const stats = limiter.getStats();
  assert.strictEqual(stats.l1Hits, 4, 'Should have recorded 4 L1 memory hits');
  assert.strictEqual(stats.l2Queries, 1, 'Should have recorded 1 L2 query');
});
