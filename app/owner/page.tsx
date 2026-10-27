"use client";

/**
 * app/owner/page.tsx
 * Owner portal with the exact Branch Admin top navigation layout.
 * Keeps Owner Overview as an optional destination; all prior owner tools
 * remain reachable through contextual subtabs.
 */
import React from "react";
import RolePortalShell, { type RoleNavSection } from "../components/role-portals/RolePortalShell";
import type { AppRole } from "../lib/auth/roleRedirect";
import WorkspaceSubtabs from "../components/role-portals/WorkspaceSubtabs";

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

type RouteProps = { navigate: (key: string) => void };

type InstitutionView = "schools" | "branches";
type BillingView = "billing" | "subscription" | "invoices" | "payments";
type SystemView = "profile" | "sync" | "calendarOverview";
type CommsView = "ownerAnnouncements" | "messages";

function InstitutionWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<InstitutionView>("schools");
  const Current: React.ComponentType<RouteProps> = view === "branches" ? OwnerBranchesPage : SchoolsPage;
  return (
    <div className="eds-owner-workspace">
      <WorkspaceSubtabs<InstitutionView> value={view} onChange={setView} ariaLabel="Institution views" tabs={[
        { key: "schools", label: "Schools" }, { key: "branches", label: "Branches" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function OwnerBillingWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<BillingView>("billing");
  const Current: React.ComponentType<RouteProps> =
    view === "subscription" ? SubscriptionPage :
    view === "invoices" ? InvoicesPage :
    view === "payments" ? PaymentsPage : BillingPage;
  return (
    <div className="eds-owner-workspace">
      <WorkspaceSubtabs<BillingView> value={view} onChange={setView} ariaLabel="Owner billing" tabs={[
        { key: "billing", label: "Billing Overview" },
        { key: "subscription", label: "My Subscription" },
        { key: "invoices", label: "Invoices" },
        { key: "payments", label: "Payments" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function OwnerSystemWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<SystemView>("profile");
  const Current: React.ComponentType<RouteProps> =
    view === "sync" ? SyncBackupPage :
    view === "calendarOverview" ? CalendarOverview : AccountProfilePage;
  return (
    <div className="eds-owner-workspace">
      <WorkspaceSubtabs<SystemView> value={view} onChange={setView} ariaLabel="Owner system" tabs={[
        { key: "profile", label: "Account Profile" },
        { key: "sync", label: "Sync & Backup" },
        { key: "calendarOverview", label: "Calendar" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function OwnerCommsWorkspace(props: RouteProps) {
  const [view, setView] = React.useState<CommsView>("ownerAnnouncements");
  const Current: React.ComponentType<RouteProps> = view === "messages" ? Messages : OwnerAnnouncementsPage;
  return (
    <div className="eds-owner-workspace">
      <WorkspaceSubtabs<CommsView> value={view} onChange={setView} ariaLabel="Owner communication" tabs={[
        { key: "ownerAnnouncements", label: "Announcements" },
        { key: "messages", label: "Messages" },
      ]} />
      <Current {...props} />
    </div>
  );
}

function OwnerDashboardRoute(props: RouteProps) {
  return <OwnerDashboardPage {...props} navSections={NAV_SECTIONS} />;
}

export const NAV_SECTIONS: RoleNavSection[] = [{
  title: "Workspaces", defaultOpen: true,
  items: [
    { key: "ownerDashboard", label: "Overview", icon: "👑" },
    { key: "institutionWorkspace", label: "Institutions", icon: "🏫" },
    { key: "users", label: "User Roles", icon: "👥" },
    { key: "ownerBillingWorkspace", label: "Billing", icon: "💳" },
    { key: "ownerSystemWorkspace", label: "System", icon: "⚙️" },
    { key: "ownerCommsWorkspace", label: "Communication", icon: "📢" },
  ],
}];

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  ownerDashboard: OwnerDashboardRoute,
  institutionWorkspace: InstitutionWorkspace,
  users: Ownerusers,
  ownerBillingWorkspace: OwnerBillingWorkspace,
  ownerSystemWorkspace: OwnerSystemWorkspace,
  ownerCommsWorkspace: OwnerCommsWorkspace,

  // Legacy navigation targets from existing owner modules.
  schools: SchoolsPage,
  branches: OwnerBranchesPage,
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
      portalSubtitle="Institutions, user access, billing and account management"
      homeKey="ownerDashboard"
      allowedRoles={["owner", "super_admin"] as AppRole[]}
      navSections={NAV_SECTIONS}
      navigationMode="branch-workspace"
      routes={ROUTES}
      lockedContext={false}
      requireSchool={false}
      requireBranch={false}
    />
  );
}
