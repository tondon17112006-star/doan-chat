import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const attachmentSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    type: { type: String, required: true, trim: true, maxlength: 160 },
    size: { type: Number, min: 0, max: 25 * 1024 * 1024 },
    url: { type: String, required: true, trim: true, maxlength: 2_048 },
    duration: { type: Number, min: 0 },
  },
  { _id: false },
);

const reactionSchema = new mongoose.Schema(
  { emoji: { type: String, required: true, maxlength: 32 }, users: [{ type: String, required: true }] },
  { _id: false },
);

const messageSchema = createStringIdSchema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true, index: true },
    // Makes HTTP message retries idempotent when a response is lost.
    clientMessageId: { type: String, trim: true, maxlength: 120, default: null },
    type: { type: String, enum: ["text", "image", "video", "audio", "file", "system"], default: "text", index: true },
    content: { type: String, default: "", maxlength: 10_000 },
    attachments: { type: [attachmentSchema], default: [], validate: [(value) => value.length <= 10, "A message can contain at most 10 attachments."] },
    replyTo: { type: String, default: null },
    forwardedFrom: { type: String, default: null },
    reactions: { type: [reactionSchema], default: [] },
    readBy: { type: [String], default: [] },
    deletedFor: { type: [String], default: [] },
    status: { type: String, enum: ["sending", "sent", "delivered", "read"], default: "sent" },
    pinned: { type: Boolean, default: false, index: true },
    editedAt: Date,
    readAt: Date,
    unsentAt: Date,
  },
  { collection: "lumina_messages" },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, pinned: 1, createdAt: -1 });
messageSchema.index(
  { conversationId: 1, senderId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: "string" } } },
);
messageSchema.index({ content: "text" });

export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
