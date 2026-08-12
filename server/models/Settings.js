import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const settingsSchema = createStringIdSchema(
  {
    value: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      chatWallpaper: { type: String, default: "aurora", maxlength: 100 },
      language: { type: String, default: "en", maxlength: 20 },
      notifications: {
        messages: { type: Boolean, default: true }, calls: { type: Boolean, default: true }, friendRequests: { type: Boolean, default: true }, sound: { type: Boolean, default: true }, desktop: { type: Boolean, default: false },
      },
      privacy: {
        readReceipts: { type: Boolean, default: true }, lastSeen: { type: String, enum: ["everyone", "friends", "nobody"], default: "everyone" }, profilePhoto: { type: String, enum: ["everyone", "friends", "nobody"], default: "everyone" },
      },
    },
  },
  { collection: "lumina_settings" },
);

export const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
