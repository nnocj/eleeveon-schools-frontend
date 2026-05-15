"use client";

/**
 * AcademicProgress.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL ACADEMIC PROGRESS DASHBOARD
 * ---------------------------------------------------------
 *
 * IMPORTANT DB NOTE
 * ---------------------------------------------------------
 * Current db.ts does NOT have a dedicated academicProgress table.
 * This page is therefore a safe projection/analytics layer over:
 *
 * - students
 * - studentEnrollments
 * - studentCurriculums
 * - classes
 * - academicStructures
 * - academicPeriods
 * - classSubjects
 * - assessmentEntries
 * - computedResults
 * - attendance
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Student Academic Progress
 *
 * This page answers:
 * - Which students are academically active?
 * - Which class/period are they in?
 * - Which curriculum/pathway are they following?
 * - How complete are their assessments?
 * - What is their computed performance?
 * - What is their attendance strength?
 * - Are they promotion/report-ready?
 */

import React, { useEffect, useMemo, useState } from "react";

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

import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type ProgressStatus = "excellent" | "good" | "watch" | "risk" | "no_data";

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
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

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

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

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
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );

      setEnrollments(enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudentCurriculums(
        studentCurriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAcademicStructures(structureRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAcademicPeriods(periodRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculums(curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPathways(pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClassSubjects(classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAssessmentEntries(entryRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setComputedResults(resultRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAttendance(attendanceRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load academic progress:", error);
      alert("Failed to load academic progress data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const structureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );
  const periodMap = useMemo(
    () => new Map(academicPeriods.map(row => [row.id, row])),
    [academicPeriods]
  );
  const curriculumMap = useMemo(
    () => new Map(curriculums.map(row => [row.id, row])),
    [curriculums]
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map(row => [row.id, row])),
    [pathways]
  );

  const activeEnrollmentByStudent = useMemo(() => {
    const map = new Map<number, StudentEnrollment>();

    [...enrollments]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .forEach(row => {
        if (row.status !== "active") return;
        if (!map.has(row.studentId)) map.set(row.studentId, row);
      });

    return map;
  }, [enrollments]);

  const activeCurriculumByStudent = useMemo(() => {
    const map = new Map<number, StudentCurriculum>();

    [...studentCurriculums]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .forEach(row => {
        if (row.status !== "active" || row.active === false) return;
        if (!map.has(row.studentId)) map.set(row.studentId, row);
      });

    return map;
  }, [studentCurriculums]);

  const classSubjectsByClassPeriod = useMemo(() => {
    const map = new Map<string, ClassSubject[]>();

    classSubjects.forEach(row => {
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

    assessmentEntries.forEach(row => {
      if (row.active === false) return;
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [assessmentEntries]);

  const resultsByStudent = useMemo(() => {
    const map = new Map<number, ComputedResult[]>();

    computedResults.forEach(row => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [computedResults]);

  const attendanceByStudent = useMemo(() => {
    const map = new Map<number, Attendance[]>();

    attendance.forEach(row => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [attendance]);

  // ======================================================
  // PROGRESS MODEL
  // ======================================================

  const progressRows = useMemo<StudentProgressView[]>(() => {
    return students.map(student => {
      const enrollment = activeEnrollmentByStudent.get(student.id || 0);
      const curriculumPlacement = activeCurriculumByStudent.get(student.id || 0);

      const classRow = enrollment?.classId ? classMap.get(enrollment.classId) : undefined;
      const structure = enrollment?.academicStructureId
        ? structureMap.get(enrollment.academicStructureId)
        : undefined;
      const period = enrollment?.academicPeriodId
        ? periodMap.get(enrollment.academicPeriodId)
        : undefined;
      const curriculum = curriculumPlacement?.curriculumId
        ? curriculumMap.get(curriculumPlacement.curriculumId)
        : undefined;
      const pathway = curriculumPlacement?.pathwayId
        ? pathwayMap.get(curriculumPlacement.pathwayId)
        : undefined;

      const classPeriodKey = enrollment
        ? `${enrollment.classId}:${enrollment.academicStructureId}:${enrollment.academicPeriodId || 0}`
        : "";

      const deliverySubjects = enrollment
        ? classSubjectsByClassPeriod.get(classPeriodKey) ||
          classSubjects.filter(
            row =>
              row.classId === enrollment.classId &&
              row.academicStructureId === enrollment.academicStructureId &&
              (row.academicPeriodId === enrollment.academicPeriodId || !row.academicPeriodId) &&
              row.active !== false
          )
        : [];

      const studentEntries = (entriesByStudent.get(student.id || 0) || []).filter(row => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const studentResults = (resultsByStudent.get(student.id || 0) || []).filter(row => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const assessedSubjectIds = new Set(studentResults.map(row => row.subjectId));
      const entrySubjectIds = new Set(studentEntries.map(row => row.subjectId));
      entrySubjectIds.forEach(id => assessedSubjectIds.add(id));

      const studentAttendance = (attendanceByStudent.get(student.id || 0) || []).filter(row => {
        if (!enrollment) return true;
        return (
          row.classId === enrollment.classId &&
          row.academicStructureId === enrollment.academicStructureId &&
          row.academicPeriodId === enrollment.academicPeriodId
        );
      });

      const attendanceTotal = studentAttendance.length;
      const attendancePresent = studentAttendance.filter(row => row.status === "present").length;
      const attendanceAbsent = studentAttendance.filter(row => row.status === "absent").length;
      const attendanceLate = studentAttendance.filter(row => row.status === "late").length;
      const attendanceRate = attendanceTotal
        ? Math.round((attendancePresent / attendanceTotal) * 100)
        : undefined;

      const resultPercentages = studentResults
        .map(row => Number(row.percentage ?? row.average ?? row.total ?? 0))
        .filter(value => !Number.isNaN(value));

      const averagePercentage = resultPercentages.length
        ? Math.round(resultPercentages.reduce((sum, value) => sum + value, 0) / resultPercentages.length)
        : undefined;

      const gpas = studentResults
        .map(row => row.gpa)
        .filter(value => value !== undefined && value !== null) as number[];

      const averageGpa = gpas.length
        ? Number((gpas.reduce((sum, value) => sum + Number(value), 0) / gpas.length).toFixed(2))
        : undefined;

      const positions = studentResults
        .map(row => row.position)
        .filter(value => value !== undefined && value !== null) as number[];

      const averagePosition = positions.length
        ? Math.round(positions.reduce((sum, value) => sum + Number(value), 0) / positions.length)
        : undefined;

      const subjectCount = deliverySubjects.length;
      const assessedSubjectCount = assessedSubjectIds.size;

      const assessmentCompletion = subjectCount
        ? Math.round((assessedSubjectCount / subjectCount) * 100)
        : 0;

      const performanceScore = averagePercentage ?? 0;
      const attendanceScore = attendanceRate ?? 0;

      const progressScore = Math.round(
        performanceScore * 0.55 + assessmentCompletion * 0.3 + attendanceScore * 0.15
      );

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
      .filter(item => {
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
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.progressScore - a.progressScore || a.student.fullName.localeCompare(b.student.fullName));
  }, [
    progressRows,
    search,
    filterClassId,
    filterStructureId,
    filterPeriodId,
    filterCurriculumId,
    filterStatus,
  ]);

  const selectedProgress = useMemo(() => {
    return progressRows.find(row => row.student.id === selectedStudentId) || filteredRows[0];
  }, [progressRows, filteredRows, selectedStudentId]);

  const summary = useMemo(() => {
    const activeStudents = progressRows.filter(row => !!row.enrollment).length;
    const excellent = progressRows.filter(row => row.status === "excellent").length;
    const risk = progressRows.filter(row => row.status === "risk").length;
    const noData = progressRows.filter(row => row.status === "no_data").length;

    const progressAverage = progressRows.length
      ? Math.round(progressRows.reduce((sum, row) => sum + row.progressScore, 0) / progressRows.length)
      : 0;

    const attendanceRows = progressRows.filter(row => row.attendanceRate !== undefined);
    const attendanceAverage = attendanceRows.length
      ? Math.round(
          attendanceRows.reduce((sum, row) => sum + Number(row.attendanceRate || 0), 0) /
            attendanceRows.length
        )
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
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

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

  const progressBar = (value: number): React.CSSProperties => ({
    height: 10,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${primary} ${Math.max(0, Math.min(100, value))}%, rgba(0,0,0,0.08) ${Math.max(0, Math.min(100, value))}%)`,
  });

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading academic progress...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Academic progress is calculated inside a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Academic Progress</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Tracking academic readiness in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button type="button" onClick={load} style={ghostButton}>
          Refresh
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.students}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active Enrollment</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.activeStudents}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Avg Progress</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.progressAverage}%</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Avg Attendance</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.attendanceAverage}%</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>At Risk</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.risk}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search student, class, curriculum, readiness..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterClassId || ""}
          onChange={e => setFilterClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Classes</option>
          {classes.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterStructureId || ""}
          onChange={e => setFilterStructureId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Academic Structures</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={filterPeriodId || ""}
          onChange={e => setFilterPeriodId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Academic Periods</option>
          {academicPeriods.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterCurriculumId || ""}
          onChange={e => setFilterCurriculumId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Curriculums</option>
          {curriculums.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Progress Status</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="watch">Watch</option>
          <option value="risk">At Risk</option>
          <option value="no_data">No Data</option>
        </select>
      </div>

      {/* MAIN */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) minmax(360px, 1.1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* STUDENT LIST */}
        <div style={{ display: "grid", gap: 10 }}>
          {filteredRows.map(item => {
            const active = selectedProgress?.student.id === item.student.id;

            return (
              <button
                key={item.student.id}
                type="button"
                onClick={() => setSelectedStudentId(item.student.id)}
                style={{
                  ...card,
                  textAlign: "left",
                  cursor: "pointer",
                  border: active ? `2px solid ${primary}` : "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      background: item.student.photo
                        ? `url(${item.student.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 48px",
                    }}
                  >
                    {!item.student.photo && item.student.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{item.student.fullName}</strong>
                      <span style={badge(statusTone(item.status))}>{statusLabel(item.status)}</span>
                    </div>
                    <div style={{ marginTop: 5, opacity: 0.68, fontSize: 13 }}>
                      {item.student.admissionNumber || "No admission no."} • {item.className}
                    </div>
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 950 }}>{item.progressScore}%</div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={progressBar(item.progressScore)} />
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={badge("blue")}>Assess: {item.assessedSubjectCount}/{item.subjectCount}</span>
                  <span style={badge("gray")}>Att: {item.attendanceRate ?? "-"}%</span>
                </div>
              </button>
            );
          })}

          {!filteredRows.length && (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              No academic progress records found.
            </div>
          )}
        </div>

        {/* DETAIL */}
        <div style={card}>
          {selectedProgress ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
                    {selectedProgress.student.fullName}
                  </h3>
                  <div style={{ marginTop: 5, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
                    {selectedProgress.student.admissionNumber || "No admission number"}
                  </div>
                </div>

                <span style={badge(statusTone(selectedProgress.status))}>
                  {statusLabel(selectedProgress.status)}
                </span>
              </div>

              <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Progress Score
                  </div>
                  <div style={{ marginTop: 10, fontSize: 34, fontWeight: 950 }}>
                    {selectedProgress.progressScore}%
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={progressBar(selectedProgress.progressScore)} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={badge("gray")}>{selectedProgress.readinessLabel}</span>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Academic Placement
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 14 }}>
                    <div><b>Class:</b> {selectedProgress.className}</div>
                    <div><b>Structure:</b> {selectedProgress.academicStructureName}</div>
                    <div><b>Period:</b> {selectedProgress.academicPeriodName}</div>
                    <div><b>Curriculum:</b> {selectedProgress.curriculumName}</div>
                    <div><b>Pathway:</b> {selectedProgress.pathwayName}</div>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Assessment Progress
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>
                      Subjects: {selectedProgress.assessedSubjectCount}/{selectedProgress.subjectCount}
                    </span>
                    <span style={badge("gray")}>Entries: {selectedProgress.assessmentEntryCount}</span>
                    <span style={badge("green")}>Computed: {selectedProgress.computedResultCount}</span>
                    <span style={badge("purple")}>
                      Average: {selectedProgress.averagePercentage ?? "-"}%
                    </span>
                    <span style={badge("orange")}>
                      Position: {selectedProgress.averagePosition ?? "-"}
                    </span>
                    <span style={badge("gray")}>GPA: {selectedProgress.averageGpa ?? "-"}</span>
                  </div>
                </section>

                <section style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.62, fontWeight: 900, textTransform: "uppercase" }}>
                    Attendance Strength
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("green")}>Present: {selectedProgress.attendancePresent}</span>
                    <span style={badge("red")}>Absent: {selectedProgress.attendanceAbsent}</span>
                    <span style={badge("orange")}>Late: {selectedProgress.attendanceLate}</span>
                    <span style={badge("blue")}>Rate: {selectedProgress.attendanceRate ?? "-"}%</span>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 30 }}>Select a student to view progress.</div>
          )}
        </div>
      </div>
    </div>
  );
}
