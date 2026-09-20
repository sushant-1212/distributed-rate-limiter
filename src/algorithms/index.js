const { checkGcra } = require('./gcra');
const { checkTokenBucket } = require('./tokenBucket');
const { checkSlidingWindow } = require('./slidingWindowCounter');

const ALGORITHMS = {
  GCRA: 'gcra',
  TOKEN_BUCKET: 'token_bucket',
  SLIDING_WINDOW: 'sliding_window',
};

/**
 * Execute rate limit check using the designated algorithm.
 * @param {string} algorithm - 'gcra' | 'token_bucket' | 'sliding_window'
 * @param {object} redisClient
 * @param {string} key
 * @param {object} options
 */
async function checkRateLimit(algorithm, redisClient, key, options) {
  switch (algorithm) {
    case ALGORITHMS.GCRA:
      return checkGcra(redisClient, `ratelimit:gcra:${key}`, options);

    case ALGORITHMS.SLIDING_WINDOW:
      return checkSlidingWindow(redisClient, `ratelimit:swc:${key}`, options);

    case ALGORITHMS.TOKEN_BUCKET:
    default:
      return checkTokenBucket(redisClient, `ratelimit:tb:${key}`, options);
  }
}

module.exports = {
  checkRateLimit,
  ALGORITHMS,
  checkGcra,
  checkTokenBucket,
  checkSlidingWindow,
};
