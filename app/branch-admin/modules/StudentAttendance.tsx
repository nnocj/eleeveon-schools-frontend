"use client";

/**
 * app/branch-admin/modules/StudentAttendance.tsx
 * --------------------------------------------------------------------------
 * ELEEVEON STUDENT ATTENDANCE — PHASE 10 ROUTE INTEGRATION
 *
 * Route responsibilities:
 * - active account, school, branch and membership resolution;
 * - permissions, navigation and loading states;
 * - Dexie reads and local-first mutations;
 * - tenant filtering and route-specific state.
 *
 * Visual standard:
 * - compact search toolbar;
 * - no permanent title, hero, mode row or summary cards;
 * - setup lives in the slider sheet;
 * - views and bulk actions live in the More sheet;
 * - compact row cards, table and analytics modes.
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
  type StudentAttendanceSummary,
  type StudentEnrollment,
} from "../../lib/db/db";

import {
  createLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { PermissionGate } from "../../components/shared/PermissionGate";

import * as XLSX from "xlsx";

import ExcelFilePicker from "../../components/excel/ExcelFilePicker";
import ExcelColumnMappingEditor from "../../components/excel/ExcelColumnMapping";
import ExcelImportPreview from "../../components/excel/ExcelImportPreview";
import ExcelImportSheet, {
  type ExcelImportStep,
} from "../../components/excel/ExcelImportSheet";
import ExcelExportSheet from "../../components/excel/ExcelExportSheet";

import type {
  ExcelColumnMapping,
  ExcelParsedSheet,
  ExcelSourceColumn,
  ParsedExcelWorkbook,
} from "../../lib/excel/excelTypes";

import {
  autoMapExcelColumns,
} from "../../lib/excel/excelColumnMapper";

import {
  detectLikelyHeaderRow,
  downloadExcelWorkbook,
  sheetToRecords,
} from "../../lib/excel/excelWorkbook";

import {
  ATTENDANCE_DAILY_FIELDS,
  ATTENDANCE_TERM_FIELDS,
  detectAttendanceDailyLayout,
  parseDailyAttendanceSheet,
  parseTermAttendanceSheet,
} from "../../lib/excel/attendance/attendanceExcelParser";

import {
  validateDailyAttendanceImport,
  validateTermAttendanceImport,
} from "../../lib/excel/attendance/attendanceExcelValidator";

import {
  getAttendanceExcelReferenceData,
  importDailyAttendance,
  importTermAttendance,
} from "../../lib/excel/attendance/attendanceExcelImporter";

import {
  buildAttendanceRegisterTemplate,
  buildDailyAttendanceTemplate,
  buildTermAttendanceTemplate,
} from "../../lib/excel/attendance/attendanceExcelTemplate";

import type {
  AttendanceExcelDailyValidationResult,
  AttendanceExcelImportResult,
  AttendanceExcelTermValidationResult,
} from "../../lib/excel/attendance/attendanceExcelTypes";

type EntryMode = "daily" | "termTotals";
type ViewMode = "cards" | "table" | "analytics";
type AttendanceStatus = "present" | "absent" | "late";
type AttendanceFilter = "all" | AttendanceStatus | "unmarked";
type ToastTone = "success" | "error" | "info";
type BulkScope = "all" | "shown";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string | null;
};

type WorkspaceSession = {
  membership?: Record<string, unknown> | null;
  schoolId?: string | null;
  branchId?: string | null;
};

type DailyDraftMap = Record<string, AttendanceStatus | undefined>;

type TermDraft = {
  daysOpened: number;
  daysPresent: number;
  daysAbsent: number;
  timesLate: number;
  attendancePercent: number;
};

type TermDraftMap = Record<string, TermDraft>;

type StudentView = {
  student: Student;
  id: string;
  name: string;
  admissionNumber: string;
  photo?: string;
  existingAttendance?: Attendance;
  existingSummary?: StudentAttendanceSummary;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";
const todayISO = () => new Date().toISOString().slice(0, 10);
const idOf = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const sameId = (a: unknown, b: unknown) => idOf(a) === idOf(b);
const tableSafe = (name: string) => (db as any)[name];

function storageValue(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(key) ||
      window.sessionStorage.getItem(key)
    );
  } catch {
    return null;
  }
}

function storedJson<T>(key: string): T | null {
  const raw = storageValue(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function firstId(...values: unknown[]) {
  for (const value of values) {
    const id = idOf(value);
    if (id && id !== "0") return id;
  }
  return "";
}

function isActive(row: TenantRow) {
  const status = String(row.status || "").toLowerCase();
  return (
    !row.isDeleted &&
    row.active !== false &&
    !["inactive", "deleted", "archived", "suspended"].includes(status)
  );
}

function clamp(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function percent(present: number, opened: number) {
  return opened
    ? Math.max(0, Math.min(100, Math.round((present / opened) * 100)))
    : 0;
}

function safePhoto(value: unknown) {
  const url = String(value || "");
  return !url || url.startsWith("blob:") || url.startsWith("data:image/")
    ? undefined
    : url;
}

function normalizeTermDraft(value?: Partial<TermDraft>): TermDraft {
  const daysOpened = clamp(value?.daysOpened);
  const daysPresent = Math.min(
    daysOpened || Number.MAX_SAFE_INTEGER,
    clamp(value?.daysPresent),
  );

  return {
    daysOpened,
    daysPresent,
    daysAbsent: Math.max(0, daysOpened - daysPresent),
    timesLate: clamp(value?.timesLate),
    attendancePercent: percent(daysPresent, daysOpened),
  };
}

function statusLabel(status?: AttendanceStatus) {
  if (!status) return "Unmarked";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status?: AttendanceStatus) {
  if (status === "present") return "green";
  if (status === "absent") return "red";
  if (status === "late") return "orange";
  return "gray";
}

export default function StudentAttendance() {
  const router = useRouter();
  const revision = useDataRevision();
  const { loading, setLoading } = useBackgroundLoader();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const {
    settings,
    loading: settingsLoading,
  } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(
    () => storedJson<WorkspaceSession>(OPEN_WORKSPACE_KEY),
    [],
  );

  const storedMembership = useMemo(
    () => storedJson<Record<string, unknown>>("activeMembership"),
    [],
  );

  const membership = (
    openWorkspace?.membership ||
    activeMembership ||
    storedMembership ||
    {}
  ) as Record<string, unknown>;

  const schoolId = firstId(
    openWorkspace?.schoolId,
    membership.schoolId,
    (membership.school as { id?: unknown } | undefined)?.id,
    activeSchoolId,
    (activeSchool as { id?: unknown } | null)?.id,
    (settings as { schoolId?: unknown } | null)?.schoolId,
    storageValue("activeSchoolId"),
  );

  const branchId = firstId(
    openWorkspace?.branchId,
    membership.branchId,
    membership.schoolBranchId,
    (membership.branch as { id?: unknown } | undefined)?.id,
    activeBranchId,
    (activeBranch as { id?: unknown } | null)?.id,
    (settings as { branchId?: unknown } | null)?.branchId,
    storageValue("activeBranchId"),
  );

  const primary =
    settings?.primaryColor || "var(--primary-color, #2563eb)";

  const permissionValues = useMemo(() => {
    const raw = membership.permissions;
    if (Array.isArray(raw)) return raw.map(String);
    if (raw && typeof raw === "object") {
      return Object.entries(raw)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key);
    }
    return [];
  }, [membership.permissions]);

  const role = String(membership.role || "").toLowerCase();
  const roleCanManage = [
    "owner",
    "super_admin",
    "admin",
    "branch_admin",
    "teacher",
  ].includes(role);

  const canView =
    roleCanManage ||
    permissionValues.some((permission) =>
      [
        "attendance.view",
        "attendance.read",
        "attendance.manage",
        "student_attendance.view",
      ].includes(permission),
    );

  const canEdit =
    roleCanManage ||
    permissionValues.some((permission) =>
      [
        "attendance.manage",
        "attendance.write",
        "student_attendance.manage",
      ].includes(permission),
    );

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [structures, setStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);
  const [summaryRows, setSummaryRows] =
    useState<StudentAttendanceSummary[]>([]);

  const [entryMode, setEntryMode] = useState<EntryMode>("daily");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [structureId, setStructureId] = useState(
    String(settings?.currentAcademicStructureId || ""),
  );
  const [periodId, setPeriodId] = useState(
    String(settings?.currentAcademicPeriodId || ""),
  );
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AttendanceFilter>("all");

  const [dailyDrafts, setDailyDrafts] = useState<DailyDraftMap>({});
  const [termDrafts, setTermDrafts] = useState<TermDraftMap>({});
  const [bulkDaysOpened, setBulkDaysOpened] = useState("");
  const [bulkScope, setBulkScope] = useState<BulkScope>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  // ------------------------------------------------------
  // Excel interoperability workflow
  // ------------------------------------------------------
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [excelExportOpen, setExcelExportOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelWorkbook, setExcelWorkbook] =
    useState<ParsedExcelWorkbook | null>(null);
  const [excelSheetName, setExcelSheetName] = useState("");
  const [excelHeaderRowIndex, setExcelHeaderRowIndex] = useState(0);
  const [excelColumns, setExcelColumns] = useState<ExcelSourceColumn[]>([]);
  const [excelMappings, setExcelMappings] = useState<ExcelColumnMapping[]>([]);
  const [excelImportStep, setExcelImportStep] =
    useState<ExcelImportStep>("file");
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelDailyValidation, setExcelDailyValidation] =
    useState<AttendanceExcelDailyValidationResult | null>(null);
  const [excelTermValidation, setExcelTermValidation] =
    useState<AttendanceExcelTermValidationResult | null>(null);
  const [excelImportResult, setExcelImportResult] =
    useState<AttendanceExcelImportResult | null>(null);
  const [excelExportBusyKey, setExcelExportBusyKey] =
    useState<string | null>(null);
  const [excelRegisterStartDate, setExcelRegisterStartDate] = useState(date);
  const [excelRegisterEndDate, setExcelRegisterEndDate] = useState(date);

  const mediaByStudentId = useEntityMediaUrls({
    accountId,
    ownerTable: "students",
    rows: students,
    fields: [
      { fieldKey: "photo", mediaIdKey: "photoMediaId" },
      { fieldKey: "coverPhoto", mediaIdKey: "coverPhotoMediaId" },
    ],
  });

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const notify = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setToast((current) =>
          current?.message === message ? null : current,
        );
      }, 4200);
    }
  };

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setStructures([]);
    setPeriods([]);
    setEnrollments([]);
    setAttendanceRows([]);
    setSummaryRows([]);
  };

  const load = async () => {
    if (
      !authenticated ||
      !accountId ||
      !schoolId ||
      !branchId ||
      !canView
    ) {
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
        summaryData,
      ] = await Promise.all([
        tableSafe("students")?.toArray?.() || [],
        tableSafe("classes")?.toArray?.() || [],
        tableSafe("academicStructures")?.toArray?.() || [],
        tableSafe("academicPeriods")?.toArray?.() || [],
        tableSafe("studentEnrollments")?.toArray?.() || [],
        tableSafe("attendance")?.toArray?.() || [],
        tableSafe("studentAttendanceSummaries")?.toArray?.() || [],
      ]);

      setStudents(
        (studentRows as Student[])
          .filter(
            (row: any) =>
              sameTenant(row) &&
              !["withdrawn", "graduated"].includes(
                String(row.status || "").toLowerCase(),
              ),
          )
          .sort((a: any, b: any) =>
            String(a.fullName || "").localeCompare(
              String(b.fullName || ""),
            ),
          ),
      );

      setClasses(
        (classRows as Class[])
          .filter((row: any) => sameTenant(row) && isActive(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setStructures(
        (structureRows as AcademicStructure[])
          .filter((row: any) => sameTenant(row) && isActive(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );

      setPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row: any) => sameTenant(row) && isActive(row))
          .sort(
            (a: any, b: any) =>
              Number(a.order || 0) - Number(b.order || 0),
          ),
      );

      setEnrollments(
        (enrollmentRows as StudentEnrollment[]).filter((row: any) =>
          sameTenant(row),
        ),
      );

      setAttendanceRows(
        (attendanceData as Attendance[]).filter((row: any) =>
          sameTenant(row),
        ),
      );

      setSummaryRows(
        (summaryData as StudentAttendanceSummary[]).filter((row: any) =>
          sameTenant(row),
        ),
      );
    } catch (error) {
      console.error("Failed to load student attendance:", error);
      clearData();
      notify("error", "Failed to load student attendance.");
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    revision,
    canView,
  ]);

  useEffect(() => {
    if (!structureId && settings?.currentAcademicStructureId) {
      setStructureId(String(settings.currentAcademicStructureId));
    }
    if (!periodId && settings?.currentAcademicPeriodId) {
      setPeriodId(String(settings.currentAcademicPeriodId));
    }
  }, [
    structureId,
    periodId,
    settings?.currentAcademicStructureId,
    settings?.currentAcademicPeriodId,
  ]);

  const studentMap = useMemo(
    () =>
      new Map(
        students.map((row: any) => [idOf(row.id), row]),
      ),
    [students],
  );

  const classMap = useMemo(
    () =>
      new Map(
        classes.map((row: any) => [idOf(row.id), row]),
      ),
    [classes],
  );

  const structureMap = useMemo(
    () =>
      new Map(
        structures.map((row: any) => [idOf(row.id), row]),
      ),
    [structures],
  );

  const periodMap = useMemo(
    () =>
      new Map(
        periods.map((row: any) => [idOf(row.id), row]),
      ),
    [periods],
  );

  const filteredPeriods = useMemo(
    () =>
      structureId
        ? periods.filter((row: any) =>
            sameId(row.academicStructureId, structureId),
          )
        : periods,
    [periods, structureId],
  );

  const attendanceByStudent = useMemo(() => {
    const map = new Map<string, Attendance>();

    attendanceRows.forEach((row: any) => {
      if (
        row.isDeleted ||
        !sameId(row.classId, classId) ||
        !sameId(row.academicStructureId, structureId) ||
        !sameId(row.academicPeriodId, periodId) ||
        row.date !== date
      ) {
        return;
      }

      map.set(idOf(row.studentId), row);
    });

    return map;
  }, [
    attendanceRows,
    classId,
    structureId,
    periodId,
    date,
  ]);

  const summaryByStudent = useMemo(() => {
    const map = new Map<string, StudentAttendanceSummary>();

    summaryRows.forEach((row: any) => {
      if (
        row.isDeleted ||
        !sameId(row.classId, classId) ||
        !sameId(row.academicStructureId, structureId) ||
        !sameId(row.academicPeriodId, periodId)
      ) {
        return;
      }

      map.set(idOf(row.studentId), row);
    });

    return map;
  }, [
    summaryRows,
    classId,
    structureId,
    periodId,
  ]);

  const studentViews = useMemo<StudentView[]>(() => {
    if (!structureId || !periodId || !classId) return [];

    const seen = new Set<string>();
    const result: StudentView[] = [];

    enrollments.forEach((enrollment: any) => {
      if (
        enrollment.isDeleted ||
        enrollment.status !== "active" ||
        !sameId(enrollment.classId, classId) ||
        !sameId(enrollment.academicStructureId, structureId) ||
        !sameId(enrollment.academicPeriodId, periodId)
      ) {
        return;
      }

      const student = studentMap.get(idOf(enrollment.studentId)) as
        | Student
        | undefined;

      if (!student) return;

      const studentAny = student as any;
      const id = idOf(studentAny.id);
      if (!id || seen.has(id)) return;
      seen.add(id);

      result.push({
        student,
        id,
        name: studentAny.fullName || "Unnamed student",
        admissionNumber:
          studentAny.admissionNumber || "No admission number",
        photo:
          mediaByStudentId[id]?.photo ||
          safePhoto(studentAny.photo),
        existingAttendance: attendanceByStudent.get(id),
        existingSummary: summaryByStudent.get(id),
      });
    });

    students.forEach((student: any) => {
      const id = idOf(student.id);

      if (
        !id ||
        seen.has(id) ||
        !sameId(student.currentClassId, classId) ||
        !isActive(student)
      ) {
        return;
      }

      seen.add(id);

      result.push({
        student,
        id,
        name: student.fullName || "Unnamed student",
        admissionNumber:
          student.admissionNumber || "No admission number",
        photo:
          mediaByStudentId[id]?.photo ||
          safePhoto(student.photo),
        existingAttendance: attendanceByStudent.get(id),
        existingSummary: summaryByStudent.get(id),
      });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    structureId,
    periodId,
    classId,
    enrollments,
    students,
    studentMap,
    mediaByStudentId,
    attendanceByStudent,
    summaryByStudent,
  ]);

  useEffect(() => {
    const next: DailyDraftMap = {};
    studentViews.forEach((item) => {
      const status = (item.existingAttendance as any)?.status;
      if (["present", "absent", "late"].includes(status)) {
        next[item.id] = status as AttendanceStatus;
      }
    });
    setDailyDrafts(next);
  }, [studentViews]);

  useEffect(() => {
    const next: TermDraftMap = {};
    studentViews.forEach((item) => {
      const row = item.existingSummary as any;
      next[item.id] = normalizeTermDraft({
        daysOpened: row?.daysOpened,
        daysPresent: row?.daysPresent,
        daysAbsent: row?.daysAbsent,
        timesLate: row?.timesLate,
        attendancePercent: row?.attendancePercent,
      });
    });
    setTermDrafts(next);
  }, [studentViews]);

  const selectedClassName =
    (classMap.get(classId) as any)?.name ||
    (classId ? "Selected class" : "Select a class");

  const selectedStructureName =
    (structureMap.get(structureId) as any)?.name ||
    (structureId ? "Selected structure" : "");

  const selectedPeriodName =
    (periodMap.get(periodId) as any)?.name ||
    (periodId ? "Selected period" : "");

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentViews.filter((item) => {
      if (entryMode === "daily") {
        const status = dailyDrafts[item.id];

        if (statusFilter === "unmarked" && status) return false;

        if (
          ["present", "absent", "late"].includes(statusFilter) &&
          status !== statusFilter
        ) {
          return false;
        }
      }

      if (!query) return true;

      return `${item.name} ${item.admissionNumber}`
        .toLowerCase()
        .includes(query);
    });
  }, [
    studentViews,
    search,
    entryMode,
    dailyDrafts,
    statusFilter,
  ]);

  const dailySummary = useMemo(() => {
    const total = studentViews.length;
    const present = studentViews.filter(
      (item) => dailyDrafts[item.id] === "present",
    ).length;
    const absent = studentViews.filter(
      (item) => dailyDrafts[item.id] === "absent",
    ).length;
    const late = studentViews.filter(
      (item) => dailyDrafts[item.id] === "late",
    ).length;
    const marked = present + absent + late;

    return {
      total,
      present,
      absent,
      late,
      marked,
      unmarked: Math.max(0, total - marked),
      completion: total ? Math.round((marked / total) * 100) : 0,
      attendanceRate: total ? Math.round((present / total) * 100) : 0,
    };
  }, [studentViews, dailyDrafts]);

  const termSummary = useMemo(() => {
    const drafts = studentViews.map(
      (item) => termDrafts[item.id] || normalizeTermDraft(),
    );

    const completed = drafts.filter(
      (draft) => draft.daysOpened > 0,
    ).length;

    const totalOpened = drafts.reduce(
      (sum, draft) => sum + draft.daysOpened,
      0,
    );

    const totalPresent = drafts.reduce(
      (sum, draft) => sum + draft.daysPresent,
      0,
    );

    return {
      total: drafts.length,
      completed,
      missing: Math.max(0, drafts.length - completed),
      average: totalOpened
        ? Math.round((totalPresent / totalOpened) * 100)
        : 0,
      opened: totalOpened,
      present: totalPresent,
      absent: drafts.reduce(
        (sum, draft) => sum + draft.daysAbsent,
        0,
      ),
      late: drafts.reduce(
        (sum, draft) => sum + draft.timesLate,
        0,
      ),
    };
  }, [studentViews, termDrafts]);

  const activeFilterCount = [
    structureId,
    periodId,
    classId,
    entryMode === "daily" ? date : "",
    entryMode === "daily" && statusFilter !== "all"
      ? statusFilter
      : "",
  ].filter(Boolean).length;

  const setDailyStatus = (
    studentId: string,
    status: AttendanceStatus,
  ) => {
    setDailyDrafts((current) => ({
      ...current,
      [studentId]: status,
    }));
  };

  const clearDailyStatus = (studentId: string) => {
    setDailyDrafts((current) => {
      const next = { ...current };
      delete next[studentId];
      return next;
    });
  };

  const updateTermDraft = (
    studentId: string,
    field: "daysOpened" | "daysPresent" | "timesLate",
    rawValue: unknown,
  ) => {
    setTermDrafts((current) => {
      const previous =
        current[studentId] || normalizeTermDraft();

      const next = normalizeTermDraft({
        ...previous,
        [field]: clamp(rawValue),
      });

      return {
        ...current,
        [studentId]: next,
      };
    });
  };

  const applyBulkDaysOpened = () => {
    const daysOpened = clamp(bulkDaysOpened);

    if (!classId || !structureId || !periodId) {
      notify(
        "error",
        "Select an academic structure, period and class first.",
      );
      return;
    }

    if (!daysOpened) {
      notify("error", "Enter a valid number of days opened.");
      return;
    }

    const target =
      bulkScope === "shown" ? visibleStudents : studentViews;

    if (!target.length) {
      notify("info", "There are no students to update.");
      return;
    }

    setTermDrafts((current) => {
      const next = { ...current };

      target.forEach((item) => {
        const previous =
          next[item.id] || normalizeTermDraft();

        next[item.id] = normalizeTermDraft({
          ...previous,
          daysOpened,
          daysPresent: Math.min(
            previous.daysPresent,
            daysOpened,
          ),
        });
      });

      return next;
    });

    notify(
      "success",
      `Days opened applied to ${target.length} ${
        target.length === 1 ? "student" : "students"
      }.`,
    );
  };

  const saveDaily = async () => {
    for (const item of studentViews) {
      const status = dailyDrafts[item.id];
      const existing = attendanceByStudent.get(item.id) as any;

      if (!status) {
        if (existing?.id) {
          await softDeleteLocal(
            "attendance",
            idOf(existing.id),
          );
        }
        continue;
      }

      const payload: Partial<Attendance> = {
        accountId: accountId ?? undefined,
        schoolId,
        branchId,
        studentId: item.id,
        classId,
        academicStructureId: structureId,
        academicPeriodId: periodId,
        date,
        status,
        isDeleted: false,
      };

      if (existing?.id) {
        await updateLocal(
          "attendance",
          idOf(existing.id),
          payload,
        );
      } else {
        await createLocal(
          "attendance",
          payload as Attendance,
        );
      }
    }
  };

  const saveTerm = async () => {
    for (const item of studentViews) {
      const draft =
        termDrafts[item.id] || normalizeTermDraft();

      const existing = summaryByStudent.get(item.id) as any;

      if (
        !draft.daysOpened &&
        !draft.daysPresent &&
        !draft.timesLate
      ) {
        if (existing?.id) {
          await softDeleteLocal(
            "studentAttendanceSummaries",
            idOf(existing.id),
          );
        }
        continue;
      }

      if (draft.daysPresent > draft.daysOpened) {
        throw new Error(
          `${item.name} has more days present than days opened.`,
        );
      }

      const payload: Partial<StudentAttendanceSummary> = {
        accountId: accountId ?? undefined,
        schoolId,
        branchId,
        studentId: item.id,
        classId,
        academicStructureId: structureId,
        academicPeriodId: periodId,
        entryMode: "manual",
        daysOpened: draft.daysOpened,
        daysPresent: draft.daysPresent,
        daysAbsent: Math.max(
          0,
          draft.daysOpened - draft.daysPresent,
        ),
        timesLate: draft.timesLate,
        attendancePercent: percent(
          draft.daysPresent,
          draft.daysOpened,
        ),
        active: true,
        isDeleted: false,
      } as Partial<StudentAttendanceSummary>;

      if (existing?.id) {
        await updateLocal(
          "studentAttendanceSummaries",
          idOf(existing.id),
          payload,
        );
      } else {
        await createLocal(
          "studentAttendanceSummaries",
          payload as StudentAttendanceSummary,
        );
      }
    }
  };

  const save = async () => {
    if (!canEdit) {
      notify(
        "error",
        "You do not have permission to edit attendance.",
      );
      return;
    }

    if (!authenticated || !accountId) {
      notify("error", "Sign in first.");
      return;
    }

    if (!schoolId || !branchId) {
      notify("error", "Select a school branch first.");
      return;
    }

    if (!structureId) {
      notify("error", "Select an academic structure.");
      return;
    }

    if (!periodId) {
      notify("error", "Select an academic period.");
      return;
    }

    if (!classId) {
      notify("error", "Select a class.");
      return;
    }

    if (entryMode === "daily" && !date) {
      notify("error", "Select a date.");
      return;
    }

    try {
      setSaving(true);

      if (entryMode === "daily") {
        await saveDaily();
      } else {
        await saveTerm();
      }

      await load();

      notify(
        "success",
        entryMode === "daily"
          ? "Daily attendance saved successfully."
          : "Term attendance totals saved successfully.",
      );
    } catch (error) {
      console.error("Failed to save attendance:", error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to save attendance.",
      );
    } finally {
      setSaving(false);
    }
  };


  // ======================================================
  // EXCEL INTEROPERABILITY
  // ======================================================

  const attendanceExcelContext = () => {
    if (!accountId || !schoolId || !branchId) {
      throw new Error("Select an account and branch first.");
    }

    if (!structureId || !periodId || !classId) {
      throw new Error(
        "Select an academic structure, academic period and class first.",
      );
    }

    return {
      accountId: String(accountId),
      schoolId,
      branchId,
      classId,
      academicStructureId: structureId,
      academicPeriodId: periodId,
      date: entryMode === "daily" ? date : undefined,
    };
  };

  const attendanceExcelTemplateContext = () => {
    const context = attendanceExcelContext();

    return {
      ...context,
      schoolName:
        String(
          (activeSchool as { name?: unknown } | null)?.name ||
            "",
        ) || undefined,
      branchName:
        String(
          (activeBranch as { name?: unknown } | null)?.name ||
            "",
        ) || undefined,
      className: selectedClassName,
      academicStructureName: selectedStructureName || undefined,
      academicPeriodName: selectedPeriodName || undefined,
    };
  };

  const attendanceExcelStudents = () =>
    studentViews.map((item) => ({
      id: item.id,
      admissionNumber:
        (item.student as any)?.admissionNumber || undefined,
      fullName: item.name,
    }));

  const resetAttendanceExcelImport = () => {
    setExcelFile(null);
    setExcelWorkbook(null);
    setExcelSheetName("");
    setExcelHeaderRowIndex(0);
    setExcelColumns([]);
    setExcelMappings([]);
    setExcelDailyValidation(null);
    setExcelTermValidation(null);
    setExcelImportResult(null);
    setExcelImportStep("file");
    setExcelBusy(false);
  };

  const closeAttendanceExcelImport = () => {
    if (excelBusy) return;
    setExcelImportOpen(false);
    resetAttendanceExcelImport();
  };

  const openAttendanceExcelImport = () => {
    try {
      attendanceExcelContext();
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Choose the attendance context first.",
      );
      setFilterOpen(true);
      return;
    }

    if (!canEdit) {
      notify("error", "You do not have permission to import attendance.");
      return;
    }

    setMoreOpen(false);
    resetAttendanceExcelImport();
    setExcelImportOpen(true);
  };

  const openAttendanceExcelExport = () => {
    try {
      attendanceExcelContext();
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Choose the attendance context first.",
      );
      setFilterOpen(true);
      return;
    }

    setMoreOpen(false);
    setExcelRegisterStartDate(date || todayISO());
    setExcelRegisterEndDate(date || todayISO());
    setExcelExportOpen(true);
  };

  const parseWorkbookFile = async (
    file: File,
  ): Promise<ParsedExcelWorkbook> => {
    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });

    const sheets: ExcelParsedSheet[] = workbook.SheetNames.map(
      (sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];

        const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          raw: true,
          defval: null,
        }) as unknown[][];

        const rows = matrix.map((row) =>
          row.map((value) => {
            if (
              value === null ||
              value === undefined ||
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              value instanceof Date
            ) {
              return value;
            }

            return String(value);
          }),
        );

        const columnCount = rows.reduce(
          (maximum, row) => Math.max(maximum, row.length),
          0,
        );

        return {
          name: sheetName,
          index,
          rows,
          rowCount: rows.length,
          columnCount,
        };
      },
    );

    return {
      fileName: file.name,
      sheetNames: workbook.SheetNames,
      sheets,
    };
  };

  const selectedExcelSheet = () => {
    if (!excelWorkbook) return null;

    return (
      excelWorkbook.sheets.find(
        (sheet) => sheet.name === excelSheetName,
      ) ||
      excelWorkbook.sheets[0] ||
      null
    );
  };

  const prepareAttendanceExcelMapping = (
    sheet: ExcelParsedSheet,
    requestedHeaderRowIndex?: number,
  ) => {
    const headerRowIndex =
      requestedHeaderRowIndex ??
      detectLikelyHeaderRow(sheet);

    const extracted = sheetToRecords(sheet, {
      headerRowIndex,
      skipEmptyRows: true,
      trimStrings: true,
    });

    let fields = ATTENDANCE_TERM_FIELDS;

    if (entryMode === "daily") {
      const layout = detectAttendanceDailyLayout(extracted.columns);

      fields =
        layout === "grid"
          ? ATTENDANCE_DAILY_FIELDS.filter(
              (field) =>
                field.key !== "date" &&
                field.key !== "status",
            )
          : ATTENDANCE_DAILY_FIELDS;
    }

    const mappings = autoMapExcelColumns(
      extracted.columns,
      fields,
    );

    setExcelHeaderRowIndex(headerRowIndex);
    setExcelColumns(extracted.columns);
    setExcelMappings(mappings);
  };

  const handleAttendanceExcelFile = async (file: File | null) => {
    setExcelFile(file);
    setExcelWorkbook(null);
    setExcelSheetName("");
    setExcelColumns([]);
    setExcelMappings([]);
    setExcelDailyValidation(null);
    setExcelTermValidation(null);
    setExcelImportResult(null);

    if (!file) {
      setExcelImportStep("file");
      return;
    }

    try {
      setExcelBusy(true);

      const parsed = await parseWorkbookFile(file);

      if (!parsed.sheets.length) {
        throw new Error("This workbook does not contain any worksheets.");
      }

      const firstSheet =
        parsed.sheets.find(
          (sheet) =>
            !sheet.name.toLowerCase().startsWith("_eleeveon_"),
        ) ||
        parsed.sheets[0];

      setExcelWorkbook(parsed);
      setExcelSheetName(firstSheet.name);
      prepareAttendanceExcelMapping(firstSheet);
      setExcelImportStep("sheet");
    } catch (error) {
      console.error("Failed to read attendance workbook:", error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to read the Excel workbook.",
      );
      setExcelFile(null);
    } finally {
      setExcelBusy(false);
    }
  };

  const continueAttendanceExcelToMapping = () => {
    const sheet = selectedExcelSheet();

    if (!sheet) {
      notify("error", "Choose a worksheet first.");
      return;
    }

    try {
      prepareAttendanceExcelMapping(
        sheet,
        excelHeaderRowIndex,
      );
      setExcelImportStep("mapping");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Could not prepare the worksheet columns.",
      );
    }
  };

  const previewAttendanceExcelImport = async () => {
    const sheet = selectedExcelSheet();

    if (!sheet) {
      notify("error", "Choose a worksheet first.");
      return;
    }

    try {
      setExcelBusy(true);

      const context = attendanceExcelContext();
      const reference =
        await getAttendanceExcelReferenceData(context);

      if (entryMode === "daily") {
        const parsed = parseDailyAttendanceSheet({
          sheet,
          headerRowIndex: excelHeaderRowIndex,
          mappings: excelMappings,
          defaultDate: date,
          ignoreBlankStatuses: true,
        });

        const validation =
          validateDailyAttendanceImport({
            records: parsed.records,
            rowNumbers: parsed.rowNumbers,
            context,
            students: reference.students,
            enrollments: reference.enrollments,
          });

        setExcelDailyValidation(validation);
        setExcelTermValidation(null);
      } else {
        const parsed = parseTermAttendanceSheet({
          sheet,
          headerRowIndex: excelHeaderRowIndex,
          mappings: excelMappings,
        });

        const validation =
          validateTermAttendanceImport({
            records: parsed.records,
            rowNumbers: parsed.rowNumbers,
            context,
            students: reference.students,
            enrollments: reference.enrollments,
          });

        setExcelTermValidation(validation);
        setExcelDailyValidation(null);
      }

      setExcelImportStep("preview");
    } catch (error) {
      console.error("Failed to preview attendance import:", error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to validate the attendance workbook.",
      );
    } finally {
      setExcelBusy(false);
    }
  };

  const commitAttendanceExcelImport = async () => {
    try {
      setExcelBusy(true);

      const context = attendanceExcelContext();

      let result: AttendanceExcelImportResult;

      if (entryMode === "daily") {
        if (!excelDailyValidation) {
          throw new Error("Preview the daily attendance import first.");
        }

        result = await importDailyAttendance(
          excelDailyValidation,
          context,
        );
      } else {
        if (!excelTermValidation) {
          throw new Error("Preview the term attendance import first.");
        }

        result = await importTermAttendance(
          excelTermValidation,
          context,
        );
      }

      setExcelImportResult(result);
      setExcelImportStep("result");

      await load();

      notify(
        result.failed
          ? "info"
          : "success",
        `Excel import finished: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped${
          result.failed ? `, ${result.failed} failed` : ""
        }.`,
      );
    } catch (error) {
      console.error("Failed to import attendance workbook:", error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to import attendance.",
      );
    } finally {
      setExcelBusy(false);
    }
  };

  const runAttendanceExcelExport = async (
    key: string,
    task: () => void | Promise<void>,
  ) => {
    try {
      setExcelExportBusyKey(key);
      await task();
    } catch (error) {
      console.error("Attendance Excel export failed:", error);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to create the Excel workbook.",
      );
    } finally {
      setExcelExportBusyKey(null);
    }
  };

  const exportCurrentDailyAttendance = () => {
    const context = attendanceExcelTemplateContext();

    const workbook = buildDailyAttendanceTemplate({
      context,
      students: attendanceExcelStudents(),
      date,
    });

    const sheet = workbook.sheets[0];

    sheet.rows = studentViews.map((item) => ({
      studentId: item.id,
      admissionNumber:
        (item.student as any)?.admissionNumber || "",
      studentName: item.name,
      date,
      status: dailyDrafts[item.id] || "",
    })) as any;

    downloadExcelWorkbook(workbook);
  };

  const exportCurrentTermAttendance = () => {
    const context = attendanceExcelTemplateContext();

    const workbook = buildTermAttendanceTemplate({
      context,
      students: attendanceExcelStudents(),
    });

    const sheet = workbook.sheets[0];

    sheet.rows = studentViews.map((item) => {
      const draft =
        termDrafts[item.id] ||
        normalizeTermDraft();

      return {
        studentId: item.id,
        admissionNumber:
          (item.student as any)?.admissionNumber || "",
        studentName: item.name,
        daysOpened: draft.daysOpened,
        daysPresent: draft.daysPresent,
        timesLate: draft.timesLate,
        daysAbsent: draft.daysAbsent,
        attendancePercent: draft.attendancePercent,
      };
    }) as any;

    downloadExcelWorkbook(workbook);
  };

  const downloadBlankAttendanceTemplate = () => {
    const context = attendanceExcelTemplateContext();

    if (entryMode === "daily") {
      downloadExcelWorkbook(
        buildDailyAttendanceTemplate({
          context,
          students: attendanceExcelStudents(),
          date,
        }),
      );
      return;
    }

    downloadExcelWorkbook(
      buildTermAttendanceTemplate({
        context,
        students: attendanceExcelStudents(),
      }),
    );
  };

  const downloadAttendanceRegister = () => {
    if (!excelRegisterStartDate || !excelRegisterEndDate) {
      throw new Error("Choose a start and end date for the register.");
    }

    downloadExcelWorkbook(
      buildAttendanceRegisterTemplate({
        context: attendanceExcelTemplateContext(),
        students: attendanceExcelStudents(),
        startDate: excelRegisterStartDate,
        endDate: excelRegisterEndDate,
      }),
    );
  };

  if (
    accountLoading ||
    contextLoading ||
    settingsLoading ||
    loading
  ) {
    return (
      <RouteState
        primary={primary}
        title="Opening Student Attendance..."
        text="Checking branch, academic context, enrollments and attendance records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <RouteState
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before recording attendance."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <RouteState
        primary={primary}
        title="No branch workspace selected"
        text="Select the correct branch workspace and reopen attendance."
        action={
          <button
            type="button"
            className="ba-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        }
      />
    );
  }

  return (
    <PermissionGate
      allowed={canView}
      fallback={
        <RouteState
          primary={primary}
          title="Attendance access restricted"
          text="Your active membership does not allow you to view student attendance."
        />
      }
    >
      <main
        className="ba-page"
        style={
          {
            "--ba-primary": primary,
          } as React.CSSProperties
        }
      >
        <style>{css}</style>

        {toast ? (
          <section className={`ba-toast ${toast.tone}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </section>
        ) : null}

        <section className="ba-search-card">
          <button
            type="button"
            className={`status-dot-mini ${
              entryMode === "daily"
                ? dailySummary.total &&
                  dailySummary.completion === 100
                  ? "green"
                  : dailySummary.marked
                    ? "orange"
                    : "gray"
                : termSummary.total &&
                    termSummary.completed === termSummary.total
                  ? "green"
                  : termSummary.completed
                    ? "orange"
                    : "gray"
            }`}
            aria-label="Open attendance status"
            onClick={() => setStatusOpen(true)}
          />

          <label className="ba-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={
                entryMode === "daily"
                  ? "Search attendance..."
                  : "Search term totals..."
              }
            />
          </label>

          <button
            type="button"
            className="ba-save-inline"
            onClick={save}
            disabled={saving || !canEdit}
          >
            {saving ? "..." : "Save"}
          </button>

          <button
            type="button"
            className={`ba-filter-button ${
              activeFilterCount ? "active" : ""
            }`}
            onClick={() => setFilterOpen(true)}
            aria-label="Open attendance filters"
          >
            <SliderIcon />
            {activeFilterCount ? (
              <b>{activeFilterCount}</b>
            ) : null}
          </button>

          <button
            type="button"
            className="ba-icon-button"
            onClick={() => setMoreOpen(true)}
            aria-label="Open more actions"
          >
            ⋯
          </button>
        </section>

        {classId || structureId || periodId ? (
          <section className="ba-filter-chips">
            {classId ? (
              <span>Class: {selectedClassName}</span>
            ) : null}
            {structureId ? (
              <span>{selectedStructureName}</span>
            ) : null}
            {periodId ? (
              <span>{selectedPeriodName}</span>
            ) : null}
            {entryMode === "daily" && date ? (
              <span>{date}</span>
            ) : null}
            <span>
              {entryMode === "daily"
                ? "Daily Register"
                : "Term Totals"}
            </span>
          </section>
        ) : null}

        {viewMode === "analytics" ? (
          <AnalyticsView
            entryMode={entryMode}
            daily={dailySummary}
            term={termSummary}
          />
        ) : entryMode === "daily" ? (
          viewMode === "table" ? (
            <DailyTable
              rows={visibleStudents}
              drafts={dailyDrafts}
              setStatus={setDailyStatus}
              clearStatus={clearDailyStatus}
              primary={primary}
              editable={canEdit}
            />
          ) : (
            <section className="ba-list">
              {visibleStudents.map((item) => {
                const status = dailyDrafts[item.id];

                return (
                  <article
                    className="attendance-row"
                    key={item.id}
                  >
                    <Avatar
                      name={item.name}
                      photo={item.photo}
                      primary={primary}
                    />

                    <span className="attendance-main">
                      <strong>{item.name}</strong>
                      <small>{item.admissionNumber}</small>
                      <em>
                        {selectedClassName} · {date}
                      </em>
                    </span>

                    <span className="attendance-status-actions">
                      {(
                        [
                          "present",
                          "absent",
                          "late",
                        ] as AttendanceStatus[]
                      ).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`${value} ${
                            status === value ? "active" : ""
                          }`}
                          disabled={!canEdit}
                          title={statusLabel(value)}
                          onClick={() =>
                            setDailyStatus(item.id, value)
                          }
                        >
                          {value.slice(0, 1).toUpperCase()}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="clear"
                        disabled={!canEdit}
                        title="Clear"
                        onClick={() =>
                          clearDailyStatus(item.id)
                        }
                      >
                        ×
                      </button>

                      <span
                        className={`status-dot-mini ${statusTone(
                          status,
                        )}`}
                      />
                    </span>
                  </article>
                );
              })}
            </section>
          )
        ) : viewMode === "table" ? (
          <TermTable
            rows={visibleStudents}
            drafts={termDrafts}
            updateDraft={updateTermDraft}
            primary={primary}
            editable={canEdit}
          />
        ) : (
          <section className="ba-list">
            {visibleStudents.map((item) => {
              const draft =
                termDrafts[item.id] || normalizeTermDraft();

              return (
                <article className="term-row" key={item.id}>
                  <div className="term-student">
                    <Avatar
                      name={item.name}
                      photo={item.photo}
                      primary={primary}
                    />

                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.admissionNumber}</small>
                    </span>

                    <b>{draft.attendancePercent}%</b>
                  </div>

                  <div className="term-input-grid">
                    <NumberField
                      label="Opened"
                      value={draft.daysOpened}
                      disabled={!canEdit}
                      onChange={(value) =>
                        updateTermDraft(
                          item.id,
                          "daysOpened",
                          value,
                        )
                      }
                    />

                    <NumberField
                      label="Present"
                      value={draft.daysPresent}
                      disabled={!canEdit}
                      onChange={(value) =>
                        updateTermDraft(
                          item.id,
                          "daysPresent",
                          value,
                        )
                      }
                    />

                    <NumberField
                      label="Absent"
                      value={draft.daysAbsent}
                      readOnly
                    />

                    <NumberField
                      label="Late"
                      value={draft.timesLate}
                      disabled={!canEdit}
                      onChange={(value) =>
                        updateTermDraft(
                          item.id,
                          "timesLate",
                          value,
                        )
                      }
                    />
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {!visibleStudents.length ? (
          <section className="ba-empty">
            <div className="ba-empty-icon">📅</div>
            <h3>
              {classId
                ? "No students found"
                : "Select a class"}
            </h3>
            <p>
              {classId
                ? "No students match the current search or filters."
                : "Open the slider filter and choose an academic structure, period and class."}
            </p>
          </section>
        ) : null}

        {filterOpen ? (
          <FilterSheet
            entryMode={entryMode}
            structureId={structureId}
            periodId={periodId}
            classId={classId}
            date={date}
            statusFilter={statusFilter}
            structures={structures}
            periods={filteredPeriods}
            classes={classes}
            bulkDaysOpened={bulkDaysOpened}
            bulkScope={bulkScope}
            onEntryMode={(value) => {
              setEntryMode(value);
              setViewMode("cards");
              if (value === "termTotals") {
                setStatusFilter("all");
              }
            }}
            onStructure={(value) => {
              setStructureId(value);
              setPeriodId("");
              setClassId("");
            }}
            onPeriod={(value) => {
              setPeriodId(value);
              setClassId("");
            }}
            onClass={setClassId}
            onDate={setDate}
            onStatus={setStatusFilter}
            onBulkDaysOpened={setBulkDaysOpened}
            onBulkScope={setBulkScope}
            onApplyBulkDaysOpened={applyBulkDaysOpened}
            onClose={() => setFilterOpen(false)}
          />
        ) : null}

        {moreOpen ? (
          <MoreSheet
            entryMode={entryMode}
            viewMode={viewMode}
            canEdit={canEdit}
            onViewMode={(value) => {
              setViewMode(value);
              setMoreOpen(false);
            }}
            onMarkAll={(status) => {
              setDailyDrafts((current) => {
                const next = { ...current };
                visibleStudents.forEach((item) => {
                  next[item.id] = status;
                });
                return next;
              });
              setMoreOpen(false);
            }}
            onClearShown={() => {
              if (entryMode === "daily") {
                setDailyDrafts((current) => {
                  const next = { ...current };
                  visibleStudents.forEach((item) => {
                    delete next[item.id];
                  });
                  return next;
                });
              } else {
                setTermDrafts((current) => {
                  const next = { ...current };
                  visibleStudents.forEach((item) => {
                    next[item.id] = normalizeTermDraft();
                  });
                  return next;
                });
              }
              setMoreOpen(false);
            }}
            onOpenBulkDays={() => {
              setMoreOpen(false);
              setFilterOpen(true);
            }}
            onImportExcel={openAttendanceExcelImport}
            onExportExcel={openAttendanceExcelExport}
            onRefresh={async () => {
              setMoreOpen(false);
              await load();
            }}
            onClose={() => setMoreOpen(false)}
          />
        ) : null}

        {statusOpen ? (
          <StatusSheet
            entryMode={entryMode}
            daily={dailySummary}
            term={termSummary}
            onClose={() => setStatusOpen(false)}
          />
        ) : null}

        <ExcelImportSheet
          open={excelImportOpen}
          onClose={closeAttendanceExcelImport}
          title={
            entryMode === "daily"
              ? "Import Daily Attendance"
              : "Import Term Attendance"
          }
          subtitle={`${selectedClassName}${
            selectedPeriodName ? ` · ${selectedPeriodName}` : ""
          }`}
          step={excelImportStep}
          busy={excelBusy}
          width={860}
          footer={
            excelImportStep === "file" ? (
              <div className="attendance-excel-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAttendanceExcelImport}
                  disabled={excelBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!excelFile || !excelWorkbook || excelBusy}
                  onClick={() => setExcelImportStep("sheet")}
                >
                  Continue
                </button>
              </div>
            ) : excelImportStep === "sheet" ? (
              <div className="attendance-excel-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setExcelImportStep("file")}
                  disabled={excelBusy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={continueAttendanceExcelToMapping}
                  disabled={!excelSheetName || excelBusy}
                >
                  Match columns
                </button>
              </div>
            ) : excelImportStep === "mapping" ? (
              <div className="attendance-excel-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setExcelImportStep("sheet")}
                  disabled={excelBusy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={previewAttendanceExcelImport}
                  disabled={excelBusy}
                >
                  Preview import
                </button>
              </div>
            ) : excelImportStep === "preview" ? (
              <div className="attendance-excel-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setExcelImportStep("mapping")}
                  disabled={excelBusy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={commitAttendanceExcelImport}
                  disabled={
                    excelBusy ||
                    (entryMode === "daily"
                      ? !excelDailyValidation?.valid
                      : !excelTermValidation?.valid)
                  }
                >
                  Import attendance
                </button>
              </div>
            ) : (
              <div className="attendance-excel-footer">
                <button
                  type="button"
                  className="primary"
                  onClick={closeAttendanceExcelImport}
                  disabled={excelBusy}
                >
                  Done
                </button>
              </div>
            )
          }
        >
          {excelImportStep === "file" ? (
            <div className="attendance-excel-stack">
              <div className="attendance-excel-context">
                <strong>
                  {entryMode === "daily" ? "Daily Register" : "Term Totals"}
                </strong>
                <span>{selectedClassName}</span>
                <span>{selectedPeriodName}</span>
                {entryMode === "daily" ? <span>{date}</span> : null}
              </div>

              <ExcelFilePicker
                value={excelFile}
                onChange={handleAttendanceExcelFile}
                disabled={excelBusy}
                label="Choose attendance workbook"
                description={
                  entryMode === "daily"
                    ? "Use an Eleeveon workbook or an existing daily attendance sheet."
                    : "Use an Eleeveon workbook or an existing term-attendance sheet."
                }
              />

              <div className="attendance-excel-note">
                <strong>Safe import</strong>
                <span>
                  Nothing is changed until the workbook passes validation and
                  you confirm the import.
                </span>
              </div>
            </div>
          ) : null}

          {excelImportStep === "sheet" ? (
            <div className="attendance-excel-stack">
              <label className="attendance-excel-field">
                <span>Worksheet</span>
                <select
                  value={excelSheetName}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setExcelSheetName(nextName);

                    const sheet = excelWorkbook?.sheets.find(
                      (item) => item.name === nextName,
                    );

                    if (sheet) {
                      prepareAttendanceExcelMapping(sheet);
                    }
                  }}
                >
                  {(excelWorkbook?.sheets || []).map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name} · {sheet.rowCount} rows
                    </option>
                  ))}
                </select>
              </label>

              <label className="attendance-excel-field">
                <span>Header row</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(
                    1,
                    selectedExcelSheet()?.rowCount || 1,
                  )}
                  value={excelHeaderRowIndex + 1}
                  onChange={(event) => {
                    const nextIndex = Math.max(
                      0,
                      Number(event.target.value || 1) - 1,
                    );

                    setExcelHeaderRowIndex(nextIndex);

                    const sheet = selectedExcelSheet();
                    if (sheet) {
                      try {
                        prepareAttendanceExcelMapping(sheet, nextIndex);
                      } catch {
                        // Keep the selected row visible. The next step will
                        // show a clear validation error if it is unusable.
                      }
                    }
                  }}
                />
                <small>
                  Eleeveon detected row {excelHeaderRowIndex + 1}. Change it if
                  your column headings are on another row.
                </small>
              </label>

              <div className="attendance-excel-note">
                <strong>
                  {entryMode === "daily"
                    ? "Daily spreadsheet"
                    : "Term totals spreadsheet"}
                </strong>
                <span>
                  {entryMode === "daily"
                    ? "Daily imports can use Student · Date · Status rows or a register with dates across the columns."
                    : "Term totals use Days Opened, Days Present and Times Late. Eleeveon recalculates Days Absent and Attendance %."}
                </span>
              </div>
            </div>
          ) : null}

          {excelImportStep === "mapping" ? (
            <div className="attendance-excel-stack">
              <label className="attendance-excel-field">
                <span>Header row</span>
                <input
                  type="number"
                  min={1}
                  value={excelHeaderRowIndex + 1}
                  onChange={(event) => {
                    const nextIndex = Math.max(
                      0,
                      Number(event.target.value || 1) - 1,
                    );

                    const sheet = selectedExcelSheet();

                    if (!sheet) return;

                    try {
                      prepareAttendanceExcelMapping(sheet, nextIndex);
                    } catch (error) {
                      notify(
                        "error",
                        error instanceof Error
                          ? error.message
                          : "Could not read that header row.",
                      );
                    }
                  }}
                />
              </label>

              <ExcelColumnMappingEditor
                columns={excelColumns}
                fields={
                  entryMode === "daily" &&
                  detectAttendanceDailyLayout(excelColumns) === "grid"
                    ? ATTENDANCE_DAILY_FIELDS.filter(
                        (field) =>
                          field.key !== "date" &&
                          field.key !== "status",
                      )
                    : entryMode === "daily"
                      ? ATTENDANCE_DAILY_FIELDS
                      : ATTENDANCE_TERM_FIELDS
                }
                mappings={excelMappings}
                onChange={setExcelMappings}
                disabled={excelBusy}
                title="Match attendance columns"
                description={
                  entryMode === "daily" &&
                  detectAttendanceDailyLayout(excelColumns) === "grid"
                    ? "The date columns were detected automatically. Match the student identity columns below."
                    : "Confirm which spreadsheet columns correspond to the attendance fields."
                }
              />
            </div>
          ) : null}

          {excelImportStep === "preview" && excelDailyValidation ? (
            <ExcelImportPreview
              validation={excelDailyValidation}
              title="Daily attendance preview"
              description="Check student matches, dates and statuses before importing."
              columns={[
                {
                  key: "studentName",
                  label: "Student",
                },
                {
                  key: "admissionNumber",
                  label: "Admission No.",
                },
                {
                  key: "date",
                  label: "Date",
                },
                {
                  key: "status",
                  label: "Status",
                },
              ]}
            />
          ) : null}

          {excelImportStep === "preview" && excelTermValidation ? (
            <ExcelImportPreview
              validation={excelTermValidation}
              title="Term attendance preview"
              description="Days Absent and Attendance % are recalculated by Eleeveon."
              columns={[
                {
                  key: "studentName",
                  label: "Student",
                },
                {
                  key: "daysOpened",
                  label: "Opened",
                },
                {
                  key: "daysPresent",
                  label: "Present",
                },
                {
                  key: "daysAbsent",
                  label: "Absent",
                },
                {
                  key: "timesLate",
                  label: "Late",
                },
                {
                  key: "attendancePercent",
                  label: "Attendance %",
                  render: (row) => `${row.attendancePercent}%`,
                },
              ]}
            />
          ) : null}

          {excelImportStep === "result" && excelImportResult ? (
            <div className="attendance-excel-result">
              <div className="attendance-excel-result-icon">✓</div>
              <h3>Attendance import complete</h3>
              <p>
                The workbook has been applied through Eleeveon's local-first
                attendance records and will use the normal sync pipeline.
              </p>

              <div className="attendance-excel-result-grid">
                <div>
                  <strong>{excelImportResult.created}</strong>
                  <span>Created</span>
                </div>
                <div>
                  <strong>{excelImportResult.updated}</strong>
                  <span>Updated</span>
                </div>
                <div>
                  <strong>{excelImportResult.skipped}</strong>
                  <span>Skipped</span>
                </div>
                <div>
                  <strong>{excelImportResult.failed}</strong>
                  <span>Failed</span>
                </div>
              </div>
            </div>
          ) : null}
        </ExcelImportSheet>

        <ExcelExportSheet
          open={excelExportOpen}
          onClose={() => {
            if (!excelExportBusyKey) {
              setExcelExportOpen(false);
            }
          }}
          title={
            entryMode === "daily"
              ? "Daily Attendance Excel"
              : "Term Attendance Excel"
          }
          subtitle={`${selectedClassName}${
            selectedPeriodName ? ` · ${selectedPeriodName}` : ""
          }`}
          busyKey={excelExportBusyKey}
          headerContent={
            entryMode === "daily" ? (
              <div className="attendance-excel-register-range">
                <label>
                  <span>Register start</span>
                  <input
                    type="date"
                    value={excelRegisterStartDate}
                    onChange={(event) =>
                      setExcelRegisterStartDate(event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Register end</span>
                  <input
                    type="date"
                    value={excelRegisterEndDate}
                    onChange={(event) =>
                      setExcelRegisterEndDate(event.target.value)
                    }
                  />
                </label>
              </div>
            ) : null
          }
          actions={
            entryMode === "daily"
              ? [
                  {
                    key: "export-current",
                    title: "Export current daily attendance",
                    description:
                      "Download the current date with the statuses already entered in Eleeveon.",
                    badge: date,
                    onClick: () =>
                      runAttendanceExcelExport(
                        "export-current",
                        exportCurrentDailyAttendance,
                      ),
                  },
                  {
                    key: "blank-template",
                    title: "Download daily template",
                    description:
                      "Create a clean sheet for this class and date.",
                    onClick: () =>
                      runAttendanceExcelExport(
                        "blank-template",
                        downloadBlankAttendanceTemplate,
                      ),
                  },
                  {
                    key: "register-template",
                    title: "Download multi-day register",
                    description:
                      "Create a student register with one attendance column for each date in the selected range.",
                    onClick: () =>
                      runAttendanceExcelExport(
                        "register-template",
                        downloadAttendanceRegister,
                      ),
                  },
                ]
              : [
                  {
                    key: "export-current",
                    title: "Export current term totals",
                    description:
                      "Download the current term totals already entered in Eleeveon.",
                    onClick: () =>
                      runAttendanceExcelExport(
                        "export-current",
                        exportCurrentTermAttendance,
                      ),
                  },
                  {
                    key: "blank-template",
                    title: "Download term template",
                    description:
                      "Create a clean term-attendance sheet for this class.",
                    onClick: () =>
                      runAttendanceExcelExport(
                        "blank-template",
                        downloadBlankAttendanceTemplate,
                      ),
                  },
                ]
          }
        />
      </main>
    </PermissionGate>
  );
}

function SliderIcon() {
  return (
    <svg
      className="ba-slider-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
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
      {!photo
        ? String(name || "S")
            .slice(0, 1)
            .toUpperCase()
        : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  readOnly,
  disabled,
}: {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(event) =>
          onChange?.(Number(event.target.value))
        }
      />
    </label>
  );
}

function AnalyticsView({
  entryMode,
  daily,
  term,
}: {
  entryMode: EntryMode;
  daily: {
    total: number;
    present: number;
    absent: number;
    late: number;
    marked: number;
    unmarked: number;
    completion: number;
    attendanceRate: number;
  };
  term: {
    total: number;
    completed: number;
    missing: number;
    average: number;
    opened: number;
    present: number;
    absent: number;
    late: number;
  };
}) {
  return (
    <section className="ba-analysis-grid">
      {entryMode === "daily" ? (
        <>
          <Analysis title="Present" value={daily.present} />
          <Analysis title="Absent" value={daily.absent} />
          <Analysis title="Late" value={daily.late} />
          <Analysis
            title="Completion"
            value={`${daily.completion}%`}
          />
          <Analysis
            title="Attendance rate"
            value={`${daily.attendanceRate}%`}
          />
          <Analysis title="Unmarked" value={daily.unmarked} />
        </>
      ) : (
        <>
          <Analysis
            title="Completed"
            value={term.completed}
          />
          <Analysis title="Missing" value={term.missing} />
          <Analysis
            title="Average attendance"
            value={`${term.average}%`}
          />
          <Analysis title="Days opened" value={term.opened} />
          <Analysis title="Present" value={term.present} />
          <Analysis title="Times late" value={term.late} />
        </>
      )}
    </section>
  );
}

function Analysis({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DailyTable({
  rows,
  drafts,
  setStatus,
  clearStatus,
  primary,
  editable,
}: {
  rows: StudentView[];
  drafts: DailyDraftMap;
  setStatus: (
    studentId: string,
    status: AttendanceStatus,
  ) => void;
  clearStatus: (studentId: string) => void;
  primary: string;
  editable: boolean;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              <th>Admission No.</th>
              <th>Status</th>
              <th>Entry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const current = drafts[item.id];

              return (
                <tr key={item.id}>
                  <td>
                    <div className="table-student">
                      <Avatar
                        name={item.name}
                        photo={item.photo}
                        primary={primary}
                      />
                      <strong>{item.name}</strong>
                    </div>
                  </td>
                  <td>{item.admissionNumber}</td>
                  <td>{statusLabel(current)}</td>
                  <td>
                    <div className="table-actions">
                      {(
                        [
                          "present",
                          "absent",
                          "late",
                        ] as AttendanceStatus[]
                      ).map((status) => (
                        <button
                          type="button"
                          key={status}
                          disabled={!editable}
                          className={
                            current === status ? "active" : ""
                          }
                          onClick={() =>
                            setStatus(item.id, status)
                          }
                        >
                          {status.slice(0, 1).toUpperCase()}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => clearStatus(item.id)}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TermTable({
  rows,
  drafts,
  updateDraft,
  primary,
  editable,
}: {
  rows: StudentView[];
  drafts: TermDraftMap;
  updateDraft: (
    studentId: string,
    field: "daysOpened" | "daysPresent" | "timesLate",
    value: number,
  ) => void;
  primary: string;
  editable: boolean;
}) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              <th>Opened</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Late</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const draft =
                drafts[item.id] || normalizeTermDraft();

              return (
                <tr key={item.id}>
                  <td>
                    <div className="table-student">
                      <Avatar
                        name={item.name}
                        photo={item.photo}
                        primary={primary}
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.admissionNumber}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <input
                      className="table-number"
                      type="number"
                      min={0}
                      value={draft.daysOpened}
                      disabled={!editable}
                      onChange={(event) =>
                        updateDraft(
                          item.id,
                          "daysOpened",
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="table-number"
                      type="number"
                      min={0}
                      value={draft.daysPresent}
                      disabled={!editable}
                      onChange={(event) =>
                        updateDraft(
                          item.id,
                          "daysPresent",
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="table-number"
                      type="number"
                      value={draft.daysAbsent}
                      readOnly
                    />
                  </td>
                  <td>
                    <input
                      className="table-number"
                      type="number"
                      min={0}
                      value={draft.timesLate}
                      disabled={!editable}
                      onChange={(event) =>
                        updateDraft(
                          item.id,
                          "timesLate",
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>
                      {draft.attendancePercent}%
                    </strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterSheet(props: {
  entryMode: EntryMode;
  structureId: string;
  periodId: string;
  classId: string;
  date: string;
  statusFilter: AttendanceFilter;
  structures: AcademicStructure[];
  periods: AcademicPeriod[];
  classes: Class[];
  bulkDaysOpened: string;
  bulkScope: BulkScope;
  onEntryMode: (value: EntryMode) => void;
  onStructure: (value: string) => void;
  onPeriod: (value: string) => void;
  onClass: (value: string) => void;
  onDate: (value: string) => void;
  onStatus: (value: AttendanceFilter) => void;
  onBulkDaysOpened: (value: string) => void;
  onBulkScope: (value: BulkScope) => void;
  onApplyBulkDaysOpened: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Attendance Setup"
      text="Choose the register type and working context."
      onClose={props.onClose}
    >
      <div className="filter-section">
        <span className="filter-section-label">
          Register Type
        </span>

        <section className="mode-switch">
          <button
            type="button"
            className={
              props.entryMode === "daily" ? "active" : ""
            }
            onClick={() => props.onEntryMode("daily")}
          >
            <strong>Daily Register</strong>
            <small>Present, absent and late by date</small>
          </button>

          <button
            type="button"
            className={
              props.entryMode === "termTotals"
                ? "active"
                : ""
            }
            onClick={() =>
              props.onEntryMode("termTotals")
            }
          >
            <strong>Term Totals</strong>
            <small>Opened, present, absent and late</small>
          </button>
        </section>
      </div>

      <div className="ba-form">
        <Field label="Academic Structure">
          <select
            value={props.structureId}
            onChange={(event) =>
              props.onStructure(event.target.value)
            }
          >
            <option value="">Select structure</option>
            {props.structures.map((row: any) => (
              <option
                key={idOf(row.id)}
                value={idOf(row.id)}
              >
                {row.name || "Unnamed"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Academic Period">
          <select
            value={props.periodId}
            onChange={(event) =>
              props.onPeriod(event.target.value)
            }
          >
            <option value="">Select period</option>
            {props.periods.map((row: any) => (
              <option
                key={idOf(row.id)}
                value={idOf(row.id)}
              >
                {row.name || "Unnamed"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Class">
          <select
            value={props.classId}
            onChange={(event) =>
              props.onClass(event.target.value)
            }
          >
            <option value="">Select class</option>
            {props.classes.map((row: any) => (
              <option
                key={idOf(row.id)}
                value={idOf(row.id)}
              >
                {row.name || "Unnamed"}
              </option>
            ))}
          </select>
        </Field>

        {props.entryMode === "daily" ? (
          <>
            <Field label="Date">
              <input
                type="date"
                value={props.date}
                onChange={(event) =>
                  props.onDate(event.target.value)
                }
              />
            </Field>

            <Field label="Status">
              <select
                value={props.statusFilter}
                onChange={(event) =>
                  props.onStatus(
                    event.target.value as AttendanceFilter,
                  )
                }
              >
                <option value="all">All students</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="unmarked">Unmarked</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Days Opened">
              <input
                type="number"
                min={0}
                value={props.bulkDaysOpened}
                onChange={(event) =>
                  props.onBulkDaysOpened(
                    event.target.value,
                  )
                }
                placeholder="e.g. 65"
              />
            </Field>

            <Field label="Apply To">
              <select
                value={props.bulkScope}
                onChange={(event) =>
                  props.onBulkScope(
                    event.target.value as BulkScope,
                  )
                }
              >
                <option value="all">All students</option>
                <option value="shown">
                  Shown students
                </option>
              </select>
            </Field>

            <button
              type="button"
              className="ba-sheet-action"
              onClick={props.onApplyBulkDaysOpened}
            >
              Apply Days Opened
            </button>
          </>
        )}
      </div>

      <div className="ba-sheet-footer">
        <button
          type="button"
          className="primary"
          onClick={props.onClose}
        >
          Apply
        </button>
      </div>
    </Sheet>
  );
}

function MoreSheet(props: {
  entryMode: EntryMode;
  viewMode: ViewMode;
  canEdit: boolean;
  onViewMode: (value: ViewMode) => void;
  onMarkAll: (status: AttendanceStatus) => void;
  onClearShown: () => void;
  onOpenBulkDays: () => void;
  onImportExcel: () => void;
  onExportExcel: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="More"
      text="Change views, use bulk actions or refresh."
      onClose={props.onClose}
    >
      <section className="more-section">
        <span>View</span>
        <div className="more-grid">
          {(
            [
              ["cards", "Cards"],
              ["table", "Table"],
              ["analytics", "Analytics"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={
                props.viewMode === value ? "active" : ""
              }
              onClick={() => props.onViewMode(value)}
            >
              <strong>{label}</strong>
              <small>
                {value === "cards"
                  ? "Compact mobile-first rows"
                  : value === "table"
                    ? "Dense desktop register"
                    : "Attendance summary"}
              </small>
            </button>
          ))}
        </div>
      </section>

      {props.entryMode === "daily" ? (
        <section className="more-section">
          <span>Daily Actions</span>
          <div className="more-actions">
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={() => props.onMarkAll("present")}
            >
              Mark shown present
            </button>
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={() => props.onMarkAll("absent")}
            >
              Mark shown absent
            </button>
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={() => props.onMarkAll("late")}
            >
              Mark shown late
            </button>
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={props.onClearShown}
            >
              Clear shown
            </button>
          </div>
        </section>
      ) : (
        <section className="more-section">
          <span>Term Actions</span>
          <div className="more-actions">
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={props.onOpenBulkDays}
            >
              Set days opened
            </button>
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={props.onClearShown}
            >
              Clear shown totals
            </button>
          </div>
        </section>
      )}

      <section className="more-section">
        <span>Excel</span>
        <div className="more-actions">
          <button
            type="button"
            disabled={!props.canEdit}
            onClick={props.onImportExcel}
          >
            Import attendance
          </button>
          <button
            type="button"
            onClick={props.onExportExcel}
          >
            Export / templates
          </button>
        </div>
      </section>

      <section className="more-section">
        <span>System</span>
        <div className="more-actions">
          <button
            type="button"
            onClick={props.onRefresh}
          >
            Refresh attendance
          </button>
        </div>
      </section>
    </Sheet>
  );
}

function StatusSheet({
  entryMode,
  daily,
  term,
  onClose,
}: {
  entryMode: EntryMode;
  daily: {
    total: number;
    present: number;
    absent: number;
    late: number;
    marked: number;
    unmarked: number;
    completion: number;
    attendanceRate: number;
  };
  term: {
    total: number;
    completed: number;
    missing: number;
    average: number;
    opened: number;
    present: number;
    absent: number;
    late: number;
  };
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Attendance Status"
      text={
        entryMode === "daily"
          ? "Current daily register progress."
          : "Current term totals progress."
      }
      onClose={onClose}
    >
      <div className="status-list">
        {entryMode === "daily" ? (
          <>
            <StatusLine
              label="Students"
              value={daily.total}
            />
            <StatusLine
              label="Marked"
              value={daily.marked}
            />
            <StatusLine
              label="Unmarked"
              value={daily.unmarked}
            />
            <StatusLine
              label="Present"
              value={daily.present}
            />
            <StatusLine
              label="Absent"
              value={daily.absent}
            />
            <StatusLine
              label="Late"
              value={daily.late}
            />
            <StatusLine
              label="Completion"
              value={`${daily.completion}%`}
            />
          </>
        ) : (
          <>
            <StatusLine
              label="Students"
              value={term.total}
            />
            <StatusLine
              label="Completed"
              value={term.completed}
            />
            <StatusLine
              label="Missing"
              value={term.missing}
            />
            <StatusLine
              label="Average attendance"
              value={`${term.average}%`}
            />
            <StatusLine
              label="Times late"
              value={term.late}
            />
          </>
        )}
      </div>
    </Sheet>
  );
}

function StatusLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Sheet({
  title,
  text,
  children,
  onClose,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="ba-sheet-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="ba-sheet"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ba-sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function RouteState({
  primary,
  title,
  text,
  action,
}: {
  primary: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <main
      className="ba-page"
      style={
        {
          "--ba-primary": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>
      <section className="ba-state">
        <h2>{title}</h2>
        <p>{text}</p>
        {action}
      </section>
    </main>
  );
}

const css = `
.ba-page{
  --ba-page-bg:var(--bg,var(--background,#f7f8fb));
  --ba-surface:var(--surface,var(--card,var(--background,#fff)));
  --ba-surface-2:var(--surface-2,var(--muted-surface,color-mix(in srgb,var(--ba-surface) 92%,var(--ba-text) 8%)));
  --ba-text:var(--text,var(--foreground,#172033));
  --ba-muted:var(--muted,color-mix(in srgb,var(--ba-text) 62%,transparent));
  --ba-border:var(--border,color-mix(in srgb,var(--ba-text) 14%,transparent));
  --ba-soft:color-mix(in srgb,var(--ba-text) 6%,transparent);
  color:var(--ba-text);
  background:var(--ba-page-bg);
  color-scheme:light dark;
  display:grid;
  gap:10px;
  padding:clamp(8px,1.8vw,16px);
  min-width:0;
}
.ba-search-card{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto auto auto;
  align-items:center;
  gap:6px;
  min-width:0;
}
.status-dot-mini{
  width:10px;
  height:10px;
  border:0;
  border-radius:999px;
  padding:0;
  flex:0 0 auto;
  background:#94a3b8;
  box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent);
}
button.status-dot-mini{cursor:pointer}
.status-dot-mini.green{background:#22c55e}
.status-dot-mini.orange{background:#f59e0b}
.status-dot-mini.red{background:#ef4444}
.status-dot-mini.gray{background:#94a3b8}
.ba-search{
  height:38px;
  min-width:0;
  display:flex;
  align-items:center;
  gap:7px;
  padding:0 10px;
  border:1px solid var(--ba-border);
  border-radius:12px;
  background:var(--ba-surface);
}
.ba-search>span{
  font-size:19px;
  line-height:1;
  opacity:.55;
  transform:translateY(-1px);
}
.ba-search input{
  width:100%;
  min-width:0;
  border:0;
  outline:0;
  background:transparent;
  color:inherit;
  font:inherit;
  font-size:12px;
}
.ba-save-inline,.ba-filter-button,.ba-icon-button{
  height:38px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  background:var(--ba-surface);
  color:inherit;
  font:inherit;
  font-size:10px;
  font-weight:850;
  cursor:pointer;
}
.ba-save-inline{
  padding:0 12px;
  color:var(--ba-primary);
}
.ba-save-inline:disabled{opacity:.45;cursor:not-allowed}
.ba-filter-button,.ba-icon-button{
  width:38px;
  display:grid;
  place-items:center;
  position:relative;
}
.ba-filter-button.active{
  color:var(--ba-primary);
  border-color:color-mix(in srgb,var(--ba-primary) 34%,transparent);
}
.ba-filter-button b{
  position:absolute;
  top:-5px;
  right:-5px;
  min-width:16px;
  height:16px;
  display:grid;
  place-items:center;
  padding:0 3px;
  border-radius:999px;
  background:var(--ba-primary);
  color:#fff;
  font-size:8px;
}
.ba-slider-icon{
  width:17px;
  height:17px;
  fill:none;
  stroke:currentColor;
  stroke-width:1.8;
  stroke-linecap:round;
}
.ba-icon-button{font-size:18px;line-height:1}
.ba-filter-chips{
  display:flex;
  gap:5px;
  flex-wrap:wrap;
}
.ba-filter-chips span{
  border:1px solid var(--ba-border);
  border-radius:999px;
  background:var(--ba-surface);
  padding:4px 8px;
  font-size:8.5px;
  font-weight:750;
  color:var(--ba-muted);
}
.ba-list{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,310px),1fr));
  gap:7px;
}
.attendance-row,.term-row{
  min-width:0;
  border:1px solid var(--ba-border);
  border-radius:13px;
  background:var(--ba-surface);
}
.attendance-row{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  padding:8px;
}
.ba-avatar{
  width:34px;
  height:34px;
  border-radius:10px;
  display:grid;
  place-items:center;
  color:#fff;
  font-size:12px;
  font-weight:900;
  flex:0 0 auto;
}
.attendance-main{
  min-width:0;
  display:grid;
  gap:1px;
}
.attendance-main strong,.term-student strong{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:10.5px;
}
.attendance-main small,.term-student small{
  color:var(--ba-muted);
  font-size:8.5px;
}
.attendance-main em{
  color:var(--ba-muted);
  font-size:7.5px;
  font-style:normal;
}
.attendance-status-actions{
  display:flex;
  align-items:center;
  gap:4px;
}
.attendance-status-actions button{
  width:27px;
  height:27px;
  border:1px solid var(--ba-border);
  border-radius:8px;
  background:transparent;
  color:var(--ba-muted);
  font-size:9px;
  font-weight:900;
  cursor:pointer;
}
.attendance-status-actions button:disabled{opacity:.45;cursor:not-allowed}
.attendance-status-actions button.present.active{
  color:#15803d;
  border-color:color-mix(in srgb,#22c55e 45%,transparent);
  background:color-mix(in srgb,#22c55e 10%,transparent);
}
.attendance-status-actions button.absent.active{
  color:#b91c1c;
  border-color:color-mix(in srgb,#ef4444 45%,transparent);
  background:color-mix(in srgb,#ef4444 10%,transparent);
}
.attendance-status-actions button.late.active{
  color:#b45309;
  border-color:color-mix(in srgb,#f59e0b 45%,transparent);
  background:color-mix(in srgb,#f59e0b 10%,transparent);
}
.attendance-status-actions button.clear{font-size:13px}
.attendance-status-actions .status-dot-mini{
  width:7px;
  height:7px;
  margin-left:1px;
}
.term-row{padding:8px}
.term-student{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  margin-bottom:8px;
}
.term-student>span{
  min-width:0;
  display:grid;
}
.term-student>b{
  color:var(--ba-primary);
  font-size:12px;
}
.term-input-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:6px;
}
.term-input-grid label{
  min-width:0;
  display:grid;
  gap:3px;
}
.term-input-grid label span{
  color:var(--ba-muted);
  font-size:7.5px;
  font-weight:800;
  text-transform:uppercase;
}
.term-input-grid input{
  width:100%;
  min-width:0;
  box-sizing:border-box;
  border:1px solid var(--ba-border);
  border-radius:8px;
  background:var(--ba-soft);
  color:inherit;
  padding:7px 5px;
  font:inherit;
  font-size:9px;
}
.ba-table-card{
  border:1px solid var(--ba-border);
  border-radius:13px;
  overflow:hidden;
  background:var(--ba-surface);
}
.ba-table-scroll{overflow:auto}
.ba-table-scroll table{
  width:100%;
  min-width:690px;
  border-collapse:collapse;
  font-size:9px;
}
.ba-table-scroll th,.ba-table-scroll td{
  text-align:left;
  padding:8px;
  border-bottom:1px solid var(--ba-border);
}
.ba-table-scroll th{
  color:var(--ba-muted);
  font-size:8px;
  text-transform:uppercase;
  letter-spacing:.03em;
}
.table-student{
  display:flex;
  align-items:center;
  gap:7px;
}
.table-student .ba-avatar{
  width:28px;
  height:28px;
  border-radius:8px;
}
.table-student>span{
  display:grid;
}
.table-student small{
  color:var(--ba-muted);
  font-size:7.5px;
}
.table-actions{
  display:flex;
  gap:4px;
}
.table-actions button{
  min-width:26px;
  height:26px;
  border:1px solid var(--ba-border);
  border-radius:7px;
  background:transparent;
  color:inherit;
  font-size:8px;
  font-weight:900;
}
.table-actions button.active{
  color:#fff;
  border-color:var(--ba-primary);
  background:var(--ba-primary);
}
.table-number{
  width:68px;
  border:1px solid var(--ba-border);
  border-radius:7px;
  background:var(--ba-soft);
  color:inherit;
  padding:6px;
  font:inherit;
  font-size:9px;
}
.ba-analysis-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(135px,1fr));
  gap:7px;
}
.ba-analysis{
  border:1px solid var(--ba-border);
  border-radius:12px;
  background:var(--ba-surface);
  padding:10px;
  display:grid;
  gap:4px;
}
.ba-analysis span{
  color:var(--ba-muted);
  font-size:8px;
  font-weight:800;
  text-transform:uppercase;
}
.ba-analysis strong{
  color:var(--ba-primary);
  font-size:17px;
}
.ba-empty,.ba-state{
  min-height:220px;
  display:grid;
  place-items:center;
  align-content:center;
  gap:6px;
  text-align:center;
  padding:24px;
  border:1px dashed var(--ba-border);
  border-radius:15px;
}
.ba-empty-icon{font-size:26px}
.ba-empty h3,.ba-state h2{
  margin:0;
  font-size:14px;
}
.ba-empty p,.ba-state p{
  max-width:440px;
  margin:0;
  color:var(--ba-muted);
  font-size:9.5px;
  line-height:1.6;
}
.ba-state-button{
  margin-top:8px;
  border:0;
  border-radius:10px;
  background:var(--ba-primary);
  color:#fff;
  padding:9px 12px;
  font-size:9px;
  font-weight:850;
}
.ba-toast{
  position:sticky;
  top:8px;
  z-index:60;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  background:var(--ba-surface);
  padding:9px 11px;
  font-size:9px;
  font-weight:750;
}
.ba-toast.success{border-color:color-mix(in srgb,#22c55e 38%,transparent)}
.ba-toast.error{border-color:color-mix(in srgb,#ef4444 38%,transparent)}
.ba-toast.info{border-color:color-mix(in srgb,var(--ba-primary) 38%,transparent)}
.ba-toast button{
  border:0;
  background:transparent;
  color:inherit;
  font-size:16px;
}
.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:100;
  display:grid;
  place-items:end center;
  padding:8px;
  background:rgba(15,23,42,.58);
}
.ba-sheet{
  width:min(580px,100%);
  max-height:92vh;
  overflow:auto;
  border:1px solid var(--ba-border);
  border-radius:20px 20px 12px 12px;
  background:var(--ba-surface);
  color:var(--ba-text);
  padding:12px;
  box-sizing:border-box;
}
.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  padding-bottom:10px;
  border-bottom:1px solid var(--ba-border);
}
.ba-sheet-head h2{
  margin:0;
  font-size:13px;
}
.ba-sheet-head p{
  margin:2px 0 0;
  color:var(--ba-muted);
  font-size:8.5px;
}
.ba-sheet-head>button{
  width:30px;
  height:30px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:transparent;
  color:inherit;
  font-size:17px;
}
.filter-section,.more-section{
  display:grid;
  gap:7px;
  padding:11px 0;
}
.filter-section-label,.more-section>span{
  color:var(--ba-muted);
  font-size:8px;
  font-weight:900;
  text-transform:uppercase;
}
.mode-switch,.more-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
}
.mode-switch button,.more-grid button{
  min-width:0;
  display:grid;
  gap:2px;
  text-align:left;
  border:1px solid var(--ba-border);
  border-radius:11px;
  background:transparent;
  color:inherit;
  padding:9px;
}
.mode-switch button.active,.more-grid button.active{
  border-color:color-mix(in srgb,var(--ba-primary) 42%,transparent);
  background:color-mix(in srgb,var(--ba-primary) 8%,transparent);
}
.mode-switch strong,.more-grid strong{
  font-size:9.5px;
}
.mode-switch small,.more-grid small{
  color:var(--ba-muted);
  font-size:7.5px;
}
.ba-form{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px;
}
.ba-form label{
  min-width:0;
  display:grid;
  gap:4px;
}
.ba-form label>span{
  color:var(--ba-muted);
  font-size:8px;
  font-weight:850;
  text-transform:uppercase;
}
.ba-form select,.ba-form input{
  width:100%;
  box-sizing:border-box;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:var(--ba-surface);
  color:inherit;
  padding:9px;
  font:inherit;
  font-size:9px;
}
.ba-sheet-action{
  align-self:end;
  min-height:34px;
  border:1px solid color-mix(in srgb,var(--ba-primary) 38%,transparent);
  border-radius:9px;
  background:color-mix(in srgb,var(--ba-primary) 8%,transparent);
  color:var(--ba-primary);
  font-size:8.5px;
  font-weight:850;
}
.ba-sheet-footer{
  display:flex;
  justify-content:flex-end;
  padding-top:12px;
}
.ba-sheet-footer button{
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:transparent;
  color:inherit;
  padding:9px 13px;
  font-size:8.5px;
  font-weight:850;
}
.ba-sheet-footer button.primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}
.more-actions{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
}
.more-actions button{
  min-height:36px;
  border:1px solid var(--ba-border);
  border-radius:9px;
  background:transparent;
  color:inherit;
  padding:8px;
  text-align:left;
  font-size:8.5px;
  font-weight:750;
}
.more-actions button:disabled{opacity:.45}
.status-list{
  display:grid;
  gap:0;
  padding-top:7px;
}
.status-list>div{
  display:flex;
  justify-content:space-between;
  gap:12px;
  padding:9px 1px;
  border-bottom:1px solid var(--ba-border);
  font-size:9px;
}
.status-list span{color:var(--ba-muted)}
.status-list strong{color:var(--ba-primary)}
@media(max-width:640px){
  .ba-page{padding:7px;gap:8px}
  .ba-search-card{gap:4px}
  .ba-search{height:36px;padding:0 8px}
  .ba-save-inline,.ba-filter-button,.ba-icon-button{height:36px}
  .ba-filter-button,.ba-icon-button{width:36px}
  .attendance-row{
    grid-template-columns:auto minmax(0,1fr);
  }
  .attendance-status-actions{
    grid-column:1/-1;
    justify-content:flex-end;
  }
  .term-input-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ba-form,.mode-switch,.more-grid,.more-actions{
    grid-template-columns:1fr;
  }
}

/* ======================================================
   THEME / DARK-MODE ALIGNMENT
   Mirrors the semantic surface system used by Subjects.tsx.
   ====================================================== */
.ba-search,
.ba-save-inline,
.ba-filter-button,
.ba-icon-button,
.attendance-row,
.term-row,
.ba-table-card,
.ba-analysis,
.ba-sheet,
.ba-state,
.ba-toast{
  background:var(--ba-surface);
  color:var(--ba-text);
  border-color:var(--ba-border);
}

.ba-filter-chips span,
.ba-filter-chips button,
.filter-section,
.mode-switch,
.term-input-grid label,
.ba-form label,
.status-card,
.bulk-card{
  background:var(--ba-surface-2);
  color:var(--ba-text);
  border-color:var(--ba-border);
}

.ba-page input,
.ba-page select,
.ba-page textarea,
.table-number,
.term-input-grid input{
  background:var(--ba-surface);
  color:var(--ba-text);
  border-color:var(--ba-border);
}

.ba-page input::placeholder,
.ba-page textarea::placeholder{
  color:var(--ba-muted);
  opacity:1;
}

.ba-table-scroll th{
  background:var(--ba-surface-2);
  color:var(--ba-muted);
}

.ba-table-scroll td{
  background:var(--ba-surface);
  color:var(--ba-text);
}

.ba-table-scroll tbody tr:hover td{
  background:color-mix(in srgb,var(--ba-primary) 7%,var(--ba-surface));
}

.attendance-status-actions button,
.table-actions button,
.mode-switch button,
.ba-more-list button,
.ba-sheet-actions button{
  background:var(--ba-surface-2);
  color:var(--ba-text);
  border-color:var(--ba-border);
}

.attendance-status-actions button.clear{
  color:var(--ba-muted);
}

.attendance-main strong,
.term-student strong,
.table-student strong,
.ba-analysis strong,
.ba-sheet-head h3,
.ba-state h2,
.ba-empty h3{
  color:var(--ba-text);
}

.attendance-main small,
.attendance-main em,
.term-student small,
.table-student small,
.ba-analysis span,
.ba-sheet-head p,
.ba-empty p,
.ba-state p,
.filter-section-label,
.ba-form label>span{
  color:var(--ba-muted);
}

.ba-sheet-backdrop{
  background:color-mix(in srgb,#020617 68%,transparent);
}

.ba-page input:disabled,
.ba-page select:disabled,
.ba-page textarea:disabled,
.ba-page button:disabled{
  opacity:.58;
}

@media (prefers-color-scheme: dark){
  .ba-page{
    --ba-soft:color-mix(in srgb,var(--ba-text) 8%,transparent);
  }
}


/* -------------------------------------------------------
   Excel interoperability additions
-------------------------------------------------------- */
.attendance-excel-stack{
  display:grid;
  gap:14px;
  min-width:0;
}
.attendance-excel-context{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  align-items:center;
}
.attendance-excel-context strong,
.attendance-excel-context span{
  border:1px solid var(--ba-border);
  border-radius:999px;
  padding:5px 9px;
  background:var(--ba-surface);
  font-size:10px;
}
.attendance-excel-context strong{
  color:var(--ba-primary);
}
.attendance-excel-note{
  display:grid;
  gap:4px;
  padding:12px;
  border:1px solid var(--ba-border);
  border-radius:13px;
  background:var(--ba-surface);
}
.attendance-excel-note strong{
  font-size:11px;
}
.attendance-excel-note span{
  color:var(--ba-muted);
  font-size:10px;
  line-height:1.5;
}
.attendance-excel-field{
  display:grid;
  gap:5px;
}
.attendance-excel-field>span{
  font-size:9px;
  font-weight:850;
  color:var(--ba-muted);
}
.attendance-excel-field select,
.attendance-excel-field input,
.attendance-excel-register-range input{
  width:100%;
  min-height:40px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  padding:0 10px;
  background:var(--ba-surface);
  color:inherit;
  font:inherit;
  font-size:11px;
  outline:0;
}
.attendance-excel-field small{
  color:var(--ba-muted);
  font-size:9px;
  line-height:1.4;
}
.attendance-excel-field select:focus,
.attendance-excel-field input:focus,
.attendance-excel-register-range input:focus{
  border-color:var(--ba-primary);
}
.attendance-excel-footer{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
}
.attendance-excel-footer button{
  min-height:38px;
  border:1px solid var(--ba-border);
  border-radius:11px;
  padding:0 14px;
  font:inherit;
  font-size:10px;
  font-weight:850;
  cursor:pointer;
}
.attendance-excel-footer button.secondary{
  background:var(--ba-surface);
  color:var(--ba-text);
}
.attendance-excel-footer button.primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}
.attendance-excel-footer button:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.attendance-excel-result{
  display:grid;
  justify-items:center;
  gap:8px;
  padding:22px 10px;
  text-align:center;
}
.attendance-excel-result-icon{
  width:52px;
  height:52px;
  border-radius:50%;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,#22c55e 14%,transparent);
  color:#15803d;
  font-size:24px;
  font-weight:900;
}
.attendance-excel-result h3{
  margin:4px 0 0;
  font-size:16px;
}
.attendance-excel-result p{
  max-width:560px;
  margin:0;
  color:var(--ba-muted);
  font-size:10px;
  line-height:1.55;
}
.attendance-excel-result-grid{
  width:min(100%,520px);
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:7px;
  margin-top:8px;
}
.attendance-excel-result-grid>div{
  padding:12px 8px;
  border:1px solid var(--ba-border);
  border-radius:12px;
  background:var(--ba-surface);
}
.attendance-excel-result-grid strong{
  display:block;
  font-size:18px;
}
.attendance-excel-result-grid span{
  display:block;
  margin-top:2px;
  color:var(--ba-muted);
  font-size:9px;
}
.attendance-excel-register-range{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px;
}
.attendance-excel-register-range label{
  display:grid;
  gap:4px;
}
.attendance-excel-register-range span{
  color:var(--ba-muted);
  font-size:9px;
  font-weight:800;
}
@media(max-width:560px){
  .attendance-excel-footer{
    width:100%;
  }
  .attendance-excel-footer button{
    flex:1;
  }
  .attendance-excel-result-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .attendance-excel-register-range{
    grid-template-columns:1fr;
  }
}

`;