// File: server/config/redis.js
import Redis from "ioredis";
import { env } from "./env.js";

let redis = null;

export async function connectRedis() {
  if (!env.redisUrl) {
    console.info("● Redis: local memory fallback");
    return null;
  }
  redis = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 200, 1_000)),
  });
  redis.on("error", (error) => console.warn(`● Redis warning: ${error.message}`));
  try {
    await redis.connect();
    console.info("● Redis: connected");
  } catch {
    redis.disconnect();
    redis = null;
    console.warn("● Redis unavailable; cache, OTP and presence use local memory");
  }
  return redis;
}

export function redisClient() {
  return redis?.status === "ready" ? redis : null;
}

export async function closeRedis() {
  if (redis) await redis.quit().catch(() => redis.disconnect());
}
