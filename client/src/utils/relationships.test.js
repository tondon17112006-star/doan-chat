import { describe, expect, it } from "vitest";
import { relationshipActionsFor } from "./relationships.js";

describe("relationship actions", () => {
  it("offers unfriend only for an accepted friendship", () => {
    expect(relationshipActionsFor("friends")).toContain("remove");
    expect(relationshipActionsFor("none")).not.toContain("remove");
    expect(relationshipActionsFor("incoming-pending")).not.toContain("remove");
  });
});
