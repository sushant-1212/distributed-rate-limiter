/**
 * Hierarchical Two-Tier Rate Limiting (L1 Local Memory + L2 Redis).
 *
 * Slashes Redis network round-trips by leasing batches of tokens into
 * local process memory. Subsequent requests consume from L1 at sub-microsecond
 * latency (~0.02ms) instead of paying network RTT to Redis.
 */

const LEASE_LUA = `
local key        = KEYS[1]
local batchSize  = tonumber(ARGV[1])
local capacity   = tonumber(ARGV[2])
local refillRate = tonumber(ARGV[3])
local now        = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'timestamp')
local tokens = tonumber(bucket[1])
local timestamp = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  timestamp = now
end

local elapsedSeconds = math.max(0, (now - timestamp) / 1000)
tokens = math.min(capacity, tokens + elapsedSeconds * refillRate)

local granted = 0
if tokens >= 1 then
  granted = math.min(batchSize, math.floor(tokens))
  tokens = tokens - granted
end

redis.call('HMSET', key, 'tokens', tokens, 'timestamp', now)
redis.call('EXPIRE', key, math.max(60, math.ceil(capacity / refillRate * 2)))

local resetMs = math.max(0, math.ceil(((capacity - tokens) / refillRate) * 1000))
return { granted > 0 and 1 or 0, granted, tostring(tokens), resetMs }
`;

class HierarchicalLimiter {
  constructor(redisClient, opts = {}) {
    this.redisClient = redisClient;
    this.defaultBatchSize = opts.defaultBatchSize || 10;
    this.leaseTtlMs = opts.leaseTtlMs || 2000;
    this.l1Cache = new Map(); // key -> { tokens, expiresAt, resetMs }
    this.stats = {
      l1Hits: 0,
      l2Queries: 0,
    };

    if (typeof this.redisClient.defineCommand === 'function') {
      this.redisClient.defineCommand('acquireLease', {
        numberOfKeys: 1,
        lua: LEASE_LUA,
      });
    }
  }

  /**
   * Check rate limit using L1 local cache with L2 Redis lease refills.
   */
  async check(key, opts = {}) {
    const cost = opts.cost || 1;
    const now = Date.now();
    const l1Entry = this.l1Cache.get(key);

    // 1. Check L1 Memory Cache
    if (l1Entry && l1Entry.expiresAt > now) {
      if (l1Entry.tokens >= cost) {
        l1Entry.tokens -= cost;
        this.stats.l1Hits++;
        return {
          allowed: true,
          remaining: Math.floor(l1Entry.tokens),
          resetMs: l1Entry.resetMs,
          retryAfterMs: 0,
          source: 'L1_MEMORY',
        };
      }
    }

    // 2. L1 Cache Miss / Exhausted: Query L2 Distributed Redis
    this.stats.l2Queries++;
    const capacity = opts.capacity || 20;
    const refillRate = opts.refillRate || 5;
    const batchSize = Math.max(cost, opts.batchSize || this.defaultBatchSize);
    const redisKey = `ratelimit:lease:${key}`;

    let result;
    if (typeof this.redisClient.acquireLease === 'function') {
      result = await this.redisClient.acquireLease(redisKey, batchSize, capacity, refillRate, now);
    } else {
      result = await this.redisClient.eval(LEASE_LUA, 1, redisKey, batchSize, capacity, refillRate, now);
    }

    const [allowed, granted, redisTokensLeft, resetMs] = result;
    const grantedTokens = Number(granted);

    if (allowed === 1 && grantedTokens >= cost) {
      const remainingLocal = grantedTokens - cost;
      this.l1Cache.set(key, {
        tokens: remainingLocal,
        expiresAt: now + this.leaseTtlMs,
        resetMs: Number(resetMs),
      });

      return {
        allowed: true,
        remaining: remainingLocal,
        resetMs: Number(resetMs),
        retryAfterMs: 0,
        source: 'L2_REDIS_LEASE',
      };
    }

    // Rate limited
    const waitSeconds = refillRate > 0 ? Math.ceil(cost / refillRate) : 1;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Number(resetMs),
      retryAfterMs: waitSeconds * 1000,
      source: 'L2_REDIS_EXHAUSTED',
    };
  }

  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Queries;
    const hitRate = total > 0 ? (this.stats.l1Hits / total) * 100 : 0;
    return {
      ...this.stats,
      total,
      l1HitRatePercent: hitRate.toFixed(1),
    };
  }

  pruneExpired() {
    const now = Date.now();
    for (const [k, v] of this.l1Cache.entries()) {
      if (v.expiresAt <= now) {
        this.l1Cache.delete(k);
      }
    }
  }

  clear() {
    this.l1Cache.clear();
    this.stats.l1Hits = 0;
    this.stats.l2Queries = 0;
  }
}

module.exports = HierarchicalLimiter;
