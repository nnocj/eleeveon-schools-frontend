"use client";

/**
 * app/branch-admin/modules/StudentAttendance.tsx
 * ---------------------------------------------------------
 * ELEEVEON STUDENT ATTENDANCE V3
 * ---------------------------------------------------------
 * Golden Standard Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this attendance register from accidentally using stale school/branch
 *   context left behind by another role or portal
 * - all attendance reads and writes now use the resolved workspace
 *   schoolId and branchId
 *
 * Golden UI behavior:
 * - no duplicate module hero/header block
 * - compact search + inline save + slider filter + more menu
 * - filters moved into a bottom sheet
 * - cards/list view uses compact Students.tsx-style rows instead of large cards
 * - table and analytics live under the More menu
 * - attendance bulk actions live under the More menu to save vertical space
 * - summary is shown only inside analytics, not as a permanent main-screen strip
 * - styling uses ba-* theme variables so dark mode/system theme keeps working
 *
 * Important attendance rule:
 * - student list is resolved from ACTIVE StudentEnrollment records first.
 * - if a branch has not created enrollment rows yet, the page falls back to
 *   active students whose currentClassId matches the selected class.
 * - this keeps the register usable while still respecting the enrollment model.
 *
 * DB focus:
 * - attendance
 * - studentEnrollments
 * - students
 * - classes
 * - academicStructures
 * - academicPeriods
 *
 * Sync behavior:
 * - createLocal(...) creates new attendance rows
 * - updateLocal(...) updates existing attendance rows
 * - softDeleteLocal(...) clears/archives a student's selected-date attendance
 * - reads/writes stay scoped by accountId + schoolId + branchId
 * - no manual synced/version/updatedAt fields are written directly here
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type Attendance,
  type Class,
  type Student,
  type StudentEnrollment,
} from "../../lib/db/db";

import {
  createLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type AttendanceStatus = "present" | "absent" | "late";
type AttendanceFilter = "all" | AttendanceStatus | "unmarked";
type AttendanceMap = Record<string, AttendanceStatus>;

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

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
    const parsed = idOf(value);
    if (parsed && parsed !== "0") return parsed;
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

type StudentRow = {
  student: Student;
  enrollment?: StudentEnrollment;
  existingAttendance?: Attendance;
  source: "enrollment" | "currentClass";
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = String(row?.status || "").toLowerCase();
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status))
    return false;
  return true;
};

function statusTone(
  status?: AttendanceStatus,
): "green" | "red" | "orange" | "gray" {
  if (status === "present") return "green";
  if (status === "absent") return "red";
  if (status === "late") return "orange";
  return "gray";
}

function statusLabel(status?: AttendanceStatus) {
  if (!status) return "Unmarked";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Avatar({
  name,
  photo,
  primary,
}: {
  name: string;
  photo?: string;
  primary: string;
}) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo &&
        String(name || "S")
          .slice(0, 1)
          .toUpperCase()}
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

export default function StudentAttendance() {
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

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [academicStructureId, setAcademicStructureId] = useState<string>(
    settings?.currentAcademicStructureId
      ? String(settings.currentAcademicStructureId)
      : "",
  );
  const [academicPeriodId, setAcademicPeriodId] = useState<string>(
    settings?.currentAcademicPeriodId
      ? String(settings.currentAcademicPeriodId)
      : "",
  );
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] =
    useState<AttendanceFilter>("all");
  const [statusMap, setStatusMap] = useState<AttendanceMap>({});

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  };

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setPeriods([]);
    setEnrollments([]);
    setAttendanceRows([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [
        studentRows,
        classRows,
        structureRows,
        periodRows,
        enrollmentRows,
        attendanceData,
      ] = await Promise.all([
        tableSafe("students")?.toArray?.() || [],
        tableSafe("classes")?.toArray?.() || [],
        tableSafe("academicStructures")?.toArray?.() || [],
        tableSafe("academicPeriods")?.toArray?.() || [],
        tableSafe("studentEnrollments")?.toArray?.() || [],
        tableSafe("attendance")?.toArray?.() || [],
      ]);

      setStudents(
        (studentRows as Student[])
          .filter(
            (row: any) =>
              sameTenant(row as TenantRow) &&
              row.status !== "withdrawn" &&
              row.status !== "graduated",
          )
          .sort((a: any, b: any) =>
            String(a.fullName || "").localeCompare(String(b.fullName || "")),
          ),
      );
      setClasses(
        (classRows as Class[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setAcademicStructures(
        (structureRows as AcademicStructure[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort(
            (a: any, b: any) => Number(a.order || 0) - Number(b.order || 0),
          ),
      );
      setEnrollments(
        (enrollmentRows as StudentEnrollment[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setAttendanceRows(
        (attendanceData as Attendance[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load student attendance:", error);
      clearData();
      showToast("error", "Failed to load student attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  useEffect(() => {
    if (!academicStructureId && settings?.currentAcademicStructureId)
      setAcademicStructureId(String(settings.currentAcademicStructureId));
    if (!academicPeriodId && settings?.currentAcademicPeriodId)
      setAcademicPeriodId(String(settings.currentAcademicPeriodId));
  }, [
    academicPeriodId,
    academicStructureId,
    settings?.currentAcademicPeriodId,
    settings?.currentAcademicStructureId,
  ]);

  const studentMap = useMemo(
    () => new Map(students.map((row: any) => [idOf(row.id), row])),
    [students],
  );
  const classMap = useMemo(
    () => new Map(classes.map((row: any) => [idOf(row.id), row])),
    [classes],
  );
  const structureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures],
  );
  const periodMap = useMemo(
    () => new Map(periods.map((row: any) => [idOf(row.id), row])),
    [periods],
  );

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return periods;
    return periods.filter((row: any) =>
      sameId(row.academicStructureId, academicStructureId),
    );
  }, [academicStructureId, periods]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<string>();
    enrollments.forEach((row: any) => {
      if (row.status !== "active") return;
      if (
        academicStructureId &&
        !sameId(row.academicStructureId, academicStructureId)
      )
        return;
      if (academicPeriodId && !sameId(row.academicPeriodId, academicPeriodId))
        return;
      if (row.classId) ids.add(String(row.classId));
    });
    return ids;
  }, [academicPeriodId, academicStructureId, enrollments]);

  const availableClasses = useMemo(() => {
    // Golden-standard behavior: keep all active branch classes selectable.
    // Enrollment rows are still preferred for loading students, but hiding classes
    // without enrollment makes attendance feel broken in fresh branches.
    const enrolled = classes.filter(
      (row: any) => row.id && availableClassIds.has(String(row.id)),
    );
    const remaining = classes.filter(
      (row: any) => !row.id || !availableClassIds.has(String(row.id)),
    );
    return [...enrolled, ...remaining];
  }, [availableClassIds, classes]);

  const attendanceKeyMap = useMemo(() => {
    const map = new Map<string, Attendance>();
    attendanceRows.forEach((row: any) => {
      if (!classId || !academicStructureId || !academicPeriodId || !date)
        return;
      if (!sameId(row.classId, classId)) return;
      if (!sameId(row.academicStructureId, academicStructureId)) return;
      if (!sameId(row.academicPeriodId, academicPeriodId)) return;
      if (row.date !== date) return;
      map.set(idOf(row.studentId), row);
    });
    return map;
  }, [academicPeriodId, academicStructureId, attendanceRows, classId, date]);

  const studentRows = useMemo<StudentRow[]>(() => {
    if (!classId || !academicStructureId || !academicPeriodId) return [];

    const seen = new Set<string>();

    const fromEnrollments = enrollments
      .filter(
        (row: any) =>
          sameId(row.classId, classId) &&
          sameId(row.academicStructureId, academicStructureId) &&
          sameId(row.academicPeriodId, academicPeriodId) &&
          row.status === "active" &&
          !row.isDeleted,
      )
      .map((enrollment: any) => {
        const student = studentMap.get(idOf(enrollment.studentId)) as
          | Student
          | undefined;
        if (!student) return undefined;
        const sid = idOf((student as any).id);
        if (!sid) return undefined;
        seen.add(sid);
        return {
          student,
          enrollment,
          source: "enrollment" as const,
          existingAttendance: attendanceKeyMap.get(sid),
        };
      })
      .filter(Boolean) as StudentRow[];

    const fromCurrentClass = students
      .filter((student: any) => {
        const sid = idOf(student.id);
        if (!sid || seen.has(sid)) return false;
        if (!sameId(student.currentClassId, classId)) return false;
        if (student.isDeleted || student.active === false) return false;
        if (
          [
            "withdrawn",
            "graduated",
            "deleted",
            "archived",
            "inactive",
          ].includes(String(student.status || "").toLowerCase())
        )
          return false;
        return true;
      })
      .map((student: any) => {
        const sid = idOf(student.id);
        return {
          student,
          source: "currentClass" as const,
          existingAttendance: attendanceKeyMap.get(sid),
        };
      });

    return [...fromEnrollments, ...fromCurrentClass].sort((a, b) =>
      String((a.student as any).fullName || "").localeCompare(
        String((b.student as any).fullName || ""),
      ),
    );
  }, [
    academicPeriodId,
    academicStructureId,
    attendanceKeyMap,
    classId,
    enrollments,
    studentMap,
    students,
  ]);

  useEffect(() => {
    if (!classId || !academicStructureId || !academicPeriodId || !date) {
      setStatusMap({});
      return;
    }
    const next: AttendanceMap = {};
    attendanceRows
      .filter(
        (row: any) =>
          sameId(row.classId, classId) &&
          sameId(row.academicStructureId, academicStructureId) &&
          sameId(row.academicPeriodId, academicPeriodId) &&
          row.date === date &&
          !row.isDeleted,
      )
      .forEach((row: any) => {
        const studentId = idOf(row.studentId);
        if (studentId && ["present", "absent", "late"].includes(row.status))
          next[studentId] = row.status as AttendanceStatus;
      });
    setStatusMap(next);
  }, [academicPeriodId, academicStructureId, attendanceRows, classId, date]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return studentRows.filter(({ student }) => {
      const studentAny: any = student;
      const sid = idOf(studentAny.id);
      const status = statusMap[sid];
      if (attendanceFilter === "unmarked" && status) return false;
      if (
        ["present", "absent", "late"].includes(attendanceFilter) &&
        status !== attendanceFilter
      )
        return false;
      if (!query) return true;
      return `${studentAny.fullName} ${studentAny.admissionNumber || ""} ${studentAny.gender || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [attendanceFilter, search, statusMap, studentRows]);

  const summary = useMemo(() => {
    const total = filteredStudents.length;
    const present = filteredStudents.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "present",
    ).length;
    const absent = filteredStudents.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "absent",
    ).length;
    const late = filteredStudents.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "late",
    ).length;
    const marked = present + absent + late;
    const unmarked = Math.max(0, total - marked);
    const completion = total ? Math.round((marked / total) * 100) : 0;
    return { total, marked, present, absent, late, unmarked, completion };
  }, [filteredStudents, statusMap]);

  const fullSummary = useMemo(() => {
    const total = studentRows.length;
    const present = studentRows.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "present",
    ).length;
    const absent = studentRows.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "absent",
    ).length;
    const late = studentRows.filter(
      ({ student }) => statusMap[idOf((student as any).id)] === "late",
    ).length;
    const marked = present + absent + late;
    const completion = total ? Math.round((marked / total) * 100) : 0;
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, marked, completion, attendanceRate };
  }, [statusMap, studentRows]);

  const countsByStatus = useMemo(
    () => [
      { label: "Present", value: fullSummary.present },
      { label: "Absent", value: fullSummary.absent },
      { label: "Late", value: fullSummary.late },
      {
        label: "Unmarked",
        value: Math.max(0, fullSummary.total - fullSummary.marked),
      },
    ],
    [fullSummary],
  );

  const activeFilterCount = useMemo(() => {
    return [
      academicStructureId,
      academicPeriodId,
      classId,
      date,
      attendanceFilter !== "all" ? attendanceFilter : "",
    ].filter(Boolean).length;
  }, [academicPeriodId, academicStructureId, attendanceFilter, classId, date]);

  const selectedClassName = classId
    ? (classMap.get(idOf(classId)) as any)?.name || "Selected Class"
    : "Select a class";
  const selectedStructureName = academicStructureId
    ? (structureMap.get(idOf(academicStructureId)) as any)?.name ||
      "Selected Structure"
    : "No structure";
  const selectedPeriodName = academicPeriodId
    ? (periodMap.get(idOf(academicPeriodId)) as any)?.name || "Selected Period"
    : "No period";

  const setStudentStatus = (studentId: string, status: AttendanceStatus) =>
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  const clearStudentStatus = (studentId: string) =>
    setStatusMap((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });

  const markAll = (status: AttendanceStatus) => {
    const next: AttendanceMap = {};
    filteredStudents.forEach(({ student }) => {
      const sid = idOf((student as any).id);
      if (sid) next[sid] = status;
    });
    setStatusMap((prev) => ({ ...prev, ...next }));
    setMoreOpen(false);
  };

  const clearShown = () => {
    setStatusMap((prev) => {
      const next = { ...prev };
      filteredStudents.forEach(({ student }) => {
        const sid = idOf((student as any).id);
        if (sid) delete next[sid];
      });
      return next;
    });
    setMoreOpen(false);
  };

  const clearFilters = () => {
    setAttendanceFilter("all");
    setSearch("");
  };

  const saveAttendance = async () => {
    if (!authenticated || !accountId)
      return showToast("error", "Sign in first.");
    if (!schoolId) return showToast("error", "Select school first.");
    if (!branchId) return showToast("error", "Select branch first.");
    if (!classId) return showToast("error", "Select class.");
    if (!academicStructureId)
      return showToast("error", "Select academic structure.");
    if (!academicPeriodId) return showToast("error", "Select academic period.");
    if (!date) return showToast("error", "Select date.");

    try {
      setSaving(true);
      for (const { student } of studentRows) {
        const sid = idOf((student as any).id);
        if (!sid) continue;
        const status = statusMap[sid];
        const existing = attendanceKeyMap.get(sid);

        if ((existing as any)?.id && !status) {
          await softDeleteLocal("attendance", idOf((existing as any).id));
          continue;
        }
        if (!status) continue;

        const payload: Partial<Attendance> = {
          accountId,
          schoolId: schoolId,
          branchId: branchId,
          studentId: sid,
          classId: classId,
          academicStructureId: academicStructureId,
          academicPeriodId: academicPeriodId,
          date,
          status,
          isDeleted: false,
          active: true,
        } as Partial<Attendance>;

        if ((existing as any)?.id)
          await updateLocal(
            "attendance",
            idOf((existing as any).id),
            payload,
          );
        else await createLocal("attendance", payload as unknown as Attendance);
      }
      await load();
      showToast("success", "Attendance saved successfully.");
    } catch (error) {
      console.error("Failed to save attendance:", error);
      showToast("error", "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Student Attendance..."
        text="Checking account, branch, academic context, enrollments, and attendance records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before recording attendance."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>No branch workspace selected</h2>
          <p>
            Student attendance belongs to the selected branch-admin workspace.
            Use Select Role again if the wrong branch is active.
          </p>
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
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
        aria-label="Student attendance search and actions"
      >
        <span
          className={`status-dot-mini ${fullSummary.completion === 100 && fullSummary.total > 0 ? "green" : fullSummary.marked ? "orange" : "gray"}`}
          title={`${fullSummary.marked}/${fullSummary.total} marked`}
        />

        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search attendance..."
            aria-label="Search attendance"
          />
        </label>

        <button
          type="button"
          className="ba-save-inline"
          onClick={saveAttendance}
          disabled={saving}
          aria-label="Save attendance"
        >
          {saving ? "..." : "Save"}
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

      {(classId || academicStructureId || academicPeriodId || date) && (
        <section className="ba-filter-chips" aria-label="Attendance context">
          {classId && (
            <button type="button" onClick={() => setClassId("")}>
              Class: {selectedClassName} ×
            </button>
          )}
          {academicStructureId && (
            <button
              type="button"
              onClick={() => {
                setAcademicStructureId("");
                setAcademicPeriodId("");
                setClassId("");
              }}
            >
              Structure: {selectedStructureName} ×
            </button>
          )}
          {academicPeriodId && (
            <button
              type="button"
              onClick={() => {
                setAcademicPeriodId("");
                setClassId("");
              }}
            >
              Period: {selectedPeriodName} ×
            </button>
          )}
          {date && (
            <button type="button" onClick={() => setDate(todayISO())}>
              Date: {date} ×
            </button>
          )}
          {attendanceFilter !== "all" && (
            <button type="button" onClick={() => setAttendanceFilter("all")}>
              Status: {statusLabel(attendanceFilter as AttendanceStatus)} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid attendance-analysis-grid">
          <AnalysisCard
            title="Attendance Breakdown"
            rows={countsByStatus}
            total={Math.max(1, fullSummary.total)}
          />
          <article className="ba-analysis">
            <span>Attendance Rate</span>
            <strong>{fullSummary.attendanceRate}%</strong>
            <p>
              Present students divided by all enrolled students for this
              register.
            </p>
          </article>
          <article className="ba-analysis">
            <span>Completion</span>
            <strong>{fullSummary.completion}%</strong>
            <p>
              {fullSummary.marked}/{fullSummary.total} student(s) marked for{" "}
              {selectedClassName}.
            </p>
          </article>
          <article className="ba-analysis">
            <span>Selected Register</span>
            <strong>{summary.total}</strong>
            <p>
              {selectedClassName} · {selectedStructureName} ·{" "}
              {selectedPeriodName}
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && (
        <TableView
          rows={filteredStudents}
          statusMap={statusMap}
          setStudentStatus={setStudentStatus}
          clearStudentStatus={clearStudentStatus}
        />
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredStudents.map(({ student }) => {
            const studentAny: any = student;
            const sid = idOf(studentAny.id);
            const current = statusMap[sid];
            return (
              <AttendanceListItem
                key={String(sid)}
                student={student}
                selectedClassName={selectedClassName}
                date={date}
                primary={primary}
                current={current}
                setStudentStatus={setStudentStatus}
                clearStudentStatus={clearStudentStatus}
              />
            );
          })}

          {!filteredStudents.length && (
            <Empty
              icon="📅"
              title="No students loaded"
              text={
                classId
                  ? "No students match the current filter."
                  : "Open filters and select academic structure, period, and class. The register uses enrollments first, then current-class fallback."
              }
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          academicStructureId={academicStructureId}
          academicPeriodId={academicPeriodId}
          classId={classId}
          date={date}
          attendanceFilter={attendanceFilter}
          academicStructures={academicStructures}
          filteredPeriods={filteredPeriods}
          availableClasses={availableClasses}
          setAcademicStructureId={(value) => {
            setAcademicStructureId(value);
            setAcademicPeriodId("");
            setClassId("");
          }}
          setAcademicPeriodId={(value) => {
            setAcademicPeriodId(value);
            setClassId("");
          }}
          setClassId={setClassId}
          setDate={setDate}
          setAttendanceFilter={setAttendanceFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          summary={summary}
          fullSummary={fullSummary}
          selectedClassName={selectedClassName}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          markAll={markAll}
          clearShown={clearShown}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
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
    <main
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function AttendanceListItem({
  student,
  selectedClassName,
  date,
  primary,
  current,
  setStudentStatus,
  clearStudentStatus,
}: {
  student: Student;
  selectedClassName: string;
  date: string;
  primary: string;
  current?: AttendanceStatus;
  setStudentStatus: (studentId: string, status: AttendanceStatus) => void;
  clearStudentStatus: (studentId: string) => void;
}) {
  const studentAny: any = student;
  const sid = idOf(studentAny.id);

  return (
    <article className="attendance-row">
      <Avatar
        name={studentAny.fullName}
        photo={studentAny.photo}
        primary={primary}
      />

      <span className="attendance-main">
        <strong>{studentAny.fullName || "Unnamed student"}</strong>
        <small>{studentAny.admissionNumber || "No admission number"}</small>
        <em>
          {selectedClassName}
          {date ? ` · ${date}` : ""}
        </em>
      </span>

      <span
        className="attendance-status-actions"
        aria-label="Attendance status actions"
      >
        <button
          type="button"
          className={`present ${current === "present" ? "active" : ""}`}
          onClick={() => setStudentStatus(sid, "present")}
        >
          P
        </button>
        <button
          type="button"
          className={`absent ${current === "absent" ? "active" : ""}`}
          onClick={() => setStudentStatus(sid, "absent")}
        >
          A
        </button>
        <button
          type="button"
          className={`late ${current === "late" ? "active" : ""}`}
          onClick={() => setStudentStatus(sid, "late")}
        >
          L
        </button>
        <button
          type="button"
          className="clear"
          onClick={() => clearStudentStatus(sid)}
        >
          ×
        </button>
        <span
          className={`status-dot-mini ${statusTone(current)}`}
          title={statusLabel(current)}
          aria-label={statusLabel(current)}
        />
      </span>
    </article>
  );
}

function FilterSheet({
  academicStructureId,
  academicPeriodId,
  classId,
  date,
  attendanceFilter,
  academicStructures,
  filteredPeriods,
  availableClasses,
  setAcademicStructureId,
  setAcademicPeriodId,
  setClassId,
  setDate,
  setAttendanceFilter,
  clearFilters,
  onClose,
}: {
  academicStructureId: string;
  academicPeriodId: string;
  classId: string;
  date: string;
  attendanceFilter: AttendanceFilter;
  academicStructures: AcademicStructure[];
  filteredPeriods: AcademicPeriod[];
  availableClasses: Class[];
  setAcademicStructureId: (value: string) => void;
  setAcademicPeriodId: (value: string) => void;
  setClassId: (value: string) => void;
  setDate: (value: string) => void;
  setAttendanceFilter: (value: AttendanceFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Attendance Filters</h2>
            <p>Select the register context and optional status filter.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Academic Structure</span>
            <select
              value={academicStructureId}
              onChange={(event) => setAcademicStructureId(event.target.value)}
            >
              <option value="">Select academic structure</option>
              {academicStructures.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                  {row.level ? ` · ${row.level}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Academic Period</span>
            <select
              value={academicPeriodId}
              onChange={(event) => setAcademicPeriodId(event.target.value)}
            >
              <option value="">Select academic period</option>
              {filteredPeriods.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Class</span>
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Select class</option>
              {availableClasses.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={attendanceFilter}
              onChange={(event) =>
                setAttendanceFilter(event.target.value as AttendanceFilter)
              }
            >
              <option value="all">All students</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="unmarked">Unmarked</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>
            Clear Search/Status
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
  viewMode,
  summary,
  fullSummary,
  selectedClassName,
  setViewMode,
  markAll,
  clearShown,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  summary: {
    total: number;
    marked: number;
    present: number;
    absent: number;
    late: number;
    unmarked: number;
    completion: number;
  };
  fullSummary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    marked: number;
    completion: number;
    attendanceRate: number;
  };
  selectedClassName: string;
  setViewMode: (mode: ViewMode) => void;
  markAll: (status: AttendanceStatus) => void;
  clearShown: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>
              {summary.marked}/{summary.total} shown marked ·{" "}
              {fullSummary.completion}% register completion.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Compact attendance rows</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense register for laptop work</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Breakdown, rate and completion</small>
          </button>
          <button type="button" onClick={() => markAll("present")}>
            <span>✓</span>
            <b>Mark shown present</b>
            <small>{selectedClassName}</small>
          </button>
          <button type="button" onClick={() => markAll("absent")}>
            <span>×</span>
            <b>Mark shown absent</b>
            <small>{summary.total} shown student(s)</small>
          </button>
          <button type="button" onClick={() => markAll("late")}>
            <span>◷</span>
            <b>Mark shown late</b>
            <small>{summary.total} shown student(s)</small>
          </button>
          <button type="button" className="danger" onClick={clearShown}>
            <span>⌫</span>
            <b>Clear shown</b>
            <small>Remove local marks before saving</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch attendance</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  rows,
  statusMap,
  setStudentStatus,
  clearStudentStatus,
}: {
  rows: StudentRow[];
  statusMap: AttendanceMap;
  setStudentStatus: (studentId: string, status: AttendanceStatus) => void;
  clearStudentStatus: (studentId: string) => void;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              <th>Admission No.</th>
              <th>Gender</th>
              <th>Enrollment</th>
              <th>Existing Row</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, enrollment, existingAttendance, source }) => {
              const studentAny: any = student;
              const sid = idOf(studentAny.id);
              const current = statusMap[sid];
              return (
                <tr key={String(sid)}>
                  <td>
                    <strong>{studentAny.fullName}</strong>
                    <span>{studentAny.address || "No address"}</span>
                  </td>
                  <td>{studentAny.admissionNumber || "—"}</td>
                  <td>{studentAny.gender || "—"}</td>
                  <td>
                    <strong>
                      {enrollment
                        ? String((enrollment as any).status || "active")
                        : "current class"}
                    </strong>
                    <span>
                      {enrollment
                        ? `Enrollment #${(enrollment as any).id || "—"}`
                        : source === "currentClass"
                          ? "Current class fallback"
                          : "—"}
                    </span>
                  </td>
                  <td>
                    {(existingAttendance as any)?.id ? "Saved before" : "New"}
                  </td>
                  <td>
                    <Chip tone={statusTone(current)}>
                      {statusLabel(current)}
                    </Chip>
                  </td>
                  <td>
                    <div className="ba-table-actions">
                      <button
                        type="button"
                        onClick={() => setStudentStatus(sid, "present")}
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentStatus(sid, "absent")}
                      >
                        Absent
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentStatus(sid, "late")}
                      >
                        Late
                      </button>
                      <button
                        type="button"
                        className="ba-delete"
                        onClick={() => clearStudentStatus(sid)}
                      >
                        Clear
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ba-empty-table">
            No students match this register/filter.
          </div>
        )}
      </div>
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
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.map((row) => {
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
  background: radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem), var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}
.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }
.ba-page input, .ba-page select, .ba-page textarea { width: 100%; min-height: 44px; border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10))); border-radius: 16px; padding: 0 12px; background: var(--input-bg, var(--surface, #fff)); color: var(--input-text, var(--text, #111827)); outline: none; font-weight: 750; }
.ba-page input:focus, .ba-page select:focus, .ba-page textarea:focus { border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent); }

.ba-state, .ba-search-card, .ba-table-card, .ba-analysis, .ba-empty, .ba-sheet, .attendance-row { background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045); }
.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px, 100%); margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 10px; padding: 22px; border-radius: 28px; text-align: center; }
.ba-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent); border-top-color: var(--ba-primary); animation: spin .8s linear infinite; }
.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ba-state-button { min-height: 42px; border: 0; border-radius: 999px; padding: 0 16px; background: var(--ba-primary); color: #fff; font-weight: 950; cursor: pointer; }
.ba-toast { position: sticky; top: 8px; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 12px 14px; border-radius: 18px; font-size: 13px; font-weight: 850; box-shadow: 0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }
.ba-toast button { border: 0; background: transparent; color: currentColor; font-weight: 1000; cursor: pointer; }

.ba-search-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }
.ba-icon-button, .ba-filter-button, .ba-save-inline { height: 42px; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg, var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-icon-button, .ba-filter-button { width: 42px; }
.ba-save-inline { min-width: 58px; padding: 0 12px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 12px; box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent); }
.ba-save-inline:disabled { opacity: .65; cursor: not-allowed; }
.ba-filter-button { position: relative; background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff)); color: var(--ba-primary); }
.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-filter-button b { position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; border: 2px solid var(--card-bg,#fff); }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.status-dot-mini { width: 10px; height: 10px; display: inline-block; border-radius: 999px; background: var(--muted,#64748b); box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent); }
.status-dot-mini.green { background: #22c55e; } .status-dot-mini.orange { background: #f59e0b; } .status-dot-mini.red { background: #ef4444; } .status-dot-mini.gray { background: #94a3b8; }
.ba-filter-chips { display: flex; gap: 7px; overflow-x: auto; padding: 8px 1px 0; scrollbar-width: none; -ms-overflow-style: none; }
.ba-filter-chips::-webkit-scrollbar { display: none; }
.ba-filter-chips button { flex: 0 0 auto; min-height: 31px; border: 0; border-radius: 999px; padding: 0 10px; background: color-mix(in srgb, var(--ba-primary) 11%, transparent); color: var(--ba-primary); font-size: 11px; font-weight: 950; white-space: nowrap; cursor: pointer; }
.ba-list { display: grid; gap: 7px; margin-top: 10px; }
.attendance-row { width: 100%; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px; border-radius: 22px; text-align: left; transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease); }
.attendance-row:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 16px 34px rgba(15,23,42,.07); }
.ba-avatar { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; color: #fff; font-size: 17px; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.attendance-main, .attendance-main strong, .attendance-main small, .attendance-main em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attendance-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.attendance-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.attendance-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.attendance-status-actions { display: grid; grid-template-columns: repeat(4, 31px); align-items: center; justify-content: end; gap: 5px; }
.attendance-status-actions button { width: 31px; height: 31px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--muted, var(--text)); font-size: 11px; font-weight: 1000; cursor: pointer; }
.attendance-status-actions button.present.active { border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.14); color: #16a34a; }
.attendance-status-actions button.absent.active { border-color: rgba(239,68,68,.45); background: rgba(239,68,68,.14); color: #dc2626; }
.attendance-status-actions button.late.active { border-color: rgba(245,158,11,.45); background: rgba(245,158,11,.16); color: #b45309; }
.attendance-status-actions .status-dot-mini { grid-column: 4; justify-self: end; margin-top: 2px; }
.ba-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; } .ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; } .ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; } .ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); } .ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; } .ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.ba-table-card { margin-top: 10px; padding: 10px; border-radius: 24px; }
.ba-table-scroll { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-table-scroll table { width: 100%; min-width: 920px; border-collapse: collapse; background: var(--card-bg, var(--surface, var(--bg, transparent))); }
.ba-table-scroll th, .ba-table-scroll td { padding: 10px; border-bottom: 1px solid var(--border,rgba(0,0,0,.08)); vertical-align: top; text-align: left; font-size: 13px; }
.ba-table-scroll th { background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent))))); color: var(--table-header-text, var(--muted, var(--text))); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-table-scroll td strong, .ba-table-scroll td span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-table-scroll td span { margin-top: 3px; color: var(--muted, var(--text)); font-size: 11px; }
.ba-table-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.ba-table-actions button { min-height: 34px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 10px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 11px; font-weight: 950; cursor: pointer; }
.ba-table-actions button:first-child { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-table-actions .ba-delete { color: var(--muted,#64748b); background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); border-color: color-mix(in srgb,var(--muted,#64748b) 24%,var(--border,rgba(0,0,0,.10))); }
.ba-empty-table { padding: 22px; text-align: center; color: var(--muted,#64748b); font-weight: 850; }
.ba-analysis-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; margin-top: 10px; }
.ba-analysis { padding: 13px; border-radius: 24px; }
.ba-analysis span { color: var(--muted, var(--text)); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
.ba-analysis strong { display: block; margin-top: 8px; font-size: clamp(22px,7vw,30px); line-height: 1; font-weight: 1000; letter-spacing: -.06em; overflow-wrap: anywhere; }
.ba-analysis p { margin: 8px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-analysis-list { display: grid; gap: 10px; margin-top: 12px; }
.ba-analysis-list section { display: grid; gap: 6px; padding: 10px; border-radius: 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent); }
.ba-analysis-list section > div:first-child { display: flex; justify-content: space-between; gap: 10px; }
.ba-analysis-list b, .ba-analysis-list small { font-size: 12px; }
.ba-analysis-list small { color: var(--muted,#64748b); font-weight: 850; }
.ba-progress { height: 8px; border-radius: 999px; background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow: hidden; }
.ba-progress i { display: block; height: 100%; border-radius: inherit; background: var(--ba-primary); }
.ba-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 220px; text-align: center; border-style: dashed; border-radius: 24px; padding: 13px; }
.ba-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size: 28px; }
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }
.ba-sheet-backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.48); backdrop-filter: blur(10px); }
.ba-sheet { width: min(680px, 100%); max-height: min(86dvh, 760px); overflow-y: auto; border-radius: 28px; padding: 14px; }
.ba-sheet.small { width: min(520px, 100%); }
.ba-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 2px 2px 14px; }
.ba-sheet-head h2 { margin: 0; color: var(--text,#111827); font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p { margin: 4px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; }
.ba-sheet-head button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; }
.ba-form { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; }
.ba-form label { display: grid; gap: 6px; }
.ba-form span { color: var(--muted, var(--text)); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.ba-sheet-actions button { min-height: 40px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 14px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-sheet-actions button.primary { border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; min-height: 60px; display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 10px; align-items: center; text-align: left; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 10px; background: var(--surface,#fff); color: var(--text,#111827); cursor: pointer; }
.ba-menu-list button > span { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb,var(--ba-primary) 10%,transparent); color: var(--ba-primary); font-weight: 1000; }
.ba-menu-list b, .ba-menu-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list b { font-size: 13px; font-weight: 1000; }
.ba-menu-list small { margin-top: 2px; color: var(--muted, var(--text)); font-size: 11px; font-weight: 750; }
.ba-menu-list button.active { border-color: color-mix(in srgb,var(--ba-primary) 45%,var(--border,rgba(0,0,0,.10))); background: color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff)); }
.ba-menu-list button.danger b { color: #dc2626; }
@media (min-width: 680px) { .ba-page { padding: calc(12px * var(--local-density-scale,1)); } .ba-list { grid-template-columns: repeat(2,minmax(0,1fr)); } .ba-analysis-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .ba-form.compact { grid-template-columns: repeat(2,minmax(0,1fr)); } .ba-sheet-backdrop { place-items: center; padding: 18px; } }
@media (min-width: 1040px) { .ba-page { padding: calc(16px * var(--local-density-scale,1)); } .ba-search-card, .ba-filter-chips, .ba-list, .ba-analysis-grid { width: min(1180px, 100%); margin-left: auto; margin-right: auto; } .ba-list { grid-template-columns: repeat(3,minmax(0,1fr)); } .attendance-analysis-grid { grid-template-columns: repeat(4,minmax(0,1fr)); } }
@media (max-width: 560px) { .ba-page { padding: calc(6px * var(--local-density-scale,1)); } .ba-search-card { grid-template-columns: auto minmax(0,1fr) auto auto; } .ba-icon-button { display: grid; } .ba-save-inline { min-width: 48px; padding: 0 9px; } .attendance-row { grid-template-columns: auto minmax(0,1fr); align-items: start; } .attendance-status-actions { grid-column: 1 / -1; grid-template-columns: repeat(4,minmax(0,1fr)) auto; width: 100%; } .attendance-status-actions button { width: 100%; } .attendance-status-actions .status-dot-mini { grid-column: 5; align-self: center; margin-top: 0; } .ba-sheet-actions { display: grid; grid-template-columns: 1fr; } }
`;
