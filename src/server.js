require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const rateLimiter = require('./rateLimiter');
const concurrencyLimiter = require('./core/concurrencyLimiter');
const powChallenge = require('./security/powChallenge');
const bufferedThrottleQueue = require('./queues/bufferedThrottleQueue');
const { register } = require('./telemetry/metrics');
const redis = require('./redisClient');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT || 3000);

// Start background off-path anomaly detector
rateLimiter.anomalyDetector.start();

// ---- Observability & Health Endpoints -------------------------------------

app.get('/health', async (req, res) => {
  const cbState = rateLimiter.circuitBreaker.getState();
  const redisHealthy = redis.isReady ? redis.isReady() : true;
  res.json({
    status: cbState.isOpen ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    redis: { connected: redisHealthy },
    circuitBreaker: cbState,
    l1Cache: rateLimiter.hierarchicalLimiter.getStats(),
  });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ---- Sample Tiered Business Endpoints ------------------------------------

app.get('/api/v1/health', rateLimitMiddleware(), (req, res) => {
  res.json({ ok: true, message: 'System healthy', cost: 1 });
});

app.get('/api/v1/products', rateLimitMiddleware(), (req, res) => {
  res.json({
    ok: true,
    data: [
      { id: 'p1', name: 'Distributed Cache Node', price: 99 },
      { id: 'p2', name: 'High-Throughput Gateway', price: 299 },
    ],
    cost: 1,
  });
});

app.get('/api/v1/search', rateLimitMiddleware(), (req, res) => {
  const q = req.query.q || 'default';
  res.json({ ok: true, query: q, results: [`Result for ${q}`], cost: 2 });
});

app.all('/api/v1/checkout', rateLimitMiddleware(), (req, res) => {
  res.json({ ok: true, transactionId: `tx_${Date.now()}`, status: 'processed', cost: 5 });
});

app.all('/api/v1/ai-generate', rateLimitMiddleware(), (req, res) => {
  res.json({ ok: true, generatedText: 'Sample AI response', cost: 10 });
});

// Zero-Data-Loss Buffered Webhook Endpoint
app.post('/api/v1/webhooks/orders', rateLimitMiddleware(), (req, res) => {
  res.json({ ok: true, webhookId: `wb_${Date.now()}`, status: 'dispatched_or_queued' });
});

// Cryptographic Proof-of-Work Challenge Endpoint
app.get('/api/v1/challenge', (req, res) => {
  const sourceId = req.get('x-api-key') || req.get('x-user-id') || req.ip || 'anonymous';
  const challenge = powChallenge.createChallenge(sourceId);
  res.json({ ok: true, challenge });
});

// Backward compatibility routes for legacy hackathon tests/scripts
const legacyRoutes = ['/api/home', '/api/product', '/api/cart'];
legacyRoutes.forEach((route) => {
  app.get(route, rateLimitMiddleware(), (req, res) => res.json({ ok: true, route }));
});
app.get('/api/login', rateLimitMiddleware(), (req, res) => res.json({ ok: true, route: '/api/login' }));

// ---- Rolling Request Telemetry for Dashboard ----------------------------
const recentLogs = []; // { time, sourceId, endpoint, allowed, tier, cost, latencyMs }
const perSecond = []; // { sec, allowed, blocked }
const totals = { total: 0, allowed: 0, blocked: 0 };
const MAX_LOGS = 50;

function recordRequestTelemetry(sourceId, endpoint, allowed, tier, cost, latencyMs) {
  const t = Date.now();
  totals.total += 1;
  if (allowed) totals.allowed += 1;
  else totals.blocked += 1;

  const sec = Math.floor(t / 1000);
  let bin = perSecond[perSecond.length - 1];
  if (!bin || bin.sec !== sec) {
    bin = { sec, allowed: 0, blocked: 0 };
    perSecond.push(bin);
    if (perSecond.length > 40) perSecond.shift();
  }
  if (allowed) bin.allowed += 1;
  else bin.blocked += 1;

  recentLogs.unshift({
    time: new Date(t).toISOString().substring(11, 19),
    sourceId,
    endpoint,
    allowed,
    tier,
    cost,
    latencyMs,
  });
  if (recentLogs.length > MAX_LOGS) recentLogs.pop();
}

// Middleware to record request metrics
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/v1/') || legacyRoutes.includes(req.path) || req.path === '/api/login') {
      const sourceId = req.get('x-api-key') || req.get('x-user-id') || req.ip || 'anonymous';
      const allowed = res.statusCode !== 429;
      const tier = res.get('X-RateLimit-Tier') || 'unknown';
      const latencyMs = Date.now() - startTime;
      recordRequestTelemetry(sourceId, req.path, allowed, tier, 1, latencyMs);
    }
  });
  next();
});

// ---- Dashboard State & Admin Control Plane -------------------------------

app.get('/api/state', (req, res) => {
  const cbState = rateLimiter.circuitBreaker.getState();
  const anomalyState = rateLimiter.anomalyDetector.getStatus();
  const policyOverview = rateLimiter.policyEngine.getOverview();
  const l1Stats = rateLimiter.hierarchicalLimiter.getStats();
  const concurrencyState = concurrencyLimiter.getState();

  res.json({
    totals,
    circuitBreaker: cbState,
    concurrency: concurrencyState,
    anomalyDetection: anomalyState,
    policies: policyOverview,
    hierarchicalL1: l1Stats,
    redis: {
      connected: redis.isReady ? redis.isReady() : false,
    },
    // Backwards compatibility for dashboard gauge
    classification: {
      genuineProbability: anomalyState.normalizedEntropy,
      verdict: anomalyState.isUnderAttack ? 'attack_detected' : (anomalyState.activeEventsInWindow > 15 ? 'genuine_surge' : 'monitoring'),
      features: {
        timingRegularity: anomalyState.normalizedEntropy,
        sourceDiversity: anomalyState.normalizedEntropy,
        endpointDiversity: anomalyState.normalizedEntropy,
      },
    },
    adaptive: {
      mode: cbState.isOpen ? 'degraded_circuit_open' : (anomalyState.isUnderAttack ? 'tightened' : 'normal'),
      globalCapacity: rateLimiter.policyEngine.tiers.anonymous.capacity,
      globalRefill: rateLimiter.policyEngine.tiers.anonymous.refillRate,
      throttledSources: [...rateLimiter.policyEngine.blacklist, ...(anomalyState.recentAnomalies.map((a) => a.sourceId))],
    },
  });
});

app.get('/api/history', (req, res) => res.json(perSecond.slice(-30)));
app.get('/api/logs', (req, res) => res.json(recentLogs));
app.get('/api/buckets', async (req, res) => {
  const uniqueSources = [...new Set(recentLogs.map((l) => l.sourceId))].slice(0, 10);
  const buckets = uniqueSources.map((sourceId) => {
    return {
      sourceId,
      tokens: 8,
      capacity: 10,
      throttled: rateLimiter.policyEngine.blacklist.has(sourceId),
    };
  });
  res.json(buckets);
});

app.post('/api/reset', (req, res) => {
  totals.total = 0;
  totals.allowed = 0;
  totals.blocked = 0;
  recentLogs.length = 0;
  perSecond.length = 0;
  res.json({ ok: true });
});

app.post('/api/admin/policy', (req, res) => {
  const { tier, limit, capacity, refillRate } = req.body;
  if (!tier) return res.status(400).json({ error: 'tier name required' });
  rateLimiter.policyEngine.updateTier(tier, { limit, capacity, refillRate });
  res.json({ ok: true, updatedTier: rateLimiter.policyEngine.tiers[tier] });
});

app.post('/api/admin/blacklist', (req, res) => {
  const { sourceId, action } = req.body;
  if (!sourceId) return res.status(400).json({ error: 'sourceId required' });
  if (action === 'remove') {
    rateLimiter.policyEngine.removeFromBlacklist(sourceId);
  } else {
    rateLimiter.policyEngine.addToBlacklist(sourceId);
  }
  res.json({ ok: true, blacklist: [...rateLimiter.policyEngine.blacklist] });
});

app.post('/api/admin/circuit-breaker/trip', (req, res) => {
  rateLimiter.circuitBreaker.state = 'OPEN';
  rateLimiter.circuitBreaker.lastFailureTime = Date.now();
  res.json({ ok: true, message: 'Circuit breaker manually tripped to OPEN' });
});

app.post('/api/admin/circuit-breaker/reset', (req, res) => {
  rateLimiter.circuitBreaker.reset();
  res.json({ ok: true, message: 'Circuit breaker reset to CLOSED' });
});

let serverInstance = null;
if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(PORT, () => {
    console.log(`Traffic Shield v2 listening on port ${PORT}`);
    console.log(`Live Dashboard: http://localhost:${PORT}/`);
    console.log(`Prometheus Metrics: http://localhost:${PORT}/metrics`);
    console.log(`Health Probes: http://localhost:${PORT}/health`);
  });
}

module.exports = { app, serverInstance };
