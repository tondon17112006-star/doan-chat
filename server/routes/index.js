import { Router } from "express";
import { body, param, query } from "express-validator";
import * as authController from "../controllers/authController.js";
import * as conversationController from "../controllers/conversationController.js";
import * as messageController from "../controllers/messageController.js";
import * as miscController from "../controllers/miscController.js";
import * as moderationController from "../controllers/moderationController.js";
import * as socialController from "../controllers/socialController.js";
import * as userController from "../controllers/userController.js";
import { authenticate, authorize, requireVerified } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { forgotPasswordRateLimits, loginRateLimits, verificationRateLimits } from "../middlewares/authRateLimit.js";

export const apiRouter = Router();

apiRouter.get("/health", miscController.health);
apiRouter.get("/ready", miscController.readiness);

apiRouter.post(
  "/auth/register",
  body("username").trim().isLength({ min: 2, max: 80 }),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8, max: 128 }),
  validate,
  authController.register,
);
apiRouter.post(
  "/auth/login",
  ...loginRateLimits,
  body("email").isEmail().normalizeEmail(),
  body("password").isString().notEmpty(),
  validate,
  authController.login,
);
apiRouter.post("/auth/demo", authController.demo);
apiRouter.post("/auth/refresh", authController.refresh);
apiRouter.post("/auth/forgot-password", ...forgotPasswordRateLimits, body("email").isEmail().normalizeEmail(), validate, authController.forgotPassword);
apiRouter.post(
  "/auth/verify-otp",
  body("email").isEmail().normalizeEmail(),
  body("otp").isLength({ min: 6, max: 6 }),
  body("purpose").isIn(["reset", "verify"]),
  validate,
  authController.verifyOtp,
);
apiRouter.post("/auth/send-verification", ...verificationRateLimits, body("email").isEmail().normalizeEmail(), validate, authController.sendVerification);
apiRouter.post("/auth/logout", authenticate, authController.logout);
apiRouter.get("/auth/sessions", authenticate, authController.sessions);
apiRouter.delete("/auth/sessions/:id", param("id").isUUID(), validate, authenticate, authController.revokeSession);
apiRouter.post("/auth/logout-others", authenticate, authController.logoutOthers);

apiRouter.use(authenticate);

apiRouter.get("/users", userController.list);
apiRouter.get("/users/me", userController.me);
apiRouter.patch(
  "/users/me",
  body("username").optional().isString().trim().isLength({ min: 1, max: 80 }),
  body("bio").optional().isString().isLength({ max: 500 }),
  body("birthday").optional({ nullable: true }).isISO8601(),
  body("gender").optional().isString().isLength({ max: 40 }),
  body("phone").optional().isString().isLength({ max: 40 }),
  body("status").optional().isString().isLength({ max: 160 }),
  body("location").optional().isString().isLength({ max: 120 }),
  body("avatar").optional().isString().isLength({ max: 2_048 }),
  body("coverPhoto").optional().isString().isLength({ max: 2_048 }),
  validate,
  userController.updateProfile,
);
apiRouter.patch(
  "/users/me/password",
  body("currentPassword").isString().notEmpty().isLength({ max: 128 }),
  body("newPassword").isString().isLength({ min: 8, max: 128 }),
  validate,
  userController.changePassword,
);
apiRouter.patch(
  "/users/me/email",
  requireVerified,
  body("email").isEmail().normalizeEmail(),
  body("password").isString().notEmpty(),
  validate,
  userController.changeEmail,
);
apiRouter.get("/users/:id", param("id").isString().notEmpty(), validate, userController.profile);

apiRouter.get("/friends", socialController.friends);
apiRouter.get("/friends/requests/received", socialController.receivedRequests);
apiRouter.get("/friends/requests/sent", socialController.sentRequests);

apiRouter.get("/conversations", conversationController.list);
apiRouter.post(
  "/conversations",
  requireVerified,
  body("type").isIn(["direct", "group"]),
  body("participants").isArray({ min: 1, max: 100 }),
  body("participants.*").isString().trim().isLength({ min: 1, max: 200 }),
  validate,
  conversationController.create,
);
apiRouter.get("/conversations/:id", conversationController.getOne);
apiRouter.patch(
  "/conversations/:id",
  requireVerified,
  body("name").optional().isString().isLength({ min: 1, max: 100 }),
  body("avatar").optional().isString().isLength({ max: 2_000 }),
  body("color").optional().isString().isLength({ min: 1, max: 40 }),
  body("participants").optional().isArray({ min: 1, max: 100 }),
  body("admins").optional().isArray({ min: 1, max: 100 }),
  body(["muted", "pinned", "favorite", "archived"]).optional().isBoolean(),
  validate,
  conversationController.update,
);
apiRouter.post("/conversations/:id/leave", requireVerified, conversationController.leave);
apiRouter.delete("/conversations/:id", requireVerified, conversationController.remove);

apiRouter.get("/messages/:conversationId", query("limit").optional().isInt({ min: 1, max: 100 }), validate, messageController.list);
apiRouter.post(
  "/messages/:conversationId",
  requireVerified,
  body("type").optional().isIn(["text", "image", "video", "audio", "file", "system"]),
  body("content").optional({ nullable: true }).isString().isLength({ max: 4_000 }),
  body("attachments").optional().isArray({ max: 10 }),
  validate,
  messageController.create,
);
apiRouter.post("/messages/:conversationId/read", messageController.read);
apiRouter.patch("/messages/item/:id", requireVerified, body("content").isString().trim().isLength({ min: 1, max: 4_000 }), validate, messageController.edit);
apiRouter.delete("/messages/item/:id", requireVerified, messageController.remove);
apiRouter.post("/messages/item/:id/reaction", requireVerified, body("emoji").optional({ nullable: true }).isString().isLength({ max: 16 }), validate, messageController.react);
apiRouter.post("/messages/item/:id/pin", requireVerified, messageController.pin);

apiRouter.post(
  "/uploads",
  requireVerified,
  query("purpose").optional().isIn(["attachment", "avatar", "story"]),
  validate,
  upload.array("files", 10),
  miscController.uploadFiles,
);
apiRouter.get("/uploads/:filename", param("filename").matches(/^[a-f0-9-]+\.[a-z0-9]+$/i), validate, miscController.downloadUpload);
apiRouter.post("/friends/:id", requireVerified, body("action").isIn(["request", "accept", "decline", "cancel", "remove", "block", "unblock"]), validate, socialController.friend);
apiRouter.get("/stories", socialController.stories);
apiRouter.post("/stories", requireVerified, body("mediaUrl").isString().notEmpty(), body("type").optional().isIn(["image", "video"]), validate, socialController.addStory);
apiRouter.post("/stories/:id/view", requireVerified, socialController.seeStory);
apiRouter.get("/notifications", socialController.notifications);
apiRouter.post("/notifications/read", socialController.readNotifications);
apiRouter.get("/calls", socialController.calls);
apiRouter.post("/calls", requireVerified, socialController.addCall);
apiRouter.post(
  "/reports",
  requireVerified,
  body("targetType").isIn(["user", "message", "story"]),
  body("targetId").isString().trim().isLength({ min: 1, max: 200 }),
  body("reason").isString().trim().isLength({ min: 3, max: 200 }),
  body("details").optional().isString().isLength({ max: 1_000 }),
  validate,
  moderationController.create,
);
apiRouter.get("/search", query("q").optional().isString().isLength({ max: 100 }), validate, miscController.search);
apiRouter.get("/settings", miscController.settings);
apiRouter.patch("/settings", miscController.saveSettings);
apiRouter.get("/admin/dashboard", requireVerified, authorize("admin"), miscController.dashboard);
apiRouter.get("/admin/reports", requireVerified, authorize("admin"), query("status").optional().isIn(["open", "in_review", "resolved", "dismissed"]), validate, moderationController.list);
apiRouter.patch(
  "/admin/reports/:id",
  requireVerified,
  authorize("admin"),
  param("id").isString().trim().isLength({ min: 1, max: 200 }),
  body("status").isIn(["open", "in_review", "resolved", "dismissed"]),
  body("resolution").optional().isString().isLength({ max: 1_000 }),
  validate,
  moderationController.update,
);
apiRouter.post(
  "/admin/reports/:id/resolve",
  requireVerified,
  authorize("admin"),
  param("id").isString().trim().isLength({ min: 1, max: 200 }),
  body("resolution").optional().isString().isLength({ max: 1_000 }),
  validate,
  moderationController.resolve,
);
apiRouter.get("/admin/users", requireVerified, authorize("admin"), moderationController.users);
apiRouter.patch(
  "/admin/users/:id/disabled",
  requireVerified,
  authorize("admin"),
  param("id").isString().trim().isLength({ min: 1, max: 200 }),
  body("disabled").isBoolean(),
  validate,
  moderationController.updateUserStatus,
);
