/**
 * Integration tests — require real Upstash Redis + Google API.
 * Set env vars before running:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *   GOOGLE_MAPS_KEY, INVALIDATE_SECRET
 *
 * Run: npm run test:integration
 */

const { createServer } = require('http');
const { redisDel, redisScan, coordKey } = require('../lib/redis');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function get(path) {
  const start = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { origin: 'https://lagorii.com' },
  });
  const json = await res.json();
  return { status: res.status, body: json, ms: Date.now() - start };
}

async function getWithSecret(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      origin: 'https://lagorii.com',
      'x-secret': process.env.INVALIDATE_SECRET || 'test-secret',
    },
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  // Clean test coord from Redis
  await redisDel(coordKey(12.97, 77.59));
});

describe('Integration: /api/geo', () => {
  test('Test 1 — Cold start returns Google result', async () => {
    const { status, body } = await get('/api/geo?lat=12.97&lng=77.59');
    expect(status).toBe(200);
    expect(body.source).toBe('google');
    expect(body.pincode).toMatch(/^560/);
    expect(body.countryCode).toBe('IN');
  });

  test('Test 2 — Warm cache returns Redis result quickly', async () => {
    const { status, body, ms } = await get('/api/geo?lat=12.97&lng=77.59');
    expect(status).toBe(200);
    expect(body.source).toBe('redis');
    expect(ms).toBeLessThan(200);
  });

  test('Test 3 — International coords', async () => {
    const { status, body } = await get('/api/geo?lat=25.20&lng=55.27');
    expect(status).toBe(200);
    expect(body.countryCode).toBe('AE');
  });

  test('Test 4 — Invalid lat param', async () => {
    const { status } = await get('/api/geo?lat=abc&lng=77.59');
    expect(status).toBe(400);
  });

  test('Test 5 — Missing params', async () => {
    const { status } = await get('/api/geo');
    expect(status).toBe(400);
  });

  test('Test 6 — Null island', async () => {
    const { status } = await get('/api/geo?lat=0&lng=0');
    expect(status).toBe(400);
  });

  test('Test 7 — Rate limit (101 requests)', async () => {
    const results = [];
    for (let i = 0; i < 105; i++) {
      results.push(await fetch(`${BASE}/api/geo?lat=12.50&lng=77.00`, {
        headers: { origin: 'https://lagorii.com', 'x-forwarded-for': '5.5.5.5' },
      }));
    }
    const statuses = results.map(r => r.status);
    const ok  = statuses.filter(s => s === 200).length;
    const too = statuses.filter(s => s === 429).length;
    expect(ok).toBeLessThanOrEqual(100);
    expect(too).toBeGreaterThanOrEqual(1);
  }, 30000);
});

describe('Integration: /api/health', () => {
  test('Test 8 — Health check', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.redis).toBe('connected');
  });
});

describe('Integration: warmup + invalidation', () => {
  test('Test 9 — Warmup creates cache entries', async () => {
    // Clear all geo keys first
    const keys = await redisScan('v1:geo:*');
    for (const k of keys) await redisDel(k);

    const { status, body } = await getWithSecret('/api/geo-warmup');
    expect(status).toBe(200);
    expect(body.warmed + body.skipped).toBe(25);
  }, 120000);

  test('Test 10a — Invalidation stats returns keys', async () => {
    const { status, body } = await getWithSecret('/api/geo-invalidate?mode=stats');
    expect(status).toBe(200);
    expect(body.totalKeys).toBeGreaterThan(0);
  });

  test('Test 10b — Invalidation all clears geo keys', async () => {
    const { status, body } = await getWithSecret('/api/geo-invalidate?mode=all');
    expect(status).toBe(200);
    expect(body.deleted).toBeGreaterThan(0);

    const keysAfter = await redisScan('v1:geo:*');
    expect(keysAfter.length).toBe(0);
  });
});
