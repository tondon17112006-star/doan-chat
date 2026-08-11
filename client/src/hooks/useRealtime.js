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
        if (previous.messages.some((item) => item.id === message.id)) return previous;
        return { ...previous, messages: [...previous.messages, message] };
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (document.hidden && Notification.permission === "granted") {
        new Notification(message.sender?.username || "New message", { body: message.content || "Sent an attachment" });
      }
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

    return () => {
      socket.off("message:new", updateTimeline);
      socket.off("message:edit", editTimeline);
      socket.off("message:delete", editTimeline);
      socket.off("reaction:update", editTimeline);
      socket.off("presence:update", presence);
      socket.off("friend:update");
      disconnectSocket();
    };
  }, [token, queryClient, setActiveCall]);
}
