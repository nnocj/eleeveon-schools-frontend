"use client";

/**
 * app/teacher/page.tsx
 * ---------------------------------------------------------
 * TEACHER PORTAL
 * ---------------------------------------------------------
 * Separate teacher workspace.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Teacher pages are scoped by selected teacherLocalId, schoolId and branchId.
 * - Teacherdashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates dashboard
 *   cards while preserving RolePortalShell routing.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";
import { TEACHER_ROLES } from "../lib/auth/roleRedirect";

import Teacherdashboard from "./modules/Teacherdashboard";
import Teacherclasses from "./modules/Teacherclasses";
import Teachersubjects from "./modules/Teachersubjects";
import Attendance from "./modules/Attendance";
import Assessmententry from "./modules/Assessmententry";
import Assignments from "./modules/Assignments";
import Courseoutline from "./modules/Courseoutline";

import Teacherstudents from "./modules/Teacherstudents";
import Studentprogress from "./modules/Studentprogress";

import Teacherreports from "./modules/Teacherreports";
import Teacherbroadsheets from "./modules/Teacherbroadsheets";
import Lessonnotes from "./modules/Lessonnotes";

import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";

import Calendar from "./modules/Calendar";
import ClassTimetable from "./modules/ClassTimetable";
import MyTimetable from "./modules/MyTimetable";

import Teachersalary from "./modules/Teachersalary";
import Teacherpaymenthistory from "./modules/Teacherpaymenthistory";

import Teacherprofile from "./modules/Teacherprofile";
import Teachersettings from "./modules/Teachersettings";

import ReportRemarks from "./modules/ReportRemarks";

type RouteProps = {
  navigate: (key: string) => void;
};

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Teaching",
    defaultOpen: true,
    items: [
      { key: "teacherDashboard", label: "Dashboard", icon: "🏠" },
      { key: "teacherClasses", label: "My Classes", icon: "🏫" },
      { key: "teacherSubjects", label: "My Subjects", icon: "📘" },
      { key: "attendance", label: "Attendance", icon: "📅" },
      { key: "assessmentEntry", label: "Assessment Entry", icon: "📝" },
      { key: "assignments", label: "Assignments", icon: "🧩" },
      { key: "courseOutline", label: "Course Outline", icon: "📖" },
    ],
  },
  {
    title: "Learners",
    defaultOpen: true,
    items: [
      { key: "teacherStudents", label: "My Students", icon: "👨‍🎓" },
      { key: "studentProgress", label: "Student Progress", icon: "📈" },
      { key: "reportRemarks", label: "Report Remarks", icon: "📝" },
    ],
  },
  {
    title: "Records",
    defaultOpen: false,
    items: [
      { key: "teacherReports", label: "Reports", icon: "📄" },
      { key: "teacherBroadsheets", label: "Broadsheets", icon: "📊" },
      { key: "lessonNotes", label: "Lesson Notes", icon: "🗒️" },
    ],
  },
  {
    title: "Communication",
    defaultOpen: false,
    items: [
      { key: "announcements", label: "Announcements", icon: "📢" },
      { key: "messages", label: "Messages", icon: "✉️" },
    ],
  },
  {
    title: "Timetable",
    defaultOpen: false,
    items: [
      { key: "calendar", label: "Calendar", icon: "📆" },
      { key: "classTimetable", label: "Class Timetable", icon: "🏫" },
      { key: "teacherTimetable", label: "My Timetable", icon: "🗓️" },
    ],
  },
  {
    title: "Finance",
    defaultOpen: false,
    items: [
      { key: "teacherSalary", label: "My Salary", icon: "💵" },
      { key: "teacherPaymentHistory", label: "Payment History", icon: "🧾" },
    ],
  },
  {
    title: "Account",
    defaultOpen: false,
    items: [
      { key: "teacherProfile", label: "Profile", icon: "👤" },
      { key: "teacherSettings", label: "Settings", icon: "⚙️" },
    ],
  },
];

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function TeacherDashboardRoute(props: RouteProps) {
  return <Teacherdashboard {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  teacherDashboard: TeacherDashboardRoute,
  teacherClasses: Teacherclasses,
  teacherSubjects: Teachersubjects,
  attendance: Attendance,
  assessmentEntry: Assessmententry,
  assignments: Assignments,
  courseOutline: Courseoutline,

  teacherStudents: Teacherstudents,
  studentProgress: Studentprogress,
  reportRemarks: ReportRemarks,

  teacherReports: Teacherreports,
  teacherBroadsheets: Teacherbroadsheets,
  lessonNotes: Lessonnotes,

  announcements: Announcements,
  messages: Messages,

  calendar: Calendar,
  classTimetable: ClassTimetable,
  teacherTimetable: MyTimetable,

  teacherSalary: Teachersalary,
  teacherPaymentHistory: Teacherpaymenthistory,

  teacherProfile: Teacherprofile,
  teacherSettings: Teachersettings,
};

export default function TeacherPage() {
  return (
    <RolePortalShell
      portalTitle="Teacher Portal"
      portalSubtitle="Teaching, learners, communication and salary workspace"
      homeKey="teacherDashboard"
      allowedRoles={TEACHER_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={true}
    />
  );
}
