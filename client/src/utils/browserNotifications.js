const categorySetting = {
  messages: "messages",
  calls: "calls",
  friendRequests: "friendRequests",
};

export function browserNotificationSupport(scope = globalThis) {
  return typeof scope?.Notification === "function";
}

export function browserNotificationPermission(scope = globalThis) {
  if (!browserNotificationSupport(scope)) return "unsupported";
  return scope.Notification.permission || "default";
}

export async function requestBrowserNotificationPermission(scope = globalThis) {
  if (!browserNotificationSupport(scope) || typeof scope.Notification.requestPermission !== "function") return "unsupported";
  if (scope.Notification.permission && scope.Notification.permission !== "default") return scope.Notification.permission;
  try {
    return await scope.Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function pageIsFocused(scope = globalThis) {
  const document = scope?.document;
  if (!document) return true;
  if (typeof document.hasFocus === "function") return document.hasFocus();
  return !document.hidden;
}

export function shouldShowBrowserNotification({ preferences, category, scope = globalThis } = {}) {
  const setting = categorySetting[category];
  return Boolean(
    setting
      && preferences?.desktop === true
      && preferences?.[setting] !== false
      && browserNotificationPermission(scope) === "granted"
      && !pageIsFocused(scope),
  );
}

export function notificationCopy({ category, title, body, privateMode = false } = {}) {
  if (!privateMode) return { title: title || "Lumina", body: body || "You have new activity." };
  if (category === "messages") return { title: "New message", body: "Open Lumina to view it." };
  if (category === "calls") return { title: "Incoming call", body: "Open Lumina to respond." };
  return { title: "New activity", body: "Open Lumina to view it." };
}

export function showBrowserNotification({ preferences, category, title, body, tag, scope = globalThis } = {}) {
  if (!browserNotificationSupport(scope)) return { shown: false, reason: "unsupported" };
  if (!shouldShowBrowserNotification({ preferences, category, scope })) return { shown: false, reason: "disabled" };

  try {
    const copy = notificationCopy({ category, title, body, privateMode: preferences?.privateMode === true });
    const notification = new scope.Notification(copy.title, {
      body: copy.body,
      tag,
      silent: preferences?.sound === false,
    });
    return { shown: true, notification };
  } catch {
    return { shown: false, reason: "unavailable" };
  }
}

// This is deliberately only a capability boundary. A real subscription needs a
// service worker endpoint and a server-side VAPID configuration, neither of which
// should be invented in the client.
export const webPush = {
  supported(scope = globalThis) {
    return Boolean(scope?.navigator?.serviceWorker && scope?.PushManager);
  },
  async status(scope = globalThis) {
    return {
      supported: this.supported(scope),
      configured: false,
      subscribed: false,
    };
  },
};
