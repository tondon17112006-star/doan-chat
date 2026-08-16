const MESSAGE_TYPES = new Set(["text", "image", "video", "audio", "file", "system"]);
const MESSAGE_STATUSES = new Set(["sending", "sent", "delivered", "read"]);
const CALL_STATUSES = new Set(["ringing", "accepted", "rejected", "missed", "ended"]);
const FRIENDSHIP_STATUSES = new Set(["pending", "accepted", "declined", "cancelled"]);

const idOf = (value) => (value === undefined || value === null ? "" : String(value));
const unique = (values) => [...new Set(values.map(idOf).filter(Boolean))];
const dateOf = (value, fallback = new Date()) => {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed;
};
const text = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

function defaults() {
  return {
    theme: "system",
    chatWallpaper: "aurora",
    language: "en",
    notifications: { messages: true, calls: true, friendRequests: true, sound: true, desktop: false },
    privacy: { readReceipts: true, lastSeen: "everyone", profilePhoto: "everyone" },
  };
}

function validRole(value) {
  return ["user", "admin", "assistant"].includes(value) ? value : "user";
}

function validMessageType(value) {
  return MESSAGE_TYPES.has(value) ? value : "text";
}

function validMessageStatus(value) {
  return MESSAGE_STATUSES.has(value) ? value : "sent";
}

function validCallStatus(value) {
  return CALL_STATUSES.has(value) ? value : "ended";
}

function validFriendshipStatus(value) {
  return FRIENDSHIP_STATUSES.has(value) ? value : "cancelled";
}

function pairKey(firstUserId, secondUserId) {
  return [String(firstUserId), String(secondUserId)].sort().join(":");
}

function attachmentForLegacy(attachment, messageId, index) {
  const url = String(attachment?.url || "").trim();
  if (!url) return null;
  return {
    id: idOf(attachment?._id) || `${messageId}-attachment-${index + 1}`,
    name: text(attachment?.name, 255) || "Attachment",
    type: text(attachment?.type, 160) || "application/octet-stream",
    size: Math.max(0, Number(attachment?.size) || 0),
    url: url.slice(0, 2_048),
    ...(Number.isFinite(Number(attachment?.duration)) ? { duration: Math.max(0, Number(attachment.duration)) } : {}),
  };
}

function settingsForLegacy(document) {
  const base = defaults();
  return {
    theme: ["light", "dark", "system"].includes(document?.theme) ? document.theme : base.theme,
    chatWallpaper: text(document?.chatWallpaper, 100) || base.chatWallpaper,
    language: text(document?.language, 20) || base.language,
    notifications: { ...base.notifications, ...(document?.notifications || {}) },
    privacy: { ...base.privacy, ...(document?.privacy || {}) },
  };
}

function addWarning(plan, kind, id, reason) {
  plan.warnings.push({ kind, id, reason });
}

function replaceIfNewer(records, key, candidate, priority) {
  const current = records.get(key);
  if (!current || priority > current.priority || (priority === current.priority && candidate.updatedAt > current.document.updatedAt)) {
    records.set(key, { document: candidate, priority });
  }
}

/**
 * Converts the legacy ObjectId-based collections into documents understood by
 * the current lumina_* data layer. It never mutates its input.
 */
export function buildLegacyMigrationPlan(source) {
  const plan = {
    collections: {
      lumina_users: [],
      lumina_conversations: [],
      lumina_messages: [],
      lumina_stories: [],
      lumina_notifications: [],
      lumina_settings: [],
      lumina_friendships: [],
      lumina_blocks: [],
      lumina_calls: [],
    },
    skipped: {},
    warnings: [],
  };
  const skipped = (kind) => { plan.skipped[kind] = (plan.skipped[kind] || 0) + 1; };

  const users = new Map();
  for (const legacy of source.users || []) {
    const id = idOf(legacy._id);
    const email = String(legacy.email || "").trim().toLowerCase();
    const passwordHash = String(legacy.password || legacy.passwordHash || "");
    if (!id || !email || passwordHash.length < 20 || !text(legacy.username, 80)) {
      skipped("users");
      addWarning(plan, "user", id || "(missing id)", "Missing a required id, email, password hash, or username.");
      continue;
    }
    const user = {
      _id: id,
      email,
      passwordHash,
      username: text(legacy.username, 80),
      avatar: text(legacy.avatar, 2_048),
      coverPhoto: text(legacy.coverPhoto, 2_048),
      bio: text(legacy.bio, 500),
      gender: text(legacy.gender, 40),
      phone: text(legacy.phone, 40),
      status: text(legacy.status, 160) || "Available",
      location: text(legacy.location, 120),
      role: validRole(legacy.role),
      verified: Boolean(legacy.verified),
      disabled: Boolean(legacy.disabled),
      isOnline: Boolean(legacy.isOnline),
      lastSeen: dateOf(legacy.lastSeen),
      createdAt: dateOf(legacy.createdAt),
      updatedAt: dateOf(legacy.updatedAt || legacy.createdAt),
    };
    users.set(id, user);
    plan.collections.lumina_users.push(user);
  }

  const conversations = new Map();
  const directKeys = new Map();
  for (const legacy of source.conversations || []) {
    const id = idOf(legacy._id);
    const type = legacy.type === "group" ? "group" : legacy.type === "direct" ? "direct" : null;
    const originalParticipants = unique(legacy.participants || []);
    const participants = originalParticipants.filter((participant) => users.has(participant));
    if (!id || !type || !participants.length || participants.length !== originalParticipants.length || (type === "direct" && participants.length !== 2)) {
      skipped("conversations");
      addWarning(plan, "conversation", id || "(missing id)", "Invalid type, participant count, or participant reference.");
      continue;
    }
    const createdBy = users.has(idOf(legacy.createdBy)) ? idOf(legacy.createdBy) : participants[0];
    let admins = unique(legacy.admins || []).filter((admin) => participants.includes(admin));
    if (type === "group" && !admins.length) admins = [participants.includes(createdBy) ? createdBy : participants[0]];
    const directKey = type === "direct" ? [...participants].sort().join(":") : null;
    const document = {
      _id: id,
      type,
      name: type === "group" ? text(legacy.name, 100) : "",
      avatar: text(legacy.avatar, 2_048),
      color: text(legacy.color, 40) || (type === "group" ? "violet" : "blue"),
      participants,
      admins,
      directKey,
      lastMessage: idOf(legacy.lastMessage) || null,
      lastMessageAt: dateOf(legacy.lastMessageAt || legacy.updatedAt || legacy.createdAt),
      archivedBy: unique(legacy.archivedBy || []).filter((userId) => users.has(userId)),
      mutedBy: unique(legacy.mutedBy || []).filter((userId) => users.has(userId)),
      pinnedBy: unique(legacy.pinnedBy || []).filter((userId) => users.has(userId)),
      deletedFor: unique(legacy.deletedFor || []).filter((userId) => users.has(userId)),
      createdBy,
      createdAt: dateOf(legacy.createdAt),
      updatedAt: dateOf(legacy.updatedAt || legacy.createdAt),
    };
    if (directKey && directKeys.has(directKey)) {
      skipped("conversations");
      addWarning(plan, "conversation", id, `Duplicate direct conversation; kept ${directKeys.get(directKey)}.`);
      continue;
    }
    if (directKey) directKeys.set(directKey, id);
    conversations.set(id, document);
    plan.collections.lumina_conversations.push(document);
  }

  for (const legacy of source.messages || []) {
    const id = idOf(legacy._id);
    const conversationId = idOf(legacy.conversation);
    const senderId = idOf(legacy.sender);
    if (!id || !conversations.has(conversationId) || !users.has(senderId)) {
      skipped("messages");
      addWarning(plan, "message", id || "(missing id)", "Missing a valid conversation or sender reference.");
      continue;
    }
    const attachments = (legacy.attachments || []).map((attachment, index) => attachmentForLegacy(attachment, id, index)).filter(Boolean).slice(0, 10);
    const readBy = unique((legacy.readBy || []).map((entry) => entry?.user || entry?.userId || entry)).filter((userId) => users.has(userId));
    const document = {
      _id: id,
      conversationId,
      senderId,
      clientMessageId: legacy.clientMessageId ? text(legacy.clientMessageId, 120) : null,
      type: validMessageType(legacy.type),
      content: text(legacy.content, 10_000),
      attachments,
      replyTo: idOf(legacy.replyTo) || null,
      forwardedFrom: idOf(legacy.forwardedFrom) || null,
      reactions: [],
      readBy,
      deletedFor: unique(legacy.deletedFor || []).filter((userId) => users.has(userId)),
      status: validMessageStatus(legacy.status),
      pinned: Boolean(legacy.pinned),
      ...(legacy.editedAt ? { editedAt: dateOf(legacy.editedAt) } : {}),
      ...(legacy.readAt ? { readAt: dateOf(legacy.readAt) } : {}),
      ...(legacy.unsentAt ? { unsentAt: dateOf(legacy.unsentAt) } : {}),
      createdAt: dateOf(legacy.createdAt),
      updatedAt: dateOf(legacy.updatedAt || legacy.createdAt),
    };
    plan.collections.lumina_messages.push(document);
  }

  for (const legacy of source.stories || []) {
    const id = idOf(legacy._id);
    const userId = idOf(legacy.user);
    if (!id || !users.has(userId) || !legacy.mediaUrl) {
      skipped("stories");
      continue;
    }
    const viewers = unique((legacy.viewers || []).map((entry) => entry?.user || entry?.userId || entry)).filter((viewerId) => users.has(viewerId));
    plan.collections.lumina_stories.push({
      _id: id,
      userId,
      type: legacy.type === "video" ? "video" : "image",
      mediaUrl: text(legacy.mediaUrl, 2_048),
      caption: text(legacy.caption, 500),
      viewers,
      reactions: [],
      expiresAt: dateOf(legacy.expiresAt, new Date(Date.now() + 24 * 60 * 60 * 1_000)),
      createdAt: dateOf(legacy.createdAt),
      updatedAt: dateOf(legacy.updatedAt || legacy.createdAt),
    });
  }

  for (const legacy of source.notifications || []) {
    const id = idOf(legacy._id);
    const userId = idOf(legacy.user);
    if (!id || !users.has(userId)) {
      skipped("notifications");
      continue;
    }
    const actorId = idOf(legacy.actor);
    plan.collections.lumina_notifications.push({
      _id: id,
      userId,
      actorId: users.has(actorId) ? actorId : null,
      type: text(legacy.type, 80) || "system",
      title: text(legacy.title, 160) || "Notification",
      body: text(legacy.body, 1_000),
      read: Boolean(legacy.read),
      data: legacy.entityType || legacy.entityId ? { entityType: text(legacy.entityType, 80), entityId: idOf(legacy.entityId) || null } : null,
      createdAt: dateOf(legacy.createdAt),
      updatedAt: dateOf(legacy.updatedAt || legacy.createdAt),
    });
  }

  for (const legacy of source.settings || []) {
    const userId = idOf(legacy.user);
    if (!users.has(userId)) {
      skipped("settings");
      continue;
    }
    plan.collections.lumina_settings.push({ _id: userId, value: settingsForLegacy(legacy), createdAt: dateOf(legacy.createdAt), updatedAt: dateOf(legacy.updatedAt || legacy.createdAt) });
  }

  const friendships = new Map();
  for (const legacy of source.friends || []) {
    const members = unique(legacy.users || []);
    if (members.length !== 2 || members.some((userId) => !users.has(userId))) {
      skipped("friends");
      continue;
    }
    const [requesterId, recipientId] = members;
    const document = { _id: `legacy-friend-${idOf(legacy._id)}`, requesterId, recipientId, pairKey: pairKey(requesterId, recipientId), status: "accepted", createdAt: dateOf(legacy.createdAt), updatedAt: dateOf(legacy.updatedAt || legacy.createdAt) };
    replaceIfNewer(friendships, document.pairKey, document, 3);
  }
  for (const legacy of source.friendrequests || []) {
    const requesterId = idOf(legacy.sender);
    const recipientId = idOf(legacy.recipient);
    if (!requesterId || requesterId === recipientId || !users.has(requesterId) || !users.has(recipientId)) {
      skipped("friendrequests");
      continue;
    }
    const status = validFriendshipStatus(legacy.status);
    const document = { _id: `legacy-request-${idOf(legacy._id)}`, requesterId, recipientId, pairKey: pairKey(requesterId, recipientId), status, createdAt: dateOf(legacy.createdAt), updatedAt: dateOf(legacy.updatedAt || legacy.createdAt) };
    replaceIfNewer(friendships, document.pairKey, document, status === "accepted" ? 3 : status === "pending" ? 2 : 1);
  }
  plan.collections.lumina_friendships.push(...[...friendships.values()].map((entry) => entry.document));

  const blocks = new Set();
  for (const legacy of source.blockedusers || []) {
    const userId = idOf(legacy.user);
    const blockedUserId = idOf(legacy.blocked);
    const key = `${userId}:${blockedUserId}`;
    if (!userId || userId === blockedUserId || !users.has(userId) || !users.has(blockedUserId) || blocks.has(key)) {
      skipped("blocks");
      continue;
    }
    blocks.add(key);
    plan.collections.lumina_blocks.push({ _id: `legacy-block-${idOf(legacy._id)}`, userId, blockedUserId, createdAt: dateOf(legacy.createdAt), updatedAt: dateOf(legacy.updatedAt || legacy.createdAt) });
  }

  for (const legacy of source.calls || []) {
    const id = idOf(legacy._id);
    const userId = idOf(legacy.initiator);
    const conversationId = idOf(legacy.conversation);
    const inferredPeers = conversations.get(conversationId)?.participants || [];
    const peers = unique([...(legacy.participants || []), ...inferredPeers]).filter((peerId) => peerId !== userId && users.has(peerId));
    if (!id || !users.has(userId) || !peers.length) {
      skipped("calls");
      continue;
    }
    for (const peerId of peers) {
      const base = {
        conversationId: conversations.has(conversationId) ? conversationId : null,
        type: legacy.type === "video" ? "video" : "voice",
        status: validCallStatus(legacy.status),
        duration: Math.max(0, Number(legacy.duration) || 0),
        ...(legacy.answeredAt ? { answeredAt: dateOf(legacy.answeredAt) } : {}),
        ...(legacy.endedAt ? { endedAt: dateOf(legacy.endedAt) } : {}),
        createdAt: dateOf(legacy.createdAt || legacy.startedAt),
        updatedAt: dateOf(legacy.updatedAt || legacy.createdAt || legacy.startedAt),
      };
      plan.collections.lumina_calls.push(
        { _id: `legacy-call-${id}-${userId}-out`, userId, peerId, direction: "outgoing", ...base },
        { _id: `legacy-call-${id}-${peerId}-in`, userId: peerId, peerId: userId, direction: "incoming", ...base },
      );
    }
  }

  plan.skipped.refreshSessions = (source.refreshtokens || []).length;
  plan.skipped.devices = (source.devices || []).length;
  if (plan.skipped.refreshSessions) addWarning(plan, "refreshSessions", "legacy refreshtokens", "Skipped so every device signs in again with a new revocable session.");
  if (plan.skipped.devices) addWarning(plan, "devices", "legacy devices", "Skipped because current sessions create their own device records.");
  return plan;
}

export function migrationSummary(plan) {
  return Object.fromEntries(Object.entries(plan.collections).map(([collection, documents]) => [collection, documents.length]));
}
