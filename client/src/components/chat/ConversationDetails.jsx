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
  const isGroupAdmin = conversation.type === "group" && conversation.admins?.map(String).includes(String(user.id));
  const { data: people = [], isLoading: peopleLoading } = useQuery({
    queryKey: ["users", "add-member"],
    queryFn: () => socialApi.users(),
    enabled: memberDialogOpen && isGroupAdmin,
  });

  const refreshConversation = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["conversation", conversation.id] });
  };
  const updateMutation = useMutation({
    mutationFn: (payload) => chatApi.updateConversation(conversation.id, payload),
    onMutate: () => setError(""),
    onSuccess: refreshConversation,
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update this conversation."),
  });
  const addMemberMutation = useMutation({
    mutationFn: (memberId) => chatApi.updateConversation(conversation.id, { participants: [...conversation.participants, memberId] }),
    onMutate: () => setError(""),
    onSuccess: () => {
      setMemberDialogOpen(false);
      refreshConversation();
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not add that member."),
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

  const shared = useMemo(() => ({ media: 8, files: 3, links: 5 }), []);
  const title = conversation.type === "group" ? `${conversation.participants.length} members` : otherUser?.bio || "Connected on Lumina";
  const candidates = people.filter((person) => !conversation.participants.map(String).includes(String(person.id)));

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    updateMutation.mutate({ muted: nextMuted }, { onError: () => setMuted(!nextMuted) });
  }

  function confirmRemoval() {
    removeMutation.mutate();
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
              {conversation.participantUsers?.map((member) => (
                <div className="member-row" key={member.id}>
                  <Avatar user={member} size="sm" />
                  <span><strong>{member.id === user.id ? "You" : member.username}</strong><small>{conversation.admins?.map(String).includes(String(member.id)) ? "Admin" : member.status}</small></span>
                </div>
              ))}
              {isGroupAdmin && <button type="button" className="add-member" onClick={() => setMemberDialogOpen(true)}><HiOutlineUserPlus /> Add people</button>}
            </div>
          </DetailSection>
        )}
        <DetailSection title="Shared media" icon={<HiOutlinePhoto />} badge={shared.media} open={openSection === "media"} onToggle={() => setOpenSection(openSection === "media" ? "" : "media")}>
          <div className="shared-grid">
            {[
              "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=300&q=70",
              "https://images.unsplash.com/photo-1507525428034-b723cf4d019e?auto=format&fit=crop&w=300&q=70",
              "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=300&q=70",
            ].map((source) => <img key={source} src={source} alt="" loading="lazy" />)}
          </div>
        </DetailSection>
        <DetailSection title="Files" icon={<HiOutlineDocument />} badge={shared.files} />
        <DetailSection title="Links" icon={<HiOutlineLink />} badge={shared.links} />
      </div>
      {error && <p className="detail-error" role="alert">{error}</p>}
      <div className="detail-danger">
        {conversation.type !== "group" && otherUser && <button type="button" onClick={() => blockMutation.mutate()} disabled={blockMutation.isPending}><HiNoSymbol /> {blockMutation.isPending ? "Blocking…" : `Block ${otherUser.username?.split(" ")[0]}`}</button>}
        <button type="button" onClick={() => setConfirmAction(conversation.type === "group" ? "leave" : "delete")} disabled={removeMutation.isPending}>
          {conversation.type === "group" ? <HiOutlineArrowRightOnRectangle /> : <HiTrash />}
          {conversation.type === "group" ? "Leave group" : "Delete conversation"}
        </button>
      </div>

      <AddMemberDialog
        open={memberDialogOpen}
        onClose={() => setMemberDialogOpen(false)}
        people={candidates}
        loading={peopleLoading}
        pending={addMemberMutation.isPending}
        error={error}
        onAdd={(memberId) => addMemberMutation.mutate(memberId)}
      />
      <Modal open={Boolean(confirmAction)} onClose={() => !removeMutation.isPending && setConfirmAction("")} title={confirmAction === "leave" ? "Leave this group?" : "Delete this conversation?"} size="sm" className="confirm-modal">
        <div className="confirm-content">
          <p>{confirmAction === "leave" ? "You will stop receiving messages from this group. If you are the last admin, another member will become admin." : "This conversation will be removed from your inbox only. Other participants will keep their messages."}</p>
          <div><button type="button" onClick={() => setConfirmAction("")} disabled={removeMutation.isPending}>Cancel</button><button type="button" className="danger" onClick={confirmRemoval} disabled={removeMutation.isPending}>{removeMutation.isPending ? "Working…" : confirmAction === "leave" ? "Leave group" : "Delete"}</button></div>
        </div>
      </Modal>
    </aside>
  );
}

function AddMemberDialog({ open, onClose, people, loading, pending, error, onAdd }) {
  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Add people" size="sm" className="add-member-modal">
      <div className="modal-user-list">
        {loading && <p className="modal-empty">Loading people…</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        {!loading && !people.length && <p className="modal-empty">Everyone available is already in this group.</p>}
        {!loading && people.map((person) => (
          <button type="button" key={person.id} onClick={() => onAdd(person.id)} disabled={pending}>
            <Avatar user={person} size="sm" />
            <span><strong>{person.username}</strong><small>{person.status || person.email}</small></span>
            <HiOutlineUserPlus />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DetailSection({ title, icon, badge, open, onToggle, children }) {
  return (
    <section className={`detail-section ${open ? "open" : ""}`}>
      <button type="button" onClick={onToggle}>
        <span>{icon}{title}</span>
        <span>{badge ? <b>{badge}</b> : null}{children ? <HiChevronDown /> : null}</span>
      </button>
      {open && children}
    </section>
  );
}
