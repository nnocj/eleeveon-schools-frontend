"use client";

/**
 * app/context/active-membership-context.tsx
 * --------------------------------------------------------------------------
 * Permanent-identity membership state. All profile, school, and branch IDs
 * are canonical strings shared by Dexie, sync, and the backend.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useActiveBranch } from "./active-branch-context";
import { useAccount } from "./account-context";
import { collectUserMemberships } from "../lib/auth/roleRedirect";
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

/** Only a membership supplied by the authenticated account may become active. */
function membershipPermitted(requested: UserMembership | null, allowed: UserMembership[], accountId: string | null): UserMembership | null {
  if (!requested?.id || !accountId) return null;
  const matched = allowed.find(candidate => candidate.id === requested.id &&
    candidate.active !== false && candidate.isActive !== false && candidate.disabled !== true &&
    candidate.isDeleted !== true && (!candidate.accountId || candidate.accountId === accountId));
  if (!matched || (requested.accountId && requested.accountId !== accountId)) return null;
  // Never copy role, school or branch from untrusted stored selection.
  return normalizeActiveMembership({ ...matched, accountId });
}

export function ActiveMembershipProvider({ children }: { children: React.ReactNode }) {
  const { user, accountId, authenticated, loading } = useAccount();
  const allowedMemberships = React.useMemo(() => user ? collectUserMemberships(user) : [], [user]);
  const { setActiveSchoolId, setActiveBranchId } = useActiveBranch();
  const [activeMembership, setActiveMembershipState] = useState<UserMembership | null>(null);
  const [restored, setRestored] = useState(false);
  const [transition, setTransition] = useState<MembershipTransitionState>({ switching: false, target: null });

  useEffect(() => {
    if (loading) return;
    if (!authenticated || !accountId) {
      setActiveMembershipState(null);
      setRestored(true);
      return;
    }
    const stored = getStoredActiveMembership();
    const verified = membershipPermitted(stored, allowedMemberships, accountId);
    if (!verified && stored) clearStoredActiveMembership();
    if (verified) setStoredActiveMembership(verified);
    setActiveMembershipState(verified);
    setRestored(true);
  }, [loading, authenticated, accountId, allowedMemberships]);

  const beginMembershipTransition = useCallback((membership: UserMembership) => {
    const normalized = normalizeActiveMembership(membership);
    clearScopedAppearance();
    setTransition({ switching: true, target: normalized, startedAt: Date.now() });
  }, []);
  const completeMembershipTransition = useCallback(() => setTransition({ switching: false, target: null }), []);
  const failMembershipTransition = useCallback((error?: string) => setTransition((current) => ({ ...current, switching: false, error })), []);

  const setActiveMembership = useCallback(async (membership: UserMembership | null) => {
    if (membership && (!authenticated || !accountId)) throw new Error("Sign in before selecting a membership.");
    const normalized = membership ? membershipPermitted(membership, allowedMemberships, accountId) : null;
    if (membership && !normalized) throw new Error("The selected membership is not authorized for this account.");
    setStoredActiveMembership(normalized);
    setActiveMembershipState(normalized);
    setTransition({ switching: false, target: null });
    await setActiveSchoolId(cleanId(normalized?.schoolId));
    await setActiveBranchId(cleanId(normalized?.branchId));
    window.dispatchEvent(new CustomEvent("active-membership-changed", { detail: { membership: normalized } }));
  }, [setActiveSchoolId, setActiveBranchId, authenticated, accountId, allowedMemberships]);

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
    activeMembership: authenticated && !loading ? activeMembership : null,
    activeRole: authenticated && !loading ? activeMembership?.role || null : null,
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
export function IndependentActiveMembershipProvider({ children, session, selectedMembership }: {
  children: React.ReactNode;
  session: IndependentMembershipSession;
  selectedMembership?: UserMembership;
}) {
  const { setActiveSchoolId, setActiveBranchId } = useActiveBranch();
  const local = session as IndependentMembershipSession & {schoolId?:string;branchId?:string};
  const membership = React.useMemo<UserMembership>(() => ({
    id: `independent:${session.id}`,
    accountId: session.accountId,
    role: session.role === 'owner' ? 'super_admin' : session.role,
    schoolId: local.schoolId || null,
    branchId: local.branchId || null,
    teacherId: session.role === 'teacher' ? (selectedMembership?.teacherId || session.teacherId || null) : null,
    active: true,
  }), [session, selectedMembership]);
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

/** Independent grant binds one membership. Switching requires a separately verified grant. */
export function VerifiedIndependentMembershipProvider({children,membership}:{children:React.ReactNode;membership:UserMembership}) {
  const {setActiveSchoolId,setActiveBranchId}=useActiveBranch();
  React.useEffect(()=>{
    clearStoredActiveMembership();
    void setActiveSchoolId(membership.schoolId||null);
    void setActiveBranchId(membership.branchId||null);
  },[membership.id,membership.schoolId,membership.branchId,setActiveSchoolId,setActiveBranchId]);
  const value:ActiveMembershipContextType={
    activeMembership:membership,activeRole:membership.role,activeTeacherId:membership.teacherId||null,
    activeStudentId:null,activeParentId:null,restored:true,transition:{switching:false,target:null},
    beginMembershipTransition:()=>{throw new Error('A new verified grant is required to switch membership');},
    completeMembershipTransition:()=>{},failMembershipTransition:()=>{},
    setActiveMembership:async requested=>{if(!requested||requested.id!==membership.id||requested.accountId!==membership.accountId||requested.role!==membership.role||requested.schoolId!==membership.schoolId||requested.branchId!==membership.branchId||requested.teacherId!==membership.teacherId)throw new Error('Independent membership is bound to signed authorization');},
    clearActiveMembership:()=>{throw new Error('Use logout to leave the Independent workspace');},
  };
  return <ActiveMembershipContext.Provider value={value}>{children}</ActiveMembershipContext.Provider>;
}
