const { getRedis } = require('./redis');

const IP_LIMIT = 100;       // requests per minute per IP
const GLOBAL_LIMIT = 10000; // requests per minute globally
const WHITELISTED = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

function minuteTimestamp() {
  return Math.floor(Date.now() / 60000);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

async function checkRateLimit(req) {
  const ip = getClientIp(req);
  if (WHITELISTED.has(ip)) return { allowed: true, remaining: IP_LIMIT };

  const minute = minuteTimestamp();
  const ipKey = `rl:${ip}:${minute}`;
  const globalKey = `rl:global:${minute}`;

  try {
    const redis = getRedis();
    const [ipCount, globalCount] = await Promise.all([
      redis.incr(ipKey),
      redis.incr(globalKey),
    ]);
    // Set TTL only on first increment
    if (ipCount === 1) await redis.expire(ipKey, 60);
    if (globalCount === 1) await redis.expire(globalKey, 60);

    if (globalCount > GLOBAL_LIMIT) {
      return { allowed: false, remaining: 0 };
    }
    if (ipCount > IP_LIMIT) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: IP_LIMIT - ipCount };
  } catch (e) {
    // Redis down → fail open so customers aren't blocked
    console.error('[RateLimit] Redis error', e.message);
    return { allowed: true, remaining: IP_LIMIT };
  }
}

module.exports = { checkRateLimit, getClientIp };
