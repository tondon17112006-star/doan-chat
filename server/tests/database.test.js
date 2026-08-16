import { describe, expect, it } from "vitest";
import { canUseAtlasDnsFallback } from "../config/database.js";

describe("MongoDB Atlas connection fallback", () => {
  it("retries retryable MongoDB SRV connection failures", () => {
    expect(canUseAtlasDnsFallback("mongodb+srv://user:password@cluster.mongodb.net/chat", new Error("querySrv ECONNREFUSED cluster.mongodb.net"))).toBe(true);
    expect(canUseAtlasDnsFallback("mongodb+srv://user:password@cluster.mongodb.net/chat", new Error("Server selection timed out"))).toBe(true);
  });

  it("does not retry non-SRV URIs or authentication failures", () => {
    expect(canUseAtlasDnsFallback("mongodb://localhost:27017/chat", new Error("ECONNREFUSED"))).toBe(false);
    expect(canUseAtlasDnsFallback("mongodb+srv://user:password@cluster.mongodb.net/chat", new Error("Authentication failed."))).toBe(false);
  });
});
