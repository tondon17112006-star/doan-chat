// File: server/models/BlockedUser.js
import mongoose from "mongoose";

const blockedUserSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, maxlength: 200, default: "" },
  },
  { timestamps: true },
);

blockedUserSchema.index({ user: 1, blocked: 1 }, { unique: true });
export const BlockedUser =
  mongoose.models.BlockedUser || mongoose.model("BlockedUser", blockedUserSchema);
