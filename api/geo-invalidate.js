const { redisGet, redisDel, redisScan, coordKey } = require('../lib/redis');
const { validateCoords } = require('../lib/validate');

module.exports = async function handler(req, res) {
  const secret = req.headers['x-secret'] || req.query.secret;
  if (!secret || secret !== process.env.INVALIDATE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const mode = req.query.mode || 'stats';

  try {
    if (mode === 'stats') {
      const geoKeys = await redisScan('v1:geo:*');
      const hitKeys = await redisScan('hits:*');

      const hitCounts = await Promise.all(
        hitKeys.slice(0, 20).map(async (k) => {
          const val = await redisGet(k);
          return { key: k, hits: parseInt(val, 10) || 0 };
        })
      );
      hitCounts.sort((a, b) => b.hits - a.hits);

      res.status(200).json({
        totalKeys: geoKeys.length,
        topPins: hitCounts.slice(0, 10),
        cacheVersion: 'v1',
      });
      return;
    }

    if (mode === 'coord') {
      const v = validateCoords(req.query.lat, req.query.lng);
      if (!v.valid) {
        res.status(400).json({ error: v.error });
        return;
      }
      const key = coordKey(v.lat, v.lng);
      const deleted = await redisDel(key);
      res.status(200).json({ deleted, key });
      return;
    }

    if (mode === 'all') {
      const keys = await redisScan('v1:geo:*');
      let deleted = 0;
      for (const k of keys) {
        deleted += await redisDel(k);
      }
      res.status(200).json({ deleted });
      return;
    }

    if (mode === 'counters') {
      const keys = await redisScan('hits:*');
      let deleted = 0;
      for (const k of keys) {
        deleted += await redisDel(k);
      }
      res.status(200).json({ deleted });
      return;
    }

    res.status(400).json({ error: 'Unknown mode. Use: stats, coord, all, counters' });
  } catch (e) {
    console.error('[invalidate] error', e);
    res.status(500).json({ error: e.message });
  }
};
