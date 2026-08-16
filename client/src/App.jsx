// File: client/src/App.jsx
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/authStore.js";
import { useTheme } from "./hooks/useTheme.js";
import { useRealtime } from "./hooks/useRealtime.js";
import AuthPage from "./components/auth/AuthPage.jsx";
import EmailVerification from "./components/auth/EmailVerification.jsx";
import AppShell from "./components/layout/AppShell.jsx";

function Splash() {
  return (
    <div className="splash-screen">
      <motion.img
        src="/lumina-mark.svg"
        alt=""
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="splash-logo"
      />
      <div className="splash-pulse" />
    </div>
  );
}

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  useTheme();
  useRealtime();

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("lumina:search"));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!hydrated) return <Splash />;
  if (!user) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AuthPage />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (!user.verified) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="verify-email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <EmailVerification />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key="app" initial={false} animate={{ opacity: 1 }} className="app-root">
        <Routes location={location}>
          <Route path="/*" element={<AppShell />} />
          <Route path="*" element={<Navigate to="/chat/c-maya" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
