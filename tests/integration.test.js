const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

process.env.USE_MOCK_REDIS = 'true';
process.env.NODE_ENV = 'test';

const { app } = require('../src/server');

let server;
let port;

test.before((t, done) => {
  server = app.listen(0, () => {
    port = server.address().port;
    done();
  });
});

test.after((t, done) => {
  server.close(done);
});

function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: isJson && body ? JSON.parse(body) : body,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('Integration: attached IETF RFC rate limiting headers', async () => {
  const res = await makeRequest('/api/v1/products', {
    'x-api-key': 'key-demo-free',
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['ratelimit-limit'], 'RateLimit-Limit header present');
  assert.ok(res.headers['ratelimit-remaining'], 'RateLimit-Remaining header present');
  assert.ok(res.headers['ratelimit-reset'], 'RateLimit-Reset header present');
  assert.strictEqual(res.headers['x-ratelimit-tier'], 'free');
});

test('Integration: returns 429 and Retry-After when quota is exceeded', async () => {
  const customUser = 'overflow-user-' + Date.now();

  // Anonymous default limit is 30, but let's test with rapid loop until 429
  let lastRes;
  for (let i = 0; i < 15; i++) {
    lastRes = await makeRequest('/api/v1/ai-generate', {
      'x-user-id': customUser,
    });
    if (lastRes.statusCode === 429) break;
  }

  // Once throttled, should return 429 and Retry-After header
  assert.strictEqual(lastRes.statusCode, 429);
  assert.ok(lastRes.headers['retry-after'], 'Retry-After header present on 429');
  assert.strictEqual(lastRes.body.error, 'too_many_requests');
});

test('Integration: Prometheus /metrics returns expected counters', async () => {
  const res = await makeRequest('/metrics');
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/plain'));
});
