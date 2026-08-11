import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HiCheck,
  HiMagnifyingGlass,
  HiNoSymbol,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineUserPlus,
  HiSparkles,
  HiXMark,
} from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useDebounce } from "../../hooks/useDebounce.js";

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const debounced = useDebounce(query);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users", debounced], queryFn: () => socialApi.users(debounced) });
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: socialApi.friends });
  const { data: receivedRequests = [] } = useQuery({ queryKey: ["friend-requests", "received"], queryFn: () => socialApi.friendRequests("received") });
  const friendMutation = useMutation({
    mutationFn: ({ person, action }) => socialApi.friendAction(person.id, action),
    onMutate: () => setError(""),
    onSuccess: () => invalidatePeople(queryClient),
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not update this relationship."),
  });
  const createChat = useMutation({
    mutationFn: (target) => chatApi.createConversation({ type: "direct", participants: [target.id] }),
    onMutate: () => setError(""),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/chat/${conversation.id}`);
    },
    onError: (requestError) => setError(requestError.response?.data?.message || "Could not start this conversation."),
  });
  const suggestions = useMemo(() => users.filter((person) => person.relationship === "none").slice(0, 4), [users]);

  return (
    <PageFrame eyebrow="Connections" title="People" subtitle="Find friends and make room for new conversations.">
      <div className="people-search">
        <HiMagnifyingGlass />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or location" />
      </div>
      {error && <p className="people-error" role="alert">{error}</p>}

      {!query && receivedRequests.length > 0 && (
        <section className="people-section">
          <div className="section-title-row"><div><span className="section-icon coral"><HiOutlineUserPlus /></span><div><h2>Friend requests</h2><p>{receivedRequests.length} waiting for your response</p></div></div></div>
          <div className="people-list">
            {receivedRequests.map((request) => <PersonRow key={request.id} person={request.user} onAction={(person, action) => friendMutation.mutate({ person, action })} onMessage={createChat.mutate} pending={friendMutation.isPending} />)}
          </div>
        </section>
      )}

      {!query && suggestions.length > 0 && (
        <section className="people-section">
          <div className="section-title-row"><div><span className="section-icon coral"><HiSparkles /></span><div><h2>People you may know</h2><p>Based on mutual friends and your circles</p></div></div><span>{friends.length} friends</span></div>
          <div className="suggestion-grid">
            {suggestions.map((person, index) => (
              <motion.article key={person.id} className="person-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
                <Avatar user={person} size="xl" />
                <h3>{person.username}</h3>
                <p>{person.bio || person.location}</p>
                <span>{person.location || "Lumina member"}</span>
                <RelationshipActions person={person} onAction={(target, action) => friendMutation.mutate({ person: target, action })} onMessage={createChat.mutate} pending={friendMutation.isPending} />
              </motion.article>
            ))}
          </div>
        </section>
      )}

      <section className="people-section">
        <div className="section-title-row"><div><span className="section-icon blue"><HiOutlineChatBubbleOvalLeft /></span><div><h2>{query ? "Search results" : "All people"}</h2><p>{users.length} people available</p></div></div></div>
        <div className="people-list">
          {isLoading ? Array.from({ length: 5 }, (_, index) => <div className="people-row skeleton" key={index} />) : users.map((person) => (
            <PersonRow key={person.id} person={person} onAction={(target, action) => friendMutation.mutate({ person: target, action })} onMessage={createChat.mutate} pending={friendMutation.isPending} />
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

function PersonRow({ person, onAction, onMessage, pending }) {
  return (
    <div className="people-row">
      <Avatar user={person} size="md" />
      <div><strong>{person.username}</strong><span>{person.status || person.bio}</span></div>
      <small>{person.isOnline ? "Online" : person.location}</small>
      <RelationshipActions person={person} onAction={onAction} onMessage={onMessage} pending={pending} />
    </div>
  );
}

function RelationshipActions({ person, onAction, onMessage, pending }) {
  const relationship = person.relationship || "none";
  const disabled = pending;
  const action = (event, name) => {
    event.stopPropagation();
    onAction(person, name);
  };
  const message = (event) => {
    event.stopPropagation();
    onMessage(person);
  };

  if (relationship === "blocked-by") return <span className="relationship-unavailable">Unavailable</span>;
  if (relationship === "blocked") {
    return <div className="people-actions"><button type="button" onClick={(event) => action(event, "unblock")} disabled={disabled}>Unblock</button></div>;
  }
  if (relationship === "incoming-pending") {
    return <div className="people-actions"><button type="button" onClick={(event) => action(event, "accept")} disabled={disabled}><HiCheck /> Accept</button><button type="button" onClick={(event) => action(event, "decline")} disabled={disabled}><HiXMark /> Decline</button><button type="button" className="danger" onClick={(event) => action(event, "block")} disabled={disabled}><HiNoSymbol /> Block</button></div>;
  }
  if (relationship === "outgoing-pending") {
    return <div className="people-actions"><button type="button" className="requested" disabled><HiCheck /> Requested</button><button type="button" onClick={(event) => action(event, "cancel")} disabled={disabled}>Cancel</button><button type="button" className="danger" onClick={(event) => action(event, "block")} disabled={disabled}><HiNoSymbol /> Block</button></div>;
  }
  if (relationship === "friends") {
    return <div className="people-actions"><button type="button" onClick={message} disabled={disabled}><HiOutlineChatBubbleOvalLeft /> Message</button><button type="button" className="danger" onClick={(event) => action(event, "block")} disabled={disabled}><HiNoSymbol /> Block</button></div>;
  }
  return <div className="people-actions"><button type="button" onClick={(event) => action(event, "request")} disabled={disabled}><HiOutlineUserPlus /> Add friend</button><button type="button" onClick={message} disabled={disabled}><HiOutlineChatBubbleOvalLeft /> Message</button><button type="button" className="danger" onClick={(event) => action(event, "block")} disabled={disabled}><HiNoSymbol /> Block</button></div>;
}

function invalidatePeople(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["users"] });
  queryClient.invalidateQueries({ queryKey: ["friends"] });
  queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}
