"use client";

/**
 * app/components/role-portals/RolePortalShell.tsx
 * ---------------------------------------------------------
 * ROLE PORTAL SHELL - FULL CONTEXT VERSION
 * ---------------------------------------------------------
 * Drop-in replacement.
 *
 * Full-context upgrade:
 * - consumes the live account, membership, institution, settings, theme,
 *   database, sync, status-sheet and realtime contexts;
 * - applies the active theme values at the shell root;
 * - passes one stable RolePortalRuntimeContext object to every active route;
 * - keeps existing route components compatible because extra props are additive.
 *
 * New contract:
 * - /select-role opens a workspace and writes a complete workspace session.
 * - This shell reads that opened workspace session synchronously before doing
 *   any access checks.
 * - Profile portals (student, teacher, parent) are allowed ONLY by the selected
 *   membership, never by broad user/account role fallback.
 * - Admin/owner/accountant/developer portals can use the selected membership or
 *   the user/account role membership as appropriate.
 * - School/branch context is resolved from ActiveBranchContext first, then the
 *   selected membership, then localStorage/sessionStorage. This prevents bounce
 *   during route transitions.
 * - Routine sync/account checks stay silent; only real applied data changes
 *   show the small nonblocking background indicator.
 * - Logout is atomic and preserves offline IndexedDB school data.
 *
 * Unified appearance ownership:
 * - SettingsContext remains authoritative for branch colour and typography;
 * - LocalAppearanceRuntime remains authoritative for the complete light/dark
 *   surface palette;
 * - this shell publishes branding variables only;
 * - shell surfaces derive from the already-applied shared appearance variables;
 * - the shell no longer overrides --bg, --surface, --card, --text, or --border;
 * - Branch Settings Light/Dark and Local Settings Light/Dark therefore produce
 *   the same visual palette throughout the portal.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useSyncBootstrap } from "../../context/sync-bootstrap-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { useRealtimeStatus } from "../../hooks/useRealtimeStatus";
import { useRealtime } from "../../context/realtime-context";
import { useTheme } from "../../context/theme-context";
import { useDatabase } from "../../context/database-context";
import SyncStatusSheet from "../SyncStatusSheet";
import { useSyncContext } from "../../context/sync-context";
import {
  WorkspaceTransitionProvider,
  useWorkspaceTransition,
} from "../workspace";
import { bootstrapSelectedWorkspace } from "../../lib/sync/workspaceBootstrap";

import {
  usePortalAppearanceReadiness,
} from "../PortalAppearanceRuntime";

import {
  appearanceIdentityFor,
  appearanceIdentityMatches,
  appearanceScopeForRole,
} from "../../lib/theme/appearanceScope";

import type { AppRole, UserMembership } from "../../lib/auth/roleRedirect";
import {
  collectUserMemberships,
  getPortalPathByRole,
  membershipCanAccess,
} from "../../lib/auth/roleRedirect";

export type RoleNavItem = {
  key: string;
  label: string;
  icon: string;
};

export type RoleNavSection = {
  title: string;
  defaultOpen?: boolean;
  items: RoleNavItem[];
};

export type RolePortalRuntimeContext = {
  accountId: string | null;
  user: ReturnType<typeof useAccount>["user"];
  account: ReturnType<typeof useAccount>["account"];
  subscription: ReturnType<typeof useAccount>["subscription"];
  authenticated: boolean;
  offline: boolean;
  restoring: boolean;
  verifying: boolean;
  sessionVerified: boolean;

  membership: UserMembership | null;
  memberships: UserMembership[];
  activeRole: string | null;
  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;

  schoolId: string | null;
  school: ReturnType<typeof useActiveBranch>["activeSchool"];
  schools: ReturnType<typeof useActiveBranch>["schools"];
  branchId: string | null;
  branch: ReturnType<typeof useActiveBranch>["activeBranch"];
  branches: ReturnType<typeof useActiveBranch>["branches"];
  allBranches: ReturnType<typeof useActiveBranch>["allBranches"];

  settings: ReturnType<typeof useSettings>["settings"];
  theme: ReturnType<typeof useTheme>;
  database: ReturnType<typeof useDatabase>;
  sync: ReturnType<typeof useSyncBootstrap>;
  syncPanel: ReturnType<typeof useSyncContext>;
  realtime: ReturnType<typeof useRealtime>;
  appearance: ReturnType<typeof usePortalAppearanceReadiness>;

  refreshAccount: ReturnType<typeof useAccount>["refreshAccount"];
  refreshInstitution: ReturnType<typeof useActiveBranch>["refreshInstitution"];
  refreshSettings: ReturnType<typeof useSettings>["refreshSettings"];
  refreshTheme: ReturnType<typeof useTheme>["refreshTheme"];
  setActiveMembership: ReturnType<typeof useActiveMembership>["setActiveMembership"];
  setActiveSchoolId: ReturnType<typeof useActiveBranch>["setActiveSchoolId"];
  setActiveBranchId: ReturnType<typeof useActiveBranch>["setActiveBranchId"];
};

export type RolePortalRouteProps = {
  navigate: (key: string) => void;
  context?: RolePortalRuntimeContext;
};

/**
 * Route components in the existing portals were created over several phases.
 * Some accept only `{ navigate }`; rebuilt routes may also accept `context`.
 *
 * React.ComponentType is invariant enough that a record explicitly typed with
 * the legacy props cannot be assigned to a record typed with the newer props,
 * even though `context` is optional. Keep the registry backward-compatible and
 * provide the strongly typed props for newly rebuilt modules separately.
 */
export type RolePortalRouteComponent = React.ComponentType<any>;

export type RolePortalShellProps = {
  portalTitle: string;
  portalSubtitle: string;
  homeKey: string;
  allowedRoles: AppRole[];
  navSections: RoleNavSection[];
  routes: Record<string, RolePortalRouteComponent>;
  lockedContext?: boolean;
  requireSchool?: boolean;
  requireBranch?: boolean;
};

const MEMBERSHIP_BACKUP_KEY = "eleeveon_user_memberships";
const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: UserMembership | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  openedAt?: number;
};

function safeRead(key: string) {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key) || window.sessionStorage.getItem(key); } catch { return null; }
}

function safeJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch {}
  try { window.sessionStorage.setItem(key, value); } catch {}
}

function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch {}
  try { window.sessionStorage.removeItem(key); } catch {}
}

function toPermanentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed || null;
}

function firstPermanentId(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPermanentId(value);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeMembership(membership?: UserMembership | null): UserMembership | null {
  if (!membership) return null;

  const schoolId = firstPermanentId(
    membership.schoolId,
    membership.school?.id,
    membership.activeSchoolId,
    membership.contextSchoolId
  );

  const branchId = firstPermanentId(
    membership.branchId,
    membership.schoolBranchId,
    membership.branch?.id,
    membership.activeBranchId,
    membership.contextBranchId
  );

  const teacherId = firstPermanentId(
    membership.teacherId,
    membership.teacher?.id
  );

  const studentId = firstPermanentId(
    membership.studentId,
    membership.student?.id
  );

  const parentId = firstPermanentId(
    membership.parentId,
    membership.parent?.id
  );

  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherId,
    studentId,
    parentId,
    active: membership.active !== false,
  };
}

function membershipKey(membership?: UserMembership | null, fallback = "membership") {
  if (!membership) return fallback;
  return String(
    membership.id ??
      `${membership.role}-${membership.schoolId ?? "account"}-${membership.branchId ?? "root"}-${
        membership.teacherId ?? membership.studentId ?? membership.parentId ?? "portal"
      }`
  );
}

function sameMembership(a?: UserMembership | null, b?: UserMembership | null) {
  if (!a || !b) return false;
  return membershipKey(a) === membershipKey(b);
}

function membershipIsUsable(membership?: UserMembership | null) {
  if (!membership) return false;
  if (membership.active === false) return false;
  if (membership.isActive === false) return false;
  if (membership.disabled === true) return false;
  if (membership.isDeleted === true) return false;

  const status = String(membership.status || "").trim().toLowerCase();
  return !["inactive", "disabled", "deleted", "blocked", "suspended"].includes(status);
}

function profileRoleHasPermanentId(membership?: UserMembership | null) {
  const normalized = normalizeMembership(membership);
  if (!normalized) return false;
  if (normalized.role === "student") return Boolean(normalized.studentId);
  if (normalized.role === "teacher") return Boolean(normalized.teacherId);
  if (normalized.role === "parent") return Boolean(normalized.parentId);
  return true;
}

function portalRequiresProfileMembership(allowedRoles: AppRole[]) {
  return allowedRoles.some((role) => ["student", "teacher", "parent"].includes(String(role)));
}

function roleAllowed(role: string | null | undefined, allowedRoles: AppRole[]) {
  if (!role) return false;
  return allowedRoles.map(String).includes(String(role));
}

function readStoredMemberships() {
  const stored = safeJson<UserMembership[]>(MEMBERSHIP_BACKUP_KEY);
  return Array.isArray(stored) ? stored.map(normalizeMembership).filter(Boolean) as UserMembership[] : [];
}

function readOpenWorkspaceSession(): OpenWorkspaceSession | null {
  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return normalizeMembership(safeJson<UserMembership>("activeMembership"));
}

function writeWorkspaceSession(membership: UserMembership) {
  const normalized = normalizeMembership(membership);
  if (!normalized) return null;

  const id = membershipKey(normalized);
  safeSet("activeMembership", JSON.stringify(normalized));
  safeSet("activeMembershipId", id);
  safeSet("activeRole", normalized.role || "");

  const schoolId = toPermanentId(normalized.schoolId);
  const branchId = toPermanentId(normalized.branchId);
  const teacherId = toPermanentId(normalized.teacherId);
  const studentId = toPermanentId(normalized.studentId);
  const parentId = toPermanentId(normalized.parentId);

  if (schoolId) safeSet("activeSchoolId", String(schoolId)); else safeRemove("activeSchoolId");
  if (branchId) safeSet("activeBranchId", String(branchId)); else safeRemove("activeBranchId");
  if (teacherId) safeSet("activeTeacherId", String(teacherId)); else safeRemove("activeTeacherId");
  if (studentId) safeSet("activeStudentId", String(studentId)); else safeRemove("activeStudentId");
  if (parentId) safeSet("activeParentId", String(parentId)); else safeRemove("activeParentId");

  safeSet(
    OPEN_WORKSPACE_KEY,
    JSON.stringify({
      membership: normalized,
      membershipId: id,
      role: normalized.role,
      schoolId,
      branchId,
      teacherId: teacherId,
      studentId: studentId,
      parentId: parentId,
      openedAt: Date.now(),
    })
  );

  return normalized;
}

function readStoredId(...keys: string[]) {
  for (const key of keys) {
    const parsed = toPermanentId(safeRead(key));
    if (parsed) return parsed;
  }
  return null;
}

function roleLabel(role: string) {
  if (role === "developer") return "Developer";
  if (role === "platform_team") return "Platform Team";
  if (role === "owner") return "Owner";
  if (role === "super_admin") return "Owner / Super Admin";
  if (role === "branch_admin") return "Branch Admin";
  if (role === "admin") return "School Admin";
  if (role === "accountant") return "Accountant";
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  if (role === "parent") return "Parent";
  return String(role || "User").replaceAll("_", " ");
}

function roleIcon(role: string) {
  if (role === "developer") return "🛠️";
  if (role === "platform_team") return "🧩";
  if (role === "owner" || role === "super_admin") return "👑";
  if (role === "branch_admin") return "🏛️";
  if (role === "admin") return "🏫";
  if (role === "accountant") return "💰";
  if (role === "teacher") return "👨‍🏫";
  if (role === "student") return "🧑‍🎓";
  if (role === "parent") return "👨‍👩‍👧";
  return "👤";
}

function roleScope(membership: UserMembership) {
  if (!membership.schoolId && !membership.branchId) return "Account level";
  if (membership.schoolId && membership.branchId) return `School ${membership.schoolId} · Branch ${membership.branchId}`;
  if (membership.schoolId) return `School ${membership.schoolId}`;
  return `Branch ${membership.branchId || "workspace"}`;
}

function roleDetail(membership: UserMembership) {
  const normalized = normalizeMembership(membership) || membership;
  if (normalized.teacherId) return `Teacher profile ${normalized.teacherId}`;
  if (normalized.studentId) return `Student profile ${normalized.studentId}`;
  if (normalized.parentId) return `Parent profile ${normalized.parentId}`;
  return "Workspace access";
}

function selectedMemberName(args: {
  openedWorkspace?: OpenWorkspaceSession | null;
  selectedMembership?: UserMembership | null;
  user?: any | null;
  account?: any | null;
}) {
  const workspace = args.openedWorkspace || {};
  const membership: any = args.selectedMembership || {};

  return String(
    (workspace as any).memberName ||
      (workspace as any).fullName ||
      (workspace as any).userName ||
      (workspace as any).name ||
      membership.fullName ||
      membership.memberName ||
      membership.userName ||
      args.user?.fullName ||
      args.user?.name ||
      args.user?.email ||
      args.account?.name ||
      "Signed-in member"
  ).trim();
}

function selectedMemberMeta(args: {
  openedWorkspace?: OpenWorkspaceSession | null;
  selectedMembership?: UserMembership | null;
}) {
  const workspace = args.openedWorkspace || {};
  const membership: any = args.selectedMembership || {};

  const role = String(workspace.role || membership.role || "member").replaceAll("_", " ");
  const schoolId = workspace.schoolId ?? membership.schoolId;
  const branchId = workspace.branchId ?? membership.branchId;
  const profileId =
    workspace.teacherId ??
    workspace.studentId ??
    workspace.parentId ??
    membership.teacherId ??
    membership.studentId ??
    membership.parentId;

  const scope =
    schoolId && branchId
      ? `School ${schoolId} · Branch ${branchId}`
      : schoolId
        ? `School ${schoolId}`
        : branchId
          ? `Branch ${branchId}`
          : "Account";

  return `${role} · ${scope}${profileId ? ` · Profile ${profileId}` : ""}`;
}

function pickMembership(args: {
  memberships: UserMembership[];
  allowedRoles: AppRole[];
  activeSchoolId?: string | null;
  activeBranchId?: string | null;
}) {
  return (
    args.memberships.find((membership) => {
      if (!roleAllowed(membership.role, args.allowedRoles)) return false;
      if (!membershipIsUsable(membership)) return false;

      const schoolMatches =
        !args.activeSchoolId || !membership.schoolId || String(membership.schoolId) === String(args.activeSchoolId);
      const branchMatches =
        !args.activeBranchId || !membership.branchId || String(membership.branchId) === String(args.activeBranchId);

      return schoolMatches && branchMatches;
    }) ||
    args.memberships.find((membership) => roleAllowed(membership.role, args.allowedRoles) && membershipIsUsable(membership)) ||
    null
  );
}

function protectedPortalCanAccess(selectedMembership: UserMembership | null, allowedRoles: AppRole[]) {
  if (!selectedMembership) return false;
  if (!roleAllowed(selectedMembership.role, allowedRoles)) return false;
  if (!membershipIsUsable(selectedMembership)) return false;
  return profileRoleHasPermanentId(selectedMembership);
}



function RolePortalShellContent({
  portalTitle,
  portalSubtitle,
  homeKey,
  allowedRoles,
  navSections,
  routes,
  lockedContext = true,
  requireSchool = true,
  requireBranch = true,
}: RolePortalShellProps) {
  const router = useRouter();
  const { runTransition } = useWorkspaceTransition();

  const accountContext = useAccount();
  const membershipContext = useActiveMembership();
  const institutionContext = useActiveBranch();
  const settingsContext = useSettings();
  const themeContext = useTheme();
  const databaseContext = useDatabase();
  const syncContext = useSyncBootstrap();
  const syncPanelContext = useSyncContext();
  const realtimeContext = useRealtime();
  const appearanceContext = usePortalAppearanceReadiness();

  const {
    initialSyncDone,
    applyingChanges,
  } = syncContext;

  const {
    openStatusSheet,
  } = syncPanelContext;

  const {
    connected: realtimeConnected,
    status: realtimeStatus,
  } = useRealtimeStatus();

  const {
    accountId,
    user,
    account,
    subscription,
    logout,
    refreshAccount,
    loading: accountLoading,
    restoring: accountRestoring,
    verifying: accountVerifying,
    sessionVerified,
    authenticated,
    offline: accountOffline,
  } = accountContext;

  const {
    activeMembership,
    activeRole,
    activeTeacherId,
    activeStudentId,
    activeParentId,
    restored: membershipRestored,
    setActiveMembership,
    beginMembershipTransition,
    completeMembershipTransition,
    failMembershipTransition,
  } = membershipContext;

  const {
    settings,
    loading: settingsLoading,
    refreshSettings,
  } = settingsContext;

  /**
   * Live appearance values
   * ------------------------------------------------------------------------
   * SettingsContext is the authoritative source for the currently selected
   * school/branch. ThemeContext remains a safe fallback while settings are
   * restoring, but it must never override a freshly saved branch appearance.
   */
  const resolvedPrimaryColor =
    settings?.primaryColor ||
    themeContext.primaryColor ||
    "#2f6fed";

  const resolvedFontFamily =
    settings?.fontFamily ||
    themeContext.fontFamily ||
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const resolvedFontSize =
    Number(settings?.fontSize) ||
    themeContext.fontSize ||
    16;

  /**
   * Publish branding variables at document level as well as at the shell root.
   *
   * Many existing and rebuilt portal modules consume global CSS variables
   * directly. Keeping these variables synchronized means a Branch Settings
   * save updates the sidebar, header, shared controls and active module without
   * requiring a page reload or a role/workspace switch.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    root.style.setProperty(
      "--primary-color",
      resolvedPrimaryColor,
    );
    root.style.setProperty(
      "--dashboard-primary",
      resolvedPrimaryColor,
    );
    root.style.setProperty(
      "--branch-primary",
      resolvedPrimaryColor,
    );
    root.style.setProperty(
      "--accent-color",
      resolvedPrimaryColor,
    );
    root.style.setProperty(
      "--font-family",
      resolvedFontFamily,
    );
    root.style.setProperty(
      "--font-size",
      `${resolvedFontSize}px`,
    );
  }, [
    resolvedPrimaryColor,
    resolvedFontFamily,
    resolvedFontSize,
  ]);

  const {
    activeSchoolId,
    activeSchool,
    schools,
    setActiveSchoolId,
    activeBranchId,
    activeBranch,
    branches,
    allBranches,
    setActiveBranchId,
    loading: contextLoading,
    refreshInstitution,
  } = institutionContext;

  const openedWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const storedActiveMembership = useMemo(() => {
    return normalizeMembership(openedWorkspace?.membership) || readStoredActiveMembership();
  }, [openedWorkspace]);

  const allMemberships = useMemo(() => {
    const merged = [
      ...collectUserMemberships(account),
      ...collectUserMemberships(user),
      ...readStoredMemberships(),
      ...(storedActiveMembership ? [storedActiveMembership] : []),
    ];

    const unique = new Map<string, UserMembership>();

    merged
      .map(normalizeMembership)
      .filter(Boolean)
      .filter(membershipIsUsable)
      .forEach((membership) => {
        unique.set(membershipKey(membership), membership as UserMembership);
      });

    const list = [...unique.values()];
    if (list.length) safeSet(MEMBERSHIP_BACKUP_KEY, JSON.stringify(list));
    return list;
  }, [account, user, storedActiveMembership]);

  const protectedProfilePortal = useMemo(
    () => portalRequiresProfileMembership(allowedRoles),
    [allowedRoles]
  );

  const matchingMemberships = useMemo(() => {
    return allMemberships.filter((membership) => {
      if (!roleAllowed(membership.role, allowedRoles)) return false;
      if (!membershipIsUsable(membership)) return false;
      if (protectedProfilePortal && !profileRoleHasPermanentId(membership)) return false;
      return true;
    });
  }, [allMemberships, allowedRoles, protectedProfilePortal]);

  const selectedMembership = useMemo(() => {
    const normalizedActive = normalizeMembership(activeMembership) || storedActiveMembership;

    if (
      normalizedActive &&
      roleAllowed(normalizedActive.role, allowedRoles) &&
      membershipIsUsable(normalizedActive) &&
      (!protectedProfilePortal || profileRoleHasPermanentId(normalizedActive))
    ) {
      return normalizedActive;
    }

    if (protectedProfilePortal) {
      return matchingMemberships.length === 1 ? matchingMemberships[0] : null;
    }

    return pickMembership({
      memberships: allMemberships,
      allowedRoles,
      activeSchoolId,
      activeBranchId,
    });
  }, [
    activeMembership,
    storedActiveMembership,
    allMemberships,
    allowedRoles,
    activeSchoolId,
    activeBranchId,
    protectedProfilePortal,
    matchingMemberships,
  ]);

  const effectiveSchoolId = useMemo(
    () =>
      toPermanentId(activeSchoolId) ||
      toPermanentId(selectedMembership?.schoolId) ||
      toPermanentId(openedWorkspace?.schoolId) ||
      readStoredId("activeSchoolId"),
    [activeSchoolId, selectedMembership?.schoolId, openedWorkspace]
  );

  const effectiveBranchId = useMemo(
    () =>
      toPermanentId(activeBranchId) ||
      toPermanentId(selectedMembership?.branchId) ||
      toPermanentId(openedWorkspace?.branchId) ||
      readStoredId("activeBranchId"),
    [activeBranchId, selectedMembership?.branchId, openedWorkspace]
  );

  /**
   * Exact appearance identity expected by the currently opened portal.
   *
   * The role mapping is centralized in appearanceScopeForRole(). Branch
   * identities include school and branch IDs; Owner/Developer identities do
   * not, so a previously applied branch theme can never satisfy their gate.
   */
  const expectedAppearance = useMemo(() => {
    const role =
      activeRole ||
      selectedMembership?.role ||
      null;

    if (!role) return null;

    return appearanceIdentityFor({
      role,
      accountId,
      schoolId: effectiveSchoolId,
      branchId: effectiveBranchId,
    });
  }, [
    activeRole,
    selectedMembership?.role,
    accountId,
    effectiveSchoolId,
    effectiveBranchId,
  ]);

  const expectedScope = useMemo(
    () =>
      appearanceScopeForRole(
        activeRole ||
          selectedMembership?.role ||
          "",
      ),
    [
      activeRole,
      selectedMembership?.role,
    ],
  );

  /**
   * Records the exact appearance identity that has successfully rendered.
   *
   * Once an identity has rendered, later background settings refreshes do not
   * replace the visible portal with an opening screen. A new role, school, or
   * branch produces a different key and receives its own first-entry gate.
   */
  const renderedWorkspaceRef =
    useRef<string | null>(null);

  const appearanceMatchesRole = Boolean(
    expectedAppearance &&
      themeContext.ready &&
      appearanceContext.firstEntryReady &&
      themeContext.effectiveScope ===
        expectedScope &&
      appearanceIdentityMatches(
        themeContext.appliedFor,
        expectedAppearance,
      ) &&
      appearanceIdentityMatches(
        appearanceContext.appliedFor,
        expectedAppearance,
      ),
  );

  const currentAppearanceWasRendered =
    Boolean(
      expectedAppearance &&
        renderedWorkspaceRef.current ===
          expectedAppearance.key,
    );

  useEffect(() => {
    if (
      appearanceMatchesRole &&
      expectedAppearance
    ) {
      renderedWorkspaceRef.current =
        expectedAppearance.key;
    }
  }, [
    appearanceMatchesRole,
    expectedAppearance,
  ]);

  useEffect(() => {
    if (!authenticated || !accountId || !selectedMembership) return;
    if (activeMembership && sameMembership(normalizeMembership(activeMembership), selectedMembership)) return;

    const normalized = writeWorkspaceSession(selectedMembership);
    if (normalized) {
      setActiveMembership(normalized).catch((error: any) => {
        console.error("Failed to persist selected workspace:", error);
      });
    }
  }, [authenticated, accountId, selectedMembership, activeMembership, setActiveMembership]);

  const switchableMemberships = useMemo(
    () => allMemberships.filter((membership) => membership.active !== false),
    [allMemberships]
  );

  const hasMultipleMemberships = switchableMemberships.length > 1;

  const canAccess = useMemo(() => {
    if (protectedProfilePortal) {
      return protectedPortalCanAccess(selectedMembership, allowedRoles);
    }

    if (selectedMembership && roleAllowed(selectedMembership.role, allowedRoles)) return true;

    return membershipCanAccess({
      role: account?.role || user?.role,
      memberships: allMemberships,
      selectedMembership,
      allowedRoles,
      schoolId: effectiveSchoolId,
      branchId: effectiveBranchId,
    });
  }, [
    account,
    user,
    allMemberships,
    selectedMembership,
    allowedRoles,
    effectiveSchoolId,
    effectiveBranchId,
    protectedProfilePortal,
  ]);

  useEffect(() => {
    // Background sync/account verification must not remove the visible portal.
    if (accountRestoring || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (sessionVerified && initialSyncDone && !canAccess) {
      router.replace("/select-role");
      return;
    }

    if (
      sessionVerified &&
      initialSyncDone &&
      ((requireSchool && !effectiveSchoolId) || (requireBranch && !effectiveBranchId))
    ) {
      router.replace("/select-role");
    }
  }, [
    accountRestoring,
    contextLoading,
    sessionVerified,
    initialSyncDone,
    authenticated,
    accountId,
    canAccess,
    requireSchool,
    requireBranch,
    effectiveSchoolId,
    effectiveBranchId,
    router,
  ]);

  const labels = useMemo(() => {
    const out: Record<string, string> = {};
    navSections.forEach((section) =>
      section.items.forEach((item) => {
        out[item.key] = item.label;
      })
    );
    return out;
  }, [navSections]);

  const groups = useMemo(() => {
    const out: Record<string, string> = {};
    navSections.forEach((section) =>
      section.items.forEach((item) => {
        out[item.key] = section.title;
      })
    );
    return out;
  }, [navSections]);

  const [tab, setTab] = useState(homeKey);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [contextOpen, setContextOpen] = useState(false);
  const [roleSwitchOpen, setRoleSwitchOpen] = useState(false);
  const [switchingMembershipId, setSwitchingMembershipId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    navSections.reduce((acc, section) => {
      acc[section.title] = section.defaultOpen !== false;
      return acc;
    }, {} as Record<string, boolean>)
  );

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const visibleMemberName = useMemo(
    () =>
      selectedMemberName({
        openedWorkspace,
        selectedMembership,
        user,
        account,
      }),
    [openedWorkspace, selectedMembership, user, account]
  );

  const visibleMemberMeta = useMemo(
    () =>
      selectedMemberMeta({
        openedWorkspace,
        selectedMembership,
      }),
    [openedWorkspace, selectedMembership]
  );

  const ActiveComponent = useMemo(
    () => routes[tab] ?? routes[homeKey],
    [routes, tab, homeKey]
  );

  const activeLabel = labels[tab] ?? portalTitle;
  const activeGroup = groups[tab] ?? portalSubtitle;
  const hasUsableWorkspace = Boolean(
    selectedMembership &&
      canAccess,
  );

  const accountOrWorkspaceChecking =
    (
      accountRestoring ||
      accountLoading ||
      !membershipRestored ||
      contextLoading ||
      !databaseContext.ready
    ) &&
    !hasUsableWorkspace;

  /**
   * Appearance blocks only the first render of the exact role/workspace.
   *
   * Once this identity has rendered, settings/theme refreshes are treated as
   * background work and the active module remains mounted.
   */
  const firstAppearanceChecking =
    Boolean(
      hasUsableWorkspace &&
        expectedAppearance &&
        !currentAppearanceWasRendered &&
        !appearanceMatchesRole,
    );

  const checking =
    accountOrWorkspaceChecking ||
    firstAppearanceChecking;

  const portalRuntimeContext = useMemo<RolePortalRuntimeContext>(
    () => ({
      accountId,
      user,
      account,
      subscription,
      authenticated,
      offline: accountOffline || !isOnline,
      restoring: accountRestoring,
      verifying: accountVerifying,
      sessionVerified,

      membership: selectedMembership,
      memberships: switchableMemberships,
      activeRole: activeRole || selectedMembership?.role || null,
      teacherId:
        activeTeacherId || toPermanentId(selectedMembership?.teacherId),
      studentId:
        activeStudentId || toPermanentId(selectedMembership?.studentId),
      parentId:
        activeParentId || toPermanentId(selectedMembership?.parentId),

      schoolId: effectiveSchoolId,
      school: activeSchool,
      schools,
      branchId: effectiveBranchId,
      branch: activeBranch,
      branches,
      allBranches,

      settings,
      theme: themeContext,
      database: databaseContext,
      sync: syncContext,
      syncPanel: syncPanelContext,
      realtime: realtimeContext,
      appearance: appearanceContext,

      refreshAccount,
      refreshInstitution,
      refreshSettings,
      refreshTheme: themeContext.refreshTheme,
      setActiveMembership,
      setActiveSchoolId,
      setActiveBranchId,
    }),
    [
      accountId,
      user,
      account,
      subscription,
      authenticated,
      accountOffline,
      isOnline,
      accountRestoring,
      accountVerifying,
      sessionVerified,
      selectedMembership,
      switchableMemberships,
      activeRole,
      activeTeacherId,
      activeStudentId,
      activeParentId,
      effectiveSchoolId,
      activeSchool,
      schools,
      effectiveBranchId,
      activeBranch,
      branches,
      allBranches,
      settings,
      themeContext,
      databaseContext,
      syncContext,
      syncPanelContext,
      realtimeContext,
      appearanceContext,
      refreshAccount,
      refreshInstitution,
      refreshSettings,
      setActiveMembership,
      setActiveSchoolId,
      setActiveBranchId,
    ],
  );

  const navigate = (key: string) => {
    setTab(key);
    setSidebarOpen(false);
    setMoreOpen(false);
    setRoleSwitchOpen(false);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleLogout = useCallback(async () => {
    setMoreOpen(false);
    setContextOpen(false);
    setRoleSwitchOpen(false);
    setSidebarOpen(false);
    await logout();
  }, [logout]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const switchMembership = async (membership: UserMembership) => {
    const normalized = normalizeMembership(membership) || membership;
    const id = membershipKey(normalized);

    try {
      setSwitchingMembershipId(id);

      await runTransition(
        {
          mode: "role-switch",
          membership: normalized,
          title: "Switching workspace…",
          detail: "Preparing the selected role and downloading its permitted data.",
        },
        async ({ setStage, setBootstrapProgress }) => {
          setStage("access", {
            detail: "Validating access for the selected role and workspace.",
          });

          const opened = writeWorkspaceSession(normalized) || normalized;
          beginMembershipTransition(opened);

          setStage("membership", {
            detail: `Activating ${roleLabel(opened.role)} and its profile context.`,
          });
          await setActiveMembership(opened);

          /*
           * This is the critical part that was missing before.
           * The transition now runs the same protected workspace bootstrap used
           * by the first role-selection load. It does not merely animate a data
           * stage: it downloads, validates and commits every permitted table.
           */
          const scope = appearanceScopeForRole(opened.role);
          if (scope === "school" || scope === "branch") {
            await bootstrapSelectedWorkspace(opened, {
              force: true,
              allowCached: false,
              onProgress: setBootstrapProgress,
            });
          }

          /*
           * Refresh contexts only after the bootstrap transaction has committed
           * its records to IndexedDB, so each context reads the new workspace.
           */
          setStage("institution");
          await refreshInstitution();

          setStage("settings");
          await refreshSettings();

          setStage("branding");
          await refreshAccount({
            background: true,
            reason: "membership-change",
          });

          setStage("appearance");
          await themeContext.refreshTheme();

          /* Let React publish the refreshed context values before navigation. */
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() =>
              window.requestAnimationFrame(() => resolve()),
            );
          });

          completeMembershipTransition();

          setMoreOpen(false);
          setContextOpen(false);
          setRoleSwitchOpen(false);

          setStage("dashboard", {
            detail: `Opening the ${roleLabel(opened.role)} workspace with its prepared local data.`,
          });

          window.location.replace(getPortalPathByRole(opened.role));
        },
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to prepare the selected workspace.";
      failMembershipTransition(message);
      console.error("Failed to switch role/workspace:", error);
      setSwitchingMembershipId(null);
    }
  };

  const handleSidebarResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handleMove = (moveEvent: MouseEvent) => {
        setSidebarWidth(
          Math.min(380, Math.max(240, startWidth + moveEvent.clientX - startX))
        );
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [sidebarWidth]
  );

  if (checking) {
    const preparingAppearance =
      firstAppearanceChecking;

    return (
      <CenterCard
        title={
          preparingAppearance
            ? "Preparing your workspace"
            : `Opening ${portalTitle}...`
        }
        text={
          preparingAppearance
            ? appearanceContext.error ||
              "Applying the correct role, school, branch, colour, branding, and display settings."
            : "Checking your account and selected workspace."
        }
        spin={!appearanceContext.error}
      />
    );
  }

  if (!authenticated || !accountId) {
    return <CenterCard title="Redirecting to login..." text="You must sign in to continue." />;
  }

  if (!canAccess) {
    return (
      <CenterCard
        title="Choose workspace"
        text="This portal needs an opened role/workspace session. Return to Select Role and open the role again."
      />
    );
  }

  if ((requireSchool && !effectiveSchoolId) || (requireBranch && !effectiveBranchId)) {
    return (
      <CenterCard
        title="Workspace context required"
        text="This role needs a school or branch context. Return to Select Role and open the workspace again."
      />
    );
  }

  return (
    <main
      className="role-shell"
      data-appearance-scope={
        themeContext.effectiveScope
      }
      data-appearance-key={
        themeContext.appliedFor?.key ||
        undefined
      }
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--primary-color":
            resolvedPrimaryColor,
          "--dashboard-primary":
            resolvedPrimaryColor,
          "--branch-primary":
            resolvedPrimaryColor,
          "--accent-color":
            resolvedPrimaryColor,
          "--font-family":
            resolvedFontFamily,
          "--font-size":
            `${resolvedFontSize}px`,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {/* Phase 20: mounted in the active portal so the status dot can open it. */}
      <SyncStatusSheet />

      {applyingChanges && (
        <div className="background-refresh-indicator" aria-live="polite">
          Applying new data…
        </div>
      )}

      {(sidebarOpen || contextOpen || roleSwitchOpen) && (
        <button
          aria-label="Close drawer"
          className="app-overlay"
          onClick={() => {
            setSidebarOpen(false);
            setContextOpen(false);
            setRoleSwitchOpen(false);
            setMoreOpen(false);
                  }}
        />
      )}

      <aside className={`app-sidebar ${sidebarOpen ? "open" : ""} ${sidebarHidden ? "hidden" : ""}`}>
        <div className="sidebar-head">
          <button
            type="button"
            className="school-home"
            onClick={() => navigate(homeKey)}
            title="Go to portal home"
          >
            <span className="avatar">
              {activeSchool?.name?.[0] || portalTitle[0] || "P"}
            </span>

            <span className="sidebar-title">
              <strong>{portalTitle}</strong>
              <span>{activeBranch?.name || activeSchool?.name || portalSubtitle}</span>
            </span>
          </button>
        </div>

        <nav className="nav-list">
          {navSections.map((section) => {
            const open = openSections[section.title];

            return (
              <section key={section.title} className="nav-section">
                <button
                  type="button"
                  className="nav-section-title"
                  onClick={() => toggleSection(section.title)}
                >
                  <span>{section.title}</span>
                  <b>{open ? "−" : "+"}</b>
                </button>

                {open && (
                  <div className="nav-items">
                    {section.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => navigate(item.key)}
                        className={`nav-item ${tab === item.key ? "active" : ""}`}
                      >
                        <span>{item.icon}</span>
                        <strong>{item.label}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <button
          type="button"
          className="sidebar-resize-handle"
          onMouseDown={handleSidebarResizeStart}
          aria-label="Resize sidebar"
        />
      </aside>

      <aside className={`context-drawer ${contextOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <p>{lockedContext && !hasMultipleMemberships ? "Locked Context" : "School Context"}</p>
            <h2>{hasMultipleMemberships ? "Your Workspaces" : lockedContext ? "Your Workspace" : "Switch Workspace"}</h2>
          </div>

          <button className="icon-btn" onClick={() => setContextOpen(false)} type="button">
            ✕
          </button>
        </div>

        <div className="drawer-card">
          <label>School</label>
          <select
            value={activeSchoolId || effectiveSchoolId || ""}
            onChange={(e) => setActiveSchoolId?.(e.target.value ? e.target.value : null)}
            disabled={(lockedContext && !hasMultipleMemberships) || !schools?.length}
          >
            <option value="">{schools?.length ? "Select school" : "No school found"}</option>

            {(schools || []).map((school: any) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        <div className="drawer-card">
          <label>Branch</label>
          <select
            value={activeBranchId || effectiveBranchId || ""}
            onChange={(e) => setActiveBranchId?.(e.target.value ? e.target.value : null)}
            disabled={(lockedContext && !hasMultipleMemberships) || !(activeSchoolId || effectiveSchoolId) || !branches?.length}
          >
            <option value="">
              {!(activeSchoolId || effectiveSchoolId)
                ? "Select school first"
                : branches?.length
                  ? "Select branch"
                  : "No branch under school"}
            </option>

            {(branches || []).map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="drawer-info">
          <div>
            <strong>{roleLabel(selectedMembership?.role || account?.role || user?.role || "Member")}</strong>
            <span>Portal role</span>
          </div>

          <div>
            <strong>
              {!isOnline
                ? "Offline"
                : realtimeConnected
                  ? "Live"
                  : "Online"}
            </strong>
            <span>
              {!isOnline
                ? "Local mode"
                : realtimeConnected
                  ? "Realtime connected"
                  : "Polling fallback"}
            </span>
          </div>
        </div>

        {hasMultipleMemberships && (
          <div className="drawer-card">
            <label>Role / Workspace</label>
            <div className="workspace-list compact">
              {switchableMemberships.map((membership) => {
                const id = membershipKey(membership);
                const active = sameMembership(membership, selectedMembership);
                const switching = switchingMembershipId === id;

                return (
                  <button
                    key={id}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => switchMembership(membership)}
                    disabled={Boolean(switchingMembershipId)}
                  >
                    <span>{roleIcon(membership.role)}</span>
                    <strong>{roleLabel(membership.role)}</strong>
                    <small>{roleScope(membership)} · {roleDetail(membership)}</small>
                    <b>{switching ? "..." : active ? "Current" : "Open"}</b>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button className="drawer-action" type="button" onClick={() => router.push("/select-role")}>
          Select Role
        </button>

        <button className="drawer-danger" type="button" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <aside className={`context-drawer role-switch-drawer ${roleSwitchOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <p>Switch Access</p>
            <h2>Role / Workspace</h2>
          </div>

          <button className="icon-btn" onClick={() => setRoleSwitchOpen(false)} type="button">
            ✕
          </button>
        </div>

        <div className="workspace-list">
          {switchableMemberships.map((membership) => {
            const id = membershipKey(membership);
            const active = sameMembership(membership, selectedMembership);
            const switching = switchingMembershipId === id;

            return (
              <button
                key={id}
                type="button"
                className={active ? "active" : ""}
                onClick={() => switchMembership(membership)}
                disabled={Boolean(switchingMembershipId)}
              >
                <span>{roleIcon(membership.role)}</span>
                <strong>{roleLabel(membership.role)}</strong>
                <small>{roleScope(membership)} · {roleDetail(membership)}</small>
                <b>{switching ? "..." : active ? "Current" : "Open"}</b>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`app-main ${sidebarHidden ? "full" : ""}`}>
        <header className="app-header">
          <button
            className="icon-btn primary"
            onClick={() =>
              sidebarHidden
                ? (setSidebarHidden(false), setSidebarOpen(true))
                : setSidebarHidden(true)
            }
            type="button"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          <div className="header-title">
            <strong>{activeLabel}</strong>
            <span>
              {activeGroup} · {activeBranch?.name || activeSchool?.name || "Workspace"}
            </span>
          </div>

          <div className="member-pill" title={visibleMemberMeta}>
            <b>{visibleMemberName}</b>
            <span>{visibleMemberMeta}</span>
          </div>

          <div className="sync-dot-wrap">
            <button
              type="button"
              className={`sync-dot-btn ${
                !isOnline
                  ? "warn"
                  : realtimeConnected
                    ? "live"
                    : initialSyncDone
                      ? "ok"
                      : "warn"
              }`}
              onClick={() => {
                openStatusSheet();
                setMoreOpen(false);
              }}
              aria-label="Open system status, sync details and data actions"
              title={
                !isOnline
                  ? "Offline — using local data"
                  : realtimeConnected
                    ? "Live updates connected"
                    : initialSyncDone
                      ? `Synced — realtime ${realtimeStatus.status}`
                      : "Sync needs attention"
              }
            >
              <span />
            </button>

          </div>

          <div className="more-wrap">
            <button
              className="icon-btn"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label="More actions"
              type="button"
            >
              ⋮
            </button>

            {moreOpen && (
              <div className="more-menu">
                <button
                  type="button"
                  onClick={() => {
                    setContextOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  Workspace context
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRoleSwitchOpen(true);
                    setMoreOpen(false);
                    setContextOpen(false);
                  }}
                >
                  Switch role / workspace
                </button>

                <button type="button" onClick={() => router.push("/select-role")}>
                  Select Role
                </button>

                <button type="button" onClick={handleLogout} className="danger">
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="app-content">
          <div className="app-content-inner">
            <ActiveComponent navigate={navigate} context={portalRuntimeContext} />
          </div>
        </section>
      </section>
    </main>
  );
}
function CenterCard({
  title,
  text,
  spin,
}: {
  title: string;
  text: string;
  spin?: boolean;
}) {
  return (
    <main className="center-page">
      <SyncStatusSheet />

      <style>{css}</style>
      <section className="loading-card">
        {spin && <div className="loading-spinner" />}
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}


export default function RolePortalShell(props: RolePortalShellProps) {
  return (
    <WorkspaceTransitionProvider>
      <RolePortalShellContent {...props} />
    </WorkspaceTransitionProvider>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.background-refresh-indicator {
  position: fixed;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 5000;
  padding: 7px 11px;
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 10px 28px rgba(15,23,42,.14);
  font-size: 11px;
  font-weight: 850;
  pointer-events: none;
}

.role-shell,
.center-page {
  /*
   * The shared appearance runtime owns the complete palette:
   * --bg, --surface, --card, --card-bg, --input-bg, --text, --muted,
   * --border and every related light/dark token.
   *
   * The shell only creates aliases from that palette. It must never redefine
   * the source variables, otherwise Branch Settings and Local Settings produce
   * different visual results.
   */
  --shell-sidebar-bg: var(--surface, #ffffff);
  --shell-header-bg: color-mix(
    in srgb,
    var(--surface, #ffffff) 92%,
    transparent
  );
  --shell-menu-bg: var(--surface, #ffffff);
  --shell-section-bg: color-mix(
    in srgb,
    var(--bg, #f7f8fb) 76%,
    var(--surface, #ffffff)
  );
  --shell-hover-bg: color-mix(
    in srgb,
    var(--primary-color, #2f6fed) 9%,
    var(--surface, #ffffff)
  );
  --shell-active-bg: color-mix(
    in srgb,
    var(--primary-color, #2f6fed) 14%,
    var(--surface, #ffffff)
  );
  --shell-soft-border: color-mix(
    in srgb,
    var(--border, rgba(0,0,0,.10)) 82%,
    transparent
  );
  --dashboard-primary: var(--primary-color, #2f6fed);
}

html,
body {
  max-width: 100%;
  overflow-x: hidden;
  background: var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui);
  font-size: var(--font-size, 16px);
}

* {
  box-sizing: border-box;
}

.role-shell,
.center-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  background: var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui);
  font-size: var(--font-size, 16px);
}

.center-page {
  display: grid;
  place-items: center;
  padding: 18px;
}

.loading-card {
  width: min(430px, 100%);
  border-radius: 26px;
  padding: 24px;
  background: var(--card-bg, var(--surface, #ffffff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.10));
  text-align: center;
  overflow: hidden;
}

.loading-card h2 {
  margin: 12px 0 6px;
  font-size: 20px;
  font-weight: 950;
}

.loading-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 14px;
  line-height: 1.6;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  margin: 0 auto;
  border-radius: 50%;
  border: 4px solid color-mix(in srgb, var(--dashboard-primary, var(--primary-color, #2563eb)) 18%, transparent);
  border-top-color: var(--dashboard-primary, var(--primary-color, #2563eb));
  animation: spin 0.8s linear infinite;
}

.app-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  border: 0;
  background: rgba(15,23,42,.5);
}

.app-sidebar,
.context-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 50;
  height: 100dvh;
  max-width: 100vw;
  background: var(--shell-sidebar-bg, var(--surface, #ffffff));
  color: var(--text, #111111);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  box-shadow: var(--shell-shadow, 0 24px 70px rgba(15,23,42,.22));
  transition: transform .22s ease, width .22s ease;
}

.app-sidebar {
  left: 0;
  width: min(88vw, 330px);
  transform: translateX(-105%);
  padding: 12px;
}

.app-sidebar.open {
  transform: translateX(0);
}

.context-drawer {
  right: 0;
  width: min(90vw, 370px);
  transform: translateX(105%);
  padding: 16px;
}

.context-drawer.open {
  transform: translateX(0);
}

.sidebar-head,
.drawer-head,
.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.sidebar-head {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--shell-sidebar-bg, var(--surface, #ffffff));
  padding: 4px 0 10px;
}

.school-home {
  min-width: 0;
  max-width: 100%;
  flex: 1;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
}

.school-home:hover .sidebar-title strong {
  color: var(--dashboard-primary, var(--primary-color, #2563eb));
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 15px;
  background: var(--dashboard-primary, var(--primary-color, #2563eb));
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 950;
  flex: 0 0 auto;
}

.sidebar-title,
.header-title {
  min-width: 0;
  flex: 1;
}

.sidebar-title strong,
.sidebar-title span,
.header-title strong,
.header-title span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-title strong,
.header-title strong {
  color: var(--text, #111111);
  font-size: 14px;
  font-weight: 950;
  line-height: 1.1;
}

.sidebar-title span,
.header-title span {
  margin-top: 1px;
  font-size: 11px;
  color: var(--muted, #64748b);
  line-height: 1.1;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 14px;
  background: var(--surface, #ffffff);
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 950;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.icon-btn.primary {
  background: var(--dashboard-primary, var(--primary-color, #2563eb));
  color: #fff;
  border-color: transparent;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 24px;
  max-width: 100%;
  overflow-x: hidden;
}

.nav-section {
  border-radius: 20px;
  background: var(--shell-section-bg, var(--shell-section-bg, #f7f8fb));
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
  max-width: 100%;
}

.nav-section-title {
  width: 100%;
  min-height: 40px;
  border: 0;
  background: transparent;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted, #334155);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
  cursor: pointer;
}

.nav-section-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-items {
  display: grid;
  gap: 4px;
  padding: 5px;
  max-width: 100%;
}

.nav-item {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  padding: 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text, #111111);
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--shell-hover-bg, var(--shell-hover-bg, #f1f5f9));
}

.nav-item.active {
  background: var(--dashboard-primary, var(--primary-color, #2563eb));
  color: #fff;
}

.nav-item.active strong,
.nav-item.active span {
  color: #fff;
}

.nav-item span {
  width: 24px;
  flex: 0 0 auto;
  font-size: 17px;
  text-align: center;
}

.nav-item strong {
  min-width: 0;
  color: inherit;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-resize-handle {
  display: none;
}

.app-main {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  transition: margin-left .22s ease, width .22s ease;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 48px;
  max-width: 100%;
  padding: 5px 14px;
  background: var(--shell-header-bg, var(--surface, #ffffff));
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  backdrop-filter: blur(14px);
  overflow: visible;
}


.member-pill {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(34vw, 330px);
  display: grid;
  gap: 1px;
  align-content: center;
  min-height: 36px;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dashboard-primary, var(--primary-color, #2563eb)) 8%, var(--surface, #ffffff));
  border: 1px solid color-mix(in srgb, var(--dashboard-primary, var(--primary-color, #2563eb)) 18%, var(--border, rgba(0,0,0,.10)));
  color: var(--text, #111111);
  overflow: hidden;
}

.member-pill b,
.member-pill span {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.member-pill b {
  font-size: 12px;
  font-weight: 950;
  line-height: 1.05;
  color: var(--text, #111111);
}

.member-pill span {
  font-size: 10px;
  font-weight: 800;
  line-height: 1.05;
  color: var(--muted, #64748b);
}

.more-wrap {
  position: relative;
  flex: 0 0 auto;
}

.more-menu {
  position: absolute;
  top: 42px;
  right: 0;
  width: min(230px, calc(100vw - 18px));
  border-radius: 18px;
  padding: 8px;
  background: var(--shell-menu-bg, var(--surface, #ffffff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.18));
  display: grid;
  gap: 4px;
  z-index: 60;
  overflow: hidden;
}

.more-menu button {
  min-height: 40px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  text-align: left;
  padding: 0 12px;
  font-weight: 850;
  cursor: pointer;
  color: var(--text, #111111);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-menu button:hover {
  background: var(--shell-hover-bg, var(--shell-hover-bg, #f1f5f9));
}

.more-menu .danger {
  color: #dc2626;
}

.sync-dot-wrap {
  position: relative;
  flex: 0 0 auto;
}

.sync-dot-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface, #ffffff);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 auto;
}

.sync-dot-btn span {
  width: 11px;
  height: 11px;
  display: block;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 5px rgba(239,68,68,.12);
}

.sync-dot-btn.ok span {
  background: #22c55e;
  box-shadow: 0 0 0 5px rgba(34,197,94,.13);
}

.sync-dot-btn.live span {
  background: #0ea5e9;
  box-shadow: 0 0 0 5px rgba(14,165,233,.14);
}

.sync-dot-btn.warn span {
  background: #ef4444;
  box-shadow: 0 0 0 5px rgba(239,68,68,.12);
}

.sync-popover {
  position: fixed;
  top: 56px;
  right: 12px;
  width: min(560px, calc(100vw - 24px));
  max-height: min(78dvh, 760px);
  border-radius: 18px;
  padding: 8px;
  background: var(--shell-menu-bg, var(--surface, #ffffff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.18));
  z-index: 90;
  overflow: auto;
}

.sync-popover > * {
  margin: 0 !important;
}

.app-content {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.app-content-inner {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.app-content *,
.app-content *::before,
.app-content *::after {
  max-width: 100%;
  box-sizing: border-box;
}

.app-content button,
.app-content input,
.app-content select,
.app-content textarea {
  font: inherit;
  max-width: 100%;
}

.app-content img,
.app-content svg,
.app-content canvas,
.app-content video {
  max-width: 100%;
  height: auto;
}

.app-content table {
  max-width: 100%;
}

.drawer-head {
  justify-content: space-between;
  margin-bottom: 16px;
}

.drawer-head div {
  min-width: 0;
}

.drawer-head p {
  margin: 0;
  color: var(--dashboard-primary, var(--primary-color, #2563eb));
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 22px;
  letter-spacing: -.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-card {
  border-radius: 22px;
  padding: 14px;
  background: var(--shell-section-bg, var(--shell-section-bg, #f7f8fb));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  margin-bottom: 12px;
  max-width: 100%;
  overflow: hidden;
}

.drawer-card label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--muted, #64748b);
  font-weight: 900;
}

.drawer-card select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 15px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #ffffff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
}

.drawer-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 14px 0;
  max-width: 100%;
}

.drawer-info div {
  min-width: 0;
  border-radius: 20px;
  padding: 14px;
  background: var(--shell-section-bg, var(--shell-section-bg, #f7f8fb));
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.drawer-info strong,
.drawer-info span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-info strong {
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 950;
}

.drawer-info span {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted, #64748b);
}

.drawer-action,
.drawer-danger {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  font-weight: 950;
  cursor: pointer;
  margin-top: 8px;
}

.drawer-action {
  background: var(--dashboard-primary, var(--primary-color, #2563eb));
  color: #fff;
}

.drawer-danger {
  background: rgba(239,68,68,.1);
  color: #dc2626;
}

.workspace-list {
  display: grid;
  gap: 8px;
}

.workspace-list button {
  width: 100%;
  min-height: 64px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--shell-menu-bg, var(--surface, #ffffff));
  color: var(--text, #111111);
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
}

.workspace-list button:hover {
  background: var(--shell-hover-bg, #f1f5f9);
}

.workspace-list button.active {
  border-color: color-mix(in srgb, var(--dashboard-primary, #2563eb) 42%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--dashboard-primary, #2563eb) 8%, var(--surface, #ffffff));
}

.workspace-list button:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.workspace-list button > span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--dashboard-primary, #2563eb) 10%, transparent);
  font-size: 19px;
}

.workspace-list strong,
.workspace-list small {
  min-width: 0;
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-list strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 950;
}

.workspace-list small {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.workspace-list b {
  grid-row: span 2;
  min-width: 58px;
  justify-self: end;
  border-radius: 999px;
  padding: 6px 9px;
  background: color-mix(in srgb, var(--dashboard-primary, #2563eb) 10%, transparent);
  color: var(--dashboard-primary, #2563eb);
  font-size: 10px;
  font-weight: 950;
  text-align: center;
}

.workspace-list.compact button {
  min-height: 58px;
}

@media (min-width: 980px) {
  .app-overlay {
    display: none;
  }

  .app-sidebar {
    transform: none;
    width: var(--sidebar-width, 300px);
    min-width: 240px;
    max-width: 380px;
    box-shadow: none;
    border-right: 1px solid var(--border, rgba(0,0,0,.08));
  }

  .app-sidebar.hidden {
    transform: translateX(-110%);
    pointer-events: none;
  }

  .app-sidebar.hidden.open {
    transform: none;
    pointer-events: auto;
  }

  .app-main {
    margin-left: var(--sidebar-width, 300px);
    width: calc(100% - var(--sidebar-width, 300px));
    max-width: calc(100% - var(--sidebar-width, 300px));
  }

  .app-main.full {
    margin-left: 0;
    width: 100%;
    max-width: 100%;
  }

  .app-content {
    padding: 12px;
  }

  .sidebar-resize-handle {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    width: 8px;
    height: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    z-index: 4;
  }

  .sidebar-resize-handle:hover {
    background: color-mix(in srgb, var(--dashboard-primary, #2563eb) 18%, transparent);
  }
}

@media (max-width: 420px) {
  .app-content {
    padding: 6px;
  }

  .app-header {
    min-height: 46px;
    padding: 5px 6px;
  }

  .icon-btn,
  .sync-dot-btn {
    width: 34px;
    height: 34px;
    border-radius: 13px;
    font-size: 18px;
  }

  .header-title strong {
    font-size: 13px;
  }

  .header-title span {
    font-size: 10px;
  }

  .member-pill {
    max-width: 34vw;
    min-height: 34px;
    padding: 4px 8px;
  }

  .member-pill b {
    font-size: 11px;
  }

  .member-pill span {
    display: none;
  }

  .app-sidebar {
    width: min(92vw, 320px);
  }

  .context-drawer {
    width: min(94vw, 370px);
    padding: 12px;
  }

  .sync-popover {
    position: absolute;
    top: 42px;
    right: 0;
    width: min(360px, calc(100vw - 18px));
    max-height: min(72dvh, 620px);
  }

  .drawer-info {
    grid-template-columns: 1fr;
  }

  .nav-item {
    min-height: 43px;
  }
}
`;