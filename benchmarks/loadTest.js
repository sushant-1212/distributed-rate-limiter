/**
 * High-Throughput Rate Limiting Benchmark Suite using Autocannon.
 *
 * Measures:
 *  - Requests per second (RPS)
 *  - Latency percentiles: p50, p90, p99
 *  - L1 Cache vs Centralized Redis throughput comparison
 */

const autocannon = require('autocannon');
const http = require('http');

async function runBenchmark(title, options) {
  console.log(`\n======================================================`);
  console.log(` Starting Benchmark: ${title}`);
  console.log(` Connections: ${options.connections}, Duration: ${options.duration}s`);
  console.log(`======================================================`);

  const result = await autocannon(options);

  console.log(`\n--- Results for ${title} ---`);
  console.log(` Throughput (RPS):`);
  console.log(`   Average: ${result.requests.average.toFixed(0)} req/sec`);
  console.log(`   Max:     ${result.requests.max} req/sec`);
  console.log(` Latency (ms):`);
  console.log(`   p50:     ${result.latency.p50} ms`);
  console.log(`   p90:     ${result.latency.p90} ms`);
  console.log(`   p99:     ${result.latency.p99} ms`);
  console.log(` Total Requests: ${result.requests.total}`);
  console.log(` 2xx Responses:  ${result['2xx']}`);
  console.log(` 429 Throttled:  ${result['4xx']}`);

  return result;
}

async function main() {
  const targetPort = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${targetPort}`;

  // Quick connectivity check
  await new Promise((resolve, reject) => {
    http.get(`${baseUrl}/health`, (res) => {
      if (res.statusCode === 200) resolve();
      else reject(new Error(`Server returned ${res.statusCode}`));
    }).on('error', (err) => {
      console.error(`Please ensure the server is running on ${baseUrl} before benchmarking.`);
      console.error(`Run 'npm run dev' in another terminal.`);
      process.exit(1);
    });
  });

  // Benchmark 1: Anonymous Tier (Direct GCRA/Token Bucket)
  await runBenchmark('Direct Tier (Standard API Key)', {
    url: `${baseUrl}/api/v1/products`,
    connections: 50,
    duration: 5,
    headers: {
      'x-api-key': 'key-demo-free',
    },
  });

  // Benchmark 2: Enterprise Tier (Hierarchical Two-Tier L1 Cache Lease)
  await runBenchmark('Hierarchical L1 Leased Tier (Enterprise Key)', {
    url: `${baseUrl}/api/v1/products`,
    connections: 50,
    duration: 5,
    headers: {
      'x-api-key': 'key-demo-ent',
    },
  });

  console.log(`\nAll benchmarks completed successfully!`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Benchmark suite encountered an error:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
