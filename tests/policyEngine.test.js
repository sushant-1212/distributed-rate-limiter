const test = require('node:test');
const assert = require('node:assert');
const { PolicyEngine } = require('../src/core/policyEngine');

test('PolicyEngine: resolves tier by API key', () => {
  const engine = new PolicyEngine();
  const req = {
    get: (header) => (header.toLowerCase() === 'x-api-key' ? 'key-demo-pro' : null),
    ip: '192.168.1.1',
    path: '/api/v1/products',
  };

  const resolved = engine.resolveRequest(req);
  assert.strictEqual(resolved.tierName, 'pro');
  assert.strictEqual(resolved.tenantId, 'pro_corp_404');
  assert.strictEqual(resolved.cost, 1);
});

test('PolicyEngine: applies route cost weighting', () => {
  const engine = new PolicyEngine();
  const req = {
    get: () => null,
    ip: '192.168.1.5',
    path: '/api/v1/checkout',
  };

  const resolved = engine.resolveRequest(req);
  assert.strictEqual(resolved.cost, 5, 'Checkout endpoint should have cost 5');
});

test('PolicyEngine: enforces administrative blacklist', () => {
  const engine = new PolicyEngine();
  engine.addToBlacklist('malicious_ip_666');

  const req = {
    get: () => null,
    ip: 'malicious_ip_666',
    path: '/api/v1/health',
  };

  const resolved = engine.resolveRequest(req);
  assert.strictEqual(resolved.isBlacklisted, true);
});
