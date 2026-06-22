"use client";

/**
 * app/student/modules/Studentdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT DASHBOARD V1
 * ---------------------------------------------------------
 * Golden Standard Student Home.
 * Student-scoped, offline-first, mobile-first, theme-safe.
 *
 * Purpose:
 * - Give the learner a compact real-data overview.
 * - Use the same golden UI language as Branch/Owner dashboards.
 * - Read local Dexie first so it remains useful offline.
 * - Keep module cards generated from app/student/page.tsx NAV_SECTIONS.
 *
 * Counts are intentionally defensive because the student portal can be opened
 * from different login/membership shapes.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and read by
 *   RolePortalShell.
 * - Fall back to ActiveMembershipProvider and ActiveBranchContext.
 * - This prevents the student dashboard from accidentally reading another
 *   user/member profile when account context contains multiple roles.
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
type AreaFilter = "all" | "learning" | "records" | "communication" | "finance" | "other";
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

const HIDDEN_DASHBOARD_KEYS = new Set(["studentDashboard"]);

const TABLE_NAMES = [
  "students",
  "studentEnrollments",
  "classes",
  "subjects",
  "classSubjects",
  "curriculumSubjects",
  "subjectOfferings",
  "assignments",
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

function readStoredNumber(...keys: string[]) {
  for (const key of keys) {
    const parsed = toPositiveNumber(safeRead(key));
    if (parsed) return parsed;
  }

  return null;
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

function selectedStudentId(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  const membership = workspaceMembership(openWorkspace, activeMembership);

  return firstPositiveNumber(
    openWorkspace?.studentLocalId,
    membership?.studentLocalId,
    membership?.localStudentId,
    membership?.studentId,
    membership?.student?.id,
    readStoredNumber("activeStudentId")
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
    readStoredNumber("activeSchoolId")
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
    readStoredNumber("activeBranchId")
  );
}

function selectedMemberName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  student?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return text(
    args.student?.fullName ||
      args.student?.name ||
      args.openWorkspace?.memberName ||
      args.openWorkspace?.fullName ||
      args.openWorkspace?.userName ||
      membership?.fullName ||
      membership?.memberName ||
      membership?.userName,
    "Student"
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
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Student");
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
  if (value.includes("learning")) return "learning";
  if (value.includes("record")) return "records";
  if (value.includes("communication")) return "communication";
  if (value.includes("finance")) return "finance";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    learning: "My Learning",
    records: "My Records",
    communication: "My Communications",
    finance: "My Finances",
    other: "Other",
  };
  return labels[area] || area;
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "present", "submitted", "completed", "published"].includes(value)) return "green";
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
  return <span className={`sd-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="sd-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="sd-empty">
      <div>🎓</div>
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
    mySubjects: {
      value: summary.subjects,
      note: `${summary.classSubjects} class subject link(s) connected to your current class.`,
      tone: summary.subjects ? "green" : "orange",
    },
    myAssignments: {
      value: summary.assignments,
      note: `${summary.pendingAssignments} pending assignment(s).`,
      tone: summary.pendingAssignments ? "orange" : summary.assignments ? "green" : "gray",
    },
    myAttendance: {
      value: summary.attendancePresent || summary.attendance,
      note: `${summary.attendance} attendance record(s), ${summary.attendanceAbsent} absent.`,
      tone: summary.attendanceAbsent ? "orange" : summary.attendance ? "green" : "gray",
    },
    myResults: {
      value: summary.results,
      note: `${summary.averageScore}% average from available computed results.`,
      tone: summary.results ? "blue" : "gray",
    },
    myReportCards: {
      value: summary.reportCards,
      note: "Published and draft report card records available to you.",
      tone: summary.reportCards ? "green" : "gray",
    },
    announcements: {
      value: summary.announcements,
      note: "School and branch announcements visible to your student portal.",
      tone: summary.announcements ? "blue" : "gray",
    },
    calendar: {
      value: summary.events,
      note: "Events, reminders and academic dates in your branch.",
      tone: summary.events ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "Student conversations and message threads.",
      tone: summary.messages ? "green" : "gray",
    },
    myTimetable: {
      value: summary.sessions,
      note: "Timetable sessions connected to your class and subjects.",
      tone: summary.sessions ? "purple" : "gray",
    },
    studentPayments: {
      value: summary.feeBalance ? money(summary.feeBalance, summary.currencyCode) : summary.invoices,
      note: `${summary.invoices} invoice(s), ${summary.payments} payment record(s).`,
      tone: summary.feeBalance ? "orange" : summary.invoices ? "green" : "gray",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return { value: count(guessedRows), note: "Auto-counted from matching local table.", tone: count(guessedRows) ? "green" : "gray" };
  }

  return { value: "Open", note: "Module is listed from Student navigation. Add a metric mapping when data is ready.", tone: "gray" };
}

export default function Studentdashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();
  const { activeStudentId, activeMembership } = useActiveMembership();
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

  const studentId =
    selectedStudentId(openWorkspace, activeMembership) ||
    toPositiveNumber(activeStudentId);

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
      console.error("Failed to load student dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, studentId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const student = useMemo(() => {
    const students = rows.students || [];
    const membership = workspaceMembership(openWorkspace, activeMembership);
    const memberEmail = membership?.email || membership?.studentEmail || (openWorkspace as any)?.email;

    return (
      students.find((row) => studentId && sameId(idOf(row), studentId)) ||
      students.find((row) => memberEmail && sameId(row.studentEmail || row.email, memberEmail)) ||
      null
    );
  }, [activeMembership, openWorkspace, rows.students, studentId]);

  const summary = useMemo(() => {
    const currentStudentId = studentId || idOf(student) || 0;
    const studentClassId = student?.currentClassId;
    const enrollments = (rows.studentEnrollments || []).filter((row) => !currentStudentId || sameId(row.studentId, currentStudentId));
    const activeEnrollment = enrollments.find((row) => String(row.status || "active").toLowerCase() === "active") || enrollments[0];
    const classId = activeEnrollment?.classId || studentClassId;
    const classSubjects = (rows.classSubjects || []).filter((row) => !classId || sameId(row.classId, classId));
    const subjectIds = new Set(classSubjects.map((row) => row.subjectId || row.curriculumSubjectId).filter(Boolean).map(String));
    const subjects = (rows.subjects || []).filter((row) => !subjectIds.size || subjectIds.has(String(idOf(row))) || subjectIds.has(String(row.subjectId)));
    const assignments = (rows.assignments || []).filter((row) => {
      if (row.studentId && currentStudentId && !sameId(row.studentId, currentStudentId)) return false;
      if (row.classId && classId && !sameId(row.classId, classId)) return false;
      return true;
    });
    const attendance = (rows.attendance || []).filter((row) => !currentStudentId || sameId(row.studentId, currentStudentId));
    const results = (rows.computedResults || []).filter((row) => !currentStudentId || sameId(row.studentId, currentStudentId));
    const reportCards = (rows.reportCards || []).filter((row) => !currentStudentId || sameId(row.studentId, currentStudentId));
    const invoices = (rows.studentFeeInvoices || []).filter((row) => !currentStudentId || sameId(row.studentId, currentStudentId));
    const payments = [...(rows.studentFeePayments || []), ...(rows.payments || [])].filter((row) => !currentStudentId || !row.studentId || sameId(row.studentId, currentStudentId));
    const announcements = rows.announcements || [];
    const events = rows.calendarEvents || [];
    const messages = rows.messageThreads || [];
    const sessions = (rows.scheduleSessions || []).filter((row) => {
      if (row.studentId && currentStudentId && sameId(row.studentId, currentStudentId)) return true;
      if (row.classId && classId && sameId(row.classId, classId)) return true;
      if (row.targetClassId && classId && sameId(row.targetClassId, classId)) return true;
      return !row.studentId && !row.classId && !row.targetClassId;
    });
    const averageScore = results.length
      ? Math.round(results.reduce((total, row) => total + n(row.percentage || row.average || row.score || row.totalScore), 0) / Math.max(1, results.length))
      : 0;
    const invoiceTotal = invoices.reduce((total, row) => total + n(row.total || row.amount || row.balance || row.netAmount), 0);
    const paidTotal = payments.reduce((total, row) => total + n(row.amount || row.total), 0);
    const feeBalance = Math.max(0, invoiceTotal - paidTotal);
    const today = todayKey();
    const todayAttendance = attendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));

    return {
      studentName: selectedMemberName({ openWorkspace, activeMembership, student }),
      className: text(activeEnrollment?.className || student?.className, classId ? `Class #${classId}` : "No class"),
      enrollments: count(enrollments),
      classSubjects: count(classSubjects),
      subjects: Math.max(count(subjects), uniqueCount(classSubjects, "subjectId")),
      assignments: count(assignments),
      pendingAssignments: assignments.filter((row) => !["submitted", "completed", "graded"].includes(String(row.status || "").toLowerCase())).length,
      attendance: count(attendance),
      attendancePresent: attendance.filter((row) => String(row.status || "").toLowerCase() === "present").length,
      attendanceAbsent: attendance.filter((row) => ["absent", "excused"].includes(String(row.status || "").toLowerCase())).length,
      todayAttendance: todayAttendance.length,
      results: count(results),
      averageScore,
      reportCards: count(reportCards),
      announcements: count(announcements),
      events: count(events),
      messages: count(messages),
      sessions: count(sessions),
      invoices: count(invoices),
      payments: count(payments),
      feeBalance,
      currencyCode: text(invoices[0]?.currencyCode || payments[0]?.currencyCode, "GHS"),
    };
  }, [rows, student, studentId, openWorkspace, activeMembership]);

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
      ...(rows.announcements || []).map((row) => ({ ...row, _kind: "Announcement", _icon: "📢", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.computedResults || []).map((row) => ({ ...row, _kind: "Result", _icon: "📊", _title: text(row.subjectName || row.title, "Result"), _date: row.updatedAt || row.createdAt })),
      ...(rows.reportCards || []).map((row) => ({ ...row, _kind: "Report Card", _icon: "📄", _title: text(row.title || row.periodName, "Report Card"), _date: row.publishedAt || row.updatedAt || row.createdAt })),
      ...(rows.studentFeePayments || []).map((row) => ({ ...row, _kind: "Payment", _icon: "💳", _title: money(row.amount || row.total, row.currencyCode || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
      ...(rows.calendarEvents || []).map((row) => ({ ...row, _kind: "Event", _icon: "📅", _title: text(row.title, "Calendar event"), _date: row.startAt || row.startTime || row.date || row.updatedAt || row.createdAt })),
    ];

    return records.sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [rows]);

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
    return <State primary={primary} title="Opening student dashboard..." text="Loading your subjects, attendance, results, fees and messages." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the student portal." />;
  }

  if (!studentId && !student) {
    return <State primary={primary} title="No student profile selected" text="Choose your student membership again from Select Role so the dashboard can load the correct learner record." />;
  }

  return (
    <main className="sd-page" style={{ "--sd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sd-search-card" aria-label="Student dashboard search and actions">
        <span className={`status-dot-mini ${summary.subjects || summary.enrollments ? "green" : "gray"}`} title={`${summary.studentName}: ${summary.subjects} subject(s)`} />

        <label className="sd-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search my modules..." aria-label="Search student dashboard" />
        </label>

        <button type="button" className="sd-add-inline" onClick={load} aria-label="Refresh student dashboard" title="Refresh">↻</button>

        <button type="button" className={`sd-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="sd-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="sd-student-strip" aria-label="Current student context">
        <strong>{summary.studentName}</strong>
        <span>{summary.className}</span>
        <Chip tone={summary.feeBalance ? "orange" : "green"}>{summary.feeBalance ? `${money(summary.feeBalance, summary.currencyCode)} due` : "Clear"}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="sd-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="sd-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="student-row" onClick={() => openRoute(item.routeKey)}>
              <span className="student-avatar">{item.icon}</span>
              <span className="student-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="student-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching student modules" text="Clear filters or search to show your student modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="sd-recent">
          <div className="sd-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="sd-recent-list">
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

function State({primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main className="sd-page" style={{ "--sd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="sd-state">
        <div className="sd-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="sd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sd-sheet small">
        <div className="sd-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which student area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="sd-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="learning">My Learning</option>
              <option value="records">My Records</option>
              <option value="communication">My Communications</option>
              <option value="finance">My Finances</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="sd-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="sd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sd-sheet small">
        <div className="sd-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the student home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="sd-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact student modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.subjects} subjects · {summary.attendance} attendance · {summary.results} results</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local student data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="sd-table-card">
      <div className="sd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Student Modules ({modules.length})</th>
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
                <td><div className="sd-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="sd-empty-table">No student module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["learning", "records", "communication", "finance", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="sd-analysis-grid">
      <article className="sd-analysis"><span>Subjects</span><strong>{summary.subjects}</strong><p>{summary.classSubjects} class subject link(s) connected to your class.</p></article>
      <article className="sd-analysis"><span>Attendance</span><strong>{summary.attendancePresent}</strong><p>{summary.attendanceAbsent} absent/excused record(s).</p></article>
      <article className="sd-analysis"><span>Results</span><strong>{summary.averageScore}%</strong><p>{summary.results} computed result record(s).</p></article>
      <article className="sd-analysis"><span>Fees</span><strong>{money(summary.feeBalance, summary.currencyCode)}</strong><p>{summary.invoices} invoice(s), {summary.payments} payment record(s).</p></article>
      <article className="sd-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="sd-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="sd-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="sd-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from announcements, results, report cards, fees and events.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.sd-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--sd-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.sd-page *,.sd-page *::before,.sd-page *::after{box-sizing:border-box;min-width:0}.sd-page button,.sd-page input,.sd-page select{font:inherit;max-width:100%}.sd-page button{-webkit-tap-highlight-color:transparent}.sd-page input,.sd-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.sd-page input:focus,.sd-page select:focus{border-color:color-mix(in srgb,var(--sd-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--sd-primary) 12%,transparent)}.sd-state,.sd-search-card,.student-row,.sd-table-card,.sd-analysis,.sd-empty,.sd-sheet,.sd-recent,.recent-row,.sd-student-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.sd-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.sd-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--sd-primary) 18%,transparent);border-top-color:var(--sd-primary);animation:spin .8s linear infinite}.sd-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.sd-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.sd-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.sd-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.sd-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.sd-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.sd-icon-button,.sd-filter-button,.sd-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.sd-add-inline{border-color:var(--sd-primary);background:var(--sd-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--sd-primary) 22%,transparent)}.sd-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.sd-filter-button{position:relative;background:color-mix(in srgb,var(--sd-primary) 8%,var(--card-bg,#fff));color:var(--sd-primary)}.sd-filter-button.active{background:var(--sd-primary);color:#fff;border-color:var(--sd-primary)}.sd-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.sd-student-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.sd-student-strip strong,.sd-student-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd-student-strip strong{font-size:13px;font-weight:1000}.sd-student-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.sd-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.sd-filter-chips::-webkit-scrollbar{display:none}.sd-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--sd-primary) 11%,transparent);color:var(--sd-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.sd-list{display:grid;gap:7px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.student-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--sd-primary) 12%,var(--surface,#fff));font-size:22px}.student-main,.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.student-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.student-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.student-side{display:flex;align-items:center;gap:7px}.student-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.sd-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.sd-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.sd-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.sd-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.sd-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.sd-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.sd-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.sd-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.sd-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.sd-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.sd-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.sd-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.sd-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.sd-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.sd-form{display:grid;gap:10px}.sd-form label{display:grid;gap:6px}.sd-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.sd-menu-list{display:grid;gap:8px}.sd-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.sd-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--sd-primary) 10%,transparent);color:var(--sd-primary);font-weight:1000}.sd-menu-list button b,.sd-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd-menu-list button b{font-size:13px;font-weight:1000}.sd-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.sd-menu-list button.active{border-color:color-mix(in srgb,var(--sd-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--sd-primary) 8%,var(--surface,#fff))}.sd-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.sd-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.sd-sheet-actions button.primary{border-color:var(--sd-primary);background:var(--sd-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--sd-primary) 25%,transparent)}.sd-table-card,.sd-analysis,.sd-empty{padding:13px;border-radius:24px}.sd-table-card{margin-top:10px}.sd-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.sd-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.sd-table-scroll th,.sd-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.sd-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--sd-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.sd-table-scroll td strong,.sd-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.sd-table-actions{display:flex;gap:7px;overflow-x:auto}.sd-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--sd-primary);border-radius:999px;padding:0 12px;background:var(--sd-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.sd-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.sd-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.sd-analysis span,.sd-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.sd-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.sd-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.sd-analysis-list{display:grid;gap:10px;margin-top:12px}.sd-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.sd-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.sd-analysis-list b,.sd-analysis-list small{font-size:12px}.sd-analysis-list small{color:var(--muted,#64748b);font-weight:850}.sd-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.sd-progress i{display:block;height:100%;border-radius:inherit;background:var(--sd-primary)}.sd-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.sd-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--sd-primary) 12%,var(--surface,#fff));font-size:28px}.sd-empty h3{margin:0;font-size:18px;font-weight:1000}.sd-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.sd-recent{margin-top:10px;border-radius:24px;padding:12px}.sd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.sd-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.sd-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--sd-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.sd-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.sd-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.sd-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.student-row{border-radius:24px;padding:12px}.sd-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-analysis.wide{grid-column:span 2}.sd-sheet-backdrop{place-items:center;padding:18px}.sd-sheet{border-radius:28px;padding:18px}.sd-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.sd-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.sd-search-card,.sd-student-strip,.sd-list,.sd-analysis-grid,.sd-table-card,.sd-filter-chips,.sd-recent{max-width:1180px;margin-left:auto;margin-right:auto}.sd-list{grid-template-columns:repeat(3,minmax(0,1fr))}.sd-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.sd-analysis.wide{grid-column:span 2}.sd-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.sd-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.sd-icon-button,.sd-filter-button,.sd-add-inline{width:40px;height:40px}.student-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.student-side{grid-column:1/-1;justify-content:flex-end}.sd-student-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.sd-student-strip span{grid-row:2}.sd-sheet{border-radius:24px 24px 18px 18px;padding:12px}.sd-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.sd-sheet-actions button{width:100%}}
`;
