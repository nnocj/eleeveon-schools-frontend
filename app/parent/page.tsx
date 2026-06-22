"use client";

/**
 * app/parent/page.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL ENTRY
 * ---------------------------------------------------------
 * Parent-scoped child monitoring, communication and payments workspace.
 *
 * Workspace-session aligned:
 * - RolePortalShell opens this portal from the selected workspace session
 *   written by /select-role.
 * - LocalSettings reads the selected workspace first so it does not accidentally
 *   use stale school/branch context from another selected role.
 * - Parentdashboard receives NAV_SECTIONS from this page.
 * - Adding/removing/reordering nav items here automatically updates the
 *   Parent Dashboard module list.
 */

import RolePortalShell, {
  type RoleNavSection,
} from "../components/role-portals/RolePortalShell";

import { PARENT_ROLES } from "../lib/auth/roleRedirect";

import LocalSettings from "../components/role-portals/LocalSettings";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import Parentdashboard from "./modules/Parentdashboard";
import Children from "./modules/Children";
import Childattendance from "./modules/Childattendance";
import Childresults from "./modules/Childresults";
import Childfees from "./modules/Childfees";
import Payments from "./modules/Payments";
import Announcements from "./modules/Announcements";
import Calendar from "./modules/Calendar";
import ChildTimeTable from "./modules/ChildTimetable";
import Messages from "./modules/Messages";
import Parentprofile from "./modules/Parentprofile";

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
// NAVIGATION
// ======================================================

export const NAV_SECTIONS: RoleNavSection[] = [
  {
    title: "My Children",
    defaultOpen: true,
    items: [
      {
        key: "parentDashboard",
        label: "Dashboard",
        icon: "🏠",
      },
      {
        key: "children",
        label: "Children",
        icon: "🧒",
      },
      {
        key: "childAttendance",
        label: "Attendance",
        icon: "📅",
      },
      {
        key: "childResults",
        label: "Results",
        icon: "📊",
      },
    ],
  },
  {
    title: "Fees & Payments",
    defaultOpen: true,
    items: [
      {
        key: "childFees",
        label: "Fee Statements",
        icon: "💳",
      },
      {
        key: "payments",
        label: "Payment History",
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
        icon: "📣",
      },
      {
        key: "messages",
        label: "Messages",
        icon: "✉️",
      },
    ],
  },
  {
    title: "Timetable",
    defaultOpen: false,
    items: [
      {
        key: "calendar",
        label: "Calendar",
        icon: "📆",
      },
      {
        key: "childTimetable",
        label: "My Child's Timetable",
        icon: "📚",
      },
    ],
  },
  {
    title: "Preferences",
    defaultOpen: false,
    items: [
      {
        key: "localSettings",
        label: "Local Settings",
        icon: "⚙️",
      },
      {
        key: "parentProfile",
        label: "Profile",
        icon: "👤",
      },
    ],
  },
];

// ======================================================
// ROUTE WRAPPERS
// ======================================================

function ParentDashboardRoute(props: RouteProps) {
  return <Parentdashboard {...props} navSections={NAV_SECTIONS} />;
}

function ParentLocalSettingsPage() {
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
      portalName="Parent Portal"
      roleKey="parent"
      accountId={accountId}
      schoolId={selectedWorkspaceSchoolId({ activeSchoolId, activeSchool, settings })}
      branchId={selectedWorkspaceBranchId({ activeBranchId, activeBranch, settings })}
      primaryColor={settings?.primaryColor || "var(--primary-color, #2563eb)"}
      inline={true}
    />
  );
}

// ======================================================
// ROUTES
// ======================================================

const ROUTES: Record<string, React.ComponentType<RouteProps>> = {
  parentDashboard: ParentDashboardRoute,
  children: Children,
  childAttendance: Childattendance,
  childResults: Childresults,
  childFees: Childfees,
  payments: Payments,
  announcements: Announcements,
  messages: Messages,
  calendar: Calendar,
  childTimetable: ChildTimeTable,
  localSettings: ParentLocalSettingsPage,
  parentProfile: Parentprofile,
};

export default function ParentPage() {
  return (
    <RolePortalShell
      portalTitle="Parent Portal"
      portalSubtitle="Child monitoring and payments workspace"
      homeKey="parentDashboard"
      allowedRoles={PARENT_ROLES}
      navSections={NAV_SECTIONS}
      routes={ROUTES}
      lockedContext={true}
      requireSchool={true}
      requireBranch={true}
    />
  );
}
