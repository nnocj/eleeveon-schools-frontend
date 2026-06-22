"use client";

/**
 * app/developer/modules/DeveloperSubscriptions.tsx
 * ---------------------------------------------------------
 * DEVELOPER SUBSCRIPTIONS
 * ---------------------------------------------------------
 * Mobile-first subscription management with cards, table,
 * filters and analytics charts.
 *
 * Requires:
 * npm install recharts
 */

import React, { useEffect, useMemo, useState } from "react";
import {
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

type Props = { navigate?: (key: string) => void };
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "orange" | "red" | "gray";

type AccountRow = { id: string; name: string; email?: string | null };
type PlanRow = { id: string; name: string; code: string; currency?: string; priceMonthly?: number; priceYearly?: number; active?: boolean };
type SubscriptionRow = {
  id: string;
  accountId: string;
  planId?: string;
  status: string;
  billingCycle?: string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  account?: AccountRow;
  plan?: PlanRow;
};

const colors = ["var(--dev-primary)", "#0f172a", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2"];

const money = (amount: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));

const dateText = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "short", day: "2-digit" }).format(date);
};

const safeTime = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const statusTone = (status?: string): Tone => {
  const key = String(status || "").toLowerCase();
  if (["active", "trial"].includes(key)) return "green";
  if (["past_due", "expired"].includes(key)) return "orange";
  if (["cancelled", "suspended"].includes(key)) return "red";
  return "gray";
};

const countBy = <T,>(rows: T[], getKey: (row: T) => string | null | undefined) => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

const monthLabels = (count = 6) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(date);
  });
};

const monthKey = (value?: string | null) => {
  const time = safeTime(value);
  if (!time) return "Unknown";
  return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(new Date(time));
};

export default function DeveloperSubscriptions({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [cycle, setCycle] = useState("all");
  const [planId, setPlanId] = useState("all");
  const [endingSoon, setEndingSoon] = useState(false);

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      const [subscriptionsData, plansData] = await Promise.all([
        apiClient<SubscriptionRow[]>("/billing/subscriptions").catch(() => []),
        apiClient<PlanRow[]>("/billing/plans?includeInactive=true").catch(() => []),
      ]);
      setRows(Array.isArray(subscriptionsData) ? subscriptionsData : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch (err: any) {
      setError(err?.message || "Could not load subscriptions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  const planNames = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name || plan.code])), [plans]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const now = Date.now();
    const soon = now + 1000 * 60 * 60 * 24 * 30;

    return rows.filter((row) => {
      const name = row.account?.name || row.accountId || "";
      const plan = row.plan?.name || (row.planId ? planNames.get(row.planId) : "") || "";
      const haystack = `${name} ${plan} ${row.status} ${row.billingCycle}`.toLowerCase();
      const statusOk = status === "all" || String(row.status || "").toLowerCase() === status;
      const cycleOk = cycle === "all" || String(row.billingCycle || "").toLowerCase() === cycle;
      const planOk = planId === "all" || row.planId === planId || row.plan?.id === planId;
      const searchOk = !term || haystack.includes(term);
      const endTime = safeTime(row.currentPeriodEnd || row.trialEndsAt || row.nextBillingDate);
      const soonOk = !endingSoon || (!!endTime && endTime >= now && endTime <= soon);
      return statusOk && cycleOk && planOk && searchOk && soonOk;
    }).sort((a, b) => safeTime(b.updatedAt || b.createdAt || b.currentPeriodEnd) - safeTime(a.updatedAt || a.createdAt || a.currentPeriodEnd));
  }, [rows, query, status, cycle, planId, endingSoon, planNames]);

  const active = rows.filter((row) => ["active", "trial"].includes(String(row.status || "").toLowerCase())).length;
  const risky = rows.filter((row) => ["past_due", "expired", "suspended"].includes(String(row.status || "").toLowerCase())).length;
  const cancelled = rows.filter((row) => String(row.status || "").toLowerCase() === "cancelled").length;

  const statusChart = useMemo(() => countBy(rows, (row) => row.status), [rows]);
  const cycleChart = useMemo(() => countBy(rows, (row) => row.billingCycle || "monthly"), [rows]);
  const planChart = useMemo(() => countBy(rows, (row) => row.plan?.name || (row.planId ? planNames.get(row.planId) : undefined) || "No plan"), [rows, planNames]);

  const trendChart = useMemo(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));
    rows.forEach((row) => {
      const key = monthKey(row.createdAt || row.updatedAt || row.currentPeriodStart);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    return labels.map((label) => ({ label, subscriptions: map.get(label) || 0 }));
  }, [rows]);

  const mrrEstimate = useMemo(() => {
    return rows
      .filter((row) => ["active", "trial"].includes(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => {
        const plan = row.plan || plans.find((item) => item.id === row.planId);
        if (!plan) return sum;
        const cycleKey = String(row.billingCycle || "monthly").toLowerCase();
        if (cycleKey === "yearly") return sum + Number(plan.priceYearly || 0) / 12;
        return sum + Number(plan.priceMonthly || 0);
      }, 0);
  }, [rows, plans]);

  if (loading || accountLoading) return <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}><style>{css}</style><StateCard title="Loading subscriptions..." text="Preparing subscription status, renewals and analytics." /></main>;
  if (!authenticated || !accountId) return <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}><style>{css}</style><StateCard title="Developer access required" text="Sign in with a developer account to manage subscriptions." /></main>;

  return (
    <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <Header eyebrow="SaaS control" title="Subscriptions" description="Track trials, active subscriptions, renewals, billing cycles and subscription risk." viewMode={viewMode} onViewMode={setViewMode} onRefresh={() => load(true)} refreshing={refreshing} actions={<button className="devmod-primary-btn" onClick={() => navigate?.("plans")} type="button">Manage Plans</button>} />
      {error && <div className="devmod-error">{error}</div>}

      <section className="devmod-stat-grid">
        <Stat label="Total" value={rows.length} detail={`${filtered.length} after filters`} icon="🔁" />
        <Stat label="Active/Trial" value={active} detail="Currently enabled" icon="✅" />
        <Stat label="Risky" value={risky} detail="Past due / expired / suspended" icon="⚠️" />
        <Stat label="MRR Estimate" value={money(mrrEstimate)} detail={`${cancelled} cancelled`} icon="📈" />
      </section>

      <section className="devmod-filters">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search account, plan, status..." />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option>
        </select>
        <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
          <option value="all">All cycles</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="manual">Manual</option>
        </select>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="all">All plans</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <label className="devmod-check"><input type="checkbox" checked={endingSoon} onChange={(e) => setEndingSoon(e.target.checked)} /> Ending in 30 days</label>
        <button type="button" onClick={() => { setQuery(""); setStatus("all"); setCycle("all"); setPlanId("all"); setEndingSoon(false); }}>Reset</button>
      </section>

      {viewMode === "analytics" ? (
        <section className="devmod-chart-grid">
          <ChartCard title="Subscription starts" description="Subscriptions created or updated in the last six months.">
            <ResponsiveContainer width="100%" height={260}><BarChart data={trendChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="subscriptions" fill="var(--dev-primary)" radius={[12,12,0,0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Status breakdown" description="Subscription health by current status.">
            <ResponsiveContainer width="100%" height={260}><PieChart><Tooltip /><Pie data={statusChart} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>{statusChart.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart></ResponsiveContainer><Legend rows={statusChart} />
          </ChartCard>
          <ChartCard title="Plan adoption" description="Which packages clients are subscribed to.">
            <ResponsiveContainer width="100%" height={260}><BarChart data={planChart} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11}/><YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={95}/><Tooltip /><Bar dataKey="value" fill="var(--dev-primary)" radius={[0,12,12,0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Billing cycles" description="Monthly, yearly and manual subscription mix.">
            <ResponsiveContainer width="100%" height={260}><PieChart><Tooltip /><Pie data={cycleChart} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>{cycleChart.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart></ResponsiveContainer><Legend rows={cycleChart} />
          </ChartCard>
        </section>
      ) : viewMode === "table" ? (
        <section className="devmod-table-card"><div className="devmod-table-wrap"><table><thead><tr><th>Account</th><th>Plan</th><th>Status</th><th>Cycle</th><th>Period End</th><th>Next Billing</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><strong>{row.account?.name || row.accountId}</strong></td><td>{row.plan?.name || (row.planId ? planNames.get(row.planId) : "No plan") || "No plan"}</td><td><Chip tone={statusTone(row.status)}>{row.status}</Chip></td><td>{row.billingCycle || "monthly"}</td><td>{dateText(row.currentPeriodEnd || row.trialEndsAt)}</td><td>{dateText(row.nextBillingDate)}</td></tr>)}</tbody></table></div>{!filtered.length && <Empty text="No subscriptions match your filters." />}</section>
      ) : (
        <section className="devmod-card-grid">
          {filtered.map((row) => {
            const plan = row.plan || plans.find((item) => item.id === row.planId);
            return <article key={row.id} className="devmod-record-card"><div className="devmod-record-top"><span className="devmod-avatar">🔁</span><Chip tone={statusTone(row.status)}>{row.status}</Chip></div><h3>{row.account?.name || "Client account"}</h3><p>{plan?.name || "No plan linked"} · {row.billingCycle || "monthly"}</p><div className="devmod-meta-grid"><span><b>Period end</b>{dateText(row.currentPeriodEnd || row.trialEndsAt)}</span><span><b>Next billing</b>{dateText(row.nextBillingDate)}</span><span><b>Estimate</b>{money(String(row.billingCycle).toLowerCase() === "yearly" ? Number(plan?.priceYearly || 0) : Number(plan?.priceMonthly || 0), plan?.currency || "GHS")}</span></div>{row.cancelReason && <p className="devmod-note">{row.cancelReason}</p>}<button type="button" onClick={() => navigate?.("invoices")}>View billing records</button></article>;
          })}
          {!filtered.length && <Empty text="No subscriptions match your filters." />}
        </section>
      )}
    </main>
  );
}

function Header({ eyebrow, title, description, viewMode, onViewMode, onRefresh, refreshing, actions }: { eyebrow: string; title: string; description: string; viewMode: ViewMode; onViewMode: (mode: ViewMode) => void; onRefresh: () => void; refreshing: boolean; actions?: React.ReactNode }) {
  return <section className="devmod-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="devmod-header-actions"><div className="devmod-switch"><button className={viewMode === "cards" ? "active" : ""} onClick={() => onViewMode("cards")} type="button">Cards</button><button className={viewMode === "table" ? "active" : ""} onClick={() => onViewMode("table")} type="button">Table</button><button className={viewMode === "analytics" ? "active" : ""} onClick={() => onViewMode("analytics")} type="button">Charts</button></div>{actions}<button className="devmod-soft-btn" type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button></div></section>;
}
function StateCard({ title, text }: { title: string; text: string }) { return <section className="devmod-state"><div className="devmod-spinner" /><h2>{title}</h2><p>{text}</p></section>; }
function Stat({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: string }) { return <article className="devmod-stat"><span>{label}<b>{icon}</b></span><strong>{value}</strong><small>{detail}</small></article>; }
function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) { return <span className={`devmod-chip ${tone}`}>{children}</span>; }
function Empty({ text }: { text: string }) { return <div className="devmod-empty">{text}</div>; }
function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="devmod-chart-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>; }
function Legend({ rows }: { rows: { label: string; value: number }[] }) { return <div className="devmod-legend">{rows.map((row, i) => <span key={row.label}><i style={{ background: colors[i % colors.length] }} />{row.label}: {row.value}</span>)}</div>; }

const css = `
@keyframes devmodSpin{to{transform:rotate(360deg)}}.devmod-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--dev-primary) 10%,transparent),transparent 34rem),var(--bg,#f8fafc);color:var(--text,#0f172a);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow-x:hidden}.devmod-page *{box-sizing:border-box}.devmod-page button,.devmod-page input,.devmod-page select{font:inherit;max-width:100%}.devmod-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 24px 70px rgba(15,23,42,.08);text-align:center}.devmod-state h2{margin:0;font-size:clamp(18px,5vw,24px);font-weight:1000;letter-spacing:-.04em}.devmod-state p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.devmod-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--dev-primary) 18%,transparent);border-top-color:var(--dev-primary);animation:devmodSpin .8s linear infinite}.devmod-header{display:grid;gap:16px;border-radius:30px;padding:18px;color:#fff;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.18),transparent 20rem),linear-gradient(135deg,var(--dev-primary),#0f172a 72%);box-shadow:0 24px 70px rgba(15,23,42,.18);overflow:hidden}.devmod-header span{font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.14em;opacity:.82}.devmod-header h1{margin:8px 0 0;font-size:clamp(28px,8vw,44px);line-height:1.02;font-weight:1000;letter-spacing:-.07em}.devmod-header p{max-width:760px;margin:10px 0 0;font-size:13px;line-height:1.6;opacity:.9}.devmod-header-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.devmod-switch{display:inline-flex;gap:5px;padding:5px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(14px)}.devmod-switch button{min-height:34px;border:0;border-radius:999px;padding:0 11px;background:transparent;color:rgba(255,255,255,.75);font-size:12px;font-weight:1000;cursor:pointer}.devmod-switch button.active{background:#fff;color:#0f172a;box-shadow:0 10px 24px rgba(15,23,42,.16)}.devmod-primary-btn,.devmod-soft-btn{min-height:40px;border:0;border-radius:999px;padding:0 13px;font-size:12px;font-weight:950;cursor:pointer}.devmod-primary-btn{background:#fff;color:#0f172a}.devmod-soft-btn{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff}.devmod-error{margin-top:10px;padding:12px 14px;border-radius:20px;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:850}.devmod-stat-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devmod-stat{border:1px solid rgba(148,163,184,.22);border-radius:24px;padding:16px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devmod-stat span{display:flex;justify-content:space-between;gap:10px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devmod-stat strong{display:block;margin-top:8px;font-size:clamp(24px,8vw,34px);line-height:1;font-weight:1000;letter-spacing:-.06em}.devmod-stat small{display:block;margin-top:8px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devmod-filters{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;padding:10px;border-radius:24px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 18px 45px rgba(15,23,42,.05)}.devmod-filters input,.devmod-filters select{min-height:42px;width:100%;border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;font-weight:800}.devmod-filters button{min-height:42px;border:0;border-radius:16px;background:color-mix(in srgb,var(--dev-primary) 10%,white);color:var(--dev-primary);font-size:13px;font-weight:1000;cursor:pointer}.devmod-check{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 12px;border-radius:16px;background:#f8fafc;color:#475569;font-size:12px;font-weight:900}.devmod-card-grid,.devmod-chart-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devmod-record-card,.devmod-chart-card,.devmod-table-card{min-width:0;border:1px solid rgba(148,163,184,.22);border-radius:26px;padding:14px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devmod-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.devmod-avatar{width:42px;height:42px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--dev-primary),#0f172a);color:#fff;font-weight:1000}.devmod-record-card h3{margin:14px 0 0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devmod-record-card p{margin:5px 0 0;color:var(--muted,#64748b);font-size:13px;line-height:1.45}.devmod-note{padding:10px;border-radius:16px;background:#fff7ed;color:#9a3412!important}.devmod-meta-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}.devmod-meta-grid span{padding:10px;border-radius:16px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:850}.devmod-meta-grid b{display:block;color:var(--muted,#64748b);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.devmod-record-card button{width:100%;min-height:40px;margin-top:14px;border:0;border-radius:999px;background:var(--dev-primary);color:#fff;font-size:12px;font-weight:1000;cursor:pointer}.devmod-chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:1000;white-space:nowrap}.devmod-chip.green{background:#dcfce7;color:#166534}.devmod-chip.blue{background:#dbeafe;color:#1d4ed8}.devmod-chip.orange{background:#ffedd5;color:#c2410c}.devmod-chip.red{background:#fee2e2;color:#b91c1c}.devmod-chip.gray{background:#f1f5f9;color:#475569}.devmod-table-wrap{width:100%;overflow-x:auto}.devmod-table-wrap table{width:100%;min-width:850px;border-collapse:collapse}.devmod-table-wrap th{text-align:left;color:var(--muted,#64748b);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:10px;border-bottom:1px solid rgba(148,163,184,.22)}.devmod-table-wrap td{padding:12px 10px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px}.devmod-table-wrap strong{font-weight:1000}.devmod-chart-card h2{margin:0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devmod-chart-card p{margin:5px 0 10px;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.devmod-legend{display:flex;flex-wrap:wrap;gap:8px;padding-top:8px}.devmod-legend span{display:inline-flex;align-items:center;gap:6px;min-height:28px;border-radius:999px;padding:0 9px;background:#f8fafc;border:1px solid rgba(148,163,184,.18);color:#475569;font-size:11px;font-weight:900}.devmod-legend i{width:9px;height:9px;border-radius:999px}.devmod-empty{grid-column:1/-1;margin:0;padding:18px;border-radius:20px;background:#f8fafc;color:var(--muted,#64748b);font-size:13px;text-align:center;border:1px dashed rgba(148,163,184,.35)}@media(min-width:520px){.devmod-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devmod-meta-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.devmod-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:820px){.devmod-page{padding:14px}.devmod-header{padding:24px;grid-template-columns:1fr auto;align-items:end}.devmod-card-grid,.devmod-chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devmod-filters{grid-template-columns:2fr repeat(4,1fr) auto}.devmod-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
