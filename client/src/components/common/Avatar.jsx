// File: client/src/components/common/Avatar.jsx
import { HiSparkles } from "react-icons/hi2";
import { usePrivateUploadUrl } from "../../hooks/usePrivateUploadUrl.jsx";

const palette = ["#7387ef", "#c77bea", "#ee8f73", "#52bfb5", "#e7ad53", "#6e9ee8"];

export function initials(name = "?") {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Avatar({ user, src, name, size = "md", online, group, color, className = "" }) {
  const label = name || user?.username || user?.name || "?";
  const image = src || user?.avatar;
  const protectedImage = usePrivateUploadUrl(image);
  const isOnline = online ?? user?.isOnline;
  const tone = color || palette[label.length % palette.length];
  const assistant = user?.role === "assistant" || label === "Lumina AI";

  return (
    <span className={`avatar avatar-${size} ${group ? "avatar-group" : ""} ${className}`} style={{ "--avatar-color": tone }}>
      {protectedImage ? (
        <img src={protectedImage} alt={label} />
      ) : assistant ? (
        <span className="avatar-ai"><HiSparkles /></span>
      ) : (
        <span className="avatar-fallback">{group ? <GroupGlyph /> : initials(label)}</span>
      )}
      {isOnline && <span className="online-dot" aria-label="Online" />}
    </span>
  );
}

function GroupGlyph() {
  return (
    <span className="group-glyph">
      <i />
      <i />
      <i />
    </span>
  );
}
