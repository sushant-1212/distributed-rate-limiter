/**
 * Adaptive policy layer. Every CLASSIFIER_INTERVAL_MS, server.js calls
 * evaluate() with the current window of events + the classifier verdict.
 * This module decides how buckets should behave next:
 *
 *  - genuine_surge -> raise the *default* capacity/refill so legitimate
 *    users don't get throttled during a real spike.
 *  - attack_detected -> identify the worst-offending source(s) in the
 *    current window (highest request count with low endpoint diversity)
 *    and clamp *just that source's* bucket hard, leaving everyone else
 *    on normal limits.
 *  - otherwise -> relax back to defaults.
 *
 * Per-source overrides are kept in memory here and read by server.js
 * before each rateLimiter.checkLimit() call.
 */

const BASE_CAPACITY = Number(process.env.DEFAULT_CAPACITY || 10);
const BASE_REFILL = Number(process.env.DEFAULT_REFILL_RATE || 2);

const state = {
  mode: 'normal', // normal | loosened | tightened
  globalCapacity: BASE_CAPACITY,
  globalRefill: BASE_REFILL,
  throttledSources: new Map(), // sourceId -> { capacity, refillRate, until }
};

function findOffenders(events) {
  const bySource = new Map();
  for (const e of events) {
    if (!bySource.has(e.sourceId)) bySource.set(e.sourceId, { count: 0, endpoints: new Set() });
    const s = bySource.get(e.sourceId);
    s.count += 1;
    s.endpoints.add(e.endpoint);
  }
  // Suspicious = high volume + hitting very few distinct endpoints.
  const offenders = [];
  for (const [sourceId, s] of bySource.entries()) {
    if (s.count >= 8 && s.endpoints.size <= 2) {
      offenders.push(sourceId);
    }
  }
  return offenders;
}

function evaluate(events, classification) {
  const { verdict } = classification;

  if (verdict === 'genuine_surge') {
    state.mode = 'loosened';
    state.globalCapacity = BASE_CAPACITY * 2;
    state.globalRefill = BASE_REFILL * 2;
    // Traffic is genuine right now -- ease off any stale throttles.
    state.throttledSources.clear();
  } else if (verdict === 'attack_detected') {
    state.mode = 'tightened';
    state.globalCapacity = BASE_CAPACITY;
    state.globalRefill = BASE_REFILL;
    const offenders = findOffenders(events);
    for (const sourceId of offenders) {
      state.throttledSources.set(sourceId, {
        capacity: 2,
        refillRate: 0.2,
        until: Date.now() + 10000,
      });
    }
  } else {
    state.mode = 'normal';
    state.globalCapacity = BASE_CAPACITY;
    state.globalRefill = BASE_REFILL;
  }

  // Expire old throttles
  const now = Date.now();
  for (const [sourceId, t] of state.throttledSources.entries()) {
    if (t.until < now) state.throttledSources.delete(sourceId);
  }

  return getState();
}

function getLimitsFor(sourceId) {
  const throttle = state.throttledSources.get(sourceId);
  if (throttle) return { capacity: throttle.capacity, refillRate: throttle.refillRate, throttled: true };
  return { capacity: state.globalCapacity, refillRate: state.globalRefill, throttled: false };
}

function getState() {
  return {
    mode: state.mode,
    globalCapacity: state.globalCapacity,
    globalRefill: state.globalRefill,
    throttledSources: [...state.throttledSources.keys()],
  };
}

module.exports = { evaluate, getLimitsFor, getState };
