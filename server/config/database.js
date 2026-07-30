// File: server/config/database.js
import mongoose from "mongoose";
import { env } from "./env.js";

let mode = "memory";

export async function connectDatabase() {
  if (!env.mongoUri || process.env.FORCE_MEMORY_DB === "true") {
    console.info("● Database: in-memory demo mode");
    return mode;
  }

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5_000,
      autoIndex: !env.isProduction,
    });
    mode = "mongo";
    console.info("● Database: MongoDB connected");
  } catch (error) {
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
