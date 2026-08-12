// File: client/src/components/modals/StoryViewer.jsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { HiArrowLeft, HiArrowRight, HiPaperAirplane, HiXMark } from "react-icons/hi2";
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
  const { data: stories = [], isLoading: storiesLoading, isError: storiesError } = useQuery({
    queryKey: ["stories"],
    queryFn: socialApi.stories,
    enabled: Boolean(story),
  });
  const [reply, setReply] = useState("");
  const [progressKey, setProgressKey] = useState(0);
  const [replyError, setReplyError] = useState("");
  const [reactionError, setReactionError] = useState("");
  const activeStory = stories.find((item) => item.id === story?.id) || story;
  const currentIndex = stories.findIndex((item) => item.id === activeStory?.id);
  const canNavigate = currentIndex >= 0 && !storiesLoading;
  const backdropUrl = usePrivateUploadUrl(activeStory?.mediaUrl);
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
  const reactionMutation = useMutation({
    mutationFn: (emoji) => socialApi.viewStory(activeStory.id, emoji),
    onMutate: () => setReactionError(""),
    onError: (requestError) => setReactionError(requestError.response?.data?.message || "Could not react to this story."),
  });

  useEffect(() => {
    if (!activeStory) return undefined;
    if (activeStory.user?.id !== user?.id) socialApi.viewStory(activeStory.id).catch(() => undefined);
    setReply("");
    setReplyError("");
    setReactionError("");
    setProgressKey((value) => value + 1);
    const timeout = setTimeout(() => {
      const nextStory = currentIndex >= 0 ? stories[currentIndex + 1] : null;
      setStory(nextStory || null);
    }, activeStory.type === "video" ? 12_000 : 7_000);
    return () => clearTimeout(timeout);
  }, [activeStory?.id, activeStory?.type, activeStory?.user?.id, currentIndex, setStory, stories, user?.id]);

  function react(emoji) {
    if (!activeStory || reactionMutation.isPending) return;
    reactionMutation.mutate(emoji);
  }

  function sendReply() {
    const content = reply.trim();
    if (!content || !activeStory?.user?.id || activeStory.user.id === user?.id) return;
    replyMutation.mutate({ targetId: activeStory.user.id, content });
  }

  function navigate(offset) {
    if (!canNavigate) return;
    const target = stories[currentIndex + offset];
    if (target) setStory(target);
  }

  return (
    <AnimatePresence>
      {activeStory && (
        <motion.div className="story-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="story-viewer-backdrop" style={{ backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined }} />
          <motion.div className="story-viewer-card" initial={{ scale: 0.96, y: 15 }} animate={{ scale: 1, y: 0 }}>
            <div className="story-progress"><i key={progressKey} style={{ animationDuration: activeStory.type === "video" ? "12s" : "7s" }} /></div>
            <header>
              <Avatar user={activeStory.user} size="sm" />
              <div><strong>{activeStory.user?.username}</strong><span>{relative(activeStory.createdAt)}</span></div>
              {canNavigate && <span className="story-position">{currentIndex + 1} / {stories.length}</span>}
              <button type="button" onClick={() => setStory(null)}><HiXMark /></button>
            </header>
            {activeStory.type === "video" ? <SecureVideo src={activeStory.mediaUrl} autoPlay controls /> : <SecureImage src={activeStory.mediaUrl} alt={activeStory.caption} />}
            {activeStory.caption && <div className="viewer-caption">{activeStory.caption}</div>}
            <footer>
              <div className="story-reactions">{["❤️", "😂", "😮", "👏"].map((emoji) => <button key={emoji} type="button" onClick={() => react(emoji)} disabled={reactionMutation.isPending}>{emoji}</button>)}</div>
              <div className="story-reply"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={activeStory.user?.id === user?.id ? "This is your story" : `Reply to ${activeStory.user?.username?.split(" ")[0]}…`} disabled={activeStory.user?.id === user?.id || replyMutation.isPending} onKeyDown={(event) => event.key === "Enter" && sendReply()} /><button type="button" onClick={sendReply} disabled={!reply.trim() || activeStory.user?.id === user?.id || replyMutation.isPending} aria-label="Send story reply">{replyMutation.isPending ? "…" : <HiPaperAirplane />}</button></div>
              {replyError && <p className="story-reply-error" role="alert">{replyError}</p>}
              {reactionError && <p className="story-reply-error" role="alert">{reactionError}</p>}
              {storiesError && <p className="story-reply-error" role="alert">Could not refresh the story list.</p>}
            </footer>
          </motion.div>
          <button className="story-nav previous" type="button" onClick={() => navigate(-1)} disabled={!canNavigate || currentIndex === 0} aria-label="Previous story"><HiArrowLeft /></button>
          <button className="story-nav next" type="button" onClick={() => navigate(1)} disabled={!canNavigate || currentIndex >= stories.length - 1} aria-label="Next story"><HiArrowRight /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function relative(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value)) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}
