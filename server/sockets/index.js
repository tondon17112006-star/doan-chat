import { verifyAccessToken } from "../utils/tokens.js";
import { findUserById, getConversation, isBlockedBetween, setUserPresence } from "../services/dataService.js";

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
    socket.join(String(user.id));
    const online = await setUserPresence(user.id, true);
    socket.broadcast.emit("presence:update", { userId: user.id, isOnline: true, lastSeen: online?.lastSeen });

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
    socket.on("call:start", async (call = {}) => {
      const conversation = await getConversation(call.conversationId, user.id);
      if (!conversation) return;
      const directPeer = conversation.type === "direct" && conversation.participants.map(String).find((id) => id !== String(user.id));
      if (directPeer && isBlockedBetween(user.id, directPeer)) return;
      const allowedRecipients = new Set(conversation.participants.map(String).filter((id) => id !== String(user.id)));
      for (const targetId of call.participants || []) {
        if (!allowedRecipients.has(String(targetId))) continue;
        io.to(String(targetId)).emit("call:incoming", { ...call, caller: user, incoming: true });
      }
    });
    socket.on("call:accept", async ({ callerId, conversationId } = {}) => {
      const conversation = await getConversation(conversationId, user.id);
      if (!canSignalCall(conversation, user.id, callerId)) return;
      io.to(String(callerId)).emit("call:accepted", { conversationId, user: { id: user.id, username: user.username } });
    });
    socket.on("call:reject", async ({ callerId, conversationId } = {}) => {
      const conversation = await getConversation(conversationId, user.id);
      if (!canSignalCall(conversation, user.id, callerId)) return;
      io.to(String(callerId)).emit("call:rejected", { userId: user.id, conversationId });
    });
    socket.on("call:end", async ({ conversationId } = {}) => {
      const conversation = await getConversation(conversationId, user.id);
      const directPeer = conversation?.type === "direct" && conversation.participants.find((id) => String(id) !== String(user.id));
      if (!conversation || (directPeer && isBlockedBetween(user.id, directPeer))) return;
      socket.to(`conversation:${conversationId}`).emit("call:ended", { userId: user.id });
    });
    for (const event of ["webrtc:offer", "webrtc:answer", "webrtc:ice"]) {
      socket.on(event, async ({ targetId, conversationId, ...payload } = {}) => {
        const conversation = await getConversation(conversationId, user.id);
        if (!canSignalCall(conversation, user.id, targetId)) return;
        io.to(String(targetId)).emit(event, { ...payload, conversationId, fromId: user.id });
      });
    }
    socket.on("disconnect", async () => {
      const remaining = await io.in(String(user.id)).fetchSockets();
      if (remaining.length) return;
      const offline = await setUserPresence(user.id, false);
      socket.broadcast.emit("presence:update", { userId: user.id, isOnline: false, lastSeen: offline?.lastSeen });
    });
  });
}

function canSignalCall(conversation, userId, targetId) {
  if (String(targetId) === String(userId)) return false;
  if (!conversation?.participants?.map(String).includes(String(targetId))) return false;
  if (conversation.type !== "direct") return true;
  return !isBlockedBetween(userId, targetId);
}
