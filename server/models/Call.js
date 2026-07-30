// File: server/models/Call.js
import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", index: true },
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    type: { type: String, enum: ["voice", "video"], required: true },
    status: { type: String, enum: ["ringing", "accepted", "rejected", "missed", "ended"], default: "ringing" },
    startedAt: { type: Date, default: Date.now },
    answeredAt: Date,
    endedAt: Date,
    duration: { type: Number, default: 0 },
  },
  { timestamps: true },
);

callSchema.index({ participants: 1, createdAt: -1 });
export const Call = mongoose.models.Call || mongoose.model("Call", callSchema);
