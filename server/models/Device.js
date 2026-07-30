// File: server/models/Device.js
import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String, required: true },
    name: { type: String, default: "Unknown device" },
    platform: String,
    browser: String,
    pushToken: String,
    ip: String,
    lastActiveAt: { type: Date, default: Date.now },
    trusted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });
export const Device = mongoose.models.Device || mongoose.model("Device", deviceSchema);
