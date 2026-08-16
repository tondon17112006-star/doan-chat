// File: server/controllers/userController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { assertOwnedUploadPurpose, compareUserPassword, findUserByEmail, findUserById, getUserProfile, listUsers, updatePassword, updateUser } from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";
import { cleanText } from "../utils/helpers.js";
import { audit } from "../services/auditService.js";
import { revokeOtherSessionsAfterPasswordChange, sendVerificationOtp } from "../services/authService.js";

export const me = asyncHandler(async (request, response) => {
  response.json({ success: true, data: request.user });
});

export const list = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listUsers(request.query.q, request.user.id) });
});

export const profile = asyncHandler(async (request, response) => {
  const user = await getUserProfile(request.params.id, request.user.id);
  if (!user) throw new AppError("User not found.", 404);
  response.json({ success: true, data: user });
});

export const updateProfile = asyncHandler(async (request, response) => {
  const allowed = ["username", "bio", "birthday", "gender", "phone", "status", "location", "avatar", "coverPhoto"];
  const textLimits = { username: 80, bio: 500, gender: 40, phone: 40, status: 160, location: 120 };
  const updates = {};
  for (const key of allowed) {
    if (request.body[key] !== undefined) {
      updates[key] = textLimits[key] ? cleanText(request.body[key], textLimits[key]) : request.body[key];
    }
  }
  if (updates.avatar) await assertOwnedUploadPurpose(request.user.id, updates.avatar, "avatar");
  if (updates.coverPhoto) await assertOwnedUploadPurpose(request.user.id, updates.coverPhoto, "avatar");
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
  if (request.body.currentPassword === request.body.newPassword) {
    throw new AppError("Your new password must be different from your current password.", 422);
  }
  const updated = await updatePassword(request.user.id, request.body.newPassword);
  const otherSessionsRevoked = await revokeOtherSessionsAfterPasswordChange(request.user.id, request.cookies.lumina_refresh);
  await audit(request, "edit", "user", request.user.id, { fields: ["password"], otherSessionsRevoked });
  response.json({ success: true, data: { user: updated, otherSessionsRevoked }, message: "Password updated." });
});

export const changeEmail = asyncHandler(async (request, response) => {
  const user = await findUserById(request.user.id);
  const selectedUser = await findUserByEmail(user.email, true);
  if (!(await compareUserPassword(selectedUser, request.body.password))) throw new AppError("Password is incorrect.", 400);
  const updated = await updateUser(request.user.id, { email: request.body.email.toLowerCase(), verified: false });
  const verification = await sendVerificationOtp(updated.email);
  response.json({ success: true, data: { user: updated, verification } });
});
