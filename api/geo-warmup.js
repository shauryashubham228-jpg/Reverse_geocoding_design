const { redisGet, redisSet, coordKey } = require('../lib/redis');
const { googleGeocode, nominatimGeocode } = require('../lib/geocode');

const TOP_AREAS = [
  { lat: 12.97, lng: 77.59, label: 'Bangalore Koramangala' },
  { lat: 12.93, lng: 77.62, label: 'Bangalore HSR Layout' },
  { lat: 12.90, lng: 77.65, label: 'Bangalore Whitefield' },
  { lat: 12.97, lng: 77.64, label: 'Bangalore Indiranagar' },
  { lat: 13.01, lng: 77.55, label: 'Bangalore Hebbal' },
  { lat: 12.93, lng: 77.58, label: 'Bangalore Jayanagar' },
  { lat: 19.07, lng: 72.87, label: 'Mumbai Andheri' },
  { lat: 19.02, lng: 72.85, label: 'Mumbai Bandra' },
  { lat: 19.11, lng: 72.86, label: 'Mumbai Malad' },
  { lat: 18.99, lng: 72.83, label: 'Mumbai Dadar' },
  { lat: 28.61, lng: 77.23, label: 'Delhi Central' },
  { lat: 28.47, lng: 77.03, label: 'Gurugram' },
  { lat: 18.52, lng: 73.85, label: 'Pune Central' },
  { lat: 18.56, lng: 73.91, label: 'Pune Koregaon Park' },
  { lat: 13.08, lng: 80.27, label: 'Chennai Central' },
  { lat: 17.38, lng: 78.47, label: 'Hyderabad Banjara Hills' },
  { lat: 22.57, lng: 88.36, label: 'Kolkata Central' },
  { lat: 23.02, lng: 72.57, label: 'Ahmedabad Central' },
  { lat: 25.20, lng: 55.27, label: 'Dubai UAE' },
  { lat: 1.35,  lng: 103.82, label: 'Singapore' },
  { lat: 40.71, lng: -74.00, label: 'New York US' },
  { lat: 51.50, lng: -0.12,  label: 'London UK' },
  { lat: 25.07, lng: 55.14,  label: 'Abu Dhabi UAE' },
  { lat: 22.30, lng: 114.17, label: 'Hong Kong' },
  { lat: 3.14,  lng: 101.68, label: 'Kuala Lumpur' },
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = async function handler(req, res) {
  const secret = req.headers['x-secret'] || req.query.secret;
  if (!secret || secret !== process.env.INVALIDATE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const start = Date.now();
  const errors = [];
  let warmed = 0;
  let skipped = 0;
  let googleCallsMade = 0;

  for (const area of TOP_AREAS) {
    const lat = parseFloat(area.lat.toFixed(2));
    const lng = parseFloat(area.lng.toFixed(2));
    const key = coordKey(lat, lng);

    try {
      const existing = await redisGet(key);
      if (existing) {
        skipped++;
        continue;
      }

      let result = await googleGeocode(lat, lng);
      googleCallsMade++;

      if (!result) {
        result = await nominatimGeocode(lat, lng);
      }

      if (result) {
        await redisSet(key, result);
        warmed++;
      } else {
        errors.push({ area: area.label, error: 'No geocode result' });
      }

      await sleep(200);
    } catch (e) {
      errors.push({ area: area.label, error: e.message });
    }
  }

  res.status(200).json({
    total: TOP_AREAS.length,
    warmed,
    skipped,
    errors,
    googleCallsMade,
    timeMs: Date.now() - start,
  });
};
