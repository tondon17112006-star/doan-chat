import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { resetMemoryData } from "../services/dataService.js";

beforeEach(async () => {
  await resetMemoryData();
});

describe("Lumina API", () => {
  it("reports service health", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toMatchObject({ success: true, service: "lumina-api" });
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

  it("rejects protected routes without a token", async () => {
    await request(app).get("/api/conversations").expect(401);
  });
});
