// File: client/src/utils/format.js
export function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const days = Math.floor((now - date) / 86_400_000);
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatLastSeen(value) {
  if (!value) return "offline";
  const minutes = Math.floor((Date.now() - new Date(value)) / 60_000);
  if (minutes < 1) return "active now";
  if (minutes < 60) return `active ${minutes}m ago`;
  if (minutes < 1_440) return `active ${Math.floor(minutes / 60)}h ago`;
  return `active ${Math.floor(minutes / 1_440)}d ago`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function groupByDay(messages) {
  const groups = [];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const key = date.toDateString();
    const last = groups.at(-1);
    if (!last || last.key !== key) {
      groups.push({
        key,
        label: isToday(date) ? "Today" : date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }),
        messages: [message]
      });
    } else last.messages.push(message);
  }
  return groups;
}

const isToday = (date) => date.toDateString() === new Date().toDateString();
