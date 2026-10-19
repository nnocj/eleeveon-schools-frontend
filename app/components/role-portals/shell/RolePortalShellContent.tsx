"use client";

/**
 * app/components/role-portals/shell/RolePortalShellContent.tsx
 * --------------------------------------------------------------------------
 * ROLE PORTAL SHELL — NON-BLOCKING WORKSPACE ENTRY
 * --------------------------------------------------------------------------
 *
 * Responsibilities:
 * - Account, membership, institution, settings, theme and database contexts
 * - Access checks and selected workspace resolution
 * - Appearance readiness
 * - Realtime and synchronization state
 * - Non-blocking role-wide workspace preparation
 * - Safe active-page sync priority for account-wide roles
 * - Hub indicator loading
 * - Sidebar, header, account drawer and active route rendering
 * - Fast role switching
 * - Original in-memory navigate(key) behavior
 *
 * Portal overlay boundaries are owned by:
 * ./PortalOverlayBoundaries.css
 *
 * The stylesheet is imported through PortalContent.tsx.
 *
 * IMPORTANT:
 * Browser/Android history support is not introduced here.
 * Full workspace downloads are not required before portal entry.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useAccount } from "../../../context/account-context";
import { useSettings } from "../../../context/settings-context";
import { useActiveBranch } from "../../../context/active-branch-context";
import { useSyncBootstrap } from "../../../context/sync-bootstrap-context";
import { useActiveMembership } from "../../../context/active-membership-context";
import { useRealtimeStatus } from "../../../hooks/useRealtimeStatus";
import { useRealtime } from "../../../context/realtime-context";
import { useTheme } from "../../../context/theme-context";
import { useDatabase } from "../../../context/database-context";
import { db } from "../../../lib/db/db";
import {
  bootstrapPriorityWorkspaceTables,
  arePriorityWorkspaceTablesCached,
  bootstrapSelectedWorkspace,
  isWorkspaceLocallyReady,
  getWorkspaceTableAvailability,
  type WorkspaceBootstrapProgress,
} from "../../../lib/sync/workspaceBootstrap";
import WorkspaceBootstrapScreen from "../../WorkspaceBootstrapScreen";
import { isSyncTable } from "../../../lib/sync/syncTables";
import { useWindowChrome } from "../../../context/window-chrome-context";
import { readLastWorkspaceModule, rememberLastWorkspaceModule } from "../../../lib/offline/workspaceMemory";
import { useOfflineTableReadiness } from "../../../hooks/useOfflineTableReadiness";
import OfflineDataStatus from "../../offline/OfflineDataStatus";
import { assertSwitchTargetAvailable, captureWorkspaceStorage, restoreWorkspaceStorage } from "../../../lib/offline/roleSwitchCoordinator";

import SyncStatusSheet from "../../SyncStatusSheet";
import EleeveonCenter from "../EleeveonCenter";

import PortalSidebar from "./PortalSidebar";
import BranchWorkspaceNavigation from "./BranchWorkspaceNavigation";
import PortalHeader from "./PortalHeader";
import PortalContent from "./PortalContent";
import AccountWorkspaceDrawer from "./AccountWorkspaceDrawer";

import { useSyncContext } from "../../../context/sync-context";
import { useWorkspaceTransition } from "../../workspace";

import {
  prepareRoleWorkspaceInBackground,
} from "./roleWorkspaceBackgroundSync";

import {
  usePortalAppearanceReadiness,
} from "../../PortalAppearanceRuntime";

import {
  appearanceIdentityFor,
  appearanceIdentityMatches,
  appearanceScopeForRole,
} from "../../../lib/theme/appearanceScope";

import {
  collectUserMemberships,
  getPortalPathByRole,
  membershipCanAccess,
} from "../../../lib/auth/roleRedirect";

import type {
  UserMembership,
} from "../../../lib/auth/roleRedirect";

import {
  useWorkspaceDisplayNames,
  workspaceProfileImage,
} from "../../../lib/workspaces/useWorkspaceDisplayNames";

import type {
  RolePortalRuntimeContext,
  RolePortalShellProps,
} from "../RolePortalShell";

import {
  ELEEVEON_CENTER_KEY,
  membershipIsUsable,
  membershipKey,
  normalizeMembership,
  pickMembership,
  portalRequiresProfileMembership,
  profileRoleHasPermanentId,
  protectedPortalCanAccess,
  readOpenWorkspaceSession,
  readStoredActiveMembership,
  readStoredId,
  readStoredMemberships,
  roleAllowed,
  safeSet,
  sameMembership,
  toPermanentId,
  writeWorkspaceSession,
  MEMBERSHIP_BACKUP_KEY,
} from "./rolePortalWorkspace";

import { displayRoleLabel } from "../../../lib/auth/roleDisplay";

import {
  roleIcon,
  selectedMemberMeta,
  selectedMemberName,
} from "./rolePortalIdentity";

/**
 * Active-page synchronization priorities.
 *
 * The sidebar route key and user-facing label identify the CURRENT module.
 * These dependency lists use registered local-first table names only. They
 * are intentionally small enough to fetch quickly while the existing
 * role-wide workspace bootstrap continues independently in the background.
 *
 * IMPORTANT SECURITY BOUNDARY:
 * The current /sync/pull backend checks account membership, but not yet the
 * precise selected-membership + profile scope. Until it is fixed, automatic
 * priority pulls MUST be limited to genuinely account-wide roles. Other roles
 * continue to receive their permitted records via role-scoped bootstrap.
 */


const PRIORITY_TABLE_GROUPS = {
  foundation: [
    "schools", "branches", "academicPeriods", "classes",
  ],
  people: [
    "students", "studentEnrollments", "studentParents", "parents", "teachers",
  ],
  assessment: [
    "gradingSystems", "gradeRules", "assessmentStructures",
    "assessmentStructureItems", "assessmentApplicabilities",
    "assessmentComponents", "assessmentEntries", "computedResults",
    "classes", "classSubjects", "subjects", "students",
    "studentEnrollments", "academicPeriods",
  ],
  attendance: [
    "attendance", "studentAttendanceSummaries", "teacherAttendance",
    "attendanceSessions", "students", "teachers", "classes",
    "studentEnrollments", "academicPeriods",
  ],
  // A report requires its academic setup and assessment calculation inputs.
  // A downloaded `reportCards` table by itself is not sufficient readiness.
  reports: [
    "reportCards", "reportCardItems", "reportCardTemplates",
    "reportCardTemplateSettings", "reportCardTemplateAssignments",
    "studentReportSnapshots", "computedResults", "assessmentEntries",
    "assessmentStructures", "assessmentStructureItems",
    "assessmentApplicabilities", "gradingStructures", "gradeRules",
    "academicStructures", "academicPeriods", "schools", "branches",
    "schoolBranchSettings", "classes", "classSubjects", "classTeachers",
    "subjects", "students", "studentEnrollments",
  ],
  timetable: [
    "scheduleTimetables", "scheduleSessions", "scheduleResources",
    "scheduleConflicts", "classes", "subjects", "teachers", "classTeachers",
  ],
  finance: [
    "feeStructures", "payments", "incomes", "expenses",
    "studentFeeInvoices", "studentFeeInvoiceItems", "studentFeePayments",
    "currencies", "schoolCurrencySettings",
  ],
  communication: [
    "announcements", "announcementRecipients", "messageThreads",
    "messages", "communicationLogs",
  ],
  settings: ["schoolBranchSettings", "schools", "branches"],
} as const;

/** Map portal route/label aliases without changing the existing nav keys. */
function tablesForPortalRoute(routeKey: string, label?: string): string[] {
  const key = routeKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  const visible = String(label || "").toLowerCase();
  const text = `${key} ${visible}`;

  // No bulk data request for generic dashboard, hub, or local preferences.
  if (
    !key ||
    key === "__eleeveon_center__" ||
    /dashboard|^home$|hub|localsettings|syncstatus/.test(key)
  ) {
    return [];
  }

  let selected: readonly string[];
  if (/assessment|broadsheet|grade|grading|computedresult/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.assessment;
  } else if (/attendance|rollcall/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.attendance;
  } else if (/studentreport|teacherreport|report|transcript|result|promotion|cumulative|progress|performance/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.reports;
  } else if (/fee|finance|invoice|payment|income|expense|payroll|salary/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.finance;
  } else if (/message|notice|announcement|communicat/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.communication;
  } else if (/setting|appearance|branchprofile|schoolprofile|teacherprofile|studentprofile|parentprofile/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.settings;
  } else if (/schedule|timetable|calendar/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.timetable;
  } else if (/subject|class|curriculum|academicstructure|academicperiod|course|assignment/.test(text)) {
    selected = [
      ...PRIORITY_TABLE_GROUPS.foundation,
      "subjects", "classSubjects", "classTeachers", "studentEnrollments",
      "academicStructures", "programs", "curriculums", "assignments",
    ];
  } else if (/student|enrollment|enrolment|learner|admission/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.people;
  } else if (/teacher|staff|personnel|parent/.test(text)) {
    selected = PRIORITY_TABLE_GROUPS.people;
  } else if (isSyncTable(routeKey)) {
    selected = [routeKey];
  } else {
    // Unknown modules deliberately do not trigger an account-wide sweep.
    return [];
  }

  return [...new Set(selected)].filter(isSyncTable);
}

function canonicalPriorityRole(role: unknown): string {
  const normalized = String(role || "")
    .toLowerCase().trim().replace(/-/g, "_");
  return normalized === "owner" || normalized === "school_owner"
    ? "super_admin"
    : normalized;
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
  navigationMode = "sidebar",
}: RolePortalShellProps) {
  const branchWorkspaceLayout = navigationMode === "branch-workspace";
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
    setIdentity: setWindowChromeIdentity,
    clearIdentity: clearWindowChromeIdentity,
  } = useWindowChrome();

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
    refreshSettings,
  } = settingsContext;

  const resolvedPrimaryColor =
    // The appearance already applied for this membership is canonical.
    // Generic effective/account defaults must not repaint the branch in Light.
    (themeContext.ready ? themeContext.appliedFor?.primaryColor : null) ||
    themeContext.primaryColor ||
    settings?.primaryColor ||
    "#2f6fed";

  const resolvedFontFamily =
    themeContext.fontFamily ||
    settings?.fontFamily ||
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const resolvedFontSize =
    themeContext.fontSize ||
    Number(settings?.fontSize) ||
    16;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

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

  const openedWorkspace = useMemo(
    () => readOpenWorkspaceSession(),
    [],
  );

  const storedActiveMembership = useMemo(() => {
    return (
      normalizeMembership(openedWorkspace?.membership) ||
      readStoredActiveMembership()
    );
  }, [openedWorkspace]);

  const allMemberships = useMemo(() => {
    const merged = [
      ...collectUserMemberships(account),
      ...collectUserMemberships(user),
      ...readStoredMemberships(),
      ...(storedActiveMembership
        ? [storedActiveMembership]
        : []),
    ];

    const unique = new Map<string, UserMembership>();

    merged
      .map(normalizeMembership)
      .filter(Boolean)
      .filter(membershipIsUsable)
      .forEach((membership) => {
        unique.set(
          membershipKey(membership),
          membership as UserMembership,
        );
      });

    const list = [...unique.values()];

    if (list.length) {
      safeSet(
        MEMBERSHIP_BACKUP_KEY,
        JSON.stringify(list),
      );
    }

    return list;
  }, [
    account,
    user,
    storedActiveMembership,
  ]);

  const protectedProfilePortal = useMemo(
    () => portalRequiresProfileMembership(allowedRoles),
    [allowedRoles],
  );

  const matchingMemberships = useMemo(() => {
    return allMemberships.filter((membership) => {
      if (
        !roleAllowed(
          membership.role,
          allowedRoles,
        )
      ) {
        return false;
      }

      if (!membershipIsUsable(membership)) {
        return false;
      }

      if (
        protectedProfilePortal &&
        !profileRoleHasPermanentId(membership)
      ) {
        return false;
      }

      return true;
    });
  }, [
    allMemberships,
    allowedRoles,
    protectedProfilePortal,
  ]);

  const selectedMembership = useMemo(() => {
    const normalizedActive =
      normalizeMembership(activeMembership) ||
      storedActiveMembership;

    if (
      normalizedActive &&
      roleAllowed(
        normalizedActive.role,
        allowedRoles,
      ) &&
      membershipIsUsable(normalizedActive) &&
      (
        !protectedProfilePortal ||
        profileRoleHasPermanentId(normalizedActive)
      )
    ) {
      return normalizedActive;
    }

    if (protectedProfilePortal) {
      return matchingMemberships.length === 1
        ? matchingMemberships[0]
        : null;
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
    [
      activeSchoolId,
      selectedMembership?.schoolId,
      openedWorkspace,
    ],
  );

  const effectiveBranchId = useMemo(
    () =>
      toPermanentId(activeBranchId) ||
      toPermanentId(selectedMembership?.branchId) ||
      toPermanentId(openedWorkspace?.branchId) ||
      readStoredId("activeBranchId"),
    [
      activeBranchId,
      selectedMembership?.branchId,
      openedWorkspace,
    ],
  );

  const expectedAppearance = useMemo(() => {
    const role =
      activeRole ||
      selectedMembership?.role ||
      null;

    if (!role) {
      return null;
    }

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

  const renderedWorkspaceRef = useRef<string | null>(
    null,
  );

  const appearanceMatchesRole = Boolean(
    expectedAppearance &&
      themeContext.ready &&
      appearanceContext.firstEntryReady &&
      themeContext.effectiveScope === expectedScope &&
      appearanceIdentityMatches(
        themeContext.appliedFor,
        expectedAppearance,
      ) &&
      appearanceIdentityMatches(
        appearanceContext.appliedFor,
        expectedAppearance,
      ),
  );

  const currentAppearanceWasRendered = Boolean(
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
    if (
      !authenticated ||
      !accountId ||
      !selectedMembership
    ) {
      return;
    }

    if (
      activeMembership &&
      sameMembership(
        normalizeMembership(activeMembership),
        selectedMembership,
      )
    ) {
      return;
    }

    const normalized = writeWorkspaceSession(
      selectedMembership,
    );

    if (normalized) {
      setActiveMembership(normalized).catch(
        (error: any) => {
          console.error(
            "Failed to persist selected workspace:",
            error,
          );
        },
      );
    }
  }, [
    authenticated,
    accountId,
    selectedMembership,
    activeMembership,
    setActiveMembership,
  ]);

  const switchableMemberships = useMemo(
    () =>
      allMemberships.filter(
        (membership) => membership.active !== false,
      ),
    [allMemberships],
  );

  const canAccess = useMemo(() => {
    if (protectedProfilePortal) {
      return protectedPortalCanAccess(
        selectedMembership,
        allowedRoles,
      );
    }

    if (
      selectedMembership &&
      roleAllowed(
        selectedMembership.role,
        allowedRoles,
      )
    ) {
      return true;
    }

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

  /**
   * ACCESS REDIRECTION
   *
   * The previous implementation waited for initialSyncDone
   * before deciding whether the user could access the portal.
   *
   * Synchronization completion is no longer an access condition.
   * We now use restored authentication and membership state.
   */
  useEffect(() => {
    if (
      accountRestoring ||
      accountLoading ||
      !membershipRestored ||
      contextLoading
    ) {
      return;
    }

    if (
      sessionVerified &&
      (!authenticated || !accountId)
    ) {
      router.replace("/login");
      return;
    }

    if (
      sessionVerified &&
      authenticated &&
      !canAccess
    ) {
      router.replace("/select-role");
      return;
    }

    if (
      sessionVerified &&
      authenticated &&
      (
        (requireSchool && !effectiveSchoolId) ||
        (requireBranch && !effectiveBranchId)
      )
    ) {
      router.replace("/select-role");
    }
  }, [
    accountRestoring,
    accountLoading,
    membershipRestored,
    contextLoading,
    sessionVerified,
    authenticated,
    accountId,
    canAccess,
    requireSchool,
    requireBranch,
    effectiveSchoolId,
    effectiveBranchId,
    router,
  ]);

  const directNavItems = useMemo(() =>
    navSections.flatMap((section) => section.items),
    [navSections],
  );

  const labels = useMemo(() => {
    const out: Record<string, string> = {};

    navSections.forEach((section) =>
      section.items.forEach((item) => {
        out[item.key] = item.label;
      }),
    );

    return out;
  }, [navSections]);

  const groups = useMemo(() => {
    const out: Record<string, string> = {};

    navSections.forEach((section) =>
      section.items.forEach((item) => {
        out[item.key] = section.title;
      }),
    );

    return out;
  }, [navSections]);

  const [tab, setTab] = useState(homeKey);

  // Restore the last viewed module only after resolving the correct signed-in
  // account and selected membership. Module memory never establishes access.
  const moduleMemoryMembershipId = selectedMembership
    ? membershipKey(selectedMembership)
    : null;
  const availableModuleKeys = navSections
    .flatMap((section) => section.items.map((item) => item.key))
    .join("\u001f");

  useEffect(() => {
    if (
      !authenticated ||
      !accountId ||
      !canAccess ||
      !moduleMemoryMembershipId
    ) {
      setTab(homeKey);
      return;
    }

    const remembered = readLastWorkspaceModule(
      accountId,
      moduleMemoryMembershipId,
    );

    // Reject modules removed from this portal or no longer in its route map.
    const allowed =
      remembered === ELEEVEON_CENTER_KEY ||
      (Boolean(remembered) &&
        Object.prototype.hasOwnProperty.call(routes, remembered!) &&
        availableModuleKeys.split("\u001f").includes(remembered!));

    setTab(allowed && remembered ? remembered : homeKey);
  }, [
    accountId,
    authenticated,
    canAccess,
    moduleMemoryMembershipId,
    homeKey,
    availableModuleKeys,
  ]);


  // V19: route changes reset ONLY the shared module scroller. The portal
  // navigation stays in place and embedded report/table scroll positions
  // remain independent. Do not introduce a window scroll or route reload.
  useEffect(() => {
    const workspacePane = document.querySelector<HTMLElement>(
      ".role-shell.workspace-locked-scroll .app-content",
    );
    if (workspacePane) workspacePane.scrollTop = 0;
  }, [tab]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const [
    accountDrawerOpen,
    setAccountDrawerOpen,
  ] = useState(false);

  const [
    switchingMembershipId,
    setSwitchingMembershipId,
  ] = useState<string | null>(null);

  /**
   * NON-BLOCKING ROLE-WIDE OFFLINE PREPARATION
   *
   * This runs after the user has entered an authorized portal.
   *
   * It does not participate in the portal's loading gate.
   * The existing local Dexie records remain available.
   *
   * The helper avoids duplicate same-workspace bootstraps
   * and checks that the requested role is still active
   * before starting queued work.
   *
   * Connectivity restoration triggers another attempt.
   */
  useEffect(() => {
    if (
      !authenticated ||
      !sessionVerified ||
      !accountId ||
      !membershipRestored ||
      !canAccess ||
      !selectedMembership ||
      !appearanceMatchesRole ||
      !databaseContext.ready ||
      Boolean(switchingMembershipId)
    ) {
      return;
    }

    const membership = selectedMembership;
    let disposed = false;

    const start = () => {
      if (disposed) {
        return;
      }

      void prepareRoleWorkspaceInBackground(
        membership,
      );
    };

    // Give the portal the opportunity to paint first.
    // The full workspace download is no longer on the
    // navigation-critical path.
    const timer = window.setTimeout(
      start,
      900,
    );

    window.addEventListener(
      "online",
      start,
    );

    return () => {
      disposed = true;

      window.clearTimeout(timer);

      window.removeEventListener(
        "online",
        start,
      );
    };
  }, [
    authenticated,
    sessionVerified,
    accountId,
    membershipRestored,
    canAccess,
    selectedMembership,
    appearanceMatchesRole,
    databaseContext.ready,
    switchingMembershipId,
  ]);

  const [isOnline, setIsOnline] = useState(true);

  /** Non-blocking status text; never used to gate portal navigation. */
  const [priorityPreparing, setPriorityPreparing] = useState<string | null>(null);
  const [priorityProgress, setPriorityProgress] = useState<{ done: number; total: number } | null>(null);
  const [priorityRetry, setPriorityRetry] = useState(0);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const priorityAttemptedAt = useRef(new Map<string, number>());

  const activeModuleLabel = labels[tab] || tab;
  const activeModuleTables = useMemo(
    () => tablesForPortalRoute(tab, activeModuleLabel),
    [tab, activeModuleLabel],
  );

  // This is advisory, not a navigation gate: cached records stay usable.
  // A completed priority download proves ONLY its requested tables.
  const moduleReadiness = useOfflineTableReadiness(
    selectedMembership, activeModuleTables, priorityPreparing !== null,
  );

  // One stable primitive key per selected account/workspace, not an object
  // reference that could change on every context refresh.
  const priorityWorkspaceKey = selectedMembership
    ? [
        accountId || "",
        membershipKey(selectedMembership),
        effectiveSchoolId || "",
        effectiveBranchId || "",
        canonicalPriorityRole(selectedMembership.role),
      ].join("|")
    : "";

  /**
   * ACTIVE-PAGE PRIORITY SYNC
   *
   * Runs after the portal has painted and does not block route navigation.
   * The existing background bootstrap always continues to fetch ALL tables.
   *
   * Uses the selected-membership-authorized /sync/workspace-bootstrap route.
   * Filtered data is never marked as a completed full-role download.
   */
  useEffect(() => {
    if (
      !authenticated ||
      !sessionVerified ||
      !accountId ||
      !membershipRestored ||
      !canAccess ||
      !appearanceMatchesRole ||
      !databaseContext.ready ||
      !isOnline ||
      Boolean(switchingMembershipId) ||
      !priorityWorkspaceKey ||
      activeModuleTables.length === 0 ||
      canonicalPriorityRole(selectedMembership?.role) === "teacher"
    ) {
      setPriorityPreparing(null);
      return;
    }

    let disposed = false;
    const requestKey = [
      priorityWorkspaceKey,
      tab,
      activeModuleTables.join(","),
    ].join("|");
    const lastAttempt = priorityAttemptedAt.current.get(requestKey) || 0;
    // A manual retry advances priorityRetry and triggers this effect again;
    // ordinary page navigation uses the short recent-attempt throttle.
    if (Date.now() - lastAttempt < 30_000 && priorityRetry === 0) return;

    const timer = window.setTimeout(() => {
      if (disposed || !navigator.onLine || !selectedMembership) return;
      if (arePriorityWorkspaceTablesCached(selectedMembership, activeModuleTables)) return;
      // Also check the persisted workspace to avoid a stale queued request
      // being scheduled while the user is switching roles.
      const opened = readOpenWorkspaceSession();
      if (
        opened?.membershipId &&
        opened.membershipId !== membershipKey(selectedMembership!)
      ) {
        return;
      }
      priorityAttemptedAt.current.set(requestKey, Date.now());
      setPriorityPreparing(activeModuleLabel);
      setPriorityError(null);
      setPriorityProgress(null);

      void bootstrapPriorityWorkspaceTables(selectedMembership!, activeModuleTables, {
        onProgress: (done, total) => {
          if (!disposed) setPriorityProgress({ done, total });
        },
      }).catch((error) => {
        if (disposed) return;
        priorityAttemptedAt.current.delete(requestKey);
        setPriorityError(error instanceof Error ? error.message : String(error));
        console.warn("[portal] Active-module priority sync failed:", error);
      }).finally(() => {
        if (!disposed) {
          setPriorityPreparing(null);
          setPriorityProgress(null);
        }
      });
    }, 60);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      setPriorityPreparing(null);
    };
  }, [
    authenticated,
    sessionVerified,
    accountId,
    membershipRestored,
    canAccess,
    appearanceMatchesRole,
    databaseContext.ready,
    isOnline,
    switchingMembershipId,
    selectedMembership?.role,
    priorityWorkspaceKey,
    tab,
    activeModuleLabel,
    activeModuleTables,
    priorityRetry,
  ]);

  // Teacher's server authorization permits a role-specific collection of
  // tables. A generic module list can include forbidden tables, so never send
  // it to the priority endpoint for Teacher. Download the backend-selected,
  // membership-scoped set instead; this remains fully server-authorized.
  const teacherWorkspace = canonicalPriorityRole(selectedMembership?.role) === "teacher";
  const [teacherDataState, setTeacherDataState] = useState<{
    key: string;
    ready: boolean;
    error: string | null;
    preparing: boolean;
  }>({ key: "", ready: false, error: null, preparing: false });

  useEffect(() => {
    if (!teacherWorkspace || !priorityWorkspaceKey || !selectedMembership ||
        !authenticated || !sessionVerified || !canAccess ||
        !appearanceMatchesRole || !databaseContext.ready || switchingMembershipId) return;
    let cancelled = false;
    const key = priorityWorkspaceKey;
    const membership = selectedMembership;
    setTeacherDataState({ key, ready: false, error: null, preparing: true });
    void (async () => {
      try {
        const cached = await isWorkspaceLocallyReady(membership);
        if (cancelled) return;
        if (cached) {
          setTeacherDataState({ key, ready: true, error: null, preparing: false });
          return;
        }
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new Error("Connect to the internet to download your assigned teaching records.");
        }
        await bootstrapSelectedWorkspace(membership, {
          // A manual Retry must make a fresh authorized request, not return
          // the same incomplete cached membership download again.
          allowCached: priorityRetry === 0,
          force: priorityRetry > 0,
          onProgress: (progress) => {
            if (cancelled) return;
            setPriorityProgress({ done: progress.current ?? 0, total: progress.total ?? 0 });
          },
        });
        if (cancelled) return;
        const complete = await isWorkspaceLocallyReady(membership);
        if (!complete) throw new Error("Teacher workspace download is not complete. Retry to continue.");
        setTeacherDataState({ key, ready: true, error: null, preparing: false });
      } catch (error) {
        if (cancelled) return;
        setTeacherDataState({ key, ready: false,
          error: error instanceof Error ? error.message : String(error), preparing: false });
      }
    })();
    return () => { cancelled = true; };
  }, [teacherWorkspace, priorityWorkspaceKey, authenticated, sessionVerified,
      canAccess, appearanceMatchesRole, databaseContext.ready,
      switchingMembershipId, priorityRetry]);

  const retryCurrentModule = useCallback(() => {
    if (!navigator.onLine || !selectedMembership || !activeModuleTables.length) return;
    if (teacherWorkspace) setTeacherDataState({ key: priorityWorkspaceKey, ready: false, error: null, preparing: true });
    // Retry the same module without refreshing the document or other modules.
    priorityAttemptedAt.current.clear();
    setPriorityError(null);
    setPriorityRetry(value => value + 1);
  }, [selectedMembership, activeModuleTables, teacherWorkspace, priorityWorkspaceKey]);

  const [hubUnreadCount, setHubUnreadCount] = useState(0);
  const [hubHasAttention, setHubHasAttention] = useState(false);

  const [openSections, setOpenSections] = useState<
    Record<string, boolean>
  >(() =>
    navSections.reduce((acc, section) => {
      acc[section.title] =
        section.defaultOpen === true;

      return acc;
    }, {} as Record<string, boolean>),
  );

  useEffect(() => {
    setOpenSections((current) =>
      navSections.reduce((next, section) => {
        next[section.title] =
          current[section.title] ??
          (section.defaultOpen === true);

        return next;
      }, {} as Record<string, boolean>),
    );
  }, [navSections]);

  useEffect(() => {
    const update = () => {
      setIsOnline(navigator.onLine);
    };

    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHubIndicator = async () => {
      if (!accountId) {
        if (!cancelled) {
          setHubUnreadCount(0);
          setHubHasAttention(false);
        }

        return;
      }

      try {
        const [
          announcements,
          receipts,
          feedback,
        ] = await Promise.all([
          db.platformAnnouncements.toArray(),

          db.platformAnnouncementReceipts
            .where("accountId")
            .equals(accountId)
            .toArray(),

          db.platformFeedback
            .where("accountId")
            .equals(accountId)
            .toArray(),
        ]);

        const readIds = new Set(
          receipts
            .filter((receipt: any) =>
              Boolean(receipt.readAt),
            )
            .map((receipt: any) =>
              String(receipt.announcementId),
            ),
        );

        const now = Date.now();

        const role = String(
          selectedMembership?.role ||
          activeRole ||
          "",
        );

        const unread = announcements.filter(
          (announcement: any) => {
            if (
              announcement.status !== "published"
            ) {
              return false;
            }

            if (
              announcement.publishAt &&
              new Date(
                announcement.publishAt,
              ).getTime() > now
            ) {
              return false;
            }

            if (
              announcement.expiresAt &&
              new Date(
                announcement.expiresAt,
              ).getTime() < now
            ) {
              return false;
            }

            if (
              Array.isArray(
                announcement.targetRoles,
              ) &&
              announcement.targetRoles.length &&
              role &&
              !announcement.targetRoles.includes(role)
            ) {
              return false;
            }

            return !readIds.has(
              String(announcement.id),
            );
          },
        ).length;

        const attention = feedback.some(
          (item: any) =>
            [
              "responded",
              "action_required",
              "waiting_for_user",
            ].includes(
              String(
                item.status || "",
              ).toLowerCase(),
            ),
        );

        if (!cancelled) {
          setHubUnreadCount(unread);
          setHubHasAttention(attention);
        }
      } catch (error) {
        console.warn(
          "Could not load Eleeveon Hub indicator:",
          error,
        );
      }
    };

    void loadHubIndicator();

    const refresh = () => {
      void loadHubIndicator();
    };

    window.addEventListener(
      "eleeveon:hub-refresh",
      refresh,
    );

    window.addEventListener(
      "eleeveon:local-data-changed",
      refresh,
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "eleeveon:hub-refresh",
        refresh,
      );

      window.removeEventListener(
        "eleeveon:local-data-changed",
        refresh,
      );
    };
  }, [
    accountId,
    activeRole,
    selectedMembership?.role,
    tab,
  ]);

  const workspaceIdentities =
    useWorkspaceDisplayNames(
      allMemberships,
      (user as any) ?? null,
    );

  const visibleMemberName = useMemo(
    () =>
      selectedMemberName({
        openedWorkspace,
        selectedMembership,
        user,
        account,
      }),
    [
      openedWorkspace,
      selectedMembership,
      user,
      account,
    ],
  );

  const visibleMemberMeta = useMemo(
    () =>
      selectedMemberMeta({
        selectedMembership,
        identities: workspaceIdentities,
      }),
    [
      selectedMembership,
      workspaceIdentities,
    ],
  );

  const visibleMemberImage = useMemo(() => {
    const workspaceImage = workspaceProfileImage(
      selectedMembership,
      workspaceIdentities,
    );

    const userImage = String(
      (user as any)?.photo ??
      (user as any)?.profilePhoto ??
      (user as any)?.avatar ??
      (user as any)?.image ??
      "",
    ).trim();

    return (
      workspaceImage ||
      userImage ||
      null
    );
  }, [
    selectedMembership,
    workspaceIdentities,
    user,
  ]);

  const ActiveComponent = useMemo(
    () =>
      tab === ELEEVEON_CENTER_KEY
        ? EleeveonCenter
        : routes[tab] ?? routes[homeKey],
    [
      routes,
      tab,
      homeKey,
    ],
  );

  const activeLabel =
    tab === ELEEVEON_CENTER_KEY
      ? "Eleeveon Hub"
      : labels[tab] ?? portalTitle;

  const activeGroup =
    tab === ELEEVEON_CENTER_KEY
      ? "Messages, notices and support"
      : groups[tab] ?? portalSubtitle;

  const resolvedMemberRole = displayRoleLabel(
    selectedMembership?.role ||
    account?.role ||
    user?.role ||
    "Member",
  );

  const resolvedWorkspaceLabel =
    activeBranch?.name ||
    activeSchool?.name ||
    activeGroup ||
    "Workspace";

  useEffect(() => {
    setWindowChromeIdentity({
      title: activeLabel,
      workspace: resolvedWorkspaceLabel,

      memberName: visibleMemberName,
      memberRole: resolvedMemberRole,
      memberImage: visibleMemberImage,
      memberMeta: visibleMemberMeta,

      online: isOnline,
      realtimeConnected,
      initialSyncDone,
      realtimeStatus: realtimeStatus.status,
      sidebarHidden: branchWorkspaceLayout || sidebarHidden,

      onToggleSidebar: () => {
        if (branchWorkspaceLayout) {
          document.getElementById("ba-workspace-navigation")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (sidebarHidden) {
          setSidebarHidden(false);
          setSidebarOpen(true);
          return;
        }

        setSidebarHidden(true);
      },

      onOpenStatus: openStatusSheet,

      onOpenAccount: () => {
        setAccountDrawerOpen(true);
      },
    });

    return () => {
      clearWindowChromeIdentity();
    };
  }, [
    activeLabel,
    clearWindowChromeIdentity,
    initialSyncDone,
    isOnline,
    openStatusSheet,
    realtimeConnected,
    realtimeStatus.status,
    resolvedMemberRole,
    resolvedWorkspaceLabel,
    setWindowChromeIdentity,
    sidebarHidden,
    branchWorkspaceLayout,
    visibleMemberImage,
    visibleMemberMeta,
    visibleMemberName,
  ]);

  // STAGE A: initialize only the authenticated workspace identity and its
  // appearance dependencies. Never confuse an empty Dexie table with a
  // successfully downloaded (genuinely empty) table.
  // The exact group is marked complete only by the validated backend bootstrap.
  const entryIdentity = selectedMembership && accountId
    ? [accountId, membershipKey(selectedMembership),
        effectiveSchoolId || "", effectiveBranchId || ""].join("|")
    : "";
  const appearanceFoundationTables = useMemo(() => {
    if (!selectedMembership) return [];
    const scope = appearanceScopeForRole(selectedMembership.role || "");
    if (scope === "branch") return ["schools", "branches", "schoolBranchSettings"];
    if (scope === "school") return ["schools"];
    return [];
  }, [selectedMembership?.role]);
  const [entryState, setEntryState] = useState<{
    key: string;
    state: "checking" | "ready" | "failed";
    error?: string;
  }>({ key: "", state: "checking" });
  const [entryProgress, setEntryProgress] = useState<WorkspaceBootstrapProgress | null>(null);
  const [entryRetry, setEntryRetry] = useState(0);

  useEffect(() => {
    if (!entryIdentity || !selectedMembership || !authenticated ||
        !sessionVerified || !membershipRestored || !canAccess ||
        accountRestoring || accountLoading || contextLoading ||
        !databaseContext.ready || switchingMembershipId) return;

    let cancelled = false;
    const membership = selectedMembership;
    setEntryState({ key: entryIdentity, state: "checking" });
    setEntryProgress({ stage: "checking-cache", title: "Preparing school identity…",
      detail: "Checking school, branch and appearance records for this workspace.", percent: 5 });

    const prepare = async () => {
      try {
        const ready = appearanceFoundationTables.length === 0 ||
          arePriorityWorkspaceTablesCached(membership, appearanceFoundationTables);
        if (!ready) {
          if (!navigator.onLine) throw new Error("Connect to the internet to initialize this workspace for the first time.");
          setEntryProgress({ stage: "requesting", title: "Downloading school appearance…",
            detail: "Getting the selected school, branch and settings before entry.", percent: 20 });
          await bootstrapPriorityWorkspaceTables(membership, appearanceFoundationTables, {
            onProgress: (done, total) => {
              if (cancelled) return;
              setEntryProgress({ stage: "applying", title: "Saving workspace identity…",
                detail: "Preparing the correct school and branch appearance.",
                percent: total > 0 ? Math.min(90, 20 + Math.round(70 * done / total)) : 75,
                current: done, total });
            },
          });
        }
        if (cancelled) return;
        if (appearanceFoundationTables.length &&
            !arePriorityWorkspaceTablesCached(membership, appearanceFoundationTables)) {
          throw new Error("School appearance download did not finish. Retry to complete setup.");
        }
        // Providers may already have read an empty IndexedDB on this new device.
        // Re-read after committing the foundation tables, then the existing
        // role-scoped appearance identity gate must succeed before rendering.
        if (!ready) {
          // Important: these refreshes MUST be sequential. Applying the
          // appearance before SettingsContext finishes rehydrating can lock
          // the portal onto its account/default palette on a fresh device.
          await Promise.resolve(refreshInstitution());
          if (cancelled) return;
          await Promise.resolve(refreshSettings());
          if (cancelled) return;
          const applied = await appearanceContext.refresh();
          if (!applied) {
            throw new Error("The selected workspace appearance could not be applied. Retry workspace setup.");
          }
        }
        if (!cancelled) {
          setEntryState({ key: entryIdentity, state: "ready" });
          setEntryProgress(null);
        }
      } catch (error) {
        if (!cancelled) setEntryState({ key: entryIdentity, state: "failed",
          error: error instanceof Error ? error.message : String(error) });
      }
    };
    void prepare();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIdentity, entryRetry, authenticated, sessionVerified,
      membershipRestored, canAccess, accountRestoring, accountLoading,
      contextLoading, databaseContext.ready, switchingMembershipId]);

  const firstDownloadReady = Boolean(entryIdentity &&
    entryState.key === entryIdentity && entryState.state === "ready");
  const firstDownloadFailed = Boolean(entryIdentity &&
    entryState.key === entryIdentity && entryState.state === "failed");

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

  const firstAppearanceChecking = Boolean(
    hasUsableWorkspace &&
    expectedAppearance &&
    !appearanceMatchesRole,
  );

  const checking =
    accountOrWorkspaceChecking ||
    firstAppearanceChecking;

  const portalRuntimeContext = useMemo<
    RolePortalRuntimeContext
  >(
    () => ({
      accountId,
      user,
      account,
      subscription,
      authenticated,

      offline:
        accountOffline ||
        !isOnline,

      restoring: accountRestoring,
      verifying: accountVerifying,
      sessionVerified,

      membership: selectedMembership,
      memberships: switchableMemberships,

      activeRole:
        activeRole ||
        selectedMembership?.role ||
        null,

      teacherId:
        activeTeacherId ||
        toPermanentId(
          selectedMembership?.teacherId,
        ),

      studentId:
        activeStudentId ||
        toPermanentId(
          selectedMembership?.studentId,
        ),

      parentId:
        activeParentId ||
        toPermanentId(
          selectedMembership?.parentId,
        ),

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

  /**
   * ORIGINAL NAVIGATION BEHAVIOR
   *
   * Navigation remains local React tab state.
   * No browser history changes are introduced.
   */
  const navigate = (key: string) => {
    if (
      key !== ELEEVEON_CENTER_KEY &&
      !Object.prototype.hasOwnProperty.call(routes, key)
    ) return;

    setTab(key);
    if (authenticated && canAccess && accountId && moduleMemoryMembershipId) {
      rememberLastWorkspaceModule(accountId, moduleMemoryMembershipId, key);
    }
    setSidebarOpen(false);
    setAccountDrawerOpen(false);

    const activeGroup = groups[key];

    if (activeGroup) {
      setOpenSections(
        navSections.reduce(
          (next, section) => {
            next[section.title] =
              section.title === activeGroup;

            return next;
          },
          {} as Record<string, boolean>,
        ),
      );
    }

    if (typeof window !== "undefined") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const handleLogout = useCallback(
    async () => {
      setAccountDrawerOpen(false);
      setSidebarOpen(false);

      await logout();
    },
    [logout],
  );

  const toggleSection = (title: string) => {
    setOpenSections((current) => {
      const willOpen = !current[title];

      return navSections.reduce(
        (next, section) => {
          next[section.title] =
            willOpen &&
            section.title === title;

          return next;
        },
        {} as Record<string, boolean>,
      );
    });
  };

  /**
   * FAST ROLE SWITCHING
   *
   * Only essential identity and appearance initialization
   * takes place before navigation.
   *
   * The expensive workspace bootstrap, institution refresh
   * and account refresh are no longer required to finish
   * before the next role portal opens.
   *
   * Role-wide download will start inside the destination
   * portal through the background preparation effect.
   */
  const switchMembership = async (
    membership: UserMembership,
  ) => {
    if (switchingMembershipId) {
      return;
    }

    const normalized =
      normalizeMembership(membership) ||
      membership;

    const id = membershipKey(normalized);
    // A stored membership or an untrusted role label is never sufficient.
    // Require the target to match a membership in this user's restored list.
    const authorizedTarget = switchableMemberships.find(
      (candidate) =>
        membershipKey(candidate) === id &&
        candidate.role === normalized.role &&
        String(candidate.schoolId || "") === String(normalized.schoolId || "") &&
        String(candidate.branchId || "") === String(normalized.branchId || "") &&
        String(candidate.teacherId || "") === String(normalized.teacherId || "") &&
        String(candidate.studentId || "") === String(normalized.studentId || "") &&
        String(candidate.parentId || "") === String(normalized.parentId || ""),
    );
    if (!authorizedTarget || !membershipIsUsable(authorizedTarget)) {
      console.warn("Refused role switch: membership not available in the current account.");
      return;
    }

    const previousStorage = captureWorkspaceStorage();
    let committedToNavigation = false;
    try {
      setSwitchingMembershipId(id);
      // Preflight BEFORE mutating the active role: an offline document
      // navigation must have a cached target route.
      await assertSwitchTargetAvailable(getPortalPathByRole(normalized.role));

      await runTransition(
        {
          mode: "role-switch",
          membership: normalized,
          title: "Switching workspace…",
          detail:
            "Activating your selected role and workspace.",
        },

        async ({
          setStage,
        }) => {
          setStage("access", {
            detail:
              "Validating access for the selected role and workspace.",
          });

          const opened =
            writeWorkspaceSession(normalized) ||
            normalized;

          beginMembershipTransition(opened);

          setStage("membership", {
            detail:
              `Activating ${displayRoleLabel(opened.role)} and its profile context.`,
          });

          await setActiveMembership(opened);

          /*
           * No workspace bulk download here.
           *
           * applyForMembership uses the exact selected
           * membership and hydrates saved/default settings.
           * This avoids refreshing the previous role by mistake.
           */
          setStage("appearance", {
            detail:
              "Applying your role's appearance and branding.",
          });

          const applied =
            await themeContext.applyForMembership(
              opened,
            );

          const expected =
            appearanceIdentityFor({
              role: opened.role,
              accountId: opened.accountId,
              schoolId: opened.schoolId,
              branchId: opened.branchId,
            });

          if (
            !applied ||
            !appearanceIdentityMatches(
              applied,
              expected,
            )
          ) {
            throw new Error(
              "The selected workspace appearance could not be applied.",
            );
          }

          completeMembershipTransition();

          setAccountDrawerOpen(false);
          setSidebarOpen(false);

          setStage("dashboard", {
            detail:
              `Opening the ${displayRoleLabel(opened.role)} workspace.`,
          });

          committedToNavigation = true;
          window.location.replace(
            getPortalPathByRole(opened.role),
          );
        },
      );
    } catch (error) {
      // Do not strand the user in the target role after a failed preflight
      // or appearance transition. Preserve the previous stored identity.
      if (!committedToNavigation) {
        restoreWorkspaceStorage(previousStorage);
        const previous = previousStorage.activeMembership;
        if (previous) {
          try {
            const priorMembership = JSON.parse(previous) as UserMembership;
            await setActiveMembership(priorMembership);
            await themeContext.applyForMembership(priorMembership);
          } catch (restoreError) {
            console.warn("Previous workspace restoration needs a reload:", restoreError);
          }
        }
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to open the selected workspace.";

      failMembershipTransition(message);

      console.error(
        "Failed to switch role/workspace:",
        error,
      );

      setSwitchingMembershipId(null);
    }
  };

  const handleSidebarResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handleMove = (
        moveEvent: MouseEvent,
      ) => {
        setSidebarWidth(
          Math.min(
            380,
            Math.max(
              240,
              startWidth +
                moveEvent.clientX -
                startX,
            ),
          ),
        );
      };

      const handleUp = () => {
        window.removeEventListener(
          "mousemove",
          handleMove,
        );

        window.removeEventListener(
          "mouseup",
          handleUp,
        );
      };

      window.addEventListener(
        "mousemove",
        handleMove,
      );

      window.addEventListener(
        "mouseup",
        handleUp,
      );
    },
    [sidebarWidth],
  );

  // Teacher uses server-authorized full-role bootstrap (not an unsafe generic
  // priority pull). But a *workspace* completion does NOT prove every module's
  // requested tables were included. Reports in particular need assessment
  // structures, structure items and grading rules in addition to entries.
  const teacherModuleDependencies = teacherWorkspace
    ? tab === "reportsWorkspace"
      ? [
          "academicStructures", "academicPeriods", "classes", "classSubjects",
          "students", "studentEnrollments", "assessmentStructures",
          "assessmentStructureItems", "assessmentEntries", "gradingStructures",
          "gradeRules",
        ]
      : tab === "teacherStudents"
        ? ["students", "studentEnrollments", "classes", "classSubjects"]
        : []
    : [];
  const teacherMissingModuleTables =
    teacherWorkspace && selectedMembership && teacherDataState.ready
      ? teacherModuleDependencies.filter(
          (tableName) =>
            getWorkspaceTableAvailability(selectedMembership, tableName) !== "complete",
        )
      : [];
  const teacherModuleComplete = teacherWorkspace &&
    teacherDataState.key === priorityWorkspaceKey && teacherDataState.ready &&
    teacherMissingModuleTables.length === 0;
  const moduleFullyReady = teacherWorkspace
    ? teacherModuleComplete
    : moduleReadiness.status === "complete";
  const moduleDownloadError = teacherWorkspace
    ? (teacherDataState.key === priorityWorkspaceKey
        ? teacherDataState.error || (
            teacherMissingModuleTables.length
              ? `The Teacher workspace download did not include the ${activeModuleLabel} dependencies: ${teacherMissingModuleTables.join(", ")}. Retry the authorized download. If these tables are still missing, the backend Teacher bootstrap allow-list must be corrected.`
              : null
          )
        : null)
    : priorityError;
  const moduleIsPreparing = teacherWorkspace
    ? (teacherDataState.key !== priorityWorkspaceKey || teacherDataState.preparing)
    : priorityPreparing !== null;

  // Never release a fresh/incognito workspace before its complete,
  // membership-scoped bootstrap has finished. On failure keep Retry visible;
  // do not open blank modules or silently use the wrong branding.
  if (hasUsableWorkspace && entryIdentity && !firstDownloadReady) {
    return (
      <WorkspaceBootstrapScreen
        progress={entryProgress}
        error={firstDownloadFailed ? entryState.error || "Workspace preparation failed." : null}
        onRetry={() => setEntryRetry((value) => value + 1)}
        onCancel={() => router.push("/select-role")}
      />
    );
  }

  if (checking && appearanceContext.error && firstAppearanceChecking) {
    return (
      <WorkspaceBootstrapScreen
        error={appearanceContext.error}
        onRetry={() => {
          void Promise.all([
            Promise.resolve(refreshInstitution()),
            Promise.resolve(refreshSettings()),
            Promise.resolve(themeContext.refreshTheme()),
          ]).then(() => setEntryRetry((value) => value + 1));
        }}
        onCancel={() => router.push("/select-role")}
      />
    );
  }

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

  if (
    !authenticated ||
    !accountId
  ) {
    return (
      <CenterCard
        title="Redirecting to login..."
        text="You must sign in to continue."
      />
    );
  }

  if (!canAccess) {
    return (
      <CenterCard
        title="Choose workspace"
        text="This portal needs an opened role/workspace session. Return to Select Role and open the role again."
      />
    );
  }

  if (
    (requireSchool && !effectiveSchoolId) ||
    (requireBranch && !effectiveBranchId)
  ) {
    return (
      <CenterCard
        title="Workspace context required"
        text="This role needs a school or branch context. Return to Select Role and open the workspace again."
      />
    );
  }

  return (
    <main
      className={[
        "role-shell",
        "workspace-locked-scroll",
        branchWorkspaceLayout && "branch-workspace-layout",
        sidebarHidden &&
          "portal-sidebar-hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      data-appearance-scope={
        themeContext.effectiveScope
      }
      data-appearance-key={
        themeContext.appliedFor?.key ||
        undefined
      }
      data-window-chrome="integrated"
      style={
        {
          "--sidebar-width":
            `${sidebarWidth}px`,

          "--portal-header-height":
            "48px",

          "--portal-content-left":
            branchWorkspaceLayout || sidebarHidden
              ? "0px"
              : `${sidebarWidth}px`,

          "--primary-color":
            resolvedPrimaryColor,

          "--dashboard-primary":
            resolvedPrimaryColor,

          "--branch-primary":
            resolvedPrimaryColor,

          "--accent-color":
            resolvedPrimaryColor,

          // CSS consumers in the compact workspace use the --eds-* aliases.
          // Set them on the shell as well as <html> so light-mode palettes
          // cannot replace the branch's selected accent with app default blue.
          "--eds-primary":
            resolvedPrimaryColor,

          "--eds-brand-primary":
            resolvedPrimaryColor,

          "--eds-primary-soft":
            `color-mix(in srgb, ${resolvedPrimaryColor} 15%, transparent)`,

          "--eds-primary-softer":
            `color-mix(in srgb, ${resolvedPrimaryColor} 8%, transparent)`,

          "--font-family":
            resolvedFontFamily,

          "--font-size":
            `${resolvedFontSize}px`,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>
      <style>{`
        .role-module-first-download{min-height:min(52vh,480px);display:grid;place-items:center;padding:20px}
        .role-module-first-download-card{width:min(420px,100%);padding:28px 22px;text-align:center;display:grid;justify-items:center;gap:13px;border:1px solid var(--border,#d8dee8);border-radius:22px;background:var(--surface,#fff);color:var(--text,#182436)}
        .role-module-first-download-card strong{font-size:17px}
        .role-module-first-download-card p{margin:0;font-size:13px;line-height:1.6;color:var(--muted,#65748a)}
        .role-module-first-download-card small{font-size:12px;color:var(--muted,#65748a)}
        .role-module-first-download-card button{border:0;border-radius:12px;background:var(--primary-color,#2563eb);color:#fff;padding:11px 20px;font:inherit;font-weight:700;cursor:pointer}
        .role-module-first-download-card button:disabled{opacity:.45;cursor:not-allowed}
        .role-module-first-spinner{width:38px;height:38px;border-radius:50%;border:4px solid var(--border,#d8dee8);border-top-color:var(--primary-color,#2563eb);animation:role-first-spin .8s linear infinite}
        @keyframes role-first-spin{to{transform:rotate(360deg)}}
      `}</style>

      <SyncStatusSheet />

      {/* Background changes are silent; sync details remain in SyncStatusSheet. */}
      <span hidden aria-hidden="true" style={{ display: "none" }}>
        {applyingChanges ? "Applying new data" : ""}
      </span>

      {(
        sidebarOpen ||
        accountDrawerOpen
      ) ? (
        <button
          aria-label="Close drawer"
          className="app-overlay"
          onClick={() => {
            setSidebarOpen(false);
            setAccountDrawerOpen(false);
          }}
        />
      ) : null}

      {!branchWorkspaceLayout && (
      <PortalSidebar
        open={sidebarOpen}
        hidden={sidebarHidden}
        portalTitle={portalTitle}
        portalSubtitle={portalSubtitle}
        activeInstitutionName={
          activeSchool?.name ||
          activeBranch?.name ||
          null
        }
        activeBranchName={
          activeBranch?.name ||
          null
        }
        hubUnreadCount={hubUnreadCount}
        hubHasAttention={hubHasAttention}
        hubKey={ELEEVEON_CENTER_KEY}
        activeTab={tab}
        homeKey={homeKey}
        sections={navSections}
        openSections={openSections}
        onNavigate={navigate}
        onOpenHub={() =>
          navigate(ELEEVEON_CENTER_KEY)
        }
        onToggleSection={toggleSection}
        onResizeStart={
          handleSidebarResizeStart
        }
      />
      )}

      <AccountWorkspaceDrawer
        open={accountDrawerOpen}
        memberName={visibleMemberName}
        memberRole={
          displayRoleLabel(
            selectedMembership?.role ||
            account?.role ||
            user?.role ||
            "Member",
          )
        }
        memberImage={visibleMemberImage}
        selectedMembership={selectedMembership}
        memberships={switchableMemberships}
        identities={workspaceIdentities}
        switchingMembershipId={
          switchingMembershipId
        }
        schoolId={
          activeSchoolId ||
          effectiveSchoolId
        }
        branchId={
          activeBranchId ||
          effectiveBranchId
        }
        schools={
          (schools || []).map((school: any) => ({
            id: school.id,
            name: school.name,
          }))
        }
        branches={
          (branches || []).map((branch: any) => ({
            id: branch.id,
            name: branch.name,
          }))
        }
        lockedContext={lockedContext}
        online={isOnline}
        realtimeConnected={realtimeConnected}
        membershipKey={membershipKey}
        sameMembership={sameMembership}
        roleLabel={displayRoleLabel}
        roleIcon={roleIcon}
        onClose={() =>
          setAccountDrawerOpen(false)
        }
        onSwitchMembership={switchMembership}
        onSchoolChange={(id) =>
          setActiveSchoolId?.(id)
        }
        onBranchChange={(id) =>
          setActiveBranchId?.(id)
        }
        onOpenStatus={() => {
          openStatusSheet();
          setAccountDrawerOpen(false);
        }}
        onSelectRole={() =>
          router.push("/select-role")
        }
        onLogout={handleLogout}
      />

      <section
        className={`app-main ${
          branchWorkspaceLayout || sidebarHidden ? "full" : ""
        }`}
      >
        {branchWorkspaceLayout ? (
          <BranchWorkspaceNavigation
            items={directNavItems}
            activeKey={tab}
            onNavigate={navigate}
            branchName={resolvedWorkspaceLabel}
            online={isOnline}
            memberImage={visibleMemberImage}
            memberName={visibleMemberName}
            onOpenStatus={openStatusSheet}
            onOpenAccount={() => setAccountDrawerOpen(true)}
          />
        ) : (
        <PortalHeader
          activeLabel={activeLabel}
          workspaceLabel={
            resolvedWorkspaceLabel
          }
          memberName={visibleMemberName}
          memberRole={resolvedMemberRole}
          memberImage={visibleMemberImage}
          memberMeta={visibleMemberMeta}
          online={isOnline}
          realtimeConnected={realtimeConnected}
          initialSyncDone={initialSyncDone}
          realtimeStatus={
            realtimeStatus.status
          }
          sidebarHidden={sidebarHidden}
          onToggleSidebar={() => {
            if (sidebarHidden) {
              setSidebarHidden(false);
              setSidebarOpen(true);
            } else {
              setSidebarHidden(true);
            }
          }}
          onOpenStatus={openStatusSheet}
          onOpenAccount={() =>
            setAccountDrawerOpen(true)
          }
        />
        )}

        <PortalContent>
          {/* Preserve readiness and retry wiring without reserving banner space.
              Detailed status remains accessible from the existing Sync control. */}
          <div hidden aria-hidden="true" style={{ display: "none" }}>
          <OfflineDataStatus
            availability={moduleReadiness.status}
            moduleLabel={activeModuleLabel}
            missingCount={moduleReadiness.missingCount}
            totalCount={moduleReadiness.totalCount}
            online={moduleReadiness.online}
            preparing={priorityPreparing !== null}
            progress={priorityProgress}
            onRetry={retryCurrentModule}
          />
          {priorityPreparing && (
            <div
              className="role-priority-sync-note"
              role="status"
              aria-live="polite"
            >
              <span className="role-priority-sync-dot" aria-hidden="true" />
              Updating {priorityPreparing} for offline use…
            </div>
          )}
          </div>
          {activeModuleTables.length > 0 && !moduleFullyReady ? (
            <section className="role-module-first-download" role="status" aria-live="polite">
              <div className="role-module-first-download-card">
                {!moduleDownloadError && moduleReadiness.online ? (
                  <span className="role-module-first-spinner" aria-hidden="true" />
                ) : null}
                <strong>{moduleDownloadError ? "Unable to prepare this module" :
                  !moduleReadiness.online ? "Module not available offline yet" :
                  `Preparing ${activeModuleLabel}…`}</strong>
                <p>{moduleDownloadError || (!moduleReadiness.online
                  ? "This module has not been downloaded on this device. Reconnect and retry."
                  : "Downloading the records required by this module. Existing school records are not being treated as empty.")}</p>
                {priorityProgress?.total ? (
                  <small>{priorityProgress.done.toLocaleString()} / {priorityProgress.total.toLocaleString()} records</small>
                ) : null}
                {(moduleDownloadError || !moduleReadiness.online || (!teacherWorkspace && moduleReadiness.status === "failed")) && (
                  <button type="button" onClick={retryCurrentModule}
                    disabled={!moduleReadiness.online}>Retry download</button>
                )}
              </div>
            </section>
          ) : (
            <ActiveComponent
              navigate={navigate}
              context={portalRuntimeContext}
            />
          )}
        </PortalContent>
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
        {spin && (
          <div className="loading-spinner" />
        )}

        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

export default RolePortalShellContent;

/**
 * SHELL STYLES
 *
 * The former .portal-contained-modal contract
 * has been removed from this file.
 *
 * Shared overlay boundaries are defined in
 * PortalOverlayBoundaries.css.
 *
 * Shell navigation, account drawer, appearance
 * and ordinary scrolling styles remain here.
 */

const css = `
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.role-priority-sync-note {
  display: flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 10px;
  padding: 6px 10px;
  border: 1px solid var(--border, rgba(100,116,139,.18));
  border-radius: 999px;
  color: var(--muted, #64748b);
  background: var(--surface, #ffffff);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}

.role-priority-sync-dot {
  display: block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary-color, #2f6fed);
  animation: rolePriorityPulse 1.2s ease-in-out infinite;
}

@keyframes rolePriorityPulse {
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .role-priority-sync-dot { animation: none; }
}

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
  --shell-sidebar-bg:
    var(--eds-sidebar-bg, var(--surface, #ffffff));

  --shell-header-bg:
    color-mix(
      in srgb,
      var(--eds-header-bg, var(--surface, #ffffff)) 94%,
      transparent
    );

  --shell-menu-bg:
    var(--eds-drawer-bg, var(--surface, #ffffff));

  --shell-section-bg:
    color-mix(
      in srgb,
      var(--bg, #f7f8fb) 76%,
      var(--surface, #ffffff)
    );

  --shell-hover-bg:
    color-mix(
      in srgb,
      var(--primary-color, #2f6fed) 9%,
      var(--surface, #ffffff)
    );

  --shell-active-bg:
    color-mix(
      in srgb,
      var(--primary-color, #2f6fed) 14%,
      var(--surface, #ffffff)
    );

  --shell-soft-border:
    color-mix(
      in srgb,
      var(--border, rgba(0,0,0,.10)) 82%,
      transparent
    );

  --dashboard-primary:
    var(--primary-color, #2f6fed);
}

html,
body {
  max-width: 100%;
  overflow-x: hidden;

  background:
    var(--eds-shell-bg, var(--bg, #f7f8fb));

  color:
    var(--eds-text, var(--text, #111111));

  font-family:
    var(--font-family, system-ui);

  font-size:
    var(--font-size, 16px);
}

* {
  box-sizing: border-box;
}

.role-shell,
.center-page {
  min-height:
    calc(
      100dvh -
      var(--eds-shell-top-offset, 0px)
    );

  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;

  background:
    var(--eds-shell-bg, var(--bg, #f7f8fb));

  color:
    var(--eds-text, var(--text, #111111));

  font-family:
    var(--font-family, system-ui);

  font-size:
    var(--font-size, 16px);
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

  background:
    var(--card-bg, var(--surface, #ffffff));

  border:
    1px solid var(--border, rgba(0,0,0,.10));

  box-shadow:
    var(
      --shell-shadow,
      0 24px 60px rgba(15,23,42,.10)
    );

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

  border:
    4px solid
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 18%,
      transparent
    );

  border-top-color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

  animation: spin .8s linear infinite;
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

  top: var(--eds-shell-top-offset, 0px);
  bottom: 0;

  z-index: 50;

  height:
    calc(
      100dvh -
      var(--eds-shell-top-offset, 0px)
    );

  max-width: 100vw;

  background:
    var(
      --shell-sidebar-bg,
      var(--surface, #ffffff)
    );

  color: var(--text, #111111);

  overflow-y: hidden;
  overflow-x: hidden;
  overscroll-behavior: contain;

  box-shadow:
    var(
      --shell-shadow,
      0 24px 70px rgba(15,23,42,.22)
    );

  transition:
    transform .22s ease,
    width .22s ease;
}

.app-sidebar {
  left: 0;
  width: min(88vw, 330px);
  transform: translateX(-105%);
  padding: 12px;

  display: flex;
  flex-direction: column;
}

.app-sidebar.open {
  transform: translateX(0);
}

.context-drawer {
  right: 0;
  width: min(90vw, 370px);
  transform: translateX(105%);
  padding: 16px;

  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
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

  background:
    var(--shell-sidebar-bg, var(--surface, #ffffff));

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
  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 15px;

  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );

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

  border:
    1px solid var(--border, rgba(0,0,0,.10));

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
  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );

  border-color: transparent;
}

.nav-list {
  min-height: 0;
  flex: 1;

  display: flex;
  flex-direction: column;
  gap: 8px;

  padding-bottom: 12px;
  max-width: 100%;

  overflow-y: auto;
  overflow-x: hidden;
}

.nav-section {
  border-radius: 20px;
  background: var(--shell-section-bg, #f7f8fb);

  border:
    1px solid var(--border, rgba(0,0,0,.08));

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
  background: var(--shell-hover-bg, #f1f5f9);
}

.nav-item.active {
  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );
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
  overflow-y: visible;

  transition:
    margin-left .22s ease,
    width .22s ease;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 48px;
  max-width: 100%;
  padding: 5px 14px;

  background:
    var(
      --shell-header-bg,
      var(--surface, #ffffff)
    );

  border-bottom:
    1px solid var(--border, rgba(0,0,0,.08));

  backdrop-filter: blur(14px);
  overflow: visible;
}

.member-access {
  min-width: 0;
  max-width: min(430px, 48vw);

  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: center;
  gap: 6px;
}

.member-pill {
  min-width: 0;
  min-height: 42px;

  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;

  border: 0;
  border-radius: 14px;
  padding: 4px 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.member-pill:hover {
  background: var(--shell-hover-bg, #f1f5f9);
}

.member-avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;

  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 16%,
      var(--surface, #ffffff)
    );

  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

  font-size: 11px;
  font-weight: 1000;
}

.member-avatar img,
.workspace-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.member-copy {
  min-width: 0;
  display: block;
}

.member-copy b,
.member-copy > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-copy b {
  color: var(--text, #111111);
  font-size: 12px;
  font-weight: 950;
}

.member-copy > span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 750;
}

.member-center-action {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;

  border:
    1px solid var(--border, rgba(0,0,0,.08));

  border-radius: 12px;
  background: transparent;

  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.member-center-action:hover,
.member-center-action.active {
  border-color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 9%,
      transparent
    );
}

.sync-dot-wrap {
  position: relative;
  flex: 0 0 auto;
}

.sync-dot-btn {
  width: 36px;
  height: 36px;

  border:
    1px solid var(--border, rgba(0,0,0,.10));

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

  box-shadow:
    0 0 0 5px rgba(239,68,68,.12);
}

.sync-dot-btn.ok span {
  background: #22c55e;

  box-shadow:
    0 0 0 5px rgba(34,197,94,.13);
}

.sync-dot-btn.live span {
  background: #0ea5e9;

  box-shadow:
    0 0 0 5px rgba(14,165,233,.14);
}

.sync-dot-btn.warn span {
  background: #ef4444;

  box-shadow:
    0 0 0 5px rgba(239,68,68,.12);
}

.sync-popover {
  position: fixed;
  top: 56px;
  right: 12px;

  width: min(560px, calc(100vw - 24px));
  max-height: min(78dvh, 760px);

  border-radius: 18px;
  padding: 8px;

  background:
    var(
      --shell-menu-bg,
      var(--surface, #ffffff)
    );

  border:
    1px solid var(--border, rgba(0,0,0,.10));

  box-shadow:
    var(
      --shell-shadow,
      0 24px 60px rgba(15,23,42,.18)
    );

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

  padding-bottom:
    max(
      28px,
      env(safe-area-inset-bottom)
    );

  overflow-x: hidden;
  overflow-y: visible;
}

.app-content-inner {
  width: 100%;
  max-width: 100%;
  min-width: 0;

  overflow-x: hidden;
  overflow-y: visible;
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

  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

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
  background: var(--shell-section-bg, #f7f8fb);

  border:
    1px solid var(--border, rgba(0,0,0,.10));

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

  border:
    1px solid
    var(
      --input-border,
      var(--border, rgba(0,0,0,.10))
    );

  border-radius: 15px;
  padding: 0 12px;

  background:
    var(
      --input-bg,
      var(--surface, #ffffff)
    );

  color:
    var(
      --input-text,
      var(--text, #111111)
    );

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
  background: var(--shell-section-bg, #f7f8fb);

  border:
    1px solid var(--border, rgba(0,0,0,.08));

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
  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );
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

  border:
    1px solid var(--border, rgba(0,0,0,.10));

  border-radius: 18px;
  padding: 9px;

  background:
    var(
      --shell-menu-bg,
      var(--surface, #ffffff)
    );

  color: var(--text, #111111);

  display: grid;
  grid-template-columns:
    42px minmax(0, 1fr) auto;
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
  border-color:
    color-mix(
      in srgb,
      var(--dashboard-primary, #2563eb) 42%,
      var(--border, rgba(0,0,0,.10))
    );

  background:
    color-mix(
      in srgb,
      var(--dashboard-primary, #2563eb) 8%,
      var(--surface, #ffffff)
    );
}

.workspace-list button:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.workspace-list button > .workspace-avatar {
  grid-row: span 2;
  width: 42px;
  height: 42px;

  display: grid;
  place-items: center;
  border-radius: 15px;

  background:
    color-mix(
      in srgb,
      var(--dashboard-primary, #2563eb) 10%,
      transparent
    );

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

  background:
    color-mix(
      in srgb,
      var(--dashboard-primary, #2563eb) 10%,
      transparent
    );

  color: var(--dashboard-primary, #2563eb);

  font-size: 10px;
  font-weight: 950;
  text-align: center;
}

.workspace-list.compact button {
  min-height: 58px;
}

@media (min-width: 980px) {
  .role-shell {
    display: grid;

    grid-template-columns:
      minmax(
        240px,
        var(--sidebar-width, 300px)
      )
      minmax(0, 1fr);

    grid-template-rows:
      minmax(0, 1fr);

    align-items: stretch;
    width: 100%;
    max-width: 100vw;

    min-height:
      calc(
        100dvh -
        var(--eds-shell-top-offset, 0px)
      );

    overflow: hidden;

    transition:
      grid-template-columns .22s ease;
  }

  .role-shell.portal-sidebar-hidden {
    grid-template-columns:
      0 minmax(0, 1fr);
  }

  .app-overlay {
    display: none;
  }

  .app-sidebar {
    position: sticky;
    grid-column: 1;
    grid-row: 1;

    top: var(--eds-shell-top-offset, 0px);
    left: auto;
    bottom: auto;

    z-index: 35;
    width: 100%;
    min-width: 0;
    max-width: none;

    height:
      calc(
        100dvh -
        var(--eds-shell-top-offset, 0px)
      );

    transform: none;
    box-shadow: none;

    border-right:
      1px solid var(--border, rgba(0,0,0,.08));

    overflow: hidden;
  }

  .app-sidebar.hidden,
  .app-sidebar.hidden.open {
    width: 0;
    min-width: 0;

    padding-left: 0;
    padding-right: 0;
    border-right: 0;

    transform: none;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
  }

  .app-main,
  .app-main.full {
    position: relative;
    grid-column: 2;
    grid-row: 1;

    min-width: 0;
    width: 100%;
    max-width: 100%;

    margin-left: 0;
    overflow-x: hidden;
  }

  .app-header,
  .app-content,
  .app-content-inner {
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }

  .app-content {
    padding: 12px;
  }

  .app-content-inner > *,
  .app-content main,
  .app-content section,
  .app-content article,
  .app-content form,
  .app-content div {
    min-width: 0;
  }

  .app-content table {
    width: max-content;
    min-width: 100%;
  }

  .app-content :is(
    .table-wrap,
    .table-wrapper,
    .data-table-wrap,
    .responsive-table,
    [class*="table-container"],
    [class*="table-wrapper"]
  ) {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
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
    background:
      color-mix(
        in srgb,
        var(--dashboard-primary, #2563eb) 18%,
        transparent
      );
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

  .member-access {
    max-width: min(240px, 54vw);

    grid-template-columns:
      minmax(0, 1fr) 36px;
  }

  .member-pill {
    min-height: 38px;

    grid-template-columns:
      30px minmax(0, 1fr);

    gap: 7px;
    padding: 3px 5px;
  }

  .member-avatar {
    width: 30px;
    height: 30px;
  }

  .member-copy > span {
    display: none;
  }

  .member-center-action {
    width: 36px;
    height: 36px;
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

    width:
      min(
        360px,
        calc(100vw - 18px)
      );

    max-height:
      min(72dvh, 620px);
  }

  .drawer-info {
    grid-template-columns: 1fr;
  }

  .nav-item {
    min-height: 43px;
  }
}

/* Refactored shell controls */

.app-sidebar {
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.nav-list {
  min-height: 0;
  flex: 1;

  display: flex;
  flex-direction: column;
  gap: 2px;

  padding: 4px 2px 14px;

  overflow-y: auto;
  overflow-x: hidden;
}

.nav-section {
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.nav-section-title {
  min-height: 36px;
  border-radius: 11px;
  padding: 7px 9px;

  display: grid;
  grid-template-columns:
    minmax(0, 1fr) 22px;

  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: none;
}

.nav-section-title:hover {
  background:
    color-mix(
      in srgb,
      var(--muted, #64748b) 7%,
      transparent
    );

  color: var(--text, #111111);
}

.nav-items {
  gap: 2px;
  padding: 2px 0 5px;
}

.nav-item {
  min-height: 40px;
  border-radius: 11px;
  padding: 7px 9px;

  display: grid;
  grid-template-columns:
    26px minmax(0, 1fr);

  gap: 8px;
}

.nav-item.active {
  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );
}

.header-status {
  flex: 0 0 auto;
}

.header-account-button {
  min-width: 0;
  max-width: min(230px, 32vw);
  min-height: 40px;

  display: grid;
  grid-template-columns:
    32px minmax(0, 1fr);

  align-items: center;
  gap: 8px;

  border: 0;
  border-radius: 13px;
  padding: 4px 7px;

  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.header-account-button:hover {
  background: var(--shell-hover-bg, #f1f5f9);
}

.header-account-avatar,
.account-drawer-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;

  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 16%,
      var(--surface, #ffffff)
    );

  color:
    var(
      --dashboard-primary,
      var(--primary-color, #2563eb)
    );

  font-weight: 1000;
}

.header-account-avatar {
  width: 32px;
  height: 32px;
  font-size: 10px;
}

.header-account-avatar img,
.account-drawer-avatar img,
.workspace-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.header-account-copy {
  min-width: 0;
}

.header-account-copy strong,
.header-account-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-account-copy strong {
  font-size: 11px;
  font-weight: 900;
}

.header-account-copy small {
  margin-top: 1px;
  color: var(--muted, #64748b);
  font-size: 9px;
}

.account-drawer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-drawer-head {
  justify-content: space-between;
  padding-bottom: 12px;

  border-bottom:
    1px solid var(--border, rgba(0,0,0,.08));
}

.account-drawer-identity {
  min-width: 0;

  display: grid;
  grid-template-columns:
    44px minmax(0, 1fr);

  align-items: center;
  gap: 10px;
}

.account-drawer-avatar {
  width: 44px;
  height: 44px;
  font-size: 12px;
}

.account-drawer-identity strong,
.account-drawer-identity small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-drawer-identity strong {
  font-size: 15px;
  font-weight: 950;
}

.account-drawer-identity small {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  text-transform: capitalize;
}

.account-current-workspace {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-radius: 16px;

  background:
    var(--shell-section-bg, #f7f8fb);
}

.account-current-workspace > span,
.account-drawer-section > header span {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.account-current-workspace strong,
.account-current-workspace small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-current-workspace strong {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 900;
}

.account-current-workspace small {
  color: var(--muted, #64748b);
  font-size: 10px;
}

.account-primary-link {
  width: 100%;

  display: grid;
  grid-template-columns:
    38px minmax(0, 1fr) auto;

  align-items: center;
  gap: 10px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 20%,
      var(--border, rgba(0,0,0,.08))
    );

  border-radius: 16px;
  padding: 10px;

  background:
    color-mix(
      in srgb,
      var(
        --dashboard-primary,
        var(--primary-color, #2563eb)
      ) 7%,
      var(--surface, #ffffff)
    );

  color: inherit;
  text-align: left;
  cursor: pointer;
}

.account-link-icon {
  width: 38px;
  height: 38px;

  display: grid;
  place-items: center;

  border-radius: 13px;

  background:
    var(
      --eds-sidebar-active,
      var(--shell-active-bg)
    );

  color:
    var(
      --eds-sidebar-active-text,
      var(--dashboard-primary, #2563eb)
    );

  font-weight: 1000;
}

.account-primary-link strong,
.account-primary-link small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-primary-link small {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
}

.account-drawer-section {
  display: grid;
  gap: 8px;
}

.account-drawer-section > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.account-context-field {
  display: grid;
  gap: 5px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 800;
}

.account-context-field select {
  width: 100%;
  min-height: 42px;

  border:
    1px solid var(--border, rgba(0,0,0,.1));

  border-radius: 13px;
  padding: 0 10px;
  background: var(--surface, #ffffff);
  color: var(--text, #111111);
}

.account-quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.account-quick-actions button {
  min-width: 0;

  display: grid;
  grid-template-columns:
    auto minmax(0, 1fr);

  grid-template-rows:
    auto auto;

  gap: 1px 8px;
  align-items: center;

  border:
    1px solid var(--border, rgba(0,0,0,.08));

  border-radius: 14px;
  padding: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.account-quick-actions button > span {
  grid-row: span 2;
}

.account-quick-actions strong,
.account-quick-actions small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-quick-actions small {
  color: var(--muted, #64748b);
  font-size: 9px;
}

.account-logout {
  width: 100%;
  min-height: 42px;
  margin-top: auto;
  border: 0;
  border-radius: 14px;
  background: rgba(239,68,68,.1);
  color: #dc2626;
  font-weight: 900;
  cursor: pointer;
}

@media (max-width: 760px) {
  .header-title span {
    display: none;
  }

  .header-account-button {
    width: 38px;
    max-width: 38px;
    grid-template-columns: 30px;
    padding: 4px;
  }

  .header-account-copy {
    display: none;
  }

  .header-account-avatar {
    width: 30px;
    height: 30px;
  }

  .account-quick-actions {
    grid-template-columns: 1fr;
  }
}

/* Phase 6 — role portal shell design language */

.role-shell {
  background:
    var(--eds-gradient-page-glow),
    var(--eds-bg);
}

.shell-sidebar {
  isolation: isolate;

  background:
    var(--eds-gradient-sidebar),
    var(--eds-surface);

  border-right:
    1px solid var(--eds-divider);

  box-shadow:
    var(--eds-inset-highlight);
}

.shell-sidebar-inner,
.shell-drawer-inner {
  position: relative;
  z-index: 2;
  min-height: 100%;

  display: flex;
  flex-direction: column;
}

.shell-sidebar-texture,
.shell-drawer-texture {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.shell-sidebar-head {
  background:
    color-mix(
      in srgb,
      var(--eds-surface) 82%,
      transparent
    );

  backdrop-filter: blur(16px);

  border-bottom:
    1px solid var(--eds-divider);
}

.shell-sidebar-logo {
  width: 100%;
  min-width: 0;

  display: grid;
  grid-template-columns:
    38px minmax(0, 1fr);

  align-items: center;
  gap: 10px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.shell-sidebar-logo-copy {
  min-width: 0;
}

.shell-sidebar-logo-copy strong,
.shell-sidebar-logo-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell-sidebar-logo-copy strong {
  color: var(--eds-text-strong);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: -.02em;
}

.shell-sidebar-logo-copy small {
  margin-top: 2px;
  color: var(--eds-text-muted);
  font-size: 9px;
  font-weight: 650;
}

.shell-workspace-card {
  display: grid;
  grid-template-columns:
    34px minmax(0, 1fr);

  align-items: center;
  gap: 9px;
  margin: 8px 2px 10px;
  padding: 9px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--eds-primary) 17%,
      var(--eds-border)
    );

  border-radius:
    var(--eds-radius-card);

  background:
    var(--eds-gradient-brand-soft),
    var(--eds-surface);

  box-shadow:
    var(--eds-shadow-soft);
}

.shell-workspace-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;

  border-radius:
    var(--eds-radius-control);

  background:
    var(--eds-primary-soft);
}

.shell-workspace-copy {
  min-width: 0;
}

.shell-workspace-copy small,
.shell-workspace-copy strong,
.shell-workspace-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell-workspace-copy small {
  color: var(--eds-text-muted);
  font-size: 8px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.shell-workspace-copy strong {
  margin-top: 2px;
  color: var(--eds-text-strong);
  font-size: 11px;
  font-weight: 850;
}

.shell-workspace-copy span {
  margin-top: 1px;
  color: var(--eds-text-muted);
  font-size: 9px;
}

.shell-nav-list {
  gap: 5px;
}

.shell-nav-group {
  position: relative;
}

.shell-nav-group-title {
  width: 100%;
  min-height: 32px;

  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto;

  align-items: center;
  gap: 8px;
  border: 0;

  border-radius:
    var(--eds-radius-sm);

  padding: 5px 8px;
  background: transparent;
  color: var(--eds-text-muted);
  text-align: left;
  cursor: pointer;
}

.shell-nav-group-title:hover {
  background: var(--eds-primary-softer);
  color: var(--eds-text-strong);
}

.shell-nav-group-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.shell-nav-items {
  display: grid;
  gap: 2px;
  margin-top: 2px;
}

.shell-nav-item {
  position: relative;
  width: 100%;
  min-height: 39px;

  display: grid;
  grid-template-columns:
    28px minmax(0, 1fr) 3px;

  align-items: center;
  gap: 7px;

  border: 1px solid transparent;

  border-radius:
    var(--eds-radius-control);

  padding: 6px 8px;
  background: transparent;
  color: var(--eds-text);
  text-align: left;
  cursor: pointer;

  transition:
    var(--eds-transition-color),
    var(--eds-transition-transform);
}

.shell-nav-item:hover {
  background: var(--eds-primary-softer);
  transform: translateX(1px);
}

.shell-nav-item.active {
  border-color:
    color-mix(
      in srgb,
      var(--eds-primary) 22%,
      var(--eds-border)
    );

  background:
    linear-gradient(
      90deg,
      var(--eds-primary-soft),
      var(--eds-primary-softer)
    );

  color: var(--eds-primary);

  box-shadow:
    var(--eds-shadow-soft);
}

.shell-nav-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: inherit;
}

.shell-nav-item.active .shell-nav-icon {
  background:
    color-mix(
      in srgb,
      var(--eds-primary) 12%,
      transparent
    );
}

.shell-nav-item strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 750;
}

.shell-nav-active-marker {
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: transparent;
}

.shell-nav-item.active .shell-nav-active-marker {
  background: var(--eds-primary);
}

.shell-sidebar-footer {
  margin-top: auto;
  padding-top: 8px;

  border-top:
    1px solid var(--eds-divider);
}

.shell-sidebar-profile {
  width: 100%;

  display: grid;
  grid-template-columns:
    auto minmax(0, 1fr) auto;

  align-items: center;
  gap: 8px;
  border: 0;

  border-radius:
    var(--eds-radius-card);

  padding: 7px;
  background: var(--eds-primary-softer);
  color: inherit;
  text-align: left;
}

.shell-sidebar-profile-copy {
  min-width: 0;
}

.shell-sidebar-profile-copy strong,
.shell-sidebar-profile-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell-sidebar-profile-copy strong {
  font-size: 10px;
}

.shell-sidebar-profile-copy small {
  color: var(--eds-text-muted);
  font-size: 8px;
}

.app-header {
  background:
    color-mix(
      in srgb,
      var(--eds-glass-medium-bg) 94%,
      transparent
    );

  border-bottom:
    1px solid var(--eds-divider);

  box-shadow:
    0 8px 24px rgba(15,23,42,.035);
}

.app-header::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;

  background:
    linear-gradient(
      90deg,
      transparent,
      color-mix(
        in srgb,
        var(--eds-primary) 20%,
        transparent
      ),
      transparent
    );

  pointer-events: none;
}

.shell-portal-content {
  position: relative;
  padding: 0;
}

.shell-content-background {
  min-height: 100%;
  padding: 8px;
}

.shell-account-drawer {
  isolation: isolate;

  background:
    var(--eds-gradient-sidebar),
    var(--eds-surface);

  border-left:
    1px solid var(--eds-divider);
}

.shell-account-drawer .account-drawer-head {
  position: sticky;
  top: 0;
  z-index: 4;

  background:
    color-mix(
      in srgb,
      var(--eds-surface) 84%,
      transparent
    );

  backdrop-filter: blur(16px);
}

.shell-current-workspace {
  position: relative;
  overflow: hidden;

  background:
    var(--eds-gradient-brand-soft),
    var(--eds-surface);

  border:
    1px solid
    color-mix(
      in srgb,
      var(--eds-primary) 20%,
      var(--eds-border)
    );

  box-shadow:
    var(--eds-shadow-soft);
}

.shell-current-workspace .eds-status-indicator {
  margin-top: 6px;
}

.shell-context-selector .account-context-field > span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.workspace-list button {
  box-shadow:
    var(--eds-shadow-soft);
}

.workspace-list button.active {
  box-shadow:
    0 10px 28px
    color-mix(
      in srgb,
      var(--eds-primary) 9%,
      transparent
    );
}

.background-refresh-indicator {
  background:
    var(--eds-glass-strong-bg);

  backdrop-filter:
    var(--eds-glass-strong-filter);

  border-color:
    var(--eds-border);

  box-shadow:
    var(--eds-shadow-raised);
}

@media (min-width: 980px) {
  .shell-content-background {
    padding: 12px;
  }
}

@media (max-width: 760px) {
  .shell-content-background {
    padding: 6px;
  }

  .shell-workspace-card {
    margin-bottom: 7px;
  }
}

/* ---------------------------------------------------------
 * Portal header theme and single-page-scroll correction
 * --------------------------------------------------------- */

.app-header {
  isolation: isolate;

  background:
    color-mix(
      in srgb,
      var(
        --eds-header-bg,
        var(--surface, #ffffff)
      ) 96%,
      transparent
    ) !important;

  color:
    var(
      --eds-text,
      var(--text, #111827)
    ) !important;

  border-bottom:
    1px solid
    var(
      --eds-divider,
      var(
        --border,
        rgba(15,23,42,.09)
      )
    ) !important;
}

.app-header .header-title strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    ) !important;
}

.app-header .header-title span {
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    ) !important;
}

.app-header .header-account-button {
  color:
    var(
      --eds-text,
      var(--text, #111827)
    ) !important;
}

.app-header .header-account-button:hover {
  background:
    var(
      --eds-primary-softer,
      var(--shell-hover-bg)
    ) !important;
}

.app-header .header-account-copy strong {
  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    ) !important;
}

.app-header .header-account-copy small {
  color:
    var(
      --eds-text-muted,
      var(--muted, #667085)
    ) !important;
}

.app-header .header-account-avatar {
  background:
    var(
      --eds-primary-soft,
      color-mix(
        in srgb,
        var(
          --primary-color,
          #2563eb
        ) 15%,
        transparent
      )
    ) !important;

  color:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    ) !important;

  border:
    1px solid
    color-mix(
      in srgb,
      var(
        --eds-primary,
        var(--primary-color, #2563eb)
      ) 20%,
      var(--eds-border, transparent)
    );
}

.app-header .icon-btn {
  background:
    var(
      --eds-surface,
      var(--surface, #ffffff)
    ) !important;

  color:
    var(
      --eds-text-strong,
      var(--text, #111827)
    ) !important;

  border-color:
    var(
      --eds-border,
      var(
        --border,
        rgba(15,23,42,.09)
      )
    ) !important;
}

.app-header .icon-btn.primary {
  background:
    var(
      --eds-primary,
      var(--primary-color, #2563eb)
    ) !important;

  color:
    var(
      --eds-primary-text,
      #ffffff
    ) !important;

  border-color:
    transparent !important;
}

/*
 * Normal pages continue to use the document/window
 * as their main vertical scrolling surface.
 *
 * The shared PortalOverlayBoundaries.css stylesheet
 * independently constrains supported dialogs.
 */

html {
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

body {
  overflow-x: hidden;
  overflow-y: visible;
}

.role-shell,
.app-main,
.app-content,
.app-content-inner,
.shell-portal-content,
.shell-content-background {
  overflow-y: visible !important;
}

.role-shell,
.app-main {
  height: auto !important;
  max-height: none !important;
}

.app-content,
.app-content-inner,
.shell-portal-content {
  min-height: 0;
}

.app-sidebar {
  overflow: hidden !important;
}

.app-sidebar .nav-list {
  min-height: 0;

  overflow-x: hidden !important;
  overflow-y: auto !important;

  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.context-drawer {
  overflow-x: hidden !important;
  overflow-y: auto !important;

  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

/*
 * END OF SHELL STYLES
 *
 * Former .portal-contained-modal rules removed.
 * PortalOverlayBoundaries.css now owns the shared
 * overlay viewport and mobile navigation boundaries.
 */

/* BRANCH ADMIN: optional flat navigation — other roles remain unchanged. */
.role-shell.branch-workspace-layout {
  --portal-content-left: 0px !important;
  width: 100%;
  max-width: 100%;
  /* clip is not a scroll container; keep compact mobile navigation sticky. */
  overflow-x: clip !important;
  overflow-y: visible !important;
}
.role-shell.branch-workspace-layout .app-main,
.role-shell.branch-workspace-layout .app-main.full {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  margin-left: 0;
  overflow-x: clip !important;
  overflow-y: visible !important;
}
.role-shell.branch-workspace-layout .app-content,
.role-shell.branch-workspace-layout .app-content-inner {
  min-width: 0;
  width: 100%;
  max-width: 100%;
}
@media (min-width: 980px) {
  .role-shell.branch-workspace-layout {
    display: block !important;
    grid-template-columns: none !important;
    overflow: visible !important;
  }
  .role-shell.branch-workspace-layout .app-main,
  .role-shell.branch-workspace-layout .app-main.full {
    display: flex;
    grid-column: auto;
    grid-row: auto;
  }
}

/* ===============================================================
 * V19: SHARED STICKY WORKSPACES — based on the live 15 Oct source.
 *
 * The existing general-purpose shell allows window scrolling; these
 * later rules intentionally switch portal pages to one module scroller.
 * Keep module tables/reports free to scroll horizontally inside it.
 * =============================================================== */
.role-shell.workspace-locked-scroll {
  width: 100%;
  max-width: 100%;
  height: calc(100vh - var(--eds-shell-top-offset, 0px)) !important;
  height: calc(100dvh - var(--eds-shell-top-offset, 0px)) !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: hidden !important;
}
.role-shell.workspace-locked-scroll .app-main,
.role-shell.workspace-locked-scroll .app-main.full {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  min-width: 0;
  overflow: hidden !important;
}
/* The actual BranchWorkspaceNavigation component uses .ba-v7-nav.
 * Also reserve room for pinned cards and legacy .ba-v2-nav if present. */
.role-shell.workspace-locked-scroll .app-main > .app-header,
.role-shell.workspace-locked-scroll .app-main > .ba-v7-nav,
.role-shell.workspace-locked-scroll .app-main > .ba-v2-nav,
.role-shell.workspace-locked-scroll .app-main > .ba-v7-pinned-cards {
  flex: 0 0 auto;
}
.role-shell.workspace-locked-scroll .app-content {
  flex: 1 1 0;
  min-height: 0 !important;
  height: auto !important;
  max-height: none !important;
  min-width: 0;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--primary-color, #2563eb)
    color-mix(in srgb, var(--primary-color, #2563eb) 9%, transparent);
}
/* Prevent a wrapper from becoming a second scrolling ancestor: sticky
 * Report Cards subtabs must attach to the .app-content scroller. */
.role-shell.workspace-locked-scroll .app-content-inner,
.role-shell.workspace-locked-scroll .shell-portal-content .app-content-inner,
.role-shell.workspace-locked-scroll .shell-content-background {
  min-height: 0;
  overflow-x: visible !important;
  overflow-y: visible !important;
}
.role-shell.workspace-locked-scroll .app-content::-webkit-scrollbar {
  width: 9px;
}
.role-shell.workspace-locked-scroll .app-content::-webkit-scrollbar-track {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 9%, transparent);
}
.role-shell.workspace-locked-scroll .app-content::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 70%, #64748b);
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
}
@media (max-width: 979px) {
  /* Non-Branch roles use a separate mobile navigation footer. */
  .role-shell.workspace-locked-scroll:not(.branch-workspace-layout) .app-content {
    padding-bottom: max(88px, calc(68px + env(safe-area-inset-bottom)));
  }
}
@media print {
  /* Existing report and table printers retain unrestricted pagination. */
  .role-shell.workspace-locked-scroll,
  .role-shell.workspace-locked-scroll .app-main,
  .role-shell.workspace-locked-scroll .app-content,
  .role-shell.workspace-locked-scroll .app-content-inner,
  .role-shell.workspace-locked-scroll .shell-content-background {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }
}
`;
