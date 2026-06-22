"use client";

/**
 * app/accountant/page.tsx
 * ---------------------------------------------------------
 * ACCOUNTANT PORTAL
 * ---------------------------------------------------------
 * Finance workspace for school/branch accountants.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Accountant records are scoped by the selected school/branch when available.
 * - Accountantdashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates dashboard
 *   cards while preserving RolePortalShell routing.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";
import { ACCOUNTANT_ROLES } from "../lib/auth/roleRedirect";

import Accountantdashboard from "./modules/Accountantdashboard";
import Fees from "./modules/Fees";
import Payments from "./modules/Payments";
import Income from "./modules/Income";
import Expenses from "./modules/Expenses";
import Balances from "./modules/Balances";
import Financereports from "./modules/Financereports";
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";
import Calendar from "./modules/Calendar";

type RouteProps = {
  navigate: (key: string) => void;
};

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Finance",
    defaultOpen: true,
    items: [
      { key: "accountantDashboard", label: "Dashboard", icon: "💼" },
      { key: "fees", label: "Fees", icon: "💳" },
      { key: "payments", label: "Payments", icon: "🧾" },
      { key: "income", label: "Income", icon: "📈" },
      { key: "expenses", label: "Expenses", icon: "📉" },
    ],
  },
  {
    title: "Reports",
    defaultOpen: false,
    items: [
      { key: "balances", label: "Balances", icon: "⚖" },
      { key: "financeReports", label: "Finance Reports", icon: "📊" },
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
    title: "Calendar",
    defaultOpen: false,
    items: [
      { key: "calendar", label: "Calendar", icon: "📅" },
    ],
  },
];

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function AccountantDashboardRoute(props: RouteProps) {
  return <Accountantdashboard {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  accountantDashboard: AccountantDashboardRoute,
  fees: Fees,
  payments: Payments,
  income: Income,
  expenses: Expenses,
  balances: Balances,
  financeReports: Financereports,
  announcements: Announcements,
  calendar: Calendar,
  messages: Messages,
};

export default function AccountantPage() {
  return (
    <RolePortalShell
      portalTitle="Accountant Portal"
      portalSubtitle="Finance workspace"
      homeKey="accountantDashboard"
      allowedRoles={ACCOUNTANT_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={false}
    />
  );
}
