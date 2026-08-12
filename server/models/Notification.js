import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const notificationSchema = createStringIdSchema(
  {
    userId: { type: String, required: true, index: true },
    actorId: { type: String, default: null, index: true },
    type: { type: String, default: "system", maxlength: 80, index: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: "", maxlength: 1_000 },
    read: { type: Boolean, default: false, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { collection: "lumina_notifications" },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
