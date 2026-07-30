// File: server/controllers/userController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { compareUserPassword, findUserByEmail, findUserById, listUsers, updatePassword, updateUser } from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";
import { cleanText, publicUser } from "../utils/helpers.js";
import { audit } from "../services/auditService.js";

export const me = asyncHandler(async (request, response) => {
  response.json({ success: true, data: request.user });
});

export const list = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listUsers(request.query.q, request.user.id) });
});

export const profile = asyncHandler(async (request, response) => {
  const user = await findUserById(request.params.id);
  if (!user) throw new AppError("User not found.", 404);
  response.json({ success: true, data: publicUser(user) });
});

export const updateProfile = asyncHandler(async (request, response) => {
  const allowed = ["username", "bio", "birthday", "gender", "phone", "status", "location", "avatar", "coverPhoto"];
  const updates = {};
  for (const key of allowed) {
    if (request.body[key] !== undefined) {
      updates[key] = ["username", "bio", "status", "location"].includes(key) ? cleanText(request.body[key], 280) : request.body[key];
    }
  }
  const user = await updateUser(request.user.id, updates);
  await audit(request, "edit", "user", request.user.id, { fields: Object.keys(updates) });
  response.json({ success: true, data: user });
});

export const changePassword = asyncHandler(async (request, response) => {
  const user = await findUserById(request.user.id);
  const selectedUser = await findUserByEmail(user.email, true);
  if (!(await compareUserPassword(selectedUser, request.body.currentPassword))) {
    throw new AppError("Current password is incorrect.", 400);
  }
  await updatePassword(request.user.id, request.body.newPassword);
  response.json({ success: true, message: "Password updated." });
});

export const changeEmail = asyncHandler(async (request, response) => {
  const user = await findUserById(request.user.id);
  const selectedUser = await findUserByEmail(user.email, true);
  if (!(await compareUserPassword(selectedUser, request.body.password))) throw new AppError("Password is incorrect.", 400);
  const updated = await updateUser(request.user.id, { email: request.body.email.toLowerCase(), verified: false });
  response.json({ success: true, data: updated });
});
