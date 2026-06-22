"use client";

/**
 * app/branch-admin/page.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN PORTAL
 * ---------------------------------------------------------
 *
 * Branch-scoped operational workspace for school management.
 *
 * Updated for the newer DB direction:
 * - Administration
 * - Daily operations
 * - Communication
 * - Curriculum / Academic setup
 * - Assessment / Grading setup
 * - Academic records
 * - Finance / payroll
 * - Branch control
 * - Local display settings
 *
 * IMPORTANT:
 * This page is compile-safe even when some modules are not written yet.
 * Missing modules use temporary placeholder pages so navigation will not crash.
 * Replace the placeholder routes with real module imports as we write them.
 *
 * Dashboard note:
 * - BranchAdminDashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically changes dashboard cards.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Local settings also reads the selected workspace session first so branch
 *   settings do not accidentally use another active branch from stale context.
 */

import React from "react";


import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";

import { BRANCH_ADMIN_ROLES } from "../lib/auth/roleRedirect";

import LocalSettings from "../components/role-portals/LocalSettings";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// DASHBOARD
// ======================================================

import BranchAdminDashboard from "./modules/BranchAdminDashboard";

// ======================================================
// ADMINISTRATION
// ======================================================

import Students from "./modules/Students";
import Teachers from "./modules/Teachers";
import Parents from "./modules/Parents";
import Classes from "./modules/Classes";
import StudentEnrollments from "./modules/StudentEnrollments";

// These can be replaced with real imports when their files are ready.
// import Classsubjects from "./modules/Classsubjects";
// import Studentenrollments from "./modules/Studentenrollments";


// ======================================================
// DAILY OPERATIONS
// ======================================================

import Studentattendance from "./modules/StudentAttendance";
import Teacherattendance from "./modules/TeacherAttendance";

// These can be replaced with real imports when their files are ready.
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";

//time table and calendar modules can be added here when ready
import BranchTimetable from "./modules/BranchTimetable";
import Calendar from "./modules/Calendar";
import ClassTimetable from "./modules/ClassTimetable";
import ExamTimetable from "./modules/ExamTimetable";
import TeacherTimetable from "./modules/TeacherTimetable";

import ResourceTimetable from "./modules/ResourceTimetable";

import Organizations from "./modules/Organizations";
// ======================================================
// ACADEMIC SETUP
// ======================================================

import Academicstructures from "./modules/Academicstructures";
import Academicperiods from "./modules/Academicperiods";
import Curriculumsetup from "./modules/Curriculumsetup";
import CurriculumPathways from "./modules/CurriculumPathways";
import CurriculumSubjects from "./modules/CurriculumSubjects";
import CourseOutline from "./modules/CourseOutline";
import Subjects from "./modules/Subjects";
import ClassSubjects from "./modules/ClassSubjects";
// ======================================================
// ASSESSMENT + GRADING
// ======================================================

import Assessmentstructure from "./modules/Assessmentstructure";
import Assessmentapplicability from "./modules/Assessmentapplicability";
import AssessmentItems from "./modules/AssessmentItems";
import Gradingsystems from "./modules/Gradingsystems";
import GradingRules from "./modules/GradingRules";

// ======================================================
// ACADEMIC RECORDS
// ======================================================

import StudentReports from "./modules/reports/StudentReports";
import ReportRemarks from "./modules/ReportRemarks";
import Broadsheets from "./modules/reports/Broadsheets";
import Promotion from "./modules/Promotion";
import CumulativeRecords from "./modules/CumulativeRecords";
import StudentProgressTimeline from "./modules/reports/StudentProgressTimeline";
import AcademicProgress from "./modules/AcademicProgress";

// ======================================================
// FINANCE
// ======================================================

// Replace placeholders with these imports when the files are ready.
import Fees from "./modules/Fees";
import Incomes from "./modules/Incomes";
import Expenses from "./modules/Expenses";
import Payroll from "./modules/Payroll";
import WithdrawMoney from "./modules/WithdrawMoney";
import SchoolPayoutSettings from "./modules/SchoolPayoutSettings";
import BranchWallet from "./modules/BranchWallet";
import Settlements from "./modules/Settlements";

// ======================================================
// BRANCH CONTROL
// ======================================================

import Branchsettings from "./modules/Branchsettings";

// Replace placeholders with these imports when the files are ready.
import Usersroles from "./modules/Usersroles";
// import Syncstatus from "./modules/Syncstatus";

// ======================================================
// PLACEHOLDER MODULE
// ======================================================

type RouteProps = {
  navigate: (key: string) => void;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  role?: string | null;
};

function safeRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed) return parsed;
  }

  return null;
}

function readOpenWorkspaceSession() {
  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJson<Record<string, any>>("activeMembership");
}

function selectedWorkspaceSchoolId(args: {
  activeSchoolId?: any;
  activeSchool?: any;
  settings?: any;
}) {
  const workspace = readOpenWorkspaceSession();
  const membership = workspace?.membership || readStoredActiveMembership();

  return firstPositiveNumber(
    workspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeRead("activeSchoolId")
  );
}

function selectedWorkspaceBranchId(args: {
  activeBranchId?: any;
  activeBranch?: any;
  settings?: any;
}) {
  const workspace = readOpenWorkspaceSession();
  const membership = workspace?.membership || readStoredActiveMembership();

  return firstPositiveNumber(
    workspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeRead("activeBranchId")
  );
}

function PlaceholderModule({
  title,
  description,
  icon,
  nextStep,
}: {
  title: string;
  description: string;
  icon: string;
  nextStep: string;
}) {
  return (
    <main className="ba-placeholder-page">
      <style>{placeholderCss}</style>

      <section className="ba-placeholder-card">
        <div className="ba-placeholder-icon">{icon}</div>

        <div>
          <p>Module placeholder</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>

        <div className="ba-placeholder-note">
          <strong>Next step</strong>
          <span>{nextStep}</span>
        </div>
      </section>
    </main>
  );
}





// ======================================================
// LOCAL SETTINGS WRAPPER
// ======================================================

function BranchAdminLocalSettingsPage() {
  const { accountId } = useAccount();
  const { settings } = useSettings();

  const {
    activeSchoolId,
    activeBranchId,
    activeSchool,
    activeBranch,
  } = useActiveBranch();

  return (
    <LocalSettings
      portalName="Branch Admin Portal"
      roleKey="branch-admin"
      accountId={accountId}
      schoolId={selectedWorkspaceSchoolId({ activeSchoolId, activeSchool, settings })}
      branchId={selectedWorkspaceBranchId({ activeBranchId, activeBranch, settings })}
      primaryColor={settings?.primaryColor || "var(--primary-color, #2563eb)"}
      branchFontSize={(settings as any)?.fontSize}
      inline={true}
    />
  );
}

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function BranchAdminDashboardPage(props: RouteProps) {
  return <BranchAdminDashboard {...props} navSections={NAV_SECTIONS} />;
}


// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Branch Home",
    defaultOpen: true,
    items: [
      {
        key: "branchAdminDashboard",
        label: "Dashboard",
        icon: "🏠",
      },
    ],
  },

  {
    title: "Administration",
    defaultOpen: true,
    items: [
      {
        key: "students",
        label: "Students",
        icon: "🧑‍🎓",
      },
      {
        key: "teachers",
        label: "Teachers",
        icon: "👨‍🏫",
      },
      {
        key: "parents",
        label: "Parents",
        icon: "👨‍👩‍👧",
      },
      {
        key: "classes",
        label: "Classes",
        icon: "🏫",
      },
      {
        key: "classSubjects",
        label: "Class Subjects",
        icon: "📘",
      },
      {
        key: "studentEnrollments",
        label: "Enrollments",
        icon: "🧾",
      },
    ],
  },

  {
    title: "Attendance",
    defaultOpen: true,
    items: [
      {
        key: "studentAttendance",
        label: "Student Attendance",
        icon: "📅",
      },
      {
        key: "teacherAttendance",
        label: "Teacher Attendance",
        icon: "🕒",
      },
      
    ],
  },
  {
    title: "Communication",
    defaultOpen: false,
    items: [
      {
        key: "announcements",
        label: "Announcements",
        icon: "📣",
      },
      {
        key: "messages",
        label: "Messages",
        icon: "💬",
      }
    ],

  },

  {

    title: "Calendar & Timetable",
    defaultOpen: false,
    items: [
      {

        key: "calendar",
        label: "Calendar",
        icon: "📆",
      },
      {
        key: "branchTimetable",
        label: "Branch Timetable",
        icon: "📆",
      },
      {
        key: "classTimetable",
        label: "Class Timetable",
        icon: "📚",
      },
      {
        key: "teacherTimetable",
        label: "Teacher Timetable",
        icon: "👩‍🏫",
      },
      {
        key: "examTimetable",
        label: "Exam Timetable",
        icon: "📝",
      },
      {
        key:"resourceTimetable",
        label: "Resource Timetable",
        icon: "📅",
      }
    ],
  },
  {
    title: " Setup",
    defaultOpen: false,
    items: [
      {

        key:"organizations",
        label: "Organizations",
        icon: "🏢",
      },
      {
        key: "curriculumSetup",
        label: "Curriculum",
        icon: "📚",
      },
      {
        key: "courseOutline",
        label: "Course Outline",
        icon: "🗂️",
      },
      {
        key: "curriculumPathways",
        label: "Curriculum Pathways",
        icon: "🗺️",
      },
      {

        key: "subjects",
        label: "Subjects",
        icon: "📖",
      },
      {

        key:"classSubjects",
        label:"ClassSubjects",
        icon:"📖",
      },
      {
        key: "curriculumSubjects",
        label: "Curriculum Subjects",
        icon: "📖",
      },
      {
        key: "academicStructures",
        label: "Academic Structures",
        icon: "🧱",
      },
      {
        key: "academicPeriods",
        label: "Academic Periods",
        icon: "🗓",
      },
       {
        key: "assessmentStructure",
        label: "Assessment Structure",
        icon: "🏗️",
      },
      {
        key: "assessmentItems",
        label: "Assessment Items",
        icon: "📋",
      },
      {
        key: "assessmentApplicability",
        label: "Assessment Applicability",
        icon: "✅",
      },
       {
        key: "gradingSystems",
        label: "Grading Systems",
        icon: "🎓",
      },
      {
        key: "gradingRules",
        label: "Grading Rules",
        icon: "📏",
      },
    ],
  },


  {
    title: "Academic Records",
    defaultOpen: false,
    items: [
      {
        key: "studentReports",
        label: "Student Reports",
        icon: "📄",
      },
      {
        key: "reportRemarks",
        label: "Report Remarks",
        icon: "📝",
      },
      {
        key: "broadsheets",
        label: "Broadsheets",
        icon: "📊",
      },
      {
        key: "promotion",
        label: "Promotion",
        icon: "🚀",
      },
      {
        key: "cumulativeRecords",
        label: "Cumulative Records",
        icon: "📚",
      },
      {
        key: "studentProgressTimeline",
        label: "Student Progress Timeline",
        icon: "⏳",

      },
      {
        key: "academicProgress",
        label: "Academic Progress",
        icon: "📈",
      }
    ],
  },

  {
    title: "Finance",
    defaultOpen: false,
    items: [
      {
        key: "fees",
        label: "Fees",
        icon: "💳",
      },
      {
        key: "incomes",
        label: "Incomes",
        icon: "💰",
      },
      {
        key: "expenses",
        label: "Expenses",
        icon: "📉",
      },
      {
        key: "payroll",
        label: "Teacher Payroll",
        icon: "🧾",
      },
      {
        key: "withdrawMoney",
        label: "Withdraw Money",
        icon: "💸",
      },
      {

        key: "schoolPayoutSettings",
        label: "Payout Settings",
        icon: "⚙️",
      },
      {
        key: "branchWallet",
        label: "Branch Wallet",
        icon: "👛",
      },
    ],
  },

  {
    title: "Branch Control",
    defaultOpen: false,
    items: [
      {
        key: "branchSettings",
        label: "Branch Settings",
        icon: "⚙️",
      },
      {
        key: "usersRoles",
        label: "Users & Roles",
        icon: "🔐",
      },
      {
        key: "localSettings",
        label: "Local Settings",
        icon: "🌓",
      },
    ],
  },
];

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  // Dashboard
  branchAdminDashboard: BranchAdminDashboardPage,

  // Administration
  students: Students,
  teachers: Teachers,
  parents: Parents,
  classes: Classes,
  classSubjects: ClassSubjects,
  studentEnrollments: StudentEnrollments,
  resourceTimetable: ResourceTimetable,

  // Daily Work
  studentAttendance: Studentattendance,
  teacherAttendance: Teacherattendance,
  
 

  //communication
  announcements: Announcements,
  messages: Messages,

  //timetable and calendar
  branchTimetable: BranchTimetable,
  calendar: Calendar,
  classTimetable: ClassTimetable,
  teacherTimetable: TeacherTimetable,
  examTimetable: ExamTimetable,


  subjects: Subjects,
  organizations: Organizations,


  // Academic / Curriculum Setup
  academicStructures: Academicstructures,
  academicPeriods: Academicperiods,
  curriculumPathways: CurriculumPathways,
  curriculumSetup: Curriculumsetup,
  curriculumSubjects: CurriculumSubjects,
  courseOutline: CourseOutline,

  // Assessment / Grading
  assessmentStructure: Assessmentstructure,
  assessmentItems: AssessmentItems,
  assessmentApplicability: Assessmentapplicability,
  gradingSystems: Gradingsystems,
  gradingRules: GradingRules,

  // Records
  studentReports: StudentReports,
  reportRemarks: ReportRemarks,
  broadsheets: Broadsheets,
  promotion: Promotion,
  cumulativeRecords: CumulativeRecords,
  academicProgress: AcademicProgress,
  studentProgressTimeline: StudentProgressTimeline,

  // Finance
  fees: Fees,
  incomes: Incomes,
  expenses: Expenses,
  payroll: Payroll,
  withdrawMoney: WithdrawMoney,
  schoolPayoutSettings: SchoolPayoutSettings,
  branchWallet: BranchWallet,
  settlements: Settlements,

  // Control
  branchSettings: Branchsettings,
  usersRoles: Usersroles,
  localSettings: BranchAdminLocalSettingsPage,
};

// ======================================================
// PAGE
// ======================================================

export default function BranchAdminPage() {
  
  return (
    <RolePortalShell
    
      portalTitle="Branch Admin Portal"
      portalSubtitle="Branch operations, academics, finance and administration"
      homeKey="branchAdminDashboard"
      allowedRoles={BRANCH_ADMIN_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={true}
    />
  );
}

// ======================================================
// PLACEHOLDER CSS
// ======================================================

const placeholderCss = `
.ba-placeholder-page {
  min-height: 100%;
  width: 100%;
  display: grid;
  place-items: center;
  padding: calc(12px * var(--local-density-scale, 1));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent), transparent 32rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

.ba-placeholder-card {
  width: min(620px, 100%);
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--primary-color, #2563eb) 16%, transparent), transparent 22rem),
    var(--card-bg, var(--surface, #ffffff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 70px rgba(15,23,42,.10));
}

.ba-placeholder-icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: var(--primary-color, #2563eb);
  color: #ffffff;
  font-size: 26px;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--primary-color, #2563eb) 26%, transparent);
}

.ba-placeholder-card p {
  margin: 0;
  color: var(--primary-color, #2563eb);
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ba-placeholder-card h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: clamp(22px, 5vw, 32px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.ba-placeholder-card span {
  display: block;
  margin-top: 6px;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 750;
}

.ba-placeholder-note {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 8%, var(--surface, #ffffff));
  border: 1px solid color-mix(in srgb, var(--primary-color, #2563eb) 18%, var(--border, rgba(0,0,0,.10)));
}

.ba-placeholder-note strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.ba-placeholder-note span {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.55;
  font-weight: 750;
}
`;
