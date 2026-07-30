// File: client/src/components/modals/NotificationsPanel.jsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { HiBell, HiCheck, HiXMark } from "react-icons/hi2";
import { socialApi } from "../../services/api.js";
import { useUiStore } from "../../store/uiStore.js";
import Avatar from "../common/Avatar.jsx";

export default function NotificationsPanel() {
  const open = useUiStore((state) => state.notificationsOpen);
  const setOpen = useUiStore((state) => state.setNotificationsOpen);
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: socialApi.notifications });
  const mutation = useMutation({
    mutationFn: socialApi.readNotifications,
    onSuccess: () => queryClient.setQueryData(["notifications"], (items = []) => items.map((item) => ({ ...item, read: true })))
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.aside className="notification-drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 34 }}>
            <header><div><span className="section-eyebrow">Stay in the loop</span><h2>Notifications</h2></div><button type="button" onClick={() => setOpen(false)}><HiXMark /></button></header>
            <button type="button" className="mark-read" onClick={() => mutation.mutate()}><HiCheck /> Mark all as read</button>
            <div className="notification-list">
              {notifications.length ? notifications.map((notification) => (
                <article key={notification.id} className={notification.read ? "" : "unread"}>
                  <Avatar user={notification.actor} size="md" />
                  <div><strong>{notification.title}</strong><p>{notification.body}</p><time>{relative(notification.createdAt)}</time></div>
                  {!notification.read && <i />}
                </article>
              )) : <div className="notification-empty"><HiBell /><strong>All caught up</strong><span>New activity will appear here.</span></div>}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function relative(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}
