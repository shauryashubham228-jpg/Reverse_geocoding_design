const INDIA_BOUNDS = { latMin: 6.5, latMax: 35.5, lngMin: 68.0, lngMax: 97.5 };

function validateCoords(rawLat, rawLng) {
  if (rawLat === undefined || rawLat === null || rawLat === '') {
    return { valid: false, error: 'Missing lat parameter' };
  }
  if (rawLng === undefined || rawLng === null || rawLng === '') {
    return { valid: false, error: 'Missing lng parameter' };
  }

  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);

  if (isNaN(lat) || isNaN(lng)) {
    return { valid: false, error: 'lat and lng must be valid numbers' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'lat must be between -90 and 90' };
  }
  if (lng < -180 || lng > 180) {
    return { valid: false, error: 'lng must be between -180 and 180' };
  }
  if (lat === 0 && lng === 0) {
    return { valid: false, error: 'Null island coordinates rejected' };
  }

  const roundedLat = parseFloat(lat.toFixed(2));
  const roundedLng = parseFloat(lng.toFixed(2));
  const isIndia =
    roundedLat >= INDIA_BOUNDS.latMin &&
    roundedLat <= INDIA_BOUNDS.latMax &&
    roundedLng >= INDIA_BOUNDS.lngMin &&
    roundedLng <= INDIA_BOUNDS.lngMax;

  return {
    valid: true,
    error: null,
    lat: roundedLat,
    lng: roundedLng,
    isIndia,
    key: `v1:geo:${roundedLat}:${roundedLng}`,
  };
}

module.exports = { validateCoords };
