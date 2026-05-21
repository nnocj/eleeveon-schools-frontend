"use client";

/**
 * app/dashboard/page.tsx
 * ---------------------------------------------------------
 * SECURE SCHOOL-BRANCH DASHBOARD SHELL
 * ---------------------------------------------------------
 *
 * Rules:
 * - User must be signed in.
 * - accountId is required.
 * - activeSchoolId and activeBranchId are required.
 * - If account exists but school/branch context is missing, go to /account.
 * - WhatsApp-like compact app shell.
 * - Mobile-first layout.
 * - School logo/name returns to dashboard home.
 * - Desktop close button hides the sidebar into hamburger mode.
 * - Sidebar can be resized by dragging its right edge on desktop.
 * - No horizontal page scrollbar: every tab is contained inside the shell.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";
import SyncStatusStrip from "../components/SyncStatusStrip";
import { db } from "../lib/db";

// ================= MODULES =================

import Organizations from "./organizations";
import Students from "./students";
import Teachers from "./teachers";
import Parents from "./parents";
import Classes from "./classes";
import Subjects from "./subjects";
import StudentEnrollmentsPage from "./studentEnrollment";
import Assignments from "./assignments";
import AcademicAndAssessmentConfiguration from "./academicAndAssessmentConfiguration";
import AssessmentApplicabilityPage from "./assessmentApplicability";
import AssessmentEntriesPage from "./assessmentEntry";
import ProgramsPage from "./programs";
import CurriculumManagement from "./curriculumManagement";
import ClassSubjectPage from "./classSubjects";
import CurriculumSubjects from "./curriculumSubjects";
import CurriculumPathways from "./curriculumPathways";
import SubjectPrerequisites from "./subjectPrerequisites";
import StudentCurriculumPage from "./studentCurriculum";
import CourseOutline from "./courseOutline";
import StudentRegistration from "./studentRegistration";
import AcademicProgress from "./academicProgress";
import Reports from "./reports/Report";
import ReportRemarks from "./reportRemarks";
import Fees from "./fees";
import Income from "./incomes";
import Expenses from "./expenses";
import PromotionPage from "./promotion";
import CumulativeRecordsPage from "./cumulativeRecords";
import StudentAttendance from "./studentAttendance";
import TeacherAttendance from "./teacherAttendance";
import SchoolBranchSettings from "./schoolBranchSettings";
import SchoolBranchDashboard from "./schoolBranchDashboard";

// ================= ROUTES =================

const ROUTES: Record<string, React.ComponentType<any>> = {
  schoolBranchDashboard: SchoolBranchDashboard,
  students: Students,
  teachers: Teachers,
  parents: Parents,
  classes: Classes,
  "student-attendance": StudentAttendance,
  "teacher-attendance": TeacherAttendance,
  assessmentEntriesPage: AssessmentEntriesPage,
  fees: Fees,
  income: Income,
  expenses: Expenses,

  studentEnrollments: StudentEnrollmentsPage,
  studentRegistration: StudentRegistration,
  academicProgress: AcademicProgress,
  reports: Reports,
  reportRemarks: ReportRemarks,
  promotion: PromotionPage,
  cumulativeRecords: CumulativeRecordsPage,

  subjects: Subjects,
  classSubjects: ClassSubjectPage,
  assignments: Assignments,
  courseOutline: CourseOutline,
  studentCurriculum: StudentCurriculumPage,

  organizations: Organizations,
  programs: ProgramsPage,
  curriculumManagement: CurriculumManagement,
  curriculumSubjects: CurriculumSubjects,
  curriculumPathways: CurriculumPathways,
  subjectPrerequisites: SubjectPrerequisites,
  academicAndAssessmentConfiguration: AcademicAndAssessmentConfiguration,
  assessmentApplicability: AssessmentApplicabilityPage,
  schoolBranchSettings: SchoolBranchSettings,
};

// ================= APP NAV GROUPS =================

const NAV_SECTIONS = [
  {
    title: "Administration",
    defaultOpen: true,
    items: [
      { key: "schoolBranchDashboard", label: "Dashboard", icon: "🏠" },

      { key: "studentRegistration", label: "Registration", icon: "📝" },

      { key: "studentEnrollments", label: "Enrollments", icon: "📋" },

      { key: "parents", label: "Parents", icon: "👨‍👩‍👧" },

      { key: "students", label: "Student Organization", icon: "🧑‍🎓" },

      { key: "teacher-attendance", label: "Teacher Attendance", icon: "🕒" },
    ],
  },

  {
    title: "Teaching & Classroom",
    defaultOpen: true,
    items: [
      { key: "student-attendance", label: "Student Attendance", icon: "📅" },

      {
        key: "assessmentEntriesPage",
        label: "Assessment Entry",
        icon: "📝",
      },
    ],
  },

  {
    title: "Finance",
    defaultOpen: false,
    items: [
      { key: "fees", label: "Fees", icon: "💳" },
      { key: "income", label: "Income", icon: "📈" },
      { key: "expenses", label: "Expenses", icon: "📉" },
    ],
  },

  {
    title: "Academic Records",
    defaultOpen: false,
    items: [
      { key: "academicProgress", label: "Academic Progress", icon: "📊" },
      { key: "reports", label: "Reports", icon: "📄" },
      { key: "reportRemarks", label: "Report Remarks", icon: "💬" },
      { key: "promotion", label: "Promotion", icon: "🚀" },
      { key: "cumulativeRecords", label: "Cumulative Records", icon: "📚" },
    ],
  },

  {
    title: "Teaching Setup",
    defaultOpen: false,
    items: [
      { key: "teachers", label: "Teachers", icon: "👨‍🏫" },
      { key: "assignments", label: "Assignments", icon: "🧩" },
      { key: "courseOutline", label: "Course Outline", icon: "📖" },
      { key: "studentCurriculum", label: "Student Curriculum", icon: "🎓" },
    ],
  },

  {
    title: "Setup",
    defaultOpen: false,
    items: [
      { key: "organizations", label: "Organizations", icon: "🏛" },
      { key: "programs", label: "Programs", icon: "🎓" },
      { key: "classes", label: "Classes", icon: "🏷" },

      { key: "subjects", label: "Subjects", icon: "📘" },

      {
        key: "curriculumManagement",
        label: "Curriculum Management",
        icon: "📚",
      },

      {
        key: "curriculumSubjects",
        label: "Curriculum Subjects",
        icon: "📖",
      },

      {
        key: "curriculumPathways",
        label: "Curriculum Pathways",
        icon: "🗺",
      },

      {
        key: "subjectPrerequisites",
        label: "Subject Prerequisites",
        icon: "🔗",
      },

      {
        key: "classSubjects",
        label: "Class Subjects",
        icon: "📖",
      },

      {
        key: "academicAndAssessmentConfiguration",
        label: "Academic & Assessment Config",
        icon: "🎯",
      },

      {
        key: "assessmentApplicability",
        label: "Assessment Applicability",
        icon: "📚",
      },

      {
        key: "schoolBranchSettings",
        label: "Branch Settings",
        icon: "⚙",
      },
    ],
  },
];

const LABELS: Record<string, string> = {};
const GROUPS: Record<string, string> = {};

NAV_SECTIONS.forEach((section) => {
  section.items.forEach((item) => {
    LABELS[item.key] = item.label;
    GROUPS[item.key] = section.title;
  });
});

export default function Dashboard() {
  const router = useRouter();
  const { initialSyncDone, initialSyncing } = useSyncBootstrap();

  

  const {
    accountId,
    user,
    account,
    logout,
    loading: accountLoading,
    authenticated,
  } = useAccount();


  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchoolId,
    activeSchool,
    schools,
    setActiveSchoolId,

    activeBranchId,
    activeBranch,
    branches,
    setActiveBranchId,

    loading: contextLoading,
  } = useActiveBranch();


  // ======================================================
  // FILE 5: UPDATE app/dashboard/page.tsx REDIRECT GATE
  // ======================================================

  /*Then update the redirect effect so it DOES NOT redirect to /account
  * while first sync is still running.
  */

  useEffect(() => {
    if (accountLoading || contextLoading || initialSyncing) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (initialSyncDone && (!activeSchoolId || !activeBranchId)) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    initialSyncing,
    initialSyncDone,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [tab, setTab] = useState("schoolBranchDashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [contextOpen, setContextOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [schoolCount, setSchoolCount] = useState(0);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    NAV_SECTIONS.reduce((acc, section) => {
      acc[section.title] = section.defaultOpen;
      return acc;
    }, {} as Record<string, boolean>)
  );

  
  useEffect(() => {
    if (settings?.fontFamily) {
      document.documentElement.style.setProperty("--font-family", settings.fontFamily);
    }

    if (settings?.primaryColor) {
      document.documentElement.style.setProperty("--primary-color", settings.primaryColor);
    }
  }, [settings?.fontFamily, settings?.primaryColor]);

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
    const loadCount = async () => {
      if (!accountId) return;

      const rows = await db.schools.toArray();

      setSchoolCount(
        rows.filter((row) => row.accountId === accountId && !row.isDeleted).length
      );
    };

    loadCount();
  }, [accountId, activeSchoolId]);

  const ActiveComponent = useMemo(() => {
    return ROUTES[tab] ?? SchoolBranchDashboard;
  }, [tab]);

  const activeLabel = LABELS[tab] ?? "Dashboard";
  const activeGroup = GROUPS[tab] ?? "Daily Work";
  /** Then update your checking const:
   * This is to ensute that everything is synced before the page opens
  */
  const checking = accountLoading || contextLoading || settingsLoading || initialSyncing;


  const navigate = (key: string) => {
    setTab(key);
    setSidebarOpen(false);
    setMoreOpen(false);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openDashboardHome = () => {
    navigate("schoolBranchDashboard");
  };

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSidebarHidden(true);
  };

  const openSidebar = () => {
    setSidebarHidden(false);
    setSidebarOpen(true);
  };

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(380, Math.max(240, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(nextWidth);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [sidebarWidth]);

  const handleSchoolChange = async (value: string) => {
    const nextId = value ? Number(value) : null;
    await setActiveSchoolId(nextId);
  };

  const handleBranchChange = async (value: string) => {
    const nextId = value ? Number(value) : null;
    await setActiveBranchId(nextId);
  };

  if (checking) {
    return (
      <main style={safeStyles.centerPage}>
        <section style={safeStyles.loadingCard}>
          <div style={safeStyles.spinner} />
      
          <h2 style={safeStyles.loadingTitle}>Opening dashboard...</h2>
          <p style={safeStyles.mutedText}>Checking account, school, and branch context.</p>
          <p style={safeStyles.mutedText}>Syncing account data and checking school branch context.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main style={safeStyles.centerPage}>
        <section style={safeStyles.loadingCard}>
          <h2 style={safeStyles.loadingTitle}>Redirecting to login...</h2>
          <p style={safeStyles.mutedText}>You must sign in to continue.</p>
        </section>
      </main>
    );
  }

  if (!activeSchoolId || !activeBranchId) {
    return (
      <main style={safeStyles.centerPage}>
        <section style={safeStyles.loadingCard}>
          <h2 style={safeStyles.loadingTitle}>School branch required</h2>
          <p style={safeStyles.mutedText}>Redirecting you to account setup.</p>
        </section>
      </main>
    );
  }

  return (
    <main
      style={
        {
          ...safeStyles.page,
          "--dashboard-primary": primary,
          "--sidebar-width": `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {(sidebarOpen || contextOpen) && (
        <button
          aria-label="Close drawer"
          className="app-overlay"
          onClick={() => {
            setSidebarOpen(false);
            setContextOpen(false);
            setMoreOpen(false);
          }}
        />
      )}

      <aside className={`app-sidebar ${sidebarOpen ? "open" : ""} ${sidebarHidden ? "hidden" : ""}`}>
        <div className="sidebar-head">
          <button
            type="button"
            className="school-home"
            onClick={openDashboardHome}
            title="Go to dashboard"
          >
            <span className="avatar" style={{ background: primary }}>
              {activeSchool?.name?.[0] || "S"}
            </span>

            <span className="sidebar-title">
              <strong>{activeSchool?.name || "School"}</strong>
              <span>{activeBranch?.name || "Branch"}</span>
            </span>
          </button>
        </div>

        <nav className="nav-list">
          {NAV_SECTIONS.map((section) => {
            const open = openSections[section.title];

            return (
              <section key={section.title} className="nav-section">
                <button
                  type="button"
                  className="nav-section-title"
                  onClick={() => toggleSection(section.title)}
                >
                  <span>{section.title}</span>
                  <b>{open ? "−" : "+"}</b>
                </button>

                {open && (
                  <div className="nav-items">
                    {section.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => navigate(item.key)}
                        className={`nav-item ${tab === item.key ? "active" : ""}`}
                      >
                        <span>{item.icon}</span>
                        <strong>{item.label}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <button
          type="button"
          className="sidebar-resize-handle"
          onMouseDown={handleSidebarResizeStart}
          aria-label="Resize sidebar"
        />
      </aside>

      <aside className={`context-drawer ${contextOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <p>School Context</p>
            <h2>Switch Workspace</h2>
          </div>

          <button className="icon-btn" onClick={() => setContextOpen(false)} type="button">
            ✕
          </button>
        </div>

        <div className="drawer-card">
          <label>School</label>
          <select
            value={activeSchoolId || ""}
            onChange={(e) => handleSchoolChange(e.target.value)}
            disabled={!schools.length}
          >
            <option value="">{schools.length ? "Select school" : "No school found"}</option>

            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        <div className="drawer-card">
          <label>Branch</label>
          <select
            value={activeBranchId || ""}
            onChange={(e) => handleBranchChange(e.target.value)}
            disabled={!activeSchoolId || !branches.length}
          >
            <option value="">
              {!activeSchoolId
                ? "Select school first"
                : branches.length
                ? "Select branch"
                : "No branch under school"}
            </option>

            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="drawer-info">
          <div>
            <strong>{schoolCount}</strong>
            <span>School profile(s)</span>
          </div>

          <div>
            <strong>{isOnline ? "Online" : "Offline"}</strong>
            <span>{isOnline ? "Sync ready" : "Local mode"}</span>
          </div>
        </div>

        <button className="drawer-action" type="button" onClick={() => router.push("/account")}>
          Go to Account Setup
        </button>

        <button className="drawer-danger" type="button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className={`app-main ${sidebarHidden ? "full" : ""}`}>
        <header className="app-header">
          <button
            className="icon-btn primary"
            onClick={() => {
              if (sidebarHidden) {
                openSidebar();
              } else {
                closeSidebar();
              }
            }}
            type="button"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          <div className="header-title">
            <strong>{activeLabel}</strong>
            <span>
              {activeGroup} · {activeBranch?.name || "Branch"}
            </span>
          </div>

          <div className="more-wrap">
            <button
              className="icon-btn"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label="More actions"
              type="button"
            >
              ⋮
            </button>

            {moreOpen && (
              <div className="more-menu">
                <button
                  type="button"
                  onClick={() => {
                    setContextOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  Switch context
                </button>
                <button type="button" onClick={() => router.push("/account")}>
                  Account setup
                </button>
                <button type="button" onClick={() => navigate("schoolBranchSettings")}>
                  Branch settings
                </button>
                <button type="button" onClick={logout} className="danger">
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <section style={{ marginBottom: 10 }}>
                        <SyncStatusStrip />
                      </section>
        <section className="app-content">
          <div className="app-content-inner">
            <ActiveComponent navigate={navigate} />
          </div>
        </section>
      </section>
    </main>
  );
}

const safeStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    background: "var(--bg, #f8fafc)",
    color: "var(--text, #0f172a)",
    fontFamily: "var(--font-family, system-ui)",
  },

  centerPage: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "var(--bg, #f8fafc)",
    color: "var(--text, #0f172a)",
    fontFamily: "var(--font-family, system-ui)",
  },

  loadingCard: {
    width: "min(430px, 100%)",
    maxWidth: "100%",
    borderRadius: 26,
    padding: 24,
    background: "var(--card, #ffffff)",
    border: "1px solid rgba(148,163,184,0.25)",
    boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
    textAlign: "center",
    overflow: "hidden",
  },

  loadingTitle: {
    margin: "12px 0 6px",
    fontSize: 20,
    fontWeight: 950,
  },

  mutedText: {
    margin: 0,
    color: "var(--muted, #64748b)",
    fontSize: 14,
    lineHeight: 1.6,
  },

  spinner: {
    width: 36,
    height: 36,
    margin: "0 auto",
    borderRadius: "50%",
    border: "4px solid rgba(37,99,235,0.18)",
    borderTopColor: "var(--dashboard-primary, #2563eb)",
    animation: "spin 0.8s linear infinite",
  },
};

const css = `
@keyframes spin {
  to { transform: rotate(360deg); }
}

html,
body {
  max-width: 100%;
  overflow-x: hidden;
}

* {
  box-sizing: border-box;
}

.app-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  border: 0;
  background: rgba(15,23,42,.5);
}

.app-sidebar,
.context-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 50;
  height: 100dvh;
  max-width: 100vw;
  background: #fff;
  color: #0f172a;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  box-shadow: 0 24px 70px rgba(15,23,42,.22);
  transition: transform .22s ease, width .22s ease;
}

.app-sidebar {
  left: 0;
  width: min(88vw, 330px);
  transform: translateX(-105%);
  padding: 12px;
}

.app-sidebar.open {
  transform: translateX(0);
}

.context-drawer {
  right: 0;
  width: min(90vw, 370px);
  transform: translateX(105%);
  padding: 16px;
}

.context-drawer.open {
  transform: translateX(0);
}

.sidebar-head,
.drawer-head,
.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.sidebar-head {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #fff;
  padding: 4px 0 10px;
}

.school-home {
  min-width: 0;
  max-width: 100%;
  flex: 1;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}

.school-home:hover .sidebar-title strong {
  color: var(--dashboard-primary);
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 15px;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 950;
  flex: 0 0 auto;
}

.sidebar-title,
.header-title {
  min-width: 0;
  flex: 1;
}

.sidebar-title strong,
.sidebar-title span,
.header-title strong,
.header-title span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-title strong,
.header-title strong {
  font-size: 14px;
  font-weight: 950;
  line-height: 1.1;
}

.sidebar-title span,
.header-title span {
  margin-top: 1px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.1;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(148,163,184,.25);
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  font-size: 19px;
  font-weight: 950;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.icon-btn.primary {
  background: var(--dashboard-primary);
  color: #fff;
  border-color: transparent;
}

.icon-btn.ghost {
  background: rgba(148,163,184,.12);
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 24px;
  max-width: 100%;
  overflow-x: hidden;
}

.nav-section {
  border-radius: 20px;
  background: #f8fafc;
  border: 1px solid rgba(148,163,184,.18);
  overflow: hidden;
  max-width: 100%;
}

.nav-section-title {
  width: 100%;
  min-height: 40px;
  border: 0;
  background: transparent;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #334155;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
  cursor: pointer;
}

.nav-section-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-items {
  display: grid;
  gap: 4px;
  padding: 5px;
  max-width: 100%;
}

.nav-item {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  padding: 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.nav-item.active {
  background: var(--dashboard-primary);
  color: #fff;
}

.nav-item span {
  width: 24px;
  flex: 0 0 auto;
  font-size: 17px;
  text-align: center;
}

.nav-item strong {
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-resize-handle {
  display: none;
}

.app-main {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  transition: margin-left .22s ease, width .22s ease;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 48px;
  max-width: 100%;
  padding: 5px 14px;
  background: color-mix(in srgb, var(--bg, #f8fafc) 93%, white);
  border-bottom: 1px solid rgba(148,163,184,.18);
  backdrop-filter: blur(14px);
  overflow: visible;
}

.more-wrap {
  position: relative;
  flex: 0 0 auto;
}

.more-menu {
  position: absolute;
  top: 42px;
  right: 0;
  width: min(230px, calc(100vw - 18px));
  border-radius: 18px;
  padding: 8px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.22);
  box-shadow: 0 24px 60px rgba(15,23,42,.18);
  display: grid;
  gap: 4px;
  z-index: 60;
  overflow: hidden;
}

.more-menu button {
  min-height: 40px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  text-align: left;
  padding: 0 12px;
  font-weight: 850;
  cursor: pointer;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-menu button:hover {
  background: #f1f5f9;
}

.more-menu .danger {
  color: #dc2626;
}

.app-content {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.app-content-inner {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.app-content *,
.app-content *::before,
.app-content *::after {
  max-width: 100%;
  box-sizing: border-box;
}

.app-content button,
.app-content input,
.app-content select,
.app-content textarea {
  font: inherit;
  max-width: 100%;
}

.app-content img,
.app-content svg,
.app-content canvas,
.app-content video {
  max-width: 100%;
  height: auto;
}

.app-content table {
  max-width: 100%;
}

.drawer-head {
  justify-content: space-between;
  margin-bottom: 16px;
}

.drawer-head div {
  min-width: 0;
}

.drawer-head p {
  margin: 0;
  color: var(--dashboard-primary);
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  letter-spacing: -.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-card {
  border-radius: 22px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid rgba(148,163,184,.2);
  margin-bottom: 12px;
  max-width: 100%;
  overflow: hidden;
}

.drawer-card label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #64748b;
  font-weight: 900;
}

.drawer-card select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid rgba(148,163,184,.28);
  border-radius: 15px;
  padding: 0 12px;
  background: #fff;
  color: #0f172a;
  outline: none;
}

.drawer-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 14px 0;
  max-width: 100%;
}

.drawer-info div {
  min-width: 0;
  border-radius: 20px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid rgba(148,163,184,.18);
  overflow: hidden;
}

.drawer-info strong,
.drawer-info span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-info strong {
  font-size: 18px;
  font-weight: 950;
}

.drawer-info span {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.drawer-action,
.drawer-danger {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  font-weight: 950;
  cursor: pointer;
  margin-top: 8px;
}

.drawer-action {
  background: var(--dashboard-primary);
  color: #fff;
}

.drawer-danger {
  background: rgba(239,68,68,.1);
  color: #dc2626;
}

@media (min-width: 980px) {
  .app-overlay {
    display: none;
  }

  .app-sidebar {
    transform: none;
    width: var(--sidebar-width, 300px);
    min-width: 240px;
    max-width: 380px;
    box-shadow: none;
    border-right: 1px solid rgba(148,163,184,.18);
  }

  .app-sidebar.hidden {
    transform: translateX(-110%);
    pointer-events: none;
  }

  .app-sidebar.hidden.open {
    transform: none;
    pointer-events: auto;
  }

  .app-main {
    margin-left: var(--sidebar-width, 300px);
    width: calc(100% - var(--sidebar-width, 300px));
    max-width: calc(100% - var(--sidebar-width, 300px));
  }

  .app-main.full {
    margin-left: 0;
    width: 100%;
    max-width: 100%;
  }

  .app-content {
    padding: 12px;
  }

  .sidebar-resize-handle {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    width: 8px;
    height: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    z-index: 4;
  }

  .sidebar-resize-handle:hover {
    background: rgba(37,99,235,.16);
  }
}

@media (max-width: 420px) {
  .app-content {
    padding: 6px;
  }

  .app-header {
    min-height: 46px;
    padding: 5px 6px;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 13px;
    font-size: 18px;
  }

  .header-title strong {
    font-size: 13px;
  }

  .header-title span {
    font-size: 10px;
  }

  .app-sidebar {
    width: min(92vw, 320px);
  }

  .context-drawer {
    width: min(94vw, 370px);
    padding: 12px;
  }

  .drawer-info {
    grid-template-columns: 1fr;
  }

  .nav-item {
    min-height: 43px;
  }
}
`;
