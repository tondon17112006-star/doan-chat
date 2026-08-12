import { io } from "socket.io-client";

let socket;
let state = { connected: false, reconnecting: false, error: null, attempts: 0 };
const listeners = new Set();

function updateState(updates) {
  state = { ...state, ...updates };
  listeners.forEach((listener) => listener());
}

export function connectSocket(token) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected && !socket.active) socket.connect();
    return socket;
  }
  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.35,
    timeout: 10_000,
  });
  socket.on("connect", () => updateState({ connected: true, reconnecting: false, error: null, attempts: 0 }));
  socket.on("disconnect", (reason) => updateState({ connected: false, reconnecting: reason !== "io client disconnect" }));
  socket.io.on("reconnect_attempt", (attempt) => updateState({ reconnecting: true, attempts: attempt }));
  socket.io.on("reconnect_error", (error) => updateState({ error: error.message || "Unable to reconnect" }));
  socket.io.on("reconnect_failed", () => updateState({ reconnecting: false, error: "Realtime connection could not be restored." }));
  return socket;
}

export function getSocket() {
  return socket;
}

export function getSocketState() {
  return state;
}

export function subscribeSocketState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  updateState({ connected: false, reconnecting: false, error: null, attempts: 0 });
}
