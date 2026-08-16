import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const userSchema = createStringIdSchema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320, select: false },
    passwordHash: { type: String, required: true, minlength: 20, maxlength: 255, select: false },
    passwordChangedAt: Date,
    username: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    avatar: { type: String, default: "", maxlength: 2_048 },
    coverPhoto: { type: String, default: "", maxlength: 2_048 },
    bio: { type: String, default: "", maxlength: 500 },
    birthday: { type: Date, default: null },
    gender: { type: String, default: "", maxlength: 40 },
    phone: { type: String, default: "", maxlength: 40 },
    status: { type: String, default: "Available", maxlength: 160 },
    location: { type: String, default: "", maxlength: 120 },
    role: { type: String, enum: ["user", "admin", "assistant"], default: "user", index: true },
    verified: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false, index: true },
    isOnline: { type: Boolean, default: false, index: true },
    lastSeen: { type: Date, default: Date.now },
  },
  { collection: "lumina_users" },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: "text", email: "text", location: "text" });

export const User = mongoose.models.User || mongoose.model("User", userSchema);
