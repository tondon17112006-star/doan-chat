import crypto from "node:crypto";
import { env } from "../config/env.js";
import { databaseReady } from "../config/database.js";
import { redisClient } from "../config/redis.js";
import { RefreshSession } from "../models/RefreshSession.js";
import { AppError } from "../utils/AppError.js";
import { publicUser } from "../utils/helpers.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { compareUserPassword, createUser, findUserByEmail, findUserById, updatePassword, updateUser } from "./dataService.js";
import { sendOtpEmail } from "./mailService.js";

const sessions = new Map();
const otpStore = new Map();

function now() {
  return new Date().toISOString();
}

function refreshTtlSeconds() {
  const match = String(env.refreshTtl || "30d").trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 30 * 86_400;
  const amount = Number(match[1]);
  const units = { s: 1, m: 60, h: 3_600, d: 86_400 };
  return Math.max(60, amount * (units[match[2]?.toLowerCase()] || 1));
}

const sessionKey = (sessionId) => `auth:session:${sessionId}`;
const userSessionsKey = (userId) => `auth:sessions:${userId}`;
const otpKey = (email, purpose) => `otp:${email}:${purpose}`;

function sessionExpiry() {
  return new Date(Date.now() + refreshTtlSeconds() * 1_000);
}

function refreshSessionId(token) {
  if (!token) return null;
  try {
    return verifyRefreshToken(token).sid;
  } catch {
    return null;
  }
}

async function storeSession(session) {
  sessions.set(session.id, session);
  if (databaseReady()) {
    await RefreshSession.findByIdAndUpdate(
      session.id,
      { $set: { userId: session.userId, deviceId: session.deviceId, name: session.name, platform: session.platform, ip: session.ip || "", userAgent: session.userAgent || "", remember: session.remember, lastActiveAt: session.lastActiveAt, expiresAt: session.expiresAt, revokedAt: null } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
  const redis = redisClient();
  if (!redis) return;
  const ttl = refreshTtlSeconds();
  await redis
    .multi()
    .set(sessionKey(session.id), JSON.stringify(session), "EX", ttl)
    .sadd(userSessionsKey(session.userId), session.id)
    .expire(userSessionsKey(session.userId), ttl)
    .exec();
}

async function readSession(sessionId) {
  const redis = redisClient();
  if (redis) {
    const cached = await redis.get(sessionKey(sessionId));
    if (cached) {
      try {
        const session = JSON.parse(cached);
        sessions.set(session.id, session);
        return session;
      } catch {
        await redis.del(sessionKey(sessionId));
      }
    }
  }
  if (databaseReady()) {
    const stored = await RefreshSession.findOne({ _id: String(sessionId), revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!stored) {
      sessions.delete(String(sessionId));
      return null;
    }
    const session = { ...stored, id: String(stored._id) };
    sessions.set(session.id, session);
    return session;
  }
  return sessions.get(String(sessionId)) || null;
}

async function removeSession(sessionId, userId) {
  const id = String(sessionId);
  const known = await readSession(id);
  sessions.delete(id);
  if (databaseReady()) await RefreshSession.updateOne({ _id: id, ...(userId ? { userId: String(userId) } : {}) }, { $set: { revokedAt: new Date() } });
  const redis = redisClient();
  if (redis) {
    const ownerId = String(known?.userId || userId || "");
    const transaction = redis.multi().del(sessionKey(id));
    if (ownerId) transaction.srem(userSessionsKey(ownerId), id);
    await transaction.exec();
  }
  return known;
}

async function consumeSession(sessionId) {
  const id = String(sessionId);
  const redis = redisClient();
  if (!redis) {
    if (databaseReady()) {
      const stored = await RefreshSession.findOneAndUpdate(
        { _id: id, revokedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { revokedAt: new Date() } },
        { new: false },
      ).lean();
      sessions.delete(id);
      return stored ? { ...stored, id: String(stored._id) } : null;
    }
    const session = sessions.get(id) || null;
    sessions.delete(id);
    return session;
  }
  const cached = await redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value;",
    1,
    sessionKey(id),
  );
  sessions.delete(id);
  if (!cached) {
    if (!databaseReady()) return null;
    const stored = await RefreshSession.findOneAndUpdate(
      { _id: id, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date() } },
      { new: false },
    ).lean();
    return stored ? { ...stored, id: String(stored._id) } : null;
  }
  try {
    const session = JSON.parse(cached);
    if (databaseReady()) await RefreshSession.updateOne({ _id: id }, { $set: { revokedAt: new Date() } });
    await redis.srem(userSessionsKey(session.userId), id);
    return session;
  } catch {
    return null;
  }
}

async function sessionsForUser(userId) {
  const id = String(userId);
  const redis = redisClient();
  if (!redis) {
    if (databaseReady()) {
      const stored = await RefreshSession.find({ userId: id, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
      return stored.map((session) => ({ ...session, id: String(session._id) }));
    }
    return [...sessions.values()].filter((session) => session.userId === id);
  }
  const sessionIds = await redis.smembers(userSessionsKey(id));
  const stored = await Promise.all(sessionIds.map((sessionId) => readSession(sessionId)));
  const active = stored.filter((session) => session?.userId === id);
  const staleIds = sessionIds.filter((sessionId, index) => !stored[index]);
  if (staleIds.length) await redis.srem(userSessionsKey(id), ...staleIds);
  return active;
}

async function revokeUserSessions(userId, exceptSessionId = null) {
  const activeSessions = await sessionsForUser(userId);
  const removed = activeSessions.filter((session) => session.id !== exceptSessionId);
  await Promise.all(removed.map((session) => removeSession(session.id, userId)));
  return removed.length;
}

async function sessionResult(user, request, previousSession = null, previousSessionConsumed = false) {
  if (previousSession && !previousSessionConsumed) await removeSession(previousSession.id, user.id);
  const device = request.body?.device || {};
  const session = {
    id: crypto.randomUUID(),
    userId: String(user.id),
    deviceId: String(device.id || request.get?.("x-device-id") || previousSession?.deviceId || "web").slice(0, 200),
    name: String(device.name || previousSession?.name || "Web browser").slice(0, 120),
    platform: String(device.platform || previousSession?.platform || "web").slice(0, 80),
    ip: request.ip,
    userAgent: request.get?.("user-agent") || previousSession?.userAgent || "",
    remember: request.body?.remember ?? previousSession?.remember ?? true,
    lastActiveAt: now(),
    createdAt: previousSession?.createdAt || now(),
    expiresAt: sessionExpiry(),
  };
  await storeSession(session);
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id, session.id),
    remember: session.remember,
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
  await updateUser(user.id, { isOnline: true, lastSeen: now() });
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
  const previousSession = await consumeSession(payload.sid);
  if (!previousSession || previousSession.userId !== String(payload.sub)) throw new AppError("Refresh session has been revoked.", 401);
  const user = await findUserById(payload.sub);
  if (!user || user.disabled) throw new AppError("Account not found.", 401);
  return sessionResult(user, request, previousSession, true);
}

export async function logout(token, allDevices, userId) {
  const currentSessionId = refreshSessionId(token);
  if (allDevices) {
    await revokeUserSessions(userId);
  } else if (currentSessionId) {
    const currentSession = await readSession(currentSessionId);
    if (currentSession?.userId === String(userId)) await removeSession(currentSessionId, userId);
  }
  if (!(await sessionsForUser(userId)).length) {
    await updateUser(userId, { isOnline: false, lastSeen: now() });
  }
}

export async function revokeSession(userId, sessionId, currentRefreshToken) {
  const session = await readSession(sessionId);
  if (!session || session.userId !== String(userId)) throw new AppError("Session not found.", 404);
  await removeSession(session.id, userId);
  const isCurrent = session.id === refreshSessionId(currentRefreshToken);
  if (!(await sessionsForUser(userId)).length) {
    await updateUser(userId, { isOnline: false, lastSeen: now() });
  }
  return { isCurrent };
}

export async function logoutOtherSessions(userId, currentRefreshToken) {
  const currentSessionId = refreshSessionId(currentRefreshToken);
  const currentSession = currentSessionId && await readSession(currentSessionId);
  if (!currentSession || currentSession.userId !== String(userId)) {
    throw new AppError("Your current refresh session is missing or revoked.", 401);
  }
  return { revoked: await revokeUserSessions(userId, currentSessionId) };
}

export async function revokeOtherSessionsAfterPasswordChange(userId, currentRefreshToken) {
  const currentSessionId = refreshSessionId(currentRefreshToken);
  const currentSession = currentSessionId && await readSession(currentSessionId);
  return revokeUserSessions(userId, currentSession?.userId === String(userId) ? currentSessionId : null);
}

export async function startOtp(email, purpose) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail, true);
  if (!user) return {};
  const otp = String(crypto.randomInt(100_000, 1_000_000));
  const entry = { otp, purpose, expiresAt: Date.now() + 10 * 60_000, attempts: 0 };
  otpStore.set(otpKey(normalizedEmail, purpose), entry);
  const redis = redisClient();
  if (redis) await redis.set(otpKey(normalizedEmail, purpose), JSON.stringify(entry), "PX", 10 * 60_000);
  if (env.isProduction) {
    try {
      if (!(await sendOtpEmail(normalizedEmail, otp, purpose))) {
        throw new AppError("Email delivery is not configured. Please contact support.", 503);
      }
    } catch (error) {
      otpStore.delete(otpKey(normalizedEmail, purpose));
      if (redis) await redis.del(otpKey(normalizedEmail, purpose));
      if (error instanceof AppError) throw error;
      throw new AppError("Email delivery is temporarily unavailable. Please try again later.", 503);
    }
  }
  return env.isProduction ? {} : { debugOtp: otp };
}

export async function verifyOtp(email, otp, purpose, newPassword) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const key = otpKey(normalizedEmail, purpose);
  const redis = redisClient();
  let entry = otpStore.get(key);
  if (redis) {
    const cached = await redis.get(key);
    entry = cached ? JSON.parse(cached) : null;
  }
  if (!entry || entry.purpose !== purpose || entry.expiresAt < Date.now()) throw new AppError("OTP is invalid or expired.", 400);

  entry.attempts += 1;
  if (entry.attempts > 5 || entry.otp !== String(otp)) {
    const remaining = Math.max(1, entry.expiresAt - Date.now());
    otpStore.set(key, entry);
    if (redis) await redis.set(key, JSON.stringify(entry), "PX", remaining);
    throw new AppError("OTP is invalid or expired.", 400);
  }

  const user = await findUserByEmail(normalizedEmail, true);
  if (!user) throw new AppError("OTP is invalid or expired.", 400);
  if (purpose === "reset") {
    if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
      throw new AppError("A new password must be between 8 and 128 characters.", 422);
    }
    await updatePassword(user.id, newPassword);
    await revokeUserSessions(user.id);
  } else {
    await updateUser(user.id, { verified: true });
  }
  otpStore.delete(key);
  if (redis) await redis.del(key);
  return { verified: true };
}

export async function getSessions(userId, currentRefreshToken) {
  const currentSessionId = refreshSessionId(currentRefreshToken);
  return (await sessionsForUser(userId))
    .sort((left, right) => new Date(right.lastActiveAt) - new Date(left.lastActiveAt))
    .map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
}

export async function resetAuthMemory() {
  sessions.clear();
  otpStore.clear();
}
