import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const friendshipSchema = createStringIdSchema(
  {
    requesterId: { type: String, required: true, index: true },
    recipientId: { type: String, required: true, index: true },
    pairKey: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "declined", "cancelled"], required: true, index: true },
  },
  { collection: "lumina_friendships" },
);

friendshipSchema.path("recipientId").validate(function notSelf(value) {
  return value !== this.requesterId;
}, "A user cannot be friends with themselves.");
friendshipSchema.index({ requesterId: 1, status: 1, updatedAt: -1 });
friendshipSchema.index({ recipientId: 1, status: 1, updatedAt: -1 });
friendshipSchema.index({ pairKey: 1, updatedAt: -1 });
friendshipSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["pending", "accepted"] } } });

export const Friendship = mongoose.models.Friendship || mongoose.model("Friendship", friendshipSchema);
