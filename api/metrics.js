const { redisScan, redisGet } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const secret = req.headers['x-secret'] || req.query.secret;
  if (!secret || secret !== process.env.INVALIDATE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [geoKeys, hitKeys] = await Promise.all([
      redisScan('v1:geo:*'),
      redisScan('hits:*'),
    ]);

    const hitCounts = await Promise.all(
      hitKeys.map(async (k) => {
        const val = await redisGet(k);
        return { key: k, hits: parseInt(val, 10) || 0 };
      })
    );
    hitCounts.sort((a, b) => b.hits - a.hits);

    const indiaHits = hitCounts.filter(h => h.key.startsWith('hits:IN:'));
    const intlHits  = hitCounts.filter(h => !h.key.startsWith('hits:IN:'));

    res.status(200).json({
      cachedLocations: geoKeys.length,
      topIndiaPins: indiaHits.slice(0, 10),
      topIntlCountries: intlHits.slice(0, 10),
      totalHitKeys: hitKeys.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
