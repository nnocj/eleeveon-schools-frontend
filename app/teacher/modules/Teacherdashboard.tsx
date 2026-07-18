"use client";

/**
 * app/teacher/modules/Teacherdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON TEACHER DASHBOARD V2
 * ---------------------------------------------------------
 * Golden Standard Teacher Home.
 * Teacher-scoped, offline-first, mobile-first, theme-safe.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and opened
 *   by RolePortalShell.
 * - Uses selected teacherLocalId, schoolId and branchId first.
 * - Falls back to ActiveMembershipProvider and ActiveBranchContext only if
 *   the selected workspace does not provide a value.
 * - Receives NAV_SECTIONS from app/teacher/page.tsx so dashboard modules
 *   always match the actual Teacher Portal menu.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db/db";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter = "all" | "teaching" | "learners" | "records" | "communication" | "timetable" | "finance" | "account" | "other";
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

const HIDDEN_DASHBOARD_KEYS = new Set(["teacherDashboard"]);

const TABLE_NAMES = [
  "teachers",
  "classes",
  "subjects",
  "classTeachers",
  "classSubjects",
  "studentEnrollments",
  "students",
  "attendance",
  "teacherAttendance",
  "assignments",
  "assignmentSubmissions",
  "courseOutlines",
  "lessonNotes",
  "assessmentEntries",
  "computedResults",
  "reportCards",
  "reportCardItems",
  "teacherRemarks",
  "studentRemarks",
  "announcements",
  "messageThreads",
  "messages",
  "calendarEvents",
  "scheduleTimetables",
  "scheduleSessions",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
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
  return openWorkspace?.membership || activeMembership || readStoredActiveMembership() || null;
}

function selectedTeacherId(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  const membership = workspaceMembership(openWorkspace, activeMembership);

  return firstPositiveNumber(
    openWorkspace?.teacherLocalId,
    membership?.teacherLocalId,
    membership?.localTeacherId,
    membership?.teacherId,
    membership?.teacher?.id,
    membership?.staffLocalId,
    safeRead("activeTeacherId")
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

function selectedTeacherName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  teacher?: AnyRow | null;
  user?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return text(
    args.teacher?.fullName ||
      args.teacher?.name ||
      args.openWorkspace?.memberName ||
      args.openWorkspace?.fullName ||
      args.openWorkspace?.userName ||
      membership?.fullName ||
      membership?.memberName ||
      membership?.userName ||
      args.user?.fullName ||
      args.user?.name ||
      args.user?.email,
    "Teacher"
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
  return (
    row?.isDeleted !== true &&
    row?.active !== false &&
    row?.disabled !== true &&
    !["deleted", "archived", "inactive", "disabled", "withdrawn", "cancelled"].includes(status)
  );
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

function todayKey() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function uniqueCount(rows: AnyRow[], key: string) {
  return new Set(
    rows
      .filter(activeRow)
      .map((row) => row[key])
      .filter((value) => value !== undefined && value !== null && value !== "")
  ).size;
}

function average(rows: AnyRow[], fields: string[]) {
  const values = rows
    .map((row) => fields.map((field) => n(row[field])).find((value) => value > 0) || 0)
    .filter((value) => value > 0);

  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function teacherLinkedRows(rows: AnyRow[], teacherId?: any) {
  if (!teacherId) return [];
  return rows.filter((row) =>
    sameId(row.teacherId, teacherId) ||
    sameId(row.teacherLocalId, teacherId) ||
    sameId(row.staffId, teacherId) ||
    sameId(row.staffLocalId, teacherId) ||
    sameId(row.primaryTeacherId, teacherId)
  );
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "present", "submitted", "completed", "published", "approved", "success"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "absent", "withdrawn", "rejected"].includes(value)) return "red";
  if (["pending", "processing", "draft", "late", "partial"].includes(value)) return "orange";
  if (["scheduled", "issued", "promoted"].includes(value)) return "blue";
  return "gray";
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("teaching")) return "teaching";
  if (value.includes("learner")) return "learners";
  if (value.includes("record")) return "records";
  if (value.includes("communication")) return "communication";
  if (value.includes("timetable")) return "timetable";
  if (value.includes("finance")) return "finance";
  if (value.includes("account")) return "account";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    teaching: "Teaching",
    learners: "Learners",
    records: "Records",
    communication: "Communication",
    timetable: "Timetable",
    finance: "Finance",
    account: "Account",
    other: "Other",
  };
  return labels[area] || area;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`td-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="td-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="td-empty">
      <div>👨‍🏫</div>
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
    teacherClasses: {
      value: summary.classes,
      note: `${summary.students} student(s) connected through your classes.`,
      tone: summary.classes ? "blue" : "gray",
    },
    teacherSubjects: {
      value: summary.subjects,
      note: `${summary.classSubjects} class-subject assignment(s).`,
      tone: summary.subjects ? "green" : "gray",
    },
    attendance: {
      value: summary.presentToday || summary.attendance,
      note: `${summary.todayAttendance} attendance record(s) today, ${summary.absent} absent/excused total.`,
      tone: summary.absent ? "orange" : summary.attendance ? "green" : "gray",
    },
    assessmentEntry: {
      value: summary.assessments,
      note: `${summary.averageScore ? `${summary.averageScore}% average score. ` : ""}${summary.results} computed result(s).`,
      tone: summary.assessments ? "blue" : "gray",
    },
    assignments: {
      value: summary.assignments,
      note: `${summary.submissions} submission record(s).`,
      tone: summary.assignments ? "purple" : "gray",
    },
    courseOutline: {
      value: summary.courseOutlines,
      note: "Course outlines assigned or created for your subjects/classes.",
      tone: summary.courseOutlines ? "blue" : "gray",
    },
    teacherStudents: {
      value: summary.students,
      note: "Students connected through your class/subject assignments.",
      tone: summary.students ? "green" : "gray",
    },
    studentProgress: {
      value: summary.averageScore ? `${summary.averageScore}%` : summary.results,
      note: `${summary.results} computed result record(s).`,
      tone: summary.results ? "blue" : "gray",
    },
    teacherRemarks: {
      value: summary.remarks,
      note: "Behaviour, report remarks and teacher comments.",
      tone: summary.remarks ? "green" : "gray",
    },
    teacherReports: {
      value: summary.reports,
      note: `${summary.reportItems} report card item(s).`,
      tone: summary.reports ? "blue" : "gray",
    },
    teacherBroadsheets: {
      value: summary.results,
      note: "Compiled student result records for broadsheet views.",
      tone: summary.results ? "purple" : "gray",
    },
    lessonNotes: {
      value: summary.lessonNotes,
      note: "Lesson notes and teaching preparation records.",
      tone: summary.lessonNotes ? "green" : "gray",
    },
    announcements: {
      value: summary.announcements,
      note: "School and branch announcements visible to teachers.",
      tone: summary.announcements ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "Teacher conversations and communication threads.",
      tone: summary.messages ? "green" : "gray",
    },
    calendar: {
      value: summary.events,
      note: "Calendar events in your school/branch.",
      tone: summary.events ? "blue" : "gray",
    },
    classTimetable: {
      value: summary.classSessions,
      note: "Class timetable sessions connected to your classes.",
      tone: summary.classSessions ? "purple" : "gray",
    },
    teacherTimetable: {
      value: summary.teacherSessions,
      note: "Your personal timetable sessions.",
      tone: summary.teacherSessions ? "green" : "gray",
    },
    teacherSalary: {
      value: summary.salaryAmount ? money(summary.salaryAmount, summary.currencyCode) : "Open",
      note: `${summary.payrollItems} payroll item(s), ${summary.salaryPayments} payment record(s).`,
      tone: summary.salaryPayments ? "green" : summary.salaryAmount ? "orange" : "gray",
    },
    teacherPaymentHistory: {
      value: summary.salaryPayments,
      note: `${money(summary.salaryPaid, summary.currencyCode)} total salary payment records.`,
      tone: summary.salaryPayments ? "green" : "gray",
    },
    teacherProfile: {
      value: "Open",
      note: "Your teacher identity and contact profile.",
      tone: "purple",
    },
    teacherSettings: {
      value: "Open",
      note: "Your local teacher portal preferences.",
      tone: "gray",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return { value: count(guessedRows), note: "Auto-counted from matching local table.", tone: count(guessedRows) ? "green" : "gray" };
  }

  return { value: "Open", note: "Module is listed from Teacher navigation. Add a metric mapping when data is ready.", tone: "gray" };
}

export default function Teacherdashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading, user } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();
  const { activeTeacherId, activeMembership } = useActiveMembership();
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

  const teacherId =
    selectedTeacherId(openWorkspace, activeMembership) ||
    toPositiveNumber(activeTeacherId);

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
      console.error("Failed to load teacher dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, teacherId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const teacher = useMemo(() => {
    const teachers = rows.teachers || [];
    const membership = workspaceMembership(openWorkspace, activeMembership);
    const memberEmail = membership?.email || membership?.teacherEmail || (openWorkspace as any)?.email;

    return (
      teachers.find((row) => teacherId && sameId(idOf(row), teacherId)) ||
      teachers.find((row) => memberEmail && sameId(row.email || row.teacherEmail, memberEmail)) ||
      null
    );
  }, [activeMembership, openWorkspace, rows.teachers, teacherId]);

  const teacherClassLinks = useMemo(() => teacherLinkedRows(rows.classTeachers || [], teacherId), [rows.classTeachers, teacherId]);
  const teacherSubjectLinks = useMemo(() => teacherLinkedRows(rows.classSubjects || [], teacherId), [rows.classSubjects, teacherId]);

  const classIds = useMemo(() => {
    const ids = new Set<string>();
    teacherClassLinks.forEach((row) => ids.add(String(row.classId || row.classLocalId)));
    teacherSubjectLinks.forEach((row) => ids.add(String(row.classId || row.classLocalId)));
    (rows.classes || []).forEach((row) => {
      if (teacherId && (sameId(row.teacherId, teacherId) || sameId(row.classTeacherId, teacherId) || sameId(row.primaryTeacherId, teacherId))) {
        ids.add(String(idOf(row)));
      }
    });
    return ids;
  }, [rows.classes, teacherClassLinks, teacherId, teacherSubjectLinks]);

  const subjectIds = useMemo(() => {
    const ids = new Set<string>();
    teacherSubjectLinks.forEach((row) => ids.add(String(row.subjectId || row.subjectLocalId)));
    (rows.subjects || []).forEach((row) => {
      if (teacherId && (sameId(row.teacherId, teacherId) || sameId(row.subjectTeacherId, teacherId))) {
        ids.add(String(idOf(row)));
      }
    });
    return ids;
  }, [rows.subjects, teacherId, teacherSubjectLinks]);

  const classes = useMemo(() => {
    return (rows.classes || []).filter((row) => classIds.has(String(idOf(row))) || classIds.has(String(row.classId)));
  }, [classIds, rows.classes]);

  const subjects = useMemo(() => {
    return (rows.subjects || []).filter((row) => subjectIds.has(String(idOf(row))) || subjectIds.has(String(row.subjectId)));
  }, [rows.subjects, subjectIds]);

  const students = useMemo(() => {
    const enrollments = rows.studentEnrollments || [];
    const studentIds = new Set<string>();

    enrollments.forEach((row) => {
      if (classIds.has(String(row.classId || row.classLocalId))) {
        studentIds.add(String(row.studentId || row.studentLocalId));
      }
    });

    return (rows.students || []).filter((row) => studentIds.has(String(idOf(row))) || studentIds.has(String(row.studentId)));
  }, [classIds, rows.studentEnrollments, rows.students]);

  const studentIds = useMemo(
    () => new Set(students.map((student) => String(idOf(student))).filter(Boolean)),
    [students]
  );

  const summary = useMemo(() => {
    const today = todayKey();
    const attendance = (rows.attendance || []).filter((row) => studentIds.has(String(row.studentId)));
    const todayAttendance = attendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));
    const teacherAttendance = teacherLinkedRows(rows.teacherAttendance || [], teacherId);
    const todayTeacherAttendance = teacherAttendance.filter((row) => String(row.date || row.createdAt || "").startsWith(today));
    const assignments = teacherLinkedRows(rows.assignments || [], teacherId).filter((row) => !row.classId || classIds.has(String(row.classId)));
    const submissions = (rows.assignmentSubmissions || []).filter((row) => studentIds.has(String(row.studentId)));
    const assessments = teacherLinkedRows(rows.assessmentEntries || [], teacherId).filter((row) => !row.studentId || studentIds.has(String(row.studentId)));
    const results = (rows.computedResults || []).filter((row) => studentIds.has(String(row.studentId)));
    const reports = (rows.reportCards || []).filter((row) => studentIds.has(String(row.studentId)));
    const reportItems = (rows.reportCardItems || []).filter((row) => studentIds.has(String(row.studentId)));
    const remarks = [...(rows.teacherRemarks || []), ...(rows.studentRemarks || [])].filter((row) => !row.teacherId || sameId(row.teacherId, teacherId));
    const courseOutlines = teacherLinkedRows(rows.courseOutlines || [], teacherId).filter((row) => !row.subjectId || subjectIds.has(String(row.subjectId)));
    const lessonNotes = teacherLinkedRows(rows.lessonNotes || [], teacherId);
    const teacherSessions = teacherLinkedRows(rows.scheduleSessions || [], teacherId);
    const classSessions = (rows.scheduleSessions || []).filter((row) => row.classId && classIds.has(String(row.classId)));
    const payrollProfiles = teacherLinkedRows(rows.staffPayrollProfiles || [], teacherId);
    const payrollItems = teacherLinkedRows(rows.payrollItems || [], teacherId);
    const salaryPayments = teacherLinkedRows(rows.staffPaymentRecords || [], teacherId);
    const salaryAmount = n(payrollProfiles[0]?.basicSalary || payrollProfiles[0]?.salary || payrollItems[0]?.grossPay || payrollItems[0]?.netPay);
    const salaryPaid = salaryPayments.reduce((total, row) => total + n(row.amount || row.total || row.netPay), 0);

    return {
      teacherName: selectedTeacherName({ openWorkspace, activeMembership, teacher, user }),
      schoolName: text(activeSchool?.name, schoolId ? `School ${schoolId}` : "School"),
      branchName: text(activeBranch?.name, branchId ? `Branch ${branchId}` : "Branch"),
      classes: count(classes),
      subjects: count(subjects),
      classSubjects: count(teacherSubjectLinks),
      students: count(students),
      attendance: count(attendance),
      todayAttendance: todayAttendance.length,
      presentToday: todayAttendance.filter((row) => String(row.status || "").toLowerCase() === "present").length,
      absent: attendance.filter((row) => ["absent", "excused"].includes(String(row.status || "").toLowerCase())).length,
      teacherAttendance: count(teacherAttendance),
      teacherPresentToday: todayTeacherAttendance.filter((row) => String(row.status || row.clockIn || "").toLowerCase().includes("present") || row.clockIn).length,
      assignments: count(assignments),
      submissions: count(submissions),
      assessments: count(assessments),
      results: count(results),
      averageScore: average([...assessments, ...results], ["percentage", "average", "score", "totalScore"]),
      reports: count(reports),
      reportItems: count(reportItems),
      remarks: count(remarks),
      courseOutlines: count(courseOutlines),
      lessonNotes: count(lessonNotes),
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      events: count(rows.calendarEvents || []),
      teacherSessions: count(teacherSessions),
      classSessions: count(classSessions),
      timetables: count(rows.scheduleTimetables || []),
      payrollProfiles: count(payrollProfiles),
      payrollItems: count(payrollItems),
      salaryPayments: count(salaryPayments),
      salaryAmount,
      salaryPaid,
      currencyCode: text(salaryPayments[0]?.currencyCode || payrollItems[0]?.currencyCode || payrollProfiles[0]?.currencyCode, "GHS"),
    };
  }, [
    activeBranch,
    activeMembership,
    activeSchool,
    branchId,
    classIds,
    classes,
    openWorkspace,
    rows,
    schoolId,
    studentIds,
    students,
    subjectIds,
    subjects,
    teacher,
    teacherId,
    teacherSubjectLinks,
    user,
  ]);

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
      ...classes.map((row) => ({ ...row, _kind: "Class", _icon: "🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...subjects.map((row) => ({ ...row, _kind: "Subject", _icon: "📘", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.assignments || []).map((row) => ({ ...row, _kind: "Assignment", _icon: "🧩", _title: text(row.title, "Assignment"), _date: row.dueDate || row.updatedAt || row.createdAt })),
      ...(rows.assessmentEntries || []).map((row) => ({ ...row, _kind: "Assessment", _icon: "📝", _title: text(row.title || row.subjectName, "Assessment"), _date: row.updatedAt || row.createdAt })),
      ...(rows.announcements || []).map((row) => ({ ...row, _kind: "Announcement", _icon: "📢", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.scheduleSessions || []).map((row) => ({ ...row, _kind: "Timetable", _icon: "🗓️", _title: text(row.title || row.subjectName, "Timetable session"), _date: row.startAt || row.startTime || row.date || row.updatedAt || row.createdAt })),
      ...(rows.staffPaymentRecords || []).map((row) => ({ ...row, _kind: "Salary", _icon: "💵", _title: money(row.amount || row.total || row.netPay, row.currencyCode || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
    ];

    return records.filter(activeRow).sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [classes, rows, subjects]);

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
    return <State primary={primary} title="Opening teacher dashboard..." text="Loading your classes, subjects, learners, records and salary data." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the teacher portal." />;
  }

  if (!teacherId && !teacher) {
    return <State primary={primary} title="No teacher profile selected" text="Choose your teacher membership again from Select Role so the dashboard can load the correct teacher record." />;
  }

  return (
    <main className="td-page" style={{ "--td-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="td-search-card" aria-label="Teacher dashboard search and actions">
        <span className={`status-dot-mini ${summary.classes || summary.subjects ? "green" : "gray"}`} title={`${summary.teacherName}: ${summary.classes} class(es), ${summary.subjects} subject(s)`} />

        <label className="td-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teacher modules..." aria-label="Search teacher dashboard" />
        </label>

        <button type="button" className="td-add-inline" onClick={load} aria-label="Refresh teacher dashboard" title="Refresh">↻</button>

        <button type="button" className={`td-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="td-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="td-teacher-strip" aria-label="Current teacher context">
        <strong>{summary.teacherName}</strong>
        <span>{summary.branchName} · {summary.classes} classes · {summary.subjects} subjects</span>
        <Chip tone={summary.teacherPresentToday ? "green" : "gray"}>{summary.teacherPresentToday ? "Present today" : "Attendance"}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="td-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="td-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="teacher-row" onClick={() => openRoute(item.routeKey)}>
              <span className="teacher-avatar">{item.icon}</span>
              <span className="teacher-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="teacher-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching teacher modules" text="Clear filters or search to show your teacher modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="td-recent">
          <div className="td-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="td-recent-list">
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

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="td-page" style={{ "--td-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="td-state">
        <div className="td-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="td-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="td-sheet small">
        <div className="td-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which teacher area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="td-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="teaching">Teaching</option>
              <option value="learners">Learners</option>
              <option value="records">Records</option>
              <option value="communication">Communication</option>
              <option value="timetable">Timetable</option>
              <option value="finance">Finance</option>
              <option value="account">Account</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="td-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="td-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="td-sheet small">
        <div className="td-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the teacher home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="td-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact teacher modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.classes} classes · {summary.students} students · {summary.assessments} assessments</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local teacher data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="td-table-card">
      <div className="td-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Teacher Modules ({modules.length})</th>
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
                <td><div className="td-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="td-empty-table">No teacher module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["teaching", "learners", "records", "communication", "timetable", "finance", "account", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="td-analysis-grid">
      <article className="td-analysis"><span>Classes</span><strong>{summary.classes}</strong><p>{summary.students} learner(s), {summary.subjects} subject(s).</p></article>
      <article className="td-analysis"><span>Attendance Today</span><strong>{summary.presentToday}</strong><p>{summary.todayAttendance} student attendance record(s), {summary.teacherPresentToday ? "teacher present" : "teacher not marked"}.</p></article>
      <article className="td-analysis"><span>Assessment</span><strong>{summary.averageScore ? `${summary.averageScore}%` : summary.assessments}</strong><p>{summary.assessments} assessment entry record(s), {summary.results} result record(s).</p></article>
      <article className="td-analysis"><span>Salary</span><strong>{summary.salaryAmount ? money(summary.salaryAmount, summary.currencyCode) : "—"}</strong><p>{summary.salaryPayments} payment record(s), {money(summary.salaryPaid, summary.currencyCode)} paid.</p></article>
      <article className="td-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="td-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="td-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="td-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from classes, subjects, assignments, assessments, timetable and salary.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.td-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--td-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.td-page *,.td-page *::before,.td-page *::after{box-sizing:border-box;min-width:0}.td-page button,.td-page input,.td-page select{font:inherit;max-width:100%}.td-page button{-webkit-tap-highlight-color:transparent}.td-page input,.td-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.td-page input:focus,.td-page select:focus{border-color:color-mix(in srgb,var(--td-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--td-primary) 12%,transparent)}.td-state,.td-search-card,.teacher-row,.td-table-card,.td-analysis,.td-empty,.td-sheet,.td-recent,.recent-row,.td-teacher-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.td-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.td-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--td-primary) 18%,transparent);border-top-color:var(--td-primary);animation:spin .8s linear infinite}.td-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.td-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.td-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.td-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.td-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.td-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.td-icon-button,.td-filter-button,.td-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.td-add-inline{border-color:var(--td-primary);background:var(--td-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--td-primary) 22%,transparent)}.td-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.td-filter-button{position:relative;background:color-mix(in srgb,var(--td-primary) 8%,var(--card-bg,#fff));color:var(--td-primary)}.td-filter-button.active{background:var(--td-primary);color:#fff;border-color:var(--td-primary)}.td-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.td-teacher-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.td-teacher-strip strong,.td-teacher-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.td-teacher-strip strong{font-size:13px;font-weight:1000}.td-teacher-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.td-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.td-filter-chips::-webkit-scrollbar{display:none}.td-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--td-primary) 11%,transparent);color:var(--td-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.td-list{display:grid;gap:7px;margin-top:10px}.teacher-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.teacher-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--td-primary) 12%,var(--surface,#fff));font-size:22px}.teacher-main,.teacher-main strong,.teacher-main small,.teacher-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.teacher-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.teacher-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.teacher-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.teacher-side{display:flex;align-items:center;gap:7px}.teacher-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.td-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.td-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.td-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.td-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.td-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.td-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.td-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.td-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.td-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.td-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.td-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.td-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.td-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.td-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.td-form{display:grid;gap:10px}.td-form label{display:grid;gap:6px}.td-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.td-menu-list{display:grid;gap:8px}.td-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.td-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--td-primary) 10%,transparent);color:var(--td-primary);font-weight:1000}.td-menu-list button b,.td-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.td-menu-list button b{font-size:13px;font-weight:1000}.td-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.td-menu-list button.active{border-color:color-mix(in srgb,var(--td-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--td-primary) 8%,var(--surface,#fff))}.td-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.td-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.td-sheet-actions button.primary{border-color:var(--td-primary);background:var(--td-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--td-primary) 25%,transparent)}.td-table-card,.td-analysis,.td-empty{padding:13px;border-radius:24px}.td-table-card{margin-top:10px}.td-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.td-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.td-table-scroll th,.td-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.td-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--td-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.td-table-scroll td strong,.td-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.td-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.td-table-actions{display:flex;gap:7px;overflow-x:auto}.td-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--td-primary);border-radius:999px;padding:0 12px;background:var(--td-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.td-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.td-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.td-analysis span,.td-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.td-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.td-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.td-analysis-list{display:grid;gap:10px;margin-top:12px}.td-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.td-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.td-analysis-list b,.td-analysis-list small{font-size:12px}.td-analysis-list small{color:var(--muted,#64748b);font-weight:850}.td-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.td-progress i{display:block;height:100%;border-radius:inherit;background:var(--td-primary)}.td-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.td-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--td-primary) 12%,var(--surface,#fff));font-size:28px}.td-empty h3{margin:0;font-size:18px;font-weight:1000}.td-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.td-recent{margin-top:10px;border-radius:24px;padding:12px}.td-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.td-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.td-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--td-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.td-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.td-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.td-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.teacher-row{border-radius:24px;padding:12px}.td-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.td-analysis.wide{grid-column:span 2}.td-sheet-backdrop{place-items:center;padding:18px}.td-sheet{border-radius:28px;padding:18px}.td-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.td-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.td-search-card,.td-teacher-strip,.td-list,.td-analysis-grid,.td-table-card,.td-filter-chips,.td-recent{max-width:1180px;margin-left:auto;margin-right:auto}.td-list{grid-template-columns:repeat(3,minmax(0,1fr))}.td-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.td-analysis.wide{grid-column:span 2}.td-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.td-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.td-icon-button,.td-filter-button,.td-add-inline{width:40px;height:40px}.teacher-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.teacher-side{grid-column:1/-1;justify-content:flex-end}.td-teacher-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.td-teacher-strip span{grid-row:2}.td-sheet{border-radius:24px 24px 18px 18px;padding:12px}.td-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.td-sheet-actions button{width:100%}}
`;
