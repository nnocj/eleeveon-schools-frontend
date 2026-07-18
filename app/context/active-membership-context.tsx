"use client";

/**
 * app/context/active-membership-context.tsx
 * --------------------------------------------------------------------------
 * Atomic role-transition membership state.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useActiveBranch } from "./active-branch-context";
import type { UserMembership } from "../lib/auth/roleRedirect";
import {
  clearStoredActiveMembership,
  getStoredActiveMembership,
  setStoredActiveMembership,
} from "../lib/auth/activeMembership";
import { subscribeToAtomicLogout } from "../lib/auth/logout";
import { clearScopedAppearance } from "../lib/theme/applyScopedAppearance";

export type MembershipTransitionState = {
  switching: boolean;
  target: UserMembership | null;
  startedAt?: number;
  error?: string;
};

type ActiveMembershipContextType = {
  activeMembership: UserMembership | null;
  activeRole: string | null;
  activeTeacherId: number | null;
  activeStudentId: number | null;
  activeParentId: number | null;
  restored: boolean;
  transition: MembershipTransitionState;
  beginMembershipTransition: (membership: UserMembership) => void;
  completeMembershipTransition: () => void;
  failMembershipTransition: (error?: string) => void;
  setActiveMembership: (membership: UserMembership | null) => Promise<void>;
  clearActiveMembership: () => void;
};

const ActiveMembershipContext = createContext<
  ActiveMembershipContextType | undefined
>(undefined);

function toLocalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstLocalNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toLocalNumber(value);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeActiveMembership(
  membership: UserMembership | null,
): UserMembership | null {
  if (!membership) return null;
  const schoolId = firstLocalNumber(
    membership.schoolId,
    membership.school?.id,
    membership.activeSchoolId,
    membership.contextSchoolId,
  );
  const branchId = firstLocalNumber(
    membership.branchId,
    membership.schoolBranchId,
    membership.branch?.id,
    membership.activeBranchId,
    membership.contextBranchId,
  );
  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherLocalId: firstLocalNumber(
      membership.teacherLocalId,
      membership.localTeacherId,
      membership.teacherId,
      membership.teacher?.id,
      membership.staffLocalId,
    ),
    studentLocalId: firstLocalNumber(
      membership.studentLocalId,
      membership.localStudentId,
      membership.studentId,
      membership.student?.id,
      membership.learnerLocalId,
      membership.pupilLocalId,
    ),
    parentLocalId: firstLocalNumber(
      membership.parentLocalId,
      membership.localParentId,
      membership.parentId,
      membership.parent?.id,
      membership.guardianLocalId,
    ),
    active: membership.active !== false,
  };
}

export function ActiveMembershipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setActiveSchoolId, setActiveBranchId } = useActiveBranch();
  const [activeMembership, setActiveMembershipState] =
    useState<UserMembership | null>(() =>
      normalizeActiveMembership(getStoredActiveMembership()),
    );
  const [restored, setRestored] = useState(true);
  const [transition, setTransition] = useState<MembershipTransitionState>({
    switching: false,
    target: null,
  });

  useEffect(() => {
    const restore = () => {
      const stored = normalizeActiveMembership(getStoredActiveMembership());
      if (stored) setStoredActiveMembership(stored);
      setActiveMembershipState((current) => current || stored);
      setRestored(true);
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);

  const beginMembershipTransition = useCallback(
    (membership: UserMembership) => {
      const normalized = normalizeActiveMembership(membership);
      clearScopedAppearance();
      setTransition({
        switching: true,
        target: normalized,
        startedAt: Date.now(),
      });
    },
    [],
  );

  const completeMembershipTransition = useCallback(() => {
    setTransition({ switching: false, target: null });
  }, []);

  const failMembershipTransition = useCallback((error?: string) => {
    setTransition((current) => ({ ...current, switching: false, error }));
  }, []);

  const setActiveMembership = useCallback(
    async (membership: UserMembership | null) => {
      const normalized = normalizeActiveMembership(membership);
      setStoredActiveMembership(normalized);
      setActiveMembershipState(normalized);

      // The selected membership is now active, so the role transition must no
      // longer block PortalAppearanceRuntime. Previously this flag remained true
      // indefinitely and kept the portal on “Preparing your workspace”.
      setTransition({ switching: false, target: null });

      const schoolId = toLocalNumber(normalized?.schoolId);
      const branchId = toLocalNumber(normalized?.branchId);
      await setActiveSchoolId(schoolId);
      await setActiveBranchId(branchId);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("active-membership-changed", {
            detail: { membership: normalized },
          }),
        );
      }
    },
    [setActiveSchoolId, setActiveBranchId],
  );

  const clearActiveMembership = useCallback(() => {
    clearScopedAppearance();
    clearStoredActiveMembership();
    setActiveMembershipState(null);
    setTransition({ switching: false, target: null });
  }, []);

  useEffect(
    () =>
      subscribeToAtomicLogout(() => {
        clearScopedAppearance();
        clearStoredActiveMembership();
        setActiveMembershipState(null);
        setTransition({ switching: false, target: null });
        setRestored(true);
      }),
    [],
  );

  const value = useMemo<ActiveMembershipContextType>(
    () => ({
      activeMembership,
      activeRole: activeMembership?.role || null,
      activeTeacherId: toLocalNumber(activeMembership?.teacherLocalId),
      activeStudentId: toLocalNumber(activeMembership?.studentLocalId),
      activeParentId: toLocalNumber(activeMembership?.parentLocalId),
      restored,
      transition,
      beginMembershipTransition,
      completeMembershipTransition,
      failMembershipTransition,
      setActiveMembership,
      clearActiveMembership,
    }),
    [
      activeMembership,
      restored,
      transition,
      beginMembershipTransition,
      completeMembershipTransition,
      failMembershipTransition,
      setActiveMembership,
      clearActiveMembership,
    ],
  );

  return (
    <ActiveMembershipContext.Provider value={value}>
      {children}
    </ActiveMembershipContext.Provider>
  );
}

export function useActiveMembership() {
  const context = useContext(ActiveMembershipContext);
  if (!context)
    throw new Error(
      "useActiveMembership must be used inside ActiveMembershipProvider",
    );
  return context;
}