// ======================================================
// FILE 7: app/hooks/useRoleGuard.ts
// ======================================================

"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useActiveMembership } from "../context/active-membership-context";
import { AppRole, getPortalPathForUser, membershipCanAccess } from "../lib/auth/roleRedirect";

export function useRoleGuard(allowedRoles: AppRole[]) {
  const router = useRouter();
  const { user, authenticated, accountId, loading } = useAccount();
  const { activeSchoolId, activeBranchId } = useActiveBranch();
  const { activeMembership } = useActiveMembership();

  const allowed = useMemo(() => {
    if (loading) return false;
    if (!authenticated || !accountId) return false;
    return membershipCanAccess({ role: user?.role, memberships: user?.memberships, selectedMembership: activeMembership, allowedRoles, schoolId: activeSchoolId, branchId: activeBranchId });
  }, [loading, authenticated, accountId, user?.role, user?.memberships, activeMembership, allowedRoles, activeSchoolId, activeBranchId]);

  useEffect(() => {
    if (loading) return;
    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    const canAccess = membershipCanAccess({ role: user?.role, memberships: user?.memberships, selectedMembership: activeMembership, allowedRoles, schoolId: activeSchoolId, branchId: activeBranchId });

    if (!canAccess) {
      router.replace(getPortalPathForUser({ role: user?.role, memberships: user?.memberships }));
    }
  }, [loading, authenticated, accountId, user?.role, user?.memberships, activeMembership, allowedRoles, activeSchoolId, activeBranchId, router]);

  return allowed;
}


