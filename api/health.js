const { getRedis } = require('../lib/redis');

module.exports = async function handler(req, res) {
  let redisStatus = 'connected';
  try {
    await getRedis().ping();
  } catch (e) {
    redisStatus = 'error';
  }

  res.status(200).json({
    status: 'ok',
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
};
