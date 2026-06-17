const TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function extractGoogleResult(data) {
  if (data.status !== 'OK' || !data.results || !data.results.length) return null;
  let pincode = null, countryCode = null, city = null, locality = null;
  for (const result of data.results) {
    for (const comp of result.address_components || []) {
      if (comp.types.includes('postal_code') && !pincode)
        pincode = comp.long_name.replace(/\D+/g, '').slice(0, 6);
      if (comp.types.includes('country') && !countryCode)
        countryCode = comp.short_name.toUpperCase();
      if (comp.types.includes('locality') && !city)
        city = comp.long_name;
      if (comp.types.includes('sublocality_level_1') && !locality)
        locality = comp.long_name;
    }
    if (pincode && countryCode) break;
  }
  return { pincode: pincode || null, countryCode: countryCode || null, city: city || null, locality: locality || null };
}

async function googleGeocode(lat, lng) {
  try {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const res = await withTimeout(fetch(url), TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    return extractGoogleResult(data);
  } catch (e) {
    console.error('[Geocode] Google error', e.message);
    return null;
  }
}

async function nominatimGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await withTimeout(
      fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'LagoriETA/2.0' } }),
      TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    return {
      pincode: (addr.postcode || '').replace(/\D+/g, '').slice(0, 6) || null,
      countryCode: (addr.country_code || '').toUpperCase() || null,
      city: addr.city || addr.town || addr.village || null,
      locality: addr.suburb || addr.neighbourhood || null,
    };
  } catch (e) {
    console.error('[Geocode] Nominatim error', e.message);
    return null;
  }
}

module.exports = { googleGeocode, nominatimGeocode };
