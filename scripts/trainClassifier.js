/**
 * Trains a small logistic regression classifier that scores a traffic
 * window as "genuine" (label 1) vs "attack" (label 0), using the same 3
 * features computed live in src/features.js:
 *   x1 = timingRegularity, x2 = sourceDiversity, x3 = endpointDiversity
 *
 * There's no public labeled dataset for "flash sale vs bot attack" traffic,
 * so we generate synthetic feature vectors from the same generative
 * assumptions used in scripts/simulateTraffic.js (genuine traffic is
 * irregular/diverse, attack traffic is regular/concentrated), add noise,
 * and train on that. This is a legitimate and common approach when
 * bootstrapping a classifier before you have real production data --
 * document it as such if you present this project.
 *
 * Run: npm run train
 * Output: models/weights.json
 */

const fs = require('fs');
const path = require('path');

function randn() {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function generateDataset(n) {
  const X = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const isGenuine = Math.random() < 0.5;
    let timingRegularity, sourceDiversity, endpointDiversity;
    if (isGenuine) {
      timingRegularity = clamp01(0.65 + randn() * 0.15); // irregular clicks
      sourceDiversity = clamp01(0.7 + randn() * 0.15); // many different users
      endpointDiversity = clamp01(0.6 + randn() * 0.18); // browse many pages
    } else {
      timingRegularity = clamp01(0.15 + randn() * 0.12); // near-fixed intervals
      sourceDiversity = clamp01(0.12 + randn() * 0.12); // few scripted sources
      endpointDiversity = clamp01(0.1 + randn() * 0.1); // hammer one endpoint
    }
    X.push([timingRegularity, sourceDiversity, endpointDiversity]);
    y.push(isGenuine ? 1 : 0);
  }
  return { X, y };
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function trainLogisticRegression(X, y, { epochs = 2000, lr = 0.5 } = {}) {
  let w = [0, 0, 0];
  let b = 0;
  const n = X.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = [0, 0, 0];
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const z = w[0] * X[i][0] + w[1] * X[i][1] + w[2] * X[i][2] + b;
      const pred = sigmoid(z);
      const error = pred - y[i];
      gradW[0] += error * X[i][0];
      gradW[1] += error * X[i][1];
      gradW[2] += error * X[i][2];
      gradB += error;
    }

    w[0] -= (lr * gradW[0]) / n;
    w[1] -= (lr * gradW[1]) / n;
    w[2] -= (lr * gradW[2]) / n;
    b -= (lr * gradB) / n;
  }

  return { w, b };
}

function evaluate(X, y, w, b) {
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const z = w[0] * X[i][0] + w[1] * X[i][1] + w[2] * X[i][2] + b;
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct += 1;
  }
  return correct / X.length;
}

function main() {
  const train = generateDataset(4000);
  const test = generateDataset(1000);

  const { w, b } = trainLogisticRegression(train.X, train.y);
  const trainAcc = evaluate(train.X, train.y, w, b);
  const testAcc = evaluate(test.X, test.y, w, b);

  const weights = {
    features: ['timingRegularity', 'sourceDiversity', 'endpointDiversity'],
    w,
    b,
    trainedAt: new Date().toISOString(),
    trainAccuracy: Number(trainAcc.toFixed(4)),
    testAccuracy: Number(testAcc.toFixed(4)),
    note: 'Logistic regression trained on synthetic traffic features. See scripts/trainClassifier.js for the generative assumptions.',
  };

  const outPath = path.join(__dirname, '..', 'models', 'weights.json');
  fs.writeFileSync(outPath, JSON.stringify(weights, null, 2));

  console.log(`Trained logistic regression classifier`);
  console.log(`  train accuracy: ${(trainAcc * 100).toFixed(2)}%`);
  console.log(`  test accuracy:  ${(testAcc * 100).toFixed(2)}%`);
  console.log(`  weights saved to ${outPath}`);
}

main();
