"use client";

/**
 * app/student/page.tsx
 * ---------------------------------------------------------
 * STUDENT PORTAL
 * ---------------------------------------------------------
 * Student-scoped learner workspace.
 *
 * Workspace-session aligned:
 * - RolePortalShell now opens the portal from the selected workspace session
 *   written by /select-role.
 * - This page stays simple: it declares navigation and routes only.
 * - Studentdashboard receives NAV_SECTIONS so the dashboard modules always
 *   match the actual Student Portal menu.
 * - Adding/removing/reordering nav items here automatically updates the
 *   dashboard module list.
 */

import RolePortalShell from "../components/role-portals/RolePortalShell";
import { STUDENT_ROLES } from "../lib/auth/roleRedirect";

import Studentdashboard from "./modules/Studentdashboard";
import Mysubjects from "./modules/Mysubjects";
import Myattendance from "./modules/Myattendance";
import Myresults from "./modules/Myresults";
import Myreportcards from "./modules/Myreportcards";
import Announcements from "./modules/Announcements";
import Calendar from "./modules/Calendar";
import Messages from "./modules/Messages";
import MyTimetable from "./modules/MyTimetable";
import StudentPayments from "./modules/StudentPayments";

export const NAV_SECTIONS = [
  {
    title: "My Learning",
    defaultOpen: true,
    items: [
      { key: "studentDashboard", label: "Dashboard", icon: "🏠" },
      { key: "mySubjects", label: "My Subjects", icon: "📘" },
      { key: "myAttendance", label: "Attendance", icon: "📅" },
    ],
  },
  {
    title: "My Records",
    defaultOpen: false,
    items: [
      { key: "myResults", label: "Results", icon: "📊" },
      { key: "myReportCards", label: "Report Cards", icon: "📄" },
    ],
  },
  {
    title: "My Communications",
    defaultOpen: false,
    items: [
      { key: "announcements", label: "Announcements", icon: "📢" },
      { key: "calendar", label: "Calendar", icon: "📅" },
      { key: "messages", label: "Messages", icon: "✉️" },
      { key: "myTimetable", label: "My Timetable", icon: "⏰" },
    ],
  },
  {
    title: "My Finances",
    defaultOpen: false,
    items: [
      { key: "studentPayments", label: "Fee Payments", icon: "💳" },
    ],
  },
];

type RouteProps = {
  navigate: (key: string) => void;
};

function StudentDashboardRoute({ navigate }: RouteProps) {
  return <Studentdashboard navigate={navigate} navSections={NAV_SECTIONS} />;
}

const ROUTES = {
  studentDashboard: StudentDashboardRoute,
  mySubjects: Mysubjects,
  myAttendance: Myattendance,
  myResults: Myresults,
  myReportCards: Myreportcards,
  announcements: Announcements,
  calendar: Calendar,
  messages: Messages,
  myTimetable: MyTimetable,
  studentPayments: StudentPayments,
};

export default function StudentPage() {
  return (
    <RolePortalShell
      portalTitle="Student Portal"
      portalSubtitle="Learner workspace"
      homeKey="studentDashboard"
      allowedRoles={STUDENT_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={true}
    />
  );
}
