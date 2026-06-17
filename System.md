# Reverse Geocoding System Design

## High-Level Architecture

```text
                    Customer

                        │
                        ▼

               Browser Cache
                   (L1)

                        │
             ┌──────────┴──────────┐
             │                     │
            Hit                  Miss
             │                     │
             ▼                     ▼

      Instant Response        Geo API Layer

                                    │
                                    ▼

                         Redis Distributed Cache
                                  (L2)

                                    │
                      ┌─────────────┴─────────────┐
                      │                           │
                     Hit                        Miss
                      │                           │
                      ▼                           ▼

               Cached Result         Google Maps API

                                             │
                                             ▼

                                  Nominatim Fallback
```

---

# Request Lifecycle

1. Customer visits Shopify store.

2. Browser checks Local Storage cache.

3. If hit:

   Return location instantly.

4. If miss:

   Call Geo API.

5. Geo API checks Redis.

6. If Redis hit:

   Return cached location.

7. If Redis miss:

   Query Google Maps API.

8. If Google fails:

   Query Nominatim.

9. Save result in Redis.

10. Save result in Browser Cache.

11. Return response.

---

# Cache Hierarchy

## L1 Browser Cache

Storage:

```javascript
localStorage
```

TTL:

```text
30 Days
```

Response Time:

```text
1-5ms
```

Purpose:

- Zero infrastructure cost
- Zero Redis lookups
- Instant repeat visits

---

## L2 Redis Cache

Storage:

```text
Upstash Redis
```

TTL:

```text
7 Days
```

Response Time:

```text
20-50ms
```

Purpose:

- Shared cache
- Reduced Google usage
- Fast retrieval

---

## L3 Google Maps

Response Time:

```text
300-1000ms
```

Purpose:

- Source of truth
- Accurate pincode resolution

---

## L4 Nominatim

Purpose:

- Fallback provider
- High availability

---

# Cache Key Design

```text
v1:geo:{lat}:{lng}
```

Example:

```text
v1:geo:12.97:77.59
```

---

# Coordinate Normalization

Raw:

```text
12.971623
```

Normalized:

```text
12.97
```

Benefits:

- Higher cache hits
- Better cache reuse
- Reduced storage

---

# Why Local Storage Caching Helps E-Commerce

## Faster Delivery Estimates

Users instantly see:

- Delivery dates
- Serviceability
- Shipping availability

---

## Lower Backend Costs

Repeat visitors bypass:

- Redis
- APIs
- Serverless execution

---

## Better Customer Experience

No loading delays.

No waiting for API responses.

---

## Reduced Infrastructure Load

Popular users never hit backend systems.

---

## Improved Conversion Rates

Fast experiences increase purchase confidence.

---

# Why TTL Is Important

Without TTL:

```text
Old Data
      ↓
Wrong Pincode
      ↓
Incorrect Delivery Promise
```

With TTL:

```text
Data Expires
      ↓
Fresh Lookup
      ↓
Accurate Experience
```

Benefits:

- Fresh location data
- Better delivery accuracy
- Controlled storage growth
- Automatic cache cleanup

---

# Reliability Features

- Google Fallback
- Redis Caching
- Browser Caching
- Input Validation
- Rate Limiting
- CORS Protection
- Serverless Scaling

---

# Performance Summary

| Layer | Latency |
|---------|---------|
| Browser Cache | 1-5ms |
| Redis Cache | 20-50ms |
| Google API | 300-1000ms |

Goal:

Always serve from the cheapest and fastest layer available.

---

# Scalability

Current:

10k+ Requests/Day

Potential:

100k+ Requests/Day

without architectural changes.

---

# Design Principles

- Cost Optimization First
- User Experience First
- Cache Before Compute
- Fail Gracefully
- Scale Horizontally
- Reduce Third-Party Dependency

---

Author

Shaurya Shubham
