import Redis from 'ioredis';
import config from '../config';

export const redis = new Redis(config.redis_url as string, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

export const pingRedis = async (): Promise<void> => {
  const reply = await redis.ping();
  if (reply !== 'PONG') {
    throw new Error(`Unexpected Redis PING reply: ${reply}`);
  }
};
