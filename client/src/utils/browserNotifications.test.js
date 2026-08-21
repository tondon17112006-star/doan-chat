import { describe, expect, it, vi } from "vitest";
import {
  browserNotificationPermission,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  shouldShowBrowserNotification,
} from "./browserNotifications.js";

const enabledPreferences = {
  desktop: true,
  messages: true,
  calls: true,
  friendRequests: true,
  sound: true,
};

function notificationScope({ focused = false, permission = "granted" } = {}) {
  const Notification = vi.fn();
  Notification.permission = permission;
  Notification.requestPermission = vi.fn(async () => "granted");
  return {
    Notification,
    document: { hasFocus: () => focused, hidden: focused },
  };
}

describe("browser notifications", () => {
  it("only shows an enabled category while the page is not focused", () => {
    const scope = notificationScope();
    expect(shouldShowBrowserNotification({ preferences: enabledPreferences, category: "messages", scope })).toBe(true);
    expect(shouldShowBrowserNotification({ preferences: enabledPreferences, category: "messages", scope: notificationScope({ focused: true }) })).toBe(false);
    expect(shouldShowBrowserNotification({ preferences: { ...enabledPreferences, messages: false }, category: "messages", scope })).toBe(false);
  });

  it("uses the browser silent option when sound is disabled and hides private message content", () => {
    const scope = notificationScope();
    const result = showBrowserNotification({
      preferences: { ...enabledPreferences, sound: false, privateMode: true },
      category: "messages",
      title: "Maya",
      body: "A private message",
      scope,
    });
    expect(result.shown).toBe(true);
    expect(scope.Notification).toHaveBeenCalledWith("New message", expect.objectContaining({ body: "Open Lumina to view it.", silent: true }));
  });

  it("falls back safely when the Notification API is unavailable", async () => {
    expect(browserNotificationPermission({})).toBe("unsupported");
    await expect(requestBrowserNotificationPermission({})).resolves.toBe("unsupported");
    expect(showBrowserNotification({ preferences: enabledPreferences, category: "messages", scope: {} })).toEqual({ shown: false, reason: "unsupported" });
  });
});
