export type AppRole =
  | "developer"
  | "platform_team"
  | "super_admin"
  | "branch_admin"
  | "admin"
  | "teacher"
  | "student"
  | "accountant"
  | "parent";

export type UserMembership = {
  id?: string | number;
  role: AppRole;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  schoolBranchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  active?: boolean;
  isActive?: boolean;
  disabled?: boolean;
  isDeleted?: boolean;
  status?: string | null;
  [key: string]: any;
};

export const DEVELOPER_ROLES: AppRole[] = ["developer"];
export const OWNER_ROLES: AppRole[] = ["super_admin"];
export const SCHOOL_ADMIN_ROLES: AppRole[] = ["admin"];
export const BRANCH_ADMIN_ROLES: AppRole[] = ["branch_admin"];
export const ACCOUNTANT_ROLES: AppRole[] = ["accountant"];
export const ADMIN_ROLES: AppRole[] = ["admin", "branch_admin"];
export const FINANCE_ROLES: AppRole[] = ["accountant"];
export const TEACHER_ROLES: AppRole[] = ["teacher"];
export const STUDENT_ROLES: AppRole[] = ["student"];
export const PARENT_ROLES: AppRole[] = ["parent"];

export const ALL_APP_ROLES: AppRole[] = [
  "developer",
  "platform_team",
  "super_admin",
  "branch_admin",
  "admin",
  "teacher",
  "student",
  "accountant",
  "parent",
];

const ROLE_ALIASES: Record<string, AppRole> = {
  developer: "developer",
  dev: "developer",
  plaform_team: "platform_team",
  system_developer: "developer",

  owner: "super_admin",
  school_owner: "super_admin",
  superadmin: "super_admin",
  super_admin: "super_admin",
  super: "super_admin",

  admin: "admin",
  school_admin: "admin",
  schooladmin: "admin",
  administrator: "admin",

  branch_admin: "branch_admin",
  branchadmin: "branch_admin",
  branch_administrator: "branch_admin",
  campus_admin: "branch_admin",

  accountant: "accountant",
  account: "accountant",
  finance: "accountant",
  bursar: "accountant",

  teacher: "teacher",
  tutor: "teacher",
  instructor: "teacher",

  student: "student",
  learner: "student",
  pupil: "student",

  parent: "parent",
  guardian: "parent",
};

function cleanRole(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function asArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function numberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function membershipIsActive(membership: any) {
  if (!membership) return false;
  if (membership.active === false) return false;
  if (membership.isActive === false) return false;
  if (membership.disabled === true) return false;
  if (membership.isDeleted === true) return false;

  const status = String(membership.status || "").trim().toLowerCase();
  if (["inactive", "disabled", "deleted", "blocked", "suspended"].includes(status)) {
    return false;
  }

  return true;
}

function membershipRole(membership: any): AppRole | undefined {
  return normalizeRole(
    membership?.role ||
      membership?.membershipRole ||
      membership?.portalRole ||
      membership?.type ||
      membership?.userRole
  );
}

function membershipSchoolId(membership: any) {
  return (
    membership?.schoolId ||
    membership?.school?.id ||
    membership?.activeSchoolId ||
    membership?.contextSchoolId ||
    null
  );
}

function membershipBranchId(membership: any) {
  return (
    membership?.branchId ||
    membership?.schoolBranchId ||
    membership?.branch?.id ||
    membership?.activeBranchId ||
    membership?.contextBranchId ||
    null
  );
}

function contextMatches(args: {
  expectedSchoolId?: number | null;
  expectedBranchId?: number | null;
  membership?: any;
}) {
  const expectedSchoolId = numberOrNull(args.expectedSchoolId);
  const expectedBranchId = numberOrNull(args.expectedBranchId);

  const memberSchoolId = numberOrNull(membershipSchoolId(args.membership));
  const memberBranchId = numberOrNull(membershipBranchId(args.membership));

  const schoolMatches =
    !expectedSchoolId || !memberSchoolId || expectedSchoolId === memberSchoolId;

  const branchMatches =
    !expectedBranchId || !memberBranchId || expectedBranchId === memberBranchId;

  return schoolMatches && branchMatches;
}

export function normalizeRole(role?: string | null): AppRole | undefined {
  const value = cleanRole(role);
  if (!value) return undefined;

  if (ROLE_ALIASES[value]) return ROLE_ALIASES[value];
  if (ALL_APP_ROLES.includes(value as AppRole)) return value as AppRole;

  return undefined;
}

export function normalizeMembership(membership: any): UserMembership | null {
  if (!membership || !membershipIsActive(membership)) return null;

  const role = membershipRole(membership);
  if (!role) return null;

  return {
    ...membership,
    role,
    schoolId: numberOrNull(membershipSchoolId(membership)),
    branchId: numberOrNull(membershipBranchId(membership)),
    teacherLocalId: numberOrNull(membership.teacherLocalId),
    studentLocalId: numberOrNull(membership.studentLocalId),
    parentLocalId: numberOrNull(membership.parentLocalId),
    active: true,
  };
}

export function normalizeMemberships(memberships?: any[] | null): UserMembership[] {
  return asArray(memberships)
    .map((membership) => normalizeMembership(membership))
    .filter(Boolean) as UserMembership[];
}

export function collectUserMemberships(source: any): UserMembership[] {
  const memberships = [
    source?.memberships,
    source?.userMemberships,
    source?.accountMemberships,
    source?.schoolMemberships,
    source?.roleMemberships,
    source?.membership,
  ].flatMap((value) => asArray(value));

  return normalizeMemberships(memberships);
}

export function getPortalPathByRole(role?: string | null) {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "developer":
      return "/developer";
    case "platform_team":
      return "/platform-team";
    case "super_admin":
      return "/owner";
    case "admin":
      return "/school-admin";
    case "branch_admin":
      return "/branch-admin";
    case "accountant":
      return "/accountant";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    case "parent":
      return "/parent";
    default:
      return "/login";
  }
}

export function getPrimaryRole(args: {
  role?: string | null;
  memberships?: any[] | null;
}) {
  const directRole = normalizeRole(args.role);

  const membershipRoles = normalizeMemberships(args.memberships).map(
    (membership) => membership.role
  );

  const roles = Array.from(
    new Set([directRole, ...membershipRoles].filter(Boolean))
  ) as AppRole[];

  if (roles.includes("developer")) return "developer";
  if (roles.includes("platform_team")) return "platform_team";
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("branch_admin")) return "branch_admin";
  if (roles.includes("accountant")) return "accountant";
  if (roles.includes("teacher")) return "teacher";
  if (roles.includes("student")) return "student";
  if (roles.includes("parent")) return "parent";

  return directRole;
}

export function getPortalPathForUser(args: {
  role?: string | null;
  memberships?: any[] | null;
}) {
  return getPortalPathByRole(getPrimaryRole(args));
}

export function shouldChooseMembership(args: {
  role?: string | null;
  memberships?: any[] | null;
}) {
  const activeMemberships = normalizeMemberships(args.memberships);
  return activeMemberships.length > 1;
}

export function roleCanAccess(
  role: string | null | undefined,
  allowedRoles: AppRole[]
) {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return allowedRoles.includes(normalized);
}

export function pickAccessibleMembership(args: {
  memberships?: any[] | null;
  allowedRoles: AppRole[];
  schoolId?: number | null;
  branchId?: number | null;
}) {
  const memberships = normalizeMemberships(args.memberships);

  return (
    memberships.find((membership) => {
      if (!args.allowedRoles.includes(membership.role)) return false;

      return contextMatches({
        expectedSchoolId: args.schoolId,
        expectedBranchId: args.branchId,
        membership,
      });
    }) || null
  );
}

export function membershipCanAccess(args: {
  role?: string | null;
  memberships?: any[] | null;
  selectedMembership?: any | null;
  allowedRoles: AppRole[];
  schoolId?: number | null;
  branchId?: number | null;
}) {
  const selected = normalizeMembership(args.selectedMembership);

  if (
    selected &&
    args.allowedRoles.includes(selected.role) &&
    contextMatches({
      expectedSchoolId: args.schoolId,
      expectedBranchId: args.branchId,
      membership: selected,
    })
  ) {
    return true;
  }

  const protectedProfileRoles: AppRole[] = ["student", "teacher", "parent"];

  if (args.allowedRoles.some((role) => protectedProfileRoles.includes(role))) {
    return false;
  }

  if (roleCanAccess(args.role, args.allowedRoles)) return true;

  const accessibleMembership = pickAccessibleMembership({
    memberships: args.memberships,
    allowedRoles: args.allowedRoles,
    schoolId: args.schoolId,
    branchId: args.branchId,
  });

  return Boolean(accessibleMembership);
}
