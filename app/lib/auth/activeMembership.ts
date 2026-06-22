// ======================================================
// FILE: app/lib/auth/activeMembership.ts
// ======================================================

"use client";

import { UserMembership } from "./roleRedirect";

const ACTIVE_MEMBERSHIP_KEY = "activeMembership";

const ACTIVE_ROLE_KEY = "activeRole";

const ACTIVE_TEACHER_ID_KEY = "activeTeacherId";
const ACTIVE_STUDENT_ID_KEY = "activeStudentId";
const ACTIVE_PARENT_ID_KEY = "activeParentId";

const ACTIVE_SCHOOL_ID_KEY = "activeSchoolId";
const ACTIVE_BRANCH_ID_KEY = "activeBranchId";

const ACTIVE_MEMBERSHIP_ID_KEY = "activeMembershipId";

export function getStoredActiveMembership(): UserMembership | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(ACTIVE_MEMBERSHIP_KEY);

    if (!raw) return null;

    return JSON.parse(raw) as UserMembership;
  } catch {
    return null;
  }
}

export function setStoredActiveMembership(
  membership: UserMembership | null
) {
  if (typeof window === "undefined") return;

  // ======================================================
  // CLEAR
  // ======================================================

  if (!membership) {
    localStorage.removeItem(ACTIVE_MEMBERSHIP_KEY);

    localStorage.removeItem(ACTIVE_ROLE_KEY);

    localStorage.removeItem(ACTIVE_TEACHER_ID_KEY);
    localStorage.removeItem(ACTIVE_STUDENT_ID_KEY);
    localStorage.removeItem(ACTIVE_PARENT_ID_KEY);

    localStorage.removeItem(ACTIVE_SCHOOL_ID_KEY);
    localStorage.removeItem(ACTIVE_BRANCH_ID_KEY);

    localStorage.removeItem(ACTIVE_MEMBERSHIP_ID_KEY);

    return;
  }

  // ======================================================
  // STORE MEMBERSHIP OBJECT
  // ======================================================

  localStorage.setItem(
    ACTIVE_MEMBERSHIP_KEY,
    JSON.stringify(membership)
  );

  // ======================================================
  // STORE ROLE
  // ======================================================

  localStorage.setItem(
    ACTIVE_ROLE_KEY,
    membership.role || ""
  );

  // ======================================================
  // STORE MEMBERSHIP ID
  // ======================================================

  if (membership.id) {
    localStorage.setItem(
      ACTIVE_MEMBERSHIP_ID_KEY,
      String(membership.id)
    );
  } else {
    localStorage.removeItem(ACTIVE_MEMBERSHIP_ID_KEY);
  }

  // ======================================================
  // STORE SCHOOL ID
  // ======================================================

  if (
    membership.schoolId !== undefined &&
    membership.schoolId !== null
  ) {
    localStorage.setItem(
      ACTIVE_SCHOOL_ID_KEY,
      String(membership.schoolId)
    );
  } else {
    localStorage.removeItem(ACTIVE_SCHOOL_ID_KEY);
  }

  // ======================================================
  // STORE BRANCH ID
  // ======================================================

  if (
    membership.branchId !== undefined &&
    membership.branchId !== null
  ) {
    localStorage.setItem(
      ACTIVE_BRANCH_ID_KEY,
      String(membership.branchId)
    );
  } else {
    localStorage.removeItem(ACTIVE_BRANCH_ID_KEY);
  }

  // ======================================================
  // STORE TEACHER ID
  // ======================================================

  if (
    membership.teacherLocalId !== undefined &&
    membership.teacherLocalId !== null
  ) {
    localStorage.setItem(
      ACTIVE_TEACHER_ID_KEY,
      String(membership.teacherLocalId)
    );
  } else {
    localStorage.removeItem(ACTIVE_TEACHER_ID_KEY);
  }

  // ======================================================
  // STORE STUDENT ID
  // ======================================================

  if (
    membership.studentLocalId !== undefined &&
    membership.studentLocalId !== null
  ) {
    localStorage.setItem(
      ACTIVE_STUDENT_ID_KEY,
      String(membership.studentLocalId)
    );
  } else {
    localStorage.removeItem(ACTIVE_STUDENT_ID_KEY);
  }

  // ======================================================
  // STORE PARENT ID
  // ======================================================

  if (
    membership.parentLocalId !== undefined &&
    membership.parentLocalId !== null
  ) {
    localStorage.setItem(
      ACTIVE_PARENT_ID_KEY,
      String(membership.parentLocalId)
    );
  } else {
    localStorage.removeItem(ACTIVE_PARENT_ID_KEY);
  }
}

export function clearStoredActiveMembership() {
  setStoredActiveMembership(null);
}

// ======================================================
// HELPERS
// ======================================================

export function getStoredActiveRole() {
  if (typeof window === "undefined") return null;

  return localStorage.getItem(ACTIVE_ROLE_KEY);
}

export function getStoredSchoolId(): number | null {
  if (typeof window === "undefined") return null;

  const value = localStorage.getItem(ACTIVE_SCHOOL_ID_KEY);

  return value ? Number(value) : null;
}

export function getStoredBranchId(): number | null {
  if (typeof window === "undefined") return null;

  const value = localStorage.getItem(ACTIVE_BRANCH_ID_KEY);

  return value ? Number(value) : null;
}

export function getStoredTeacherId(): number | null {
  if (typeof window === "undefined") return null;

  const value = localStorage.getItem(ACTIVE_TEACHER_ID_KEY);

  return value ? Number(value) : null;
}

export function getStoredStudentId(): number | null {
  if (typeof window === "undefined") return null;

  const value = localStorage.getItem(ACTIVE_STUDENT_ID_KEY);

  return value ? Number(value) : null;
}

export function getStoredParentId(): number | null {
  if (typeof window === "undefined") return null;

  const value = localStorage.getItem(ACTIVE_PARENT_ID_KEY);

  return value ? Number(value) : null;
}

export function getStoredMembershipId(): string | null {
  if (typeof window === "undefined") return null;

  return localStorage.getItem(ACTIVE_MEMBERSHIP_ID_KEY);
}