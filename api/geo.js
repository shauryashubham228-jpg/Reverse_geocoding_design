const { validateCoords } = require('../lib/validate');
const { redisGet, redisSet, redisIncr, coordKey } = require('../lib/redis');
const { googleGeocode, nominatimGeocode } = require('../lib/geocode');
const { checkRateLimit } = require('../lib/ratelimit');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://lagorii.com')
  .split(',').map(o => o.trim());

function setCors(req, res) {
  const origin = req.headers['origin'] || '';
  const allowAll = ALLOWED_ORIGINS.includes('*');
  if (allowAll) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // 1. Validate
    const { lat: rawLat, lng: rawLng } = req.query;
    const v = validateCoords(rawLat, rawLng);
    if (!v.valid) {
      res.status(400).json({ error: v.error });
      return;
    }
    const { lat, lng, key } = v;

    // 2. Rate limit
    const rl = await checkRateLimit(req);
    if (!rl.allowed) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
      return;
    }

    // 3. Redis cache check
    const cached = await redisGet(key);
    if (cached) {
      const result = typeof cached === 'string' ? JSON.parse(cached) : cached;
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).json({ ...result, source: 'redis' });
      return;
    }

    // 4. Google API
    let result = await googleGeocode(lat, lng);
    let source = 'google';

    // 5. Nominatim fallback
    if (!result) {
      result = await nominatimGeocode(lat, lng);
      source = 'nominatim';
    }

    if (!result) {
      res.status(404).json({ fallback: true, error: 'Could not resolve coordinates' });
      return;
    }

    // 6. Save to Redis
    await redisSet(key, result);

    // 7. Increment hit counter
    const counterKey = result.countryCode === 'IN' && result.pincode
      ? `hits:IN:${result.pincode}`
      : `hits:${result.countryCode || 'XX'}:intl`;
    await redisIncr(counterKey);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).json({ ...result, source });
  } catch (e) {
    console.error('[geo] Unhandled error', e);
    res.status(200).json({ fallback: true, error: e.message });
  }
};
