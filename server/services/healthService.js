import mongoose from "mongoose";
import { env } from "../config/env.js";
import { databaseReady } from "../config/database.js";
import { redisClient } from "../config/redis.js";

const CHECK_TIMEOUT_MS = 2_000;

export async function readinessStatus() {
  const [mongo, redis] = await Promise.all([checkMongo(), checkRedis()]);
  const ready = mongo.ready && redis.ready;
  return {
    ready,
    checks: { mongo: publicCheck(mongo), redis: publicCheck(redis) },
  };
}

async function checkMongo() {
  if (!env.mongoUri || process.env.FORCE_MEMORY_DB === "true") {
    return { configured: false, ready: true, status: "not_configured" };
  }
  if (!databaseReady() || !mongoose.connection.db) {
    return { configured: true, ready: false, status: "unavailable" };
  }
  try {
    await withTimeout(mongoose.connection.db.admin().ping());
    return { configured: true, ready: true, status: "ready" };
  } catch {
    return { configured: true, ready: false, status: "unavailable" };
  }
}

async function checkRedis() {
  if (!env.redisUrl) return { configured: false, ready: true, status: "not_configured" };
  const redis = redisClient();
  if (!redis) return { configured: true, ready: false, status: "unavailable" };
  try {
    await withTimeout(redis.ping());
    return { configured: true, ready: true, status: "ready" };
  } catch {
    return { configured: true, ready: false, status: "unavailable" };
  }
}

function publicCheck(check) {
  return { configured: check.configured, ready: check.ready, status: check.status };
}

async function withTimeout(operation) {
  let timer;
  try {
    await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("readiness timeout")), CHECK_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
