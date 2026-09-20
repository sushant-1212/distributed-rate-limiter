const test = require('node:test');
const assert = require('node:assert');
const powChallenge = require('../src/security/powChallenge');

test('PoWChallenge: creates, solves, and verifies valid proof of work', () => {
  const sourceId = 'test-ip-1.2.3.4';
  const challenge = powChallenge.createChallenge(sourceId, 2); // difficulty 2 ('00') for quick test

  assert.ok(challenge.nonce);
  assert.strictEqual(challenge.difficulty, 2);

  // Solve the challenge
  const solution = powChallenge.solve(challenge);
  assert.ok(solution);

  // Verify solution
  const isValid = powChallenge.verifySolution(sourceId, solution);
  assert.strictEqual(isValid, true, 'Valid solution should be verified');
});

test('PoWChallenge: rejects tampered or mismatched solutions', () => {
  const sourceId = 'test-ip-1.2.3.4';
  const challenge = powChallenge.createChallenge(sourceId, 2);
  const solution = powChallenge.solve(challenge);

  // Mismatched IP / sourceId
  const isDiffSourceValid = powChallenge.verifySolution('different-ip-9.9.9.9', solution);
  assert.strictEqual(isDiffSourceValid, false);

  // Tampered solution string
  const isTamperedValid = powChallenge.verifySolution(sourceId, 'fake:999:nonce');
  assert.strictEqual(isTamperedValid, false);
});
