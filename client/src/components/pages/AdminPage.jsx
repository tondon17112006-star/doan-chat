// File: client/src/components/pages/AdminPage.jsx
import { useQuery } from "@tanstack/react-query";
import { HiChartBar, HiChatBubbleLeftRight, HiCircleStack, HiExclamationTriangle, HiSignal, HiUsers } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { socialApi } from "../../services/api.js";

export default function AdminPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-dashboard"], queryFn: socialApi.dashboard });
  if (isLoading) return <PageFrame title="Admin dashboard"><div className="admin-loading" /></PageFrame>;
  const totals = data?.totals || {};
  const maxMessages = Math.max(...(data?.chart || []).map((item) => item.messages), 1);
  return (
    <PageFrame eyebrow="Workspace health" title="Admin dashboard" subtitle="A clear view of your community and platform activity.">
      <div className="admin-stat-grid">
        <Stat icon={<HiUsers />} tone="blue" label="Total users" value={totals.users?.toLocaleString()} change="+8.2%" />
        <Stat icon={<HiSignal />} tone="green" label="Online now" value={totals.online?.toLocaleString()} change="+12.5%" />
        <Stat icon={<HiChatBubbleLeftRight />} tone="violet" label="Messages" value={totals.messages?.toLocaleString()} change="+18.1%" />
        <Stat icon={<HiCircleStack />} tone="orange" label="Storage used" value={`${totals.storage}%`} change="12.4 GB free" />
      </div>
      <div className="admin-grid">
        <section className="admin-card chart-card">
          <div className="admin-card-header"><div><h2>Message activity</h2><p>Messages sent over the last 7 days</p></div><select defaultValue="7"><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div>
          <div className="bar-chart">
            {(data?.chart || []).map((point) => (
              <div className="bar-column" key={point.label}><span className="bar-tooltip">{point.messages}</span><i style={{ height: `${(point.messages / maxMessages) * 100}%` }} /><small>{point.label}</small></div>
            ))}
          </div>
        </section>
        <section className="admin-card health-card">
          <div className="admin-card-header"><div><h2>Platform health</h2><p>Systems are running smoothly</p></div><span className="healthy"><i /> All systems operational</span></div>
          {[["API response", "128 ms", 92], ["Realtime delivery", "99.98%", 99], ["Database load", "32%", 32], ["Upload service", "Healthy", 88]].map(([label, value, width]) => (
            <div className="health-row" key={label}><span><strong>{label}</strong><small>{value}</small></span><div><i style={{ width: `${width}%` }} /></div></div>
          ))}
        </section>
        <section className="admin-card users-card">
          <div className="admin-card-header"><div><h2>Newest members</h2><p>Recently joined the community</p></div><button type="button">View all</button></div>
          {(data?.recentUsers || []).map((user) => <div className="admin-user-row" key={user.id}><Avatar user={user} size="sm" /><div><strong>{user.username}</strong><span>{user.email}</span></div><small>{user.isOnline ? "Online" : "New"}</small></div>)}
        </section>
        <section className="admin-card moderation-card">
          <div className="admin-card-header"><div><h2>Needs attention</h2><p>Reports and moderation queue</p></div><HiExclamationTriangle /></div>
          <div className="moderation-number"><strong>{totals.reports}</strong><span>open reports</span></div>
          <button type="button">Review moderation queue</button>
        </section>
      </div>
    </PageFrame>
  );
}

function Stat({ icon, tone, label, value, change }) {
  return <article className="admin-stat"><span className={`admin-stat-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{change}</small></div></article>;
}
