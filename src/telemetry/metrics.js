/**
 * Prometheus Metrics Exporter.
 * Exposes real-time throughput, latency percentiles (p50/p95/p99), and rate limiting events.
 */

const client = require('prom-client');

const register = new client.Registry();

// Standard default node metrics (GC, event loop lag, memory)
client.collectDefaultMetrics({ register, prefix: 'ratelimiter_' });

const requestCounter = new client.Counter({
  name: 'ratelimiter_requests_total',
  help: 'Total requests handled by the rate limiter',
  labelNames: ['tier', 'algorithm', 'status', 'route'],
  registers: [register],
});

const latencyHistogram = new client.Histogram({
  name: 'ratelimiter_check_latency_ms',
  help: 'Latency of rate limit checks in milliseconds',
  labelNames: ['tier', 'algorithm', 'source'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50],
  registers: [register],
});

const l1HitsCounter = new client.Counter({
  name: 'ratelimiter_l1_hits_total',
  help: 'Total rate limit checks served from L1 in-memory lease cache',
  registers: [register],
});

const circuitBreakerStateGauge = new client.Gauge({
  name: 'ratelimiter_circuit_breaker_status',
  help: 'Current status of Redis circuit breaker (0 = CLOSED, 1 = HALF_OPEN, 2 = OPEN)',
  registers: [register],
});

module.exports = {
  register,
  requestCounter,
  latencyHistogram,
  l1HitsCounter,
  circuitBreakerStateGauge,
};
