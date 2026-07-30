// File: client/src/components/modals/StoryViewer.jsx
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HiArrowLeft, HiArrowRight, HiEllipsisHorizontal, HiPaperAirplane, HiXMark } from "react-icons/hi2";
import { useUiStore } from "../../store/uiStore.js";
import { socialApi } from "../../services/api.js";
import Avatar from "../common/Avatar.jsx";

export default function StoryViewer() {
  const story = useUiStore((state) => state.story);
  const setStory = useUiStore((state) => state.setStory);
  const [reply, setReply] = useState("");
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    if (!story) return undefined;
    socialApi.viewStory(story.id).catch(() => undefined);
    setProgressKey((value) => value + 1);
    const timeout = setTimeout(() => setStory(null), story.type === "video" ? 12_000 : 7_000);
    return () => clearTimeout(timeout);
  }, [story, setStory]);

  function react(emoji) {
    socialApi.viewStory(story.id, emoji).catch(() => undefined);
  }

  return (
    <AnimatePresence>
      {story && (
        <motion.div className="story-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="story-viewer-backdrop" style={{ backgroundImage: `url(${story.mediaUrl})` }} />
          <motion.div className="story-viewer-card" initial={{ scale: 0.96, y: 15 }} animate={{ scale: 1, y: 0 }}>
            <div className="story-progress"><i key={progressKey} style={{ animationDuration: story.type === "video" ? "12s" : "7s" }} /></div>
            <header>
              <Avatar user={story.user} size="sm" />
              <div><strong>{story.user?.username}</strong><span>{relative(story.createdAt)}</span></div>
              <button type="button"><HiEllipsisHorizontal /></button>
              <button type="button" onClick={() => setStory(null)}><HiXMark /></button>
            </header>
            {story.type === "video" ? <video src={story.mediaUrl} autoPlay controls /> : <img src={story.mediaUrl} alt={story.caption} />}
            {story.caption && <div className="viewer-caption">{story.caption}</div>}
            <footer>
              <div className="story-reactions">{["❤️", "😂", "😮", "👏"].map((emoji) => <button key={emoji} type="button" onClick={() => react(emoji)}>{emoji}</button>)}</div>
              <div className="story-reply"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={`Reply to ${story.user?.username?.split(" ")[0]}…`} /><button type="button" disabled={!reply.trim()}><HiPaperAirplane /></button></div>
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
