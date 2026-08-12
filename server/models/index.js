export { User } from "./User.js";
export { Conversation } from "./Conversation.js";
export { Message } from "./Message.js";
export { Story } from "./Story.js";
export { Notification } from "./Notification.js";
export { Settings } from "./Settings.js";
export { RefreshSession } from "./RefreshSession.js";
export { Friendship } from "./Friendship.js";
export { Block } from "./Block.js";
export { Upload } from "./Upload.js";
export { Call } from "./Call.js";

import { User } from "./User.js";
import { Conversation } from "./Conversation.js";
import { Message } from "./Message.js";
import { Story } from "./Story.js";
import { Notification } from "./Notification.js";
import { Settings } from "./Settings.js";
import { RefreshSession } from "./RefreshSession.js";
import { Friendship } from "./Friendship.js";
import { Block } from "./Block.js";
import { Upload } from "./Upload.js";
import { Call } from "./Call.js";

export const mongoModels = [User, Conversation, Message, Story, Notification, Settings, RefreshSession, Friendship, Block, Upload, Call];

export async function ensureMongoIndexes() {
  await Promise.all(mongoModels.map((model) => model.init()));
}
