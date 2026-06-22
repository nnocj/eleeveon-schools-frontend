"use client";

/**
 * app/developer/modules/DeveloperInvoices.tsx
 * ---------------------------------------------------------
 * DEVELOPER INVOICES
 * ---------------------------------------------------------
 * Mobile-first invoice management with cards, table,
 * date filters, status filters and analytics charts.
 *
 * Requires:
 * npm install recharts
 */

import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";

type Props = { navigate?: (key: string) => void };
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "orange" | "red" | "gray";

type AccountRow = { id: string; name: string; email?: string | null };
type InvoiceRow = {
  id: string;
  accountId: string;
  subscriptionId?: string | null;
  invoiceNumber?: string;
  currency?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total: number;
  status: string;
  dueDate?: string | null;
  paidAt?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  account?: AccountRow;
};

const colors = ["var(--dev-primary)", "#0f172a", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2"];
const money = (amount: number, currency = "GHS") => new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
const safeTime = (value?: string | null) => { if (!value) return 0; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; };
const dateText = (value?: string | null) => { if (!value) return "Not set"; const d = new Date(value); if (Number.isNaN(d.getTime())) return "Not set"; return new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "short", day: "2-digit" }).format(d); };
const statusTone = (status?: string): Tone => { const k = String(status || "").toLowerCase(); if (k === "paid") return "green"; if (["issued", "draft"].includes(k)) return "blue"; if (k === "overdue") return "orange"; if (k === "void") return "red"; return "gray"; };
const countBy = <T,>(rows: T[], getKey: (row: T) => string | null | undefined) => { const map = new Map<string, number>(); rows.forEach((row) => { const key = String(getKey(row) || "Unknown").trim() || "Unknown"; map.set(key, (map.get(key) || 0) + 1); }); return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value); };
const monthLabels = (count = 6) => { const now = new Date(); return Array.from({ length: count }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1); return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(d); }); };
const monthKey = (value?: string | null) => { const t = safeTime(value); if (!t) return "Unknown"; return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(new Date(t)); };

export default function DeveloperInvoices({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dateField, setDateField] = useState<"created" | "due" | "paid">("created");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      const data = await apiClient<InvoiceRow[]>("/billing/invoices").catch(() => []);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Could not load invoices.");
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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).setHours(23,59,59,999) : 0;

    return rows.filter((row) => {
      const haystack = `${row.invoiceNumber || ""} ${row.account?.name || ""} ${row.status || ""} ${row.note || ""}`.toLowerCase();
      const statusOk = status === "all" || String(row.status || "").toLowerCase() === status;
      const searchOk = !term || haystack.includes(term);
      const value = dateField === "due" ? row.dueDate : dateField === "paid" ? row.paidAt : row.createdAt || row.updatedAt;
      const time = safeTime(value);
      const fromOk = !from || time >= from;
      const toOk = !to || time <= to;
      return statusOk && searchOk && fromOk && toOk;
    }).sort((a,b) => safeTime(b.createdAt || b.updatedAt) - safeTime(a.createdAt || a.updatedAt));
  }, [rows, query, status, dateField, dateFrom, dateTo]);

  const totalValue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const paidValue = rows.filter((row) => String(row.status).toLowerCase() === "paid").reduce((sum, row) => sum + Number(row.total || 0), 0);
  const openValue = rows.filter((row) => ["issued", "draft", "overdue"].includes(String(row.status).toLowerCase())).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const overdueCount = rows.filter((row) => String(row.status).toLowerCase() === "overdue").length;

  const statusChart = useMemo(() => countBy(rows, (row) => row.status), [rows]);
  const valueByStatusChart = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = String(row.status || "Unknown");
      map.set(key, (map.get(key) || 0) + Number(row.total || 0));
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value);
  }, [rows]);

  const monthlyChart = useMemo(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));
    rows.forEach((row) => {
      const key = monthKey(row.createdAt || row.updatedAt);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + Number(row.total || 0));
    });
    return labels.map((label) => ({ label, total: map.get(label) || 0 }));
  }, [rows]);

  if (loading || accountLoading) return <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}><style>{css}</style><StateCard title="Loading invoices..." text="Preparing invoice records, dates and charts." /></main>;
  if (!authenticated || !accountId) return <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}><style>{css}</style><StateCard title="Developer access required" text="Sign in with a developer account to manage invoices." /></main>;

  return (
    <main className="devmod-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <Header eyebrow="Platform billing" title="Invoices" description="Review invoices by status, date, value and client account. Switch between card, table and chart views." viewMode={viewMode} onViewMode={setViewMode} onRefresh={() => load(true)} refreshing={refreshing} actions={<button className="devmod-primary-btn" type="button" onClick={() => navigate?.("payments")}>View Payments</button>} />
      {error && <div className="devmod-error">{error}</div>}

      <section className="devmod-stat-grid">
        <Stat label="Invoices" value={rows.length} detail={`${filtered.length} after filters`} icon="🧾" />
        <Stat label="Total Value" value={money(totalValue)} detail="All invoice records" icon="📊" />
        <Stat label="Paid Value" value={money(paidValue)} detail="Collected invoices" icon="✅" />
        <Stat label="Open / Overdue" value={money(openValue)} detail={`${overdueCount} overdue`} icon="⚠️" />
      </section>

      <section className="devmod-filters">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, account, note..." />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="issued">Issued</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option>
        </select>
        <select value={dateField} onChange={(e) => setDateField(e.target.value as any)}>
          <option value="created">Created date</option><option value="due">Due date</option><option value="paid">Paid date</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button type="button" onClick={() => { setQuery(""); setStatus("all"); setDateField("created"); setDateFrom(""); setDateTo(""); }}>Reset</button>
      </section>

      {viewMode === "analytics" ? (
        <section className="devmod-chart-grid">
          <ChartCard title="Invoice value over time" description="Total invoice value created during the last six months.">
            <ResponsiveContainer width="100%" height={260}><BarChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11}/><YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v)=>Intl.NumberFormat("en-GH",{notation:"compact"}).format(Number(v))}/><Tooltip formatter={(v)=>money(Number(v))}/><Bar dataKey="total" fill="var(--dev-primary)" radius={[12,12,0,0]}/></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Invoice status count" description="How many invoices are draft, issued, paid, overdue or void.">
            <ResponsiveContainer width="100%" height={260}><PieChart><Tooltip/><Pie data={statusChart} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={3}>{statusChart.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie></PieChart></ResponsiveContainer><Legend rows={statusChart}/>
          </ChartCard>
          <ChartCard title="Value by status" description="Amount locked in each invoice status.">
            <ResponsiveContainer width="100%" height={260}><BarChart data={valueByStatusChart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11}/><YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v)=>Intl.NumberFormat("en-GH",{notation:"compact"}).format(Number(v))}/><Tooltip formatter={(v)=>money(Number(v))}/><Bar dataKey="value" fill="var(--dev-primary)" radius={[12,12,0,0]}/></BarChart></ResponsiveContainer>
          </ChartCard>
        </section>
      ) : viewMode === "table" ? (
        <section className="devmod-table-card"><div className="devmod-table-wrap"><table><thead><tr><th>Invoice</th><th>Account</th><th>Total</th><th>Status</th><th>Due</th><th>Paid</th></tr></thead><tbody>{filtered.map((row)=><tr key={row.id}><td><strong>{row.invoiceNumber || row.id.slice(0,8)}</strong></td><td>{row.account?.name || row.accountId}</td><td>{money(row.total,row.currency||"GHS")}</td><td><Chip tone={statusTone(row.status)}>{row.status}</Chip></td><td>{dateText(row.dueDate)}</td><td>{dateText(row.paidAt)}</td></tr>)}</tbody></table></div>{!filtered.length && <Empty text="No invoices match your filters." />}</section>
      ) : (
        <section className="devmod-card-grid">
          {filtered.map((row)=><article key={row.id} className="devmod-record-card"><div className="devmod-record-top"><span className="devmod-avatar">🧾</span><Chip tone={statusTone(row.status)}>{row.status}</Chip></div><h3>{row.invoiceNumber || "Invoice"}</h3><p>{row.account?.name || row.accountId}</p><div className="devmod-meta-grid"><span><b>Total</b>{money(row.total,row.currency||"GHS")}</span><span><b>Due</b>{dateText(row.dueDate)}</span><span><b>Paid</b>{dateText(row.paidAt)}</span></div>{row.note && <p className="devmod-note">{row.note}</p>}<button type="button" onClick={()=>navigate?.("payments")}>View related payments</button></article>)}
          {!filtered.length && <Empty text="No invoices match your filters." />}
        </section>
      )}
    </main>
  );
}

function Header({ eyebrow, title, description, viewMode, onViewMode, onRefresh, refreshing, actions }: { eyebrow: string; title: string; description: string; viewMode: ViewMode; onViewMode: (mode: ViewMode) => void; onRefresh: () => void; refreshing: boolean; actions?: React.ReactNode }) { return <section className="devmod-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="devmod-header-actions"><div className="devmod-switch"><button className={viewMode==="cards"?"active":""} onClick={()=>onViewMode("cards")} type="button">Cards</button><button className={viewMode==="table"?"active":""} onClick={()=>onViewMode("table")} type="button">Table</button><button className={viewMode==="analytics"?"active":""} onClick={()=>onViewMode("analytics")} type="button">Charts</button></div>{actions}<button className="devmod-soft-btn" type="button" onClick={onRefresh} disabled={refreshing}>{refreshing?"Refreshing...":"Refresh"}</button></div></section>; }
function StateCard({ title, text }: { title:string; text:string }) { return <section className="devmod-state"><div className="devmod-spinner"/><h2>{title}</h2><p>{text}</p></section>; }
function Stat({ label, value, detail, icon }: { label:string; value:string|number; detail:string; icon:string }) { return <article className="devmod-stat"><span>{label}<b>{icon}</b></span><strong>{value}</strong><small>{detail}</small></article>; }
function Chip({ children, tone="gray" }: { children:React.ReactNode; tone?:Tone }) { return <span className={`devmod-chip ${tone}`}>{children}</span>; }
function Empty({ text }: { text:string }) { return <div className="devmod-empty">{text}</div>; }
function ChartCard({ title, description, children }: { title:string; description:string; children:React.ReactNode }) { return <section className="devmod-chart-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>; }
function Legend({ rows }: { rows:{label:string; value:number}[] }) { return <div className="devmod-legend">{rows.map((row,i)=><span key={row.label}><i style={{background:colors[i%colors.length]}}/>{row.label}: {row.value}</span>)}</div>; }

const css = `
@keyframes devmodSpin{to{transform:rotate(360deg)}}.devmod-page{min-height:100dvh;width:100%;max-width:100%;padding:8px;padding-bottom:max(28px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--dev-primary) 10%,transparent),transparent 34rem),var(--bg,#f8fafc);color:var(--text,#0f172a);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow-x:hidden}.devmod-page *{box-sizing:border-box}.devmod-page button,.devmod-page input,.devmod-page select{font:inherit;max-width:100%}.devmod-state{min-height:min(420px,calc(100dvh - 32px));display:grid;place-items:center;align-content:center;gap:10px;width:min(520px,100%);margin:0 auto;padding:22px;border-radius:28px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 24px 70px rgba(15,23,42,.08);text-align:center}.devmod-state h2{margin:0;font-size:clamp(18px,5vw,24px);font-weight:1000;letter-spacing:-.04em}.devmod-state p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.devmod-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--dev-primary) 18%,transparent);border-top-color:var(--dev-primary);animation:devmodSpin .8s linear infinite}.devmod-header{display:grid;gap:16px;border-radius:30px;padding:18px;color:#fff;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.18),transparent 20rem),linear-gradient(135deg,var(--dev-primary),#0f172a 72%);box-shadow:0 24px 70px rgba(15,23,42,.18);overflow:hidden}.devmod-header span{font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.14em;opacity:.82}.devmod-header h1{margin:8px 0 0;font-size:clamp(28px,8vw,44px);line-height:1.02;font-weight:1000;letter-spacing:-.07em}.devmod-header p{max-width:760px;margin:10px 0 0;font-size:13px;line-height:1.6;opacity:.9}.devmod-header-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.devmod-switch{display:inline-flex;gap:5px;padding:5px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(14px)}.devmod-switch button{min-height:34px;border:0;border-radius:999px;padding:0 11px;background:transparent;color:rgba(255,255,255,.75);font-size:12px;font-weight:1000;cursor:pointer}.devmod-switch button.active{background:#fff;color:#0f172a;box-shadow:0 10px 24px rgba(15,23,42,.16)}.devmod-primary-btn,.devmod-soft-btn{min-height:40px;border:0;border-radius:999px;padding:0 13px;font-size:12px;font-weight:950;cursor:pointer}.devmod-primary-btn{background:#fff;color:#0f172a}.devmod-soft-btn{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff}.devmod-error{margin-top:10px;padding:12px 14px;border-radius:20px;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:850}.devmod-stat-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devmod-stat{border:1px solid rgba(148,163,184,.22);border-radius:24px;padding:16px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devmod-stat span{display:flex;justify-content:space-between;gap:10px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devmod-stat strong{display:block;margin-top:8px;font-size:clamp(24px,8vw,34px);line-height:1;font-weight:1000;letter-spacing:-.06em}.devmod-stat small{display:block;margin-top:8px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.devmod-filters{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;padding:10px;border-radius:24px;background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 18px 45px rgba(15,23,42,.05)}.devmod-filters input,.devmod-filters select{min-height:42px;width:100%;border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;font-weight:800}.devmod-filters button{min-height:42px;border:0;border-radius:16px;background:color-mix(in srgb,var(--dev-primary) 10%,white);color:var(--dev-primary);font-size:13px;font-weight:1000;cursor:pointer}.devmod-card-grid,.devmod-chart-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.devmod-record-card,.devmod-chart-card,.devmod-table-card{min-width:0;border:1px solid rgba(148,163,184,.22);border-radius:26px;padding:14px;background:var(--surface,#fff);box-shadow:0 18px 45px rgba(15,23,42,.06)}.devmod-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.devmod-avatar{width:42px;height:42px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--dev-primary),#0f172a);color:#fff;font-weight:1000}.devmod-record-card h3{margin:14px 0 0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devmod-record-card p{margin:5px 0 0;color:var(--muted,#64748b);font-size:13px;line-height:1.45}.devmod-note{padding:10px;border-radius:16px;background:#f8fafc;color:#475569!important}.devmod-meta-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}.devmod-meta-grid span{padding:10px;border-radius:16px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:850}.devmod-meta-grid b{display:block;color:var(--muted,#64748b);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.devmod-record-card button{width:100%;min-height:40px;margin-top:14px;border:0;border-radius:999px;background:var(--dev-primary);color:#fff;font-size:12px;font-weight:1000;cursor:pointer}.devmod-chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:1000;white-space:nowrap}.devmod-chip.green{background:#dcfce7;color:#166534}.devmod-chip.blue{background:#dbeafe;color:#1d4ed8}.devmod-chip.orange{background:#ffedd5;color:#c2410c}.devmod-chip.red{background:#fee2e2;color:#b91c1c}.devmod-chip.gray{background:#f1f5f9;color:#475569}.devmod-table-wrap{width:100%;overflow-x:auto}.devmod-table-wrap table{width:100%;min-width:850px;border-collapse:collapse}.devmod-table-wrap th{text-align:left;color:var(--muted,#64748b);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:10px;border-bottom:1px solid rgba(148,163,184,.22)}.devmod-table-wrap td{padding:12px 10px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px}.devmod-table-wrap strong{font-weight:1000}.devmod-chart-card h2{margin:0;font-size:17px;font-weight:1000;letter-spacing:-.04em}.devmod-chart-card p{margin:5px 0 10px;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.devmod-legend{display:flex;flex-wrap:wrap;gap:8px;padding-top:8px}.devmod-legend span{display:inline-flex;align-items:center;gap:6px;min-height:28px;border-radius:999px;padding:0 9px;background:#f8fafc;border:1px solid rgba(148,163,184,.18);color:#475569;font-size:11px;font-weight:900}.devmod-legend i{width:9px;height:9px;border-radius:999px}.devmod-empty{grid-column:1/-1;margin:0;padding:18px;border-radius:20px;background:#f8fafc;color:var(--muted,#64748b);font-size:13px;text-align:center;border:1px dashed rgba(148,163,184,.35)}@media(min-width:520px){.devmod-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devmod-meta-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.devmod-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:820px){.devmod-page{padding:14px}.devmod-header{padding:24px;grid-template-columns:1fr auto;align-items:end}.devmod-card-grid,.devmod-chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devmod-filters{grid-template-columns:2fr repeat(4,1fr) auto}.devmod-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
