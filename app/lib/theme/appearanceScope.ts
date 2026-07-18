/**
 * app/lib/theme/appearanceScope.ts
 * --------------------------------------------------------------------------
 * Single authority for deciding which appearance source an active role may use.
 *
 * This prevents a cached branch theme from leaking into Owner, Developer,
 * Platform Team, or school-wide portals when the same user switches roles.
 */

export type AppearanceScope =
  | "platform"
  | "account"
  | "school"
  | "branch";

export type AppearanceRole =
  | "developer"
  | "platform_team"
  | "super_admin"
  | "admin"
  | "school_admin"
  | "branch_admin"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | string;

const PLATFORM_ROLES = new Set([
  "developer",
  "platform_team",
]);

const ACCOUNT_ROLES = new Set([
  "owner",
  "school_owner",
  "super_admin",
]);

const SCHOOL_ROLES = new Set([
  "admin",
  "school_admin",
  "schooladmin",
]);

const BRANCH_ROLES = new Set([
  "branch_admin",
  "branchadmin",
  "teacher",
  "student",
  "parent",
  "accountant",
]);

export function normalizeAppearanceRole(
  value: unknown,
) {
  const role = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (role === "school_owner") return "super_admin";
  if (role === "owner") return "super_admin";
  if (role === "schooladmin") return "school_admin";
  if (role === "branchadmin") return "branch_admin";

  return role;
}

export function appearanceScopeForRole(
  value: unknown,
): AppearanceScope {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (PLATFORM_ROLES.has(raw)) return "platform";
  if (ACCOUNT_ROLES.has(raw)) return "account";
  if (SCHOOL_ROLES.has(raw)) return "school";
  if (BRANCH_ROLES.has(raw)) return "branch";

  // Unknown roles must never inherit a previously applied branch theme.
  return "platform";
}

export function requiresSchoolAppearance(
  value: unknown,
) {
  const scope = appearanceScopeForRole(value);
  return scope === "school" || scope === "branch";
}

export function requiresBranchAppearance(
  value: unknown,
) {
  return appearanceScopeForRole(value) === "branch";
}

export function appearanceIdentityFor(input: {
  role?: unknown;
  accountId?: unknown;
  schoolId?: unknown;
  branchId?: unknown;
}) {
  const role = normalizeAppearanceRole(input.role);
  const scope = appearanceScopeForRole(role);
  const accountId = String(input.accountId || "").trim() || null;
  const schoolId = positiveNumber(input.schoolId);
  const branchId = positiveNumber(input.branchId);

  return {
    scope,
    role,
    accountId,
    schoolId:
      scope === "school" || scope === "branch"
        ? schoolId
        : null,
    branchId: scope === "branch" ? branchId : null,
    key: [
      scope,
      role || "unknown",
      accountId || "account-none",
      scope === "school" || scope === "branch"
        ? schoolId || "school-none"
        : "school-na",
      scope === "branch"
        ? branchId || "branch-none"
        : "branch-na",
    ].join(":"),
  } as const;
}

export function appearanceIdentityMatches(
  left: ReturnType<typeof appearanceIdentityFor> | null | undefined,
  right: ReturnType<typeof appearanceIdentityFor> | null | undefined,
) {
  return Boolean(left && right && left.key === right.key);
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}