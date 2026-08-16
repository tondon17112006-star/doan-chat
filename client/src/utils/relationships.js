const actionsByRelationship = {
  none: ["request", "message", "block"],
  "incoming-pending": ["accept", "decline", "block"],
  "outgoing-pending": ["cancel", "block"],
  friends: ["message", "remove", "block"],
  blocked: ["unblock"],
  "blocked-by": [],
};

export function relationshipActionsFor(relationship) {
  return actionsByRelationship[relationship || "none"] || actionsByRelationship.none;
}
