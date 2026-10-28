"use client";

/**
 * app/hooks/useTeacherWorkspaceAccess.ts
 * ------------------------------------------------------------
 * Teacher assignment access for the selected, ACTIVE membership.
 *
 * Fix: do not memoize and then trust eleeveon_open_workspace.teacherId.
 * A role/teacher can switch without account/school/branch changing, making
 * a stored teacherId stale. The reactive membership selected by the portal
 * is the identity authority.
 *
 * Permissions are fail-closed. This only reads locally synchronized
 * assignments; the backend MUST enforce the same scope for reads/writes.
 */
import { useEffect, useMemo, useState } from "react";
import { useBranchWorkspaceScope } from "./useBranchWorkspaceScope";
import { useBranchTableRevision } from "./useBranchTableRevision";
import { db } from "../lib/db/db";

export const asId = (value: unknown): string =>
  value == null ? "" : String(value).trim();

export const idsEqual = (a: unknown, b: unknown): boolean =>
  Boolean(asId(a)) && asId(a) === asId(b);

function normalizedRole(value: unknown): string {
  return asId(value).toLowerCase().replace(/-/g, "_");
}

/** Explicit denials must never be treated as active assignments. */
function usable(
  row: any,
  accountId: string,
  schoolId: string,
  branchId: string,
): boolean {
  if (!row || row.isDeleted === true || row.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended", "revoked"].includes(
    asId(row.status).toLowerCase(),
  )) return false;

  // No missing/wildcard tenant IDs: a teacher must be authorized explicitly.
  return (
    idsEqual(row.accountId, accountId) &&
    idsEqual(row.schoolId, schoolId) &&
    idsEqual(row.branchId, branchId)
  );
}

type AssignmentSnapshot = {
  key: string;
  ready: boolean;
  subjects: Set<string>;
  classes: Set<string>;
  teachingClasses: Set<string>;
  error?: string;
};

const empty = (
  key: string,
  ready = false,
  error?: string,
): AssignmentSnapshot => ({
  key,
  ready,
  subjects: new Set<string>(),
  classes: new Set<string>(),
  teachingClasses: new Set<string>(),
  error,
});

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const entry of a) if (!b.has(entry)) return false;
  return true;
}

function activeEnrollment(row: any): boolean {
  const status = asId(row?.status).toLowerCase();
  return status === "active" || (status === "" && row?.active !== false);
}

export function useTeacherWorkspaceAccess() {
  const workspace = useBranchWorkspaceScope();
  const revision = useBranchTableRevision(["classSubjects", "classTeachers"]);

  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring,
    branchLoading,
    membership,
    role: workspaceRole,
  } = workspace;

  // Critical: resolve from the LIVE selected membership, not localStorage.
  // Both role and profile ID must refer to this same selected membership.
  const role = normalizedRole(workspaceRole || membership?.role);
  const teacherId = asId(
    (membership as any)?.teacherId ||
    (membership as any)?.teacherLocalId ||
    (membership as any)?.teacher?.id,
  );

  const account = asId(accountId);
  const school = asId(schoolId);
  const branch = asId(branchId);
  const identityKey = [account, school, branch, teacherId, role].join("|");
  const permitted = Boolean(
    authenticated &&
    !workspace.error &&
    membership &&
    role === "teacher" &&
    teacherId &&
    account &&
    school &&
    branch,
  );

  const [assigned, setAssigned] = useState<AssignmentSnapshot>(() => empty(""));

  useEffect(() => {
    let cancelled = false;
    if (!permitted) {
      setAssigned((previous) =>
        previous.key === identityKey &&
        previous.ready &&
        !previous.subjects.size &&
        !previous.classes.size &&
        !previous.teachingClasses.size &&
        !previous.error
          ? previous
          : empty(identityKey, true),
      );
      return () => { cancelled = true; };
    }

    // Do not reveal a former teacher's assignments during a role switch.
    setAssigned((previous) =>
      previous.key === identityKey ? previous : empty(identityKey),
    );

    Promise.all([
      db.classSubjects.toArray(),
      db.classTeachers.toArray(),
    ]).then(([subjectRows, classRows]) => {
      if (cancelled) return;

      const ownSubjects = (subjectRows as any[]).filter((row) =>
        usable(row, account, school, branch) && idsEqual(row.teacherId, teacherId),
      );
      const ownClasses = (classRows as any[]).filter((row) =>
        usable(row, account, school, branch) && idsEqual(row.teacherId, teacherId),
      );

      const subjects = new Set<string>(
        ownSubjects.map((row) => asId(row.id)).filter(Boolean),
      );
      const classes = new Set<string>(
        ownClasses.map((row) => asId(row.classId)).filter(Boolean),
      );
      const teachingClasses = new Set<string>(
        ownSubjects.map((row) => asId(row.classId)).filter(Boolean),
      );

      setAssigned((previous) =>
        previous.key === identityKey &&
        previous.ready &&
        !previous.error &&
        sameSet(previous.subjects, subjects) &&
        sameSet(previous.classes, classes) &&
        sameSet(previous.teachingClasses, teachingClasses)
          ? previous
          : { key: identityKey, ready: true, subjects, classes, teachingClasses },
      );
    }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      setAssigned((previous) =>
        previous.key === identityKey && previous.ready
          ? { ...previous, error: message }
          : empty(identityKey, true, message),
      );
    });

    return () => { cancelled = true; };
  }, [permitted, identityKey, account, school, branch, teacherId, revision]);

  const current = assigned.key === identityKey ? assigned : empty(identityKey);
  const allowedClassIds = useMemo(
    () => new Set<string>([...current.classes, ...current.teachingClasses]),
    [current.classes, current.teachingClasses],
  );

  return {
    accountId: account,
    schoolId: school,
    branchId: branch,
    teacherId,
    permitted,
    ready: !restoring && !branchLoading && current.ready,
    error: workspace.error || current.error,
    classTeacherClassIds: current.classes,
    teachingClassIds: current.teachingClasses,
    allowedClassIds,
    subjectIds: current.subjects,
  };
}

/** Verify a live class-subject link before allowing a score write. */
export async function verifyTeacherSubjectAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  subjectId: string,
): Promise<boolean> {
  if (!subjectId || !identity.teacherId) return false;
  const rows = await db.classSubjects.toArray();
  return rows.some((row: any) =>
    usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.teacherId, identity.teacherId) &&
    idsEqual(row.id, subjectId),
  );
}

/** Verify live teacher-class access AND active student enrollment. */
export async function verifyTeacherStudentAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  studentId: string,
): Promise<boolean> {
  if (!studentId || !identity.teacherId) return false;
  const [enrollments, subjects, classTeachers] = await Promise.all([
    db.studentEnrollments.toArray(),
    db.classSubjects.toArray(),
    db.classTeachers.toArray(),
  ]);

  const allowed = new Set<string>([
    ...subjects
      .filter((row: any) =>
        usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
        idsEqual(row.teacherId, identity.teacherId),
      )
      .map((row: any) => asId(row.classId)),
    ...classTeachers
      .filter((row: any) =>
        usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
        idsEqual(row.teacherId, identity.teacherId),
      )
      .map((row: any) => asId(row.classId)),
  ]);

  return enrollments.some((row: any) =>
    usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.studentId, studentId) &&
    activeEnrollment(row) &&
    allowed.has(asId(row.classId)),
  );
}

/** Verify class-teacher permission (subject-teacher access isn't enough). */
export async function verifyTeacherClassAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  classId: string,
): Promise<boolean> {
  if (!classId || !identity.teacherId) return false;
  const rows = await db.classTeachers.toArray();
  return rows.some((row: any) =>
    usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.teacherId, identity.teacherId) &&
    idsEqual(row.classId, classId),
  );
}
