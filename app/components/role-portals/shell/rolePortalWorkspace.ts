/**
 * app/components/role-portals/shell/rolePortalWorkspace.ts
 * --------------------------------------------------------------------------
 * ROLE PORTAL WORKSPACE / MEMBERSHIP HELPERS
 * --------------------------------------------------------------------------
 *
 * Faithfully extracted from RolePortalShell.tsx.
 *
 * This module owns:
 * - safe local/session storage access;
 * - selected workspace session persistence;
 * - membership normalization and identity keys;
 * - membership usability/access helper rules;
 * - school/branch/profile ID resolution.
 *
 * PHASE 1 ONLY:
 * No navigation/history behavior is added here.
 */

import type {
  AppRole,
  UserMembership,
} from "../../../lib/auth/roleRedirect";

export const MEMBERSHIP_BACKUP_KEY =
  "eleeveon_user_memberships";

export const ELEEVEON_CENTER_KEY =
  "__eleeveon_center__";

export const OPEN_WORKSPACE_KEY =
  "eleeveon_open_workspace";

export type OpenWorkspaceSession = {
  membership?: UserMembership | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  openedAt?: number;
};

export function safeRead(
  key: string,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return (
      window.localStorage.getItem(
        key,
      ) ||
      window.sessionStorage.getItem(
        key,
      )
    );
  } catch {
    return null;
  }
}

export function safeJson<T>(
  key: string,
): T | null {
  const raw =
    safeRead(
      key,
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(
      raw,
    ) as T;
  } catch {
    return null;
  }
}

export function safeSet(
  key: string,
  value: string,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      value,
    );
  } catch {}

  try {
    window.sessionStorage.setItem(
      key,
      value,
    );
  } catch {}
}

export function safeRemove(
  key: string,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem(
      key,
    );
  } catch {}

  try {
    window.sessionStorage.removeItem(
      key,
    );
  } catch {}
}

export function toPermanentId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed =
    String(
      value,
    ).trim();

  return parsed || null;
}

export function firstPermanentId(
  ...values: unknown[]
) {
  for (
    const value of values
  ) {
    const parsed =
      toPermanentId(
        value,
      );

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function normalizeMembership(
  membership?:
    UserMembership |
    null,
): UserMembership | null {
  if (!membership) {
    return null;
  }

  const schoolId =
    firstPermanentId(
      membership.schoolId,
      membership.school?.id,
      membership.activeSchoolId,
      membership.contextSchoolId,
    );

  const branchId =
    firstPermanentId(
      membership.branchId,
      membership.schoolBranchId,
      membership.branch?.id,
      membership.activeBranchId,
      membership.contextBranchId,
    );

  const teacherId =
    firstPermanentId(
      membership.teacherId,
      membership.teacher?.id,
    );

  const studentId =
    firstPermanentId(
      membership.studentId,
      membership.student?.id,
    );

  const parentId =
    firstPermanentId(
      membership.parentId,
      membership.parent?.id,
    );

  return {
    ...membership,
    schoolId,
    branchId,
    schoolBranchId:
      branchId,
    teacherId,
    studentId,
    parentId,
    active:
      membership.active !==
      false,
  };
}

export function membershipKey(
  membership?:
    UserMembership |
    null,
  fallback =
    "membership",
) {
  if (!membership) {
    return fallback;
  }

  return String(
    membership.id ??
      `${membership.role}-${membership.schoolId ?? "account"}-${membership.branchId ?? "root"}-${
        membership.teacherId ??
        membership.studentId ??
        membership.parentId ??
        "portal"
      }`,
  );
}

export function sameMembership(
  a?:
    UserMembership |
    null,
  b?:
    UserMembership |
    null,
) {
  if (
    !a ||
    !b
  ) {
    return false;
  }

  return (
    membershipKey(
      a,
    ) ===
    membershipKey(
      b,
    )
  );
}

export function membershipIsUsable(
  membership?:
    UserMembership |
    null,
) {
  if (!membership) {
    return false;
  }

  if (
    membership.active ===
    false
  ) {
    return false;
  }

  if (
    membership.isActive ===
    false
  ) {
    return false;
  }

  if (
    membership.disabled ===
    true
  ) {
    return false;
  }

  if (
    membership.isDeleted ===
    true
  ) {
    return false;
  }

  const status =
    String(
      membership.status ||
      "",
    )
      .trim()
      .toLowerCase();

  return ![
    "inactive",
    "disabled",
    "deleted",
    "blocked",
    "suspended",
  ].includes(
    status,
  );
}

export function profileRoleHasPermanentId(
  membership?:
    UserMembership |
    null,
) {
  const normalized =
    normalizeMembership(
      membership,
    );

  if (!normalized) {
    return false;
  }

  if (
    normalized.role ===
    "student"
  ) {
    return Boolean(
      normalized.studentId,
    );
  }

  if (
    normalized.role ===
    "teacher"
  ) {
    return Boolean(
      normalized.teacherId,
    );
  }

  if (
    normalized.role ===
    "parent"
  ) {
    return Boolean(
      normalized.parentId,
    );
  }

  return true;
}

export function portalRequiresProfileMembership(
  allowedRoles:
    AppRole[],
) {
  return allowedRoles.some(
    (
      role,
    ) =>
      [
        "student",
        "teacher",
        "parent",
      ].includes(
        String(
          role,
        ),
      ),
  );
}

export function roleAllowed(
  role:
    string |
    null |
    undefined,
  allowedRoles:
    AppRole[],
) {
  if (!role) {
    return false;
  }

  return allowedRoles
    .map(
      String,
    )
    .includes(
      String(
        role,
      ),
    );
}

export function readStoredMemberships() {
  const stored =
    safeJson<
      UserMembership[]
    >(
      MEMBERSHIP_BACKUP_KEY,
    );

  return Array.isArray(
    stored,
  )
    ? stored
        .map(
          normalizeMembership,
        )
        .filter(
          Boolean,
        ) as UserMembership[]
    : [];
}

export function readOpenWorkspaceSession():
  OpenWorkspaceSession |
  null {
  return safeJson<
    OpenWorkspaceSession
  >(
    OPEN_WORKSPACE_KEY,
  );
}

export function readStoredActiveMembership() {
  return normalizeMembership(
    safeJson<
      UserMembership
    >(
      "activeMembership",
    ),
  );
}

export function writeWorkspaceSession(
  membership:
    UserMembership,
) {
  const normalized =
    normalizeMembership(
      membership,
    );

  if (!normalized) {
    return null;
  }

  const id =
    membershipKey(
      normalized,
    );

  safeSet(
    "activeMembership",
    JSON.stringify(
      normalized,
    ),
  );

  safeSet(
    "activeMembershipId",
    id,
  );

  safeSet(
    "activeRole",
    normalized.role ||
      "",
  );

  const schoolId =
    toPermanentId(
      normalized.schoolId,
    );

  const branchId =
    toPermanentId(
      normalized.branchId,
    );

  const teacherId =
    toPermanentId(
      normalized.teacherId,
    );

  const studentId =
    toPermanentId(
      normalized.studentId,
    );

  const parentId =
    toPermanentId(
      normalized.parentId,
    );

  if (schoolId) {
    safeSet(
      "activeSchoolId",
      String(
        schoolId,
      ),
    );
  } else {
    safeRemove(
      "activeSchoolId",
    );
  }

  if (branchId) {
    safeSet(
      "activeBranchId",
      String(
        branchId,
      ),
    );
  } else {
    safeRemove(
      "activeBranchId",
    );
  }

  if (teacherId) {
    safeSet(
      "activeTeacherId",
      String(
        teacherId,
      ),
    );
  } else {
    safeRemove(
      "activeTeacherId",
    );
  }

  if (studentId) {
    safeSet(
      "activeStudentId",
      String(
        studentId,
      ),
    );
  } else {
    safeRemove(
      "activeStudentId",
    );
  }

  if (parentId) {
    safeSet(
      "activeParentId",
      String(
        parentId,
      ),
    );
  } else {
    safeRemove(
      "activeParentId",
    );
  }

  safeSet(
    OPEN_WORKSPACE_KEY,
    JSON.stringify({
      membership:
        normalized,
      membershipId:
        id,
      role:
        normalized.role,
      schoolId,
      branchId,
      teacherId,
      studentId,
      parentId,
      openedAt:
        Date.now(),
    }),
  );

  return normalized;
}

export function readStoredId(
  ...keys: string[]
) {
  for (
    const key of keys
  ) {
    const parsed =
      toPermanentId(
        safeRead(
          key,
        ),
      );

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function pickMembership(args: {
  memberships:
    UserMembership[];
  allowedRoles:
    AppRole[];
  activeSchoolId?:
    string |
    null;
  activeBranchId?:
    string |
    null;
}) {
  return (
    args.memberships.find(
      (
        membership,
      ) => {
        if (
          !roleAllowed(
            membership.role,
            args.allowedRoles,
          )
        ) {
          return false;
        }

        if (
          !membershipIsUsable(
            membership,
          )
        ) {
          return false;
        }

        const schoolMatches =
          !args.activeSchoolId ||
          !membership.schoolId ||
          String(
            membership.schoolId,
          ) ===
            String(
              args.activeSchoolId,
            );

        const branchMatches =
          !args.activeBranchId ||
          !membership.branchId ||
          String(
            membership.branchId,
          ) ===
            String(
              args.activeBranchId,
            );

        return (
          schoolMatches &&
          branchMatches
        );
      },
    ) ||

    args.memberships.find(
      (
        membership,
      ) =>
        roleAllowed(
          membership.role,
          args.allowedRoles,
        ) &&
        membershipIsUsable(
          membership,
        ),
    ) ||

    null
  );
}

export function protectedPortalCanAccess(
  selectedMembership:
    UserMembership |
    null,
  allowedRoles:
    AppRole[],
) {
  if (
    !selectedMembership
  ) {
    return false;
  }

  if (
    !roleAllowed(
      selectedMembership.role,
      allowedRoles,
    )
  ) {
    return false;
  }

  if (
    !membershipIsUsable(
      selectedMembership,
    )
  ) {
    return false;
  }

  return profileRoleHasPermanentId(
    selectedMembership,
  );
}