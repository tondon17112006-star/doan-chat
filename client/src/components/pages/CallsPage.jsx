// File: client/src/components/pages/CallsPage.jsx
import { useQuery } from "@tanstack/react-query";
import { HiArrowDownLeft, HiArrowUpRight, HiOutlinePhone, HiOutlineVideoCamera, HiPhoneXMark } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { socialApi } from "../../services/api.js";
import EmptyState from "../common/EmptyState.jsx";

const demoCalls = [
  { id: "dc1", name: "Maya Chen", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Maya Chen", type: "video", status: "ended", direction: "outgoing", createdAt: new Date(Date.now() - 3_600_000), duration: 752 },
  { id: "dc2", name: "Theo Bennett", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Theo Bennett", type: "voice", status: "missed", direction: "incoming", createdAt: new Date(Date.now() - 5 * 3_600_000), duration: 0 },
  { id: "dc3", name: "Sofia Reyes", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Sofia Reyes", type: "voice", status: "ended", direction: "incoming", createdAt: new Date(Date.now() - 86_400_000), duration: 315 },
  { id: "dc4", name: "Design Crew", type: "video", status: "ended", direction: "outgoing", createdAt: new Date(Date.now() - 2 * 86_400_000), duration: 1840, group: true }
];

export default function CallsPage() {
  const { data: calls = [], isLoading } = useQuery({ queryKey: ["calls"], queryFn: socialApi.calls });
  const shown = calls.length ? calls : demoCalls;

  return (
    <PageFrame eyebrow="Stay close" title="Calls" subtitle="Voice and video moments, all in one place.">
      <section className="call-summary-grid">
        <div><span className="summary-icon green"><HiOutlinePhone /></span><div><strong>12</strong><small>Calls this week</small></div></div>
        <div><span className="summary-icon violet"><HiOutlineVideoCamera /></span><div><strong>3h 42m</strong><small>Time together</small></div></div>
        <div><span className="summary-icon coral"><HiPhoneXMark /></span><div><strong>1</strong><small>Missed call</small></div></div>
      </section>
      <section className="calls-section">
        <div className="section-title-row"><div><div><h2>Recent calls</h2><p>Your call history across all conversations</p></div></div></div>
        {!isLoading && !shown.length ? <EmptyState icon={<HiOutlinePhone />} title="No calls yet" description="Your recent voice and video calls will appear here." /> : (
          <div className="call-list">
            {shown.map((call) => (
              <div className="call-row" key={call.id}>
                <Avatar src={call.avatar} name={call.name || "Conversation"} group={call.group} size="md" />
                <div className="call-copy">
                  <strong>{call.name || call.peer?.username || "Lumina call"}</strong>
                  <span className={call.status === "missed" ? "missed" : ""}>
                    {call.direction === "outgoing" ? <HiArrowUpRight /> : <HiArrowDownLeft />}
                    {call.status === "missed" ? "Missed" : call.type === "video" ? "Video call" : "Voice call"} · {formatCallDate(call.createdAt)}
                  </span>
                </div>
                <small>{call.duration ? formatDuration(call.duration) : ""}</small>
                <button type="button" aria-label={`Call ${call.name}`}>{call.type === "video" ? <HiOutlineVideoCamera /> : <HiOutlinePhone />}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const formatCallDate = (value) => new Date(value).toLocaleDateString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
