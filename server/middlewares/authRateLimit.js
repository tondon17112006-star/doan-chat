import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const windowMs = 15 * 60_000;
const developmentMultiplier = env.isProduction ? 1 : 20;

function emailKey(request) {
  return String(request.body?.email || "unknown")
    .trim()
    .toLowerCase()
    .slice(0, 320);
}

function ipKey(request) {
  return String(request.ip || request.socket?.remoteAddress || "unknown");
}

function createLimiter(limit, keyGenerator) {
  return rateLimit({
    windowMs,
    limit: limit * developmentMultiplier,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    message: { success: false, message: "Too many attempts. Please wait before trying again." },
  });
}

function limitsFor(prefix, emailLimit, ipLimit) {
  return [
    createLimiter(emailLimit, (request) => `${prefix}:email:${emailKey(request)}`),
    createLimiter(ipLimit, (request) => `${prefix}:ip:${ipKey(request)}`),
  ];
}

export const loginRateLimits = limitsFor("login", 10, 40);
export const forgotPasswordRateLimits = limitsFor("forgot-password", 5, 20);
export const verificationRateLimits = limitsFor("send-verification", 3, 10);
