"use client";

/**
 * AcademicProgress.tsx
 * ---------------------------------------------------------
 * COMPACT GOLDEN ACADEMIC PROGRESS DASHBOARD
 * ---------------------------------------------------------
 *
 * Projection/analytics layer over:
 * - students
 * - studentEnrollments
 * - studentCurriculums
 * - classes
 * - academicStructures
 * - academicPeriods
 * - curriculums
 * - curriculumPathways
 * - classSubjects
 * - assessmentEntries
 * - computedResults
 * - attendance
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads are scoped by accountId + schoolId + branchId.
 *
 * Workspace source fix:
 * - Resolves school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 *
 * Golden UI:
 * - Removed large hero and always-visible filter block.
 * - Uses compact search strip: search + refresh + filter + more.
 * - Filters live in a bottom sheet.
 * - Active filters appear as chips only when used.
 * - Details open in compact mode and remain dashboard-shell safe.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { listActiveLocal } from "../../lib/sync/syncUtils";

import type {
  AcademicPeriod,
  AcademicStructure,
  Attendance,
  Class,
  ClassSubject,
  ComputedResult,
  Curriculum,
  CurriculumPathway,
  Student,
  StudentCurriculum,
  StudentEnrollment,
  AssessmentEntry,
} from "../../lib/db";

// ======================================================
// TYPES
// ======================================================

type ProgressStatus = "excellent" | "good" | "watch" | "risk" | "no_data";
type ViewMode = "cards" | "details" | "analytics";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  active?: boolean;
  isDeleted?: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

type StudentProgressView = {
  student: Student;
  enrollment?: StudentEnrollment;
  curriculumPlacement?: StudentCurriculum;

  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;

  subjectCount: number;
  assessedSubjectCount: number;
  assessmentEntryCount: number;
  computedResultCount: number;

  totalScore: number;
  averagePercentage?: number;
  averageGpa?: number;
  averagePosition?: number;

  attendanceTotal: number;
  attendancePresent: number;
  attendanceAbsent: number;
  attendanceLate: number;
  attendanceRate?: number;

  progressScore: number;
  status: ProgressStatus;
  readinessLabel: string;
};

// ======================================================
// HELPERS
// ======================================================

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanId(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameId(a: unknown, b: unknown) {
  const left = cleanId(a);
  const right = cleanId(b);
  return left > 0 && right > 0 && left === right;
}

function accountMatches(rowAccountId: unknown, selectedAccountId?: string | null) {
  if (!selectedAccountId) return true;
  if (!rowAccountId) return true;
  return String(rowAccountId) === String(selectedAccountId);
}

function activeRow(row: TenantRow) {
  return !!row && row.isDeleted !== true && row.active !== false;
}

async function activeRows<T>(tableName: string): Promise<T[]> {
  return ((await listActiveLocal(tableName as any)) || []) as T[];
}

function labelOf<T extends { id?: number; name?: string }>(rows: T[], id?: number) {
  if (!id) return "All";
  return rows.find((row) => row.id === id)?.name || "Not found";
}

// ======================================================
// COMPONENT
// ======================================================

export default function AcademicProgress() {
  const router = useRouter();

  const { accountId, loading: accountLoading, authenticated } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const selectedAccountId = useMemo(
    () =>
      cleanText(accountId) ||
      cleanText(openWorkspace?.membership?.accountId) ||
      cleanText(activeMembership?.accountId) ||
      cleanText(settings?.accountId),
    [accountId, activeMembership?.accountId, openWorkspace?.membership?.accountId, settings?.accountId]
  );

  const schoolId = useMemo(
    () =>
      cleanId(openWorkspace?.schoolId) ||
      cleanId(openWorkspace?.membership?.schoolId) ||
      cleanId(openWorkspace?.membership?.school?.id) ||
      cleanId(activeMembership?.schoolId) ||
      cleanId(activeMembership?.school?.id) ||
      cleanId(activeSchoolId) ||
      cleanId(activeSchool?.id) ||
      cleanId(settings?.schoolId) ||
      cleanId(safeStorageRead("activeSchoolId")),
    [
      activeMembership?.school?.id,
      activeMembership?.schoolId,
      activeSchool?.id,
      activeSchoolId,
      openWorkspace?.membership?.school?.id,
      openWorkspace?.membership?.schoolId,
      openWorkspace?.schoolId,
      settings?.schoolId,
    ]
  );

  const branchId = useMemo(
    () =>
      cleanId(openWorkspace?.branchId) ||
      cleanId(openWorkspace?.membership?.branchId) ||
      cleanId(openWorkspace?.membership?.schoolBranchId) ||
      cleanId(openWorkspace?.membership?.branch?.id) ||
      cleanId(activeMembership?.branchId) ||
      cleanId(activeMembership?.schoolBranchId) ||
      cleanId(activeMembership?.branch?.id) ||
      cleanId(activeBranchId) ||
      cleanId(activeBranch?.id) ||
      cleanId(settings?.branchId) ||
      cleanId(safeStorageRead("activeBranchId")),
    [
      activeBranch?.id,
      activeBranchId,
      activeMembership?.branch?.id,
      activeMembership?.branchId,
      activeMembership?.schoolBranchId,
      openWorkspace?.branchId,
      openWorkspace?.membership?.branch?.id,
      openWorkspace?.membership?.branchId,
      openWorkspace?.membership?.schoolBranchId,
      settings?.branchId,
    ]
  );

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [pageLoading, setPageLoading] = useState(true);

  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterCurriculumId, setFilterCurriculumId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | ProgressStatus>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, router]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const clearData = () => {
    setStudents([]);
    setEnrollments([]);
    setStudentCurriculums([]);
    setClasses([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setCurriculums([]);
    setPathways([]);
    setClassSubjects([]);
    setAssessmentEntries([]);
    setComputedResults([]);
    setAttendance([]);
  };

  const sameTenant = (row: TenantRow) =>
    accountMatches(row.accountId, selectedAccountId) &&
    sameId(row.schoolId, schoolId) &&
    sameId(row.branchId, branchId) &&
    activeRow(row);

  const load = async () => {
    if (!authenticated || !selectedAccountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [
        studentRows,
        enrollmentRows,
        studentCurriculumRows,
        classRows,
        structureRows,
        periodRows,
        curriculumRows,
        pathwayRows,
        classSubjectRows,
        entryRows,
        resultRows,
        attendanceRows,
      ] = await Promise.all([
        activeRows<Student>("students"),
        activeRows<StudentEnrollment>("studentEnrollments"),
        activeRows<StudentCurriculum>("studentCurriculums"),
        activeRows<Class>("classes"),
        activeRows<AcademicStructure>("academicStructures"),
        activeRows<AcademicPeriod>("academicPeriods"),
        activeRows<Curriculum>("curriculums"),
        activeRows<CurriculumPathway>("curriculumPathways"),
        activeRows<ClassSubject>("classSubjects"),
        activeRows<AssessmentEntry>("assessmentEntries"),
        activeRows<ComputedResult>("computedResults"),
        activeRows<Attendance>("attendance"),
      ]);

      setStudents(
        studentRows
          .filter((row: any) => sameTenant(row))
          .filter((student) => student.status !== "withdrawn")
          .sort((a, b) => cleanText(a.fullName).localeCompare(cleanText(b.fullName)))
      );
      setEnrollments(enrollmentRows.filter((row: any) => sameTenant(row)));
      setStudentCurriculums(studentCurriculumRows.filter((row: any) => sameTenant(row)));
      setClasses(classRows.filter((row: any) => sameTenant(row)));
      setAcademicStructures(structureRows.filter((row: any) => sameTenant(row)));
      setAcademicPeriods(periodRows.filter((row: any) => sameTenant(row)));
      setCurriculums(curriculumRows.filter((row: any) => sameTenant(row)));
      setPathways(pathwayRows.filter((row: any) => sameTenant(row)));
      setClassSubjects(classSubjectRows.filter((row: any) => sameTenant(row)));
      setAssessmentEntries(entryRows.filter((row: any) => sameTenant(row)));
      setComputedResults(resultRows.filter((row: any) => sameTenant(row)));
      setAttendance(attendanceRows.filter((row: any) => sameTenant(row)));
    } catch (error) {
      console.error("Failed to load academic progress:", error);
      clearData();
      alert("Failed to load academic progress data");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    selectedAccountId,
    schoolId,
    branchId,
    activeMembership?.role,
    activeMembership?.schoolId,
    activeMembership?.branchId,
    activeMembership?.schoolBranchId,
    openWorkspace?.openedAt,
    openWorkspace?.membershipId,
  ]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(academicPeriods.map((row) => [row.id, row])), [academicPeriods]);
  const curriculumMap = useMemo(() => new Map(curriculums.map((row) => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row) => [row.id, row])), [pathways]);

  const activeEnrollmentByStudent = useMemo(() => {
    const map = new Map<number, StudentEnrollment>();

    [...enrollments]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .forEach((row) => {
        if (row.status !== "active") return;
        if (!map.has(row.studentId)) map.set(row.studentId, row);
      });

    return map;
  }, [enrollments]);

  const activeCurriculumByStudent = useMemo(() => {
    const map = new Map<number, StudentCurriculum>();

    [...studentCurriculums]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .forEach((row) => {
        if (row.status !== "active" || row.active === false) return;
        if (!map.has(row.studentId)) map.set(row.studentId, row);
      });

    return map;
  }, [studentCurriculums]);

  const classSubjectsByClassPeriod = useMemo(() => {
    const map = new Map<string, ClassSubject[]>();

    classSubjects.forEach((row) => {
      if (row.active === false) return;
      const periodKey = row.academicPeriodId || 0;
      const key = `${row.classId}:${row.academicStructureId}:${periodKey}`;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    });

    return map;
  }, [classSubjects]);

  const entriesByStudent = useMemo(() => {
    const map = new Map<number, AssessmentEntry[]>();
    assessmentEntries.forEach((row) => {
      if (row.active === false) return;
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });
    return map;
  }, [assessmentEntries]);

  const resultsByStudent = useMemo(() => {
    const map = new Map<number, ComputedResult[]>();
    computedResults.forEach((row) => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });
    return map;
  }, [computedResults]);

  const attendanceByStudent = useMemo(() => {
    const map = new Map<number, Attendance[]>();
    attendance.forEach((row) => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });
    return map;
  }, [attendance]);

  const statusTone = (status: ProgressStatus): "green" | "blue" | "orange" | "red" | "gray" => {
    if (status === "excellent") return "green";
    if (status === "good") return "blue";
    if (status === "watch") return "orange";
    if (status === "risk") return "red";
    return "gray";
  };

  const statusLabel = (status: ProgressStatus) => {
    if (status === "excellent") return "Excellent";
    if (status === "good") return "Good";
    if (status === "watch") return "Watch";
    if (status === "risk") return "At Risk";
    return "No Data";
  };

  // ======================================================
  // PROGRESS MODEL
  // ======================================================

  const progressRows = useMemo<StudentProgressView[]>(() => {
    return students.map((student) => {
      const studentId = student.id || 0;
      const enrollment = activeEnrollmentByStudent.get(studentId);
      const curriculumPlacement = activeCurriculumByStudent.get(studentId);

      const classRow = enrollment?.classId ? classMap.get(enrollment.classId) : undefined;
      const structure = enrollment?.academicStructureId ? structureMap.get(enrollment.academicStructureId) : undefined;
      const period = enrollment?.academicPeriodId ? periodMap.get(enrollment.academicPeriodId) : undefined;
      const curriculum = curriculumPlacement?.curriculumId ? curriculumMap.get(curriculumPlacement.curriculumId) : undefined;
      const pathway = curriculumPlacement?.pathwayId ? pathwayMap.get(curriculumPlacement.pathwayId) : undefined;

      const classPeriodKey = enrollment
        ? `${enrollment.classId}:${enrollment.academicStructureId}:${enrollment.academicPeriodId || 0}`
        : "";

      const deliverySubjects = enrollment
        ? classSubjectsByClassPeriod.get(classPeriodKey) ||
          classSubjects.filter(
            (row) =>
              row.classId === enrollment.classId &&
              row.academicStructureId === enrollment.academicStructureId &&
              (row.academicPeriodId === enrollment.academicPeriodId || !row.academicPeriodId) &&
              row.active !== false
          )
        : [];

      const studentEntries = (entriesByStudent.get(studentId) || []).filter((row) => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const studentResults = (resultsByStudent.get(studentId) || []).filter((row) => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const assessedSubjectIds = new Set(studentResults.map((row) => row.subjectId));
      studentEntries.forEach((row) => assessedSubjectIds.add(row.subjectId));

      const studentAttendance = (attendanceByStudent.get(studentId) || []).filter((row) => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const attendanceTotal = studentAttendance.length;
      const attendancePresent = studentAttendance.filter((row) => row.status === "present").length;
      const attendanceAbsent = studentAttendance.filter((row) => row.status === "absent").length;
      const attendanceLate = studentAttendance.filter((row) => row.status === "late").length;
      const attendanceRate = attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : undefined;

      const resultPercentages = studentResults
        .map((row) => Number((row as any).percentage ?? (row as any).average ?? (row as any).total ?? 0))
        .filter((value) => !Number.isNaN(value));

      const averagePercentage = resultPercentages.length
        ? Math.round(resultPercentages.reduce((sum, value) => sum + value, 0) / resultPercentages.length)
        : undefined;

      const gpas = studentResults
        .map((row: any) => row.gpa)
        .filter((value) => value !== undefined && value !== null) as number[];

      const averageGpa = gpas.length
        ? Number((gpas.reduce((sum, value) => sum + Number(value), 0) / gpas.length).toFixed(2))
        : undefined;

      const positions = studentResults
        .map((row: any) => row.position)
        .filter((value) => value !== undefined && value !== null) as number[];

      const averagePosition = positions.length
        ? Math.round(positions.reduce((sum, value) => sum + Number(value), 0) / positions.length)
        : undefined;

      const subjectCount = deliverySubjects.length;
      const assessedSubjectCount = assessedSubjectIds.size;
      const assessmentCompletion = subjectCount ? Math.round((assessedSubjectCount / subjectCount) * 100) : 0;
      const performanceScore = averagePercentage ?? 0;
      const attendanceScore = attendanceRate ?? 0;
      const progressScore = Math.round(performanceScore * 0.55 + assessmentCompletion * 0.3 + attendanceScore * 0.15);

      let status: ProgressStatus = "no_data";
      if (studentResults.length || studentEntries.length || attendanceTotal) {
        if (progressScore >= 80) status = "excellent";
        else if (progressScore >= 65) status = "good";
        else if (progressScore >= 45) status = "watch";
        else status = "risk";
      }

      const readinessLabel = !enrollment
        ? "No active enrollment"
        : !curriculumPlacement
        ? "No active curriculum"
        : subjectCount === 0
        ? "No class subjects"
        : assessedSubjectCount < subjectCount
        ? "Assessment incomplete"
        : "Progress ready";

      return {
        student,
        enrollment,
        curriculumPlacement,
        className: classRow?.name || "No active class",
        academicStructureName: structure?.name || "No academic structure",
        academicPeriodName: period?.name || "No academic period",
        curriculumName: curriculum?.name || "No active curriculum",
        pathwayName: pathway?.name || "No pathway",
        subjectCount,
        assessedSubjectCount,
        assessmentEntryCount: studentEntries.length,
        computedResultCount: studentResults.length,
        totalScore: studentResults.reduce((sum, row: any) => sum + Number(row.total || 0), 0),
        averagePercentage,
        averageGpa,
        averagePosition,
        attendanceTotal,
        attendancePresent,
        attendanceAbsent,
        attendanceLate,
        attendanceRate,
        progressScore,
        status,
        readinessLabel,
      };
    });
  }, [
    students,
    activeEnrollmentByStudent,
    activeCurriculumByStudent,
    classMap,
    structureMap,
    periodMap,
    curriculumMap,
    pathwayMap,
    classSubjectsByClassPeriod,
    classSubjects,
    entriesByStudent,
    resultsByStudent,
    attendanceByStudent,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return progressRows
      .filter((item) => {
        if (filterClassId && item.enrollment?.classId !== filterClassId) return false;
        if (filterStructureId && item.enrollment?.academicStructureId !== filterStructureId) return false;
        if (filterPeriodId && item.enrollment?.academicPeriodId !== filterPeriodId) return false;
        if (filterCurriculumId && item.curriculumPlacement?.curriculumId !== filterCurriculumId) return false;
        if (filterStatus !== "all" && item.status !== filterStatus) return false;

        if (!query) return true;

        return `
          ${item.student.fullName}
          ${item.student.admissionNumber || ""}
          ${item.className}
          ${item.academicStructureName}
          ${item.academicPeriodName}
          ${item.curriculumName}
          ${item.pathwayName}
          ${item.status}
          ${item.readinessLabel}
        `.toLowerCase().includes(query);
      })
      .sort((a, b) => b.progressScore - a.progressScore || cleanText(a.student.fullName).localeCompare(cleanText(b.student.fullName)));
  }, [progressRows, search, filterClassId, filterStructureId, filterPeriodId, filterCurriculumId, filterStatus]);

  const selectedProgress = useMemo(() => {
    return progressRows.find((row) => row.student.id === selectedStudentId) || filteredRows[0];
  }, [progressRows, filteredRows, selectedStudentId]);

  const summary = useMemo(() => {
    const activeStudents = progressRows.filter((row) => !!row.enrollment).length;
    const excellent = progressRows.filter((row) => row.status === "excellent").length;
    const risk = progressRows.filter((row) => row.status === "risk").length;
    const noData = progressRows.filter((row) => row.status === "no_data").length;

    const progressAverage = progressRows.length
      ? Math.round(progressRows.reduce((sum, row) => sum + row.progressScore, 0) / progressRows.length)
      : 0;

    const attendanceRows = progressRows.filter((row) => row.attendanceRate !== undefined);
    const attendanceAverage = attendanceRows.length
      ? Math.round(attendanceRows.reduce((sum, row) => sum + Number(row.attendanceRate || 0), 0) / attendanceRows.length)
      : 0;

    return {
      students: progressRows.length,
      activeStudents,
      excellent,
      risk,
      noData,
      progressAverage,
      attendanceAverage,
    };
  }, [progressRows]);

  const activeFilterCount = useMemo(() => {
    return [
      filterClassId,
      filterStructureId,
      filterPeriodId,
      filterCurriculumId,
      filterStatus !== "all" ? filterStatus : undefined,
      viewMode !== "cards" ? viewMode : undefined,
    ].filter(Boolean).length;
  }, [filterClassId, filterCurriculumId, filterPeriodId, filterStatus, filterStructureId, viewMode]);

  const contextName = `${activeBranch?.name || "Selected branch"}${activeSchool?.name ? ` · ${activeSchool.name}` : ""}`;

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return <State primary={primary} title="Opening academic progress..." text="Checking account, workspace and student progress data." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing academic progress." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ap-page" style={{ "--ap-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ap-state-card">
          <h2>Select a branch first</h2>
          <p>Academic progress is calculated inside one active school branch.</p>
          <button type="button" className="ap-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="ap-page" style={{ "--ap-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ap-search-card">
        <span className={`ap-status-dot ${summary.risk ? "orange" : summary.students ? "green" : "gray"}`} />

        <label className="ap-search">
          <span>⌕</span>
          <input
            placeholder="Search progress..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <button type="button" className="ap-add-inline" onClick={load} title="Refresh" aria-label="Refresh">
          ↻
        </button>

        <button
          type="button"
          className={`ap-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFiltersOpen(true)}
          title="Filters"
          aria-label="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ap-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ap-filter-chips">
          {filterClassId && <button type="button" onClick={() => setFilterClassId(undefined)}>Class: {labelOf(classes, filterClassId)} ×</button>}
          {filterStructureId && <button type="button" onClick={() => setFilterStructureId(undefined)}>Structure: {labelOf(academicStructures, filterStructureId)} ×</button>}
          {filterPeriodId && <button type="button" onClick={() => setFilterPeriodId(undefined)}>Period: {labelOf(academicPeriods, filterPeriodId)} ×</button>}
          {filterCurriculumId && <button type="button" onClick={() => setFilterCurriculumId(undefined)}>Curriculum: {labelOf(curriculums, filterCurriculumId)} ×</button>}
          {filterStatus !== "all" && <button type="button" onClick={() => setFilterStatus("all")}>Status: {statusLabel(filterStatus)} ×</button>}
          {viewMode !== "cards" && <button type="button" onClick={() => setViewMode("cards")}>View: {viewMode} ×</button>}
        </section>
      )}

      <section className="ap-summary-line">
        <div>
          <strong>{viewMode === "details" ? (selectedProgress ? 1 : 0) : filteredRows.length}</strong>
          <span>{viewMode === "details" ? "student selected" : "students shown"}</span>
        </div>
        <p>{contextName} · Avg {summary.progressAverage}% · Att {summary.attendanceAverage}%</p>
      </section>

      {viewMode === "analytics" && (
        <section className="ap-analysis-grid">
          <Metric label="Students" value={summary.students} />
          <Metric label="Active" value={summary.activeStudents} />
          <Metric label="Excellent" value={summary.excellent} />
          <Metric label="At Risk" value={summary.risk} />
          <Metric label="No Data" value={summary.noData} />
          <Metric label="Avg Progress" value={`${summary.progressAverage}%`} />
          <Metric label="Avg Attendance" value={`${summary.attendanceAverage}%`} />
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ap-list">
          {filteredRows.map((item) => {
            const active = selectedProgress?.student.id === item.student.id;

            return (
              <button
                key={item.student.id}
                type="button"
                onClick={() => {
                  setSelectedStudentId(item.student.id);
                  setViewMode("details");
                }}
                className={`ap-student-row ${active ? "active" : ""}`}
              >
                <Avatar student={item.student} primary={primary} />

                <span className="ap-student-main">
                  <strong>{item.student.fullName}</strong>
                  <small>{item.student.admissionNumber || "No admission no."} · {item.className}</small>
                  <em>{item.readinessLabel}</em>
                </span>

                <span className="ap-student-side">
                  <b>{item.progressScore}%</b>
                  <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
                </span>
              </button>
            );
          })}

          {!filteredRows.length && <Empty text="No academic progress records match the current filters." />}
        </section>
      )}

      {viewMode === "details" && selectedProgress && (
        <section className="ap-detail-panel">
          <div className="ap-detail-head">
            <div className="ap-detail-title-row">
              <Avatar student={selectedProgress.student} primary={primary} large />
              <div>
                <h2>{selectedProgress.student.fullName}</h2>
                <p>{selectedProgress.student.admissionNumber || "No admission number"}</p>
              </div>
            </div>
            <Chip tone={statusTone(selectedProgress.status)}>{statusLabel(selectedProgress.status)}</Chip>
          </div>

          <section className="ap-progress-card">
            <span>Progress Score</span>
            <strong>{selectedProgress.progressScore}%</strong>
            <ProgressBar value={selectedProgress.progressScore} />
            <div className="ap-chip-row">
              <Chip tone="gray">{selectedProgress.readinessLabel}</Chip>
            </div>
          </section>

          <section className="ap-detail-card">
            <span>Academic Placement</span>
            <InfoGrid
              rows={[
                ["Class", selectedProgress.className],
                ["Structure", selectedProgress.academicStructureName],
                ["Period", selectedProgress.academicPeriodName],
                ["Curriculum", selectedProgress.curriculumName],
                ["Pathway", selectedProgress.pathwayName],
              ]}
            />
          </section>

          <section className="ap-detail-card">
            <span>Assessment Progress</span>
            <div className="ap-chip-row">
              <Chip tone="blue">Subjects {selectedProgress.assessedSubjectCount}/{selectedProgress.subjectCount}</Chip>
              <Chip tone="gray">Entries {selectedProgress.assessmentEntryCount}</Chip>
              <Chip tone="green">Computed {selectedProgress.computedResultCount}</Chip>
              <Chip tone="purple">Average {selectedProgress.averagePercentage ?? "-"}%</Chip>
              <Chip tone="orange">Position {selectedProgress.averagePosition ?? "-"}</Chip>
              <Chip tone="gray">GPA {selectedProgress.averageGpa ?? "-"}</Chip>
            </div>
          </section>

          <section className="ap-detail-card">
            <span>Attendance Strength</span>
            <div className="ap-chip-row">
              <Chip tone="green">Present {selectedProgress.attendancePresent}</Chip>
              <Chip tone="red">Absent {selectedProgress.attendanceAbsent}</Chip>
              <Chip tone="orange">Late {selectedProgress.attendanceLate}</Chip>
              <Chip tone="blue">Rate {selectedProgress.attendanceRate ?? "-"}%</Chip>
              <Chip tone="gray">Total {selectedProgress.attendanceTotal}</Chip>
            </div>
          </section>
        </section>
      )}

      {filtersOpen && (
        <FilterSheet
          classes={classes}
          academicStructures={academicStructures}
          academicPeriods={academicPeriods}
          curriculums={curriculums}
          filterClassId={filterClassId}
          setFilterClassId={setFilterClassId}
          filterStructureId={filterStructureId}
          setFilterStructureId={setFilterStructureId}
          filterPeriodId={filterPeriodId}
          setFilterPeriodId={setFilterPeriodId}
          filterCurriculumId={filterCurriculumId}
          setFilterCurriculumId={setFilterCurriculumId}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          close={() => setFiltersOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={setViewMode}
          close={() => setMoreOpen(false)}
          refresh={async () => {
            setMoreOpen(false);
            await load();
          }}
        />
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ap-page" style={{ "--ap-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ap-state-card">
        <div className="ap-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="ap-analysis-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Avatar({ student, primary, large = false }: { student: Student; primary: string; large?: boolean }) {
  return (
    <div
      className={`ap-avatar ${large ? "large" : ""}`}
      style={{
        background: (student as any).photo
          ? `url(${(student as any).photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!(student as any).photo && cleanText(student.fullName).slice(0, 1).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ap-chip ${tone}`}>{children}</span>;
}

function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="ap-progress-track">
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function InfoGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="ap-info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <section className="ap-empty">
      <div>📊</div>
      <h3>No records</h3>
      <p>{text}</p>
    </section>
  );
}

function SliderIcon() {
  return (
    <svg className="ap-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
  classes,
  academicStructures,
  academicPeriods,
  curriculums,
  filterClassId,
  setFilterClassId,
  filterStructureId,
  setFilterStructureId,
  filterPeriodId,
  setFilterPeriodId,
  filterCurriculumId,
  setFilterCurriculumId,
  filterStatus,
  setFilterStatus,
  close,
}: {
  classes: Class[];
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  curriculums: Curriculum[];
  filterClassId?: number;
  setFilterClassId: (id?: number) => void;
  filterStructureId?: number;
  setFilterStructureId: (id?: number) => void;
  filterPeriodId?: number;
  setFilterPeriodId: (id?: number) => void;
  filterCurriculumId?: number;
  setFilterCurriculumId: (id?: number) => void;
  filterStatus: "all" | ProgressStatus;
  setFilterStatus: (status: "all" | ProgressStatus) => void;
  close: () => void;
}) {
  return (
    <div className="ap-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ap-sheet">
        <div className="ap-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose the academic progress scope. School and branch stay locked.</p>
          </div>
          <button type="button" onClick={close}>✕</button>
        </div>

        <div className="ap-form">
          <label>
            <span>Class</span>
            <select value={filterClassId || ""} onChange={(event) => setFilterClassId(cleanId(event.target.value) || undefined)}>
              <option value="">All classes</option>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Academic Structure</span>
            <select value={filterStructureId || ""} onChange={(event) => setFilterStructureId(cleanId(event.target.value) || undefined)}>
              <option value="">All structures</option>
              {academicStructures.map((row: any) => (
                <option key={row.id} value={row.id}>{row.name} {row.level ? `· ${row.level}` : ""}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Academic Period</span>
            <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(cleanId(event.target.value) || undefined)}>
              <option value="">All periods</option>
              {academicPeriods.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Curriculum</span>
            <select value={filterCurriculumId || ""} onChange={(event) => setFilterCurriculumId(cleanId(event.target.value) || undefined)}>
              <option value="">All curriculums</option>
              {curriculums.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
              <option value="all">All progress status</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="watch">Watch</option>
              <option value="risk">At Risk</option>
              <option value="no_data">No Data</option>
            </select>
          </label>
        </div>

        <div className="ap-sheet-actions">
          <button
            type="button"
            onClick={() => {
              setFilterClassId(undefined);
              setFilterStructureId(undefined);
              setFilterPeriodId(undefined);
              setFilterCurriculumId(undefined);
              setFilterStatus("all");
            }}
          >
            Clear
          </button>
          <button type="button" className="primary" onClick={close}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  close,
  refresh,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  close: () => void;
  refresh: () => void | Promise<void>;
}) {
  return (
    <div className="ap-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ap-sheet small">
        <div className="ap-sheet-head">
          <div>
            <h2>More</h2>
            <p>Academic progress views and refresh.</p>
          </div>
          <button type="button" onClick={close}>✕</button>
        </div>

        <div className="ap-menu-list">
          <button className={viewMode === "cards" ? "active" : ""} onClick={() => { setViewMode("cards"); close(); }}>
            <span>☰</span><b>Students</b><small>Compact student progress list</small>
          </button>
          <button className={viewMode === "details" ? "active" : ""} onClick={() => { setViewMode("details"); close(); }}>
            <span>👤</span><b>Details</b><small>Selected student deep view</small>
          </button>
          <button className={viewMode === "analytics" ? "active" : ""} onClick={() => { setViewMode("analytics"); close(); }}>
            <span>◔</span><b>Analytics</b><small>Progress summary metrics</small>
          </button>
          <button onClick={refresh}>
            <span>↻</span><b>Refresh</b><small>Reload progress data</small>
          </button>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes apSpin{to{transform:rotate(360deg)}}
.ap-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ap-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ap-page *,.ap-page *::before,.ap-page *::after{box-sizing:border-box;min-width:0}
.ap-page button,.ap-page input,.ap-page select,.ap-page textarea{font:inherit;max-width:100%}
.ap-page button{-webkit-tap-highlight-color:transparent}
.ap-page input,.ap-page select,.ap-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}
.ap-page input:focus,.ap-page select:focus,.ap-page textarea:focus{border-color:color-mix(in srgb,var(--ap-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ap-primary) 12%,transparent)}
.ap-state-card,.ap-search-card,.ap-summary-line,.ap-student-row,.ap-detail-panel,.ap-progress-card,.ap-detail-card,.ap-analysis-card,.ap-empty,.ap-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ap-state-card{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ap-state-card h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}
.ap-state-card p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ap-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ap-primary) 18%,transparent);border-top-color:var(--ap-primary);animation:apSpin .8s linear infinite}
.ap-primary-btn{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ap-primary);color:#fff;font-weight:950;cursor:pointer;box-shadow:0 14px 32px color-mix(in srgb,var(--ap-primary) 25%,transparent)}
.ap-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) 42px 42px 42px;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ap-status-dot{width:10px;height:10px;border-radius:999px;display:inline-flex}.ap-status-dot.green{background:#22c55e}.ap-status-dot.orange{background:#f59e0b}.ap-status-dot.gray{background:var(--muted,#64748b)}
.ap-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.ap-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}
.ap-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ap-icon-button,.ap-filter-button,.ap-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ap-add-inline{border-color:var(--ap-primary);background:var(--ap-primary);color:#fff;font-size:15px;box-shadow:0 12px 28px color-mix(in srgb,var(--ap-primary) 22%,transparent)}
.ap-filter-button{position:relative;background:color-mix(in srgb,var(--ap-primary) 8%,var(--card-bg,#fff));color:var(--ap-primary)}
.ap-filter-button.active{background:var(--ap-primary);color:#fff;border-color:var(--ap-primary)}
.ap-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}
.ap-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.ap-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ap-filter-chips::-webkit-scrollbar{display:none}
.ap-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ap-primary) 11%,transparent);color:var(--ap-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ap-summary-line{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;padding:10px 12px;border-radius:20px}
.ap-summary-line div{display:flex;align-items:baseline;gap:6px;min-width:0}.ap-summary-line strong{font-size:21px;font-weight:1000;letter-spacing:-.05em}.ap-summary-line span,.ap-summary-line p{color:var(--muted,#64748b);font-size:12px;font-weight:850}.ap-summary-line p{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-list{display:grid;gap:8px;margin-top:10px}
.ap-student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}
.ap-student-row:hover,.ap-student-row.active{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ap-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}
.ap-avatar{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;border-radius:18px;color:#fff;background:var(--ap-primary);font-size:17px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}
.ap-avatar.large{width:58px;height:58px;border-radius:21px;font-size:22px}
.ap-student-main,.ap-student-main strong,.ap-student-main small,.ap-student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}
.ap-student-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850;font-style:normal}
.ap-student-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}
.ap-student-side{display:grid;justify-items:end;gap:5px;flex:0 0 auto}.ap-student-side b{font-size:18px;font-weight:1000;letter-spacing:-.05em}
.ap-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}
.ap-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ap-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ap-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ap-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ap-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ap-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ap-analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
.ap-analysis-card{padding:12px;border-radius:22px}.ap-analysis-card span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ap-analysis-card strong{display:block;margin-top:8px;font-size:24px;font-weight:1000;letter-spacing:-.06em}
.ap-detail-panel{display:grid;gap:10px;margin-top:10px;padding:11px;border-radius:24px}
.ap-detail-head,.ap-detail-title-row{display:flex;align-items:flex-start;gap:10px;min-width:0}.ap-detail-head{justify-content:space-between}
.ap-detail-title-row div:last-child{min-width:0}.ap-detail-title-row h2,.ap-detail-title-row p{display:block;overflow:hidden;text-overflow:ellipsis}.ap-detail-title-row h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.04em}.ap-detail-title-row p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:800}
.ap-progress-card,.ap-detail-card{padding:12px;border-radius:22px}.ap-progress-card>span,.ap-detail-card>span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ap-progress-card>strong{display:block;margin-top:8px;font-size:34px;font-weight:1000;letter-spacing:-.06em}
.ap-progress-track{height:10px;margin-top:10px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 20%,transparent);overflow:hidden}.ap-progress-track span{display:block;height:100%;border-radius:inherit;background:var(--ap-primary)}
.ap-chip-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}
.ap-info-grid{display:grid;gap:8px;margin-top:10px}.ap-info-grid div{min-width:0;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}.ap-info-grid span,.ap-info-grid strong{display:block;overflow:hidden;text-overflow:ellipsis}.ap-info-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.ap-info-grid strong{margin-top:3px;font-size:13px;font-weight:900}
.ap-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:210px;margin-top:10px;padding:22px;border-radius:24px;border-style:dashed;text-align:center}.ap-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ap-primary) 12%,var(--surface,#fff));font-size:28px}.ap-empty h3{margin:0;font-size:18px;font-weight:1000}.ap-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ap-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}
.ap-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}
.ap-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}
.ap-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ap-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ap-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ap-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}
.ap-form{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ap-form label{display:grid;gap:6px;min-width:0}.ap-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
.ap-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ap-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ap-sheet-actions button.primary{border-color:var(--ap-primary);background:var(--ap-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ap-primary) 25%,transparent)}
.ap-menu-list{display:grid;gap:8px}.ap-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ap-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ap-primary) 10%,transparent);color:var(--ap-primary);font-weight:1000}.ap-menu-list button b,.ap-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ap-menu-list button b{font-size:13px;font-weight:1000}.ap-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ap-menu-list button.active{border-color:color-mix(in srgb,var(--ap-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ap-primary) 8%,var(--surface,#fff))}
@media (min-width:680px){.ap-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ap-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.ap-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ap-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ap-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-sheet-backdrop{place-items:center;padding:18px}.ap-sheet{border-radius:28px;padding:18px}.ap-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1040px){.ap-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ap-search-card,.ap-list,.ap-analysis-grid,.ap-detail-panel,.ap-filter-chips,.ap-summary-line{max-width:1180px;margin-left:auto;margin-right:auto}.ap-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ap-detail-panel{grid-template-columns:1.05fr .95fr;align-items:start}.ap-detail-head{grid-column:1/-1}.ap-progress-card{grid-row:span 2}}
@media (max-width:520px){.ap-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ap-search-card{grid-template-columns:auto minmax(0,1fr) 40px 40px 40px;gap:6px;padding:6px;border-radius:22px}.ap-icon-button,.ap-filter-button,.ap-add-inline{width:40px;height:40px}.ap-summary-line{display:grid}.ap-detail-head{display:grid}.ap-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ap-sheet-actions button{width:100%}}
`;
