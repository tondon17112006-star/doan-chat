import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiArrowDownLeft, HiArrowUpRight, HiOutlinePhone, HiOutlineVideoCamera, HiPhoneXMark } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { chatApi, socialApi } from "../../services/api.js";
import { getSocket } from "../../services/socket.js";
import { useAuthStore } from "../../store/authStore.js";
import { useUiStore } from "../../store/uiStore.js";
import EmptyState from "../common/EmptyState.jsx";

export default function CallsPage() {
  const user = useAuthStore((state) => state.user);
  const setActiveCall = useUiStore((state) => state.setActiveCall);
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const { data: calls = [], isLoading, isError, error: callsError } = useQuery({ queryKey: ["calls"], queryFn: socialApi.calls });
  const callbackMutation = useMutation({
    mutationFn: async (call) => {
      if (!call.conversationId || !call.peer?.id) throw new Error("This call no longer has an available conversation.");
      const conversation = await chatApi.conversation(call.conversationId);
      if (conversation.type !== "direct") throw new Error("Group calls are not available yet.");
      const payload = {
        callId: crypto.randomUUID(),
        conversationId: conversation.id,
        participants: conversation.participants.filter((participantId) => String(participantId) !== String(user.id)),
        type: call.type === "video" ? "video" : "voice",
        caller: user,
        peer: call.peer,
        status: "calling",
        incoming: false,
      };
      if (!getSocket()?.connected) throw new Error("Realtime is reconnecting. Please wait before starting a call.");
      return payload;
    },
    onMutate: () => setError(""),
    onSuccess: (call) => {
      setActiveCall(call);
      queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (requestError) => setError(requestError.response?.data?.message || requestError.message || "Could not start this call."),
  });
  const summary = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = calls.filter((call) => new Date(call.createdAt).getTime() >= weekAgo);
    return {
      count: recent.length,
      duration: recent.reduce((total, call) => total + Math.max(0, Number(call.duration) || 0), 0),
      missed: recent.filter((call) => call.status === "missed").length,
    };
  }, [calls]);

  return (
    <PageFrame eyebrow="Stay close" title="Calls" subtitle="Voice and video moments, all in one place.">
      <section className="call-summary-grid">
        <div><span className="summary-icon green"><HiOutlinePhone /></span><div><strong>{isLoading ? "—" : summary.count}</strong><small>Calls this week</small></div></div>
        <div><span className="summary-icon violet"><HiOutlineVideoCamera /></span><div><strong>{isLoading ? "—" : formatDuration(summary.duration)}</strong><small>Time together</small></div></div>
        <div><span className="summary-icon coral"><HiPhoneXMark /></span><div><strong>{isLoading ? "—" : summary.missed}</strong><small>Missed calls</small></div></div>
      </section>
      <section className="calls-section">
        <div className="section-title-row"><div><div><h2>Recent calls</h2><p>Your call history across all conversations</p></div></div></div>
        {(isError || error) && <p className="calls-error" role="alert">{error || callsError?.response?.data?.message || "Could not load your call history."}</p>}
        {isLoading ? <div className="call-list"><div className="call-row skeleton" /><div className="call-row skeleton" /></div> : !calls.length ? <EmptyState icon={<HiOutlinePhone />} title="No calls yet" description="Your recent voice and video calls will appear here." /> : (
          <div className="call-list">
            {calls.map((call) => {
              const callable = Boolean(call.conversationId && call.peer?.id);
              return (
                <div className="call-row" key={call.id}>
                  <Avatar user={call.peer} name={call.peer?.username || "Conversation"} size="md" />
                  <div className="call-copy">
                    <strong>{call.peer?.username || "Lumina call"}</strong>
                    <span className={call.status === "missed" ? "missed" : ""}>
                      {call.direction === "outgoing" ? <HiArrowUpRight /> : <HiArrowDownLeft />}
                      {call.status === "missed" ? "Missed" : call.type === "video" ? "Video call" : "Voice call"} · {formatCallDate(call.createdAt)}
                    </span>
                  </div>
                  <small>{call.duration ? formatDuration(call.duration) : ""}</small>
                  <button type="button" aria-label={`Call ${call.peer?.username || "conversation"}`} title={callable ? "Call again" : "Conversation unavailable"} onClick={() => callbackMutation.mutate(call)} disabled={!callable || callbackMutation.isPending}>{call.type === "video" ? <HiOutlineVideoCamera /> : <HiOutlinePhone />}</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

const formatDuration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const remainingSeconds = value % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};
const formatCallDate = (value) => new Date(value).toLocaleDateString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
