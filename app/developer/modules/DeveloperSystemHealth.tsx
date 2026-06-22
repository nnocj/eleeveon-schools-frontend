"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";

type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "orange" | "red" | "gray";
type ChartRow = { label: string; value: number };

const chartColors = ["var(--dev-primary)", "#0f172a", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#64748b"];

function toArray<T>(value: any, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as T[];
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (Array.isArray(value.results)) return value.results as T[];
  if (Array.isArray(value.records)) return value.records as T[];
  if (Array.isArray(value.rows)) return value.rows as T[];
  return [];
}

function safeTime(value?: string | number | null) {
  if (!value) return 0;
  const time = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateText(value?: string | number | null) {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(time));
}

function timeText(value?: string | number | null) {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}

function money(amount: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
}

function monthLabels(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(date);
  });
}

function monthKey(value?: string | number | null) {
  const time = safeTime(value);
  if (!time) return "Unknown";
  return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(new Date(time));
}

function countBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function toneFromStatus(status?: string): Tone {
  const key = String(status || "").toLowerCase();
  if (["ok", "healthy", "active", "resolved", "success", "completed", "synced", "enabled", "open", "paid"].includes(key)) return "green";
  if (["pending", "info", "queued", "processing", "draft"].includes(key)) return "blue";
  if (["warning", "degraded", "slow", "retrying", "medium", "overdue"].includes(key)) return "orange";
  if (["error", "failed", "critical", "down", "disabled", "blocked", "urgent", "high", "suspended"].includes(key)) return "red";
  return "gray";
}

function Header({
  eyebrow,
  title,
  description,
  viewMode,
  onViewMode,
  onRefresh,
  refreshing,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onRefresh: () => void;
  refreshing: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <section className="devx-hero">
      <div>
        <span className="devx-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="devx-hero-actions">
        <div className="devx-switch">
          <button className={viewMode === "cards" ? "active" : ""} onClick={() => onViewMode("cards")} type="button">Cards</button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => onViewMode("table")} type="button">Table</button>
          <button className={viewMode === "analytics" ? "active" : ""} onClick={() => onViewMode("analytics")} type="button">Charts</button>
        </div>
        {actions}
        <button className="devx-glass-btn" onClick={onRefresh} disabled={refreshing} type="button">
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </section>
  );
}

function StateCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="devx-state">
      <div className="devx-spinner" />
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function Stat({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: string }) {
  return (
    <article className="devx-stat">
      <span>{label}<b>{icon}</b></span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`devx-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="devx-empty">{text}</div>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="devx-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="devx-legend">
      {rows.map((row, index) => (
        <span key={`${row.label}-${index}`}>
          <i style={{ background: chartColors[index % chartColors.length] }} />
          {row.label}: {row.value}
        </span>
      ))}
    </div>
  );
}


type Row = {
  id: string;
  name: string;
  service?: string;
  status: string;
  latencyMs?: number;
  uptimePercent?: number;
  message?: string;
  checkedAt?: string | number;
};

export default function DeveloperSystemHealth() {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      const response = await apiClient<any>("/health").catch(async () =>
        apiClient<any>("/developer/system-health").catch(() => [])
      );
      setRows(toArray<Row>(response, ['services', 'checks', 'health', 'items']).map((row, index) => ({ ...row, id: row.id || String(index) })));
    } catch (err: any) {
      setError(err?.message || "Could not load system health.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        const haystack = JSON.stringify(row).toLowerCase();
        const rowStatus = String((row as any).status || (row as any).severity || "open").toLowerCase();
        return (!term || haystack.includes(term)) && (status === "all" || rowStatus === status);
      })
      .sort((a, b) => safeTime((b as any).updatedAt || (b as any).createdAt || (b as any).checkedAt) - safeTime((a as any).updatedAt || (a as any).createdAt || (a as any).checkedAt));
  }, [rows, query, status]);

  
  const activeCount = rows.filter((row) => toneFromStatus(row.status) === "green").length;
  const warningCount = rows.filter((row) => toneFromStatus(row.status) === "orange").length;
  const criticalCount = rows.filter((row) => toneFromStatus(row.status) === "red").length;


  const statusChart = useMemo(() => countBy(rows, (row) => String((row as any).status || (row as any).status || "unknown")), [rows]);
  const monthlyChart = useMemo(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));
    rows.forEach((row) => {
      const key = monthKey((row as any).createdAt || (row as any).updatedAt || (row as any).checkedAt);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    return labels.map((label) => ({ label, value: map.get(label) || 0 }));
  }, [rows]);

  if (loading || accountLoading) {
    return (
      <main className="devx-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <StateCard title="Loading system health..." text="Preparing records, filters and analytics." />
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="devx-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <StateCard title="Developer access required" text="Sign in to view system health." />
      </main>
    );
  }

  return (
    <main className="devx-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <Header
        eyebrow="Technical support"
        title="System Health"
        description="Monitor backend APIs, frontend PWA, network, sync, billing and service status."
        viewMode={viewMode}
        onViewMode={setViewMode}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {error && <section className="devx-alert error">{error}</section>}

      <section className="devx-stat-grid">
        <Stat label="Total" value={rows.length} detail={`${filtered.length} after filters`} icon="🩺" />
        <Stat label="Active / Open" value={activeCount} detail="Healthy or open records" icon="✅" />
        <Stat label="Warnings" value={warningCount} detail="Needs attention" icon="⚠️" />
        <Stat label="Critical" value={criticalCount} detail="Failed or blocked records" icon="🚨" />
      </section>

      <section className="devx-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records..." />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="healthy">Healthy</option>
          <option value="failed">Failed</option>
          <option value="critical">Critical</option>
          <option value="info">Info</option>
        </select>
        <button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>Reset</button>
      </section>

      {viewMode === "analytics" ? (
        <section className="devx-chart-grid">
          <ChartCard title="Trend over time" description="Records created or updated in the last six months.">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyChart}>
                <defs>
                  <linearGradient id="DeveloperSystemHealthTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="8%" stopColor="var(--dev-primary)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--dev-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Area dataKey="value" stroke="var(--dev-primary)" fill="url(#DeveloperSystemHealthTrend)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status breakdown" description="Current record distribution by status.">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip />
                <Pie data={statusChart} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {statusChart.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <Legend rows={statusChart} />
          </ChartCard>
        </section>
      ) : viewMode === "table" ? (
        <section className="devx-table-card">
          <div className="devx-table-wrap">
            <table>
              <thead>
                <tr><th>Service</th><th>Area</th><th>Status</th><th>Latency</th><th>Uptime</th><th>Message</th><th>Checked</th></tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong></td><td>{row.service || 'platform'}</td><td><Chip tone={toneFromStatus(row.status)}>{row.status}</Chip></td><td>{row.latencyMs ?? 0}ms</td><td>{row.uptimePercent ?? 0}%</td><td>{row.message || '—'}</td><td>{timeText(row.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && <Empty text="No records match your filters." />}
        </section>
      ) : (
        <section className="devx-card-grid">
          {filtered.map((row) => (
            <article className="devx-card" key={row.id}>
              <div className="devx-record-top">
                <span className="devx-avatar">🩺</span>
                <Chip tone={toneFromStatus((row as any).status || (row as any).severity)}>{(row as any).status || (row as any).severity || "open"}</Chip>
              </div>
              <h3>{row.name || "Service"}</h3>
              <p>{row.message || "No service message."}</p>
              <div className="devx-meta-grid">
                <span><b>Area</b>{row.service || "platform"}</span>
                <span><b>Latency</b>{row.latencyMs ?? 0}ms</span>
                <span><b>Checked</b>{timeText(row.checkedAt)}</span>
              </div>
            </article>
          ))}
          {!filtered.length && <Empty text="No records match your filters." />}
        </section>
      )}
    </main>
  );
}

const css = `
@keyframes devSpin{to{transform:rotate(360deg)}}.devx-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--dev-primary) 10%,transparent),transparent 34rem),var(--bg,#f8fafc);color:var(--text,#0f172a);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow-x:hidden}.devx-page *{box-sizing:border-box}.devx-page button,.devx-page input,.devx-page select,.devx-page textarea{font:inherit;max-width:100%}.devx-page button{-webkit-tap-highlight-color:transparent}.devx-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 24px 70px rgba(15,23,42,.08);text-align:center}.devx-state h2{margin:0;font-size:clamp(18px,5vw,24px);font-weight:1000;letter-spacing:-.04em}.devx-state p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.devx-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--dev-primary) 18%,transparent);border-top-color:var(--dev-primary);animation:devSpin .8s linear infinite}.devx-hero{display:grid;gap:16px;border-radius:30px;padding:18px;color:#fff;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.18),transparent 20rem),linear-gradient(135deg,var(--dev-primary),#0f172a 72%);box-shadow:0 24px 70px rgba(15,23,42,.18);overflow:hidden}.devx-eyebrow{display:inline-flex;font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.14em;opacity:.82}.devx-hero h1{margin:8px 0 0;font-size:clamp(28px,8vw,44px);line-height:1.02;font-weight:1000;letter-spacing:-.07em}.devx-hero p{max-width:760px;margin:10px 0 0;font-size:13px;line-height:1.6;opacity:.9}.devx-hero-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.devx-switch{display:inline-flex;gap:5px;padding:5px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(14px)}.devx-switch button{min-height:34px;border:0;border-radius:999px;padding:0 11px;background:transparent;color:rgba(255,255,255,.75);font-size:12px;font-weight:1000;cursor:pointer}.devx-switch button.active{background:#fff;color:#0f172a;box-shadow:0 10px 24px rgba(15,23,42,.16)}.devx-white-btn,.devx-glass-btn,.devx-solid-btn,.devx-soft-btn{min-height:40px;border-radius:999px;padding:0 13px;font-size:12px;font-weight:950;cursor:pointer}.devx-white-btn{border:0;background:#fff;color:#0f172a}.devx-glass-btn{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.14);color:#fff}.devx-solid-btn{border:0;background:var(--dev-primary);color:#fff}.devx-soft-btn{border:0;background:color-mix(in srgb,var(--dev-primary) 10%,white);color:var(--dev-primary)}.devx-alert{margin-top:10px;padding:12px 14px;border-radius:20px;font-size:13px;font-weight:850}.devx-alert.error{background:#fee2e2;color:#991b1b}.devx-alert.success{background:#dcfce7;color:#166534}.devx-stat-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devx-stat{border:1px solid rgba(148,163,184,.22);border-radius:24px;padding:16px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devx-stat span{display:flex;justify-content:space-between;gap:10px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devx-stat strong{display:block;margin-top:8px;font-size:clamp(24px,8vw,34px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.devx-stat small{display:block;margin-top:8px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devx-toolbar{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;padding:10px;border-radius:24px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 18px 45px rgba(15,23,42,.05)}.devx-toolbar input,.devx-toolbar select,.devx-toolbar textarea{min-height:42px;width:100%;border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;font-weight:800}.devx-toolbar button{min-height:42px;border:0;border-radius:16px;background:color-mix(in srgb,var(--dev-primary) 10%,white);color:var(--dev-primary);font-size:13px;font-weight:1000;cursor:pointer}.devx-card-grid,.devx-chart-grid,.devx-main-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devx-card,.devx-chart-card,.devx-table-card{min-width:0;border:1px solid rgba(148,163,184,.22);border-radius:26px;padding:14px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devx-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.devx-avatar{width:42px;height:42px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--dev-primary),#0f172a);color:#fff;font-weight:1000}.devx-card h3{margin:14px 0 0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devx-card p,.devx-chart-card p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.devx-chart-card h2{margin:0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devx-meta-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}.devx-meta-grid span{padding:10px;border-radius:16px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:850}.devx-meta-grid b{display:block;color:var(--muted,#64748b);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.devx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.devx-actions button,.devx-actions input{min-height:38px;border:0;border-radius:999px;padding:0 12px;background:color-mix(in srgb,var(--dev-primary) 10%,white);color:var(--dev-primary);font-size:12px;font-weight:1000}.devx-actions button{cursor:pointer}.devx-actions button.primary{background:var(--dev-primary);color:#fff}.devx-chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:1000;white-space:nowrap}.devx-chip.green{background:#dcfce7;color:#166534}.devx-chip.blue{background:#dbeafe;color:#1d4ed8}.devx-chip.orange{background:#ffedd5;color:#c2410c}.devx-chip.red{background:#fee2e2;color:#b91c1c}.devx-chip.gray{background:#f1f5f9;color:#475569}.devx-table-wrap{width:100%;overflow-x:auto}.devx-table-wrap table{width:100%;min-width:900px;border-collapse:collapse}.devx-table-wrap th{text-align:left;color:var(--muted,#64748b);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:10px;border-bottom:1px solid rgba(148,163,184,.22)}.devx-table-wrap td{padding:12px 10px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px;vertical-align:top}.devx-table-wrap strong{font-weight:1000}.devx-empty{grid-column:1/-1;margin:0;padding:18px;border-radius:20px;background:#f8fafc;color:var(--muted,#64748b);font-size:13px;text-align:center;border:1px dashed rgba(148,163,184,.35)}.devx-legend{display:flex;flex-wrap:wrap;gap:8px;padding-top:8px}.devx-legend span{display:inline-flex;align-items:center;gap:6px;min-height:28px;border-radius:999px;padding:0 9px;background:#f8fafc;border:1px solid rgba(148,163,184,.18);color:#475569;font-size:11px;font-weight:900}.devx-legend i{width:9px;height:9px;border-radius:999px}@media(min-width:520px){.devx-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devx-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.devx-meta-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:760px){.devx-card-grid,.devx-chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:920px){.devx-page{padding:14px}.devx-hero{grid-template-columns:1fr auto;align-items:end;padding:24px}.devx-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.devx-toolbar{grid-template-columns:2fr repeat(4,minmax(130px,1fr)) auto}.devx-main-grid{grid-template-columns:1.3fr .7fr}}@media(min-width:1180px){.devx-card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
