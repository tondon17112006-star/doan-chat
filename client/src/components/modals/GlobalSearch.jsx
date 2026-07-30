// File: client/src/components/modals/GlobalSearch.jsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HiChatBubbleLeftRight, HiDocument, HiMagnifyingGlass, HiUser, HiXMark } from "react-icons/hi2";
import { socialApi } from "../../services/api.js";
import { useUiStore } from "../../store/uiStore.js";
import { useDebounce } from "../../hooks/useDebounce.js";
import Avatar from "../common/Avatar.jsx";

export default function GlobalSearch() {
  const open = useUiStore((state) => state.searchOpen);
  const setOpen = useUiStore((state) => state.setSearchOpen);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => socialApi.search(debounced),
    enabled: open && debounced.length >= 2
  });

  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener("lumina:search", listener);
    return () => window.removeEventListener("lumina:search", listener);
  }, [setOpen]);

  function go(conversationId) {
    setOpen(false);
    setQuery("");
    navigate(`/chat/${conversationId}`);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="search-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <motion.section className="global-search" initial={{ opacity: 0, y: -20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}>
            <div className="global-search-input">
              <HiMagnifyingGlass />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages, people, files…" />
              {isFetching && <span className="search-spinner" />}
              <button type="button" onClick={() => setOpen(false)}><HiXMark /></button>
            </div>
            <div className="search-results">
              {query.length < 2 ? (
                <div className="search-welcome"><span><HiMagnifyingGlass /></span><strong>Search across Lumina</strong><p>Find a person, conversation, message, photo, video, or file.</p><div><kbd>↑</kbd><kbd>↓</kbd> to navigate <kbd>esc</kbd> to close</div></div>
              ) : (
                <>
                  <ResultGroup title="People" icon={<HiUser />} empty={!data?.users?.length}>
                    {data?.users?.map((person) => <button key={person.id} type="button"><Avatar user={person} size="sm" /><span><strong>{person.username}</strong><small>{person.email}</small></span></button>)}
                  </ResultGroup>
                  <ResultGroup title="Conversations" icon={<HiChatBubbleLeftRight />} empty={!data?.conversations?.length}>
                    {data?.conversations?.map((conversation) => <button key={conversation.id} type="button" onClick={() => go(conversation.id)}><Avatar name={conversation.name} src={conversation.avatar} group={conversation.type === "group"} size="sm" /><span><strong>{conversation.name}</strong><small>{conversation.lastMessage}</small></span></button>)}
                  </ResultGroup>
                  <ResultGroup title="Messages" icon={<HiChatBubbleLeftRight />} empty={!data?.messages?.length}>
                    {data?.messages?.map((message) => <button key={message.id} type="button" onClick={() => go(message.conversationId)}><span className="search-result-icon"><HiChatBubbleLeftRight /></span><span><strong>{message.content}</strong><small>Open conversation</small></span></button>)}
                  </ResultGroup>
                  <ResultGroup title="Files" icon={<HiDocument />} empty={!data?.files?.length}>
                    {data?.files?.map((file) => <button key={file.id} type="button" onClick={() => go(file.conversationId)}><span className="search-result-icon"><HiDocument /></span><span><strong>{file.name}</strong><small>{file.type}</small></span></button>)}
                  </ResultGroup>
                  {data && !Object.values(data).some((items) => items.length) && <div className="no-search-results">No results for “{query}”</div>}
                </>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ResultGroup({ title, icon, children, empty }) {
  if (empty) return null;
  return <section className="result-group"><h3>{icon}{title}</h3><div>{children}</div></section>;
}
