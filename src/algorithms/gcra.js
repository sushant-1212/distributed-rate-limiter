/**
 * Generic Cell Rate Algorithm (GCRA) - Leaky Bucket as a Meter.
 * Standardized in ATM networks and used by high-throughput systems (Stripe, Heroku).
 *
 * Employs a single key: Theoretical Arrival Time (TAT).
 * Eliminates burst-at-boundary vulnerabilities while requiring minimal Redis memory.
 */

const GCRA_LUA = `
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local limit     = tonumber(ARGV[2])
local periodMs  = tonumber(ARGV[3])
local cost      = tonumber(ARGV[4]) or 1

local emissionInterval = periodMs / limit
local burstTolerance   = periodMs

local tat = redis.call('GET', key)
local currentTat = now

if tat then
  currentTat = tonumber(tat)
  if currentTat < now then
    currentTat = now
  end
end

local increment = cost * emissionInterval
local newTat    = currentTat + increment
local allowAt   = newTat - burstTolerance

if now >= allowAt then
  local ttlMs = math.max(1000, math.ceil(newTat - now + burstTolerance))
  redis.call('SET', key, newTat, 'PX', ttlMs)
  
  -- Calculate remaining capacity
  local remaining = math.max(0, math.floor((now + burstTolerance - newTat) / emissionInterval))
  local resetMs   = math.max(0, math.ceil(newTat - now))
  return { 1, remaining, resetMs }
else
  local retryAfterMs = math.ceil(allowAt - now)
  local remaining = 0
  return { 0, remaining, retryAfterMs }
end
`;

function registerGcraCommand(redisClient) {
  if (typeof redisClient.defineCommand === 'function') {
    redisClient.defineCommand('gcraLimit', {
      numberOfKeys: 1,
      lua: GCRA_LUA,
    });
  }
}

/**
 * Executes a GCRA rate check.
 * @param {object} redisClient - ioredis or mock instance
 * @param {string} key - Redis key, e.g. "rate:gcra:{tenant}:{sourceId}"
 * @param {object} opts - { limit, periodMs, cost }
 * @returns {Promise<{allowed: boolean, remaining: number, resetMs: number, retryAfterMs: number}>}
 */
async function checkGcra(redisClient, key, opts = {}) {
  const limit = opts.limit ?? 60;
  const periodMs = opts.periodMs ?? 60000;
  const cost = opts.cost ?? 1;
  const now = Date.now();

  registerGcraCommand(redisClient);

  let result;
  if (typeof redisClient.gcraLimit === 'function') {
    result = await redisClient.gcraLimit(key, now, limit, periodMs, cost);
  } else {
    result = await redisClient.eval(GCRA_LUA, 1, key, now, limit, periodMs, cost);
  }

  const [allowed, remaining, waitMs] = result;
  const isAllowed = allowed === 1;

  return {
    allowed: isAllowed,
    remaining: Number(remaining),
    resetMs: isAllowed ? Number(waitMs) : 0,
    retryAfterMs: isAllowed ? 0 : Number(waitMs),
  };
}

module.exports = { checkGcra, GCRA_LUA };
