// File: client/src/components/chat/MessageBubble.jsx
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiArrowDownTray,
  HiArrowUturnLeft,
  HiCheck,
  HiCheckCircle,
  HiClipboard,
  HiDocument,
  HiEllipsisHorizontal,
  HiOutlineBookmark,
  HiMapPin,
  HiOutlinePencil,
  HiOutlineShare,
  HiOutlineTrash,
  HiPause,
  HiPlay
} from "react-icons/hi2";
import { chatApi } from "../../services/api.js";
import { formatBytes, formatMessageTime } from "../../utils/format.js";
import Avatar from "../common/Avatar.jsx";
import { useUiStore } from "../../store/uiStore.js";
import { SecureImage, SecureVideo, downloadPrivateUpload, usePrivateUploadUrl } from "../../hooks/usePrivateUploadUrl.jsx";

const reactionChoices = ["👍", "❤️", "😂", "😮", "😢", "😡"];

export default function MessageBubble({ message, mine, compactTop, compactBottom, onReply, onRetry }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);
  const setForwardingMessage = useUiStore((state) => state.setForwardingMessage);
  const queryClient = useQueryClient();
  const conversationId = message.conversationId || message.conversation;
  const mutationOptions = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", conversationId] })
  };
  const reactionMutation = useMutation({ mutationFn: (emoji) => chatApi.react(message.id, emoji), ...mutationOptions });
  const deleteMutation = useMutation({ mutationFn: (everyone) => chatApi.remove(message.id, everyone), ...mutationOptions });
  const editMutation = useMutation({ mutationFn: (content) => chatApi.edit(message.id, content), ...mutationOptions });
  const pinMutation = useMutation({ mutationFn: () => chatApi.pin(message.id), ...mutationOptions });

  function edit() {
    const content = window.prompt("Edit message", message.content);
    if (content?.trim() && content.trim() !== message.content) editMutation.mutate(content.trim());
    setMenuOpen(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(message.content || message.attachments?.[0]?.url || "");
    setMenuOpen(false);
  }

  function forward() {
    setForwardingMessage(message);
    setNewChatOpen(true);
    setMenuOpen(false);
  }

  if (message.deletedFor?.length) return null;
  const unsent = Boolean(message.unsentAt);

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`message-row ${mine ? "mine" : "theirs"} ${compactTop ? "compact-top" : ""} ${compactBottom ? "compact-bottom" : ""}`}
    >
      {!mine && !compactBottom ? <Avatar user={message.sender} size="xs" /> : !mine ? <span className="avatar-spacer" /> : null}
      <div className="message-stack">
        {!mine && !compactTop && <span className="message-sender">{message.sender?.username}</span>}
        <div className="bubble-line">
          <div className="message-hover-actions">
            <button type="button" onClick={() => setReactionsOpen((current) => !current)} aria-label="React">☺</button>
            <button type="button" onClick={() => onReply(message)} aria-label="Reply"><HiArrowUturnLeft /></button>
            <button type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="More"><HiEllipsisHorizontal /></button>
          </div>
          <div className={`message-bubble message-${message.type || "text"} ${unsent ? "unsent" : ""}`}>
            {message.replyTo && <div className="reply-reference">Replying to a message</div>}
            <AttachmentContent attachments={message.attachments} type={message.type} />
            {message.content && <p>{message.content}</p>}
            {message.pinned && <span className="pinned-label"><HiMapPin /> Pinned</span>}
            {message.editedAt && <span className="edited-label">edited</span>}
            <time>{formatMessageTime(message.createdAt)}</time>
          </div>
          <AnimatePresence>
            {reactionsOpen && (
              <motion.div className="reaction-picker" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                {reactionChoices.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => { reactionMutation.mutate(emoji); setReactionsOpen(false); }}>{emoji}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {menuOpen && (
              <motion.div className={`message-menu ${mine ? "align-right" : ""}`} initial={{ opacity: 0, y: 5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                <button type="button" onClick={() => { onReply(message); setMenuOpen(false); }}><HiArrowUturnLeft /> Reply</button>
                <button type="button" onClick={copy}><HiClipboard /> Copy</button>
                <button type="button" onClick={() => setBookmarked((current) => !current)}><HiOutlineBookmark /> {bookmarked ? "Remove bookmark" : "Bookmark"}</button>
                <button type="button" onClick={forward}><HiOutlineShare /> Forward</button>
                <button type="button" onClick={() => { pinMutation.mutate(); setMenuOpen(false); }}><HiMapPin /> {message.pinned ? "Unpin" : "Pin message"}</button>
                {mine && !unsent && <button type="button" onClick={edit}><HiOutlinePencil /> Edit</button>}
                <button type="button" className="danger" onClick={() => deleteMutation.mutate(false)}><HiOutlineTrash /> Delete for me</button>
                {mine && !unsent && <button type="button" className="danger" onClick={() => deleteMutation.mutate(true)}><HiOutlineTrash /> Unsend for everyone</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {message.reactions?.length ? (
          <div className={`reaction-summary ${mine ? "mine" : ""}`}>
            {message.reactions.map((reaction) => <span key={reaction.emoji} title={`${reaction.users.length} reaction${reaction.users.length > 1 ? "s" : ""}`}>{reaction.emoji}<b>{reaction.users.length}</b></span>)}
          </div>
        ) : null}
        {mine && !compactBottom && <StatusLine message={message} onRetry={() => onRetry?.(message)} />}
      </div>
    </motion.div>
  );
}

function AttachmentContent({ attachments = [], type }) {
  if (!attachments.length) return null;
  if (type === "image" || attachments[0].type?.startsWith("image/")) {
    return (
      <div className={`image-grid images-${Math.min(attachments.length, 4)}`}>
        {attachments.map((file) => <SecureImage key={file.id || file.url} src={file.url} alt={file.name || "Shared image"} loading="lazy" />)}
      </div>
    );
  }
  if (type === "video" || attachments[0].type?.startsWith("video/")) {
    return <SecureVideo controls preload="metadata" src={attachments[0].url} />;
  }
  if (type === "audio" || attachments[0].type?.startsWith("audio/")) {
    return <VoiceMessage attachment={attachments[0]} />;
  }
  return attachments.map((file) => (
    <button type="button" onClick={() => downloadPrivateUpload(file.url, file.name).catch(() => undefined)} className="file-card" key={file.id || file.url}>
      <span><HiDocument /></span>
      <div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div>
      <HiArrowDownTray />
    </button>
  ));
}

function VoiceMessage({ attachment }) {
  const audioRef = useRef(null);
  const source = attachment.url;
  const mediaUrl = usePrivateUploadUrl(source);
  const [playing, setPlaying] = useState(false);
  const bars = [8, 15, 22, 13, 25, 19, 28, 10, 23, 16, 27, 12, 20, 8, 17, 12, 25, 15, 9];
  function toggle() {
    if (!audioRef.current || !mediaUrl || source === "#") return setPlaying((current) => !current);
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  }
  return (
    <div className="voice-message">
      <button type="button" onClick={toggle}>{playing ? <HiPause /> : <HiPlay />}</button>
      <div className="waveform">{bars.map((height, index) => <i key={index} style={{ height }} className={playing && index < 8 ? "played" : ""} />)}</div>
      <span>0:{String(attachment.duration || 18).padStart(2, "0")}</span>
      {source !== "#" && mediaUrl && <audio ref={audioRef} src={mediaUrl} onEnded={() => setPlaying(false)} />}
    </div>
  );
}

function StatusLine({ message, onRetry }) {
  return (
    <span className="message-status">
      {message.status === "sending" && "Sending…"}
      {message.status === "failed" && <><span>Failed</span><button type="button" onClick={onRetry}>Retry</button></>}
      {message.status === "sent" && <><HiCheck /> Sent</>}
      {message.status === "delivered" && <><HiCheckCircle /> Delivered</>}
      {message.status === "read" && <>Seen {message.readAt ? formatMessageTime(message.readAt) : ""}</>}
    </span>
  );
}
