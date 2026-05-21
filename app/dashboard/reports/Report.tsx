"use client";

/**
 * reports/Report.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACADEMIC REPORT ORCHESTRATOR
 * ---------------------------------------------------------
 * Production goals:
 * - Requires signed-in account context.
 * - Requires active school + active branch context.
 * - Loads only same-tenant records: accountId + schoolId + branchId.
 * - Keeps all existing report components and report engine behavior.
 * - WhatsApp-like compact shell, card surfaces, mobile-first layout.
 * - No unreachable actions on small screens.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/app/context/account-context";

import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Attendance,
  Branch,
  Class,
  ClassSubject,
  ComputedResult,
  GradeRule,
  GradingSystem,
  ReportCard,
  ReportCardItem,
  School,
  Student,
  StudentEnrollment,
  Parent,
  StudentParent,
  ClassTeacher,
  Subject,
  Teacher,
  SchoolBranchSetting,
} from "../../lib/db";

import ReportFilters from "./components/ReportFilters";
import ReportAnalytics from "./components/ReportAnalytics";
import ReportExportTools from "./components/ReportExportTools";
import StudentReportCard from "./components/StudentReportCard";
import SubjectBroadsheet from "./components/SubjectBroadSheet";
import ClassBroadsheet from "./components/ClassBroadSheet";

import { buildReportEngineOutput } from "./engine/report-engine";

import type {
  ReportEngineDataset,
  ReportFiltersState,
  ReportMode,
} from "./engine/report-types";

// ======================================================
// HELPERS
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type SchoolRow = {
  accountId?: string;
  id?: number;
  isDeleted?: boolean;
};

type BranchRow = {
  accountId?: string;
  schoolId?: number;
  id?: number;
  isDeleted?: boolean;
};

function firstExistingId<T extends { id?: number }>(rows: T[]) {
  return rows.find((row) => typeof row.id === "number")?.id;
}

function formatCount(value: number, label: string) {
  return `${value.toLocaleString()} ${label}${value === 1 ? "" : "s"}`;
}

// ======================================================
// COMPONENT
// ======================================================

export default function ReportPage() {
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

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;

  // ======================================================
  // SESSION STATE
  // ======================================================

  const [pageLoading, setPageLoading] = useState(true);
  const [mode, setMode] = useState<ReportMode>("student-report");
  const [showFilters, setShowFilters] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);

  const [filters, setFilters] = useState<ReportFiltersState>({
    branchId: branchId || 0,
    academicStructureId: settings?.currentAcademicStructureId,
    academicPeriodId: settings?.currentAcademicPeriodId,
    classId: undefined,
    classSubjectId: undefined,
    studentId: undefined,
    sortMode: "position",
  });

  // ======================================================
  // DB STATE
  // ======================================================

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schoolBranchSettings, setSchoolBranchSettings] = useState<SchoolBranchSetting[]>([]);

  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<StudentEnrollment[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);

  const [assessmentApplicabilities, setAssessmentApplicabilities] =
    useState<AssessmentApplicability[]>([]);
  const [assessmentStructures, setAssessmentStructures] =
    useState<AssessmentStructure[]>([]);
  const [assessmentStructureItems, setAssessmentStructureItems] =
    useState<AssessmentStructureItem[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);

  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [reportCardItems, setReportCardItems] = useState<ReportCardItem[]>([]);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!schoolId || !branchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const clearState = () => {
    setSchools([]);
    setBranches([]);
    setSchoolBranchSettings([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setStudents([]);
    setTeachers([]);
    setParents([]);
    setClassTeachers([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
    setStudentEnrollments([]);
    setStudentParents([]);
    setAssessmentApplicabilities([]);
    setAssessmentStructures([]);
    setAssessmentStructureItems([]);
    setAssessmentEntries([]);
    setGradingSystems([]);
    setGradeRules([]);
    setAttendance([]);
    setComputedResults([]);
    setReportCards([]);
    setReportCardItems([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearState();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [
        schoolRows,
        branchRows,
        schoolBranchSettingRows,
        academicStructureRows,
        academicPeriodRows,

        studentRows,
        parentRows,
        teacherRows,

        classRows,
        subjectRows,
        classSubjectRows,
        classTeacherRows,
        enrollmentRows,
        studentParentRows,

        applicabilityRows,
        structureRows,
        structureItemRows,
        entryRows,
        gradingRows,
        ruleRows,

        attendanceRows,
        computedRows,
        reportCardRows,
        reportCardItemRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),

        db.students.toArray(),
        db.parents.toArray(),
        db.teachers.toArray(),

        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
        db.classTeachers.toArray(),
        db.studentEnrollments.toArray(),
        db.studentParents.toArray(),

        db.assessmentApplicabilities.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),

        db.attendance.toArray(),
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
      ]);

      const sameSchool = (row: SchoolRow) =>
        row.accountId === accountId &&
        row.id === schoolId &&
        !row.isDeleted;

      const sameBranch = (row: BranchRow) =>
        row.accountId === accountId &&
        row.schoolId === schoolId &&
        row.id === branchId &&
        !row.isDeleted;

      const sameTenant = (row: TenantRow) =>
        row.accountId === accountId &&
        row.schoolId === schoolId &&
        row.branchId === branchId &&
        !row.isDeleted;

      const currentSchool =
        schoolRows.find(sameSchool) ||
        (activeSchool?.accountId === accountId && activeSchool?.id === schoolId
          ? activeSchool
          : undefined);

      const currentBranch =
        branchRows.find(sameBranch) ||
        (activeBranch?.accountId === accountId &&
        activeBranch?.schoolId === schoolId &&
        activeBranch?.id === branchId
          ? activeBranch
          : undefined);

      const scopedAcademicPeriods = academicPeriodRows.filter(sameTenant);
      const scopedReportCards = reportCardRows.filter(sameTenant);

      const branchPeriodIds = new Set(
        scopedAcademicPeriods.map((row) => row.id).filter(Boolean) as number[]
      );

      const branchReportCardIds = new Set(
        scopedReportCards.map((row) => row.id).filter(Boolean) as number[]
      );

      setSchools(currentSchool ? [currentSchool] : []);
      setBranches(currentBranch ? [currentBranch] : []);
      setSchoolBranchSettings(schoolBranchSettingRows.filter(sameTenant));

      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setAcademicPeriods(scopedAcademicPeriods);

      setStudents(studentRows.filter(sameTenant));
      setParents(parentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));

      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setSubjects(subjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setClassSubjects(classSubjectRows.filter((row) => sameTenant(row) && row.active !== false));

      setStudentParents(studentParentRows.filter(sameTenant));
      setStudentEnrollments(enrollmentRows.filter(sameTenant));
      setClassTeachers(classTeacherRows.filter(sameTenant));

      setAssessmentApplicabilities(
        applicabilityRows.filter((row) => sameTenant(row) && row.active !== false)
      );

      setAssessmentStructures(
        structureRows.filter((row) => sameTenant(row) && row.active !== false)
      );

      setAssessmentStructureItems(
        structureItemRows.filter((row) => sameTenant(row) && row.active !== false)
      );

      setAssessmentEntries(entryRows.filter(sameTenant));
      setGradingSystems(gradingRows.filter((row) => sameTenant(row) && row.active !== false));
      setGradeRules(ruleRows.filter((row) => sameTenant(row) && row.active !== false));

      setAttendance(attendanceRows.filter(sameTenant));
      setComputedResults(computedRows.filter(sameTenant));
      setReportCards(scopedReportCards);

      setReportCardItems(
        reportCardItemRows.filter((row) => {
          if (!sameTenant(row)) return false;
          if (row.reportCardId && !branchReportCardIds.has(row.reportCardId)) return false;
          if (row.academicPeriodId && !branchPeriodIds.has(row.academicPeriodId)) return false;
          return true;
        })
      );
    } catch (error) {
      console.error("Failed to load report data:", error);
      clearState();
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // KEEP FILTERS LOCKED TO ACTIVE BRANCH
  // ======================================================

  useEffect(() => {
    setFilters((prev) => {
      const nextBranchId = branchId || 0;
      const branchChanged = prev.branchId !== nextBranchId;

      return {
        ...prev,
        branchId: nextBranchId,
        academicStructureId: branchChanged
          ? settings?.currentAcademicStructureId
          : prev.academicStructureId || settings?.currentAcademicStructureId,
        academicPeriodId: branchChanged
          ? settings?.currentAcademicPeriodId
          : prev.academicPeriodId || settings?.currentAcademicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        classSubjectId: branchChanged ? undefined : prev.classSubjectId,
        studentId: branchChanged ? undefined : prev.studentId,
      };
    });
  }, [branchId, settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId]);

  useEffect(() => {
    if (!filters.academicStructureId) {
      const fallbackId = settings?.currentAcademicStructureId || firstExistingId(academicStructures);
      if (fallbackId) setFilters((prev) => ({ ...prev, academicStructureId: fallbackId }));
    }
  }, [filters.academicStructureId, settings?.currentAcademicStructureId, academicStructures]);

  useEffect(() => {
    if (!filters.academicPeriodId) {
      const fallbackId = settings?.currentAcademicPeriodId || firstExistingId(academicPeriods);
      if (fallbackId) setFilters((prev) => ({ ...prev, academicPeriodId: fallbackId }));
    }
  }, [filters.academicPeriodId, settings?.currentAcademicPeriodId, academicPeriods]);

  // ======================================================
  // FILTER DATA PASSED TO REPORT FILTERS
  // ======================================================

  const lockedBranches = useMemo(() => {
    return activeBranch && activeBranch.id === branchId ? [activeBranch] : branches;
  }, [activeBranch, branchId, branches]);

  const filteredClasses = useMemo(() => {
    const allowedClassIds = new Set<number>();

    studentEnrollments.forEach((row) => {
      if (row.status !== "active") return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    classSubjects.forEach((row) => {
      if (row.active === false) return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    if (!filters.academicStructureId && !filters.academicPeriodId) return classes;

    return classes.filter((row) => row.id && allowedClassIds.has(row.id));
  }, [
    classes,
    studentEnrollments,
    classSubjects,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  const filteredClassSubjects = useMemo(() => {
    return classSubjects.filter((row) => {
      if (filters.classId && row.classId !== filters.classId) return false;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return false;
      if (filters.academicPeriodId && row.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return false;
      return true;
    });
  }, [classSubjects, filters.classId, filters.academicStructureId, filters.academicPeriodId]);

  const filteredStudents = useMemo(() => {
    if (!filters.classId && !filters.academicPeriodId) return students;

    const allowedStudentIds = new Set(
      studentEnrollments
        .filter((row) => {
          if (row.status !== "active") return false;
          if (filters.classId && row.classId !== filters.classId) return false;
          if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return false;
          if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return false;
          return true;
        })
        .map((row) => row.studentId)
    );

    return students.filter((row) => row.id && allowedStudentIds.has(row.id));
  }, [
    students,
    studentEnrollments,
    filters.classId,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  // ======================================================
  // DATASET
  // ======================================================

  const dataset: ReportEngineDataset = useMemo(
    () => ({
      schools,
      branches: lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      classSubjects,
      studentEnrollments,
      classTeachers,
      assessmentApplicabilities,
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries,
      gradingSystems,
      gradeRules,
      attendance,
      computedResults,
      reportCards,
      reportCardItems,
    }),
    [
      schools,
      lockedBranches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      parents,
      studentParents,
      teachers,
      classes,
      subjects,
      classSubjects,
      studentEnrollments,
      classTeachers,
      assessmentApplicabilities,
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries,
      gradingSystems,
      gradeRules,
      attendance,
      computedResults,
      reportCards,
      reportCardItems,
    ]
  );

  const output = useMemo(() => {
    return buildReportEngineOutput(dataset, filters);
  }, [dataset, filters]);

  const hasCoreSetup = Boolean(
    academicStructures.length && academicPeriods.length && classes.length && students.length
  );

  const activeContextName = `${activeSchool?.name || schools[0]?.name || "Selected School"} · ${
    activeBranch?.name || branches[0]?.name || "Selected Branch"
  }`;

  // ======================================================
  // RENDER ACTIVE REPORT
  // ======================================================

  const renderActiveReport = () => {
    if (!hasCoreSetup) {
      return (
        <section className="rp-empty-card report-no-print">
          <div className="rp-empty-icon">📄</div>
          <h3>Reports need academic data first</h3>
          <p>
            Add academic periods, classes, students, enrollments, class subjects, assessment
            entries, or computed results before generating publishable reports.
          </p>
        </section>
      );
    }

    if (mode === "student-report") {
      return <StudentReportCard dataset={output.studentReport} pageBreakAfter={false} />;
    }

    if (mode === "class-reports") {
      return output.classReports.length ? (
        output.classReports.map((reportDataset, index) => (
          <StudentReportCard
            key={reportDataset.report?.studentId || index}
            dataset={reportDataset}
            compact
            pageBreakAfter={index < output.classReports.length - 1}
          />
        ))
      ) : (
        <StudentReportCard dataset={undefined} />
      );
    }

    if (mode === "subject-broadsheet") {
      return (
        <SubjectBroadsheet
          header={output.header}
          broadsheet={output.subjectBroadsheet}
          pageBreakAfter={false}
        />
      );
    }

    return (
      <ClassBroadsheet
        header={output.header}
        broadsheet={output.classBroadsheet}
        pageBreakAfter={false}
      />
    );
  };

  // ======================================================
  // LOADING / PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="rp-page" style={{ "--rp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rp-state-card">
          <div className="rp-spinner" />
          <h2>Opening report engine...</h2>
          <p>Checking account, school, branch, and academic report data.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="rp-page" style={{ "--rp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rp-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before opening reports.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="rp-page" style={{ "--rp-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="rp-state-card">
          <h2>Select a school branch first</h2>
          <p>Reports are generated inside one active school and branch workspace.</p>
          <button type="button" className="rp-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="rp-page" style={{ "--rp-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="rp-hero report-no-print">
        <div className="rp-hero-main">
          <div className="rp-avatar" aria-hidden="true">
            📄
          </div>

          <div className="rp-title-wrap">
            <p>Academic Publishing</p>
            <h2>Report Engine</h2>
            <span>{activeContextName}</span>
          </div>
        </div>

        <div className="rp-export-wrap">
          <ReportExportTools targetId="report-print-zone" primaryColor={primary} />
        </div>
      </section>

      <section className="rp-metrics report-no-print" aria-label="Report context summary">
        <article className="rp-mini-card">
          <strong>{students.length}</strong>
          <span>Students</span>
        </article>
        <article className="rp-mini-card">
          <strong>{classes.length}</strong>
          <span>Classes</span>
        </article>
        <article className="rp-mini-card">
          <strong>{classSubjects.length}</strong>
          <span>Class Subjects</span>
        </article>
        <article className="rp-mini-card">
          <strong>{computedResults.length}</strong>
          <span>Results</span>
        </article>
      </section>

      <section className="rp-mobile-actions report-no-print" aria-label="Quick report controls">
        <button
          type="button"
          className={showFilters ? "active" : ""}
          onClick={() => setShowFilters((prev) => !prev)}
        >
          Filters
        </button>
        <button
          type="button"
          className={showAnalytics ? "active" : ""}
          onClick={() => setShowAnalytics((prev) => !prev)}
        >
          Analytics
        </button>
        <button type="button" onClick={load}>
          Refresh
        </button>
      </section>

      <section className="rp-workspace report-no-print">
        {showFilters && (
          <div className="rp-panel rp-filter-panel">
            <div className="rp-panel-head">
              <div>
                <p>Step 1</p>
                <h3>Choose report scope</h3>
              </div>
              <span>{formatCount(filteredStudents.length, "student")}</span>
            </div>

            <ReportFilters
              mode={mode}
              setMode={setMode}
              filters={filters}
              setFilters={setFilters}
              branches={lockedBranches}
              academicStructures={academicStructures}
              academicPeriods={academicPeriods}
              classes={filteredClasses}
              classSubjects={filteredClassSubjects}
              subjects={subjects}
              students={filteredStudents}
              studentEnrollments={studentEnrollments}
              primaryColor={primary}
            />
          </div>
        )}

        {showAnalytics && (
          <div className="rp-panel rp-analytics-panel">
            <div className="rp-panel-head">
              <div>
                <p>Step 2</p>
                <h3>Review readiness</h3>
              </div>
              <span>{output.warnings.length ? `${output.warnings.length} warning(s)` : "Ready"}</span>
            </div>

            <ReportAnalytics
              analytics={output.analytics}
              warnings={output.warnings}
              primaryColor={primary}
            />
          </div>
        )}
      </section>

      <section className="rp-print-shell">
        <div className="rp-print-head report-no-print">
          <div>
            <p>Step 3</p>
            <h3>Preview output</h3>
          </div>
          <span>{mode.replace(/-/g, " ")}</span>
        </div>

        <div id="report-print-zone" className="rp-print-zone">
          {renderActiveReport()}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes rpSpin {
  to { transform: rotate(360deg); }
}

.rp-page {
  min-height: 100dvh;
  width: 100%;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.rp-page *,
.rp-page *::before,
.rp-page *::after {
  box-sizing: border-box;
}

.rp-page button,
.rp-page input,
.rp-page select,
.rp-page textarea {
  font: inherit;
}

.rp-page table {
  max-width: 100%;
}

.rp-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.rp-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 950;
  letter-spacing: -0.04em;
}

.rp-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.rp-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--rp-primary) 18%, transparent);
  border-top-color: var(--rp-primary);
  animation: rpSpin .8s linear infinite;
}

.rp-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--rp-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.rp-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--rp-primary) 12%, #ffffff), #ffffff 64%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.07);
}

.rp-hero-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.rp-avatar {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--rp-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--rp-primary) 28%, transparent);
  font-size: 22px;
}

.rp-title-wrap {
  min-width: 0;
}

.rp-title-wrap p,
.rp-title-wrap h2,
.rp-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-title-wrap p {
  margin: 0 0 2px;
  color: var(--rp-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.rp-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -0.06em;
  line-height: 1;
}

.rp-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.rp-export-wrap {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  max-width: 100%;
}

.rp-export-wrap > * {
  max-width: 100%;
}

.rp-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.rp-mini-card {
  min-width: 0;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
}

.rp-mini-card strong,
.rp-mini-card span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-mini-card strong {
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -0.05em;
}

.rp-mini-card span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.rp-mobile-actions {
  position: sticky;
  top: 50px;
  z-index: 12;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 88%, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(12px);
}

.rp-mobile-actions button {
  min-width: 0;
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 8px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rp-mobile-actions button.active {
  background: var(--rp-primary);
  color: #fff;
}

.rp-workspace {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.rp-panel,
.rp-print-shell {
  min-width: 0;
  border-radius: 26px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.055);
  overflow: hidden;
}

.rp-panel {
  padding: 10px;
}

.rp-panel-head,
.rp-print-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.rp-panel-head div,
.rp-print-head div {
  min-width: 0;
}

.rp-panel-head p,
.rp-print-head p {
  margin: 0;
  color: var(--rp-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.rp-panel-head h3,
.rp-print-head h3 {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -0.04em;
}

.rp-panel-head span,
.rp-print-head span {
  max-width: 48%;
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rp-primary) 10%, #ffffff);
  color: var(--rp-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rp-filter-panel :is(input, select, textarea),
.rp-analytics-panel :is(input, select, textarea) {
  min-height: 42px;
}

.rp-filter-panel :is(button),
.rp-analytics-panel :is(button) {
  min-height: 38px;
}

.rp-print-shell {
  margin-top: 10px;
  padding: 10px;
}

.rp-print-zone {
  display: grid;
  gap: 14px;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.rp-print-zone > * {
  min-width: 0;
}

.rp-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 260px;
  padding: 22px;
  border-radius: 26px;
  background: linear-gradient(135deg, #ffffff, #f8fafc);
  border: 1px dashed rgba(148, 163, 184, 0.5);
  text-align: center;
}

.rp-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--rp-primary) 12%, #ffffff);
  font-size: 28px;
}

.rp-empty-card h3 {
  margin: 0;
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -0.04em;
}

.rp-empty-card p {
  max-width: 40rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.65;
}

@media (min-width: 720px) {
  .rp-page {
    padding: 14px;
  }

  .rp-hero {
    padding: 16px;
  }

  .rp-avatar {
    width: 54px;
    height: 54px;
    border-radius: 20px;
  }

  .rp-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .rp-panel,
  .rp-print-shell {
    padding: 14px;
    border-radius: 30px;
  }
}

@media (min-width: 1040px) {
  .rp-page {
    padding: 18px;
  }

  .rp-workspace {
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr);
    align-items: start;
  }

  .rp-mobile-actions {
    position: static;
    width: min(420px, 100%);
  }
}

@media (max-width: 520px) {
  .rp-hero {
    flex-direction: column;
  }

  .rp-export-wrap {
    justify-content: stretch;
    width: 100%;
  }

  .rp-export-wrap > * {
    width: 100%;
  }

  .rp-title-wrap h2 {
    font-size: 21px;
  }

  .rp-metrics {
    gap: 6px;
  }

  .rp-mini-card {
    padding: 10px;
    border-radius: 19px;
  }

  .rp-mini-card strong {
    font-size: 18px;
  }

  .rp-mobile-actions {
    top: 46px;
    border-radius: 22px;
  }

  .rp-mobile-actions button {
    min-height: 36px;
    font-size: 11px;
  }

  .rp-panel,
  .rp-print-shell {
    border-radius: 22px;
    padding: 8px;
  }

  .rp-panel-head,
  .rp-print-head {
    align-items: flex-start;
  }

  .rp-panel-head span,
  .rp-print-head span {
    max-width: 44%;
    font-size: 10px;
    padding: 5px 8px;
  }

  .rp-panel-head h3,
  .rp-print-head h3 {
    font-size: 15px;
  }
}

@media print {
  .report-no-print,
  .rp-hero,
  .rp-metrics,
  .rp-mobile-actions,
  .rp-workspace,
  .rp-print-head {
    display: none !important;
  }

  .rp-page,
  .rp-print-shell,
  .rp-print-zone {
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: 0 !important;
    overflow: visible !important;
  }
}
`;
