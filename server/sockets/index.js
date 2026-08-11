import { verifyAccessToken } from "../utils/tokens.js";
import { findUserById, getConversation, setUserPresence } from "../services/dataService.js";

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
    socket.on("conversation:leave", (conversationId) => socket.leave(`conversation:${conversationId}`));
    socket.on("typing:start", async ({ conversationId, activity = "typing" } = {}) => {
      if (!(await getConversation(conversationId, user.id))) return;
      socket.to(`conversation:${conversationId}`).emit("typing:start", {
        conversationId,
        activity,
        user: { id: user.id, username: user.username, avatar: user.avatar },
      });
    });
    socket.on("typing:stop", ({ conversationId } = {}) => {
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId: user.id });
    });
    socket.on("call:start", (call = {}) => {
      for (const targetId of call.participants || []) {
        io.to(String(targetId)).emit("call:incoming", { ...call, caller: user, incoming: true });
      }
    });
    socket.on("call:accept", ({ callerId, conversationId } = {}) => {
      io.to(String(callerId)).emit("call:accepted", { conversationId, user: { id: user.id, username: user.username } });
    });
    socket.on("call:reject", ({ callerId } = {}) => io.to(String(callerId)).emit("call:rejected", { userId: user.id }));
    socket.on("call:end", ({ conversationId } = {}) => socket.to(`conversation:${conversationId}`).emit("call:ended", { userId: user.id }));
    for (const event of ["webrtc:offer", "webrtc:answer", "webrtc:ice"]) {
      socket.on(event, ({ targetId, ...payload } = {}) => {
        if (targetId) io.to(String(targetId)).emit(event, { ...payload, fromId: user.id });
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
