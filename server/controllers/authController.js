// File: server/controllers/authController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";
import { audit } from "../services/auditService.js";
import { env } from "../config/env.js";

const cookieOptions = (remember = true) => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  maxAge: (remember ? 30 : 7) * 86_400_000,
  path: "/api/auth",
});

export const register = asyncHandler(async (request, response) => {
  const result = await authService.register(request.body, request);
  response.cookie("lumina_refresh", result.refreshToken, cookieOptions(request.body.remember));
  await audit({ ...request, user: result.user }, "login", "user", result.user.id, { kind: "register" });
  response.status(201).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

export const login = asyncHandler(async (request, response) => {
  const result = await authService.login(request.body, request);
  response.cookie("lumina_refresh", result.refreshToken, cookieOptions(request.body.remember));
  await audit({ ...request, user: result.user }, "login", "user", result.user.id);
  response.json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

export const demo = asyncHandler(async (request, response) => {
  request.body = { email: "alex@lumina.chat", password: "Password123!", remember: true, ...request.body };
  const result = await authService.login(request.body, request);
  response.cookie("lumina_refresh", result.refreshToken, cookieOptions(true));
  response.json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

export const refresh = asyncHandler(async (request, response) => {
  const result = await authService.refreshSession(request.cookies.lumina_refresh || request.body.refreshToken, request);
  response.cookie("lumina_refresh", result.refreshToken, cookieOptions(result.remember));
  response.json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
});

export const logout = asyncHandler(async (request, response) => {
  await authService.logout(request.cookies.lumina_refresh, Boolean(request.body.allDevices), request.user.id);
  response.clearCookie("lumina_refresh", { path: "/api/auth" });
  await audit(request, "logout", "user", request.user.id);
  response.status(204).end();
});

export const forgotPassword = asyncHandler(async (request, response) => {
  const result = await authService.startOtp(request.body.email, "reset");
  response.json({ success: true, data: result, message: "If that account exists, an OTP has been sent." });
});

export const sendVerification = asyncHandler(async (request, response) => {
  const result = await authService.startOtp(request.body.email, "verify");
  response.json({ success: true, data: result });
});

export const verifyOtp = asyncHandler(async (request, response) => {
  const result = await authService.verifyOtp(
    request.body.email,
    request.body.otp,
    request.body.purpose,
    request.body.newPassword,
  );
  response.json({ success: true, data: result });
});

export const sessions = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await authService.getSessions(request.user.id, request.cookies.lumina_refresh) });
});

export const revokeSession = asyncHandler(async (request, response) => {
  const result = await authService.revokeSession(request.user.id, request.params.id, request.cookies.lumina_refresh);
  if (result.isCurrent) response.clearCookie("lumina_refresh", { path: "/api/auth" });
  await audit(request, "logout", "session", request.params.id, { kind: "single-session" });
  response.status(204).end();
});

export const logoutOthers = asyncHandler(async (request, response) => {
  const result = await authService.logoutOtherSessions(request.user.id, request.cookies.lumina_refresh);
  await audit(request, "logout", "session", null, { kind: "other-sessions", revoked: result.revoked });
  response.json({ success: true, data: result });
});
