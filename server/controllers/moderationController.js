import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { audit } from "../services/auditService.js";
import { createReport, listAdminUsers, listReports, setUserDisabled, updateReportStatus } from "../services/dataService.js";
import { revokeAllSessionsForUser } from "../services/authService.js";

export const create = asyncHandler(async (request, response) => {
  const report = await createReport(request.user.id, request.body);
  await audit(request, "report", request.body.targetType, request.body.targetId, { reportId: report.id, reason: report.reason });
  response.status(201).json({ success: true, data: report });
});

export const list = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await listReports(request.query.status) });
});

export const update = asyncHandler(async (request, response) => {
  const report = await updateReportStatus(request.params.id, request.user.id, request.body);
  if (!report) throw new AppError("Report not found.", 404);
  await audit(request, "admin", "report", report.id, { action: "status", status: report.status, resolution: report.resolution });
  response.json({ success: true, data: report });
});

export const resolve = asyncHandler(async (request, response) => {
  const report = await updateReportStatus(request.params.id, request.user.id, { status: "resolved", resolution: request.body.resolution });
  if (!report) throw new AppError("Report not found.", 404);
  await audit(request, "admin", "report", report.id, { action: "resolve", resolution: report.resolution });
  response.json({ success: true, data: report });
});

export const users = asyncHandler(async (_request, response) => {
  response.json({ success: true, data: await listAdminUsers() });
});

export const updateUserStatus = asyncHandler(async (request, response) => {
  const user = await setUserDisabled(request.params.id, request.body.disabled, request.user.id);
  if (!user) throw new AppError("User not found.", 404);

  let revokedSessions = 0;
  if (user.disabled) {
    revokedSessions = await revokeAllSessionsForUser(user.id);
    disconnectUserSockets(request.app.get("io"), user.id);
  }
  await audit(request, "admin", "user", user.id, { action: user.disabled ? "disable" : "enable", revokedSessions });
  response.json({ success: true, data: { user, revokedSessions } });
});

function disconnectUserSockets(io, userId) {
  if (!io) return;
  io.to?.(String(userId)).emit?.("auth:disabled", { message: "Your account has been disabled." });
  io.in?.(String(userId)).disconnectSockets?.(true);
}
