// File: server/controllers/messageController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createMessage,
  deleteMessage,
  getMessages,
  markConversationRead,
  reactToMessage,
  togglePinnedMessage,
  updateMessage,
} from "../services/dataService.js";
import { generateAiReply } from "../services/aiService.js";
import { AppError } from "../utils/AppError.js";
import { cleanText } from "../utils/helpers.js";
import { audit } from "../services/auditService.js";

export const list = asyncHandler(async (request, response) => {
  const result = await getMessages(request.params.conversationId, request.user.id, request.query.before, request.query.limit);
  if (!result) throw new AppError("Conversation not found.", 404);
  response.json({ success: true, data: result });
});

export const create = asyncHandler(async (request, response) => {
  const input = {
    ...request.body,
    content: cleanText(request.body.content),
    attachments: Array.isArray(request.body.attachments) ? request.body.attachments.slice(0, 10) : [],
  };
  const message = await createMessage(request.user.id, request.params.conversationId, input);
  if (!message) throw new AppError("Conversation not found.", 404);
  request.app.get("io")?.to(`conversation:${request.params.conversationId}`).emit("message:new", message);
  response.status(201).json({ success: true, data: message });

  if (request.params.conversationId === "c-ai") {
    request.app.get("io")?.to(`conversation:${request.params.conversationId}`).emit("typing:start", {
      conversationId: request.params.conversationId,
      user: { id: "u-lumina", username: "Lumina AI" },
      activity: "typing",
    });
    const reply = await generateAiReply(input.content);
    const aiMessage = await createMessage("u-lumina", "c-ai", { type: "text", content: reply });
    request.app.get("io")?.to("conversation:c-ai").emit("typing:stop", { conversationId: "c-ai", userId: "u-lumina" });
    request.app.get("io")?.to("conversation:c-ai").emit("message:new", aiMessage);
  }
});

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
  await markConversationRead(request.params.conversationId, request.user.id);
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
