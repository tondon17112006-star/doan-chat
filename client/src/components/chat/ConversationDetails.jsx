// File: client/src/components/chat/ConversationDetails.jsx
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HiBell,
  HiChevronDown,
  HiMagnifyingGlass,
  HiNoSymbol,
  HiOutlineBellSlash,
  HiOutlineDocument,
  HiOutlineLink,
  HiOutlinePhoto,
  HiOutlinePhone,
  HiOutlineUserPlus,
  HiOutlineVideoCamera,
  HiTrash,
  HiUsers
} from "react-icons/hi2";
import Avatar from "../common/Avatar.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";

export default function ConversationDetails({ conversation, otherUser, onCall }) {
  const [muted, setMuted] = useState(conversation.muted);
  const [openSection, setOpenSection] = useState("members");
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const updateMutation = useMutation({
    mutationFn: (payload) => chatApi.updateConversation(conversation.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] })
  });

  const shared = useMemo(() => ({ media: 8, files: 3, links: 5 }), []);
  const title = conversation.type === "group" ? `${conversation.participants.length} members` : otherUser?.bio || "Connected on Lumina";

  function toggleMute() {
    setMuted((value) => !value);
    updateMutation.mutate({ muted: !muted });
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
          <button type="button" onClick={toggleMute}><span>{muted ? <HiOutlineBellSlash /> : <HiBell />}</span><small>{muted ? "Unmute" : "Mute"}</small></button>
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
                  <span><strong>{member.id === user.id ? "You" : member.username}</strong><small>{conversation.admins?.includes(member.id) ? "Admin" : member.status}</small></span>
                </div>
              ))}
              <button type="button" className="add-member"><HiOutlineUserPlus /> Add people</button>
            </div>
          </DetailSection>
        )}
        <DetailSection title="Shared media" icon={<HiOutlinePhoto />} badge={shared.media} open={openSection === "media"} onToggle={() => setOpenSection(openSection === "media" ? "" : "media")}>
          <div className="shared-grid">
            {[
              "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=300&q=70",
              "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=70",
              "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=300&q=70"
            ].map((source) => <img key={source} src={source} alt="" loading="lazy" />)}
          </div>
        </DetailSection>
        <DetailSection title="Files" icon={<HiOutlineDocument />} badge={shared.files} />
        <DetailSection title="Links" icon={<HiOutlineLink />} badge={shared.links} />
      </div>
      <div className="detail-danger">
        {conversation.type !== "group" && <button type="button" onClick={() => socialApi.friendAction(otherUser.id, "block")}><HiNoSymbol /> Block {otherUser?.username?.split(" ")[0]}</button>}
        <button type="button"><HiTrash /> Delete conversation</button>
      </div>
    </aside>
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
