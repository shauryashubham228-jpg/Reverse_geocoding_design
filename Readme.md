# Reverse Geocoding Intelligence Platform

> A multi-layer caching system designed to reduce geocoding costs, improve delivery experience, and scale location intelligence for Shopify stores.

## The Problem

Most e-commerce stores rely on third-party geocoding APIs to determine:

- Customer Pincode
- City
- State
- Country
- Delivery Serviceability

Traditional flow:

Customer Visit
↓
Location Access
↓
Google Geocoding API
↓
Delivery Estimate

Every visitor generates API costs.

As traffic grows:

- Higher API expenses
- Slower response times
- Increased dependency on external providers
- Risk of rate limiting

---

## My Thought Process

I approached this as a product optimization problem rather than a coding problem.

Questions I asked:

- Can we avoid calling Google for repeat visitors?
- Can we share location data across users?
- Can we reduce infrastructure costs?
- Can we improve delivery estimate speed?
- Can we survive third-party API failures?

This led to a multi-level caching architecture.

---

## Solution

The platform uses:

### L1 Cache

Browser Local Storage

Stores previously resolved customer location.

### L2 Cache

Redis Distributed Cache

Shares location intelligence across all users.

### L3 Source

Google Maps Reverse Geocoding

### L4 Fallback

OpenStreetMap Nominatim

---

## Architecture

```text
Customer

   │
   ▼

Browser Cache (L1)

   │
   ├── Hit → Return Response
   │
   ▼

Geo API

   │
   ▼

Redis Cache (L2)

   │
   ├── Hit → Return Response
   │
   ▼

Google Maps API

   │
   ▼

Nominatim Fallback
```

---

## Why Local Storage?

Most visitors return multiple times.

Without Local Storage:

Visit 1 → Redis
Visit 2 → Redis
Visit 3 → Redis

With Local Storage:

Visit 1 → Redis/API

Visit 2 → Browser Cache

Visit 3 → Browser Cache

Result:

- Faster user experience
- Lower infrastructure load
- Reduced Redis lookups
- Near-zero cost for repeat visitors

---

## Why TTL Matters

Location data changes.

Customers may:

- Travel
- Move cities
- Use VPNs
- Change delivery addresses

TTL ensures stale data is automatically refreshed.

### Local Storage TTL

30 Days

Benefits:

- Avoids outdated locations
- Maintains customer experience
- Reduces unnecessary API calls

### Redis TTL

7 Days

Benefits:

- Prevents stale cache accumulation
- Controls storage costs
- Maintains cache freshness

---

## Cost Optimization

Without Caching

10,000 Visitors

↓

10,000 Google API Calls

With Multi-Level Caching

10,000 Visitors

↓

L1 Browser Cache

↓

L2 Redis Cache

↓

Only cache misses reach Google

Potential reduction:

80%–95% fewer API requests

---

## Business Impact

### Lower Costs

Reduced geocoding API usage.

### Faster Delivery Estimates

Delivery promises appear faster.

### Better Conversion Rates

Reduced checkout friction.

### Improved Scalability

Supports traffic growth without proportional cost increases.

### Better Reliability

Fallback provider prevents failures.

---

## Tech Stack

Frontend

- Shopify
- JavaScript

Backend

- Node.js
- Vercel

Caching

- Browser Local Storage
- Upstash Redis

Geocoding

- Google Maps API
- OpenStreetMap Nominatim

---

## Key Achievement

Built a location intelligence platform that transforms an expensive third-party API dependency into a scalable, cost-efficient, and customer-friendly system using multi-layer caching and fallback architecture.

---

Author

Shaurya Shubham
