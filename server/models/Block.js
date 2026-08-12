import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const blockSchema = createStringIdSchema(
  {
    userId: { type: String, required: true, index: true },
    blockedUserId: { type: String, required: true, index: true },
  },
  { collection: "lumina_blocks" },
);

blockSchema.path("blockedUserId").validate(function notSelf(value) {
  return value !== this.userId;
}, "A user cannot block themselves.");
blockSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });

export const Block = mongoose.models.Block || mongoose.model("Block", blockSchema);
