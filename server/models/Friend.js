// File: server/models/Friend.js
import mongoose from "mongoose";

const friendSchema = new mongoose.Schema(
  {
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    closeFriend: { type: Boolean, default: false },
    nickname: { type: Map, of: String, default: {} },
  },
  { timestamps: true },
);

friendSchema.index({ users: 1 }, { unique: true });
export const Friend = mongoose.models.Friend || mongoose.model("Friend", friendSchema);
