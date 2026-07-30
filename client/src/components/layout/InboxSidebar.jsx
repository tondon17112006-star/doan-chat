// File: client/src/components/layout/InboxSidebar.jsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HiArchiveBox,
  HiChevronDown,
  HiMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiSpeakerXMark,
  HiStar
} from "react-icons/hi2";
import { chatApi, socialApi } from "../../services/api.js";
import { useUiStore } from "../../store/uiStore.js";
import Avatar from "../common/Avatar.jsx";
import IconButton from "../common/IconButton.jsx";
import { formatConversationTime } from "../../utils/format.js";

const filters = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "favorites", label: "Favorites" },
  { id: "archived", label: "Archived" }
];

export default function InboxSidebar() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const filter = useUiStore((state) => state.inboxFilter);
  const setFilter = useUiStore((state) => state.setInboxFilter);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const { data: conversations = [], isLoading } = useQuery({ queryKey: ["conversations"], queryFn: chatApi.conversations });
  const { data: stories = [] } = useQuery({ queryKey: ["stories"], queryFn: socialApi.stories });
  const setStory = useUiStore((state) => state.setStory);

  const shown = useMemo(() => {
    const term = query.toLowerCase();
    return conversations.filter((conversation) => {
      if (term && !`${conversation.name} ${conversation.lastMessage}`.toLowerCase().includes(term)) return false;
      if (filter === "unread") return conversation.unreadCount > 0;
      if (filter === "favorites") return conversation.favorite;
      if (filter === "archived") return conversation.archived;
      return !conversation.archived;
    });
  }, [conversations, filter, query]);

  useEffect(() => {
  // Nếu đang ở /chat và có conversation thì tự mở conversation đầu tiên
    if (!conversationId && shown.length > 0) {
      navigate(`/chat/${shown[0].id}`, { replace: true });
    }
  }, [conversationId, shown, navigate]);

  return (
    <aside className={`inbox-sidebar ${conversationId ? "has-active-chat" : ""}`}>
      <header className="inbox-header">
        <div>
          <span className="section-eyebrow">Your space</span>
          <h1>Messages</h1>
        </div>
        <IconButton icon={<HiOutlinePencilSquare />} label="New message" className="compose-button" onClick={() => setNewChatOpen(true)} />
      </header>
      <button type="button" className="sidebar-search" onClick={() => setSearchOpen(true)}>
        <HiMagnifyingGlass />
        <span>Search conversations</span>
        <kbd>⌘ K</kbd>
      </button>

      <section className="stories-strip">
        <div className="stories-heading">
          <span>Moments</span>
          <button type="button" onClick={() => navigate("/stories")}>View all</button>
        </div>
        <div className="story-avatars">
          <button className="story-avatar add-story" type="button" onClick={() => navigate("/stories?create=true")}>
            <span className="story-ring add"><HiOutlinePlus /></span>
            <small>Add</small>
          </button>
          {stories.slice(0, 5).map((story) => (
            <button key={story.id} className="story-avatar" type="button" onClick={() => setStory(story)}>
              <span className="story-ring"><Avatar user={story.user} name={story.user?.username} src={story.user?.avatar} size="md" /></span>
              <small>{story.user?.username?.split(" ")[0]}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="filter-tabs">
        {filters.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="conversation-scroll">
        {isLoading ? <ConversationSkeletons /> : null}
        {!isLoading && shown.length === 0 ? (
          <div className="sidebar-empty">
            <HiArchiveBox />
            <strong>Bạn chưa có cuộc trò chuyện nào</strong>
            <span>Hãy nhấn "New message" để bắt đầu cuộc trò chuyện đầu tiên.</span>
          </div>
        ) : null}
        {shown.map((conversation, index) => (
          <motion.button
            layout
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.035, 0.2) }}
            type="button"
            key={conversation.id}
            onClick={() => navigate(`/chat/${conversation.id}`)}
            className={`conversation-item ${conversationId === conversation.id ? "active" : ""}`}
          >
            <Avatar
              src={conversation.avatar}
              name={conversation.name}
              group={conversation.type === "group"}
              color={conversation.color === "orange" ? "#ee9d65" : conversation.color === "violet" ? "#a57bea" : undefined}
              online={conversation.type === "direct" && conversation.participantUsers?.some((user) => user.isOnline && user.id !== "u-alex")}
              size="lg"
            />
            <span className="conversation-copy">
              <span className="conversation-topline">
                <strong>{conversation.name}</strong>
                <time>{formatConversationTime(conversation.lastMessageAt)}</time>
              </span>
              <span className="conversation-bottomline">
                <span>{conversation.lastMessage}</span>
                {conversation.muted && <HiSpeakerXMark />}
                {conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}
              </span>
            </span>
            {conversation.favorite && <HiStar className="favorite-mark" />}
          </motion.button>
        ))}
      </div>
      <button className="archive-row" type="button" onClick={() => setFilter("archived")}>
        <HiArchiveBox /><span>Archived conversations</span><HiChevronDown />
      </button>
    </aside>
  );
}

function ConversationSkeletons() {
  return Array.from({ length: 5 }, (_, index) => (
    <div className="conversation-skeleton" key={index}>
      <span />
      <div><i /><i /></div>
    </div>
  ));
}
