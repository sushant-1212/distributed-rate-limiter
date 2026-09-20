/**
 * Cryptographic Proof-of-Work (PoW) Challenge (Hashcash / Anti-Bot Pattern).
 *
 * Imposes CPU-bound cryptographic puzzles on suspected bots.
 * Fast to verify O(1) on server, costly to compute O(2^d) for high-frequency scrapers.
 */

const crypto = require('crypto');

const SECRET_KEY = process.env.POW_SECRET || 'traffic-shield-pow-secret-key-2026';

class PoWChallenge {
  constructor(opts = {}) {
    this.defaultDifficulty = opts.defaultDifficulty || 3; // '000' prefix
    this.challengeTtlMs = opts.challengeTtlMs || 60000; // 1 minute validity
  }

  /**
   * Generates a tamper-proof signed challenge.
   */
  createChallenge(sourceId, difficulty = this.defaultDifficulty) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const payload = `${sourceId}:${nonce}:${timestamp}:${difficulty}`;
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');

    return {
      nonce,
      timestamp,
      difficulty,
      signature,
      prefix: '0'.repeat(difficulty),
    };
  }

  /**
   * Verifies a client-submitted PoW solution.
   * @param {string} sourceId
   * @param {string} solutionString - formatted as "nonce:suffix:timestamp:difficulty:signature"
   */
  verifySolution(sourceId, solutionString) {
    if (!solutionString) return false;

    const parts = solutionString.split(':');
    if (parts.length !== 5) return false;

    const [nonce, suffix, timestampStr, difficultyStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    const difficulty = parseInt(difficultyStr, 10);

    // Check expiration
    if (Date.now() - timestamp > this.challengeTtlMs) {
      return false;
    }

    // Verify HMAC signature to prevent challenge tampering
    const payload = `${sourceId}:${nonce}:${timestamp}:${difficulty}`;
    const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    if (expectedSig !== signature) {
      return false;
    }

    // Verify hash condition: SHA256(nonce + suffix) starts with '0' * difficulty
    const targetPrefix = '0'.repeat(difficulty);
    const hash = crypto.createHash('sha256').update(nonce + suffix).digest('hex');

    return hash.startsWith(targetPrefix);
  }

  /**
   * Helper for clients/tests to solve the challenge.
   */
  solve(challenge) {
    const targetPrefix = '0'.repeat(challenge.difficulty);
    let suffix = 0;

    while (true) {
      const hash = crypto.createHash('sha256').update(challenge.nonce + suffix).digest('hex');
      if (hash.startsWith(targetPrefix)) {
        return `${challenge.nonce}:${suffix}:${challenge.timestamp}:${challenge.difficulty}:${challenge.signature}`;
      }
      suffix++;
    }
  }
}

module.exports = new PoWChallenge();
module.exports.PoWChallenge = PoWChallenge;
