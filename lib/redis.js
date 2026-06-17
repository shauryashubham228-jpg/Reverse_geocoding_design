const { Redis } = require('@upstash/redis');

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const CACHE_VERSION = 'v1';

let _client = null;

function getRedis() {
  if (!_client) {
    _client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _client;
}

function coordKey(lat, lng) {
  return `${CACHE_VERSION}:geo:${lat}:${lng}`;
}

async function redisGet(key) {
  try {
    return await getRedis().get(key);
  } catch (e) {
    console.error('[Redis] GET error', key, e.message);
    return null;
  }
}

async function redisSet(key, value, ttl = TTL_SECONDS) {
  try {
    await getRedis().set(key, JSON.stringify(value), { ex: ttl });
  } catch (e) {
    console.error('[Redis] SET error', key, e.message);
  }
}

async function redisIncr(key) {
  try {
    const redis = getRedis();
    await redis.incr(key);
    await redis.expire(key, 90 * 24 * 60 * 60); // 90 day counter TTL
  } catch (e) {
    console.error('[Redis] INCR error', key, e.message);
  }
}

async function redisDel(key) {
  try {
    return await getRedis().del(key);
  } catch (e) {
    console.error('[Redis] DEL error', key, e.message);
    return 0;
  }
}

async function redisScan(pattern) {
  try {
    const redis = getRedis();
    const keys = [];
    let cursor = 0;
    do {
      const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = parseInt(nextCursor, 10);
      keys.push(...batch);
    } while (cursor !== 0);
    return keys;
  } catch (e) {
    console.error('[Redis] SCAN error', pattern, e.message);
    return [];
  }
}

module.exports = { getRedis, coordKey, redisGet, redisSet, redisIncr, redisDel, redisScan, TTL_SECONDS, CACHE_VERSION };
