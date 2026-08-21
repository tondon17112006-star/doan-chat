import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const storyReactionSchema = new mongoose.Schema(
  { userId: { type: String, required: true }, emoji: { type: String, required: true, maxlength: 32 }, createdAt: { type: Date, default: Date.now } },
  { _id: false },
);

const storySchema = createStringIdSchema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ["image", "video"], required: true },
    mediaUrl: { type: String, required: true, maxlength: 2_048 },
    caption: { type: String, default: "", maxlength: 500 },
    audience: { type: String, enum: ["everyone", "friends", "custom"], default: "everyone", index: true },
    audienceUserIds: { type: [String], default: [] },
    viewers: { type: [String], default: [] },
    reactions: { type: [storyReactionSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: "lumina_stories" },
);

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ mediaUrl: 1 });

export const Story = mongoose.models.Story || mongoose.model("Story", storySchema);
