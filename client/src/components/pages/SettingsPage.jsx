// File: client/src/components/pages/SettingsPage.jsx
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiBell,
  HiCheck,
  HiComputerDesktop,
  HiKey,
  HiLanguage,
  HiMoon,
  HiPaintBrush,
  HiShieldCheck,
  HiSun,
  HiUserCircle
} from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { authApi, chatApi, socialApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import { browserNotificationPermission, browserNotificationSupport, requestBrowserNotificationPermission } from "../../utils/browserNotifications.js";

const nav = [
  { id: "profile", label: "Profile", icon: <HiUserCircle /> },
  { id: "appearance", label: "Appearance", icon: <HiPaintBrush /> },
  { id: "notifications", label: "Notifications", icon: <HiBell /> },
  { id: "privacy", label: "Privacy & safety", icon: <HiShieldCheck /> },
  { id: "security", label: "Password & devices", icon: <HiKey /> },
  { id: "language", label: "Language", icon: <HiLanguage /> }
];

const notificationDefaults = { messages: true, calls: true, friendRequests: true, sound: true, desktop: false, privateMode: false };

export default function SettingsPage() {
  const [section, setSection] = useState("profile");
  const [saved, setSaved] = useState(false);
  const user = useAuthStore((state) => state.user);
  const patchUser = useAuthStore((state) => state.patchUser);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { data: settings, isLoading: settingsLoading, isError: settingsIsError, error: settingsQueryError } = useQuery({ queryKey: ["settings"], queryFn: socialApi.settings });
  const [form, setForm] = useState({ username: user.username, bio: user.bio || "", status: user.status || "", location: user.location || "" });
  const [prefs, setPrefs] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [browserPermission, setBrowserPermission] = useState(() => browserNotificationPermission());
  const avatarInputRef = useRef(null);
  const profileMutation = useMutation({
    mutationFn: socialApi.updateProfile,
    onMutate: () => setProfileError(""),
    onSuccess: (updated) => {
      patchUser(updated);
      flashSaved();
    },
    onError: (requestError) => setProfileError(requestError.response?.data?.message || "Could not save your profile."),
  });
  const avatarMutation = useMutation({
    mutationFn: async (file) => {
      const [uploaded] = await chatApi.upload([file], "avatar");
      return socialApi.updateProfile({ avatar: uploaded.url });
    },
    onMutate: () => setProfileError(""),
    onSuccess: (updated) => {
      patchUser(updated);
      flashSaved();
    },
    onError: (requestError) => setProfileError(requestError.response?.data?.message || "Could not upload your profile photo."),
  });
  const settingsMutation = useMutation({
    mutationFn: socialApi.saveSettings,
    onMutate: () => setSettingsError(""),
    onSuccess: (updated) => {
      setPrefs(updated);
      queryClient.setQueryData(["settings"], updated);
      flashSaved();
    },
    onError: (requestError) => setSettingsError(requestError.response?.data?.message || "Could not save your settings."),
  });

  useEffect(() => {
    if (!settings) return;
    setPrefs({ ...settings, notifications: { ...notificationDefaults, ...settings.notifications } });
  }, [settings]);
  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1_600);
  }
  function updatePref(path, value) {
    const [group, key] = path.split(".");
    setPrefs((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  }
  async function changeDesktopNotifications(enabled) {
    setSettingsError("");
    if (!enabled) return updatePref("notifications.desktop", false);
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission !== "granted") {
      updatePref("notifications.desktop", false);
      return setSettingsError(
        permission === "unsupported"
          ? "This browser does not support desktop notifications."
          : "Browser notification permission was not granted. You can change it in your browser settings.",
      );
    }
    updatePref("notifications.desktop", true);
  }
  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProfileError("Choose an image file for your profile photo.");
    if (file.size > 10 * 1024 * 1024) return setProfileError("Your profile photo must be 10 MB or smaller.");
    avatarMutation.mutate(file);
  }

  return (
    <PageFrame eyebrow="Make it yours" title="Settings" subtitle="Tune Lumina to feel just right." searchable={false}>
      <div className="settings-layout">
        <nav className="settings-nav">
          {nav.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>{item.icon}{item.label}</button>)}
        </nav>
        <section className="settings-panel">
          {settingsLoading && <p className="settings-loading" role="status">Loading your settings…</p>}
          {(settingsIsError || settingsError) && <p className="settings-error" role="alert">{settingsError || settingsQueryError?.response?.data?.message || "Could not load your settings."}</p>}
          {section === "profile" && (
            <>
              <SettingsHeading title="Your profile" subtitle="This is how you appear to people on Lumina." />
              <div className="profile-photo-setting"><Avatar user={user} size="xl" /><div><input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={chooseAvatar} /><button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending}>{avatarMutation.isPending ? "Uploading…" : "Change photo"}</button><span>JPG, PNG, WEBP or GIF · Max 10 MB</span></div></div>
              {profileError && <p className="settings-error" role="alert">{profileError}</p>}
              <div className="settings-form-grid">
                <label><span>Display name</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
                <label><span>Status</span><input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} /></label>
                <label className="full"><span>Bio</span><textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength={280} /></label>
                <label className="full"><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
              </div>
              <SaveBar saved={saved} pending={profileMutation.isPending} onSave={() => profileMutation.mutate(form)} />
            </>
          )}
          {section === "appearance" && prefs && (
            <>
              <SettingsHeading title="Appearance" subtitle="Choose how Lumina looks on this device." />
              <div className="theme-cards">
                {[["light", "Light", <HiSun />], ["dark", "Dark", <HiMoon />], ["system", "System", <HiComputerDesktop />]].map(([id, label, icon]) => (
                  <button key={id} type="button" className={theme === id ? "active" : ""} onClick={() => { setTheme(id); setPrefs({ ...prefs, theme: id }); settingsMutation.mutate({ theme: id }); }}>
                    <span className={`theme-preview preview-${id}`}><i /><i /><b /></span>
                    <span>{icon}{label}{theme === id && <HiCheck />}</span>
                  </button>
                ))}
              </div>
              <SettingsHeading title="Chat wallpaper" subtitle="A subtle backdrop for every conversation." small />
              <div className="wallpaper-grid">{["aurora", "mist", "blush", "night", "paper"].map((wallpaper) => <button key={wallpaper} type="button" className={`wallpaper wallpaper-${wallpaper} ${prefs?.chatWallpaper === wallpaper ? "active" : ""}`} onClick={() => { setPrefs({ ...prefs, chatWallpaper: wallpaper }); settingsMutation.mutate({ chatWallpaper: wallpaper }); }}><span>{wallpaper}</span></button>)}</div>
            </>
          )}
          {section === "notifications" && prefs && (
            <>
              <SettingsHeading title="Notifications" subtitle="Decide what deserves your attention." />
              <ToggleRow title="New messages" description="Show a notification when someone messages you." checked={prefs.notifications.messages} onChange={(value) => updatePref("notifications.messages", value)} />
              <ToggleRow title="Incoming calls" description="Ring for voice and video calls." checked={prefs.notifications.calls} onChange={(value) => updatePref("notifications.calls", value)} />
              <ToggleRow title="Friend requests" description="Let you know about new requests." checked={prefs.notifications.friendRequests} onChange={(value) => updatePref("notifications.friendRequests", value)} />
              <ToggleRow title="Sound" description="Allow the browser sound for an eligible desktop notification." checked={prefs.notifications.sound} onChange={(value) => updatePref("notifications.sound", value)} />
              <ToggleRow title="Desktop notifications" description="Ask this browser for permission, then alert only while Lumina is not focused." checked={prefs.notifications.desktop} onChange={changeDesktopNotifications} />
              <ToggleRow title="Private notification previews" description="Hide names and message text in browser notifications on this device." checked={prefs.notifications.privateMode} onChange={(value) => updatePref("notifications.privateMode", value)} />
              <p className="settings-note">Browser permission: {browserPermission === "granted" ? "allowed" : browserPermission === "default" ? "not requested" : browserPermission === "unsupported" ? "not supported" : "blocked"}. {browserNotificationSupport() ? "Web Push is prepared but needs server configuration before it can deliver notifications while the app is closed." : "Use a browser that supports notifications to receive desktop alerts."}</p>
              <SaveBar saved={saved} pending={settingsMutation.isPending} onSave={() => settingsMutation.mutate({ notifications: prefs.notifications })} />
            </>
          )}
          {section === "privacy" && prefs && (
            <>
              <SettingsHeading title="Privacy & safety" subtitle="Keep your presence and conversations comfortable." />
              <ToggleRow title="Read receipts" description="Let people know when you’ve read a message." checked={prefs.privacy.readReceipts} onChange={(value) => updatePref("privacy.readReceipts", value)} />
              <SelectRow title="Who can see your last seen" value={prefs.privacy.lastSeen} onChange={(value) => updatePref("privacy.lastSeen", value)} />
              <SelectRow title="Who can see your profile photo" value={prefs.privacy.profilePhoto} onChange={(value) => updatePref("privacy.profilePhoto", value)} />
              <SaveBar saved={saved} pending={settingsMutation.isPending} onSave={() => settingsMutation.mutate({ privacy: prefs.privacy })} />
            </>
          )}
          {section === "security" && <SecuritySettings />}
          {section === "language" && prefs && (
            <>
              <SettingsHeading title="Language & region" subtitle="Choose the language used throughout Lumina." />
              <SelectRow title="Display language" value={prefs.language || "en"} options={[["en", "English"], ["vi", "Tiếng Việt"], ["es", "Español"], ["fr", "Français"]]} onChange={(value) => { setPrefs({ ...prefs, language: value }); settingsMutation.mutate({ language: value }); }} />
              <p className="settings-note">The preference is saved now. Full interface translation is not available yet.</p>
            </>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function SettingsHeading({ title, subtitle, small }) {
  return <div className={`settings-heading ${small ? "small" : ""}`}><h2>{title}</h2><p>{subtitle}</p></div>;
}
function ToggleRow({ title, description, checked, onChange }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div><button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><i /></button></div>;
}
function SelectRow({ title, value, onChange, options = [["everyone", "Everyone"], ["friends", "Friends"], ["nobody", "Nobody"]] }) {
  return <div className="setting-row"><div><strong>{title}</strong></div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>;
}
function SaveBar({ saved, pending, onSave }) {
  return <div className="save-bar"><span>{saved && <><HiCheck /> Changes saved</>}</span><button type="button" className="primary-button compact" onClick={onSave} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>;
}
function SecuritySettings() {
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const patchUser = useAuthStore((state) => state.patchUser);
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["auth-sessions"], queryFn: authApi.sessions });
  const passwordMutation = useMutation({
    mutationFn: authApi.changePassword,
    onMutate: () => setError(""),
    onSuccess: (result) => {
      patchUser(result.user);
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setChangingPassword(false);
      queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update your password."),
  });
  const revokeMutation = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-sessions"] }),
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not sign out that device."),
  });
  const logoutOthersMutation = useMutation({
    mutationFn: authApi.logoutOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-sessions"] }),
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not sign out the other devices."),
  });
  const hasOtherSessions = sessions.some((session) => !session.isCurrent);

  function submitPassword(event) {
    event.preventDefault();
    if (passwords.newPassword.length < 8) return setError("Use at least 8 characters for your new password.");
    if (passwords.currentPassword === passwords.newPassword) return setError("Your new password must be different from your current password.");
    if (passwords.newPassword !== passwords.confirmPassword) return setError("The password confirmation does not match.");
    passwordMutation.mutate({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
  }

  return (
    <>
      <SettingsHeading title="Password & devices" subtitle="Protect your account and review active sessions." />
      <div className="security-card"><span><HiKey /></span><div><strong>Password</strong><p>Use a unique password with at least 8 characters.</p></div><button type="button" onClick={() => { setChangingPassword((current) => !current); setError(""); }}>{changingPassword ? "Cancel" : "Change password"}</button></div>
      {changingPassword && (
        <form className="security-password-form" onSubmit={submitPassword}>
          <label><span>Current password</span><input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required maxLength={128} /></label>
          <label><span>New password</span><input type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required minLength={8} maxLength={128} /></label>
          <label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} required minLength={8} maxLength={128} /></label>
          <button type="submit" className="primary-button compact" disabled={passwordMutation.isPending}>{passwordMutation.isPending ? "Updating…" : "Update password"}</button>
        </form>
      )}
      {error && <p className="security-error" role="alert">{error}</p>}
      <SettingsHeading title="Active devices" subtitle="You’re currently signed in on these devices." small />
      <div className="device-list">
        {isLoading && <div className="device-card"><span><HiComputerDesktop /></span><div><strong>Loading devices…</strong></div></div>}
        {!isLoading && sessions.map((session) => (
          <div className="device-card" key={session.id}>
            <span><HiComputerDesktop /></span>
            <div><strong>{session.name || "Web browser"}</strong><p>{session.platform || "web"} · {session.isCurrent ? "Active now" : `Last active ${formatSessionTime(session.lastActiveAt)}`}{session.ip ? ` · ${session.ip}` : ""}</p></div>
            {session.isCurrent ? <b>Current</b> : <button type="button" className="device-signout" onClick={() => revokeMutation.mutate(session.id)} disabled={revokeMutation.isPending}>Sign out</button>}
          </div>
        ))}
        {!isLoading && !sessions.length && <p className="security-empty">No active sessions were found.</p>}
      </div>
      <button type="button" className="outline-danger" onClick={() => logoutOthersMutation.mutate()} disabled={!hasOtherSessions || logoutOthersMutation.isPending}>{logoutOthersMutation.isPending ? "Signing out…" : "Sign out of all other devices"}</button>
    </>
  );
}

function formatSessionTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value || 0).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
