// File: client/src/components/modals/NewChatModal.jsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HiCheck, HiMagnifyingGlass, HiOutlineUserGroup, HiUsers } from "react-icons/hi2";
import Modal from "../common/Modal.jsx";
import Avatar from "../common/Avatar.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useUiStore } from "../../store/uiStore.js";
import { useDebounce } from "../../hooks/useDebounce.js";

export default function NewChatModal() {
  const open = useUiStore((state) => state.newChatOpen);
  const setOpen = useUiStore((state) => state.setNewChatOpen);
  const forwardingMessage = useUiStore((state) => state.forwardingMessage);
  const setForwardingMessage = useUiStore((state) => state.setForwardingMessage);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const debounced = useDebounce(query);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ["users", debounced], queryFn: () => socialApi.users(debounced), enabled: open });
  const mutation = useMutation({
    mutationFn: (payload) => chatApi.createConversation(payload),
    onSuccess: async (conversation) => {
      if (forwardingMessage) {
        await chatApi.send(conversation.id, {
          type: forwardingMessage.type,
          content: forwardingMessage.content,
          attachments: forwardingMessage.attachments || [],
          forwardedFrom: forwardingMessage.id
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      close();
      navigate(`/chat/${conversation.id}`);
    }
  });

  function close() {
    setOpen(false);
    setSelected([]);
    setQuery("");
    setGroupName("");
    setGroupMode(false);
    setForwardingMessage(null);
  }
  function toggle(person) {
    if (!groupMode) {
      mutation.mutate({ type: "direct", participants: [person.id] });
      return;
    }
    setSelected((current) => current.some((item) => item.id === person.id) ? current.filter((item) => item.id !== person.id) : [...current, person]);
  }
  function create() {
    mutation.mutate({ type: "group", name: groupName || selected.map((item) => item.username.split(" ")[0]).join(", "), participants: selected.map((item) => item.id) });
  }

  return (
    <Modal open={open} onClose={close} title={forwardingMessage ? "Forward message" : groupMode ? "Create a group" : "New message"}>
      <div className="new-chat-modal">
        {forwardingMessage && <div className="forward-preview"><HiOutlineUserGroup /><span><strong>Forwarding</strong><small>{forwardingMessage.content || forwardingMessage.attachments?.[0]?.name || "Attachment"}</small></span></div>}
        <button type="button" className={`group-mode-button ${groupMode ? "active" : ""}`} onClick={() => setGroupMode((value) => !value)}>
          <span><HiOutlineUserGroup /></span>
          <div><strong>New group conversation</strong><small>Bring a few people together</small></div>
          {groupMode && <HiCheck />}
        </button>
        {groupMode && selected.length > 0 && (
          <div className="selected-people">
            {selected.map((person) => <button type="button" key={person.id} onClick={() => toggle(person)}><Avatar user={person} size="sm" /><span>{person.username.split(" ")[0]}</span></button>)}
          </div>
        )}
        {groupMode && (
          <label className="group-name-input"><span>Group name</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Weekend plans" /></label>
        )}
        <div className="modal-search"><HiMagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" /></div>
        <div className="modal-user-list">
          {users.map((person) => {
            const checked = selected.some((item) => item.id === person.id);
            return (
              <button type="button" key={person.id} onClick={() => toggle(person)} className={checked ? "selected" : ""}>
                <Avatar user={person} size="md" />
                <span><strong>{person.username}</strong><small>{person.status || person.email}</small></span>
                {groupMode ? <i className="select-circle">{checked && <HiCheck />}</i> : <span className="start-chat">Message</span>}
              </button>
            );
          })}
        </div>
        {groupMode && <button type="button" className="primary-button" disabled={selected.length < 2 || mutation.isPending} onClick={create}><HiUsers /> Create group with {selected.length} people</button>}
      </div>
    </Modal>
  );
}
