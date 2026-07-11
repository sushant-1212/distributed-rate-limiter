const redis = require('./redisClient');

/**
 * Atomic token-bucket check-and-consume, executed inside Redis itself via a
 * Lua script (EVAL). Doing the read-modify-write as a single Lua script is
 * what makes this safe under concurrent requests hitting multiple app
 * server instances at once ("distributed" rate limiting) -- there is no
 * read-then-write race between Node processes because Redis executes the
 * whole script atomically.
 *
 * Bucket state per source is stored as a Redis hash: { tokens, timestamp }.
 *
 * KEYS[1]  bucket key, e.g. "bucket:1.2.3.4"
 * ARGV[1]  capacity (max tokens the bucket can hold)
 * ARGV[2]  refill rate (tokens added per second)
 * ARGV[3]  now (ms, epoch)
 * ARGV[4]  cost of this request in tokens (usually 1)
 */
const TOKEN_BUCKET_SCRIPT = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local cost       = tonumber(ARGV[4])

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
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'timestamp', now)
redis.call('EXPIRE', key, 3600)

return { allowed, tostring(tokens) }
`;

let scriptSha = null;

async function loadScript() {
  if (!scriptSha) {
    scriptSha = await redis.script('LOAD', TOKEN_BUCKET_SCRIPT);
  }
  return scriptSha;
}

/**
 * Check (and consume, if allowed) one request against a source's bucket.
 * @param {string} sourceId  identifier for the caller (IP, user id, API key...)
 * @param {object} opts      { capacity, refillRate, cost }
 * @returns {Promise<{allowed: boolean, tokensLeft: number}>}
 */
async function checkLimit(sourceId, opts = {}) {
  const capacity = opts.capacity ?? Number(process.env.DEFAULT_CAPACITY || 10);
  const refillRate = opts.refillRate ?? Number(process.env.DEFAULT_REFILL_RATE || 2);
  const cost = opts.cost ?? 1;
  const key = `bucket:${sourceId}`;
  const now = Date.now();

  const sha = await loadScript();
  let result;
  try {
    result = await redis.evalsha(sha, 1, key, capacity, refillRate, now, cost);
  } catch (err) {
    // Script cache can be flushed by an admin (SCRIPT FLUSH); reload once.
    if (String(err.message).includes('NOSCRIPT')) {
      scriptSha = null;
      const freshSha = await loadScript();
      result = await redis.evalsha(freshSha, 1, key, capacity, refillRate, now, cost);
    } else {
      throw err;
    }
  }

  const [allowed, tokensLeft] = result;
  return { allowed: allowed === 1, tokensLeft: parseFloat(tokensLeft) };
}

/** Read current bucket state without consuming a token (for dashboards). */
async function peekBucket(sourceId) {
  const key = `bucket:${sourceId}`;
  const bucket = await redis.hmget(key, 'tokens', 'timestamp');
  if (bucket[0] === null) return null;
  return { tokens: parseFloat(bucket[0]), timestamp: parseInt(bucket[1], 10) };
}

module.exports = { checkLimit, peekBucket };
