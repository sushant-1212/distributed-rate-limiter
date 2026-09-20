/**
 * Adaptive Concurrency Limiter (Netflix TCP Vegas / Gradient2 Pattern).
 *
 * Employs Little's Law (L = λ * W) to regulate in-flight concurrency.
 * Automatically sheds load when downstream latency spikes (e.g. database degradation),
 * preventing socket starvation and cascading process crashes.
 */

class ConcurrencyLimiter {
  constructor(opts = {}) {
    this.minLimit = opts.minLimit || 5;
    this.maxLimit = opts.maxLimit || 200;
    this.currentLimit = opts.initialLimit || 25;
    this.inFlight = 0;
    this.rttMin = Infinity;
    this.rttHistory = [];
    this.smoothingFactor = opts.smoothingFactor || 0.2;
    this.queueTolerance = opts.queueTolerance || 2;
  }

  /**
   * Acquire a slot for an in-flight request.
   * @returns {{ allowed: boolean, inFlight: number, currentLimit: number }}
   */
  acquire() {
    if (this.inFlight >= this.currentLimit) {
      return {
        allowed: false,
        inFlight: this.inFlight,
        currentLimit: Math.round(this.currentLimit),
        reason: 'concurrency_limit_exceeded',
      };
    }

    this.inFlight++;
    return {
      allowed: true,
      inFlight: this.inFlight,
      currentLimit: Math.round(this.currentLimit),
    };
  }

  /**
   * Release slot and update moving latency gradient.
   * @param {number} rttMs - Request duration in milliseconds
   */
  release(rttMs) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (rttMs <= 0) return;

    // Track baseline minimum RTT
    if (rttMs < this.rttMin) {
      this.rttMin = rttMs;
    }

    this.rttHistory.push(rttMs);
    if (this.rttHistory.length > 50) this.rttHistory.shift();

    // Compute moving average RTT
    const sum = this.rttHistory.reduce((acc, v) => acc + v, 0);
    const avgRtt = sum / this.rttHistory.length;

    // Gradient = RTT_min / RTT_sample
    // If system is healthy, gradient ~ 1.0. If database degrades, gradient drops < 1.0.
    const gradient = Math.max(0.5, Math.min(1.5, this.rttMin / avgRtt));

    // Gradient2 update formula: newLimit = currentLimit * gradient + queueTolerance
    const targetLimit = this.currentLimit * gradient + this.queueTolerance;
    this.currentLimit =
      this.currentLimit * (1 - this.smoothingFactor) + targetLimit * this.smoothingFactor;
    this.currentLimit = Math.max(this.minLimit, Math.min(this.maxLimit, this.currentLimit));
  }

  getState() {
    return {
      inFlight: this.inFlight,
      currentLimit: Math.round(this.currentLimit),
      rttMinMs: this.rttMin === Infinity ? 0 : Number(this.rttMin.toFixed(2)),
      avgRttMs:
        this.rttHistory.length > 0
          ? Number((this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length).toFixed(2))
          : 0,
    };
  }

  reset() {
    this.inFlight = 0;
    this.currentLimit = 25;
    this.rttMin = Infinity;
    this.rttHistory.length = 0;
  }
}

module.exports = new ConcurrencyLimiter();
module.exports.ConcurrencyLimiter = ConcurrencyLimiter;
