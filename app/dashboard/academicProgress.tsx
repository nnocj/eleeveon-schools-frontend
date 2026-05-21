"use client";

/**
 * AcademicProgress.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACADEMIC PROGRESS DASHBOARD
 * ---------------------------------------------------------
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
 * - Mobile-first cards and dashboard-shell safe layout.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
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
} from "../lib/db";

// ======================================================
// TYPES
// ======================================================

type ProgressStatus = "excellent" | "good" | "watch" | "risk" | "no_data";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
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
// COMPONENT
// ======================================================

export default function AcademicProgress() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

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
  const [detailOpen, setDetailOpen] = useState(true);

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

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
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
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
        db.students.toArray(),
        db.studentEnrollments.toArray(),
        db.studentCurriculums.toArray(),
        db.classes.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.classSubjects.toArray(),
        db.assessmentEntries.toArray(),
        db.computedResults.toArray(),
        db.attendance.toArray(),
      ]);

      setStudents(
        studentRows
          .filter(sameTenant)
          .filter((student) => student.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
      setEnrollments(enrollmentRows.filter(sameTenant));
      setStudentCurriculums(studentCurriculumRows.filter(sameTenant));
      setClasses(classRows.filter(sameTenant));
      setAcademicStructures(structureRows.filter(sameTenant));
      setAcademicPeriods(periodRows.filter(sameTenant));
      setCurriculums(curriculumRows.filter(sameTenant));
      setPathways(pathwayRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
      setAssessmentEntries(entryRows.filter(sameTenant));
      setComputedResults(resultRows.filter(sameTenant));
      setAttendance(attendanceRows.filter(sameTenant));
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
  }, [authenticated, accountId, schoolId, branchId]);

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

  // ======================================================
  // STATUS HELPERS
  // ======================================================

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
        .map((row) => Number(row.percentage ?? row.average ?? row.total ?? 0))
        .filter((value) => !Number.isNaN(value));

      const averagePercentage = resultPercentages.length
        ? Math.round(resultPercentages.reduce((sum, value) => sum + value, 0) / resultPercentages.length)
        : undefined;

      const gpas = studentResults
        .map((row) => row.gpa)
        .filter((value) => value !== undefined && value !== null) as number[];

      const averageGpa = gpas.length
        ? Number((gpas.reduce((sum, value) => sum + Number(value), 0) / gpas.length).toFixed(2))
        : undefined;

      const positions = studentResults
        .map((row) => row.position)
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
        totalScore: studentResults.reduce((sum, row) => sum + Number(row.total || 0), 0),
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
      .sort((a, b) => b.progressScore - a.progressScore || a.student.fullName.localeCompare(b.student.fullName));
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

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="ap-page" style={{ "--ap-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ap-state-card">
          <div className="ap-spinner" />
          <h2>Opening academic progress...</h2>
          <p>Checking account, school, branch, and student progress data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ap-page" style={{ "--ap-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ap-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing academic progress.</p>
        </section>
      </main>
    );
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

      <section className="ap-hero">
        <div className="ap-hero-left">
          <div className="ap-hero-icon">📊</div>
          <div className="ap-title-wrap">
            <p>Student Analytics</p>
            <h2>Academic Progress</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="ap-ghost-btn" onClick={load}>
          Refresh
        </button>
      </section>

      <section className="ap-summary-grid" aria-label="Academic progress summary">
        <SummaryCard label="Students" value={summary.students} icon="🧑‍🎓" />
        <SummaryCard label="Active Enrollment" value={summary.activeStudents} icon="🏷" />
        <SummaryCard label="Avg Progress" value={`${summary.progressAverage}%`} icon="📈" />
        <SummaryCard label="Avg Attendance" value={`${summary.attendanceAverage}%`} icon="📅" />
        <SummaryCard label="At Risk" value={summary.risk} icon="⚠️" />
      </section>

      <section className="ap-filter-card">
        <input
          placeholder="Search student, class, curriculum, readiness..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterClassId || ""} onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>

        <select value={filterStructureId || ""} onChange={(event) => setFilterStructureId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Structures</option>
          {academicStructures.map((row) => (
            <option key={row.id} value={row.id}>{row.name} • {row.level}</option>
          ))}
        </select>

        <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Periods</option>
          {academicPeriods.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>

        <select value={filterCurriculumId || ""} onChange={(event) => setFilterCurriculumId(Number(event.target.value) || undefined)}>
          <option value="">All Curriculums</option>
          {curriculums.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Progress Status</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="watch">Watch</option>
          <option value="risk">At Risk</option>
          <option value="no_data">No Data</option>
        </select>
      </section>

      <section className="ap-mobile-toggle">
        <button type="button" className={!detailOpen ? "active" : ""} onClick={() => setDetailOpen(false)}>
          Students
        </button>
        <button type="button" className={detailOpen ? "active" : ""} onClick={() => setDetailOpen(true)}>
          Details
        </button>
      </section>

      <section className="ap-main-grid">
        <div className={`ap-list-panel ${detailOpen ? "hide-mobile" : ""}`}>
          <div className="ap-section-head">
            <div>
              <h2>Student Progress</h2>
              <p>{filteredRows.length} student record(s)</p>
            </div>
          </div>

          <div className="ap-student-list">
            {filteredRows.map((item) => {
              const active = selectedProgress?.student.id === item.student.id;

              return (
                <button
                  key={item.student.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudentId(item.student.id);
                    setDetailOpen(true);
                  }}
                  className={`ap-student-card ${active ? "active" : ""}`}
                >
                  <div className="ap-student-top">
                    <Avatar student={item.student} primary={primary} />

                    <div className="ap-student-info">
                      <div className="ap-name-row">
                        <strong>{item.student.fullName}</strong>
                        <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
                      </div>
                      <p>{item.student.admissionNumber || "No admission no."} · {item.className}</p>
                    </div>

                    <div className="ap-score">{item.progressScore}%</div>
                  </div>

                  <ProgressBar value={item.progressScore} />

                  <div className="ap-chip-row">
                    <Chip tone="blue">Assess {item.assessedSubjectCount}/{item.subjectCount}</Chip>
                    <Chip tone="gray">Att {item.attendanceRate ?? "-"}%</Chip>
                    <Chip tone="purple">{item.readinessLabel}</Chip>
                  </div>
                </button>
              );
            })}

            {!filteredRows.length && (
              <div className="ap-empty-card">No academic progress records found.</div>
            )}
          </div>
        </div>

        <div className={`ap-detail-panel ${detailOpen ? "" : "hide-mobile"}`}>
          {selectedProgress ? (
            <>
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
                <div className="ap-card-label">Progress Score</div>
                <strong>{selectedProgress.progressScore}%</strong>
                <ProgressBar value={selectedProgress.progressScore} />
                <div className="ap-chip-row">
                  <Chip tone="gray">{selectedProgress.readinessLabel}</Chip>
                </div>
              </section>

              <section className="ap-detail-card">
                <div className="ap-card-label">Academic Placement</div>
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
                <div className="ap-card-label">Assessment Progress</div>
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
                <div className="ap-card-label">Attendance Strength</div>
                <div className="ap-chip-row">
                  <Chip tone="green">Present {selectedProgress.attendancePresent}</Chip>
                  <Chip tone="red">Absent {selectedProgress.attendanceAbsent}</Chip>
                  <Chip tone="orange">Late {selectedProgress.attendanceLate}</Chip>
                  <Chip tone="blue">Rate {selectedProgress.attendanceRate ?? "-"}%</Chip>
                  <Chip tone="gray">Total {selectedProgress.attendanceTotal}</Chip>
                </div>
              </section>
            </>
          ) : (
            <div className="ap-empty-card">Select a student to view progress.</div>
          )}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="ap-summary-card">
      <div className="ap-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ student, primary, large = false }: { student: Student; primary: string; large?: boolean }) {
  return (
    <div
      className={`ap-avatar ${large ? "large" : ""}`}
      style={{
        background: student.photo
          ? `url(${student.photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
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

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes apSpin {
  to { transform: rotate(360deg); }
}

.ap-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.ap-page *,
.ap-page *::before,
.ap-page *::after {
  box-sizing: border-box;
}

.ap-page button,
.ap-page input,
.ap-page select,
.ap-page textarea {
  font: inherit;
  max-width: 100%;
}

.ap-page input,
.ap-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.ap-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.ap-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ap-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ap-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ap-primary) 18%, transparent);
  border-top-color: var(--ap-primary);
  animation: apSpin .8s linear infinite;
}

.ap-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--ap-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ap-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--ap-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.ap-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.ap-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--ap-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ap-primary) 28%, transparent);
  font-size: 22px;
}

.ap-title-wrap {
  min-width: 0;
}

.ap-title-wrap p,
.ap-title-wrap h2,
.ap-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-title-wrap p {
  margin: 0 0 2px;
  color: var(--ap-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ap-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.ap-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.ap-ghost-btn {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ap-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.ap-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.ap-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--ap-primary) 12%, #fff);
}

.ap-summary-card div:last-child {
  min-width: 0;
}

.ap-summary-card strong,
.ap-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ap-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ap-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
}

.ap-mobile-toggle {
  position: sticky;
  top: 50px;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 88%, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  backdrop-filter: blur(12px);
}

.ap-mobile-toggle button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ap-mobile-toggle button.active {
  background: var(--ap-primary);
  color: #fff;
}

.ap-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.ap-list-panel,
.ap-detail-panel {
  min-width: 0;
  border-radius: 26px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
  padding: 10px;
  overflow: hidden;
}

.ap-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.ap-section-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ap-section-head p {
  margin: 3px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 800;
}

.ap-student-list {
  display: grid;
  gap: 9px;
}

.ap-student-card,
.ap-empty-card,
.ap-detail-card,
.ap-progress-card {
  min-width: 0;
  border-radius: 22px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.ap-student-card {
  width: 100%;
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.ap-student-card.active {
  border-color: var(--ap-primary);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ap-primary) 14%, transparent);
}

.ap-student-top,
.ap-detail-head,
.ap-detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ap-detail-head {
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.ap-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  color: #fff;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15, 23, 42, .12);
}

.ap-avatar.large {
  width: 56px;
  height: 56px;
  border-radius: 20px;
  font-size: 22px;
}

.ap-student-info,
.ap-detail-title-row div:last-child {
  min-width: 0;
  flex: 1;
}

.ap-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.ap-name-row strong,
.ap-detail-head h2,
.ap-student-info p,
.ap-detail-head p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ap-name-row strong {
  min-width: 0;
  font-size: 14px;
  font-weight: 1000;
}

.ap-student-info p,
.ap-detail-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.35;
}

.ap-detail-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ap-score {
  flex: 0 0 auto;
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ap-progress-track {
  height: 10px;
  margin-top: 11px;
  border-radius: 999px;
  background: rgba(148, 163, 184, .22);
  overflow: hidden;
}

.ap-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ap-primary);
}

.ap-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ap-chip {
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
}

.ap-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ap-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ap-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ap-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.ap-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ap-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.ap-detail-panel {
  display: grid;
  gap: 10px;
}

.ap-progress-card,
.ap-detail-card,
.ap-empty-card {
  padding: 13px;
}

.ap-progress-card > strong {
  display: block;
  margin-top: 8px;
  font-size: 34px;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.ap-card-label {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ap-info-grid {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.ap-info-grid div {
  min-width: 0;
  padding: 10px;
  border-radius: 16px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
}

.ap-info-grid span,
.ap-info-grid strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ap-info-grid span {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ap-info-grid strong {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 900;
}

.ap-empty-card {
  text-align: center;
  color: var(--muted, #64748b);
  font-size: 13px;
  font-weight: 850;
  border-style: dashed;
}

@media (min-width: 680px) {
  .ap-page {
    padding: 12px;
  }

  .ap-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ap-filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ap-info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .ap-page {
    padding: 16px;
  }

  .ap-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .ap-filter-card {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .ap-mobile-toggle {
    display: none;
  }

  .ap-main-grid {
    grid-template-columns: minmax(300px, .92fr) minmax(0, 1.08fr);
    align-items: start;
  }

  .ap-list-panel.hide-mobile,
  .ap-detail-panel.hide-mobile {
    display: block;
  }
}

@media (max-width: 1039px) {
  .ap-list-panel.hide-mobile,
  .ap-detail-panel.hide-mobile {
    display: none;
  }
}

@media (max-width: 520px) {
  .ap-page {
    padding: 6px;
  }

  .ap-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .ap-ghost-btn {
    width: 100%;
  }

  .ap-summary-grid {
    gap: 6px;
  }

  .ap-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .ap-mobile-toggle {
    top: 46px;
    border-radius: 22px;
  }

  .ap-list-panel,
  .ap-detail-panel {
    border-radius: 22px;
    padding: 8px;
  }

  .ap-detail-head {
    flex-direction: column;
  }

  .ap-student-card,
  .ap-progress-card,
  .ap-detail-card {
    border-radius: 20px;
    padding: 11px;
  }
}
`;
