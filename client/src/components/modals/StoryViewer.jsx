// File: client/src/components/modals/StoryViewer.jsx
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { HiArrowLeft, HiArrowRight, HiEllipsisHorizontal, HiPaperAirplane, HiXMark } from "react-icons/hi2";
import { useUiStore } from "../../store/uiStore.js";
import { chatApi, socialApi } from "../../services/api.js";
import Avatar from "../common/Avatar.jsx";
import { useAuthStore } from "../../store/authStore.js";
import { SecureImage, SecureVideo, usePrivateUploadUrl } from "../../hooks/usePrivateUploadUrl.jsx";

export default function StoryViewer() {
  const story = useUiStore((state) => state.story);
  const setStory = useUiStore((state) => state.setStory);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [progressKey, setProgressKey] = useState(0);
  const [replyError, setReplyError] = useState("");
  const backdropUrl = usePrivateUploadUrl(story?.mediaUrl);
  const replyMutation = useMutation({
    mutationFn: async ({ targetId, content }) => {
      const conversation = await chatApi.createConversation({ type: "direct", participants: [targetId] });
      return chatApi.send(conversation.id, { type: "text", content });
    },
    onMutate: () => setReplyError(""),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (requestError) => setReplyError(requestError.response?.data?.message || "Could not send your story reply."),
  });

  useEffect(() => {
    if (!story) return undefined;
    socialApi.viewStory(story.id).catch(() => undefined);
    setReply("");
    setReplyError("");
    setProgressKey((value) => value + 1);
    const timeout = setTimeout(() => setStory(null), story.type === "video" ? 12_000 : 7_000);
    return () => clearTimeout(timeout);
  }, [story, setStory]);

  function react(emoji) {
    socialApi.viewStory(story.id, emoji).catch(() => undefined);
  }

  function sendReply() {
    const content = reply.trim();
    if (!content || !story?.user?.id || story.user.id === user?.id) return;
    replyMutation.mutate({ targetId: story.user.id, content });
  }

  return (
    <AnimatePresence>
      {story && (
        <motion.div className="story-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="story-viewer-backdrop" style={{ backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined }} />
          <motion.div className="story-viewer-card" initial={{ scale: 0.96, y: 15 }} animate={{ scale: 1, y: 0 }}>
            <div className="story-progress"><i key={progressKey} style={{ animationDuration: story.type === "video" ? "12s" : "7s" }} /></div>
            <header>
              <Avatar user={story.user} size="sm" />
              <div><strong>{story.user?.username}</strong><span>{relative(story.createdAt)}</span></div>
              <button type="button"><HiEllipsisHorizontal /></button>
              <button type="button" onClick={() => setStory(null)}><HiXMark /></button>
            </header>
            {story.type === "video" ? <SecureVideo src={story.mediaUrl} autoPlay controls /> : <SecureImage src={story.mediaUrl} alt={story.caption} />}
            {story.caption && <div className="viewer-caption">{story.caption}</div>}
            <footer>
              <div className="story-reactions">{["❤️", "😂", "😮", "👏"].map((emoji) => <button key={emoji} type="button" onClick={() => react(emoji)}>{emoji}</button>)}</div>
              <div className="story-reply"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={story.user?.id === user?.id ? "This is your story" : `Reply to ${story.user?.username?.split(" ")[0]}…`} disabled={story.user?.id === user?.id || replyMutation.isPending} onKeyDown={(event) => event.key === "Enter" && sendReply()} /><button type="button" onClick={sendReply} disabled={!reply.trim() || story.user?.id === user?.id || replyMutation.isPending} aria-label="Send story reply">{replyMutation.isPending ? "…" : <HiPaperAirplane />}</button></div>
              {replyError && <p className="story-reply-error" role="alert">{replyError}</p>}
            </footer>
          </motion.div>
          <button className="story-nav previous" type="button"><HiArrowLeft /></button>
          <button className="story-nav next" type="button"><HiArrowRight /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function relative(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value)) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}
