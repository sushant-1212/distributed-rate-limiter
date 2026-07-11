const fs = require('fs');
const path = require('path');
const { extractFeatures } = require('./features');

const WEIGHTS_PATH = path.join(__dirname, '..', 'models', 'weights.json');

let weights = null;
function loadWeights() {
  if (!fs.existsSync(WEIGHTS_PATH)) {
    throw new Error('No trained classifier found. Run `npm run train` first.');
  }
  weights = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
  return weights;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Score a set of recent request events. Returns a genuineness probability
 * (0..1) plus the raw features, so the caller (server.js / dashboard) can
 * show *why* the model decided what it decided.
 */
function classify(events) {
  if (!weights) loadWeights();
  const f = extractFeatures(events);
  const { w, b } = weights;
  const z = w[0] * f.timingRegularity + w[1] * f.sourceDiversity + w[2] * f.endpointDiversity + b;
  const genuineProbability = sigmoid(z);

  let verdict = 'ambiguous';
  if (f.count < 5) verdict = 'monitoring';
  else if (genuineProbability >= 0.6) verdict = 'genuine_surge';
  else if (genuineProbability <= 0.35) verdict = 'attack_detected';

  return {
    genuineProbability,
    verdict,
    features: f,
  };
}

module.exports = { classify, loadWeights };
