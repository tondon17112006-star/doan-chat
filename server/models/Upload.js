import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const uploadSchema = createStringIdSchema(
  {
    filename: { type: String, required: true, trim: true, maxlength: 255 },
    ownerId: { type: String, required: true, index: true },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 160 },
    size: { type: Number, required: true, min: 0, max: 25 * 1024 * 1024 },
    purpose: { type: String, enum: ["attachment", "avatar", "story"], default: "attachment", index: true },
    conversationIds: { type: [String], default: [] },
    publicDemo: { type: Boolean, default: false, index: true },
  },
  { collection: "lumina_uploads" },
);

uploadSchema.index({ filename: 1 }, { unique: true });
uploadSchema.index({ ownerId: 1, createdAt: -1 });
uploadSchema.index({ conversationIds: 1 });

export const Upload = mongoose.models.Upload || mongoose.model("Upload", uploadSchema);
