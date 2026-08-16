// File: server/controllers/messageController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createMessage,
  createRealtimeNotification,
  deleteMessage,
  getConversation,
  getMessages,
  isDirectConversationBlocked,
  markConversationRead,
  markMessageDelivered,
  reactToMessage,
  togglePinnedMessage,
  updateMessage,
} from "../services/dataService.js";
import { generateAiReply } from "../services/aiService.js";
import { AppError } from "../utils/AppError.js";
import { cleanText } from "../utils/helpers.js";
import { audit } from "../services/auditService.js";
import { emitToUsers, onlineUserIds } from "../services/realtimeService.js";

export const list = asyncHandler(async (request, response) => {
  const result = await getMessages(request.params.conversationId, request.user.id, request.query.before, request.query.limit);
  if (!result) throw new AppError("Conversation not found.", 404);
  response.json({ success: true, data: result });
});

export const create = asyncHandler(async (request, response) => {
  const blocked = await isDirectConversationBlocked(request.params.conversationId, request.user.id);
  if (blocked) throw new AppError("You cannot send messages in a blocked direct conversation.", 403);
  const input = {
    ...request.body,
    content: cleanText(request.body.content),
    attachments: Array.isArray(request.body.attachments)
      ? request.body.attachments.slice(0, 10).map(normalizeAttachment).filter(Boolean)
      : [],
  };
  if (!input.content && !input.attachments.length) {
    throw new AppError("A message must include text or at least one valid attachment.", 422);
  }
  const message = await createMessage(request.user.id, request.params.conversationId, input);
  if (!message) throw new AppError("Conversation not found.", 404);
  const io = request.app.get("io");
  const conversation = await getConversation(request.params.conversationId, request.user.id);
  const recipients = (conversation?.participants || []).map(String).filter((id) => id !== String(request.user.id));
  const onlineRecipients = io ? await onlineUserIds(io, recipients) : [];
  const delivered = onlineRecipients.length ? await markMessageDelivered(message.id) : message;
  emitToUsers(io, [...recipients, request.user.id], "message:new", delivered || message);
  for (const recipientId of recipients.filter((id) => !onlineRecipients.includes(id))) {
    await createRealtimeNotification(recipientId, request.user.id, {
      type: "message",
      title: `New message from ${request.user.username}`,
      body: message.content || "Sent an attachment",
      data: { conversationId: request.params.conversationId, messageId: message.id },
    });
  }
  response.status(201).json({ success: true, data: delivered || message });

  if (request.params.conversationId === "c-ai") void replyAsLumina(io, input.content);
});

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const url = String(attachment.url || "");
  const localUpload = /^\/api\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(url);
  if (!localUpload && !/^https:\/\//i.test(url)) return null;
  return {
    id: String(attachment.id || "").slice(0, 200),
    name: cleanText(String(attachment.name || "Attachment"), 255),
    type: String(attachment.type || "application/octet-stream").slice(0, 100),
    size: Math.max(0, Number(attachment.size) || 0),
    url,
    ...(attachment.duration ? { duration: Math.max(0, Number(attachment.duration) || 0) } : {}),
  };
}

async function replyAsLumina(io, content) {
  io?.to("conversation:c-ai").emit("typing:start", {
    conversationId: "c-ai",
    user: { id: "u-lumina", username: "Lumina AI" },
    activity: "typing",
  });
  try {
    const reply = await generateAiReply(content);
    const aiMessage = await createMessage("u-lumina", "c-ai", { type: "text", content: reply });
    io?.to("conversation:c-ai").emit("message:new", aiMessage);
  } catch (error) {
    console.error("Lumina AI reply failed:", error.message);
  } finally {
    io?.to("conversation:c-ai").emit("typing:stop", { conversationId: "c-ai", userId: "u-lumina" });
  }
}

export const edit = asyncHandler(async (request, response) => {
  const message = await updateMessage(request.params.id, request.user.id, cleanText(request.body.content));
  if (!message) throw new AppError("Message not found or cannot be edited.", 404);
  request.app.get("io")?.to(`conversation:${message.conversationId || message.conversation}`).emit("message:edit", message);
  await audit(request, "edit", "message", request.params.id);
  response.json({ success: true, data: message });
});

export const remove = asyncHandler(async (request, response) => {
  const message = await deleteMessage(request.params.id, request.user.id, request.query.everyone === "true");
  if (!message) throw new AppError("Message not found.", 404);
  request.app.get("io")?.to(`conversation:${message.conversationId || message.conversation}`).emit("message:delete", message);
  await audit(request, "delete", "message", request.params.id, { everyone: request.query.everyone === "true" });
  response.json({ success: true, data: message });
});

export const react = asyncHandler(async (request, response) => {
  const message = await reactToMessage(request.params.id, request.user.id, request.body.emoji || null);
  if (!message) throw new AppError("Message not found.", 404);
  request.app.get("io")?.to(`conversation:${message.conversationId || message.conversation}`).emit("reaction:update", message);
  response.json({ success: true, data: message });
});

export const read = asyncHandler(async (request, response) => {
  const marked = await markConversationRead(request.params.conversationId, request.user.id);
  if (!marked) throw new AppError("Conversation not found.", 404);
  const payload = { conversationId: request.params.conversationId, userId: request.user.id, readAt: new Date().toISOString() };
  request.app.get("io")?.to(`conversation:${request.params.conversationId}`).emit("message:seen", payload);
  response.json({ success: true, data: payload });
});

export const pin = asyncHandler(async (request, response) => {
  const message = await togglePinnedMessage(request.params.id, request.user.id);
  if (!message) throw new AppError("Message not found.", 404);
  request.app.get("io")?.to(`conversation:${message.conversationId || message.conversation}`).emit("message:edit", message);
  response.json({ success: true, data: message });
});
