"use client";

/**
 * app/platform-team/components/PlatformTeamKit.tsx
 * ---------------------------------------------------------
 * Shared UI, data helpers, local persistence, and safe API access
 * for the Platform Team workspace.
 * ---------------------------------------------------------
 * No raw SQL, no migration actions, no destructive database tools.
 */

import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";

export type TeamTone = "green" | "blue" | "orange" | "red" | "purple" | "gray";
export type ViewMode = "cards" | "table" | "focus";
export type TeamRole = "platform_lead" | "developer" | "support_agent" | "billing_support" | "qa_tester" | "content_assistant" | "designer";
export type WorkStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type WorkPriority = "low" | "normal" | "high" | "urgent";

export type TeamWorkItem = {
  id: string;
  title: string;
  description: string;
  area: string;
  status: WorkStatus;
  priority: WorkPriority;
  assignee?: string;
  accountName?: string;
  accountId?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  source?: "local" | "api";
  tags?: string[];
};

export type SupportTicket = {
  id: string;
  subject: string;
  message?: string;
  status?: string;
  priority?: string;
  accountId?: string;
  accountName?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  assignedTo?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ClientAccount = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  planName?: string;
  subscriptionStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: any;
};

export type BugReport = {
  id: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  status: WorkStatus;
  moduleKey?: string;
  accountName?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReleaseItem = {
  id: string;
  version: string;
  title: string;
  status: "planning" | "testing" | "ready" | "released" | "blocked";
  targetDate?: string;
  owner?: string;
  checklist: { label: string; done: boolean }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  answer: string;
  audience: string;
  updatedAt: string;
  tags?: string[];
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  platform_lead: "Platform Lead",
  developer: "Developer",
  support_agent: "Support Agent",
  billing_support: "Billing Support",
  qa_tester: "QA Tester",
  content_assistant: "Content Assistant",
  designer: "Designer",
};

export const SAFE_PERMISSION_GROUPS = [
  { key: "support", label: "Support Desk", description: "Handle tickets and customer follow-ups." },
  { key: "accounts_read", label: "View Client Accounts", description: "Read account profiles and subscription status." },
  { key: "sync_help", label: "Sync Help", description: "View devices, conflicts and sync diagnostics." },
  { key: "billing_help", label: "Billing Support", description: "View invoices and payments, add support notes." },
  { key: "qa", label: "QA Testing", description: "Run tests and record release results." },
  { key: "bugs", label: "Bug Reports", description: "Create and triage bug reports." },
  { key: "releases", label: "Release Board", description: "View release plans and update checklists." },
  { key: "knowledge", label: "Knowledge Base", description: "Create internal guides and customer help notes." },
  { key: "team_notes", label: "Work Notes", description: "Read and create operational notes." },
  { key: "activity_read", label: "Activity Logs", description: "View staff action history." },
];

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function safeArray<T>(value: any, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as T[];
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (Array.isArray(value.results)) return value.results as T[];
  if (Array.isArray(value.records)) return value.records as T[];
  if (Array.isArray(value.rows)) return value.rows as T[];
  if (Array.isArray(value.tickets)) return value.tickets as T[];
  if (Array.isArray(value.accounts)) return value.accounts as T[];
  if (Array.isArray(value.conflicts)) return value.conflicts as T[];
  return [];
}

export function toneFromStatus(status?: string): TeamTone {
  const key = String(status || "").toLowerCase();
  if (["active", "ok", "healthy", "resolved", "closed", "paid", "success", "released", "ready", "done", "completed"].includes(key)) return "green";
  if (["open", "new", "queued", "pending", "planning", "draft", "trial"].includes(key)) return "blue";
  if (["waiting", "in_progress", "processing", "testing", "past_due", "degraded", "medium"].includes(key)) return "orange";
  if (["failed", "blocked", "critical", "urgent", "suspended", "expired", "down", "error", "high"].includes(key)) return "red";
  if (["developer", "platform_lead", "designer"].includes(key)) return "purple";
  return "gray";
}

export function safeTime(value?: string | number | Date | null) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function dateText(value?: string | number | Date | null) {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(time));
}

export function timeText(value?: string | number | Date | null) {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}

export function money(amount?: number | string | null, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
}

export function makeId(prefix = "pt") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function countBy<T>(rows: T[], getKey: (row: T) => string | undefined | null) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function useLocalRecords<T>(key: string, initial: T[] = []) {
  const [records, setRecords] = useState<T[]>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw) setRecords(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [key]);

  const save = (next: T[] | ((old: T[]) => T[])) => {
    setRecords((old) => {
      const value = typeof next === "function" ? (next as any)(old) : next;
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
      } catch {}
      return value;
    });
  };

  const add = (item: T) => save((old) => [item, ...old]);
  const update = (predicate: (item: T) => boolean, patch: Partial<T> | ((item: T) => T)) =>
    save((old) => old.map((item) => (predicate(item) ? (typeof patch === "function" ? (patch as any)(item) : { ...(item as any), ...patch }) : item)));
  const remove = (predicate: (item: T) => boolean) => save((old) => old.filter((item) => !predicate(item)));

  return { records, setRecords: save, add, update, remove, ready };
}

export function usePlatformTeamApi<T>(path: string, keys: string[] = [], options?: { auto?: boolean; fallback?: T[] }) {
  const { accountId } = useAccount();
  const [rows, setRows] = useState<T[]>(options?.fallback || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let response: any;
      const url = accountId && !path.includes("accountId=") ? `${path}${path.includes("?") ? "&" : "?"}accountId=${encodeURIComponent(accountId)}` : path;
      if ((apiClient as any)?.get) response = await (apiClient as any).get(url);
      else response = await fetch(url).then((r) => r.json());
      setRows(safeArray<T>(response, keys));
      setLoadedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || "Could not load this information from the server.");
      setRows((old) => old.length ? old : (options?.fallback || []));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (options?.auto === false) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, accountId]);

  return { rows, setRows, loading, error, loadedAt, refresh: load };
}

export function TeamStyles() {
  const { settings } = useSettings() as any;
  const primary = settings?.primaryColor || "#2563eb";
  return (
    <style jsx global>{`
      :root { --pt-primary: ${primary}; --pt-primary-soft: color-mix(in srgb, ${primary} 11%, white); --pt-border: rgba(148,163,184,.28); --pt-ink:#0f172a; --pt-muted:#64748b; --pt-card: rgba(255,255,255,.92); --pt-bg: linear-gradient(135deg,#f8fafc 0%,#eef6ff 40%,#f8fafc 100%); }
      .pt-page { width:100%; min-height:100%; color:var(--pt-ink); }
      .pt-stack { display:grid; gap:16px; }
      .pt-hero { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:18px; border:1px solid var(--pt-border); border-radius:28px; background:var(--pt-bg); box-shadow:0 18px 50px rgba(15,23,42,.08); margin-bottom:16px; }
      .pt-eyebrow { display:inline-flex; align-items:center; gap:8px; font-size:12px; font-weight:900; color:var(--pt-primary); text-transform:uppercase; letter-spacing:.08em; }
      .pt-hero h1 { margin:8px 0 6px; font-size:clamp(24px,4vw,42px); line-height:1; letter-spacing:-.04em; }
      .pt-hero p { margin:0; color:var(--pt-muted); max-width:780px; font-size:14px; line-height:1.7; }
      .pt-actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; align-items:center; }
      .pt-grid { display:grid; grid-template-columns: repeat(12, minmax(0,1fr)); gap:14px; }
      .pt-card { grid-column:span 4; background:var(--pt-card); border:1px solid var(--pt-border); border-radius:24px; padding:16px; box-shadow:0 14px 40px rgba(15,23,42,.06); }
      .pt-card.wide { grid-column:span 8; } .pt-card.full { grid-column:1 / -1; } .pt-card.half { grid-column:span 6; }
      .pt-card h2,.pt-card h3 { margin:0 0 8px; letter-spacing:-.025em; } .pt-card p { color:var(--pt-muted); line-height:1.65; font-size:13px; }
      .pt-metric { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; } .pt-metric strong { display:block; font-size:28px; letter-spacing:-.05em; } .pt-metric span { color:var(--pt-muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
      .pt-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:16px; background:var(--pt-primary-soft); color:var(--pt-primary); font-weight:900; }
      .pt-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
      .pt-search { flex:1; min-width:210px; border:1px solid var(--pt-border); border-radius:16px; padding:11px 13px; outline:none; background:#fff; font:inherit; }
      .pt-select,.pt-input,.pt-textarea { width:100%; border:1px solid var(--pt-border); border-radius:14px; padding:11px 12px; outline:none; background:#fff; font:inherit; } .pt-textarea { min-height:100px; resize:vertical; }
      .pt-btn { border:0; border-radius:14px; padding:11px 14px; font-weight:900; cursor:pointer; background:var(--pt-primary); color:#fff; box-shadow:0 12px 24px rgba(37,99,235,.16); }
      .pt-btn.secondary { background:#fff; color:var(--pt-ink); border:1px solid var(--pt-border); box-shadow:none; } .pt-btn.danger { background:#dc2626; } .pt-btn:disabled { opacity:.55; cursor:not-allowed; }
      .pt-switch { display:inline-flex; gap:4px; background:#fff; border:1px solid var(--pt-border); border-radius:16px; padding:4px; } .pt-switch button { border:0; background:transparent; padding:8px 10px; border-radius:12px; cursor:pointer; font-weight:900; color:var(--pt-muted); } .pt-switch button.active { background:var(--pt-primary); color:#fff; }
      .pt-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 9px; border-radius:999px; font-size:12px; font-weight:900; text-transform:capitalize; border:1px solid transparent; }
      .pt-badge.green { background:#dcfce7; color:#166534; border-color:#bbf7d0; } .pt-badge.blue { background:#dbeafe; color:#1d4ed8; border-color:#bfdbfe; } .pt-badge.orange { background:#ffedd5; color:#9a3412; border-color:#fed7aa; } .pt-badge.red { background:#fee2e2; color:#991b1b; border-color:#fecaca; } .pt-badge.purple { background:#ede9fe; color:#6d28d9; border-color:#ddd6fe; } .pt-badge.gray { background:#f1f5f9; color:#475569; border-color:#e2e8f0; }
      .pt-list { display:grid; gap:10px; } .pt-row { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:12px; border:1px solid var(--pt-border); border-radius:18px; background:#fff; } .pt-row h3 { margin:0; font-size:15px; } .pt-row p { margin:4px 0 0; color:var(--pt-muted); font-size:13px; }
      .pt-table-wrap { overflow:auto; border:1px solid var(--pt-border); border-radius:18px; background:#fff; } .pt-table { width:100%; border-collapse:collapse; min-width:760px; } .pt-table th { text-align:left; font-size:12px; color:var(--pt-muted); text-transform:uppercase; letter-spacing:.05em; background:#f8fafc; } .pt-table th,.pt-table td { padding:12px; border-bottom:1px solid #eef2f7; vertical-align:top; } .pt-table tr:last-child td { border-bottom:0; }
      .pt-form { display:grid; gap:10px; } .pt-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .pt-help { font-size:12px; color:var(--pt-muted); line-height:1.55; }
      .pt-empty { text-align:center; padding:36px 18px; border:1px dashed var(--pt-border); border-radius:24px; background:#fff; } .pt-empty h3 { margin:0 0 6px; } .pt-empty p { margin:0; color:var(--pt-muted); }
      .pt-progress { height:10px; border-radius:999px; background:#e2e8f0; overflow:hidden; } .pt-progress span { display:block; height:100%; border-radius:999px; background:var(--pt-primary); }
      .pt-kv { display:grid; grid-template-columns:150px 1fr; gap:6px 12px; font-size:13px; } .pt-kv b { color:#334155; } .pt-kv span { color:var(--pt-muted); }
      .pt-mobile-note { display:none; color:var(--pt-muted); font-size:12px; }
      @media (max-width: 900px) { .pt-hero { flex-direction:column; border-radius:22px; padding:14px; } .pt-actions { justify-content:flex-start; width:100%; } .pt-card,.pt-card.wide,.pt-card.half { grid-column:1 / -1; } .pt-form-grid { grid-template-columns:1fr; } .pt-row { grid-template-columns:1fr; } .pt-mobile-note { display:block; } .pt-btn,.pt-search,.pt-select,.pt-input { width:100%; } .pt-switch { width:100%; } .pt-switch button { flex:1; } }
    `}</style>
  );
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <><TeamStyles /><section className="pt-hero"><div><span className="pt-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children ? <div className="pt-actions">{children}</div> : null}</section></>;
}

export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return <div className="pt-switch"><button className={value === "cards" ? "active" : ""} onClick={() => onChange("cards")} type="button">Cards</button><button className={value === "table" ? "active" : ""} onClick={() => onChange("table")} type="button">Table</button><button className={value === "focus" ? "active" : ""} onClick={() => onChange("focus")} type="button">Focus</button></div>;
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: TeamTone }) { return <span className={cx("pt-badge", tone || toneFromStatus(String(children)))}>{children}</span>; }
export function MetricCard({ label, value, icon, tone = "blue", helper }: { label: string; value: React.ReactNode; icon: string; tone?: TeamTone; helper?: string }) { return <section className="pt-card"><div className="pt-metric"><div><span>{label}</span><strong>{value}</strong>{helper ? <p>{helper}</p> : null}</div><div className={cx("pt-icon", tone)}>{icon}</div></div></section>; }
export function EmptyState({ title, text }: { title: string; text: string }) { return <div className="pt-empty"><h3>{title}</h3><p>{text}</p></div>; }

export function LoadingOrError({ loading, error, onRetry }: { loading: boolean; error?: string | null; onRetry?: () => void }) {
  if (!loading && !error) return null;
  return <div className="pt-empty"><h3>{loading ? "Loading latest information" : "Could not load from server"}</h3><p>{loading ? "The platform team page is fetching live data." : error}</p>{error && onRetry ? <button className="pt-btn secondary" onClick={onRetry} type="button">Try again</button> : null}</div>;
}

export function Toolbar({ query, onQuery, status, onStatus, view, onView, onRefresh, loading, extra }: { query: string; onQuery: (v: string) => void; status?: string; onStatus?: (v: string) => void; view: ViewMode; onView: (v: ViewMode) => void; onRefresh?: () => void; loading?: boolean; extra?: React.ReactNode }) {
  return <div className="pt-toolbar"><input className="pt-search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search by account, person, module, status..." />{onStatus ? <select className="pt-select" style={{ maxWidth: 220 }} value={status} onChange={(e) => onStatus(e.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="urgent">Urgent</option><option value="failed">Failed</option></select> : null}<ViewSwitch value={view} onChange={onView} />{extra}{onRefresh ? <button className="pt-btn secondary" onClick={onRefresh} disabled={loading} type="button">{loading ? "Refreshing..." : "Refresh"}</button> : null}</div>;
}

export function DataTable({ columns, rows }: { columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[]; rows: any[] }) {
  if (!rows.length) return <EmptyState title="No records found" text="There is no matching information for the current filters." />;
  return <div className="pt-table-wrap"><table className="pt-table"><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

export function filterRows<T extends Record<string, any>>(rows: T[], query: string, status = "all", fields: string[] = []) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    const statusValue = String(row.status || row.priority || row.severity || "").toLowerCase();
    const statusOk = status === "all" || statusValue === status || (status === "urgent" && (row.priority === "urgent" || row.severity === "critical"));
    if (!statusOk) return false;
    if (!q) return true;
    const hay = (fields.length ? fields : Object.keys(row)).map((k) => String(row[k] ?? "")).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function SectionTitle({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) { return <div className="pt-toolbar"><div><h2 style={{ margin: 0 }}>{title}</h2>{text ? <p className="pt-help" style={{ margin: "4px 0 0" }}>{text}</p> : null}</div>{action}</div>; }

export function MiniBarChart({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <div className="pt-list">{rows.map((row) => <div key={row.label} className="pt-row"><div><h3>{row.label}</h3><div className="pt-progress"><span style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }} /></div></div><Badge tone="blue">{row.value}</Badge></div>)}</div>;
}
