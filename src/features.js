/**
 * Turns a list of recent request events into the 3 features described in
 * the project explainer:
 *   1. timingRegularity  - coefficient of variation of inter-arrival times
 *                           per source, averaged. Bots fire at near-fixed
 *                           intervals -> low CV. Humans are irregular -> high CV.
 *   2. sourceDiversity   - unique sources / total requests in the window.
 *   3. endpointDiversity - unique endpoints / total requests in the window.
 *
 * All three are normalized to roughly [0, 1] so they can be fed into the
 * logistic regression classifier alongside consistent weights.
 */

function extractFeatures(events) {
  if (events.length === 0) {
    return { timingRegularity: 0.5, sourceDiversity: 0.5, endpointDiversity: 0.5, count: 0 };
  }

  const bySource = new Map();
  for (const e of events) {
    if (!bySource.has(e.sourceId)) bySource.set(e.sourceId, []);
    bySource.get(e.sourceId).push(e.t);
  }

  let cvSum = 0;
  let cvCount = 0;
  for (const times of bySource.values()) {
    if (times.length < 3) continue;
    times.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean <= 0) continue;
    const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    const cv = Math.sqrt(variance) / mean;
    cvSum += cv;
    cvCount += 1;
  }
  const avgCV = cvCount > 0 ? cvSum / cvCount : 0.5;
  const timingRegularity = Math.max(0, Math.min(1, avgCV / 1.2)); // clamp/normalize

  const uniqueSources = new Set(events.map((e) => e.sourceId)).size;
  const sourceDiversity = Math.max(0, Math.min(1, (uniqueSources / events.length) * 2.2));

  const uniqueEndpoints = new Set(events.map((e) => e.endpoint)).size;
  const endpointDiversity = Math.max(0, Math.min(1, (uniqueEndpoints / events.length) * 2.4));

  return { timingRegularity, sourceDiversity, endpointDiversity, count: events.length };
}

module.exports = { extractFeatures };
