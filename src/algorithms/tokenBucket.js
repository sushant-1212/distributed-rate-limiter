/**
 * Distributed Token Bucket Algorithm.
 * Implements atomic token consumption and continuous fractional refilling.
 *
 * Stored as a Redis Hash: { tokens, timestamp }.
 */

const TOKEN_BUCKET_LUA = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local cost       = tonumber(ARGV[4]) or 1

local bucket = redis.call('HMGET', key, 'tokens', 'timestamp')
local tokens = tonumber(bucket[1])
local timestamp = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  timestamp = now
end

local elapsedSeconds = math.max(0, (now - timestamp) / 1000)
tokens = math.min(capacity, tokens + elapsedSeconds * refillRate)

local allowed = 0
local retryAfterMs = 0

if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  local needed = cost - tokens
  retryAfterMs = math.ceil((needed / refillRate) * 1000)
end

redis.call('HMSET', key, 'tokens', tokens, 'timestamp', now)
local ttlSeconds = math.max(60, math.ceil(capacity / refillRate * 2))
redis.call('EXPIRE', key, ttlSeconds)

local resetMs = 0
if tokens < capacity then
  resetMs = math.ceil(((capacity - tokens) / refillRate) * 1000)
end

return { allowed, tostring(tokens), resetMs, retryAfterMs }
`;

function registerTokenBucketCommand(redisClient) {
  if (typeof redisClient.defineCommand === 'function') {
    redisClient.defineCommand('tokenBucketLimit', {
      numberOfKeys: 1,
      lua: TOKEN_BUCKET_LUA,
    });
  }
}

/**
 * Checks and consumes tokens from a token bucket.
 * @param {object} redisClient
 * @param {string} key
 * @param {object} opts - { capacity, refillRate, cost }
 * @returns {Promise<{allowed: boolean, remaining: number, resetMs: number, retryAfterMs: number}>}
 */
async function checkTokenBucket(redisClient, key, opts = {}) {
  const capacity = opts.capacity ?? 10;
  const refillRate = opts.refillRate ?? 2;
  const cost = opts.cost ?? 1;
  const now = Date.now();

  registerTokenBucketCommand(redisClient);

  let result;
  if (typeof redisClient.tokenBucketLimit === 'function') {
    result = await redisClient.tokenBucketLimit(key, capacity, refillRate, now, cost);
  } else {
    result = await redisClient.eval(TOKEN_BUCKET_LUA, 1, key, capacity, refillRate, now, cost);
  }

  const [allowed, tokensLeftStr, resetMs, retryAfterMs] = result;
  const isAllowed = allowed === 1;

  return {
    allowed: isAllowed,
    remaining: Math.max(0, Math.floor(parseFloat(tokensLeftStr))),
    tokensLeft: parseFloat(tokensLeftStr),
    resetMs: Number(resetMs),
    retryAfterMs: isAllowed ? 0 : Number(retryAfterMs),
  };
}

module.exports = { checkTokenBucket, TOKEN_BUCKET_LUA };
