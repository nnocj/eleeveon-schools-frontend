"use client";

/**
 * app/school-admin/page.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN PORTAL
 * ---------------------------------------------------------
 * School-wide administration workspace.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - School Admin is school-scoped, so schoolId is required but branchId is not.
 * - LocalSettings reads the selected workspace first to avoid stale school/branch
 *   context from another role.
 * - Schooladmindashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates dashboard
 *   cards while preserving RolePortalShell routing.
 *
 * Compile-safe:
 * Modules not written yet can still use placeholders. Replace placeholders with
 * real imports when those module files are ready.
 */

import React from "react";

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";

import { SCHOOL_ADMIN_ROLES } from "../lib/auth/roleRedirect";

import LocalSettings from "../components/role-portals/LocalSettings";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import Schooladmindashboard from "./modules/Schooladmindashboard";
import Branches from "./modules/Branches";
import Schoolusers from "./modules/Schoolusers";
import SchoolFinanceOverview from "./modules/SchoolFinanceOverview";
import SchoolBranchFunding from "./modules/SchoolBranchFunding";
import SchoolBranchFinanceMonitor from "./modules/SchoolBranchFinanceMonitor";
import SchoolFinanceApprovals from "./modules/SchoolFinanceApprovals";
import SchoolPaymentsOverview from "./modules/SchoolPaymentsOverview";
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";
import SchoolCalendar from "./modules/SchoolCalendar";
import BranchCalendar from "./modules/BranchCalendar";
import BranchTimetableOverview from "./modules/BranchTimetableOverview";

// ======================================================
// TYPES
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

// ======================================================
// PLACEHOLDERS
// ======================================================

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
    <main className="sa-placeholder-page">
      <style>{placeholderCss}</style>

      <section className="sa-placeholder-card">
        <div className="sa-placeholder-icon">{icon}</div>

        <div>
          <p>School Admin Module</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>

        <div className="sa-placeholder-note">
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

function SchoolAdminLocalSettingsPage() {
  const { accountId } = useAccount();
  const { settings } = useSettings();

  const {
    activeSchoolId,
    activeSchool,
    activeBranchId,
    activeBranch,
  } = useActiveBranch();

  return (
    <LocalSettings
      portalName="School Admin Portal"
      roleKey="school-admin"
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

function SchoolAdminDashboardRoute(props: RouteProps) {
  return <Schooladmindashboard {...props} navSections={NAV_SECTIONS} />;
}

// ======================================================
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "School Overview",
    defaultOpen: true,
    items: [
      {
        key: "schoolAdminDashboard",
        label: "Dashboard",
        icon: "🏠",
      },
      {
        key: "branches",
        label: "Branches",
        icon: "🏫",
      },
      {
        key: "schoolUsers",
        label: "Users & Roles",
        icon: "👥",
      },
    ],
  },
  {
    title: "Finance",
    defaultOpen: false,
    items: [
      {
        key: "schoolFinanceOverview",
        label: "Finance Overview",
        icon: "💳",
      },
      {
        key: "schoolBranchFunding",
        label: "Branch Funding",
        icon: "🏦",
      },
      {
        key: "schoolBranchFinanceMonitor",
        label: "Branch Finance Monitor",
        icon: "📊",
      },
      {
        key: "schoolFinanceApprovals",
        label: "Approvals",
        icon: "✅",
      },
      {
        key: "schoolPaymentsOverview",
        label: "Payments Overview",
        icon: "🧾",
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
        icon: "📢",
      },
      {
        key: "messages",
        label: "Messages",
        icon: "✉️",
      },
    ],
  },
  {
    title: "Calendar & Timetable",
    defaultOpen: false,
    items: [
      {
        key: "schoolCalendar",
        label: "School Calendar",
        icon: "📅",
      },
      {
        key: "branchCalendar",
        label: "Branch Calendar",
        icon: "📆",
      },
      {
        key: "branchTimetableOverview",
        label: "Branch Timetable",
        icon: "⏰",
      },
    ],
  },
  {
    title: "Settings",
    defaultOpen: false,
    items: [
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
  schoolAdminDashboard: SchoolAdminDashboardRoute,
  branches: Branches,
  schoolUsers: Schoolusers,

  schoolFinanceOverview: SchoolFinanceOverview,
  schoolPaymentsOverview: SchoolPaymentsOverview,
  schoolBranchFunding: SchoolBranchFunding,
  schoolBranchFinanceMonitor: SchoolBranchFinanceMonitor,
  schoolFinanceApprovals: SchoolFinanceApprovals,

  announcements: Announcements,
  messages: Messages,
  schoolCalendar: SchoolCalendar,
  branchCalendar: BranchCalendar,
  branchTimetableOverview: BranchTimetableOverview,

  localSettings: SchoolAdminLocalSettingsPage,
};

// ======================================================
// PAGE
// ======================================================

export default function SchoolAdminPage() {
  return (
    <RolePortalShell
      portalTitle="School Admin Portal"
      portalSubtitle="School-wide administration, analytics and control"
      homeKey="schoolAdminDashboard"
      allowedRoles={SCHOOL_ADMIN_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={false}
    />
  );
}

// ======================================================
// PLACEHOLDER CSS
// ======================================================

const placeholderCss = `
.sa-placeholder-page {
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

.sa-placeholder-card {
  width: min(640px, 100%);
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

.sa-placeholder-icon {
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

.sa-placeholder-card p {
  margin: 0;
  color: var(--primary-color, #2563eb);
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sa-placeholder-card h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: clamp(22px, 5vw, 32px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sa-placeholder-card span {
  display: block;
  margin-top: 6px;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 750;
}

.sa-placeholder-note {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 8%, var(--surface, #ffffff));
  border: 1px solid color-mix(in srgb, var(--primary-color, #2563eb) 18%, var(--border, rgba(0,0,0,.10)));
}

.sa-placeholder-note strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.sa-placeholder-note span {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.55;
  font-weight: 750;
}

@media (max-width: 560px) {
  .sa-placeholder-page {
    padding: calc(8px * var(--local-density-scale, 1));
  }

  .sa-placeholder-card {
    border-radius: 22px;
    padding: 14px;
  }
}
`;
