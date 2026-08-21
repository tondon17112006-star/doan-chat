// File: client/src/hooks/useRealtime.js
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../services/socket.js";
import { socialApi } from "../services/api.js";
import { useAuthStore } from "../store/authStore.js";
import { useUiStore } from "../store/uiStore.js";
import { showBrowserNotification } from "../utils/browserNotifications.js";

export function useRealtime() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const setActiveCall = useUiStore((state) => state.setActiveCall);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: socialApi.settings, enabled: Boolean(token), staleTime: 60_000 });
  const notificationPreferences = useRef(null);

  useEffect(() => {
    notificationPreferences.current = settings?.notifications || null;
  }, [settings]);

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
      if (message.senderId !== useAuthStore.getState().user?.id) {
        showBrowserNotification({
          preferences: notificationPreferences.current,
          category: "messages",
          title: message.sender?.username || "New message",
          body: message.content || "Sent an attachment",
          tag: `message:${message.id}`,
        });
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
    const removeStory = ({ id } = {}) => {
      if (id && useUiStore.getState().story?.id === id) useUiStore.getState().setStory(null);
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    };
    socket.on("story:delete", removeStory);
    const refreshNotifications = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    socket.on("notification:new", refreshNotifications);
    const friendUpdate = ({ action, userId } = {}) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      if (userId !== useAuthStore.getState().user?.id && ["request", "accept"].includes(action)) {
        showBrowserNotification({
          preferences: notificationPreferences.current,
          category: "friendRequests",
          title: action === "request" ? "New friend request" : "Friend request accepted",
          body: "Open Lumina to view it.",
          tag: `friend:${action}:${userId}`,
        });
      }
    };
    socket.on("friend:update", friendUpdate);
    const incomingCall = (call) => {
      setActiveCall({ ...call, incoming: true, status: "ringing" });
      showBrowserNotification({
        preferences: notificationPreferences.current,
        category: "calls",
        title: `${call.type === "video" ? "Video" : "Voice"} call`,
        body: `${call.caller?.username || "Someone"} is calling you`,
        tag: `call:${call.callId || call.conversationId}`,
      });
    };
    socket.on("call:incoming", incomingCall);
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
      socket.off("notification:new", refreshNotifications);
      socket.off("friend:update", friendUpdate);
      socket.off("story:delete", removeStory);
      socket.off("call:incoming", incomingCall);
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
