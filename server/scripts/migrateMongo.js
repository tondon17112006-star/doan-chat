import mongoose from "mongoose";
import { connectDatabase, databaseReady } from "../config/database.js";
import { ensureMongoIndexes } from "../models/index.js";

const force = process.argv.includes("--force");
const migrationId = "20260812-normalize-data-layer";

await connectDatabase();
if (!databaseReady()) throw new Error("MongoDB is required for migrations. Set MONGODB_URI before running this script.");

const database = mongoose.connection.db;
const migrations = database.collection("lumina_migrations");
if (!force && await migrations.findOne({ _id: migrationId })) {
  console.info(`Migration ${migrationId} has already run.`);
  await mongoose.disconnect();
  process.exit(0);
}

const conversations = database.collection("lumina_conversations");
const cursor = conversations.find({ type: "direct", $or: [{ directKey: { $exists: false } }, { directKey: null }, { directKey: "" }] }, { projection: { participants: 1 } });
let operations = [];
let migrated = 0;
for await (const conversation of cursor) {
  const participants = [...new Set((conversation.participants || []).map(String))].sort();
  if (participants.length !== 2) continue;
  operations.push({ updateOne: { filter: { _id: conversation._id }, update: { $set: { directKey: participants.join(":"), schemaVersion: 1 } } } });
  if (operations.length === 250) {
    await conversations.bulkWrite(operations, { ordered: false });
    migrated += operations.length;
    operations = [];
  }
}
if (operations.length) {
  await conversations.bulkWrite(operations, { ordered: false });
  migrated += operations.length;
}

const friendships = database.collection("lumina_friendships");
const friendshipCursor = friendships.find({ $or: [{ pairKey: { $exists: false } }, { pairKey: null }, { pairKey: "" }] }, { projection: { requesterId: 1, recipientId: 1 } });
let friendshipWrites = [];
let migratedFriendships = 0;
for await (const friendship of friendshipCursor) {
  if (!friendship.requesterId || !friendship.recipientId) continue;
  const pairKey = [String(friendship.requesterId), String(friendship.recipientId)].sort().join(":");
  friendshipWrites.push({ updateOne: { filter: { _id: friendship._id }, update: { $set: { pairKey, schemaVersion: 1 } } } });
  if (friendshipWrites.length === 250) {
    await friendships.bulkWrite(friendshipWrites, { ordered: false });
    migratedFriendships += friendshipWrites.length;
    friendshipWrites = [];
  }
}
if (friendshipWrites.length) {
  await friendships.bulkWrite(friendshipWrites, { ordered: false });
  migratedFriendships += friendshipWrites.length;
}

const dateFieldsByCollection = {
  lumina_users: ["createdAt", "updatedAt", "lastSeen", "passwordChangedAt"],
  lumina_conversations: ["createdAt", "updatedAt", "lastMessageAt"],
  lumina_messages: ["createdAt", "updatedAt", "editedAt", "readAt", "unsentAt"],
  lumina_stories: ["createdAt", "updatedAt", "expiresAt"],
  lumina_notifications: ["createdAt", "updatedAt"],
  lumina_calls: ["createdAt", "updatedAt"],
  lumina_friendships: ["createdAt", "updatedAt"],
  lumina_blocks: ["createdAt", "updatedAt"],
  lumina_uploads: ["createdAt", "updatedAt"],
  lumina_refresh_sessions: ["createdAt", "updatedAt", "lastActiveAt", "expiresAt", "revokedAt"],
};

let normalizedDates = 0;
for (const [collectionName, fields] of Object.entries(dateFieldsByCollection)) {
  const collection = database.collection(collectionName);
  const cursor = collection.find({ $or: fields.map((field) => ({ [field]: { $type: "string" } })) });
  let writes = [];
  for await (const document of cursor) {
    const update = {};
    for (const field of fields) {
      if (typeof document[field] !== "string") continue;
      const parsed = new Date(document[field]);
      if (!Number.isNaN(parsed.valueOf())) update[field] = parsed;
    }
    if (!Object.keys(update).length) continue;
    writes.push({ updateOne: { filter: { _id: document._id }, update: { $set: update } } });
    if (writes.length === 250) {
      await collection.bulkWrite(writes, { ordered: false });
      normalizedDates += writes.length;
      writes = [];
    }
  }
  if (writes.length) {
    await collection.bulkWrite(writes, { ordered: false });
    normalizedDates += writes.length;
  }
}
await ensureMongoIndexes();
await migrations.updateOne({ _id: migrationId }, { $set: { appliedAt: new Date(), migratedConversations: migrated, migratedFriendships, normalizedDates } }, { upsert: true });
console.info(`Migration complete: normalized ${migrated} direct conversations, ${migratedFriendships} friendships, converted ${normalizedDates} legacy date records and ensured indexes.`);
await mongoose.disconnect();
