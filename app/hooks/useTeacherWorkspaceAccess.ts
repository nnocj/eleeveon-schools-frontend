"use client";
/**
 * Teacher portal assignment resolver — UI-level scoping only.
 * Server routes and sync MUST independently validate teacher assignments.
 * Selected role workspace determines account, school and branch.
 *
 * Performance:
 * - Watch only assignment tables (not students/enrollments/teacher profiles).
 * - Do not blank confirmed assignments during a same-identity refresh.
 * - Ignore old asynchronous results when identity/revision changes.
 * - Publish unchanged assignment sets without triggering a new render.
 * - Mutation verification ALWAYS reads live local assignments again.
 */
import { useEffect, useMemo, useState } from "react";
import { useBranchWorkspaceScope } from "./useBranchWorkspaceScope";
import { useActiveMembership } from "../context/active-membership-context";
import { useBranchTableRevision } from "./useBranchTableRevision";
import { db } from "../lib/db/db";

export const asId = (v: unknown) => v == null ? "" : String(v).trim();
export const idsEqual = (a: unknown, b: unknown) => !!asId(a) && asId(a) === asId(b);

function currentWorkspace(): any {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.localStorage.getItem("eleeveon_open_workspace") ||
      window.sessionStorage.getItem("eleeveon_open_workspace") || "{}",
    );
  } catch {
    return {};
  }
}

function usable(row: any, accountId: string, schoolId: string, branchId: string) {
  // Missing scope is NOT permission. Keep assignment checks fail-closed.
  return !!row && row.isDeleted !== true && row.active !== false &&
    idsEqual(row.accountId, accountId) &&
    idsEqual(row.schoolId, schoolId) &&
    idsEqual(row.branchId, branchId);
}

type AssignmentSnapshot = {
  key: string;
  ready: boolean;
  subjects: Set<string>;
  classes: Set<string>;
  teachingClasses: Set<string>;
  error?: string;
};

const empty = (key: string, ready = false, error?: string): AssignmentSnapshot => ({
  key, ready,
  subjects: new Set<string>(),
  classes: new Set<string>(),
  teachingClasses: new Set<string>(),
  error,
});

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

export function useTeacherWorkspaceAccess() {
  const workspace = useBranchWorkspaceScope();
  const { activeMembership } = useActiveMembership() as any;
  // Enrollment/teacher-profile revisions must not restart authorization reads.
  const revision = useBranchTableRevision(["classSubjects", "classTeachers"]);
  const { accountId, schoolId, branchId, authenticated, restoring, branchLoading } = workspace;
  const ws = useMemo(currentWorkspace, [accountId, schoolId, branchId]);
  const membership = ws?.membership || activeMembership || {};
  const role = String(ws?.role || membership.role || "").toLowerCase().trim();
  const teacherId = asId(
    ws?.teacherId || membership.teacherLocalId || membership.teacherId ||
    membership.teacher?.id || (activeMembership as any)?.teacherLocalId ||
    (activeMembership as any)?.teacherId,
  );
  const account = asId(accountId);
  const school = asId(schoolId);
  const branch = asId(branchId);
  const identityKey = [account, school, branch, teacherId, role].join("|");
  const permitted = !!authenticated && role === "teacher" && !!teacherId &&
    !!account && !!school && !!branch;

  const [assigned, setAssigned] = useState<AssignmentSnapshot>(() => empty(""));

  useEffect(() => {
    let cancelled = false;
    if (!permitted) {
      setAssigned(previous => previous.key === identityKey && previous.ready &&
        !previous.subjects.size && !previous.classes.size && !previous.teachingClasses.size &&
        !previous.error ? previous : empty(identityKey, true));
      return () => { cancelled = true; };
    }

    // A different identity must never temporarily see another teacher's data.
    setAssigned(previous => previous.key === identityKey ? previous : empty(identityKey));

    Promise.all([
      (db as any).classSubjects.toArray(),
      (db as any).classTeachers.toArray(),
    ]).then(([subjectRows, classRows]) => {
      if (cancelled) return;
      const ownSubjects = (subjectRows as any[]).filter(row =>
        usable(row, account, school, branch) && idsEqual(row.teacherId, teacherId));
      const ownClasses = (classRows as any[]).filter(row =>
        usable(row, account, school, branch) && idsEqual(row.teacherId, teacherId));
      const subjects = new Set<string>(ownSubjects.map(row => asId(row.id)).filter(Boolean));
      const classes = new Set<string>(ownClasses.map(row => asId(row.classId)).filter(Boolean));
      const teachingClasses = new Set<string>(ownSubjects.map(row => asId(row.classId)).filter(Boolean));
      setAssigned(previous => previous.key === identityKey && previous.ready &&
        !previous.error && sameSet(previous.subjects, subjects) &&
        sameSet(previous.classes, classes) &&
        sameSet(previous.teachingClasses, teachingClasses)
        ? previous
        : { key: identityKey, ready: true, subjects, classes, teachingClasses });
    }).catch((error) => {
      if (cancelled) return;
      // Initial read fails closed. Existing same-identity permissions remain
      // visible on refresh failure; server/mutation routes still revalidate.
      setAssigned(previous => previous.key === identityKey && previous.ready
        ? { ...previous, error: String(error) }
        : empty(identityKey, true, String(error)));
    });
    return () => { cancelled = true; };
  }, [authenticated, permitted, identityKey, account, school, branch, teacherId, revision]);

  // Snapshot identity must match the current role's workspace, even during
  // the render before useEffect runs after a role switch.
  const current = assigned.key === identityKey ? assigned : empty(identityKey);
  const allowedClassIds = useMemo(
    () => new Set<string>([...current.classes, ...current.teachingClasses]),
    [current.classes, current.teachingClasses],
  );

  return {
    accountId: account, schoolId: school, branchId: branch, teacherId,
    permitted,
    ready: !restoring && !branchLoading && current.ready,
    error: current.error,
    classTeacherClassIds: current.classes,
    teachingClassIds: current.teachingClasses,
    allowedClassIds,
    subjectIds: current.subjects,
  };
}

/** Recheck a teacher's CURRENT assignment immediately before a mutation. */
export async function verifyTeacherSubjectAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  subjectId: string,
) {
  const rows = await (db as any).classSubjects.toArray();
  return rows.some((row: any) => usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.teacherId, identity.teacherId) && idsEqual(row.id, subjectId));
}

/** A teacher can edit student demographics only for assigned active classes. */
export async function verifyTeacherStudentAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  studentId: string,
) {
  const [enrollments, subjects, classTeachers] = await Promise.all([
    (db as any).studentEnrollments.toArray(),
    (db as any).classSubjects.toArray(),
    (db as any).classTeachers.toArray(),
  ]);
  const allowed = new Set<string>([
    ...subjects.filter((row: any) => usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
      idsEqual(row.teacherId, identity.teacherId)).map((row: any) => asId(row.classId)),
    ...classTeachers.filter((row: any) => usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
      idsEqual(row.teacherId, identity.teacherId)).map((row: any) => asId(row.classId)),
  ]);
  return (enrollments as any[]).some((row: any) =>
    usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.studentId, studentId) && row.status === "active" &&
    allowed.has(asId(row.classId)));
}

/** Fresh class-teacher authorization before writing remarks/attendance. */
export async function verifyTeacherClassAssignment(
  identity: { accountId: string; schoolId: string; branchId: string; teacherId: string },
  classId: string,
) {
  const rows = await (db as any).classTeachers.toArray();
  return rows.some((row: any) => usable(row, identity.accountId, identity.schoolId, identity.branchId) &&
    idsEqual(row.teacherId, identity.teacherId) && idsEqual(row.classId, classId));
}
