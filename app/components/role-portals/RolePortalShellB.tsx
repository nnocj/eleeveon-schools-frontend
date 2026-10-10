"use client";

/**
 * app/components/role-portals/RolePortalShell.tsx
 * ---------------------------------------------------------
 * ROLE PORTAL SHELL - PUBLIC ENTRY
 * ---------------------------------------------------------
 *
 * PHASE 1 REFACTOR:
 * - public portal types remain exported from this file;
 * - WorkspaceTransitionProvider remains the outer provider;
 * - runtime implementation lives in shell/RolePortalShellContent.tsx;
 * - workspace/session helpers live in shell/rolePortalWorkspace.ts;
 * - identity/presentation helpers live in shell/rolePortalIdentity.ts;
 *
 * IMPORTANT:
 * This phase intentionally changes structure only.
 * Portal behavior, access rules, sync, appearance, navigation, drawers,
 * workspace switching and styling remain unchanged.
 */

import type React from "react";

import type { useAccount } from "../../context/account-context";
import type { useSettings } from "../../context/settings-context";
import type { useActiveBranch } from "../../context/active-branch-context";
import type { useSyncBootstrap } from "../../context/sync-bootstrap-context";
import type { useActiveMembership } from "../../context/active-membership-context";
import type { useRealtime } from "../../context/realtime-context";
import type { useTheme } from "../../context/theme-context";
import type { useDatabase } from "../../context/database-context";
import type { useSyncContext } from "../../context/sync-context";

import type {
  usePortalAppearanceReadiness,
} from "../PortalAppearanceRuntime";

import type {
  AppRole,
  UserMembership,
} from "../../lib/auth/roleRedirect";

import {
  WorkspaceTransitionProvider,
} from "../workspace";

import RolePortalShellContent from "./shell/RolePortalShellContent";

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
 * Existing portal route components were created over several phases.
 * Some accept only `{ navigate }`; rebuilt routes may also accept `context`.
 *
 * Keep the route registry backward-compatible.
 */
export type RolePortalRouteComponent =
  React.ComponentType<any>;

export type RolePortalShellProps = {
  portalTitle: string;
  portalSubtitle: string;
  homeKey: string;
  allowedRoles: AppRole[];
  navSections: RoleNavSection[];
  routes: Record<
    string,
    RolePortalRouteComponent
  >;
  lockedContext?: boolean;
  requireSchool?: boolean;
  requireBranch?: boolean;
};

export default function RolePortalShell(
  props: RolePortalShellProps,
) {
  return (
    <WorkspaceTransitionProvider>
      <RolePortalShellContent
        {...props}
      />
    </WorkspaceTransitionProvider>
  );
}