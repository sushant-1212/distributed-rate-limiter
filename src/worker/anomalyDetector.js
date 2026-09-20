/**
 * Off-Path Telemetry Anomaly Detector.
 * Processes traffic telemetry asynchronously to detect bot surges, credential stuffing,
 * and DDoS spikes without impacting hot-path latency.
 */

const policyEngine = require('../core/policyEngine');
const redis = require('../redisClient');
const { STREAM_NAME } = require('../telemetry/streamEmitter');

class AnomalyDetector {
  constructor(opts = {}) {
    this.evalIntervalMs = opts.evalIntervalMs || 2000;
    this.windowSize = opts.windowSize || 500;
    this.recentEvents = [];
    this.recentAnomalies = [];
    this.lastEntropy = 1.0;
    this.isRunning = false;
    this.timer = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.evaluateWindow(), this.evalIntervalMs);
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
  }

  recordLocalEvent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.windowSize) {
      this.recentEvents.shift();
    }
  }

  /**
   * Calculate Shannon Entropy over a set of categorical keys.
   * H(X) = -sum(p(x) * log2(p(x)))
   * Returns normalized entropy between 0.0 (concentrated / bot-like) and 1.0 (diverse / genuine).
   */
  calculateEntropy(items) {
    if (!items || items.length <= 1) return 1.0;
    const freqs = {};
    for (const item of items) {
      freqs[item] = (freqs[item] || 0) + 1;
    }

    const n = items.length;
    const uniqueCount = Object.keys(freqs).length;
    if (uniqueCount <= 1) return 0.0;

    let entropy = 0;
    for (const count of Object.values(freqs)) {
      const p = count / n;
      entropy -= p * Math.log2(p);
    }

    const maxEntropy = Math.log2(uniqueCount);
    return maxEntropy > 0 ? Math.min(1.0, entropy / maxEntropy) : 1.0;
  }

  async pollRedisStream() {
    if (!redis.isReady || typeof redis.xread !== 'function') return;

    try {
      // Read recent entries from Redis Stream
      const result = await redis.xread('COUNT', 50, 'STREAMS', STREAM_NAME, '$');
      if (result && result.length > 0) {
        const [, entries] = result[0];
        for (const [, fields] of entries) {
          const entryObj = {};
          for (let i = 0; i < fields.length; i += 2) {
            entryObj[fields[i]] = fields[i + 1];
          }
          this.recordLocalEvent(entryObj);
        }
      }
    } catch {
      // Redis Stream read error, ignore gracefully
    }
  }

  async evaluateWindow() {
    await this.pollRedisStream();

    if (this.recentEvents.length < 10) return;

    const sources = this.recentEvents.map((e) => e.sourceId);
    const endpoints = this.recentEvents.map((e) => e.path);

    // Compute Shannon Entropy on sources and endpoints
    const sourceEntropy = this.calculateEntropy(sources);
    const endpointEntropy = this.calculateEntropy(endpoints);
    this.lastEntropy = Number(((sourceEntropy + endpointEntropy) / 2).toFixed(3));

    // Identify high-frequency offenders
    const sourceCounts = {};
    const blockedCounts = {};

    for (const e of this.recentEvents) {
      sourceCounts[e.sourceId] = (sourceCounts[e.sourceId] || 0) + 1;
      if (e.allowed === '0' || e.allowed === false) {
        blockedCounts[e.sourceId] = (blockedCounts[e.sourceId] || 0) + 1;
      }
    }

    // Heuristic mitigation: If a single source accounts for > 40% of traffic
    // or has > 5 blocked attempts in recent window, clamp down with dynamic penalty
    for (const [sourceId, count] of Object.entries(sourceCounts)) {
      const blocked = blockedCounts[sourceId] || 0;
      const shareOfTraffic = count / this.recentEvents.length;

      if (blocked >= 5 || (shareOfTraffic > 0.4 && count > 15)) {
        const reason = blocked >= 5 ? 'repeated_rate_limit_violations' : 'high_volume_traffic_monopolization';
        policyEngine.setPenalty(sourceId, 0.2, 20000, reason);

        const alert = {
          timestamp: new Date().toISOString(),
          sourceId,
          reason,
          trafficShare: (shareOfTraffic * 100).toFixed(1) + '%',
          blockedAttempts: blocked,
        };

        this.recentAnomalies.unshift(alert);
        if (this.recentAnomalies.length > 20) this.recentAnomalies.pop();
      }
    }
  }

  getStatus() {
    return {
      activeEventsInWindow: this.recentEvents.length,
      normalizedEntropy: this.lastEntropy,
      isUnderAttack: this.lastEntropy < 0.4 && this.recentEvents.length > 30,
      recentAnomalies: this.recentAnomalies.slice(0, 10),
    };
  }
}

module.exports = new AnomalyDetector();
