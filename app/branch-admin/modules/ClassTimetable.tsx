"use client";

/**
 * app/branch-admin/ClassTimetable.tsx
 * ---------------------------------------------------------
 * ELEEVEON CLASS TIMETABLE V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Class-focused branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Golden UI behavior:
 * - no duplicate hero/header block inside the module
 * - compact search + inline add + slider filter + more menu
 * - filters live inside a bottom sheet so the main page stays clean
 * - timetable/table/analytics/card views live under the More menu
 * - More sheet matches Students.tsx golden active-state styling and closes after selection
 * - cards keep the compact Students.tsx-inspired rhythm
 * - table headers use theme variables so dark mode stays readable
 * - delete actions stay calm and professional, not loud red
 *
 * Timetable behavior:
 * - supports Week, Day, Teacher, Class, and Room timetable modes
 * - treats class as the primary scheduling focus while staying branch-scoped
 * - supports creating one session across multiple repeat days
 * - groups repeated sessions as one card while preserving each occurrence
 * - detects teacher/class/resource/room conflicts and stores them locally
 *
 * Data focus:
 * - scheduleTimetables
 * - scheduleSessions
 * - scheduleResources
 * - scheduleConflicts
 * - classes
 * - subjects
 * - teachers
 *
 * Sync behavior:
 * - createLocal(...) creates timetable/session/conflict records
 * - updateLocal(...) edits sessions, timetables, and conflicts
 * - softDeleteLocal(...) safely removes sessions for sync
 * - no manual synced/version/device fields are written in this module
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

type ViewMode = "timetable" | "cards" | "table" | "analytics";
type TimetableMode = "week" | "day" | "teacher" | "class" | "room";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

const MODE_LABEL = "Class Timetable";
const MODE_ICON = "📚";

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

const now = () => Date.now();

function timeToMinute(value: string) {
  const [hour, minute] = String(value || "00:00")
    .split(":")
    .map((part) => Number(part || 0));
  return Math.max(
    0,
    Math.min(
      1439,
      (Number.isFinite(hour) ? hour : 0) * 60 +
        (Number.isFinite(minute) ? minute : 0),
    ),
  );
}

function minuteToTime(value: any) {
  const total = Math.max(0, Math.min(1439, n(value)));
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatMinuteRange(start: number, end: number) {
  return `${minuteToTime(start)} - ${minuteToTime(end)}`;
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return String(value?.id ?? "").trim();
  return String(value).trim();
}

function cleanId(value: any): string {
  return idOf(value);
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

function firstPermanentId(...values: unknown[]): string {
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

  return firstPermanentId(
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

  return firstPermanentId(
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
  const rowSchoolId = schoolIdOf(row);
  const rowBranchId = branchIdOf(row);
  return rowSchoolId === schoolId && rowBranchId === branchId;
}

function isSchoolLevelRow(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string | null,
) {
  if (!sameAccount(row, accountId)) return false;
  return schoolIdOf(row) === schoolId && !branchIdOf(row);
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

function sessionTitle(row: AnyRow) {
  return text(
    row?.title || row?.sessionType || row?.type || row?.subjectName,
    "Timetable session",
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
  return n(row?.startMinute ?? row?.start ?? row?.startTimeMinute);
}

function endMinute(row: AnyRow) {
  const end = n(row?.endMinute ?? row?.end ?? row?.endTimeMinute);
  return end || startMinute(row) + 60;
}

function sessionTime(row: AnyRow) {
  try {
    return formatMinuteRange(startMinute(row), endMinute(row));
  } catch {
    return `${startMinute(row)} - ${endMinute(row)}`;
  }
}

function className(classes: AnyRow[], classId: any) {
  const row = classes.find(
    (item) => String(idOf(item) ?? "") === String(classId ?? ""),
  );
  return row?.name || row?.className || "No class";
}

function subjectName(subjects: AnyRow[], subjectId: any) {
  const row = subjects.find(
    (item) => String(idOf(item) ?? "") === String(subjectId ?? ""),
  );
  return row?.name || row?.subjectName || "No subject";
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
      idOf(item) === idOf(session.resourceId),
  );
  return (
    row?.name || row?.roomName || session.roomName || session.room || "No room"
  );
}

function sessionTeacherId(session: AnyRow) {
  return cleanId(session.teacherId ?? session.teacherId ?? session.staffId);
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

function sessionTypeOf(session: AnyRow) {
  return text(session.sessionType || session.type, "session").toLowerCase();
}

function sessionRoomKey(session: AnyRow) {
  const resourceId = sessionResourceId(session);
  const room = text(session.roomName || session.room, "").toLowerCase();
  return resourceId ? `resource:${resourceId}` : room ? `room:${room}` : "none";
}

function sessionGroupKey(session: AnyRow) {
  return [
    idOf(session.timetableId),
    sessionTypeOf(session),
    sessionTitle(session).toLowerCase(),
    startMinute(session),
    endMinute(session),
    sessionClassId(session),
    sessionSubjectId(session),
    sessionTeacherId(session),
    sessionRoomKey(session),
  ].join("|");
}

function groupSessions(rows: AnyRow[]) {
  const map = new Map<string, AnyRow[]>();

  for (const session of rows) {
    const key = sessionGroupKey(session);
    const current = map.get(key) || [];
    current.push(session);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([key, groupRows]) => ({
      key,
      primary: sortSessions(groupRows)[0],
      rows: sortSessions(groupRows),
      days: Array.from(
        new Set(groupRows.map((session) => sessionDay(session))),
      ).sort((a, b) => dayIndex(a) - dayIndex(b)),
    }))
    .sort(
      (a, b) =>
        startMinute(a.primary) - startMinute(b.primary) ||
        sessionTitle(a.primary).localeCompare(sessionTitle(b.primary)),
    );
}

function dayListLabel(days: string[]) {
  if (!days.length) return "No day";
  if (days.length === 7) return "Every day";
  return days.map((day) => SHORT_DAY_LABELS[day] || day).join(", ");
}

function isRoutineGroup(group: { rows: AnyRow[]; days: string[] }) {
  return group.rows.length > 1 || group.days.length > 1;
}

function uniqueRows(rows: AnyRow[]) {
  const seen = new Set<string>();

  return rows.filter((row, index) => {
    const key = String(
      idOf(row) ||
        `${sessionDay(row)}-${startMinute(row)}-${sessionTitle(row)}-${index}`,
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortSessions(rows: AnyRow[]) {
  return [...rows].sort((a, b) => {
    return (
      dayIndex(sessionDay(a)) - dayIndex(sessionDay(b)) ||
      startMinute(a) - startMinute(b) ||
      sessionTitle(a).localeCompare(sessionTitle(b))
    );
  });
}

function minutesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && aEnd > bStart;
}

function conflictKey(type: string, aId: string, bId: string) {
  const [firstId, secondId] = [idOf(aId), idOf(bId)].sort();
  return `${type}-${firstId}-${secondId}`;
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
    <article
      className={`ba-summary ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}
    >
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
    <div className="ba-mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({
  title = "No records",
  text,
}: {
  title?: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
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
  setView: (value: ViewMode) => void;
  count: number;
}) {
  const views: { key: ViewMode; label: string; icon: string }[] = [
    { key: "timetable", label: "Timetable", icon: "🗓️" },
    { key: "cards", label: "Cards", icon: "▦" },
    { key: "table", label: "Table", icon: "☷" },
    { key: "analytics", label: "Analytics", icon: "📊" },
  ];

  return (
    <section className="ba-toolbar">
      <div className="ba-tabs">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            className={view === item.key ? "active" : ""}
            onClick={() => setView(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <Chip>{count} shown</Chip>
    </section>
  );
}

function TimetableModeSwitch({
  mode,
  setMode,
}: {
  mode: TimetableMode;
  setMode: (value: TimetableMode) => void;
}) {
  const modes: { key: TimetableMode; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "day", label: "Day" },
    { key: "teacher", label: "Teacher" },
    { key: "class", label: "Class" },
    { key: "room", label: "Room" },
  ];

  return (
    <div className="ba-mode-tabs">
      {modes.map((item) => (
        <button
          key={item.key}
          type="button"
          className={mode === item.key ? "active" : ""}
          onClick={() => setMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
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

export default function ClassTimetable() {
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
  const [view, setView] = useState<ViewMode>("timetable");
  const [timetableMode, setTimetableMode] = useState<TimetableMode>("class");
  const [selectedDay, setSelectedDay] = useState("monday");
  const [timetables, setTimetables] = useState<AnyRow[]>([]);
  const [sessions, setSessions] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [conflicts, setConflicts] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | "">(
    "",
  );
  const [filterDay, setFilterDay] = useState("all");
  const [filterClassId, setFilterClassId] = useState<string | "">("");
  const [filterSubjectId, setFilterSubjectId] = useState<string | "">("");
  const [filterTeacherId, setFilterTeacherId] = useState<string | "">("");
  const [filterResourceId, setFilterResourceId] = useState<string | "">("");
  const [filterSessionType, setFilterSessionType] = useState("all");
  const [filterConflictFocus, setFilterConflictFocus] = useState("all");
  const [filterStartTime, setFilterStartTime] = useState("");
  const [filterEndTime, setFilterEndTime] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  type ClassTimetableForm = {
    id: string;
    timetableName: string;
    timetableId: string;
    dayOfWeek: string;
    repeatDays: string[];
    sessionType: string;
    title: string;
    startTime: string;
    endTime: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    resourceId: string;
    roomName: string;
  };

  const emptyForm: ClassTimetableForm = {
    id: "",
    timetableName: "",
    timetableId: "",
    dayOfWeek: "monday",
    repeatDays: ["monday"],
    sessionType: "lesson",
    title: "",
    startTime: "08:00",
    endTime: "09:00",
    classId: "",
    subjectId: "",
    teacherId: "",
    resourceId: "",
    roomName: "",
  };

  const [form, setForm] = useState<ClassTimetableForm>(emptyForm);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  async function load() {
    if (!accountId || !schoolId || !branchId) {
      setTimetables([]);
      setSessions([]);
      setResources([]);
      setConflicts([]);
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

      const scopedTimetables = (timetableRows as AnyRow[])
        .filter((row: AnyRow) =>
          isBranchRow(row, accountId, schoolId, branchId),
        )
        .filter((row: AnyRow) => row?.isDeleted !== true)
        .filter((row: AnyRow) => {
          const type = String(
            row.timetableType || row.scopeType || "branch",
          ).toLowerCase();
          return [
            "branch",
            "weekly",
            "general",
            "class",
            "teacher",
            "room",
            "resource",
          ].includes(type);
        });

      setTimetables(scopedTimetables);

      setSessions(
        uniqueRows(sessionRows as AnyRow[])
          .filter((row: AnyRow) =>
            isBranchRow(row, accountId, schoolId, branchId),
          )
          .filter((row: AnyRow) => row?.isDeleted !== true),
      );

      setClasses(
        (classRows as AnyRow[]).filter(
          (row: AnyRow) =>
            isBranchRow(row, accountId, schoolId, branchId) ||
            isSchoolLevelRow(row, accountId, schoolId),
        ),
      );

      setSubjects(
        (subjectRows as AnyRow[]).filter(
          (row: AnyRow) =>
            sameAccount(row, accountId) &&
            (schoolIdOf(row) === schoolId ||
              !schoolIdOf(row) ||
              branchIdOf(row) === branchId),
        ),
      );

      setTeachers(
        (teacherRows as AnyRow[]).filter(
          (row: AnyRow) =>
            isBranchRow(row, accountId, schoolId, branchId) ||
            isSchoolLevelRow(row, accountId, schoolId),
        ),
      );

      setResources(
        (resourceRows as AnyRow[])
          .filter((row: AnyRow) =>
            isBranchRow(row, accountId, schoolId, branchId),
          )
          .filter((row: AnyRow) => row?.isDeleted !== true),
      );

      setConflicts(
        (conflictRows as AnyRow[])
          .filter((row: AnyRow) =>
            isBranchRow(row, accountId, schoolId, branchId),
          )
          .filter((row: AnyRow) => row?.isDeleted !== true)
          .filter(
            (row: AnyRow) =>
              String(row.status || "open").toLowerCase() === "open",
          ),
      );

      if (!selectedTimetableId && scopedTimetables[0]?.id) {
        setSelectedTimetableId(String(scopedTimetables[0].id));
      }
    } catch (error) {
      console.error("Failed to load timetable:", error);
      setMessage("Failed to load timetable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, schoolId, branchId, dataRevision]);

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
  }

  function openCreate() {
    resetForm();
    setForm((current) => ({
      ...current,
      timetableId: selectedTimetableId ? String(selectedTimetableId) : "",
      dayOfWeek: selectedDay || "monday",
      repeatDays: [selectedDay || "monday"],
    }));
    setDrawer(true);
  }

  function openEdit(session: AnyRow) {
    setMessage("");
    setForm({
      id: cleanId(session.id),
      timetableName: "",
      timetableId: session.timetableId ? String(session.timetableId) : "",
      dayOfWeek: sessionDay(session),
      repeatDays: [sessionDay(session)],
      sessionType: String(session.sessionType || "lesson"),
      title: String(session.title || ""),
      startTime: minuteToTime(startMinute(session)),
      endTime: minuteToTime(endMinute(session)),
      classId: sessionClassId(session) ? String(sessionClassId(session)) : "",
      subjectId: sessionSubjectId(session)
        ? String(sessionSubjectId(session))
        : "",
      teacherId: sessionTeacherId(session)
        ? String(sessionTeacherId(session))
        : "",
      resourceId: sessionResourceId(session)
        ? String(sessionResourceId(session))
        : "",
      roomName: String(session.roomName || session.room || ""),
    });
    setDrawer(true);
  }

  function toggleRepeatDay(day: string) {
    setForm((current) => {
      const existing = Array.isArray(current.repeatDays)
        ? current.repeatDays
        : [];
      const hasDay = existing.includes(day);
      const nextDays = hasDay
        ? existing.filter((item) => item !== day)
        : [...existing, day];
      const cleanDays = nextDays.length
        ? nextDays
        : [current.dayOfWeek || "monday"];

      return {
        ...current,
        repeatDays: cleanDays,
        dayOfWeek: cleanDays[0] || "monday",
      };
    });
  }

  const conflictSessionIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach((conflict: AnyRow) => {
      const a = cleanId(conflict.sessionIdA);
      const b = cleanId(conflict.sessionIdB);
      if (a) ids.add(a);
      if (b) ids.add(b);
    });
    return ids;
  }, [conflicts]);

  const visibleSessions = useMemo(() => {
    const q = query.toLowerCase().trim();
    const startFilter = filterStartTime ? timeToMinute(filterStartTime) : null;
    const endFilter = filterEndTime ? timeToMinute(filterEndTime) : null;

    return sortSessions(
      sessions
        .filter(
          (session: AnyRow) =>
            !selectedTimetableId ||
            String(session.timetableId) === String(selectedTimetableId),
        )
        .filter(
          (session: AnyRow) =>
            filterDay === "all" || sessionDay(session) === filterDay,
        )
        .filter(
          (session: AnyRow) =>
            !filterClassId || sessionClassId(session) === String(filterClassId),
        )
        .filter(
          (session: AnyRow) =>
            !filterSubjectId ||
            sessionSubjectId(session) === String(filterSubjectId),
        )
        .filter(
          (session: AnyRow) =>
            !filterTeacherId ||
            sessionTeacherId(session) === String(filterTeacherId),
        )
        .filter(
          (session: AnyRow) =>
            !filterResourceId ||
            sessionResourceId(session) === String(filterResourceId),
        )
        .filter(
          (session: AnyRow) =>
            filterSessionType === "all" ||
            sessionTypeOf(session) === filterSessionType,
        )
        .filter((session: AnyRow) => {
          if (startFilter === null && endFilter === null) return true;
          const sessionStart = startMinute(session);
          const sessionEnd = endMinute(session);
          if (startFilter !== null && sessionEnd <= startFilter) return false;
          if (endFilter !== null && sessionStart >= endFilter) return false;
          return true;
        })
        .filter((session: AnyRow) => {
          if (filterConflictFocus === "all") return true;
          const id = cleanId(session.id);
          const hasConflict = id ? conflictSessionIds.has(id) : false;
          return filterConflictFocus === "conflicts"
            ? hasConflict
            : !hasConflict;
        })
        .filter((session: AnyRow) => {
          if (!q) return true;

          return [
            sessionTitle(session),
            session.roomName,
            sessionDay(session),
            session.sessionType,
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
    classes,
    conflictSessionIds,
    filterClassId,
    filterConflictFocus,
    filterDay,
    filterEndTime,
    filterResourceId,
    filterSessionType,
    filterStartTime,
    filterSubjectId,
    filterTeacherId,
    query,
    resources,
    selectedTimetableId,
    sessions,
    subjects,
    teachers,
  ]);

  const groupedVisibleSessions = useMemo(
    () => groupSessions(visibleSessions),
    [visibleSessions],
  );

  const activeFilterCount = useMemo(() => {
    return [
      query.trim(),
      selectedTimetableId,
      filterDay !== "all" ? filterDay : "",
      filterClassId,
      filterSubjectId,
      filterTeacherId,
      filterResourceId,
      filterSessionType !== "all" ? filterSessionType : "",
      filterConflictFocus !== "all" ? filterConflictFocus : "",
      filterStartTime,
      filterEndTime,
    ].filter(Boolean).length;
  }, [
    filterClassId,
    filterConflictFocus,
    filterDay,
    filterEndTime,
    filterResourceId,
    filterSessionType,
    filterStartTime,
    filterSubjectId,
    filterTeacherId,
    query,
    selectedTimetableId,
  ]);

  function clearFilters() {
    setQuery("");
    setSelectedTimetableId("");
    setFilterDay("all");
    setFilterClassId("");
    setFilterSubjectId("");
    setFilterTeacherId("");
    setFilterResourceId("");
    setFilterSessionType("all");
    setFilterConflictFocus("all");
    setFilterStartTime("");
    setFilterEndTime("");
  }

  const summary = useMemo(
    () => ({
      timetables: timetables.length,
      sessions: visibleSessions.length,
      groups: groupedVisibleSessions.length,
      teachers: new Set(
        visibleSessions
          .map((session: AnyRow) => sessionTeacherId(session))
          .filter(Boolean),
      ).size,
      classes: new Set(
        visibleSessions
          .map((session: AnyRow) => sessionClassId(session))
          .filter(Boolean),
      ).size,
      resources: new Set(
        visibleSessions
          .map(
            (session: AnyRow) =>
              sessionResourceId(session) || text(session.roomName),
          )
          .filter(Boolean),
      ).size,
      conflicts: conflicts.length,
    }),
    [
      conflicts.length,
      groupedVisibleSessions.length,
      timetables.length,
      visibleSessions,
    ],
  );

  const selectedTimetable = timetables.find(
    (timetable: AnyRow) => String(timetable.id) === String(selectedTimetableId),
  );

  async function saveDetectedConflicts({
    savedSession,
    editingId,
  }: {
    savedSession: AnyRow;
    editingId: string;
  }) {
    const newConflicts: Partial<ScheduleConflict>[] = [];
    const related = sessions.filter((session: AnyRow) => {
      const id = cleanId(session.id);
      if (!id || id === editingId) return false;
      if (sessionDay(session) !== sessionDay(savedSession)) return false;
      return minutesOverlap(
        startMinute(savedSession),
        endMinute(savedSession),
        startMinute(session),
        endMinute(session),
      );
    });

    const existingConflictKeys = new Set(
      conflicts.map((conflict: AnyRow) =>
        conflictKey(
          String(conflict.conflictType || "custom"),
          cleanId(conflict.sessionIdA),
          cleanId(conflict.sessionIdB),
        ),
      ),
    );

    for (const session of related) {
      const otherId = cleanId(session.id);
      const teacherId = sessionTeacherId(savedSession);
      const classId = sessionClassId(savedSession);
      const resourceId = sessionResourceId(savedSession);
      const roomA = text(savedSession.roomName || savedSession.room, "");
      const roomB = text(session.roomName || session.room, "");

      const possible = [
        {
          active: teacherId && teacherId === sessionTeacherId(session),
          type: "teacher_double_booked",
          title: "Teacher double-booked",
          description: `${teacherName(teachers, teacherId)} has overlapping timetable sessions on ${DAY_LABELS[sessionDay(savedSession)]}.`,
          severity: "high",
          teacherId: teacherId,
        },
        {
          active: classId && classId === sessionClassId(session),
          type: "class_double_booked",
          title: "Class double-booked",
          description: `${className(classes, classId)} has overlapping timetable sessions on ${DAY_LABELS[sessionDay(savedSession)]}.`,
          severity: "high",
          classId,
        },
        {
          active: resourceId && resourceId === sessionResourceId(session),
          type: "resource_double_booked",
          title: "Resource double-booked",
          description: `${resourceName(resources, savedSession)} is assigned to overlapping sessions.`,
          severity: "medium",
          resourceId,
        },
        {
          active:
            !resourceId && roomA && roomA.toLowerCase() === roomB.toLowerCase(),
          type: "room_double_booked",
          title: "Room double-booked",
          description: `${roomA} is assigned to overlapping sessions.`,
          severity: "medium",
        },
      ];

      for (const item of possible) {
        if (!item.active) continue;
        const key = conflictKey(item.type, editingId, otherId);
        if (existingConflictKeys.has(key)) continue;
        existingConflictKeys.add(key);

        const safeAccountId = String(accountId);
        newConflicts.push({
          accountId: safeAccountId,
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
          dayOfWeek: sessionDay(savedSession) as ScheduleConflict["dayOfWeek"],
          startMinute: Math.max(
            startMinute(savedSession),
            startMinute(session),
          ),
          endMinute: Math.min(endMinute(savedSession), endMinute(session)),
          detectedAt: now(),
          isDeleted: false,
        });
      }
    }

    for (const conflict of newConflicts.slice(0, 20)) {
      await createLocal("scheduleConflicts", conflict as ScheduleConflict);
    }
  }

  async function save() {
    setMessage("");

    if (!accountId || !schoolId || !branchId) {
      setMessage("Assigned branch context is required.");
      return;
    }

    const start = timeToMinute(form.startTime);
    const end = timeToMinute(form.endTime);

    if (start >= end) {
      setMessage("End time must be after start time.");
      return;
    }

    if (!form.classId && !form.timetableId && !selectedTimetableId) {
      setMessage("Choose a class before creating a new class timetable.");
      return;
    }

    setSaving(true);

    try {
      let timetableId = idOf(form.timetableId || selectedTimetableId);

      if (!timetableId) {
        const safeAccountId = String(accountId);
        const created = (await createLocal("scheduleTimetables", {
          accountId: safeAccountId,
          schoolId: schoolId,
          branchId: branchId,
          name: form.timetableName.trim() || MODE_LABEL,
          timetableType: "class",
          scopeType: "class",
          scopeId: cleanId(form.classId) || branchId,
          classId: cleanId(form.classId) || undefined,
          teacherId: cleanId(form.teacherId) || undefined,
          status: "active",
          active: true,
          isDefault: !timetables.length,
          createdByRole: "branch_admin",
          createdByUserId: safeAccountId,
          isDeleted: false,
        } as ScheduleTimetable)) as ScheduleTimetable | undefined;

        timetableId = idOf((created as AnyRow)?.id);
      }

      if (!timetableId) {
        setMessage("Could not create or select a timetable.");
        return;
      }

      const editingId = cleanId(form.id);
      const safeAccountId = String(accountId);
      const selectedDays = Array.from(
        new Set(
          (form.repeatDays?.length ? form.repeatDays : [form.dayOfWeek]).map(
            normalizeDay,
          ),
        ),
      );

      if (!selectedDays.length) {
        setMessage("Select at least one day for this session.");
        return;
      }

      const existingEditingSession = editingId
        ? sessions.find((session: AnyRow) => cleanId(session.id) === editingId)
        : null;
      const originalEditingDay = existingEditingSession
        ? sessionDay(existingEditingSession)
        : normalizeDay(form.dayOfWeek);

      const baseSessionPayload: Partial<ScheduleSession> = {
        accountId: safeAccountId,
        schoolId: schoolId,
        branchId: branchId,
        timetableId,
        sessionType: form.sessionType as ScheduleSession["sessionType"],
        startMinute: start,
        endMinute: end,
        title:
          form.title.trim() ||
          `${subjects.find((subject: AnyRow) => idOf(subject) === idOf(form.subjectId))?.name || "Session"}`,
        classId: cleanId(form.classId) || undefined,
        subjectId: cleanId(form.subjectId) || undefined,
        teacherId: cleanId(form.teacherId) || undefined,
        resourceId: idOf(form.resourceId) || undefined,
        roomName: form.roomName.trim() || undefined,
        active: true,
        isDeleted: false,
      };

      const savedSessions: ScheduleSession[] = [];

      for (const day of selectedDays) {
        const sessionPayload = {
          ...baseSessionPayload,
          dayOfWeek: day as ScheduleSession["dayOfWeek"],
        };

        if (editingId && day === originalEditingDay) {
          const savedSession = (await updateLocal(
            "scheduleSessions",
            editingId,
            sessionPayload as Partial<ScheduleSession>,
          )) as ScheduleSession | undefined;

          if (savedSession) savedSessions.push(savedSession);
          continue;
        }

        const matchingExistingSession = editingId
          ? sessions.find((session: AnyRow) => {
              const sessionId = cleanId(session.id);
              if (!sessionId || sessionId === editingId) return false;
              if (idOf(session.timetableId) !== timetableId)
                return false;
              if (sessionDay(session) !== day) return false;
              if (startMinute(session) !== start || endMinute(session) !== end)
                return false;
              if (
                sessionTitle(session).toLowerCase() !==
                String(baseSessionPayload.title || "").toLowerCase()
              )
                return false;
              if (
                sessionClassId(session) !== cleanId(baseSessionPayload.classId)
              )
                return false;
              if (
                sessionSubjectId(session) !==
                cleanId(baseSessionPayload.subjectId)
              )
                return false;
              if (
                sessionTeacherId(session) !==
                cleanId(baseSessionPayload.teacherId)
              )
                return false;
              return true;
            })
          : null;

        if (matchingExistingSession) {
          const existingId = cleanId(matchingExistingSession.id);
          const savedSession = (await updateLocal(
            "scheduleSessions",
            existingId,
            sessionPayload as Partial<ScheduleSession>,
          )) as ScheduleSession | undefined;

          if (savedSession) savedSessions.push(savedSession);
          continue;
        }

        const savedSession = (await createLocal(
          "scheduleSessions",
          sessionPayload as ScheduleSession,
        )) as ScheduleSession | undefined;

        if (savedSession) savedSessions.push(savedSession);
      }

      for (const savedSession of savedSessions) {
        const savedId = cleanId((savedSession as AnyRow)?.id);
        if (savedId) {
          await saveDetectedConflicts({
            savedSession: savedSession as AnyRow,
            editingId: savedId,
          });
        }
      }

      setDrawer(false);
      resetForm();
      await load();
    } catch (error: any) {
      console.error("Failed to save session:", error);
      setMessage(error?.message || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSession(session: AnyRow) {
    const id = cleanId(session.id);
    if (!id) return;

    const ok = window.confirm(
      `Delete "${sessionTitle(session)}"? This will soft-delete it locally and sync the deletion.`,
    );
    if (!ok) return;

    try {
      await softDeleteLocal("scheduleSessions", id);
      await load();
    } catch (error: any) {
      console.error("Failed to delete session:", error);
      setMessage(error?.message || "Failed to delete session.");
    }
  }

  async function resolveConflict(conflict: AnyRow) {
    const id = cleanId(conflict.id);
    if (!id) return;

    try {
      await updateLocal("scheduleConflicts", id, {
        status: "resolved",
        resolvedAt: now(),
        resolutionNote: "Marked resolved from branch admin timetable.",
      } as Partial<ScheduleConflict>);

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
          <h2>Opening class timetable...</h2>
          <p>
            Loading class timetable sessions, teachers, classes, resources and
            conflicts.
          </p>
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

      <section
        className="ba-search-card"
        aria-label="Branch timetable search and actions"
      >
        <span
          className={`status-dot-mini ${summary.conflicts > 0 ? "orange" : summary.sessions ? "green" : "gray"}`}
          title={`${summary.sessions} session(s), ${summary.conflicts} conflict(s)`}
        />

        <label className="ba-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search timetable..."
            aria-label="Search timetable"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add timetable session"
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

      {activeFilterCount > 0 ? (
        <section
          className="ba-filter-chips"
          aria-label="Active timetable filters"
        >
          {selectedTimetableId ? (
            <button type="button" onClick={() => setSelectedTimetableId("")}>
              Timetable: {selectedTimetable?.name || selectedTimetableId} ×
            </button>
          ) : null}
          {filterDay !== "all" ? (
            <button type="button" onClick={() => setFilterDay("all")}>
              Day: {DAY_LABELS[filterDay]} ×
            </button>
          ) : null}
          {filterSessionType !== "all" ? (
            <button type="button" onClick={() => setFilterSessionType("all")}>
              Type: {filterSessionType} ×
            </button>
          ) : null}
          {filterClassId ? (
            <button type="button" onClick={() => setFilterClassId("")}>
              Class: {className(classes, filterClassId)} ×
            </button>
          ) : null}
          {filterSubjectId ? (
            <button type="button" onClick={() => setFilterSubjectId("")}>
              Subject: {subjectName(subjects, filterSubjectId)} ×
            </button>
          ) : null}
          {filterTeacherId ? (
            <button type="button" onClick={() => setFilterTeacherId("")}>
              Teacher: {teacherName(teachers, filterTeacherId)} ×
            </button>
          ) : null}
          {filterResourceId ? (
            <button type="button" onClick={() => setFilterResourceId("")}>
              Room:{" "}
              {resources.find(
                (row) =>
                  idOf(row) === idOf(filterResourceId),
              )?.name || filterResourceId}{" "}
              ×
            </button>
          ) : null}
          {filterConflictFocus !== "all" ? (
            <button type="button" onClick={() => setFilterConflictFocus("all")}>
              Conflict: {filterConflictFocus} ×
            </button>
          ) : null}
          {filterStartTime ? (
            <button type="button" onClick={() => setFilterStartTime("")}>
              From: {filterStartTime} ×
            </button>
          ) : null}
          {filterEndTime ? (
            <button type="button" onClick={() => setFilterEndTime("")}>
              To: {filterEndTime} ×
            </button>
          ) : null}
        </section>
      ) : null}

      {conflicts.length > 0 ? (
        <section className="ba-section">
          <div className="ba-head">
            <div>
              <p>Conflict Alerts</p>
              <h3>Needs attention</h3>
            </div>
            <Chip tone="red">{conflicts.length} open</Chip>
          </div>

          <div className="ba-list">
            {conflicts.slice(0, 4).map((conflict: AnyRow, index: number) => (
              <article
                className="ba-card"
                key={String(idOf(conflict) || index)}
              >
                <div className="ba-card-top">
                  <div className="ba-avatar">⚠️</div>
                  <div className="ba-card-main">
                    <h3>{conflict.title || "Schedule conflict"}</h3>
                    <p>{conflict.description || "Conflict detected"}</p>
                    <div className="ba-chip-row">
                      <Chip tone={toneForConflict(conflict.severity)}>
                        {conflict.severity || "warning"}
                      </Chip>
                      <Chip tone="orange">
                        {conflict.conflictType || "conflict"}
                      </Chip>
                      <button
                        className="ba-btn"
                        type="button"
                        onClick={() => resolveConflict(conflict)}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "timetable" ? (
        <section className="ba-timetable-panel">
          <div className="ba-timetable-head">
            <div>
              <p>{selectedTimetable?.name || MODE_LABEL}</p>
              <h3>
                {timetableMode === "week"
                  ? "Weekly Timetable"
                  : timetableMode === "day"
                    ? `${DAY_LABELS[selectedDay]} Timetable`
                    : timetableMode === "teacher"
                      ? "Teacher Timetables"
                      : timetableMode === "class"
                        ? "Class Timetables"
                        : "Room Timetables"}
              </h3>
            </div>

            <TimetableModeSwitch
              mode={timetableMode}
              setMode={setTimetableMode}
            />
          </div>

          {timetableMode === "week" ? (
            <WeekTimetable
              sessions={visibleSessions}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "day" ? (
            <DayTimetable
              day={selectedDay}
              sessions={visibleSessions}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "teacher" ? (
            <GroupedTimetable
              title="Teacher"
              sessions={visibleSessions}
              getGroupKey={(session) =>
                String(sessionTeacherId(session) || "none")
              }
              getGroupLabel={(session) =>
                teacherName(teachers, sessionTeacherId(session)) || "No teacher"
              }
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "class" ? (
            <GroupedTimetable
              title="Class"
              sessions={visibleSessions}
              getGroupKey={(session) =>
                String(sessionClassId(session) || "none")
              }
              getGroupLabel={(session) =>
                className(classes, sessionClassId(session))
              }
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}

          {timetableMode === "room" ? (
            <GroupedTimetable
              title="Room"
              sessions={visibleSessions}
              getGroupKey={(session) =>
                String(sessionResourceId(session) || session.roomName || "none")
              }
              getGroupLabel={(session) => resourceName(resources, session)}
              classes={classes}
              subjects={subjects}
              teachers={teachers}
              resources={resources}
            />
          ) : null}
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="ba-section ba-breakdown-grid">
          <AnalyticsCard
            title="Sessions by Day"
            rows={DAYS.map((day) => ({
              label: DAY_LABELS[day],
              value: visibleSessions.filter(
                (session: AnyRow) => sessionDay(session) === day,
              ).length,
            }))}
          />

          <AnalyticsCard
            title="Teacher Load"
            rows={Array.from(
              visibleSessions.reduce(
                (map: Map<string, number>, session: AnyRow) => {
                  const name = teacherName(teachers, sessionTeacherId(session));
                  map.set(name, (map.get(name) || 0) + 1);
                  return map;
                },
                new Map<string, number>(),
              ),
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)}
          />

          <AnalyticsCard
            title="Class Load"
            rows={Array.from(
              visibleSessions.reduce(
                (map: Map<string, number>, session: AnyRow) => {
                  const name = className(classes, sessionClassId(session));
                  map.set(name, (map.get(name) || 0) + 1);
                  return map;
                },
                new Map<string, number>(),
              ),
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)}
          />

          <AnalyticsCard
            title="Room Load"
            rows={Array.from(
              visibleSessions.reduce(
                (map: Map<string, number>, session: AnyRow) => {
                  const name = resourceName(resources, session);
                  map.set(name, (map.get(name) || 0) + 1);
                  return map;
                },
                new Map<string, number>(),
              ),
            )
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value)}
          />
        </section>
      ) : null}

      {view === "table" ? (
        <section className="ba-panel">
          <div className="ba-table-wrap">
            <table className="ba-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Room/Resource</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleSessions.map((session: AnyRow, index: number) => (
                  <tr key={String(idOf(session) || index)}>
                    <td>{DAY_LABELS[sessionDay(session)]}</td>
                    <td>{sessionTime(session)}</td>
                    <td>
                      <strong>{sessionTitle(session)}</strong>
                      <br />
                      <span>{session.sessionType}</span>
                    </td>
                    <td>{className(classes, sessionClassId(session))}</td>
                    <td>{subjectName(subjects, sessionSubjectId(session))}</td>
                    <td>{teacherName(teachers, sessionTeacherId(session))}</td>
                    <td>{resourceName(resources, session)}</td>
                    <td>
                      <div className="ba-row-actions">
                        <button
                          className="ba-btn"
                          type="button"
                          onClick={() => openEdit(session)}
                        >
                          Edit
                        </button>
                        <button
                          className="ba-delete"
                          type="button"
                          onClick={() => deleteSession(session)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!visibleSessions.length ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyCard text="No sessions found." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "cards" ? (
        <section className="ba-section">
          <div className="ba-head">
            <div>
              <p>{selectedTimetable?.name || MODE_LABEL}</p>
              <h3>Weekly sessions</h3>
            </div>
            <Chip>
              {groupedVisibleSessions.length} card(s) · {visibleSessions.length}{" "}
              occurrence(s)
            </Chip>
          </div>

          <div className="ba-list">
            {groupedVisibleSessions.map((group) => (
              <SessionCard
                key={group.key}
                group={group}
                classes={classes}
                subjects={subjects}
                teachers={teachers}
                resources={resources}
                onEdit={openEdit}
                onDelete={deleteSession}
              />
            ))}

            {!groupedVisibleSessions.length ? (
              <EmptyCard text="No timetable sessions found." />
            ) : null}
          </div>
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
          filterDay={filterDay}
          filterClassId={filterClassId}
          filterSubjectId={filterSubjectId}
          filterTeacherId={filterTeacherId}
          filterResourceId={filterResourceId}
          filterSessionType={filterSessionType}
          filterConflictFocus={filterConflictFocus}
          filterStartTime={filterStartTime}
          filterEndTime={filterEndTime}
          setSelectedTimetableId={setSelectedTimetableId}
          setFilterDay={setFilterDay}
          setFilterClassId={setFilterClassId}
          setFilterSubjectId={setFilterSubjectId}
          setFilterTeacherId={setFilterTeacherId}
          setFilterResourceId={setFilterResourceId}
          setFilterSessionType={setFilterSessionType}
          setFilterConflictFocus={setFilterConflictFocus}
          setFilterStartTime={setFilterStartTime}
          setFilterEndTime={setFilterEndTime}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => {
            setView(mode);
            setMoreOpen(false);
          }}
          timetableMode={timetableMode}
          setTimetableMode={(mode) => {
            setView("timetable");
            setTimetableMode(mode);
            setMoreOpen(false);
          }}
          selectedDay={selectedDay}
          setSelectedDay={(day) => {
            setView("timetable");
            setTimetableMode("day");
            setSelectedDay(day);
            setMoreOpen(false);
          }}
          summary={summary}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {drawer ? (
        <div className="ba-drawer-layer">
          <button
            className="ba-drawer-overlay"
            type="button"
            onClick={() => setDrawer(false)}
          />

          <aside className="ba-drawer">
            <div className="ba-drawer-head">
              <div>
                <p>{form.id ? "Edit Session" : "New Session"}</p>
                <h2>{form.id ? "Update Timetable Session" : MODE_LABEL}</h2>
                <span>{activeBranch?.name || "Assigned branch"}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrawer(false);
                  resetForm();
                }}
              >
                ✕
              </button>
            </div>

            {message ? <div className="ba-message">{message}</div> : null}

            <section className="ba-form-card">
              <div className="ba-form-grid">
                <label className="wide">
                  <span>Use Existing Timetable</span>
                  <select
                    value={form.timetableId || selectedTimetableId}
                    onChange={(event) =>
                      setForm({ ...form, timetableId: event.target.value })
                    }
                  >
                    <option value="">Create / Use Default</option>
                    {timetables.map((timetable: AnyRow) => (
                      <option
                        key={String(idOf(timetable))}
                        value={String(idOf(timetable))}
                      >
                        {timetable.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  <span>New Timetable Name if needed</span>
                  <input
                    value={form.timetableName}
                    onChange={(event) =>
                      setForm({ ...form, timetableName: event.target.value })
                    }
                    placeholder={`${MODE_LABEL} Timetable`}
                  />
                </label>

                <label>
                  <span>Main Day</span>
                  <select
                    value={form.dayOfWeek}
                    onChange={(event) => {
                      const nextDay = event.target.value;
                      setForm({
                        ...form,
                        dayOfWeek: nextDay,
                        repeatDays: Array.from(
                          new Set([nextDay, ...(form.repeatDays || [])]),
                        ),
                      });
                    }}
                  >
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        {DAY_LABELS[day]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  <span>
                    {form.id
                      ? "Apply changes across days"
                      : "Repeat / Span across days"}
                  </span>
                  <div className="ba-day-picker">
                    {DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={
                          (form.repeatDays || []).includes(day) ? "active" : ""
                        }
                        onClick={() => toggleRepeatDay(day)}
                      >
                        {SHORT_DAY_LABELS[day]}
                      </button>
                    ))}
                  </div>
                  <small className="ba-help-text">
                    Select multiple days to{" "}
                    {form.id
                      ? "update this session and create or update matching sessions on the other selected days"
                      : "create the same timetable session across those days"}
                    , for example Assembly from Monday to Friday.
                  </small>
                </label>

                <label>
                  <span>Session Type</span>
                  <select
                    value={form.sessionType}
                    onChange={(event) =>
                      setForm({ ...form, sessionType: event.target.value })
                    }
                  >
                    <option value="lesson">Lesson</option>
                    <option value="exam">Exam</option>
                    <option value="meeting">Meeting</option>
                    <option value="break">Break</option>
                    <option value="activity">Activity</option>
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
                  <span>Title</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="Optional custom title"
                  />
                </label>

                <label>
                  <span>Class</span>
                  <select
                    value={form.classId}
                    onChange={(event) =>
                      setForm({ ...form, classId: event.target.value })
                    }
                  >
                    <option value="">No class</option>
                    {classes.map((row: AnyRow) => (
                      <option key={String(idOf(row))} value={String(idOf(row))}>
                        {row.name}
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
                    <option value="">No subject</option>
                    {subjects.map((row: AnyRow) => (
                      <option key={String(idOf(row))} value={String(idOf(row))}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Teacher</span>
                  <select
                    value={form.teacherId}
                    onChange={(event) =>
                      setForm({ ...form, teacherId: event.target.value })
                    }
                  >
                    <option value="">No teacher</option>
                    {teachers.map((row: AnyRow) => (
                      <option key={String(idOf(row))} value={String(idOf(row))}>
                        {rowName(row)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Resource</span>
                  <select
                    value={form.resourceId}
                    onChange={(event) =>
                      setForm({ ...form, resourceId: event.target.value })
                    }
                  >
                    <option value="">No resource</option>
                    {resources.map((row: AnyRow) => (
                      <option key={String(idOf(row))} value={String(idOf(row))}>
                        {row.name}
                      </option>
                    ))}
                  </select>
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

            <div className="ba-drawer-actions">
              <button
                className="ba-btn"
                type="button"
                onClick={() => {
                  setDrawer(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button
                className="ba-primary"
                type="button"
                disabled={saving}
                onClick={save}
              >
                {saving
                  ? "Saving..."
                  : form.id
                    ? "Save Changes"
                    : "Save Session"}
              </button>
            </div>
          </aside>
        </div>
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
  filterDay,
  filterClassId,
  filterSubjectId,
  filterTeacherId,
  filterResourceId,
  filterSessionType,
  filterConflictFocus,
  filterStartTime,
  filterEndTime,
  setSelectedTimetableId,
  setFilterDay,
  setFilterClassId,
  setFilterSubjectId,
  setFilterTeacherId,
  setFilterResourceId,
  setFilterSessionType,
  setFilterConflictFocus,
  setFilterStartTime,
  setFilterEndTime,
  clearFilters,
  onClose,
}: {
  timetables: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  selectedTimetableId: string | "";
  filterDay: string;
  filterClassId: string | "";
  filterSubjectId: string | "";
  filterTeacherId: string | "";
  filterResourceId: string | "";
  filterSessionType: string;
  filterConflictFocus: string;
  filterStartTime: string;
  filterEndTime: string;
  setSelectedTimetableId: (value: string | "") => void;
  setFilterDay: (value: string) => void;
  setFilterClassId: (value: string | "") => void;
  setFilterSubjectId: (value: string | "") => void;
  setFilterTeacherId: (value: string | "") => void;
  setFilterResourceId: (value: string | "") => void;
  setFilterSessionType: (value: string) => void;
  setFilterConflictFocus: (value: string) => void;
  setFilterStartTime: (value: string) => void;
  setFilterEndTime: (value: string) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Timetable Filters</h2>
            <p>Select only what you need. Search stays on the main screen.</p>
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
                setSelectedTimetableId(
                  event.target.value,
                )
              }
            >
              <option value="">All Timetables</option>
              {timetables.map((timetable: AnyRow) => (
                <option
                  key={String(idOf(timetable))}
                  value={String(idOf(timetable))}
                >
                  {timetable.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Day</span>
            <select
              value={filterDay}
              onChange={(event) => setFilterDay(event.target.value)}
            >
              <option value="all">All Days</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_LABELS[day]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Session Type</span>
            <select
              value={filterSessionType}
              onChange={(event) => setFilterSessionType(event.target.value)}
            >
              <option value="all">All Types</option>
              <option value="lesson">Lessons</option>
              <option value="exam">Exams</option>
              <option value="meeting">Meetings</option>
              <option value="break">Breaks</option>
              <option value="activity">Activities</option>
            </select>
          </label>

          <label>
            <span>Class</span>
            <select
              value={filterClassId}
              onChange={(event) =>
                setFilterClassId(
                  event.target.value,
                )
              }
            >
              <option value="">All Classes</option>
              {classes.map((row: AnyRow) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.className || "Unnamed class"}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Subject</span>
            <select
              value={filterSubjectId}
              onChange={(event) =>
                setFilterSubjectId(
                  event.target.value,
                )
              }
            >
              <option value="">All Subjects</option>
              {subjects.map((row: AnyRow) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.subjectName || "Unnamed subject"}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Teacher</span>
            <select
              value={filterTeacherId}
              onChange={(event) =>
                setFilterTeacherId(
                  event.target.value,
                )
              }
            >
              <option value="">All Teachers</option>
              {teachers.map((row: AnyRow) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {rowName(row)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Room / Resource</span>
            <select
              value={filterResourceId}
              onChange={(event) =>
                setFilterResourceId(
                  event.target.value,
                )
              }
            >
              <option value="">All Rooms/Resources</option>
              {resources.map((row: AnyRow) => (
                <option key={String(idOf(row))} value={String(idOf(row))}>
                  {row.name || row.roomName || "Unnamed resource"}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Conflict Focus</span>
            <select
              value={filterConflictFocus}
              onChange={(event) => setFilterConflictFocus(event.target.value)}
            >
              <option value="all">All Conflict Status</option>
              <option value="conflicts">Has Conflict</option>
              <option value="clear">No Conflict</option>
            </select>
          </label>

          <label>
            <span>From</span>
            <input
              type="time"
              value={filterStartTime}
              onChange={(event) => setFilterStartTime(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="time"
              value={filterEndTime}
              onChange={(event) => setFilterEndTime(event.target.value)}
            />
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
  timetableMode,
  setTimetableMode,
  selectedDay,
  setSelectedDay,
  summary,
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  timetableMode: TimetableMode;
  setTimetableMode: (value: TimetableMode) => void;
  selectedDay: string;
  setSelectedDay: (value: string) => void;
  summary: {
    timetables: number;
    sessions: number;
    groups: number;
    teachers: number;
    classes: number;
    resources: number;
    conflicts: number;
  };
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Views and timetable modes are here so the page stays compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button
            type="button"
            className={view === "timetable" ? "active" : ""}
            onClick={() => setView("timetable")}
          >
            <span>🗓️</span>
            <b>Timetable view</b>
            <small>Week, day, teacher, class and room schedules</small>
          </button>
          <button
            type="button"
            className={view === "cards" ? "active" : ""}
            onClick={() => setView("cards")}
          >
            <span>▦</span>
            <b>Cards</b>
            <small>{summary.groups} grouped routine card(s)</small>
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <span>☷</span>
            <b>Table</b>
            <small>Dense laptop-friendly session table</small>
          </button>
          <button
            type="button"
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Day, teacher, class and room load</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch timetable data</small>
          </button>
        </div>

        <div className="ba-sheet-subhead">
          <span>Timetable mode</span>
        </div>
        <div className="ba-mode-grid">
          {(["week", "day", "teacher", "class", "room"] as TimetableMode[]).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                className={timetableMode === mode ? "active" : ""}
                onClick={() => setTimetableMode(mode)}
              >
                {mode}
              </button>
            ),
          )}
        </div>

        <div className="ba-sheet-subhead">
          <span>Selected day</span>
        </div>
        <div className="ba-day-picker menu-picker">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              className={selectedDay === day ? "active" : ""}
              onClick={() => setSelectedDay(day)}
            >
              {SHORT_DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SessionCard({
  group,
  classes,
  subjects,
  teachers,
  resources,
  onEdit,
  onDelete,
}: {
  group: { key: string; primary: AnyRow; rows: AnyRow[]; days: string[] };
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onEdit: (session: AnyRow) => void;
  onDelete: (session: AnyRow) => void;
}) {
  const session = group.primary;
  const routine = isRoutineGroup(group);

  return (
    <article className="ba-card">
      <div className="ba-card-top">
        <div className="ba-avatar">{MODE_ICON}</div>
        <div className="ba-card-main">
          <h3>{sessionTitle(session)}</h3>
          <p>
            {dayListLabel(group.days)} · {sessionTime(session)}
          </p>
          <div className="ba-chip-row">
            <Chip tone="blue">{session.sessionType || "session"}</Chip>
            {routine ? <Chip tone="green">Grouped routine</Chip> : null}
            <Chip>{className(classes, sessionClassId(session))}</Chip>
            <Chip tone="purple">
              {teacherName(teachers, sessionTeacherId(session))}
            </Chip>
          </div>
        </div>
      </div>

      <div className="ba-mini-grid">
        <MiniStat label="Days" value={dayListLabel(group.days)} />
        <MiniStat
          label="Subject"
          value={subjectName(subjects, sessionSubjectId(session))}
        />
        <MiniStat label="Room" value={resourceName(resources, session)} />
      </div>

      {routine ? (
        <div className="ba-occurrence-strip">
          {group.days.map((day) => (
            <span key={day}>{SHORT_DAY_LABELS[day] || day}</span>
          ))}
        </div>
      ) : null}

      <div className="ba-row-actions">
        <button
          className="ba-btn"
          type="button"
          onClick={() => onEdit(session)}
        >
          Edit
        </button>
        <button
          className="ba-delete"
          type="button"
          onClick={() => onDelete(session)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function SessionBlock({
  session,
  classes,
  subjects,
  teachers,
  resources,
  compact = false,
}: {
  session: AnyRow;
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  compact?: boolean;
}) {
  return (
    <article className={`ba-session-block ${compact ? "compact" : ""}`}>
      <strong>
        {compact
          ? sessionTitle(session)
          : `${sessionTime(session)} · ${sessionTitle(session)}`}
      </strong>
      <span>
        {subjectName(subjects, sessionSubjectId(session))} ·{" "}
        {className(classes, sessionClassId(session))}
      </span>
      {!compact ? (
        <small>
          {teacherName(teachers, sessionTeacherId(session))} ·{" "}
          {resourceName(resources, session)}
        </small>
      ) : null}
    </article>
  );
}

function WeekTimetable({
  sessions,
  classes,
  subjects,
  teachers,
  resources,
}: {
  sessions: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  return (
    <section className="ba-week-grid">
      {DAYS.map((day) => {
        const daySessions = sortSessions(
          sessions.filter((session: AnyRow) => sessionDay(session) === day),
        );

        return (
          <article key={day} className="ba-week-day">
            <div className="ba-week-day-head">
              <strong>{SHORT_DAY_LABELS[day]}</strong>
              <span>{daySessions.length}</span>
            </div>

            <div className="ba-week-day-body">
              {daySessions.map((session: AnyRow, index: number) => (
                <SessionBlock
                  key={String(idOf(session) || index)}
                  session={session}
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  resources={resources}
                  compact
                />
              ))}

              {!daySessions.length ? <p>No sessions</p> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function DayTimetable({
  day,
  sessions,
  classes,
  subjects,
  teachers,
  resources,
}: {
  day: string;
  sessions: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  const daySessions = sortSessions(
    sessions.filter((session: AnyRow) => sessionDay(session) === day),
  );

  return (
    <section className="ba-day-view">
      {daySessions.map((session: AnyRow, index: number) => (
        <article
          key={String(idOf(session) || index)}
          className="ba-day-session"
        >
          <time>{sessionTime(session)}</time>
          <div>
            <h3>{sessionTitle(session)}</h3>
            <p>
              {subjectName(subjects, sessionSubjectId(session))} ·{" "}
              {className(classes, sessionClassId(session))} ·{" "}
              {teacherName(teachers, sessionTeacherId(session))}
            </p>
            <span>{resourceName(resources, session)}</span>
          </div>
        </article>
      ))}

      {!daySessions.length ? (
        <EmptyCard
          text={`No timetable sessions found for ${DAY_LABELS[day]}.`}
        />
      ) : null}
    </section>
  );
}

function GroupedTimetable({
  title,
  sessions,
  getGroupKey,
  getGroupLabel,
  classes,
  subjects,
  teachers,
  resources,
}: {
  title: string;
  sessions: AnyRow[];
  getGroupKey: (session: AnyRow) => string;
  getGroupLabel: (session: AnyRow) => string;
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: AnyRow[] }>();

    sessions.forEach((session: AnyRow) => {
      const key = getGroupKey(session);
      const label = getGroupLabel(session);
      const current = map.get(key) || { label, rows: [] };
      current.rows.push(session);
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [getGroupKey, getGroupLabel, sessions]);

  return (
    <section className="ba-grouped-view">
      {groups.map((group) => (
        <article className="ba-group-card" key={group.label}>
          <div className="ba-group-head">
            <div>
              <p>{title}</p>
              <h3>{group.label}</h3>
            </div>
            <Chip tone="blue">{group.rows.length} session(s)</Chip>
          </div>

          <div className="ba-group-days">
            {DAYS.map((day) => {
              const dayRows = sortSessions(
                group.rows.filter(
                  (session: AnyRow) => sessionDay(session) === day,
                ),
              );

              return (
                <section key={day} className="ba-group-day">
                  <strong>{SHORT_DAY_LABELS[day]}</strong>

                  <div>
                    {dayRows.map((session: AnyRow, index: number) => (
                      <SessionBlock
                        key={String(idOf(session) || index)}
                        session={session}
                        classes={classes}
                        subjects={subjects}
                        teachers={teachers}
                        resources={resources}
                      />
                    ))}

                    {!dayRows.length ? <p>—</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </article>
      ))}

      {!groups.length ? (
        <EmptyCard text="No grouped timetable records found." />
      ) : null}
    </section>
  );
}

function AnalyticsCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const cleanRows = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...cleanRows.map((row) => row.value), 1);

  return (
    <article className="ba-breakdown">
      <strong>{title}</strong>

      <div className="ba-analytics-list">
        {cleanRows.map((row) => {
          const width = Math.max(4, Math.round((row.value / max) * 100));

          return (
            <section key={row.label}>
              <div>
                <span>{row.label}</span>
                <b>{row.value}</b>
              </div>
              <div className="ba-bar">
                <i style={{ width: `${width}%` }} />
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
.ba-page{min-height:100dvh;width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(32px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ba-page *{box-sizing:border-box}
.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}
.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111));outline:none;font-weight:750}
.ba-state,.ba-card,.ba-panel,.ba-summary,.ba-toolbar,.ba-filter,.ba-empty,.ba-breakdown,.ba-timetable-panel{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(480px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ba-state h2{margin:0;font-size:22px;letter-spacing:-.04em;font-weight:1000}
.ba-state p{margin:0;color:var(--muted,#64748b);line-height:1.6}
.ba-hero{display:flex;align-items:stretch;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:radial-gradient(circle at 18% 8%,color-mix(in srgb,var(--ba-primary) 16%,transparent),transparent 20rem),linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff)) 72%);border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 18px 46px rgba(15,23,42,.07);overflow:hidden}
.ba-hero-left{min-width:0;display:flex;align-items:center;gap:10px;flex:1}
.ba-icon,.ba-avatar{display:grid;place-items:center;background:var(--ba-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--ba-primary) 28%,transparent)}
.ba-icon{width:48px;height:48px;flex:0 0 auto;border-radius:18px;font-size:22px}
.ba-avatar{width:56px;height:56px;border-radius:19px;font-size:22px;flex:0 0 auto}
.ba-title{min-width:0}
.ba-title p,.ba-title h2,.ba-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-title p{margin:0 0 2px;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-title h2{margin:0;color:var(--text,#111);font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em;line-height:1}
.ba-title span{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:750}
.ba-actions,.ba-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.ba-btn,.ba-primary,.ba-delete{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}
.ba-btn{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111)}
.ba-primary{border:0;background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}
.ba-delete{border:1px solid color-mix(in srgb,var(--muted,#64748b) 26%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111);box-shadow:none}
.ba-summary-grid,.ba-list,.ba-mini-grid,.ba-breakdown-grid{display:grid;gap:8px}
.ba-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.ba-summary{min-width:0;display:flex;align-items:center;gap:10px;padding:12px;border-radius:22px;overflow:hidden}
.ba-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.10),var(--card-bg,var(--surface,#fff)))}
.ba-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.10),var(--card-bg,var(--surface,#fff)))}
.ba-summary>div:first-child{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff))}
.ba-summary section{min-width:0}
.ba-summary strong,.ba-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-summary strong{font-size:18px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111)}
.ba-summary span{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:850}
.ba-toolbar,.ba-filter,.ba-panel,.ba-timetable-panel{margin-top:10px;padding:10px;border-radius:24px}
.ba-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ba-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:22px;background:var(--shell-section-bg,color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff)));border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-tabs button{min-width:0;min-height:38px;border:0;border-radius:999px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ba-tabs button.active{background:var(--ba-primary);color:#fff}
.ba-filter{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.ba-filter-advanced{align-items:end}
.ba-occurrence-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-occurrence-strip span{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 9px;border-radius:999px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08));color:var(--text,#111);font-size:11px;font-weight:1000}
.ba-section{margin-top:16px}
.ba-head,.ba-timetable-head,.ba-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.ba-head p,.ba-timetable-head p,.ba-group-head p{margin:0;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-head h3,.ba-timetable-head h3,.ba-group-head h3{margin:2px 0 0;color:var(--text,#111);font-size:19px;font-weight:1000;letter-spacing:-.04em}
.ba-list{margin-top:10px}
.ba-card,.ba-breakdown,.ba-empty{min-width:0;border-radius:24px;padding:13px;overflow:hidden}
.ba-card-top{display:flex;align-items:flex-start;gap:10px}
.ba-card-main{min-width:0;flex:1}
.ba-card-main h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000;letter-spacing:-.04em}
.ba-card-main p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.4}
.ba-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.ba-chip.green{background:rgba(34,197,94,.14);color:#16a34a}
.ba-chip.red{background:rgba(239,68,68,.14);color:#ef4444}
.ba-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}
.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}
.ba-chip.orange{background:rgba(245,158,11,.16);color:#d97706}
.ba-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}
.ba-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}
.ba-mini{min-width:0;padding:9px;border-radius:17px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}
.ba-mini strong,.ba-mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-mini strong{color:var(--text,#111);font-size:13px;font-weight:1000}
.ba-mini span{margin-top:2px;color:var(--muted,#64748b);font-size:10px;font-weight:850}
.ba-table-wrap{width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}
.ba-table th,.ba-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top;color:var(--text,#111);font-size:13px}
.ba-table th{color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,#fff))}
.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:190px;text-align:center;border-style:dashed}
.ba-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}
.ba-empty h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000}
.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ba-message{margin:10px 0;padding:12px;border-radius:18px;background:rgba(245,158,11,.14);color:#92400e;font-size:13px;font-weight:900}
.ba-bar{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}
.ba-bar div,.ba-bar i{display:block;height:100%;background:var(--ba-primary);border-radius:inherit}
.ba-mode-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-mode-tabs button{border:0;border-radius:999px;min-height:34px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}
.ba-mode-tabs button.active{background:var(--ba-primary);color:#fff}
.ba-week-grid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px;overflow-x:auto}
.ba-week-day{min-height:250px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);padding:8px}
.ba-week-day-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.ba-week-day-head strong{font-size:12px;text-transform:uppercase;color:var(--muted,#64748b)}
.ba-week-day-head span{display:grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);font-size:12px;font-weight:1000}
.ba-week-day-body{display:grid;gap:6px}
.ba-week-day-body p{margin:8px 0;text-align:center;color:var(--muted,#64748b);font-size:12px}
.ba-session-block{display:grid;gap:2px;padding:8px;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent);overflow:hidden}
.ba-session-block strong{font-size:12px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-session-block span,.ba-session-block small{font-size:11px;color:var(--muted,#64748b);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ba-session-block.compact{padding:6px}
.ba-session-block.compact strong{font-size:11px}
.ba-day-view{display:grid;gap:8px}
.ba-day-session{display:grid;grid-template-columns:110px 1fr;gap:10px;padding:12px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-day-session time{font-weight:1000;color:var(--ba-primary)}
.ba-day-session h3{margin:0;font-size:16px;font-weight:1000}
.ba-day-session p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:850}
.ba-day-session span{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:var(--text,#111)}
.ba-grouped-view{display:grid;gap:10px}
.ba-group-card{padding:12px;border-radius:22px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-group-days{display:grid;gap:8px}
.ba-group-day{display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:start;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ba-group-day>strong{font-size:12px;color:var(--muted,#64748b);text-transform:uppercase}
.ba-group-day>div{display:grid;gap:6px}
.ba-group-day p{margin:0;color:var(--muted,#64748b)}
.ba-analytics-list{display:grid;gap:10px;margin-top:12px}
.ba-analytics-list section{display:grid;gap:6px}
.ba-analytics-list section>div:first-child{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:900}
.ba-analytics-list p{margin:0;color:var(--muted,#64748b);font-size:12px}
.ba-drawer-layer{position:fixed;inset:0;z-index:80}
.ba-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}
.ba-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111);padding:14px;box-shadow:var(--shell-shadow,-24px 0 70px rgba(15,23,42,.22))}
.ba-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}
.ba-drawer-head p{margin:0;color:var(--ba-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.ba-drawer-head h2{margin:2px 0 0;color:var(--text,#111);font-size:22px;font-weight:1000;letter-spacing:-.05em}
.ba-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}
.ba-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}
.ba-form-card{margin-top:10px;padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}
.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
.ba-form-grid label{min-width:0;display:grid;gap:6px}
.ba-form-grid label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
.ba-form-grid .wide{grid-column:1/-1}
.ba-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.ba-day-picker{display:flex;flex-wrap:wrap;gap:6px;padding:6px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-day-picker button{min-height:36px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:950;padding:0 12px;cursor:pointer}
.ba-day-picker button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--ba-primary) 18%,transparent)}
.ba-help-text{display:block;margin-top:6px;color:var(--muted,#64748b);font-size:11px;font-weight:750;line-height:1.45}
@media(min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-filter{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-filter-advanced{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.ba-filter-advanced{grid-template-columns:minmax(220px,1.4fr) repeat(5,minmax(120px,1fr));}.ba-list,.ba-breakdown-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.ba-timetable-head{display:grid}.ba-mode-tabs{width:100%}.ba-mode-tabs button{flex:1}.ba-week-grid{grid-template-columns:repeat(7,160px)}.ba-day-session{grid-template-columns:1fr}.ba-group-head{display:grid}.ba-group-day{grid-template-columns:1fr}}
@media(max-width:520px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.ba-hero{flex-direction:column;border-radius:22px;padding:10px}.ba-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-btn,.ba-primary,.ba-delete{width:100%}.ba-summary-grid{gap:6px}.ba-summary{padding:10px;border-radius:19px}.ba-toolbar{align-items:stretch;flex-direction:column;border-radius:20px}.ba-tabs{width:100%}.ba-tabs button{flex:1;justify-content:center}.ba-card,.ba-empty,.ba-breakdown{border-radius:20px;padding:11px}.ba-avatar{width:52px;height:52px;flex-basis:52px}.ba-mini-grid{grid-template-columns:repeat(1,minmax(0,1fr))}.ba-drawer-actions{grid-template-columns:minmax(0,1fr)}.ba-drawer{width:min(96vw,720px);padding:12px}}


/* Golden compact shell overrides */
.ba-topbar,.ba-title-legacy{display:none}
.ba-search-card,.ba-sheet,.ba-menu-list button,.attendance-row{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}
.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}
.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}
.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.status-dot-mini{width:10px;height:10px;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 12%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:90;display:grid;align-items:end;background:rgba(15,23,42,.52);padding:10px}.ba-sheet{width:min(760px,100%);max-height:min(86dvh,760px);overflow:auto;margin:0 auto;border-radius:28px;padding:14px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111)}.ba-sheet.small{width:min(520px,100%)}
.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ba-sheet-head h2{margin:0;font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.45}.ba-sheet-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}
.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form.compact label{display:grid;gap:6px}.ba-form.compact label span,.ba-sheet-subhead span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
.ba-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.ba-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111);font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff}
.ba-menu-list{display:grid;gap:8px}
.ba-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer;box-shadow:none}
.ba-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}
.ba-menu-list button b,.ba-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ba-menu-list button b{font-size:13px;font-weight:1000;color:var(--text,#111827)}
.ba-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}
.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}
.ba-menu-list button.active span{background:var(--ba-primary);color:#fff}
.ba-menu-list button.active b{color:var(--text,#111827)}
.ba-menu-list button:focus-visible,.ba-mode-grid button:focus-visible,.ba-day-picker button:focus-visible{outline:none;border-color:color-mix(in srgb,var(--ba-primary) 58%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}
.ba-mode-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:8px}.ba-mode-grid button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:12px;font-weight:950;text-transform:capitalize;cursor:pointer}.ba-mode-grid button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--ba-primary) 18%,transparent)}.ba-sheet-subhead{margin-top:14px}
.ba-table th{background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,var(--surface,#fff)))!important;color:var(--muted,#64748b)!important}.ba-table td{color:var(--text,#111)!important;background:var(--card-bg,var(--surface,#fff))}
@media(min-width:680px){.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.ba-search-card{grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:6px;padding:7px;border-radius:20px}.ba-save-inline,.ba-add-inline,.ba-icon-button,.ba-filter-button{width:39px;height:39px}.ba-add-inline{font-size:22px}.ba-mode-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
