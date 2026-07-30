// File: client/src/components/layout/AppShell.jsx
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import NavigationRail from "./NavigationRail.jsx";
import InboxSidebar from "./InboxSidebar.jsx";
import ChatPanel from "../chat/ChatPanel.jsx";
import NewChatModal from "../modals/NewChatModal.jsx";
import GlobalSearch from "../modals/GlobalSearch.jsx";
import NotificationsPanel from "../modals/NotificationsPanel.jsx";
import StoryViewer from "../modals/StoryViewer.jsx";
import ProfileModal from "../modals/ProfileModal.jsx";
import CallOverlay from "../modals/CallOverlay.jsx";

const PeoplePage = lazy(() => import("../pages/PeoplePage.jsx"));
const StoriesPage = lazy(() => import("../pages/StoriesPage.jsx"));
const CallsPage = lazy(() => import("../pages/CallsPage.jsx"));
const SettingsPage = lazy(() => import("../pages/SettingsPage.jsx"));
const AdminPage = lazy(() => import("../pages/AdminPage.jsx"));

function ChatExperience() {
  return (
    <div className="chat-experience">
      <InboxSidebar />
      <ChatPanel />
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="app-shell">
      <NavigationRail />
      <div className="app-view">
        <Suspense fallback={<div className="route-loading"><img src="/lumina-mark.svg" alt="" /><span /></div>}>
          <Routes>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatExperience />} />
            <Route path="chat/:conversationId" element={<ChatExperience />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="stories" element={<StoriesPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      </div>
      <NewChatModal />
      <GlobalSearch />
      <NotificationsPanel />
      <StoryViewer />
      <ProfileModal />
      <CallOverlay />
    </div>
  );
}
