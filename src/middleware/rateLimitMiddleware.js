/**
 * Express Middleware for Industrial Rate Limiting.
 * Attaches standard IETF RFC 6585 rate limiting headers.
 */

const rateLimiter = require('../rateLimiter');
const concurrencyLimiter = require('../core/concurrencyLimiter');
const powChallenge = require('../security/powChallenge');
const bufferedThrottleQueue = require('../queues/bufferedThrottleQueue');

function rateLimitMiddleware(optionsOverride = {}) {
  return async (req, res, next) => {
    const startHrTime = process.hrtime.bigint();

    // 1. Adaptive Concurrency Limiting (Netflix TCP Vegas / Little's Law)
    const slot = concurrencyLimiter.acquire();
    if (!slot.allowed) {
      return res.status(503).json({
        error: 'service_overloaded',
        message: 'Adaptive concurrency limit exceeded. Downstream system is under load.',
        inFlight: slot.inFlight,
        currentLimit: slot.currentLimit,
      });
    }

    // Ensure slot is released and RTT is reported when response finishes
    let released = false;
    const releaseSlot = () => {
      if (!released) {
        released = true;
        const endHrTime = process.hrtime.bigint();
        const rttMs = Number(endHrTime - startHrTime) / 1000000;
        concurrencyLimiter.release(rttMs);
      }
    };
    res.on('finish', releaseSlot);
    res.on('close', releaseSlot);

    try {
      const sourceId = req.get('x-api-key') || req.get('x-user-id') || req.ip || 'anonymous';

      // 2. Cryptographic Proof-of-Work (PoW) Bypass Check
      const powSolution = req.get('x-pow-solution');
      if (powSolution && powChallenge.verifySolution(sourceId, powSolution)) {
        res.set('X-PoW-Verified', 'true');
        return next();
      }

      const result = await rateLimiter.checkLimit(req, optionsOverride);
      const policy = result.policy;

      const resetSeconds = Math.max(1, Math.ceil((result.resetMs || 1000) / 1000));
      const retryAfterSeconds = Math.max(1, Math.ceil((result.retryAfterMs || 1000) / 1000));

      // Standard IETF RFC Headers
      res.set('RateLimit-Limit', String(policy.limit || policy.capacity));
      res.set('RateLimit-Remaining', String(result.remaining));
      res.set('RateLimit-Reset', String(resetSeconds));
      res.set('RateLimit-Policy', `${policy.limit || policy.capacity};w=${Math.round((policy.periodMs || 60000) / 1000)}`);
      res.set('X-RateLimit-Tier', result.tier);
      res.set('X-RateLimit-Source', result.source || 'L2_REDIS');

      if (!result.allowed) {
        // 3. Buffered Queueing (Zero-Data-Loss Mode) for webhooks or queued requests
        if (req.get('x-throttle-policy') === 'queue' || req.path.includes('/webhooks')) {
          const queueRes = await bufferedThrottleQueue.enqueue({
            sourceId,
            endpoint: req.path,
            body: req.body,
            headers: req.headers,
          });

          return res.status(202).json({
            status: 'buffered',
            message: 'Request buffered into distributed queue rather than dropped.',
            queueDepth: queueRes.queueDepth,
          });
        }

        res.set('Retry-After', String(retryAfterSeconds));

        // Attach PoW challenge nonce so client can solve and unblock
        const challenge = powChallenge.createChallenge(sourceId);

        return res.status(429).json({
          error: 'too_many_requests',
          message: result.reason === 'blacklisted'
            ? 'Source identifier is administratively blacklisted.'
            : 'Rate limit quota exceeded. Please retry later.',
          tier: result.tier,
          retryAfterSeconds,
          policy: `${policy.limit} requests per ${Math.round((policy.periodMs || 60000) / 1000)}s`,
          engineSource: result.source,
          powChallenge: challenge,
        });
      }

      next();
    } catch (err) {
      console.error('[RateLimitMiddleware] Unexpected fatal error:', err);
      next();
    }
  };
}

module.exports = rateLimitMiddleware;
