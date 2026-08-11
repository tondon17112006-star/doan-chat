// File: server/controllers/socialController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCall,
  createStory,
  assertOwnedUploadPurpose,
  friendAction,
  getCalls,
  getNotifications,
  getStories,
  isDirectConversationBlocked,
  listFriendRequests,
  listFriends,
  markNotificationsRead,
  viewStory,
} from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";

export const stories = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getStories(request.user.id) });
});

export const addStory = asyncHandler(async (request, response) => {
  await assertOwnedUploadPurpose(request.user.id, request.body.mediaUrl, "story");
  const story = await createStory(request.user.id, request.body);
  request.app.get("io")?.emit("story:new", story);
  response.status(201).json({ success: true, data: story });
});

export const seeStory = asyncHandler(async (request, response) => {
  const story = await viewStory(request.params.id, request.user.id, request.body.reaction);
  if (!story) throw new AppError("Story not found.", 404);
  response.json({ success: true, data: story });
});

export const notifications = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getNotifications(request.user.id) });
});

export const readNotifications = asyncHandler(async (request, response) => {
  await markNotificationsRead(request.user.id);
  response.status(204).end();
});

export const calls = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getCalls(request.user.id) });
});

export const addCall = asyncHandler(async (request, response) => {
  const blocked = await isDirectConversationBlocked(request.body.conversationId, request.user.id);
  if (blocked) throw new AppError("You cannot call a user who has blocked you or whom you have blocked.", 403);
  const call = await createCall(request.user.id, request.body);
  if (!call) throw new AppError("Conversation not found.", 404);
  response.status(201).json({ success: true, data: call });
});

export const friends = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listFriends(request.user.id) });
});

export const receivedRequests = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listFriendRequests(request.user.id, "received") });
});

export const sentRequests = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listFriendRequests(request.user.id, "sent") });
});

export const friend = asyncHandler(async (request, response) => {
  const result = await friendAction(request.user.id, request.params.id, request.body.action);
  if (!result) throw new AppError("Friend request or user not found.", 404);
  request.app.get("io")?.to(result.affectedUserIds).emit("friend:update", { action: result.action, userId: request.user.id });
  response.json({ success: true, data: result });
});
