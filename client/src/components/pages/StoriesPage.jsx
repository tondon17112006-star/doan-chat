// File: client/src/components/pages/StoriesPage.jsx
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { HiCamera, HiOutlinePlus, HiPhoto, HiPlay } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import Modal from "../common/Modal.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useUiStore } from "../../store/uiStore.js";
import { useAuthStore } from "../../store/authStore.js";
import { SecureImage, SecureVideo } from "../../hooks/usePrivateUploadUrl.jsx";

export default function StoriesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const setStory = useUiStore((state) => state.setStory);
  const user = useAuthStore((state) => state.user);
  const { data: stories = [], isLoading } = useQuery({ queryKey: ["stories"], queryFn: socialApi.stories });

  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <PageFrame
      eyebrow="Moments"
      title="Stories"
      subtitle="Little windows into the day, here for 24 hours."
      action={<button className="primary-button compact" type="button" onClick={() => setCreateOpen(true)}><HiOutlinePlus /> Add story</button>}
    >
      <div className="story-feature-row">
        <button type="button" className="your-story-card" onClick={() => setCreateOpen(true)}>
          <div className="your-story-visual"><Avatar user={user} size="xl" /><span><HiOutlinePlus /></span></div>
          <div><strong>Your story</strong><span>Share a photo or video</span></div>
        </button>
        <div className="story-note"><HiCamera /><div><strong>Share the real moments</strong><span>Stories disappear automatically after 24 hours.</span></div></div>
      </div>

      <section className="stories-gallery">
        <div className="section-title-row"><div><span className="section-icon violet"><HiPhoto /></span><div><h2>Recent stories</h2><p>{stories.length} updates from your circle</p></div></div></div>
        <div className="story-card-grid">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <div className="story-tile skeleton" key={index} />) : stories.map((story, index) => (
            <motion.button
              type="button"
              key={story.id}
              className="story-tile"
              onClick={() => setStory(story)}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07 }}
            >
              {story.type === "video" ? <SecureVideo src={story.mediaUrl} muted /> : <SecureImage src={story.mediaUrl} alt={story.caption} />}
              <span className="story-tile-overlay" />
              {story.type === "video" && <span className="story-play"><HiPlay /></span>}
              <span className="story-owner"><Avatar user={story.user} size="sm" /><span><strong>{story.user?.username}</strong><small>{timeAgo(story.createdAt)}</small></span></span>
              <span className="story-caption">{story.caption}</span>
            </motion.button>
          ))}
        </div>
      </section>
      <CreateStoryModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageFrame>
  );
}

function CreateStoryModal({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState("");
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const [uploaded] = await chatApi.upload([file], "story");
      return socialApi.addStory({ type: file.type.startsWith("video/") ? "video" : "image", mediaUrl: uploaded.url, caption });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      setFile(null);
      setPreview("");
      setCaption("");
      onClose();
    }
  });

  function choose(event) {
    const selected = event.target.files[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a story">
      <div className="create-story">
        <input ref={inputRef} type="file" accept="image/*,video/*" hidden onChange={choose} />
        {preview ? (
          <div className="story-preview">{file.type.startsWith("video/") ? <video src={preview} controls /> : <img src={preview} alt="" />}</div>
        ) : (
          <button type="button" className="story-dropzone" onClick={() => inputRef.current?.click()}><HiPhoto /><strong>Choose a photo or video</strong><span>JPG, PNG, WEBP, MP4 or MOV</span></button>
        )}
        <label><span>Caption</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Say a little something…" maxLength={500} /></label>
        <button type="button" className="primary-button" disabled={!file || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Sharing…" : "Share story"}
        </button>
      </div>
    </Modal>
  );
}

function timeAgo(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value)) / 60_000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
