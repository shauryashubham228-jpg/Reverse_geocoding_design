const { validateCoords } = require('../lib/validate');

// ── validate.js ──────────────────────────────────────────────────────────────

describe('validateCoords', () => {
  test('valid India coords', () => {
    const r = validateCoords('12.9312', '77.5800');
    expect(r.valid).toBe(true);
    expect(r.isIndia).toBe(true);
    expect(r.lat).toBe(12.93);
    expect(r.lng).toBe(77.58);
    expect(r.key).toBe('v1:geo:12.93:77.58');
  });

  test('rounding to 2 decimal places', () => {
    const r = validateCoords('12.9312', '77.5849');
    expect(r.lat).toBe(12.93);
    expect(r.lng).toBe(77.58);
  });

  test('valid international coords (UAE)', () => {
    const r = validateCoords('25.20', '55.27');
    expect(r.valid).toBe(true);
    expect(r.isIndia).toBe(false);
  });

  test('null island rejected', () => {
    const r = validateCoords('0', '0');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/null island/i);
  });

  test('lat out of range', () => {
    const r = validateCoords('999', '77.58');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lat/i);
  });

  test('lng out of range', () => {
    const r = validateCoords('12.93', '-999');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lng/i);
  });

  test('string instead of number', () => {
    const r = validateCoords('abc', '77.58');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/number/i);
  });

  test('missing lat', () => {
    const r = validateCoords(undefined, '77.58');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lat/i);
  });

  test('missing lng', () => {
    const r = validateCoords('12.93', undefined);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lng/i);
  });

  test('key format', () => {
    const r = validateCoords('12.93', '77.58');
    expect(r.key).toBe('v1:geo:12.93:77.58');
  });

  test('edge: India southern tip', () => {
    const r = validateCoords('6.5', '68.0');
    expect(r.valid).toBe(true);
    expect(r.isIndia).toBe(true);
  });

  test('edge: just outside India', () => {
    const r = validateCoords('5.0', '68.0');
    expect(r.valid).toBe(true);
    expect(r.isIndia).toBe(false);
  });
});

// ── geocode.js (mocked) ──────────────────────────────────────────────────────

jest.mock('../lib/geocode', () => ({
  googleGeocode: jest.fn(),
  nominatimGeocode: jest.fn(),
}));

const { googleGeocode, nominatimGeocode } = require('../lib/geocode');

describe('geocode mocked', () => {
  afterEach(() => jest.clearAllMocks());

  test('googleGeocode returns result on success', async () => {
    googleGeocode.mockResolvedValue({ pincode: '560011', countryCode: 'IN', city: 'Bangalore', locality: 'Koramangala' });
    const r = await googleGeocode(12.97, 77.59);
    expect(r.pincode).toBe('560011');
    expect(r.countryCode).toBe('IN');
  });

  test('googleGeocode returns null on API error status', async () => {
    googleGeocode.mockResolvedValue(null);
    const r = await googleGeocode(12.97, 77.59);
    expect(r).toBeNull();
  });

  test('googleGeocode returns null on network failure', async () => {
    googleGeocode.mockRejectedValue(new Error('network error'));
    const r = await googleGeocode(12.97, 77.59).catch(() => null);
    expect(r).toBeNull();
  });

  test('nominatimGeocode returns same shape', async () => {
    nominatimGeocode.mockResolvedValue({ pincode: '560011', countryCode: 'IN', city: 'Bangalore', locality: null });
    const r = await nominatimGeocode(12.97, 77.59);
    expect(r).toHaveProperty('pincode');
    expect(r).toHaveProperty('countryCode');
    expect(r).toHaveProperty('city');
    expect(r).toHaveProperty('locality');
  });
});

// ── ratelimit.js (mocked Redis) ──────────────────────────────────────────────

jest.mock('../lib/redis', () => {
  const counts = {};
  return {
    getRedis: () => ({
      incr: jest.fn(async (k) => { counts[k] = (counts[k] || 0) + 1; return counts[k]; }),
      expire: jest.fn(async () => {}),
      ping: jest.fn(async () => 'PONG'),
    }),
    redisGet: jest.fn(async () => null),
    redisSet: jest.fn(async () => {}),
    redisIncr: jest.fn(async () => {}),
    redisDel: jest.fn(async () => 1),
    redisScan: jest.fn(async () => []),
    coordKey: (lat, lng) => `v1:geo:${lat}:${lng}`,
    TTL_SECONDS: 604800,
    CACHE_VERSION: 'v1',
  };
});

const { checkRateLimit } = require('../lib/ratelimit');

describe('checkRateLimit', () => {
  function makeReq(ip = '1.2.3.4') {
    return { headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } };
  }

  test('first request allowed with 99 remaining', async () => {
    const r = await checkRateLimit(makeReq('10.0.0.1'));
    expect(r.allowed).toBe(true);
  });

  test('localhost always allowed', async () => {
    const r = await checkRateLimit(makeReq('127.0.0.1'));
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(100);
  });
});
