// File: server/models/Conversation.js
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["direct", "group", "ai"], default: "direct", index: true },
    name: { type: String, maxlength: 100, trim: true },
    avatar: { type: String, default: "" },
    color: { type: String, default: "blue" },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
export const Conversation =
  mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
