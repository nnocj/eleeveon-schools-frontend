"use client";

/**
 * reports/Report.tsx
 * ---------------------------------------------------------
 * ENTERPRISE ACADEMIC REPORT ORCHESTRATOR
 * ---------------------------------------------------------
 *
 * Context-aware rewrite for current db.ts.
 *
 * IMPORTANT UX DECISION
 * ---------------------------------------------------------
 * This page does NOT expose a campus/branch selector.
 * The active school + active branch are already selected globally
 * from the dashboard shell/context.
 *
 * Reports are locked to the current Active School -> Active Branch.
 * The report filters only choose academic reporting dimensions:
 * - Academic Structure
 * - Academic Period
 * - Class
 * - Class Subject / Subject
 * - Student
 * - Report Mode
 */

import React, { useEffect, useMemo, useState } from "react";

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
// COMPONENT
// ======================================================

export default function ReportPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color)";
  const branchId = activeBranchId || settings?.branchId;
  const schoolId = activeSchoolId || settings?.schoolId;

  // ======================================================
  // SESSION STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReportMode>("student-report");

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
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

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

      const activeSchools = schoolRows.filter(row => !row.isDeleted);

      const currentSchool = schoolId
        ? activeSchools.find(row => row.id === schoolId)
        : activeSchool || activeSchools[0];

      const currentBranch = branchId
        ? branchRows.find(row => row.id === branchId && !row.isDeleted)
        : activeBranch || undefined;

      const branchScoped = <T extends { branchId: number; isDeleted?: boolean }>(rows: T[]) => {
        return rows.filter(row => {
          if (row.isDeleted) return false;
          if (!branchId) return false;
          return row.branchId === branchId;
        });
      };

      const branchPeriodIds = new Set(
        academicPeriodRows
          .filter(row => !row.isDeleted && branchId && row.branchId === branchId)
          .map(row => row.id)
          .filter(Boolean) as number[]
      );

      const branchReportCardIds = new Set(
        reportCardRows
          .filter(row => !row.isDeleted && branchId && row.branchId === branchId)
          .map(row => row.id)
          .filter(Boolean) as number[]
      );

      // Keep only the globally selected school and branch in the report dataset.
      // This prevents ReportFilters from behaving like a branch/campus switcher.
      setSchools(currentSchool ? [currentSchool] : []);
      setBranches(currentBranch ? [currentBranch] : []);

      setSchoolBranchSettings(
        schoolBranchSettingRows.filter(row => {
          if (row.isDeleted) return false;
          if (schoolId && row.schoolId && row.schoolId !== schoolId) return false;
          if (branchId && row.branchId && row.branchId !== branchId) return false;
          return true;
        })
      );

      setAcademicStructures(branchScoped(academicStructureRows));
      setAcademicPeriods(branchScoped(academicPeriodRows));

      setStudents(branchScoped(studentRows));
      setParents(branchScoped(parentRows));
      setTeachers(branchScoped(teacherRows));
      setClasses(branchScoped(classRows));
      setSubjects(branchScoped(subjectRows));
      setClassSubjects(branchScoped(classSubjectRows));
      setStudentParents(branchScoped(studentParentRows));
      setStudentEnrollments(branchScoped(enrollmentRows));
      setClassTeachers(branchScoped(classTeacherRows));
      setAssessmentApplicabilities(branchScoped(applicabilityRows));
      setAssessmentStructures(branchScoped(structureRows));
      setAssessmentStructureItems(branchScoped(structureItemRows));
      setAssessmentEntries(branchScoped(entryRows));
      setGradingSystems(branchScoped(gradingRows));
      setGradeRules(branchScoped(ruleRows));

      setAttendance(branchScoped(attendanceRows));
      setComputedResults(branchScoped(computedRows));
      setReportCards(branchScoped(reportCardRows));
      setReportCardItems(
        reportCardItemRows.filter(row => {
          if (row.isDeleted) return false;
          if (!branchId) return false;
          if (row.branchId !== branchId) return false;
          if (row.reportCardId && !branchReportCardIds.has(row.reportCardId)) return false;
          if (row.academicPeriodId && !branchPeriodIds.has(row.academicPeriodId)) return false;
          return true;
        })
      );
    } catch (error) {
      console.error("Failed to load report data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId, schoolId]);

  // ======================================================
  // KEEP FILTERS LOCKED TO ACTIVE BRANCH
  // ======================================================

  useEffect(() => {
    setFilters(prev => {
      const branchChanged = prev.branchId !== (branchId || 0);

      return {
        ...prev,
        branchId: branchId || 0,
        academicStructureId:
          branchChanged ? settings?.currentAcademicStructureId : prev.academicStructureId || settings?.currentAcademicStructureId,
        academicPeriodId:
          branchChanged ? settings?.currentAcademicPeriodId : prev.academicPeriodId || settings?.currentAcademicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        classSubjectId: branchChanged ? undefined : prev.classSubjectId,
        studentId: branchChanged ? undefined : prev.studentId,
      };
    });
  }, [branchId, settings?.currentAcademicStructureId, settings?.currentAcademicPeriodId]);

  useEffect(() => {
    if (!filters.academicStructureId && academicStructures[0]?.id) {
      setFilters(prev => ({ ...prev, academicStructureId: academicStructures[0].id }));
    }
  }, [filters.academicStructureId, academicStructures]);

  useEffect(() => {
    if (!filters.academicPeriodId && academicPeriods[0]?.id) {
      setFilters(prev => ({ ...prev, academicPeriodId: academicPeriods[0].id }));
    }
  }, [filters.academicPeriodId, academicPeriods]);

  // ======================================================
  // FILTER DATA PASSED TO REPORTFILTERS
  // ======================================================

  const lockedBranches = useMemo(() => {
    return activeBranch ? [activeBranch] : branches;
  }, [activeBranch, branches]);

  const filteredClasses = useMemo(() => {
    // Class does NOT have academicStructureId in the current db.ts.
    // So we infer academic-structure/period relevance through:
    // - studentEnrollments
    // - classSubjects
    const allowedClassIds = new Set<number>();

    studentEnrollments.forEach(row => {
      if (row.status !== "active") return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    classSubjects.forEach(row => {
      if (row.active === false) return;
      if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return;
      if (filters.academicPeriodId && row.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return;
      allowedClassIds.add(row.classId);
    });

    if (!filters.academicStructureId && !filters.academicPeriodId) {
      return classes;
    }

    return classes.filter(row => row.id && allowedClassIds.has(row.id));
  }, [
    classes,
    studentEnrollments,
    classSubjects,
    filters.academicStructureId,
    filters.academicPeriodId,
  ]);

  const filteredClassSubjects = useMemo(() => {
    return classSubjects.filter(row => {
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
        .filter(row => {
          if (row.status !== "active") return false;
          if (filters.classId && row.classId !== filters.classId) return false;
          if (filters.academicStructureId && row.academicStructureId !== filters.academicStructureId) return false;
          if (filters.academicPeriodId && row.academicPeriodId !== filters.academicPeriodId) return false;
          return true;
        })
        .map(row => row.studentId)
    );

    return students.filter(row => row.id && allowedStudentIds.has(row.id));
  }, [students, studentEnrollments, filters.classId, filters.academicStructureId, filters.academicPeriodId]);

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
      classTeachers,
      studentEnrollments,
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

  // ======================================================
  // STYLES
  // ======================================================

  const pageStyle: React.CSSProperties = {
    padding: 20,
    color: "var(--text)",
    background: "var(--bg)",
    minHeight: "100vh",
  };

  const surfaceCard: React.CSSProperties = {
    padding: 24,
    borderRadius: 22,
    background: "var(--surface)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const headerCard: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 26,
    fontWeight: 900,
    letterSpacing: -0.4,
  };

  const subtitleStyle: React.CSSProperties = {
    marginTop: 4,
    fontSize: 13,
    opacity: 0.72,
    fontWeight: 650,
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

  // ======================================================
  // LOADING / NO CONTEXT
  // ======================================================

  if (loading || contextLoading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...surfaceCard, fontWeight: 800 }}>
          Loading enterprise report engine...
        </div>
      </div>
    );
  }

  if (!branchId) {
    return (
      <div style={pageStyle}>
        <div style={{ ...surfaceCard, textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.72 }}>
            Reports are generated inside a branch context. Select a school and branch from the global dashboard context first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // RENDER ACTIVE REPORT
  // ======================================================

  const renderActiveReport = () => {
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
  // UI
  // ======================================================

  return (
    <div style={pageStyle}>
      <div className="report-no-print" style={headerCard}>
        <div>
          <h2 style={titleStyle}>Academic Report Publishing Engine</h2>
          <div style={subtitleStyle}>
            ClassSubject-driven report cards, broadsheets and A4 export tools.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={badge("purple")}>{activeSchool?.name || schools[0]?.name || "Selected School"}</span>
            <span style={badge("blue")}>{activeBranch?.name || branches[0]?.name || "Selected Branch"}</span>
            <span style={badge("gray")}>Branch locked</span>
            <span style={badge("gray")}>{students.length} student(s)</span>
            <span style={badge("gray")}>{classSubjects.length} class subject(s)</span>
          </div>
        </div>

        <ReportExportTools targetId="report-print-zone" primaryColor={primary} />
      </div>

      <div className="report-no-print" style={{ display: "grid", gap: 16 }}>
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

        <ReportAnalytics
          analytics={output.analytics}
          warnings={output.warnings}
          primaryColor={primary}
        />
      </div>

      <div
        id="report-print-zone"
        style={{
          marginTop: 20,
          display: "grid",
          gap: 20,
        }}
      >
        {renderActiveReport()}
      </div>
    </div>
  );
}
