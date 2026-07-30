// File: server/controllers/conversationController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { createConversation, getConversation, getConversations, updateConversation } from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";
import { cleanText } from "../utils/helpers.js";

export const list = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getConversations(request.user.id) });
});

export const getOne = asyncHandler(async (request, response) => {
  const conversation = await getConversation(request.params.id, request.user.id);
  if (!conversation) throw new AppError("Conversation not found.", 404);
  response.json({ success: true, data: conversation });
});

export const create = asyncHandler(async (request, response) => {
  const conversation = await createConversation(request.user.id, {
    ...request.body,
    name: cleanText(request.body.name, 100),
  });
  request.app.get("io")?.to(conversation.participants).emit("group:update", conversation);
  response.status(201).json({ success: true, data: conversation });
});

export const update = asyncHandler(async (request, response) => {
  const allowed = ["name", "avatar", "color", "participants", "admins", "muted", "pinned", "favorite", "archived"];
  const updates = Object.fromEntries(Object.entries(request.body).filter(([key]) => allowed.includes(key)));
  if (updates.name) updates.name = cleanText(updates.name, 100);
  const conversation = await updateConversation(request.params.id, request.user.id, updates);
  if (!conversation) throw new AppError("Conversation not found.", 404);
  request.app.get("io")?.to(`conversation:${request.params.id}`).emit("group:update", conversation);
  response.json({ success: true, data: conversation });
});

export const leave = asyncHandler(async (request, response) => {
  const conversation = await getConversation(request.params.id, request.user.id);
  if (!conversation) throw new AppError("Conversation not found.", 404);
  const participants = conversation.participants.filter((id) => String(id) !== request.user.id);
  const updated = await updateConversation(request.params.id, request.user.id, { participants });
  response.json({ success: true, data: updated });
});
