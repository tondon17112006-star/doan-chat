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
});
