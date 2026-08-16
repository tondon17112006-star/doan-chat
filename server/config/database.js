// File: server/config/database.js
import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

let mode = "memory";
const atlasDnsFallback = ["1.1.1.1", "8.8.8.8"];

function mongoOptions(overrides = {}) {
  return {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    autoIndex: !env.isProduction,
    ...overrides,
  };
}

function isAtlasSrvUri(uri) {
  return String(uri || "").startsWith("mongodb+srv://");
}

export function canUseAtlasDnsFallback(uri, error) {
  if (!isAtlasSrvUri(uri)) return false;
  const message = String(error?.message || "");
  return !/authentication failed|bad auth|not authorized|invalid connection string/i.test(message);
}

function atlasLookup(hostname, options, callback) {
  dns.resolve4(hostname, (error, addresses) => {
    if (error || !addresses?.length) {
      dns.lookup(hostname, options, callback);
      return;
    }
    const records = addresses.map((address) => ({ address, family: 4 }));
    if (options?.all) callback(null, records);
    else callback(null, records[0].address, records[0].family);
  });
}

async function connectWithAtlasDnsFallback() {
  const resolvers = env.mongoDnsServers.length ? env.mongoDnsServers : atlasDnsFallback;
  dns.setServers(resolvers);
  await mongoose.disconnect().catch(() => undefined);
  await mongoose.connect(env.mongoUri, mongoOptions({ lookup: atlasLookup }));
}

export async function connectDatabase() {
  if (!env.mongoUri || process.env.FORCE_MEMORY_DB === "true") {
    if (env.isProduction) throw new Error("MONGODB_URI is required in production. Refusing to start with demo data.");
    console.info("● Database: in-memory demo mode");
    return mode;
  }

  try {
    await mongoose.connect(env.mongoUri, mongoOptions());
    mode = "mongo";
    console.info("● Database: MongoDB connected");
  } catch (error) {
    if (canUseAtlasDnsFallback(env.mongoUri, error)) {
      try {
        console.warn("● MongoDB Atlas DNS lookup failed; retrying with fallback resolvers.");
        await connectWithAtlasDnsFallback();
        mode = "mongo";
        console.info("● Database: MongoDB connected with Atlas DNS fallback");
        return mode;
      } catch (fallbackError) {
        error = fallbackError;
      }
    }
    if (env.isProduction) throw error;
    mode = "memory";
    console.warn(`● MongoDB unavailable (${error.message}); using in-memory demo mode`);
  }
  return mode;
}

export function databaseMode() {
  return mode;
}

export function databaseReady() {
  return mode === "mongo" && mongoose.connection.readyState === 1;
}
