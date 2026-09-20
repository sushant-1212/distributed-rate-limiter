/**
 * Unified Rate Limiting Engine.
 *
 * Coordinates:
 *  - Multi-Tenant Policy Engine
 *  - Hierarchical Two-Tier Limiter (L1 Cache + L2 Redis Lease)
 *  - Pluggable Algorithms (GCRA, Sliding Window Counter, Token Bucket)
 *  - Circuit Breaker with Local Fallback
 *  - Decoupled Redis Streams Telemetry & Prometheus Metrics
 */

const redis = require('./redisClient');
const policyEngine = require('./core/policyEngine');
const circuitBreaker = require('./core/circuitBreaker');
const HierarchicalLimiter = require('./core/hierarchicalLimiter');
const { checkRateLimit, ALGORITHMS } = require('./algorithms');
const streamEmitter = require('./telemetry/streamEmitter');
const anomalyDetector = require('./worker/anomalyDetector');
const {
  requestCounter,
  latencyHistogram,
  l1HitsCounter,
  circuitBreakerStateGauge,
} = require('./telemetry/metrics');

const hierarchicalLimiter = new HierarchicalLimiter(redis, {
  defaultBatchSize: 15,
  leaseTtlMs: 2500,
});

/**
 * Check rate limit for an incoming request.
 * @param {object} req - Express request
 * @param {object} optionsOverride - optional overrides
 */
async function checkLimit(req, optionsOverride = {}) {
  const startTime = process.hrtime.bigint();
  const policy = policyEngine.resolveRequest(req);
  const sourceId = policy.tenantId;

  // 1. Blacklist Check
  if (policy.isBlacklisted) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: 3600000,
      retryAfterMs: 3600,
      tier: policy.tierName,
      policy,
      reason: 'blacklisted',
    };
  }

  // 2. Circuit Breaker Check (if Redis is down or experiencing failures)
  if (circuitBreaker.isOpen()) {
    circuitBreakerStateGauge.set(2);
    const fallback = circuitBreaker.fallbackCheck(sourceId, policy.cost);
    recordMetricsAndTelemetry(sourceId, policy, fallback, startTime);
    return { ...fallback, tier: policy.tierName, policy };
  }

  let result;
  const useHierarchical = optionsOverride.useHierarchical ?? (policy.tierName === 'pro' || policy.tierName === 'enterprise');

  try {
    if (useHierarchical) {
      // High-throughput two-tier path (L1 Memory Lease + L2 Redis)
      result = await hierarchicalLimiter.check(sourceId, {
        cost: policy.cost,
        capacity: policy.capacity,
        refillRate: policy.refillRate,
        batchSize: policy.tierName === 'enterprise' ? 50 : 20,
      });

      if (result.source === 'L1_MEMORY') {
        l1HitsCounter.inc();
      }
    } else {
      // Pluggable algorithm check (GCRA / Token Bucket / Sliding Window)
      const algorithm = optionsOverride.algorithm || (optionsOverride.capacity ? ALGORITHMS.TOKEN_BUCKET : (policy.algorithm || ALGORITHMS.GCRA));
      const capacity = optionsOverride.capacity ?? policy.capacity;
      const refillRate = optionsOverride.refillRate ?? policy.refillRate;
      const cost = optionsOverride.cost ?? policy.cost;
      const limit = optionsOverride.limit ?? policy.limit;
      const periodMs = optionsOverride.periodMs ?? policy.periodMs;

      const algoResult = await checkRateLimit(algorithm, redis, sourceId, {
        limit,
        periodMs,
        capacity,
        refillRate,
        cost,
      });

      result = {
        ...algoResult,
        source: `L2_REDIS_${algorithm.toUpperCase()}`,
      };
    }

    circuitBreaker.recordSuccess();
    circuitBreakerStateGauge.set(0);
  } catch (err) {
    console.error(`[RateLimiter] Error during limit check: ${err.message}`);
    circuitBreaker.recordFailure(err);
    circuitBreakerStateGauge.set(1);

    // Fall back locally without crashing or completely opening gates
    result = circuitBreaker.fallbackCheck(sourceId, policy.cost);
  }

  recordMetricsAndTelemetry(sourceId, policy, result, startTime);

  return {
    ...result,
    tier: policy.tierName,
    policy,
  };
}

function recordMetricsAndTelemetry(sourceId, policy, result, startTime) {
  const endTime = process.hrtime.bigint();
  const latencyMs = Number(endTime - startTime) / 1000000;

  // Prometheus Metrics
  requestCounter.inc({
    tier: policy.tierName,
    algorithm: policy.algorithm,
    status: result.allowed ? 'allowed' : 'blocked',
    route: policy.path || '/',
  });

  latencyHistogram.observe(
    {
      tier: policy.tierName,
      algorithm: policy.algorithm,
      source: result.source || 'UNKNOWN',
    },
    latencyMs
  );

  // Asynchronous Decoupled Telemetry (Redis Streams + Local Ring)
  const auditRecord = {
    timestamp: Date.now(),
    sourceId,
    tier: policy.tierName,
    cost: policy.cost,
    allowed: result.allowed,
    latencyMs: Number(latencyMs.toFixed(3)),
  };

  streamEmitter.emit(auditRecord);
  anomalyDetector.recordLocalEvent(auditRecord);
}

module.exports = {
  checkLimit,
  hierarchicalLimiter,
  policyEngine,
  circuitBreaker,
  anomalyDetector,
};
