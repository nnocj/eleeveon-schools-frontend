"use client";

/**
 * app/owner/page.tsx
 * ---------------------------------------------------------
 * SCHOOL OWNER / SUPER ADMIN PORTAL
 * ---------------------------------------------------------
 * Owner-scoped portal for the proprietor/account owner.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - Owner remains account-scoped, so this page does NOT require school/branch.
 * - OwnerDashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically changes the Owner
 *   Dashboard cards while preserving RolePortalShell routing.
 * - This page remains separate from app/developer and imports no app/dashboard code.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";

import type { AppRole } from "../lib/auth/roleRedirect";

import SchoolsPage from "./schools";
import OwnerDashboardPage from "./OwnerDashboard";
import OwnerBranchesPage from "./branches";
import Ownerusers from "./OwnerUsers";
import BillingPage from "./billing";
import SubscriptionPage from "./subscription";
import InvoicesPage from "./invoices";
import PaymentsPage from "./payments";
import AccountProfilePage from "./AccountProfile";
import SyncBackupPage from "./syncBackup";
import CalendarOverview from "./CalendarOverview";
import Messages from "./Messages";
import OwnerAnnouncementsPage from "./Announcements";

type RouteProps = {
  navigate: (key: string) => void;
};

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "Owner Home",
    defaultOpen: true,
    items: [
      {
        key: "ownerDashboard",
        label: "Owner Dashboard",
        icon: "👑",
      },
    ],
  },
  {
    title: "Institution",
    defaultOpen: true,
    items: [
      {
        key: "schools",
        label: "Schools",
        icon: "🏫",
      },
      {
        key: "branches",
        label: "Branches",
        icon: "🏢",
      },
    ],
  },
  {
    title: "Access Control",
    defaultOpen: true,
    items: [
      {
        key: "users",
        label: "User Roles",
        icon: "👥",
      },
    ],
  },
  {
    title: "Billing",
    defaultOpen: false,
    items: [
      {
        key: "billing",
        label: "Billing Overview",
        icon: "💳",
      },
      {
        key: "subscription",
        label: "My Subscription",
        icon: "📦",
      },
      {
        key: "invoices",
        label: "Invoices",
        icon: "🧾",
      },
      {
        key: "payments",
        label: "Payments",
        icon: "💰",
      },
    ],
  },
  {
    title: "System",
    defaultOpen: false,
    items: [
      {
        key: "profile",
        label: "Account Profile",
        icon: "👤",
      },
      {
        key: "sync",
        label: "Sync & Backup",
        icon: "☁️",
      },
      {
        key: "calendarOverview",
        label: "Calendar Overview",
        icon: "📆",
      },
    ],
  },
  {
    title: "Communication",
    defaultOpen: false,
    items: [
      {
        key: "ownerAnnouncements",
        label: "Announcements",
        icon: "📢",
      },
      {
        key: "messages",
        label: "Messages",
        icon: "✉️",
      },
    ],
  },
];

// ======================================================
// DASHBOARD WRAPPER
// ======================================================

function OwnerDashboardRoute(props: RouteProps) {
  return <OwnerDashboardPage {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  ownerDashboard: OwnerDashboardRoute,
  schools: SchoolsPage,
  branches: OwnerBranchesPage,
  users: Ownerusers,
  billing: BillingPage,
  subscription: SubscriptionPage,
  invoices: InvoicesPage,
  payments: PaymentsPage,
  profile: AccountProfilePage,
  sync: SyncBackupPage,
  calendarOverview: CalendarOverview,
  messages: Messages,
  ownerAnnouncements: OwnerAnnouncementsPage,
};

export default function OwnerPage() {
  return (
    <RolePortalShell
      portalTitle="Owner Portal"
      portalSubtitle="School owner and super admin control"
      homeKey="ownerDashboard"
      allowedRoles={["owner", "super_admin"] as AppRole[]}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={false}
      requireSchool={false}
      requireBranch={false}
    />
  );
}
