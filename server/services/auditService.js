import crypto from "node:crypto";
import mongoose from "mongoose";
import { databaseReady } from "../config/database.js";

export async function audit(request, action, entityType, entityId, metadata = {}) {
  if (!databaseReady()) return;
  await mongoose.connection.db.collection("lumina_audit_logs").insertOne({
    _id: crypto.randomUUID(),
    actorId: request.user?.id || null,
    action,
    entityType,
    entityId,
    metadata,
    ip: request.ip,
    userAgent: request.get?.("user-agent") || "",
    createdAt: new Date(),
  });
}
