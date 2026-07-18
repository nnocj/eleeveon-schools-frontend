"use client";

/**
 * app/owner/OwnerUsers.tsx
 * ---------------------------------------------------------
 * OWNER — USERS & ROLES
 * ---------------------------------------------------------
 *
 * Owner-wide access control:
 * - Owner can create/edit school_admin, branch_admin and accountant access.
 * - Owner can select the school and branch where a user is assigned.
 * - School admin access is scoped to a school; branch selection is optional.
 * - Branch admin/accountant access is scoped to a school + branch.
 *
 * Backend-auth-first:
 * - AppUser/UserMembership access records are backend-owned.
 * - Writes go to backend first through account/membership endpoints.
 * - Dexie is updated only as local cache after backend success.
 *
 * Workspace-session aligned:
 * - Resolves account from eleeveon_open_workspace first.
 * - Falls back to stored activeMembership, ActiveMembershipProvider,
 *   AccountContext, settings, then storage.
 * - Prevents stale owner users/roles data after role/workspace switching.
 *
 * Golden UI:
 * - Compact search row: search + add + filters + more.
 * - Cards/table views.
 * - Filters live in sheet.
 * - Drawer form for create/edit access.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveMembership } from "../context/active-membership-context";

import { db, type Branch, type School } from "../lib/db/db";
import { apiRequest } from "../lib/platformApi";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "cards" | "table";
type AccessFilter = "all" | "enabled" | "inactive";
type OwnerAssignableRole = "school_admin" | "branch_admin" | "accountant";
type RoleFilter = "all" | OwnerAssignableRole;

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  isDeleted?: boolean;
  active?: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

type AppUser = TenantRow & {
  id?: string | number;
  localId?: string | number;
  title?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  role?: string;
  status?: string;
  photo?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  version?: number;
  synced?: any;
};

type UserMembership = TenantRow & {
  id?: string | number;
  localId?: string | number;
  userId?: number | string | null;
  userLocalId?: string | number | null;
  accountUserId?: string | number | null;
  title?: string;
  email?: string;
  fullName?: string;
  role?: string;
  status?: string;
  mustChangePassword?: boolean;
  createdAt?: number | string;
  updatedAt?: number | string;
  version?: number;
  synced?: any;
};

type Candidate = {
  key: string;
  role: OwnerAssignableRole;
  user?: AppUser;
  membership?: UserMembership;
  school?: School;
  branch?: Branch;
  title?: string;
  fullName: string;
  email: string;
  phone: string;
  subLabel: string;
  enabled: boolean;
  inactive: boolean;
  hasLogin: boolean;
  hasMembership: boolean;
  mustChangePassword: boolean;
};

type FormState = {
  membershipId?: string | number;
  userId: string;
  title: string;
  fullName: string;
  email: string;
  phone: string;
  role: OwnerAssignableRole;
  schoolId: string;
  branchId: string;
  active: boolean;
  temporaryPassword: string;
};

// ======================================================
// CONSTANTS
// ======================================================

const ROLES: { value: OwnerAssignableRole; label: string; icon: string; helper: string; branchRequired: boolean }[] = [
  {
    value: "school_admin",
    label: "School Admin",
    icon: "🏫",
    helper: "School-level administrator across selected school operations.",
    branchRequired: false,
  },
  {
    value: "branch_admin",
    label: "Branch Admin",
    icon: "🏢",
    helper: "Branch-level administrator for one selected campus.",
    branchRequired: true,
  },
  {
    value: "accountant",
    label: "Accountant",
    icon: "💰",
    helper: "Finance access for a selected school branch.",
    branchRequired: true,
  },
];

const TITLES = ["", "Mr.", "Mrs.", "Miss", "Ms.", "Dr.", "Prof.", "Rev.", "Pastor", "Imam", "Alhaji", "Hajia", "Nana"];

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const DEFAULT_FORM: FormState = {
  userId: "",
  title: "",
  fullName: "",
  email: "",
  phone: "",
  role: "school_admin",
  schoolId: "",
  branchId: "",
  active: true,
  temporaryPassword: "",
};

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
}

function selectedWorkspaceAccountId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  accountId?: string | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstText(
    args.openWorkspace?.accountId,
    membership?.accountId,
    args.accountId,
    args.settings?.accountId,
    safeStorageRead("accountId"),
    safeStorageRead("eleeveon_account_id")
  );
}

function idOf(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function num(value?: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeEmail(email?: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone?: string) {
  return String(phone || "").trim().replace(/\s+/g, " ");
}

function tempPasswordFromEmail(email: string) {
  const prefix = normalizeEmail(email).split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
  return `${prefix || "user"}@123`;
}

function sameAccount(row: TenantRow, accountId?: string | null) {
  if (!row || row.isDeleted) return false;
  return !row.accountId || row.accountId === accountId;
}

function sameSchool(row: TenantRow, accountId?: string | null, schoolId?: number | null) {
  if (!sameAccount(row, accountId)) return false;
  if (!schoolId) return true;
  return Number(row.schoolId || 0) === Number(schoolId);
}

function sameBranch(row: TenantRow, accountId?: string | null, schoolId?: number | null, branchId?: number | null) {
  if (!sameSchool(row, accountId, schoolId)) return false;
  if (!branchId) return true;
  return Number(row.branchId || 0) === Number(branchId);
}

function roleLabel(role?: string) {
  return ROLES.find((item) => item.value === role)?.label || String(role || "No role").replaceAll("_", " ");
}

function roleIcon(role?: string) {
  return ROLES.find((item) => item.value === role)?.icon || "👤";
}

function roleTone(role?: string): "green" | "blue" | "orange" | "gray" | "red" | "purple" {
  if (role === "school_admin") return "blue";
  if (role === "branch_admin") return "purple";
  if (role === "accountant") return "green";
  return "gray";
}

function initials(name: string) {
  return (
    String(name || "User")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function respectfulName(input: { title?: string; fullName?: string; name?: string; email?: string }) {
  const title = String(input.title || "").trim();
  const name = String(input.fullName || input.name || input.email || "User").trim();
  if (!title) return name;

  const normalizedTitle = title.replace(/\.$/, "").toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith(`${normalizedTitle} `) || lowerName.startsWith(`${normalizedTitle}. `)) return name;
  return `${title} ${name}`;
}

function userIdOf(user?: AppUser) {
  return user?.id || user?.localId;
}

function membershipUserId(membership?: UserMembership) {
  return String(membership?.userLocalId || membership?.userId || membership?.accountUserId || "");
}

function authTableId(row?: any) {
  return row?.id ?? row?.localId;
}

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  return table?.toArray ? table.toArray() : [];
}

function isStringPrimaryKeyTable(table: any) {
  const primaryKey = table?.schema?.primKey;
  return primaryKey?.keyPath === "id" && primaryKey?.auto === false;
}

function makeLocalAuthId(prefix: string) {
  const safePrefix = String(prefix || "auth").replace(/[^a-zA-Z0-9_-]/g, "");
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}_${random}`;
}

function dateishNowForAuthTable(table: any) {
  return isStringPrimaryKeyTable(table) ? new Date().toISOString() : now();
}

function accessState(user?: AppUser, membership?: UserMembership) {
  const hasLogin = Boolean(user?.id || user?.localId || user?.email);
  const hasMembership = Boolean(membership?.id || membership?.localId || membership?.role);
  const userInactive = user?.active === false || user?.status === "inactive";
  const membershipInactive = membership?.active === false || membership?.status === "inactive";
  const inactive = (hasLogin && userInactive) || (hasMembership && membershipInactive);
  const enabled = hasLogin && hasMembership && !inactive;

  return {
    hasLogin,
    hasMembership,
    inactive,
    enabled,
    mustChangePassword: Boolean(user?.mustChangePassword || membership?.mustChangePassword),
  };
}

async function authApi<T = any>(
  endpoint: string,
  options: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: any }
): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, {
      method: options.method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    } as any);
  } catch (error: any) {
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
  attempts: Array<{ endpoint: string; method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: any }>
): Promise<T> {
  let lastError: any = null;

  for (const attempt of attempts) {
    try {
      return await authApi<T>(attempt.endpoint, { method: attempt.method, body: attempt.body });
    } catch (error: any) {
      lastError = error;
      if (!isEndpointMissing(error)) break;
    }
  }

  throw lastError || new Error("No auth endpoint accepted the request.");
}

function arrayFromAny(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function membershipProfileKey(membership: Partial<UserMembership>) {
  return `email:${normalizeEmail(membership.email)}`;
}

function membershipLogicalKey(membership: Partial<UserMembership>) {
  return [
    String(membership.accountId || ""),
    String(membership.schoolId || ""),
    String(membership.branchId || ""),
    String(membership.role || ""),
    String(membership.userId || membership.userLocalId || membership.accountUserId || ""),
    membershipProfileKey(membership),
  ].join("|");
}

function dedupeMemberships(rows: UserMembership[]) {
  const byExactId = new Map<string, UserMembership>();
  const withoutRealId: UserMembership[] = [];

  rows.filter(Boolean).forEach((row) => {
    const id = String(authTableId(row) || "").trim();

    if (id && !id.startsWith("membership_")) {
      byExactId.set(id, { ...(byExactId.get(id) || {}), ...row });
      return;
    }

    withoutRealId.push(row);
  });

  const finalRows = new Map<string, UserMembership>();

  [...byExactId.values(), ...withoutRealId].forEach((row) => {
    const id = String(authTableId(row) || "").trim();
    const key = id && !id.startsWith("membership_") ? `id:${id}` : `logical:${membershipLogicalKey(row)}`;
    const existing = finalRows.get(key);

    if (!existing) {
      finalRows.set(key, row);
      return;
    }

    const existingId = String(authTableId(existing) || "");
    const rowHasRealId = id && !id.startsWith("membership_");
    const existingHasRealId = existingId && !existingId.startsWith("membership_");

    if (rowHasRealId && !existingHasRealId) {
      finalRows.set(key, row);
      return;
    }

    if ((row.active !== false && existing.active === false) || Number(row.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
      finalRows.set(key, { ...existing, ...row });
    }
  });

  const logicalRows = new Map<string, UserMembership>();

  [...finalRows.values()].forEach((row) => {
    const key = membershipLogicalKey(row);
    const existing = logicalRows.get(key);
    if (!existing) {
      logicalRows.set(key, row);
      return;
    }

    const rowId = String(authTableId(row) || "");
    const existingId = String(authTableId(existing) || "");
    const rowHasRealId = rowId && !rowId.startsWith("membership_");
    const existingHasRealId = existingId && !existingId.startsWith("membership_");

    if (rowHasRealId && !existingHasRealId) logicalRows.set(key, row);
    else if (!existingHasRealId || Number(row.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
      logicalRows.set(key, { ...existing, ...row });
    }
  });

  return [...logicalRows.values()];
}

function membershipMatchesForm(membership: Partial<UserMembership>, form: FormState, userId: string) {
  if (!membership || membership.role !== form.role) return false;
  if (String(membershipUserId(membership as UserMembership) || membership.userId || "") !== String(userId)) return false;
  if (Number(membership.schoolId) !== Number(form.schoolId || 0)) return false;

  const roleRequiresBranch = ROLES.find((role) => role.value === form.role)?.branchRequired;
  if (roleRequiresBranch && Number(membership.branchId) !== Number(form.branchId || 0)) return false;

  return normalizeEmail(membership.email) === normalizeEmail(form.email) || Boolean(userId);
}

function extractBackendUsersAndMemberships(remote: any) {
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

  const users = userCandidates.flatMap(arrayFromAny).filter(Boolean) as AppUser[];

  const topLevelMemberships = [
    remote?.memberships,
    remote?.userMemberships,
    remote?.data?.memberships,
    remote?.data?.userMemberships,
  ]
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
      mustChangePassword: membership?.mustChangePassword ?? user?.mustChangePassword,
    })) as UserMembership[];
  });

  const syntheticMemberships = users
    .filter((user: any) => {
      const role = String(user?.role || "").toLowerCase();
      const hasNested = nestedMemberships.some(
        (membership) => String(membership.userId || "") === String(userIdOf(user) || "") && String(membership.role || "") === role
      );
      return ROLES.some((item) => item.value === role) && !hasNested;
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
      role: user?.role,
      active: user?.active !== false && user?.status !== "inactive",
      status: user?.active === false || user?.status === "inactive" ? "inactive" : "active",
      mustChangePassword: Boolean(user?.mustChangePassword),
      isDeleted: Boolean(user?.isDeleted),
    })) as UserMembership[];

  return {
    users,
    memberships: dedupeMemberships([...topLevelMemberships, ...nestedMemberships, ...syntheticMemberships]),
  };
}

async function fetchBackendOwnerUsers(args: { schoolId?: number; branchId?: number }) {
  const params = new URLSearchParams();

  if (args.schoolId) params.set("schoolId", String(args.schoolId));
  if (args.branchId) params.set("branchId", String(args.branchId));

  const suffix = params.toString() ? `?${params.toString()}` : "";

  return firstWorkingAuthCall<any>([
    { endpoint: `/accounts/me/users${suffix}`, method: "GET" },
    { endpoint: `/accounts/users${suffix}`, method: "GET" },
    { endpoint: `/owner/users${suffix}`, method: "GET" },
  ]);
}

function cleanCreateAccountUserDto(form: FormState) {
  return {
    fullName: form.fullName.trim(),
    email: normalizeEmail(form.email),
    phone: normalizePhone(form.phone) || undefined,
    password: form.temporaryPassword.trim(),
    role: form.role,
    schoolId: Number(form.schoolId),
    branchId: form.branchId ? Number(form.branchId) : undefined,
  };
}

function cleanUpdateAccountUserDto(form: FormState) {
  return {
    fullName: form.fullName.trim(),
    phone: normalizePhone(form.phone) || undefined,
    role: form.role,
  };
}

function cleanMembershipDto(form: FormState, userId: string) {
  return {
    userId,
    role: form.role,
    schoolId: Number(form.schoolId),
    branchId: form.branchId ? Number(form.branchId) : null,
    active: form.active,
  };
}

async function saveBackendOwnerAccess(args: {
  form: FormState;
  users: AppUser[];
  memberships: UserMembership[];
}) {
  const email = normalizeEmail(args.form.email);
  let user =
    (args.form.userId ? args.users.find((row) => String(userIdOf(row) || "") === String(args.form.userId)) : undefined) ||
    args.users.find((row) => normalizeEmail(row.email) === email);

  let membershipsFromCreatedUser: UserMembership[] = [];

  if (user && userIdOf(user)) {
    user = await firstWorkingAuthCall<AppUser>([
      {
        endpoint: `/accounts/users/${encodeURIComponent(String(userIdOf(user)))}`,
        method: "PATCH",
        body: cleanUpdateAccountUserDto(args.form),
      },
      {
        endpoint: `/accounts/me/users/${encodeURIComponent(String(userIdOf(user)))}`,
        method: "PATCH",
        body: cleanUpdateAccountUserDto(args.form),
      },
    ]);

    membershipsFromCreatedUser = extractBackendUsersAndMemberships(user).memberships;
  } else {
    try {
      user = await firstWorkingAuthCall<AppUser>([
        { endpoint: "/accounts/me/users", method: "POST", body: cleanCreateAccountUserDto(args.form) },
        { endpoint: "/accounts/users", method: "POST", body: cleanCreateAccountUserDto(args.form) },
        { endpoint: "/owner/users", method: "POST", body: cleanCreateAccountUserDto(args.form) },
      ]);

      membershipsFromCreatedUser = extractBackendUsersAndMemberships(user).memberships;
    } catch (error: any) {
      const message = endpointErrorMessage(error).toLowerCase();
      if (!message.includes("already registered") && !message.includes("already exists")) throw error;

      const remote = await fetchBackendOwnerUsers({
        schoolId: num(args.form.schoolId),
        branchId: num(args.form.branchId),
      });

      const normalized = extractBackendUsersAndMemberships(remote);
      user = normalized.users.find((row) => normalizeEmail(row.email) === email);
      membershipsFromCreatedUser = normalized.memberships;
      if (!user) throw error;
    }
  }

  const userId = String(userIdOf(user) || "");
  if (!userId) throw new Error("The backend did not return a valid user id.");

  const allKnownMemberships = dedupeMemberships([
    ...args.memberships,
    ...membershipsFromCreatedUser,
    ...extractBackendUsersAndMemberships(user).memberships,
  ]);

  const matchingMembership =
    (args.form.membershipId
      ? allKnownMemberships.find((membership) => String(authTableId(membership) || "") === String(args.form.membershipId))
      : undefined) || allKnownMemberships.find((membership) => membershipMatchesForm(membership, args.form, userId));

  let membership: UserMembership;

  if (matchingMembership?.id || matchingMembership?.localId) {
    membership = await firstWorkingAuthCall<UserMembership>([
      {
        endpoint: `/memberships/${encodeURIComponent(String(authTableId(matchingMembership)))}`,
        method: "PATCH",
        body: cleanMembershipDto(args.form, userId),
      },
      {
        endpoint: `/user-memberships/${encodeURIComponent(String(authTableId(matchingMembership)))}`,
        method: "PATCH",
        body: cleanMembershipDto(args.form, userId),
      },
    ]);
  } else {
    membership = await firstWorkingAuthCall<UserMembership>([
      { endpoint: "/memberships", method: "POST", body: cleanMembershipDto(args.form, userId) },
      { endpoint: "/user-memberships", method: "POST", body: cleanMembershipDto(args.form, userId) },
    ]);
  }

  if (args.form.active === false && membership?.id) {
    membership = await firstWorkingAuthCall<UserMembership>([
      {
        endpoint: `/memberships/${encodeURIComponent(String(membership.id))}`,
        method: "PATCH",
        body: { active: false, status: "inactive" },
      },
      {
        endpoint: `/user-memberships/${encodeURIComponent(String(membership.id))}`,
        method: "PATCH",
        body: { active: false, status: "inactive" },
      },
    ]);
  }

  return { user, membership };
}

async function cacheAuthUserLocally(args: { user: AppUser; form: FormState; accountId: string }) {
  const table = getTable<AppUser>("appUsers", "accountUsers", "users");
  if (!table) return;

  const id = userIdOf(args.user) || makeLocalAuthId("user");
  const timestamp = dateishNowForAuthTable(table);

  const payload: Partial<AppUser> = {
    ...args.user,
    id,
    accountId: args.accountId,
    schoolId: Number(args.form.schoolId),
    branchId: args.form.branchId ? Number(args.form.branchId) : null,
    title: args.form.title.trim() || args.user.title,
    fullName: args.form.fullName.trim(),
    name: args.form.fullName.trim(),
    email: normalizeEmail(args.form.email),
    phone: normalizePhone(args.form.phone) || undefined,
    role: args.form.role,
    active: args.form.active,
    status: args.form.active ? "active" : "inactive",
    temporaryPassword: args.form.temporaryPassword.trim(),
    password: args.form.temporaryPassword.trim(),
    mustChangePassword: true,
    isDeleted: false,
    updatedAt: timestamp as any,
  };

  const existing =
    (await table.get(id).catch(() => undefined)) ||
    (await table.where?.("email")?.equals?.(payload.email)?.first?.().catch(() => undefined));

  if (existing?.id || existing?.localId) {
    await table.update(authTableId(existing), { ...payload, version: Number(existing.version || 0) + 1 });
    return;
  }

  await table.add({ ...(isStringPrimaryKeyTable(table) ? { id } : {}), ...payload, createdAt: timestamp as any, version: 1 });
}

async function cacheAuthMembershipLocally(args: {
  membership: UserMembership;
  user: AppUser;
  form: FormState;
  accountId: string;
}) {
  const table = getTable<UserMembership>("userMemberships", "memberships");
  if (!table) return;

  const id = authTableId(args.membership) || args.form.membershipId || makeLocalAuthId("membership");
  const userId = String(userIdOf(args.user) || args.membership.userId || "");
  const timestamp = dateishNowForAuthTable(table);

  const payload: Partial<UserMembership> = {
    ...args.membership,
    id,
    accountId: args.accountId,
    schoolId: Number(args.form.schoolId),
    branchId: args.form.branchId ? Number(args.form.branchId) : null,
    userId,
    userLocalId: null,
    accountUserId: null,
    title: args.form.title.trim() || undefined,
    fullName: args.form.fullName.trim(),
    email: normalizeEmail(args.form.email),
    role: args.form.role,
    active: args.form.active,
    status: args.form.active ? "active" : "inactive",
    mustChangePassword: true,
    isDeleted: false,
    updatedAt: timestamp as any,
  };

  const allLocalRows: UserMembership[] = table?.toArray ? await table.toArray().catch(() => []) : [];
  const existing =
    (await table.get(id).catch(() => undefined)) ||
    allLocalRows.find((membership) => membershipMatchesForm(membership, args.form, userId));

  if (existing?.id || existing?.localId) {
    await table.update(authTableId(existing), { ...payload, id: authTableId(existing), version: Number(existing.version || 0) + 1 });
    return;
  }

  await table.add({ ...(isStringPrimaryKeyTable(table) ? { id } : {}), ...payload, createdAt: timestamp as any, version: 1 });
}

async function deleteBackendMembership(candidate: Candidate) {
  const membershipId = String(authTableId(candidate.membership) || "").trim();
  if (!membershipId) throw new Error("Missing membership id for this access role.");

  return firstWorkingAuthCall<any>([
    { endpoint: `/memberships/${encodeURIComponent(membershipId)}`, method: "DELETE" },
    { endpoint: `/user-memberships/${encodeURIComponent(membershipId)}`, method: "DELETE" },
    { endpoint: `/accounts/memberships/${encodeURIComponent(membershipId)}`, method: "DELETE" },
    { endpoint: `/accounts/user-memberships/${encodeURIComponent(membershipId)}`, method: "DELETE" },
  ]);
}

async function removeAuthAccessLocally(candidate: Candidate) {
  const membershipTable = getTable<UserMembership>("userMemberships", "memberships");
  const userTable = getTable<AppUser>("appUsers", "accountUsers", "users");
  const membershipId = authTableId(candidate.membership);
  const userId = userIdOf(candidate.user) || membershipUserId(candidate.membership);

  if (membershipTable && membershipId) {
    await membershipTable.delete(membershipId).catch((error: any) => console.warn("Failed to remove local membership cache:", error));
  }

  if (userTable && userId && membershipTable?.toArray) {
    const remaining = await membershipTable.toArray();
    const hasOtherRole = remaining.some((membership: UserMembership) => {
      const sameUser = String(membershipUserId(membership)) === String(userId);
      const sameMembership = String(authTableId(membership) || "") === String(membershipId || "");
      return sameUser && !sameMembership && membership.isDeleted !== true;
    });

    if (!hasOtherRole) {
      await userTable.delete(userId).catch((error: any) => console.warn("Failed to remove local user cache:", error));
    }
  }
}

// ======================================================
// COMPONENT
// ======================================================

export default function OwnerUsers() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const selectedAccountId = selectedWorkspaceAccountId({
    openWorkspace,
    activeMembership: activeMembership as any,
    accountId,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !selectedAccountId) router.replace("/login");
  }, [accountLoading, authenticated, selectedAccountId, router]);

  const schoolMap = useMemo(() => new Map(schools.map((school) => [Number(school.id), school])), [schools]);
  const branchMap = useMemo(() => new Map(branches.map((branch) => [Number(branch.id), branch])), [branches]);

  const branchesForFormSchool = useMemo(() => {
    const selectedSchoolId = Number(form.schoolId || 0);
    if (!selectedSchoolId) return [];
    return branches.filter((branch) => Number(branch.schoolId) === selectedSchoolId);
  }, [branches, form.schoolId]);

  const clearData = () => {
    setSchools([]);
    setBranches([]);
    setUsers([]);
    setMemberships([]);
  };

  const load = async () => {
    if (!authenticated || !selectedAccountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [schoolRows, branchRows] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
      ]);

      const activeSchools = schoolRows
        .filter((row: any) => sameAccount(row, selectedAccountId) && row.active !== false && row.isDeleted !== true)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      const activeBranches = branchRows
        .filter((row: any) => sameAccount(row, selectedAccountId) && row.active !== false && row.isDeleted !== true)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      let userRows: AppUser[] = [];
      let membershipRows: UserMembership[] = [];

      try {
        const remote = await fetchBackendOwnerUsers({});
        const normalized = extractBackendUsersAndMemberships(remote);
        userRows = normalized.users;
        membershipRows = dedupeMemberships(normalized.memberships);

        for (const membership of membershipRows) {
          if (!ROLES.some((role) => role.value === membership.role)) continue;
          if (!sameAccount(membership, selectedAccountId)) continue;

          const user =
            userRows.find((row) => String(userIdOf(row) || "") === String(membership.userId || "")) ||
            userRows.find((row) => Boolean(row.email && membership.email && normalizeEmail(row.email) === normalizeEmail(membership.email)));

          if (!user) continue;

          const cacheForm: FormState = {
            membershipId: authTableId(membership),
            userId: String(userIdOf(user) || ""),
            title: membership.title || user.title || "",
            fullName: membership.fullName || user.fullName || user.name || membership.email || "Portal User",
            email: normalizeEmail(membership.email || user.email),
            phone: normalizePhone(user.phone),
            role: membership.role as OwnerAssignableRole,
            schoolId: membership.schoolId ? String(membership.schoolId) : "",
            branchId: membership.branchId ? String(membership.branchId) : "",
            active: membership.active !== false && membership.status !== "inactive" && user.active !== false && user.status !== "inactive",
            temporaryPassword: user.temporaryPassword || tempPasswordFromEmail(membership.email || user.email || ""),
          };

          await cacheAuthUserLocally({ user, form: cacheForm, accountId: selectedAccountId });
          await cacheAuthMembershipLocally({ membership, user, form: cacheForm, accountId: selectedAccountId });
        }
      } catch (remoteError) {
        console.warn("Owner backend auth user load failed; using local auth cache fallback:", remoteError);
        [userRows, membershipRows] = await Promise.all([
          tableToArray<AppUser>("appUsers", "accountUsers", "users"),
          tableToArray<UserMembership>("userMemberships", "memberships"),
        ]);
      }

      const scopedMemberships = dedupeMemberships(membershipRows)
        .map((membership) => {
          const linkedUser =
            userRows.find((user) => String(userIdOf(user) || "") === membershipUserId(membership)) ||
            userRows.find((user) => Boolean(user.email && membership.email && normalizeEmail(user.email) === normalizeEmail(membership.email)));

          return {
            ...membership,
            accountId: membership.accountId || linkedUser?.accountId || selectedAccountId,
            schoolId: membership.schoolId ?? linkedUser?.schoolId,
            branchId: membership.branchId ?? linkedUser?.branchId,
            email: membership.email || linkedUser?.email,
            fullName: membership.fullName || linkedUser?.fullName || linkedUser?.name,
            active: membership.active ?? linkedUser?.active,
            status: membership.status || linkedUser?.status,
            mustChangePassword: membership.mustChangePassword ?? linkedUser?.mustChangePassword,
          } as UserMembership;
        })
        .filter((row) => sameAccount(row, selectedAccountId) && ROLES.some((role) => role.value === row.role));

      const scopedUsers = userRows.filter((row) => {
        if (row.isDeleted) return false;
        if (row.accountId && row.accountId !== selectedAccountId) return false;

        return scopedMemberships.some(
          (membership) =>
            String(userIdOf(row) || "") === membershipUserId(membership) ||
            Boolean(row.email && membership.email && normalizeEmail(row.email) === normalizeEmail(membership.email))
        );
      });

      setSchools(activeSchools);
      setBranches(activeBranches);
      setUsers(scopedUsers);
      setMemberships(scopedMemberships);
    } catch (error) {
      console.error("Failed to load owner users and roles:", error);
      alert("Failed to load owner users and roles.");
      clearData();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    selectedAccountId,
    activeMembership?.role,
    activeMembership?.accountId,
    openWorkspace?.openedAt,
    openWorkspace?.membershipId,
  ]);

  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = [];

    memberships.forEach((membership) => {
      if (!ROLES.some((role) => role.value === membership.role)) return;

      const user =
        users.find((row) => String(userIdOf(row) || "") === membershipUserId(membership)) ||
        users.find((row) => Boolean(row.email && membership.email && normalizeEmail(row.email) === normalizeEmail(membership.email)));

      const school = membership.schoolId ? schoolMap.get(Number(membership.schoolId)) : undefined;
      const branch = membership.branchId ? branchMap.get(Number(membership.branchId)) : undefined;
      const email = normalizeEmail(user?.email || membership.email);
      const fullName = respectfulName({
        title: user?.title || membership.title,
        fullName: user?.fullName || user?.name || membership.fullName,
        email,
      });
      const state = accessState(user, membership);

      list.push({
        key: `${membership.role}-${authTableId(membership) || email || fullName}`,
        role: membership.role as OwnerAssignableRole,
        user,
        membership,
        school,
        branch,
        title: user?.title || membership.title,
        fullName,
        email,
        phone: normalizePhone(user?.phone),
        subLabel: `${school?.name || "No school"}${branch?.name ? ` · ${branch.name}` : ""}`,
        ...state,
      });
    });

    return list.sort((a, b) => {
      const order: Record<OwnerAssignableRole, number> = { school_admin: 1, branch_admin: 2, accountant: 3 };
      return order[a.role] - order[b.role] || a.fullName.localeCompare(b.fullName);
    });
  }, [branchMap, memberships, schoolMap, users]);

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (roleFilter !== "all" && candidate.role !== roleFilter) return false;
      if (accessFilter === "enabled" && !candidate.enabled) return false;
      if (accessFilter === "inactive" && !candidate.inactive) return false;
      if (schoolFilter !== "all" && Number(candidate.membership?.schoolId || 0) !== Number(schoolFilter)) return false;
      if (branchFilter !== "all" && Number(candidate.membership?.branchId || 0) !== Number(branchFilter)) return false;

      if (!query) return true;

      return `${candidate.fullName} ${candidate.email} ${candidate.phone} ${candidate.role} ${candidate.subLabel}`
        .toLowerCase()
        .includes(query);
    });
  }, [accessFilter, branchFilter, candidates, roleFilter, schoolFilter, search]);

  const summary = useMemo(() => {
    return {
      total: candidates.length,
      schoolAdmins: candidates.filter((item) => item.role === "school_admin").length,
      branchAdmins: candidates.filter((item) => item.role === "branch_admin").length,
      accountants: candidates.filter((item) => item.role === "accountant").length,
      enabled: candidates.filter((item) => item.enabled).length,
      inactive: candidates.filter((item) => item.inactive).length,
      temporary: candidates.filter((item) => item.mustChangePassword).length,
    };
  }, [candidates]);

  const activeFilterCount = useMemo(
    () =>
      [
        roleFilter !== "all" ? roleFilter : undefined,
        accessFilter !== "all" ? accessFilter : undefined,
        schoolFilter !== "all" ? schoolFilter : undefined,
        branchFilter !== "all" ? branchFilter : undefined,
      ].filter(Boolean).length,
    [accessFilter, branchFilter, roleFilter, schoolFilter]
  );

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "email") {
        const email = normalizeEmail(String(value));
        next.email = email;
        if (!current.temporaryPassword || current.temporaryPassword === tempPasswordFromEmail(current.email)) {
          next.temporaryPassword = tempPasswordFromEmail(email);
        }
      }

      if (key === "schoolId") {
        const branchBelongsToSchool = branches.some(
          (branch) => Number(branch.id) === Number(current.branchId) && Number(branch.schoolId) === Number(value)
        );
        if (!branchBelongsToSchool) next.branchId = "";
      }

      if (key === "role") {
        const role = String(value) as OwnerAssignableRole;
        if (!ROLES.find((item) => item.value === role)?.branchRequired) next.branchId = "";
      }

      return next;
    });
    setMessage("");
  };

  const openManual = () => {
    const firstSchool = schools[0];
    setForm({
      ...DEFAULT_FORM,
      schoolId: firstSchool?.id ? String(firstSchool.id) : "",
      branchId: "",
      temporaryPassword: "",
    });
    setMessage("");
    setDrawerOpen(true);
  };

  const openCandidate = (candidate: Candidate) => {
    setForm({
      membershipId: authTableId(candidate.membership),
      userId: String(userIdOf(candidate.user) || membershipUserId(candidate.membership) || ""),
      title: candidate.title || candidate.user?.title || "",
      fullName: candidate.user?.fullName || candidate.user?.name || candidate.fullName,
      email: candidate.email,
      phone: candidate.user?.phone || candidate.phone,
      role: candidate.role,
      schoolId: candidate.membership?.schoolId ? String(candidate.membership.schoolId) : "",
      branchId: candidate.membership?.branchId ? String(candidate.membership.branchId) : "",
      active: !candidate.inactive,
      temporaryPassword: candidate.user?.temporaryPassword || tempPasswordFromEmail(candidate.email),
    });
    setMessage("");
    setDrawerOpen(true);
  };

  const validate = () => {
    if (!selectedAccountId) return "Sign in first.";
    if (!form.email.trim()) return "Email is required because portal users sign in with email and password.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
    if (!form.fullName.trim()) return "Full name is required.";
    if (!ROLES.some((role) => role.value === form.role)) return "Owner can assign only school admin, branch admin, or accountant roles.";
    if (!form.schoolId) return "Select the school this user belongs to.";
    if (ROLES.find((role) => role.value === form.role)?.branchRequired && !form.branchId) {
      return `${roleLabel(form.role)} role must be assigned to a branch.`;
    }
    if (!form.temporaryPassword.trim()) return "Temporary password is required.";
    return "";
  };

  const saveAccess = async () => {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }

    try {
      setSaving(true);

      const response = await saveBackendOwnerAccess({
        form,
        users,
        memberships,
      });

      await cacheAuthUserLocally({
        user: response.user,
        form,
        accountId: selectedAccountId,
      });

      await cacheAuthMembershipLocally({
        membership: response.membership,
        user: response.user,
        form,
        accountId: selectedAccountId,
      });

      setDrawerOpen(false);
      await load();
    } catch (error: any) {
      console.error("Failed to save owner access through backend auth:", error);
      setMessage(
        error?.message ||
          "Failed to save access. Make sure the backend user and membership routes are running."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleAccess = async (candidate: Candidate) => {
    if (!candidate.membership?.id && !candidate.membership?.localId) {
      openCandidate(candidate);
      setMessage("Create portal access first.");
      return;
    }

    const nextActive = !candidate.enabled;

    try {
      setSaving(true);

      const membershipId = String(authTableId(candidate.membership));
      const membership = await firstWorkingAuthCall<UserMembership>([
        {
          endpoint: `/memberships/${encodeURIComponent(membershipId)}`,
          method: "PATCH",
          body: { active: nextActive, status: nextActive ? "active" : "inactive" },
        },
        {
          endpoint: `/user-memberships/${encodeURIComponent(membershipId)}`,
          method: "PATCH",
          body: { active: nextActive, status: nextActive ? "active" : "inactive" },
        },
      ]);

      const cacheForm: FormState = {
        membershipId: authTableId(candidate.membership),
        userId: String(userIdOf(candidate.user) || membershipUserId(candidate.membership) || ""),
        title: candidate.title || candidate.user?.title || "",
        fullName: candidate.user?.fullName || candidate.user?.name || candidate.fullName,
        email: candidate.email,
        phone: candidate.user?.phone || candidate.phone,
        role: candidate.role,
        schoolId: String(candidate.membership?.schoolId || candidate.school?.id || ""),
        branchId: String(candidate.membership?.branchId || candidate.branch?.id || ""),
        active: nextActive,
        temporaryPassword: candidate.user?.temporaryPassword || tempPasswordFromEmail(candidate.email),
      };

      if (candidate.user) {
        await cacheAuthUserLocally({
          user: candidate.user,
          form: cacheForm,
          accountId: selectedAccountId,
        });
      }

      await cacheAuthMembershipLocally({
        membership,
        user: candidate.user || ({ id: membership.userId, email: candidate.email } as AppUser),
        form: cacheForm,
        accountId: selectedAccountId,
      });

      await load();
    } catch (error: any) {
      console.error("Failed to toggle owner access through backend auth:", error);
      alert(error?.message || "Failed to update access.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccess = async (candidate: Candidate) => {
    if (!candidate.membership?.id && !candidate.membership?.localId) {
      alert("No membership exists for this access record yet.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${roleLabel(candidate.role)} access for ${candidate.fullName}?\n\nThis removes the role/membership from the backend database.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      await deleteBackendMembership(candidate);
      await removeAuthAccessLocally(candidate);
      await load();
    } catch (error: any) {
      console.error("Failed to delete owner access through backend auth:", error);
      alert(error?.message || "Failed to delete this access role.");
    } finally {
      setSaving(false);
    }
  };

  if (accountLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Owner Users..." text="Loading schools, branches and administrative access." />;
  }

  if (!authenticated || !selectedAccountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing owner users." />;
  }

  return (
    <main className="ba-page ownerusers-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Owner users search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder="Search owner users..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search owner users"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={openManual} aria-label="Add owner user" title="Add user">+</button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active owner user filters">
          {roleFilter !== "all" && <button type="button" onClick={() => setRoleFilter("all")}>Role: {roleLabel(roleFilter)} ×</button>}
          {accessFilter !== "all" && <button type="button" onClick={() => setAccessFilter("all")}>Access: {accessFilter} ×</button>}
          {schoolFilter !== "all" && <button type="button" onClick={() => setSchoolFilter("all")}>School: {schoolMap.get(Number(schoolFilter))?.name || schoolFilter} ×</button>}
          {branchFilter !== "all" && <button type="button" onClick={() => setBranchFilter("all")}>Branch: {branchMap.get(Number(branchFilter))?.name || branchFilter} ×</button>}
        </section>
      )}

      {viewMode === "table" && (
        <section className="ba-table-card ownerusers-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Users ({filteredCandidates.length})</th>
                  <th>Role</th>
                  <th>School</th>
                  <th>Branch</th>
                  <th>Email</th>
                  <th>Access</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.key}>
                    <td><strong>{candidate.fullName}</strong><span>{candidate.phone || candidate.subLabel}</span></td>
                    <td><Chip tone={roleTone(candidate.role)}>{roleIcon(candidate.role)} {roleLabel(candidate.role)}</Chip></td>
                    <td>{candidate.school?.name || "No school"}</td>
                    <td>{candidate.branch?.name || (candidate.role === "school_admin" ? "All/School" : "No branch")}</td>
                    <td>{candidate.email || <span className="ownerusers-warn">Email needed</span>}</td>
                    <td><Chip tone={candidate.enabled ? "green" : candidate.inactive ? "red" : "orange"}>{candidate.enabled ? "Enabled" : candidate.inactive ? "Inactive" : "Not Enabled"}</Chip></td>
                    <td>
                      <div className="ba-table-actions">
                        <button type="button" onClick={() => openCandidate(candidate)}>Edit</button>
                        <button type="button" onClick={() => toggleAccess(candidate)}>{candidate.enabled ? "Deactivate" : "Activate"}</button>
                        <button type="button" className="ba-delete" onClick={() => deleteAccess(candidate)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredCandidates.length && <div className="ba-empty-table">No owner users match the selected filters.</div>}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list ownerusers-list">
          {filteredCandidates.map((candidate) => (
            <button key={candidate.key} type="button" className="student-row ownerusers-row" onClick={() => setSelectedCandidate(candidate)}>
              <span className="ownerusers-avatar">{initials(candidate.fullName)}</span>

              <span className="student-main">
                <strong>{candidate.fullName}</strong>
                <small>{roleIcon(candidate.role)} {roleLabel(candidate.role)} · {candidate.email || "Email needed"}</small>
                <em>{candidate.subLabel}</em>
              </span>

              <span className="student-side">
                <span className={`status-dot-mini ${candidate.enabled ? "green" : candidate.inactive ? "red" : "orange"}`} />
                <i>⋯</i>
              </span>
            </button>
          ))}

          {!filteredCandidates.length && <Empty icon="🔐" title="No users found" text="No school admin, branch admin or accountant records match the selected filters." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          schools={schools}
          branches={branches}
          roleFilter={roleFilter}
          accessFilter={accessFilter}
          schoolFilter={schoolFilter}
          branchFilter={branchFilter}
          setRoleFilter={setRoleFilter}
          setAccessFilter={setAccessFilter}
          setSchoolFilter={(value) => {
            setSchoolFilter(value);
            setBranchFilter("all");
          }}
          setBranchFilter={setBranchFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onAdd={() => {
            setMoreOpen(false);
            openManual();
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          summary={summary}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedCandidate && (
        <CandidateSheet
          candidate={selectedCandidate}
          openCandidate={openCandidate}
          toggleAccess={toggleAccess}
          deleteAccess={deleteAccess}
          onClose={() => setSelectedCandidate(null)}
        />
      )}

      {drawerOpen && (
        <div className="ba-sheet-backdrop ownerusers-drawer-layer" role="dialog" aria-modal="true">
          <aside className="ba-sheet ownerusers-drawer">
            <div className="ba-sheet-head">
              <div>
                <h2>{form.membershipId ? "Edit Access" : "Create Access"}</h2>
                <p>{roleLabel(form.role)} · {form.schoolId ? schoolMap.get(Number(form.schoolId))?.name || "Selected school" : "Select school"}</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close access form">✕</button>
            </div>

            {message && <section className="ba-warning ownerusers-message">{message}</section>}

            <section className="ownerusers-note">
              <strong>Owner assignment</strong>
              <span>Select the school and, when required, the branch where this admin role should operate.</span>
            </section>

            <div className="ba-form compact">
              <label>
                <span>Title</span>
                <select value={form.title} onChange={(event) => updateForm("title", event.target.value)}>
                  {TITLES.map((title) => <option key={title || "none"} value={title}>{title || "No title"}</option>)}
                </select>
              </label>

              <label>
                <span>Role</span>
                <select value={form.role} onChange={(event) => updateForm("role", event.target.value as OwnerAssignableRole)}>
                  {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </label>

              <label>
                <span>School</span>
                <select value={form.schoolId} onChange={(event) => updateForm("schoolId", event.target.value)}>
                  <option value="">Select school</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              </label>

              <label>
                <span>Branch</span>
                <select
                  value={form.branchId}
                  disabled={!ROLES.find((role) => role.value === form.role)?.branchRequired}
                  onChange={(event) => updateForm("branchId", event.target.value)}
                >
                  <option value="">
                    {ROLES.find((role) => role.value === form.role)?.branchRequired ? "Select branch" : "Not required"}
                  </option>
                  {branchesForFormSchool.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>

              <label><span>Full Name</span><input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} /></label>
              <label><span>Email</span><input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="user@example.com" /></label>
              <label><span>Phone</span><input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} /></label>
              <label><span>Temporary Password</span><input value={form.temporaryPassword} onChange={(event) => updateForm("temporaryPassword", event.target.value)} /></label>
            </div>

            <label className="ownerusers-switch-row">
              <div><strong>Active access</strong><span>Inactive users remain recorded but cannot use this selected role.</span></div>
              <button type="button" className={`ownerusers-switch ${form.active ? "on" : ""}`} onClick={() => updateForm("active", !form.active)} aria-pressed={form.active}><span /></button>
            </label>

            <div className="ba-sheet-actions">
              <button type="button" onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button type="button" className="primary" disabled={saving} onClick={saveAccess}>{saving ? "Saving..." : "Save Access"}</button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// UI PIECES
// ======================================================

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page ownerusers-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state"><div className="ba-spinner" /><h2>{title}</h2><p>{text}</p></section>
    </main>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" /><path d="M17 7h3" /><circle cx="15" cy="7" r="2" /><path d="M4 17h3" /><path d="M11 17h9" /><circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <section className="ba-empty"><div className="ba-empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></section>;
}

function FilterSheet({
  schools,
  branches,
  roleFilter,
  accessFilter,
  schoolFilter,
  branchFilter,
  setRoleFilter,
  setAccessFilter,
  setSchoolFilter,
  setBranchFilter,
  onClose,
}: {
  schools: School[];
  branches: Branch[];
  roleFilter: RoleFilter;
  accessFilter: AccessFilter;
  schoolFilter: string;
  branchFilter: string;
  setRoleFilter: (value: RoleFilter) => void;
  setAccessFilter: (value: AccessFilter) => void;
  setSchoolFilter: (value: string) => void;
  setBranchFilter: (value: string) => void;
  onClose: () => void;
}) {
  const scopedBranches = schoolFilter === "all" ? branches : branches.filter((branch) => Number(branch.schoolId) === Number(schoolFilter));

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>Filters</h2><p>Filter owner-created access by role, access state, school and branch.</p></div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
              <option value="all">All Roles</option>
              {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>

          <label>
            <span>Access</span>
            <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}>
              <option value="all">All Access</option>
              <option value="enabled">Access Enabled</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label>
            <span>School</span>
            <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)}>
              <option value="all">All Schools</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>

          <label>
            <span>Branch</span>
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">All Branches</option>
              {scopedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={() => { setRoleFilter("all"); setAccessFilter("all"); setSchoolFilter("all"); setBranchFilter("all"); }}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onAdd,
  onRefresh,
  summary,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onAdd: () => void;
  onRefresh: () => void;
  summary: Record<string, number>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>{summary.total} administrative access record(s).</p></div>
          <button type="button" onClick={onClose} aria-label="Close more options">✕</button>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}><span>☰</span><b>Cards</b><small>Compact mobile-first list</small></button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}><span>▦</span><b>Table</b><small>Compare users, roles and branches</small></button>
          <button type="button" onClick={onAdd}><span>＋</span><b>Add Access</b><small>Create school or branch admin access</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload backend and local cache</small></button>
        </div>
      </section>
    </div>
  );
}

function CandidateSheet({
  candidate,
  openCandidate,
  toggleAccess,
  deleteAccess,
  onClose,
}: {
  candidate: Candidate;
  openCandidate: (candidate: Candidate) => void;
  toggleAccess: (candidate: Candidate) => void;
  deleteAccess: (candidate: Candidate) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>{candidate.fullName}</h2>
            <p>{candidate.email || "No email"} · {candidate.subLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close user details">✕</button>
        </div>

        <div className="ownerusers-profile">
          <span className="ownerusers-avatar large">{initials(candidate.fullName)}</span>
          <div>
            <strong>{roleIcon(candidate.role)} {roleLabel(candidate.role)}</strong>
            <small>{candidate.enabled ? "Access enabled" : candidate.inactive ? "Inactive access" : "Not enabled"}</small>
          </div>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={() => { openCandidate(candidate); onClose(); }}><span>✎</span><b>Edit access</b><small>Change school, branch, role or contact details</small></button>
          <button type="button" onClick={() => { toggleAccess(candidate); onClose(); }}><span>{candidate.enabled ? "⏸" : "▶"}</span><b>{candidate.enabled ? "Deactivate" : "Activate"}</b><small>Toggle this role membership</small></button>
          <button type="button" className="danger" onClick={() => { deleteAccess(candidate); onClose(); }}><span>⌫</span><b>Delete access</b><small>Remove this role membership from backend</small></button>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes baSpin{to{transform:rotate(360deg)}}
.ba-page{min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}
.ba-page button,.ba-page input,.ba-page select{font:inherit;max-width:100%}
.ba-page input,.ba-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}
.ba-page input:focus,.ba-page select:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}
.ba-state,.ba-search-card,.student-row,.ba-table-card,.ba-empty,.ba-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}
.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}
.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:baSpin .8s linear infinite}
.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) 42px 42px 42px;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}
.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}
.ba-icon-button,.ba-filter-button,.ba-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}
.ba-add-inline{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;font-size:20px;box-shadow:0 12px 28px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}
.ba-list{display:grid;gap:8px;margin-top:10px}.student-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:var(--text,#111827)}.student-row:hover{border-color:color-mix(in srgb,var(--ba-primary) 24%,var(--border,rgba(0,0,0,.10)));box-shadow:0 16px 34px rgba(15,23,42,.07)}
.ownerusers-avatar{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--ba-primary),color-mix(in srgb,var(--ba-primary) 35%,#fff));color:#fff;font-size:15px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}.ownerusers-avatar.large{width:58px;height:58px;border-radius:21px;font-size:18px}
.student-main,.student-main strong,.student-main small,.student-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.student-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.student-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.student-side{display:grid;justify-items:end;gap:5px}.student-side i{font-style:normal;font-weight:1000;color:var(--muted,#64748b)}
.status-dot-mini{width:10px;height:10px;border-radius:999px}.status-dot-mini.green{background:#22c55e}.status-dot-mini.red{background:#ef4444}.status-dot-mini.orange{background:#f59e0b}
.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}
.ba-table-card{margin-top:10px;border-radius:24px;overflow:hidden}.ba-table-scroll{width:100%;overflow:auto}table{width:100%;border-collapse:separate;border-spacing:0;min-width:840px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:middle}th{position:sticky;top:0;z-index:1;background:var(--table-header-bg,color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)));color:var(--table-header-text,var(--text,#111827));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}td{font-size:13px;color:var(--text,#111827)}td strong,td span{display:block}.ba-table-actions{display:flex;align-items:center;gap:6px;white-space:nowrap}.ba-table-actions button{min-height:32px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:900;cursor:pointer}.ba-table-actions .ba-delete{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#dc2626}.ba-empty-table{padding:18px;text-align:center;color:var(--muted,#64748b);font-size:13px;font-weight:800}
.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:210px;margin-top:10px;padding:22px;border-radius:24px;border-style:dashed;text-align:center}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}
.ba-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ba-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32)}.ba-sheet.small{width:min(520px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ba-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ba-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ba-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}
.ba-form.compact{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ba-form label{display:grid;gap:6px}.ba-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ba-warning{margin-bottom:10px;padding:10px 12px;border-radius:18px;background:rgba(245,158,11,.12);color:#92400e;border:1px solid rgba(245,158,11,.22);font-size:12px;font-weight:800;line-height:1.5}.ownerusers-note{display:grid;gap:3px;margin-bottom:10px;padding:10px 12px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 9%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 16%,transparent)}.ownerusers-note strong{font-size:12px;font-weight:1000}.ownerusers-note span{color:var(--muted,#64748b);font-size:11px;font-weight:750;line-height:1.5}.ownerusers-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:10px 12px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px}.ownerusers-switch-row strong,.ownerusers-switch-row span{display:block}.ownerusers-switch-row span{margin-top:3px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ownerusers-switch{width:54px;height:30px;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 28%,transparent);padding:3px;cursor:pointer;transition:.18s}.ownerusers-switch span{width:24px;height:24px;display:block;border-radius:999px;background:#fff;transition:.18s;box-shadow:0 5px 14px rgba(15,23,42,.20)}.ownerusers-switch.on{background:var(--ba-primary)}.ownerusers-switch.on span{transform:translateX(24px)}
.ba-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ba-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{border-color:var(--ba-primary);background:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 25%,transparent)}.ba-sheet-actions button:disabled{opacity:.65;cursor:not-allowed}
.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ba-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b,.ba-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-menu-list button b{font-size:13px;font-weight:1000}.ba-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{border-color:color-mix(in srgb,var(--ba-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ba-primary) 8%,var(--surface,#fff))}.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.ba-menu-list button.danger b{color:#dc2626}
.ownerusers-profile{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:10px;border-radius:20px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ownerusers-profile strong,.ownerusers-profile small{display:block}.ownerusers-profile strong{font-size:14px;font-weight:1000}.ownerusers-profile small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:800}
@media (min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ba-search-card{grid-template-columns:minmax(0,1fr) 48px 48px 48px}.ba-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ba-sheet-backdrop{place-items:center;padding:18px}.ba-sheet{border-radius:28px;padding:18px}.ba-form.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ba-search-card,.ba-list,.ba-table-card,.ba-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ba-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:520px){.ba-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ba-search-card{grid-template-columns:minmax(0,1fr) 40px 40px 40px;gap:6px;padding:6px;border-radius:22px}.ba-icon-button,.ba-filter-button,.ba-add-inline{width:40px;height:40px}.ba-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ba-sheet-actions button{width:100%}}
`;
