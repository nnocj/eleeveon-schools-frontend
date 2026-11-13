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


/** Independent membership cannot be upgraded by editing localStorage.
 * Native APIs still need to check the actual local staff identity for every
 * protected operation; a React provider is not a security boundary.
 */
import type { LocalSession as IndependentMembershipSession } from "../lib/independent/localStaffAuth";
export function IndependentActiveMembershipProvider({ children, session }: {
  children: React.ReactNode;
  session: IndependentMembershipSession;
}) {
  const { setActiveSchoolId, setActiveBranchId } = useActiveBranch();
  const local = session as IndependentMembershipSession & {schoolId?:string;branchId?:string};
  const membership = React.useMemo<UserMembership>(() => ({
    id: `independent:${session.id}`,
    accountId: session.accountId,
    role: session.role === 'owner' ? 'super_admin' : session.role,
    schoolId: local.schoolId || null,
    branchId: local.branchId || null,
    teacherId: session.role === 'teacher' ? session.id : null,
    active: true,
  }), [session]);
  const [selected, setSelected] = React.useState<UserMembership>(membership);
  React.useEffect(() => { setSelected(membership); }, [membership]);
  const setScoped = React.useCallback(async (requested: UserMembership | null) => {
    if (!requested) throw new Error('Independent membership cannot be cleared while signed in');
    if (requested.accountId !== session.accountId || requested.role !== membership.role) {
      throw new Error('Independent role and account cannot be changed by portal navigation');
    }
    if (session.role !== 'owner' && (requested.branchId !== local.branchId || requested.schoolId !== local.schoolId)) {
      throw new Error('This staff member is restricted to the assigned branch');
    }
    const permitted: UserMembership = {...membership,
      schoolId: session.role === 'owner' ? requested.schoolId || null : local.schoolId || null,
      branchId: session.role === 'owner' ? requested.branchId || null : local.branchId || null,
    };
    setSelected(permitted);
    await setActiveSchoolId(permitted.schoolId || null);
    await setActiveBranchId(permitted.branchId || null);
  }, [membership, session, setActiveSchoolId, setActiveBranchId]);
  React.useEffect(() => {
    // Clear any Cloud workspace selection on mounting a locally authenticated runtime.
    clearStoredActiveMembership();
    if (local.schoolId) void setActiveSchoolId(local.schoolId);
    if (local.branchId) void setActiveBranchId(local.branchId);
  }, [session.id, local.schoolId, local.branchId, setActiveSchoolId, setActiveBranchId]);
  const value: ActiveMembershipContextType = {
    activeMembership: selected,
    activeRole: selected.role,
    activeTeacherId: selected.teacherId || null,
    activeStudentId: null, activeParentId: null,
    restored: true,
    transition: { switching: false, target: null },
    beginMembershipTransition: () => { throw new Error('Independent role switching requires local reauthentication'); },
    completeMembershipTransition: () => {},
    failMembershipTransition: () => {},
    setActiveMembership: setScoped,
    clearActiveMembership: () => { throw new Error('Lock the Independent installation to change staff'); },
  };
  return <ActiveMembershipContext.Provider value={value}>{children}</ActiveMembershipContext.Provider>;
}
