require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const rateLimiter = require('./rateLimiter');
const windowStore = require('./windowStore');
const classifier = require('./classifier');
const adaptive = require('./adaptive');

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT || 3000);
const CLASSIFIER_INTERVAL_MS = Number(process.env.CLASSIFIER_INTERVAL_MS || 500);

let lastClassification = { genuineProbability: 0.5, verdict: 'monitoring', features: {} };

// ---- Rate limiting middleware -------------------------------------------
// Source identity: prefer an explicit X-User-Id header (so the traffic
// simulator can pretend to be many different users/IPs), fall back to the
// caller's real IP address.
function rateLimitMiddleware(req, res, next) {
  const sourceId = req.get('x-user-id') || req.ip || 'unknown';
  const endpoint = req.path;

  const limits = adaptive.getLimitsFor(sourceId);

  rateLimiter
    .checkLimit(sourceId, { capacity: limits.capacity, refillRate: limits.refillRate })
    .then(({ allowed, tokensLeft }) => {
      windowStore.record(sourceId, endpoint, allowed);
      res.set('X-RateLimit-Remaining', tokensLeft.toFixed(2));
      res.set('X-RateLimit-Capacity', String(limits.capacity));
      if (!allowed) {
        return res.status(429).json({ error: 'rate_limited', tokensLeft });
      }
      next();
    })
    .catch((err) => {
      console.error('[rateLimiter] error:', err.message);
      // Fail-open: if Redis is briefly unavailable, don't take the whole
      // site down over a rate limiter outage.
      next();
    });
}

// ---- Sample application endpoints (what the flash sale / attacker hit) --
const sampleEndpoints = ['/api/home', '/api/product', '/api/search', '/api/cart', '/api/checkout'];
sampleEndpoints.forEach((ep) => {
  app.get(ep, rateLimitMiddleware, (req, res) => res.json({ ok: true, endpoint: ep }));
});
app.get('/api/login', rateLimitMiddleware, (req, res) => res.json({ ok: true, endpoint: '/api/login' }));

// ---- Classification loop -------------------------------------------------
setInterval(() => {
  try {
    const events = windowStore.pruneAndGetWindow();
    lastClassification = classifier.classify(events);
    adaptive.evaluate(events, lastClassification);
  } catch (err) {
    console.error('[classifier] error:', err.message);
  }
}, CLASSIFIER_INTERVAL_MS);

// ---- Dashboard API ---------------------------------------------------
app.get('/api/state', (req, res) => {
  res.json({
    classification: lastClassification,
    adaptive: adaptive.getState(),
    totals: windowStore.getTotals(),
  });
});

app.get('/api/history', (req, res) => res.json(windowStore.getHistory()));
app.get('/api/logs', (req, res) => res.json(windowStore.getRecentLog()));

app.get('/api/buckets', async (req, res) => {
  const events = windowStore.pruneAndGetWindow();
  const recentSources = [...new Set(events.map((e) => e.sourceId))].slice(0, 12);
  const buckets = await Promise.all(
    recentSources.map(async (sourceId) => {
      const bucket = await rateLimiter.peekBucket(sourceId);
      const limits = adaptive.getLimitsFor(sourceId);
      return { sourceId, ...bucket, capacity: limits.capacity, throttled: limits.throttled };
    })
  );
  res.json(buckets);
});

app.post('/api/reset', (req, res) => {
  windowStore.reset();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Traffic Shield server listening on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/index.html`);
});
