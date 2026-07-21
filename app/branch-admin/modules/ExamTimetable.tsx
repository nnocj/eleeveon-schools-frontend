"use client";

/**
 * app/branch-admin/modules/ExamTimetable.tsx
 * ---------------------------------------------------------
 * ELEEVEON EXAM TIMETABLE V3
 * ---------------------------------------------------------
 * Golden Standard Module
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this scheduling page from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all timetable/calendar reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Features:
 * - Branch scoped
 * - Offline first
 * - Mobile first
 * - Student.tsx golden UI shell
 * - Compact search + inline add + slider filter + More sheet
 * - Overview, calendar, schedule table, cards, rooms, invigilators, conflicts, analytics
 * - Theme-safe table headers and selected menu states for dark mode
 * - Guarded time helpers so bad saved text/CSS cannot leak into timetable time display
 *
 * Sync behavior:
 * - createLocal(...) for new exam timetables, sessions, and conflicts
 * - updateLocal(...) for edits and conflict resolution
 * - softDeleteLocal(...) for local soft delete
 * - getSyncTable(...) for schedule tables
 *
 * Tables used:
 * - scheduleTimetables
 * - scheduleSessions
 * - scheduleResources
 * - scheduleConflicts
 * - classes
 * - subjects
 * - teachers
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import {
  db,
  type ScheduleConflict,
  type ScheduleSession,
  type ScheduleTimetable,
} from "../../lib/db/db";
import {
  createLocal,
  getSyncTable,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type ViewMode =
  | "overview"
  | "calendar"
  | "schedule"
  | "cards"
  | "rooms"
  | "invigilators"
  | "conflicts"
  | "analytics";
type CalendarMode = "week" | "day" | "agenda";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type EditorMode = "create" | "edit" | "duplicate" | "move";
type ToastTone = "success" | "error" | "info";

const MODE_LABEL = "Exam Timetable";
const MODE_ICON = "📝";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};
const SHORT_DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const emptyForm = {
  id: "",
  timetableName: "",
  timetableId: "",
  dayOfWeek: "monday",
  title: "",
  startTime: "08:00",
  endTime: "10:00",
  classId: "",
  subjectId: "",
  teacherId: "",
  resourceId: "",
  roomName: "",
};

const now = () => Date.now();

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (looksLikeCssLeak(raw)) return fallback;
  return raw;
}

function idOf(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    const row = value as AnyRow;
    return String(row.id ?? row.localId ?? row.cloudId ?? "").trim();
  }

  return String(value).trim();
}

function cleanId(value: unknown): string {
  return idOf(value);
}

function sameId(left: unknown, right: unknown): boolean {
  const a = idOf(left);
  const b = idOf(right);
  return Boolean(a && b && a === b);
}

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = cleanId(value);
    if (parsed) return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

function looksLikeCssLeak(value: any) {
  const raw = String(value || "");
  return (
    raw.includes("{") ||
    raw.includes("}") ||
    raw.includes("@media") ||
    raw.includes(".ba-") ||
    raw.includes("color-mix(")
  );
}

function safeMinute(value: any, fallback = 0) {
  if (looksLikeCssLeak(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1439, Math.round(parsed)));
}

function timeToMinute(value: string, fallback = 480) {
  if (looksLikeCssLeak(value)) return fallback;
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

function minuteToTime(value: any) {
  const total = safeMinute(value, 0);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatMinuteRange(start: number, end: number) {
  return `${minuteToTime(start)} - ${minuteToTime(end)}`;
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return (
    row &&
    row.isDeleted !== true &&
    (!row.accountId || !accountId || row.accountId === accountId)
  );
}

function schoolIdOf(row: AnyRow) {
  return cleanId(row?.schoolId ?? row?.schoolId ?? row?.payload?.schoolId);
}

function branchIdOf(row: AnyRow) {
  return cleanId(row?.branchId ?? row?.branchId ?? row?.payload?.branchId);
}

function isBranchRow(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string | null,
  branchId?: string | null,
) {
  if (!sameAccount(row, accountId)) return false;
  return sameId(schoolIdOf(row), schoolId) && sameId(branchIdOf(row), branchId);
}

function isSchoolLevelRow(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string | null,
) {
  if (!sameAccount(row, accountId)) return false;
  return sameId(schoolIdOf(row), schoolId) && !branchIdOf(row);
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function rowName(row?: AnyRow) {
  return text(
    row?.fullName || row?.name || row?.title || row?.label || row?.email,
    "Unnamed",
  );
}

function normalizeDay(value: any) {
  const raw = text(value, "monday").toLowerCase();
  return DAYS.includes(raw) ? raw : "monday";
}

function sessionDay(row: AnyRow) {
  return normalizeDay(row?.dayOfWeek || row?.day || row?.weekday);
}

function dayIndex(day: string) {
  const index = DAYS.indexOf(normalizeDay(day));
  return index === -1 ? 99 : index;
}

function startMinute(row: AnyRow) {
  return safeMinute(
    row?.startMinute ?? row?.start ?? row?.startTimeMinute,
    480,
  );
}

function endMinute(row: AnyRow) {
  const start = startMinute(row);
  const end = safeMinute(
    row?.endMinute ?? row?.end ?? row?.endTimeMinute,
    start + 120,
  );
  return end > start ? end : Math.min(1439, start + 120);
}

function sessionTime(row: AnyRow) {
  return formatMinuteRange(startMinute(row), endMinute(row));
}

function className(classes: AnyRow[], classId: any) {
  const row = classes.find(
    (item) => String(idOf(item) ?? "") === String(classId ?? ""),
  );
  return text(row?.name || row?.className, "No class");
}

function subjectName(subjects: AnyRow[], subjectId: any) {
  const row = subjects.find(
    (item) => String(idOf(item) ?? "") === String(subjectId ?? ""),
  );
  return text(row?.name || row?.subjectName, "No subject");
}

function teacherName(teachers: AnyRow[], teacherId: any) {
  const row = teachers.find(
    (item) => String(idOf(item) ?? "") === String(teacherId ?? ""),
  );
  return rowName(row || {});
}

function resourceName(resources: AnyRow[], session: AnyRow) {
  const row = resources.find(
    (item) =>
      sameId(idOf(item), sessionResourceId(session)),
  );
  return text(
    row?.name || row?.roomName || session.roomName || session.room,
    "No room",
  );
}

function sessionTeacherId(session: AnyRow) {
  return cleanId(
    session.teacherId ??
      session.teacherId ??
      session.staffId ??
      session.invigilatorId,
  );
}

function sessionClassId(session: AnyRow) {
  return cleanId(session.classId ?? session.classLocalId);
}

function sessionSubjectId(session: AnyRow) {
  return cleanId(session.subjectId ?? session.subjectLocalId);
}

function sessionResourceId(session: AnyRow) {
  return cleanId(session.resourceId ?? session.roomId ?? session.roomLocalId);
}

function isExamSession(row: AnyRow) {
  const type = String(
    row?.sessionType || row?.type || row?.category || "",
  ).toLowerCase();
  const title = String(row?.title || row?.name || "").toLowerCase();
  return (
    type.includes("exam") ||
    type.includes("assessment") ||
    title.includes("exam")
  );
}

function examTitle(row: AnyRow, subjects: AnyRow[]) {
  return text(
    row?.title || row?.examTitle || row?.name,
    `${subjectName(subjects, sessionSubjectId(row))} Exam`,
  );
}

function sortExams(rows: AnyRow[]) {
  return [...rows].sort(
    (a, b) =>
      dayIndex(sessionDay(a)) - dayIndex(sessionDay(b)) ||
      startMinute(a) - startMinute(b) ||
      sessionClassId(a).localeCompare(sessionClassId(b)) ||
      sessionSubjectId(a).localeCompare(sessionSubjectId(b)),
  );
}

function groupedCounts(rows: AnyRow[], keyFn: (row: AnyRow) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function overlap(a: AnyRow, b: AnyRow) {
  if (sessionDay(a) !== sessionDay(b)) return false;
  return startMinute(a) < endMinute(b) && startMinute(b) < endMinute(a);
}

function examKey(row: AnyRow) {
  return [
    idOf(row.timetableId),
    sessionDay(row),
    startMinute(row),
    endMinute(row),
    sessionClassId(row),
    sessionSubjectId(row),
    sessionResourceId(row) || text(row.roomName || row.room, "").toLowerCase(),
  ].join("|");
}

function conflictKey(type: string, aId: string, bId: string) {
  const [first, second] = [idOf(aId), idOf(bId)].sort();
  return `${type}-${first}-${second}`;
}

function detectExamConflicts(
  exams: AnyRow[],
  classes: AnyRow[],
  teachers: AnyRow[],
  resources: AnyRow[],
) {
  const items: {
    id: string;
    title: string;
    description: string;
    severity: Tone;
    rows: AnyRow[];
  }[] = [];

  for (let i = 0; i < exams.length; i += 1) {
    for (let j = i + 1; j < exams.length; j += 1) {
      const a = exams[i];
      const b = exams[j];
      if (!overlap(a, b)) continue;

      const sameClass =
        sessionClassId(a) && sameId(sessionClassId(a), sessionClassId(b));
      const sameTeacher =
        sessionTeacherId(a) && sameId(sessionTeacherId(a), sessionTeacherId(b));
      const sameRoom =
        (sessionResourceId(a) &&
          sameId(sessionResourceId(a), sessionResourceId(b))) ||
        (text(a.roomName) &&
          text(a.roomName).toLowerCase() === text(b.roomName).toLowerCase());

      if (sameClass) {
        items.push({
          id: `class-${i}-${j}`,
          title: "Class exam clash",
          description: `${className(classes, sessionClassId(a))} has two exams at the same time.`,
          severity: "red",
          rows: [a, b],
        });
      }

      if (sameTeacher) {
        items.push({
          id: `teacher-${i}-${j}`,
          title: "Invigilator clash",
          description: `${teacherName(teachers, sessionTeacherId(a))} is assigned to two exams at the same time.`,
          severity: "orange",
          rows: [a, b],
        });
      }

      if (sameRoom) {
        items.push({
          id: `room-${i}-${j}`,
          title: "Room clash",
          description: `${resourceName(resources, a)} is booked for two exams at the same time.`,
          severity: "red",
          rows: [a, b],
        });
      }
    }
  }

  return items;
}

function toneForConflict(severity?: string): Tone {
  const value = String(severity || "").toLowerCase();
  if (["critical", "high", "urgent"].includes(value)) return "red";
  if (["medium", "warning"].includes(value)) return "orange";
  return "blue";
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <article className="ba-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function EmptyCard({ text: body }: { text: string }) {
  return (
    <section className="ba-empty">
      <div>📝</div>
      <h3>No records</h3>
      <p>{body}</p>
    </section>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export default function ExamTimetable() {
  const dataRevision = useDataRevision();

  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [view, setView] = useState<ViewMode>("overview");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("agenda");
  const [selectedDay, setSelectedDay] = useState("monday");
  const [timetables, setTimetables] = useState<AnyRow[]>([]);
  const [sessions, setSessions] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [scheduleConflicts, setScheduleConflicts] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | "">(
    "",
  );
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [invigilatorFilter, setInvigilatorFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [conflictFilter, setConflictFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  const showToast = (tone: ToastTone, nextMessage: string) => {
    setToast({ tone, message: nextMessage });
    window.setTimeout(
      () =>
        setToast((current) =>
          current?.message === nextMessage ? null : current,
        ),
      4200,
    );
  };

  async function load() {
    if (!accountId || !schoolId || !branchId) {
      setTimetables([]);
      setSessions([]);
      setResources([]);
      setScheduleConflicts([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        timetableRows,
        sessionRows,
        classRows,
        subjectRows,
        teacherRows,
        resourceRows,
        conflictRows,
      ] = await Promise.all([
        getSyncTable("scheduleTimetables").toArray(),
        getSyncTable("scheduleSessions").toArray(),
        safeArray<AnyRow>("classes"),
        safeArray<AnyRow>("subjects"),
        safeArray<AnyRow>("teachers"),
        getSyncTable("scheduleResources").toArray(),
        getSyncTable("scheduleConflicts").toArray(),
      ]);

      const examTimetables = (timetableRows as AnyRow[])
        .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
        .filter((row) => row?.isDeleted !== true)
        .filter((row) => {
          const value = String(
            row.timetableType || row.scopeType || row.name || "",
          ).toLowerCase();
          return value.includes("exam") || value.includes("assessment");
        });

      const examSessions = (sessionRows as AnyRow[])
        .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
        .filter((row) => row?.isDeleted !== true)
        .filter(isExamSession);

      setTimetables(examTimetables);
      setSessions(examSessions);
      setClasses(
        (classRows as AnyRow[]).filter(
          (row) =>
            isBranchRow(row, accountId, schoolId, branchId) ||
            isSchoolLevelRow(row, accountId, schoolId),
        ),
      );
      setSubjects(
        (subjectRows as AnyRow[]).filter(
          (row) =>
            sameAccount(row, accountId) &&
            (sameId(schoolIdOf(row), schoolId) ||
              !schoolIdOf(row) ||
              sameId(branchIdOf(row), branchId)),
        ),
      );
      setTeachers(
        (teacherRows as AnyRow[]).filter(
          (row) =>
            isBranchRow(row, accountId, schoolId, branchId) ||
            isSchoolLevelRow(row, accountId, schoolId),
        ),
      );
      setResources(
        (resourceRows as AnyRow[])
          .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
          .filter((row) => row?.isDeleted !== true),
      );
      setScheduleConflicts(
        (conflictRows as AnyRow[])
          .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
          .filter((row) => row?.isDeleted !== true)
          .filter(
            (row) => String(row.status || "open").toLowerCase() === "open",
          ),
      );

      if (!selectedTimetableId && examTimetables[0]?.id)
        setSelectedTimetableId(String(examTimetables[0].id));
    } catch (error) {
      console.error("Failed to load exam timetable:", error);
      setMessage("Failed to load exam timetable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId, branchId, dataRevision]);

  function openCreate() {
    setEditorMode("create");
    setMessage("");
    setForm({
      ...emptyForm,
      timetableId: selectedTimetableId ? String(selectedTimetableId) : "",
      dayOfWeek: selectedDay,
    });
    setDrawer(true);
  }

  function openEdit(exam: AnyRow) {
    setEditorMode("edit");
    setMessage("");
    setForm({
      id: cleanId(exam.id),
      timetableName: "",
      timetableId: exam.timetableId ? String(exam.timetableId) : "",
      dayOfWeek: sessionDay(exam),
      title: text(exam.title, ""),
      startTime: minuteToTime(startMinute(exam)),
      endTime: minuteToTime(endMinute(exam)),
      classId: sessionClassId(exam) ? String(sessionClassId(exam)) : "",
      subjectId: sessionSubjectId(exam) ? String(sessionSubjectId(exam)) : "",
      teacherId: sessionTeacherId(exam) ? String(sessionTeacherId(exam)) : "",
      resourceId: sessionResourceId(exam)
        ? String(sessionResourceId(exam))
        : "",
      roomName: text(exam.roomName || exam.room, ""),
    });
    setDrawer(true);
  }

  function openDuplicate(exam: AnyRow) {
    openEdit(exam);
    setEditorMode("duplicate");
    setForm((current) => ({
      ...current,
      id: "",
      title: current.title ? `${current.title} Copy` : "",
    }));
  }

  function openMove(exam: AnyRow) {
    openEdit(exam);
    setEditorMode("move");
  }

  const visibleExams = useMemo(() => {
    const q = query.toLowerCase().trim();

    return sortExams(
      sessions
        .filter(
          (session) =>
            !selectedTimetableId ||
            String(session.timetableId) === String(selectedTimetableId),
        )
        .filter(
          (session) =>
            classFilter === "all" ||
            sameId(sessionClassId(session), classFilter),
        )
        .filter(
          (session) =>
            subjectFilter === "all" ||
            sameId(sessionSubjectId(session), subjectFilter),
        )
        .filter(
          (session) =>
            invigilatorFilter === "all" ||
            sameId(sessionTeacherId(session), invigilatorFilter),
        )
        .filter(
          (session) =>
            resourceFilter === "all" ||
            sameId(sessionResourceId(session), resourceFilter) ||
            text(session.roomName) === resourceFilter,
        )
        .filter(
          (session) => dayFilter === "all" || sessionDay(session) === dayFilter,
        )
        .filter((session) => {
          if (!q) return true;
          return [
            examTitle(session, subjects),
            sessionDay(session),
            session.roomName,
            className(classes, sessionClassId(session)),
            subjectName(subjects, sessionSubjectId(session)),
            teacherName(teachers, sessionTeacherId(session)),
            resourceName(resources, session),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        }),
    );
  }, [
    classFilter,
    classes,
    dayFilter,
    invigilatorFilter,
    query,
    resourceFilter,
    resources,
    selectedTimetableId,
    sessions,
    subjectFilter,
    subjects,
    teachers,
  ]);

  const internalConflicts = useMemo(
    () => detectExamConflicts(visibleExams, classes, teachers, resources),
    [visibleExams, classes, teachers, resources],
  );

  const conflictExamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of scheduleConflicts) {
      const a = cleanId(conflict.sessionIdA);
      const b = cleanId(conflict.sessionIdB);
      if (a) ids.add(a);
      if (b) ids.add(b);
    }
    for (const conflict of internalConflicts) {
      for (const exam of conflict.rows) {
        const id = cleanId(exam.id);
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [internalConflicts, scheduleConflicts]);

  const filteredExams = useMemo(() => {
    if (conflictFilter === "with_conflicts")
      return visibleExams.filter((exam) =>
        conflictExamIds.has(cleanId(exam.id)),
      );
    if (conflictFilter === "no_conflicts")
      return visibleExams.filter(
        (exam) => !conflictExamIds.has(cleanId(exam.id)),
      );
    return visibleExams;
  }, [conflictExamIds, conflictFilter, visibleExams]);

  const activeFilterCount = useMemo(
    () =>
      [
        selectedTimetableId,
        classFilter !== "all" ? classFilter : "",
        subjectFilter !== "all" ? subjectFilter : "",
        invigilatorFilter !== "all" ? invigilatorFilter : "",
        resourceFilter !== "all" ? resourceFilter : "",
        dayFilter !== "all" ? dayFilter : "",
        conflictFilter !== "all" ? conflictFilter : "",
      ].filter(Boolean).length,
    [
      classFilter,
      conflictFilter,
      dayFilter,
      invigilatorFilter,
      resourceFilter,
      selectedTimetableId,
      subjectFilter,
    ],
  );

  const filtersActive = !!query.trim() || activeFilterCount > 0;

  function clearFilters() {
    setQuery("");
    setSelectedTimetableId("");
    setClassFilter("all");
    setSubjectFilter("all");
    setInvigilatorFilter("all");
    setResourceFilter("all");
    setDayFilter("all");
    setConflictFilter("all");
  }

  const summary = useMemo(() => {
    const completeRows = filteredExams.filter(
      (row) =>
        sessionClassId(row) &&
        sessionSubjectId(row) &&
        endMinute(row) > startMinute(row),
    );
    return {
      timetables: timetables.length,
      exams: filteredExams.length,
      classes: new Set(filteredExams.map(sessionClassId).filter(Boolean)).size,
      subjects: new Set(filteredExams.map(sessionSubjectId).filter(Boolean))
        .size,
      rooms: new Set(
        filteredExams
          .map((row) => sessionResourceId(row) || text(row.roomName))
          .filter(Boolean),
      ).size,
      invigilators: new Set(filteredExams.map(sessionTeacherId).filter(Boolean))
        .size,
      conflicts: scheduleConflicts.length + internalConflicts.length,
      completion: Math.round(
        (completeRows.length / Math.max(filteredExams.length, 1)) * 100,
      ),
    };
  }, [
    filteredExams,
    internalConflicts.length,
    scheduleConflicts.length,
    timetables.length,
  ]);

  async function saveDetectedConflicts(savedExam: AnyRow, editingId: string) {
    const related = sessions.filter((session: AnyRow) => {
      const id = cleanId(session.id);
      if (!id || sameId(id, editingId)) return false;
      if (!isExamSession(session)) return false;
      return overlap(savedExam, session);
    });

    const existing = new Set(
      scheduleConflicts.map((conflict: AnyRow) =>
        conflictKey(
          String(conflict.conflictType || "custom"),
          cleanId(conflict.sessionIdA),
          cleanId(conflict.sessionIdB),
        ),
      ),
    );
    const newConflicts: Partial<ScheduleConflict>[] = [];

    for (const session of related) {
      const otherId = cleanId(session.id);
      const classId = sessionClassId(savedExam);
      const teacherId = sessionTeacherId(savedExam);
      const resourceId = sessionResourceId(savedExam);
      const roomA = text(savedExam.roomName || savedExam.room, "");
      const roomB = text(session.roomName || session.room, "");

      const possible = [
        {
          active: Boolean(classId && sameId(classId, sessionClassId(session))),
          type: "class_double_booked",
          title: "Class exam clash",
          description: `${className(classes, classId)} has overlapping exams.`,
          severity: "high",
          classId,
        },
        {
          active: Boolean(teacherId && sameId(teacherId, sessionTeacherId(session))),
          type: "teacher_double_booked",
          title: "Invigilator clash",
          description: `${teacherName(teachers, teacherId)} is assigned to overlapping exams.`,
          severity: "medium",
          teacherId: teacherId,
        },
        {
          active: Boolean(resourceId && sameId(resourceId, sessionResourceId(session))),
          type: "resource_double_booked",
          title: "Room/resource clash",
          description: `${resourceName(resources, savedExam)} is booked for overlapping exams.`,
          severity: "high",
          resourceId,
        },
        {
          active:
            !resourceId && roomA && roomA.toLowerCase() === roomB.toLowerCase(),
          type: "room_double_booked",
          title: "Room clash",
          description: `${roomA} is booked for overlapping exams.`,
          severity: "high",
        },
      ];

      for (const item of possible) {
        if (!item.active) continue;
        const key = conflictKey(item.type, editingId, otherId);
        if (existing.has(key)) continue;
        existing.add(key);

        newConflicts.push({
          accountId: String(accountId),
          schoolId: schoolId,
          branchId: branchId,
          conflictType: item.type as ScheduleConflict["conflictType"],
          severity: item.severity as ScheduleConflict["severity"],
          status: "open",
          title: item.title,
          description: item.description,
          sessionIdA: editingId,
          sessionIdB: otherId,
          resourceId: (item as AnyRow).resourceId || undefined,
          teacherId: (item as AnyRow).teacherId || undefined,
          classId: (item as AnyRow).classId || undefined,
          dayOfWeek: sessionDay(savedExam) as ScheduleConflict["dayOfWeek"],
          startMinute: Math.max(startMinute(savedExam), startMinute(session)),
          endMinute: Math.min(endMinute(savedExam), endMinute(session)),
          detectedAt: now(),
          isDeleted: false,
        });
      }
    }

    for (const conflict of newConflicts.slice(0, 20))
      await createLocal("scheduleConflicts", conflict as ScheduleConflict);
  }

  async function save() {
    setMessage("");

    if (!accountId || !schoolId || !branchId) {
      setMessage("Assigned branch context is required.");
      return;
    }

    const start = timeToMinute(form.startTime, 480);
    const end = timeToMinute(form.endTime, 600);

    if (start >= end) {
      setMessage("End time must be after start time.");
      return;
    }

    if (!form.classId || !form.subjectId) {
      setMessage("Class and subject are required for an exam.");
      return;
    }

    setSaving(true);

    try {
      let timetableId = cleanId(form.timetableId || selectedTimetableId);
      const safeAccountId = String(accountId);

      if (!timetableId) {
        const created = (await createLocal("scheduleTimetables", {
          accountId: safeAccountId,
          schoolId: schoolId,
          branchId: branchId,
          name: form.timetableName.trim() || "Exam Timetable",
          timetableType: "exam",
          scopeType: "branch",
          scopeId: branchId,
          classId: cleanId(form.classId) || undefined,
          teacherId: cleanId(form.teacherId) || undefined,
          status: "active",
          active: true,
          isDefault: !timetables.length,
          createdByRole: "branch_admin",
          createdByUserId: safeAccountId,
          isDeleted: false,
        } as unknown as ScheduleTimetable)) as ScheduleTimetable | undefined;

        timetableId = cleanId((created as AnyRow)?.id);
      }

      if (!timetableId) {
        setMessage("Could not create or select an exam timetable.");
        return;
      }

      const payload: Partial<ScheduleSession> = {
        accountId: safeAccountId,
        schoolId: schoolId,
        branchId: branchId,
        timetableId,
        sessionType: "exam" as ScheduleSession["sessionType"],
        dayOfWeek: normalizeDay(form.dayOfWeek) as ScheduleSession["dayOfWeek"],
        startMinute: start,
        endMinute: end,
        title:
          form.title.trim() || `${subjectName(subjects, form.subjectId)} Exam`,
        classId: cleanId(form.classId) || undefined,
        subjectId: cleanId(form.subjectId) || undefined,
        teacherId: cleanId(form.teacherId) || undefined,
        resourceId: cleanId(form.resourceId) || undefined,
        roomName: form.roomName.trim() || undefined,
        active: true,
        isDeleted: false,
      };

      const editingId = cleanId(form.id);
      const savedExam =
        editingId && editorMode !== "duplicate"
          ? ((await updateLocal(
              "scheduleSessions",
              editingId,
              payload as Partial<ScheduleSession>,
            )) as ScheduleSession | undefined)
          : ((await createLocal(
              "scheduleSessions",
              payload as ScheduleSession,
            )) as ScheduleSession | undefined);

      const savedId = cleanId((savedExam as AnyRow)?.id);
      if (savedExam && savedId)
        await saveDetectedConflicts(savedExam as AnyRow, savedId);

      setDrawer(false);
      setForm(emptyForm);
      showToast("success", "Exam saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save exam session:", error);
      setMessage(error?.message || "Failed to save exam session.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExam(exam: AnyRow) {
    const id = cleanId(exam.id);
    if (!id) return;

    const ok = window.confirm(
      `Delete "${examTitle(exam, subjects)}"? This will soft-delete the exam and sync safely.`,
    );
    if (!ok) return;

    try {
      await softDeleteLocal("scheduleSessions", id);
      showToast("success", "Exam deleted.");
      await load();
    } catch (error: any) {
      console.error("Failed to delete exam:", error);
      setMessage(error?.message || "Failed to delete exam.");
    }
  }

  async function resolveConflict(conflict: AnyRow) {
    const id = cleanId(conflict.id);
    if (!id) return;

    try {
      await updateLocal("scheduleConflicts", id, {
        status: "resolved",
        resolvedAt: now(),
        resolutionNote: "Marked resolved from branch admin exam timetable.",
      } as Partial<ScheduleConflict>);
      showToast("success", "Conflict resolved.");
      await load();
    } catch (error: any) {
      console.error("Failed to resolve conflict:", error);
      setMessage(error?.message || "Failed to resolve conflict.");
    }
  }

  if (loading || accountLoading || settingsLoading || contextLoading) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening exam timetable...</h2>
          <p>Loading exams, rooms, invigilators and conflicts.</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="ba-search-card"
        aria-label="Exam timetable search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exams..."
            aria-label="Search exams"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add exam"
        >
          +
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {filtersActive ? (
        <section className="ba-filter-chips" aria-label="Active filters">
          {query.trim() ? (
            <button type="button" onClick={() => setQuery("")}>
              Search: {query} ×
            </button>
          ) : null}
          {selectedTimetableId ? (
            <button type="button" onClick={() => setSelectedTimetableId("")}>
              Timetable ×
            </button>
          ) : null}
          {classFilter !== "all" ? (
            <button type="button" onClick={() => setClassFilter("all")}>
              Class: {className(classes, classFilter)} ×
            </button>
          ) : null}
          {subjectFilter !== "all" ? (
            <button type="button" onClick={() => setSubjectFilter("all")}>
              Subject: {subjectName(subjects, subjectFilter)} ×
            </button>
          ) : null}
          {dayFilter !== "all" ? (
            <button type="button" onClick={() => setDayFilter("all")}>
              Day: {DAY_LABELS[dayFilter]} ×
            </button>
          ) : null}
          {conflictFilter !== "all" ? (
            <button type="button" onClick={() => setConflictFilter("all")}>
              Conflict ×
            </button>
          ) : null}
        </section>
      ) : null}

      {message ? <div className="ba-message">{message}</div> : null}

      {view === "overview" ? (
        <section className="ba-overview-grid">
          <article className="ba-analysis ba-current-filter">
            <span>Exam Readiness</span>
            <strong>{summary.completion}%</strong>
            <p>
              {summary.exams} visible exam(s), {summary.rooms} room(s),{" "}
              {summary.invigilators} invigilator(s).
            </p>
            <div className="ba-progress">
              <div style={{ width: `${summary.completion}%` }} />
            </div>
          </article>

          <article className="ba-analysis">
            <span>Current View</span>
            <strong>{summary.exams}</strong>
            <div className="student-detail-strip">
              <span>
                <b>Classes</b>
                {summary.classes}
              </span>
              <span>
                <b>Subjects</b>
                {summary.subjects}
              </span>
              <span>
                <b>Conflicts</b>
                {summary.conflicts}
              </span>
            </div>
          </article>

          <article className="ba-analysis wide">
            <span>{DAY_LABELS[selectedDay]}</span>
            <strong>
              {
                filteredExams.filter((row) => sessionDay(row) === selectedDay)
                  .length
              }
            </strong>
            <ExamList
              exams={filteredExams
                .filter((row) => sessionDay(row) === selectedDay)
                .slice(0, 4)}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onMove={openMove}
              onDelete={deleteExam}
            />
          </article>
        </section>
      ) : null}

      {view === "calendar" ? (
        <section className="ba-table-card">
          <div className="ba-head">
            <div>
              <p>Exam Calendar</p>
              <h3>
                {calendarMode === "agenda" ? "Agenda" : `${calendarMode} view`}
              </h3>
            </div>
            <div className="ba-mode-tabs">
              {(["week", "day", "agenda"] as CalendarMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={calendarMode === mode ? "active" : ""}
                  onClick={() => setCalendarMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {calendarMode === "agenda" ? (
            <AgendaView
              exams={filteredExams}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onMove={openMove}
              onDelete={deleteExam}
            />
          ) : (
            <CalendarView
              mode={calendarMode}
              selectedDay={selectedDay}
              exams={filteredExams}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          )}
        </section>
      ) : null}

      {view === "schedule" ? (
        <ExamSchedule
          exams={filteredExams}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
          conflictExamIds={conflictExamIds}
          onEdit={openEdit}
          onDuplicate={openDuplicate}
          onMove={openMove}
          onDelete={deleteExam}
        />
      ) : null}

      {view === "cards" ? (
        <section className="ba-list">
          <ExamList
            exams={filteredExams}
            classes={classes}
            subjects={subjects}
            teachers={teachers}
            resources={resources}
            onEdit={openEdit}
            onDuplicate={openDuplicate}
            onMove={openMove}
            onDelete={deleteExam}
          />
        </section>
      ) : null}

      {view === "rooms" ? (
        <GroupedExamView
          title="Room Allocation"
          empty="No room allocation found."
          exams={filteredExams}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
          groupLabel={(exam) => resourceName(resources, exam)}
        />
      ) : null}

      {view === "invigilators" ? (
        <GroupedExamView
          title="Invigilator Allocation"
          empty="No invigilator allocation found."
          exams={filteredExams}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
          groupLabel={(exam) => teacherName(teachers, sessionTeacherId(exam))}
        />
      ) : null}

      {view === "conflicts" ? (
        <section className="ba-list">
          {[...internalConflicts, ...scheduleConflicts].map(
            (conflict: AnyRow, index) => (
              <article
                className="student-row"
                key={String(conflict.id || idOf(conflict) || index)}
              >
                <div className="ba-avatar small">⚠️</div>
                <span className="student-main">
                  <strong>{conflict.title || "Schedule conflict"}</strong>
                  <small>{conflict.description || "Conflict detected"}</small>
                  <em>
                    {conflict.conflictType || conflict.severity || "warning"}
                  </em>
                </span>
                <span className="student-side">
                  {conflict.status ? (
                    <button
                      type="button"
                      className="ba-mini-action"
                      onClick={() => resolveConflict(conflict)}
                    >
                      Resolve
                    </button>
                  ) : (
                    <Chip tone={(conflict.severity as Tone) || "orange"}>
                      Local
                    </Chip>
                  )}
                </span>
              </article>
            ),
          )}
          {!summary.conflicts ? (
            <EmptyCard text="No exam conflicts found." />
          ) : null}
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="ba-analysis-grid">
          <AnalysisCard
            title="Exams by Class"
            rows={groupedCounts(filteredExams, (exam) =>
              className(classes, sessionClassId(exam)),
            )}
            total={filteredExams.length}
          />
          <AnalysisCard
            title="Exams by Subject"
            rows={groupedCounts(filteredExams, (exam) =>
              subjectName(subjects, sessionSubjectId(exam)),
            )}
            total={filteredExams.length}
          />
          <AnalysisCard
            title="Room Usage"
            rows={groupedCounts(filteredExams, (exam) =>
              resourceName(resources, exam),
            )}
            total={filteredExams.length}
          />
          <AnalysisCard
            title="Invigilator Load"
            rows={groupedCounts(filteredExams, (exam) =>
              teacherName(teachers, sessionTeacherId(exam)),
            )}
            total={filteredExams.length}
          />
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          timetables={timetables}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
          selectedTimetableId={selectedTimetableId}
          classFilter={classFilter}
          subjectFilter={subjectFilter}
          invigilatorFilter={invigilatorFilter}
          resourceFilter={resourceFilter}
          dayFilter={dayFilter}
          conflictFilter={conflictFilter}
          setSelectedTimetableId={setSelectedTimetableId}
          setClassFilter={setClassFilter}
          setSubjectFilter={setSubjectFilter}
          setInvigilatorFilter={setInvigilatorFilter}
          setResourceFilter={setResourceFilter}
          setDayFilter={setDayFilter}
          setConflictFilter={setConflictFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(next) => {
            setView(next);
            setMoreOpen(false);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {drawer ? (
        <ExamDrawer
          editorMode={editorMode}
          activeBranchName={activeBranch?.name || "Assigned branch"}
          form={form}
          setForm={setForm}
          timetables={timetables}
          selectedTimetableId={selectedTimetableId}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
          saving={saving}
          message={message}
          onClose={() => {
            setDrawer(false);
            setForm(emptyForm);
            setMessage("");
          }}
          onSave={save}
        />
      ) : null}
    </main>
  );
}

function FilterSheet({
  timetables,
  classes,
  subjects,
  teachers,
  resources,
  selectedTimetableId,
  classFilter,
  subjectFilter,
  invigilatorFilter,
  resourceFilter,
  dayFilter,
  conflictFilter,
  setSelectedTimetableId,
  setClassFilter,
  setSubjectFilter,
  setInvigilatorFilter,
  setResourceFilter,
  setDayFilter,
  setConflictFilter,
  clearFilters,
  onClose,
}: {
  timetables: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  selectedTimetableId: string | "";
  classFilter: string;
  subjectFilter: string;
  invigilatorFilter: string;
  resourceFilter: string;
  dayFilter: string;
  conflictFilter: string;
  setSelectedTimetableId: (value: string) => void;
  setClassFilter: (value: string) => void;
  setSubjectFilter: (value: string) => void;
  setInvigilatorFilter: (value: string) => void;
  setResourceFilter: (value: string) => void;
  setDayFilter: (value: string) => void;
  setConflictFilter: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose exactly what you need for this exam timetable.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Timetable</span>
            <select
              value={selectedTimetableId}
              onChange={(event) =>
                setSelectedTimetableId(event.target.value)
              }
            >
              <option value="">All timetables</option>
              {timetables.map((row) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Class</span>
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map((row) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.className}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Subject</span>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
            >
              <option value="all">All subjects</option>
              {subjects.map((row) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.subjectName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Invigilator</span>
            <select
              value={invigilatorFilter}
              onChange={(event) => setInvigilatorFilter(event.target.value)}
            >
              <option value="all">All invigilators</option>
              {teachers.map((row) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {rowName(row)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Room</span>
            <select
              value={resourceFilter}
              onChange={(event) => setResourceFilter(event.target.value)}
            >
              <option value="all">All rooms</option>
              {resources.map((row) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.roomName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={dayFilter}
              onChange={(event) => setDayFilter(event.target.value)}
            >
              <option value="all">All days</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_LABELS[day]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Conflict</span>
            <select
              value={conflictFilter}
              onChange={(event) => setConflictFilter(event.target.value)}
            >
              <option value="all">All conflict status</option>
              <option value="with_conflicts">With conflicts</option>
              <option value="no_conflicts">No conflicts</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  view,
  setView,
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  const options: {
    key: ViewMode;
    icon: string;
    title: string;
    note: string;
  }[] = [
    {
      key: "overview",
      icon: "🏠",
      title: "Overview",
      note: "Readiness, totals and selected day",
    },
    {
      key: "calendar",
      icon: "📅",
      title: "Calendar",
      note: "Agenda, week and day views",
    },
    {
      key: "schedule",
      icon: "☷",
      title: "Schedule table",
      note: "Dense exam timetable",
    },
    { key: "cards", icon: "▦", title: "Cards", note: "Compact exam cards" },
    { key: "rooms", icon: "🚪", title: "Rooms", note: "Room allocation" },
    {
      key: "invigilators",
      icon: "👨‍🏫",
      title: "Invigilators",
      note: "Invigilator allocation",
    },
    {
      key: "conflicts",
      icon: "⚠️",
      title: "Conflicts",
      note: "Exam clashes and warnings",
    },
    {
      key: "analytics",
      icon: "◔",
      title: "Analytics",
      note: "Class, subject, room and invigilator load",
    },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? "active" : ""}
              onClick={() => setView(item.key)}
            >
              <span>{item.icon}</span>
              <b>{item.title}</b>
              <small>{item.note}</small>
            </button>
          ))}

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch exam records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ExamDrawer({
  editorMode,
  activeBranchName,
  form,
  setForm,
  timetables,
  selectedTimetableId,
  classes,
  subjects,
  teachers,
  resources,
  saving,
  message,
  onClose,
  onSave,
}: {
  editorMode: EditorMode;
  activeBranchName: string;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  timetables: AnyRow[];
  selectedTimetableId: string | "";
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  saving: boolean;
  message: string;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="ba-modal-backdrop" role="dialog" aria-modal="true">
      <section className="ba-modal">
        <div className="ba-modal-head">
          <div>
            <h2>
              {editorMode === "create"
                ? "New Exam"
                : editorMode === "duplicate"
                  ? "Duplicate Exam"
                  : editorMode === "move"
                    ? "Move Exam"
                    : "Edit Exam"}
            </h2>
            <p>{activeBranchName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close exam form">
            ✕
          </button>
        </div>

        {message ? <div className="ba-message">{message}</div> : null}

        <section className="ba-form-section">
          <h3>Exam</h3>
          <div className="ba-form">
            <label className="wide">
              <span>Use Existing Exam Timetable</span>
              <select
                value={form.timetableId || selectedTimetableId}
                onChange={(event) =>
                  setForm({ ...form, timetableId: event.target.value })
                }
              >
                <option value="">Create / use default</option>
                {timetables.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="wide">
              <span>New Timetable Name</span>
              <input
                value={form.timetableName}
                onChange={(event) =>
                  setForm({ ...form, timetableName: event.target.value })
                }
                placeholder="End of Term Examination"
              />
            </label>

            <label>
              <span>Day</span>
              <select
                value={form.dayOfWeek}
                onChange={(event) =>
                  setForm({ ...form, dayOfWeek: event.target.value })
                }
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Class</span>
              <select
                value={form.classId}
                onChange={(event) =>
                  setForm({ ...form, classId: event.target.value })
                }
              >
                <option value="">Select class</option>
                {classes.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.className}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Subject</span>
              <select
                value={form.subjectId}
                onChange={(event) =>
                  setForm({ ...form, subjectId: event.target.value })
                }
              >
                <option value="">Select subject</option>
                {subjects.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.subjectName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Invigilator</span>
              <select
                value={form.teacherId}
                onChange={(event) =>
                  setForm({ ...form, teacherId: event.target.value })
                }
              >
                <option value="">No invigilator</option>
                {teachers.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {rowName(row)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Room / Resource</span>
              <select
                value={form.resourceId}
                onChange={(event) =>
                  setForm({ ...form, resourceId: event.target.value })
                }
              >
                <option value="">No resource</option>
                {resources.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.roomName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Start</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  setForm({ ...form, startTime: event.target.value })
                }
              />
            </label>

            <label>
              <span>End</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm({ ...form, endTime: event.target.value })
                }
              />
            </label>

            <label className="wide">
              <span>Custom Title</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Optional title"
              />
            </label>

            <label className="wide">
              <span>Room name if no resource</span>
              <input
                value={form.roomName}
                onChange={(event) =>
                  setForm({ ...form, roomName: event.target.value })
                }
              />
            </label>
          </div>
        </section>

        <div className="ba-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={onSave}>
            {saving ? "Saving..." : "Save Exam"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExamActions({
  exam,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
}: {
  exam: AnyRow;
  onEdit: (exam: AnyRow) => void;
  onDuplicate: (exam: AnyRow) => void;
  onMove: (exam: AnyRow) => void;
  onDelete: (exam: AnyRow) => void;
}) {
  return (
    <div className="ba-row-actions">
      <button className="ba-btn" type="button" onClick={() => onEdit(exam)}>
        Edit
      </button>
      <button
        className="ba-btn"
        type="button"
        onClick={() => onDuplicate(exam)}
      >
        Duplicate
      </button>
      <button className="ba-btn" type="button" onClick={() => onMove(exam)}>
        Move
      </button>
      <button
        className="ba-delete"
        type="button"
        onClick={() => onDelete(exam)}
      >
        Delete
      </button>
    </div>
  );
}

function ExamList({
  exams,
  classes,
  subjects,
  teachers,
  resources,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
}: {
  exams: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onEdit: (exam: AnyRow) => void;
  onDuplicate: (exam: AnyRow) => void;
  onMove: (exam: AnyRow) => void;
  onDelete: (exam: AnyRow) => void;
}) {
  return (
    <div className="ba-list">
      {exams.map((exam, index) => (
        <article
          className="ba-card"
          key={String(idOf(exam) || examKey(exam) || index)}
        >
          <div className="ba-card-top">
            <div className="ba-avatar">{MODE_ICON}</div>
            <div className="ba-card-main">
              <h3>{examTitle(exam, subjects)}</h3>
              <p>
                {DAY_LABELS[sessionDay(exam)]} · {sessionTime(exam)}
              </p>
              <div className="ba-chip-row">
                <Chip tone="blue">
                  {className(classes, sessionClassId(exam))}
                </Chip>
                <Chip tone="purple">
                  {teacherName(teachers, sessionTeacherId(exam))}
                </Chip>
                <Chip tone="orange">{resourceName(resources, exam)}</Chip>
              </div>
            </div>
          </div>
          <div className="ba-mini-grid">
            <MiniStat
              label="Subject"
              value={subjectName(subjects, sessionSubjectId(exam))}
            />
            <MiniStat label="Room" value={resourceName(resources, exam)} />
            <MiniStat
              label="Invigilator"
              value={teacherName(teachers, sessionTeacherId(exam))}
            />
          </div>
          <ExamActions
            exam={exam}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onMove={onMove}
            onDelete={onDelete}
          />
        </article>
      ))}

      {!exams.length ? (
        <EmptyCard text="No exams found for this view." />
      ) : null}
    </div>
  );
}

function AgendaView(props: {
  exams: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onEdit: (exam: AnyRow) => void;
  onDuplicate: (exam: AnyRow) => void;
  onMove: (exam: AnyRow) => void;
  onDelete: (exam: AnyRow) => void;
}) {
  return (
    <div className="ba-agenda">
      {DAYS.map((day) => {
        const rows = sortExams(
          props.exams.filter((exam) => sessionDay(exam) === day),
        );
        return (
          <section key={day} className="ba-agenda-day">
            <strong>{DAY_LABELS[day]}</strong>
            <ExamList {...props} exams={rows} />
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({
  mode,
  selectedDay,
  exams,
  classes,
  subjects,
  teachers,
  resources,
}: {
  mode: CalendarMode;
  selectedDay: string;
  exams: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  const days = mode === "day" ? [selectedDay] : DAYS;
  return (
    <section className="ba-week-grid">
      {days.map((day) => {
        const rows = sortExams(
          exams.filter((exam) => sessionDay(exam) === day),
        );
        return (
          <article key={day} className="ba-week-day">
            <div className="ba-week-day-head">
              <strong>{SHORT_DAY_LABELS[day]}</strong>
              <span>{rows.length}</span>
            </div>
            <div className="ba-week-day-body">
              {rows.map((exam, index) => (
                <article
                  className="ba-session-block compact"
                  key={String(idOf(exam) || index)}
                >
                  <strong>{examTitle(exam, subjects)}</strong>
                  <span>
                    {sessionTime(exam)} ·{" "}
                    {className(classes, sessionClassId(exam))}
                  </span>
                  <small>
                    {teacherName(teachers, sessionTeacherId(exam))} ·{" "}
                    {resourceName(resources, exam)}
                  </small>
                </article>
              ))}
              {!rows.length ? <p>No exams</p> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ExamSchedule({
  exams,
  classes,
  subjects,
  teachers,
  resources,
  conflictExamIds,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
}: {
  exams: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  conflictExamIds: Set<string>;
  onEdit: (exam: AnyRow) => void;
  onDuplicate: (exam: AnyRow) => void;
  onMove: (exam: AnyRow) => void;
  onDelete: (exam: AnyRow) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Exams ({exams.length})</th>
              <th>Day</th>
              <th>Time</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Invigilator</th>
              <th>Room</th>
              <th>Conflict</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam, index) => {
              const id = cleanId(exam.id);
              const hasConflict = id ? conflictExamIds.has(id) : false;

              return (
                <tr key={String(idOf(exam) || examKey(exam) || index)}>
                  <td>
                    <strong>{examTitle(exam, subjects)}</strong>
                    <span>{exam.sessionType || "exam"}</span>
                  </td>
                  <td>{DAY_LABELS[sessionDay(exam)]}</td>
                  <td>{sessionTime(exam)}</td>
                  <td>{className(classes, sessionClassId(exam))}</td>
                  <td>{subjectName(subjects, sessionSubjectId(exam))}</td>
                  <td>{teacherName(teachers, sessionTeacherId(exam))}</td>
                  <td>{resourceName(resources, exam)}</td>
                  <td>
                    {hasConflict ? (
                      <Chip tone="orange">Conflict</Chip>
                    ) : (
                      <Chip tone="green">Clear</Chip>
                    )}
                  </td>
                  <td>
                    <ExamActions
                      exam={exam}
                      onEdit={onEdit}
                      onDuplicate={onDuplicate}
                      onMove={onMove}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!exams.length ? (
          <div className="ba-empty-table">No exam sessions found.</div>
        ) : null}
      </div>
    </section>
  );
}

function GroupedExamView({
  title,
  empty,
  exams,
  classes,
  subjects,
  teachers,
  resources,
  groupLabel,
}: {
  title: string;
  empty: string;
  exams: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  groupLabel: (exam: AnyRow) => string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, AnyRow[]>();
    exams.forEach((exam) => {
      const label = groupLabel(exam) || "Unassigned";
      const current = map.get(label) || [];
      current.push(exam);
      map.set(label, current);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [exams, groupLabel]);

  return (
    <section className="ba-list">
      {groups.map(([label, rows]) => (
        <article className="ba-analysis" key={label}>
          <span>{title}</span>
          <strong>{label}</strong>
          <div className="ba-list">
            {sortExams(rows).map((exam, index) => (
              <article
                className="ba-session-block"
                key={String(idOf(exam) || index)}
              >
                <strong>{examTitle(exam, subjects)}</strong>
                <span>
                  {DAY_LABELS[sessionDay(exam)]} · {sessionTime(exam)} ·{" "}
                  {className(classes, sessionClassId(exam))}
                </span>
                <small>
                  {subjectName(subjects, sessionSubjectId(exam))} ·{" "}
                  {teacherName(teachers, sessionTeacherId(exam))} ·{" "}
                  {resourceName(resources, exam)}
                </small>
              </article>
            ))}
          </div>
        </article>
      ))}

      {!groups.length ? <EmptyCard text={empty} /> : null}
    </section>
  );
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
  const cleanRows = rows.filter((row) => row.value > 0).slice(0, 8);

  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>

      <div className="ba-analysis-list">
        {cleanRows.map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>
                  {row.value} · {share}%
                </small>
              </div>
              <div className="ba-progress">
                <i style={{ width: `${Math.max(4, share)}%` }} />
              </div>
            </section>
          );
        })}

        {!cleanRows.length ? <p>No data available.</p> : null}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}

.ba-state,
.ba-search-card,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-sheet,
.ba-modal,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}

.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
}

.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}

.ba-icon-button,
.ba-filter-button,
.ba-add-inline {
  width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline {
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

.ba-slider-icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ba-filter-button {
  position: relative;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-filter-button b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  border: 2px solid var(--card-bg,#fff);
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-overview-grid,
.ba-analysis-grid,
.ba-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.ba-analysis,
.ba-card,
.ba-empty,
.ba-table-card {
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.ba-analysis > span {
  display: block;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.ba-analysis > strong {
  display: block;
  margin-top: 4px;
  color: var(--text,#111827);
  font-size: 24px;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.ba-analysis > p {
  margin: 4px 0 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.5;
}

.ba-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ba-avatar {
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--ba-primary);
  color: #fff;
  font-size: 22px;
  box-shadow: 0 12px 26px color-mix(in srgb,var(--ba-primary) 28%,transparent);
}

.ba-avatar.small {
  width: 44px;
  height: 44px;
  flex-basis: 44px;
  font-size: 18px;
}

.ba-card-main {
  flex: 1;
}

.ba-card-main h3 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-card-main p {
  margin: 4px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green{background:rgba(34,197,94,.14);color:#16a34a}
.ba-chip.red{background:rgba(239,68,68,.14);color:#ef4444}
.ba-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}
.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.ba-chip.orange{background:rgba(245,158,11,.16);color:#d97706}
.ba-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}

.ba-mini-grid {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 8px;
  margin-top: 10px;
}

.ba-mini {
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb,var(--muted,#64748b) 9%,transparent);
  border: 1px solid var(--border,rgba(0,0,0,.08));
  overflow: hidden;
}

.ba-mini strong,
.ba-mini span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-mini strong {
  color: var(--text,#111827);
  font-size: 13px;
  font-weight: 1000;
}

.ba-mini span {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 850;
}

.ba-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ba-btn,
.ba-delete,
.ba-mini-action {
  min-height: 34px;
  border-radius: 999px;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-btn,
.ba-mini-action {
  border: 1px solid var(--border,rgba(0,0,0,.10));
  background: var(--surface,#fff);
  color: var(--text,#111827);
}

.ba-delete {
  border: 1px solid color-mix(in srgb,var(--muted,#64748b) 26%,var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
}

.student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
}

.student-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.student-main strong,
.student-main small,
.student-main em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
}

.student-main small {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 800;
}

.student-main em {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-style: normal;
  font-weight: 750;
}

.student-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.student-detail-strip {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 7px;
  margin-top: 10px;
}

.student-detail-strip span {
  min-height: 54px;
  padding: 8px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
}

.student-detail-strip b {
  display: block;
  margin-bottom: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  color: var(--text,#111827);
  font-size: 13px;
}

.ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
}

.ba-table-scroll td span {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 800;
}

.ba-empty-table {
  padding: 18px;
  color: var(--muted,#64748b);
  font-size: 13px;
  font-weight: 850;
  text-align: center;
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.ba-empty div {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-message {
  margin: 10px 0;
  padding: 12px;
  border-radius: 18px;
  background: rgba(245,158,11,.14);
  color: #92400e;
  font-size: 13px;
  font-weight: 900;
}

.ba-progress,
.ba-bar {
  height: 9px;
  margin-top: 10px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent);
  overflow: hidden;
}

.ba-progress div,
.ba-progress i,
.ba-bar i {
  display: block;
  height: 100%;
  background: var(--ba-primary);
  border-radius: inherit;
}

.ba-mode-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff));
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-mode-tabs button {
  border: 0;
  border-radius: 999px;
  min-height: 34px;
  padding: 0 12px;
  background: transparent;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-transform: capitalize;
}

.ba-mode-tabs button.active {
  background: var(--ba-primary);
  color: #fff;
}

.ba-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.ba-head p {
  margin: 0;
  color: var(--ba-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ba-head h3 {
  margin: 2px 0 0;
  color: var(--text,#111827);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-week-grid {
  display: grid;
  grid-template-columns: repeat(7,minmax(150px,1fr));
  gap: 8px;
  overflow-x: auto;
}

.ba-week-day {
  min-height: 230px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
  border-radius: 18px;
  background: var(--surface,#fff);
  padding: 8px;
}

.ba-week-day-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ba-week-day-head strong {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--muted,#64748b);
}

.ba-week-day-head span {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--ba-primary) 12%,transparent);
  font-size: 12px;
  font-weight: 1000;
}

.ba-week-day-body,
.ba-agenda,
.ba-agenda-day {
  display: grid;
  gap: 8px;
}

.ba-agenda-day > strong {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 1000;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ba-week-day-body p {
  margin: 8px 0;
  text-align: center;
  color: var(--muted,#64748b);
  font-size: 12px;
}

.ba-session-block {
  display: grid;
  gap: 2px;
  padding: 8px;
  border-radius: 14px;
  background: color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));
  border: 1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent);
  overflow: hidden;
}

.ba-session-block strong,
.ba-session-block span,
.ba-session-block small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ba-session-block strong {
  font-size: 12px;
  font-weight: 1000;
  color: var(--text,#111827);
}

.ba-session-block span,
.ba-session-block small {
  font-size: 11px;
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-analysis-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section {
  display: grid;
  gap: 6px;
}

.ba-analysis-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 900;
  color: var(--text,#111827);
}

.ba-analysis-list small {
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-sheet-backdrop,
.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: end;
  background: rgba(15,23,42,.52);
  padding: 10px;
}

.ba-sheet,
.ba-modal {
  width: min(640px, 100%);
  margin: 0 auto;
  max-height: min(82dvh, 720px);
  overflow-y: auto;
  border-radius: 28px;
  padding: 14px;
  color: var(--text,#111827);
}

.ba-sheet.small {
  width: min(440px, 100%);
}

.ba-sheet-head,
.ba-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.ba-sheet-head h2,
.ba-modal-head h2 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-sheet-head p,
.ba-modal-head p {
  margin: 3px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 750;
}

.ba-sheet-head button,
.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 15px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 9px;
}

.ba-form label {
  display: grid;
  gap: 6px;
}

.ba-form label span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-form-section {
  margin-top: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--card-bg,var(--surface,#fff));
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-form-section h3 {
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 16px;
  font-weight: 1000;
}

.ba-sheet-actions,
.ba-modal-actions {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 8px;
  margin-top: 12px;
}

.ba-sheet-actions button,
.ba-modal-actions button {
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 950;
  cursor: pointer;
}

.ba-sheet-actions .primary,
.ba-modal-actions button:last-child {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0,1fr);
  grid-template-areas:
    "icon title"
    "icon note";
  align-items: center;
  column-gap: 10px;
  min-height: 62px;
  padding: 10px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}

.ba-menu-list button > span {
  grid-area: icon;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb,var(--ba-primary) 10%,transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list button > b {
  grid-area: title;
  color: var(--text,#111827);
  font-size: 13px;
  font-weight: 1000;
}

.ba-menu-list button > small {
  grid-area: note;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.ba-menu-list button.active {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.ba-menu-list button.active > span {
  background: rgba(255,255,255,.18);
  color: #fff;
}

.ba-menu-list button.active > b,
.ba-menu-list button.active > small {
  color: #fff;
}

@media (min-width: 680px) {
  .ba-page { padding: calc(12px * var(--local-density-scale,1)); }
  .ba-form { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .ba-mini-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .ba-overview-grid,
  .ba-analysis-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .ba-analysis.wide { grid-column: 1 / -1; }
}

@media (min-width: 1040px) {
  .ba-page {
    padding: calc(16px * var(--local-density-scale,1));
    max-width: 1180px;
    margin: 0 auto;
  }

  .ba-list {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(4,minmax(0,1fr));
  }
}

@media (max-width: 520px) {
  .ba-page { padding: calc(6px * var(--local-density-scale,1)); }
  .ba-row-actions { justify-content: stretch; }
  .ba-btn,
  .ba-delete { flex: 1; }
  .ba-mini-grid,
  .student-detail-strip,
  .ba-sheet-actions,
  .ba-modal-actions { grid-template-columns: minmax(0,1fr); }
  .ba-sheet,
  .ba-modal { border-radius: 24px; }
  .ba-week-grid { grid-template-columns: repeat(7,160px); }
}
`;
