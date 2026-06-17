# Deploy Guide

## One-time setup (do this once)

```bash
npm install -g vercel
vercel login
```

---

## DEPLOY 1 — Lagorii Production
**URL will be:** `https://lagorii-geo-api.vercel.app`
**CORS:** locked to lagorii.com only

### Step 1 — Deploy
```bash
cd C:\redis\lagorii-geo-api
vercel --prod --local-config vercel.lagorii.json
```
When prompted:
- "Set up and deploy?" → Y
- "Which scope?" → your account
- "Link to existing project?" → N
- "Project name?" → `lagorii-geo-api`
- "Directory?" → `./` (just press Enter)

### Step 2 — Set env vars (Vercel dashboard)
Go to: vercel.com → lagorii-geo-api → Settings → Environment Variables

Add these one by one:
```
UPSTASH_REDIS_REST_URL      → https://YOUR-DB.upstash.io
UPSTASH_REDIS_REST_TOKEN    → YOUR_TOKEN
GOOGLE_MAPS_KEY             → AIza...
INVALIDATE_SECRET           → lagorii-pick-a-long-random-string
ALLOWED_ORIGINS             → https://lagorii.com,https://lagorii-kids.myshopify.com
```

### Step 3 — Redeploy with env vars active
```bash
vercel --prod --local-config vercel.lagorii.json
```

### Step 4 — Warm the cache
```bash
curl -H "x-secret: lagorii-pick-a-long-random-string" \
  https://lagorii-geo-api.vercel.app/api/geo-warmup
```

### Step 5 — Verify
```bash
curl https://lagorii-geo-api.vercel.app/api/health
curl "https://lagorii-geo-api.vercel.app/api/geo?lat=12.97&lng=77.59"
```

---

## DEPLOY 2 — Personal / Testing
**URL will be:** `https://lagorii-geo-api-dev.vercel.app`
**CORS:** open (any origin, localhost works)

### Step 1 — Deploy
```bash
cd C:\redis\lagorii-geo-api
vercel --prod --local-config vercel.personal.json
```
When prompted:
- "Link to existing project?" → N
- "Project name?" → `lagorii-geo-api-dev`

### Step 2 — Set env vars (Vercel dashboard)
Go to: vercel.com → lagorii-geo-api-dev → Settings → Environment Variables

Add these:
```
UPSTASH_REDIS_REST_URL      → https://YOUR-DB.upstash.io  (can be same DB or separate)
UPSTASH_REDIS_REST_TOKEN    → YOUR_TOKEN
GOOGLE_MAPS_KEY             → AIza...
INVALIDATE_SECRET           → personal-pick-a-long-random-string
ALLOWED_ORIGINS             → *
```

### Step 3 — Redeploy
```bash
vercel --prod --local-config vercel.personal.json
```

### Step 4 — Test from browser/Postman/anywhere
```
https://lagorii-geo-api-dev.vercel.app/api/health
https://lagorii-geo-api-dev.vercel.app/api/geo?lat=12.97&lng=77.59
https://lagorii-geo-api-dev.vercel.app/api/geo?lat=25.20&lng=55.27
```

---

## Two Upstash databases (recommended)

Keep them separate so test calls don't pollute production Redis:

| | Production | Personal |
|--|--|--|
| Upstash DB | `lagorii-prod` | `lagorii-dev` |
| Redis TTL | 7 days | 7 days |
| Warmup | Yes | Optional |

---

## Updating either deployment

```bash
# Update Lagorii production
vercel --prod --local-config vercel.lagorii.json

# Update personal
vercel --prod --local-config vercel.personal.json
```

No env vars needed again — they stay saved in Vercel.

---

## File structure summary

```
vercel.lagorii.json     ← Lagorii config (CORS: lagorii.com)
vercel.personal.json    ← Personal config (CORS: *)
.env.lagorii            ← Lagorii env var reference
.env.personal           ← Personal env var reference
```
