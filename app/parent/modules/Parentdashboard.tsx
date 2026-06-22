"use client";

/**
 * app/parent/modules/Parentdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON PARENT DASHBOARD V2
 * ---------------------------------------------------------
 * Golden Standard Parent Home.
 * Parent-scoped, offline-first, mobile-first, theme-safe.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and opened
 *   by RolePortalShell.
 * - Fall back to ActiveMembershipProvider and ActiveBranchContext only if the
 *   selected workspace does not provide parentLocalId/schoolId/branchId.
 * - This prevents the parent dashboard from reading another member's children
 *   when a multi-role user switches workspaces.
 * - Parentdashboard receives NAV_SECTIONS from app/parent/page.tsx so dashboard
 *   modules always match the actual Parent Portal menu.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter = "all" | "children" | "fees" | "communication" | "timetable" | "preferences" | "other";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type RouteProps = {
  navigate?: (key: string) => void;
  navSections?: RoleNavSection[];
};

type DashboardModule = {
  key: string;
  label: string;
  icon: string;
  area: Exclude<AreaFilter, "all">;
  value: string | number;
  note: string;
  tone: Tone;
  routeKey: string;
};

type CountMetric = {
  value: string | number;
  note: string;
  tone: Tone;
};

const HIDDEN_DASHBOARD_KEYS = new Set(["parentDashboard"]);

const TABLE_NAMES = [
  "parents",
  "students",
  "studentParents",
  "studentEnrollments",
  "classes",
  "subjects",
  "classSubjects",
  "attendance",
  "assessmentEntries",
  "computedResults",
  "reportCards",
  "reportCardItems",
  "announcements",
  "announcementRecipients",
  "calendarEvents",
  "calendarEventParticipants",
  "messageThreads",
  "messages",
  "scheduleSessions",
  "scheduleTimetables",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "payments",
] as const;

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession(): OpenWorkspaceSession | null {
  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership(): AnyRow | null {
  return safeJson<AnyRow>("activeMembership");
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed) return parsed;
  }

  return null;
}

function workspaceMembership(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  return (
    openWorkspace?.membership ||
    activeMembership ||
    readStoredActiveMembership() ||
    null
  );
}

function selectedParentId(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  const membership = workspaceMembership(openWorkspace, activeMembership);

  return firstPositiveNumber(
    openWorkspace?.parentLocalId,
    membership?.parentLocalId,
    membership?.localParentId,
    membership?.parentId,
    membership?.parent?.id,
    membership?.guardianLocalId,
    safeRead("activeParentId")
  );
}

function selectedSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeSchoolId?: any;
  activeSchool?: AnyRow | null;
  settings?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return firstPositiveNumber(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeRead("activeSchoolId")
  );
}

function selectedBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeBranchId?: any;
  activeBranch?: AnyRow | null;
  settings?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return firstPositiveNumber(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeRead("activeBranchId")
  );
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow | null) {
  return row?.id ?? row?.localId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function scoped(row: AnyRow, args: { accountId?: string | null; schoolId?: any; branchId?: any }) {
  if (!sameAccount(row, args.accountId)) return false;
  const rowSchoolId = row.schoolId ?? row.schoolLocalId ?? row.payload?.schoolId;
  const rowBranchId = row.branchId ?? row.branchLocalId ?? row.payload?.branchId;
  if (args.schoolId && rowSchoolId && !sameId(rowSchoolId, args.schoolId)) return false;
  if (args.branchId && rowBranchId && !sameId(rowBranchId, args.branchId)) return false;
  return true;
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return row?.isDeleted !== true && row?.active !== false && !["deleted", "archived", "inactive", "disabled", "withdrawn"].includes(status);
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function todayKey() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function money(value: any, currency = "GHS") {
  const amount = n(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "GHS",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "GHS"} ${amount.toLocaleString()}`;
  }
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("child")) return "children";
  if (value.includes("fee") || value.includes("payment")) return "fees";
  if (value.includes("communication") || value.includes("message") || value.includes("announcement")) return "communication";
  if (value.includes("calendar") || value.includes("timetable")) return "timetable";
  if (value.includes("preference") || value.includes("profile") || value.includes("setting")) return "preferences";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    children: "My Children",
    fees: "Fees & Payments",
    communication: "Communication",
    timetable: "Timetable",
    preferences: "Preferences",
    other: "Other",
  };
  return labels[area] || area;
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "present", "submitted", "completed", "published", "succeeded", "success"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "absent", "withdrawn"].includes(value)) return "red";
  if (["pending", "processing", "draft", "late", "partial"].includes(value)) return "orange";
  if (["scheduled", "issued", "promoted"].includes(value)) return "blue";
  return "gray";
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function uniqueCount(rows: AnyRow[], key: string) {
  return new Set(rows.filter(activeRow).map((row) => row[key]).filter((value) => value !== undefined && value !== null && value !== "")).size;
}

function sum(rows: AnyRow[], field: string) {
  return rows.filter(activeRow).reduce((total, row) => total + n(row[field]), 0);
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`pd-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="pd-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Empty({ title, text: body }: { title: string; text: string }) {
  return (
    <section className="pd-empty">
      <div>👨‍👩‍👧</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function buildNavModules(navSections?: RoleNavSection[]): Omit<DashboardModule, "value" | "note" | "tone">[] {
  const unique = new Map<string, Omit<DashboardModule, "value" | "note" | "tone">>();

  (navSections || []).forEach((section) => {
    const area = areaFromSectionTitle(section.title);

    section.items.forEach((item) => {
      if (HIDDEN_DASHBOARD_KEYS.has(item.key)) return;
      if (unique.has(item.key)) return;

      unique.set(item.key, {
        key: item.key,
        label: item.label,
        icon: item.icon,
        area,
        routeKey: item.key,
      });
    });
  });

  return [...unique.values()];
}

function metricFor(routeKey: string, rows: Record<string, AnyRow[]>, summary: AnyRow): CountMetric {
  const metricMap: Record<string, CountMetric> = {
    children: {
      value: summary.children,
      note: `${summary.enrollments} enrollment record(s) across your children.`,
      tone: summary.children ? "green" : "orange",
    },
    childAttendance: {
      value: summary.presentToday || summary.attendance,
      note: `${summary.todayAttendance} attendance record(s) today, ${summary.absent} absent/excused total.`,
      tone: summary.absent ? "orange" : summary.attendance ? "green" : "gray",
    },
    childResults: {
      value: summary.averageScore ? `${summary.averageScore}%` : summary.results,
      note: `${summary.results} computed result record(s) available.`,
      tone: summary.results ? "blue" : "gray",
    },
    childFees: {
      value: summary.feeBalance ? money(summary.feeBalance, summary.currencyCode) : summary.invoices,
      note: `${summary.invoices} invoice(s), ${summary.payments} payment record(s).`,
      tone: summary.feeBalance ? "orange" : summary.invoices ? "green" : "gray",
    },
    payments: {
      value: summary.payments,
      note: `${money(summary.paidTotal, summary.currencyCode)} total payment record value.`,
      tone: summary.payments ? "green" : "gray",
    },
    announcements: {
      value: summary.announcements,
      note: "School and branch announcements visible to parents.",
      tone: summary.announcements ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "Parent conversations and school communication threads.",
      tone: summary.messages ? "green" : "gray",
    },
    calendar: {
      value: summary.events,
      note: "Academic events and school calendar items.",
      tone: summary.events ? "blue" : "gray",
    },
    childTimetable: {
      value: summary.sessions,
      note: "Timetable sessions connected to your children’s classes.",
      tone: summary.sessions ? "purple" : "gray",
    },
    localSettings: {
      value: "Open",
      note: "Device display preferences only; branch branding stays protected.",
      tone: "gray",
    },
    parentProfile: {
      value: "Open",
      note: "Parent identity, contact details and account profile.",
      tone: "purple",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return { value: count(guessedRows), note: "Auto-counted from matching local table.", tone: count(guessedRows) ? "green" : "gray" };
  }

  return { value: "Open", note: "Module is listed from Parent navigation. Add a metric mapping when data is ready.", tone: "gray" };
}

export default function Parentdashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();
  const { activeParentId, activeMembership } = useActiveMembership();
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedSchoolId({
    openWorkspace,
    activeMembership,
    activeSchoolId,
    activeSchool,
    settings: settings as AnyRow,
  });

  const branchId = selectedBranchId({
    openWorkspace,
    activeMembership,
    activeBranchId,
    activeBranch,
    settings: settings as AnyRow,
  });

  const parentId =
    selectedParentId(openWorkspace, activeMembership) ||
    toPositiveNumber(activeParentId);

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<AreaFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowsByTable, setRowsByTable] = useState<Record<string, AnyRow[]>>({});

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setRowsByTable({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const loaded = await Promise.all(
        TABLE_NAMES.map(async (tableName) => {
          const rows = await safeArray(tableName);
          return [tableName, rows.filter((row) => scoped(row, { accountId, schoolId, branchId }))] as const;
        })
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load parent dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, parentId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const parent = useMemo(() => {
    const parents = rows.parents || [];
    const membership = workspaceMembership(openWorkspace, activeMembership);
    const memberEmail = membership?.email || membership?.parentEmail || (openWorkspace as any)?.email;

    return (
      parents.find((row) => parentId && sameId(idOf(row), parentId)) ||
      parents.find((row) => memberEmail && sameId(row.email || row.parentEmail, memberEmail)) ||
      null
    );
  }, [activeMembership, openWorkspace, parentId, rows.parents]);

  const childLinks = useMemo(() => {
    const links = rows.studentParents || [];
    if (!parentId && !parent) return [];
    const resolvedParentId = parentId || idOf(parent);
    return links.filter((row) => !resolvedParentId || sameId(row.parentId || row.parentLocalId, resolvedParentId));
  }, [parent, parentId, rows.studentParents]);

  const children = useMemo(() => {
    const students = rows.students || [];
    const linkedIds = new Set(childLinks.map((row) => String(row.studentId || row.studentLocalId)).filter(Boolean));

    if (linkedIds.size) {
      return students.filter((student) => linkedIds.has(String(idOf(student))) || linkedIds.has(String(student.studentId)));
    }

    const parentEmail = parent?.email || parent?.parentEmail || workspaceMembership(openWorkspace, activeMembership)?.parentEmail;
    const parentPhone = parent?.phone || parent?.parentPhone || workspaceMembership(openWorkspace, activeMembership)?.parentPhone;

    return students.filter((student) => {
      if (parentEmail && sameId(student.parentEmail, parentEmail)) return true;
      if (parentPhone && sameId(student.parentPhone, parentPhone)) return true;
      return false;
    });
  }, [activeMembership, childLinks, openWorkspace, parent, rows.students]);

  const childIds = useMemo(
    () => new Set(children.map((child) => String(idOf(child))).filter(Boolean)),
    [children]
  );

  const summary = useMemo(() => {
    const today = todayKey();
    const enrollments = (rows.studentEnrollments || []).filter((row) => childIds.has(String(row.studentId)));
    const attendance = (rows.attendance || []).filter((row) => childIds.has(String(row.studentId)));
    const results = (rows.computedResults || []).filter((row) => childIds.has(String(row.studentId)));
    const reportCards = (rows.reportCards || []).filter((row) => childIds.has(String(row.studentId)));
    const invoices = (rows.studentFeeInvoices || []).filter((row) => childIds.has(String(row.studentId)));
    const payments = [...(rows.studentFeePayments || []), ...(rows.payments || [])].filter((row) => !row.studentId || childIds.has(String(row.studentId)));
    const todayAttendance = attendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));
    const sessions = (rows.scheduleSessions || []).filter((row) => {
      if (row.studentId && childIds.has(String(row.studentId))) return true;
      if (row.classId) {
        return children.some((child) => sameId(child.currentClassId || child.classId, row.classId));
      }
      return !row.studentId && !row.classId;
    });

    const averageScore = results.length
      ? Math.round(results.reduce((total, row) => total + n(row.percentage || row.average || row.score || row.totalScore), 0) / Math.max(1, results.length))
      : 0;

    const invoiceTotal = invoices.reduce((total, row) => total + n(row.total || row.amount || row.balance || row.netAmount), 0);
    const paidTotal = payments.reduce((total, row) => total + n(row.amount || row.total), 0);
    const feeBalance = Math.max(0, invoiceTotal - paidTotal);

    return {
      parentName: rowName(parent) !== "Unnamed" ? rowName(parent) : text(openWorkspace?.memberName || openWorkspace?.fullName || openWorkspace?.userName, "Parent"),
      children: count(children),
      enrollments: count(enrollments),
      attendance: count(attendance),
      presentToday: todayAttendance.filter((row) => String(row.status || "").toLowerCase() === "present").length,
      todayAttendance: todayAttendance.length,
      absent: attendance.filter((row) => ["absent", "excused"].includes(String(row.status || "").toLowerCase())).length,
      results: count(results),
      reportCards: count(reportCards),
      averageScore,
      invoices: count(invoices),
      payments: count(payments),
      paidTotal,
      feeBalance,
      currencyCode: text(invoices[0]?.currencyCode || payments[0]?.currencyCode, "GHS"),
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      events: count(rows.calendarEvents || []),
      sessions: count(sessions),
    };
  }, [children, childIds, openWorkspace, parent, rows]);

  const modules = useMemo<DashboardModule[]>(() => {
    const navModules = buildNavModules(navSections);
    return navModules.map((module) => ({ ...module, ...metricFor(module.routeKey, rows, summary) }));
  }, [navSections, rows, summary]);

  const filteredModules = useMemo(() => {
    const q = query.toLowerCase().trim();
    return modules.filter((item) => {
      if (area !== "all" && item.area !== area) return false;
      if (!q) return true;
      return `${item.label} ${item.note} ${item.value} ${item.area}`.toLowerCase().includes(q);
    });
  }, [area, modules, query]);

  const recent = useMemo(() => {
    const records: AnyRow[] = [
      ...children.map((row) => ({ ...row, _kind: "Child", _icon: "🧒", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.announcements || []).map((row) => ({ ...row, _kind: "Announcement", _icon: "📣", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.computedResults || []).filter((row) => childIds.has(String(row.studentId))).map((row) => ({ ...row, _kind: "Result", _icon: "📊", _title: text(row.subjectName || row.title, "Result"), _date: row.updatedAt || row.createdAt })),
      ...(rows.reportCards || []).filter((row) => childIds.has(String(row.studentId))).map((row) => ({ ...row, _kind: "Report Card", _icon: "📄", _title: text(row.title || row.periodName, "Report Card"), _date: row.publishedAt || row.updatedAt || row.createdAt })),
      ...(rows.studentFeePayments || []).filter((row) => !row.studentId || childIds.has(String(row.studentId))).map((row) => ({ ...row, _kind: "Payment", _icon: "💳", _title: money(row.amount || row.total, row.currencyCode || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
      ...(rows.calendarEvents || []).map((row) => ({ ...row, _kind: "Event", _icon: "📆", _title: text(row.title, "Calendar event"), _date: row.startAt || row.startTime || row.date || row.updatedAt || row.createdAt })),
    ];

    return records.sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [children, childIds, rows]);

  const activeFilterCount = area !== "all" ? 1 : 0;

  function openRoute(routeKey: string) {
    if (navigate) {
      navigate(routeKey);
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent("eleeveon:portal-route", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("role-portal:navigate", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("portal:navigate", { detail: routeKey }));
    } catch {
      // Optional shell fallback.
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening parent dashboard..." text="Loading your children, attendance, fees, payments and messages." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the parent portal." />;
  }

  if (!parentId && !parent) {
    return <State primary={primary} title="No parent profile selected" text="Choose your parent membership again from Select Role so the dashboard can load the correct parent record." />;
  }

  return (
    <main className="pd-page" style={{ "--pd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="pd-search-card" aria-label="Parent dashboard search and actions">
        <span className={`status-dot-mini ${summary.children ? "green" : "gray"}`} title={`${summary.parentName}: ${summary.children} child(ren)`} />

        <label className="pd-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parent modules..." aria-label="Search parent dashboard" />
        </label>

        <button type="button" className="pd-add-inline" onClick={load} aria-label="Refresh parent dashboard" title="Refresh">↻</button>

        <button type="button" className={`pd-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="pd-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="pd-parent-strip" aria-label="Current parent context">
        <strong>{summary.parentName}</strong>
        <span>{summary.children} child{summary.children === 1 ? "" : "ren"}</span>
        <Chip tone={summary.feeBalance ? "orange" : "green"}>{summary.feeBalance ? `${money(summary.feeBalance, summary.currencyCode)} due` : "Clear"}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="pd-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="pd-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="parent-row" onClick={() => openRoute(item.routeKey)}>
              <span className="parent-avatar">{item.icon}</span>
              <span className="parent-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="parent-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching parent modules" text="Clear filters or search to show your parent modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="pd-recent">
          <div className="pd-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="pd-recent-list">
            {recent.map((item, index) => (
              <article key={`${item._kind}-${idOf(item) || index}`} className="recent-row">
                <span>{item._icon}</span>
                <b>{item._title}</b>
                <small>{item._kind} · {dateLabel(item._date)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {filterOpen ? <FilterSheet area={area} setArea={setArea} onClose={() => setFilterOpen(false)} /> : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main className="pd-page" style={{ "--pd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="pd-state">
        <div className="pd-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="pd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="pd-sheet small">
        <div className="pd-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which parent area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="pd-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="children">My Children</option>
              <option value="fees">Fees & Payments</option>
              <option value="communication">Communication</option>
              <option value="timetable">Timetable</option>
              <option value="preferences">Preferences</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="pd-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="pd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="pd-sheet small">
        <div className="pd-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the parent home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="pd-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact parent modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.children} children · {summary.attendance} attendance · {summary.invoices} invoices</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local parent data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="pd-table-card">
      <div className="pd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Parent Modules ({modules.length})</th>
              <th>Area</th>
              <th>Value</th>
              <th>Status</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((item) => (
              <tr key={item.key}>
                <td><strong>{item.icon} {item.label}</strong><span>{item.routeKey}</span></td>
                <td>{areaLabel(item.area)}</td>
                <td>{item.value}</td>
                <td><Chip tone={item.tone}>{item.tone}</Chip></td>
                <td>{item.note}</td>
                <td><div className="pd-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="pd-empty-table">No parent module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["children", "fees", "communication", "timetable", "preferences", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="pd-analysis-grid">
      <article className="pd-analysis"><span>Children</span><strong>{summary.children}</strong><p>{summary.enrollments} enrollment record(s) across your children.</p></article>
      <article className="pd-analysis"><span>Attendance</span><strong>{summary.presentToday}</strong><p>{summary.todayAttendance} attendance record(s) today, {summary.absent} absent/excused total.</p></article>
      <article className="pd-analysis"><span>Results</span><strong>{summary.averageScore}%</strong><p>{summary.results} computed result record(s), {summary.reportCards} report card(s).</p></article>
      <article className="pd-analysis"><span>Fees</span><strong>{money(summary.feeBalance, summary.currencyCode)}</strong><p>{summary.invoices} invoice(s), {summary.payments} payment record(s).</p></article>
      <article className="pd-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="pd-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="pd-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="pd-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from children, announcements, results, report cards, payments and events.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.pd-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--pd-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.pd-page *,.pd-page *::before,.pd-page *::after{box-sizing:border-box;min-width:0}.pd-page button,.pd-page input,.pd-page select{font:inherit;max-width:100%}.pd-page button{-webkit-tap-highlight-color:transparent}.pd-page input,.pd-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.pd-page input:focus,.pd-page select:focus{border-color:color-mix(in srgb,var(--pd-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--pd-primary) 12%,transparent)}.pd-state,.pd-search-card,.parent-row,.pd-table-card,.pd-analysis,.pd-empty,.pd-sheet,.pd-recent,.recent-row,.pd-parent-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.pd-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.pd-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--pd-primary) 18%,transparent);border-top-color:var(--pd-primary);animation:spin .8s linear infinite}.pd-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.pd-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.pd-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.pd-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.pd-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.pd-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.pd-icon-button,.pd-filter-button,.pd-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.pd-add-inline{border-color:var(--pd-primary);background:var(--pd-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--pd-primary) 22%,transparent)}.pd-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.pd-filter-button{position:relative;background:color-mix(in srgb,var(--pd-primary) 8%,var(--card-bg,#fff));color:var(--pd-primary)}.pd-filter-button.active{background:var(--pd-primary);color:#fff;border-color:var(--pd-primary)}.pd-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.pd-parent-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.pd-parent-strip strong,.pd-parent-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pd-parent-strip strong{font-size:13px;font-weight:1000}.pd-parent-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.pd-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.pd-filter-chips::-webkit-scrollbar{display:none}.pd-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--pd-primary) 11%,transparent);color:var(--pd-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.pd-list{display:grid;gap:7px;margin-top:10px}.parent-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.parent-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--pd-primary) 12%,var(--surface,#fff));font-size:22px}.parent-main,.parent-main strong,.parent-main small,.parent-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.parent-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.parent-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.parent-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.parent-side{display:flex;align-items:center;gap:7px}.parent-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.pd-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.pd-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.pd-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.pd-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.pd-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.pd-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.pd-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.pd-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.pd-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.pd-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.pd-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.pd-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.pd-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.pd-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.pd-form{display:grid;gap:10px}.pd-form label{display:grid;gap:6px}.pd-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.pd-menu-list{display:grid;gap:8px}.pd-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.pd-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--pd-primary) 10%,transparent);color:var(--pd-primary);font-weight:1000}.pd-menu-list button b,.pd-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pd-menu-list button b{font-size:13px;font-weight:1000}.pd-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.pd-menu-list button.active{border-color:color-mix(in srgb,var(--pd-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--pd-primary) 8%,var(--surface,#fff))}.pd-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.pd-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.pd-sheet-actions button.primary{border-color:var(--pd-primary);background:var(--pd-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--pd-primary) 25%,transparent)}.pd-table-card,.pd-analysis,.pd-empty{padding:13px;border-radius:24px}.pd-table-card{margin-top:10px}.pd-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.pd-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.pd-table-scroll th,.pd-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.pd-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--pd-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.pd-table-scroll td strong,.pd-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pd-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.pd-table-actions{display:flex;gap:7px;overflow-x:auto}.pd-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--pd-primary);border-radius:999px;padding:0 12px;background:var(--pd-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.pd-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.pd-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.pd-analysis span,.pd-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pd-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.pd-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.pd-analysis-list{display:grid;gap:10px;margin-top:12px}.pd-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.pd-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.pd-analysis-list b,.pd-analysis-list small{font-size:12px}.pd-analysis-list small{color:var(--muted,#64748b);font-weight:850}.pd-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.pd-progress i{display:block;height:100%;border-radius:inherit;background:var(--pd-primary)}.pd-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.pd-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--pd-primary) 12%,var(--surface,#fff));font-size:28px}.pd-empty h3{margin:0;font-size:18px;font-weight:1000}.pd-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.pd-recent{margin-top:10px;border-radius:24px;padding:12px}.pd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.pd-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.pd-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--pd-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.pd-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.pd-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.pd-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.parent-row{border-radius:24px;padding:12px}.pd-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pd-analysis.wide{grid-column:span 2}.pd-sheet-backdrop{place-items:center;padding:18px}.pd-sheet{border-radius:28px;padding:18px}.pd-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.pd-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.pd-search-card,.pd-parent-strip,.pd-list,.pd-analysis-grid,.pd-table-card,.pd-filter-chips,.pd-recent{max-width:1180px;margin-left:auto;margin-right:auto}.pd-list{grid-template-columns:repeat(3,minmax(0,1fr))}.pd-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.pd-analysis.wide{grid-column:span 2}.pd-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.pd-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.pd-icon-button,.pd-filter-button,.pd-add-inline{width:40px;height:40px}.parent-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.parent-side{grid-column:1/-1;justify-content:flex-end}.pd-parent-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.pd-parent-strip span{grid-row:2}.pd-sheet{border-radius:24px 24px 18px 18px;padding:12px}.pd-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.pd-sheet-actions button{width:100%}}
`;
