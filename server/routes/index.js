import { Router } from "express";
import { body, param, query } from "express-validator";
import * as authController from "../controllers/authController.js";
import * as conversationController from "../controllers/conversationController.js";
import * as messageController from "../controllers/messageController.js";
import * as miscController from "../controllers/miscController.js";
import * as socialController from "../controllers/socialController.js";
import * as userController from "../controllers/userController.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { forgotPasswordRateLimits, loginRateLimits } from "../middlewares/authRateLimit.js";

export const apiRouter = Router();

apiRouter.get("/health", miscController.health);

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
apiRouter.post("/auth/send-verification", body("email").isEmail().normalizeEmail(), validate, authController.sendVerification);
apiRouter.post("/auth/logout", authenticate, authController.logout);
apiRouter.get("/auth/sessions", authenticate, authController.sessions);
apiRouter.delete("/auth/sessions/:id", param("id").isUUID(), validate, authenticate, authController.revokeSession);
apiRouter.post("/auth/logout-others", authenticate, authController.logoutOthers);

apiRouter.use(authenticate);

apiRouter.get("/users", userController.list);
apiRouter.get("/users/me", userController.me);
apiRouter.patch("/users/me", userController.updateProfile);
apiRouter.patch(
  "/users/me/password",
  body("currentPassword").isString().notEmpty().isLength({ max: 128 }),
  body("newPassword").isString().isLength({ min: 8, max: 128 }),
  validate,
  userController.changePassword,
);
apiRouter.patch(
  "/users/me/email",
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
  body("type").isIn(["direct", "group"]),
  body("participants").isArray({ min: 1, max: 100 }),
  validate,
  conversationController.create,
);
apiRouter.get("/conversations/:id", conversationController.getOne);
apiRouter.patch(
  "/conversations/:id",
  body("name").optional().isString().isLength({ min: 1, max: 100 }),
  body("avatar").optional().isString().isLength({ max: 2_000 }),
  body("color").optional().isString().isLength({ min: 1, max: 40 }),
  body("participants").optional().isArray({ min: 1, max: 100 }),
  body("admins").optional().isArray({ min: 1, max: 100 }),
  body(["muted", "pinned", "favorite", "archived"]).optional().isBoolean(),
  validate,
  conversationController.update,
);
apiRouter.post("/conversations/:id/leave", conversationController.leave);
apiRouter.delete("/conversations/:id", conversationController.remove);

apiRouter.get("/messages/:conversationId", query("limit").optional().isInt({ min: 1, max: 100 }), validate, messageController.list);
apiRouter.post(
  "/messages/:conversationId",
  body("content").optional({ nullable: true }).isString().isLength({ max: 4_000 }),
  body("attachments").optional().isArray({ max: 10 }),
  validate,
  messageController.create,
);
apiRouter.post("/messages/:conversationId/read", messageController.read);
apiRouter.patch("/messages/item/:id", body("content").isString().trim().isLength({ min: 1, max: 4_000 }), validate, messageController.edit);
apiRouter.delete("/messages/item/:id", messageController.remove);
apiRouter.post("/messages/item/:id/reaction", body("emoji").optional({ nullable: true }).isString().isLength({ max: 16 }), validate, messageController.react);
apiRouter.post("/messages/item/:id/pin", messageController.pin);

apiRouter.post(
  "/uploads",
  query("purpose").optional().isIn(["attachment", "avatar", "story"]),
  validate,
  upload.array("files", 10),
  miscController.uploadFiles,
);
apiRouter.get("/uploads/:filename", param("filename").matches(/^[a-f0-9-]+\.[a-z0-9]+$/i), validate, miscController.downloadUpload);
apiRouter.post("/friends/:id", body("action").isIn(["request", "accept", "decline", "cancel", "remove", "block", "unblock"]), validate, socialController.friend);
apiRouter.get("/stories", socialController.stories);
apiRouter.post("/stories", body("mediaUrl").isString().notEmpty(), body("type").optional().isIn(["image", "video"]), validate, socialController.addStory);
apiRouter.post("/stories/:id/view", socialController.seeStory);
apiRouter.get("/notifications", socialController.notifications);
apiRouter.post("/notifications/read", socialController.readNotifications);
apiRouter.get("/calls", socialController.calls);
apiRouter.post("/calls", socialController.addCall);
apiRouter.get("/search", query("q").optional().isString().isLength({ max: 100 }), validate, miscController.search);
apiRouter.get("/settings", miscController.settings);
apiRouter.patch("/settings", miscController.saveSettings);
apiRouter.get("/admin/dashboard", authorize("admin"), miscController.dashboard);
