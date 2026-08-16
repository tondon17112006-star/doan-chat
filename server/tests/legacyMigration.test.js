import { describe, expect, it } from "vitest";
import { buildLegacyMigrationPlan, migrationSummary } from "../services/legacyMigrationService.js";

const time = new Date("2026-08-16T00:00:00.000Z");
const source = {
  users: [
    { _id: "u1", email: "A@Example.test", password: "$2b$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890", username: "Alex", coverPhoto: "cover.jpg", gender: "other", phone: "123", createdAt: time },
    { _id: "u2", email: "b@example.test", password: "$2b$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890", username: "Bao", createdAt: time },
  ],
  conversations: [
    { _id: "c1", type: "direct", participants: ["u1", "u2"], createdBy: "u1", lastMessageAt: time, createdAt: time },
  ],
  messages: [
    { _id: "m1", conversation: "c1", sender: "u1", type: "image", attachments: [{ _id: "a1", name: "photo", type: "image/png", url: "https://example.test/photo.png", size: 12 }], readBy: [{ user: "u1", at: time }, { user: "u2", at: time }], status: "read", createdAt: time },
    { _id: "m-orphan", conversation: "missing", sender: "u1", type: "text", content: "ignored", createdAt: time },
  ],
  friends: [{ _id: "f1", users: ["u1", "u2"], createdAt: time }],
  friendrequests: [{ _id: "r1", sender: "u1", recipient: "u2", status: "pending", createdAt: time }],
  blockedusers: [{ _id: "b1", user: "u1", blocked: "u2", createdAt: time }],
  settings: [{ _id: "s1", user: "u1", theme: "dark", notifications: { calls: false }, createdAt: time }],
  calls: [{ _id: "call1", conversation: "c1", initiator: "u1", participants: ["u2"], type: "voice", status: "ended", duration: 42, startedAt: time, createdAt: time }],
  stories: [],
  notifications: [],
  refreshtokens: [{ _id: "token1" }],
  devices: [{ _id: "device1" }],
};

describe("legacy MongoDB migration mapping", () => {
  it("preserves IDs and relations while dropping invalid references", () => {
    const plan = buildLegacyMigrationPlan(source);
    const users = plan.collections.lumina_users;
    const conversation = plan.collections.lumina_conversations[0];
    const message = plan.collections.lumina_messages[0];

    expect(users[0]).toMatchObject({ _id: "u1", email: "a@example.test", coverPhoto: "cover.jpg", gender: "other", phone: "123" });
    expect(conversation).toMatchObject({ _id: "c1", participants: ["u1", "u2"], directKey: "u1:u2" });
    expect(message).toMatchObject({ _id: "m1", conversationId: "c1", senderId: "u1", readBy: ["u1", "u2"], status: "read" });
    expect(message.attachments[0]).toMatchObject({ id: "a1", url: "https://example.test/photo.png" });
    expect(plan.skipped.messages).toBe(1);
  });

  it("prefers accepted friendships and creates per-user call history", () => {
    const plan = buildLegacyMigrationPlan(source);
    const summary = migrationSummary(plan);

    expect(plan.collections.lumina_friendships).toEqual([expect.objectContaining({ pairKey: "u1:u2", status: "accepted" })]);
    expect(plan.collections.lumina_blocks).toEqual([expect.objectContaining({ userId: "u1", blockedUserId: "u2" })]);
    expect(plan.collections.lumina_settings).toEqual([expect.objectContaining({ _id: "u1", value: expect.objectContaining({ theme: "dark", notifications: expect.objectContaining({ calls: false }) }) })]);
    expect(plan.collections.lumina_calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: "u1", peerId: "u2", direction: "outgoing" }),
      expect.objectContaining({ userId: "u2", peerId: "u1", direction: "incoming" }),
    ]));
    expect(summary).toMatchObject({ lumina_users: 2, lumina_conversations: 1, lumina_messages: 1, lumina_calls: 2 });
    expect(plan.skipped).toMatchObject({ refreshSessions: 1, devices: 1 });
  });
});
