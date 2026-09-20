/**
 * Real Traffic Simulator for Traffic Shield v2.
 *
 * Fires real concurrent HTTP requests against the gateway to demonstrate:
 *  - High-throughput multi-user browsing (200 OK)
 *  - Rate-limiting quota exhaustion (429 Too Many Requests)
 *  - Dynamic L1/L2 cache leasing movements on the live dashboard.
 *
 * Flexible usage (any argument order):
 *   node scripts/simulateTraffic.js
 *   node scripts/simulateTraffic.js https://your-app.onrender.com
 *   node scripts/simulateTraffic.js mixed 30 https://your-app.onrender.com
 */

const args = process.argv.slice(2);
let BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
let mode = 'mixed';
let duration = 25 * 1000;

for (const arg of args) {
  if (arg.startsWith('http://') || arg.startsWith('https://')) {
    BASE_URL = arg.replace(/\/$/, '');
  } else if (!isNaN(Number(arg))) {
    duration = Number(arg) * 1000;
  } else if (['mixed', 'attack', 'flashsale', 'normal', 'surge'].includes(arg.toLowerCase())) {
    mode = arg.toLowerCase();
  }
}

const GENUINE_ENDPOINTS = [
  '/api/v1/products',
  '/api/v1/search',
  '/api/v1/checkout',
  '/api/v1/ai-generate',
];

const API_KEYS = ['key-demo-free', 'key-demo-pro', 'key-demo-ent', null];
const ATTACKER_IDS = ['botnet_worker_1', 'botnet_worker_2', 'credential_stuffing_bot'];

const genuinePool = Array.from({ length: 60 }, (_, i) => `user_${i + 1}`);

function randomGenuineRequest() {
  const sourceId = genuinePool[Math.floor(Math.random() * genuinePool.length)];
  const endpoint = GENUINE_ENDPOINTS[Math.floor(Math.random() * GENUINE_ENDPOINTS.length)];
  const apiKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
  return { sourceId, endpoint, apiKey };
}

function attackerRequest() {
  const sourceId = ATTACKER_IDS[Math.floor(Math.random() * ATTACKER_IDS.length)];
  return { sourceId, endpoint: '/api/v1/ai-generate', apiKey: null };
}

async function fire(reqObj) {
  try {
    const headers = { 'x-user-id': reqObj.sourceId };
    if (reqObj.apiKey) headers['x-api-key'] = reqObj.apiKey;

    const res = await fetch(`${BASE_URL}${reqObj.endpoint}`, {
      method: reqObj.endpoint.includes('checkout') || reqObj.endpoint.includes('generate') ? 'POST' : 'GET',
      headers,
    });
    return res.status;
  } catch (err) {
    return 'ERR';
  }
}

async function checkConnection() {
  try {
    const check = await fetch(`${BASE_URL}/health`);
    if (!check.ok && check.status !== 503) {
      throw new Error(`Server returned HTTP ${check.status}`);
    }
    return true;
  } catch (err) {
    console.error(`\n❌ Could not connect to gateway at: ${BASE_URL}`);
    console.error(`   Error details: ${err.message}\n`);

    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')) {
      console.error(`👉 Is your local server running?`);
      console.error(`   Start your server in another terminal by running:`);
      console.error(`   npm start\n`);
      console.error(`👉 Or if you want to test your live Render deployment, pass your URL:`);
      console.error(`   node scripts/simulateTraffic.js https://your-app-name.onrender.com\n`);
    } else {
      console.error(`👉 If this is a free-tier Render deployment, it may be sleeping.`);
      console.error(`   Open ${BASE_URL} in your browser once to wake it up, then re-run.\n`);
    }
    process.exit(1);
  }
}

async function run() {
  console.log(`Connecting to ${BASE_URL}...`);
  await checkConnection();

  console.log(`\n======================================================`);
  console.log(` Traffic Shield Real-Traffic Simulator`);
  console.log(` Target Gateway: ${BASE_URL}`);
  console.log(` Mode:           ${mode}`);
  console.log(` Duration:       ${duration / 1000} seconds`);
  console.log(`======================================================\n`);
  console.log(`Connected! Sending live traffic now. Check your dashboard.\n`);

  const start = Date.now();
  let totalSent = 0;
  let allowed = 0;
  let throttled = 0;

  const tick = async () => {
    if (Date.now() - start > duration) {
      console.log(`\n\nSimulation complete!`);
      console.log(`Total Requests: ${totalSent}`);
      console.log(`Allowed (200):  ${allowed}`);
      console.log(`Throttled (429): ${throttled}\n`);
      process.exit(0);
    }

    const batch = [];
    const batchSize = mode === 'attack' ? 12 : mode === 'mixed' ? 8 : 5;

    for (let i = 0; i < batchSize; i++) {
      let req;
      if (mode === 'attack') req = attackerRequest();
      else if (mode === 'flashsale') req = randomGenuineRequest();
      else req = Math.random() < 0.65 ? randomGenuineRequest() : attackerRequest();

      batch.push(
        fire(req).then((status) => {
          totalSent++;
          if (status === 200 || status === 202) allowed++;
          else if (status === 429) throttled++;
          process.stdout.write(status === 200 ? '.' : status === 429 ? 'X' : '!');
        })
      );
    }

    await Promise.all(batch);

    const delay = mode === 'attack' ? 50 : 100 + Math.random() * 250;
    setTimeout(tick, delay);
  };

  tick();
}

run();
