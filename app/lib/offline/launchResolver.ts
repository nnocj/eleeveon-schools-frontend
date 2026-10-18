/** Local launch resolution. Stored preferences are NEVER a grant of access. */
import { collectUserMemberships, getPortalPathByRole, normalizeMemberships, type UserMembership } from "../auth/roleRedirect";

export type LaunchCandidate = {
  accountId: string;
  membership: UserMembership;
  route: string;
};

function clean(value: unknown) { return String(value ?? "").trim(); }

function usable(m: UserMembership): boolean {
  const status = clean(m.status).toLowerCase();
  if (m.active === false || m.isActive === false || m.disabled === true || m.isDeleted === true || ["disabled", "inactive", "suspended", "blocked", "deleted"].includes(status)) return false;
  if (m.role === "teacher" && !m.teacherId) return false;
  if (m.role === "student" && !m.studentId) return false;
  if (m.role === "parent" && !m.parentId) return false;
  return true;
}

function identity(m: UserMembership) {
  return clean(m.id) || `${m.role}-${m.schoolId ?? "account"}-${m.branchId ?? "root"}-${m.teacherId ?? m.studentId ?? m.parentId ?? "portal"}`;
}

/** Must only be used after AccountProvider has recovered an existing session. */
export function resolveSavedLaunch(args: {
  accountId: string | null | undefined;
  user: unknown;
  account: unknown;
}): LaunchCandidate | null {
  if (typeof window === "undefined") return null;
  const accountId = clean(args.accountId);
  if (!accountId) return null;
  let opened: { membership?: UserMembership; membershipId?: string; role?: string; schoolId?: string; branchId?: string } | null = null;
  try {
    const raw = localStorage.getItem("eleeveon_open_workspace");
    if (raw) opened = JSON.parse(raw);
  } catch { return null; }
  if (!opened?.membership || !opened.membershipId) return null;
  if (clean(opened.membership.accountId) && clean(opened.membership.accountId) !== accountId) return null;

  // Compare saved choice against memberships belonging to the currently restored user.
  // Do NOT infer authorization from the saved workspace itself.
  const authorized = normalizeMemberships([
    ...collectUserMemberships(args.user),
    ...collectUserMemberships(args.account),
  ]).filter(usable);
  const match = authorized.find((membership) => {
    if (clean(membership.accountId) && clean(membership.accountId) !== accountId) return false;
    if (identity(membership) !== clean(opened?.membershipId)) {
      // Old persisted membership IDs are usually the raw UUID.
      if (!membership.id || clean(membership.id) !== clean(opened?.membershipId)) return false;
    }
    if (membership.role !== opened?.membership?.role) return false;
    const saved = opened.membership;
    for (const key of ["schoolId", "branchId", "teacherId", "studentId", "parentId"] as const) {
      if (clean(membership[key]) !== clean(saved[key])) return false;
    }
    return true;
  });
  if (!match) return null;
  const route = getPortalPathByRole(match.role);
  if (route === "/login") return null;
  return { accountId, membership: match, route };
}
