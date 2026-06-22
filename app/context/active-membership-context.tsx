"use client";

/**
 * app/context/active-membership-context.tsx
 * ---------------------------------------------------------
 * ACTIVE MEMBERSHIP CONTEXT
 * ---------------------------------------------------------
 *
 * Drop-in replacement.
 *
 * Why this version exists:
 * - Student/teacher/parent portals depend on an exact active membership.
 * - Some backend/login payloads use aliases such as studentId, teacherId,
 *   parentId, schoolBranchId, branch.id, school.id, etc.
 * - This provider now normalizes those aliases before saving to localStorage,
 *   so RolePortalShell and student/teacher/parent dashboards always receive:
 *
 *   role
 *   schoolId
 *   branchId
 *   teacherLocalId
 *   studentLocalId
 *   parentLocalId
 *
 * Important behavior:
 * - Keeps the previous API unchanged.
 * - Persists the active membership using app/lib/auth/activeMembership.ts.
 * - Updates ActiveBranchContext after selecting a membership.
 * - Clears both stored membership and in-memory membership on logout/reset.
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

type ActiveMembershipContextType = {
  activeMembership: UserMembership | null;
  activeRole: string | null;
  activeTeacherId: number | null;
  activeStudentId: number | null;
  activeParentId: number | null;
  setActiveMembership: (membership: UserMembership | null) => Promise<void>;
  clearActiveMembership: () => void;
};

const ActiveMembershipContext =
  createContext<ActiveMembershipContextType | undefined>(undefined);

function toLocalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

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
  membership: UserMembership | null
): UserMembership | null {
  if (!membership) return null;

  const schoolId = firstLocalNumber(
    membership.schoolId,
    membership.school?.id,
    membership.activeSchoolId,
    membership.contextSchoolId
  );

  const branchId = firstLocalNumber(
    membership.branchId,
    membership.schoolBranchId,
    membership.branch?.id,
    membership.activeBranchId,
    membership.contextBranchId
  );

  const teacherLocalId = firstLocalNumber(
    membership.teacherLocalId,
    membership.localTeacherId,
    membership.teacherId,
    membership.teacher?.id,
    membership.staffLocalId
  );

  const studentLocalId = firstLocalNumber(
    membership.studentLocalId,
    membership.localStudentId,
    membership.studentId,
    membership.student?.id,
    membership.learnerLocalId,
    membership.pupilLocalId
  );

  const parentLocalId = firstLocalNumber(
    membership.parentLocalId,
    membership.localParentId,
    membership.parentId,
    membership.parent?.id,
    membership.guardianLocalId
  );

  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId: branchId,
    teacherLocalId,
    studentLocalId,
    parentLocalId,
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
    useState<UserMembership | null>(null);

  useEffect(() => {
    const stored = normalizeActiveMembership(getStoredActiveMembership());

    if (stored) {
      setStoredActiveMembership(stored);
    }

    setActiveMembershipState(stored);
  }, []);

  const setActiveMembership = useCallback(
    async (membership: UserMembership | null) => {
      const normalized = normalizeActiveMembership(membership);

      setStoredActiveMembership(normalized);
      setActiveMembershipState(normalized);

      const schoolId = toLocalNumber(normalized?.schoolId);
      const branchId = toLocalNumber(normalized?.branchId);

      if (schoolId) {
        await setActiveSchoolId(schoolId);
      }

      if (branchId) {
        await setActiveBranchId(branchId);
      }
    },
    [setActiveSchoolId, setActiveBranchId]
  );

  const clearActiveMembership = useCallback(() => {
    clearStoredActiveMembership();
    setActiveMembershipState(null);
  }, []);

  const value = useMemo<ActiveMembershipContextType>(
    () => ({
      activeMembership,
      activeRole: activeMembership?.role || null,
      activeTeacherId: toLocalNumber(activeMembership?.teacherLocalId),
      activeStudentId: toLocalNumber(activeMembership?.studentLocalId),
      activeParentId: toLocalNumber(activeMembership?.parentLocalId),
      setActiveMembership,
      clearActiveMembership,
    }),
    [activeMembership, setActiveMembership, clearActiveMembership]
  );

  return (
    <ActiveMembershipContext.Provider value={value}>
      {children}
    </ActiveMembershipContext.Provider>
  );
}

export function useActiveMembership() {
  const context = useContext(ActiveMembershipContext);

  if (!context) {
    throw new Error(
      "useActiveMembership must be used inside ActiveMembershipProvider"
    );
  }

  return context;
}
