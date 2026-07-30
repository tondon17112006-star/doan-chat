// File: client/src/services/socket.js
import { io } from "socket.io-client";

let socket;

export function connectSocket(token) {
  if (socket?.connected) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
