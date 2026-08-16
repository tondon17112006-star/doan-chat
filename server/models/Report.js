import mongoose from "mongoose";
import { createStringIdSchema } from "./modelHelpers.js";

const reportSchema = createStringIdSchema(
  {
    reporterId: { type: String, required: true, index: true },
    targetType: { type: String, enum: ["user", "message", "story"], required: true, index: true },
    targetId: { type: String, required: true, index: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    details: { type: String, default: "", maxlength: 1_000 },
    status: { type: String, enum: ["open", "in_review", "resolved", "dismissed"], default: "open", index: true },
    resolution: { type: String, default: "", maxlength: 1_000 },
    resolvedBy: { type: String, default: null, index: true },
    resolvedAt: { type: Date, default: null },
  },
  { collection: "lumina_reports" },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["open", "in_review"] } } },
);

export const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);
