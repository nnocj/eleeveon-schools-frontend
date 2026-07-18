"use client";

/**
 * app/teacher/modules/Calendar.tsx
 * ---------------------------------------------------------
 * TEACHER PORTAL — CALENDAR
 * ---------------------------------------------------------
 * Teacher-scoped module for Eleeveon Schools.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db/db";
import {
  createCalendarEvent,
  listCalendarEvents,
  respondToCalendarEvent,
} from "../../lib/calendar";
import {
  listOpenScheduleConflicts,
  listScheduleResources,
  listSessionsForBranch,
  listTimetables,
  formatMinuteRange,
} from "../../lib/scheduling";

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
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(stamp));
  } catch {
    return "Not set";
  }
}

function isBranchRow(row: AnyRow, accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
  if (!row || row.isDeleted) return false;
  return (
    (!row.accountId || row.accountId === accountId) &&
    Number(row.schoolId) === Number(schoolId) &&
    Number(row.branchId) === Number(branchId)
  );
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

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`tp-chip ${tone}`}>{children}</span>;
}

function SummaryCard({
  label,
  value,
  icon,
  positive,
  warning,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`tp-summary ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div>{icon}</div>
      <section>
        <strong>{value}</strong>
        <span>{label}</span>
      </section>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tp-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ title = "No records", text }: { title?: string; text: string }) {
  return (
    <section className="tp-empty">
      <div>📌</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Toolbar({
  view,
  setView,
  count,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  count: number;
}) {
  return (
    <section className="tp-toolbar">
      <div className="tp-tabs">
        <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Cards</button>
        <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
        <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>Analytics</button>
      </div>
      <Chip>{count} shown</Chip>
    </section>
  );
}

const css = `
.tp-page {
  min-height: 100dvh;
  width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(32px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--tp-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}
.tp-page * { box-sizing: border-box; }
.tp-page button, .tp-page input, .tp-page select, .tp-page textarea { font: inherit; max-width: 100%; }
.tp-page input, .tp-page select, .tp-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111));
  outline: none;
  font-weight: 750;
}
.tp-page textarea { min-height: 120px; padding: 12px; resize: vertical; line-height: 1.55; }
.tp-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(480px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}
.tp-state h2 { margin: 0; font-size: 22px; letter-spacing: -.04em; font-weight: 1000; }
.tp-state p { margin: 0; color: var(--muted, #64748b); line-height: 1.6; }
.tp-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--tp-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--tp-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}
.tp-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1; }
.tp-icon {
  width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center;
  border-radius: 18px; background: var(--tp-primary); color: #fff; font-size: 22px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--tp-primary) 28%, transparent);
}
.tp-title { min-width: 0; }
.tp-title p, .tp-title h2, .tp-title span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-title p { margin: 0 0 2px; color: var(--tp-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tp-title h2 { margin: 0; color: var(--text, #111); font-size: clamp(20px, 5vw, 30px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.tp-title span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.tp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.tp-btn, .tp-primary, .tp-danger {
  min-height: 42px; border-radius: 999px; padding: 0 14px; font-weight: 950; cursor: pointer;
}
.tp-btn { border: 1px solid var(--border, rgba(0,0,0,.10)); background: var(--surface, #fff); color: var(--text, #111); }
.tp-primary { border: 0; background: var(--tp-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--tp-primary) 25%, transparent); }
.tp-danger { border: 0; background: #ef4444; color: #fff; }
.tp-summary-grid, .tp-list, .tp-mini-grid, .tp-breakdown-grid { display: grid; gap: 8px; }
.tp-summary-grid { margin-top: 10px; grid-template-columns: repeat(2, minmax(0,1fr)); }
.tp-summary, .tp-card, .tp-panel, .tp-toolbar, .tp-filter, .tp-empty, .tp-breakdown {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.tp-summary { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; overflow: hidden; }
.tp-summary.positive { background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff))); }
.tp-summary.warning { background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff))); }
.tp-summary > div:first-child {
  width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px;
  background: color-mix(in srgb, var(--tp-primary) 12%, var(--surface, #fff));
}
.tp-summary section { min-width: 0; }
.tp-summary strong, .tp-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-summary strong { font-size: 18px; font-weight: 1000; letter-spacing: -.05em; color: var(--text, #111); }
.tp-summary span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }
.tp-toolbar, .tp-filter, .tp-panel { margin-top: 10px; padding: 10px; border-radius: 24px; }
.tp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tp-tabs {
  display: inline-grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 4px; width: min(390px, 100%);
  padding: 4px; border-radius: 999px; background: var(--shell-section-bg, color-mix(in srgb, var(--tp-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}
.tp-tabs button { min-width: 0; min-height: 35px; border: 0; border-radius: 999px; padding: 0 9px; background: transparent; color: var(--muted, #64748b); font-size: 12px; font-weight: 950; cursor: pointer; }
.tp-tabs button.active { background: var(--tp-primary); color: #fff; }
.tp-filter { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; }
.tp-section { margin-top: 16px; }
.tp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.tp-head p { margin: 0; color: var(--tp-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tp-head h3 { margin: 2px 0 0; color: var(--text, #111); font-size: 19px; font-weight: 1000; letter-spacing: -.04em; }
.tp-list { margin-top: 10px; }
.tp-card, .tp-breakdown, .tp-empty { min-width: 0; border-radius: 24px; padding: 13px; overflow: hidden; }
.tp-card-top { display: flex; align-items: flex-start; gap: 10px; }
.tp-avatar {
  width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px;
  background: var(--tp-primary); color: #fff; font-size: 22px; box-shadow: 0 12px 24px rgba(15,23,42,.12);
}
.tp-card-main { min-width: 0; flex: 1; }
.tp-card-main h3 { margin: 0; color: var(--text, #111); font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.tp-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.tp-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.tp-chip {
  max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize;
}
.tp-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.tp-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.tp-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.tp-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.tp-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.tp-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }
.tp-mini-grid { grid-template-columns: repeat(2, minmax(0,1fr)); margin-top: 10px; }
.tp-mini {
  min-width: 0; padding: 9px; border-radius: 17px; background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08)); overflow: hidden;
}
.tp-mini strong, .tp-mini span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-mini strong { color: var(--text, #111); font-size: 13px; font-weight: 1000; }
.tp-mini span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.tp-table-wrap { width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border, rgba(0,0,0,.08)); }
.tp-table { width: 100%; min-width: 980px; border-collapse: collapse; background: var(--card-bg, var(--surface, #fff)); }
.tp-table th, .tp-table td { padding: 10px; border-bottom: 1px solid var(--border, rgba(0,0,0,.08)); text-align: left; vertical-align: top; color: var(--text, #111); font-size: 13px; }
.tp-table th { color: var(--muted, #64748b); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; background: color-mix(in srgb, var(--tp-primary) 6%, var(--card-bg, #fff)); }
.tp-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 190px; text-align: center; border-style: dashed; }
.tp-empty div { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--tp-primary) 12%, var(--surface, #fff)); font-size: 28px; }
.tp-empty h3 { margin: 0; color: var(--text, #111); font-size: 18px; font-weight: 1000; }
.tp-empty p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.tp-message { margin: 10px 0; padding: 12px; border-radius: 18px; background: rgba(245,158,11,.14); color: #f59e0b; font-size: 13px; font-weight: 900; }
.tp-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.tp-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15,23,42,.52); }
.tp-drawer {
  position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 720px); max-width: 100vw; overflow-y: auto; overflow-x: hidden;
  background: var(--bg, #f7f8fb); color: var(--text, #111); padding: 14px; box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}
.tp-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--bg, #f7f8fb); }
.tp-drawer-head p { margin: 0; color: var(--tp-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tp-drawer-head h2 { margin: 2px 0 0; color: var(--text, #111); font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.tp-drawer-head span { margin-top: 3px; display: block; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.tp-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 15px; background: var(--surface, #fff); color: var(--text, #111); font-weight: 1000; cursor: pointer; }
.tp-form-card { margin-top: 10px; padding: 12px; border-radius: 22px; background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); }
.tp-form-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 9px; }
.tp-form-grid label { min-width: 0; display: grid; gap: 6px; }
.tp-form-grid label span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.tp-form-grid .wide { grid-column: 1 / -1; }
.tp-drawer-actions { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 12px; }
.tp-bar { height: 8px; margin-top: 12px; border-radius: 999px; background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); overflow: hidden; }
.tp-bar div { height: 100%; background: var(--tp-primary); border-radius: inherit; }
@media (min-width: 680px) {
  .tp-page { padding: calc(12px * var(--local-density-scale, 1)); }
  .tp-summary-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .tp-filter { grid-template-columns: minmax(0,1fr) 190px 150px; }
  .tp-mini-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .tp-form-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (min-width: 1040px) {
  .tp-page { padding: calc(16px * var(--local-density-scale, 1)); }
  .tp-summary-grid { grid-template-columns: repeat(6, minmax(0,1fr)); }
  .tp-list, .tp-breakdown-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 520px) {
  .tp-page { padding: calc(6px * var(--local-density-scale, 1)); }
  .tp-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .tp-actions { display: grid; grid-template-columns: minmax(0,1fr); }
  .tp-btn, .tp-primary { width: 100%; }
  .tp-summary-grid { gap: 6px; }
  .tp-summary { padding: 10px; border-radius: 19px; }
  .tp-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .tp-tabs { width: 100%; }
  .tp-card, .tp-empty, .tp-breakdown { border-radius: 20px; padding: 11px; }
  .tp-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .tp-mini-grid { grid-template-columns: repeat(1, minmax(0,1fr)); }
  .tp-drawer-actions { grid-template-columns: minmax(0,1fr); }
  .tp-drawer { width: min(96vw, 720px); padding: 12px; }
}
`;


export default function Calendar() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<AnyRow | null>(null);
  const [events, setEvents] = useState<AnyRow[]>([]);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    eventType: "meeting",
    startAt: "",
    endAt: "",
    location: "",
    priority: "normal",
  });

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  const resolveTeacher = async () => {
    const [teachers, memberships, users] = await Promise.all([
      safeArray("teachers"),
      safeArray("userMemberships").then(async (x) => x.length ? x : safeArray("memberships")),
      safeArray("users").then(async (x) => x.length ? x : safeArray("accountUsers")),
    ]);

    const activeEmail = typeof window !== "undefined"
      ? String(localStorage.getItem("email") || localStorage.getItem("userEmail") || "").toLowerCase()
      : "";

    const teacherMembership = (memberships as AnyRow[]).find((m) =>
      m.role === "teacher" &&
      isBranchRow(m, accountId, Number(schoolId), Number(branchId))
    );

    const user = (users as AnyRow[]).find((row) =>
      String(userIdOf(row) || "") === membershipUserId(teacherMembership) ||
      Boolean(activeEmail && String(row.email || "").toLowerCase() === activeEmail)
    );

    return (
      (teachers as AnyRow[]).find((row) =>
        isBranchRow(row, accountId, Number(schoolId), Number(branchId)) &&
        (
          Number(row.id) === Number(teacherMembership?.teacherLocalId) ||
          Boolean(user?.email && row.email && String(row.email).toLowerCase() === String(user.email).toLowerCase()) ||
          Boolean(activeEmail && row.email && String(row.email).toLowerCase() === activeEmail)
        )
      ) || null
    );
  };

  const load = async () => {
    if (!accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const teacherRow = await resolveTeacher();
      setTeacher(teacherRow);

      const rows = await listCalendarEvents({
        accountId,
        schoolId: Number(schoolId),
        branchId: Number(branchId),
      });

      setEvents((rows as AnyRow[]).filter((event) =>
        !event.isDeleted &&
        (
          Number(event.teacherLocalId || 0) === Number(teacherRow?.id || 0) ||
          event.scopeType === "branch" ||
          event.scopeType === "school" ||
          event.visibility === "branch" ||
          event.visibility === "school"
        )
      ));
    } catch (error) {
      console.error(error);
      alert("Failed to load teacher calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId, schoolId, branchId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return events.filter((event) => {
      if (eventType !== "all" && event.eventType !== eventType) return false;
      if (!q) return true;
      return `${event.title} ${event.description} ${event.location} ${event.eventType}`.toLowerCase().includes(q);
    }).sort((a, b) => n(a.startAt) - n(b.startAt));
  }, [events, query, eventType]);

  const summary = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
    return {
      total: events.length,
      upcoming: events.filter((event) => n(event.startAt) >= now() && event.status !== "cancelled").length,
      today: events.filter((event) => n(event.startAt) >= todayStart.getTime() && n(event.startAt) <= todayEnd.getTime()).length,
      classEvents: events.filter((event) => event.eventType === "class_event" || event.eventType === "lesson").length,
      exams: events.filter((event) => event.eventType === "exam" || event.eventType === "assessment").length,
      urgent: events.filter((event) => event.priority === "urgent" || event.priority === "high").length,
    };
  }, [events]);

  const save = async () => {
    if (!teacher?.id) {
      alert("Teacher profile could not be resolved.");
      return;
    }

    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();

    if (!form.title.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      alert("Please enter title, valid start time and valid end time.");
      return;
    }

    setSaving(true);
    try {
      await createCalendarEvent({
        event: {
          accountId: accountId!,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          scopeType: "teacher",
          scopeId: Number(teacher.id),
          title: form.title,
          description: form.description,
          eventType: form.eventType as any,
          visibility: "private",
          startAt: start,
          endAt: end,
          location: form.location,
          priority: form.priority as any,
          teacherLocalId: Number(teacher.id),
          createdByRole: "teacher",
        },
        reminders: [{ channel: "in_app", minutesBefore: 60 }],
      });
      setDrawer(false);
      setForm({ title: "", description: "", eventType: "meeting", startAt: "", endAt: "", location: "", priority: "normal" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return <main className="tp-page" style={{"--tp-primary": primary} as React.CSSProperties}><style>{css}</style><section className="tp-state"><h2>Opening calendar...</h2><p>Loading your events and branch notices.</p></section></main>;
  }

  return (
    <main className="tp-page" style={{"--tp-primary": primary} as React.CSSProperties}>
      <style>{css}</style>
      <section className="tp-hero">
        <div className="tp-hero-left"><div className="tp-icon">📅</div><div className="tp-title"><p>Teacher Calendar</p><h2>Calendar</h2><span>{rowName(teacher || {})} · {activeBranch?.name || "Assigned branch"}</span></div></div>
        <div className="tp-actions"><button className="tp-btn" onClick={load}>Refresh</button><button className="tp-primary" onClick={() => setDrawer(true)}>Add Event</button></div>
      </section>

      <section className="tp-summary-grid">
        <SummaryCard label="Events" value={summary.total} icon="📌" />
        <SummaryCard label="Upcoming" value={summary.upcoming} icon="⏭️" positive />
        <SummaryCard label="Today" value={summary.today} icon="📍" />
        <SummaryCard label="Class Events" value={summary.classEvents} icon="📚" />
        <SummaryCard label="Exams" value={summary.exams} icon="📝" />
        <SummaryCard label="Urgent" value={summary.urgent} icon="⚠️" warning={summary.urgent > 0} />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="tp-filter">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events..." />
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="meeting">Meeting</option>
          <option value="class_event">Class Event</option>
          <option value="lesson">Lesson</option>
          <option value="exam">Exam</option>
          <option value="assessment">Assessment</option>
        </select>
        <button className="tp-primary" onClick={() => setDrawer(true)}>Add</button>
      </section>

      {view === "analytics" && (
        <section className="tp-section tp-breakdown-grid">
          {["meeting","class_event","lesson","exam","assessment"].map((kind) => {
            const count = events.filter((event) => event.eventType === kind).length;
            const pct = events.length ? Math.round((count / events.length) * 100) : 0;
            return <article key={kind} className="tp-breakdown"><strong>{kind.replaceAll("_"," ")}</strong><div className="tp-bar"><div style={{width:`${pct}%`}} /></div><div className="tp-chip-row"><Chip tone="blue">{count}</Chip><Chip>{pct}%</Chip></div></article>;
          })}
        </section>
      )}

      {view === "table" && (
        <section className="tp-panel"><div className="tp-table-wrap"><table className="tp-table"><thead><tr><th>Event</th><th>Type</th><th>Starts</th><th>Ends</th><th>Location</th><th>Status</th></tr></thead><tbody>
          {filtered.map((event) => <tr key={event.id}><td><strong>{event.title}</strong><br/><span>{event.description || "-"}</span></td><td>{event.eventType}</td><td>{dateLabel(event.startAt)}</td><td>{dateLabel(event.endAt)}</td><td>{event.location || "-"}</td><td><Chip tone={event.status === "cancelled" ? "red" : "green"}>{event.status || "scheduled"}</Chip></td></tr>)}
          {!filtered.length && <tr><td colSpan={6}><EmptyCard text="No calendar events found." /></td></tr>}
        </tbody></table></div></section>
      )}

      {view === "cards" && (
        <section className="tp-section"><div className="tp-list">
          {filtered.map((event) => <article key={event.id} className="tp-card"><div className="tp-card-top"><div className="tp-avatar">📅</div><div className="tp-card-main"><h3>{event.title}</h3><p>{dateLabel(event.startAt)} · {event.location || "No location"}</p><div className="tp-chip-row"><Chip tone="blue">{event.eventType}</Chip><Chip tone={event.status === "cancelled" ? "red" : "green"}>{event.status || "scheduled"}</Chip><Chip tone={event.priority === "urgent" ? "red" : event.priority === "high" ? "orange" : "gray"}>{event.priority || "normal"}</Chip></div></div></div>{event.description && <p className="tp-message">{event.description}</p>}</article>)}
          {!filtered.length && <EmptyCard text="No calendar events found." />}
        </div></section>
      )}

      {drawer && <div className="tp-drawer-layer"><button className="tp-drawer-overlay" onClick={() => setDrawer(false)} /><aside className="tp-drawer"><div className="tp-drawer-head"><div><p>New Event</p><h2>Teacher Calendar Event</h2><span>{rowName(teacher || {})}</span></div><button onClick={() => setDrawer(false)}>✕</button></div><section className="tp-form-card"><div className="tp-form-grid"><label className="wide"><span>Title</span><input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} /></label><label><span>Type</span><select value={form.eventType} onChange={(e)=>setForm({...form,eventType:e.target.value})}><option value="meeting">Meeting</option><option value="class_event">Class Event</option><option value="lesson">Lesson</option><option value="assessment">Assessment</option></select></label><label><span>Priority</span><select value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label><label><span>Start</span><input type="datetime-local" value={form.startAt} onChange={(e)=>setForm({...form,startAt:e.target.value})} /></label><label><span>End</span><input type="datetime-local" value={form.endAt} onChange={(e)=>setForm({...form,endAt:e.target.value})} /></label><label className="wide"><span>Location</span><input value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})} /></label><label className="wide"><span>Description</span><textarea value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} /></label></div></section><div className="tp-drawer-actions"><button className="tp-btn" onClick={()=>setDrawer(false)}>Cancel</button><button className="tp-primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Event"}</button></div></aside></div>}
    </main>
  );
}
