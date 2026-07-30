// File: server/controllers/socialController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCall,
  createStory,
  friendAction,
  getCalls,
  getNotifications,
  getStories,
  markNotificationsRead,
  viewStory,
} from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";

export const stories = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getStories(request.user.id) });
});

export const addStory = asyncHandler(async (request, response) => {
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
  const call = await createCall(request.user.id, request.body);
  response.status(201).json({ success: true, data: call });
});

export const friend = asyncHandler(async (request, response) => {
  const result = await friendAction(request.user.id, request.params.id, request.body.action);
  if (!result) throw new AppError("Friend request or user not found.", 404);
  request.app.get("io")?.to(String(request.params.id)).emit("friend:update", result);
  response.json({ success: true, data: result });
});
