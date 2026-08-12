// File: server/models/Conversation.js
import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const conversationSchema = createStringIdSchema(
  {
    type: { type: String, enum: ["direct", "group", "ai"], default: "direct", index: true },
    name: { type: String, maxlength: 100, trim: true, default: "" },
    avatar: { type: String, default: "" },
    color: { type: String, default: "blue" },
    participants: { type: [String], required: true, validate: [(value) => value.length > 0, "A conversation needs participants."] },
    admins: { type: [String], default: [] },
    directKey: { type: String, default: null },
    lastMessage: { type: String, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    archivedBy: { type: [String], default: [] },
    mutedBy: { type: [String], default: [] },
    pinnedBy: { type: [String], default: [] },
    deletedFor: { type: [String], default: [] },
    createdBy: { type: String, required: true },
  },
  { collection: "lumina_conversations" },
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { type: "direct", directKey: { $type: "string" } } });
conversationSchema.path("admins").validate(function adminsParticipate(value) {
  return this.type !== "group" || (value.length > 0 && value.every((admin) => this.participants.includes(admin)));
}, "Every group admin must be a participant and a group needs an admin.");
export const Conversation =
  mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
