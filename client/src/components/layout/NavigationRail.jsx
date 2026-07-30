// File: client/src/components/layout/NavigationRail.jsx
import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineChatBubbleOvalLeftEllipsis,
  HiOutlinePhone,
  HiOutlineUserGroup,
  HiOutlineSquares2X2,
  HiOutlineCog6Tooth,
  HiOutlineBell,
  HiOutlineShieldCheck
} from "react-icons/hi2";
import Logo from "../common/Logo.jsx";
import Avatar from "../common/Avatar.jsx";
import IconButton from "../common/IconButton.jsx";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import { useQuery } from "@tanstack/react-query";
import { socialApi } from "../../services/api.js";

const links = [
  { to: "/chat/c-maya", icon: <HiOutlineChatBubbleOvalLeftEllipsis />, label: "Messages" },
  { to: "/people", icon: <HiOutlineUserGroup />, label: "People" },
  { to: "/stories", icon: <HiOutlineSquares2X2 />, label: "Stories" },
  { to: "/calls", icon: <HiOutlinePhone />, label: "Calls" }
];

export default function NavigationRail() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const setNotificationsOpen = useUiStore((state) => state.setNotificationsOpen);
  const setProfileOpen = useUiStore((state) => state.setProfileOpen);
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: socialApi.notifications });
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <aside className="navigation-rail">
      <button className="rail-logo" type="button" onClick={() => navigate("/chat/c-maya")} aria-label="Lumina home">
        <Logo compact />
      </button>
      <nav className="rail-nav" aria-label="Primary navigation">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`} title={link.label}>
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
        {user.role === "admin" && (
          <NavLink to="/admin" className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`} title="Admin">
            <HiOutlineShieldCheck />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>
      <div className="rail-bottom">
        <IconButton icon={<HiOutlineBell />} label="Notifications" badge={unread} onClick={() => setNotificationsOpen(true)} />
        <NavLink to="/settings" className={({ isActive }) => `rail-icon-link ${isActive ? "active" : ""}`} title="Settings">
          <HiOutlineCog6Tooth />
        </NavLink>
        <button type="button" className="rail-avatar" onClick={() => setProfileOpen(true)} aria-label="Open profile">
          <Avatar user={user} size="sm" online />
        </button>
      </div>
    </aside>
  );
}
