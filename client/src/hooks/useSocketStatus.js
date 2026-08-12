import { useSyncExternalStore } from "react";
import { getSocketState, subscribeSocketState } from "../services/socket.js";

export function useSocketStatus() {
  return useSyncExternalStore(subscribeSocketState, getSocketState, getSocketState);
}
