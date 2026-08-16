import mongoose from "mongoose";
import { connectDatabase, databaseReady } from "../config/database.js";
import { ensureMongoIndexes } from "../models/index.js";
import { buildLegacyMigrationPlan, migrationSummary } from "../services/legacyMigrationService.js";

const migrationId = "20260816-legacy-objectid-to-lumina-v1";
const apply = process.argv.includes("--apply");

await connectDatabase();
if (!databaseReady()) throw new Error("MongoDB is required. Set MONGODB_URI and disable FORCE_MEMORY_DB before running this migration.");

const database = mongoose.connection.db;
const confirm = process.argv.find((argument) => argument.startsWith("--confirm="))?.slice("--confirm=".length);
const legacyCollections = ["users", "conversations", "messages", "stories", "notifications", "calls", "friendrequests", "friends", "blockedusers", "settings", "refreshtokens", "devices"];
const source = Object.fromEntries(await Promise.all(legacyCollections.map(async (name) => [name, await database.collection(name).find({}).toArray()])));
const plan = buildLegacyMigrationPlan(source);
const summary = migrationSummary(plan);
const targetCounts = Object.fromEntries(await Promise.all(Object.keys(plan.collections).map(async (name) => [name, await database.collection(name).countDocuments()])));

const report = { database: database.databaseName, mode: apply ? "apply" : "dry-run", source: Object.fromEntries(legacyCollections.map((name) => [name, source[name].length])), target: summary, existingTargetDocuments: targetCounts, skipped: plan.skipped, warnings: plan.warnings };

if (!apply) {
  console.info(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

if (confirm !== database.databaseName) {
  throw new Error(`Refusing to write. Re-run with --apply --confirm=${database.databaseName} after reviewing the dry-run report.`);
}
if (Object.values(targetCounts).some(Boolean)) {
  throw new Error("Refusing to mix legacy migration with existing lumina_* documents. Review the target database before applying.");
}

for (const [collectionName, documents] of Object.entries(plan.collections)) {
  if (!documents.length) continue;
  await database.collection(collectionName).bulkWrite(
    documents.map((document) => ({ updateOne: { filter: { _id: document._id }, update: { $setOnInsert: document }, upsert: true } })),
    { ordered: true },
  );
}
await ensureMongoIndexes();
await database.collection("lumina_migrations").updateOne(
  { _id: migrationId },
  { $set: { appliedAt: new Date(), summary, skipped: plan.skipped } },
  { upsert: true },
);
console.info(JSON.stringify({ ...report, applied: true }, null, 2));
await mongoose.disconnect();
