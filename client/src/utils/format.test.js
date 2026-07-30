// File: client/src/utils/format.test.js
import { describe, expect, it } from "vitest";
import { formatBytes, groupByDay } from "./format.js";

describe("format utilities", () => {
  it("formats common file sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("groups a timeline into calendar days", () => {
    const messages = [
      { id: "1", createdAt: "2026-07-27T08:00:00.000Z" },
      { id: "2", createdAt: "2026-07-27T09:00:00.000Z" },
      { id: "3", createdAt: "2026-07-28T08:00:00.000Z" },
    ];
    const groups = groupByDay(messages);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages).toHaveLength(2);
    expect(groups[1].messages[0].id).toBe("3");
  });
});
