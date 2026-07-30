// File: client/src/components/pages/PeoplePage.jsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { HiCheck, HiMagnifyingGlass, HiOutlineChatBubbleOvalLeft, HiOutlineUserPlus, HiSparkles } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { useDebounce } from "../../hooks/useDebounce.js";

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [requested, setRequested] = useState(new Set());
  const debounced = useDebounce(query);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users", debounced], queryFn: () => socialApi.users(debounced) });
  const createChat = useMutation({
    mutationFn: (target) => chatApi.createConversation({ type: "direct", participants: [target.id] }),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/chat/${conversation.id}`);
    }
  });
  const suggestions = useMemo(() => users.slice(0, 4), [users]);

  async function addFriend(target){

    try{
      await socialApi.friendAction(target.id,"request");

      setRequested((current)=>{
          const next=new Set(current);
          next.add(target.id);
          return next;
      });

    }catch(error){
      console.log(error);
    }

  }

  return (
    <PageFrame eyebrow="Connections" title="People" subtitle="Find friends and make room for new conversations.">
      <div className="people-search">
        <HiMagnifyingGlass />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or location" />
      </div>

      {!query && (
        <section className="people-section">
          <div className="section-title-row"><div><span className="section-icon coral"><HiSparkles /></span><div><h2>People you may know</h2><p>Based on mutual friends and your circles</p></div></div><button type="button">See all</button></div>
          <div className="suggestion-grid">
            {suggestions.map((person, index) => (
              <motion.article key={person.id} className="person-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
                <Avatar user={person} size="xl" />
                <h3>{person.username}</h3>
                <p>{person.bio || person.location}</p>
                <span>{person.location || "Lumina member"}</span>
                <div>
                  <button type="button" className={requested.has(person.id) ? "requested" : ""} onClick={() => addFriend(person)}>
                    {requested.has(person.id) ? <><HiCheck /> Requested</> : <><HiOutlineUserPlus /> Add friend</>}
                  </button>
                  <button type="button" onClick={() => createChat.mutate(person)}><HiOutlineChatBubbleOvalLeft /></button>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      <section className="people-section">
        <div className="section-title-row"><div><span className="section-icon blue"><HiOutlineChatBubbleOvalLeft /></span><div><h2>{query ? "Search results" : "All people"}</h2><p>{users.length} people available</p></div></div></div>
        <div className="people-list">
          {isLoading ? Array.from({ length: 5 }, (_, index) => <div className="people-row skeleton" key={index} />) : users.map((person) => (
            <div className="people-row" key={person.id}>
              <Avatar user={person} size="md" />
              <div><strong>{person.username}</strong><span>{person.status || person.bio}</span></div>
              <small>{person.isOnline ? "Online" : person.location}</small>
              <button type="button" onClick={() => createChat.mutate(person)}><HiOutlineChatBubbleOvalLeft /> Message</button>
            </div>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}
