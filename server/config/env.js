// File: server/config/env.js
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directory, "../../.env") });
dotenv.config({ path: path.resolve(directory, "../.env"), override: true });

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGODB_URI || "",
  mongoDnsServers: String(process.env.MONGODB_DNS_SERVERS || "").split(",").map((server) => server.trim()).filter(Boolean),
  accessSecret: process.env.JWT_ACCESS_SECRET || "lumina-local-access-secret",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "lumina-local-refresh-secret",
  accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL || "30d",
  redisUrl: process.env.REDIS_URL || "",
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "Lumina <hello@lumina.local>",
  },
  ai: {
    baseUrl: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  },
  isProduction: process.env.NODE_ENV === "production",
};
