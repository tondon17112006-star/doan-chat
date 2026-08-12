import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const refreshSessionSchema = createStringIdSchema(
  {
    userId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, maxlength: 200 },
    name: { type: String, default: "Web browser", maxlength: 120 },
    platform: { type: String, default: "web", maxlength: 80 },
    ip: { type: String, default: "", maxlength: 128 },
    userAgent: { type: String, default: "", maxlength: 1_000 },
    remember: { type: Boolean, default: true },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  { collection: "lumina_refresh_sessions" },
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, revokedAt: 1, lastActiveAt: -1 });
refreshSessionSchema.index({ userId: 1, deviceId: 1 });

export const RefreshSession = mongoose.models.RefreshSession || mongoose.model("RefreshSession", refreshSessionSchema);
