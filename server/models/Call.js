// File: server/models/Call.js
import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const callSchema = createStringIdSchema(
  {
    userId: { type: String, required: true, index: true },
    peerId: { type: String, required: true, index: true },
    conversationId: { type: String, default: null, index: true },
    type: { type: String, enum: ["voice", "video"], required: true },
    status: { type: String, enum: ["ringing", "accepted", "rejected", "missed", "ended"], default: "ringing" },
    direction: { type: String, enum: ["incoming", "outgoing"], default: "outgoing" },
    duration: { type: Number, min: 0, default: 0 },
    answeredAt: Date,
    endedAt: Date,
  },
  { collection: "lumina_calls" },
);

callSchema.index({ userId: 1, createdAt: -1 });
export const Call = mongoose.models.Call || mongoose.model("Call", callSchema);
