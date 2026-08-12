import { describe, expect, it } from "vitest";
import { formatAttachmentBytes, getSharedItems } from "./conversationShared.js";

describe("conversation shared items", () => {
  it("derives media, files, and unique links from actual messages", () => {
    const shared = getSharedItems([
      {
        id: "m-1",
        content: "See https://lumina.chat/docs and https://lumina.chat/docs.",
        attachments: [
          { id: "a-1", url: "/uploads/photo.webp", type: "image/webp", name: "photo.webp" },
          { id: "a-2", url: "/uploads/notes.pdf", type: "application/pdf", name: "notes.pdf", size: 2048 },
        ],
      },
      { id: "m-2", content: "More at https://example.com/path).", attachments: [{ id: "a-3", url: "/uploads/clip.webm", type: "video/webm" }] },
    ]);

    expect(shared.media.map((item) => item.url)).toEqual(["/uploads/photo.webp", "/uploads/clip.webm"]);
    expect(shared.files.map((item) => item.name)).toEqual(["notes.pdf"]);
    expect(shared.links.map((item) => item.url)).toEqual(["https://lumina.chat/docs", "https://example.com/path"]);
    expect(formatAttachmentBytes(2048)).toBe("2.0 KB");
  });
});
