"use client";

/**
 * SchoolBranchDashboard.tsx
 * ---------------------------------------------------------
 * SELECTED SCHOOL + BRANCH COMMAND CENTER
 * ---------------------------------------------------------
 *
 * Uses the new architecture:
 * School -> Branch -> SchoolBranchSettings
 *
 * Important correction:
 * ONLY these stat cards use image backgrounds:
 * - Students
 * - Teachers
 * - Classes
 * - Subjects
 *
 * All other stat cards remain clean normal cards without image backgrounds.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  Attendance,
  Class,
  ClassSubject,
  ComputedResult,
  Expense,
  Income,
  Payment,
  ReportCard,
  SchoolBranchSetting,
  Student,
  Subject,
  Teacher,
} from "../lib/db";

import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
  route: string;
  help: string;
};

type DashboardImageType =
  | "students"
  | "teachers"
  | "classes"
  | "subjects"
  | "none"
  | "hero"
  | "banner";

type StatCardItem = {
  label: string;
  value: number;
  route: string;
  icon: string;
  imageType: DashboardImageType;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const money = (value: number) => {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(value || 0);
};

const percent = (part: number, whole: number) => {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
};

const firstImage = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolBranchDashboard({ navigate }: Props) {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const schoolId = activeSchoolId || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color)";

  const schoolAny = activeSchool as any;
  const branchAny = activeBranch as any;

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1200);

  const [settingsRows, setSettingsRows] = useState<SchoolBranchSetting[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // ======================================================
  // ONLINE + VIEWPORT
  // ======================================================

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        settingRows,
        structureRows,
        periodRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        classSubjectRows,
        applicabilityRows,
        entryRows,
        computedRows,
        reportRows,
        attendanceRows,
        paymentRows,
        incomeRows,
        expenseRows,
      ] = await Promise.all([
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentEntries.toArray(),
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.attendance.toArray(),
        db.payments.toArray(),
        db.incomes.toArray(),
        db.expenses.toArray(),
      ]);

      setSettingsRows(settingRows.filter(row => !row.isDeleted));
      setAcademicStructures(structureRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAcademicPeriods(periodRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStudents(studentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setTeachers(teacherRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setSubjects(subjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClassSubjects(classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAssessmentApplicabilities(applicabilityRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAssessmentEntries(entryRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setComputedResults(computedRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setReportCards(reportRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAttendance(attendanceRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPayments(paymentRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setIncomes(incomeRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setExpenses(expenseRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load school branch dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("school-branch-settings-updated", refresh);
    window.addEventListener("school-branch-context-changed", refresh);

    return () => {
      window.removeEventListener("school-branch-settings-updated", refresh);
      window.removeEventListener("school-branch-context-changed", refresh);
    };
  }, [branchId]);

  // ======================================================
  // CURRENT SCHOOL-BRANCH SETTINGS + ACADEMIC CONTEXT
  // ======================================================

  const currentSetting = useMemo(() => {
    return (
      settingsRows.find(row => row.schoolId === schoolId && row.branchId === branchId) ||
      settings ||
      undefined
    );
  }, [settingsRows, settings, schoolId, branchId]);

  const currentAcademicStructure = useMemo(() => {
    return academicStructures.find(
      row => row.id === currentSetting?.currentAcademicStructureId
    );
  }, [academicStructures, currentSetting?.currentAcademicStructureId]);

  const currentAcademicPeriod = useMemo(() => {
    return academicPeriods.find(row => row.id === currentSetting?.currentAcademicPeriodId);
  }, [academicPeriods, currentSetting?.currentAcademicPeriodId]);

  // ======================================================
  // CONTEXT-AWARE IMAGE RESOLUTION
  // ======================================================
  // NOTE: Only students, teachers, classes and subjects stat cards use images.
  // Other cards intentionally return empty images.

  const getDashboardImage = (type: DashboardImageType) => {
    

    if (type === "hero") {
      return firstImage(currentSetting?.dashboardHeroImage)
    }
    if (type === "banner") {
      return firstImage(currentSetting?.dashboardBannerImage)
    }

    if (type === "students") {
      return firstImage(currentSetting?.studentPortalImage)
    }

    if (type === "teachers") {
      return firstImage(currentSetting?.teacherPortalImage)
    }

    if (type === "classes") {
      return firstImage(currentSetting?.classroomPlaceholderImage)
    }

    if (type === "subjects") {
      return firstImage(currentSetting?.subjectPlaceholderImage)
    }

    return "";
  };

  const heroImage = getDashboardImage("hero");
  const bannerImage = getDashboardImage("banner");

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const activeStudents = useMemo(
    () => students.filter(row => row.status === "active" || !row.status),
    [students]
  );

  const activeTeachers = useMemo(
    () => teachers.filter(row => row.active !== false),
    [teachers]
  );

  const activeClasses = useMemo(
    () => classes.filter(row => row.active !== false),
    [classes]
  );

  const activeSubjects = useMemo(
    () => subjects.filter(row => row.active !== false),
    [subjects]
  );

  const activeClassSubjects = useMemo(
    () => classSubjects.filter(row => row.active !== false),
    [classSubjects]
  );

  const activeApplicabilities = useMemo(
    () => assessmentApplicabilities.filter(row => row.active !== false),
    [assessmentApplicabilities]
  );

  const todayAttendance = useMemo(() => {
    const today = todayISO();
    return attendance.filter(row => row.date === today);
  }, [attendance]);

  const presentToday = useMemo(
    () => todayAttendance.filter(row => row.status === "present").length,
    [todayAttendance]
  );

  const absentToday = useMemo(
    () => todayAttendance.filter(row => row.status === "absent").length,
    [todayAttendance]
  );

  const attendancePercent = useMemo(
    () => percent(presentToday, todayAttendance.length),
    [presentToday, todayAttendance]
  );

  const finance = useMemo(() => {
    const totalPayments = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalIncome = incomes.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      totalPayments,
      totalIncome,
      totalExpenses,
      balance: totalPayments + totalIncome - totalExpenses,
    };
  }, [payments, incomes, expenses]);

  const reportReadiness = useMemo<ReadinessItem[]>(() => {
    return [
      {
        label: "School profile",
        ready: !!activeSchool,
        route: "schools",
        help: "Create the official school identity.",
      },
      {
        label: "Branch selected",
        ready: !!activeBranch,
        route: "branches",
        help: "Create and select a branch/campus.",
      },
      {
        label: "Academic period",
        ready: !!currentAcademicStructure && !!currentAcademicPeriod,
        route: "schoolBranchSettings",
        help: "Set the current academic structure and period.",
      },
      {
        label: "Classes",
        ready: activeClasses.length > 0,
        route: "classes",
        help: "Create classes for the selected branch.",
      },
      {
        label: "Subjects",
        ready: activeSubjects.length > 0,
        route: "subjects",
        help: "Create academic subjects.",
      },
      {
        label: "Class subjects",
        ready: activeClassSubjects.length > 0,
        route: "classSubjects",
        help: "Attach subjects to classes and periods.",
      },
      {
        label: "Assessment applicability",
        ready: activeApplicabilities.length > 0,
        route: "assessmentApplicability",
        help: "Apply assessment structure and grading rules to class subjects.",
      },
      {
        label: "Scores entered",
        ready: assessmentEntries.length > 0,
        route: "assessmentEntriesPage",
        help: "Enter scores for students.",
      },
      {
        label: "Reports ready",
        ready: reportCards.length > 0 || computedResults.length > 0,
        route: "reports",
        help: "Generate report cards or broadsheets.",
      },
    ];
  }, [
    activeSchool,
    activeBranch,
    currentAcademicStructure,
    currentAcademicPeriod,
    activeClasses,
    activeSubjects,
    activeClassSubjects,
    activeApplicabilities,
    assessmentEntries,
    reportCards,
    computedResults,
  ]);

  const readinessPercent = useMemo(() => {
    const ready = reportReadiness.filter(item => item.ready).length;
    return percent(ready, reportReadiness.length);
  }, [reportReadiness]);

  const recentStudents = useMemo(() => {
    return [...activeStudents]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 5);
  }, [activeStudents]);

  const recentPayments = useMemo(() => {
    return [...payments]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 5);
  }, [payments]);

  const recentEntries = useMemo(() => {
    return [...assessmentEntries]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 5);
  }, [assessmentEntries]);

  const statCards = useMemo<StatCardItem[]>(() => {
    return [
      { label: "Students", value: activeStudents.length, route: "students", icon: "🧑‍🎓", imageType: "students" },
      { label: "Teachers", value: activeTeachers.length, route: "teachers", icon: "👨‍🏫", imageType: "teachers" },
      { label: "Classes", value: activeClasses.length, route: "classes", icon: "🏷", imageType: "classes" },
      { label: "Subjects", value: activeSubjects.length, route: "subjects", icon: "📘", imageType: "subjects" },
      { label: "Class Subjects", value: activeClassSubjects.length, route: "classSubjects", icon: "📖", imageType: "none" },
      { label: "Assessment Contexts", value: activeApplicabilities.length, route: "assessmentApplicability", icon: "🎯", imageType: "none" },
      { label: "Scores", value: assessmentEntries.length, route: "assessmentEntriesPage", icon: "📝", imageType: "none" },
      { label: "Reports", value: reportCards.length || computedResults.length, route: "reports", icon: "📄", imageType: "none" },
    ];
  }, [
    activeStudents.length,
    activeTeachers.length,
    activeClasses.length,
    activeSubjects.length,
    activeClassSubjects.length,
    activeApplicabilities.length,
    assessmentEntries.length,
    reportCards.length,
    computedResults.length,
  ]);

  // ======================================================
  // RESPONSIVE LAYOUT
  // ======================================================

  const isMobile = viewportWidth < 720;
  const isSmallMobile = viewportWidth < 420;
  const isTablet = viewportWidth >= 720 && viewportWidth < 1100;

  const pagePadding = isSmallMobile ? 10 : isMobile ? 12 : 20;
  const sectionGap = isMobile ? 12 : 20;
  const cardPadding = isMobile ? 14 : 18;
  const cardRadius = isMobile ? 18 : 22;

  const statGridColumns = isSmallMobile
    ? "1fr"
    : isMobile
    ? "repeat(2, minmax(0, 1fr))"
    : "repeat(auto-fit,minmax(180px,1fr))";

  const mainGridColumns = isTablet || isMobile
    ? "1fr"
    : "minmax(0,1.3fr) minmax(320px,0.7fr)";

  const contextGridColumns = isMobile ? "1fr" : "repeat(auto-fit,minmax(190px,1fr))";

  const financeGridColumns = isSmallMobile
    ? "1fr"
    : isMobile
    ? "repeat(2, minmax(0, 1fr))"
    : "repeat(auto-fit,minmax(150px,1fr))";

  const todayGridColumns = isSmallMobile ? "1fr" : "1fr 1fr";

  // ======================================================
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: cardRadius,
    padding: cardPadding,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const title: React.CSSProperties = {
    margin: 0,
    fontSize: isMobile ? 18 : 20,
    fontWeight: 950,
    letterSpacing: -0.3,
  };

  const muted: React.CSSProperties = {
    opacity: 0.68,
    fontSize: isMobile ? 12 : 13,
    fontWeight: 650,
  };

  const button: React.CSSProperties = {
    padding: isMobile ? "10px 12px" : "11px 15px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: isMobile ? "9px 11px" : "10px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 800,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: isMobile ? "4px 8px" : "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: isMobile ? 10.5 : 11,
      fontWeight: 850,
      lineHeight: 1.2,
    };
  };

  const imagePanel = (image?: string): React.CSSProperties => ({
    position: "relative",
    overflow: "hidden",
    borderRadius: isMobile ? 20 : 28,
    padding: isMobile ? 16 : 22,
    color: "#fff",
    minHeight: isMobile ? 190 : 210,
    background: image
      ? `linear-gradient(135deg, rgba(15,23,42,0.78), rgba(15,23,42,0.38)), url(${image}) center/cover`
      : `linear-gradient(135deg, ${primary}, #111827)`,
    boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
  });

  const statCardStyle = (image?: string): React.CSSProperties => {
    if (!image) {
      return {
        ...card,
        textAlign: "left",
        cursor: "pointer",
        minWidth: 0,
      };
    }

    return {
      ...card,
      textAlign: "left",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.16)",
      background: `linear-gradient(135deg, rgba(15,23,42,0.82), rgba(15,23,42,0.42)), url(${image}) center/cover`,
      boxShadow: "0 16px 34px rgba(15,23,42,0.16)",
      minHeight: isMobile ? 118 : 128,
      minWidth: 0,
    };
  };

  const statMutedStyle = (hasImage: boolean): React.CSSProperties => ({
    ...muted,
    fontWeight: 850,
    opacity: hasImage ? 0.9 : muted.opacity,
    color: hasImage ? "#fff" : undefined,
  });

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading school branch dashboard...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            This dashboard works inside a school and branch context. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div
      style={{
        padding: pagePadding,
        color: "var(--text)",
        display: "grid",
        gap: sectionGap,
        overflowX: "hidden",
      }}
    >
      {/* HERO */}
      <section style={imagePanel(heroImage)}>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ ...badge(isOnline ? "green" : "red"), background: "rgba(255,255,255,0.18)", color: "#fff" }}>
              {isOnline ? "● Online - Sync Ready" : "● Offline - Local Mode"}
            </span>
            <span style={{ ...badge("blue"), background: "rgba(255,255,255,0.18)", color: "#fff" }}>
              School: {activeSchool?.name || "No school selected"}
            </span>
            <span style={{ ...badge("blue"), background: "rgba(255,255,255,0.18)", color: "#fff" }}>
              Branch: {activeBranch?.name || "No branch selected"}
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: isSmallMobile ? 26 : isMobile ? 30 : 36,
              lineHeight: 1.08,
              fontWeight: 950,
              letterSpacing: -1,
              wordBreak: "break-word",
            }}
          >
            {activeBranch?.name || activeSchool?.name || "School Branch Command Center"}
          </h1>

          <p style={{ margin: "10px 0 0", maxWidth: isMobile ? "100%" : 780, opacity: 0.92, lineHeight: 1.6, fontSize: isMobile ? 13 : 14 }}>
            Daily operational view for the selected school and branch: academics, attendance,
            assessment, reports, publishing readiness and finance.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <button style={{ ...button, background: "#fff", color: "#111" }} onClick={() => navigate?.("reports")}>
              Open Reports Studio
            </button>
            <button style={{ ...ghostButton, color: "#fff", borderColor: "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.14)" }} onClick={() => navigate?.("assessmentEntriesPage")}>
              Enter Scores
            </button>
            <button style={{ ...ghostButton, color: "#fff", borderColor: "rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.14)" }} onClick={() => navigate?.("student-attendance")}>
              Take Attendance
            </button>
          </div>
        </div>
      </section>

      {/* MAIN STATS */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: statGridColumns,
          gap: isMobile ? 10 : 14,
        }}
      >
        {statCards.map(item => {
          const image = getDashboardImage(item.imageType);
          const hasImage = !!image;

          return (
            <button
              key={item.label}
              onClick={() => navigate?.(item.route)}
              style={statCardStyle(image)}
              title={hasImage ? `${item.label} image loaded from school branch settings` : item.label}
            >
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={statMutedStyle(hasImage)}>{item.label}</div>
                  <div style={{ fontSize: isMobile ? 19 : 22 }}>{item.icon}</div>
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 25 : 30, fontWeight: 950 }}>{item.value}</div>
              </div>
            </button>
          );
        })}
      </section>

      {/* MAIN GRID */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: mainGridColumns,
          gap: isMobile ? 12 : 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: isMobile ? 12 : 18, minWidth: 0 }}>
          {/* ACADEMIC CONTEXT */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={title}>Current Academic Context</h2>
                <div style={{ ...muted, marginTop: 4 }}>
                  This is the academic session used by reports, assessment and attendance.
                </div>
              </div>
              <span style={badge(readinessPercent >= 75 ? "green" : readinessPercent >= 45 ? "orange" : "red")}>
                {readinessPercent}% Publishing Ready
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: contextGridColumns,
                gap: 12,
                marginTop: 16,
              }}
            >
              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={muted}>Academic Structure</div>
                <div style={{ marginTop: 8, fontSize: isMobile ? 17 : 20, fontWeight: 900 }}>
                  {currentAcademicStructure?.name || "Not selected"}
                </div>
              </div>
              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={muted}>Academic Period</div>
                <div style={{ marginTop: 8, fontSize: isMobile ? 17 : 20, fontWeight: 900 }}>
                  {currentAcademicPeriod?.name || "Not selected"}
                </div>
              </div>
              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={muted}>Branch</div>
                <div style={{ marginTop: 8, fontSize: isMobile ? 17 : 20, fontWeight: 900 }}>
                  {activeBranch?.name || "Not selected"}
                </div>
              </div>
            </div>
          </div>

          {/* READINESS */}
          <div style={card}>
            <h2 style={title}>Academic Publishing Readiness</h2>
            <div style={{ ...muted, marginTop: 4 }}>
              A professional report card can only be trusted when these setup areas are ready.
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {reportReadiness.map(item => (
                <div
                  key={item.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: isMobile ? 10 : 12,
                    borderRadius: 16,
                    background: "rgba(0,0,0,0.025)",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{item.label}</div>
                    <div style={{ ...muted, marginTop: 2 }}>{item.help}</div>
                  </div>

                  <button
                    onClick={() => navigate?.(item.route)}
                    style={{
                      ...badge(item.ready ? "green" : "orange"),
                      border: "none",
                      cursor: "pointer",
                      justifySelf: isMobile ? "start" : "end",
                    }}
                  >
                    {item.ready ? "Ready" : "Setup"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* FINANCE */}
          <div style={imagePanel(bannerImage)}>
            <div style={{ position: "relative", zIndex: 1 }}>
              <h2 style={{ ...title, color: "#fff" }}>Finance Snapshot</h2>
              <div style={{ marginTop: 5, opacity: 0.88 }}>
                Payments, income and expenses for the selected branch.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: financeGridColumns,
                  gap: 12,
                  marginTop: 16,
                }}
              >
                <FinanceBox label="Payments" value={money(finance.totalPayments)} isMobile={isMobile} />
                <FinanceBox label="Income" value={money(finance.totalIncome)} isMobile={isMobile} />
                <FinanceBox label="Expenses" value={money(finance.totalExpenses)} isMobile={isMobile} />
                <FinanceBox label="Balance" value={money(finance.balance)} isMobile={isMobile} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "grid", gap: isMobile ? 12 : 18, alignContent: "start", minWidth: 0 }}>
          <div style={card}>
            <h2 style={title}>Today</h2>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: todayGridColumns, gap: 10 }}>
              <TodayBox label="Attendance Records" value={todayAttendance.length} muted={muted} isMobile={isMobile} />
              <TodayBox label="Present Rate" value={`${attendancePercent}%`} muted={muted} isMobile={isMobile} />
              <TodayBox label="Present" value={presentToday} muted={muted} isMobile={isMobile} />
              <TodayBox label="Absent" value={absentToday} muted={muted} isMobile={isMobile} />
            </div>
          </div>

          <div style={card}>
            <h2 style={title}>Quick Work</h2>
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {[
                ["Take Attendance", "Record today’s student attendance", "student-attendance"],
                ["Enter Scores", "Capture assessment item scores", "assessmentEntriesPage"],
                ["Generate Reports", "Print report cards and broadsheets", "reports"],
                ["Class Subjects", "Manage class academic delivery", "classSubjects"],
                ["Assessment Setup", "Configure assessment applicability", "assessmentApplicability"],
              ].map(([name, desc, route]) => (
                <button
                  key={name}
                  onClick={() => navigate?.(String(route))}
                  style={{
                    textAlign: "left",
                    padding: isMobile ? 11 : 13,
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.07)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{name}</div>
                  <div style={{ ...muted, marginTop: 3 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={card}>
            <h2 style={title}>Recent Students</h2>
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {recentStudents.map(student => (
                <div key={student.id} style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 15,
                      background: student.photo
                        ? `url(${student.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, #111827)`,
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 950,
                      flex: "0 0 42px",
                    }}
                  >
                    {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {student.fullName}
                    </div>
                    <div style={{ ...muted, marginTop: 2 }}>{student.admissionNumber || "No admission number"}</div>
                  </div>
                </div>
              ))}
              {!recentStudents.length && <div style={muted}>No students yet.</div>}
            </div>
          </div>

          <div style={card}>
            <h2 style={title}>Recent Activity</h2>
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {recentEntries.map(entry => (
                <div key={`entry-${entry.id}`} style={{ paddingBottom: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ fontWeight: 850 }}>Score entered: {entry.score}</div>
                  <div style={{ ...muted, marginTop: 2 }}>Student #{entry.studentId} • Subject #{entry.subjectId}</div>
                </div>
              ))}

              {recentPayments.map(payment => (
                <div key={`payment-${payment.id}`} style={{ paddingBottom: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ fontWeight: 850 }}>Payment: {money(Number(payment.amount || 0))}</div>
                  <div style={{ ...muted, marginTop: 2 }}>{payment.method} • {payment.date}</div>
                </div>
              ))}

              {!recentEntries.length && !recentPayments.length && (
                <div style={muted}>No recent activity yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FinanceBox({ label, value, isMobile }: { label: string; value: string; isMobile: boolean }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: isMobile ? 12 : 14 }}>
      <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: isMobile ? 18 : 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function TodayBox({
  label,
  value,
  muted,
  isMobile,
}: {
  label: string;
  value: string | number;
  muted: React.CSSProperties;
  isMobile: boolean;
}) {
  return (
    <div style={{ padding: isMobile ? 12 : 14, borderRadius: 16, background: "rgba(0,0,0,0.025)" }}>
      <div style={muted}>{label}</div>
      <div style={{ marginTop: 6, fontSize: isMobile ? 24 : 28, fontWeight: 950 }}>{value}</div>
    </div>
  );
}
