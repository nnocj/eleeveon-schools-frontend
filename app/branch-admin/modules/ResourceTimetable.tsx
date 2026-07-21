"use client";

/**
 * app/branch-admin/modules/ResourceTimetable.tsx
 * ---------------------------------------------------------
 * RESOURCE TIMETABLE - OFFLINE-FIRST + MODERN ELEEVEON UI
 * ---------------------------------------------------------
 * Purpose:
 * - Create, edit, duplicate, move, delete, filter, and manage resource/room timetable sessions.
 * - Supports repeated sessions across multiple days while grouping repeated records into one professional card and one table row.
 * - Helps branch admins see room/resource usage, conflicts, teacher allocation, class allocation, and weekly availability.
 *
 * Tables used:
 * - scheduleTimetables
 * - scheduleSessions
 * - scheduleResources
 * - scheduleConflicts
 * - classes
 * - subjects
 * - teachers
 *
 * Scope:
 * - Branch Admin / branch-scoped resource scheduling.
 * - Every writable schedule record is tied to accountId, schoolId, and branchId.
 *
 * Sync behavior:
 * - Creates use createLocal(...), which wraps prepareSyncData(...).
 * - Updates use updateLocal(...), which preserves cloudId/version/deviceId.
 * - Delete uses softDeleteLocal(...), which applies prepareSoftDelete(...).
 * - Manual sync fields are intentionally avoided in this file.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this timetable page from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all timetable reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Design standard:
 * - Upgraded to the Students.tsx Golden Standard.
 * - No large hero/filter wall in the default view.
 * - Compact search + inline add + slider filter + More menu.
 * - Filters live inside a bottom sheet.
 * - Timetable, cards, table, and analytics live under the More sheet.
 * - Table headers use golden theme variables for dark mode.
 * - More sheet selected states use primary color with safe text contrast.
 * - Display helpers guard against bad text/CSS fragments leaking into session time.
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
type TimetableMode = "week" | "day" | "resource" | "teacher" | "class";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type EditorMode = "create" | "edit" | "duplicate" | "move";

const MODE_LABEL = "Resource Timetable";
const MODE_ICON = "🚪";

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

const emptyForm = {
  id: "",
  sourceId: "",
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

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow) {
  return row?.id;
}

function cleanId(value: unknown): string {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  return normalized && normalized !== "0" ? normalized : "";
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

function firstLocalId(...values: unknown[]) {
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
  return schoolIdOf(row) === schoolId && branchIdOf(row) === branchId;
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

function minuteFromAny(value: any, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1439, Math.round(value)));
  }

  const raw = String(value ?? "").trim();
  const match = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);

  const parsed = Number(raw);
  if (Number.isFinite(parsed))
    return Math.max(0, Math.min(1439, Math.round(parsed)));

  return fallback;
}

function startMinute(row: AnyRow) {
  return minuteFromAny(
    row?.startMinute ?? row?.start ?? row?.startTimeMinute,
    0,
  );
}

function endMinute(row: AnyRow) {
  const start = startMinute(row);
  const end = minuteFromAny(
    row?.endMinute ?? row?.end ?? row?.endTimeMinute,
    start + 60,
  );
  return end > start ? end : start + 60;
}

function sessionTime(row: AnyRow) {
  return formatMinuteRange(startMinute(row), endMinute(row));
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
      String(idOf(item) ?? "") === String(session.resourceId ?? ""),
  );
  return (
    row?.name || row?.roomName || session.roomName || session.room || "No room"
  );
}

function resourceOptionName(row: AnyRow) {
  return (
    row?.name || row?.roomName || row?.title || row?.label || "Unnamed resource"
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

function sessionGroupKey(row: AnyRow) {
  return [
    idOf(row.timetableId),
    sessionTitle(row).toLowerCase(),
    String(row.sessionType || "session"),
    startMinute(row),
    endMinute(row),
    sessionResourceId(row) || text(row.roomName || row.room, "").toLowerCase(),
    sessionTeacherId(row),
    sessionClassId(row),
    sessionSubjectId(row),
  ].join("|");
}

function sortSessions(rows: AnyRow[]) {
  return [...rows].sort(
    (a, b) =>
      dayIndex(sessionDay(a)) - dayIndex(sessionDay(b)) ||
      startMinute(a) - startMinute(b) ||
      sessionTitle(a).localeCompare(sessionTitle(b)),
  );
}

function groupSessions(rows: AnyRow[]) {
  const map = new Map<
    string,
    AnyRow & {
      groupedIds: string[];
      groupedDays: string[];
      groupedRows: AnyRow[];
    }
  >();

  for (const row of rows) {
    const key = sessionGroupKey(row);
    const current = map.get(key);
    const rowId = cleanId(row.id);
    const day = sessionDay(row);

    if (!current) {
      map.set(key, {
        ...row,
        groupedIds: rowId ? [rowId] : [],
        groupedDays: [day],
        groupedRows: [row],
      });
      continue;
    }

    if (rowId && !current.groupedIds.includes(rowId))
      current.groupedIds.push(rowId);
    if (!current.groupedDays.includes(day)) current.groupedDays.push(day);
    current.groupedRows.push(row);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    groupedDays: row.groupedDays.sort(
      (a: string, b: string) => dayIndex(a) - dayIndex(b),
    ),
    groupedRows: sortSessions(row.groupedRows),
  }));
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
  const [first, second] = [cleanId(aId), cleanId(bId)].sort();
  return `${type}-${first}-${second}`;
}

function toneForConflict(severity?: string): Tone {
  const value = String(severity || "").toLowerCase();
  if (["critical", "high", "urgent"].includes(value)) return "red";
  if (["medium", "warning"].includes(value)) return "orange";
  return "blue";
}

function dayList(row: AnyRow) {
  const days =
    Array.isArray(row.groupedDays) && row.groupedDays.length
      ? row.groupedDays
      : [sessionDay(row)];
  return days.map((day: string) => SHORT_DAY_LABELS[day] || day).join(" · ");
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
    { key: "resource", label: "Resource" },
    { key: "teacher", label: "Teacher" },
    { key: "class", label: "Class" },
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

export default function ResourceTimetable() {
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
  const [timetableMode, setTimetableMode] = useState<TimetableMode>("resource");
  const [selectedDay, setSelectedDay] = useState("monday");
  const [timetables, setTimetables] = useState<AnyRow[]>([]);
  const [sessions, setSessions] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [subjects, setSubjects] = useState<AnyRow[]>([]);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [conflicts, setConflicts] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTimetableId, setSelectedTimetableId] = useState<string>("");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState("all");
  const [conflictFilter, setConflictFilter] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

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
        .filter((row: AnyRow) =>
          [
            "room",
            "resource",
            "branch",
            "weekly",
            "general",
            "teacher",
            "class",
          ].includes(
            String(row.timetableType || row.scopeType || "room").toLowerCase(),
          ),
        );

      setTimetables(scopedTimetables);
      setSessions(
        (sessionRows as AnyRow[])
          .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
          .filter((row) => row?.isDeleted !== true),
      );
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
            (schoolIdOf(row) === schoolId ||
              !schoolIdOf(row) ||
              branchIdOf(row) === branchId),
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
      setConflicts(
        (conflictRows as AnyRow[])
          .filter((row) => isBranchRow(row, accountId, schoolId, branchId))
          .filter((row) => row?.isDeleted !== true)
          .filter(
            (row) => String(row.status || "open").toLowerCase() === "open",
          ),
      );

      if (!selectedTimetableId && scopedTimetables[0]?.id)
        setSelectedTimetableId(String(scopedTimetables[0].id));
    } catch (error) {
      console.error("Failed to load resource timetable:", error);
      setMessage("Failed to load resource timetable.");
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
      repeatDays: [selectedDay],
    });
    setDrawer(true);
  }

  function openEdit(session: AnyRow) {
    const groupDays =
      Array.isArray(session.groupedDays) && session.groupedDays.length
        ? session.groupedDays
        : [sessionDay(session)];
    setEditorMode("edit");
    setMessage("");
    setForm({
      id: cleanId(session.id),
      sourceId: cleanId(session.id),
      timetableName: "",
      timetableId: session.timetableId ? String(session.timetableId) : "",
      dayOfWeek: groupDays[0] || sessionDay(session),
      repeatDays: groupDays,
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

  function openDuplicate(session: AnyRow) {
    openEdit(session);
    setEditorMode("duplicate");
    setForm((current) => ({
      ...current,
      id: "",
      sourceId: cleanId(session.id),
      title: current.title ? `${current.title} Copy` : "",
    }));
  }

  function openMove(session: AnyRow) {
    openEdit(session);
    setEditorMode("move");
  }

  const conflictSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of conflicts) {
      const a = cleanId(conflict.sessionIdA);
      const b = cleanId(conflict.sessionIdB);
      if (a) ids.add(a);
      if (b) ids.add(b);
    }
    return ids;
  }, [conflicts]);

  const visibleSessions = useMemo(() => {
    const q = query.toLowerCase().trim();
    return sortSessions(
      sessions
        .filter(
          (session) =>
            !selectedTimetableId ||
            String(session.timetableId) === String(selectedTimetableId),
        )
        .filter(
          (session) =>
            resourceFilter === "all" ||
            sessionResourceId(session) === cleanId(resourceFilter) ||
            String(session.roomName || "") === resourceFilter,
        )
        .filter(
          (session) =>
            teacherFilter === "all" ||
            sessionTeacherId(session) === cleanId(teacherFilter),
        )
        .filter(
          (session) =>
            classFilter === "all" ||
            sessionClassId(session) === cleanId(classFilter),
        )
        .filter(
          (session) =>
            subjectFilter === "all" ||
            sessionSubjectId(session) === cleanId(subjectFilter),
        )
        .filter(
          (session) => dayFilter === "all" || sessionDay(session) === dayFilter,
        )
        .filter(
          (session) =>
            sessionTypeFilter === "all" ||
            String(session.sessionType || "lesson") === sessionTypeFilter,
        )
        .filter((session) => {
          const id = cleanId(session.id);
          if (conflictFilter === "with_conflicts")
            return conflictSessionIds.has(id);
          if (conflictFilter === "no_conflicts")
            return !conflictSessionIds.has(id);
          return true;
        })
        .filter((session) => {
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
    classFilter,
    classes,
    conflictFilter,
    conflictSessionIds,
    dayFilter,
    query,
    resourceFilter,
    resources,
    selectedTimetableId,
    sessionTypeFilter,
    sessions,
    subjectFilter,
    subjects,
    teacherFilter,
    teachers,
  ]);

  const groupedVisibleSessions = useMemo(
    () => sortSessions(groupSessions(visibleSessions)),
    [visibleSessions],
  );

  const filtersActive =
    !!query.trim() ||
    !!selectedTimetableId ||
    resourceFilter !== "all" ||
    teacherFilter !== "all" ||
    classFilter !== "all" ||
    subjectFilter !== "all" ||
    dayFilter !== "all" ||
    sessionTypeFilter !== "all" ||
    conflictFilter !== "all";

  const activeFilterCount = [
    selectedTimetableId ? "timetable" : "",
    resourceFilter !== "all" ? resourceFilter : "",
    teacherFilter !== "all" ? teacherFilter : "",
    classFilter !== "all" ? classFilter : "",
    subjectFilter !== "all" ? subjectFilter : "",
    dayFilter !== "all" ? dayFilter : "",
    sessionTypeFilter !== "all" ? sessionTypeFilter : "",
    conflictFilter !== "all" ? conflictFilter : "",
  ].filter(Boolean).length;

  function clearFilters() {
    setQuery("");
    setSelectedTimetableId("");
    setResourceFilter("all");
    setTeacherFilter("all");
    setClassFilter("all");
    setSubjectFilter("all");
    setDayFilter("all");
    setSessionTypeFilter("all");
    setConflictFilter("all");
  }

  const summary = useMemo(() => {
    const minutes = visibleSessions.reduce(
      (sum, session) =>
        sum + Math.max(0, endMinute(session) - startMinute(session)),
      0,
    );
    return {
      timetables: timetables.length,
      sessions: visibleSessions.length,
      grouped: groupedVisibleSessions.length,
      hours: Math.round((minutes / 60) * 10) / 10,
      resources: new Set(
        visibleSessions
          .map(
            (session) => sessionResourceId(session) || text(session.roomName),
          )
          .filter(Boolean),
      ).size,
      conflicts: conflicts.length,
    };
  }, [
    conflicts.length,
    groupedVisibleSessions.length,
    timetables.length,
    visibleSessions,
  ]);

  const selectedTimetable = timetables.find(
    (timetable) => String(timetable.id) === String(selectedTimetableId),
  );

  async function saveDetectedConflicts({
    savedSession,
    editingId,
  }: {
    savedSession: AnyRow;
    editingId: string;
  }) {
    const newConflicts: Partial<ScheduleConflict>[] = [];
    const related = sessions.filter((session) => {
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
      conflicts.map((conflict) =>
        conflictKey(
          String(conflict.conflictType || "custom"),
          cleanId(conflict.sessionIdA),
          cleanId(conflict.sessionIdB),
        ),
      ),
    );

    for (const session of related) {
      const otherId = cleanId(session.id);
      const resourceId = sessionResourceId(savedSession);
      const teacherId = sessionTeacherId(savedSession);
      const classId = sessionClassId(savedSession);
      const roomA = text(savedSession.roomName || savedSession.room, "");
      const roomB = text(session.roomName || session.room, "");

      const possible = [
        {
          active: resourceId && resourceId === sessionResourceId(session),
          type: "resource_double_booked",
          title: "Resource double-booked",
          description: `${resourceName(resources, savedSession)} is assigned to overlapping sessions on ${DAY_LABELS[sessionDay(savedSession)]}.`,
          severity: "high",
          resourceId,
        },
        {
          active:
            !resourceId && roomA && roomA.toLowerCase() === roomB.toLowerCase(),
          type: "room_double_booked",
          title: "Room double-booked",
          description: `${roomA} is assigned to overlapping sessions on ${DAY_LABELS[sessionDay(savedSession)]}.`,
          severity: "high",
        },
        {
          active: teacherId && teacherId === sessionTeacherId(session),
          type: "teacher_double_booked",
          title: "Teacher double-booked",
          description: `${teacherName(teachers, teacherId)} has overlapping timetable sessions.`,
          severity: "medium",
          teacherId: teacherId,
        },
        {
          active: classId && classId === sessionClassId(session),
          type: "class_double_booked",
          title: "Class double-booked",
          description: `${className(classes, classId)} has overlapping timetable sessions.`,
          severity: "medium",
          classId,
        },
      ];

      for (const item of possible) {
        if (!item.active) continue;
        const key = conflictKey(item.type, editingId, otherId);
        if (existingConflictKeys.has(key)) continue;
        existingConflictKeys.add(key);

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

    for (const conflict of newConflicts.slice(0, 20))
      await createLocal("scheduleConflicts", conflict as ScheduleConflict);
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

    if (!form.resourceId && !form.roomName.trim()) {
      setMessage("Choose a resource or enter a room name.");
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
          name: form.timetableName.trim() || MODE_LABEL,
          timetableType: "room",
          scopeType: "resource",
          scopeId: cleanId(form.resourceId) || branchId,
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
        setMessage("Could not create or select a timetable.");
        return;
      }

      const editingId = cleanId(form.id);
      const selectedDays = Array.from(
        new Set(
          (form.repeatDays?.length ? form.repeatDays : [form.dayOfWeek]).map(
            normalizeDay,
          ),
        ),
      );
      const existingEditingSession = editingId
        ? sessions.find((session) => cleanId(session.id) === editingId)
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
          `${subjects.find(
            (subject) =>
              String(idOf(subject) ?? "") === String(form.subjectId ?? ""),
          )?.name || "Session"}`,
        classId: cleanId(form.classId) || undefined,
        subjectId: cleanId(form.subjectId) || undefined,
        teacherId: cleanId(form.teacherId) || undefined,
        resourceId: cleanId(form.resourceId) || undefined,
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

        if (
          editingId &&
          editorMode !== "duplicate" &&
          day === originalEditingDay
        ) {
          const savedSession = (await updateLocal(
            "scheduleSessions",
            editingId,
            sessionPayload as Partial<ScheduleSession>,
          )) as ScheduleSession | undefined;
          if (savedSession) savedSessions.push(savedSession);
          continue;
        }

        const matchingExistingSession =
          editorMode === "edit" || editorMode === "move"
            ? sessions.find((session) => {
                const sessionId = cleanId(session.id);
                if (!sessionId || sessionId === editingId) return false;
                if (String(session.timetableId || "") !== String(timetableId))
                  return false;
                if (sessionDay(session) !== day) return false;
                if (
                  startMinute(session) !== start ||
                  endMinute(session) !== end
                )
                  return false;
                if (
                  sessionTitle(session).toLowerCase() !==
                  String(baseSessionPayload.title || "").toLowerCase()
                )
                  return false;
                if (
                  sessionResourceId(session) !==
                  cleanId(baseSessionPayload.resourceId)
                )
                  return false;
                if (
                  sessionTeacherId(session) !==
                  cleanId(baseSessionPayload.teacherId)
                )
                  return false;
                if (
                  sessionClassId(session) !==
                  cleanId(baseSessionPayload.classId)
                )
                  return false;
                if (
                  sessionSubjectId(session) !==
                  cleanId(baseSessionPayload.subjectId)
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
        if (savedId)
          await saveDetectedConflicts({
            savedSession: savedSession as AnyRow,
            editingId: savedId,
          });
      }

      setDrawer(false);
      setForm(emptyForm);
      await load();
    } catch (error: any) {
      console.error("Failed to save resource session:", error);
      setMessage(error?.message || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSession(session: AnyRow) {
    const ids =
      Array.isArray(session.groupedIds) && session.groupedIds.length
        ? session.groupedIds
        : [cleanId(session.id)].filter(Boolean);
    if (!ids.length) return;
    const ok = window.confirm(
      `Delete "${sessionTitle(session)}"? This will soft-delete the selected session record(s) and sync safely.`,
    );
    if (!ok) return;

    try {
      for (const id of ids)
        await softDeleteLocal("scheduleSessions", String(id));
      await load();
    } catch (error: any) {
      console.error("Failed to delete resource session:", error);
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
        resolutionNote: "Marked resolved from resource timetable.",
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
          <h2>Opening resource timetable...</h2>
          <p>Loading resources, sessions, classes, teachers and conflicts.</p>
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
        aria-label="Resource timetable search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources, rooms, teachers..."
            aria-label="Search resource timetable"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openCreate}
          aria-label="Add resource session"
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
          {selectedTimetableId ? (
            <button type="button" onClick={() => setSelectedTimetableId("")}>
              Timetable ×
            </button>
          ) : null}
          {resourceFilter !== "all" ? (
            <button type="button" onClick={() => setResourceFilter("all")}>
              Resource ×
            </button>
          ) : null}
          {teacherFilter !== "all" ? (
            <button type="button" onClick={() => setTeacherFilter("all")}>
              Teacher ×
            </button>
          ) : null}
          {classFilter !== "all" ? (
            <button type="button" onClick={() => setClassFilter("all")}>
              Class ×
            </button>
          ) : null}
          {subjectFilter !== "all" ? (
            <button type="button" onClick={() => setSubjectFilter("all")}>
              Subject ×
            </button>
          ) : null}
          {dayFilter !== "all" ? (
            <button type="button" onClick={() => setDayFilter("all")}>
              Day ×
            </button>
          ) : null}
          {sessionTypeFilter !== "all" ? (
            <button type="button" onClick={() => setSessionTypeFilter("all")}>
              Type ×
            </button>
          ) : null}
          {conflictFilter !== "all" ? (
            <button type="button" onClick={() => setConflictFilter("all")}>
              Conflict ×
            </button>
          ) : null}
          <button type="button" onClick={clearFilters}>
            Clear all
          </button>
        </section>
      ) : null}

      {conflicts.length > 0 ? (
        <section className="ba-section">
          <div className="ba-head">
            <div>
              <p>Conflict Center</p>
              <h3>Needs attention</h3>
            </div>
            <Chip tone="orange">{conflicts.length} open</Chip>
          </div>
          <div className="ba-list">
            {conflicts.slice(0, 4).map((conflict, index) => (
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
                    : timetableMode === "resource"
                      ? "Resource Timetables"
                      : timetableMode === "teacher"
                        ? "Teacher Timetables"
                        : "Class Timetables"}
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
          {timetableMode === "resource" ? (
            <GroupedTimetable
              title="Resource"
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
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="ba-section ba-breakdown-grid">
          <AnalyticsCard
            title="Sessions by Day"
            rows={DAYS.map((day) => ({
              label: DAY_LABELS[day],
              value: visibleSessions.filter(
                (session) => sessionDay(session) === day,
              ).length,
            }))}
          />
          <AnalyticsCard
            title="Resource Usage"
            rows={countRows(visibleSessions, (session) =>
              resourceName(resources, session),
            )}
          />
          <AnalyticsCard
            title="Teacher Use"
            rows={countRows(visibleSessions, (session) =>
              teacherName(teachers, sessionTeacherId(session)),
            )}
          />
          <AnalyticsCard
            title="Class Use"
            rows={countRows(visibleSessions, (session) =>
              className(classes, sessionClassId(session)),
            )}
          />
        </section>
      ) : null}

      {view === "table" ? (
        <section className="ba-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Resource</th>
                  <th>Days</th>
                  <th>Time</th>
                  <th>Teacher</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Conflict</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {groupedVisibleSessions.map((session, index) => {
                  const ids =
                    Array.isArray(session.groupedIds) &&
                    session.groupedIds.length
                      ? session.groupedIds
                      : [cleanId(session.id)].filter(Boolean);
                  const hasConflict = ids.some((id: string) =>
                    conflictSessionIds.has(String(id)),
                  );
                  return (
                    <tr key={String(sessionGroupKey(session) || index)}>
                      <td>
                        <strong>{sessionTitle(session)}</strong>
                        <br />
                        <span>{session.sessionType || "session"}</span>
                      </td>
                      <td>{resourceName(resources, session)}</td>
                      <td>{dayList(session)}</td>
                      <td>{sessionTime(session)}</td>
                      <td>
                        {teacherName(teachers, sessionTeacherId(session))}
                      </td>
                      <td>{className(classes, sessionClassId(session))}</td>
                      <td>
                        {subjectName(subjects, sessionSubjectId(session))}
                      </td>
                      <td>
                        {hasConflict ? (
                          <Chip tone="orange">Conflict</Chip>
                        ) : (
                          <Chip tone="green">Clear</Chip>
                        )}
                      </td>
                      <td>
                        <div className="ba-table-actions">
                          <button
                            className="ba-btn"
                            type="button"
                            onClick={() => openEdit(session)}
                          >
                            Edit
                          </button>
                          <button
                            className="ba-btn"
                            type="button"
                            onClick={() => openDuplicate(session)}
                          >
                            Duplicate
                          </button>
                          <button
                            className="ba-btn"
                            type="button"
                            onClick={() => openMove(session)}
                          >
                            Move
                          </button>
                          <button
                            className="ba-delete ba-soft-delete"
                            type="button"
                            onClick={() => deleteSession(session)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!groupedVisibleSessions.length ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyCard text="No grouped resource sessions found." />
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
              <h3>Grouped resource sessions</h3>
            </div>
            <Chip>{groupedVisibleSessions.length} card(s)</Chip>
          </div>
          <div className="ba-list">
            {groupedVisibleSessions.map((session, index) => (
              <SessionCard
                key={String(sessionGroupKey(session) || index)}
                session={session}
                classes={classes}
                subjects={subjects}
                teachers={teachers}
                resources={resources}
                onEdit={openEdit}
                onDuplicate={openDuplicate}
                onMove={openMove}
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
          resources={resources}
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          selectedTimetableId={selectedTimetableId}
          setSelectedTimetableId={setSelectedTimetableId}
          resourceFilter={resourceFilter}
          setResourceFilter={setResourceFilter}
          teacherFilter={teacherFilter}
          setTeacherFilter={setTeacherFilter}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          subjectFilter={subjectFilter}
          setSubjectFilter={setSubjectFilter}
          dayFilter={dayFilter}
          setDayFilter={setDayFilter}
          sessionTypeFilter={sessionTypeFilter}
          setSessionTypeFilter={setSessionTypeFilter}
          conflictFilter={conflictFilter}
          setConflictFilter={setConflictFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(nextView) => {
            setView(nextView);
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
        <ResourceEditor
          mode={editorMode}
          saving={saving}
          message={message}
          activeBranchName={activeBranch?.name || "Assigned branch"}
          form={form}
          setForm={setForm}
          timetables={timetables}
          selectedTimetableId={selectedTimetableId}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          resources={resources}
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

function FilterSheet({
  timetables,
  resources,
  teachers,
  classes,
  subjects,
  selectedTimetableId,
  setSelectedTimetableId,
  resourceFilter,
  setResourceFilter,
  teacherFilter,
  setTeacherFilter,
  classFilter,
  setClassFilter,
  subjectFilter,
  setSubjectFilter,
  dayFilter,
  setDayFilter,
  sessionTypeFilter,
  setSessionTypeFilter,
  conflictFilter,
  setConflictFilter,
  clearFilters,
  onClose,
}: {
  timetables: AnyRow[];
  resources: AnyRow[];
  teachers: AnyRow[];
  classes: AnyRow[];
  subjects: AnyRow[];
  selectedTimetableId: string | "";
  setSelectedTimetableId: (value: string) => void;
  resourceFilter: string;
  setResourceFilter: (value: string) => void;
  teacherFilter: string;
  setTeacherFilter: (value: string) => void;
  classFilter: string;
  setClassFilter: (value: string) => void;
  subjectFilter: string;
  setSubjectFilter: (value: string) => void;
  dayFilter: string;
  setDayFilter: (value: string) => void;
  sessionTypeFilter: string;
  setSessionTypeFilter: (value: string) => void;
  conflictFilter: string;
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
            <p>Keep the page clean. Choose only what you need.</p>
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
              <option value="">All timetables</option>
              {timetables.map((timetable) => (
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
            <span>Resource / Room</span>
            <select
              value={resourceFilter}
              onChange={(event) => setResourceFilter(event.target.value)}
            >
              <option value="all">All resources</option>
              {resources.map((resource) => (
                <option
                  key={String(idOf(resource))}
                  value={String(idOf(resource))}
                >
                  {resourceOptionName(resource)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Teacher</span>
            <select
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
            >
              <option value="all">All teachers</option>
              {teachers.map((teacher) => (
                <option
                  key={String(idOf(teacher))}
                  value={String(idOf(teacher))}
                >
                  {rowName(teacher)}
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
            <span>Session Type</span>
            <select
              value={sessionTypeFilter}
              onChange={(event) => setSessionTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="lesson">Lesson</option>
              <option value="exam">Exam</option>
              <option value="meeting">Meeting</option>
              <option value="break">Break</option>
              <option value="activity">Activity</option>
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
  const items: { key: ViewMode; icon: string; title: string; text: string }[] =
    [
      {
        key: "timetable",
        icon: "🗓️",
        title: "Timetable",
        text: "Weekly, day, resource, teacher and class views",
      },
      {
        key: "cards",
        icon: "☰",
        title: "List cards",
        text: "Grouped resource sessions",
      },
      {
        key: "table",
        icon: "☷",
        title: "Table view",
        text: "Dense laptop-friendly schedule table",
      },
      {
        key: "analytics",
        icon: "◔",
        title: "Analytics",
        text: "Usage by day, resource, teacher and class",
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
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? "active" : ""}
              onClick={() => setView(item.key)}
            >
              <span>{item.icon}</span>
              <b>{item.title}</b>
              <small>{item.text}</small>
            </button>
          ))}

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local resource timetable records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function countRows(rows: AnyRow[], keyFn: (row: AnyRow) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function SessionCard({
  session,
  classes,
  subjects,
  teachers,
  resources,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
}: {
  session: AnyRow;
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onEdit: (session: AnyRow) => void;
  onDuplicate: (session: AnyRow) => void;
  onMove: (session: AnyRow) => void;
  onDelete: (session: AnyRow) => void;
}) {
  return (
    <article className="ba-card">
      <div className="ba-card-top">
        <div className="ba-avatar">{MODE_ICON}</div>
        <div className="ba-card-main">
          <h3>{sessionTitle(session)}</h3>
          <p>
            {dayList(session)} · {sessionTime(session)}
          </p>
          <div className="ba-chip-row">
            <Chip tone="blue">{session.sessionType || "session"}</Chip>
            <Chip tone="orange">{resourceName(resources, session)}</Chip>
            <Chip>{className(classes, sessionClassId(session))}</Chip>
          </div>
        </div>
      </div>
      <div className="ba-mini-grid">
        <MiniStat
          label="Subject"
          value={subjectName(subjects, sessionSubjectId(session))}
        />
        <MiniStat
          label="Teacher"
          value={teacherName(teachers, sessionTeacherId(session))}
        />
        <MiniStat label="Days" value={dayList(session)} />
      </div>
      <div className="ba-card-actions">
        <button
          className="ba-btn"
          type="button"
          onClick={() => onEdit(session)}
        >
          Edit
        </button>
        <button
          className="ba-btn"
          type="button"
          onClick={() => onDuplicate(session)}
        >
          Duplicate
        </button>
        <button
          className="ba-btn"
          type="button"
          onClick={() => onMove(session)}
        >
          Move
        </button>
        <button
          className="ba-delete ba-soft-delete"
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
        {resourceName(resources, session)} ·{" "}
        {subjectName(subjects, sessionSubjectId(session))}
      </span>
      {!compact ? (
        <small>
          {teacherName(teachers, sessionTeacherId(session))} ·{" "}
          {className(classes, sessionClassId(session))}
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
          sessions.filter((session) => sessionDay(session) === day),
        );
        return (
          <article key={day} className="ba-week-day">
            <div className="ba-week-day-head">
              <strong>{SHORT_DAY_LABELS[day]}</strong>
              <span>{daySessions.length}</span>
            </div>
            <div className="ba-week-day-body">
              {daySessions.map((session, index) => (
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
    sessions.filter((session) => sessionDay(session) === day),
  );
  return (
    <section className="ba-day-view">
      {daySessions.map((session, index) => (
        <article
          key={String(idOf(session) || index)}
          className="ba-day-session"
        >
          <time>{sessionTime(session)}</time>
          <div>
            <h3>{sessionTitle(session)}</h3>
            <p>
              {resourceName(resources, session)} ·{" "}
              {subjectName(subjects, sessionSubjectId(session))} ·{" "}
              {teacherName(teachers, sessionTeacherId(session))}
            </p>
            <span>{className(classes, sessionClassId(session))}</span>
          </div>
        </article>
      ))}
      {!daySessions.length ? (
        <EmptyCard
          text={`No resource sessions found for ${DAY_LABELS[day]}.`}
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
    sessions.forEach((session) => {
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
                group.rows.filter((session) => sessionDay(session) === day),
              );
              return (
                <section key={day} className="ba-group-day">
                  <strong>{SHORT_DAY_LABELS[day]}</strong>
                  <div>
                    {dayRows.map((session, index) => (
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

function ResourceEditor({
  mode,
  saving,
  message,
  activeBranchName,
  form,
  setForm,
  timetables,
  selectedTimetableId,
  classes,
  subjects,
  teachers,
  resources,
  onClose,
  onSave,
}: {
  mode: EditorMode;
  saving: boolean;
  message: string;
  activeBranchName: string;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  timetables: AnyRow[];
  selectedTimetableId: string | "";
  classes: AnyRow[];
  subjects: AnyRow[];
  teachers: AnyRow[];
  resources: AnyRow[];
  onClose: () => void;
  onSave: () => void;
}) {
  const title =
    mode === "edit"
      ? "Edit Session"
      : mode === "duplicate"
        ? "Duplicate Session"
        : mode === "move"
          ? "Move Session"
          : "New Session";
  function toggleDay(day: string) {
    setForm((current) => {
      const currentDays = current.repeatDays?.length
        ? current.repeatDays
        : [current.dayOfWeek];
      const next = currentDays.includes(day)
        ? currentDays.filter((item) => item !== day)
        : [...currentDays, day];
      const safeDays = next.length ? next : [day];
      return { ...current, dayOfWeek: safeDays[0], repeatDays: safeDays };
    });
  }

  return (
    <div className="ba-drawer-layer">
      <button className="ba-drawer-overlay" type="button" onClick={onClose} />
      <aside className="ba-drawer">
        <div className="ba-drawer-head">
          <div>
            <p>{title}</p>
            <h2>{MODE_LABEL}</h2>
            <span>{activeBranchName}</span>
          </div>
          <button type="button" onClick={onClose}>
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
                {timetables.map((timetable) => (
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
            <div className="wide">
              <span className="ba-label">Repeat Days</span>
              <div className="ba-day-picker">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={form.repeatDays.includes(day) ? "active" : ""}
                    onClick={() => toggleDay(day)}
                  >
                    {SHORT_DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>
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
              <span>Resource</span>
              <select
                value={form.resourceId}
                onChange={(event) =>
                  setForm({ ...form, resourceId: event.target.value })
                }
              >
                <option value="">No resource</option>
                {resources.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {resourceOptionName(row)}
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
                <option value="">No subject</option>
                {subjects.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {row.name || row.subjectName}
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
                {teachers.map((row) => (
                  <option key={String(idOf(row))} value={String(idOf(row))}>
                    {rowName(row)}
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
          <button className="ba-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ba-primary"
            type="button"
            disabled={saving}
            onClick={onSave}
          >
            {saving
              ? "Saving..."
              : mode === "edit"
                ? "Save Changes"
                : mode === "move"
                  ? "Move Session"
                  : mode === "duplicate"
                    ? "Duplicate Session"
                    : "Save Session"}
          </button>
        </div>
      </aside>
    </div>
  );
}

const css = `
.ba-page{min-height:100dvh;width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(32px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 10%,transparent),transparent 34rem),var(--bg,#f7f8fb);color:var(--text,#111);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111));outline:none;font-weight:750}.ba-state,.ba-card,.ba-panel,.ba-summary,.ba-toolbar,.ba-filter,.ba-empty,.ba-breakdown,.ba-timetable-panel{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(480px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-state h2{margin:0;font-size:22px;letter-spacing:-.04em;font-weight:1000}.ba-state p{margin:0;color:var(--muted,#64748b);line-height:1.6}.ba-hero{display:flex;align-items:stretch;justify-content:space-between;gap:10px;padding:12px;border-radius:28px;background:radial-gradient(circle at 18% 8%,color-mix(in srgb,var(--ba-primary) 16%,transparent),transparent 20rem),linear-gradient(135deg,var(--card-bg,var(--surface,#fff)),color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,#fff)) 72%);border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 18px 46px rgba(15,23,42,.07);overflow:hidden}.ba-hero-left{display:flex;align-items:center;gap:10px;flex:1}.ba-icon,.ba-avatar{display:grid;place-items:center;background:var(--ba-primary);color:#fff;box-shadow:0 12px 26px color-mix(in srgb,var(--ba-primary) 28%,transparent)}.ba-icon{width:48px;height:48px;flex:0 0 auto;border-radius:18px;font-size:22px}.ba-avatar{width:56px;height:56px;border-radius:19px;font-size:22px;flex:0 0 auto}.ba-title p,.ba-title h2,.ba-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-title p{margin:0 0 2px;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ba-title h2{margin:0;color:var(--text,#111);font-size:clamp(20px,5vw,30px);font-weight:1000;letter-spacing:-.06em;line-height:1}.ba-title span{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:750}.ba-actions,.ba-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.ba-btn,.ba-primary,.ba-delete{min-height:42px;border-radius:999px;padding:0 14px;font-weight:950;cursor:pointer}.ba-btn{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--text,#111)}.ba-btn:disabled{opacity:.55;cursor:not-allowed}.ba-primary{border:0;background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-delete{border:1px solid color-mix(in srgb,var(--muted,#64748b) 26%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111);box-shadow:none}.ba-summary-grid,.ba-list,.ba-mini-grid,.ba-breakdown-grid{display:grid;gap:8px}.ba-summary-grid{margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.ba-summary{display:flex;align-items:center;gap:10px;padding:12px;border-radius:22px;overflow:hidden}.ba-summary.positive{background:linear-gradient(135deg,rgba(34,197,94,.10),var(--card-bg,var(--surface,#fff)))}.ba-summary.warning{background:linear-gradient(135deg,rgba(245,158,11,.10),var(--card-bg,var(--surface,#fff)))}.ba-summary>div:first-child{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff))}.ba-summary strong,.ba-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-summary strong{font-size:18px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111)}.ba-summary span{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:850}.ba-toolbar,.ba-filter,.ba-panel,.ba-timetable-panel{margin-top:10px;padding:10px;border-radius:24px}.ba-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}.ba-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:22px;background:var(--shell-section-bg,color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff)));border:1px solid var(--border,rgba(0,0,0,.08))}.ba-tabs button{min-height:38px;border:0;border-radius:999px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.ba-tabs button.active{background:var(--ba-primary);color:#fff}.ba-filter{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.ba-section{margin-top:16px}.ba-head,.ba-timetable-head,.ba-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.ba-head p,.ba-timetable-head p,.ba-group-head p{margin:0;color:var(--ba-primary);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ba-head h3,.ba-timetable-head h3,.ba-group-head h3{margin:2px 0 0;color:var(--text,#111);font-size:19px;font-weight:1000;letter-spacing:-.04em}.ba-list{margin-top:10px}.ba-card,.ba-breakdown,.ba-empty{border-radius:24px;padding:13px;overflow:hidden}.ba-card-top{display:flex;align-items:flex-start;gap:10px}.ba-card-main{flex:1}.ba-card-main h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000;letter-spacing:-.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-card-main p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.14);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.14);color:#ef4444}.ba-chip.blue{background:rgba(59,130,246,.15);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.16);color:#d97706}.ba-chip.purple{background:rgba(147,51,234,.15);color:#9333ea}.ba-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}.ba-mini{padding:9px;border-radius:17px;background:color-mix(in srgb,var(--muted,#64748b) 9%,transparent);border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}.ba-mini strong,.ba-mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-mini strong{color:var(--text,#111);font-size:13px;font-weight:1000}.ba-mini span{margin-top:2px;color:var(--muted,#64748b);font-size:10px;font-weight:850}.ba-table-wrap{width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ba-table{width:100%;min-width:1080px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table th,.ba-table td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top;color:var(--text,#111);font-size:13px}.ba-table th{color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;background:color-mix(in srgb,var(--ba-primary) 6%,var(--card-bg,#fff))}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:190px;text-align:center;border-style:dashed}.ba-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;color:var(--text,#111);font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-message{margin:10px 0;padding:12px;border-radius:18px;background:rgba(245,158,11,.14);color:#92400e;font-size:13px;font-weight:900}.ba-bar{height:8px;margin-top:12px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);overflow:hidden}.ba-bar i{display:block;height:100%;background:var(--ba-primary);border-radius:inherit}.ba-mode-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}.ba-mode-tabs button{border:0;border-radius:999px;min-height:34px;padding:0 12px;background:transparent;color:var(--muted,#64748b);font-size:12px;font-weight:950;cursor:pointer}.ba-mode-tabs button.active{background:var(--ba-primary);color:#fff}.ba-week-grid{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px;overflow-x:auto}.ba-week-day{min-height:250px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;background:var(--surface,#fff);padding:8px}.ba-week-day-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.ba-week-day-head strong{font-size:12px;text-transform:uppercase;color:var(--muted,#64748b)}.ba-week-day-head span{display:grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);font-size:12px;font-weight:1000}.ba-week-day-body{display:grid;gap:6px}.ba-week-day-body p{margin:8px 0;text-align:center;color:var(--muted,#64748b);font-size:12px}.ba-session-block{display:grid;gap:2px;padding:8px;border-radius:14px;background:color-mix(in srgb,var(--ba-primary) 10%,var(--surface,#fff));border:1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent);overflow:hidden}.ba-session-block strong,.ba-session-block span,.ba-session-block small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-session-block strong{font-size:12px;font-weight:1000}.ba-session-block span,.ba-session-block small{font-size:11px;color:var(--muted,#64748b);font-weight:850}.ba-day-view{display:grid;gap:8px}.ba-day-session{display:grid;grid-template-columns:110px 1fr;gap:10px;padding:12px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}.ba-day-session time{font-weight:1000;color:var(--ba-primary)}.ba-day-session h3{margin:0;font-size:16px;font-weight:1000}.ba-day-session p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:850}.ba-grouped-view{display:grid;gap:10px}.ba-group-card{padding:12px;border-radius:22px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08))}.ba-group-days{display:grid;gap:8px}.ba-group-day{display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:start;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-group-day>strong{font-size:12px;color:var(--muted,#64748b);text-transform:uppercase}.ba-group-day>div{display:grid;gap:6px}.ba-group-day p{margin:0;color:var(--muted,#64748b)}.ba-analytics-list{display:grid;gap:10px;margin-top:12px}.ba-analytics-list section{display:grid;gap:6px}.ba-analytics-list section>div:first-child{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:900}.ba-analytics-list p{margin:0;color:var(--muted,#64748b);font-size:12px}.ba-drawer-layer{position:fixed;inset:0;z-index:80}.ba-drawer-overlay{position:absolute;inset:0;border:0;background:rgba(15,23,42,.52)}.ba-drawer{position:absolute;right:0;top:0;bottom:0;width:min(94vw,720px);max-width:100vw;overflow-y:auto;overflow-x:hidden;background:var(--bg,#f7f8fb);color:var(--text,#111);padding:14px;box-shadow:-24px 0 70px rgba(15,23,42,.22)}.ba-drawer-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:6px 0 12px;background:var(--bg,#f7f8fb)}.ba-drawer-head p{margin:0;color:var(--ba-primary);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ba-drawer-head h2{margin:2px 0 0;color:var(--text,#111);font-size:22px;font-weight:1000;letter-spacing:-.05em}.ba-drawer-head span{margin-top:3px;display:block;color:var(--muted,#64748b);font-size:12px;font-weight:750}.ba-drawer-head button{width:38px;height:38px;flex:0 0 auto;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111);font-weight:1000;cursor:pointer}.ba-form-card{margin-top:10px;padding:12px;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}.ba-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form-grid label{display:grid;gap:6px}.ba-form-grid label span,.ba-label{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}.ba-form-grid .wide{grid-column:1/-1}.ba-day-picker{display:flex;flex-wrap:wrap;gap:6px}.ba-day-picker button{border:1px solid var(--border,rgba(0,0,0,.10));background:var(--surface,#fff);color:var(--muted,#64748b);border-radius:999px;min-height:34px;padding:0 11px;font-weight:950}.ba-day-picker button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff}.ba-drawer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}@media(min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-filter-rich{grid-template-columns:minmax(220px,1.4fr) repeat(3,minmax(150px,1fr))}.ba-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ba-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.ba-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.ba-list,.ba-breakdown-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.ba-timetable-head{display:grid}.ba-mode-tabs{width:100%}.ba-mode-tabs button{flex:1}.ba-week-grid{grid-template-columns:repeat(7,160px)}.ba-day-session{grid-template-columns:1fr}.ba-group-head{display:grid}.ba-group-day{grid-template-columns:1fr}.ba-toolbar{align-items:stretch;flex-direction:column}}@media(max-width:520px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.ba-hero{flex-direction:column;border-radius:22px;padding:10px}.ba-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-btn,.ba-primary,.ba-delete{width:100%}.ba-summary-grid{gap:6px}.ba-summary{padding:10px;border-radius:19px}.ba-tabs button{flex:1;justify-content:center}.ba-card,.ba-empty,.ba-breakdown{border-radius:20px;padding:11px}.ba-avatar{width:52px;height:52px;flex-basis:52px}.ba-mini-grid{grid-template-columns:repeat(1,minmax(0,1fr))}.ba-drawer-actions{grid-template-columns:minmax(0,1fr)}.ba-drawer{width:min(96vw,720px);padding:12px}}

/* Golden compact shell copied from Students.tsx standards */
.ba-hero,.ba-summary-grid,.ba-toolbar,.ba-filter{display:none!important}
.ba-search-card,.ba-table-card,.ba-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}
.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ba-add-inline{flex:0 0 42px;border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:25px;line-height:1;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}
.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}
.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}
.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}
.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none;-ms-overflow-style:none}
.ba-filter-chips::-webkit-scrollbar{display:none}
.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:rgba(15,23,42,.48)}
.ba-sheet{width:min(720px,100%);max-height:min(86dvh,760px);overflow:auto;border-radius:28px 28px 22px 22px;padding:14px;color:var(--text,#111827)}
.ba-sheet.small{width:min(520px,100%)}
.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.ba-sheet-head h2{margin:0;color:var(--text,#111827);font-size:22px;font-weight:1000;letter-spacing:-.05em}
.ba-sheet-head p{margin:3px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.5}
.ba-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:15px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer}
.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
.ba-form.compact label{display:grid;gap:6px}
.ba-form.compact label span{color:var(--muted,#64748b);font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
.ba-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.ba-sheet-actions button{min-height:44px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:950;cursor:pointer}
.ba-sheet-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff}
.ba-menu-list{display:grid;gap:8px}
.ba-menu-list button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"icon title" "icon text";gap:2px 10px;align-items:center;padding:12px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:20px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}
.ba-menu-list button span{grid-area:icon;width:38px;height:38px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent)}
.ba-menu-list button b{grid-area:title;font-size:14px;font-weight:1000}
.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:12px;font-weight:750}
.ba-menu-list button.active{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff}
.ba-menu-list button.active span{background:rgba(255,255,255,.18);color:#fff}
.ba-menu-list button.active small{color:rgba(255,255,255,.82)}
.ba-table-card{margin-top:10px;padding:10px;border-radius:24px}
.ba-table-scroll{width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}
.ba-table-card table{width:100%;min-width:1040px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}
.ba-table-card th,.ba-table-card td{padding:10px 11px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));text-align:left;vertical-align:top;color:var(--text,#111827);font-size:13px}
.ba-table-card th{background:color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,var(--surface,#fff)));color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}
.ba-table-card td strong{display:block;color:var(--text,#111827);font-size:13px;font-weight:1000}
.ba-table-card td span{display:block;margin-top:2px;color:var(--muted,#64748b);font-size:12px;font-weight:750}
@media(min-width:680px){.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;padding:7px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.ba-sheet-backdrop{padding:8px}.ba-sheet{border-radius:24px 24px 18px 18px}}

/* Golden action layout fixes: table actions never stack; card delete stays calm. */
.ba-table-actions{
  display:flex;
  align-items:center;
  justify-content:flex-start;
  gap:7px;
  flex-wrap:nowrap;
  min-width:max-content;
  white-space:nowrap;
}
.ba-table-actions .ba-btn,
.ba-table-actions .ba-delete{
  width:auto !important;
  min-width:max-content;
  min-height:34px;
  padding:0 11px;
  font-size:12px;
  flex:0 0 auto;
}
.ba-card-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:7px;
  flex-wrap:wrap;
  margin-top:10px;
}
.ba-card-actions .ba-btn,
.ba-card-actions .ba-delete{
  width:auto !important;
  min-height:36px;
  padding:0 12px;
  font-size:12px;
}
.ba-soft-delete{
  border-color:color-mix(in srgb,var(--muted,#64748b) 22%,var(--border,rgba(0,0,0,.10))) !important;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,var(--card-bg,var(--surface,#fff))) !important;
  color:var(--text,#111827) !important;
  box-shadow:none !important;
}
.ba-soft-delete:hover{
  border-color:color-mix(in srgb,#ef4444 32%,var(--border,rgba(0,0,0,.10))) !important;
  background:color-mix(in srgb,#ef4444 8%,var(--card-bg,var(--surface,#fff))) !important;
}
.ba-table td:last-child{
  min-width:330px;
}
@media(max-width:520px){
  .ba-table-actions{overflow-x:auto;max-width:100%;padding-bottom:2px;scrollbar-width:none}
  .ba-table-actions::-webkit-scrollbar{display:none}
  .ba-card-actions{justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .ba-card-actions::-webkit-scrollbar{display:none}
  .ba-card-actions .ba-btn,.ba-card-actions .ba-delete{width:auto !important;flex:0 0 auto}
}

`;
