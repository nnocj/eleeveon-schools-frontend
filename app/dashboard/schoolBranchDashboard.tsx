"use client";

/**
 * SchoolBranchDashboard.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE SCHOOL + BRANCH COMMAND CENTER
 * ---------------------------------------------------------
 *
 * Uses the architecture:
 * Account -> School -> Branch -> SchoolBranchSettings
 *
 * Important correction preserved:
 * ONLY these stat cards use image backgrounds:
 * - Students
 * - Teachers
 * - Classes
 * - Subjects
 *
 * All other stat cards remain clean normal cards without image backgrounds.
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads are scoped by accountId + schoolId + branchId.
 * - Mobile-first dashboard cards.
 * - Dashboard-shell safe: no horizontal overflow.
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

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
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

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  time: number;
  route: string;
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

const safeTime = (value: unknown) => {
  const time = Number(value || 0);
  return Number.isFinite(time) ? time : 0;
};

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolBranchDashboard({ navigate }: Props) {
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

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [pageLoading, setPageLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

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
  // AUTH + CONTEXT PROTECTION
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
  // ONLINE STATUS
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

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setSettingsRows([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setStudents([]);
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
    setAssessmentApplicabilities([]);
    setAssessmentEntries([]);
    setComputedResults([]);
    setReportCards([]);
    setAttendance([]);
    setPayments([]);
    setIncomes([]);
    setExpenses([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

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

      setSettingsRows(settingRows.filter(sameTenant));
      setAcademicStructures(structureRows.filter(sameTenant));
      setAcademicPeriods(periodRows.filter(sameTenant));
      setStudents(studentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setClasses(classRows.filter(sameTenant));
      setSubjects(subjectRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
      setAssessmentApplicabilities(applicabilityRows.filter(sameTenant));
      setAssessmentEntries(entryRows.filter(sameTenant));
      setComputedResults(computedRows.filter(sameTenant));
      setReportCards(reportRows.filter(sameTenant));
      setAttendance(attendanceRows.filter(sameTenant));
      setPayments(paymentRows.filter(sameTenant));
      setIncomes(incomeRows.filter(sameTenant));
      setExpenses(expenseRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load school branch dashboard:", error);
      clearData();
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("school-branch-settings-updated", refresh);
    window.addEventListener("school-branch-context-changed", refresh);

    return () => {
      window.removeEventListener("school-branch-settings-updated", refresh);
      window.removeEventListener("school-branch-context-changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // CURRENT SCHOOL-BRANCH SETTINGS + ACADEMIC CONTEXT
  // ======================================================

  const currentSetting = useMemo(() => {
    return (
      settingsRows.find((row) => row.schoolId === schoolId && row.branchId === branchId) ||
      settings ||
      undefined
    );
  }, [settingsRows, settings, schoolId, branchId]);

  const currentAcademicStructure = useMemo(() => {
    return academicStructures.find(
      (row) => row.id === currentSetting?.currentAcademicStructureId
    );
  }, [academicStructures, currentSetting?.currentAcademicStructureId]);

  const currentAcademicPeriod = useMemo(() => {
    return academicPeriods.find((row) => row.id === currentSetting?.currentAcademicPeriodId);
  }, [academicPeriods, currentSetting?.currentAcademicPeriodId]);

  // ======================================================
  // CONTEXT-AWARE IMAGE RESOLUTION
  // ======================================================

  const getDashboardImage = (type: DashboardImageType) => {
    if (type === "hero") return firstImage(currentSetting?.dashboardHeroImage);
    if (type === "banner") return firstImage(currentSetting?.dashboardBannerImage);
    if (type === "students") return firstImage(currentSetting?.studentPortalImage);
    if (type === "teachers") return firstImage(currentSetting?.teacherPortalImage);
    if (type === "classes") return firstImage(currentSetting?.classroomPlaceholderImage);
    if (type === "subjects") return firstImage(currentSetting?.subjectPlaceholderImage);
    return "";
  };

  const heroImage = getDashboardImage("hero");
  const bannerImage = getDashboardImage("banner");

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const activeStudents = useMemo(
    () => students.filter((row) => row.status === "active" || !row.status),
    [students]
  );

  const activeTeachers = useMemo(
    () => teachers.filter((row) => row.active !== false),
    [teachers]
  );

  const activeClasses = useMemo(
    () => classes.filter((row) => row.active !== false),
    [classes]
  );

  const activeSubjects = useMemo(
    () => subjects.filter((row) => row.active !== false),
    [subjects]
  );

  const activeClassSubjects = useMemo(
    () => classSubjects.filter((row) => row.active !== false),
    [classSubjects]
  );

  const activeApplicabilities = useMemo(
    () => assessmentApplicabilities.filter((row) => row.active !== false),
    [assessmentApplicabilities]
  );

  const todayAttendance = useMemo(() => {
    const today = todayISO();
    return attendance.filter((row) => row.date === today);
  }, [attendance]);

  const presentToday = useMemo(
    () => todayAttendance.filter((row) => row.status === "present").length,
    [todayAttendance]
  );

  const absentToday = useMemo(
    () => todayAttendance.filter((row) => row.status === "absent").length,
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
        route: "organizations",
        help: "Confirm the official school identity.",
      },
      {
        label: "Branch selected",
        ready: !!activeBranch,
        route: "schoolBranchSettings",
        help: "Confirm the active campus or branch.",
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
        help: "Create classes for this branch.",
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
        help: "Apply structures and grading rules to class subjects.",
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
    const ready = reportReadiness.filter((item) => item.ready).length;
    return percent(ready, reportReadiness.length);
  }, [reportReadiness]);

  const recentStudents = useMemo(() => {
    return [...activeStudents]
      .sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt))
      .slice(0, 5);
  }, [activeStudents]);

  const recentActivities = useMemo<ActivityItem[]>(() => {
    const entryActivities = assessmentEntries.map((entry) => ({
      id: `entry-${entry.id}`,
      title: `Score entered: ${entry.score}`,
      subtitle: `Student #${entry.studentId} · Subject #${entry.subjectId}`,
      icon: "📝",
      time: safeTime(entry.updatedAt),
      route: "assessmentEntriesPage",
    }));

    const paymentActivities = payments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: `Payment: ${money(Number(payment.amount || 0))}`,
      subtitle: `${payment.method || "payment"} · ${payment.date || "No date"}`,
      icon: "💳",
      time: safeTime(payment.updatedAt),
      route: "fees",
    }));

    return [...entryActivities, ...paymentActivities]
      .sort((a, b) => b.time - a.time)
      .slice(0, 6);
  }, [assessmentEntries, payments]);

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
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="sbd-page" style={{ "--sbd-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbd-state-card">
          <div className="sbd-spinner" />
          <h2>Opening branch dashboard...</h2>
          <p>Checking account, school, branch, academic context, and local branch records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sbd-page" style={{ "--sbd-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbd-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing the school branch dashboard.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="sbd-page" style={{ "--sbd-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sbd-state-card">
          <h2>Select a branch first</h2>
          <p>This dashboard works inside a school and branch context.</p>
          <button type="button" className="sbd-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="sbd-page" style={{ "--sbd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section
        className="sbd-hero"
        style={{
          background: heroImage
            ? `linear-gradient(135deg, rgba(15,23,42,.80), rgba(15,23,42,.42)), url(${heroImage}) center/cover`
            : `linear-gradient(135deg, ${primary}, #111827)`,
        }}
      >
        <div className="sbd-hero-content">
          <div className="sbd-chip-row">
            <Chip tone={isOnline ? "green" : "red"} inverse>{isOnline ? "● Online · Sync Ready" : "● Offline · Local Mode"}</Chip>
            <Chip tone="blue" inverse>{activeSchool?.name || "No school selected"}</Chip>
            <Chip tone="blue" inverse>{activeBranch?.name || "No branch selected"}</Chip>
          </div>

          <h1>{activeBranch?.name || activeSchool?.name || "School Branch Command Center"}</h1>
          <p>
            Daily operational view for academics, attendance, assessment, reports, publishing readiness, and finance.
          </p>

          <div className="sbd-hero-actions">
            <button type="button" className="sbd-white-btn" onClick={() => navigate?.("reports")}>Open Reports Studio</button>
            <button type="button" className="sbd-glass-btn" onClick={() => navigate?.("assessmentEntriesPage")}>Enter Scores</button>
            <button type="button" className="sbd-glass-btn" onClick={() => navigate?.("student-attendance")}>Take Attendance</button>
          </div>
        </div>
      </section>

      <section className="sbd-stat-grid" aria-label="Branch statistics">
        {statCards.map((item) => {
          const image = getDashboardImage(item.imageType);

          return (
            <button
              key={item.label}
              type="button"
              className={`sbd-stat-card ${image ? "with-image" : ""}`}
              onClick={() => navigate?.(item.route)}
              style={
                image
                  ? { backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.82), rgba(15,23,42,.42)), url(${image})` }
                  : undefined
              }
              title={image ? `${item.label} image loaded from branch settings` : item.label}
            >
              <div className="sbd-stat-top">
                <span>{item.label}</span>
                <b>{item.icon}</b>
              </div>
              <strong>{item.value}</strong>
            </button>
          );
        })}
      </section>

      <section className="sbd-main-grid">
        <div className="sbd-left-stack">
          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Current Academic Context</h2>
                <p>This academic session is used by reports, assessment and attendance.</p>
              </div>
              <Chip tone={readinessPercent >= 75 ? "green" : readinessPercent >= 45 ? "orange" : "red"}>
                {readinessPercent}% Publishing Ready
              </Chip>
            </div>

            <div className="sbd-context-grid">
              <MiniPanel label="Academic Structure" value={currentAcademicStructure?.name || "Not selected"} />
              <MiniPanel label="Academic Period" value={currentAcademicPeriod?.name || "Not selected"} />
              <MiniPanel label="Branch" value={activeBranch?.name || "Not selected"} />
            </div>
          </section>

          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Academic Publishing Readiness</h2>
                <p>A trusted report card needs these setup areas ready.</p>
              </div>
            </div>

            <div className="sbd-readiness-list">
              {reportReadiness.map((item) => (
                <article key={item.label} className="sbd-readiness-row">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.help}</p>
                  </div>
                  <button type="button" onClick={() => navigate?.(item.route)} className={item.ready ? "ready" : "setup"}>
                    {item.ready ? "Ready" : "Setup"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section
            className="sbd-finance-card"
            style={{
              background: bannerImage
                ? `linear-gradient(135deg, rgba(15,23,42,.82), rgba(15,23,42,.48)), url(${bannerImage}) center/cover`
                : `linear-gradient(135deg, ${primary}, #111827)`,
            }}
          >
            <div className="sbd-section-head inverse">
              <div>
                <h2>Finance Snapshot</h2>
                <p>Payments, income and expenses for this branch.</p>
              </div>
            </div>

            <div className="sbd-finance-grid">
              <FinanceBox label="Payments" value={money(finance.totalPayments)} />
              <FinanceBox label="Income" value={money(finance.totalIncome)} />
              <FinanceBox label="Expenses" value={money(finance.totalExpenses)} />
              <FinanceBox label="Balance" value={money(finance.balance)} />
            </div>
          </section>
        </div>

        <div className="sbd-right-stack">
          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Today</h2>
                <p>{todayISO()}</p>
              </div>
            </div>

            <div className="sbd-today-grid">
              <TodayBox label="Attendance Records" value={todayAttendance.length} />
              <TodayBox label="Present Rate" value={`${attendancePercent}%`} />
              <TodayBox label="Present" value={presentToday} />
              <TodayBox label="Absent" value={absentToday} />
            </div>
          </section>

          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Quick Work</h2>
                <p>Common daily tasks.</p>
              </div>
            </div>

            <div className="sbd-quick-list">
              {[
                ["Take Attendance", "Record today’s student attendance", "student-attendance", "📅"],
                ["Enter Scores", "Capture assessment item scores", "assessmentEntriesPage", "📝"],
                ["Generate Reports", "Print report cards and broadsheets", "reports", "📄"],
                ["Class Subjects", "Manage class academic delivery", "classSubjects", "📖"],
                ["Assessment Setup", "Configure assessment applicability", "assessmentApplicability", "🎯"],
              ].map(([name, desc, route, icon]) => (
                <button key={name} type="button" onClick={() => navigate?.(String(route))}>
                  <span>{icon}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{desc}</small>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Recent Students</h2>
                <p>Recently updated student records.</p>
              </div>
              <button type="button" className="sbd-link-btn" onClick={() => navigate?.("students")}>View all</button>
            </div>

            <div className="sbd-person-list">
              {recentStudents.map((student) => (
                <button key={student.id} type="button" onClick={() => navigate?.("students")}>
                  <div
                    className="sbd-person-avatar"
                    style={{
                      background: student.photo
                        ? `url(${student.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, #111827)`,
                    }}
                  >
                    {!student.photo && student.fullName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{student.fullName}</strong>
                    <small>{student.admissionNumber || "No admission number"}</small>
                  </div>
                </button>
              ))}

              {!recentStudents.length && <p className="sbd-muted-empty">No students yet.</p>}
            </div>
          </section>

          <section className="sbd-card">
            <div className="sbd-section-head">
              <div>
                <h2>Recent Activity</h2>
                <p>Latest scores and payments.</p>
              </div>
            </div>

            <div className="sbd-activity-list">
              {recentActivities.map((item) => (
                <button key={item.id} type="button" onClick={() => navigate?.(item.route)}>
                  <span>{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                </button>
              ))}

              {!recentActivities.length && <p className="sbd-muted-empty">No recent activity yet.</p>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Chip({ children, tone = "gray", inverse = false }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange"; inverse?: boolean }) {
  return <span className={`sbd-chip ${tone} ${inverse ? "inverse" : ""}`}>{children}</span>;
}

function MiniPanel({ label, value }: { label: string; value: string }) {
  return (
    <article className="sbd-mini-panel">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FinanceBox({ label, value }: { label: string; value: string }) {
  return (
    <article className="sbd-finance-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TodayBox({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="sbd-today-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes sbdSpin { to { transform: rotate(360deg); } }

.sbd-page {
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
.sbd-page *, .sbd-page *::before, .sbd-page *::after { box-sizing: border-box; }
.sbd-page button, .sbd-page input, .sbd-page select, .sbd-page textarea { font: inherit; max-width: 100%; }
.sbd-page button { -webkit-tap-highlight-color: transparent; }

.sbd-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.sbd-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.sbd-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.sbd-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--sbd-primary) 18%, transparent); border-top-color: var(--sbd-primary); animation: sbdSpin .8s linear infinite; }
.sbd-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sbd-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.sbd-hero {
  position: relative;
  min-height: 196px;
  display: flex;
  align-items: flex-end;
  border-radius: 28px;
  padding: 16px;
  color: #fff;
  box-shadow: 0 20px 50px rgba(15, 23, 42, .18);
  overflow: hidden;
}
.sbd-hero-content { position: relative; z-index: 1; min-width: 0; width: 100%; }
.sbd-hero h1 {
  max-width: 860px;
  margin: 12px 0 0;
  font-size: clamp(26px, 8vw, 40px);
  line-height: 1.04;
  font-weight: 1000;
  letter-spacing: -.07em;
  overflow-wrap: anywhere;
}
.sbd-hero p {
  max-width: 760px;
  margin: 10px 0 0;
  opacity: .92;
  line-height: 1.58;
  font-size: 13px;
}
.sbd-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.sbd-white-btn, .sbd-glass-btn {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.sbd-white-btn { border: 0; background: #fff; color: #111827; }
.sbd-glass-btn { border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.14); color: #fff; }

.sbd-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.sbd-chip {
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
.sbd-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.sbd-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.sbd-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.sbd-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.sbd-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.sbd-chip.inverse { background: rgba(255,255,255,.18); color: #fff; }

.sbd-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.sbd-stat-card {
  min-width: 0;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(148, 163, 184, .2);
  border-radius: 23px;
  padding: 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  background-position: center;
  background-size: cover;
}
.sbd-stat-card.with-image { color: #fff; border-color: rgba(255,255,255,.16); box-shadow: 0 16px 34px rgba(15,23,42,.16); }
.sbd-stat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sbd-stat-top span, .sbd-stat-card strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbd-stat-top span { color: var(--muted, #64748b); font-size: 12px; font-weight: 950; }
.sbd-stat-card.with-image .sbd-stat-top span { color: rgba(255,255,255,.92); }
.sbd-stat-top b { font-size: 20px; flex: 0 0 auto; }
.sbd-stat-card strong { margin-top: 10px; font-size: 28px; font-weight: 1000; letter-spacing: -.05em; }

.sbd-main-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 10px; }
.sbd-left-stack, .sbd-right-stack { min-width: 0; display: grid; gap: 10px; align-content: start; }
.sbd-card, .sbd-finance-card {
  min-width: 0;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
  padding: 13px;
}
.sbd-finance-card { color: #fff; background-size: cover; background-position: center; box-shadow: 0 18px 44px rgba(15,23,42,.18); }
.sbd-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.sbd-section-head h2 { margin: 0; font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.sbd-section-head p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.sbd-section-head.inverse p { color: rgba(255,255,255,.86); }
.sbd-context-grid, .sbd-finance-grid, .sbd-today-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 12px; }
.sbd-mini-panel, .sbd-finance-box, .sbd-today-box {
  min-width: 0;
  padding: 11px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}
.sbd-finance-box { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.18); }
.sbd-mini-panel span, .sbd-mini-panel strong,
.sbd-finance-box span, .sbd-finance-box strong,
.sbd-today-box span, .sbd-today-box strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sbd-mini-panel span, .sbd-finance-box span, .sbd-today-box span { color: var(--muted, #64748b); font-size: 11px; font-weight: 900; }
.sbd-finance-box span { color: rgba(255,255,255,.8); }
.sbd-mini-panel strong, .sbd-finance-box strong, .sbd-today-box strong { margin-top: 6px; font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.sbd-finance-box strong { color: #fff; }

.sbd-readiness-list, .sbd-quick-list, .sbd-person-list, .sbd-activity-list { display: grid; gap: 8px; margin-top: 12px; }
.sbd-readiness-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
}
.sbd-readiness-row h3, .sbd-readiness-row p { margin: 0; display: block; overflow: hidden; text-overflow: ellipsis; }
.sbd-readiness-row h3 { font-size: 13px; font-weight: 1000; }
.sbd-readiness-row p { margin-top: 3px; color: var(--muted, #64748b); font-size: 11px; font-weight: 750; line-height: 1.45; }
.sbd-readiness-row button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 1000;
  cursor: pointer;
}
.sbd-readiness-row button.ready { background: rgba(34,197,94,.12); color: #16a34a; }
.sbd-readiness-row button.setup { background: rgba(245,158,11,.14); color: #b45309; }

.sbd-quick-list button, .sbd-person-list button, .sbd-activity-list button {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 18px;
  padding: 10px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  text-align: left;
  cursor: pointer;
}
.sbd-quick-list button > span, .sbd-activity-list button > span {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sbd-primary) 12%, #fff);
}
.sbd-person-avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: #fff;
  font-weight: 1000;
}
.sbd-quick-list div, .sbd-person-list div, .sbd-activity-list div { min-width: 0; }
.sbd-quick-list strong, .sbd-quick-list small,
.sbd-person-list strong, .sbd-person-list small,
.sbd-activity-list strong, .sbd-activity-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sbd-quick-list strong, .sbd-person-list strong, .sbd-activity-list strong { font-size: 13px; font-weight: 1000; }
.sbd-quick-list small, .sbd-person-list small, .sbd-activity-list small { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 750; }
.sbd-link-btn { border: 0; background: transparent; color: var(--sbd-primary); font-size: 12px; font-weight: 1000; cursor: pointer; }
.sbd-muted-empty { margin: 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

@media (min-width: 560px) {
  .sbd-page { padding: 10px; }
  .sbd-context-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sbd-finance-grid, .sbd-today-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 760px) {
  .sbd-page { padding: 12px; }
  .sbd-stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sbd-main-grid { gap: 12px; }
}

@media (min-width: 1100px) {
  .sbd-page { padding: 16px; }
  .sbd-hero { min-height: 220px; padding: 22px; }
  .sbd-stat-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 10px; }
  .sbd-main-grid { grid-template-columns: minmax(0, 1.32fr) minmax(320px, .68fr); gap: 14px; }
  .sbd-left-stack, .sbd-right-stack { gap: 14px; }
  .sbd-card, .sbd-finance-card { padding: 16px; }
  .sbd-context-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sbd-finance-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 420px) {
  .sbd-page { padding: 6px; }
  .sbd-hero { border-radius: 22px; padding: 12px; min-height: 190px; }
  .sbd-hero-actions { display: grid; grid-template-columns: 1fr; }
  .sbd-white-btn, .sbd-glass-btn { width: 100%; }
  .sbd-stat-grid { grid-template-columns: 1fr; gap: 7px; }
  .sbd-stat-card { min-height: 98px; border-radius: 20px; padding: 12px; }
  .sbd-card, .sbd-finance-card { border-radius: 20px; padding: 11px; }
  .sbd-readiness-row { grid-template-columns: 1fr; }
  .sbd-readiness-row button { justify-self: start; }
  .sbd-chip { font-size: 10px; }
}
`;
