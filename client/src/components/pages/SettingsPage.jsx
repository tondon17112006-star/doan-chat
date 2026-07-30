// File: client/src/components/pages/SettingsPage.jsx
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { socialApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";

const nav = [
  { id: "profile", label: "Profile", icon: <HiUserCircle /> },
  { id: "appearance", label: "Appearance", icon: <HiPaintBrush /> },
  { id: "notifications", label: "Notifications", icon: <HiBell /> },
  { id: "privacy", label: "Privacy & safety", icon: <HiShieldCheck /> },
  { id: "security", label: "Password & devices", icon: <HiKey /> },
  { id: "language", label: "Language", icon: <HiLanguage /> }
];

export default function SettingsPage() {
  const [section, setSection] = useState("profile");
  const [saved, setSaved] = useState(false);
  const user = useAuthStore((state) => state.user);
  const patchUser = useAuthStore((state) => state.patchUser);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: socialApi.settings });
  const [form, setForm] = useState({ username: user.username, bio: user.bio || "", status: user.status || "", location: user.location || "" });
  const [prefs, setPrefs] = useState(null);
  const profileMutation = useMutation({
    mutationFn: socialApi.updateProfile,
    onSuccess: (updated) => {
      patchUser(updated);
      flashSaved();
    }
  });
  const settingsMutation = useMutation({
    mutationFn: socialApi.saveSettings,
    onSuccess: flashSaved
  });

  useEffect(() => setPrefs(settings), [settings]);
  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1_600);
  }
  function updatePref(path, value) {
    const [group, key] = path.split(".");
    setPrefs((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  }

  return (
    <PageFrame eyebrow="Make it yours" title="Settings" subtitle="Tune Lumina to feel just right." searchable={false}>
      <div className="settings-layout">
        <nav className="settings-nav">
          {nav.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>{item.icon}{item.label}</button>)}
        </nav>
        <section className="settings-panel">
          {section === "profile" && (
            <>
              <SettingsHeading title="Your profile" subtitle="This is how you appear to people on Lumina." />
              <div className="profile-photo-setting"><Avatar user={user} size="xl" /><div><button type="button">Change photo</button><span>JPG, PNG or WEBP · Max 10 MB</span></div></div>
              <div className="settings-form-grid">
                <label><span>Display name</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
                <label><span>Status</span><input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} /></label>
                <label className="full"><span>Bio</span><textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength={280} /></label>
                <label className="full"><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
              </div>
              <SaveBar saved={saved} pending={profileMutation.isPending} onSave={() => profileMutation.mutate(form)} />
            </>
          )}
          {section === "appearance" && (
            <>
              <SettingsHeading title="Appearance" subtitle="Choose how Lumina looks on this device." />
              <div className="theme-cards">
                {[["light", "Light", <HiSun />], ["dark", "Dark", <HiMoon />], ["system", "System", <HiComputerDesktop />]].map(([id, label, icon]) => (
                  <button key={id} type="button" className={theme === id ? "active" : ""} onClick={() => { setTheme(id); socialApi.saveSettings({ theme: id }); }}>
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
              <ToggleRow title="Sound" description="Play a gentle sound for new activity." checked={prefs.notifications.sound} onChange={(value) => updatePref("notifications.sound", value)} />
              <ToggleRow title="Desktop notifications" description="Show notifications outside the browser tab." checked={prefs.notifications.desktop} onChange={(value) => updatePref("notifications.desktop", value)} />
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
          {section === "language" && (
            <>
              <SettingsHeading title="Language & region" subtitle="Choose the language used throughout Lumina." />
              <SelectRow title="Display language" value={prefs?.language || "en"} options={[["en", "English"], ["vi", "Tiếng Việt"], ["es", "Español"], ["fr", "Français"]]} onChange={(value) => settingsMutation.mutate({ language: value })} />
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
  return (
    <>
      <SettingsHeading title="Password & devices" subtitle="Protect your account and review active sessions." />
      <div className="security-card"><span><HiKey /></span><div><strong>Password</strong><p>Last changed 3 months ago</p></div><button type="button">Change password</button></div>
      <SettingsHeading title="Active devices" subtitle="You’re currently signed in on these devices." small />
      <div className="device-card"><span><HiComputerDesktop /></span><div><strong>This browser</strong><p>Ho Chi Minh City · Active now</p></div><b>Current</b></div>
      <button type="button" className="outline-danger">Sign out of all other devices</button>
    </>
  );
}
