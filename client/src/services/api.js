// File: client/src/services/api.js
import axios from "axios";
import { useAuthStore } from "../store/authStore.js";

const baseURL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 20_000
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Device-Id"] ||= getDeviceId();
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    if (error.response?.status !== 401 || request?._retried || request?.url?.includes("/auth/")) {
      return Promise.reject(error);
    }
    request._retried = true;
    refreshing ||= api.post("/auth/refresh", {}, { headers: { Authorization: undefined } }).finally(() => {
      refreshing = null;
    });
    try {
      const { data } = await refreshing;
      useAuthStore.getState().setSession(data.data);
      request.headers.Authorization = `Bearer ${data.data.accessToken}`;
      return api(request);
    } catch (refreshError) {
      useAuthStore.getState().clearSession();
      return Promise.reject(refreshError);
    }
  }
);

export function getDeviceId() {
  let device = localStorage.getItem("lumina-device-id");
  if (!device) {
    device = crypto.randomUUID();
    localStorage.setItem("lumina-device-id", device);
  }
  return device;
}

export const unwrap = (promise) => promise.then((response) => response.data.data);

export const authApi = {
  login: (payload) => unwrap(api.post("/auth/login", { ...payload, device: deviceInfo() })),
  register: (payload) => unwrap(api.post("/auth/register", { ...payload, device: deviceInfo() })),
  demo: () => unwrap(api.post("/auth/demo", { device: deviceInfo() })),
  logout: (allDevices = false) => api.post("/auth/logout", { allDevices }),
  sessions: () => unwrap(api.get("/auth/sessions")),
  revokeSession: (id) => api.delete(`/auth/sessions/${id}`),
  logoutOtherSessions: () => unwrap(api.post("/auth/logout-others")),
  changePassword: (payload) => unwrap(api.patch("/users/me/password", payload)),
  forgotPassword: (email) => unwrap(api.post("/auth/forgot-password", { email })),
  sendVerification: (email) => unwrap(api.post("/auth/send-verification", { email })),
  verifyOtp: (payload) => unwrap(api.post("/auth/verify-otp", payload))
};

export const chatApi = {
  conversations: () => unwrap(api.get("/conversations")),
  conversation: (id) => unwrap(api.get(`/conversations/${id}`)),
  createConversation: (payload) => unwrap(api.post("/conversations", payload)),
  updateConversation: (id, payload) => unwrap(api.patch(`/conversations/${id}`, payload)),
  deleteConversation: (id) => api.delete(`/conversations/${id}`),
  leaveConversation: (id) => unwrap(api.post(`/conversations/${id}/leave`)),
  messages: (id, params) => unwrap(api.get(`/messages/${id}`, { params })),
  send: (id, payload) => unwrap(api.post(`/messages/${id}`, payload)),
  edit: (id, content) => unwrap(api.patch(`/messages/item/${id}`, { content })),
  remove: (id, everyone) => unwrap(api.delete(`/messages/item/${id}`, { params: { everyone } })),
  react: (id, emoji) => unwrap(api.post(`/messages/item/${id}/reaction`, { emoji })),
  pin: (id) => unwrap(api.post(`/messages/item/${id}/pin`)),
  read: (id) => unwrap(api.post(`/messages/${id}/read`)),
  upload: (files, purpose = "attachment") => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    return unwrap(api.post("/uploads", body, { params: { purpose }, headers: { "Content-Type": "multipart/form-data" } }));
  }
};

export const socialApi = {
  users: (q = "") => unwrap(api.get("/users", { params: { q } })),
  updateProfile: (payload) => unwrap(api.patch("/users/me", payload)),
  friends: () => unwrap(api.get("/friends")),
  friendRequests: (direction) => unwrap(api.get(`/friends/requests/${direction}`)),
  friendAction: (id, action) => unwrap(api.post(`/friends/${id}`, { action })),
  stories: () => unwrap(api.get("/stories")),
  addStory: (payload) => unwrap(api.post("/stories", payload)),
  viewStory: (id, reaction) => unwrap(api.post(`/stories/${id}/view`, { reaction })),
  notifications: () => unwrap(api.get("/notifications")),
  readNotifications: () => api.post("/notifications/read"),
  calls: () => unwrap(api.get("/calls")),
  addCall: (payload) => unwrap(api.post("/calls", payload)),
  createReport: (payload) => unwrap(api.post("/reports", payload)),
  search: (q) => unwrap(api.get("/search", { params: { q } })),
  settings: () => unwrap(api.get("/settings")),
  saveSettings: (payload) => unwrap(api.patch("/settings", payload)),
  dashboard: () => unwrap(api.get("/admin/dashboard")),
  adminReports: (status) => unwrap(api.get("/admin/reports", { params: status ? { status } : undefined })),
  updateAdminReport: (id, payload) => unwrap(api.patch(`/admin/reports/${id}`, payload)),
  resolveAdminReport: (id, resolution = "") => unwrap(api.post(`/admin/reports/${id}/resolve`, { resolution })),
  adminUsers: () => unwrap(api.get("/admin/users")),
  setUserDisabled: (id, disabled) => unwrap(api.patch(`/admin/users/${id}/disabled`, { disabled }))
};

function deviceInfo() {
  return {
    id: getDeviceId(),
    name: `${navigator.platform || "Web"} · ${browserName()}`,
    platform: navigator.platform || "web"
  };
}

function browserName() {
  const agent = navigator.userAgent;
  if (agent.includes("Edg/")) return "Edge";
  if (agent.includes("Chrome/")) return "Chrome";
  if (agent.includes("Safari/")) return "Safari";
  if (agent.includes("Firefox/")) return "Firefox";
  return "Browser";
}
