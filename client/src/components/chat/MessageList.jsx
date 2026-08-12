// File: client/src/components/chat/MessageList.jsx
import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MessageBubble from "./MessageBubble.jsx";
import Avatar from "../common/Avatar.jsx";
import { groupByDay } from "../../utils/format.js";

export default function MessageList({ conversation, messages, loading, user, typingUsers, onReply, onRetry }) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const groups = useMemo(() => groupByDay(messages), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages.length, typingUsers.length, conversation?.id]);

  if (loading) {
    return (
      <div className="message-list message-loading">
        <div className="message-placeholder incoming" />
        <div className="message-placeholder incoming short" />
        <div className="message-placeholder outgoing" />
        <div className="message-placeholder outgoing short" />
      </div>
    );
  }

  if (!conversation) {
  return (
    <div className="message-list">
      <h3>Conversation not found</h3>
    </div>
  );
}

  return (
    <div className="message-list" ref={scrollRef}>
      <div className="conversation-intro">
        <Avatar
          src={conversation.avatar}
          name={conversation.name}
          group={conversation.type === "group"}
          user={conversation.type === "ai" ? { role: "assistant" } : undefined}
          size="xl"
        />
        <h2>{conversation.name}</h2>
        <p>{conversation.type === "group" ? `${conversation.participants.length} people in this conversation` : "You’re connected on Lumina"}</p>
      </div>
      {groups.map((group) => (
        <section className="message-day" key={group.key}>
          <div className="day-divider"><span>{group.label}</span></div>
          {group.messages.map((message, index) => {
            const previous = group.messages[index - 1];
            const next = group.messages[index + 1];
            const compactTop = previous?.senderId === message.senderId && new Date(message.createdAt) - new Date(previous.createdAt) < 180_000;
            const compactBottom = next?.senderId === message.senderId && new Date(next.createdAt) - new Date(message.createdAt) < 180_000;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                mine={message.senderId === user.id}
                compactTop={compactTop}
                compactBottom={compactBottom}
                onReply={onReply}
                onRetry={onRetry}
              />
            );
          })}
        </section>
      ))}
      <AnimatePresence>
        {typingUsers.map((typingUser) => (
          <motion.div key={typingUser.id} className="typing-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Avatar user={typingUser} size="xs" />
            <div className="typing-bubble"><i /><i /><i /></div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} className="scroll-anchor" />
    </div>
  );
}
