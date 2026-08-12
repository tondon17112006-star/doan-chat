// File: client/src/components/chat/ChatPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiArrowLeft,
  HiEllipsisHorizontal,
  HiOutlinePhone,
  HiOutlineVideoCamera,
  HiOutlineInformationCircle,
  HiSparkles
} from "react-icons/hi2";
import { chatApi } from "../../services/api.js";
import { getSocket } from "../../services/socket.js";
import { useSocketStatus } from "../../hooks/useSocketStatus.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import Avatar from "../common/Avatar.jsx";
import IconButton from "../common/IconButton.jsx";
import MessageList from "./MessageList.jsx";
import Composer from "./Composer.jsx";
import ConversationDetails from "./ConversationDetails.jsx";
import EmptyState from "../common/EmptyState.jsx";
import { formatLastSeen } from "../../utils/format.js";

export default function ChatPanel() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const detailOpen = useUiStore((state) => state.detailOpen);
  const toggleDetails = useUiStore((state) => state.toggleDetails);
  const setActiveCall = useUiStore((state) => state.setActiveCall);
  const socketStatus = useSocketStatus();
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [realtimeError, setRealtimeError] = useState("");
  const { data: conversation, isLoading: conversationLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => chatApi.conversation(conversationId),
    enabled: Boolean(conversationId)
  });
  const { data: timeline, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => chatApi.messages(conversationId, { limit: 60 }),
    enabled: Boolean(conversationId)
  });
  const sendMutation = useMutation({
    mutationFn: ({ payload }) => chatApi.send(conversationId, payload),
    retry: (failureCount, error) => ![400, 401, 403, 404, 413, 422].includes(error?.response?.status) && failureCount < 2,
    retryDelay: (attempt) => Math.min(600 * 2 ** attempt, 3_000),
    onMutate: ({ clientMessageId, payload }) => {
      const optimistic = {
        id: clientMessageId,
        clientMessageId,
        conversationId,
        senderId: user.id,
        sender: user,
        content: payload.content,
        attachments: payload.attachments || [],
        type: payload.type || "text",
        replyTo: payload.replyTo || null,
        reactions: [],
        status: "sending",
        createdAt: new Date().toISOString(),
        _retryPayload: payload,
      };
      queryClient.setQueryData(["messages", conversationId], (previous) => {
        if (!previous) return previous;
        const messages = previous.messages.some((item) => item.clientMessageId === clientMessageId || item.id === clientMessageId)
          ? previous.messages.map((item) => item.clientMessageId === clientMessageId || item.id === clientMessageId ? optimistic : item)
          : [...previous.messages, optimistic];
        return { ...previous, messages };
      });
      return { clientMessageId };
    },
    onSuccess: (message, { clientMessageId }) => {
      queryClient.setQueryData(["messages", conversationId], (previous) => {
        if (!previous) return previous;
        const messages = previous.messages.filter((item) => item.id !== message.id && item.id !== clientMessageId && item.clientMessageId !== message.clientMessageId);
        return { ...previous, messages: [...messages, message].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)) };
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setReplyingTo(null);
    },
    onError: (_error, { clientMessageId }) => {
      queryClient.setQueryData(["messages", conversationId], (previous) =>
        previous ? { ...previous, messages: previous.messages.map((message) => message.id === clientMessageId || message.clientMessageId === clientMessageId ? { ...message, status: "failed" } : message) } : previous,
      );
    }
  });

  const otherUser = useMemo(
    () => conversation?.participantUsers?.find((participant) => participant.id !== user.id),
    [conversation, user.id]
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return undefined;
    socket.emit("conversation:join", conversationId);
    chatApi.read(conversationId).catch(() => undefined);
    const start = (payload) => {
      if (payload.conversationId !== conversationId || payload.user.id === user.id) return;
      setTypingUsers((current) => [...current.filter((item) => item.id !== payload.user.id), { ...payload.user, activity: payload.activity }]);
    };
    const stop = (payload) => setTypingUsers((current) => current.filter((item) => item.id !== payload.userId));
    socket.on("typing:start", start);
    socket.on("typing:stop", stop);
    return () => {
      socket.emit("conversation:leave", conversationId);
      socket.off("typing:start", start);
      socket.off("typing:stop", stop);
    };
  }, [conversationId, user.id]);

  async function startCall(type) {
    const socket = getSocket();
    if (!socket?.connected) {
      setRealtimeError("Realtime is reconnecting. Please wait before starting a call.");
      return;
    }
    const participants = (conversation?.participants || []).filter((id) => String(id) !== user.id);
    const call = {
      callId: crypto.randomUUID(),
      conversationId,
      participants,
      type,
      caller: user,
      peer: otherUser,
      status: "calling",
      incoming: false
    };
    setActiveCall(call);
  }

  function queueMessage(payload, clientMessageId = crypto.randomUUID()) {
    const request = { ...payload, clientMessageId };
    return sendMutation.mutateAsync({ payload: request, clientMessageId }).catch(() => undefined);
  }

  function retryMessage(message) {
    if (!message._retryPayload) return;
    queueMessage(message._retryPayload, message.clientMessageId || message.id);
  }

  if (!conversationId) {
    return (
      <section className="chat-panel welcome-chat">
        <EmptyState
          icon={<img src="/lumina-mark.svg" alt="" />}
          title="Your conversations live here"
          description="Choose someone from the sidebar or start a new message."
        />
      </section>
    );
  }

  if (!conversationLoading && !conversation) {
    return (
      <section className="chat-panel welcome-chat">
        <EmptyState icon={<HiSparkles />} title="Conversation unavailable" description="It may have been removed or you no longer have access." />
      </section>
    );
  }

  const status =
    conversation?.type === "group"
      ? `${conversation.participants?.length || 0} members`
      : otherUser?.isOnline
        ? "Active now"
        : formatLastSeen(otherUser?.lastSeen);

  return (
    <section className={`chat-panel ${detailOpen ? "details-visible" : ""}`}>
      <div className="chat-main">
        <header className="chat-header">
          <button type="button" className="mobile-back" onClick={() => navigate("/chat")} aria-label="Back to messages">
            <HiArrowLeft />
          </button>
          {conversationLoading ? (
            <div className="chat-header-skeleton" />
          ) : (
            <>
              <Avatar
                src={conversation.avatar}
                name={conversation.name}
                group={conversation.type === "group"}
                user={conversation.type === "ai" ? { role: "assistant" } : otherUser}
                online={conversation.type !== "group" && otherUser?.isOnline}
                size="md"
              />
              <button type="button" className="chat-identity" onClick={toggleDetails}>
                <strong>{conversation.name}</strong>
                <span className={otherUser?.isOnline ? "online" : ""}>
                  {typingUsers.length ? activityLabel(typingUsers[0]) : status}
                </span>
              </button>
            </>
          )}
          <div className="chat-actions">
            <IconButton icon={<HiOutlinePhone />} label="Voice call" onClick={() => startCall("voice")} />
            <IconButton icon={<HiOutlineVideoCamera />} label="Video call" onClick={() => startCall("video")} />
            <IconButton icon={<HiOutlineInformationCircle />} label="Conversation details" active={detailOpen} onClick={toggleDetails} />
            <IconButton icon={<HiEllipsisHorizontal />} label="More options" className="desktop-more" />
          </div>
        </header>
        {!socketStatus.connected && <p className="realtime-state" role="status">{socketStatus.reconnecting ? "Reconnecting realtime…" : "Realtime is offline. Failed messages can be retried."}</p>}
        {realtimeError && <p className="realtime-state error" role="alert">{realtimeError}</p>}

        <MessageList
          conversation={conversation}
          messages={timeline?.messages || []}
          loading={messagesLoading}
          user={user}
          typingUsers={typingUsers}
          onReply={setReplyingTo}
          onRetry={retryMessage}
        />
        <Composer
          conversationId={conversationId}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={(payload) => queueMessage({ ...payload, replyTo: replyingTo?.id })}
          sending={sendMutation.isPending}
        />
      </div>
      <AnimatePresence>
        {detailOpen && conversation && (
          <motion.div
            className="details-wrap"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 330, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
          >
            <ConversationDetails conversation={conversation} otherUser={otherUser} onCall={startCall} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function activityLabel(user) {
  if (user.activity === "recording") return `${user.username} is recording audio…`;
  if (user.activity === "choosing-image") return `${user.username} is choosing a photo…`;
  return `${user.username} is typing…`;
}
