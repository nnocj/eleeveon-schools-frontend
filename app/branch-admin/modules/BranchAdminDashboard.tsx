
"use client";

/**
 * app/branch-admin/modules/BranchAdminDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ADMIN DASHBOARD V4.1
 * ---------------------------------------------------------
 * Golden Standard Branch Home.
 * Branch-scoped, offline-first, mobile-first, theme-safe.
 *
 * What changed in V4:
 * - The dashboard no longer keeps a manually duplicated module list.
 * - It receives the same navSections used by app/branch-admin/page.tsx.
 * - Adding/removing/reordering nav items in branch-admin/page.tsx automatically
 *   updates the dashboard module list.
 * - Counts are still real local Dexie counts, mapped by route key.
 * - Users & Roles now counts unique active visible users, not raw membership rows.
 * - Unknown/new module keys safely appear as Open until a metric is added.
 * - The Dashboard item itself is hidden from the dashboard module list.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and opened
 *   by RolePortalShell.
 * - Fall back to ActiveBranchContext/settings only if the selected workspace
 *   does not provide schoolId/branchId.
 * - This prevents the branch dashboard from counting another branch when a
 *   multi-role user switches workspaces.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db/db";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter =
  | "all"
  | "administration"
  | "attendance"
  | "communication"
  | "timetable"
  | "setup"
  | "records"
  | "finance"
  | "control"
  | "other";
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

const HIDDEN_DASHBOARD_KEYS = new Set(["branchAdminDashboard"]);

const TABLE_NAMES = [
  "students",
  "teachers",
  "parents",
  "classes",
  "classSubjects",
  "studentEnrollments",
  "attendance",
  "teacherAttendance",
  "announcements",
  "messageThreads",
  "calendarEvents",
  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "organizations",
  "subjects",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "academicStructures",
  "academicPeriods",
  "assessmentStructures",
  "assessmentStructureItems",
  "assessmentApplicabilities",
  "gradingSystems",
  "gradeRules",
  "reportCards",
  "computedResults",
  "studentPromotions",
  "studentReportSnapshots",
  "incomes",
  "expenses",
  "feeStructures",
  "studentFeeInvoices",
  "studentFeePayments",
  "payments",
  "paymentTransactions",
  "paymentSettlements",
  "withdrawalRequests",
  "schoolPayoutSettings",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "userMemberships",
  "memberships",
  "schoolBranchSettings",
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

function selectedBranchName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeBranch?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return text(
    args.activeBranch?.name ||
      args.openWorkspace?.memberName ||
      args.openWorkspace?.fullName ||
      args.openWorkspace?.userName ||
      membership?.branchName ||
      membership?.branch?.name,
    "Active Branch"
  );
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow) {
  return row?.id ?? row?.localId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function branchScoped(row: AnyRow, accountId?: string | null, schoolId?: number | string | null, branchId?: number | string | null) {
  if (!sameAccount(row, accountId)) return false;
  const rowSchoolId = row.schoolId ?? row.schoolLocalId ?? row.payload?.schoolId;
  const rowBranchId = row.branchId ?? row.branchLocalId ?? row.payload?.branchId;
  if (schoolId && rowSchoolId && String(rowSchoolId) !== String(schoolId)) return false;
  if (branchId && rowBranchId && String(rowBranchId) !== String(branchId)) return false;
  return true;
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return row?.isDeleted !== true && row?.active !== false && !["deleted", "archived", "inactive", "disabled"].includes(status);
}

function rowName(row?: AnyRow) {
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
  if (value.includes("admin")) return "administration";
  if (value.includes("attendance")) return "attendance";
  if (value.includes("communication")) return "communication";
  if (value.includes("calendar") || value.includes("timetable")) return "timetable";
  if (value.includes("setup") || value.includes("academic") || value.includes("curriculum") || value.includes("assessment") || value.includes("grading")) return "setup";
  if (value.includes("record")) return "records";
  if (value.includes("finance")) return "finance";
  if (value.includes("control") || value.includes("setting")) return "control";
  return "other";
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "sent", "succeeded", "success", "synced", "present", "published"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "expired", "suspended", "absent", "withdrawn"].includes(value)) return "red";
  if (["pending", "processing", "trial", "draft", "late"].includes(value)) return "orange";
  if (["scheduled", "issued", "completed", "promoted"].includes(value)) return "blue";
  return "gray";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    administration: "Administration",
    attendance: "Attendance",
    communication: "Communication",
    timetable: "Calendar & Timetable",
    setup: "Setup",
    records: "Academic Records",
    finance: "Finance",
    control: "Branch Control",
    other: "Other",
  };
  return labels[area] || area;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`bd-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="bd-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="bd-empty">
      <div>🏠</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function uniqueCount(rows: AnyRow[], key: string) {
  return new Set(rows.filter(activeRow).map((row) => row[key]).filter((value) => value !== undefined && value !== null && value !== "")).size;
}

function uniqueUsersRoleCount(rows: AnyRow[]) {
  const users = new Map<string, AnyRow>();

  rows
    .filter(activeRow)
    .forEach((row) => {
      const key = String(
        row.userId ||
          row.appUserId ||
          row.user?.id ||
          row.appUser?.id ||
          row.email ||
          row.userEmail ||
          row.user?.email ||
          row.appUser?.email ||
          row.id ||
          `${row.role || "user"}-${row.teacherLocalId || row.studentLocalId || row.parentLocalId || row.teacherId || row.studentId || row.parentId || ""}`
      );

      if (key && key !== "undefined" && key !== "null") {
        users.set(key, row);
      }
    });

  return users.size;
}

function sum(rows: AnyRow[], field: string) {
  return rows.filter(activeRow).reduce((total, row) => total + n(row[field]), 0);
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
    students: {
      value: summary.students,
      note: `${summary.enrollments} enrollment record(s), ${summary.uniqueEnrolledStudents} unique enrolled student(s).`,
      tone: summary.students ? "green" : summary.uniqueEnrolledStudents ? "orange" : "gray",
    },
    teachers: { value: summary.teachers, note: "Branch teaching staff and profiles.", tone: summary.teachers ? "blue" : "orange" },
    parents: { value: summary.parents, note: "Parent and guardian contacts linked to students.", tone: summary.parents ? "purple" : "gray" },
    classes: { value: summary.classes, note: `${summary.classSubjects} class subject link(s).`, tone: summary.classes ? "blue" : "orange" },
    classSubjects: { value: summary.classSubjects, note: "Connect classes, subjects, curriculum and teachers.", tone: summary.classSubjects ? "green" : "gray" },
    studentEnrollments: { value: summary.enrollments, note: "Class placement and academic enrollment records.", tone: summary.enrollments ? "green" : "gray" },
    studentAttendance: { value: summary.presentToday || summary.studentAttendance, note: `${summary.todayStudentAttendance} student attendance record(s) today.`, tone: summary.presentToday ? "green" : "orange" },
    teacherAttendance: { value: summary.teacherPresentToday || summary.teacherAttendance, note: `${summary.todayTeacherAttendance} teacher attendance record(s) today.`, tone: summary.teacherPresentToday ? "green" : "orange" },
    announcements: { value: summary.announcements, note: "Branch broadcasts to teachers, parents, students and accountants.", tone: summary.announcements ? "blue" : "gray" },
    messages: { value: summary.messages, note: "Branch conversations and operational follow-ups.", tone: summary.messages ? "green" : "gray" },
    calendar: { value: summary.events, note: "Branch events, reminders and academic dates.", tone: summary.events ? "blue" : "gray" },
    branchTimetable: { value: summary.timetables, note: `${summary.sessions} timetable session(s) available.`, tone: summary.timetables ? "green" : "gray" },
    classTimetable: { value: summary.sessions, note: "Class-level timetable sessions and lesson blocks.", tone: summary.sessions ? "blue" : "gray" },
    teacherTimetable: { value: summary.teachers, note: "Teacher lesson allocation and schedule checks.", tone: summary.teachers ? "purple" : "gray" },
    examTimetable: { value: summary.sessions || "Open", note: "Exam schedule, rooms, invigilators and conflicts.", tone: summary.sessions ? "blue" : "orange" },
    resourceTimetable: { value: summary.resources || "Open", note: "Rooms, halls, resources and booking conflicts.", tone: summary.resources ? "green" : "blue" },
    organizations: { value: summary.organizations, note: "Departments, houses, clubs and committees.", tone: summary.organizations ? "green" : "gray" },
    curriculumSetup: { value: summary.curriculums, note: `${summary.pathways} pathway(s), ${summary.curriculumSubjects} curriculum subject(s).`, tone: summary.curriculums ? "green" : "orange" },
    courseOutline: { value: "Open", note: "Visual course/subject outline connection.", tone: "blue" },
    curriculumPathways: { value: summary.pathways, note: "Pathways under branch curriculums.", tone: summary.pathways ? "blue" : "gray" },
    subjects: { value: summary.subjects, note: "Branch subjects with media and academic categorization.", tone: summary.subjects ? "green" : "orange" },
    curriculumSubjects: { value: summary.curriculumSubjects, note: "Subject rules, credits and curriculum links.", tone: summary.curriculumSubjects ? "green" : "gray" },
    academicStructures: { value: summary.academicStructures, note: "Levels, structures and academic organization.", tone: summary.academicStructures ? "blue" : "orange" },
    academicPeriods: { value: summary.academicPeriods, note: "Terms, semesters and active school periods.", tone: summary.academicPeriods ? "blue" : "orange" },
    assessmentStructure: { value: summary.assessmentStructures, note: `${summary.assessmentItems} assessment item(s).`, tone: summary.assessmentStructures ? "purple" : "gray" },
    assessmentItems: { value: summary.assessmentItems, note: "Score items and weights under assessment structures.", tone: summary.assessmentItems ? "purple" : "gray" },
    assessmentApplicability: { value: summary.assessmentApplicabilities, note: "Apply assessment systems to class subjects.", tone: summary.assessmentApplicabilities ? "green" : "gray" },
    gradingSystems: { value: summary.gradingSystems, note: `${summary.gradingRules} grading rule(s).`, tone: summary.gradingSystems ? "purple" : "orange" },
    gradingRules: { value: summary.gradingRules, note: "Grade bands, remarks and GPA rules.", tone: summary.gradingRules ? "purple" : "gray" },
    studentReports: { value: summary.reports, note: "Published and draft student report cards.", tone: summary.reports ? "green" : "gray" },
    broadsheets: { value: summary.broadsheets, note: "Computed result rows and class broadsheets.", tone: summary.broadsheets ? "blue" : "gray" },
    promotion: { value: summary.promotions, note: "Promotion, repeat, graduate and cumulative decisions.", tone: summary.promotions ? "green" : "gray" },
    cumulativeRecords: { value: summary.cumulativeRecords, note: "Long-term student academic records.", tone: summary.cumulativeRecords ? "blue" : "gray" },
    fees: { value: summary.pendingFees || summary.fees, note: `${summary.fees} fee/invoice record(s), ${summary.pendingFees} pending.`, tone: summary.pendingFees ? "orange" : summary.fees ? "green" : "gray" },
    incomes: { value: money(summary.incomeTotal), note: "Branch income records and revenue tracking.", tone: summary.incomeTotal ? "green" : "gray" },
    expenses: { value: money(summary.expenseTotal), note: "Branch expenses, categories and vendors.", tone: summary.expenseTotal ? "orange" : "gray" },
    payroll: { value: summary.payrollItems || summary.payrollProfiles || summary.teachers, note: "Staff pay profiles, runs, items and payouts.", tone: summary.payrollItems || summary.payrollProfiles ? "blue" : "gray" },
    withdrawMoney: { value: summary.withdrawals || "Open", note: "Branch withdrawal requests and payout tracking.", tone: summary.withdrawals ? "orange" : "gray" },
    schoolPayoutSettings: { value: summary.payoutSettings || "Open", note: "Branch payout method and settlement settings.", tone: summary.payoutSettings ? "green" : "purple" },
    branchWallet: { value: money(summary.paymentTotal + summary.incomeTotal - summary.expenseTotal), note: "Estimated branch wallet movement from local records.", tone: summary.paymentTotal || summary.incomeTotal ? "green" : "gray" },
    settlements: { value: summary.settlements, note: "Payment settlement history and reconciliation.", tone: summary.settlements ? "green" : "gray" },
    branchSettings: { value: summary.settings || "Open", note: "Branch identity, branding and report settings.", tone: "purple" },
    usersRoles: { value: summary.usersRoles, note: "Branch-scoped access under the owner/school line of authority.", tone: summary.usersRoles ? "green" : "orange" },
    localSettings: { value: "Open", note: "Device display preferences only; branch branding stays protected.", tone: "gray" },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedTableName = routeKey;
  const guessedRows = rows[guessedTableName] || [];
  if (guessedRows.length) {
    return {
      value: count(guessedRows),
      note: "Auto-counted from matching local table.",
      tone: count(guessedRows) ? "green" : "gray",
    };
  }

  return {
    value: "Open",
    note: "Module is listed from Branch Admin navigation. Add a metric mapping when data is ready.",
    tone: "gray",
  };
}

export default function BranchAdminDashboard({ navigate, navSections }: RouteProps) {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();
  const { activeMembership } = useActiveMembership();
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

  const { loading, setLoading } = useBackgroundLoader();
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
          return [tableName, rows.filter((row) => branchScoped(row, accountId, schoolId, branchId))] as const;
        })
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load branch admin dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading,
    dataRevision,
  ]);

  const rows = rowsByTable;

  const summary = useMemo(() => {
    const today = todayKey();
    const students = rows.students || [];
    const teachers = rows.teachers || [];
    const parents = rows.parents || [];
    const classes = rows.classes || [];
    const classSubjects = rows.classSubjects || [];
    const enrollments = rows.studentEnrollments || [];
    const studentAttendance = rows.attendance || [];
    const teacherAttendance = rows.teacherAttendance || [];
    const fees = [...(rows.feeStructures || []), ...(rows.studentFeeInvoices || [])];
    const payments = [...(rows.payments || []), ...(rows.studentFeePayments || []), ...(rows.paymentTransactions || [])];
    const memberships = (rows.userMemberships || []).filter(activeRow).length
      ? (rows.userMemberships || []).filter(activeRow)
      : (rows.memberships || []).filter(activeRow);
    const todayStudentAttendance = studentAttendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));
    const presentToday = todayStudentAttendance.filter((row) => String(row.status || "").toLowerCase() === "present").length;
    const todayTeacherAttendance = teacherAttendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));
    const teacherPresentToday = todayTeacherAttendance.filter((row) => String(row.status || row.clockIn || "").toLowerCase().includes("present") || row.clockIn).length;
    const pendingFees = fees.filter((row) => !["paid", "void", "cancelled"].includes(String(row.status || "").toLowerCase())).length;

    return {
      students: count(students),
      teachers: count(teachers),
      parents: count(parents),
      classes: count(classes),
      classSubjects: count(classSubjects),
      enrollments: count(enrollments),
      uniqueEnrolledStudents: uniqueCount(enrollments, "studentId"),
      studentAttendance: count(studentAttendance),
      teacherAttendance: count(teacherAttendance),
      presentToday,
      todayStudentAttendance: todayStudentAttendance.length,
      teacherPresentToday,
      todayTeacherAttendance: todayTeacherAttendance.length,
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      events: count(rows.calendarEvents || []),
      timetables: count(rows.scheduleTimetables || []),
      sessions: count(rows.scheduleSessions || []),
      resources: count(rows.scheduleResources || []),
      organizations: count(rows.organizations || []),
      subjects: count(rows.subjects || []),
      curriculums: count(rows.curriculums || []),
      pathways: count(rows.curriculumPathways || []),
      curriculumSubjects: count(rows.curriculumSubjects || []),
      academicStructures: count(rows.academicStructures || []),
      academicPeriods: count(rows.academicPeriods || []),
      assessmentStructures: count(rows.assessmentStructures || []),
      assessmentItems: count(rows.assessmentStructureItems || []),
      assessmentApplicabilities: count(rows.assessmentApplicabilities || []),
      gradingSystems: count(rows.gradingSystems || []),
      gradingRules: count(rows.gradeRules || []),
      reports: count(rows.reportCards || []),
      broadsheets: count(rows.computedResults || []),
      promotions: count(rows.studentPromotions || []),
      cumulativeRecords: count([...(rows.studentReportSnapshots || []), ...(rows.computedResults || [])]),
      incomeTotal: sum(rows.incomes || [], "amount"),
      expenseTotal: sum(rows.expenses || [], "amount"),
      paymentTotal: payments.reduce((total, row) => total + n(row.amount || row.total), 0),
      fees: count(fees),
      pendingFees,
      settlements: count(rows.paymentSettlements || []),
      withdrawals: count(rows.withdrawalRequests || []),
      payoutSettings: count(rows.schoolPayoutSettings || []),
      payrollProfiles: count(rows.staffPayrollProfiles || []),
      payrollRuns: count(rows.payrollRuns || []),
      payrollItems: count(rows.payrollItems || []),
      usersRoles: uniqueUsersRoleCount(memberships),
      settings: count(rows.schoolBranchSettings || []),
      branchName: selectedBranchName({ openWorkspace, activeMembership, activeBranch }),
    };
  }, [activeBranch, rows, openWorkspace, activeMembership]);

  const modules = useMemo<DashboardModule[]>(() => {
    const navModules = buildNavModules(navSections);

    return navModules.map((module) => {
      const metric = metricFor(module.routeKey, rows, summary);
      return {
        ...module,
        ...metric,
      };
    });
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
    const students = rows.students || [];
    const teachers = rows.teachers || [];
    const classes = rows.classes || [];
    const announcements = rows.announcements || [];
    const threads = rows.messageThreads || [];
    const payments = [...(rows.payments || []), ...(rows.studentFeePayments || []), ...(rows.paymentTransactions || [])];

    const recentRows: AnyRow[] = [
      ...students.map((row) => ({ ...row, _kind: "Student", _icon: "🧑‍🎓", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...teachers.map((row) => ({ ...row, _kind: "Teacher", _icon: "👨‍🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...classes.map((row) => ({ ...row, _kind: "Class", _icon: "🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...announcements.map((row) => ({ ...row, _kind: "Announcement", _icon: "📣", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...threads.map((row) => ({ ...row, _kind: "Message", _icon: "💬", _title: text(row.subject || row.title, "Message thread"), _date: row.lastMessageAt || row.updatedAt || row.createdAt })),
      ...payments.map((row) => ({ ...row, _kind: "Payment", _icon: "💰", _title: money(row.amount || row.total, row.currency || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
    ];

    return recentRows.sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
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
      // RolePortalShell navigation events are optional; the cards remain safe if unsupported.
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening branch dashboard..." text="Loading branch students, staff, academics, finance and communication records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the branch dashboard." />;
  }

  return (
    <main className="bd-page" style={{ "--bd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="bd-search-card" aria-label="Branch dashboard search and actions">
        <span className={`status-dot-mini ${summary.students || summary.classes ? "green" : "gray"}`} title={`${summary.branchName}: ${summary.students} student(s), ${summary.classes} class(es)`} />

        <label className="bd-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branch modules..." aria-label="Search branch dashboard" />
        </label>

        <button type="button" className="bd-add-inline" onClick={load} aria-label="Refresh branch dashboard" title="Refresh">↻</button>

        <button type="button" className={`bd-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="bd-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="bd-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}

      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="bd-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="branch-row" onClick={() => openRoute(item.routeKey)}>
              <span className="branch-avatar">{item.icon}</span>
              <span className="branch-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="branch-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching branch modules" text="Clear filters or search to show your branch modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="bd-recent">
          <div className="bd-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="bd-recent-list">
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

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="bd-page" style={{ "--bd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="bd-state">
        <div className="bd-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="bd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bd-sheet small">
        <div className="bd-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which branch area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="bd-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="administration">Administration</option>
              <option value="attendance">Attendance</option>
              <option value="communication">Communication</option>
              <option value="timetable">Calendar & Timetable</option>
              <option value="setup">Setup</option>
              <option value="records">Academic Records</option>
              <option value="finance">Finance</option>
              <option value="control">Branch Control</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="bd-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="bd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bd-sheet small">
        <div className="bd-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the branch home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="bd-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact branch modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense laptop-friendly module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.students} students · {summary.teachers} teachers · {summary.classes} classes</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch dashboard data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="bd-table-card">
      <div className="bd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Branch Modules ({modules.length})</th>
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
                <td><div className="bd-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="bd-empty-table">No branch module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["administration", "attendance", "communication", "timetable", "setup", "records", "finance", "control", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="bd-analysis-grid">
      <article className="bd-analysis"><span>Students</span><strong>{summary.students}</strong><p>{summary.classes} class(es), {summary.enrollments} enrollment record(s), {summary.uniqueEnrolledStudents} unique enrolled student(s).</p></article>
      <article className="bd-analysis"><span>Staff</span><strong>{summary.teachers}</strong><p>{summary.todayTeacherAttendance} teacher attendance record(s) today.</p></article>
      <article className="bd-analysis"><span>Attendance Today</span><strong>{summary.presentToday}</strong><p>{summary.todayStudentAttendance} student attendance record(s) today.</p></article>
      <article className="bd-analysis"><span>Finance</span><strong>{money(summary.incomeTotal + summary.paymentTotal)}</strong><p>{summary.pendingFees} pending fee/invoice record(s).</p></article>
      <article className="bd-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="bd-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="bd-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="bd-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from students, teachers, classes, announcements, messages and payments.</p></article>
    </section>
  );
}

const css = `

@keyframes spin { to { transform: rotate(360deg); } }
.bd-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--bd-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.bd-page *,.bd-page *::before,.bd-page *::after{box-sizing:border-box;min-width:0}.bd-page button,.bd-page input,.bd-page select{font:inherit;max-width:100%}.bd-page button{-webkit-tap-highlight-color:transparent}.bd-page input,.bd-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.bd-page input:focus,.bd-page select:focus{border-color:color-mix(in srgb,var(--bd-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--bd-primary) 12%,transparent)}.bd-state,.bd-search-card,.branch-row,.bd-table-card,.bd-analysis,.bd-empty,.bd-sheet,.bd-recent,.recent-row{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.bd-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.bd-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--bd-primary) 18%,transparent);border-top-color:var(--bd-primary);animation:spin .8s linear infinite}.bd-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.bd-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bd-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.bd-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.bd-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.bd-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.bd-icon-button,.bd-filter-button,.bd-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.bd-add-inline{border-color:var(--bd-primary);background:var(--bd-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--bd-primary) 22%,transparent)}.bd-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.bd-filter-button{position:relative;background:color-mix(in srgb,var(--bd-primary) 8%,var(--card-bg,#fff));color:var(--bd-primary)}.bd-filter-button.active{background:var(--bd-primary);color:#fff;border-color:var(--bd-primary)}.bd-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.bd-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.bd-filter-chips::-webkit-scrollbar{display:none}.bd-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--bd-primary) 11%,transparent);color:var(--bd-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.bd-list{display:grid;gap:7px;margin-top:10px}.branch-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.branch-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--bd-primary) 12%,var(--surface,#fff));font-size:22px}.branch-main,.branch-main strong,.branch-main small,.branch-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.branch-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.branch-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.branch-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.branch-side{display:flex;align-items:center;gap:7px}.branch-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.bd-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.bd-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.bd-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.bd-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.bd-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.bd-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.bd-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.bd-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.bd-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.bd-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.bd-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.bd-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.bd-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.bd-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.bd-form{display:grid;gap:10px}.bd-form label{display:grid;gap:6px}.bd-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.bd-menu-list{display:grid;gap:8px}.bd-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.bd-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--bd-primary) 10%,transparent);color:var(--bd-primary);font-weight:1000}.bd-menu-list button b,.bd-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bd-menu-list button b{font-size:13px;font-weight:1000}.bd-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.bd-menu-list button.active{border-color:color-mix(in srgb,var(--bd-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--bd-primary) 8%,var(--surface,#fff))}.bd-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.bd-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.bd-sheet-actions button.primary{border-color:var(--bd-primary);background:var(--bd-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--bd-primary) 25%,transparent)}.bd-table-card,.bd-analysis,.bd-empty{padding:13px;border-radius:24px}.bd-table-card{margin-top:10px}.bd-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.bd-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.bd-table-scroll th,.bd-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.bd-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--bd-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.bd-table-scroll td strong,.bd-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bd-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.bd-table-actions{display:flex;gap:7px;overflow-x:auto}.bd-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--bd-primary);border-radius:999px;padding:0 12px;background:var(--bd-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.bd-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.bd-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.bd-analysis span,.bd-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.bd-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.bd-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.bd-analysis-list{display:grid;gap:10px;margin-top:12px}.bd-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.bd-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.bd-analysis-list b,.bd-analysis-list small{font-size:12px}.bd-analysis-list small{color:var(--muted,#64748b);font-weight:850}.bd-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.bd-progress i{display:block;height:100%;border-radius:inherit;background:var(--bd-primary)}.bd-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.bd-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--bd-primary) 12%,var(--surface,#fff));font-size:28px}.bd-empty h3{margin:0;font-size:18px;font-weight:1000}.bd-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bd-recent{margin-top:10px;border-radius:24px;padding:12px}.bd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.bd-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.bd-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--bd-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.bd-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.bd-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.bd-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.branch-row{border-radius:24px;padding:12px}.bd-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bd-analysis.wide{grid-column:span 2}.bd-sheet-backdrop{place-items:center;padding:18px}.bd-sheet{border-radius:28px;padding:18px}.bd-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.bd-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.bd-search-card,.bd-list,.bd-analysis-grid,.bd-table-card,.bd-filter-chips,.bd-recent{max-width:1180px;margin-left:auto;margin-right:auto}.bd-list{grid-template-columns:repeat(3,minmax(0,1fr))}.bd-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.bd-analysis.wide{grid-column:span 2}.bd-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.bd-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.bd-icon-button,.bd-filter-button,.bd-add-inline{width:40px;height:40px}.branch-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.branch-side{grid-column:1/-1;justify-content:flex-end}.bd-sheet{border-radius:24px 24px 18px 18px;padding:12px}.bd-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.bd-sheet-actions button{width:100%}}

`;
