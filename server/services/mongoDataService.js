import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  Block,
  Call,
  Conversation,
  Friendship,
  Message,
  Notification,
  Settings,
  Story,
  Upload,
  User,
} from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, unique } from "../utils/helpers.js";

export const USER_UPLOAD_QUOTA_BYTES = 250 * 1024 * 1024;

const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const now = () => new Date();
const defaultSettings = () => ({
  theme: "system",
  chatWallpaper: "aurora",
  language: "en",
  notifications: { messages: true, calls: true, friendRequests: true, sound: true, desktop: false },
  privacy: { readReceipts: true, lastSeen: "everyone", profilePhoto: "everyone" },
});
const directKey = (ids) => unique(ids).sort().join(":");
const pairKey = (firstUserId, secondUserId) => [String(firstUserId), String(secondUserId)].sort().join(":");

function record(document) {
  if (!document) return null;
  const value = typeof document.toObject === "function" ? document.toObject() : document;
  const { _id, __v, ...rest } = value;
  return { ...rest, id: String(value.id || _id) };
}

function documentForCreate(value) {
  const { id, ...rest } = value;
  return { ...rest, _id: String(id) };
}

function isMember(conversation, userId) {
  return Boolean(conversation?.participants?.map(String).includes(String(userId)));
}

function directPeerId(conversation, userId) {
  if (conversation?.type !== "direct") return null;
  return conversation.participants.map(String).find((participantId) => participantId !== String(userId)) || null;
}

function localUploadFilename(url) {
  const match = /^\/api\/uploads\/([a-f0-9-]+\.[a-z0-9]+)$/i.exec(String(url || ""));
  return match?.[1] || null;
}

function unsupportedTransaction(error) {
  return /Transaction numbers are only allowed|replica set|mongos|does not support transactions/i.test(String(error?.message || ""));
}

export async function withMongoTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (unsupportedTransaction(error)) return work(null);
    throw error;
  } finally {
    await session.endSession();
  }
}

function sessionOptions(session) {
  return session ? { session } : {};
}

async function findUsers(ids, withPassword = false) {
  if (!ids.length) return new Map();
  const selected = await User.find({ _id: { $in: unique(ids) } }).select(withPassword ? "+email +passwordHash" : "+email").lean();
  return new Map(selected.map((user) => {
    const value = record(user);
    return [value.id, value];
  }));
}

async function publicUserById(id) {
  const user = await User.findById(String(id)).select("+email").lean();
  return user ? publicUser(record(user)) : null;
}

async function conversationForUser(id, userId) {
  const conversation = await Conversation.findOne({ _id: String(id), participants: String(userId) }).lean();
  return record(conversation);
}

async function presentMessage(message, userCache = null) {
  const value = record(message);
  const sender = userCache?.get(value.senderId) || await publicUserById(value.senderId);
  return { ...value, conversation: value.conversationId, sender: sender ? publicUser(sender) : null };
}

async function presentConversation(conversation, userId) {
  const value = record(conversation);
  const userMap = await findUsers(value.participants || []);
  const participantUsers = (value.participants || []).map(String).map((id) => userMap.get(id)).filter(Boolean).map(publicUser);
  const other = participantUsers.find((user) => user.id !== String(userId));
  const latest = await Message.findOne({ conversationId: value.id, unsentAt: null }).sort({ createdAt: -1 }).lean();
  const latestValue = record(latest);
  const unreadCount = await Message.countDocuments({ conversationId: value.id, senderId: { $ne: String(userId) }, readBy: { $ne: String(userId) } });
  return {
    ...value,
    name: value.type === "direct" ? other?.username || "Conversation" : value.name,
    avatar: value.type === "direct" ? other?.avatar || "" : value.avatar || "",
    participantUsers,
    lastMessage: latestValue?.unsentAt ? "Message removed" : latestValue?.content || latestValue?.attachments?.[0]?.name || "No messages yet",
    lastMessageAt: latestValue?.createdAt || value.lastMessageAt || value.createdAt,
    unreadCount,
    muted: (value.mutedBy || []).includes(String(userId)),
    favorite: (value.favoriteBy || []).includes(String(userId)),
    pinned: (value.pinnedBy || []).includes(String(userId)),
    archived: (value.archivedBy || []).includes(String(userId)),
  };
}

async function canAttachUpload(userId, upload) {
  if (upload.ownerId === String(userId)) return true;
  if (!upload.conversationIds?.length) return false;
  return Boolean(await Conversation.exists({ _id: { $in: upload.conversationIds }, participants: String(userId) }));
}

async function claimMessageAttachments(userId, conversationId, attachments, session) {
  const claimed = [];
  for (const attachment of attachments || []) {
    const filename = localUploadFilename(attachment.url);
    if (!filename) {
      claimed.push(structuredClone(attachment));
      continue;
    }
    const upload = record(await Upload.findOne({ filename }).session(session || null).lean());
    if (!upload) throw new AppError("This uploaded file was not found.", 404);
    if (upload.purpose !== "attachment") throw new AppError("This file cannot be attached to a chat message.", 400);
    if (!(await canAttachUpload(userId, upload))) throw new AppError("You do not have permission to attach this file.", 403);
    if (!upload.conversationIds.includes(String(conversationId))) {
      await Upload.updateOne({ _id: upload.id }, { $addToSet: { conversationIds: String(conversationId) } }, sessionOptions(session));
    }
    claimed.push({
      id: upload.id,
      name: upload.originalName,
      type: upload.mimeType,
      size: upload.size,
      url: `/api/uploads/${upload.filename}`,
      ...(attachment.duration ? { duration: Math.max(0, Number(attachment.duration) || 0) } : {}),
    });
  }
  return claimed;
}

async function relationshipFor(currentUserId, targetUserId) {
  const current = String(currentUserId);
  const target = String(targetUserId);
  if (await Block.exists({ userId: current, blockedUserId: target })) return "blocked";
  if (await Block.exists({ userId: target, blockedUserId: current })) return "blocked-by";
  const friendship = record(await Friendship.findOne({ pairKey: pairKey(current, target) }).sort({ updatedAt: -1 }).lean());
  if (!friendship) return "none";
  if (friendship.status === "accepted") return "friends";
  if (friendship.status === "pending") return friendship.requesterId === current ? "outgoing-pending" : "incoming-pending";
  return "none";
}

async function latestFriendship(firstUserId, secondUserId) {
  return record(await Friendship.findOne({ pairKey: pairKey(firstUserId, secondUserId) }).sort({ updatedAt: -1 }).lean());
}

async function createRelationshipNotification(userId, actorId, kind, session = null) {
  const actor = await publicUserById(actorId);
  const notification = {
    id: makeId("n"),
    userId: String(userId),
    actorId: String(actorId),
    type: kind,
    title: kind === "friend-accepted" ? "Friend request accepted" : "New friend request",
    body: kind === "friend-accepted" ? `${actor?.username || "Someone"} accepted your friend request.` : `${actor?.username || "Someone"} sent you a friend request.`,
    read: false,
  };
  await Notification.create([documentForCreate(notification)], sessionOptions(session));
  return notification;
}

async function relationshipResult(action, actorId, target, friendship, notification = null) {
  return {
    action,
    user: { ...publicUser(target), relationship: await relationshipFor(actorId, target.id) },
    friendship: friendship ? structuredClone(friendship) : null,
    notification,
    affectedUserIds: unique([actorId, target.id]),
  };
}

export async function findUserByEmail(email, withPassword = false) {
  const user = await User.findOne({ email: String(email || "").trim().toLowerCase() })
    .select(withPassword ? "+email +passwordHash" : "+email")
    .lean();
  const value = record(user);
  return value ? (withPassword ? value : publicUser(value)) : null;
}

export async function findUserById(id) {
  return record(await User.findById(String(id)).select("+email +passwordHash").lean());
}

export async function createUser(input) {
  const value = {
    id: makeId("u"), email: String(input.email).trim().toLowerCase(), passwordHash: await bcrypt.hash(input.password, 10), username: String(input.username).trim(),
    avatar: "", bio: "", status: "Available", location: "", role: "user", verified: false, isOnline: true, lastSeen: now(),
  };
  const created = await User.create(documentForCreate(value));
  return publicUser(record(created));
}

export async function compareUserPassword(user, password) {
  return Boolean(user?.passwordHash) && bcrypt.compare(String(password || ""), user.passwordHash);
}

export async function listUsers(query = "", currentUserId) {
  const term = String(query || "").trim();
  const filter = { _id: { $ne: String(currentUserId) }, role: { $ne: "assistant" } };
  if (term) filter.$or = ["username", "email", "location"].map((field) => ({ [field]: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
  const users = (await User.find(filter).select("+email").sort({ username: 1 }).limit(100).lean()).map(record);
  return Promise.all(users.map(async (user) => ({ ...publicUser(user), relationship: await relationshipFor(currentUserId, user.id) })));
}

export async function updateUser(id, updates) {
  const allowed = ["email", "username", "avatar", "coverPhoto", "bio", "birthday", "gender", "phone", "status", "location", "role", "verified", "disabled", "isOnline", "lastSeen", "passwordHash", "passwordChangedAt"];
  const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
  if (payload.email) payload.email = String(payload.email).trim().toLowerCase();
  const user = await User.findByIdAndUpdate(String(id), { $set: payload }, { new: true, runValidators: true }).select("+email").lean();
  return user ? publicUser(record(user)) : null;
}

export async function updatePassword(id, password) {
  return updateUser(id, { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: now() });
}

export async function isBlockedBetween(firstUserId, secondUserId) {
  return Boolean(await Block.exists({ $or: [{ userId: String(firstUserId), blockedUserId: String(secondUserId) }, { userId: String(secondUserId), blockedUserId: String(firstUserId) }] }));
}

export async function assertUploadQuota(userId, incomingBytes) {
  const [usage] = await Upload.aggregate([{ $match: { ownerId: String(userId) } }, { $group: { _id: null, total: { $sum: "$size" } } }]);
  if (Number(usage?.total || 0) + Math.max(0, Number(incomingBytes) || 0) > USER_UPLOAD_QUOTA_BYTES) {
    throw new AppError("Your upload storage quota is full. Delete older files or try a smaller upload.", 413);
  }
}

export async function registerUploads(userId, files, purpose = "attachment") {
  const records = files.map((file) => ({ id: String(file.filename), filename: String(file.filename), ownerId: String(userId), originalName: String(file.originalName), mimeType: String(file.mimeType), size: Math.max(0, Number(file.size) || 0), purpose, conversationIds: [], publicDemo: false }));
  if (records.length) await Upload.insertMany(records.map(documentForCreate), { ordered: true });
  return records;
}

export async function findUploadByFilename(filename) {
  return record(await Upload.findOne({ filename: String(filename) }).lean());
}

export async function canUserReadUpload(userId, filename) {
  const upload = record(await Upload.findOne({ filename: String(filename) }).lean());
  if (!upload) return false;
  if (upload.publicDemo || upload.purpose === "avatar" || upload.purpose === "story" || upload.ownerId === String(userId)) return true;
  return Boolean(await Conversation.exists({ _id: { $in: upload.conversationIds || [] }, participants: String(userId) }));
}

export async function findPublicDemoUpload(filename) {
  return record(await Upload.findOne({ filename: String(filename), publicDemo: true }).lean());
}

export async function assertOwnedUploadPurpose(userId, url, purpose) {
  const filename = localUploadFilename(url);
  if (!filename) return;
  const upload = record(await Upload.findOne({ filename }).lean());
  if (!upload) throw new AppError("This uploaded file was not found.", 404);
  if (upload.ownerId !== String(userId) || upload.purpose !== purpose) throw new AppError("You do not have permission to use this uploaded file here.", 403);
}

export async function isDirectConversationBlocked(conversationId, userId) {
  const conversation = await conversationForUser(conversationId, userId);
  if (!conversation) return null;
  const peerId = directPeerId(conversation, userId);
  return Boolean(peerId && await isBlockedBetween(userId, peerId));
}

export async function getConversations(userId) {
  const conversations = await Conversation.find({ participants: String(userId), deletedFor: { $ne: String(userId) } }).sort({ lastMessageAt: -1 }).lean();
  return Promise.all(conversations.map((conversation) => presentConversation(conversation, userId)));
}

export async function getConversation(id, userId) {
  const conversation = await conversationForUser(id, userId);
  return conversation ? presentConversation(conversation, userId) : null;
}

export async function createConversation(userId, input) {
  const participantIds = unique([userId, ...(Array.isArray(input.participants) ? input.participants : [])]);
  const type = input.type === "group" ? "group" : input.type === "ai" ? "ai" : "direct";
  if (type === "direct" && participantIds.length === 2 && await isBlockedBetween(participantIds[0], participantIds[1])) return null;
  const key = type === "direct" ? directKey(participantIds) : null;
  if (key) {
    const existing = record(await Conversation.findOne({ type: "direct", directKey: key }).lean());
    if (existing) return presentConversation(existing, userId);
  }
  const value = { id: makeId("c"), type, name: input.name || "", avatar: input.avatar || "", color: input.color || (type === "group" ? "violet" : "blue"), participants: participantIds, admins: type === "group" ? [String(userId)] : [], directKey: key, mutedBy: [], favoriteBy: [], pinnedBy: [], archivedBy: [], deletedFor: [], createdBy: String(userId), lastMessageAt: now() };
  try {
    await withMongoTransaction(async (session) => Conversation.create([documentForCreate(value)], sessionOptions(session)));
  } catch (error) {
    if (error?.code === 11000 && key) {
      const existing = record(await Conversation.findOne({ type: "direct", directKey: key }).lean());
      if (existing) return presentConversation(existing, userId);
    }
    throw error;
  }
  return presentConversation(value, userId);
}

function toggleMembership(list, userId, enabled) {
  const next = new Set((list || []).map(String));
  if (enabled) next.add(String(userId)); else next.delete(String(userId));
  return [...next];
}

export async function updateConversation(id, userId, updates) {
  const conversation = await conversationForUser(id, userId);
  if (!conversation) return null;
  const sharedFields = ["name", "avatar", "color", "participants", "admins"];
  const changingShared = sharedFields.some((key) => updates[key] !== undefined);
  if (changingShared && (conversation.type !== "group" || !conversation.admins.map(String).includes(String(userId)))) return null;
  const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => sharedFields.includes(key)));
  if (payload.participants) payload.participants = unique(payload.participants);
  for (const [inputKey, listKey] of Object.entries({ muted: "mutedBy", pinned: "pinnedBy", favorite: "favoriteBy", archived: "archivedBy" })) {
    if (updates[inputKey] !== undefined) payload[listKey] = toggleMembership(conversation[listKey], userId, updates[inputKey] === true || updates[inputKey] === "true");
  }
  const updated = await Conversation.findByIdAndUpdate(String(id), { $set: payload }, { new: true, runValidators: true }).lean();
  return updated ? presentConversation(updated, userId) : null;
}

export async function leaveConversation(id, userId) {
  const conversation = await conversationForUser(id, userId);
  if (!conversation || conversation.type !== "group") return null;
  const participants = conversation.participants.map(String).filter((participantId) => participantId !== String(userId));
  let admins = conversation.admins.map(String).filter((adminId) => adminId !== String(userId) && participants.includes(adminId));
  if (!admins.length && participants.length) admins = [participants.includes(String(conversation.createdBy)) ? String(conversation.createdBy) : participants[0]];
  if (!participants.length) {
    return withMongoTransaction(async (session) => {
      const removed = await Conversation.findOneAndDelete({ _id: String(id), participants: String(userId) }).session(session || null).lean();
      if (!removed) return null;
      await Promise.all([
        Message.deleteMany({ conversationId: String(id) }, sessionOptions(session)),
        Upload.updateMany({ conversationIds: String(id) }, { $pull: { conversationIds: String(id) } }, sessionOptions(session)),
      ]);
      return { id: String(id), participants: [], admins: [], deleted: true };
    });
  }
  const updated = await Conversation.findByIdAndUpdate(String(id), { $set: { participants, admins } }, { new: true, runValidators: true }).lean();
  return record(updated);
}

export async function deleteConversationForUser(id, userId) {
  const changed = await Conversation.updateOne({ _id: String(id), participants: String(userId) }, { $addToSet: { deletedFor: String(userId) } });
  return changed.matchedCount ? { id: String(id), deleted: true } : null;
}

export async function getMessages(conversationId, userId, before, limit = 60) {
  if (!(await conversationForUser(conversationId, userId))) return null;
  const pageSize = Math.min(Math.max(Number(limit) || 60, 1), 100);
  const filter = { conversationId: String(conversationId), deletedFor: { $ne: String(userId) } };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const items = await Message.find(filter).sort({ createdAt: -1 }).limit(pageSize + 1).lean();
  const hasNext = items.length > pageSize;
  const page = items.slice(0, pageSize).reverse();
  const senderMap = await findUsers(unique(page.map((item) => item.senderId)));
  return { messages: await Promise.all(page.map((message) => presentMessage(message, senderMap))), nextCursor: hasNext ? record(page[0])?.createdAt : null };
}

export async function createMessage(userId, conversationId, input) {
  let created;
  await withMongoTransaction(async (session) => {
    const conversation = record(await Conversation.findOne({ _id: String(conversationId), participants: String(userId) }).session(session || null).lean());
    const peerId = directPeerId(conversation, userId);
    if (!conversation || (peerId && await isBlockedBetween(userId, peerId))) return;
    const clientMessageId = String(input.clientMessageId || "").slice(0, 120) || null;
    if (clientMessageId) {
      const existing = await Message.findOne({ conversationId: String(conversationId), senderId: String(userId), clientMessageId }).session(session || null).lean();
      if (existing) {
        created = record(existing);
        return;
      }
    }
    const attachments = await claimMessageAttachments(userId, conversationId, input.attachments, session);
    const value = { id: makeId("m"), conversationId: String(conversationId), senderId: String(userId), clientMessageId, type: input.type || (attachments[0]?.type?.split("/")[0] || "text"), content: input.content || "", attachments, replyTo: input.replyTo || null, forwardedFrom: input.forwardedFrom || null, reactions: [], readBy: [String(userId)], status: "sent", pinned: false };
    await Message.create([documentForCreate(value)], sessionOptions(session));
    await Conversation.updateOne({ _id: conversation.id }, { $set: { lastMessageAt: now(), lastMessage: value.id } }, sessionOptions(session));
    created = value;
  });
  return created ? presentMessage(created) : null;
}

export async function markMessageDelivered(id) {
  const updated = await Message.findOneAndUpdate({ _id: String(id), status: "sent" }, { $set: { status: "delivered" } }, { new: true }).lean();
  if (updated) return presentMessage(updated);
  const existing = await Message.findById(String(id)).lean();
  return existing ? presentMessage(existing) : null;
}

async function messageWithAccess(id, userId) {
  const message = record(await Message.findById(String(id)).lean());
  if (!message) return { message: null, conversation: null };
  return { message, conversation: await conversationForUser(message.conversationId, userId) };
}

async function messageActionAllowed(message, conversation, userId) {
  const peerId = directPeerId(conversation, userId);
  return Boolean(message && conversation && !(peerId && await isBlockedBetween(userId, peerId)));
}

export async function updateMessage(id, userId, content) {
  const { message, conversation } = await messageWithAccess(id, userId);
  if (!(await messageActionAllowed(message, conversation, userId)) || message.senderId !== String(userId) || message.unsentAt) return null;
  const updated = await Message.findByIdAndUpdate(String(id), { $set: { content, editedAt: now() } }, { new: true, runValidators: true }).lean();
  return presentMessage(updated);
}

export async function deleteMessage(id, userId, everyone) {
  const { message, conversation } = await messageWithAccess(id, userId);
  if (!(await messageActionAllowed(message, conversation, userId))) return null;
  const payload = everyone && message.senderId === String(userId) ? { content: "", attachments: [], unsentAt: now() } : { deletedFor: unique([...(message.deletedFor || []), String(userId)]) };
  const updated = await Message.findByIdAndUpdate(String(id), { $set: payload }, { new: true, runValidators: true }).lean();
  return presentMessage(updated);
}

export async function reactToMessage(id, userId, emoji) {
  const { message, conversation } = await messageWithAccess(id, userId);
  if (!(await messageActionAllowed(message, conversation, userId))) return null;
  const reactions = (message.reactions || []).map((reaction) => ({ ...reaction, users: reaction.users.filter((member) => member !== String(userId)) })).filter((reaction) => reaction.users.length);
  if (emoji) {
    let reaction = reactions.find((item) => item.emoji === emoji);
    if (!reaction) { reaction = { emoji, users: [] }; reactions.push(reaction); }
    reaction.users.push(String(userId));
  }
  const updated = await Message.findByIdAndUpdate(String(id), { $set: { reactions } }, { new: true, runValidators: true }).lean();
  return presentMessage(updated);
}

export async function togglePinnedMessage(id, userId) {
  const { message, conversation } = await messageWithAccess(id, userId);
  if (!(await messageActionAllowed(message, conversation, userId))) return null;
  const updated = await Message.findByIdAndUpdate(String(id), { $set: { pinned: !message.pinned } }, { new: true }).lean();
  return presentMessage(updated);
}

export async function markConversationRead(conversationId, userId) {
  const conversation = await conversationForUser(conversationId, userId);
  if (!conversation || (directPeerId(conversation, userId) && await isBlockedBetween(userId, directPeerId(conversation, userId)))) return false;
  await Message.updateMany({ conversationId: String(conversationId), senderId: { $ne: String(userId) } }, { $addToSet: { readBy: String(userId) }, $set: { status: "read", readAt: now() } });
  return true;
}

export async function getStories(userId) {
  const blocks = await Block.find({ $or: [{ userId: String(userId) }, { blockedUserId: String(userId) }] }).lean();
  const excluded = blocks.map((block) => block.userId === String(userId) ? block.blockedUserId : block.userId);
  const stories = (await Story.find({ expiresAt: { $gt: now() }, userId: { $nin: excluded } }).sort({ createdAt: -1 }).lean()).map(record);
  const users = await findUsers(unique(stories.map((story) => story.userId)));
  return stories.map((story) => ({ ...story, user: publicUser(users.get(story.userId)) }));
}

export async function createStory(userId, input) {
  const value = { id: makeId("s"), userId: String(userId), type: input.type === "video" ? "video" : "image", mediaUrl: input.mediaUrl, caption: input.caption || "", viewers: [], reactions: [], expiresAt: new Date(Date.now() + 86_400_000) };
  await Story.create(documentForCreate(value));
  return { ...value, user: await publicUserById(userId) };
}

export async function viewStory(id, userId, reaction) {
  const story = record(await Story.findById(String(id)).lean());
  if (!story || await isBlockedBetween(userId, story.userId)) return null;
  const update = { $addToSet: { viewers: String(userId) } };
  if (reaction) update.$push = { reactions: { userId: String(userId), emoji: reaction, createdAt: now() } };
  return record(await Story.findByIdAndUpdate(String(id), update, { new: true, runValidators: true }).lean());
}

export async function getNotifications(userId) {
  const notifications = (await Notification.find({ userId: String(userId) }).sort({ createdAt: -1 }).lean()).map(record);
  const users = await findUsers(unique(notifications.map((item) => item.actorId).filter(Boolean)));
  return notifications.map((item) => ({ ...item, actor: publicUser(users.get(item.actorId)) }));
}

export async function markNotificationsRead(userId) {
  await Notification.updateMany({ userId: String(userId), read: false }, { $set: { read: true } });
}

export async function createRealtimeNotification(userId, actorId, input = {}) {
  const value = {
    id: makeId("n"),
    userId: String(userId),
    actorId: String(actorId),
    type: String(input.type || "message").slice(0, 64),
    title: String(input.title || "New activity").slice(0, 200),
    body: String(input.body || "").slice(0, 500),
    data: input.data && typeof input.data === "object" ? input.data : {},
    read: false,
  };
  const created = await Notification.create(documentForCreate(value));
  return { ...record(created), actor: await publicUserById(actorId) };
}

export async function getCalls(userId) {
  const calls = (await Call.find({ userId: String(userId) }).sort({ createdAt: -1 }).lean()).map(record);
  const users = await findUsers(unique(calls.map((call) => call.peerId)));
  return Promise.all(calls.map(async (call) => {
    const directConversation = call.conversationId ? null : record(await Conversation.findOne({ type: "direct", participants: { $all: [String(userId), String(call.peerId)] } }).lean());
    return { ...call, conversationId: call.conversationId || directConversation?.id || null, peer: publicUser(users.get(call.peerId)) };
  }));
}

export async function createCall(userId, input) {
  const conversation = await conversationForUser(input.conversationId, userId);
  const peer = directPeerId(conversation, userId);
  if (!conversation || (peer && await isBlockedBetween(userId, peer))) return null;
  const peerId = String(input.peer?.id || input.participants?.[0] || peer || "");
  const value = { id: makeId("call"), userId: String(userId), peerId, conversationId: String(input.conversationId), type: input.type === "video" ? "video" : "voice", status: input.status || "ringing", direction: input.direction === "incoming" ? "incoming" : "outgoing", duration: Math.max(0, Number(input.duration) || 0), ...(input.answeredAt ? { answeredAt: input.answeredAt } : {}), ...(input.endedAt ? { endedAt: input.endedAt } : {}) };
  await Call.create(documentForCreate(value));
  return { ...value, peer: await publicUserById(peerId) };
}

export async function updateCall(id, updates = {}) {
  const allowed = {};
  for (const key of ["status", "direction", "answeredAt", "endedAt"]) {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  }
  if (updates.duration !== undefined) allowed.duration = Math.max(0, Number(updates.duration) || 0);
  const updated = await Call.findByIdAndUpdate(String(id), { $set: allowed }, { new: true, runValidators: true }).lean();
  return updated ? { ...record(updated), peer: await publicUserById(updated.peerId) } : null;
}

export async function listFriends(userId) {
  const accepted = (await Friendship.find({ $or: [{ requesterId: String(userId) }, { recipientId: String(userId) }], status: "accepted" }).lean()).map(record);
  const friendIds = accepted.map((friendship) => friendship.requesterId === String(userId) ? friendship.recipientId : friendship.requesterId);
  const users = await findUsers(friendIds);
  return friendIds.map((id) => users.get(id)).filter(Boolean).map((user) => ({ ...publicUser(user), relationship: "friends" }));
}

export async function listFriendRequests(userId, direction) {
  const field = direction === "sent" ? "requesterId" : "recipientId";
  const requests = (await Friendship.find({ [field]: String(userId), status: "pending" }).sort({ updatedAt: -1 }).lean()).map(record);
  const otherIds = requests.map((request) => direction === "sent" ? request.recipientId : request.requesterId);
  const users = await findUsers(otherIds);
  return Promise.all(requests.map(async (request, index) => ({ ...request, user: { ...publicUser(users.get(otherIds[index])), relationship: await relationshipFor(userId, otherIds[index]) } })));
}

export async function friendAction(userId, targetId, action) {
  const actorId = String(userId);
  const target = await findUserById(targetId);
  if (!target) return null;
  if (target.id === actorId) throw new AppError("You cannot change your relationship with yourself.", 400);
  if (action === "block") return blockUser(actorId, target);
  if (action === "unblock") return unblockUser(actorId, target);
  if (await isBlockedBetween(actorId, target.id)) throw new AppError("This action is unavailable because one of you has blocked the other.", 403);
  if (action === "request") return sendFriendRequest(actorId, target);
  if (["accept", "decline", "cancel"].includes(action)) return respondToFriendRequest(actorId, target, action);
  if (action === "remove") return removeFriend(actorId, target);
  throw new AppError("Unknown friend action.", 400);
}

async function sendFriendRequest(actorId, target) {
  const latest = await latestFriendship(actorId, target.id);
  if (latest?.status === "accepted") throw new AppError("You are already friends.", 409);
  if (latest?.status === "pending") throw new AppError(latest.requesterId === actorId ? "A friend request is already pending." : "This person has already sent you a friend request.", 409);
  const friendship = { id: makeId("friend"), requesterId: actorId, recipientId: target.id, pairKey: pairKey(actorId, target.id), status: "pending" };
  let notification;
  try {
    await withMongoTransaction(async (session) => {
      await Friendship.create([documentForCreate(friendship)], sessionOptions(session));
      notification = await createRelationshipNotification(target.id, actorId, "friend-request", session);
    });
  } catch (error) {
    if (error?.code === 11000) throw new AppError("A friend request is already pending.", 409);
    throw error;
  }
  return relationshipResult("request", actorId, target, friendship, notification);
}

async function respondToFriendRequest(actorId, target, action) {
  if (action === "cancel") return cancelOutgoingFriendRequest(actorId, target);
  const friendship = record(await Friendship.findOne({ requesterId: target.id, recipientId: actorId, status: "pending" }).sort({ updatedAt: -1 }).lean());
  if (!friendship) throw new AppError("No pending friend request was found.", 404);
  friendship.status = action === "accept" ? "accepted" : "declined";
  await Friendship.updateOne({ _id: friendship.id }, { $set: { status: friendship.status } });
  const notification = action === "accept" ? await createRelationshipNotification(target.id, actorId, "friend-accepted") : null;
  return relationshipResult(action, actorId, target, friendship, notification);
}

async function cancelOutgoingFriendRequest(actorId, target) {
  const friendship = record(await Friendship.findOne({ requesterId: actorId, recipientId: target.id, status: "pending" }).sort({ updatedAt: -1 }).lean());
  if (!friendship) throw new AppError("No outgoing friend request was found.", 404);
  friendship.status = "cancelled";
  await Friendship.updateOne({ _id: friendship.id }, { $set: { status: friendship.status } });
  return relationshipResult("cancel", actorId, target, friendship);
}

async function removeFriend(actorId, target) {
  const friendship = await latestFriendship(actorId, target.id);
  if (!friendship || friendship.status !== "accepted") throw new AppError("You are not friends with this user.", 404);
  friendship.status = "cancelled";
  await Friendship.updateOne({ _id: friendship.id }, { $set: { status: friendship.status } });
  return relationshipResult("remove", actorId, target, friendship);
}

async function blockUser(actorId, target) {
  await withMongoTransaction(async (session) => {
    await Block.updateOne({ userId: actorId, blockedUserId: target.id }, { $setOnInsert: documentForCreate({ id: makeId("block"), userId: actorId, blockedUserId: target.id }) }, { upsert: true, ...sessionOptions(session) });
    await Friendship.updateMany({ pairKey: pairKey(actorId, target.id), status: { $in: ["pending", "accepted"] } }, { $set: { status: "cancelled" } }, sessionOptions(session));
  });
  return relationshipResult("block", actorId, target, null);
}

async function unblockUser(actorId, target) {
  const deleted = await Block.deleteOne({ userId: actorId, blockedUserId: target.id });
  if (!deleted.deletedCount) throw new AppError("This user is not blocked.", 404);
  return relationshipResult("unblock", actorId, target, null);
}

export async function searchEverything(userId, query) {
  const term = String(query || "").trim();
  if (term.length < 2) return { users: [], conversations: [], messages: [], files: [] };
  const expression = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const conversations = (await Conversation.find({ participants: String(userId), $or: [{ name: expression }, { color: expression }] }).sort({ lastMessageAt: -1 }).limit(8).lean()).map(record);
  const accessible = await Conversation.find({ participants: String(userId) }).select("_id").lean();
  const conversationIds = accessible.map((item) => String(item._id));
  const [users, messages] = await Promise.all([
    User.find({ _id: { $ne: String(userId) }, $or: [{ username: expression }, { email: expression }] }).select("+email").limit(8).lean(),
    Message.find({ conversationId: { $in: conversationIds }, content: expression }).sort({ createdAt: -1 }).limit(12).lean(),
  ]);
  const presentedMessages = await Promise.all(messages.map((message) => presentMessage(message)));
  return {
    users: users.map((user) => publicUser(record(user))),
    conversations: await Promise.all(conversations.map((conversation) => presentConversation(conversation, userId))),
    messages: presentedMessages,
    files: messages.flatMap((message) => (message.attachments || []).map((file) => ({ ...file, conversationId: message.conversationId }))).filter((file) => `${file.name} ${file.type}`.toLowerCase().includes(term.toLowerCase())).slice(0, 12),
  };
}

export async function getSettings(userId) {
  const settings = record(await Settings.findById(String(userId)).lean());
  return structuredClone(settings?.value || defaultSettings());
}

function mergeSettings(current, updates) {
  const next = { ...current, ...updates };
  if (updates.notifications) next.notifications = { ...current.notifications, ...updates.notifications };
  if (updates.privacy) next.privacy = { ...current.privacy, ...updates.privacy };
  return next;
}

export async function updateSettings(userId, updates) {
  const current = await getSettings(userId);
  const value = mergeSettings(current, updates);
  await Settings.findByIdAndUpdate(String(userId), { $set: { value } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return structuredClone(value);
}

export async function adminStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const [users, online, messageCount, storage, chart, recentUsers] = await Promise.all([
    User.countDocuments({ role: { $ne: "assistant" } }), User.countDocuments({ isOnline: true, role: { $ne: "assistant" } }), Message.countDocuments(),
    Upload.aggregate([{ $group: { _id: null, bytes: { $sum: "$size" } } }]),
    Message.aggregate([{ $match: { createdAt: { $gte: start } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, messages: { $sum: 1 } } }]),
    User.find({ role: { $ne: "assistant" } }).select("+email").sort({ createdAt: -1 }).limit(4).lean(),
  ]);
  const formatter = new Intl.DateTimeFormat("en", { weekday: "short" });
  const counts = new Map(chart.map((item) => [item._id, item.messages]));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return { label: formatter.format(date), messages: counts.get(date.toISOString().slice(0, 10)) || 0 }; });
  return { totals: { users, online, messages: messageCount, storageBytes: Number(storage[0]?.bytes || 0), reports: 0 }, chart: days, recentUsers: recentUsers.map((user) => publicUser(record(user))) };
}

export async function setUserPresence(userId, isOnline) {
  return updateUser(userId, { isOnline, lastSeen: now() });
}
