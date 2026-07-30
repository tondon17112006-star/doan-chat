// File: client/src/components/chat/Composer.jsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiArrowUp,
  HiFaceSmile,
  HiGif,
  HiMicrophone,
  HiOutlinePaperClip,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiPaperAirplane,
  HiStop,
  HiXMark
} from "react-icons/hi2";
import { chatApi } from "../../services/api.js";
import { getSocket } from "../../services/socket.js";
import { formatBytes } from "../../utils/format.js";

const gifs = [
  { label: "Excited", url: "https://media.giphy.com/media/o75ajIFH0QnQC3nCeD/giphy.gif" },
  { label: "Perfect", url: "https://media.giphy.com/media/KEYbcgR8oKQzwpwvLU/giphy.gif" },
  { label: "Hello", url: "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif" },
  { label: "Amazing", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { label: "Thank you", url: "https://media.giphy.com/media/RREDhgYnW6EZAzhYLB/giphy.gif" },
  { label: "On my way", url: "https://media.giphy.com/media/3o7ZetIsjtbkgNE1I4/giphy.gif" }
];
const stickers = ["🌈", "🪩", "✨", "🫶", "🌿", "☕", "🦋", "🌙", "🎧", "🏕️", "📸", "💫"];
const EmojiPicker = lazy(() => import("emoji-picker-react"));

export default function Composer({ conversationId, replyingTo, onCancelReply, onSend, sending }) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [tray, setTray] = useState(null);
  const [gifSearch, setGifSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  useEffect(() => {
    if (!recording) return undefined;
    const interval = setInterval(() => setRecordSeconds((value) => value + 1), 1_000);
    return () => clearInterval(interval);
  }, [recording]);

  function resize(event) {
    const target = event.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  }

  function typing(value) {
    setContent(value);
    const socket = getSocket();
    socket?.emit("typing:start", { conversationId, activity: "typing" });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit("typing:stop", { conversationId }), 1_300);
  }

  async function uploadFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    getSocket()?.emit("typing:start", { conversationId, activity: "choosing-image" });
    try {
      const uploaded = await chatApi.upload([...files]);
      setAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } finally {
      setUploading(false);
      getSocket()?.emit("typing:stop", { conversationId });
    }
  }

  async function submit(event) {
    event?.preventDefault();
    if ((!content.trim() && !attachments.length) || sending) return;
    const primaryType = attachments.length
      ? attachments[0].type?.startsWith("image/")
        ? "image"
        : attachments[0].type?.startsWith("video/")
          ? "video"
          : attachments[0].type?.startsWith("audio/")
            ? "audio"
            : "file"
      : "text";
    await onSend({ content: content.trim(), attachments, type: primaryType });
    setContent("");
    setAttachments([]);
    setTray(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    getSocket()?.emit("typing:stop", { conversationId });
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (event) => chunks.current.push(event.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        stream.getTracks().forEach((track) => track.stop());
        await uploadFiles([file]);
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      getSocket()?.emit("typing:start", { conversationId, activity: "recording" });
    } catch {
      alert("Microphone access is needed to record a voice message.");
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop();
    setRecording(false);
    getSocket()?.emit("typing:stop", { conversationId });
  }

  function sendGif(gif) {
    setAttachments([{ id: crypto.randomUUID(), name: `${gif.label}.gif`, type: "image/gif", url: gif.url, size: 0 }]);
    setTray(null);
  }

  function handlePaste(event) {
    const files = [...event.clipboardData.items].filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter(Boolean);
    if (files.length) {
      event.preventDefault();
      uploadFiles(files);
    }
  }

  return (
    <div
      className="composer-wrap"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        uploadFiles(event.dataTransfer.files);
      }}
    >
      <AnimatePresence>
        {replyingTo && (
          <motion.div className="composer-reply" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <span><b>Replying to {replyingTo.sender?.username || "yourself"}</b>{replyingTo.content || "Attachment"}</span>
            <button type="button" onClick={onCancelReply}><HiXMark /></button>
          </motion.div>
        )}
        {attachments.length > 0 && (
          <motion.div className="attachment-preview" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {attachments.map((file, index) => (
              <div className="preview-file" key={file.id || file.url}>
                {file.type?.startsWith("image/") ? <img src={file.url} alt="" /> : <HiOutlinePaperClip />}
                <span>{file.name}<small>{formatBytes(file.size)}</small></span>
                <button type="button" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}><HiXMark /></button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tray && (
          <motion.div className={`composer-tray tray-${tray}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}>
            {tray === "emoji" && (
              <Suspense fallback={<div className="emoji-loading"><span className="search-spinner" /> Loading emoji…</div>}>
                <EmojiPicker
                  onEmojiClick={(emoji) => { setContent((value) => value + emoji.emoji); textareaRef.current?.focus(); }}
                  width="100%"
                  height={390}
                  searchPlaceHolder="Search emoji"
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled
                />
              </Suspense>
            )}
            {tray === "gif" && (
              <div className="gif-tray">
                <div className="tray-title"><span><HiGif /> GIFs</span><button onClick={() => setTray(null)}><HiXMark /></button></div>
                <input value={gifSearch} onChange={(event) => setGifSearch(event.target.value)} placeholder="Search GIFs" autoFocus />
                <div className="gif-grid">
                  {gifs.filter((gif) => gif.label.toLowerCase().includes(gifSearch.toLowerCase())).map((gif) => (
                    <button type="button" key={gif.url} onClick={() => sendGif(gif)}><img src={gif.url} alt={gif.label} loading="lazy" /><span>{gif.label}</span></button>
                  ))}
                </div>
              </div>
            )}
            {tray === "sticker" && (
              <div className="sticker-tray">
                <div className="tray-title"><span>Favorite stickers</span><button onClick={() => setTray(null)}><HiXMark /></button></div>
                <div>{stickers.map((sticker) => <button key={sticker} type="button" onClick={() => { setContent((value) => value + sticker); setTray(null); }}>{sticker}</button>)}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <form className="composer" onSubmit={submit}>
        <button type="button" className={`composer-circle ${tray === "sticker" ? "active" : ""}`} onClick={() => setTray((value) => value === "sticker" ? null : "sticker")} aria-label="More">
          <HiOutlinePlus />
        </button>
        <div className="composer-input">
          {recording ? (
            <div className="recording-state">
              <span className="recording-dot" />
              <strong>Recording</strong>
              <div className="mini-wave">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 60}ms` }} />)}</div>
              <time>{Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}</time>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              rows="1"
              value={content}
              onChange={(event) => { typing(event.target.value); resize(event); }}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="iMessage"
            />
          )}
          <div className="composer-inline-actions">
            <input
              ref={fileRef}
              hidden
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.mp3,.wav,.webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add photo or file"><HiOutlinePhoto /></button>
            <button type="button" className={tray === "gif" ? "active" : ""} onClick={() => setTray((value) => value === "gif" ? null : "gif")} aria-label="GIF"><HiGif /></button>
            <button type="button" className={tray === "emoji" ? "active" : ""} onClick={() => setTray((value) => value === "emoji" ? null : "emoji")} aria-label="Emoji"><HiFaceSmile /></button>
          </div>
        </div>
        {recording ? (
          <button type="button" className="send-button recording-stop" onClick={stopRecording} aria-label="Stop recording"><HiStop /></button>
        ) : content.trim() || attachments.length ? (
          <button type="submit" className="send-button" disabled={sending || uploading} aria-label="Send">
            {sending || uploading ? <span className="button-spinner" /> : <HiArrowUp />}
          </button>
        ) : (
          <button type="button" className="composer-circle microphone" onClick={startRecording} aria-label="Record voice message"><HiMicrophone /></button>
        )}
      </form>
      <span className="composer-hint">Drop files, paste a screenshot, or press Enter to send</span>
    </div>
  );
}
