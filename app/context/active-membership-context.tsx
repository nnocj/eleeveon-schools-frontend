"use client";

/**
 * app/context/active-membership-context.tsx
 * --------------------------------------------------------------------------
 * Permanent-identity membership state. All profile, school, and branch IDs
 * are canonical strings shared by Dexie, sync, and the backend.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useActiveBranch } from "./active-branch-context";
import type { UserMembership } from "../lib/auth/roleRedirect";
import { clearStoredActiveMembership, getStoredActiveMembership, setStoredActiveMembership } from "../lib/auth/activeMembership";
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
  activeTeacherId: string | null;
  activeStudentId: string | null;
  activeParentId: string | null;
  restored: boolean;
  transition: MembershipTransitionState;
  beginMembershipTransition: (membership: UserMembership) => void;
  completeMembershipTransition: () => void;
  failMembershipTransition: (error?: string) => void;
  setActiveMembership: (membership: UserMembership | null) => Promise<void>;
  clearActiveMembership: () => void;
};

const ActiveMembershipContext = createContext<ActiveMembershipContextType | undefined>(undefined);

function cleanId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function firstId(...values: unknown[]): string | null {
  for (const value of values) {
    const id = cleanId(value);
    if (id) return id;
  }
  return null;
}

function normalizeActiveMembership(membership: UserMembership | null): UserMembership | null {
  if (!membership) return null;
  const schoolId = firstId(membership.schoolId, membership.school?.id, membership.activeSchoolId, membership.contextSchoolId);
  const branchId = firstId(membership.branchId, membership.schoolBranchId, membership.branch?.id, membership.activeBranchId, membership.contextBranchId);
  return {
    ...membership,
    id: cleanId(membership.id) || undefined,
    accountId: cleanId(membership.accountId) || undefined,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherId: firstId(membership.teacherId, membership.teacher?.id, membership.staffId),
    studentId: firstId(membership.studentId, membership.student?.id, membership.learnerId, membership.pupilId),
    parentId: firstId(membership.parentId, membership.parent?.id, membership.guardianId),
    active: membership.active !== false,
  };
}

export function ActiveMembershipProvider({ children }: { children: React.ReactNode }) {
  const { setActiveSchoolId, setActiveBranchId } = useActiveBranch();
  const [activeMembership, setActiveMembershipState] = useState<UserMembership | null>(() => normalizeActiveMembership(getStoredActiveMembership()));
  const [restored, setRestored] = useState(true);
  const [transition, setTransition] = useState<MembershipTransitionState>({ switching: false, target: null });

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

  const beginMembershipTransition = useCallback((membership: UserMembership) => {
    const normalized = normalizeActiveMembership(membership);
    clearScopedAppearance();
    setTransition({ switching: true, target: normalized, startedAt: Date.now() });
  }, []);
  const completeMembershipTransition = useCallback(() => setTransition({ switching: false, target: null }), []);
  const failMembershipTransition = useCallback((error?: string) => setTransition((current) => ({ ...current, switching: false, error })), []);

  const setActiveMembership = useCallback(async (membership: UserMembership | null) => {
    const normalized = normalizeActiveMembership(membership);
    setStoredActiveMembership(normalized);
    setActiveMembershipState(normalized);
    setTransition({ switching: false, target: null });
    await setActiveSchoolId(cleanId(normalized?.schoolId));
    await setActiveBranchId(cleanId(normalized?.branchId));
    window.dispatchEvent(new CustomEvent("active-membership-changed", { detail: { membership: normalized } }));
  }, [setActiveSchoolId, setActiveBranchId]);

  const clearActiveMembership = useCallback(() => {
    clearScopedAppearance();
    clearStoredActiveMembership();
    setActiveMembershipState(null);
    setTransition({ switching: false, target: null });
  }, []);

  useEffect(() => subscribeToAtomicLogout(() => {
    clearScopedAppearance();
    clearStoredActiveMembership();
    setActiveMembershipState(null);
    setTransition({ switching: false, target: null });
    setRestored(true);
  }), []);

  const value = useMemo<ActiveMembershipContextType>(() => ({
    activeMembership,
    activeRole: activeMembership?.role || null,
    activeTeacherId: cleanId(activeMembership?.teacherId),
    activeStudentId: cleanId(activeMembership?.studentId),
    activeParentId: cleanId(activeMembership?.parentId),
    restored,
    transition,
    beginMembershipTransition,
    completeMembershipTransition,
    failMembershipTransition,
    setActiveMembership,
    clearActiveMembership,
  }), [activeMembership, restored, transition, beginMembershipTransition, completeMembershipTransition, failMembershipTransition, setActiveMembership, clearActiveMembership]);

  return <ActiveMembershipContext.Provider value={value}>{children}</ActiveMembershipContext.Provider>;
}

export function useActiveMembership() {
  const context = useContext(ActiveMembershipContext);
  if (!context) throw new Error("useActiveMembership must be used inside ActiveMembershipProvider");
  return context;
}
