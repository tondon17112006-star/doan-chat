import mongoose from "mongoose";
import { connectDatabase, databaseReady } from "../config/database.js";
import { env } from "../config/env.js";
import { createSeedData } from "../data/seed.js";
import { Block, Call, Conversation, Friendship, Message, Notification, Settings, Story, Upload, User, ensureMongoIndexes } from "../models/index.js";

const replace = process.argv.includes("--replace");

if (env.isProduction && process.env.ALLOW_PRODUCTION_SEED !== "true") {
  throw new Error("Refusing to seed production. Use a dedicated non-production database instead.");
}

await connectDatabase();
if (!databaseReady()) throw new Error("MongoDB is required for the seed script. Set MONGODB_URI before running it.");

const models = [User, Conversation, Message, Story, Notification, Settings, Friendship, Block, Upload, Call];
const existing = await Promise.all(models.map((model) => model.estimatedDocumentCount()));
if (existing.some(Boolean) && !replace) {
  throw new Error("MongoDB already contains data. Re-run with --replace only for a disposable development database.");
}
if (replace) await Promise.all(models.map((model) => model.deleteMany({})));

const seed = createSeedData();
const withIds = (items) => items.map(({ id, ...item }) => ({ ...item, _id: id }));
await User.insertMany(withIds(seed.users));
await Conversation.insertMany(withIds(seed.conversations.map((conversation) => ({
  ...conversation,
  ...(conversation.type === "direct" ? { directKey: [...conversation.participants].map(String).sort().join(":") } : {}),
}))));
await Message.insertMany(withIds(seed.messages));
await Story.insertMany(withIds(seed.stories));
await Notification.insertMany(withIds(seed.notifications));
await Call.insertMany(withIds(seed.calls));
await ensureMongoIndexes();
console.info(`Seeded ${seed.users.length} users, ${seed.conversations.length} conversations and ${seed.messages.length} messages.`);
await mongoose.disconnect();
