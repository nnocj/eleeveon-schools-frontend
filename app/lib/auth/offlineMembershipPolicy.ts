import type { UserMembership } from "./roleRedirect";

/** UI navigation filter only; API and data access MUST enforce authorization separately. */
export function permittedOfflineMemberships(verified: readonly UserMembership[], requested: UserMembership): boolean {
  const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
  return verified.some((m) => {
    if (m.active === false || m.isActive === false || m.disabled === true || m.isDeleted === true) return false;
    if (m.status && !["active", "enabled"].includes(m.status.toLowerCase())) return false;
    if (m.role !== requested.role) return false;
    if (clean(m.accountId) !== clean(requested.accountId)) return false;
    if (clean(m.schoolId) !== clean(requested.schoolId)) return false;
    if (clean(m.branchId ?? m.schoolBranchId) !== clean(requested.branchId ?? requested.schoolBranchId)) return false;
    if (clean(m.teacherId) !== clean(requested.teacherId)) return false;
    if (clean(m.studentId) !== clean(requested.studentId)) return false;
    if (clean(m.parentId) !== clean(requested.parentId)) return false;
    return true;
  });
}
