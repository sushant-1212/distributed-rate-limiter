const fs = require('fs');
const path = require('path');
const { extractFeatures } = require('./features');
const { anomalyScore } = require('./isolationForest');

const MODEL_PATH = path.join(__dirname, '..', 'models', 'weights.json');

let model = null;
function loadModel() {
  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error('No trained model found. Run `npm run train` first.');
  }
  model = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  return model;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function classify(events) {
  if (!model) loadModel();
  const f = extractFeatures(events);
  const row = [f.timingRegularity, f.sourceDiversity, f.endpointDiversity];

  const raw = anomalyScore(model.forest, row);
  const lo = model.calibration.lo;
  const hi = model.calibration.hi;
  const normalizedAnomaly = clamp01((raw - lo) / (hi - lo));
  const genuineProbability = 1 - normalizedAnomaly;

  let verdict = 'ambiguous';
  if (f.count < 5) verdict = 'monitoring';
  else if (genuineProbability >= 0.6) verdict = 'genuine_surge';
  else if (genuineProbability <= 0.35) verdict = 'attack_detected';

  return {
    genuineProbability: genuineProbability,
    verdict: verdict,
    features: f,
    anomalyScore: raw,
  };
}

module.exports = { classify, loadModel };
