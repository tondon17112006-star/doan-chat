// File: server/models/AuditLog.js
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: {
      type: String,
      enum: ["login", "logout", "delete", "edit", "call", "upload", "report", "admin"],
      required: true,
      index: true,
    },
    entityType: String,
    entityId: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });
export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
