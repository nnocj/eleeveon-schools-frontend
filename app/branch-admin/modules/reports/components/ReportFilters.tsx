"use client";

/**
 * reports/components/ReportFilters.tsx
 * ---------------------------------------------------------
 * ENTERPRISE REPORT FILTER CONTROLLER
 * ---------------------------------------------------------
 *
 * Controls the report session context:
 * Branch -> Academic Structure -> Academic Period -> Class
 * -> ClassSubject -> Student -> Sort Mode.
 *
 * Workspace-source update:
 * - this component no longer decides the branch source by itself
 * - the parent report page must resolve the selected workspace branch
 * - when lockBranch/lockedBranchId is supplied, this filter controller respects it
 *   and prevents switching to a stale/wrong branch
 *
 * This component does not compute reports.
 */

import React, { useEffect, useMemo } from "react";

import type {
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  ClassSubject,
  Student,
  StudentEnrollment,
  Subject,
} from "../../../../lib/db";

import type {
  ReportFiltersState,
  ReportMode,
  ReportSortMode,
} from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  mode: ReportMode;
  setMode: (mode: ReportMode) => void;

  filters: ReportFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<ReportFiltersState>>;

  branches: Branch[];
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  classes: Class[];
  classSubjects: ClassSubject[];
  subjects: Subject[];
  students: Student[];
  studentEnrollments: StudentEnrollment[];

  /**
   * Branch locking is controlled by the parent page after it resolves
   * the selected workspace session. This prevents this filter component
   * from becoming a second branch source of truth.
   */
  lockedBranchId?: number;
  lockBranch?: boolean;

  primaryColor?: string;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ReportFilters({
  mode,
  setMode,
  filters,
  setFilters,
  branches,
  academicStructures,
  academicPeriods,
  classes,
  classSubjects,
  subjects,
  students,
  studentEnrollments,
  lockedBranchId,
  lockBranch = false,
  primaryColor = "var(--primary-color)",
}: Props) {
  const effectiveBranchId = lockBranch && lockedBranchId ? lockedBranchId : filters.branchId;

  useEffect(() => {
    if (!lockBranch || !lockedBranchId) return;

    setFilters((prev) => {
      if (prev.branchId === lockedBranchId) return prev;

      return {
        ...prev,
        branchId: lockedBranchId,
        academicStructureId: undefined,
        academicPeriodId: undefined,
        classId: undefined,
        classSubjectId: undefined,
        studentId: undefined,
      };
    });
  }, [lockBranch, lockedBranchId, setFilters]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const subjectMap = useMemo(
    () => new Map(subjects.map(item => [item.id, item])),
    [subjects]
  );

  const classMap = useMemo(
    () => new Map(classes.map(item => [item.id, item])),
    [classes]
  );

  const periodMap = useMemo(
    () => new Map(academicPeriods.map(item => [item.id, item])),
    [academicPeriods]
  );

  // ======================================================
  // FILTERED OPTIONS
  // ======================================================

  const availableAcademicStructures = useMemo(() => {
    return academicStructures
      .filter(item => {
        if (item.isDeleted) return false;
        if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
        return item.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [academicStructures, filters.branchId]);

  const availableAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter(item => {
        if (item.isDeleted) return false;
        if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
        if (
          filters.academicStructureId &&
          item.academicStructureId !== filters.academicStructureId
        ) {
          return false;
        }
        return item.active !== false;
      })
      .sort((a, b) => a.order - b.order);
  }, [academicPeriods, effectiveBranchId, filters.academicStructureId]);

  const availableClasses = useMemo(() => {
    return classes
      .filter(item => {
        if (item.isDeleted) return false;
        if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
        return item.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, filters.branchId]);

  const availableClassSubjects = useMemo(() => {
    return classSubjects
      .filter(item => {
        if (item.isDeleted) return false;
        if (item.active === false) return false;
        if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
        if (filters.classId && item.classId !== filters.classId) return false;
        if (
          filters.academicStructureId &&
          item.academicStructureId !== filters.academicStructureId
        ) {
          return false;
        }
        if (
          filters.academicPeriodId &&
          item.academicPeriodId !== filters.academicPeriodId
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const subjectA = a.name || subjectMap.get(a.subjectId)?.name || "";
        const subjectB = b.name || subjectMap.get(b.subjectId)?.name || "";
        return subjectA.localeCompare(subjectB);
      });
  }, [
    classSubjects,
    effectiveBranchId,
    filters.classId,
    filters.academicStructureId,
    filters.academicPeriodId,
    subjectMap,
  ]);

  const availableStudents = useMemo(() => {
    if (!filters.classId || !filters.academicPeriodId) return [];

    const enrollmentStudentIds = new Set(
      studentEnrollments
        .filter(item => {
          if (item.isDeleted) return false;
          if (item.status !== "active") return false;
          if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
          if (filters.classId && item.classId !== filters.classId) return false;
          if (
            filters.academicStructureId &&
            item.academicStructureId !== filters.academicStructureId
          ) {
            return false;
          }
          if (filters.academicPeriodId && item.academicPeriodId !== filters.academicPeriodId) {
            return false;
          }
          return true;
        })
        .map(item => item.studentId)
    );

    return students
      .filter(item => {
        if (item.isDeleted) return false;
        if (effectiveBranchId && item.branchId !== effectiveBranchId) return false;
        return !!item.id && enrollmentStudentIds.has(item.id);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [
    students,
    studentEnrollments,
    effectiveBranchId,
    filters.classId,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  // ======================================================
  // HANDLERS
  // ======================================================

  const updateFilters = (patch: Partial<ReportFiltersState>) => {
    setFilters(prev => ({
      ...prev,
      ...patch,
    }));
  };

  const selectBranch = (branchId?: number) => {
    if (lockBranch) return;

    setFilters(prev => ({
      ...prev,
      branchId,
      academicStructureId: undefined,
      academicPeriodId: undefined,
      classId: undefined,
      classSubjectId: undefined,
      studentId: undefined,
    }));
  };

  const selectAcademicStructure = (academicStructureId?: number) => {
    setFilters(prev => ({
      ...prev,
      academicStructureId,
      academicPeriodId: undefined,
      classId: undefined,
      classSubjectId: undefined,
      studentId: undefined,
    }));
  };

  const selectAcademicPeriod = (academicPeriodId?: number) => {
    setFilters(prev => ({
      ...prev,
      academicPeriodId,
      classId: undefined,
      classSubjectId: undefined,
      studentId: undefined,
    }));
  };

  const selectClass = (classId?: number) => {
    setFilters(prev => ({
      ...prev,
      classId,
      classSubjectId: undefined,
      studentId: undefined,
    }));
  };

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    color: "var(--text)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
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

  const tabButton = (active: boolean): React.CSSProperties => ({
    padding: "11px 15px",
    borderRadius: 999,
    border: active ? `1px solid ${primaryColor}` : "1px solid rgba(0,0,0,0.12)",
    background: active ? primaryColor : "var(--surface)",
    color: active ? "#fff" : "var(--text)",
    fontWeight: 850,
    cursor: "pointer",
    boxShadow: active ? "0 8px 18px rgba(0,0,0,0.12)" : "none",
  });

  // ======================================================
  // UI
  // ======================================================

  return (
    <div className="report-no-print" style={card}>
      {/* TABS */}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <button
          style={tabButton(mode === "student-report")}
          onClick={() => setMode("student-report")}
        >
          Student Report Card
        </button>

        <button
          style={tabButton(mode === "class-reports")}
          onClick={() => setMode("class-reports")}
        >
          Class Report Cards
        </button>

        <button
          style={tabButton(mode === "subject-broadsheet")}
          onClick={() => setMode("subject-broadsheet")}
        >
          Subject Broadsheet
        </button>

        <button
          style={tabButton(mode === "class-broadsheet")}
          onClick={() => setMode("class-broadsheet")}
        >
          Class Broadsheet
        </button>
      </div>

      {/* FILTERS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <select
          style={input}
          value={effectiveBranchId || ""}
          onChange={e => selectBranch(Number(e.target.value) || undefined)}
          disabled={lockBranch}
        >
          <option value="">{lockBranch ? "Locked Branch" : "Select Branch"}</option>
          {branches
            .filter(item => !item.isDeleted && item.active !== false)
            .map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
        </select>

        <select
          style={input}
          value={filters.academicStructureId || ""}
          onChange={e => selectAcademicStructure(Number(e.target.value) || undefined)}
        >
          <option value="">Academic Structure</option>
          {availableAcademicStructures.map(item => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={filters.academicPeriodId || ""}
          onChange={e => selectAcademicPeriod(Number(e.target.value) || undefined)}
        >
          <option value="">Academic Period</option>
          {availableAcademicPeriods.map(period => (
            <option key={period.id} value={period.id}>
              {period.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={filters.classId || ""}
          onChange={e => selectClass(Number(e.target.value) || undefined)}
        >
          <option value="">Class</option>
          {availableClasses.map(item => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={filters.classSubjectId || ""}
          onChange={e =>
            updateFilters({ classSubjectId: Number(e.target.value) || undefined })
          }
        >
          <option value="">Class Subject</option>
          {availableClassSubjects.map(item => {
            const classItem = classMap.get(item.classId);
            const subject = subjectMap.get(item.subjectId);
            const period = item.academicPeriodId ? periodMap.get(item.academicPeriodId) : undefined;

            return (
              <option key={item.id} value={item.id}>
                {classItem?.name || "Class"} • {item.name || subject?.name || "Subject"}
                {period ? ` • ${period.name}` : ""}
              </option>
            );
          })}
        </select>

        <select
          style={input}
          value={filters.studentId || ""}
          onChange={e => updateFilters({ studentId: Number(e.target.value) || undefined })}
        >
          <option value="">Student</option>
          {availableStudents.map(student => (
            <option key={student.id} value={student.id}>
              {student.fullName}
              {student.admissionNumber ? ` (${student.admissionNumber})` : ""}
            </option>
          ))}
        </select>

        <select
          style={input}
          value={filters.sortMode}
          onChange={e => updateFilters({ sortMode: e.target.value as ReportSortMode })}
        >
          <option value="position">Sort by Position</option>
          <option value="alphabetical">Sort Alphabetically</option>
          <option value="average">Sort by Average</option>
          <option value="admission-number">Sort by Admission No.</option>
        </select>
      </div>

      {/* SESSION SUMMARY */}

      <div
        style={{
          marginTop: 15,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12,
          opacity: 0.75,
          fontWeight: 750,
        }}
      >
        <span>Classes: {availableClasses.length}</span>
        <span>Class Subjects: {availableClassSubjects.length}</span>
        <span>Students: {availableStudents.length}</span>
        <span>Mode: {mode.replaceAll("-", " ")}</span>
      </div>
    </div>
  );
}
