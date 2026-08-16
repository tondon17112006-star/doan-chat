// File: client/src/hooks/useRealtime.js
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../services/socket.js";
import { useAuthStore } from "../store/authStore.js";
import { useUiStore } from "../store/uiStore.js";

export function useRealtime() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const setActiveCall = useUiStore((state) => state.setActiveCall);

  useEffect(() => {
    if (!token) return undefined;
    const socket = connectSocket(token);

    const updateTimeline = (message) => {
      queryClient.setQueryData(["messages", message.conversationId], (previous) => {
        if (!previous) return previous;
        const existing = previous.messages.filter((item) => item.id !== message.id && item.clientMessageId !== message.clientMessageId);
        return { ...previous, messages: [...existing, message].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)) };
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (message.senderId !== useAuthStore.getState().user?.id && document.hidden && Notification.permission === "granted") {
        new Notification(message.sender?.username || "New message", { body: message.content || "Sent an attachment" });
      }
    };
    const seenTimeline = ({ conversationId, readAt }) => {
      queryClient.setQueryData(["messages", conversationId], (previous) =>
        previous ? { ...previous, messages: previous.messages.map((message) => message.senderId === useAuthStore.getState().user?.id ? { ...message, status: "read", readAt } : message) } : previous,
      );
    };
    const editTimeline = (message) => {
      queryClient.setQueryData(["messages", message.conversationId], (previous) =>
        previous ? { ...previous, messages: previous.messages.map((item) => (item.id === message.id ? { ...item, ...message } : item)) } : previous
      );
    };
    const presence = ({ userId, ...updates }) => {
      queryClient.setQueryData(["conversations"], (items = []) =>
        items.map((conversation) => ({
          ...conversation,
          participantUsers: conversation.participantUsers?.map((user) => (user.id === userId ? { ...user, ...updates } : user))
        }))
      );
    };

    socket.on("message:new", updateTimeline);
    socket.on("message:edit", editTimeline);
    socket.on("message:delete", editTimeline);
    socket.on("reaction:update", editTimeline);
    socket.on("message:seen", seenTimeline);
    socket.on("presence:update", presence);
    socket.on("group:update", () => queryClient.invalidateQueries({ queryKey: ["conversations"] }));
    socket.on("story:new", () => queryClient.invalidateQueries({ queryKey: ["stories"] }));
    socket.on("notification:new", () => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
    socket.on("friend:update", () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
    });
    socket.on("call:incoming", (call) => setActiveCall({ ...call, incoming: true, status: "ringing" }));
    const refreshCalls = () => queryClient.invalidateQueries({ queryKey: ["calls"] });
    const endCall = ({ callId } = {}) => {
      const active = useUiStore.getState().activeCall;
      if (!callId || active?.callId === callId) useUiStore.getState().setActiveCall(null);
      refreshCalls();
    };
    socket.on("call:ended", endCall);
    socket.on("call:timeout", endCall);
    socket.on("call:unavailable", endCall);
    socket.on("call:rejected", endCall);
    socket.on("call:accepted", refreshCalls);
    const accountDisabled = () => {
      disconnectSocket();
      useAuthStore.getState().clearSession();
    };
    socket.on("auth:disabled", accountDisabled);

    return () => {
      socket.off("message:new", updateTimeline);
      socket.off("message:edit", editTimeline);
      socket.off("message:delete", editTimeline);
      socket.off("reaction:update", editTimeline);
      socket.off("message:seen", seenTimeline);
      socket.off("presence:update", presence);
      socket.off("friend:update");
      socket.off("call:ended", endCall);
      socket.off("call:timeout", endCall);
      socket.off("call:unavailable", endCall);
      socket.off("call:rejected", endCall);
      socket.off("call:accepted", refreshCalls);
      socket.off("auth:disabled", accountDisabled);
      disconnectSocket();
    };
  }, [token, queryClient, setActiveCall]);
}
