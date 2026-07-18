"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db/db";
import { listCalendarEvents } from "../lib/calendar";
import { listOpenScheduleConflicts } from "../lib/scheduling";

type ViewMode = "cards" | "table" | "analytics";
type AnyRow = Record<string, any>;

function n(value: any) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function now() {
  return Date.now();
}

function text(value: any, fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function dateLabel(value?: number | string) {
  if (!value) return "Not set";
  const stamp = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(stamp)) return "Not set";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(stamp));
  } catch {
    return "Not set";
  }
}

function rowName(row: AnyRow) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

async function safeArray(tableName: string) {
  const table = (db as any)[tableName];
  if (!table?.toArray) return [];
  return table.toArray();
}

function userIdOf(row?: AnyRow) {
  return row?.id || row?.localId;
}

function membershipUserId(row?: AnyRow) {
  return String(row?.userLocalId || row?.userId || row?.accountUserId || "");
}

function accountMatch(row: AnyRow, accountId?: string | null) {
  return !row?.isDeleted && (!row?.accountId || row.accountId === accountId);
}

async function resolveOwnerContext(accountId?: string | null) {
  const [memberships, users] = await Promise.all([
    safeArray("userMemberships").then(async (x) => x.length ? x : safeArray("memberships")),
    safeArray("users").then(async (x) => x.length ? x : safeArray("accountUsers")),
  ]);

  const activeEmail = typeof window !== "undefined"
    ? String(localStorage.getItem("email") || localStorage.getItem("userEmail") || "").toLowerCase()
    : "";

  const membership = (memberships as AnyRow[]).find((m) =>
    ["owner", "admin", "super_admin"].includes(String(m.role)) && accountMatch(m, accountId)
  );

  const user = (users as AnyRow[]).find((row) =>
    String(userIdOf(row) || "") === membershipUserId(membership) ||
    Boolean(activeEmail && String(row.email || "").toLowerCase() === activeEmail) ||
    Boolean(membership?.email && String(row.email || "").toLowerCase() === String(membership.email).toLowerCase())
  );

  return { owner: { ...(membership || {}), ...(user || {}), role: membership?.role || "owner" }, user, membership };
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`op-chip ${tone}`}>{children}</span>;
}

function SummaryCard({ label, value, icon, positive, warning }: { label: string; value: React.ReactNode; icon: string; positive?: boolean; warning?: boolean }) {
  return (
    <article className={`op-summary ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div>{icon}</div>
      <section><strong>{value}</strong><span>{label}</span></section>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="op-mini"><strong>{value}</strong><span>{label}</span></div>;
}

function EmptyCard({ title = "No records", text }: { title?: string; text: string }) {
  return <section className="op-empty"><div>📌</div><h3>{title}</h3><p>{text}</p></section>;
}

function Toolbar({ view, setView, count }: { view: ViewMode; setView: (v: ViewMode) => void; count: number }) {
  return (
    <section className="op-toolbar">
      <div className="op-tabs">
        <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Cards</button>
        <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
        <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>Analytics</button>
      </div>
      <Chip>{count} shown</Chip>
    </section>
  );
}

const css = `
.op-page{min-height:100dvh;width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(32px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--op-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.op-page *{box-sizing:border-box}.op-page button,.op-page input,.op-page select,.op-page textarea{font:inherit;max-width:100%}.op-page input,.op-page select,.op-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111));outline:none;font-weight:750}.op-page textarea{min-height:120px;padding:12px;resize:vertical;line-height:1.55}.op-state{min-height:min(420px,calc(100dvh - 32px));width:min(480px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:var(--shell-shadow,0 24px 60px rgba(15,23,42,.08));text-align:center}.op-state h2{margin:0;font-size:22px;letter-spacing:-.04em;font-weight:1000}.op-state p{margin:0;color:var(--muted,#64748b);line-height:1.6}.op-hero{display:flex;align-items:stretch;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:radial-gradient(circle at 18% 8%,color-mix(in srgb,var(--op-primary) 16%,transparent),transparent 20rem),linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--op-primary) 7%,var(--card-bg,#fff)) 72%);border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 18px 46px rgba(15,23,42,.07);overflow:hidden}.op-hero-left{min-width:0;display:flex;align-items:center;gap:10px;flex:1}.op-icon{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;background:var(--op-primary);color:#fff;font-size:22px;box-shadow:0 12px 26px color-mix(in srgb,var(--op-primary) 28%,transparent)}.op-title{min-width:0}.op-title p,.op-title h2,.op-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.op-title p{margin:0 0 2px;color:var(--op-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.op-title h2{margin:0;color:var(--text,#111);font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em;line-height:1}.op-title span{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:750}.op-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.op-btn,.op-primary{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}.op-btn{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111)}.op-primary{border:0;background:var(--op-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--op-primary) 25%,transparent)}.op-summary-grid,.op-list,.op-mini-grid,.op-breakdown-grid{display:grid;gap:8px}.op-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.op-summary,.op-card,.op-panel,.op-toolbar,.op-filter,.op-empty,.op-breakdown{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.op-summary{min-width:0;display:flex;align-items:center;gap:10px;padding:12px;border-radius:22px;overflow:hidden}.op-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.10),var(--card-bg,var(--surface,#fff)))}.op-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.10),var(--card-bg,var(--surface,#fff)))}.op-summary>div:first-child{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--op-primary) 12%,var(--surface,#fff))}.op-summary section{min-width:0}.op-summary strong,.op-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.op-summary strong{font-size:18px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111)}.op-summary span{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:850}.op-toolbar,.op-filter,.op-panel{margin-top:10px;padding:10px;border-radius:24px}.op-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}.op-tabs{display:inline-grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:min(390px,100%);padding:4px;border-radius:999px;background:var(--shell-section-bg,color-mix(in srgb,var(--op-primary) 7%,var(--surface,#fff)));border:1px solid var(--border,rgba(0,0,0,.08))}.op-tabs button{min-width:0;min-height:35px;border:0;border-radius:999px;padding:0 9px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}.op-tabs button.active{background:var(--op-primary);color:#fff}.op-filter{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.op-section{margin-top:16px}.op-list{margin-top:10px}.op-card,.op-breakdown,.op-empty{min-width:0;border-radius:24px;padding:13px;overflow:hidden}.op-card-top{display:flex;align-items:flex-start;gap:10px}.op-avatar{width:56px;height:56px;flex:0 0 auto;display:grid;place-items:center;border-radius:19px;background:var(--op-primary);color:#fff;font-size:22px;box-shadow:0 12px 24px rgba(15,23,42,.12)}.op-card-main{min-width:0;flex:1}.op-card-main h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000;letter-spacing:-.04em}.op-card-main p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.4}.op-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.op-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.op-chip.green{background:rgba(34,197,94,.14);color:#22c55e}.op-chip.red{background:rgba(239,68,68,.14);color:#ef4444}.op-chip.blue{background:rgba(59,130,246,.15);color:#60a5fa}.op-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.op-chip.orange{background:rgba(245,158,11,.16);color:#f59e0b}.op-chip.purple{background:rgba(147,51,234,.15);color:#a855f7}.op-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}.op-mini{min-width:0;padding:9px;border-radius:17px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}.op-mini strong,.op-mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.op-mini strong{color:var(--text,#111);font-size:13px;font-weight:1000}.op-mini span{margin-top:2px;color:var(--muted,#64748b);font-size:10px;font-weight:850}.op-table-wrap{width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.op-table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.op-table th,.op-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top;color:var(--text,#111);font-size:13px}.op-table th{color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;background:color-mix(in srgb,var(--op-primary) 6%,var(--card-bg,#fff))}.op-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:190px;text-align:center;border-style:dashed}.op-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--op-primary) 12%,var(--surface,#fff));font-size:28px}.op-empty h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000}.op-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.op-message{margin:10px 0;padding:12px;border-radius:18px;background:rgba(245,158,11,.14);color:#f59e0b;font-size:13px;font-weight:900}.op-drawer-layer{position:fixed;inset:0;z-index:80}.op-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}.op-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111);padding:14px;box-shadow:var(--shell-shadow,-24px 0 70px rgba(15,23,42,.22))}.op-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}.op-drawer-head p{margin:0;color:var(--op-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.op-drawer-head h2{margin:2px 0 0;color:var(--text,#111);font-size:22px;font-weight:1000;letter-spacing:-.05em}.op-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}.op-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}.op-form-card{margin-top:10px;padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}.op-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.op-form-grid label{min-width:0;display:grid;gap:6px}.op-form-grid label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.op-form-grid .wide{grid-column:1/-1}.op-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.op-bar{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}.op-bar div{height:100%;background:var(--op-primary);border-radius:inherit}@media (min-width:680px){.op-page{padding:calc(12px * var(--local-density-scale,1))}.op-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.op-filter{grid-template-columns:minmax(0,1fr) 190px 190px 150px}.op-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.op-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.op-page{padding:calc(16px * var(--local-density-scale,1))}.op-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.op-list,.op-breakdown-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:520px){.op-page{padding:calc(6px * var(--local-density-scale,1))}.op-hero{flex-direction:column;border-radius:22px;padding:10px}.op-actions{display:grid;grid-template-columns:minmax(0,1fr)}.op-btn,.op-primary{width:100%}.op-summary-grid{gap:6px}.op-summary{padding:10px;border-radius:19px}.op-toolbar{align-items:stretch;flex-direction:column;border-radius:20px}.op-tabs{width:100%}.op-card,.op-empty,.op-breakdown{border-radius:20px;padding:11px}.op-avatar{width:52px;height:52px;flex-basis:52px}.op-mini-grid{grid-template-columns:repeat(1,minmax(0,1fr))}.op-drawer-actions{grid-template-columns:minmax(0,1fr)}.op-drawer{width:min(96vw,720px);padding:12px}}
`;

export default function CalendarOverview() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<AnyRow | null>(null);
  const [schools, setSchools] = useState<AnyRow[]>([]);
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [events, setEvents] = useState<AnyRow[]>([]);
  const [conflicts, setConflicts] = useState<AnyRow[]>([]);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [schoolId, setSchoolId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [eventType, setEventType] = useState("all");

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  const load = async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      const ctx = await resolveOwnerContext(accountId);
      setOwner(ctx.owner);

      const [schoolRows, branchRows] = await Promise.all([safeArray("schools"), safeArray("branches")]);
      const ownedSchools = (schoolRows as AnyRow[]).filter((row) => accountMatch(row, accountId));
      const schoolIds = new Set(ownedSchools.map((row) => Number(row.id)));
      const ownedBranches = (branchRows as AnyRow[]).filter((row) => accountMatch(row, accountId) && schoolIds.has(Number(row.schoolId)));

      setSchools(ownedSchools);
      setBranches(ownedBranches);

      const allEvents: AnyRow[] = [];
      const allConflicts: AnyRow[] = [];

      for (const branch of ownedBranches) {
        try {
          const branchEvents = await listCalendarEvents({ accountId, schoolId: Number(branch.schoolId), branchId: Number(branch.id) });
          allEvents.push(...(branchEvents as AnyRow[]));

          const branchConflicts = await listOpenScheduleConflicts({ accountId, schoolId: Number(branch.schoolId), branchId: Number(branch.id) });
          allConflicts.push(...(branchConflicts as AnyRow[]));
        } catch (error) {
          console.warn("Failed to load owner branch overview", branch, error);
        }
      }

      setEvents(allEvents.filter((event) => !event.isDeleted && event.status !== "cancelled"));
      setConflicts(allConflicts.filter((conflict) => !conflict.isDeleted && String(conflict.status || "open") !== "resolved"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId]);

  const visibleBranches = useMemo(() => schoolId === "all" ? branches : branches.filter((b) => Number(b.schoolId) === Number(schoolId)), [branches, schoolId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return events.filter((event) => {
      if (schoolId !== "all" && Number(event.schoolId) !== Number(schoolId)) return false;
      if (branchId !== "all" && Number(event.branchId) !== Number(branchId)) return false;
      if (eventType !== "all" && String(event.eventType) !== eventType) return false;
      if (!q) return true;
      return `${event.title} ${event.description} ${event.location} ${event.eventType}`.toLowerCase().includes(q);
    }).sort((a,b) => n(a.startAt) - n(b.startAt));
  }, [events, query, schoolId, branchId, eventType]);

  const summary = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
    return {
      schools: schools.length,
      branches: branches.length,
      events: events.length,
      upcoming: events.filter((event) => n(event.startAt) >= now()).length,
      today: events.filter((event) => n(event.startAt) >= todayStart.getTime() && n(event.startAt) <= todayEnd.getTime()).length,
      conflicts: conflicts.length,
    };
  }, [schools, branches, events, conflicts]);

  if (loading || accountLoading || settingsLoading) {
    return <main className="op-page" style={{"--op-primary": primary} as React.CSSProperties}><style>{css}</style><section className="op-state"><h2>Opening owner calendar...</h2><p>Loading events across your schools.</p></section></main>;
  }

  return (
    <main className="op-page" style={{"--op-primary": primary} as React.CSSProperties}>
      <style>{css}</style>
      <section className="op-hero">
        <div className="op-hero-left"><div className="op-icon">📅</div><div className="op-title"><p>Owner Oversight</p><h2>Calendar Overview</h2><span>{rowName(owner || {})} · View only across owned schools</span></div></div>
        <div className="op-actions"><button className="op-btn" onClick={load}>Refresh</button></div>
      </section>

      <section className="op-summary-grid">
        <SummaryCard label="Schools" value={summary.schools} icon="🏫" />
        <SummaryCard label="Branches" value={summary.branches} icon="🏛️" />
        <SummaryCard label="Events" value={summary.events} icon="📌" />
        <SummaryCard label="Upcoming" value={summary.upcoming} icon="⏭️" positive />
        <SummaryCard label="Today" value={summary.today} icon="📍" />
        <SummaryCard label="Open Conflicts" value={summary.conflicts} icon="⚠️" warning={summary.conflicts > 0} />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="op-filter">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events..." />
        <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setBranchId("all"); }}>
          <option value="all">All Schools</option>
          {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="all">All Branches</option>
          {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="school_event">School Event</option>
          <option value="branch_event">Branch Event</option>
          <option value="meeting">Meeting</option>
          <option value="exam">Exam</option>
          <option value="assessment">Assessment</option>
          <option value="fee_deadline">Fee Deadline</option>
          <option value="payroll_date">Payroll Date</option>
          <option value="holiday">Holiday</option>
        </select>
      </section>

      {conflicts.length > 0 && <section className="op-section"><div className="op-list">
        {conflicts.slice(0, 4).map((conflict) => <article className="op-card" key={conflict.id}><div className="op-card-top"><div className="op-avatar">⚠️</div><div className="op-card-main"><h3>{conflict.title || "Schedule conflict"}</h3><p>{conflict.description || "Conflict detected in one of your branches."}</p><div className="op-chip-row"><Chip tone="red">{conflict.severity || "conflict"}</Chip><Chip tone="orange">{conflict.conflictType || "schedule"}</Chip><Chip>{branches.find((b) => Number(b.id) === Number(conflict.branchId))?.name || "Branch"}</Chip></div></div></div></article>)}
      </div></section>}

      {view === "analytics" && <section className="op-section op-breakdown-grid">
        {schools.map((school) => {
          const count = filtered.filter((event) => Number(event.schoolId) === Number(school.id)).length;
          const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
          return <article key={school.id} className="op-breakdown"><strong>{school.name}</strong><div className="op-bar"><div style={{width:`${pct}%`}} /></div><div className="op-chip-row"><Chip tone="blue">{count}</Chip><Chip>{pct}%</Chip></div></article>;
        })}
        {["exam","assessment","meeting","fee_deadline","holiday"].map((kind) => {
          const count = filtered.filter((event) => event.eventType === kind).length;
          const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
          return <article key={kind} className="op-breakdown"><strong>{kind.replaceAll("_", " ")}</strong><div className="op-bar"><div style={{width:`${pct}%`}} /></div><div className="op-chip-row"><Chip tone="purple">{count}</Chip><Chip>{pct}%</Chip></div></article>;
        })}
      </section>}

      {view === "table" && <section className="op-panel"><div className="op-table-wrap"><table className="op-table"><thead><tr><th>School</th><th>Branch</th><th>Event</th><th>Type</th><th>Starts</th><th>Ends</th><th>Status</th></tr></thead><tbody>
        {filtered.map((event) => <tr key={event.id}><td>{schools.find((s) => Number(s.id) === Number(event.schoolId))?.name || "-"}</td><td>{branches.find((b) => Number(b.id) === Number(event.branchId))?.name || "-"}</td><td><strong>{event.title}</strong><br/><span>{event.description || "-"}</span></td><td>{event.eventType}</td><td>{dateLabel(event.startAt)}</td><td>{dateLabel(event.endAt)}</td><td><Chip tone="green">{event.status || "scheduled"}</Chip></td></tr>)}
        {!filtered.length && <tr><td colSpan={7}><EmptyCard text="No calendar events found across your schools." /></td></tr>}
      </tbody></table></div></section>}

      {view === "cards" && <section className="op-section"><div className="op-list">
        {filtered.map((event) => <article key={event.id} className="op-card"><div className="op-card-top"><div className="op-avatar">📅</div><div className="op-card-main"><h3>{event.title}</h3><p>{schools.find((s) => Number(s.id) === Number(event.schoolId))?.name || "School"} · {branches.find((b) => Number(b.id) === Number(event.branchId))?.name || "Branch"} · {dateLabel(event.startAt)}</p><div className="op-chip-row"><Chip tone="blue">{event.eventType}</Chip><Chip tone={event.priority === "urgent" ? "red" : event.priority === "high" ? "orange" : "gray"}>{event.priority || "normal"}</Chip><Chip tone="green">{event.status || "scheduled"}</Chip></div></div></div><div className="op-mini-grid"><MiniStat label="Starts" value={dateLabel(event.startAt)} /><MiniStat label="Ends" value={dateLabel(event.endAt)} /><MiniStat label="Location" value={event.location || "-"} /></div>{event.description && <p className="op-message">{event.description}</p>}</article>)}
        {!filtered.length && <EmptyCard text="No calendar events found across your schools." />}
      </div></section>}
    </main>
  );
}
