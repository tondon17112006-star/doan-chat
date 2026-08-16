import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiChatBubbleLeftRight, HiCheck, HiCircleStack, HiExclamationTriangle, HiLockClosed, HiLockOpen, HiSignal, HiUsers } from "react-icons/hi2";
import PageFrame from "./PageFrame.jsx";
import Avatar from "../common/Avatar.jsx";
import { socialApi } from "../../services/api.js";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["admin-dashboard"], queryFn: socialApi.dashboard });
  const reportsQuery = useQuery({ queryKey: ["admin-reports"], queryFn: () => socialApi.adminReports() });
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: socialApi.adminUsers });
  const refreshAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };
  const reportMutation = useMutation({
    mutationFn: ({ id, status }) => socialApi.updateAdminReport(id, { status }),
    onMutate: () => setActionError(""),
    onSuccess: refreshAdmin,
    onError: (requestError) => setActionError(requestError.response?.data?.message || "Could not update this report."),
  });
  const resolveMutation = useMutation({
    mutationFn: (id) => socialApi.resolveAdminReport(id),
    onMutate: () => setActionError(""),
    onSuccess: refreshAdmin,
    onError: (requestError) => setActionError(requestError.response?.data?.message || "Could not resolve this report."),
  });
  const accountMutation = useMutation({
    mutationFn: ({ id, disabled }) => socialApi.setUserDisabled(id, disabled),
    onMutate: () => setActionError(""),
    onSuccess: refreshAdmin,
    onError: (requestError) => setActionError(requestError.response?.data?.message || "Could not update this account."),
  });

  if (isLoading) return <PageFrame title="Admin dashboard"><div className="admin-loading" /></PageFrame>;
  if (isError) return <PageFrame title="Admin dashboard"><p className="calls-error" role="alert">{error.response?.data?.message || "Could not load dashboard data."}</p></PageFrame>;
  const totals = data?.totals || {};
  const chart = data?.chart || [];
  const reports = reportsQuery.data || [];
  const users = usersQuery.data || [];
  const hasMessageActivity = chart.some((point) => Number(point.messages) > 0);
  const maxMessages = Math.max(...chart.map((item) => item.messages), 1);
  const mutationPending = reportMutation.isPending || resolveMutation.isPending || accountMutation.isPending;

  return (
    <PageFrame eyebrow="Workspace health" title="Admin dashboard" subtitle="A clear view of your community and platform activity.">
      <div className="admin-stat-grid">
        <Stat icon={<HiUsers />} tone="blue" label="Total users" value={formatNumber(totals.users)} />
        <Stat icon={<HiSignal />} tone="green" label="Online now" value={formatNumber(totals.online)} />
        <Stat icon={<HiChatBubbleLeftRight />} tone="violet" label="Messages" value={formatNumber(totals.messages)} />
        <Stat icon={<HiCircleStack />} tone="orange" label="Attachment storage" value={formatBytes(totals.storageBytes)} />
      </div>
      {actionError && <p className="calls-error" role="alert">{actionError}</p>}
      <div className="admin-grid">
        <section className="admin-card chart-card">
          <div className="admin-card-header"><div><h2>Message activity</h2><p>Messages sent over the last 7 days</p></div></div>
          {hasMessageActivity ? <div className="bar-chart">
            {chart.map((point) => <div className="bar-column" key={point.label}><span className="bar-tooltip">{point.messages}</span><i style={{ height: `${(point.messages / maxMessages) * 100}%` }} /><small>{point.label}</small></div>)}
          </div> : <p className="admin-empty">No message activity has been recorded in the last 7 days.</p>}
        </section>
        <section className="admin-card moderation-card">
          <div className="admin-card-header"><div><h2>Moderation queue</h2><p>Reports requiring a decision</p></div><HiExclamationTriangle /></div>
          <div className="moderation-number"><strong>{formatNumber(totals.reports)}</strong><span>open reports</span></div>
          {reportsQuery.isLoading ? <p className="admin-empty">Loading reports…</p> : reportsQuery.isError ? <p className="calls-error">Could not load reports.</p> : !reports.length ? <p className="admin-empty">No reports need attention.</p> : <div className="moderation-list">
            {reports.map((report) => <ReportRow key={report.id} report={report} pending={mutationPending} onStatus={(status) => reportMutation.mutate({ id: report.id, status })} onResolve={() => resolveMutation.mutate(report.id)} />)}
          </div>}
        </section>
        <section className="admin-card users-card admin-users-card">
          <div className="admin-card-header"><div><h2>Members</h2><p>Account access and lock status</p></div></div>
          {usersQuery.isLoading ? <p className="admin-empty">Loading members…</p> : usersQuery.isError ? <p className="calls-error">Could not load members.</p> : !users.length ? <p className="admin-empty">No members have joined yet.</p> : <div className="admin-member-list">
            {users.map((user) => <AdminUserRow key={user.id} user={user} pending={mutationPending} onToggle={() => accountMutation.mutate({ id: user.id, disabled: !user.disabled })} />)}
          </div>}
        </section>
      </div>
    </PageFrame>
  );
}

function ReportRow({ report, pending, onStatus, onResolve }) {
  const target = report.target?.username || report.target?.content || report.targetId;
  const resolved = ["resolved", "dismissed"].includes(report.status);
  return <article className="moderation-row">
    <div><strong>{report.reason}</strong><span>{report.targetType} · {target}</span><small>Reported by {report.reporter?.username || report.reporterId}</small></div>
    <select aria-label={`Status for report ${report.id}`} value={report.status} onChange={(event) => onStatus(event.target.value)} disabled={pending}>
      <option value="open">Open</option><option value="in_review">In review</option><option value="dismissed">Dismiss</option><option value="resolved">Resolved</option>
    </select>
    {!resolved && <button type="button" onClick={onResolve} disabled={pending}><HiCheck /> Resolve</button>}
  </article>;
}

function AdminUserRow({ user, pending, onToggle }) {
  const manageable = user.role !== "admin" && user.role !== "assistant";
  return <div className="admin-user-row">
    <Avatar user={user} size="sm" />
    <div><strong>{user.username}</strong><span>{user.email}</span></div>
    <small className={user.disabled ? "admin-disabled" : ""}>{user.disabled ? "Locked" : user.isOnline ? "Online" : "Active"}</small>
    {manageable ? <button type="button" className={user.disabled ? "admin-unlock" : "admin-lock"} onClick={onToggle} disabled={pending}>{user.disabled ? <><HiLockOpen /> Unlock</> : <><HiLockClosed /> Lock</>}</button> : <span className="admin-protected">Protected</span>}
  </div>;
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
