
"use client";

/**
 * app/components/role-portals/RolePortalShell.tsx
 * ---------------------------------------------------------
 * ROLE PORTAL SHELL - WORKSPACE SESSION VERSION
 * ---------------------------------------------------------
 * Drop-in replacement.
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
 * - Logout still clears localStorage, sessionStorage, Cache Storage and
 *   IndexedDB/Dexie before redirecting to login.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useSyncBootstrap } from "../../context/sync-bootstrap-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db";
import SyncStatusStrip from "../SyncStatusStrip";

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

export type RolePortalShellProps = {
  portalTitle: string;
  portalSubtitle: string;
  homeKey: string;
  allowedRoles: AppRole[];
  navSections: RoleNavSection[];
  routes: Record<string, React.ComponentType<{ navigate: (key: string) => void }>>;
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
  schoolId?: number | null;
  branchId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
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

function normalizeMembership(membership?: UserMembership | null): UserMembership | null {
  if (!membership) return null;

  const schoolId = firstPositiveNumber(
    membership.schoolId,
    membership.school?.id,
    membership.activeSchoolId,
    membership.contextSchoolId
  );

  const branchId = firstPositiveNumber(
    membership.branchId,
    membership.schoolBranchId,
    membership.branch?.id,
    membership.activeBranchId,
    membership.contextBranchId
  );

  const teacherLocalId = firstPositiveNumber(
    membership.teacherLocalId,
    membership.localTeacherId,
    membership.teacherId,
    membership.teacher?.id,
    membership.staffLocalId
  );

  const studentLocalId = firstPositiveNumber(
    membership.studentLocalId,
    membership.localStudentId,
    membership.studentId,
    membership.student?.id,
    membership.learnerLocalId,
    membership.pupilLocalId
  );

  const parentLocalId = firstPositiveNumber(
    membership.parentLocalId,
    membership.localParentId,
    membership.parentId,
    membership.parent?.id,
    membership.guardianLocalId
  );

  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherLocalId,
    studentLocalId,
    parentLocalId,
    active: membership.active !== false,
  };
}

function membershipKey(membership?: UserMembership | null, fallback = "membership") {
  if (!membership) return fallback;
  return String(
    membership.id ??
      `${membership.role}-${membership.schoolId ?? "account"}-${membership.branchId ?? "root"}-${
        membership.teacherLocalId ?? membership.studentLocalId ?? membership.parentLocalId ?? "portal"
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

function profileRoleHasLocalId(membership?: UserMembership | null) {
  const normalized = normalizeMembership(membership);
  if (!normalized) return false;
  if (normalized.role === "student") return Boolean(normalized.studentLocalId);
  if (normalized.role === "teacher") return Boolean(normalized.teacherLocalId);
  if (normalized.role === "parent") return Boolean(normalized.parentLocalId);
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

  const schoolId = toPositiveNumber(normalized.schoolId);
  const branchId = toPositiveNumber(normalized.branchId);
  const teacherId = toPositiveNumber(normalized.teacherLocalId);
  const studentId = toPositiveNumber(normalized.studentLocalId);
  const parentId = toPositiveNumber(normalized.parentLocalId);

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
      teacherLocalId: teacherId,
      studentLocalId: studentId,
      parentLocalId: parentId,
      openedAt: Date.now(),
    })
  );

  return normalized;
}

function readStoredNumber(...keys: string[]) {
  for (const key of keys) {
    const parsed = toPositiveNumber(safeRead(key));
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
  if (normalized.teacherLocalId) return `Teacher profile ${normalized.teacherLocalId}`;
  if (normalized.studentLocalId) return `Student profile ${normalized.studentLocalId}`;
  if (normalized.parentLocalId) return `Parent profile ${normalized.parentLocalId}`;
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
    workspace.teacherLocalId ??
    workspace.studentLocalId ??
    workspace.parentLocalId ??
    membership.teacherLocalId ??
    membership.studentLocalId ??
    membership.parentLocalId;

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
  activeSchoolId?: number | null;
  activeBranchId?: number | null;
}) {
  return (
    args.memberships.find((membership) => {
      if (!roleAllowed(membership.role, args.allowedRoles)) return false;
      if (!membershipIsUsable(membership)) return false;

      const schoolMatches =
        !args.activeSchoolId || !membership.schoolId || Number(membership.schoolId) === Number(args.activeSchoolId);
      const branchMatches =
        !args.activeBranchId || !membership.branchId || Number(membership.branchId) === Number(args.activeBranchId);

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
  return profileRoleHasLocalId(selectedMembership);
}

function requestToPromise(request: IDBRequest | IDBOpenDBRequest) {
  return new Promise<void>((resolve) => {
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    if ("onblocked" in request) {
      (request as IDBOpenDBRequest).onblocked = () => resolve();
    }
  });
}

async function deleteIndexedDbDatabase(name?: string | null) {
  if (typeof window === "undefined" || !name || !window.indexedDB) return;
  try { await requestToPromise(window.indexedDB.deleteDatabase(name)); } catch {}
}

async function clearLocalBrowserData() {
  if (typeof window === "undefined") return;
  try { db.close(); } catch {}
  try { window.sessionStorage.clear(); } catch {}
  try { window.localStorage.clear(); } catch {}
  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
    }
  } catch {}
  try {
    const indexedDb = window.indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string | null }>>;
    };
    if (indexedDb.databases) {
      const databases = await indexedDb.databases();
      await Promise.all(databases.map((database) => deleteIndexedDbDatabase(database.name)));
    } else {
      await deleteIndexedDbDatabase((db as any).name);
      await deleteIndexedDbDatabase("eleeveon");
      await deleteIndexedDbDatabase("eleeveon-school");
      await deleteIndexedDbDatabase("eleeveon_school");
    }
  } catch {}
}

export default function RolePortalShell({
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
  const { initialSyncDone, initialSyncing } = useSyncBootstrap();

  const {
    accountId,
    user,
    account,
    logout,
    loading: accountLoading,
    authenticated,
  } = useAccount() as any;

  const { activeMembership, setActiveMembership } = useActiveMembership();
  const { loading: settingsLoading } = useSettings() as any;

  const {
    activeSchoolId,
    activeSchool,
    schools,
    setActiveSchoolId,
    activeBranchId,
    activeBranch,
    branches,
    setActiveBranchId,
    loading: contextLoading,
  } = useActiveBranch() as any;

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
      if (protectedProfilePortal && !profileRoleHasLocalId(membership)) return false;
      return true;
    });
  }, [allMemberships, allowedRoles, protectedProfilePortal]);

  const selectedMembership = useMemo(() => {
    const normalizedActive = normalizeMembership(activeMembership) || storedActiveMembership;

    if (
      normalizedActive &&
      roleAllowed(normalizedActive.role, allowedRoles) &&
      membershipIsUsable(normalizedActive) &&
      (!protectedProfilePortal || profileRoleHasLocalId(normalizedActive))
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
      toPositiveNumber(activeSchoolId) ||
      toPositiveNumber(selectedMembership?.schoolId) ||
      toPositiveNumber(openedWorkspace?.schoolId) ||
      readStoredNumber("activeSchoolId"),
    [activeSchoolId, selectedMembership?.schoolId, openedWorkspace]
  );

  const effectiveBranchId = useMemo(
    () =>
      toPositiveNumber(activeBranchId) ||
      toPositiveNumber(selectedMembership?.branchId) ||
      toPositiveNumber(openedWorkspace?.branchId) ||
      readStoredNumber("activeBranchId"),
    [activeBranchId, selectedMembership?.branchId, openedWorkspace]
  );

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
    if (accountLoading || contextLoading || initialSyncing) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (initialSyncDone && !canAccess) {
      router.replace("/select-role");
      return;
    }

    if (
      initialSyncDone &&
      ((requireSchool && !effectiveSchoolId) || (requireBranch && !effectiveBranchId))
    ) {
      router.replace("/select-role");
    }
  }, [
    accountLoading,
    contextLoading,
    initialSyncing,
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
  const [syncOpen, setSyncOpen] = useState(false);
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
  const checking = accountLoading || contextLoading || settingsLoading || initialSyncing;

  const navigate = (key: string) => {
    setTab(key);
    setSidebarOpen(false);
    setMoreOpen(false);
    setSyncOpen(false);
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
    setSyncOpen(false);

    await clearLocalBrowserData();

    try {
      await Promise.resolve(logout?.());
    } catch {
      // Local browser data is already cleared. Continue to login.
    }

    router.replace("/login");
  }, [logout, router]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const switchMembership = async (membership: UserMembership) => {
    const normalized = normalizeMembership(membership) || membership;
    const id = membershipKey(normalized);

    try {
      setSwitchingMembershipId(id);
      const opened = writeWorkspaceSession(normalized) || normalized;
      await setActiveMembership(opened);
      setMoreOpen(false);
      setContextOpen(false);
      setRoleSwitchOpen(false);
      window.location.assign(getPortalPathByRole(opened.role));
    } catch (error) {
      console.error("Failed to switch role/workspace:", error);
      alert("Failed to switch workspace. Please try again.");
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
    return (
      <CenterCard
        title={`Opening ${portalTitle}...`}
        text="Checking account, selected workspace, sync, school, and branch context."
        spin
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
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {(sidebarOpen || contextOpen || roleSwitchOpen) && (
        <button
          aria-label="Close drawer"
          className="app-overlay"
          onClick={() => {
            setSidebarOpen(false);
            setContextOpen(false);
            setRoleSwitchOpen(false);
            setMoreOpen(false);
            setSyncOpen(false);
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
            onChange={(e) => setActiveSchoolId?.(e.target.value ? Number(e.target.value) : null)}
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
            onChange={(e) => setActiveBranchId?.(e.target.value ? Number(e.target.value) : null)}
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
            <strong>{isOnline ? "Online" : "Offline"}</strong>
            <span>{isOnline ? "Sync ready" : "Local mode"}</span>
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
              className={`sync-dot-btn ${isOnline && initialSyncDone ? "ok" : "warn"}`}
              onClick={() => {
                setSyncOpen((prev) => !prev);
                setMoreOpen(false);
              }}
              aria-label="Open sync details"
              title={isOnline && initialSyncDone ? "Account data synced" : "Sync needs attention"}
            >
              <span />
            </button>

            {syncOpen && (
              <div className="sync-popover">
                <SyncStatusStrip />
              </div>
            )}
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
            <ActiveComponent navigate={navigate} />
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
      <style>{css}</style>
      <section className="loading-card">
        {spin && <div className="loading-spinner" />}
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }


.role-shell {
  --shell-sidebar-bg: var(--surface, #ffffff);
  --shell-header-bg: var(--surface, #ffffff);
  --shell-menu-bg: var(--surface, #ffffff);
  --shell-section-bg: color-mix(in srgb, var(--bg, #f7f8fb) 78%, var(--surface, #ffffff));
  --shell-hover-bg: color-mix(in srgb, var(--primary-color, #2f6fed) 8%, var(--surface, #ffffff));
  --dashboard-primary: var(--primary-color, #2f6fed);
}

/* Keep light mode close to the old dashboard: clean white sidebar/header with soft contrast. */
html[data-theme="light"] .role-shell,
html[data-theme="light"] .center-page,
html[data-eleeveon-resolved-mode="light"] .role-shell,
html[data-eleeveon-resolved-mode="light"] .center-page {
  --shell-sidebar-bg: #ffffff;
  --shell-header-bg: rgba(255,255,255,.92);
  --shell-menu-bg: #ffffff;
  --shell-section-bg: #f7f8fb;
  --shell-hover-bg: var(--shell-hover-bg, #f1f5f9);
  --card: #ffffff;
  --card-bg: #ffffff;
  --surface: #ffffff;
  --bg: #f7f8fb;
  --text: #111111;
  --border: rgba(0,0,0,.10);
}

/* Dark mode still follows the theme-context/local-settings dark variables. */
html[data-theme="dark"] .role-shell,
html[data-theme="dark"] .center-page,
html[data-eleeveon-resolved-mode="dark"] .role-shell,
html[data-eleeveon-resolved-mode="dark"] .center-page {
  --shell-sidebar-bg: var(--surface);
  --shell-header-bg: color-mix(in srgb, var(--surface) 88%, transparent);
  --shell-menu-bg: var(--surface);
  --shell-section-bg: rgba(255,255,255,.06);
  --shell-hover-bg: rgba(255,255,255,.08);
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
