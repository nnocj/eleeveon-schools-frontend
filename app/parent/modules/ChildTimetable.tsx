"use client";

/**
 * app/parent/modules/ChildTimetable.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — CHILD TIMETABLE
 * ---------------------------------------------------------
 * Parent-scoped module for Eleeveon Schools.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db";
import {
  listCalendarEvents,
} from "../../lib/calendar";
import {
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
  return <span className={`pp-chip ${tone}`}>{children}</span>;
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
    <article className={`pp-summary ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
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
    <div className="pp-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ title = "No records", text }: { title?: string; text: string }) {
  return (
    <section className="pp-empty">
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
    <section className="pp-toolbar">
      <div className="pp-tabs">
        <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Cards</button>
        <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
        <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>Analytics</button>
      </div>
      <Chip>{count} shown</Chip>
    </section>
  );
}

const css = `
.pp-page {
  min-height: 100dvh;
  width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(32px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--pp-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}
.pp-page * { box-sizing: border-box; }
.pp-page button, .pp-page input, .pp-page select, .pp-page textarea { font: inherit; max-width: 100%; }
.pp-page input, .pp-page select, .pp-page textarea {
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
.pp-page textarea { min-height: 120px; padding: 12px; resize: vertical; line-height: 1.55; }
.pp-state {
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
.pp-state h2 { margin: 0; font-size: 22px; letter-spacing: -.04em; font-weight: 1000; }
.pp-state p { margin: 0; color: var(--muted, #64748b); line-height: 1.6; }
.pp-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--pp-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--pp-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}
.pp-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1; }
.pp-icon {
  width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center;
  border-radius: 18px; background: var(--pp-primary); color: #fff; font-size: 22px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--pp-primary) 28%, transparent);
}
.pp-title { min-width: 0; }
.pp-title p, .pp-title h2, .pp-title span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-title p { margin: 0 0 2px; color: var(--pp-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.pp-title h2 { margin: 0; color: var(--text, #111); font-size: clamp(20px, 5vw, 30px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.pp-title span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.pp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.pp-btn, .pp-primary {
  min-height: 42px; border-radius: 999px; padding: 0 14px; font-weight: 950; cursor: pointer;
}
.pp-btn { border: 1px solid var(--border, rgba(0,0,0,.10)); background: var(--surface, #fff); color: var(--text, #111); }
.pp-primary { border: 0; background: var(--pp-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--pp-primary) 25%, transparent); }
.pp-summary-grid, .pp-list, .pp-mini-grid, .pp-breakdown-grid { display: grid; gap: 8px; }
.pp-summary-grid { margin-top: 10px; grid-template-columns: repeat(2, minmax(0,1fr)); }
.pp-summary, .pp-card, .pp-panel, .pp-toolbar, .pp-filter, .pp-empty, .pp-breakdown {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
.pp-summary { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; overflow: hidden; }
.pp-summary.positive { background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff))); }
.pp-summary.warning { background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff))); }
.pp-summary > div:first-child {
  width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px;
  background: color-mix(in srgb, var(--pp-primary) 12%, var(--surface, #fff));
}
.pp-summary section { min-width: 0; }
.pp-summary strong, .pp-summary span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-summary strong { font-size: 18px; font-weight: 1000; letter-spacing: -.05em; color: var(--text, #111); }
.pp-summary span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }
.pp-toolbar, .pp-filter, .pp-panel { margin-top: 10px; padding: 10px; border-radius: 24px; }
.pp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pp-tabs {
  display: inline-grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 4px; width: min(390px, 100%);
  padding: 4px; border-radius: 999px; background: var(--shell-section-bg, color-mix(in srgb, var(--pp-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}
.pp-tabs button { min-width: 0; min-height: 35px; border: 0; border-radius: 999px; padding: 0 9px; background: transparent; color: var(--muted, #64748b); font-size: 12px; font-weight: 950; cursor: pointer; }
.pp-tabs button.active { background: var(--pp-primary); color: #fff; }
.pp-filter { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; }
.pp-section { margin-top: 16px; }
.pp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.pp-head p { margin: 0; color: var(--pp-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.pp-head h3 { margin: 2px 0 0; color: var(--text, #111); font-size: 19px; font-weight: 1000; letter-spacing: -.04em; }
.pp-list { margin-top: 10px; }
.pp-card, .pp-breakdown, .pp-empty { min-width: 0; border-radius: 24px; padding: 13px; overflow: hidden; }
.pp-card-top { display: flex; align-items: flex-start; gap: 10px; }
.pp-avatar {
  width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px;
  background: var(--pp-primary); color: #fff; font-size: 22px; box-shadow: 0 12px 24px rgba(15,23,42,.12);
}
.pp-card-main { min-width: 0; flex: 1; }
.pp-card-main h3 { margin: 0; color: var(--text, #111); font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.pp-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.pp-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.pp-chip {
  max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize;
}
.pp-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.pp-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.pp-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.pp-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.pp-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.pp-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }
.pp-mini-grid { grid-template-columns: repeat(2, minmax(0,1fr)); margin-top: 10px; }
.pp-mini {
  min-width: 0; padding: 9px; border-radius: 17px; background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08)); overflow: hidden;
}
.pp-mini strong, .pp-mini span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-mini strong { color: var(--text, #111); font-size: 13px; font-weight: 1000; }
.pp-mini span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.pp-table-wrap { width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border, rgba(0,0,0,.08)); }
.pp-table { width: 100%; min-width: 980px; border-collapse: collapse; background: var(--card-bg, var(--surface, #fff)); }
.pp-table th, .pp-table td { padding: 10px; border-bottom: 1px solid var(--border, rgba(0,0,0,.08)); text-align: left; vertical-align: top; color: var(--text, #111); font-size: 13px; }
.pp-table th { color: var(--muted, #64748b); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; background: color-mix(in srgb, var(--pp-primary) 6%, var(--card-bg, #fff)); }
.pp-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 190px; text-align: center; border-style: dashed; }
.pp-empty div { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--pp-primary) 12%, var(--surface, #fff)); font-size: 28px; }
.pp-empty h3 { margin: 0; color: var(--text, #111); font-size: 18px; font-weight: 1000; }
.pp-empty p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.pp-message { margin: 10px 0; padding: 12px; border-radius: 18px; background: rgba(245,158,11,.14); color: #f59e0b; font-size: 13px; font-weight: 900; }
.pp-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.pp-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15,23,42,.52); }
.pp-drawer {
  position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 720px); max-width: 100vw; overflow-y: auto; overflow-x: hidden;
  background: var(--bg, #f7f8fb); color: var(--text, #111); padding: 14px; box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}
.pp-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--bg, #f7f8fb); }
.pp-drawer-head p { margin: 0; color: var(--pp-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.pp-drawer-head h2 { margin: 2px 0 0; color: var(--text, #111); font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.pp-drawer-head span { margin-top: 3px; display: block; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.pp-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 15px; background: var(--surface, #fff); color: var(--text, #111); font-weight: 1000; cursor: pointer; }
.pp-form-card { margin-top: 10px; padding: 12px; border-radius: 22px; background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); }
.pp-form-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 9px; }
.pp-form-grid label { min-width: 0; display: grid; gap: 6px; }
.pp-form-grid label span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.pp-form-grid .wide { grid-column: 1 / -1; }
.pp-drawer-actions { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 12px; }
.pp-bar { height: 8px; margin-top: 12px; border-radius: 999px; background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); overflow: hidden; }
.pp-bar div { height: 100%; background: var(--pp-primary); border-radius: inherit; }
@media (min-width: 680px) {
  .pp-page { padding: calc(12px * var(--local-density-scale, 1)); }
  .pp-summary-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .pp-filter { grid-template-columns: minmax(0,1fr) 190px 150px; }
  .pp-mini-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .pp-form-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (min-width: 1040px) {
  .pp-page { padding: calc(16px * var(--local-density-scale, 1)); }
  .pp-summary-grid { grid-template-columns: repeat(6, minmax(0,1fr)); }
  .pp-list, .pp-breakdown-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 520px) {
  .pp-page { padding: calc(6px * var(--local-density-scale, 1)); }
  .pp-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .pp-actions { display: grid; grid-template-columns: minmax(0,1fr); }
  .pp-btn, .pp-primary { width: 100%; }
  .pp-summary-grid { gap: 6px; }
  .pp-summary { padding: 10px; border-radius: 19px; }
  .pp-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .pp-tabs { width: 100%; }
  .pp-card, .pp-empty, .pp-breakdown { border-radius: 20px; padding: 11px; }
  .pp-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .pp-mini-grid { grid-template-columns: repeat(1, minmax(0,1fr)); }
  .pp-drawer-actions { grid-template-columns: minmax(0,1fr); }
  .pp-drawer { width: min(96vw, 720px); padding: 12px; }
}
`;


async function resolveParentContext(accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
  const [parents, students, studentParents, memberships, users] = await Promise.all([
    safeArray("parents"),
    safeArray("students"),
    safeArray("studentParents"),
    safeArray("userMemberships").then(async (x) => x.length ? x : safeArray("memberships")),
    safeArray("users").then(async (x) => x.length ? x : safeArray("accountUsers")),
  ]);

  const activeEmail = typeof window !== "undefined"
    ? String(localStorage.getItem("email") || localStorage.getItem("userEmail") || "").toLowerCase()
    : "";

  const parentMembership = (memberships as AnyRow[]).find((m) =>
    m.role === "parent" &&
    isBranchRow(m, accountId, Number(schoolId), Number(branchId))
  );

  const user = (users as AnyRow[]).find((row) =>
    String(userIdOf(row) || "") === membershipUserId(parentMembership) ||
    Boolean(activeEmail && String(row.email || "").toLowerCase() === activeEmail)
  );

  const parent =
    (parents as AnyRow[]).find((row) =>
      isBranchRow(row, accountId, Number(schoolId), Number(branchId)) &&
      (
        Number(row.id) === Number(parentMembership?.parentLocalId) ||
        Boolean(user?.email && row.email && String(row.email).toLowerCase() === String(user.email).toLowerCase()) ||
        Boolean(activeEmail && row.email && String(row.email).toLowerCase() === activeEmail)
      )
    ) || null;

  const linkedStudentIds = new Set<number>();

  (studentParents as AnyRow[]).forEach((link) => {
    if (!parent?.id) return;
    if (Number(link.parentId || link.parentLocalId) === Number(parent.id)) {
      linkedStudentIds.add(Number(link.studentId || link.studentLocalId));
    }
  });

  if (parentMembership?.studentLocalId) linkedStudentIds.add(Number(parentMembership.studentLocalId));

  const children = (students as AnyRow[]).filter((student) =>
    isBranchRow(student, accountId, Number(schoolId), Number(branchId)) &&
    (
      linkedStudentIds.has(Number(student.id)) ||
      Boolean(parent?.email && String(student.parentEmail || "").toLowerCase() === String(parent.email).toLowerCase()) ||
      Boolean(parent?.phone && String(student.parentPhone || "") === String(parent.phone))
    )
  );

  return { parent, children, user };
}

export default function ChildTimetable() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<AnyRow | null>(null);
  const [children, setChildren] = useState<AnyRow[]>([]);
  const [sessions, setSessions] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [timetables, setTimetables] = useState<AnyRow[]>([]);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [childId, setChildId] = useState("all");

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  const load = async () => {
    if (!accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const ctx = await resolveParentContext(accountId, Number(schoolId), Number(branchId));
      setParent(ctx.parent);
      setChildren(ctx.children);

      const [sessionRows, subjectRows, teacherRows, resourceRows, timetableRows] = await Promise.all([
        listSessionsForBranch({ accountId, schoolId: Number(schoolId), branchId: Number(branchId) }),
        safeArray("subjects"),
        safeArray("teachers"),
        listScheduleResources({ accountId, schoolId: Number(schoolId), branchId: Number(branchId) }),
        listTimetables({ accountId, schoolId: Number(schoolId), branchId: Number(branchId) }),
      ]);

      const childClassIds = new Set(ctx.children.map((child) => Number(child.classId || child.currentClassId)).filter(Boolean));

      setSessions((sessionRows as AnyRow[]).filter((session) => childClassIds.has(Number(session.classId))));
      setSubjects((subjectRows as AnyRow[]).filter((row) => !row.isDeleted && (!row.accountId || row.accountId === accountId)));
      setTeachers((teacherRows as AnyRow[]).filter((row) => isBranchRow(row, accountId, Number(schoolId), Number(branchId)) || (!row.branchId && Number(row.schoolId) === Number(schoolId))));
      setResources(resourceRows as AnyRow[]);
      setTimetables(timetableRows as AnyRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId, schoolId, branchId]);

  const filtered = useMemo(() => {
    let rows = sessions;

    if (childId !== "all") {
      const child = children.find((row) => String(row.id) === childId);
      rows = rows.filter((session) => Number(session.classId) === Number(child?.classId || child?.currentClassId));
    }

    const q = query.toLowerCase().trim();

    if (q) {
      rows = rows.filter((session) =>
        `${session.title} ${session.dayOfWeek} ${session.sessionType} ${session.roomName}`.toLowerCase().includes(q)
      );
    }

    return rows.sort((a,b) => String(a.dayOfWeek).localeCompare(String(b.dayOfWeek)) || n(a.startMinute) - n(b.startMinute));
  }, [sessions, childId, children, query]);

  const summary = useMemo(() => ({
    sessions: filtered.length,
    children: children.length,
    classes: new Set(filtered.map((s) => s.classId).filter(Boolean)).size,
    subjects: new Set(filtered.map((s) => s.subjectId).filter(Boolean)).size,
    teachers: new Set(filtered.map((s) => s.teacherLocalId).filter(Boolean)).size,
    weeklyMinutes: filtered.reduce((sum, s) => sum + Math.max(0, n(s.endMinute) - n(s.startMinute)), 0),
  }), [filtered, children]);

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return <main className="pp-page" style={{"--pp-primary": primary} as React.CSSProperties}><style>{css}</style><section className="pp-state"><h2>Opening child timetable...</h2><p>Loading your child’s class timetable.</p></section></main>;
  }

  return (
    <main className="pp-page" style={{"--pp-primary": primary} as React.CSSProperties}>
      <style>{css}</style>
      <section className="pp-hero">
        <div className="pp-hero-left"><div className="pp-icon">📚</div><div className="pp-title"><p>Parent Timetable</p><h2>Child Timetable</h2><span>{rowName(parent || {})} · {children.length} linked child(ren)</span></div></div>
        <div className="pp-actions"><button className="pp-btn" onClick={load}>Refresh</button></div>
      </section>

      <section className="pp-summary-grid">
        <SummaryCard label="Sessions" value={summary.sessions} icon="📚" positive />
        <SummaryCard label="Children" value={summary.children} icon="🧒" />
        <SummaryCard label="Classes" value={summary.classes} icon="🏫" />
        <SummaryCard label="Subjects" value={summary.subjects} icon="📖" />
        <SummaryCard label="Teachers" value={summary.teachers} icon="👨‍🏫" />
        <SummaryCard label="Weekly Hours" value={`${Math.round(summary.weeklyMinutes / 60)}h`} icon="⏱️" />
      </section>

      <Toolbar view={view} setView={setView} count={filtered.length} />

      <section className="pp-filter">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search timetable..." />
        <select value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="all">All Children</option>
          {children.map((child) => <option key={child.id} value={child.id}>{rowName(child)}</option>)}
        </select>
        <button className="pp-btn" onClick={load}>Reload</button>
      </section>

      {view === "analytics" && (
        <section className="pp-section pp-breakdown-grid">
          {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((day) => {
            const count = filtered.filter((session) => session.dayOfWeek === day).length;
            const pct = filtered.length ? Math.round((count / filtered.length) * 100) : 0;
            return <article key={day} className="pp-breakdown"><strong>{day}</strong><div className="pp-bar"><div style={{width:`${pct}%`}} /></div><div className="pp-chip-row"><Chip tone="blue">{count}</Chip><Chip>{pct}%</Chip></div></article>;
          })}
        </section>
      )}

      {view === "table" && (
        <section className="pp-panel"><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Day</th><th>Time</th><th>Session</th><th>Subject</th><th>Teacher</th><th>Room</th><th>Timetable</th></tr></thead><tbody>
          {filtered.map((s) => <tr key={s.id}><td>{s.dayOfWeek}</td><td>{formatMinuteRange(n(s.startMinute), n(s.endMinute))}</td><td><strong>{s.title || s.sessionType}</strong><br/><span>{s.sessionType}</span></td><td>{subjects.find((x) => Number(x.id) === Number(s.subjectId))?.name || "-"}</td><td>{rowName(teachers.find((t) => Number(t.id) === Number(s.teacherLocalId)) || {}) || "-"}</td><td>{resources.find((r) => Number(r.id) === Number(s.resourceId))?.name || s.roomName || "-"}</td><td>{timetables.find((t) => Number(t.id) === Number(s.timetableId))?.name || "-"}</td></tr>)}
          {!filtered.length && <tr><td colSpan={7}><EmptyCard text="No timetable sessions found." /></td></tr>}
        </tbody></table></div></section>
      )}

      {view === "cards" && (
        <section className="pp-section"><div className="pp-list">
          {filtered.map((s) => <article key={s.id} className="pp-card"><div className="pp-card-top"><div className="pp-avatar">📚</div><div className="pp-card-main"><h3>{s.title || s.sessionType}</h3><p>{s.dayOfWeek} · {formatMinuteRange(n(s.startMinute), n(s.endMinute))}</p><div className="pp-chip-row"><Chip tone="blue">{s.sessionType}</Chip><Chip tone="purple">{subjects.find((x) => Number(x.id) === Number(s.subjectId))?.name || "No subject"}</Chip></div></div></div><div className="pp-mini-grid"><MiniStat label="Teacher" value={rowName(teachers.find((t) => Number(t.id) === Number(s.teacherLocalId)) || {}) || "-"} /><MiniStat label="Room" value={resources.find((r) => Number(r.id) === Number(s.resourceId))?.name || s.roomName || "-"} /><MiniStat label="Duration" value={`${n(s.endMinute) - n(s.startMinute)} min`} /></div></article>)}
          {!filtered.length && <EmptyCard text="No timetable sessions found for your linked child or children." />}
        </div></section>
      )}
    </main>
  );
}
