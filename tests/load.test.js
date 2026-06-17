/**
 * Load tests using autocannon.
 * Run: npm run test:load
 * Requires: npm install autocannon
 * Requires a running server: npm run dev (or deployed URL)
 */

const autocannon = require('autocannon');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

const COORDS = [
  { lat: 12.97, lng: 77.59 }, // Bangalore
  { lat: 19.07, lng: 72.87 }, // Mumbai
  { lat: 28.61, lng: 77.23 }, // Delhi
  { lat: 18.52, lng: 73.85 }, // Pune
  { lat: 13.08, lng: 80.27 }, // Chennai
  { lat: 17.38, lng: 78.47 }, // Hyderabad
  { lat: 22.57, lng: 88.36 }, // Kolkata
  { lat: 25.20, lng: 55.27 }, // Dubai
  { lat: 1.35,  lng: 103.82 }, // Singapore
  { lat: 51.50, lng: -0.12 },  // London
];

function run(opts) {
  return new Promise((resolve, reject) => {
    autocannon({ ...opts, setupClient: undefined }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function printReport(label, result) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`SCENARIO: ${label}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Requests/sec:  ${result.requests.average}`);
  console.log(`Latency p50:   ${result.latency.p50}ms`);
  console.log(`Latency p95:   ${result.latency.p95}ms`);
  console.log(`Latency p99:   ${result.latency.p99}ms`);
  console.log(`Total requests: ${result.requests.total}`);
  console.log(`Errors:        ${result.errors}`);
  console.log(`Timeouts:      ${result.timeouts}`);
  const successRate = ((result.requests.total - result.errors) / result.requests.total * 100).toFixed(2);
  console.log(`Success rate:  ${successRate}%`);
}

async function main() {
  console.log('Starting load tests against:', BASE);
  console.log('Make sure the server is running and Redis is warm.\n');

  // ── Scenario 1: Normal traffic — single cached coord ──────────────────────
  const s1 = await run({
    url: `${BASE}/api/geo?lat=12.97&lng=77.59`,
    duration: 30,
    amount: undefined,
    connections: 50,
    headers: { origin: 'https://lagorii.com' },
    title: 'Normal traffic',
  });
  printReport('Normal traffic (single cached coord, 50 RPS, 30s)', s1);

  if (s1.latency.p95 > 200) {
    console.warn('WARNING: p95 latency exceeded 200ms threshold');
  }
  if (s1.errors > s1.requests.total * 0.001) {
    console.warn('WARNING: error rate exceeded 0.1%');
  }

  // ── Scenario 2: Mixed traffic — rotating 10 coords ─────────────────────────
  let coordIdx = 0;
  const s2 = await run({
    url: `${BASE}/api/geo`,
    duration: 30,
    connections: 50,
    headers: { origin: 'https://lagorii.com' },
    title: 'Mixed traffic',
    setupClient(client) {
      client.setHeadersAndBody(
        { origin: 'https://lagorii.com' },
        null
      );
      const coord = COORDS[coordIdx++ % COORDS.length];
      client.url = `${BASE}/api/geo?lat=${coord.lat}&lng=${coord.lng}`;
    },
  });
  printReport('Mixed traffic (10 rotating coords, 50 RPS, 30s)', s2);

  // ── Scenario 3: Rate limit test ────────────────────────────────────────────
  const s3 = await run({
    url: `${BASE}/api/geo?lat=12.97&lng=77.59`,
    duration: 10,
    connections: 200,
    headers: { origin: 'https://lagorii.com', 'x-forwarded-for': '9.9.9.9' },
    title: 'Rate limit test',
  });
  printReport('Rate limit test (same IP, 200 RPS, 10s)', s3);
  const rateLimit429 = s3.non2xx;
  console.log(`429 responses: ${rateLimit429 || 'N/A'} (expected after 100 req/min)`);

  // ── Scenario 4: Spike test ─────────────────────────────────────────────────
  const s4 = await run({
    url: `${BASE}/api/geo?lat=12.97&lng=77.59`,
    duration: 10,
    connections: 500,
    headers: { origin: 'https://lagorii.com' },
    title: 'Spike test',
  });
  printReport('Spike test (500 connections, 10s, cached coord)', s4);

  if (s4.latency.p95 > 100) {
    console.warn('WARNING: p95 on spike exceeded 100ms (should be Redis HIT)');
  }

  console.log('\n✓ Load tests complete');
}

main().catch(e => {
  console.error('Load test error:', e);
  process.exit(1);
});
