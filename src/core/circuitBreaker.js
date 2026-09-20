/**
 * Circuit Breaker for Redis with Graceful Local Degradation.
 *
 * Prevents cascading latency spikes or outages if Redis experiences packet loss,
 * cluster failovers, or downtime.
 *
 * States:
 *  - CLOSED: Normal operation, queries pass to Redis.
 *  - OPEN: Redis is unhealthy. Bypasses Redis and uses local fallback limiter.
 *  - HALF_OPEN: Probing Redis with a single trial request to test recovery.
 */

class CircuitBreaker {
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold || 3;
    this.recoveryTimeoutMs = opts.recoveryTimeoutMs || 5000;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.localFallbackBuckets = new Map(); // key -> { tokens, lastRefill }
  }

  isOpen() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(err) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Fallback in-memory rate limiter when Redis is down.
   * Degraded: tighter capacity to protect backend servers.
   */
  fallbackCheck(key, cost = 1) {
    const now = Date.now();
    let bucket = this.localFallbackBuckets.get(key);
    const degradedCapacity = 5;
    const degradedRefillPerSec = 1;

    if (!bucket) {
      bucket = { tokens: degradedCapacity, lastRefill: now };
      this.localFallbackBuckets.set(key, bucket);
    }

    const elapsed = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(degradedCapacity, bucket.tokens + elapsed * degradedRefillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetMs: 1000,
        retryAfterMs: 0,
        source: 'CIRCUIT_BREAKER_FALLBACK',
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetMs: 1000,
      retryAfterMs: 1000,
      source: 'CIRCUIT_BREAKER_FALLBACK',
    };
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      isOpen: this.isOpen(),
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.localFallbackBuckets.clear();
  }
}

module.exports = new CircuitBreaker();
module.exports.CircuitBreaker = CircuitBreaker;
