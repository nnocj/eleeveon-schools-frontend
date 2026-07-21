"use client";

/**
 * reports/components/CumulativeFilters.tsx
 * ---------------------------------------------------------
 * CUMULATIVE ACADEMIC RECORD FILTER CONTROLLER
 * ---------------------------------------------------------
 *
 * Controls historical academic publishing context:
 * Branch -> Academic Structure -> Period / Year Range -> Class
 * -> Student / Subject -> Snapshot Type -> Decision -> Mode.
 *
 * Workspace-source update:
 * - this component no longer decides the branch source by itself
 * - the parent cumulative report page must resolve the selected workspace branch
 * - when lockBranch/lockedBranchId is supplied, this filter controller respects it
 *   and prevents switching to a stale/wrong branch
 *
 * Selector source upgrade:
 * - cumulative reports are historical, so selectors now read from snapshots first
 *   when live setup tables do not contain matching branch-scoped rows
 * - academic structures, periods, classes, students and years can populate from
 *   StudentReportSnapshot records even if the live setup row is missing/inactive
 * - this prevents empty selectors when old published snapshots exist but current
 *   setup records are filtered out or not synced locally
 *
 * Empty-selector fix:
 * - all ID comparisons are normalized with localId() because snapshots/sync payloads
 *   may store numeric IDs as strings
 * - the Branch selector can now show the locked branch or snapshot branch IDs even
 *   when the live branches table has not loaded rows yet
 */

import React, { useEffect, useMemo } from "react";

import type {
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  Student,
  StudentReportSnapshot,
  Subject,
} from "../../../../lib/db/db";

import type {
  CumulativeDecision,
  CumulativeGroupingMode,
  CumulativeReportFiltersState,
  CumulativeReportMode,
  CumulativeSnapshotType,
  CumulativeSubjectAggregationMode,
} from "../engine/cumulative-report-types";

import type { ReportSortMode } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  filters: CumulativeReportFiltersState;
  setFilters: React.Dispatch<
    React.SetStateAction<CumulativeReportFiltersState>
  >;

  branches: Branch[];
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  classes: Class[];
  students: Student[];
  subjects: Subject[];
  snapshots: StudentReportSnapshot[];

  /**
   * Branch locking is controlled by the parent page after it resolves
   * the selected workspace session. This prevents this filter component
   * from becoming a second branch source of truth.
   */
  lockedBranchId?: string;
  lockBranch?: boolean;

  primaryColor?: string;
};

// ======================================================
// LOCAL HELPERS
// ======================================================

function localId(value: unknown): string {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  if (!normalized || normalized === "0" || normalized === "undefined" || normalized === "null") return "";
  return normalized;
}

function labelFromSnapshot(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function uniqueSortedNumbers(values: unknown[]): string[] {
  return Array.from(new Set(values.map(localId).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

// ======================================================
// COMPONENT
// ======================================================

export default function CumulativeFilters({
  filters,
  setFilters,
  branches,
  academicStructures,
  academicPeriods,
  classes,
  students,
  subjects,
  snapshots,
  lockedBranchId,
  lockBranch = false,
  primaryColor = "var(--primary-color)",
}: Props) {
  const effectiveBranchId = localId(
    lockBranch && lockedBranchId ? lockedBranchId : filters.branchId,
  );

  useEffect(() => {
    if (!lockBranch || !lockedBranchId) return;

    setFilters((prev) => {
      if (prev.branchId === lockedBranchId) return prev;

      return {
        ...prev,
        branchId: lockedBranchId,
        academicStructureId: undefined,
        academicPeriodId: undefined,
        fromAcademicPeriodId: undefined,
        toAcademicPeriodId: undefined,
        academicYear: undefined,
        fromAcademicYear: undefined,
        toAcademicYear: undefined,
        classId: undefined,
        studentId: undefined,
        subjectId: undefined,
      };
    });
  }, [lockBranch, lockedBranchId, setFilters]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes],
  );

  const snapshotPool = useMemo(() => {
    return snapshots.filter((snapshot) => {
      if (snapshot.isDeleted) return false;
      if (effectiveBranchId && localId(snapshot.branchId) !== effectiveBranchId)
        return false;
      return true;
    });
  }, [snapshots, effectiveBranchId]);

  const snapshotAcademicStructureIds = useMemo(() => {
    return uniqueSortedNumbers(
      snapshotPool.map((snapshot) => localId(snapshot.academicStructureId)),
    );
  }, [snapshotPool]);

  const snapshotAcademicPeriodIds = useMemo(() => {
    return uniqueSortedNumbers(
      snapshotPool.map((snapshot) => localId(snapshot.academicPeriodId)),
    );
  }, [snapshotPool]);

  const snapshotClassIds = useMemo(() => {
    return uniqueSortedNumbers(
      snapshotPool.map((snapshot) => localId(snapshot.classId)),
    );
  }, [snapshotPool]);

  const snapshotStudentIds = useMemo(() => {
    return uniqueSortedNumbers(
      snapshotPool.map((snapshot) => localId(snapshot.studentId)),
    );
  }, [snapshotPool]);

  const availableBranches = useMemo(() => {
    const liveRows = branches
      .filter((item) => {
        if (item.isDeleted) return false;
        if (item.active === false) return false;
        if (effectiveBranchId) return localId(item.id) === effectiveBranchId;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (liveRows.length) return liveRows;

    const ids = uniqueSortedNumbers([
      effectiveBranchId,
      ...snapshots
        .filter((snapshot) => !snapshot.isDeleted)
        .map((snapshot) => localId(snapshot.branchId)),
    ]);

    return ids.map(
      (id) =>
        ({
          id,
          name:
            id === effectiveBranchId ? `Assigned Branch ${id}` : `Branch ${id}`,
          active: true,
        }) as Branch,
    );
  }, [branches, snapshots, effectiveBranchId]);

  // ======================================================
  // AVAILABLE OPTIONS
  // ======================================================

  const availableAcademicStructures = useMemo(() => {
    return academicStructures
      .filter((item) => {
        if (item.isDeleted) return false;
        if (
          effectiveBranchId &&
          item.branchId &&
          localId(item.branchId) !== effectiveBranchId
        )
          return false;
        return item.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [academicStructures, effectiveBranchId]);

  const availableAcademicPeriods = useMemo(() => {
    return academicPeriods
      .filter((item) => {
        if (item.isDeleted) return false;
        if (
          effectiveBranchId &&
          item.branchId &&
          localId(item.branchId) !== effectiveBranchId
        )
          return false;
        if (
          filters.academicStructureId &&
          item.academicStructureId &&
          localId(item.academicStructureId) !==
            localId(filters.academicStructureId)
        ) {
          return false;
        }
        return item.active !== false;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [academicPeriods, effectiveBranchId, filters.academicStructureId]);

  const availableClasses = useMemo(() => {
    return classes
      .filter((item) => {
        if (item.isDeleted) return false;
        if (
          effectiveBranchId &&
          item.branchId &&
          localId(item.branchId) !== effectiveBranchId
        )
          return false;
        return item.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, effectiveBranchId]);

  const availableStudents = useMemo(() => {
    return students
      .filter((item) => {
        if (item.isDeleted) return false;
        if (
          effectiveBranchId &&
          item.branchId &&
          localId(item.branchId) !== effectiveBranchId
        )
          return false;
        if (
          filters.classId &&
          item.currentClassId &&
          localId(item.currentClassId) !== localId(filters.classId)
        )
          return false;
        return item.status !== "withdrawn";
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, effectiveBranchId, filters.classId]);

  const availableSubjects = useMemo(() => {
    return subjects
      .filter((item) => {
        if (item.isDeleted) return false;
        if (
          effectiveBranchId &&
          item.branchId &&
          localId(item.branchId) !== effectiveBranchId
        )
          return false;
        return item.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, effectiveBranchId]);

  const availableAcademicYears = useMemo(() => {
    return Array.from(
      new Set(
        snapshots
          .filter((snapshot) => {
            if (snapshot.isDeleted) return false;
            if (
              effectiveBranchId &&
              localId(snapshot.branchId) !== effectiveBranchId
            )
              return false;
            return !!snapshot.academicYear;
          })
          .map((snapshot) => snapshot.academicYear as string),
      ),
    ).sort();
  }, [snapshots, effectiveBranchId]);

  // ======================================================
  // HANDLERS
  // ======================================================

  const updateFilters = (patch: Partial<CumulativeReportFiltersState>) => {
    setFilters((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const selectBranch = (branchId?: string) => {
    if (lockBranch) return;

    setFilters((prev) => ({
      ...prev,
      branchId,
      academicStructureId: undefined,
      academicPeriodId: undefined,
      fromAcademicPeriodId: undefined,
      toAcademicPeriodId: undefined,
      academicYear: undefined,
      fromAcademicYear: undefined,
      toAcademicYear: undefined,
      classId: undefined,
      studentId: undefined,
      subjectId: undefined,
    }));
  };

  const selectAcademicStructure = (academicStructureId?: string) => {
    setFilters((prev) => ({
      ...prev,
      academicStructureId,
      academicPeriodId: undefined,
      fromAcademicPeriodId: undefined,
      toAcademicPeriodId: undefined,
      classId: undefined,
      studentId: undefined,
      subjectId: undefined,
    }));
  };

  const selectAcademicPeriod = (academicPeriodId?: string) => {
    setFilters((prev) => ({
      ...prev,
      academicPeriodId,
      classId: undefined,
      studentId: undefined,
    }));
  };

  const selectClass = (classId?: string) => {
    setFilters((prev) => ({
      ...prev,
      classId,
      studentId: undefined,
    }));
  };

  const selectMode = (mode: CumulativeReportMode) => {
    setFilters((prev) => ({
      ...prev,
      mode,
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

  const label: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    opacity: 0.72,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const fieldWrap: React.CSSProperties = {
    display: "grid",
    gap: 6,
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

  const toggleButton = (active: boolean): React.CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 12,
    border: active ? `1px solid ${primaryColor}` : "1px solid rgba(0,0,0,0.12)",
    background: active ? "rgba(0,0,0,0.04)" : "transparent",
    color: "var(--text)",
    fontWeight: 800,
    cursor: "pointer",
  });

  // ======================================================
  // UI
  // ======================================================

  return (
    <div className="report-no-print" style={card}>
      {/* MODE TABS */}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <button
          style={tabButton(filters.mode === "student-transcript")}
          onClick={() => selectMode("student-transcript")}
        >
          Student Transcript
        </button>

        <button
          style={tabButton(filters.mode === "multi-period-report")}
          onClick={() => selectMode("multi-period-report")}
        >
          Multi-Period Report
        </button>

        <button
          style={tabButton(filters.mode === "annual-broadsheet")}
          onClick={() => selectMode("annual-broadsheet")}
        >
          Annual Broadsheet
        </button>

        <button
          style={tabButton(filters.mode === "subject-history")}
          onClick={() => selectMode("subject-history")}
        >
          Subject History
        </button>

        <button
          style={tabButton(filters.mode === "promotion-summary")}
          onClick={() => selectMode("promotion-summary")}
        >
          Promotion Summary
        </button>

        <button
          style={tabButton(filters.mode === "progression-timeline")}
          onClick={() => selectMode("progression-timeline")}
        >
          Progression Timeline
        </button>
      </div>

      {/* PRIMARY FILTERS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <div style={fieldWrap}>
          <div style={label}>Branch</div>
          <select
            style={input}
            value={effectiveBranchId || ""}
            onChange={(e) => selectBranch(Number(e.target.value) || undefined)}
            disabled={lockBranch}
          >
            <option value="">
              {lockBranch ? "Locked Branch" : "Select Branch"}
            </option>
            {availableBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Academic Structure</div>
          <select
            style={input}
            value={filters.academicStructureId || ""}
            onChange={(e) =>
              selectAcademicStructure(Number(e.target.value) || undefined)
            }
          >
            <option value="">All Academic Structures</option>
            {availableAcademicStructures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Academic Year</div>
          <select
            style={input}
            value={filters.academicYear || ""}
            onChange={(e) =>
              updateFilters({
                academicYear: e.target.value || undefined,
                studentId: undefined,
              })
            }
          >
            <option value="">All Academic Years</option>
            {availableAcademicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Academic Period</div>
          <select
            style={input}
            value={filters.academicPeriodId || ""}
            onChange={(e) =>
              selectAcademicPeriod(Number(e.target.value) || undefined)
            }
          >
            <option value="">All Periods</option>
            {availableAcademicPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Class</div>
          <select
            style={input}
            value={filters.classId || ""}
            onChange={(e) => selectClass(Number(e.target.value) || undefined)}
          >
            <option value="">All Classes</option>
            {availableClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Student</div>
          <select
            style={input}
            value={filters.studentId || ""}
            onChange={(e) =>
              updateFilters({
                studentId: cleanId(e.target.value) || undefined,
              })
            }
          >
            <option value="">Select Student</option>
            {availableStudents.map((student) => {
              const className = student.currentClassId
                ? classMap.get(student.currentClassId)?.name
                : undefined;

              return (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                  {student.admissionNumber
                    ? ` (${student.admissionNumber})`
                    : ""}
                  {className ? ` • ${className}` : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Subject</div>
          <select
            style={input}
            value={filters.subjectId || ""}
            onChange={(e) =>
              updateFilters({
                subjectId: cleanId(e.target.value) || undefined,
              })
            }
          >
            <option value="">Select Subject</option>
            {availableSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
                {subject.code ? ` (${subject.code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Snapshot Type</div>
          <select
            style={input}
            value={filters.snapshotType}
            onChange={(e) =>
              updateFilters({
                snapshotType: e.target.value as CumulativeSnapshotType,
              })
            }
          >
            <option value="all">All Snapshots</option>
            <option value="terminal">Terminal Snapshots</option>
            <option value="promotion">Promotion Snapshots</option>
            <option value="manual">Manual Snapshots</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Decision</div>
          <select
            style={input}
            value={filters.decision || "all"}
            onChange={(e) =>
              updateFilters({
                decision: e.target.value as CumulativeDecision | "all",
              })
            }
          >
            <option value="all">All Decisions</option>
            <option value="promote">Promote</option>
            <option value="repeat">Repeat</option>
            <option value="graduate">Graduate</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Sort Mode</div>
          <select
            style={input}
            value={filters.sortMode}
            onChange={(e) =>
              updateFilters({ sortMode: e.target.value as ReportSortMode })
            }
          >
            <option value="position">Sort by Position</option>
            <option value="alphabetical">Sort Alphabetically</option>
            <option value="average">Sort by Average</option>
            <option value="admission-number">Sort by Admission No.</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Grouping</div>
          <select
            style={input}
            value={filters.groupingMode}
            onChange={(e) =>
              updateFilters({
                groupingMode: e.target.value as CumulativeGroupingMode,
              })
            }
          >
            <option value="academic-year">Group by Academic Year</option>
            <option value="academic-structure">
              Group by Academic Structure
            </option>
            <option value="class">Group by Class</option>
            <option value="period">Group by Period</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>Subject Aggregation</div>
          <select
            style={input}
            value={filters.subjectAggregationMode}
            onChange={(e) =>
              updateFilters({
                subjectAggregationMode: e.target
                  .value as CumulativeSubjectAggregationMode,
              })
            }
          >
            <option value="average">Average</option>
            <option value="latest">Latest Score</option>
            <option value="best">Best Score</option>
            <option value="weighted-average">Weighted Average</option>
          </select>
        </div>
      </div>

      {/* RANGE FILTERS */}

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <div style={fieldWrap}>
          <div style={label}>From Year</div>
          <select
            style={input}
            value={filters.fromAcademicYear || ""}
            onChange={(e) =>
              updateFilters({ fromAcademicYear: e.target.value || undefined })
            }
          >
            <option value="">No Start Year</option>
            {availableAcademicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>To Year</div>
          <select
            style={input}
            value={filters.toAcademicYear || ""}
            onChange={(e) =>
              updateFilters({ toAcademicYear: e.target.value || undefined })
            }
          >
            <option value="">No End Year</option>
            {availableAcademicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>From Period</div>
          <select
            style={input}
            value={filters.fromAcademicPeriodId || ""}
            onChange={(e) =>
              updateFilters({
                fromAcademicPeriodId: Number(e.target.value) || undefined,
              })
            }
          >
            <option value="">No Start Period</option>
            {availableAcademicPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <div style={label}>To Period</div>
          <select
            style={input}
            value={filters.toAcademicPeriodId || ""}
            onChange={(e) =>
              updateFilters({
                toAcademicPeriodId: Number(e.target.value) || undefined,
              })
            }
          >
            <option value="">No End Period</option>
            {availableAcademicPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SNAPSHOT SOURCE TOGGLES */}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          style={toggleButton(filters.includeTerminalSnapshots)}
          onClick={() =>
            updateFilters({
              includeTerminalSnapshots: !filters.includeTerminalSnapshots,
            })
          }
        >
          Terminal Snapshots: {filters.includeTerminalSnapshots ? "On" : "Off"}
        </button>

        <button
          type="button"
          style={toggleButton(filters.includePromotionRecords)}
          onClick={() =>
            updateFilters({
              includePromotionRecords: !filters.includePromotionRecords,
            })
          }
        >
          Promotion Records: {filters.includePromotionRecords ? "On" : "Off"}
        </button>

        <button
          type="button"
          style={toggleButton(filters.includeManualSnapshots)}
          onClick={() =>
            updateFilters({
              includeManualSnapshots: !filters.includeManualSnapshots,
            })
          }
        >
          Manual Snapshots: {filters.includeManualSnapshots ? "On" : "Off"}
        </button>

        <button
          type="button"
          style={toggleButton(!!filters.includeDeletedSnapshots)}
          onClick={() =>
            updateFilters({
              includeDeletedSnapshots: !filters.includeDeletedSnapshots,
            })
          }
        >
          Deleted Snapshots: {filters.includeDeletedSnapshots ? "On" : "Off"}
        </button>
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
        <span>Snapshots: {snapshots.length}</span>
        <span>Classes: {availableClasses.length}</span>
        <span>Students: {availableStudents.length}</span>
        <span>Subjects: {availableSubjects.length}</span>
        <span>Years: {availableAcademicYears.length}</span>
        <span>Mode: {filters.mode.replaceAll("-", " ")}</span>
      </div>
    </div>
  );
}
