// File: server/controllers/conversationController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createConversation,
  deleteConversationForUser,
  findUserById,
  getConversation,
  getConversations,
  isBlockedBetween,
  leaveConversation,
  updateConversation,
} from "../services/dataService.js";
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
  if (request.body.type === "direct") {
    const targets = [...new Set((request.body.participants || []).map(String).filter((id) => id !== String(request.user.id)))];
    if (targets.length !== 1) throw new AppError("A direct conversation must contain exactly one other user.", 422);
    if (await isBlockedBetween(request.user.id, targets[0])) {
      throw new AppError("You cannot start a conversation with a user who has blocked you or whom you have blocked.", 403);
    }
  }
  const conversation = await createConversation(request.user.id, {
    ...request.body,
    name: cleanText(request.body.name, 100),
  });
  if (!conversation) throw new AppError("Conversation could not be created.", 403);
  request.app.get("io")?.to(conversation.participants).emit("group:update", conversation);
  response.status(201).json({ success: true, data: conversation });
});

export const update = asyncHandler(async (request, response) => {
  const current = await getConversation(request.params.id, request.user.id);
  if (!current) throw new AppError("Conversation not found.", 404);

  const personalFlags = ["muted", "pinned", "favorite", "archived"];
  const groupFields = ["name", "avatar", "color", "participants", "admins"];
  const requestedGroupFields = groupFields.filter((key) => request.body[key] !== undefined);
  const updates = Object.fromEntries(
    Object.entries(request.body).filter(([key]) => [...personalFlags, ...groupFields].includes(key)),
  );

  if (requestedGroupFields.length) {
    if (current.type !== "group") throw new AppError("Only group conversations have editable shared details.", 403);
    if (!current.admins?.map(String).includes(String(request.user.id))) {
      throw new AppError("Only group admins can change shared conversation details.", 403);
    }
    await validateGroupMembers(current, updates);
  }

  if (updates.name) updates.name = cleanText(updates.name, 100);
  const conversation = await updateConversation(request.params.id, request.user.id, updates);
  if (!conversation) throw new AppError("Conversation not found.", 404);
  const removedParticipants = current.participants.filter((id) => !conversation.participants.map(String).includes(String(id)));
  removeSocketsFromConversation(request.app.get("io"), removedParticipants, conversation.id);
  if (requestedGroupFields.length) {
    request.app.get("io")?.to([...new Set([...current.participants, ...conversation.participants])]).emit("group:update", conversation);
  } else {
    request.app.get("io")?.to(String(request.user.id)).emit("group:update", conversation);
  }
  response.json({ success: true, data: conversation });
});

export const leave = asyncHandler(async (request, response) => {
  const conversation = await getConversation(request.params.id, request.user.id);
  if (!conversation) throw new AppError("Conversation not found.", 404);
  if (conversation.type !== "group") throw new AppError("Direct conversations cannot be left. Archive or delete it for yourself instead.", 400);
  const result = await leaveConversation(request.params.id, request.user.id);
  if (!result) throw new AppError("Conversation not found.", 404);
  removeSocketsFromConversation(request.app.get("io"), [request.user.id], result.id);
  request.app.get("io")?.to([...new Set([...conversation.participants, ...result.participants])]).emit("group:update", result);
  response.json({ success: true, data: { id: conversation.id, left: true, admins: result.admins } });
});

export const remove = asyncHandler(async (request, response) => {
  const result = await deleteConversationForUser(request.params.id, request.user.id);
  if (!result) throw new AppError("Conversation not found.", 404);
  removeSocketsFromConversation(request.app.get("io"), [request.user.id], request.params.id);
  response.status(204).end();
});

async function validateGroupMembers(current, updates) {
  const participants = updates.participants ? [...new Set(updates.participants.map(String))] : current.participants.map(String);
  const admins = updates.admins ? [...new Set(updates.admins.map(String))] : current.admins.map(String);

  if (!participants.length) throw new AppError("A group must keep at least one participant.", 422);
  if (!admins.length) throw new AppError("A group must keep at least one admin.", 422);
  if (admins.some((id) => !participants.includes(id))) {
    throw new AppError("Every group admin must also be a participant.", 422);
  }

  const validUsers = await Promise.all(participants.map((id) => findUserById(id)));
  if (validUsers.some((user) => !user)) throw new AppError("One or more group participants do not exist.", 422);
  updates.participants = participants;
  updates.admins = admins;
}

function removeSocketsFromConversation(io, userIds, conversationId) {
  for (const userId of userIds) io?.in(String(userId)).socketsLeave(`conversation:${conversationId}`);
}
