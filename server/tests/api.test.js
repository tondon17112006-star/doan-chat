import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { app } from "../app.js";
import { resetMemoryData } from "../services/dataService.js";
import { resetAuthMemory } from "../services/authService.js";

const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl1R9sAAAAASUVORK5CYII=", "base64");
const uploadedTestFiles = new Set();

beforeEach(async () => {
  await resetAuthMemory();
  await resetMemoryData();
});

afterEach(async () => {
  await Promise.all([...uploadedTestFiles].map((filename) => unlink(path.join(process.cwd(), "uploads", filename)).catch(() => undefined)));
  uploadedTestFiles.clear();
});

async function login(email) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "Password123!" })
    .expect(200);
  return `Bearer ${response.body.data.accessToken}`;
}

async function loginSession(agent, email = "alex@lumina.chat", password = "Password123!", deviceId = crypto.randomUUID()) {
  const response = await agent
    .post("/api/auth/login")
    .send({ email, password, device: { id: deviceId, name: `Test browser ${deviceId.slice(0, 6)}`, platform: "test" } })
    .expect(200);
  return response;
}

describe("Lumina API", () => {
  it("reports service health", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toMatchObject({ success: true, service: "lumina-api", status: "alive" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("reports readiness for every configured dependency", async () => {
    const response = await request(app).get("/api/ready");
    expect([200, 503]).toContain(response.status);
    expect(response.body).toMatchObject({
      success: response.status === 200,
      service: "lumina-api",
      status: response.status === 200 ? "ready" : "not_ready",
      checks: { mongo: expect.any(Object), redis: expect.any(Object) },
    });
    for (const check of Object.values(response.body.checks)) {
      expect(check).toEqual(expect.objectContaining({ configured: expect.any(Boolean), ready: expect.any(Boolean), status: expect.any(String) }));
      if (!check.configured) expect(check).toMatchObject({ ready: true, status: "not_configured" });
    }
  });

  it("logs into the demo account and returns conversations", async () => {
    const login = await request(app).post("/api/auth/demo").send({}).expect(200);
    expect(login.body.data.user.email).toBe("alex@lumina.chat");
    expect(login.body.data.accessToken).toBeTypeOf("string");

    const response = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(response.body.data.some((conversation) => conversation.id === "c-maya")).toBe(true);
  });

  it("creates and retrieves a message", async () => {
    const login = await request(app).post("/api/auth/demo").send({}).expect(200);
    const authorization = `Bearer ${login.body.data.accessToken}`;
    const created = await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", authorization)
      .send({ type: "text", content: "A test message" })
      .expect(201);
    expect(created.body.data.content).toBe("A test message");

    const timeline = await request(app)
      .get("/api/messages/c-maya")
      .set("Authorization", authorization)
      .expect(200);
    expect(timeline.body.data.messages.at(-1).id).toBe(created.body.data.id);
  });

  it("rejects empty or unsupported messages and conversations with unknown participants", async () => {
    const authorization = await login("alex@lumina.chat");

    await request(app)
      .post("/api/conversations")
      .set("Authorization", authorization)
      .send({ type: "direct", participants: ["missing-user"] })
      .expect(422);
    await request(app)
      .post("/api/conversations")
      .set("Authorization", authorization)
      .send({ type: "group", participants: ["u-maya", "missing-user"] })
      .expect(422);
    await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", authorization)
      .send({})
      .expect(422);
    await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", authorization)
      .send({ type: "unsupported", content: "Invalid type" })
      .expect(422);
  });

  it("removes a direct conversation from only the current user's inbox", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");

    await request(app)
      .delete("/api/conversations/c-maya")
      .set("Authorization", alexAuthorization)
      .expect(204);

    const alexConversations = await request(app).get("/api/conversations").set("Authorization", alexAuthorization).expect(200);
    const mayaConversations = await request(app).get("/api/conversations").set("Authorization", mayaAuthorization).expect(200);
    expect(alexConversations.body.data.some((conversation) => conversation.id === "c-maya")).toBe(false);
    expect(mayaConversations.body.data.some((conversation) => conversation.id === "c-maya")).toBe(true);
  });

  it("rejects upload extensions and image bytes outside the allowlist", async () => {
    const authorization = await login("alex@lumina.chat");
    await request(app)
      .post("/api/uploads")
      .set("Authorization", authorization)
      .attach("files", validPng, { filename: "photo.txt", contentType: "image/png" })
      .expect(400);
    await request(app)
      .post("/api/uploads")
      .set("Authorization", authorization)
      .attach("files", Buffer.from("not an image"), { filename: "photo.png", contentType: "image/png" })
      .expect(400);
  });

  it("rejects an upload larger than 25 MB", async () => {
    const authorization = await login("alex@lumina.chat");
    await request(app)
      .post("/api/uploads")
      .set("Authorization", authorization)
      .attach("files", Buffer.alloc(25 * 1024 * 1024 + 1), { filename: "large.png", contentType: "image/png" })
      .expect(413);
  });

  it("allows a conversation participant to retrieve a chat attachment and blocks outsiders", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");
    const jordanAuthorization = await login("jordan@lumina.chat");
    const uploaded = await request(app)
      .post("/api/uploads")
      .set("Authorization", alexAuthorization)
      .attach("files", validPng, { filename: "private.png", contentType: "image/png" })
      .expect(201);
    const attachment = uploaded.body.data[0];
    uploadedTestFiles.add(attachment.url.split("/").at(-1));

    await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", alexAuthorization)
      .send({ type: "image", attachments: [attachment] })
      .expect(201);

    await request(app).get(attachment.url).set("Authorization", mayaAuthorization).expect(200);
    await request(app).get(attachment.url).set("Authorization", jordanAuthorization).expect(403);
    await request(app).get(attachment.url).expect(401);
    await request(app).get(attachment.url.replace("/api", "")).expect(404);
  });

  it("enforces the upload count limit and file ownership before an attachment is shared", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const jordanAuthorization = await login("jordan@lumina.chat");
    let overLimit = request(app).post("/api/uploads").set("Authorization", alexAuthorization);
    for (let index = 0; index < 11; index += 1) {
      overLimit = overLimit.attach("files", validPng, { filename: `image-${index}.png`, contentType: "image/png" });
    }
    await overLimit.expect(400);

    const uploaded = await request(app)
      .post("/api/uploads")
      .set("Authorization", jordanAuthorization)
      .attach("files", validPng, { filename: "jordan-private.png", contentType: "image/png" })
      .expect(201);
    const attachment = uploaded.body.data[0];
    uploadedTestFiles.add(attachment.url.split("/").at(-1));

    await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", alexAuthorization)
      .send({ type: "image", attachments: [attachment] })
      .expect(403);
  });

  it("rejects protected routes without a token", async () => {
    await request(app).get("/api/conversations").expect(401);
    await request(app).get("/api/auth/sessions").expect(401);
  });

  it("allows the admin dashboard only for an administrator", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");
    await request(app).get("/api/admin/dashboard").set("Authorization", alexAuthorization).expect(200);
    await request(app).get("/api/admin/dashboard").set("Authorization", mayaAuthorization).expect(403);
  });

  it("creates reports for users, messages, and stories and restricts their moderation workflow to admins", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");
    const userReport = await request(app)
      .post("/api/reports")
      .set("Authorization", mayaAuthorization)
      .send({ targetType: "user", targetId: "u-jordan", reason: "Harassment", details: "Repeated unwanted messages." })
      .expect(201);
    await request(app)
      .post("/api/reports")
      .set("Authorization", mayaAuthorization)
      .send({ targetType: "message", targetId: "m-2", reason: "Abusive message" })
      .expect(201);
    await request(app)
      .post("/api/reports")
      .set("Authorization", mayaAuthorization)
      .send({ targetType: "story", targetId: "s-sofia", reason: "Inappropriate content" })
      .expect(201);

    expect(userReport.body.data).toMatchObject({ targetType: "user", targetId: "u-jordan", status: "open", reporter: { id: "u-maya" } });
    await request(app).get("/api/admin/reports").set("Authorization", mayaAuthorization).expect(403);
    await request(app).patch(`/api/admin/reports/${userReport.body.data.id}`).set("Authorization", mayaAuthorization).send({ status: "in_review" }).expect(403);

    const reports = await request(app).get("/api/admin/reports").set("Authorization", alexAuthorization).expect(200);
    expect(reports.body.data).toHaveLength(3);
    const reviewing = await request(app)
      .patch(`/api/admin/reports/${userReport.body.data.id}`)
      .set("Authorization", alexAuthorization)
      .send({ status: "in_review" })
      .expect(200);
    expect(reviewing.body.data).toMatchObject({ status: "in_review", resolvedAt: null });

    const resolved = await request(app)
      .post(`/api/admin/reports/${userReport.body.data.id}/resolve`)
      .set("Authorization", alexAuthorization)
      .send({ resolution: "Reviewed and actioned." })
      .expect(200);
    expect(resolved.body.data).toMatchObject({ status: "resolved", resolution: "Reviewed and actioned.", resolvedBy: "u-alex" });
    expect(resolved.body.data.resolvedAt).toBeTruthy();

    const dashboard = await request(app).get("/api/admin/dashboard").set("Authorization", alexAuthorization).expect(200);
    expect(dashboard.body.data.totals.reports).toBe(2);
  });

  it("allows an admin to lock a user, revoke their sessions, and disconnect their sockets", async () => {
    const maya = request.agent(app);
    const mayaLogin = await loginSession(maya, "maya@lumina.chat", "Password123!", "moderation-target-device");
    const mayaAuthorization = `Bearer ${mayaLogin.body.data.accessToken}`;
    const alexAuthorization = await login("alex@lumina.chat");
    const disconnected = [];
    const originalIo = app.get("io");
    app.set("io", {
      to: () => ({ emit: () => undefined }),
      in: (room) => ({ disconnectSockets: (force) => disconnected.push({ room, force }) }),
    });

    try {
      await request(app).get("/api/admin/users").set("Authorization", mayaAuthorization).expect(403);
      const locked = await request(app)
        .patch("/api/admin/users/u-maya/disabled")
        .set("Authorization", alexAuthorization)
        .send({ disabled: true })
        .expect(200);
      expect(locked.body.data).toMatchObject({ user: { id: "u-maya", disabled: true } });
      expect(locked.body.data.revokedSessions).toBeGreaterThanOrEqual(1);
      expect(disconnected).toEqual([{ room: "u-maya", force: true }]);

      await maya.post("/api/auth/refresh").send({}).expect(401);
      await request(app).post("/api/auth/login").send({ email: "maya@lumina.chat", password: "Password123!" }).expect(403);
      await request(app).get("/api/conversations").set("Authorization", mayaAuthorization).expect(403);

      await request(app)
        .patch("/api/admin/users/u-maya/disabled")
        .set("Authorization", alexAuthorization)
        .send({ disabled: false })
        .expect(200);
      await request(app).post("/api/auth/login").send({ email: "maya@lumina.chat", password: "Password123!" }).expect(200);
    } finally {
      app.set("io", originalIo);
    }
  });

  it("registers an account and creates an authenticated device session", async () => {
    const agent = request.agent(app);
    const response = await agent
      .post("/api/auth/register")
      .send({ username: "New Member", email: "new.member@lumina.chat", password: "NewPassword123!", device: { id: "register-device", name: "Registration browser", platform: "test" } })
      .expect(201);

    expect(response.body.data.user.email).toBe("new.member@lumina.chat");
    expect(response.headers["set-cookie"]?.[0]).toContain("lumina_refresh=");
    const sessions = await agent
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${response.body.data.accessToken}`)
      .expect(200);
    expect(sessions.body.data).toMatchObject([{ name: "Registration browser", isCurrent: true }]);
  });

  it("sends, verifies, and enforces email verification for a newly registered account", async () => {
    const email = "verify.member@lumina.chat";
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ username: "Verify Member", email, password: "NewPassword123!", device: { id: "verify-device", name: "Verification browser", platform: "test" } })
      .expect(201);

    expect(registered.body.data.user).toMatchObject({ email, verified: false });
    expect(registered.body.data.verification.debugOtp).toMatch(/^\d{6}$/);
    const unverifiedAuthorization = `Bearer ${registered.body.data.accessToken}`;

    await request(app)
      .post("/api/conversations")
      .set("Authorization", unverifiedAuthorization)
      .send({ type: "direct", participants: ["u-maya"] })
      .expect(403);

    const unknown = await request(app)
      .post("/api/auth/send-verification")
      .send({ email: "not-an-account@lumina.chat" })
      .expect(200);
    const resent = await request(app)
      .post("/api/auth/send-verification")
      .send({ email })
      .expect(200);

    expect(unknown.body.message).toBe("If that account needs verification, an OTP has been sent.");
    expect(resent.body.message).toBe(unknown.body.message);
    expect(unknown.body.data).toEqual({});
    expect(resent.body.data.debugOtp).toMatch(/^\d{6}$/);
    expect(resent.headers.ratelimit).toBeTruthy();

    const verified = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email, otp: resent.body.data.debugOtp, purpose: "verify" })
      .expect(200);
    expect(verified.body.data).toMatchObject({ verified: true, user: { email, verified: true } });

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NewPassword123!" })
      .expect(200);
    expect(loginResponse.body.data.user.verified).toBe(true);

    await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`)
      .send({ type: "direct", participants: ["u-maya"] })
      .expect(201);
  });

  it("validates and persists supported profile fields", async () => {
    const authorization = await login("alex@lumina.chat");
    const updated = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authorization)
      .send({ username: "Alex Updated", gender: "nonbinary", phone: "0900000000", birthday: "2000-01-01" })
      .expect(200);
    expect(updated.body.data).toMatchObject({ username: "Alex Updated", gender: "nonbinary", phone: "0900000000" });

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", authorization)
      .send({ birthday: "not-a-date" })
      .expect(422);
  });

  it("rotates refresh sessions and rejects an already-rotated refresh token", async () => {
    const agent = request.agent(app);
    const loginResponse = await loginSession(agent);
    const oldRefreshCookie = loginResponse.headers["set-cookie"][0].split(";")[0];
    const beforeRefresh = await agent.get("/api/auth/sessions").set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`).expect(200);

    const refreshed = await agent.post("/api/auth/refresh").send({}).expect(200);
    expect(refreshed.body.data.accessToken).toBeTypeOf("string");
    const afterRefresh = await agent.get("/api/auth/sessions").set("Authorization", `Bearer ${refreshed.body.data.accessToken}`).expect(200);
    expect(afterRefresh.body.data).toHaveLength(1);
    expect(afterRefresh.body.data[0].id).not.toBe(beforeRefresh.body.data[0].id);

    await request(app).post("/api/auth/refresh").set("Cookie", oldRefreshCookie).send({}).expect(401);
  });

  it("changes a password only with the current password and accepts the new password", async () => {
    const agent = request.agent(app);
    const loginResponse = await loginSession(agent);
    const authorization = `Bearer ${loginResponse.body.data.accessToken}`;

    await agent
      .patch("/api/users/me/password")
      .set("Authorization", authorization)
      .send({ currentPassword: "Password123!", newPassword: "ChangedPassword123!" })
      .expect(200);
    await request(app).post("/api/auth/login").send({ email: "alex@lumina.chat", password: "Password123!" }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "alex@lumina.chat", password: "ChangedPassword123!" }).expect(200);
  });

  it("revokes a selected device session, signs out other devices, and revokes refresh on logout", async () => {
    const primary = request.agent(app);
    const secondary = request.agent(app);
    const primaryLogin = await loginSession(primary, "alex@lumina.chat", "Password123!", "primary-device");
    await loginSession(secondary, "alex@lumina.chat", "Password123!", "secondary-device");
    const primaryAuthorization = `Bearer ${primaryLogin.body.data.accessToken}`;

    const sessions = await primary.get("/api/auth/sessions").set("Authorization", primaryAuthorization).expect(200);
    const secondarySession = sessions.body.data.find((session) => !session.isCurrent);
    expect(secondarySession).toMatchObject({ deviceId: "secondary-device" });
    await primary.delete(`/api/auth/sessions/${secondarySession.id}`).set("Authorization", primaryAuthorization).expect(204);
    await secondary.post("/api/auth/refresh").send({}).expect(401);

    const third = request.agent(app);
    await loginSession(third, "alex@lumina.chat", "Password123!", "third-device");
    const others = await primary.post("/api/auth/logout-others").set("Authorization", primaryAuthorization).send({}).expect(200);
    expect(others.body.data.revoked).toBe(1);
    await third.post("/api/auth/refresh").send({}).expect(401);

    await primary.post("/api/auth/logout").set("Authorization", primaryAuthorization).send({}).expect(204);
    await primary.post("/api/auth/refresh").send({}).expect(401);
  });

  it("allows a group admin to update shared group details", async () => {
    const authorization = await login("alex@lumina.chat");
    const response = await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({
        name: "Creative Circle",
        avatar: "/uploads/creative-circle.webp",
        color: "orange",
        participants: ["u-alex", "u-jordan", "u-sofia", "u-minh", "u-maya"],
        admins: ["u-alex", "u-jordan"],
      })
      .expect(200);

    expect(response.body.data).toMatchObject({ name: "Creative Circle", color: "orange" });
    expect(response.body.data.participants).toContain("u-maya");
    expect(response.body.data.admins).toEqual(["u-alex", "u-jordan"]);
  });

  it("allows a group admin to manage admins and remove a member", async () => {
    const authorization = await login("alex@lumina.chat");
    const promoted = await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ admins: ["u-alex", "u-jordan", "u-sofia"] })
      .expect(200);
    expect(promoted.body.data.admins).toEqual(["u-alex", "u-jordan", "u-sofia"]);

    const updated = await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ participants: ["u-alex", "u-sofia", "u-minh"], admins: ["u-alex", "u-sofia"] })
      .expect(200);
    expect(updated.body.data.participants).not.toContain("u-jordan");
    expect(updated.body.data.admins).toEqual(["u-alex", "u-sofia"]);

    const removedMemberAuthorization = await login("jordan@lumina.chat");
    await request(app).get("/api/conversations/c-design").set("Authorization", removedMemberAuthorization).expect(404);
  });

  it("blocks a normal group member from changing shared details but lets them change personal flags", async () => {
    const authorization = await login("sofia@lumina.chat");

    await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ name: "Unauthorized rename" })
      .expect(403);
    await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ admins: ["u-sofia"] })
      .expect(403);

    const response = await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ muted: true, favorite: true, pinned: true, archived: true })
      .expect(200);
    expect(response.body.data).toMatchObject({ muted: true, favorite: true, pinned: true, archived: true });
  });

  it("keeps at least one admin and requires every admin to remain a participant", async () => {
    const authorization = await login("alex@lumina.chat");

    await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ admins: [] })
      .expect(422);
    await request(app)
      .patch("/api/conversations/c-design")
      .set("Authorization", authorization)
      .send({ participants: ["u-jordan", "u-sofia"], admins: ["u-alex"] })
      .expect(422);
  });

  it("denies every conversation and message action to an outsider", async () => {
    const authorization = await login("maya@lumina.chat");

    await request(app).get("/api/conversations/c-design").set("Authorization", authorization).expect(404);
    await request(app).get("/api/messages/c-design").set("Authorization", authorization).expect(404);
    await request(app).post("/api/messages/c-design").set("Authorization", authorization).send({ content: "Intrusion" }).expect(404);
    await request(app).patch("/api/conversations/c-design").set("Authorization", authorization).send({ muted: true }).expect(404);
    await request(app).patch("/api/messages/item/m-4").set("Authorization", authorization).send({ content: "Intrusion" }).expect(404);
    await request(app).delete("/api/messages/item/m-4").set("Authorization", authorization).expect(404);
    await request(app).post("/api/messages/item/m-4/reaction").set("Authorization", authorization).send({ emoji: "👍" }).expect(404);
    await request(app).post("/api/messages/c-design/read").set("Authorization", authorization).expect(404);
    await request(app).delete("/api/conversations/c-design").set("Authorization", authorization).expect(404);
  });

  it("transfers the final admin role when an admin leaves a group", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const created = await request(app)
      .post("/api/conversations")
      .set("Authorization", alexAuthorization)
      .send({ type: "group", name: "Two people", participants: ["u-maya"] })
      .expect(201);

    await request(app)
      .post(`/api/conversations/${created.body.data.id}/leave`)
      .set("Authorization", alexAuthorization)
      .expect(200);

    const mayaAuthorization = await login("maya@lumina.chat");
    const afterLeave = await request(app)
      .get(`/api/conversations/${created.body.data.id}`)
      .set("Authorization", mayaAuthorization)
      .expect(200);
    expect(afterLeave.body.data.participants).toEqual(["u-maya"]);
    expect(afterLeave.body.data.admins).toEqual(["u-maya"]);
  });

  it("removes a group cleanly when its final member leaves", async () => {
    const authorization = await login("alex@lumina.chat");
    const created = await request(app)
      .post("/api/conversations")
      .set("Authorization", authorization)
      .send({ type: "group", name: "Temporary group", participants: ["u-maya"] })
      .expect(201);
    const conversationId = created.body.data.id;

    await request(app)
      .patch(`/api/conversations/${conversationId}`)
      .set("Authorization", authorization)
      .send({ participants: ["u-alex"], admins: ["u-alex"] })
      .expect(200);
    const left = await request(app)
      .post(`/api/conversations/${conversationId}/leave`)
      .set("Authorization", authorization)
      .expect(200);
    expect(left.body.data).toMatchObject({ id: conversationId, left: true, deleted: true, admins: [] });
    await request(app).get(`/api/conversations/${conversationId}`).set("Authorization", authorization).expect(404);
    await request(app).get(`/api/messages/${conversationId}`).set("Authorization", authorization).expect(404);
  });

  it("handles friend requests, notifications, blocking, and unblocking without restoring friendships", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");

    const requestCreated = await request(app)
      .post("/api/friends/u-maya")
      .set("Authorization", alexAuthorization)
      .send({ action: "request" })
      .expect(200);
    expect(requestCreated.body.data.friendship.status).toBe("pending");
    expect(requestCreated.body.data.user.relationship).toBe("outgoing-pending");

    await request(app)
      .post("/api/friends/u-maya")
      .set("Authorization", alexAuthorization)
      .send({ action: "request" })
      .expect(409);
    await request(app)
      .post("/api/friends/u-alex")
      .set("Authorization", alexAuthorization)
      .send({ action: "request" })
      .expect(400);

    const sent = await request(app).get("/api/friends/requests/sent").set("Authorization", alexAuthorization).expect(200);
    const received = await request(app).get("/api/friends/requests/received").set("Authorization", mayaAuthorization).expect(200);
    expect(sent.body.data).toHaveLength(1);
    expect(received.body.data).toHaveLength(1);
    expect(received.body.data[0]).toMatchObject({ status: "pending", requesterId: "u-alex", user: { id: "u-alex" } });

    const mayaNotifications = await request(app).get("/api/notifications").set("Authorization", mayaAuthorization).expect(200);
    expect(mayaNotifications.body.data.some((item) => item.title === "New friend request" && item.actorId === "u-alex")).toBe(true);

    const accepted = await request(app)
      .post("/api/friends/u-alex")
      .set("Authorization", mayaAuthorization)
      .send({ action: "accept" })
      .expect(200);
    expect(accepted.body.data.friendship.status).toBe("accepted");
    expect(accepted.body.data.user.relationship).toBe("friends");

    const alexFriends = await request(app).get("/api/friends").set("Authorization", alexAuthorization).expect(200);
    const mayaFriends = await request(app).get("/api/friends").set("Authorization", mayaAuthorization).expect(200);
    expect(alexFriends.body.data.map((friend) => friend.id)).toContain("u-maya");
    expect(mayaFriends.body.data.map((friend) => friend.id)).toContain("u-alex");
    const alexNotifications = await request(app).get("/api/notifications").set("Authorization", alexAuthorization).expect(200);
    expect(alexNotifications.body.data.some((item) => item.title === "Friend request accepted" && item.actorId === "u-maya")).toBe(true);

    await request(app)
      .post("/api/friends/u-alex")
      .set("Authorization", mayaAuthorization)
      .send({ action: "block" })
      .expect(200);
    const friendsAfterBlock = await request(app).get("/api/friends").set("Authorization", mayaAuthorization).expect(200);
    expect(friendsAfterBlock.body.data).toHaveLength(0);

    await request(app)
      .post("/api/conversations")
      .set("Authorization", alexAuthorization)
      .send({ type: "direct", participants: ["u-maya"] })
      .expect(403);
    await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", alexAuthorization)
      .send({ type: "text", content: "Blocked message" })
      .expect(403);
    await request(app)
      .post("/api/calls")
      .set("Authorization", alexAuthorization)
      .send({ conversationId: "c-maya", peer: { id: "u-maya" }, type: "voice" })
      .expect(403);
    await request(app)
      .post("/api/stories/s-maya/view")
      .set("Authorization", alexAuthorization)
      .send({})
      .expect(404);
    await request(app)
      .post("/api/friends/u-maya")
      .set("Authorization", alexAuthorization)
      .send({ action: "request" })
      .expect(403);

    await request(app)
      .post("/api/friends/u-alex")
      .set("Authorization", mayaAuthorization)
      .send({ action: "unblock" })
      .expect(200);
    const friendsAfterUnblock = await request(app).get("/api/friends").set("Authorization", mayaAuthorization).expect(200);
    expect(friendsAfterUnblock.body.data).toHaveLength(0);
  });

  it("records declined and cancelled friend request states", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const minhAuthorization = await login("minh@lumina.chat");

    await request(app).post("/api/friends/u-minh").set("Authorization", alexAuthorization).send({ action: "request" }).expect(200);
    const declined = await request(app)
      .post("/api/friends/u-alex")
      .set("Authorization", minhAuthorization)
      .send({ action: "decline" })
      .expect(200);
    expect(declined.body.data.friendship.status).toBe("declined");

    await request(app).post("/api/friends/u-sofia").set("Authorization", alexAuthorization).send({ action: "request" }).expect(200);
    const cancelled = await request(app)
      .post("/api/friends/u-sofia")
      .set("Authorization", alexAuthorization)
      .send({ action: "cancel" })
      .expect(200);
    expect(cancelled.body.data.friendship.status).toBe("cancelled");
  });

  it("applies privacy settings to profiles, conversations, and read receipts", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");

    await request(app)
      .patch("/api/settings")
      .set("Authorization", mayaAuthorization)
      .send({ language: "vi", privacy: { lastSeen: "nobody", profilePhoto: "nobody", readReceipts: false } })
      .expect(200);

    const [privateAvatar] = (await request(app)
      .post("/api/uploads?purpose=avatar")
      .set("Authorization", mayaAuthorization)
      .attach("files", validPng, { filename: "private-avatar.png", contentType: "image/png" })
      .expect(201)).body.data;
    uploadedTestFiles.add(privateAvatar.url.split("/").at(-1));
    await request(app).patch("/api/users/me").set("Authorization", mayaAuthorization).send({ avatar: privateAvatar.url }).expect(200);

    const savedSettings = await request(app).get("/api/settings").set("Authorization", mayaAuthorization).expect(200);
    expect(savedSettings.body.data.language).toBe("vi");

    const profile = await request(app).get("/api/users/u-maya").set("Authorization", alexAuthorization).expect(200);
    expect(profile.body.data).toMatchObject({ id: "u-maya", avatar: "", coverPhoto: "", lastSeen: null });
    await request(app).get(privateAvatar.url).set("Authorization", alexAuthorization).expect(403);
    await request(app).get(privateAvatar.url).set("Authorization", mayaAuthorization).expect(200);

    const ownProfile = await request(app).get("/api/users/u-maya").set("Authorization", mayaAuthorization).expect(200);
    expect(ownProfile.body.data.avatar).toBeTruthy();

    const conversation = await request(app).get("/api/conversations/c-maya").set("Authorization", alexAuthorization).expect(200);
    const maya = conversation.body.data.participantUsers.find((user) => user.id === "u-maya");
    expect(maya).toMatchObject({ avatar: "", coverPhoto: "", lastSeen: null });
    expect(conversation.body.data.avatar).toBe("");

    const created = await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", alexAuthorization)
      .send({ type: "text", content: "Private receipt" })
      .expect(201);
    const read = await request(app).post("/api/messages/c-maya/read").set("Authorization", mayaAuthorization).expect(200);
    expect(read.body.data.shared).toBe(false);

    const messages = await request(app).get("/api/messages/c-maya").set("Authorization", alexAuthorization).expect(200);
    const message = messages.body.data.messages.find((item) => item.id === created.body.data.id);
    expect(message).toMatchObject({ status: "delivered" });
    expect(message.readBy).not.toContain("u-maya");
  });

  it("shows friends-only profile details only after friendship is accepted", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");

    await request(app)
      .patch("/api/settings")
      .set("Authorization", mayaAuthorization)
      .send({ privacy: { lastSeen: "friends", profilePhoto: "friends" } })
      .expect(200);

    const before = await request(app).get("/api/users/u-maya").set("Authorization", alexAuthorization).expect(200);
    expect(before.body.data).toMatchObject({ avatar: "", lastSeen: null });

    await request(app).post("/api/friends/u-maya").set("Authorization", alexAuthorization).send({ action: "request" }).expect(200);
    await request(app).post("/api/friends/u-alex").set("Authorization", mayaAuthorization).send({ action: "accept" }).expect(200);

    const after = await request(app).get("/api/users/u-maya").set("Authorization", alexAuthorization).expect(200);
    expect(after.body.data.avatar).toBeTruthy();
    expect(after.body.data.lastSeen).toBeTruthy();
  });

  it("does not create disabled message or friend notifications and allows unfriend", async () => {
    const alexAuthorization = await login("alex@lumina.chat");
    const mayaAuthorization = await login("maya@lumina.chat");

    await request(app)
      .patch("/api/settings")
      .set("Authorization", mayaAuthorization)
      .send({ notifications: { messages: false, friendRequests: false } })
      .expect(200);

    const sent = await request(app)
      .post("/api/messages/c-maya")
      .set("Authorization", alexAuthorization)
      .send({ type: "text", content: "No notification please" })
      .expect(201);
    const afterMessage = await request(app).get("/api/notifications").set("Authorization", mayaAuthorization).expect(200);
    expect(afterMessage.body.data.some((item) => item.type === "message" && item.data?.messageId === sent.body.data.id)).toBe(false);

    await request(app).post("/api/friends/u-maya").set("Authorization", alexAuthorization).send({ action: "request" }).expect(200);
    const afterRequest = await request(app).get("/api/notifications").set("Authorization", mayaAuthorization).expect(200);
    expect(afterRequest.body.data.some((item) => item.type === "friend-request" && item.actorId === "u-alex")).toBe(false);

    await request(app).post("/api/friends/u-alex").set("Authorization", mayaAuthorization).send({ action: "accept" }).expect(200);
    await request(app).post("/api/friends/u-maya").set("Authorization", alexAuthorization).send({ action: "remove" }).expect(200);
    const friends = await request(app).get("/api/friends").set("Authorization", alexAuthorization).expect(200);
    expect(friends.body.data.map((friend) => friend.id)).not.toContain("u-maya");
  });
});
