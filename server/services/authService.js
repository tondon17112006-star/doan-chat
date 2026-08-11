import crypto from "node:crypto";
import { env } from "../config/env.js";
import { redisClient } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import { publicUser } from "../utils/helpers.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { compareUserPassword, createUser, findUserByEmail, findUserById, updatePassword, updateUser } from "./dataService.js";

const sessions = new Map();
const otpStore = new Map();

function sessionResult(user, request, previousSessionId) {
  if (previousSessionId) sessions.delete(previousSessionId);
  const sessionId = crypto.randomUUID();
  const device = request.body?.device || {};
  sessions.set(sessionId, {
    id: sessionId,
    userId: String(user.id),
    deviceId: device.id || request.get?.("x-device-id") || "web",
    name: device.name || "Web browser",
    platform: device.platform || "web",
    ip: request.ip,
    userAgent: request.get?.("user-agent") || "",
    lastActiveAt: new Date().toISOString(),
  });
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id, sessionId),
  };
}

export async function register(input, request) {
  if (await findUserByEmail(input.email, true)) throw new AppError("An account with this email already exists.", 409);
  const user = await createUser(input);
  return sessionResult(user, request);
}

export async function login(input, request) {
  const user = await findUserByEmail(input.email, true);
  if (!user || !(await compareUserPassword(user, input.password))) {
    throw new AppError("Email or password is incorrect.", 401);
  }
  if (user.disabled) throw new AppError("This account has been disabled.", 403);
  await updateUser(user.id, { isOnline: true, lastSeen: new Date().toISOString() });
  return sessionResult(user, request);
}

export async function refreshSession(token, request) {
  if (!token) throw new AppError("Refresh session is missing.", 401);
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError("Refresh session is invalid or expired.", 401);
  }
  const session = sessions.get(payload.sid);
  if (!session || session.userId !== String(payload.sub)) throw new AppError("Refresh session has been revoked.", 401);
  const user = await findUserById(payload.sub);
  if (!user) throw new AppError("Account not found.", 401);
  return sessionResult(user, request, payload.sid);
}

export async function logout(token, allDevices, userId) {
  if (allDevices) {
    for (const [id, session] of sessions) if (session.userId === String(userId)) sessions.delete(id);
  } else if (token) {
    try {
      sessions.delete(verifyRefreshToken(token).sid);
    } catch {
      // An invalid or already-expired cookie is equivalent to a logged-out session.
    }
  }
  await updateUser(userId, { isOnline: false, lastSeen: new Date().toISOString() });
}

export async function startOtp(email, purpose) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail, true);
  if (!user) return {};
  const otp = String(crypto.randomInt(100_000, 1_000_000));
  const entry = { otp, purpose, expiresAt: Date.now() + 10 * 60_000, attempts: 0 };
  otpStore.set(normalizedEmail, entry);
  const redis = redisClient();
  if (redis) await redis.set(`otp:${normalizedEmail}:${purpose}`, JSON.stringify(entry), "PX", 10 * 60_000);
  return env.isProduction ? {} : { debugOtp: otp };
}

export async function verifyOtp(email, otp, purpose, newPassword) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const redis = redisClient();
  let entry = otpStore.get(normalizedEmail);
  if (redis) {
    const cached = await redis.get(`otp:${normalizedEmail}:${purpose}`);
    if (cached) entry = JSON.parse(cached);
  }
  if (!entry || entry.purpose !== purpose || entry.expiresAt < Date.now()) throw new AppError("OTP is invalid or expired.", 400);
  entry.attempts += 1;
  if (entry.attempts > 5 || entry.otp !== String(otp)) throw new AppError("OTP is invalid or expired.", 400);
  const user = await findUserByEmail(normalizedEmail, true);
  if (purpose === "reset") {
    if (!newPassword) throw new AppError("A new password is required.", 422);
    await updatePassword(user.id, newPassword);
  } else {
    await updateUser(user.id, { verified: true });
  }
  otpStore.delete(normalizedEmail);
  if (redis) await redis.del(`otp:${normalizedEmail}:${purpose}`);
  return { verified: true };
}

export async function getSessions(userId) {
  return [...sessions.values()].filter((session) => session.userId === String(userId));
}
