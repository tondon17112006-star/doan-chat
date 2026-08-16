import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { databaseReady } from "../config/database.js";
import { env } from "../config/env.js";
import { createSeedData } from "../data/seed.js";
import { ensureMongoIndexes } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, unique } from "../utils/helpers.js";
import * as mongoData from "./mongoDataService.js";

let users = [];
let conversations = [];
let messages = [];
let stories = [];
let notifications = [];
let calls = [];
let settings = new Map();
let friendships = [];
let blocks = [];
let uploads = [];
let reports = [];

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

async function persist(name, item) {
  // MongoDB writes use typed Mongoose models in mongoDataService. This path is
  // deliberately a no-op for the in-memory demo store.
  void name;
  void item;
}

async function removePersisted(name, id) {
  void name;
  void id;
}

export async function initializeDataService() {
  if (databaseReady()) {
    if (!env.isProduction) await ensureMongoIndexes();
    return;
  }
  if (env.isProduction) return;
  await resetMemoryData();
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
  reports = [];
}

export async function findUserByEmail(email, withPassword = false) {
  if (databaseReady()) return mongoData.findUserByEmail(email, withPassword);
  const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
  return user ? (withPassword ? clone(user) : publicUser(user)) : null;
}

export async function findUserById(id) {
  if (databaseReady()) return mongoData.findUserById(id);
  const user = users.find((item) => item.id === String(id));
  return user ? clone(user) : null;
}

export async function createUser(input) {
  if (databaseReady()) return mongoData.createUser(input);
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
  if (databaseReady()) return mongoData.compareUserPassword(user, password);
  return Boolean(user?.passwordHash) && bcrypt.compare(String(password || ""), user.passwordHash);
}

export async function listUsers(query = "", currentUserId) {
  if (databaseReady()) return mongoData.listUsers(query, currentUserId);
  const term = String(query || "").trim().toLowerCase();
  return users
    .filter((user) => user.id !== String(currentUserId) && user.role !== "assistant")
    .filter((user) => !term || `${user.username} ${user.email} ${user.location}`.toLowerCase().includes(term))
    .map((user) => ({ ...presentUserForViewer(user, currentUserId), relationship: relationshipFor(currentUserId, user.id) }));
}

export async function getUserProfile(id, viewerId) {
  if (databaseReady()) return mongoData.getUserProfile(id, viewerId);
  const user = users.find((item) => item.id === String(id));
  return user ? presentUserForViewer(user, viewerId) : null;
}

export async function updateUser(id, updates) {
  if (databaseReady()) return mongoData.updateUser(id, updates);
  const index = users.findIndex((item) => item.id === String(id));
  if (index < 0) return null;
  users[index] = { ...users[index], ...updates, updatedAt: now() };
  await persist("users", users[index]);
  return publicUser(users[index]);
}

export async function updatePassword(id, password) {
  if (databaseReady()) return mongoData.updatePassword(id, password);
  const passwordHash = await bcrypt.hash(password, 10);
  return updateUser(id, { passwordHash, passwordChangedAt: now() });
}

function userMap(ids, viewerId) {
  return ids.map((id) => users.find((user) => user.id === String(id))).filter(Boolean).map((user) => presentUserForViewer(user, viewerId));
}

function privacySettingsFor(userId) {
  return settings.get(String(userId)) || defaultSettings();
}

function canViewPrivacySetting(viewerId, targetId, setting) {
  if (String(viewerId) === String(targetId)) return true;
  if (setting === "everyone") return true;
  if (setting === "friends") return relationshipFor(viewerId, targetId) === "friends";
  return false;
}

function presentUserForViewer(user, viewerId) {
  const result = publicUser(user);
  if (!result || String(result.id) === String(viewerId)) return result;
  const privacy = privacySettingsFor(result.id).privacy || defaultSettings().privacy;
  if (!canViewPrivacySetting(viewerId, result.id, privacy.profilePhoto)) {
    result.avatar = "";
    result.coverPhoto = "";
  }
  if (!canViewPrivacySetting(viewerId, result.id, privacy.lastSeen)) result.lastSeen = null;
  return result;
}

function readReceiptVisibleTo(viewerId, readerId) {
  return String(viewerId) === String(readerId) || privacySettingsFor(readerId).privacy?.readReceipts !== false;
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

function memoryIsBlockedBetween(firstUserId, secondUserId) {
  return blocks.some(
    (record) =>
      (record.userId === String(firstUserId) && record.blockedUserId === String(secondUserId)) ||
      (record.userId === String(secondUserId) && record.blockedUserId === String(firstUserId)),
  );
}

export async function isBlockedBetween(firstUserId, secondUserId) {
  if (databaseReady()) return mongoData.isBlockedBetween(firstUserId, secondUserId);
  return memoryIsBlockedBetween(firstUserId, secondUserId);
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
  if (databaseReady()) return mongoData.assertUploadQuota(userId, incomingBytes);
  const usedBytes = uploads
    .filter((item) => item.ownerId === String(userId))
    .reduce((total, item) => total + Math.max(0, Number(item.size) || 0), 0);
  if (usedBytes + Math.max(0, Number(incomingBytes) || 0) > USER_UPLOAD_QUOTA_BYTES) {
    throw new AppError("Your upload storage quota is full. Delete older files or try a smaller upload.", 413);
  }
}

export async function registerUploads(userId, files, purpose = "attachment") {
  if (databaseReady()) return mongoData.registerUploads(userId, files, purpose);
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
  if (databaseReady()) return mongoData.findUploadByFilename(filename);
  const record = uploads.find((item) => item.filename === String(filename));
  return record ? clone(record) : null;
}

export async function canUserReadUpload(userId, filename) {
  if (databaseReady()) return mongoData.canUserReadUpload(userId, filename);
  const record = uploads.find((item) => item.filename === String(filename));
  if (!record) return false;
  if (record.publicDemo || record.purpose === "story") return true;
  if (record.ownerId === String(userId)) return true;
  if (record.purpose === "avatar") return canViewPrivacySetting(userId, record.ownerId, privacySettingsFor(record.ownerId).privacy?.profilePhoto);
  return (record.conversationIds || []).some((conversationId) => {
    const conversation = conversations.find((item) => item.id === String(conversationId));
    return canAccess(conversation, userId);
  });
}

export async function findPublicDemoUpload(filename) {
  if (databaseReady()) return mongoData.findPublicDemoUpload(filename);
  const record = uploads.find((item) => item.filename === String(filename) && item.publicDemo === true);
  return record ? clone(record) : null;
}

export async function assertOwnedUploadPurpose(userId, url, purpose) {
  if (databaseReady()) return mongoData.assertOwnedUploadPurpose(userId, url, purpose);
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
  if (databaseReady()) return mongoData.isDirectConversationBlocked(conversationId, userId);
  const conversation = conversations.find((item) => item.id === String(conversationId));
  if (!canAccess(conversation, userId)) return null;
  const peerId = directPeerId(conversation, userId);
  return Boolean(peerId && memoryIsBlockedBetween(userId, peerId));
}

function lastMessageFor(conversationId) {
  return messages
    .filter((message) => message.conversationId === conversationId && !message.unsentAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function presentMessage(message, viewerId) {
  const value = clone(message);
  const visibleReadBy = (value.readBy || []).filter((readerId) => readReceiptVisibleTo(viewerId, readerId));
  if (value.status === "read" && String(value.senderId) === String(viewerId) && !visibleReadBy.some((readerId) => String(readerId) !== String(value.senderId))) {
    value.status = "delivered";
    delete value.readAt;
  }
  return {
    ...value,
    readBy: visibleReadBy,
    conversation: value.conversationId,
    sender: presentUserForViewer(users.find((user) => user.id === value.senderId), viewerId),
  };
}

function presentConversation(conversation, userId) {
  const participantUsers = userMap(conversation.participants, userId);
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
  if (databaseReady()) return mongoData.getConversations(userId);
  return conversations
    .filter((conversation) => canAccess(conversation, userId) && !(conversation.deletedFor || []).includes(String(userId)))
    .map((conversation) => presentConversation(conversation, userId))
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

export async function getConversation(id, userId) {
  if (databaseReady()) return mongoData.getConversation(id, userId);
  const conversation = conversations.find((item) => item.id === String(id));
  return canAccess(conversation, userId) ? presentConversation(conversation, userId) : null;
}

export async function createConversation(userId, input) {
  if (databaseReady()) return mongoData.createConversation(userId, input);
  const participantIds = unique([userId, ...(Array.isArray(input.participants) ? input.participants : [])]);
  if (input.type === "direct" && participantIds.length === 2 && memoryIsBlockedBetween(participantIds[0], participantIds[1])) return null;
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
  if (databaseReady()) return mongoData.updateConversation(id, userId, updates);
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
  if (databaseReady()) return mongoData.leaveConversation(id, userId);
  const index = conversations.findIndex((item) => item.id === String(id));
  if (index < 0 || !canAccess(conversations[index], userId) || conversations[index].type !== "group") return null;

  const conversation = conversations[index];
  const participants = conversation.participants.map(String).filter((participantId) => participantId !== String(userId));
  let admins = conversation.admins.map(String).filter((adminId) => adminId !== String(userId) && participants.includes(adminId));
  if (!admins.length && participants.length) {
    const successor = participants.includes(String(conversation.createdBy)) ? String(conversation.createdBy) : participants[0];
    admins = [successor];
  }
  if (!participants.length) {
    conversations.splice(index, 1);
    messages = messages.filter((message) => message.conversationId !== String(id));
    uploads = uploads.map((upload) => ({
      ...upload,
      conversationIds: (upload.conversationIds || []).filter((conversationId) => String(conversationId) !== String(id)),
    }));
    return { id: String(id), participants: [], admins: [], deleted: true };
  }
  conversations[index] = { ...conversation, participants, admins, updatedAt: now() };
  await persist("conversations", conversations[index]);
  return clone(conversations[index]);
}

export async function deleteConversationForUser(id, userId) {
  if (databaseReady()) return mongoData.deleteConversationForUser(id, userId);
  const index = conversations.findIndex((item) => item.id === String(id));
  if (index < 0 || !canAccess(conversations[index], userId)) return null;
  const conversation = conversations[index];
  conversation.deletedFor = unique([...(conversation.deletedFor || []), userId]);
  conversation.updatedAt = now();
  await persist("conversations", conversation);
  return { id: conversation.id, deleted: true };
}

export async function getMessages(conversationId, userId, before, limit = 60) {
  if (databaseReady()) return mongoData.getMessages(conversationId, userId, before, limit);
  const conversation = conversations.find((item) => item.id === String(conversationId));
  if (!canAccess(conversation, userId)) return null;
  const pageSize = Math.min(Math.max(Number(limit) || 60, 1), 100);
  const filtered = messages
    .filter((message) => message.conversationId === String(conversationId))
    .filter((message) => !(message.deletedFor || []).includes(String(userId)))
    .filter((message) => !before || new Date(message.createdAt) < new Date(before))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = filtered.slice(0, pageSize).reverse().map((message) => presentMessage(message, userId));
  return { messages: page, nextCursor: filtered.length > pageSize ? page[0]?.createdAt : null };
}

export async function createMessage(userId, conversationId, input) {
  if (databaseReady()) return mongoData.createMessage(userId, conversationId, input);
  const conversation = conversations.find((item) => item.id === String(conversationId));
  const peerId = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId))) return null;
  const clientMessageId = String(input.clientMessageId || "").slice(0, 120) || null;
  const existing = clientMessageId && messages.find((message) =>
    message.conversationId === String(conversationId)
    && message.senderId === String(userId)
    && message.clientMessageId === clientMessageId,
  );
  if (existing) return presentMessage(existing, userId);
  const attachments = await claimMessageAttachments(userId, conversationId, input.attachments);
  const timestamp = now();
  const message = {
    id: makeId("m"),
    conversationId: String(conversationId),
    senderId: String(userId),
    clientMessageId,
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
  return presentMessage(message, userId);
}

export async function markMessageDelivered(id) {
  if (databaseReady()) return mongoData.markMessageDelivered(id);
  const message = messages.find((item) => item.id === String(id));
  if (!message || message.status !== "sent") return message ? presentMessage(message, message.senderId) : null;
  message.status = "delivered";
  await persist("messages", message);
  return presentMessage(message, message.senderId);
}

export async function updateMessage(id, userId, content) {
  if (databaseReady()) return mongoData.updateMessage(id, userId, content);
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId)) || message.senderId !== String(userId) || message.unsentAt) return null;
  message.content = content;
  message.editedAt = now();
  await persist("messages", message);
  return presentMessage(message, userId);
}

export async function deleteMessage(id, userId, everyone) {
  if (databaseReady()) return mongoData.deleteMessage(id, userId, everyone);
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId))) return null;
  if (everyone && message.senderId === String(userId)) {
    message.content = "";
    message.attachments = [];
    message.unsentAt = now();
  } else {
    message.deletedFor = unique([...(message.deletedFor || []), userId]);
  }
  await persist("messages", message);
  return presentMessage(message, userId);
}

export async function reactToMessage(id, userId, emoji) {
  if (databaseReady()) return mongoData.reactToMessage(id, userId, emoji);
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId))) return null;
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
  return presentMessage(message, userId);
}

export async function togglePinnedMessage(id, userId) {
  if (databaseReady()) return mongoData.togglePinnedMessage(id, userId);
  const message = messages.find((item) => item.id === String(id));
  const conversation = conversations.find((item) => item.id === message?.conversationId);
  const peerId = directPeerId(conversation, userId);
  if (!message || !canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId))) return null;
  message.pinned = !message.pinned;
  await persist("messages", message);
  return presentMessage(message, userId);
}

export async function markConversationRead(conversationId, userId) {
  if (databaseReady()) return mongoData.markConversationRead(conversationId, userId);
  const conversation = conversations.find((item) => item.id === String(conversationId));
  const peerId = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (peerId && memoryIsBlockedBetween(userId, peerId))) return null;
  const changed = messages.filter((message) => message.conversationId === String(conversationId) && message.senderId !== String(userId));
  await Promise.all(changed.map(async (message) => {
    message.readBy = unique([...(message.readBy || []), userId]);
    message.status = "read";
    message.readAt = now();
    await persist("messages", message);
  }));
  return { marked: true, shareReceipt: privacySettingsFor(userId).privacy?.readReceipts !== false };
}

export async function getStories(userId) {
  if (databaseReady()) return mongoData.getStories(userId);
  return stories
    .filter((story) => !story.expiresAt || new Date(story.expiresAt) > new Date())
    .filter((story) => !memoryIsBlockedBetween(userId, story.userId))
    .map((story) => ({ ...clone(story), user: presentUserForViewer(users.find((user) => user.id === story.userId), userId) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createStory(userId, input) {
  if (databaseReady()) return mongoData.createStory(userId, input);
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
  return { ...clone(story), user: presentUserForViewer(users.find((user) => user.id === String(userId)), userId) };
}

export async function viewStory(id, userId, reaction) {
  if (databaseReady()) return mongoData.viewStory(id, userId, reaction);
  const story = stories.find((item) => item.id === String(id));
  if (!story || memoryIsBlockedBetween(userId, story.userId)) return null;
  story.viewers = unique([...(story.viewers || []), userId]);
  if (reaction) story.reactions.push({ userId: String(userId), emoji: reaction, createdAt: now() });
  await persist("stories", story);
  return clone(story);
}

export async function getNotifications(userId) {
  if (databaseReady()) return mongoData.getNotifications(userId);
  return notifications
    .filter((item) => item.userId === String(userId))
    .map((item) => ({ ...clone(item), actor: presentUserForViewer(users.find((user) => user.id === item.actorId), userId) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markNotificationsRead(userId) {
  if (databaseReady()) return mongoData.markNotificationsRead(userId);
  const changed = notifications.filter((item) => item.userId === String(userId));
  await Promise.all(changed.map(async (item) => {
    item.read = true;
    await persist("notifications", item);
  }));
}

export async function createRealtimeNotification(userId, actorId, input = {}) {
  if (databaseReady()) return mongoData.createRealtimeNotification(userId, actorId, input);
  if (!notificationEnabledFor(userId, input.type)) return null;
  const notification = {
    id: makeId("n"),
    userId: String(userId),
    actorId: String(actorId),
    type: String(input.type || "message").slice(0, 64),
    title: String(input.title || "New activity").slice(0, 200),
    body: String(input.body || "").slice(0, 500),
    data: input.data && typeof input.data === "object" ? clone(input.data) : {},
    read: false,
    createdAt: now(),
  };
  notifications.push(notification);
  await persist("notifications", notification);
  return { ...clone(notification), actor: presentUserForViewer(users.find((item) => item.id === notification.actorId), userId) };
}

export async function getCalls(userId) {
  if (databaseReady()) return mongoData.getCalls(userId);
  return calls
    .filter((item) => item.userId === String(userId))
    .map((item) => {
      const peer = presentUserForViewer(users.find((user) => user.id === item.peerId), userId);
      const directConversation = !item.conversationId && peer && conversations.find(
        (conversation) => conversation.type === "direct" && canAccess(conversation, userId) && canAccess(conversation, peer.id),
      );
      return { ...clone(item), conversationId: item.conversationId || directConversation?.id || null, peer };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createCall(userId, input) {
  if (databaseReady()) return mongoData.createCall(userId, input);
  const conversation = conversations.find((item) => item.id === String(input.conversationId));
  const directPeer = directPeerId(conversation, userId);
  if (!canAccess(conversation, userId) || (directPeer && memoryIsBlockedBetween(userId, directPeer))) return null;
  const peerId = String(input.peer?.id || input.participants?.[0] || "");
  const call = {
    id: makeId("call"),
    userId: String(userId),
    peerId,
    conversationId: input.conversationId,
    type: input.type === "video" ? "video" : "voice",
    status: input.status || "ringing",
    direction: input.direction === "incoming" ? "incoming" : "outgoing",
    duration: Number(input.duration || 0),
    ...(input.answeredAt ? { answeredAt: input.answeredAt } : {}),
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    createdAt: now(),
  };
  calls.push(call);
  await persist("calls", call);
  return { ...clone(call), peer: presentUserForViewer(users.find((user) => user.id === peerId), userId) };
}

export async function updateCall(id, updates = {}) {
  if (databaseReady()) return mongoData.updateCall(id, updates);
  const call = calls.find((item) => item.id === String(id));
  if (!call) return null;
  for (const key of ["status", "direction", "answeredAt", "endedAt"]) {
    if (updates[key] !== undefined) call[key] = updates[key];
  }
  if (updates.duration !== undefined) call.duration = Math.max(0, Number(updates.duration) || 0);
  await persist("calls", call);
  return { ...clone(call), peer: presentUserForViewer(users.find((user) => user.id === call.peerId), call.userId) };
}

export async function listFriends(userId) {
  if (databaseReady()) return mongoData.listFriends(userId);
  return users
    .filter((user) => user.id !== String(userId) && relationshipFor(userId, user.id) === "friends")
    .map((user) => ({ ...presentUserForViewer(user, userId), relationship: "friends" }));
}

export async function listFriendRequests(userId, direction) {
  if (databaseReady()) return mongoData.listFriendRequests(userId, direction);
  const requested = friendships
    .filter((record) => record.status === "pending")
    .filter((record) => (direction === "sent" ? record.requesterId === String(userId) : record.recipientId === String(userId)))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  return requested.map((record) => {
    const otherUserId = direction === "sent" ? record.recipientId : record.requesterId;
    return {
      ...clone(record),
      user: { ...presentUserForViewer(users.find((user) => user.id === otherUserId), userId), relationship: relationshipFor(userId, otherUserId) },
    };
  });
}

export async function friendAction(userId, targetId, action) {
  if (databaseReady()) return mongoData.friendAction(userId, targetId, action);
  const actorId = String(userId);
  const target = users.find((item) => item.id === String(targetId));
  if (!target) return null;
  if (target.id === actorId) throw new AppError("You cannot change your relationship with yourself.", 400);

  if (action === "block") return blockUser(actorId, target);
  if (action === "unblock") return unblockUser(actorId, target);
  if (memoryIsBlockedBetween(actorId, target.id)) throw new AppError("This action is unavailable because one of you has blocked the other.", 403);

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
  if (!notificationEnabledFor(userId, kind)) return null;
  const actor = users.find((user) => user.id === actorId);
  const notification = {
    id: makeId("n"),
    userId,
    actorId,
    type: kind,
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
    user: { ...presentUserForViewer(target, actorId), relationship: relationshipFor(actorId, target.id) },
    friendship: friendship ? clone(friendship) : null,
    notification,
    affectedUserIds: unique([actorId, target.id]),
  };
}

function notificationEnabledFor(userId, type) {
  const notifications = privacySettingsFor(userId).notifications || defaultSettings().notifications;
  if (type === "message") return notifications.messages !== false;
  if (type === "call") return notifications.calls !== false;
  if (type === "friend-request" || type === "friend-accepted") return notifications.friendRequests !== false;
  return true;
}

export async function searchEverything(userId, query) {
  if (databaseReady()) return mongoData.searchEverything(userId, query);
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
  if (databaseReady()) return mongoData.getSettings(userId);
  return clone(settings.get(String(userId)) || defaultSettings());
}

function mergeSettings(current, updates) {
  const next = { ...current, ...updates };
  if (updates.notifications) next.notifications = { ...current.notifications, ...updates.notifications };
  if (updates.privacy) next.privacy = { ...current.privacy, ...updates.privacy };
  return next;
}

export async function updateSettings(userId, updates) {
  if (databaseReady()) return mongoData.updateSettings(userId, updates);
  const id = String(userId);
  const value = mergeSettings(settings.get(id) || defaultSettings(), updates);
  settings.set(id, value);
  await persist("settings", { id, value });
  return clone(value);
}

const openReportStatuses = new Set(["open", "in_review"]);

function reportTarget(targetType, targetId) {
  if (targetType === "user") return users.find((user) => user.id === String(targetId)) || null;
  if (targetType === "message") return messages.find((message) => message.id === String(targetId)) || null;
  if (targetType === "story") return stories.find((story) => story.id === String(targetId)) || null;
  return null;
}

function presentReport(report) {
  const value = clone(report);
  const reporter = users.find((user) => user.id === value.reporterId);
  const target = reportTarget(value.targetType, value.targetId);
  return {
    ...value,
    reporter: reporter ? publicUser(reporter) : null,
    target: target ? (value.targetType === "user" ? publicUser(target) : { id: target.id, userId: target.userId || target.senderId, content: target.content || target.caption || "" }) : null,
  };
}

export async function createReport(reporterId, input) {
  if (databaseReady()) return mongoData.createReport(reporterId, input);
  const reporter = users.find((user) => user.id === String(reporterId));
  const target = reportTarget(input.targetType, input.targetId);
  if (!reporter || !target) throw new AppError("The reported item was not found.", 404);
  const targetOwnerId = input.targetType === "user" ? target.id : (target.userId || target.senderId);
  if (String(targetOwnerId) === String(reporterId)) throw new AppError("You cannot report your own content.", 422);
  if (reports.some((report) => report.reporterId === String(reporterId) && report.targetType === input.targetType && report.targetId === String(input.targetId) && openReportStatuses.has(report.status))) {
    throw new AppError("You already have an open report for this item.", 409);
  }
  const report = {
    id: makeId("r"),
    reporterId: String(reporterId),
    targetType: input.targetType,
    targetId: String(input.targetId),
    reason: String(input.reason).trim(),
    details: String(input.details || "").trim(),
    status: "open",
    resolution: "",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  reports.unshift(report);
  await persist("reports", report);
  return presentReport(report);
}

export async function listReports(status) {
  if (databaseReady()) return mongoData.listReports(status);
  return reports
    .filter((report) => !status || report.status === status)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map(presentReport);
}

export async function updateReportStatus(id, adminId, input) {
  if (databaseReady()) return mongoData.updateReportStatus(id, adminId, input);
  const index = reports.findIndex((report) => report.id === String(id));
  if (index < 0) return null;
  const status = input.status;
  const resolved = status === "resolved" || status === "dismissed";
  reports[index] = {
    ...reports[index],
    status,
    resolution: input.resolution !== undefined ? String(input.resolution || "").trim() : reports[index].resolution,
    resolvedBy: resolved ? String(adminId) : null,
    resolvedAt: resolved ? now() : null,
    updatedAt: now(),
  };
  await persist("reports", reports[index]);
  return presentReport(reports[index]);
}

export async function listAdminUsers() {
  if (databaseReady()) return mongoData.listAdminUsers();
  return users
    .filter((user) => user.role !== "assistant")
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map(publicUser);
}

export async function setUserDisabled(id, disabled, actorId) {
  if (databaseReady()) return mongoData.setUserDisabled(id, disabled, actorId);
  const index = users.findIndex((user) => user.id === String(id));
  if (index < 0) return null;
  const target = users[index];
  if (target.id === String(actorId)) throw new AppError("You cannot change your own account status.", 403);
  if (target.role === "admin" || target.role === "assistant") throw new AppError("Administrator accounts cannot be locked here.", 403);
  users[index] = { ...target, disabled: Boolean(disabled), isOnline: disabled ? false : target.isOnline, updatedAt: now() };
  await persist("users", users[index]);
  return publicUser(users[index]);
}

export async function adminStats() {
  if (databaseReady()) return mongoData.adminStats();
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
      reports: reports.filter((report) => openReportStatuses.has(report.status)).length,
    },
    chart: days.map((day) => ({ label: day.label, messages: messageCounts.get(day.key) || 0 })),
    recentUsers: users.filter((user) => user.role !== "assistant").slice(-4).reverse().map(publicUser),
  };
}

export async function setUserPresence(userId, isOnline) {
  if (databaseReady()) return mongoData.setUserPresence(userId, isOnline);
  const user = users.find((item) => item.id === String(userId));
  if (!user) return null;
  user.isOnline = isOnline;
  user.lastSeen = now();
  await persist("users", user);
  return publicUser(user);
}
