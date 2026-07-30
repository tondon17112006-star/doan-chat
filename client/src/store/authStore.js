// File: client/src/store/authStore.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setSession: ({ user, accessToken }) => set({ user, accessToken }),
      patchUser: (updates) => set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
      clearSession: () => set({ user: null, accessToken: null })
    }),
    {
      name: "lumina-session",
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true)
    }
  )
);
