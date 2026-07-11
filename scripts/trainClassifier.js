const fs = require('fs');
const path = require('path');
const { buildForest, anomalyScore } = require('../src/isolationForest');

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function genuineSample() {
  return [
    clamp01(0.65 + randn() * 0.15),
    clamp01(0.7 + randn() * 0.15),
    clamp01(0.6 + randn() * 0.18),
  ];
}

function attackSample() {
  return [
    clamp01(0.15 + randn() * 0.12),
    clamp01(0.12 + randn() * 0.12),
    clamp01(0.1 + randn() * 0.1),
  ];
}

function generateLabeledSet(n) {
  const X = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const isGenuine = Math.random() < 0.5;
    X.push(isGenuine ? genuineSample() : attackSample());
    y.push(isGenuine ? 1 : 0);
  }
  return { X: X, y: y };
}

function percentile(sortedArr, p) {
  const idx = clamp01(p) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function calibrate(genuineScores, attackScores) {
  const gSorted = genuineScores.slice().sort(function(a, b) { return a - b; });
  const aSorted = attackScores.slice().sort(function(a, b) { return a - b; });
  const lo = percentile(gSorted, 0.25);
  const hi = percentile(aSorted, 0.75);
  return { lo: lo, hi: Math.max(hi, lo + 1e-6) };
}

function toGenuineProbability(rawScore, calibration) {
  const normalized = clamp01((rawScore - calibration.lo) / (calibration.hi - calibration.lo));
  return 1 - normalized;
}

function evaluate(forest, calibration, X, y) {
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const raw = anomalyScore(forest, X[i]);
    const genuineProbability = toGenuineProbability(raw, calibration);
    const pred = genuineProbability >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct += 1;
  }
  return correct / X.length;
}

function main() {
  const trainGenuine = Array.from({ length: 3000 }, genuineSample);
  const forest = buildForest(trainGenuine, { numTrees: 120, sampleSize: 256 });

  const calibrationSet = generateLabeledSet(1000);
  const genuineCalibScores = calibrationSet.X
    .filter(function(_, i) { return calibrationSet.y[i] === 1; })
    .map(function(row) { return anomalyScore(forest, row); });
  const attackCalibScores = calibrationSet.X
    .filter(function(_, i) { return calibrationSet.y[i] === 0; })
    .map(function(row) { return anomalyScore(forest, row); });
  const calibration = calibrate(genuineCalibScores, attackCalibScores);

  const testSet = generateLabeledSet(1000);
  const testAcc = evaluate(forest, calibration, testSet.X, testSet.y);
  const trainSetForAcc = generateLabeledSet(1000);
  const trainAcc = evaluate(forest, calibration, trainSetForAcc.X, trainSetForAcc.y);

  const model = {
    type: 'isolation_forest',
    features: ['timingRegularity', 'sourceDiversity', 'endpointDiversity'],
    forest: forest,
    calibration: calibration,
    trainedAt: new Date().toISOString(),
    trainAccuracy: Number(trainAcc.toFixed(4)),
    testAccuracy: Number(testAcc.toFixed(4)),
    note: 'Isolation forest trained ONLY on synthetic genuine-traffic feature vectors (no attack examples at train time). Labeled synthetic data was used solely to calibrate the raw anomaly score into a genuineProbability and to report accuracy above.',
  };

  const outPath = path.join(__dirname, '..', 'models', 'weights.json');
  fs.writeFileSync(outPath, JSON.stringify(model, null, 2));

  console.log('Trained isolation forest anomaly detector');
  console.log('  trees: ' + forest.trees.length + ', sampleSize: ' + forest.sampleSize + ', maxDepth: ' + forest.maxDepth);
  console.log('  train accuracy: ' + (trainAcc * 100).toFixed(2) + '%');
  console.log('  test accuracy:  ' + (testAcc * 100).toFixed(2) + '%');
  console.log('  model saved to ' + outPath);
}

main();
