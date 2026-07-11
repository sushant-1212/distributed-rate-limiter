const EULER_GAMMA = 0.5772156649015329;

function c(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const harmonic = Math.log(n - 1) + EULER_GAMMA;
  return 2 * harmonic - (2 * (n - 1)) / n;
}

function sampleWithoutReplacement(data, size) {
  const pool = data.slice();
  const sample = [];
  const n = Math.min(size, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    sample.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return sample;
}

function buildTree(data, depth, maxDepth, numFeatures) {
  if (depth >= maxDepth || data.length <= 1) {
    return { type: 'leaf', size: data.length };
  }
  for (let attempt = 0; attempt < numFeatures; attempt++) {
    const feature = Math.floor(Math.random() * numFeatures);
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      if (row[feature] < min) min = row[feature];
      if (row[feature] > max) max = row[feature];
    }
    if (min === max) continue;
    const splitValue = min + Math.random() * (max - min);
    const left = [];
    const right = [];
    for (const row of data) {
      if (row[feature] < splitValue) left.push(row);
      else right.push(row);
    }
    if (left.length === 0 || right.length === 0) continue;
    return {
      type: 'node',
      feature,
      splitValue,
      left: buildTree(left, depth + 1, maxDepth, numFeatures),
      right: buildTree(right, depth + 1, maxDepth, numFeatures),
    };
  }
  return { type: 'leaf', size: data.length };
}

function buildForest(data, opts) {
  opts = opts || {};
  const numTrees = opts.numTrees || 100;
  const sampleSize = opts.sampleSize || 256;
  if (data.length === 0) throw new Error('buildForest: empty training data');
  const numFeatures = data[0].length;
  const effectiveSampleSize = Math.min(sampleSize, data.length);
  const maxDepth = Math.ceil(Math.log2(Math.max(effectiveSampleSize, 2)));
  const trees = [];
  for (let i = 0; i < numTrees; i++) {
    const sample = sampleWithoutReplacement(data, effectiveSampleSize);
    trees.push(buildTree(sample, 0, maxDepth, numFeatures));
  }
  return { trees, numFeatures, sampleSize: effectiveSampleSize, maxDepth };
}

function pathLength(row, node, depth) {
  if (node.type === 'leaf') return depth + c(node.size);
  if (row[node.feature] < node.splitValue) {
    return pathLength(row, node.left, depth + 1);
  }
  return pathLength(row, node.right, depth + 1);
}

function averagePathLength(forest, row) {
  let total = 0;
  for (const tree of forest.trees) {
    total += pathLength(row, tree, 0);
  }
  return total / forest.trees.length;
}

function anomalyScore(forest, row) {
  const avgPath = averagePathLength(forest, row);
  const normalizer = c(forest.sampleSize);
  if (normalizer === 0) return 0.5;
  return Math.pow(2, -avgPath / normalizer);
}

module.exports = { buildForest, anomalyScore, averagePathLength, c };
