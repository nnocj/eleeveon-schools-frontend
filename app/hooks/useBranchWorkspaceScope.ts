"use client";

/**
 * app/hooks/useBranchWorkspaceScope.ts
 * --------------------------------------------------------------------------
 * One authoritative Branch Admin workspace scope.
 *
 * Pages should consume this hook instead of independently combining contexts,
 * membership aliases, and localStorage values.
 */

import { useMemo } from "react";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useActiveMembership } from "../context/active-membership-context";

import type { UserMembership } from "../lib/auth/roleRedirect";

export type BranchWorkspaceScope = {
  accountId: string | null;
  schoolId: number | null;
  branchId: number | null;
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

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = positiveNumber(value);
    if (parsed) return parsed;
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
    const role = normalizeRole(
      activeRole || membership?.role,
    );

    const membershipAccountId = cleanString(
      membership?.accountId,
    );

    const accountId =
      cleanString(accountContextId) ||
      membershipAccountId;

    const schoolId = firstNumber(
      membership?.schoolId,
      (membership as any)?.school?.id,
      (membership as any)?.activeSchoolId,
      activeSchoolId,
      activeSchool?.id,
    );

    const branchId = firstNumber(
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
      accountContextId !== membershipAccountId
    ) {
      error =
        "The active membership belongs to a different account.";
    } else if (
      role &&
      BRANCH_ROLES.has(role) &&
      !branchId
    ) {
      error =
        "The selected role requires an active branch.";
    } else if (
      role &&
      !["developer", "platform_team"].includes(role) &&
      !schoolId
    ) {
      error =
        "The selected role requires an active school.";
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
