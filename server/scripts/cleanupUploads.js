import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { initializeDataService, cleanupOrphanUploads } from "../services/dataService.js";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));

const graceHours = Number(args.get("grace-hours") || 24);
const limit = Number(args.get("limit") || 100);

await connectDatabase();
await initializeDataService();

try {
  const result = await cleanupOrphanUploads({
    graceMs: Math.max(0, graceHours) * 60 * 60 * 1000,
    limit,
  });
  console.log(JSON.stringify({ success: true, ...result }, null, 2));
} finally {
  await mongoose.disconnect().catch(() => undefined);
}
