"use client";

/**
 * app/dashboard/page.tsx
 * ---------------------------------------------------------
 * SCHOOL-FIRST DASHBOARD SHELL
 * ---------------------------------------------------------
 *
 * School -> Branch -> Academic Structure -> Period -> ClassSubject
 *
 * IMPORTANT FIX
 * ---------------------------------------------------------
 * Sidebar now has TWO visible context switchers:
 * 1. School selector
 * 2. Branch selector filtered by selected school
 *
 * This allows intelligent switching without deactivating branches.
 */

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { useActiveBranch } from "../context/active-branch-context";

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
//import Promotion from "./promotionNew";
import StudentAttendance from "./studentAttendance";
import TeacherAttendance from "./teacherAttendance";
import SchoolBranchSettings from "./schoolBranchSettings";
import SchoolBranchDashboard from "./schoolBranchDashboard";

// ================= STYLES =================

import {
  layout,
  sidebarStyles,
  sidebarHeaderStyles,
} from "./styles/dashboard.styles";

// ================= ROUTES =================

const ROUTES: Record<string, any> = {
  schoolBranchDashboard: SchoolBranchDashboard,

  organizations: Organizations,

  classes: Classes,
  subjects: Subjects,
  classSubjects: ClassSubjectPage,
  assignments: Assignments,

  students: Students,
  teachers: Teachers,
  parents: Parents,

  programs: ProgramsPage,
  curriculumManagement: CurriculumManagement,
  curriculumSubjects: CurriculumSubjects,
  curriculumPathways: CurriculumPathways,
  subjectPrerequisites: SubjectPrerequisites,
  studentCurriculum: StudentCurriculumPage,
  courseOutline: CourseOutline,
  studentRegistration: StudentRegistration,
  studentEnrollments: StudentEnrollmentsPage,

  academicProgress: AcademicProgress,
  academicAndAssessmentConfiguration: AcademicAndAssessmentConfiguration,
  assessmentApplicability: AssessmentApplicabilityPage,
  assessmentEntriesPage: AssessmentEntriesPage,
  //promotion: Promotion,
  reportRemarks: ReportRemarks,
  reports: Reports,

  "student-attendance": StudentAttendance,
  "teacher-attendance": TeacherAttendance,

  fees: Fees,
  income: Income,
  expenses: Expenses,

  schoolBranchSettings: SchoolBranchSettings,
};

// ================= SIDEBAR GROUPS =================

const NAV_SECTIONS = [
  {
    title: "Start",
    items: [
      { key: "schoolBranchDashboard", label: "School Branch Dashboard", icon: "🏠" }
    ],
  },
  {
    title: "Institution",
    items: [
      { key: "organizations", label: "Organizations", icon: "🏛" },
    ],
  },
  {
    title: "Academic Delivery",
    items: [
      { key: "classes", label: "Classes", icon: "🏷" },
      { key: "subjects", label: "Subjects", icon: "📘" },
      { key: "programs", label: "Programs", icon: "🎓" },
      { key: "classSubjects", label: "Class Subjects", icon: "📖" },
      { key: "assignments", label: "Assignments", icon: "🧩" },
    ],
  },
  {
    title: "People",
    items: [
      { key: "students", label: "Students", icon: "🧑‍🎓" },
      { key: "teachers", label: "Teachers", icon: "👨‍🏫" },
      { key: "parents", label: "Parents", icon: "👨‍👩‍👧" },
    ],
  },
  {
    title: "Curriculum",
    items: [
      { key: "curriculumManagement", label: "Curriculum Management", icon: "📚" },
      { key: "curriculumSubjects", label: "Curriculum Subjects", icon: "📖" },
      { key: "curriculumPathways", label: "Curriculum Pathways", icon: "🗺" },
      { key: "subjectPrerequisites", label: "Subject Prerequisites", icon: "🔗" },
      { key: "studentCurriculum", label: "Student Curriculum", icon: "🎓" },
      { key: "courseOutline", label: "Course Outline", icon: "📖" },
      { key: "studentRegistration", label: "Student Registration", icon: "📝" },
      { key: "studentEnrollments", label: "Student Enrollments", icon: "📋" },
    ],
  },
  {
    title: "Assessment & Publishing",
    items: [
      { key: "academicProgress", label: "Academic Progress", icon: "📊" },
      {
        key: "academicAndAssessmentConfiguration",
        label: "Academic & Assessment Config",
        icon: "🎯",
      },
      { key: "assessmentApplicability", label: "Assessment Applicability", icon: "📚" },
      { key: "assessmentEntriesPage", label: "Assessment Entry", icon: "📝" },
      { key: "reports", label: "Reports", icon: "📄" },
      { key: "reportRemarks", label: "Report Remarks", icon: "💬" },
     // { key: "promotion", label: "Promotion", icon: "🚀" },
      
    ],
  },
  {
    title: "Attendance",
    items: [
      { key: "student-attendance", label: "Student Attendance", icon: "📅" },
      { key: "teacher-attendance", label: "Teacher Attendance", icon: "🕒" },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "fees", label: "Fees", icon: "💳" },
      { key: "income", label: "Income", icon: "📈" },
      { key: "expenses", label: "Expenses", icon: "📉" },
    ],
  },
  {
    title: "Administration",
    items: [{ key: "schoolBranchSettings", label: "School Branch Settings", icon: "⚙" }],
  },
];

// ================= LABELS =================

const LABELS: Record<string, string> = {};
const GROUPS: Record<string, string> = {};

NAV_SECTIONS.forEach(section => {
  section.items.forEach(item => {
    LABELS[item.key] = item.label;
    GROUPS[item.key] = section.title;
  });
});

// ======================================================
// COMPONENT
// ======================================================

export default function Dashboard() {
  const [tab, setTab] = useState<string>("schools");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [schoolCount, setSchoolCount] = useState(0);

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

  // ================= LOAD SETTINGS + SCHOOL COUNT =================

  useEffect(() => {
    const load = async () => {
      const [settingRows, schoolRows] = await Promise.all([
        db.schoolBranchSettings.toArray(),
        db.schools.toArray(),
      ]);

      const activeSettings = settingRows.filter(row => !row.isDeleted);
      const firstSetting = activeSettings.sort(
        (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
      )[0] ?? null;

      const activeSchools = schoolRows.filter(row => !row.isDeleted);

      setSettings(firstSetting);
      setSchoolCount(activeSchools.length);

      if (!activeSchools.length) {
        setTab("schools");
      }
    };

    load();
  }, []);

  // ================= APPLY BRANDING =================

  useEffect(() => {
    if (settings?.fontFamily) {
      document.documentElement.style.setProperty("--font-family", settings.fontFamily);
    }

    if (settings?.primaryColor) {
      document.documentElement.style.setProperty("--primary-color", settings.primaryColor);
    }
  }, [settings?.fontFamily, settings?.primaryColor]);

  // ================= ONLINE / OFFLINE =================

  useEffect(() => {
    const updateOnlineState = () => {
      setIsOnline(navigator.onLine);
    };

    updateOnlineState();

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  // ================= RESPONSIVE =================

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mobile) {
        setSidebarCompact(false);
      }
    };

    check();

    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ================= ACTIVE PAGE =================

  const ActiveComponent = useMemo(() => {
    return ROUTES[tab] ?? SchoolBranchDashboard;
  }, [tab]);

  const activeLabel = LABELS[tab] ?? "School";
  const activeGroup = GROUPS[tab] ?? "Start";

  const primary = settings?.primaryColor || "var(--primary-color)";

  // ================= NAVIGATION =================

  const navigate = (key: string) => {
    setTab(key);

    if (isMobile) {
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // ================= SCHOOL + BRANCH SWITCHING =================

  const handleSchoolChange = async (value: string) => {
    const nextId = value ? Number(value) : null;
    await setActiveSchoolId(nextId);
  };

  const handleBranchChange = async (value: string) => {
    const nextId = value ? Number(value) : null;
    await setActiveBranchId(nextId);
  };

  // ================= SIDEBAR RESIZE =================

  const startResize = (e: React.MouseEvent) => {
    if (sidebarCompact) return;

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);

      if (newWidth >= 170 && newWidth <= 420) {
        setSidebarWidth(newWidth);
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleSidebarCompact = () => {
    if (isMobile) {
      setSidebarOpen(prev => !prev);
      return;
    }

    setSidebarCompact(prev => !prev);
  };

  const effectiveSidebarWidth = sidebarCompact && !isMobile ? 64 : sidebarWidth;

  const styles = sidebarStyles({
    width: effectiveSidebarWidth,
    isMobile,
    open: sidebarOpen,
  });

  // ======================================================
  // UI HELPERS
  // ======================================================

  const statusPill: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: sidebarCompact ? "8px 0" : "8px 10px",
    borderRadius: 999,
    background: isOnline ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
    color: isOnline ? "#16a34a" : "#dc2626",
    fontSize: 12,
    fontWeight: 800,
    justifyContent: sidebarCompact ? "center" : "flex-start",
    marginTop: 10,
  };

  const contextPill: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: sidebarCompact ? "8px 0" : "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "inherit",
    fontSize: 12,
    fontWeight: 800,
    justifyContent: sidebarCompact ? "center" : "flex-start",
    marginTop: 8,
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };

  const contextLabel: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.7,
    opacity: 0.56,
    textTransform: "uppercase",
    margin: "10px 10px 0",
  };

  const sidebarToggleButton: React.CSSProperties = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: sidebarCompact ? "10px 0" : "10px 12px",
    background: "rgba(255,255,255,0.08)",
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: sidebarCompact ? "center" : "space-between",
    gap: 10,
    fontWeight: 800,
    marginTop: 12,
  };

  const navButton = (active: boolean): React.CSSProperties => ({
    ...styles.button(active),
    justifyContent: sidebarCompact ? "center" : undefined,
    paddingLeft: sidebarCompact ? 0 : undefined,
    paddingRight: sidebarCompact ? 0 : undefined,
    transition: "all 180ms ease",
  });

  const sectionTitle = (title: string): React.CSSProperties => ({
    ...styles.sectionTitle,
    textAlign: sidebarCompact ? "center" : undefined,
    fontSize: sidebarCompact ? 10 : undefined,
    letterSpacing: sidebarCompact ? 0 : undefined,
  });

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <div
      style={{
        ...layout.container,
        fontFamily: "var(--font-family, system-ui)",
      }}
    >
      {isMobile && sidebarOpen && (
        <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        style={{
          ...styles.aside,
          transition: "width 220ms ease, transform 220ms ease",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            ...sidebarHeaderStyles.container,
            marginBottom: 18,
            cursor: "pointer",
            alignItems: sidebarCompact ? "center" : undefined,
            justifyContent: sidebarCompact ? "center" : undefined,
          }}
          onClick={() => navigate("schools")}
        >
          {!sidebarCompact && (
            <div style={sidebarHeaderStyles.text}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {activeSchool?.name || settings?.schoolName || "School Setup"}
              </h3>

              <small style={{ opacity: 0.7, fontSize: 12 }}>
                Institution first workspace
              </small>
            </div>
          )}

          {sidebarCompact && (
            <div
              title={activeSchool?.name || settings?.schoolName || "School"}
              style={{
                width: 42,
                height: 42,
                borderRadius: 16,
                background: primary,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              🏫
            </div>
          )}
        </div>

        {/* SCHOOL + BRANCH + SYNC STATUS */}
        <div style={{ padding: sidebarCompact ? "0 10px" : "0 4px", marginBottom: 16 }}>
          {!sidebarCompact && <div style={contextLabel}>School Context</div>}

          <div style={contextPill} title={activeSchool?.name || "No active school"}>
            <span style={{ color: primary }}>🏫</span>

            {!sidebarCompact && (
              <select
                value={activeSchoolId || ""}
                onChange={e => handleSchoolChange(e.target.value)}
                disabled={contextLoading || !schools.length}
                style={selectStyle}
              >
                <option value="">
                  {contextLoading
                    ? "Loading schools..."
                    : schools.length
                    ? "Select school"
                    : "Create school profile"}
                </option>

                {schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            )}

            {sidebarCompact && <span title={activeSchool?.name || "No active school"}>●</span>}
          </div>

          {!sidebarCompact && <div style={contextLabel}>Branch Context</div>}

          <div style={contextPill} title={activeBranch?.name || "No active branch"}>
            <span style={{ color: primary }}>🏢</span>

            {!sidebarCompact && (
              <select
                value={activeBranchId || ""}
                onChange={e => handleBranchChange(e.target.value)}
                disabled={contextLoading || !activeSchoolId || !branches.length}
                style={selectStyle}
              >
                <option value="">
                  {contextLoading
                    ? "Loading branches..."
                    : !activeSchoolId
                    ? "Select school first"
                    : branches.length
                    ? "Select branch"
                    : "No branch under school"}
                </option>

                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}

            {sidebarCompact && <span title={activeBranch?.name || "No active branch"}>●</span>}
          </div>

          <div style={contextPill} title="School profiles">
            <span style={{ color: primary }}>●</span>
            {!sidebarCompact && (
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {schoolCount ? `${schoolCount} school profile(s)` : "Create school profile"}
              </span>
            )}
          </div>

          <div style={statusPill} title={isOnline ? "Online" : "Offline"}>
            <span>●</span>
            {!sidebarCompact && (
              <span>{isOnline ? "Online - Sync Ready" : "Offline - Local Mode"}</span>
            )}
          </div>

          {!isMobile && (
            <button
              type="button"
              onClick={toggleSidebarCompact}
              style={sidebarToggleButton}
              title={sidebarCompact ? "Expand sidebar" : "Slim sidebar"}
            >
              <span>{sidebarCompact ? "☰" : "⇤"}</span>
              {!sidebarCompact && <span>Slim sidebar</span>}
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: sidebarCompact ? 14 : 18,
          }}
        >
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <div style={sectionTitle(section.title)} title={section.title}>
                {sidebarCompact ? section.title.slice(0, 3).toUpperCase() : section.title}
              </div>

              <nav style={styles.nav}>
                {section.items.map(item => {
                  const active = tab === item.key;

                  return (
                    <button
                      key={item.key}
                      onClick={() => navigate(item.key)}
                      style={navButton(active)}
                      title={sidebarCompact ? item.label : undefined}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          width: sidebarCompact ? "auto" : 24,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.icon}
                      </span>

                      {!sidebarCompact && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {!isMobile && !sidebarCompact && (
          <div style={styles.resizeHandle} onMouseDown={startResize} />
        )}
      </aside>

      {/* MAIN */}
      <main style={layout.main}>
        <div
          style={{
            ...layout.topbar,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 10,
                  background: "var(--surface)",
                  color: "var(--text)",
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                ☰
              </button>
            )}

            <div>
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.62,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {activeGroup}
              </div>
              <h2 style={{ margin: 0 }}>{activeLabel}</h2>
            </div>
          </div>
        </div>

        <ActiveComponent navigate={navigate} />

        {/* QUICK SETTINGS TAB */}
        {tab !== "settings" && (
          <button
            type="button"
            onClick={() => navigate("schoolBranchSettings")}
            title="Quick Settings"
            style={{
              position: "fixed",
              right: 0,
              top: "48%",
              transform: "translateY(-50%)",
              zIndex: 60,
              width: 46,
              height: 96,
              border: "none",
              borderTopLeftRadius: 18,
              borderBottomLeftRadius: 18,
              background: primary,
              color: "#fff",
              cursor: "pointer",
              boxShadow: "-8px 12px 28px rgba(0,0,0,0.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            ⚙
          </button>
        )}
      </main>
    </div>
  );
}
