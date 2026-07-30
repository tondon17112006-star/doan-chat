// File: client/src/store/uiStore.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useUiStore = create(
  persist(
    (set) => ({
      theme: "system",
      inboxFilter: "all",
      detailOpen: false,
      searchOpen: false,
      notificationsOpen: false,
      newChatOpen: false,
      profileOpen: false,
      story: null,
      activeCall: null,
      forwardingMessage: null,
      setTheme: (theme) => set({ theme }),
      setInboxFilter: (inboxFilter) => set({ inboxFilter }),
      toggleDetails: () => set((state) => ({ detailOpen: !state.detailOpen })),
      setDetailOpen: (detailOpen) => set({ detailOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
      setNewChatOpen: (newChatOpen) => set({ newChatOpen }),
      setProfileOpen: (profileOpen) => set({ profileOpen }),
      setStory: (story) => set({ story }),
      setActiveCall: (activeCall) => set({ activeCall }),
      setForwardingMessage: (forwardingMessage) => set({ forwardingMessage })
    }),
    {
      name: "lumina-preferences",
      partialize: ({ theme, inboxFilter }) => ({ theme, inboxFilter })
    }
  )
);
