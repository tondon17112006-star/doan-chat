import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { databaseReady } from "../config/database.js";
import { createSeedData } from "../data/seed.js";
import { publicUser, unique } from "../utils/helpers.js";

const defaults = createSeedData();
let users = defaults.users;
let conversations = defaults.conversations;
let messages = defaults.messages;
let stories = defaults.stories;
let notifications = defaults.notifications;
let calls = defaults.calls;
let settings = new Map();

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
  await collection(name).insertMany(fallback.map((item) => ({ ...clone(item), _id: item.id })));
  return clone(fallback);
}

export async function initializeDataService() {
  if (!databaseReady()) return;
  users = await loadCollection("users", defaults.users);
  conversations = await loadCollection("conversations", defaults.conversations);
  messages = await loadCollection("messages", defaults.messages);
  stories = await loadCollection("stories", defaults.stories);
  notifications = await loadCollection("notifications", defaults.notifications);
  calls = await loadCollection("calls", defaults.calls);
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
    .map(publicUser);
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
  return updateUser(id, { passwordHash });
}

function userMap(ids) {
  return ids.map((id) => users.find((user) => user.id === String(id))).filter(Boolean).map(publicUser);
}

function canAccess(conversation, userId) {
  return conversation?.participants.map(String).includes(String(userId));
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
  const directUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => ["name", "avatar", "color", "participants", "admins"].includes(key)),
  );
  if (directUpdates.participants) directUpdates.participants = unique(directUpdates.participants);
  const userFlags = { muted: "mutedBy", pinned: "pinnedBy", favorite: "favoriteBy", archived: "archivedBy" };
  for (const [inputKey, listKey] of Object.entries(userFlags)) {
    if (updates[inputKey] !== undefined) conversation[listKey] = toggleMembership(conversation[listKey], userId, Boolean(updates[inputKey]));
  }
  conversations[index] = { ...conversation, ...directUpdates, updatedAt: now() };
  await persist("conversations", conversations[index]);
  return presentConversation(conversations[index], userId);
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
  if (!canAccess(conversation, userId)) return null;
  const timestamp = now();
  const message = {
    id: makeId("m"),
    conversationId: String(conversationId),
    senderId: String(userId),
    type: input.type || (input.attachments?.[0]?.type?.split("/")[0] || "text"),
    content: input.content || "",
    attachments: clone(input.attachments || []),
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
  if (!message || message.senderId !== String(userId) || message.unsentAt) return null;
  message.content = content;
  message.editedAt = now();
  await persist("messages", message);
  return presentMessage(message);
}

export async function deleteMessage(id, userId, everyone) {
  const message = messages.find((item) => item.id === String(id));
  if (!message) return null;
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
  if (!message) return null;
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
  if (!message || !canAccess(conversation, userId)) return null;
  message.pinned = !message.pinned;
  await persist("messages", message);
  return presentMessage(message);
}

export async function markConversationRead(conversationId, userId) {
  const changed = messages.filter((message) => message.conversationId === String(conversationId) && message.senderId !== String(userId));
  await Promise.all(changed.map(async (message) => {
    message.readBy = unique([...(message.readBy || []), userId]);
    message.status = "read";
    message.readAt = now();
    await persist("messages", message);
  }));
}

export async function getStories() {
  return stories
    .filter((story) => !story.expiresAt || new Date(story.expiresAt) > new Date())
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
  if (!story) return null;
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
    .map((item) => ({ ...clone(item), peer: publicUser(users.find((user) => user.id === item.peerId)) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createCall(userId, input) {
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

export async function friendAction(userId, targetId, action) {
  const target = users.find((item) => item.id === String(targetId));
  if (!target || target.id === String(userId)) return null;
  const notification = {
    id: makeId("n"),
    userId: target.id,
    actorId: String(userId),
    title: action === "block" ? "Connection updated" : "New friend request",
    body: action === "block" ? "A privacy setting was changed." : `${users.find((item) => item.id === String(userId))?.username} sent you a friend request.`,
    read: false,
    createdAt: now(),
  };
  notifications.push(notification);
  await persist("notifications", notification);
  return { action, user: publicUser(target), notification };
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
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    totals: {
      users: users.filter((user) => user.role !== "assistant").length,
      online: users.filter((user) => user.isOnline).length,
      messages: messages.length,
      storage: 18,
      reports: 0,
    },
    chart: labels.map((label, index) => ({ label, messages: Math.max(2, messages.length * 2 + index * 3) })),
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
