import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Block, Conversation, User, ensureMongoIndexes } from "../models/index.js";

const mongoUri = process.env.MONGODB_URI_TEST || "";
const databaseName = mongoUri ? new URL(mongoUri).pathname.toLowerCase() : "";
const canRunMongoIntegration = Boolean(mongoUri && /(test|ci)/.test(databaseName));
const describeMongo = canRunMongoIntegration ? describe : describe.skip;

describeMongo("MongoDB data layer", () => {
  beforeAll(async () => {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
    await mongoose.connection.dropDatabase();
    await ensureMongoIndexes();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("enforces unique user, block, and direct-conversation constraints", async () => {
    await User.create({ _id: "u-a", email: "a@example.test", passwordHash: "x".repeat(60), username: "A" });
    await expect(User.create({ _id: "u-b", email: "a@example.test", passwordHash: "x".repeat(60), username: "B" })).rejects.toMatchObject({ code: 11000 });

    await Block.create({ _id: "block-a", userId: "u-a", blockedUserId: "u-b" });
    await expect(Block.create({ _id: "block-b", userId: "u-a", blockedUserId: "u-b" })).rejects.toMatchObject({ code: 11000 });

    await Conversation.create({ _id: "c-a", type: "direct", directKey: "u-a:u-b", participants: ["u-a", "u-b"], createdBy: "u-a" });
    await expect(Conversation.create({ _id: "c-b", type: "direct", directKey: "u-a:u-b", participants: ["u-a", "u-b"], createdBy: "u-a" })).rejects.toMatchObject({ code: 11000 });
  });
});
