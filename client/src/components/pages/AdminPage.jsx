// File: client/src/components/pages/AdminPage.jsx
import { useQuery } from "@tanstack/react-query";
import { HiChatBubbleLeftRight, HiCircleStack, HiExclamationTriangle, HiSignal, HiUsers } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { socialApi } from "../../services/api.js";

export default function AdminPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["admin-dashboard"], queryFn: socialApi.dashboard });
  if (isLoading) return <PageFrame title="Admin dashboard"><div className="admin-loading" /></PageFrame>;
  if (isError) return <PageFrame title="Admin dashboard"><p className="calls-error" role="alert">{error.response?.data?.message || "Could not load dashboard data."}</p></PageFrame>;
  const totals = data?.totals || {};
  const chart = data?.chart || [];
  const hasMessageActivity = chart.some((point) => Number(point.messages) > 0);
  const maxMessages = Math.max(...chart.map((item) => item.messages), 1);
  return (
    <PageFrame eyebrow="Workspace health" title="Admin dashboard" subtitle="A clear view of your community and platform activity.">
      <div className="admin-stat-grid">
        <Stat icon={<HiUsers />} tone="blue" label="Total users" value={formatNumber(totals.users)} />
        <Stat icon={<HiSignal />} tone="green" label="Online now" value={formatNumber(totals.online)} />
        <Stat icon={<HiChatBubbleLeftRight />} tone="violet" label="Messages" value={formatNumber(totals.messages)} />
        <Stat icon={<HiCircleStack />} tone="orange" label="Attachment storage" value={formatBytes(totals.storageBytes)} />
      </div>
      <div className="admin-grid">
        <section className="admin-card chart-card">
          <div className="admin-card-header"><div><h2>Message activity</h2><p>Messages sent over the last 7 days</p></div></div>
          {hasMessageActivity ? <div className="bar-chart">
            {chart.map((point) => (
              <div className="bar-column" key={point.label}><span className="bar-tooltip">{point.messages}</span><i style={{ height: `${(point.messages / maxMessages) * 100}%` }} /><small>{point.label}</small></div>
            ))}
          </div> : <p className="admin-empty">No message activity has been recorded in the last 7 days.</p>}
        </section>
        <section className="admin-card users-card">
          <div className="admin-card-header"><div><h2>Newest members</h2><p>Recently joined the community</p></div></div>
          {(data?.recentUsers || []).length ? (data.recentUsers || []).map((user) => <div className="admin-user-row" key={user.id}><Avatar user={user} size="sm" /><div><strong>{user.username}</strong><span>{user.email}</span></div><small>{user.isOnline ? "Online" : "New"}</small></div>) : <p className="admin-empty">No members have joined yet.</p>}
        </section>
        <section className="admin-card moderation-card">
          <div className="admin-card-header"><div><h2>Needs attention</h2><p>Reports and moderation queue</p></div><HiExclamationTriangle /></div>
          <div className="moderation-number"><strong>{formatNumber(totals.reports)}</strong><span>open reports</span></div>
          <p className="admin-empty">There is no moderation workflow API yet.</p>
        </section>
      </div>
    </PageFrame>
  );
}

function Stat({ icon, tone, label, value }) {
  return <article className="admin-stat"><span className={`admin-stat-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
