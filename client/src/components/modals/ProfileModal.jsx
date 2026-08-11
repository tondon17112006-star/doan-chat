// File: client/src/components/modals/ProfileModal.jsx
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { HiArrowRightOnRectangle, HiCamera, HiCheck, HiMapPin, HiPencilSquare } from "react-icons/hi2";
import Modal from "../common/Modal.jsx";
import Avatar from "../common/Avatar.jsx";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import { authApi, chatApi, socialApi } from "../../services/api.js";
import { disconnectSocket } from "../../services/socket.js";

export default function ProfileModal() {
  const open = useUiStore((state) => state.profileOpen);
  const setOpen = useUiStore((state) => state.setProfileOpen);
  const user = useAuthStore((state) => state.user);
  const patchUser = useAuthStore((state) => state.patchUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: user.username, bio: user.bio || "", status: user.status || "", location: user.location || "" });
  const [error, setError] = useState("");
  const avatarInputRef = useRef(null);
  const mutation = useMutation({
    mutationFn: socialApi.updateProfile,
    onSuccess: (updated) => {
      patchUser(updated);
      setEditing(false);
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not save your profile."),
  });
  const avatarMutation = useMutation({
    mutationFn: async (file) => {
      const [uploaded] = await chatApi.upload([file], "avatar");
      return socialApi.updateProfile({ avatar: uploaded.url });
    },
    onMutate: () => setError(""),
    onSuccess: patchUser,
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not upload your profile photo."),
  });
  useEffect(() => setForm({ username: user.username, bio: user.bio || "", status: user.status || "", location: user.location || "" }), [user]);

  async function logout() {
    await authApi.logout().catch(() => undefined);
    disconnectSocket();
    clearSession();
    setOpen(false);
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file for your profile photo.");
    if (file.size > 10 * 1024 * 1024) return setError("Your profile photo must be 10 MB or smaller.");
    avatarMutation.mutate(file);
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="sm" className="profile-modal-card">
      <div className="profile-cover">
        <div className="cover-glow" />
        <button type="button" aria-label="Change cover"><HiCamera /></button>
      </div>
      <div className="profile-modal-body">
        <div className="profile-avatar-wrap"><Avatar user={user} size="xxl" online /><input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={chooseAvatar} /><button type="button" aria-label="Change profile photo" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending}><HiCamera /></button></div>
        {!editing ? (
          <>
            <h2>{user.username}</h2>
            <p className="profile-status"><i /> {user.status}</p>
            <p className="profile-bio">{user.bio}</p>
            <p className="profile-location"><HiMapPin /> {user.location}</p>
            <button type="button" className="profile-edit-button" onClick={() => setEditing(true)}><HiPencilSquare /> Edit profile</button>
            <button type="button" className="profile-logout-button" onClick={logout}><HiArrowRightOnRectangle /> Sign out</button>
          </>
        ) : (
          <div className="profile-edit-form">
            <label><span>Name</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
            <label><span>Status</span><input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} /></label>
            <label><span>Bio</span><textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
            <label><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
            <div><button type="button" onClick={() => setEditing(false)} disabled={mutation.isPending}>Cancel</button><button type="button" className="primary-button compact" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}><HiCheck /> {mutation.isPending ? "Saving…" : "Save"}</button></div>
          </div>
        )}
        {error && <p className="profile-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
