import { createClient } from 'redis';
import { config } from '../config';
import { logger } from '../lib/logger';

function createClientx(name: string) {
  console.log({rUlr: config.REDIS_URL})
  // const client = new Redis(config.REDIS_URL, {
  //   tls: {},
  //   password: config.REDIS_PASSWORD,
  //   maxRetriesPerRequest: null,
  //   enableReadyCheck: false,
  //   lazyConnect: false,
  //   retryStrategy(times) {
  //     const delay = Math.min(times * 100, 3000);
  //     logger.warn({ name, times, delay }, 'Redis reconnecting');
  //     return delay;
  //   },
  // });

  const client = createClient({
    username: 'default',
    password: config.REDIS_PASSWORD,
    socket: {
      host: config.REDIS_URL,
      port: parseInt(config.REDIS_PORT)
    },
  })

  client.on('connect', () => logger.info({ name }, 'Redis connected'));
  client.on('error', (err) => logger.error({ name, err }, 'Redis error'));
  client.on('close', () => logger.warn({ name }, 'Redis connection closed'));

  return client;
}

// Three clients: main, pub, sub (pub/sub require dedicated connections)
export const redis = createClientx('main');
export const redisPub = createClientx('pub');
export const redisSub = createClientx('sub');

export const connectRedis = async() => {
  try {
   await redis.connect()
   redisPub.connect()
   redisSub.connect()
  } catch (error) {
    throw error
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}