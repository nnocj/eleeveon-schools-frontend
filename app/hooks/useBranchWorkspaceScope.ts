"use client";

/**
 * app/hooks/useBranchWorkspaceScope.ts
 * --------------------------------------------------------------------------
 * One authoritative Branch Admin workspace scope using permanent string IDs.
 */

import { useMemo } from "react";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useActiveMembership } from "../context/active-membership-context";
import type { UserMembership } from "../lib/auth/roleRedirect";

export type BranchWorkspaceScope = {
  accountId: string | null;
  schoolId: string | null;
  branchId: string | null;
  membership: UserMembership | null;
  role: string | null;
  ready: boolean;
  authenticated: boolean;
  restoring: boolean;
  verifying: boolean;
  branchLoading: boolean;
  membershipRestored: boolean;
  error?: string;
};

const BRANCH_ROLES = new Set([
  "branch_admin",
  "teacher",
  "student",
  "parent",
  "accountant",
]);

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function normalizeRole(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function firstId(...values: unknown[]): string | null {
  for (const value of values) {
    const id = cleanId(value);
    if (id) return id;
  }
  return null;
}

export function useBranchWorkspaceScope(): BranchWorkspaceScope {
  const {
    accountId: accountContextId,
    authenticated,
    restoring,
    verifying,
  } = useAccount();

  const {
    activeSchoolId,
    activeSchool,
    activeBranchId,
    activeBranch,
    loading: branchLoading,
  } = useActiveBranch();

  const {
    activeMembership,
    activeRole,
    restored: membershipRestored,
  } = useActiveMembership();

  return useMemo(() => {
    const membership = activeMembership;
    const role = normalizeRole(activeRole || membership?.role);

    const membershipAccountId = cleanId(membership?.accountId);
    const accountId = cleanId(accountContextId) || membershipAccountId;

    const schoolId = firstId(
      membership?.schoolId,
      (membership as any)?.school?.id,
      (membership as any)?.activeSchoolId,
      activeSchoolId,
      activeSchool?.id,
    );

    const branchId = firstId(
      membership?.branchId,
      (membership as any)?.schoolBranchId,
      (membership as any)?.branch?.id,
      (membership as any)?.activeBranchId,
      activeBranchId,
      activeBranch?.id,
    );

    let error: string | undefined;

    if (
      accountContextId &&
      membershipAccountId &&
      String(accountContextId) !== membershipAccountId
    ) {
      error = "The active membership belongs to a different account.";
    } else if (role && BRANCH_ROLES.has(role) && !branchId) {
      error = "The selected role requires an active branch.";
    } else if (
      role &&
      !["developer", "platform_team"].includes(role) &&
      !schoolId
    ) {
      error = "The selected role requires an active school.";
    }

    const ready = Boolean(
      authenticated &&
        membershipRestored &&
        !restoring &&
        accountId &&
        schoolId &&
        branchId &&
        membership &&
        !error,
    );

    return {
      accountId,
      schoolId,
      branchId,
      membership,
      role: role || null,
      ready,
      authenticated,
      restoring,
      verifying,
      branchLoading,
      membershipRestored,
      error,
    };
  }, [
    accountContextId,
    authenticated,
    restoring,
    verifying,
    activeSchoolId,
    activeSchool,
    activeBranchId,
    activeBranch,
    branchLoading,
    activeMembership,
    activeRole,
    membershipRestored,
  ]);
}

export default useBranchWorkspaceScope;
