/**
 * Multi-Tenant Policy Engine.
 * Manages tiers, API key lookup, route cost weighting, and dynamic rule overrides.
 */

const DEFAULT_TIERS = {
  anonymous: {
    name: 'Anonymous',
    limit: 30,
    periodMs: 60000,
    capacity: 10,
    refillRate: 0.5,
    algorithm: 'token_bucket',
  },
  free: {
    name: 'Free Developer',
    limit: 100,
    periodMs: 60000,
    capacity: 20,
    refillRate: 1.6,
    algorithm: 'gcra',
  },
  pro: {
    name: 'Pro Tier',
    limit: 1000,
    periodMs: 60000,
    capacity: 100,
    refillRate: 16.6,
    algorithm: 'gcra',
  },
  enterprise: {
    name: 'Enterprise Tier',
    limit: 10000,
    periodMs: 60000,
    capacity: 500,
    refillRate: 166.0,
    algorithm: 'gcra',
  },
};

const DEFAULT_ROUTE_COSTS = {
  '/api/v1/health': 1,
  '/api/v1/products': 1,
  '/api/v1/search': 2,
  '/api/v1/checkout': 5,
  '/api/v1/ai-generate': 10,
};

// Known demo API keys mapping to tiers
const KNOWN_API_KEYS = {
  'key-demo-free': { tier: 'free', tenantId: 'dev_user_101' },
  'key-demo-pro': { tier: 'pro', tenantId: 'pro_corp_404' },
  'key-demo-ent': { tier: 'enterprise', tenantId: 'enterprise_bank_999' },
};

class PolicyEngine {
  constructor(opts = {}) {
    this.tiers = { ...DEFAULT_TIERS, ...opts.tiers };
    this.routeCosts = { ...DEFAULT_ROUTE_COSTS, ...opts.routeCosts };
    this.apiKeys = { ...KNOWN_API_KEYS, ...opts.apiKeys };
    this.penalties = new Map(); // key -> { multiplier, expiresAt, reason }
    this.blacklist = new Set(); // set of banned source identifiers
  }

  /**
   * Resolves client identity, tenant tier, and policy constraints.
   */
  resolveRequest(reqOrSourceId) {
    let apiKey = null;
    let customUser = null;
    let ip = '127.0.0.1';
    let path = '/';

    if (typeof reqOrSourceId === 'string') {
      customUser = reqOrSourceId;
    } else if (reqOrSourceId && typeof reqOrSourceId.get === 'function') {
      apiKey = reqOrSourceId.get('x-api-key');
      customUser = reqOrSourceId.get('x-user-id');
      ip = reqOrSourceId.ip || reqOrSourceId.connection?.remoteAddress || '127.0.0.1';
      path = reqOrSourceId.path || '/';
    } else if (reqOrSourceId && typeof reqOrSourceId === 'object') {
      apiKey = reqOrSourceId.apiKey || (reqOrSourceId.headers && reqOrSourceId.headers['x-api-key']);
      customUser = reqOrSourceId.userId || (reqOrSourceId.headers && reqOrSourceId.headers['x-user-id']);
      ip = reqOrSourceId.ip || '127.0.0.1';
      path = reqOrSourceId.path || '/';
    }

    let tenantId;
    let tierName;

    if (apiKey && this.apiKeys[apiKey]) {
      tierName = this.apiKeys[apiKey].tier;
      tenantId = this.apiKeys[apiKey].tenantId;
    } else if (customUser) {
      tierName = 'free';
      tenantId = customUser;
    } else {
      tierName = 'anonymous';
      tenantId = `ip:${ip}`;
    }

    const tier = this.tiers[tierName] || this.tiers.anonymous;
    const cost = this.getRouteCost(path);

    // Check Blacklist
    const isBlacklisted = this.blacklist.has(tenantId) || this.blacklist.has(ip);

    // Check dynamic penalty
    const penalty = this.getPenalty(tenantId) || this.getPenalty(ip);

    let capacity = tier.capacity;
    let refillRate = tier.refillRate;
    let limit = tier.limit;

    if (penalty) {
      capacity = Math.max(1, Math.floor(capacity * penalty.multiplier));
      refillRate = Math.max(0.1, refillRate * penalty.multiplier);
      limit = Math.max(1, Math.floor(limit * penalty.multiplier));
    }

    return {
      tenantId,
      tierName,
      tier,
      cost,
      capacity,
      refillRate,
      limit,
      periodMs: tier.periodMs,
      algorithm: tier.algorithm,
      isBlacklisted,
      penalty: penalty ? penalty.reason : null,
    };
  }

  getRouteCost(path) {
    for (const [routePrefix, cost] of Object.entries(this.routeCosts)) {
      if (path.startsWith(routePrefix)) return cost;
    }
    return 1;
  }

  setPenalty(sourceId, multiplier, durationMs, reason = 'automated_throttle') {
    this.penalties.set(sourceId, {
      multiplier,
      expiresAt: Date.now() + durationMs,
      reason,
    });
  }

  getPenalty(sourceId) {
    const p = this.penalties.get(sourceId);
    if (!p) return null;
    if (Date.now() > p.expiresAt) {
      this.penalties.delete(sourceId);
      return null;
    }
    return p;
  }

  addToBlacklist(sourceId) {
    this.blacklist.add(sourceId);
  }

  removeFromBlacklist(sourceId) {
    this.blacklist.delete(sourceId);
  }

  updateTier(tierName, settings) {
    if (this.tiers[tierName]) {
      this.tiers[tierName] = { ...this.tiers[tierName], ...settings };
    }
  }

  registerApiKey(apiKey, tenantId, tier) {
    this.apiKeys[apiKey] = { tenantId, tier };
  }

  getOverview() {
    return {
      tiers: this.tiers,
      routeCosts: this.routeCosts,
      activePenaltiesCount: this.penalties.size,
      blacklistCount: this.blacklist.size,
      blacklistedSources: [...this.blacklist],
    };
  }
}

module.exports = new PolicyEngine();
module.exports.PolicyEngine = PolicyEngine;
