/**
 * Sliding Window Counter Algorithm (Cloudflare / Cloud Architecture approach).
 * Approximates a sliding window by weighting the previous window count with
 * current window elapsed time.
 *
 * Space complexity: O(1) memory per key.
 * Time complexity: O(1).
 */

const SLIDING_WINDOW_LUA = `
local keyPrefix   = KEYS[1]
local now         = tonumber(ARGV[1])
local limit       = tonumber(ARGV[2])
local windowMs    = tonumber(ARGV[3])
local cost        = tonumber(ARGV[4]) or 1

local currentBucket  = math.floor(now / windowMs)
local previousBucket = currentBucket - 1

local currentKey  = keyPrefix .. ":" .. currentBucket
local previousKey = keyPrefix .. ":" .. previousBucket

local currentCount  = tonumber(redis.call('GET', currentKey) or 0)
local previousCount = tonumber(redis.call('GET', previousKey) or 0)

local timeIntoCurrentWindow = now % windowMs
local previousWeight = 1 - (timeIntoCurrentWindow / windowMs)
local estimatedCount = (previousCount * previousWeight) + currentCount

local allowed = 0
local remaining = 0
local retryAfterMs = 0

if (estimatedCount + cost) <= limit then
  allowed = 1
  redis.call('INCRBY', currentKey, cost)
  redis.call('PEXPIRE', currentKey, windowMs * 2)
  remaining = math.max(0, math.floor(limit - (estimatedCount + cost)))
else
  allowed = 0
  remaining = 0
  retryAfterMs = math.max(1, windowMs - timeIntoCurrentWindow)
end

local resetMs = math.max(1, windowMs - timeIntoCurrentWindow)
return { allowed, remaining, resetMs, retryAfterMs }
`;

function registerSlidingWindowCommand(redisClient) {
  if (typeof redisClient.defineCommand === 'function') {
    redisClient.defineCommand('slidingWindowLimit', {
      numberOfKeys: 1,
      lua: SLIDING_WINDOW_LUA,
    });
  }
}

/**
 * Checks sliding window limit.
 * @param {object} redisClient
 * @param {string} keyPrefix - base key, e.g. "rate:swc:{sourceId}"
 * @param {object} opts - { limit, windowMs, cost }
 * @returns {Promise<{allowed: boolean, remaining: number, resetMs: number, retryAfterMs: number}>}
 */
async function checkSlidingWindow(redisClient, keyPrefix, opts = {}) {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60000;
  const cost = opts.cost ?? 1;
  const now = Date.now();

  registerSlidingWindowCommand(redisClient);

  let result;
  if (typeof redisClient.slidingWindowLimit === 'function') {
    result = await redisClient.slidingWindowLimit(keyPrefix, now, limit, windowMs, cost);
  } else {
    result = await redisClient.eval(SLIDING_WINDOW_LUA, 1, keyPrefix, now, limit, windowMs, cost);
  }

  const [allowed, remaining, resetMs, retryAfterMs] = result;
  const isAllowed = allowed === 1;

  return {
    allowed: isAllowed,
    remaining: Number(remaining),
    resetMs: Number(resetMs),
    retryAfterMs: isAllowed ? 0 : Number(retryAfterMs),
  };
}

module.exports = { checkSlidingWindow, SLIDING_WINDOW_LUA };
