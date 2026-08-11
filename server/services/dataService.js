import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { databaseReady } from "../config/database.js";
import { createSeedData } from "../data/seed.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, unique } from "../utils/helpers.js";

const defaults = createSeedData();
let users = defaults.users;
let conversations = defaults.conversations;
let messages = defaults.messages;
let stories = defaults.stories;
let notifications = defaults.notifications;
let calls = defaults.calls;
let settings = new Map();
let friendships = [];
let blocks = [];
let uploads = [];

export const USER_UPLOAD_QUOTA_BYTES = 250 * 1024 * 1024;

const now = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const clone = (value) => structuredClone(value);
const defaultSettings = () => ({
  theme: "system",
  chatWallpaper: "aurora",
  language: "en",
  notifications: { messages: true, calls: true, friendRequests: true, sound: true, desktop: false },
  privacy: { readReceipts: true, lastSeen: "everyone", profilePhoto: "everyone" },
});

function collection(name) {
  return mongoose.connection.db.collection(`lumina_${name}`);
}

function normalized(document) {
  if (!document) return document;
  const { _id, ...rest } = document;
  return { ...rest, id: String(document.id || _id) };
}

async function persist(name, item) {
  if (!databaseReady()) return;
  const document = clone(item);
  document._id = document.id;
  await collection(name).replaceOne({ _id: document._id }, document, { upsert: true });
}

async function loadCollection(name, fallback) {
  const items = await collection(name).find({}).toArray();
  if (items.length) return items.map(normalized);
  if (!fallback.length) return [];
  await collection(name).insertMany(fallback.map((item) => ({ ...clone(item), _id: item.id })));
  return clone(fallback);
}

async function removePersisted(name, id) {
  if (databaseReady()) await collection(name).deleteOne({ _id: String(id) });
}

export async function initializeDataService() {
  if (!databaseReady()) return;
  users = await loadCollection("users", defaults.users);
  conversations = await loadCollection("conversations", defaults.conversations);
  messages = await loadCollection("messages", defaults.messages);
  stories = await loadCollection("stories", defaults.stories);
  notifications = await loadCollection("notifications", defaults.notifications);
  calls = await loadCollection("calls", defaults.calls);
  friendships = await loadCollection("friendships", []);
  blocks = await loadCollection("blocks", []);
  uploads = await loadCollection("uploads", []);
  const savedSettings = await collection("settings").find({}).toArray();
  settings = new Map(savedSettings.map((item) => [String(item.id || item._id), normalized(item).value]));
}

export async function resetMemoryData() {
  const fresh = createSeedData();
  users = fresh.users;
  conversations = fresh.conversations;
  messages = fresh.messages;
  stories = fresh.stories;
  notifications = fresh.notifications;
  calls = fresh.calls;
  settings = new Map();
  friendships = [];
  blocks = [];
  uploads = [];
}

export async function findUserByEmail(email, withPassword = false) {
  const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
  return user ? (withPassword ? clone(user) : publicUser(user)) : null;
}

export async function findUserById(id) {
  const user = users.find((item) => item.id === String(id));
  return user ? clone(user) : null;
}

export async function createUser(input) {
  const timestamp = now();
  const user = {
    id: makeId("u"),
    email: String(input.email).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(input.password, 10),
    username: String(input.username).trim(),
    avatar: "",
    bio: "",
    status: "Available",
    location: "",
    role: "user",
    verified: false,
    isOnline: true,
    lastSeen: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  users.push(user);
  await persist("users", user);
  return publicUser(user);
}

export async function compareUserPassword(user, password) {
  return Boolean(user?.passwordHash) && bcrypt.compare(String(password || ""), user.passwordHash);
}

export async function listUsers(query = "", currentUserId) {
  const term = String(query || "").trim().toLowerCase();
  return users
    .filter((user) => user.id !== String(currentUserId) && user.role !== "assistant")
    .filter((user) => !term || `${user.username} ${user.email} ${user.location}`.toLowerCase().includes(term))
    .map((user) => ({ ...publicUser(user), relationship: relationshipFor(currentUserId, user.id) }));
}

export async function updateUser(id, updates) {
  const index = users.findIndex((item) => item.id === String(id));
  if (index < 0) return null;
  users[index] = { ...users[index], ...updates, updatedAt: now() };
  await persist("users", users[index]);
  return publicUser(users[index]);
}

export async function updatePassword(id, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  return updateUser(id, { passwordHash, passwordChangedAt: now() });
}

function userMap(ids) {
  return ids.map((id) => users.find((user) => user.id === String(id))).filter(Boolean).map(publicUser);
}

function canAccess(conversation, userId) {
  return conversation?.participants.map(String).includes(String(userId));
}

function samePair(record, firstUserId, secondUserId) {
  return (
    (record.requesterId === String(firstUserId) && record.recipientId === String(secondUserId)) ||
    (record.requesterId === String(secondUserId) && record.recipientId === String(firstUserId))
  );
}

function latestFriendship(firstUserId, secondUserId) {
  return friendships
    .filter((record) => samePair(record, firstUserId, secondUserId))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0];
}

export function isBlockedBetween(firstUserId, secondUserId) {
  return blocks.some(
    (record) =>
      (record.userId === String(firstUserId) && record.blockedUserId === String(secondUserId)) ||
      (record.userId === String(secondUserId) && record.blockedUserId === String(firstUserId)),
  );
}

function relationshipFor(currentUserId, targetUserId) {
  if (blocks.some((record) => record.userId === String(currentUserId) && record.blockedUserId === String(targetUserId))) return "blocked";
  if (blocks.some((record) => record.userId === String(targetUserId) && record.blockedUserId === String(currentUserId))) return "blocked-by";
  const relationship = latestFriendship(currentUserId, targetUserId);
  if (!relationship) return "none";
  if (relationship.status === "accepted") return "friends";
  if (relationship.status === "pending") {
    return relationship.requesterId === String(currentUserId) ? "outgoing-pending" : "incoming-pending";
  }
  return "none";
}

function directPeerId(conversation, userId) {
  if (conversation?.type !== "direct") return null;
  return conversation.participants.map(String).find((participantId) => participantId !== String(userId)) || null;
}

function localUploadFilename(url) {
  const match = /^\/api\/uploads\/([a-f0-9-]+\.[a-z0-9]+)$/i.exec(String(url || ""));
  return match?.[1] || null;
}

export async function assertUploadQuota(userId, incomingBytes) {
  const usedBytes = uploads
    .filter((item) => item.ownerId === String(userId))
    .reduce((total, item) => total + Math.max(0, Number(item.size) || 0), 0);
  if (usedBytes + Math.max(0, Number(incomingBytes) || 0) > USER_UPLOAD_QUOTA_BYTES) {
    throw new AppError("Your upload storage quota is full. Delete older files or try a smaller upload.", 413);
  }
}

export async function registerUploads(userId, files, purpose = "attachment") {
  const timestamp = now();
  const records = files.map((file) => ({
    id: String(file.filename),
    filename: String(file.filename),
    ownerId: String(userId),
    originalName: String(file.originalName),
    mimeType: String(file.mimeType),
    size: Math.max(0, Number(file.size) || 0),
    purpose,
    conversationIds: [],
    publicDemo: false,
    createdAt: timestamp,
  }));
  uploads.push(...records);
  await Promise.all(records.map((record) => persist("uploads", record)));
  return records.map(clone);
}

export async function findUploadByFilename(filename) {
  const record = uploads.find((item) => item.filename === String(filename));
  return record ? clone(record) : null;
}

export async function canUserReadUpload(userId, filename) {
  const record = uploads.find((item) => item.filename === String(filename));
  if (!record) return false;
  if (record.publicDemo || record.purpose === "avatar" || record.purpose === "story") return true;
  if (record.ownerId === String(userId)) return true;
  return (record.conversationIds || []).some((conversationId) => {
    const conversation = conversations.find((item) => item.id === String(conversationId));
    return canAccess(conversation, userId);
  });
}

export async function findPublicDemoUpload(filename) {
  const record = uploads.find((item) => item.filename === String(filename) && item.publicDemo === true);
  return record ? clone(record) : null;
}

export async function assertOwnedUploadPurpose(userId, url, purpose) {
  const filename = localUploadFilename(url);
  if (!filename) return;
  const record = uploads.find((item) => item.filename === filename);
  if (!record) throw new AppError("This uploaded file was not found.", 404);
  if (record.ownerId !== String(userId) || record.purpose !== purpose) {
    throw new AppError("You do not have permission to use this uploaded file here.", 403);
  }
}

async function claimMessageAttachments(userId, conversationId, attachments) {
  const claimed = [];
  const changes = [];
  for (const attachment of attachments || []) {
    const filename = localUploadFilename(attachment.url);
    if (!filename) {
      claimed.push(clone(attachment));
      continue;
    }
    const record = uploads.find((item) => item.filename === filename);
    if (!record) throw new AppError("This uploaded file was not found.", 404);
    if (record.purpose !== "attachment") throw new AppError("This file cannot be attached to a chat message.", 400);
    const wasAlreadyAccessible = (record.conversationIds || []).some((id) => {
      const existingConversation = conversations.find((item) => item.id === String(id));
      return canAccess(existingConversation, userId);
    });
    if (record.ownerId !== String(userId) && !wasAlreadyAccessible) {
      throw new AppError("You do not have permission to attach this file.", 403);
    }
    if (!(record.conversationIds || []).includes(String(conversationId))) {
      record.conversationIds = unique([...(record.conversationIds || []), String(conversationId)]);
      changes.push(record);
    }
    claimed.push({
      id: record.id,
      name: record.originalName,
      type: record.mimeType,
      size: record.size,
      url: `/api/uploads/${record.filename}`,
      ...(attachment.duration ? { duration: Math.max(0, Number(attachment.duration) || 0) } : {}),
    });
  }
  await Promise.all(changes.map((record) => persist("uploads", record)));
  return claimed;
}

export async function isDirectConversationBlocked(conversationId, userId) {
  const conversation = conversations.find((item) => item.id === String(conversationId));
  if (!canAccess(conversation, userId)) return null;
  const peerId = directPeerId(conversation, userId);
  return Boolean(peerId && isBlockedBetween(userId, peerId));
}

function lastMessageFor(conversationId) {
  return messages
    .filter((message) => message.conversationId === conversationId && !message.unsentAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function presentMessage(message) {
  return {
    ...clone(message),
    conversation: message.conversationId,
    sender: publicUser(users.find((user) => user.id === message.senderId)),
  };
}

function presentConversation(conversation, userId) {
  const participantUsers = userMap(conversation.participants);
  const other = participantUsers.find((user) => user.id !== String(userId));
  const latest = lastMessageFor(conversation.id);
  const unreadCount = messages.filter(
    (message) => message.conversationId === conversation.id && message.senderId !== String(userId) && !(message.readBy || []).includes(String(userId)),
  ).length;
  return {
    ...clone(conversation),
    name: conversation.type === "direct" ? other?.username || "Conversation" : conversation.name,
    avatar: conversation.type === "direct" ? other?.avatar || "" : conversation.avatar || "",
    participantUsers,
    lastMessage: latest?.unsentAt ? "Message removed" : latest?.content || latest?.attachments?.[0]?.name || "No messages yet",
    lastMessageAt: latest?.createdAt || conversation.lastMessageAt || conversation.createdAt,
    unreadCount,
    muted: (conversation.mutedBy || []).includes(String(userId)),
    favorite: (conversation.favoriteBy || []).includes(String(userId)),
    pinned: (conversation.pinnedBy || []).includes(String(userId)),
    archived: (conversation.archivedBy || []).includes(String(userId)),
  };
}

export async function getConversations(userId) {
  return conversations
    .filter((conversation) => canAccess(conversation, userId) && !(conversation.deletedFor || []).includes(String(userId)))
    .map((conversation) => presentConversation(conversation, userId))
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

export async function getConversation(id, userId) {
  const conversation = conversations.find((item) => item.id === String(id));
  return canAccess(conversation, userId) ? presentConversation(conversation, userId) : null;
}

export async function createConversation(userId, input) {
  const participantIds = unique([userId, ...(Array.isArray(input.participants) ? input.participants : [])]);
  if (input.type === "direct" && participantIds.length === 2 && isBlockedBetween(participantIds[0], participantIds[1])) return null;
  if (input.type === "direct" && participantIds.length === 2) {
    const existing = conversations.find(
      (item) => item.type === "direct" && item.participants.length === 2 && participantIds.every((id) => item.participants.includes(id)),
    );
    if (existing) return presentConversation(existing, userId);
  }
  const timestamp = now();
  const conversation = {
    id: makeId("c"),
    type: input.type === "group" ? "group" : "direct",
    name: input.name || "",
    avatar: input.avatar || "",
    color: input.color || (input.type === "group" ? "violet" : "blue"),
    participants: participantIds,
    admins: input.type === "group" ? [String(userId)] : [],
    mutedBy: [],
    favoriteBy: [],
    pinnedBy: [],
    archivedBy: [],
    deletedFor: [],
    createdBy: String(userId),
    createdAt: timestamp,
    lastMessageAt: timestamp,
  };
  conversations.push(conversation);
  await persist("conversations", conversation);
  return presentConversation(conversation, userId);
}

function toggleMembership(list, userId, enabled) {
  const next = new Set((list || []).map(String));
  if (enabled) next.add(String(userId));
  else next.delete(String(userId));
  return [...next];
}

export async function updateConversation(id, userId, updates) {
  const index = conversations.findIndex((item) => item.id === String(id));
  if (index < 0 || !canAccess(conversations[index], userId)) return null;
  const conversation = conversations[index];
  const sharedFields = ["name", "avatar", "color", "participants", "admins"];
  const changesSharedDetails = sharedFields.some((key) => updates[key] !== undefined);
  if (changesSharedDetails && (conversation.type !== "group" || !conversation.admins.map(String).includes(String(userId)))) {
    return null;
  }
  const directUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => sharedFields.includes(key)),
  );
  if (directUpdates.participants) directUpdates.participants = unique(directUpdates.participants);
  const userFlags = { muted: "mutedBy", pinned: "pinnedBy", favorite: "favoriteBy", archived: "archivedBy" };
  for (const [inputKey, listKey] of Object.entries(userFlags)) {
    if (updates[inputKey] !== undefined) {
      const enabled = updates[inputKey] === true || updates[inputKey] === "true";
      conversation[listKey] = toggleMembership(conversation[listKey], userId, enabled);
    }
  }
  conversations[index] = { ...conversation, ...directUpdates, updatedAt: now() };
  await persist("conversations", conversations[index]);
  return presentConversation(conversations[index], userId);
}

export async function leaveConversation(id, userId) {
  const index = conversations.findIndex((item) => item.id === String(id));
  if (index < 0 || !canAccess(conversations[index], userId) || conversations[index].type !== "group") return null;

  const conversation = conversations[index];
  const participants = conversation.participants.map(String).filter((participantId) => participantId !== String(userId));
  let admins = conversation.admins.map(String).filter((adminId) => adminId !== String(userId) && participants.includes(adminId));
  if (!admins.length && participants.length) {
    const successor = participants.includes(String(conversation.createdBy)) ? String(conversation.createdBy) : participants[0];
    admins = [successor];
  }
  conversations[index] = { ...conversation, participants, admins, updatedAt: now() };
  await persist("conversations", conversations[index]);
  return clone(conversations[index]);
}

export async function deleteConversationForUser(id, userId) {
  const index = conversations.findIndex((item) => item.id === String(id));
  if (index < 0 || !canAccess(conversations[index], userId)) return null;
  const conversation = conversations[index];
  conversation.deletedFor = unique([...(conversation.deletedFor || []), userId]);
  conversation.updatedAt = now();
  await persist("conversations", conversation);
  return { id: conversation.id, deleted: true };
}

export async function getMessages(conversationId, userId, before, limit = 60) {
  const conversation = conversations.find((item) => item.id === String(conversationId));
  if (!canAccess(conversation, userId)) return null;
  const pageSize = Math.min(Math.max(Number(limit) || 60, 1), 100);
  const filtered = messages
    .filter((message) => message.conversationId === String(conversationId))
    .filter((message) => !(message.deletedFor || []).includes(String(userId)))
    .filter((message) => !before || new Date(message.createdAt) < new Date(before))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = filtered.slice(0, pageSize).reverse().map(presentMessage);
  return { messages: page, nextCursor: filtered.length > pageSize ? page[0]?.createdAt : null };
}

export async function createMessage(userId, conversationId, input) {
  const conversation = conversations.find((item) => item.id === String(conversationId));
  const peerId = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId))) return null;
  const attachments = await claimMessageAttachments(userId, conversationId, input.attachments);
  const timestamp = now();
  const message = {
    id: makeId("m"),
    conversationId: String(conversationId),
    senderId: String(userId),
    type: input.type || (attachments[0]?.type?.split("/")[0] || "text"),
    content: input.content || "",
    attachments,
    replyTo: input.replyTo || null,
    forwardedFrom: input.forwardedFrom || null,
    reactions: [],
    readBy: [String(userId)],
    status: "sent",
    pinned: false,
    createdAt: timestamp,
  };
  messages.push(message);
  conversation.lastMessageAt = timestamp;
  await Promise.all([persist("messages", message), persist("conversations", conversation)]);
  return presentMessage(message);
}

export async function updateMessage(id, userId, content) {
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId)) || message.senderId !== String(userId) || message.unsentAt) return null;
  message.content = content;
  message.editedAt = now();
  await persist("messages", message);
  return presentMessage(message);
}

export async function deleteMessage(id, userId, everyone) {
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId))) return null;
  if (everyone && message.senderId === String(userId)) {
    message.content = "";
    message.attachments = [];
    message.unsentAt = now();
  } else {
    message.deletedFor = unique([...(message.deletedFor || []), userId]);
  }
  await persist("messages", message);
  return presentMessage(message);
}

export async function reactToMessage(id, userId, emoji) {
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId))) return null;
  for (const reaction of message.reactions || []) reaction.users = reaction.users.filter((idValue) => idValue !== String(userId));
  message.reactions = (message.reactions || []).filter((reaction) => reaction.users.length);
  if (emoji) {
    let reaction = message.reactions.find((item) => item.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, users: [] };
      message.reactions.push(reaction);
    }
    reaction.users.push(String(userId));
  }
  await persist("messages", message);
  return presentMessage(message);
}

export async function togglePinnedMessage(id, userId) {
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId))) return null;
  message.pinned = !message.pinned;
  await persist("messages", message);
  return presentMessage(message);
}

export async function markConversationRead(conversationId, userId) {
  const conversation = conversations.find((item) => item.id === String(conversationId));
  const peerId = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (peerId && isBlockedBetween(userId, peerId))) return false;
  const changed = messages.filter((message) => message.conversationId === String(conversationId) && message.senderId !== String(userId));
  await Promise.all(changed.map(async (message) => {
    message.readBy = unique([...(message.readBy || []), userId]);
    message.status = "read";
    message.readAt = now();
    await persist("messages", message);
  }));
  return true;
}

export async function getStories(userId) {
  return stories
    .filter((story) => !story.expiresAt || new Date(story.expiresAt) > new Date())
    .filter((story) => !isBlockedBetween(userId, story.userId))
    .map((story) => ({ ...clone(story), user: publicUser(users.find((user) => user.id === story.userId)) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createStory(userId, input) {
  const story = {
    id: makeId("s"),
    userId: String(userId),
    type: input.type === "video" ? "video" : "image",
    mediaUrl: input.mediaUrl,
    caption: input.caption || "",
    viewers: [],
    reactions: [],
    createdAt: now(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  stories.push(story);
  await persist("stories", story);
  return { ...clone(story), user: publicUser(users.find((user) => user.id === String(userId))) };
}

export async function viewStory(id, userId, reaction) {
  const story = stories.find((item) => item.id === String(id));
  if (!story || isBlockedBetween(userId, story.userId)) return null;
  story.viewers = unique([...(story.viewers || []), userId]);
  if (reaction) story.reactions.push({ userId: String(userId), emoji: reaction, createdAt: now() });
  await persist("stories", story);
  return clone(story);
}

export async function getNotifications(userId) {
  return notifications
    .filter((item) => item.userId === String(userId))
    .map((item) => ({ ...clone(item), actor: publicUser(users.find((user) => user.id === item.actorId)) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markNotificationsRead(userId) {
  const changed = notifications.filter((item) => item.userId === String(userId));
  await Promise.all(changed.map(async (item) => {
    item.read = true;
    await persist("notifications", item);
  }));
}

export async function getCalls(userId) {
  return calls
    .filter((item) => item.userId === String(userId))
    .map((item) => {
      const peer = publicUser(users.find((user) => user.id === item.peerId));
      const directConversation = !item.conversationId && peer && conversations.find(
        (conversation) => conversation.type === "direct" && canAccess(conversation, userId) && canAccess(conversation, peer.id),
      );
      return { ...clone(item), conversationId: item.conversationId || directConversation?.id || null, peer };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createCall(userId, input) {
  const conversation = conversations.find((item) => item.id === String(input.conversationId));
  const directPeer = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (directPeer && isBlockedBetween(userId, directPeer))) return null;
  const peerId = String(input.peer?.id || input.participants?.[0] || "");
  const call = {
    id: makeId("call"),
    userId: String(userId),
    peerId,
    conversationId: input.conversationId,
    type: input.type === "video" ? "video" : "voice",
    status: input.status || "ringing",
    direction: "outgoing",
    duration: Number(input.duration || 0),
    createdAt: now(),
  };
  calls.push(call);
  await persist("calls", call);
  return { ...clone(call), peer: publicUser(users.find((user) => user.id === peerId)) };
}

export async function listFriends(userId) {
  return users
    .filter((user) => user.id !== String(userId) && relationshipFor(userId, user.id) === "friends")
    .map((user) => ({ ...publicUser(user), relationship: "friends" }));
}

export async function listFriendRequests(userId, direction) {
  const requested = friendships
    .filter((record) => record.status === "pending")
    .filter((record) => (direction === "sent" ? record.requesterId === String(userId) : record.recipientId === String(userId)))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  return requested.map((record) => {
    const otherUserId = direction === "sent" ? record.recipientId : record.requesterId;
    return {
      ...clone(record),
      user: { ...publicUser(users.find((user) => user.id === otherUserId)), relationship: relationshipFor(userId, otherUserId) },
    };
  });
}

export async function friendAction(userId, targetId, action) {
  const actorId = String(userId);
  const target = users.find((item) => item.id === String(targetId));
  if (!target) return null;
  if (target.id === actorId) throw new AppError("You cannot change your relationship with yourself.", 400);

  if (action === "block") return blockUser(actorId, target);
  if (action === "unblock") return unblockUser(actorId, target);
  if (isBlockedBetween(actorId, target.id)) throw new AppError("This action is unavailable because one of you has blocked the other.", 403);

  if (action === "request") return sendFriendRequest(actorId, target);
  if (action === "accept" || action === "decline" || action === "cancel") return respondToFriendRequest(actorId, target, action);
  if (action === "remove") return removeFriend(actorId, target);
  throw new AppError("Unknown friend action.", 400);
}

async function sendFriendRequest(actorId, target) {
  const latest = latestFriendship(actorId, target.id);
  if (latest?.status === "accepted") throw new AppError("You are already friends.", 409);
  if (latest?.status === "pending") {
    const message = latest.requesterId === actorId ? "A friend request is already pending." : "This person has already sent you a friend request.";
    throw new AppError(message, 409);
  }

  const timestamp = now();
  const friendship = {
    id: makeId("friend"),
    requesterId: actorId,
    recipientId: target.id,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  friendships.push(friendship);
  const notification = await createRelationshipNotification(target.id, actorId, "friend-request");
  await persist("friendships", friendship);
  return relationshipResult("request", actorId, target, friendship, notification);
}

async function respondToFriendRequest(actorId, target, action) {
  if (action === "cancel") return cancelOutgoingFriendRequest(actorId, target);
  const friendship = friendships
    .filter((record) => record.requesterId === target.id && record.recipientId === actorId && record.status === "pending")
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0];
  if (!friendship) throw new AppError("No pending friend request was found.", 404);
  friendship.status = action === "accept" ? "accepted" : "declined";
  friendship.updatedAt = now();
  await persist("friendships", friendship);
  const notification = action === "accept" ? await createRelationshipNotification(target.id, actorId, "friend-accepted") : null;
  return relationshipResult(action, actorId, target, friendship, notification);
}

async function cancelOutgoingFriendRequest(actorId, target) {
  const friendship = friendships
    .filter((record) => record.requesterId === actorId && record.recipientId === target.id && record.status === "pending")
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0];
  if (!friendship) throw new AppError("No outgoing friend request was found.", 404);
  friendship.status = "cancelled";
  friendship.updatedAt = now();
  await persist("friendships", friendship);
  return relationshipResult("cancel", actorId, target, friendship);
}

async function removeFriend(actorId, target) {
  const friendship = latestFriendship(actorId, target.id);
  if (!friendship || friendship.status !== "accepted") throw new AppError("You are not friends with this user.", 404);
  friendship.status = "cancelled";
  friendship.updatedAt = now();
  await persist("friendships", friendship);
  return relationshipResult("remove", actorId, target, friendship);
}

async function blockUser(actorId, target) {
  let block = blocks.find((record) => record.userId === actorId && record.blockedUserId === target.id);
  if (!block) {
    block = { id: makeId("block"), userId: actorId, blockedUserId: target.id, createdAt: now() };
    blocks.push(block);
    await persist("blocks", block);
  }
  const activeRelationships = friendships.filter(
    (record) => samePair(record, actorId, target.id) && ["pending", "accepted"].includes(record.status),
  );
  await Promise.all(activeRelationships.map(async (friendship) => {
    friendship.status = "cancelled";
    friendship.updatedAt = now();
    await persist("friendships", friendship);
  }));
  return relationshipResult("block", actorId, target, null);
}

async function unblockUser(actorId, target) {
  const index = blocks.findIndex((record) => record.userId === actorId && record.blockedUserId === target.id);
  if (index < 0) throw new AppError("This user is not blocked.", 404);
  const [block] = blocks.splice(index, 1);
  await removePersisted("blocks", block.id);
  return relationshipResult("unblock", actorId, target, null);
}

async function createRelationshipNotification(userId, actorId, kind) {
  const actor = users.find((user) => user.id === actorId);
  const notification = {
    id: makeId("n"),
    userId,
    actorId,
    title: kind === "friend-accepted" ? "Friend request accepted" : "New friend request",
    body: kind === "friend-accepted" ? `${actor?.username || "Someone"} accepted your friend request.` : `${actor?.username || "Someone"} sent you a friend request.`,
    read: false,
    createdAt: now(),
  };
  notifications.push(notification);
  await persist("notifications", notification);
  return notification;
}

function relationshipResult(action, actorId, target, friendship, notification = null) {
  return {
    action,
    user: { ...publicUser(target), relationship: relationshipFor(actorId, target.id) },
    friendship: friendship ? clone(friendship) : null,
    notification,
    affectedUserIds: unique([actorId, target.id]),
  };
}

export async function searchEverything(userId, query) {
  const term = String(query || "").trim().toLowerCase();
  if (term.length < 2) return { users: [], conversations: [], messages: [], files: [] };
  const accessible = conversations.filter((conversation) => canAccess(conversation, userId));
  const accessibleIds = new Set(accessible.map((item) => item.id));
  const matchingMessages = messages.filter((message) => accessibleIds.has(message.conversationId));
  return {
    users: users.filter((user) => user.id !== String(userId) && `${user.username} ${user.email}`.toLowerCase().includes(term)).slice(0, 8).map(publicUser),
    conversations: accessible.map((item) => presentConversation(item, userId)).filter((item) => `${item.name} ${item.lastMessage}`.toLowerCase().includes(term)).slice(0, 8),
    messages: matchingMessages.filter((item) => item.content?.toLowerCase().includes(term)).slice(0, 12).map(presentMessage),
    files: matchingMessages.flatMap((message) => (message.attachments || []).map((file) => ({ ...file, conversationId: message.conversationId }))).filter((file) => `${file.name} ${file.type}`.toLowerCase().includes(term)).slice(0, 12),
  };
}

export async function getSettings(userId) {
  return clone(settings.get(String(userId)) || defaultSettings());
}

function mergeSettings(current, updates) {
  const next = { ...current, ...updates };
  if (updates.notifications) next.notifications = { ...current.notifications, ...updates.notifications };
  if (updates.privacy) next.privacy = { ...current.privacy, ...updates.privacy };
  return next;
}

export async function updateSettings(userId, updates) {
  const id = String(userId);
  const value = mergeSettings(settings.get(id) || defaultSettings(), updates);
  settings.set(id, value);
  await persist("settings", { id, value });
  return clone(value);
}

export async function adminStats() {
  const formatter = new Intl.DateTimeFormat("en", { weekday: "short" });
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return { key: date.toISOString().slice(0, 10), label: formatter.format(date) };
  });
  const messageCounts = new Map(days.map((day) => [day.key, 0]));
  for (const message of messages) {
    const day = String(message.createdAt || "").slice(0, 10);
    if (messageCounts.has(day)) messageCounts.set(day, messageCounts.get(day) + 1);
  }
  const storageBytes = messages.reduce(
    (total, message) => total + (message.attachments || []).reduce((size, attachment) => size + Math.max(0, Number(attachment.size) || 0), 0),
    0,
  );
  return {
    totals: {
      users: users.filter((user) => user.role !== "assistant").length,
      online: users.filter((user) => user.isOnline).length,
      messages: messages.length,
      storageBytes,
      reports: 0,
    },
    chart: days.map((day) => ({ label: day.label, messages: messageCounts.get(day.key) || 0 })),
    recentUsers: users.filter((user) => user.role !== "assistant").slice(-4).reverse().map(publicUser),
  };
}

export async function setUserPresence(userId, isOnline) {
  const user = users.find((item) => item.id === String(userId));
  if (!user) return null;
  user.isOnline = isOnline;
  user.lastSeen = now();
  await persist("users", user);
  return publicUser(user);
}
