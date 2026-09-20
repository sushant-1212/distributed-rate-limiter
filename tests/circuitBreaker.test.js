const test = require('node:test');
const assert = require('node:assert');
const { CircuitBreaker } = require('../src/core/circuitBreaker');

test('CircuitBreaker: opens after failure threshold and uses local fallback', () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 1000 });

  assert.strictEqual(cb.isOpen(), false);

  cb.recordFailure(new Error('Connection timeout'));
  cb.recordFailure(new Error('Connection timeout'));
  assert.strictEqual(cb.isOpen(), false);

  cb.recordFailure(new Error('Connection timeout'));
  assert.strictEqual(cb.isOpen(), true, 'Circuit breaker should be OPEN after 3 failures');

  // Fallback check functions locally without throwing
  const fallback = cb.fallbackCheck('test_user', 1);
  assert.strictEqual(fallback.allowed, true);
  assert.strictEqual(fallback.source, 'CIRCUIT_BREAKER_FALLBACK');
});
