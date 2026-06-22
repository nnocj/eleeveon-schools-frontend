"use client";

/**
 * app/platform-team/page.tsx
 * ---------------------------------------------------------
 * ELEEVEON PLATFORM TEAM WORKSPACE
 * ---------------------------------------------------------
 * Safe workspace for people enrolled to help Eleeveon with support,
 * QA, releases, content, billing help, sync assistance and customer success.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Platform Team is platform-scoped, so it does NOT require school/branch.
 * - PlatformTeamDashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates dashboard
 *   cards while preserving RolePortalShell routing.
 *
 * This is not the founder/developer console.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";
import type { AppRole } from "../lib/auth/roleRedirect";

import PlatformTeamDashboard from "./modules/PlatformTeamDashboard";
import MyWork from "./modules/MyWork";
import SupportDesk from "./modules/SupportDesk";
import ClientAccounts from "./modules/ClientAccounts";
import SyncHelpDesk from "./modules/SyncHelpDesk";
import BillingSupport from "./modules/BillingSupport";
import BugReports from "./modules/BugReports";
import QaTesting from "./modules/QaTesting";
import ReleaseBoard from "./modules/ReleaseBoard";
import KnowledgeBase from "./modules/KnowledgeBase";
import TeamMembers from "./modules/TeamMembers";
import TeamPermissions from "./modules/TeamPermissions";
import ActivityLogs from "./modules/ActivityLogs";
import InternalAnnouncements from "./modules/InternalAnnouncements";
import WorkNotes from "./modules/WorkNotes";
import PlatformTeamSettings from "./modules/PlatformTeamSettings";

type RouteProps = {
  navigate: (key: string) => void;
};

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Today",
    defaultOpen: true,
    items: [
      { key: "dashboard", label: "Team Dashboard", icon: "🏠" },
      { key: "myWork", label: "My Work", icon: "✅" },
      { key: "announcements", label: "Team Updates", icon: "📣" },
    ],
  },
  {
    title: "Customer Operations",
    defaultOpen: true,
    items: [
      { key: "supportDesk", label: "Support Desk", icon: "🎫" },
      { key: "clientAccounts", label: "Client Accounts", icon: "🏫" },
      { key: "syncHelp", label: "Sync Help Desk", icon: "🔄" },
      { key: "billingSupport", label: "Billing Support", icon: "🧾" },
    ],
  },
  {
    title: "Build Quality",
    defaultOpen: true,
    items: [
      { key: "bugReports", label: "Bug Reports", icon: "🐞" },
      { key: "qaTesting", label: "QA Testing", icon: "🧪" },
      { key: "releaseBoard", label: "Release Board", icon: "🚀" },
    ],
  },
  {
    title: "Team Knowledge",
    defaultOpen: false,
    items: [
      { key: "knowledgeBase", label: "Knowledge Base", icon: "📚" },
      { key: "workNotes", label: "Work Notes", icon: "📝" },
      { key: "activityLogs", label: "Activity Logs", icon: "📜" },
    ],
  },
  {
    title: "Team Management",
    defaultOpen: false,
    items: [
      { key: "teamMembers", label: "Team Members", icon: "👥" },
      { key: "teamPermissions", label: "Permissions", icon: "🔐" },
      { key: "settings", label: "Team Settings", icon: "⚙️" },
    ],
  },
];

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function PlatformTeamDashboardRoute(props: RouteProps) {
  return <PlatformTeamDashboard {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  dashboard: PlatformTeamDashboardRoute,
  myWork: MyWork,
  supportDesk: SupportDesk,
  clientAccounts: ClientAccounts,
  syncHelp: SyncHelpDesk,
  billingSupport: BillingSupport,
  bugReports: BugReports,
  qaTesting: QaTesting,
  releaseBoard: ReleaseBoard,
  knowledgeBase: KnowledgeBase,
  teamMembers: TeamMembers,
  teamPermissions: TeamPermissions,
  activityLogs: ActivityLogs,
  announcements: InternalAnnouncements,
  workNotes: WorkNotes,
  settings: PlatformTeamSettings,
};

export default function PlatformTeamPage() {
  return (
    <RolePortalShell
      portalTitle="Platform Team"
      portalSubtitle="Safe workspace for support, QA, releases, customer success, billing help and platform operations"
      homeKey="dashboard"
      allowedRoles={["platform_team", "developer"] as AppRole[]}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={false}
      requireSchool={false}
      requireBranch={false}
    />
  );
}
