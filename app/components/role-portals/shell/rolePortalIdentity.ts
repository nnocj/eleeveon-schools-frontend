/**
 * app/components/role-portals/shell/rolePortalIdentity.ts
 * --------------------------------------------------------------------------
 * ROLE PORTAL IDENTITY / LABEL HELPERS
 * --------------------------------------------------------------------------
 *
 * Faithfully extracted from RolePortalShell.tsx.
 *
 * This module owns display-only identity logic:
 * - role labels and icons;
 * - workspace scope/detail labels;
 * - visible signed-in member name/meta resolution.
 *
 * PHASE 1 ONLY:
 * No access, session, navigation or history behavior is changed here.
 */

import type {
  UserMembership,
} from "../../../lib/auth/roleRedirect";

import type {
  useWorkspaceDisplayNames,
} from "../../../lib/workspaces/useWorkspaceDisplayNames";

import {
  workspaceDetailLabel,
  workspaceScopeLabel,
} from "../../../lib/workspaces/useWorkspaceDisplayNames";

import type {
  OpenWorkspaceSession,
} from "./rolePortalWorkspace";

export function roleLabel(
  role: string,
) {
  if (
    role ===
    "developer"
  ) {
    return "Developer";
  }

  if (
    role ===
    "platform_team"
  ) {
    return "Platform Team";
  }

  if (
    role ===
    "owner"
  ) {
    return "Owner";
  }

  if (
    role ===
    "super_admin"
  ) {
    return "Owner / Super Admin";
  }

  if (
    role ===
    "branch_admin"
  ) {
    return "Branch Admin";
  }

  if (
    role ===
    "admin"
  ) {
    return "School Admin";
  }

  if (
    role ===
    "accountant"
  ) {
    return "Accountant";
  }

  if (
    role ===
    "teacher"
  ) {
    return "Teacher";
  }

  if (
    role ===
    "student"
  ) {
    return "Student";
  }

  if (
    role ===
    "parent"
  ) {
    return "Parent";
  }

  return String(
    role ||
    "User",
  ).replaceAll(
    "_",
    " ",
  );
}

export function roleIcon(
  role: string,
) {
  if (
    role ===
    "developer"
  ) {
    return "🛠️";
  }

  if (
    role ===
    "platform_team"
  ) {
    return "🧩";
  }

  if (
    role ===
      "owner" ||
    role ===
      "super_admin"
  ) {
    return "👑";
  }

  if (
    role ===
    "branch_admin"
  ) {
    return "🏛️";
  }

  if (
    role ===
    "admin"
  ) {
    return "🏫";
  }

  if (
    role ===
    "accountant"
  ) {
    return "💰";
  }

  if (
    role ===
    "teacher"
  ) {
    return "👨‍🏫";
  }

  if (
    role ===
    "student"
  ) {
    return "🧑‍🎓";
  }

  if (
    role ===
    "parent"
  ) {
    return "👨‍👩‍👧";
  }

  return "👤";
}

export function roleScope(
  membership:
    UserMembership,
  identities:
    ReturnType<
      typeof useWorkspaceDisplayNames
    >,
) {
  return workspaceScopeLabel(
    membership,
    identities,
  );
}

export function roleDetail(
  membership:
    UserMembership,
  identities:
    ReturnType<
      typeof useWorkspaceDisplayNames
    >,
) {
  return workspaceDetailLabel(
    membership,
    identities,
  );
}

export function selectedMemberName(args: {
  openedWorkspace?:
    OpenWorkspaceSession |
    null;
  selectedMembership?:
    UserMembership |
    null;
  user?:
    any |
    null;
  account?:
    any |
    null;
}) {
  const workspace =
    args.openedWorkspace ||
    {};

  const membership:
    any =
      args.selectedMembership ||
      {};

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
      "Signed-in member",
  ).trim();
}

export function selectedMemberMeta(args: {
  selectedMembership?:
    UserMembership |
    null;
  identities:
    ReturnType<
      typeof useWorkspaceDisplayNames
    >;
}) {
  const membership =
    args.selectedMembership;

  if (!membership) {
    return "Signed-in workspace";
  }

  return [
    roleLabel(
      membership.role,
    ),

    roleScope(
      membership,
      args.identities,
    ),

    roleDetail(
      membership,
      args.identities,
    ),
  ].join(
    " · ",
  );
}