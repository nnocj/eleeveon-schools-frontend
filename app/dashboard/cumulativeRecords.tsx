"use client";

/**
 * cumulativeRecords.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ACADEMIC CUMULATIVE RECORDS ENGINE
 * ---------------------------------------------------------
 *
 * Historical reporting engine for:
 * - student cumulative transcripts
 * - multi-period reports
 * - annual cumulative broadsheets
 * - subject longitudinal history
 * - promotion summaries
 * - student progression timelines
 *
 * Source of truth:
 * StudentReportSnapshot + StudentPromotion
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads are scoped by accountId + schoolId + branchId.
 * - Print zone can remain A4-sized, but screen view is wrapped safely.
 * - Dashboard-shell safe: no horizontal page overflow.
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
  Branch,
  Class,
  Parent,
  School,
  SchoolBranchSetting,
  Student,
  StudentParent,
  StudentPromotion,
  StudentReportSnapshot,
  Subject,
  Teacher,
} from "../lib/db";

import CumulativeFilters from "./reports/components/CumulativeFilters";
import CumulativeAnalytics from "./reports/components/CumulativeAnalytics";
import StudentCumulativeTranscript from "./reports/components/StudentCumulativeTranscript";
import AnnualBroadsheet from "./reports/components/AnnualBroadsheet";
import PromotionSummary from "./reports/components/PromotionSummary";
import StudentProgressionTimeline from "./reports/components/StudentProgressionTimeline";
import ReportHeader from "./reports/components/ReportHeader";

import { buildCumulativeReportEngineOutput } from "./reports/engine/cumulative-report-engine";

import type {
  CumulativeReportEngineDataset,
  CumulativeReportFiltersState,
} from "./reports/engine/cumulative-report-types";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type PrintOrientation = "portrait" | "landscape";

// ======================================================
// PRINT TOOL
// ======================================================

function applyCumulativePrintStyles(targetId: string, orientation: PrintOrientation) {
  const existing = document.getElementById("cumulative-report-print-style");

  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = "cumulative-report-print-style";

  style.innerHTML = `
    @page {
      size: A4 ${orientation};
      margin: 10mm;
    }

    @media print {
      body {
        background: #ffffff !important;
      }

      body * {
        visibility: hidden !important;
      }

      #${targetId},
      #${targetId} * {
        visibility: visible !important;
      }

      #${targetId} {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: #fff;
        overflow: visible !important;
      }

      .report-no-print {
        display: none !important;
      }

      .report-screen-scroll {
        overflow: visible !important;
      }

      .report-page-break {
        page-break-after: always;
      }

      .report-page-break:last-child {
        page-break-after: auto;
      }

      tr,
      td,
      th {
        page-break-inside: avoid !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function CumulativeExportTools({
  targetId,
  primaryColor,
  mode,
}: {
  targetId: string;
  primaryColor: string;
  mode: CumulativeReportFiltersState["mode"];
}) {
  const buttons = [
    {
      label: "Print Current View",
      orientation:
        mode === "annual-broadsheet" ||
        mode === "subject-history" ||
        mode === "promotion-summary"
          ? "landscape"
          : "portrait",
    },
    { label: "Student Transcript", orientation: "portrait" },
    { label: "Annual Broadsheet", orientation: "landscape" },
    { label: "Promotion Summary", orientation: "landscape" },
  ] as const;

  const print = (orientation: PrintOrientation) => {
    applyCumulativePrintStyles(targetId, orientation);
    setTimeout(() => window.print(), 200);
  };

  return (
    <div className="cr-export-tools">
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          onClick={() => print(button.orientation)}
          style={{ background: primaryColor }}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

// ======================================================
// SMALL HELPERS
// ======================================================

const formatNumber = (value?: number, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "0";
  return Number(value).toFixed(decimals);
};

const trendLabel = (trend?: string) => {
  if (trend === "up") return "Improving";
  if (trend === "down") return "Declining";
  if (trend === "stable") return "Stable";
  return "-";
};

// ======================================================
// COMPONENT
// ======================================================

export default function CumulativeRecordsPage() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
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
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;

  // ======================================================
  // SESSION STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<CumulativeReportFiltersState>({
    branchId: branchId || 0,
    academicStructureId: settings?.currentAcademicStructureId,
    academicPeriodId: undefined,
    fromAcademicPeriodId: undefined,
    toAcademicPeriodId: undefined,
    academicYear: settings?.academicYear,
    fromAcademicYear: undefined,
    toAcademicYear: undefined,
    classId: undefined,
    studentId: undefined,
    subjectId: undefined,
    snapshotType: "all",
    decision: "all",
    mode: "student-transcript",
    sortMode: "position",
    groupingMode: "academic-year",
    subjectAggregationMode: "average",
    includePromotionRecords: true,
    includeManualSnapshots: true,
    includeTerminalSnapshots: true,
    includeDeletedSnapshots: false,
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
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [studentReportSnapshots, setStudentReportSnapshots] = useState<StudentReportSnapshot[]>([]);
  const [studentPromotions, setStudentPromotions] = useState<StudentPromotion[]>([]);

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

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const sameSchool = (row: TenantRow) =>
    row.accountId === accountId && row.schoolId === schoolId && !row.isDeleted;

  const clearData = () => {
    setSchools([]);
    setBranches([]);
    setSchoolBranchSettings([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setStudents([]);
    setParents([]);
    setStudentParents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setStudentReportSnapshots([]);
    setStudentPromotions([]);
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
        schoolRows,
        branchRows,
        schoolBranchSettingRows,
        academicStructureRows,
        academicPeriodRows,
        studentRows,
        parentRows,
        studentParentRows,
        teacherRows,
        classRows,
        subjectRows,
        snapshotRows,
        promotionRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.students.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.studentReportSnapshots.toArray(),
        db.studentPromotions.toArray(),
      ]);

      setSchools(schoolRows.filter(sameSchool));
      setBranches(branchRows.filter(sameTenant));
      setSchoolBranchSettings(schoolBranchSettingRows.filter(sameTenant));
      setAcademicStructures(
        academicStructureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setAcademicPeriods(
        academicPeriodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );
      setStudents(
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
      setParents(parentRows.filter(sameTenant));
      setStudentParents(studentParentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setStudentReportSnapshots(snapshotRows.filter((row) => sameTenant(row) || (filters.includeDeletedSnapshots && row.accountId === accountId && row.schoolId === schoolId && row.branchId === branchId)));
      setStudentPromotions(promotionRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load cumulative records:", error);
      clearData();
      alert("Failed to load cumulative records");
    } finally {
      setLoading(false);
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
      const branchChanged = prev.branchId !== (branchId || 0);

      return {
        ...prev,
        branchId: branchId || 0,
        academicStructureId: branchChanged
          ? settings?.currentAcademicStructureId
          : prev.academicStructureId || settings?.currentAcademicStructureId,
        academicYear: branchChanged ? settings?.academicYear : prev.academicYear,
        academicPeriodId: branchChanged ? undefined : prev.academicPeriodId,
        classId: branchChanged ? undefined : prev.classId,
        studentId: branchChanged ? undefined : prev.studentId,
        subjectId: branchChanged ? undefined : prev.subjectId,
      };
    });
  }, [branchId, settings?.currentAcademicStructureId, settings?.academicYear]);

  useEffect(() => {
    if (!filters.academicStructureId && academicStructures[0]?.id) {
      setFilters((prev) => ({ ...prev, academicStructureId: academicStructures[0].id }));
    }
  }, [filters.academicStructureId, academicStructures]);

  // ======================================================
  // LOCKED BRANCH DATA
  // ======================================================

  const lockedBranches = useMemo(() => {
    return activeBranch ? [activeBranch] : branches;
  }, [activeBranch, branches]);

  const filteredSnapshotsForControls = useMemo(() => {
    return studentReportSnapshots.filter((snapshot) => {
      if (!filters.includeDeletedSnapshots && snapshot.isDeleted) return false;
      if (branchId && snapshot.branchId !== branchId) return false;
      if (schoolId && snapshot.schoolId !== schoolId) return false;
      if (accountId && snapshot.accountId !== accountId) return false;
      return true;
    });
  }, [studentReportSnapshots, branchId, schoolId, accountId, filters.includeDeletedSnapshots]);

  // ======================================================
  // DATASET
  // ======================================================

  const dataset: CumulativeReportEngineDataset = useMemo(
    () => ({
      schools: schools.length ? schools : activeSchool ? [activeSchool] : [],
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
      studentReportSnapshots,
      studentPromotions,
    }),
    [
      schools,
      activeSchool,
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
      studentReportSnapshots,
      studentPromotions,
    ]
  );

  const output = useMemo(() => {
    return buildCumulativeReportEngineOutput(dataset, filters);
  }, [dataset, filters]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.id === filters.studentId);
  }, [students, filters.studentId]);

  const printablePage: React.CSSProperties = {
    width: "297mm",
    minHeight: "210mm",
    margin: "0 auto 20px",
    padding: "10mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: output.header.branding.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 9,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: 5,
    verticalAlign: "middle",
  };

  // ======================================================
  // EXTRA MODE RENDERERS
  // ======================================================

  const renderMultiPeriodReport = () => {
    const report = output.multiPeriodReport;

    return (
      <section
        className="print-page report-page-break cumulative-multi-period-page"
        style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto 20px",
          padding: "11mm",
          boxSizing: "border-box",
          background: "#fff",
          color: "#111",
          fontFamily: output.header.branding.fontFamily || "Arial, sans-serif",
          border: "1px solid #e5e5e5",
        }}
      >
        <ReportHeader
          header={output.header}
          title="Multi-Period Academic Report"
          subtitle={report ? `${report.studentName} • ${report.periods.length} Periods` : undefined}
          orientation="portrait"
        />

        {!report ? (
          <div className="cr-print-empty">Select a student with multiple historical snapshots to generate a multi-period report.</div>
        ) : (
          <>
            <div className="cr-print-summary-grid">
              <div><strong>Student:</strong> {report.studentName}</div>
              <div><strong>Class:</strong> {report.className || "-"}</div>
              <div><strong>Average:</strong> {formatNumber(report.average, 1)}%</div>
              <div><strong>GPA:</strong> {report.gpa != null ? formatNumber(report.gpa, 2) : "-"}</div>
            </div>

            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Subject</th>
                  {report.periods.map((period) => <th key={period.academicPeriodId} style={th}>{period.academicPeriodName}</th>)}
                  <th style={th}>Average</th>
                  <th style={th}>Best</th>
                  <th style={th}>Latest</th>
                  <th style={th}>Trend</th>
                  <th style={th}>Final Grade</th>
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((subject) => (
                  <tr key={subject.subjectId || subject.subjectName}>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {subject.subjectName}
                      {subject.subjectCode && <div style={{ fontSize: 8, opacity: 0.7 }}>{subject.subjectCode}</div>}
                    </td>
                    {report.periods.map((period) => {
                      const score = subject.periodScores.find((item) => item.academicPeriodId === period.academicPeriodId);
                      return (
                        <td key={`${subject.subjectName}-${period.academicPeriodId}`} style={{ ...td, textAlign: "center" }}>
                          {score ? <><strong>{formatNumber(score.percentage, 1)}%</strong><div style={{ fontSize: 8, opacity: 0.7 }}>{score.grade || "-"}</div></> : "-"}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{formatNumber(subject.average, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{formatNumber(subject.bestScore, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{formatNumber(subject.latestScore, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{trendLabel(subject.trend)}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{subject.finalGrade || "-"}</td>
                  </tr>
                ))}
                {!report.subjects.length && (
                  <tr><td style={{ ...td, textAlign: "center", padding: 16 }} colSpan={report.periods.length + 6}>No multi-period subject records found.</td></tr>
                )}
              </tbody>
            </table>

            <PrintFooter primary={primary} schoolName={output.header.branding.schoolName} label="Official multi-period academic report" />
          </>
        )}
      </section>
    );
  };

  const renderSubjectHistory = () => {
    const history = output.subjectHistory;

    return (
      <section className="print-page report-page-break cumulative-subject-history-page" style={printablePage}>
        <ReportHeader
          header={output.header}
          title="Subject Longitudinal Analytics"
          subtitle={history ? `${history.subjectName} • ${history.totalStudents} Students • ${history.totalPeriods} Periods` : undefined}
          orientation="landscape"
        />

        {!history ? (
          <div className="cr-print-empty">Select a subject to generate longitudinal subject analytics.</div>
        ) : (
          <>
            <div className="cr-print-summary-grid six">
              <div><strong>Subject:</strong> {history.subjectName}</div>
              <div><strong>Students:</strong> {history.totalStudents}</div>
              <div><strong>Periods:</strong> {history.totalPeriods}</div>
              <div><strong>Average:</strong> {formatNumber(history.subjectAverage, 1)}%</div>
              <div><strong>Improving:</strong> {history.improvingCount}</div>
              <div><strong>Declining:</strong> {history.decliningCount}</div>
            </div>

            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={{ ...th, textAlign: "left", minWidth: 180 }}>Student</th>
                  <th style={th}>Class</th>
                  <th style={th}>Periods</th>
                  <th style={th}>Average</th>
                  <th style={th}>Highest</th>
                  <th style={th}>Lowest</th>
                  <th style={th}>Latest</th>
                  <th style={th}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {history.students.map((student, index) => (
                  <tr key={student.studentId}>
                    <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{student.studentName}{student.admissionNumber && <div style={{ fontSize: 8, opacity: 0.7 }}>{student.admissionNumber}</div>}</td>
                    <td style={{ ...td, textAlign: "center" }}>{student.className || "-"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{student.periods.length}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{formatNumber(student.average, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{formatNumber(student.highest, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{formatNumber(student.lowest, 1)}%</td>
                    <td style={{ ...td, textAlign: "center" }}>{student.latest != null ? `${formatNumber(student.latest, 1)}%` : "-"}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{trendLabel(student.trend)}</td>
                  </tr>
                ))}
                {!history.students.length && <tr><td style={{ ...td, textAlign: "center", padding: 16 }} colSpan={9}>No subject history records found.</td></tr>}
              </tbody>
            </table>

            <PrintFooter primary={primary} schoolName={output.header.branding.schoolName} label="Official subject history" />
          </>
        )}
      </section>
    );
  };

  const renderActiveView = () => {
    if (filters.mode === "student-transcript") {
      return <StudentCumulativeTranscript header={output.header} transcript={output.studentTranscript} pageBreakAfter={false} />;
    }

    if (filters.mode === "multi-period-report") return renderMultiPeriodReport();

    if (filters.mode === "annual-broadsheet") {
      return <AnnualBroadsheet header={output.header} broadsheet={output.annualBroadsheet} pageBreakAfter={false} />;
    }

    if (filters.mode === "subject-history") return renderSubjectHistory();

    if (filters.mode === "promotion-summary") {
      return <PromotionSummary header={output.header} summary={output.promotionSummary} pageBreakAfter={false} />;
    }

    return (
      <StudentProgressionTimeline
        header={output.header}
        steps={output.progressionTimeline}
        studentName={selectedStudent?.fullName || output.studentTranscript?.studentName}
        pageBreakAfter={false}
      />
    );
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="cr-page" style={{ "--cr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cr-state-card">
          <div className="cr-spinner" />
          <h2>Opening cumulative records...</h2>
          <p>Checking account, branch, snapshots, promotions, and historical academic records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cr-page" style={{ "--cr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cr-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing cumulative records.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cr-page" style={{ "--cr-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cr-state-card">
          <h2>Select a branch first</h2>
          <p>Cumulative records are generated inside one active school branch.</p>
          <button type="button" className="cr-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cr-page" style={{ "--cr-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cr-hero report-no-print">
        <div className="cr-hero-left">
          <div className="cr-hero-icon">📚</div>
          <div className="cr-title-wrap">
            <p>Historical Publishing</p>
            <h2>Cumulative Records</h2>
            <span>
              {activeBranch?.name || branches[0]?.name || "Selected branch"}
              {activeSchool?.name || schools[0]?.name ? ` · ${activeSchool?.name || schools[0]?.name}` : ""}
            </span>
          </div>
        </div>

        <CumulativeExportTools targetId="cumulative-report-print-zone" primaryColor={primary} mode={filters.mode} />
      </section>

      <section className="cr-context-strip report-no-print">
        <Chip tone="purple">{activeSchool?.name || schools[0]?.name || "Selected School"}</Chip>
        <Chip tone="blue">{activeBranch?.name || branches[0]?.name || "Selected Branch"}</Chip>
        <Chip tone="gray">Branch locked</Chip>
        <Chip tone="gray">{studentReportSnapshots.length} snapshot(s)</Chip>
        <Chip tone="gray">{studentPromotions.length} promotion record(s)</Chip>
        <Chip tone="orange">{filters.mode.replaceAll("-", " ")}</Chip>
      </section>

      <section className="cr-control-stack report-no-print">
        <div className="cr-control-card">
          <CumulativeFilters
            filters={filters}
            setFilters={setFilters}
            branches={lockedBranches}
            academicStructures={academicStructures}
            academicPeriods={academicPeriods}
            classes={classes}
            students={students}
            subjects={subjects}
            snapshots={filteredSnapshotsForControls}
            primaryColor={primary}
          />
        </div>

        <div className="cr-control-card">
          <CumulativeAnalytics analytics={output.analytics} warnings={output.warnings} primaryColor={primary} />
        </div>
      </section>

      <section className="cr-print-shell">
        <div className="report-screen-scroll">
          <div id="cumulative-report-print-zone">{renderActiveView()}</div>
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`cr-chip ${tone}`}>{children}</span>;
}

function PrintFooter({ primary, schoolName, label }: { primary: string; schoolName: string; label: string }) {
  return (
    <div style={{ marginTop: 10, borderTop: `2px solid ${primary}`, paddingTop: 5, display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#555" }}>
      <span>{label} generated for {schoolName}</span>
      <span>Powered by Eleeveon School Management System</span>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes crSpin { to { transform: rotate(360deg); } }

.cr-page {
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

.cr-page *,
.cr-page *::before,
.cr-page *::after { box-sizing: border-box; }
.cr-page button,
.cr-page input,
.cr-page select,
.cr-page textarea { font: inherit; max-width: 100%; }

.cr-state-card {
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
.cr-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.cr-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.cr-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--cr-primary) 18%, transparent); border-top-color: var(--cr-primary); animation: crSpin .8s linear infinite; }
.cr-primary-btn { min-height: 46px; border: 0; border-radius: 999px; padding: 0 18px; background: var(--cr-primary); color: #fff; font-weight: 950; cursor: pointer; }

.cr-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cr-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.cr-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.cr-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--cr-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--cr-primary) 28%, transparent); font-size: 22px; }
.cr-title-wrap { min-width: 0; }
.cr-title-wrap p,
.cr-title-wrap h2,
.cr-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-title-wrap p { margin: 0 0 2px; color: var(--cr-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cr-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.cr-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.cr-export-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
.cr-export-tools button { min-height: 40px; border: 0; border-radius: 999px; padding: 0 13px; color: #fff; font-size: 12px; font-weight: 950; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,.12); }

.cr-context-strip { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; padding: 10px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); }
.cr-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cr-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cr-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cr-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cr-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.cr-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.cr-control-stack { display: grid; gap: 10px; margin-top: 10px; }
.cr-control-card { min-width: 0; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); overflow: hidden; padding: 10px; }
.cr-control-card * { max-width: 100%; }

.cr-print-shell { width: 100%; max-width: 100%; min-width: 0; margin-top: 10px; overflow: hidden; border-radius: 24px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .18); }
.report-screen-scroll { width: 100%; max-width: 100%; min-width: 0; overflow-x: auto; overflow-y: visible; -webkit-overflow-scrolling: touch; padding: 10px; }
#cumulative-report-print-zone { width: max-content; min-width: 100%; }
.cr-print-empty { padding: 20px; border: 1px dashed #bbb; border-radius: 12px; text-align: center; font-weight: 700; }
.cr-print-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; font-size: 10px; }
.cr-print-summary-grid.six { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.cr-print-summary-grid div { border: 1px solid #ccc; padding: 7px; }

@media (min-width: 900px) {
  .cr-page { padding: 12px; }
  .cr-control-stack { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 1040px) {
  .cr-page { padding: 16px; }
}

@media (max-width: 520px) {
  .cr-page { padding: 6px; }
  .cr-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cr-export-tools { display: grid; grid-template-columns: minmax(0, 1fr); }
  .cr-export-tools button { width: 100%; }
  .cr-control-card { border-radius: 20px; padding: 8px; }
  .cr-print-shell { border-radius: 20px; }
  .report-screen-scroll { padding: 6px; }
}
`;
