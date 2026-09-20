/**
 * TrafficShield Smart Client SDK.
 *
 * Implements:
 *  - Speculative client-side token caching
 *  - AWS Full Jitter and Decorrelated Jitter exponential backoff
 *  - Automatic RateLimit-* and Retry-After header parsing
 */

class TrafficShieldClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || 'http://localhost:3000';
    this.apiKey = opts.apiKey || null;
    this.maxRetries = opts.maxRetries || 3;
    this.baseDelayMs = opts.baseDelayMs || 200;
    this.maxDelayMs = opts.maxDelayMs || 5000;
    this.jitterType = opts.jitterType || 'full'; // 'full' | 'decorrelated'

    // Speculative client-side cache: path -> { remaining, resetAt }
    this.quotaCache = new Map();
  }

  /**
   * AWS Full Jitter Backoff Algorithm:
   * sleep = random_between(0, min(maxDelay, baseDelay * 2^attempt))
   */
  calculateFullJitter(attempt) {
    const temp = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, attempt));
    return Math.floor(Math.random() * temp);
  }

  /**
   * AWS Decorrelated Jitter Algorithm:
   * sleep = min(maxDelay, random_between(baseDelay, prevSleep * 3))
   */
  calculateDecorrelatedJitter(prevSleep) {
    const min = this.baseDelayMs;
    const max = Math.max(min, prevSleep * 3);
    return Math.min(this.maxDelayMs, Math.floor(min + Math.random() * (max - min)));
  }

  /**
   * Execute an HTTP request with speculative throttling and jittered retry.
   */
  async request(endpoint, options = {}) {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = { ...options.headers };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    // 1. Speculative client check: Avoid network call if we know we are exhausted
    const cached = this.quotaCache.get(endpoint);
    const now = Date.now();
    if (cached && cached.remaining <= 0 && cached.resetAt > now) {
      const waitMs = cached.resetAt - now;
      if (!options.bypassSpeculative) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    let attempt = 0;
    let prevSleep = this.baseDelayMs;

    while (attempt <= this.maxRetries) {
      try {
        const res = await fetch(fullUrl, { ...options, headers });

        // Update speculative cache from response headers
        const limitHeader = res.headers.get('ratelimit-limit');
        const remainingHeader = res.headers.get('ratelimit-remaining');
        const resetHeader = res.headers.get('ratelimit-reset');

        if (remainingHeader && resetHeader) {
          const remaining = parseInt(remainingHeader, 10);
          const resetSeconds = parseInt(resetHeader, 10);
          this.quotaCache.set(endpoint, {
            remaining,
            resetAt: Date.now() + resetSeconds * 1000,
          });
        }

        // Handle 429 Too Many Requests
        if (res.status === 429 && attempt < this.maxRetries) {
          attempt++;
          const retryAfter = res.headers.get('retry-after');
          let backoffMs;

          if (retryAfter) {
            backoffMs = parseInt(retryAfter, 10) * 1000;
          } else if (this.jitterType === 'decorrelated') {
            backoffMs = this.calculateDecorrelatedJitter(prevSleep);
            prevSleep = backoffMs;
          } else {
            backoffMs = this.calculateFullJitter(attempt);
          }

          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        return res;
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        attempt++;
        const backoffMs = this.calculateFullJitter(attempt);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  getQuotaState(endpoint) {
    return this.quotaCache.get(endpoint) || null;
  }
}

module.exports = TrafficShieldClient;
