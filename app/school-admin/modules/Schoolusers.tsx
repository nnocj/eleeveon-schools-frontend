"use client";

/**
 * app/school-admin/modules/Schoolusers_FIXED_LOAD_BRANCH_ADMINS.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — USERS & ROLES
 * ---------------------------------------------------------
 *
 * School-level hierarchy:
 * - School admin manages BRANCH ADMIN access only.
 * - Branch admin later manages roles below them:
 *   accountant, teacher, student, parent.
 *
 * This page:
 * - Works only inside assigned school context.
 * - Does NOT allow school admin to assign owner/admin/super_admin.
 * - Does NOT manage teacher/student/parent/accountant here.
 * - Creates/updates users + memberships for branch_admin role through the BACKEND AUTH API first.
 * - Loads branch admins from backend AppUser responses, including nested memberships.
 * - Assigns each branch admin to one branch.
 * - Sends the temporary password as the real initial password to the backend.
 * - Marks mustChangePassword: true so the user can be forced to change it later.
 *
 * IMPORTANT FIX:
 * - appUsers/userMemberships/permissionRules are auth/access tables.
 * - They do NOT use prepareSyncData() and do NOT enter the normal SyncRecord flow.
 * - This file calls the backend first, then only caches returned auth data locally.
 *
 * Expected db tables:
 * - branches
 * - users OR accountUsers
 * - userMemberships OR memberships
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db";
import { apiRequest } from "../../lib/platformApi";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "cards" | "table" | "analytics";
type AccessFilter = "all" | "active" | "inactive" | "temporary";

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  isDeleted?: boolean;
  active?: boolean;
};

type Branch = TenantRow & {
  id?: number;
  name?: string;
  code?: string;
  location?: string;
  phone?: string;
  email?: string;
  active?: boolean;
};

type AppUser = TenantRow & {
  id?: string | number;
  localId?: string | number;
  cloudId?: string | null;
  title?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  role?: string;
  active?: boolean;
  status?: string;
  photo?: string;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  synced?: any;
};

type UserMembership = TenantRow & {
  id?: string | number;
  localId?: string | number;
  cloudId?: string | null;
  userId?: number | string | null;
  userLocalId?: string | number | null;
  accountUserId?: string | number | null;
  title?: string;
  email?: string;
  fullName?: string;
  role?: string;
  active?: boolean;
  status?: string;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
  mustChangePassword?: boolean;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  synced?: any;
};

type BranchAdminView = {
  key: string;
  user?: AppUser;
  membership: UserMembership;
  branch?: Branch;
  title: string;
  fullName: string;
  email: string;
  phone: string;
  branchName: string;
  branchId?: number;
  active: boolean;
  mustChangePassword: boolean;
  initials: string;
};

type FormState = {
  membershipId?: string | number;
  userId: string;
  title: string;
  fullName: string;
  email: string;
  phone: string;
  branchId: string;
  active: boolean;
  temporaryPassword: string;
};

type Breakdown = {
  name: string;
  count: number;
};

type BackendBranchAdminPayload = {
  accountId: string;
  schoolId: number;
  branchId: number;
  role: "branch_admin";
  title?: string;
  fullName: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  active: boolean;
  status: "active" | "inactive";
  userId?: string;
  membershipId?: string | number;
};

type BackendBranchAdminResponse = {
  user?: AppUser;
  appUser?: AppUser;
  accountUser?: AppUser;
  membership?: UserMembership;
  userMembership?: UserMembership;
  data?: {
    user?: AppUser;
    appUser?: AppUser;
    accountUser?: AppUser;
    membership?: UserMembership;
    userMembership?: UserMembership;
    [key: string]: any;
  };
  id?: string;
  userId?: string;
  membershipId?: string;
  [key: string]: any;
};

// ======================================================
// CONSTANTS
// ======================================================

const TITLES = [
  "",
  "Mr.",
  "Mrs.",
  "Miss",
  "Ms.",
  "Dr.",
  "Prof.",
  "Rev.",
  "Pastor",
  "Imam",
  "Alhaji",
  "Hajia",
  "Nana",
];

const DEFAULT_FORM: FormState = {
  userId: "",
  title: "",
  fullName: "",
  email: "",
  phone: "",
  branchId: "",
  active: true,
  temporaryPassword: "",
};

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function makeLocalAuthId(prefix: string) {
  const safePrefix = String(prefix || "auth").replace(/[^a-zA-Z0-9_-]/g, "");
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${safePrefix}_${random}`;
}

function isStringPrimaryKeyTable(table: any) {
  // appUsers/userMemberships in db.ts use "id,..." not "++id,...".
  // That means Dexie expects us to provide a string id before add().
  const primaryKey = table?.schema?.primKey;
  return primaryKey?.keyPath === "id" && primaryKey?.auto === false;
}

function dateishNowForAuthTable(table: any) {
  // LocalAppUser/LocalUserMembership definitions often mirror Prisma and use strings,
  // but older local tables may use numbers. This keeps both styles safe.
  return isStringPrimaryKeyTable(table) ? new Date().toISOString() : now();
}


function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) {
    if (anyDb[name]) return anyDb[name];
  }
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  if (!table?.toArray) return [];
  return table.toArray();
}

function normalizeEmail(email?: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone?: string) {
  return String(phone || "").trim().replace(/\s+/g, " ");
}

function tempPasswordFromEmail(email: string) {
  const prefix = normalizeEmail(email)
    .split("@")[0]
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return `${prefix || "user"}@123`;
}

function num(value?: string | number | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sameSchool(row: TenantRow, accountId?: string | null, schoolId?: number | null) {
  if (!row || row.isDeleted) return false;

  return (
    (row.accountId || accountId) === accountId &&
    Number(row.schoolId ?? schoolId) === Number(schoolId)
  );
}

function userIdOf(user?: AppUser) {
  return user?.id ?? user?.localId;
}

function membershipUserId(membership?: UserMembership) {
  return String(membership?.userId ?? membership?.userLocalId ?? membership?.accountUserId ?? "");
}

function initials(name: string) {
  return String(name || "User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function respectfulName(input: {
  title?: string;
  fullName?: string;
  name?: string;
  email?: string;
}) {
  const title = String(input.title || "").trim();
  const name = String(input.fullName || input.name || input.email || "User").trim();

  if (!title) return name;

  const normalizedTitle = title.replace(/\.$/, "").toLowerCase();
  const lowerName = name.toLowerCase();

  if (
    lowerName.startsWith(`${normalizedTitle} `) ||
    lowerName.startsWith(`${normalizedTitle}. `)
  ) {
    return name;
  }

  return `${title} ${name}`;
}

function statusTone(active?: boolean): "green" | "red" {
  return active === false ? "red" : "green";
}


function pickBackendUser(response: BackendBranchAdminResponse, fallback: Partial<AppUser>) {
  return (
    response.user ||
    response.appUser ||
    response.accountUser ||
    response.data?.user ||
    response.data?.appUser ||
    response.data?.accountUser ||
    {
      ...fallback,
      id: response.userId || response.id || fallback.id,
    }
  ) as AppUser;
}

function pickBackendMembership(
  response: BackendBranchAdminResponse,
  fallback: Partial<UserMembership>
) {
  return (
    response.membership ||
    response.userMembership ||
    response.data?.membership ||
    response.data?.userMembership ||
    {
      ...fallback,
      id: response.membershipId || fallback.id,
    }
  ) as UserMembership;
}

async function authApi<T = any>(
  endpoint: string,
  options: {
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: any;
  }
): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, {
      method: options.method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    } as any);
  } catch (error: any) {
    // FIX COMMENT:
    // platformApi.ts throws only Error(message), so the UI previously showed
    // a generic stack trace without telling us which backend route failed.
    // This keeps the real backend validation message but adds the exact route.
    const message = String(error?.message || error || "Request failed");
    throw new Error(`${options.method} ${endpoint} failed: ${message}`);
  }
}

function endpointErrorMessage(error: any) {
  return String(error?.message || error?.statusText || error || "");
}

function isEndpointMissing(error: any) {
  const message = endpointErrorMessage(error).toLowerCase();
  return (
    error?.status === 404 ||
    error?.statusCode === 404 ||
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("cannot ") ||
    message.includes("no route")
  );
}

async function firstWorkingAuthCall<T = any>(
  attempts: Array<{
    endpoint: string;
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: any;
  }>
): Promise<T> {
  let lastError: any = null;

  for (const attempt of attempts) {
    try {
      return await authApi<T>(attempt.endpoint, {
        method: attempt.method,
        body: attempt.body,
      });
    } catch (error: any) {
      lastError = error;

      // Continue only for missing endpoints. Real validation/auth errors should stop
      // so the school admin sees the backend reason.
      if (!isEndpointMissing(error)) break;
    }
  }

  throw lastError || new Error("No auth endpoint accepted the request.");
}

async function fetchBackendSchoolUsers(args: {
  accountId: string;
  schoolId: number;
}) {
  // FIX COMMENT — REAL BACKEND ROUTE:
  // Your Nest controller exposes GET /accounts/me/users.
  // It does not expose /school-admin/users or /school-admin/branch-admins.
  // Query params are harmless, but filtering still happens in this component.
  return authApi<any>(`/accounts/me/users?schoolId=${args.schoolId}&role=branch_admin`, {
    method: "GET",
  });
}


function arrayFromAny(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function extractBackendUsersAndMemberships(remote: any) {
  // FIX COMMENT — LOAD RESPONSE NORMALIZER:
  // The save endpoint returns an AppUser that may contain nested `memberships`.
  // GET /accounts/me/users commonly returns users only, with memberships nested
  // on each user, not as a separate top-level `memberships` array.
  // The previous load logic expected top-level memberships, so it saved correctly
  // but displayed nothing because `membershipRows` stayed empty.
  const userCandidates = [
    remote?.users,
    remote?.appUsers,
    remote?.accountUsers,
    remote?.data?.users,
    remote?.data?.appUsers,
    remote?.data?.accountUsers,
    remote?.data,
    remote?.items,
    remote?.rows,
    remote?.results,
    remote,
  ];

  const users = userCandidates
    .flatMap(arrayFromAny)
    .filter(Boolean) as AppUser[];

  const topLevelMembershipCandidates = [
    remote?.memberships,
    remote?.userMemberships,
    remote?.data?.memberships,
    remote?.data?.userMemberships,
  ];

  const topLevelMemberships = topLevelMembershipCandidates
    .flatMap(arrayFromAny)
    .filter(Boolean) as UserMembership[];

  const nestedMemberships = users.flatMap((user: any) => {
    const nested = [
      user?.memberships,
      user?.userMemberships,
      user?.membership ? [user.membership] : [],
      user?.userMembership ? [user.userMembership] : [],
    ].flatMap(arrayFromAny);

    return nested.map((membership: any) => ({
      ...membership,
      userId: membership?.userId || userIdOf(user),
      title: membership?.title || user?.title,
      fullName: membership?.fullName || user?.fullName || user?.name,
      email: membership?.email || user?.email,
      accountId: membership?.accountId || user?.accountId,
      schoolId: membership?.schoolId ?? user?.schoolId,
      branchId: membership?.branchId ?? user?.branchId,
      active: membership?.active ?? user?.active,
      status: membership?.status || user?.status,
      mustChangePassword:
        membership?.mustChangePassword ?? user?.mustChangePassword,
    })) as UserMembership[];
  });

  const syntheticMemberships = users
    .filter((user: any) => {
      const role = String(user?.role || "").toLowerCase();
      const hasNested = nestedMemberships.some(
        (membership) => String(membership.userId || "") === String(userIdOf(user) || "")
      );

      return role === "branch_admin" && !hasNested;
    })
    .map((user: any) => ({
      id: user?.membershipId || user?.userMembershipId || `membership_${userIdOf(user) || user.email || Math.random()}`,
      accountId: user?.accountId,
      schoolId: user?.schoolId,
      branchId: user?.branchId,
      userId: userIdOf(user),
      title: user?.title,
      fullName: user?.fullName || user?.name,
      email: user?.email,
      role: "branch_admin",
      active: user?.active !== false && user?.status !== "inactive",
      status: user?.active === false || user?.status === "inactive" ? "inactive" : "active",
      mustChangePassword: Boolean(user?.mustChangePassword),
      isDeleted: Boolean(user?.isDeleted),
    })) as UserMembership[];

  const memberships = [
    ...topLevelMemberships,
    ...nestedMemberships,
    ...syntheticMemberships,
  ];

  return { users, memberships };
}

function cleanCreateUserDto(payload: BackendBranchAdminPayload) {
  // FIX COMMENT — DTO MATCH:
  // CreateAccountUserDto accepts exactly these important fields.
  // Sending only temporaryPassword will not work because /auth/login uses
  // the backend passwordHash created from `password`.
  return {
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone || undefined,
    password: payload.password,
    role: "branch_admin",
    schoolId: payload.schoolId,
    branchId: payload.branchId,
  };
}

function cleanUpdateUserDto(payload: BackendBranchAdminPayload) {
  // FIX COMMENT — UPDATE DTO MATCH:
  // The backend update endpoint does not accept password/schoolId/branchId.
  // It updates the AppUser profile only. Membership movement needs a backend
  // membership endpoint later if you want to change branch assignment remotely.
  return {
    fullName: payload.fullName,
    phone: payload.phone || undefined,
    role: "branch_admin",
  };
}


async function deleteBackendBranchAdminRole(item: BranchAdminView) {
  const membershipId = String(item.membership.id || item.membership.localId || "").trim();

  if (!membershipId) {
    throw new Error(
      "Missing membership id. Reload the page and try again. Delete Role must target a real backend UserMembership id."
    );
  }

  if (membershipId.startsWith("membership_")) {
    throw new Error(
      "This row has a temporary/synthetic membership id. Reload from backend first before deleting."
    );
  }

  // REAL DELETE FIX:
  // Your backend MembershipsService.remove() used to call update(... active:false),
  // so DELETE /memberships/:id only deactivated. After replacing the backend service
  // with the hard-delete version, this same route will truly remove the UserMembership row.
  //
  // IMPORTANT:
  // Do NOT call /accounts/users/:id DELETE here. AccountsService.deleteUser()
  // also only deactivates the AppUser. Delete Role must remove the membership.
  return authApi<any>(`/memberships/${encodeURIComponent(membershipId)}`, {
    method: "DELETE",
  });
}

async function removeAuthMembershipLocally(item: BranchAdminView) {
  const membershipTable = getTable<UserMembership>("userMemberships", "memberships");
  const userTable = getTable<AppUser>("users", "accountUsers", "appUsers");

  const membershipId = item.membership.id || item.membership.localId;
  const userId = userIdOf(item.user) || membershipUserId(item.membership);

  // AUTH CACHE ONLY:
  // Do not use prepareSyncData() and do not mark synced:"pending".
  // The backend is source of truth; this removes local display cache after the
  // backend hard-delete succeeds.
  if (membershipTable && membershipId) {
    try {
      await membershipTable.delete(membershipId);
    } catch (error) {
      console.warn("Failed to remove local membership cache:", error);
    }
  }

  // Remove the cached AppUser only when no other local memberships still point
  // to the same user. This prevents accidentally hiding a user who still has
  // another role elsewhere.
  if (userTable && userId) {
    try {
      let stillHasAnotherMembership = false;

      if (membershipTable?.toArray) {
        const remainingMemberships = await membershipTable.toArray();
        stillHasAnotherMembership = remainingMemberships.some((membership: UserMembership) => {
          const sameUser =
            String(membership.userId || membership.userLocalId || membership.accountUserId || "") ===
            String(userId);

          const sameMembership =
            String(membership.id || membership.localId || "") === String(membershipId || "");

          return sameUser && !sameMembership && membership.isDeleted !== true;
        });
      }

      if (!stillHasAnotherMembership) {
        await userTable.delete(userId);
      }
    } catch (error) {
      console.warn("Failed to remove local user cache after role delete:", error);
    }
  }
}

async function saveBackendBranchAdmin(payload: BackendBranchAdminPayload) {
  // FIX COMMENT — REAL BACKEND ROUTES FROM AccountsController:
  // CREATE: POST /accounts/me/users
  // UPDATE PROFILE: PATCH /accounts/users/:id
  // UPDATE ACTIVE STATUS: PATCH /accounts/users/:id/status
  // The previous file tried /accounts/me/users/:id and /school-admin/* routes,
  // which your backend does not define, causing the platformApi.ts error.

  if (payload.userId) {
    const user = await authApi<AppUser>(`/accounts/users/${encodeURIComponent(payload.userId)}`, {
      method: "PATCH",
      body: cleanUpdateUserDto(payload),
    });

    let statusResult: any = null;
    try {
      statusResult = await authApi<any>(`/accounts/users/${encodeURIComponent(payload.userId)}/status`, {
        method: "PATCH",
        body: { active: payload.active },
      });
    } catch (error) {
      // Some edits may be profile-only. Keep the profile update instead of
      // losing it if only the status route fails.
      console.warn("Failed to update backend user status:", error);
    }

    return {
      user: {
        ...(user || {}),
        ...(statusResult || {}),
        id: payload.userId,
        accountId: payload.accountId,
        schoolId: payload.schoolId,
        branchId: payload.branchId,
        email: payload.email,
        fullName: payload.fullName,
        phone: payload.phone,
        role: "branch_admin",
        active: payload.active,
      },
      membership: {
        id: payload.membershipId,
        accountId: payload.accountId,
        schoolId: payload.schoolId,
        branchId: payload.branchId,
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
        role: "branch_admin",
        active: payload.active,
        status: payload.status,
      },
    } as BackendBranchAdminResponse;
  }

  const created = await authApi<AppUser>("/accounts/me/users", {
    method: "POST",
    body: cleanCreateUserDto(payload),
  });

  return {
    user: created,
    membership: (created as any)?.memberships?.find?.((membership: UserMembership) =>
      membership.role === "branch_admin" &&
      Number(membership.schoolId) === Number(payload.schoolId) &&
      Number(membership.branchId) === Number(payload.branchId)
    ) || (created as any)?.memberships?.[0] || {
      accountId: payload.accountId,
      schoolId: payload.schoolId,
      branchId: payload.branchId,
      userId: userIdOf(created),
      email: payload.email,
      fullName: payload.fullName,
      role: "branch_admin",
      active: payload.active,
      status: payload.status,
    },
  } as BackendBranchAdminResponse;
}

async function cacheAuthUserLocally(args: {
  user: AppUser;
  payload: BackendBranchAdminPayload;
}) {
  const userTable = getTable<AppUser>("users", "accountUsers", "appUsers");
  if (!userTable) return;

  const timestamp = dateishNowForAuthTable(userTable);
  const id = userIdOf(args.user) || makeLocalAuthId("user");

  const cachePayload: Partial<AppUser> = {
    ...args.user,
    id,
    accountId: args.payload.accountId,
    schoolId: args.payload.schoolId,
    branchId: args.payload.branchId,
    title: args.payload.title,
    fullName: args.payload.fullName,
    name: args.payload.name,
    email: args.payload.email,
    phone: args.payload.phone,
    role: "branch_admin",
    active: args.payload.active,
    status: args.payload.status,
    temporaryPassword: args.payload.temporaryPassword,
    mustChangePassword: args.payload.mustChangePassword,
    isDeleted: false,
    updatedAt: timestamp as any,
    // AUTH CACHE ONLY: no `synced: "pending"` here.
  };

  const existing =
    (await userTable.get(id).catch(() => undefined)) ||
    (await userTable.where?.("email")?.equals?.(args.payload.email)?.first?.().catch(() => undefined));

  if (existing?.id) {
    await userTable.update(existing.id, {
      ...cachePayload,
      version: Number(existing.version || 0) + 1,
    });
    return;
  }

  await userTable.add({
    ...(isStringPrimaryKeyTable(userTable) ? { id } : {}),
    ...cachePayload,
    createdAt: timestamp as any,
    version: 1,
  });
}

async function cacheAuthMembershipLocally(args: {
  membership: UserMembership;
  user: AppUser;
  payload: BackendBranchAdminPayload;
}) {
  const membershipTable = getTable<UserMembership>("userMemberships", "memberships");
  if (!membershipTable) return;

  const timestamp = dateishNowForAuthTable(membershipTable);
  const userId = String(userIdOf(args.user) || args.payload.userId || "");
  const membershipId =
    args.membership.id ||
    args.payload.membershipId ||
    makeLocalAuthId("membership");

  const cachePayload: Partial<UserMembership> = {
    ...args.membership,
    id: membershipId,
    accountId: args.payload.accountId,
    schoolId: args.payload.schoolId,
    branchId: args.payload.branchId,
    userId,
    userLocalId: null,
    accountUserId: null,
    title: args.payload.title,
    fullName: args.payload.fullName,
    email: args.payload.email,
    role: "branch_admin",
    active: args.payload.active,
    status: args.payload.status,
    teacherLocalId: null,
    studentLocalId: null,
    parentLocalId: null,
    mustChangePassword: args.payload.mustChangePassword,
    isDeleted: false,
    updatedAt: timestamp as any,
    // AUTH CACHE ONLY: no `synced: "pending"` here.
  };

  const existing =
    (await membershipTable.get(membershipId).catch(() => undefined)) ||
    (await membershipTable
      .where?.("userId")
      ?.equals?.(userId)
      ?.first?.()
      .catch(() => undefined));

  if (existing?.id) {
    await membershipTable.update(existing.id, {
      ...cachePayload,
      version: Number(existing.version || 0) + 1,
    });
    return;
  }

  await membershipTable.add({
    ...(isStringPrimaryKeyTable(membershipTable) ? { id: membershipId } : {}),
    ...cachePayload,
    createdAt: timestamp as any,
    version: 1,
  });
}

// ======================================================
// COMPONENT
// ======================================================

export default function Schoolusers() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId && !settings?.schoolId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    settings?.schoolId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    if (!authenticated || !accountId || !schoolId) {
      setBranches([]);
      setUsers([]);
      setMemberships([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const branchRows = await db.branches.toArray();

      const schoolBranches = branchRows
        .filter((row: Branch) => sameSchool(row, accountId, Number(schoolId)))
        .filter((row: Branch) => row.active !== false);

      const branchIds = new Set(
        schoolBranches
          .map((branch: Branch) => branch.id)
          .filter(Boolean) as number[]
      );

      let userRows: AppUser[] = [];
      let membershipRows: UserMembership[] = [];

      try {
        // BACKEND-AUTH-FIRST LOAD:
        // This is the important fix. The login system reads backend AppUser,
        // so this page should also load auth/access records from backend first.
        const remote = await fetchBackendSchoolUsers({
          accountId,
          schoolId: Number(schoolId),
        });

        const normalized = extractBackendUsersAndMemberships(remote);
        userRows = normalized.users;
        membershipRows = normalized.memberships;

        // Keep a local read cache for offline display only.
        // These auth tables are not normal sync tables.
        for (const user of userRows) {
          const userMemberships = membershipRows.filter(
            (membership) =>
              String(membership.userId || "") === String(userIdOf(user) || "") ||
              Boolean(
                membership.email &&
                  user.email &&
                  normalizeEmail(membership.email) === normalizeEmail(user.email)
              )
          );

          const branchAdminMembership =
            userMemberships.find(
              (membership) => membership.role === "branch_admin"
            ) || userMemberships[0];

          await cacheAuthUserLocally({
            user,
            payload: {
              accountId,
              schoolId: Number(branchAdminMembership?.schoolId || user.schoolId || schoolId),
              branchId: Number(branchAdminMembership?.branchId || user.branchId || 0),
              role: "branch_admin",
              title: user.title || branchAdminMembership?.title,
              fullName:
                user.fullName ||
                user.name ||
                branchAdminMembership?.fullName ||
                user.email ||
                "Branch Admin",
              name:
                user.name ||
                user.fullName ||
                branchAdminMembership?.fullName ||
                user.email ||
                "Branch Admin",
              email: normalizeEmail(user.email || branchAdminMembership?.email),
              phone: normalizePhone(user.phone),
              password: user.temporaryPassword || "",
              temporaryPassword: user.temporaryPassword || "",
              mustChangePassword: Boolean(
                user.mustChangePassword || branchAdminMembership?.mustChangePassword
              ),
              active:
                user.active !== false &&
                user.status !== "inactive" &&
                branchAdminMembership?.active !== false &&
                branchAdminMembership?.status !== "inactive",
              status:
                user.active === false ||
                user.status === "inactive" ||
                branchAdminMembership?.active === false ||
                branchAdminMembership?.status === "inactive"
                  ? "inactive"
                  : "active",
              userId: String(userIdOf(user) || ""),
            },
          });
        }

        for (const membership of membershipRows) {
          const user =
            userRows.find(
              (row) => String(userIdOf(row) || "") === String(membership.userId || "")
            ) ||
            userRows.find(
              (row) =>
                Boolean(row.email && membership.email) &&
                normalizeEmail(row.email) === normalizeEmail(membership.email)
            );

          if (!user) continue;

          await cacheAuthMembershipLocally({
            membership,
            user,
            payload: {
              accountId,
              schoolId: Number(membership.schoolId || schoolId),
              branchId: Number(membership.branchId || 0),
              role: "branch_admin",
              title: membership.title || user.title,
              fullName:
                membership.fullName ||
                user.fullName ||
                user.name ||
                membership.email ||
                "Branch Admin",
              name:
                user.name ||
                user.fullName ||
                membership.fullName ||
                membership.email ||
                "Branch Admin",
              email: normalizeEmail(membership.email || user.email),
              phone: normalizePhone(user.phone),
              password: user.temporaryPassword || "",
              temporaryPassword: user.temporaryPassword || "",
              mustChangePassword: Boolean(
                membership.mustChangePassword || user.mustChangePassword
              ),
              active:
                membership.active !== false &&
                membership.status !== "inactive" &&
                user.active !== false &&
                user.status !== "inactive",
              status:
                membership.active === false ||
                membership.status === "inactive" ||
                user.active === false ||
                user.status === "inactive"
                  ? "inactive"
                  : "active",
              userId: String(userIdOf(user) || membership.userId || ""),
              membershipId: membership.id,
            },
          });
        }
      } catch (remoteError) {
        console.warn(
          "Backend auth user load failed; using local auth cache fallback:",
          remoteError
        );

        [userRows, membershipRows] = await Promise.all([
          tableToArray<AppUser>("users", "accountUsers", "appUsers"),
          tableToArray<UserMembership>("userMemberships", "memberships"),
        ]);
      }

      const branchAdminMemberships = membershipRows
        .map((membership) => {
          const linkedUser =
            userRows.find(
              (user) => String(userIdOf(user) || "") === membershipUserId(membership)
            ) ||
            userRows.find(
              (user) =>
                Boolean(user.email && membership.email) &&
                normalizeEmail(user.email) === normalizeEmail(membership.email)
            );

          // FIX COMMENT — DISPLAY JOIN:
          // Some backend responses place schoolId/branchId on the user while the
          // nested membership only has role/userId. Merge the linked user fields
          // before filtering, otherwise valid branch admins are hidden.
          return {
            ...membership,
            accountId: membership.accountId || linkedUser?.accountId || accountId,
            schoolId: membership.schoolId ?? linkedUser?.schoolId ?? Number(schoolId),
            branchId: membership.branchId ?? linkedUser?.branchId,
            email: membership.email || linkedUser?.email,
            fullName: membership.fullName || linkedUser?.fullName || linkedUser?.name,
            active: membership.active ?? linkedUser?.active,
            status: membership.status || linkedUser?.status,
            mustChangePassword:
              membership.mustChangePassword ?? linkedUser?.mustChangePassword,
          } as UserMembership;
        })
        .filter((membership) => {
          if (membership.role !== "branch_admin") return false;
          if (!sameSchool(membership, accountId, Number(schoolId))) return false;
          if (!membership.branchId) return false;
          return branchIds.has(Number(membership.branchId));
        });

      const schoolUsers = userRows.filter((user) => {
        if (user.isDeleted) return false;
        if (user.accountId && user.accountId !== accountId) return false;

        if (user.schoolId) {
          return Number(user.schoolId) === Number(schoolId);
        }

        return branchAdminMemberships.some((membership) => {
          const membershipUserKey = membershipUserId(membership);

          return (
            String(userIdOf(user) || "") === membershipUserKey ||
            Boolean(
              user.email &&
                membership.email &&
                user.email.toLowerCase() === membership.email.toLowerCase()
            )
          );
        });
      });

      setBranches(schoolBranches as Branch[]);
      setUsers(schoolUsers);
      setMemberships(branchAdminMemberships);
    } catch (error) {
      console.error("Failed to load school users:", error);
      alert("Failed to load school users and roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const branchMap = useMemo(() => {
    return new Map(branches.map((branch) => [branch.id, branch]));
  }, [branches]);

  const branchAdminViews = useMemo<BranchAdminView[]>(() => {
    return memberships
      .map((membership) => {
        const user =
          users.find((row) => String(userIdOf(row) || "") === membershipUserId(membership)) ||
          users.find((row) => Boolean(row.email && membership.email && row.email.toLowerCase() === membership.email.toLowerCase()));

        const branch = branchMap.get(Number(membership.branchId));

        const fullName = respectfulName({
          title: user?.title || membership.title,
          fullName: user?.fullName || user?.name || membership.fullName,
          email: user?.email || membership.email,
        });

        const active =
          membership.active !== false &&
          membership.status !== "inactive" &&
          user?.active !== false &&
          user?.status !== "inactive";

        return {
          key: String(membership.id || membership.localId || `${membership.email}-${membership.branchId}`),
          user,
          membership,
          branch,
          title: user?.title || membership.title || "",
          fullName,
          email: normalizeEmail(user?.email || membership.email),
          phone: normalizePhone(user?.phone),
          branchName: branch?.name || `Branch #${membership.branchId || "Unknown"}`,
          branchId: Number(membership.branchId || branch?.id || 0) || undefined,
          active,
          mustChangePassword: Boolean(user?.mustChangePassword || membership.mustChangePassword),
          initials: initials(fullName),
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName) || a.fullName.localeCompare(b.fullName));
  }, [memberships, users, branchMap]);

  const filteredViews = useMemo(() => {
    const query = search.trim().toLowerCase();

    return branchAdminViews.filter((item) => {
      if (accessFilter === "active" && !item.active) return false;
      if (accessFilter === "inactive" && item.active) return false;
      if (accessFilter === "temporary" && !item.mustChangePassword) return false;

      if (!query) return true;

      return `
        ${item.fullName}
        ${item.email}
        ${item.phone}
        ${item.branchName}
        branch_admin
      `
        .toLowerCase()
        .includes(query);
    });
  }, [branchAdminViews, search, accessFilter]);

  const branchBreakdown = useMemo<Breakdown[]>(() => {
    return branches
      .map((branch) => ({
        name: branch.name || `Branch #${branch.id}`,
        count: branchAdminViews.filter((view) => view.branchId === branch.id).length,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [branches, branchAdminViews]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    return [
      {
        name: "Active",
        count: branchAdminViews.filter((view) => view.active).length,
      },
      {
        name: "Inactive",
        count: branchAdminViews.filter((view) => !view.active).length,
      },
      {
        name: "Temporary Password",
        count: branchAdminViews.filter((view) => view.mustChangePassword).length,
      },
    ].filter((item) => item.count > 0);
  }, [branchAdminViews]);

  const summary = useMemo(() => {
    const coveredBranches = new Set(
      branchAdminViews
        .filter((view) => view.branchId)
        .map((view) => view.branchId)
    );

    return {
      branches: branches.length,
      branchAdmins: branchAdminViews.length,
      active: branchAdminViews.filter((view) => view.active).length,
      inactive: branchAdminViews.filter((view) => !view.active).length,
      temporary: branchAdminViews.filter((view) => view.mustChangePassword).length,
      uncoveredBranches: branches.filter((branch) => branch.id && !coveredBranches.has(branch.id)).length,
    };
  }, [branches, branchAdminViews]);

  // ======================================================
  // FORM ACTIONS
  // ======================================================

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (key === "email") {
        const email = normalizeEmail(String(value));
        next.email = email;

        if (!current.temporaryPassword || current.temporaryPassword === tempPasswordFromEmail(current.email)) {
          next.temporaryPassword = tempPasswordFromEmail(email);
        }
      }

      return next;
    });

    setMessage("");
  };

  const openCreate = (branchId?: number) => {
    setForm({
      ...DEFAULT_FORM,
      branchId: branchId ? String(branchId) : "",
    });
    setMessage("");
    setDrawerOpen(true);
  };

  const openEdit = (item: BranchAdminView) => {
    setForm({
      membershipId: item.membership.id,
      userId: String(userIdOf(item.user) || ""),
      title: item.title || "",
      fullName: item.user?.fullName || item.user?.name || item.membership.fullName || item.fullName,
      email: item.email,
      phone: item.phone,
      branchId: item.branchId ? String(item.branchId) : "",
      active: item.active,
      temporaryPassword: item.user?.temporaryPassword || tempPasswordFromEmail(item.email),
    });

    setMessage("");
    setDrawerOpen(true);
  };

  const validate = () => {
    if (!form.branchId) return "Select the branch this branch admin will manage.";
    if (!form.fullName.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required because branch admins sign in with email and password.";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }

    if (!form.temporaryPassword.trim()) return "Temporary password is required.";

    const branchExists = branches.some((branch) => String(branch.id) === form.branchId);
    if (!branchExists) return "Selected branch does not belong to this school.";

    return "";
  };

  const buildBackendPayload = (): BackendBranchAdminPayload => {
    const email = normalizeEmail(form.email);
    const temporaryPassword = form.temporaryPassword.trim();

    return {
      accountId: accountId!,
      schoolId: Number(schoolId),
      branchId: Number(form.branchId),
      role: "branch_admin",
      title: form.title.trim() || undefined,
      fullName: form.fullName.trim(),
      name: form.fullName.trim(),
      email,
      phone: normalizePhone(form.phone) || undefined,

      // CRITICAL LOGIN FIX:
      // /auth/login checks the backend AppUser password hash.
      // Therefore the temporary password must be sent as `password`
      // when creating/updating the backend user.
      password: temporaryPassword,
      temporaryPassword,
      mustChangePassword: true,

      active: form.active,
      status: form.active ? "active" : "inactive",
      userId: form.userId || undefined,
      membershipId: form.membershipId,
    };
  };

  const saveAccess = async () => {
    const error = validate();

    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);

      const payload = buildBackendPayload();

      // BACKEND-AUTH-FIRST WRITE:
      // Do not create the login user only in Dexie. That would make /auth/login
      // say "invalid credentials" because the real backend AppUser would not exist.
      const response = await saveBackendBranchAdmin(payload);

      const user = pickBackendUser(response, payload);
      const membership = pickBackendMembership(response, {
        ...payload,
        userId: String(userIdOf(user) || payload.userId || ""),
      });

      await cacheAuthUserLocally({ user, payload });
      await cacheAuthMembershipLocally({ membership, user, payload });

      setDrawerOpen(false);
      await load();
    } catch (error: any) {
      console.error("Failed to save branch admin through backend auth:", error);
      setMessage(
        error?.message ||
          "Failed to save branch admin. Make sure the backend has a user creation endpoint that accepts email, password, role, schoolId and branchId."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleAccess = async (item: BranchAdminView) => {
    try {
      setSaving(true);

      const nextActive = !item.active;

      const payload: BackendBranchAdminPayload = {
        accountId: accountId!,
        schoolId: Number(schoolId),
        branchId: Number(item.branchId || item.membership.branchId),
        role: "branch_admin",
        title: item.title || item.user?.title || item.membership.title,
        fullName: item.user?.fullName || item.user?.name || item.membership.fullName || item.fullName,
        name: item.user?.name || item.user?.fullName || item.membership.fullName || item.fullName,
        email: normalizeEmail(item.email),
        phone: normalizePhone(item.phone),
        password: item.user?.temporaryPassword || tempPasswordFromEmail(item.email),
        temporaryPassword: item.user?.temporaryPassword || tempPasswordFromEmail(item.email),
        mustChangePassword: item.mustChangePassword,
        active: nextActive,
        status: nextActive ? "active" : "inactive",
        userId: String(userIdOf(item.user) || membershipUserId(item.membership) || ""),
        membershipId: item.membership.id,
      };

      // BACKEND-AUTH-FIRST STATUS CHANGE:
      // Toggle the real backend auth/membership status first. Local Dexie is updated
      // only after the backend accepts it.
      const response = await saveBackendBranchAdmin(payload);

      const user = pickBackendUser(response, {
        ...(item.user || {}),
        ...payload,
      });

      const membership = pickBackendMembership(response, {
        ...(item.membership || {}),
        ...payload,
        userId: String(userIdOf(user) || payload.userId || ""),
      });

      await cacheAuthUserLocally({ user, payload });
      await cacheAuthMembershipLocally({ membership, user, payload });

      await load();
    } catch (error: any) {
      console.error("Failed to toggle branch admin through backend auth:", error);
      alert(error?.message || "Failed to update branch admin access.");
    } finally {
      setSaving(false);
    }
  };


  const deleteAccess = async (item: BranchAdminView) => {
    const confirmed = window.confirm(
      `Remove branch-admin role for ${item.fullName} from ${item.branchName}?\n\nThis removes the role/membership, not just deactivates it.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      // BACKEND-AUTH-FIRST ROLE DELETE:
      // Remove the membership/role in the backend first. Local Dexie is only a cache.
      await deleteBackendBranchAdminRole(item);

      await removeAuthMembershipLocally(item);
      await load();
    } catch (error: any) {
      console.error("Failed to delete branch admin role through backend auth:", error);
      alert(
        error?.message ||
          "Failed to delete this branch-admin role. Make sure the backend exposes a membership delete route."
      );
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="susers-page" style={{ "--susers-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="susers-state-card">
          <div className="susers-spinner" />
          <h2>Opening school users...</h2>
          <p>Loading branches and branch-admin assignments.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="susers-page" style={{ "--susers-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="susers-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing school users.</p>
        </section>
      </main>
    );
  }

  if (!schoolId) {
    return (
      <main className="susers-page" style={{ "--susers-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="susers-state-card">
          <h2>Assigned school required</h2>
          <p>School admin users must be managed inside a locked school context.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="susers-page" style={{ "--susers-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="susers-hero">
        <div className="susers-hero-left">
          <div className="susers-hero-icon">👥</div>
          <div className="susers-title-wrap">
            <p>School Control</p>
            <h2>Users & Roles</h2>
            <span>{activeSchool?.name || "Assigned school"} · Branch admins only</span>
          </div>
        </div>

        <div className="susers-hero-actions">
          <button type="button" className="susers-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="susers-primary-btn" onClick={() => openCreate()}>
            Add Branch Admin
          </button>
        </div>
      </section>

      <section className="susers-context-grid">
        <article>
          <div className="susers-context-icon">🛡️</div>
          <div>
            <span>Hierarchy Rule</span>
            <strong>School admin → branch admin</strong>
            <p>School admin only creates branch-admin access. Branch admin manages lower roles inside their branch.</p>
          </div>
        </article>

        <article>
          <div className="susers-context-icon">🏫</div>
          <div>
            <span>Branch Coverage</span>
            <strong>{summary.uncoveredBranches} branch(es) without admin</strong>
            <p>Every active branch should have at least one active branch admin.</p>
          </div>
        </article>
      </section>

      <section className="susers-summary-grid">
        <SummaryCard label="Branches" value={summary.branches} icon="🏫" />
        <SummaryCard label="Branch Admins" value={summary.branchAdmins} icon="🛡️" />
        <SummaryCard label="Active" value={summary.active} icon="✅" positive />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⛔" warning={summary.inactive > 0} />
        <SummaryCard label="Temporary" value={summary.temporary} icon="🔑" warning={summary.temporary > 0} />
        <SummaryCard label="No Admin" value={summary.uncoveredBranches} icon="⚠️" warning={summary.uncoveredBranches > 0} />
      </section>

      <section className="susers-toolbar">
        <div className="susers-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{filteredViews.length} branch admin(s)</Chip>
      </section>

      <section className="susers-filter-card">
        <input
          placeholder="Search branch admin, email, phone, branch..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}>
          <option value="all">All Access</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
          <option value="temporary">Temporary Password</option>
        </select>

        <button type="button" onClick={() => openCreate()}>
          Add Branch Admin
        </button>
      </section>

      {viewMode === "analytics" && (
        <>
          <Breakdown title="Branch Admins by Branch" items={branchBreakdown} />
          <Breakdown title="Access Status" items={statusBreakdown} />
        </>
      )}

      {viewMode === "table" && (
        <section className="susers-table-card">
          <div className="susers-section-head">
            <div>
              <p>Access Register</p>
              <h3>Branch Admin Assignments</h3>
            </div>
            <Chip tone="blue">School Scoped</Chip>
          </div>

          <div className="susers-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Branch Admin</th>
                  <th>Email</th>
                  <th>Branch</th>
                  <th>Role</th>
                  <th>Password</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredViews.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <strong>{item.fullName}</strong>
                      <span>{item.phone || "No phone"}</span>
                    </td>
                    <td>{item.email}</td>
                    <td>{item.branchName}</td>
                    <td><Chip tone="purple">Branch Admin</Chip></td>
                    <td><Chip tone={item.mustChangePassword ? "orange" : "green"}>{item.mustChangePassword ? "Temporary" : "Changed"}</Chip></td>
                    <td><Chip tone={statusTone(item.active)}>{item.active ? "Active" : "Inactive"}</Chip></td>
                    <td>
                      <div className="susers-table-actions">
                        <button type="button" onClick={() => openEdit(item)}>Edit</button>
                        <button type="button" onClick={() => toggleAccess(item)}>
                          {item.active ? "Deactivate" : "Activate"}
                        </button>
                        <button type="button" className="danger" onClick={() => deleteAccess(item)}>
                          Delete Role
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!filteredViews.length && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyCard text="No branch admin matches the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="susers-section">
          <div className="susers-section-head">
            <div>
              <p>Access Register</p>
              <h3>Branch Admin Assignments</h3>
            </div>
            <Chip tone="gray">{filteredViews.length} branch admin(s)</Chip>
          </div>

          <div className="susers-list">
            {filteredViews.map((item) => (
              <article key={item.key} className="susers-card">
                <div className="susers-card-top">
                  <div className="susers-avatar">
                    {item.user?.photo ? <img src={item.user.photo} alt={item.fullName} /> : item.initials}
                  </div>

                  <div className="susers-card-main">
                    <h3>{item.fullName}</h3>
                    <p>{item.email} · {item.phone || "No phone"}</p>

                    <div className="susers-chip-row">
                      <Chip tone="purple">🛡️ Branch Admin</Chip>
                      <Chip tone={statusTone(item.active)}>{item.active ? "Active" : "Inactive"}</Chip>
                      <Chip tone={item.mustChangePassword ? "orange" : "green"}>
                        {item.mustChangePassword ? "Temp password" : "Password changed"}
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="susers-mini-grid">
                  <MiniStat label="Assigned Branch" value={item.branchName} />
                  <MiniStat label="Role" value="Branch Admin" />
                  <MiniStat label="Access" value={item.active ? "Active" : "Inactive"} />
                </div>

                <div className="susers-action-row">
                  <button type="button" onClick={() => openEdit(item)}>Edit Access</button>
                  <button type="button" onClick={() => toggleAccess(item)}>
                    {item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" className="danger" onClick={() => deleteAccess(item)}>
                    Delete Role
                  </button>
                </div>
              </article>
            ))}

            {!filteredViews.length && (
              <EmptyCard text="No branch admin matches the selected filters." />
            )}
          </div>
        </section>
      )}

      {viewMode !== "table" && branches.length > 0 && (
        <section className="susers-section">
          <div className="susers-section-head">
            <div>
              <p>Branch Coverage</p>
              <h3>Branches Without Admin</h3>
            </div>
            <Chip tone={summary.uncoveredBranches > 0 ? "orange" : "green"}>
              {summary.uncoveredBranches} uncovered
            </Chip>
          </div>

          <div className="susers-branch-grid">
            {branches
              .filter((branch) => !branchAdminViews.some((view) => view.branchId === branch.id && view.active))
              .map((branch) => (
                <article key={branch.id} className="susers-branch-card">
                  <div>
                    <strong>{branch.name || `Branch #${branch.id}`}</strong>
                    <span>{branch.location || branch.code || "No location"}</span>
                  </div>
                  <button type="button" onClick={() => openCreate(branch.id)}>
                    Assign Admin
                  </button>
                </article>
              ))}

            {!summary.uncoveredBranches && (
              <EmptyCard text="All active branches currently have at least one active branch admin." />
            )}
          </div>
        </section>
      )}

      {drawerOpen && (
        <div className="susers-drawer-layer">
          <button type="button" className="susers-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="susers-drawer">
            <div className="susers-drawer-head">
              <div>
                <p>{form.membershipId ? "Edit Branch Admin" : "Add Branch Admin"}</p>
                <h2>Branch Admin Access</h2>
                <span>{activeSchool?.name || "Assigned school"}</span>
              </div>

              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {message && <section className="susers-message">{message}</section>}

            <section className="susers-form-card">
              <div className="susers-section-head">
                <div>
                  <p>Hierarchy</p>
                  <h3>Assign one branch</h3>
                </div>
              </div>

              <div className="susers-note">
                <strong>School admin role limit</strong>
                <span>This page creates branch-admin access only. Lower roles are managed by each branch admin.</span>
              </div>

              <div className="susers-form-grid">
                <label className="wide">
                  <span>Assigned Branch</span>
                  <select value={form.branchId} onChange={(event) => updateForm("branchId", event.target.value)}>
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name || `Branch #${branch.id}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Title</span>
                  <select value={form.title} onChange={(event) => updateForm("title", event.target.value)}>
                    {TITLES.map((title) => (
                      <option key={title || "none"} value={title}>
                        {title || "No title"}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Full Name</span>
                  <input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} />
                </label>

                <label>
                  <span>Email</span>
                  <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="admin@example.com" />
                </label>

                <label>
                  <span>Phone</span>
                  <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="024 000 0000" />
                </label>

                <label>
                  <span>Temporary Password</span>
                  <input value={form.temporaryPassword} onChange={(event) => updateForm("temporaryPassword", event.target.value)} />
                </label>
              </div>
            </section>

            <section className="susers-form-card">
              <label className="susers-switch-row">
                <div>
                  <strong>Active access</strong>
                  <span>Inactive branch admins remain recorded but cannot use this branch role.</span>
                </div>

                <button
                  type="button"
                  className={`susers-switch ${form.active ? "on" : ""}`}
                  onClick={() => updateForm("active", !form.active)}
                  aria-pressed={form.active}
                >
                  <span />
                </button>
              </label>
            </section>

            <div className="susers-drawer-actions">
              <button type="button" className="susers-ghost-btn" onClick={() => setDrawerOpen(false)}>
                Cancel
              </button>
              <button type="button" className="susers-primary-btn" disabled={saving} onClick={saveAccess}>
                {saving ? "Saving..." : "Save Access"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`susers-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="susers-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`susers-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="susers-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="susers-empty-card">
      <div className="susers-empty-icon">👥</div>
      <h3>No records found</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({ title, items }: { title: string; items: Breakdown[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="susers-section">
      <div className="susers-section-head">
        <div>
          <p>Analytics</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="susers-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="susers-breakdown-card">
            <div className="susers-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone="blue">{item.count}</Chip>
            </div>

            <div className="susers-bar-track">
              <div style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>

            <div className="susers-chip-row">
              <Chip tone="gray">{total ? Math.round((item.count / total) * 100) : 0}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available.`} />}
      </div>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes susersSpin { to { transform: rotate(360deg); } }

.susers-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--susers-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.susers-page *,
.susers-page *::before,
.susers-page *::after {
  box-sizing: border-box;
}

.susers-page button,
.susers-page input,
.susers-page select {
  font: inherit;
  max-width: 100%;
}

.susers-page input,
.susers-page select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.susers-page input:focus,
.susers-page select:focus {
  border-color: var(--susers-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--susers-primary) 12%, transparent);
}

.susers-page button:disabled {
  opacity: .58;
  cursor: not-allowed;
}

.susers-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.susers-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.susers-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.susers-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--susers-primary) 18%, transparent);
  border-top-color: var(--susers-primary);
  animation: susersSpin .8s linear infinite;
}

.susers-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--susers-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--susers-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.susers-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.susers-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--susers-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--susers-primary) 28%, transparent);
  font-size: 22px;
}

.susers-title-wrap {
  min-width: 0;
}

.susers-title-wrap p,
.susers-title-wrap h2,
.susers-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.susers-title-wrap p {
  margin: 0 0 2px;
  color: var(--susers-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.susers-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.susers-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.susers-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.susers-ghost-btn,
.susers-primary-btn,
.susers-action-row button,
.susers-table-actions button,
.susers-drawer-actions button,
.susers-filter-card button,
.susers-branch-card button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.susers-ghost-btn,
.susers-action-row button,
.susers-table-actions button,
.susers-filter-card button,
.susers-branch-card button {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.susers-primary-btn {
  border: 0;
  background: var(--susers-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--susers-primary) 25%, transparent);
}

.susers-table-actions button.danger,
.susers-action-row button.danger {
  border-color: rgba(239,68,68,.22);
  background: rgba(239,68,68,.12);
  color: #ef4444;
}

.susers-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.susers-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--susers-primary) 10%, var(--card-bg, var(--surface, #fff))), var(--card-bg, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.susers-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--susers-primary);
  color: #fff;
  font-size: 20px;
}

.susers-context-grid article > div:last-child {
  min-width: 0;
}

.susers-context-grid span {
  display: block;
  color: var(--susers-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.susers-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.susers-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.susers-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.susers-summary-card,
.susers-toolbar,
.susers-filter-card,
.susers-table-card,
.susers-card,
.susers-breakdown-card,
.susers-empty-card,
.susers-form-card,
.susers-branch-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.susers-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.susers-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff)));
}

.susers-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff)));
}

.susers-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--susers-primary) 12%, var(--surface, #fff));
}

.susers-summary-card div:last-child {
  min-width: 0;
}

.susers-summary-card strong,
.susers-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.susers-summary-card strong {
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.susers-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.susers-toolbar,
.susers-filter-card,
.susers-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.susers-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.susers-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--susers-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.susers-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.susers-view-tabs button.active {
  background: var(--susers-primary);
  color: #fff;
}

.susers-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.susers-section {
  margin-top: 16px;
}

.susers-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.susers-section-head p {
  margin: 0;
  color: var(--susers-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.susers-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.susers-list,
.susers-breakdown-grid,
.susers-branch-grid {
  display: grid;
  gap: 10px;
}

.susers-card,
.susers-breakdown-card,
.susers-empty-card,
.susers-form-card,
.susers-branch-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.susers-card {
  background:
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--susers-primary) 4%, var(--card-bg, #fff)));
}

.susers-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.susers-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--susers-primary);
  color: #fff;
  font-size: 20px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.susers-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.susers-card-main {
  min-width: 0;
  flex: 1;
}

.susers-card-main h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.susers-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.susers-chip-row,
.susers-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.susers-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.susers-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.susers-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.susers-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.susers-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.susers-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.susers-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.susers-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.susers-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.susers-mini-stat strong,
.susers-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.susers-mini-stat strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
  text-transform: capitalize;
}

.susers-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.susers-action-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.susers-action-row button {
  width: 100%;
}

.susers-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.susers-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.susers-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.susers-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--susers-primary);
}

.susers-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.susers-table-scroll table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, #fff));
}

.susers-table-scroll th,
.susers-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
  color: var(--text, #111111);
  font-size: 13px;
}

.susers-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--susers-primary) 6%, var(--card-bg, #fff));
}

.susers-table-scroll td strong,
.susers-table-scroll td span {
  display: block;
}

.susers-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.susers-table-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.susers-table-actions button {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.susers-branch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.susers-branch-card div {
  min-width: 0;
}

.susers-branch-card strong,
.susers-branch-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.susers-branch-card strong {
  color: var(--text, #111111);
  font-size: 14px;
  font-weight: 1000;
}

.susers-branch-card span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.susers-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.susers-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--susers-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.susers-empty-card h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
}

.susers-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.susers-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.susers-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.susers-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 660px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg, #f7f8fb);
  color: var(--text, #111111);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.susers-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--bg, #f7f8fb);
}

.susers-drawer-head div {
  min-width: 0;
}

.susers-drawer-head p {
  margin: 0;
  color: var(--susers-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.susers-drawer-head h2,
.susers-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.susers-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.susers-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.susers-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #111111);
  font-weight: 1000;
  cursor: pointer;
}

.susers-message {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(245,158,11,.14);
  color: #f59e0b;
  font-size: 13px;
  font-weight: 900;
}

.susers-note {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--susers-primary) 8%, var(--surface, #fff));
  border: 1px solid color-mix(in srgb, var(--susers-primary) 18%, var(--border, rgba(0,0,0,.10)));
}

.susers-note strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.susers-note span {
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.susers-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}

.susers-form-grid label,
.susers-form-card label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.susers-form-grid label span,
.susers-form-card label > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.susers-form-grid .wide {
  grid-column: 1 / -1;
}

.susers-switch-row {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.susers-switch-row div {
  min-width: 0;
}

.susers-switch-row strong {
  display: block;
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.susers-switch-row span {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 750;
}

.susers-switch {
  width: 58px;
  height: 34px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  padding: 4px;
  background: color-mix(in srgb, var(--muted, #64748b) 25%, transparent);
  cursor: pointer;
}

.susers-switch span {
  width: 26px;
  height: 26px;
  display: block;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15,23,42,.16);
  transition: transform .18s ease;
}

.susers-switch.on {
  background: var(--susers-primary);
}

.susers-switch.on span {
  transform: translateX(24px);
}

.susers-drawer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

@media (min-width: 680px) {
  .susers-page {
    padding: calc(12px * var(--local-density-scale, 1));
  }

  .susers-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .susers-filter-card {
    grid-template-columns: minmax(0, 1fr) 220px 190px;
  }

  .susers-context-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .susers-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .susers-page {
    padding: calc(16px * var(--local-density-scale, 1));
  }

  .susers-summary-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .susers-list,
  .susers-breakdown-grid,
  .susers-branch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .susers-page {
    padding: calc(6px * var(--local-density-scale, 1));
  }

  .susers-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .susers-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .susers-ghost-btn,
  .susers-primary-btn {
    width: 100%;
  }

  .susers-summary-grid {
    gap: 6px;
  }

  .susers-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .susers-summary-card strong {
    font-size: 16px;
  }

  .susers-toolbar {
    align-items: stretch;
    flex-direction: column;
    border-radius: 20px;
  }

  .susers-view-tabs {
    width: 100%;
  }

  .susers-card,
  .susers-empty-card,
  .susers-breakdown-card,
  .susers-form-card,
  .susers-branch-card {
    border-radius: 20px;
    padding: 11px;
  }

  .susers-avatar {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
  }

  .susers-mini-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .susers-action-row,
  .susers-drawer-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .susers-branch-card {
    align-items: stretch;
    flex-direction: column;
  }

  .susers-branch-card button {
    width: 100%;
  }

  .susers-drawer {
    width: min(96vw, 660px);
    padding: 12px;
  }
}
`;
