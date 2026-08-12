import { randomUUID } from "node:crypto";
import { getIceServers, webrtcConfig } from "../config/webrtc.js";
import { redisClient } from "../config/redis.js";
import {
  createCall,
  createRealtimeNotification,
  findUserById,
  getConversation,
  isBlockedBetween,
  setUserPresence,
  updateCall,
} from "../services/dataService.js";
import { emitToUsers, onlineUserIds } from "../services/realtimeService.js";
import { publicUser } from "../utils/helpers.js";
import { verifyAccessToken } from "../utils/tokens.js";

const CALL_TIMEOUT_MS = webrtcConfig.callTimeoutMs;
const activeCalls = new Map();
const callTimers = new Map();
const pendingOffline = new Map();

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const payload = verifyAccessToken(socket.handshake.auth?.token || "");
      const user = await findUserById(payload.sub);
      if (!user) return next(new Error("unauthorized"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user;
    const userId = String(user.id);
    const wasOnline = (await onlineUserIds(io, [userId])).length > 0;
    clearPendingOffline(userId);
    socket.join(userId);
    const online = await setUserPresence(user.id, true);
    if (!wasOnline) socket.broadcast.emit("presence:update", { userId: user.id, isOnline: true, lastSeen: online?.lastSeen });
    emitSocket(socket, "webrtc:config", { iceServers: getIceServers(), callTimeoutMs: CALL_TIMEOUT_MS });

    socket.on("webrtc:config:request", (acknowledge) => {
      const config = { iceServers: getIceServers(), callTimeoutMs: CALL_TIMEOUT_MS };
      if (typeof acknowledge === "function") acknowledge(config);
      else emitSocket(socket, "webrtc:config", config);
    });

    socket.on("conversation:join", async (conversationId) => {
      if (await getConversation(conversationId, user.id)) socket.join(`conversation:${conversationId}`);
    });
    socket.on("conversation:leave", async (conversationId) => {
      if (await getConversation(conversationId, user.id)) socket.leave(`conversation:${conversationId}`);
    });
    socket.on("typing:start", async ({ conversationId, activity = "typing" } = {}) => {
      if (!(await getConversation(conversationId, user.id))) return;
      socket.to(`conversation:${conversationId}`).emit("typing:start", {
        conversationId,
        activity,
        user: { id: user.id, username: user.username, avatar: user.avatar },
      });
    });
    socket.on("typing:stop", async ({ conversationId } = {}) => {
      if (!(await getConversation(conversationId, user.id))) return;
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId: user.id });
    });

    socket.on("call:start", async (call = {}, acknowledge) => {
      const conversation = await getConversation(call.conversationId, user.id);
      if (!conversation) return acknowledge?.({ ok: false, error: "Conversation not found." });
      const candidates = new Set(conversation.participants.map(String).filter((id) => id !== userId));
      const requested = Array.isArray(call.participants) ? call.participants.map(String) : [...candidates];
      const recipients = requested.filter((id) => candidates.has(id) && id !== userId);
      if (!recipients.length) return acknowledge?.({ ok: false, error: "No eligible call recipient." });
      const allowedRecipients = [];
      for (const targetId of recipients) {
        if (await canSignalCall(conversation, user.id, targetId)) allowedRecipients.push(targetId);
      }
      if (!allowedRecipients.length) return acknowledge?.({ ok: false, error: "Call recipient is unavailable." });

      const callId = validCallId(call.callId) ? call.callId : randomUUID();
      if (await readActiveCall(callId)) return acknowledge?.({ ok: true, callId });
      const online = new Set(await onlineUserIds(io, allowedRecipients));
      const session = {
        callId,
        conversationId: String(call.conversationId),
        callerId: userId,
        type: call.type === "video" ? "video" : "voice",
        startedAt: Date.now(),
        acceptedAt: null,
        recipients: allowedRecipients,
        records: [],
      };

      for (const targetId of allowedRecipients) {
        const status = online.has(targetId) ? "ringing" : "missed";
        const [outgoing, incoming] = await Promise.all([
          createCall(userId, { conversationId: session.conversationId, peer: { id: targetId }, participants: [targetId], type: session.type, status, direction: "outgoing" }),
          createCall(targetId, { conversationId: session.conversationId, peer: { id: userId }, participants: [userId], type: session.type, status, direction: "incoming" }),
        ]);
        session.records.push({ targetId, outgoingId: outgoing?.id, incomingId: incoming?.id, online: online.has(targetId) });
        if (online.has(targetId)) {
          emitToUsers(io, [targetId], "call:incoming", { ...call, callId, conversationId: session.conversationId, type: session.type, caller: publicUser(user), incoming: true, status: "ringing" });
        } else {
          await createRealtimeNotification(targetId, userId, {
            type: "call",
            title: `Missed ${session.type} call`,
            body: `${user.username} tried to call you`,
            data: { conversationId: session.conversationId, callId },
          });
        }
      }

      const ringing = session.records.some((record) => record.online);
      if (!ringing) {
        emitSocket(socket, "call:unavailable", { callId, conversationId: session.conversationId });
        return acknowledge?.({ ok: true, callId, ringing: false });
      }
      await storeActiveCall(session);
      armCallTimeout(io, session);
      emitSocket(socket, "call:started", { callId, conversationId: session.conversationId, timeoutMs: CALL_TIMEOUT_MS });
      acknowledge?.({ ok: true, callId, ringing: true });
    });

    socket.on("call:accept", async ({ callId, callerId, conversationId } = {}) => {
      const session = await readActiveCall(callId);
      const conversation = await getConversation(conversationId || session?.conversationId, user.id);
      if (!session || String(session.callerId) !== String(callerId) || !session.recipients.includes(userId) || !(await canSignalCall(conversation, user.id, callerId))) return;
      const answeredAt = new Date().toISOString();
      session.acceptedAt = Date.now();
      for (const record of session.records.filter((item) => item.targetId === userId)) {
        await Promise.all([
          record.outgoingId && updateCall(record.outgoingId, { status: "accepted", answeredAt }),
          record.incomingId && updateCall(record.incomingId, { status: "accepted", answeredAt }),
        ]);
      }
      await storeActiveCall(session);
      emitToUsers(io, [session.callerId], "call:accepted", { callId: session.callId, conversationId: session.conversationId, user: { id: user.id, username: user.username } });
    });

    socket.on("call:reject", async ({ callId, callerId, conversationId } = {}) => {
      const session = await readActiveCall(callId);
      const conversation = await getConversation(conversationId || session?.conversationId, user.id);
      if (!session || String(session.callerId) !== String(callerId) || !session.recipients.includes(userId) || !(await canSignalCall(conversation, user.id, callerId))) return;
      await finishCall(io, session, "rejected", userId);
      emitToUsers(io, [session.callerId], "call:rejected", { callId: session.callId, userId, conversationId: session.conversationId });
    });

    socket.on("call:end", async ({ callId, conversationId } = {}) => {
      const session = await readActiveCall(callId);
      const conversation = await getConversation(conversationId || session?.conversationId, user.id);
      if (!session || !conversation || !callParticipant(session, userId)) return;
      await finishCall(io, session, session.acceptedAt ? "ended" : "missed");
      emitToUsers(io, [session.callerId, ...session.recipients], "call:ended", { callId: session.callId, conversationId: session.conversationId, userId });
    });

    for (const event of ["webrtc:offer", "webrtc:answer", "webrtc:ice"]) {
      socket.on(event, async ({ targetId, conversationId, callId, ...payload } = {}) => {
        const conversation = await getConversation(conversationId, user.id);
        if (!(await canSignalCall(conversation, user.id, targetId))) return;
        const session = callId ? await readActiveCall(callId) : null;
        if (callId && (!session || !callParticipant(session, userId) || !callParticipant(session, targetId))) return;
        emitToUsers(io, [targetId], event, { ...payload, callId, conversationId, fromId: user.id });
      });
    }

    socket.on("disconnect", () => {
      scheduleOffline(io, user, socket);
    });
  });
}

function validCallId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,120}$/.test(value);
}

function callParticipant(session, userId) {
  return String(session.callerId) === String(userId) || session.recipients.includes(String(userId));
}

function emitSocket(socket, event, payload) {
  socket.emit?.(event, payload);
}

async function canSignalCall(conversation, userId, targetId) {
  if (String(targetId) === String(userId)) return false;
  if (!conversation?.participants?.map(String).includes(String(targetId))) return false;
  return !(await isBlockedBetween(userId, targetId));
}

function armCallTimeout(io, session) {
  clearTimeout(callTimers.get(session.callId));
  callTimers.set(session.callId, setTimeout(async () => {
    const current = await readActiveCall(session.callId);
    if (!current) return;
    await finishCall(io, current, "missed");
    emitToUsers(io, [current.callerId, ...current.recipients], "call:timeout", { callId: current.callId, conversationId: current.conversationId });
  }, CALL_TIMEOUT_MS));
}

async function finishCall(io, session, outcome, actorId = null) {
  clearTimeout(callTimers.get(session.callId));
  callTimers.delete(session.callId);
  const endedAt = new Date().toISOString();
  const duration = session.acceptedAt ? Math.max(0, Math.round((Date.now() - session.acceptedAt) / 1_000)) : 0;
  await Promise.all(session.records.flatMap((record) => {
    const outgoingStatus = outcome === "rejected" ? "ended" : outcome;
    const incomingStatus = outcome === "rejected" && record.targetId === String(actorId) ? "rejected" : outcome;
    return [
      record.outgoingId && updateCall(record.outgoingId, { status: outgoingStatus, duration, endedAt }),
      record.incomingId && updateCall(record.incomingId, { status: incomingStatus, duration, endedAt }),
    ].filter(Boolean);
  }));
  await removeActiveCall(session.callId);
}

function clearPendingOffline(userId) {
  const timer = pendingOffline.get(String(userId));
  if (timer) clearTimeout(timer);
  pendingOffline.delete(String(userId));
}

function scheduleOffline(io, user, socket) {
  const userId = String(user.id);
  clearPendingOffline(userId);
  pendingOffline.set(userId, setTimeout(async () => {
    const online = await onlineUserIds(io, [userId]);
    if (online.length) return;
    const offline = await setUserPresence(userId, false);
    socket.broadcast.emit("presence:update", { userId, isOnline: false, lastSeen: offline?.lastSeen });
    pendingOffline.delete(userId);
  }, 750));
}

function activeCallKey(callId) {
  return `lumina:call:${callId}`;
}

async function readActiveCall(callId) {
  if (!validCallId(callId)) return null;
  const redis = redisClient();
  if (redis) {
    const stored = await redis.get(activeCallKey(callId));
    if (stored) return JSON.parse(stored);
  }
  return activeCalls.get(callId) || null;
}

async function storeActiveCall(session) {
  activeCalls.set(session.callId, session);
  const redis = redisClient();
  if (redis) await redis.set(activeCallKey(session.callId), JSON.stringify(session), "EX", Math.ceil(CALL_TIMEOUT_MS / 1_000) + 30);
}

async function removeActiveCall(callId) {
  activeCalls.delete(callId);
  const redis = redisClient();
  if (redis) await redis.del(activeCallKey(callId));
}
