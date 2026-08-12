import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { redactForLog, requestErrorFields, structuredRequestLogger } from "../services/logger.js";

describe("structured logging", () => {
  it("redacts credentials recursively", () => {
    const credentialUri = ["mongodb://user", "database-password@db.example/lumina?token=query-token"].join(":");
    const redacted = redactForLog({
      password: "Password123!",
      nested: { accessToken: "secret-token", otp: "123456" },
      error: credentialUri,
    });
    expect(redacted).toEqual({
      password: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", otp: "[REDACTED]" },
      error: ["mongodb://user", "[REDACTED]@db.example/lumina?token=[REDACTED]"].join(":"),
    });
  });

  it("logs request metadata without query parameters, headers, cookies or body", () => {
    process.env.LOG_REQUESTS_IN_TEST = "true";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = {
      method: "POST",
      originalUrl: "/api/auth/login?token=query-secret",
      headers: { authorization: "Bearer header-secret", cookie: "session=cookie-secret" },
      body: { password: "Password123!", otp: "123456" },
      user: { id: "u-alex" },
    };
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    response.setHeader = (key, value) => { response.headers[key] = value; };
    response.getHeader = (key) => response.headers[key];

    structuredRequestLogger(request, response, () => undefined);
    response.emit("finish");

    const entry = JSON.parse(info.mock.calls.at(-1)[0]);
    expect(entry).toMatchObject({ event: "http_request", method: "POST", path: "/api/auth/login", statusCode: 200, userId: "u-alex" });
    expect(JSON.stringify(entry)).not.toMatch(/query-secret|header-secret|cookie-secret|Password123|123456/);
    info.mockRestore();
    delete process.env.LOG_REQUESTS_IN_TEST;
  });

  it("redacts sensitive values from error fields", () => {
    const credentialUri = ["mongodb://user", "pass@host/db"].join(":");
    const fields = requestErrorFields(
      new Error(`Bearer abc.def.ghi failed with OTP 123456, password=visible at ${credentialUri}`),
      { id: "request-id", method: "POST", originalUrl: "/api/auth/refresh?token=secret" },
      500,
    );
    expect(JSON.stringify(fields)).not.toMatch(/abc\.def|123456|visible|:pass@|token=secret/);
  });
});
