/**
 * Fires real HTTP requests at the running server to demo the rate limiter
 * and classifier. This is not a fake client-side animation -- it's actual
 * traffic hitting actual Express routes, going through the actual Redis
 * token buckets.
 *
 * Usage:
 *   node scripts/simulateTraffic.js flashsale [durationSeconds]
 *   node scripts/simulateTraffic.js attack     [durationSeconds]
 *   node scripts/simulateTraffic.js mixed      [durationSeconds]
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const mode = process.argv[2] || 'flashsale';
const duration = Number(process.argv[3] || 20) * 1000;

const GENUINE_ENDPOINTS = ['/api/home', '/api/product', '/api/search', '/api/cart', '/api/checkout'];
const ATTACKER_IDS = ['attacker-1', 'attacker-1', 'attacker-1']; // a couple of fixed scripted sources

const genuinePool = Array.from({ length: 80 }, (_, i) => `user-${i}`);

function randomGenuineRequest() {
  const sourceId = genuinePool[Math.floor(Math.random() * genuinePool.length)];
  const endpoint = GENUINE_ENDPOINTS[Math.floor(Math.random() * GENUINE_ENDPOINTS.length)];
  return { sourceId, endpoint };
}

function attackerRequest() {
  const sourceId = ATTACKER_IDS[Math.floor(Math.random() * ATTACKER_IDS.length)];
  return { sourceId, endpoint: '/api/login' };
}

async function fire(sourceId, endpoint) {
  try {
    const res = await fetch(BASE_URL + endpoint, { headers: { 'x-user-id': sourceId } });
    return res.status;
  } catch (err) {
    return 'ERR';
  }
}

async function run() {
  console.log(`Simulating "${mode}" traffic against ${BASE_URL} for ${duration / 1000}s...`);
  const start = Date.now();
  let sent = 0;

  const tick = async () => {
    if (Date.now() - start > duration) {
      console.log(`Done. Sent ${sent} requests.`);
      process.exit(0);
    }

    const batch = [];
    const batchSize = mode === 'attack' ? 8 : mode === 'mixed' ? 6 : 4;
    for (let i = 0; i < batchSize; i++) {
      let req;
      if (mode === 'flashsale') req = randomGenuineRequest();
      else if (mode === 'attack') req = attackerRequest();
      else req = Math.random() < 0.7 ? randomGenuineRequest() : attackerRequest();
      batch.push(fire(req.sourceId, req.endpoint));
      sent += 1;
    }
    await Promise.all(batch);

    // Attack traffic fires at a near-fixed interval (bot-like); genuine
    // traffic is jittered (human-like) -- this is exactly what the
    // classifier's "timing regularity" feature picks up on.
    const delay = mode === 'attack' ? 60 : 100 + Math.random() * 400;
    setTimeout(tick, delay);
  };

  tick();
}

run();
