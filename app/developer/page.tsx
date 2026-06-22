"use client";

/**
 * app/developer/page.tsx
 * ---------------------------------------------------------
 * PLATFORM DEVELOPER PORTAL
 * ---------------------------------------------------------
 * Highest-level SaaS creator portal.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Developer is platform-scoped, so it does NOT require school/branch context.
 * - DeveloperDashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates dashboard
 *   cards while preserving RolePortalShell routing.
 *
 * This portal is for the founder/core developer and platform team.
 * It does not import from app/dashboard/*.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";
import type { AppRole } from "../lib/auth/roleRedirect";

import DeveloperDashboard from "./modules/DeveloperDashboard";
import DeveloperPlans from "./modules/DeveloperPlans";
import DeveloperSubscriptions from "./modules/DeveloperSubscriptions";
import DeveloperAccounts from "./modules/DeveloperAccounts";
import DeveloperInvoices from "./modules/DeveloperInvoices";
import DeveloperPayments from "./modules/DeveloperPayments";
//import DeveloperSupport from "./modules/DeveloperSupport";
import DeveloperSystemHealth from "./modules/DeveloperSystemHealth";
//import DeveloperSyncDiagnostics from "./modules/DeveloperSyncDiagnostics";
//import DeveloperAuditLogs from "./modules/DeveloperAuditLogs";
import DeveloperSettings from "./modules/DeveloperSettings";

import DeveloperTeam from "./modules/DeveloperTeam";
import DeveloperFeatureFlags from "./modules/DeveloperFeatureFlags";
import DeveloperBackups from "./modules/DeveloperBackups";
import DeveloperIntegrations from "./modules/DeveloperIntegrations";
import DeveloperErrorReports from "./modules/DeveloperErrorReports";
import DeveloperReleases from "./modules/DeveloperReleases";
import DeveloperDatabaseTools from "./modules/DeveloperDatabaseTools";
import DeveloperDatabaseStudio from "./modules/DeveloperDatabaseStudio";
import DeveloperDatabaseDesigner from "./modules/DeveloperDatabaseDesigner";
import DeveloperSqlConsole from "./modules/DeveloperSqlConsole";

type RouteProps = {
  navigate: (key: string) => void;
};

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Developer Home",
    defaultOpen: true,
    items: [
      {
        key: "developerDashboard",
        label: "Platform Overview",
        icon: "🧭",
      },
    ],
  },
  {
    title: "SaaS Control",
    defaultOpen: true,
    items: [
      { key: "plans", label: "Plans & Packages", icon: "📦" },
      { key: "subscriptions", label: "Active Subscriptions", icon: "🔁" },
      { key: "accounts", label: "Customer Accounts", icon: "🏫" },
      { key: "featureFlags", label: "Feature Flags", icon: "🚦" },
    ],
  },
  {
    title: "Platform Team",
    defaultOpen: true,
    items: [
      { key: "developerTeam", label: "Platform Team", icon: "👥" },
    ],
  },
  {
    title: "Platform Billing",
    defaultOpen: false,
    items: [
      { key: "invoices", label: "Invoices", icon: "🧾" },
      { key: "payments", label: "Payments", icon: "💰" },
    ],
  },
  {
    title: "Technical Support",
    defaultOpen: true,
    items: [
      // { key: "support", label: "Support Desk", icon: "🎫" },
      // { key: "systemHealth", label: "System Health", icon: "🩺" },
      // { key: "syncDiagnostics", label: "Sync Diagnostics", icon: "🔄" },
      // { key: "errorReports", label: "Error Reports", icon: "🐞" },
      // { key: "auditLogs", label: "Audit Logs", icon: "📜" },
    ],
  },
  {
    title: "Developer Tools",
    defaultOpen: false,
    items: [
      { key: "databaseTools", label: "Database Health", icon: "🗄️" },
      { key: "databaseStudio", label: "Database Studio", icon: "🛠️" },
      { key: "databaseDesigner", label: "Database Designer", icon: "🎨" },
      { key: "sqlConsole", label: "Safe SQL Console", icon: "💻" },
      { key: "backups", label: "Backup & Restore", icon: "💾" },
      { key: "integrations", label: "API & Integrations", icon: "🔌" },
      { key: "releases", label: "Release Manager", icon: "🚀" },
    ],
  },
  {
    title: "System",
    defaultOpen: false,
    items: [
      { key: "settings", label: "Developer Settings", icon: "⚙️" },
    ],
  },
];

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function DeveloperDashboardRoute(props: RouteProps) {
  return <DeveloperDashboard {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  developerDashboard: DeveloperDashboardRoute,

  plans: DeveloperPlans,
  subscriptions: DeveloperSubscriptions,
  accounts: DeveloperAccounts,
  featureFlags: DeveloperFeatureFlags,

  developerTeam: DeveloperTeam,

  invoices: DeveloperInvoices,
  payments: DeveloperPayments,

  //support: DeveloperSupport,
  systemHealth: DeveloperSystemHealth,
  //syncDiagnostics: DeveloperSyncDiagnostics,
  errorReports: DeveloperErrorReports,
  //auditLogs: DeveloperAuditLogs,

  databaseTools: DeveloperDatabaseTools,
  databaseStudio: DeveloperDatabaseStudio,
  databaseDesigner: DeveloperDatabaseDesigner,
  backups: DeveloperBackups,
  integrations: DeveloperIntegrations,
  releases: DeveloperReleases,

  sqlConsole: DeveloperSqlConsole,
  settings: DeveloperSettings,
};

// ======================================================
// PAGE
// ======================================================

export default function DeveloperPage() {
  return (
    <RolePortalShell
      portalTitle="Developer Portal"
      portalSubtitle="Simple control center for Eleeveon accounts, billing, support, sync health, integrations and developer tools"
      homeKey="developerDashboard"
      allowedRoles={["developer", "platform_team"] as AppRole[]}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={false}
      requireSchool={false}
      requireBranch={false}
    />
  );
}
