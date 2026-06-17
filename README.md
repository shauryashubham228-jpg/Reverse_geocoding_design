# ecommerce-geo-api

Server-side geolocation caching API for [ecommerce]. Accepts browser coordinates, caches results in Redis, and returns pincode + city for the ETA widget — keeping the Google Maps API key off the client entirely.

## Architecture

```
Browser (Shopify)
  └─ localStorage (30-day cache, 5 slots)
       └─ on miss → fetch /api/geo?lat=&lng=
            └─ Vercel serverless function
                 ├─ Upstash Redis (7-day cache)  ← HIT: ~20ms
                 └─ Google Maps Geocoding API     ← MISS: ~200ms
                      └─ Nominatim fallback       ← if Google fails
```

**What is cached** (coords → location data):
- `pincode`, `countryCode`, `city`, `locality`

**What is never cached** (always live from LagETA widget):
- `timeline`, `express`, `standard` delivery windows

## Setup

### 1. Clone and install
```bash
git clone <repo>
cd lagorii-geo-api
npm install
```

### 2. Create Upstash Redis database
- Go to [upstash.com](https://upstash.com) → Create database → Choose region closest to India (Mumbai/Singapore)
- Copy **REST URL** and **REST Token**

### 3. Create Vercel account
```bash
npm install -g vercel
vercel login
```

### 4. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your values
```

```env
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...
GOOGLE_MAPS_KEY=AIza...
INVALIDATE_SECRET=choose-a-long-random-string
ALLOWED_ORIGINS=https://lagorii.com,https://lagorii-kids.myshopify.com
```

Add the same vars in Vercel dashboard → Project Settings → Environment Variables.

### 5. Run locally
```bash
vercel dev
# API available at http://localhost:3000
```

### 6. Deploy to production
```bash
vercel --prod
# Note the deployment URL, e.g. lagorii-geo-api.vercel.app
```

### 7. Warm the cache (run once after deploy)
```bash
curl -H "x-secret: YOUR_SECRET" \
  https://lagorii-geo-api.vercel.app/api/geo-warmup
```

### 8. Update Shopify theme
- Replace `shopify_version_21.js` with `shopify/shopify_version_22.js` in your theme
- Replace `lag-eta-widget.js` with `shopify/lag-eta-widget-updated.js`
- **Remove** `window.LAG_GOOGLE_MAPS_KEY` from `theme.liquid` — the key is now server-side only

## API Endpoints

### `GET /api/geo?lat=12.93&lng=77.58`
Returns location data for coordinates. No auth required.

**Response:**
```json
{
  "pincode": "560011",
  "countryCode": "IN",
  "city": "Bangalore",
  "locality": "Koramangala",
  "source": "redis"
}
```

`source` is `"redis"` (cached), `"google"`, or `"nominatim"`.

On error: `{ "fallback": true, "error": "..." }` — browser falls back to Nominatim directly.

**Rate limit:** 100 requests/minute per IP, 10,000/minute globally.

---

### `GET /api/health`
Health check. No auth required.
```json
{ "status": "ok", "redis": "connected", "timestamp": "2024-02-14T10:30:00Z" }
```

---

### `GET /api/geo-warmup`
Pre-warms 25 top locations. Requires `x-secret` header.
```bash
curl -H "x-secret: YOUR_SECRET" https://lagorii-geo-api.vercel.app/api/geo-warmup
```

---

### `GET /api/geo-invalidate?mode=stats`
Cache stats. Requires `x-secret` header.

| mode | effect |
|------|--------|
| `stats` | Returns total cached keys and top hit counts |
| `coord` | Deletes single key (also pass `?lat=&lng=`) |
| `all` | Deletes all `v1:geo:*` keys |
| `counters` | Deletes all `hits:*` counter keys |

---

### `GET /api/metrics`
Detailed hit analytics. Requires `x-secret` header.

## Running Tests

```bash
# Unit tests (no external services needed)
npm test

# Integration tests (needs real Redis + Google API)
TEST_BASE_URL=http://localhost:3000 npm run test:integration

# Load tests (needs running server)
TEST_BASE_URL=http://localhost:3000 npm run test:load
```

## Cache Invalidation

**When to invalidate:**
- You change delivery timelines (bump `CACHE_VERSION` to `v2` in both `lib/redis.js` and the Shopify JS files — existing entries expire naturally over 7 days)
- A specific pincode has wrong data → use `mode=coord`
- Full reset needed → use `mode=all` then re-run warmup

**Quick reference:**
```bash
SECRET="YOUR_SECRET"
BASE="https://lagorii-geo-api.vercel.app"

# Stats
curl -H "x-secret: $SECRET" "$BASE/api/geo-invalidate?mode=stats"

# Clear one coord
curl -H "x-secret: $SECRET" "$BASE/api/geo-invalidate?mode=coord&lat=12.97&lng=77.59"

# Clear all
curl -H "x-secret: $SECRET" "$BASE/api/geo-invalidate?mode=all"

# Re-warm after clearing all
curl -H "x-secret: $SECRET" "$BASE/api/geo-warmup"
```

## Cost Breakdown

| Scale | Redis reads/mo | Google API calls/mo | Vercel invocations | Est. cost |
|-------|---------------|--------------------|--------------------|-----------|
| 200k sessions, 25% return | ~150k | ~5k–10k | ~200k | **~$0–5/mo** |
| 500k sessions | ~375k | ~15k | ~500k | **~$5–15/mo** |
| 1M sessions | ~750k | ~30k | ~1M | **~$15–30/mo** |

Upstash free tier: 10k req/day. Vercel free tier: 100k invocations/month. Google Maps: $5/1k calls after 40k free/month.

## Troubleshooting

**Redis connection error**
- Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel env vars
- Check Upstash dashboard for quota usage
- The API fails open — returns `{ fallback: true }` so browser still works

**Google API quota exceeded**
- API falls back to Nominatim automatically
- Check Google Cloud Console → APIs & Services → Geocoding API quotas
- Consider increasing quota or enabling billing

**CORS error from Shopify**
- Verify `ALLOWED_ORIGINS` includes your exact store domain (no trailing slash)
- Check Vercel function logs for the incoming `origin` header value
- Shopify CDN requests come from `lagorii.com`, not `lagorii-kids.myshopify.com`

**Cold start timeout**
- Vercel serverless functions cold-start in ~300ms
- The browser has a 5-second timeout before falling back to Nominatim
- Run `/api/geo-warmup` to pre-populate Redis; subsequent requests are fast

**Rate limit false positive**
- If a single user hits 429, they share IP with many users (NAT/office/mobile carrier)
- Raise `IP_LIMIT` in `lib/ratelimit.js` if needed (default: 100/min)
- Localhost and `127.0.0.1` are always whitelisted
