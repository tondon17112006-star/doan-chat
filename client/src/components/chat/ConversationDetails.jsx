import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  HiBell,
  HiChevronDown,
  HiMagnifyingGlass,
  HiNoSymbol,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBellSlash,
  HiOutlineDocument,
  HiOutlineLink,
  HiOutlinePhoto,
  HiOutlinePhone,
  HiOutlineUserPlus,
  HiOutlineVideoCamera,
  HiTrash,
  HiUsers,
} from "react-icons/hi2";
import Avatar from "../common/Avatar.jsx";
import Modal from "../common/Modal.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import { SecureImage, SecureVideo, downloadPrivateUpload } from "../../hooks/usePrivateUploadUrl.jsx";
import { formatAttachmentBytes, getSharedItems } from "../../utils/conversationShared.js";

export default function ConversationDetails({ conversation, otherUser, onCall }) {
  const [muted, setMuted] = useState(conversation.muted);
  const [openSection, setOpenSection] = useState("members");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const setDetailOpen = useUiStore((state) => state.setDetailOpen);
  const participantIds = conversation.participants?.map(String) || [];
  const adminIds = conversation.admins?.map(String) || [];
  const isGroupAdmin = conversation.type === "group" && adminIds.includes(String(user.id));
  const { data: people = [], isLoading: peopleLoading } = useQuery({
    queryKey: ["users", "add-member"],
    queryFn: () => socialApi.users(),
    enabled: memberDialogOpen && isGroupAdmin,
  });
  const {
    data: sharedTimeline,
    isLoading: sharedLoading,
    isError: sharedError,
  } = useQuery({
    queryKey: ["messages", conversation.id, "shared"],
    queryFn: () => chatApi.messages(conversation.id, { limit: 100 }),
    enabled: Boolean(conversation.id),
  });

  const shared = useMemo(() => getSharedItems(sharedTimeline?.messages || []), [sharedTimeline?.messages]);
  const title = conversation.type === "group" ? `${participantIds.length} members` : otherUser?.bio || "Connected on Lumina";
  const candidates = people.filter((person) => !participantIds.includes(String(person.id)));

  function refreshConversation(updated) {
    if (updated?.id) queryClient.setQueryData(["conversation", conversation.id], updated);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["conversation", conversation.id] });
  }

  const updateMutation = useMutation({
    mutationFn: (payload) => chatApi.updateConversation(conversation.id, payload),
    onMutate: () => setError(""),
    onSuccess: refreshConversation,
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update this conversation."),
  });
  const groupMutation = useMutation({
    mutationFn: (payload) => chatApi.updateConversation(conversation.id, payload),
    onMutate: () => setError(""),
    onSuccess: refreshConversation,
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update group members."),
  });
  const removeMutation = useMutation({
    mutationFn: () => (conversation.type === "group" ? chatApi.leaveConversation(conversation.id) : chatApi.deleteConversation(conversation.id)),
    onMutate: () => setError(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["conversation", conversation.id] });
      queryClient.removeQueries({ queryKey: ["messages", conversation.id] });
      setDetailOpen(false);
      navigate("/chat");
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update this conversation."),
  });
  const blockMutation = useMutation({
    mutationFn: () => socialApi.friendAction(otherUser.id, "block"),
    onMutate: () => setError(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not block this person."),
  });

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    updateMutation.mutate({ muted: nextMuted }, { onError: () => setMuted(!nextMuted) });
  }

  function addMember(memberId) {
    groupMutation.mutate({ participants: [...participantIds, String(memberId)] }, { onSuccess: (updated) => {
      setMemberDialogOpen(false);
      refreshConversation(updated);
    } });
  }

  function changeAdmin(memberId, promote) {
    const member = String(memberId);
    if (!promote && adminIds.length <= 1) {
      setError("A group must keep at least one admin.");
      return;
    }
    const admins = promote ? [...new Set([...adminIds, member])] : adminIds.filter((id) => id !== member);
    groupMutation.mutate({ admins });
  }

  function removeGroupMember(memberId) {
    const member = String(memberId);
    if (member === String(user.id)) {
      setError("Use Leave group to remove yourself.");
      return;
    }
    groupMutation.mutate({
      participants: participantIds.filter((id) => id !== member),
      admins: adminIds.filter((id) => id !== member),
    });
  }

  return (
    <aside className="conversation-details">
      <div className="detail-profile">
        <Avatar src={conversation.avatar} name={conversation.name} group={conversation.type === "group"} user={conversation.type === "ai" ? { role: "assistant" } : otherUser} size="xl" online={otherUser?.isOnline} />
        <h2>{conversation.name}</h2>
        <p>{title}</p>
        <div className="detail-quick-actions">
          <button type="button" onClick={() => onCall("voice")}><span><HiOutlinePhone /></span><small>Audio</small></button>
          <button type="button" onClick={() => onCall("video")}><span><HiOutlineVideoCamera /></span><small>Video</small></button>
          <button type="button" onClick={toggleMute} disabled={updateMutation.isPending}><span>{muted ? <HiOutlineBellSlash /> : <HiBell />}</span><small>{muted ? "Unmute" : "Mute"}</small></button>
          <button type="button" onClick={() => setSearchOpen(true)}><span><HiMagnifyingGlass /></span><small>Search</small></button>
        </div>
      </div>

      <div className="detail-sections">
        {conversation.type === "group" && (
          <DetailSection title="Members" icon={<HiUsers />} open={openSection === "members"} onToggle={() => setOpenSection(openSection === "members" ? "" : "members")}>
            <div className="member-list">
              {conversation.participantUsers?.map((member) => {
                const memberIsAdmin = adminIds.includes(String(member.id));
                const isCurrentUser = String(member.id) === String(user.id);
                return (
                  <div className="member-row" key={member.id}>
                    <Avatar user={member} size="sm" />
                    <span><strong>{isCurrentUser ? "You" : member.username}</strong><small>{memberIsAdmin ? "Admin" : member.status || "Member"}</small></span>
                    {isGroupAdmin && (
                      <div className="member-actions">
                        <button type="button" onClick={() => changeAdmin(member.id, !memberIsAdmin)} disabled={groupMutation.isPending || (memberIsAdmin && adminIds.length === 1)}>{memberIsAdmin ? "Remove admin" : "Make admin"}</button>
                        {!isCurrentUser && <button type="button" className="danger" onClick={() => removeGroupMember(member.id)} disabled={groupMutation.isPending}>Remove</button>}
                      </div>
                    )}
                  </div>
                );
              })}
              {isGroupAdmin && <button type="button" className="add-member" onClick={() => setMemberDialogOpen(true)} disabled={groupMutation.isPending}><HiOutlineUserPlus /> {groupMutation.isPending ? "Updating…" : "Add people"}</button>}
            </div>
          </DetailSection>
        )}
        <DetailSection title="Shared media" icon={<HiOutlinePhoto />} badge={shared.media.length} open={openSection === "media"} onToggle={() => setOpenSection(openSection === "media" ? "" : "media")}>
          <SharedStatus loading={sharedLoading} error={sharedError} empty={!shared.media.length} emptyMessage="No photos or videos have been shared yet." />
          {!sharedLoading && !sharedError && shared.media.length > 0 && <div className="shared-grid">{shared.media.map((item) => <SharedMedia key={item.key} item={item} />)}</div>}
        </DetailSection>
        <DetailSection title="Files" icon={<HiOutlineDocument />} badge={shared.files.length} open={openSection === "files"} onToggle={() => setOpenSection(openSection === "files" ? "" : "files")}>
          <SharedStatus loading={sharedLoading} error={sharedError} empty={!shared.files.length} emptyMessage="No files have been shared yet." />
          {!sharedLoading && !sharedError && shared.files.length > 0 && <div className="detail-file-list">{shared.files.map((file) => <button type="button" className="file-card" key={file.key} onClick={() => downloadPrivateUpload(file.url, file.name).catch(() => setError("Could not download this file."))}><span><HiOutlineDocument /></span><div><strong>{file.name}</strong><small>{formatAttachmentBytes(file.size)}</small></div></button>)}</div>}
        </DetailSection>
        <DetailSection title="Links" icon={<HiOutlineLink />} badge={shared.links.length} open={openSection === "links"} onToggle={() => setOpenSection(openSection === "links" ? "" : "links")}>
          <SharedStatus loading={sharedLoading} error={sharedError} empty={!shared.links.length} emptyMessage="No links have been shared yet." />
          {!sharedLoading && !sharedError && shared.links.length > 0 && <div className="detail-link-list">{shared.links.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={link.key}><strong>{link.label}</strong><small>{link.url}</small></a>)}</div>}
        </DetailSection>
      </div>
      {error && <p className="detail-error" role="alert">{error}</p>}
      <div className="detail-danger">
        {conversation.type !== "group" && otherUser && <button type="button" onClick={() => blockMutation.mutate()} disabled={blockMutation.isPending}><HiNoSymbol /> {blockMutation.isPending ? "Blocking…" : `Block ${otherUser.username?.split(" ")[0]}`}</button>}
        <button type="button" onClick={() => setConfirmAction(conversation.type === "group" ? "leave" : "delete")} disabled={removeMutation.isPending}>
          {conversation.type === "group" ? <HiOutlineArrowRightOnRectangle /> : <HiTrash />}
          {conversation.type === "group" ? "Leave group" : "Delete conversation"}
        </button>
      </div>

      <AddMemberDialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} people={candidates} loading={peopleLoading} pending={groupMutation.isPending} error={error} onAdd={addMember} />
      <Modal open={Boolean(confirmAction)} onClose={() => !removeMutation.isPending && setConfirmAction("")} title={confirmAction === "leave" ? "Leave this group?" : "Delete this conversation?"} size="sm" className="confirm-modal">
        <div className="confirm-content">
          <p>{confirmAction === "leave" ? "You will stop receiving messages from this group. If you are the last admin, another member will become admin." : "This conversation will be removed from your inbox only. Other participants will keep their messages."}</p>
          <div><button type="button" onClick={() => setConfirmAction("")} disabled={removeMutation.isPending}>Cancel</button><button type="button" className="danger" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>{removeMutation.isPending ? "Working…" : confirmAction === "leave" ? "Leave group" : "Delete"}</button></div>
        </div>
      </Modal>
    </aside>
  );
}

function AddMemberDialog({ open, onClose, people, loading, pending, error, onAdd }) {
  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Add people" size="sm" className="add-member-modal">
      <div className="modal-user-list">
        {loading && <p className="modal-empty" role="status">Loading people…</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        {!loading && !people.length && <p className="modal-empty">Everyone available is already in this group.</p>}
        {!loading && people.map((person) => <button type="button" key={person.id} onClick={() => onAdd(person.id)} disabled={pending}><Avatar user={person} size="sm" /><span><strong>{person.username}</strong><small>{person.status || person.email}</small></span><HiOutlineUserPlus /></button>)}
      </div>
    </Modal>
  );
}

function SharedMedia({ item }) {
  return <div className="shared-media-item">{item.type.startsWith("video/") ? <SecureVideo src={item.url} controls preload="metadata" /> : <SecureImage src={item.url} alt={item.name || "Shared image"} loading="lazy" />}</div>;
}

function SharedStatus({ loading, error, empty, emptyMessage }) {
  if (loading) return <p className="detail-empty" role="status">Loading shared items…</p>;
  if (error) return <p className="detail-error" role="alert">Could not load shared items.</p>;
  if (empty) return <p className="detail-empty">{emptyMessage}</p>;
  return null;
}

function DetailSection({ title, icon, badge, open, onToggle, children }) {
  return <section className={`detail-section ${open ? "open" : ""}`}><button type="button" onClick={onToggle}><span>{icon}{title}</span><span>{badge ? <b>{badge}</b> : null}{children ? <HiChevronDown /> : null}</span></button>{open && children}</section>;
}
