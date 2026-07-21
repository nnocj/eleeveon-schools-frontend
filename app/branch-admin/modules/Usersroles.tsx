"use client";

/**
 * app/branch-admin/modules/Usersroles.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN — USERS & ROLES
 * ---------------------------------------------------------
 *
 * People-first access control:
 * - Teachers, students and parents are loaded directly from their profile tables.
 * - Portal access is then matched from users + memberships.
 * - Branch admin can create/activate/deactivate portal access.
 * - Branch admin can only assign roles below branch admin:
 *   accountant, teacher, student, parent.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings/storage
 * - prevents this module from using stale school/branch context left behind by another role
 * - profile rows now load through listActiveLocal(...) to match the compact golden modules
 * - backend auth remains the source of truth for AppUser/UserMembership access records
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import { db, Parent, Student, Teacher } from "../../lib/db/db";
import { apiRequest } from "../../lib/platformApi";
import { listActiveLocal, prepareSyncData } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
// ======================================================
// TYPES
// ======================================================

type EntityId = string | number;

type ViewMode = "cards" | "table";
type AccessFilter = "all" | "enabled" | "notEnabled" | "inactive";
type BranchAssignableRole = "accountant" | "teacher" | "student" | "parent";
type RoleFilter = "all" | BranchAssignableRole;

type TenantRow = {
  accountId?: string | null;
  schoolId?: EntityId | null;
  branchId?: EntityId | null;
  isDeleted?: boolean;
  active?: boolean;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: EntityId | null;
  branchId?: EntityId | null;
  teacherId?: EntityId | null;
  studentId?: EntityId | null;
  parentId?: EntityId | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

type AppUser = TenantRow & {
  id?: string | number;

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
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  synced?: any;
};

type UserMembership = TenantRow & {
  id?: string | number;

  userId?: EntityId | null;
  accountUserId?: EntityId | null;
  title?: string;
  email?: string;
  fullName?: string;
  role?: string;
  status?: string;
  teacherId?: EntityId | null;
  studentId?: EntityId | null;
  parentId?: EntityId | null;
  mustChangePassword?: boolean;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  synced?: any;
};

type CandidateSource = "teacher" | "student" | "parent" | "accountant";

type Candidate = {
  key: string;
  source: CandidateSource;
  role: BranchAssignableRole;
  profileId?: EntityId;
  user?: AppUser;
  membership?: UserMembership;
  title?: string;
  fullName: string;
  email: string;
  phone: string;
  photo?: string;
  subLabel: string;
  enabled: boolean;
  inactive: boolean;
  hasLogin: boolean;
  hasMembership: boolean;
  mustChangePassword: boolean;
};

type FormState = {
  mode: "profile" | "manual";
  membershipId?: string | number;
  userId: string;
  title: string;
  fullName: string;
  email: string;
  phone: string;
  role: BranchAssignableRole;
  active: boolean;
  temporaryPassword: string;
  teacherId: string;
  studentId: string;
  parentId: string;
};

// ======================================================
// CONSTANTS
// ======================================================

const ROLES: {
  value: BranchAssignableRole;
  label: string;
  icon: string;
  helper: string;
}[] = [
  {
    value: "accountant",
    label: "Accountant",
    icon: "💰",
    helper: "Finance, fees, expenses and payroll access.",
  },
  {
    value: "teacher",
    label: "Teacher",
    icon: "👨‍🏫",
    helper: "Teacher portal access linked to a teacher profile.",
  },
  {
    value: "student",
    label: "Student",
    icon: "🧑‍🎓",
    helper: "Student portal access linked to a student profile.",
  },
  {
    value: "parent",
    label: "Parent",
    icon: "👨‍👩‍👧",
    helper: "Parent portal access linked to a parent profile.",
  },
];

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

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const DEFAULT_FORM: FormState = {
  mode: "manual",
  userId: "",
  title: "",
  fullName: "",
  email: "",
  phone: "",
  role: "accountant",
  active: true,
  temporaryPassword: "",
  teacherId: "",
  studentId: "",
  parentId: "",
};

// ======================================================
// HELPERS
// ======================================================

const now = () => Date.now();

function idOf(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

async function activeRows<T>(tableName: string): Promise<T[]> {
  return ((await listActiveLocal(tableName as any)) || []) as T[];
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

function normalizeEmail(email?: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(phone?: string) {
  return String(phone || "")
    .trim()
    .replace(/\s+/g, " ");
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

function sameTenant(
  row: TenantRow,
  accountId?: string | null,
  schoolId?: EntityId | null,
  branchId?: EntityId | null,
) {
  if (!row || row.isDeleted) return false;
  return (
    (row.accountId || accountId) === accountId &&
    String(row.schoolId ?? schoolId ?? "") === String(schoolId ?? "") &&
    String(row.branchId ?? branchId ?? "") === String(branchId ?? "")
  );
}

function roleLabel(role?: string) {
  return (
    ROLES.find((item) => item.value === role)?.label ||
    String(role || "No role").replaceAll("_", " ")
  );
}

function roleIcon(role?: string) {
  return ROLES.find((item) => item.value === role)?.icon || "👤";
}

function roleTone(
  role?: string,
): "green" | "blue" | "orange" | "gray" | "red" | "purple" {
  if (role === "accountant") return "green";
  if (role === "teacher") return "blue";
  if (role === "student") return "orange";
  if (role === "parent") return "gray";
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

function respectfulName(input: {
  title?: string;
  fullName?: string;
  name?: string;
  email?: string;
}) {
  const title = String(input.title || "").trim();
  const name = String(
    input.fullName || input.name || input.email || "User",
  ).trim();
  if (!title) return name;

  const normalizedTitle = title.replace(/\.$/, "").toLowerCase();
  const lowerName = name.toLowerCase();

  if (
    lowerName.startsWith(`${normalizedTitle} `) ||
    lowerName.startsWith(`${normalizedTitle}. `)
  )
    return name;
  return `${title} ${name}`;
}

function userIdOf(user?: AppUser) {
  return user?.id;
}

function membershipUserId(membership?: UserMembership) {
  return String(
    membership?.userId || membership?.userId || membership?.accountUserId || "",
  );
}

function findUserAndMembership(input: {
  role: BranchAssignableRole;
  profileId?: EntityId;
  email?: string;
  users: AppUser[];
  memberships: UserMembership[];
}) {
  const email = normalizeEmail(input.email);

  const membership = input.memberships.find((row) => {
    if (row.role !== input.role) return false;

    if (
      input.role === "teacher" &&
      input.profileId &&
      row.teacherId === input.profileId
    )
      return true;
    if (
      input.role === "student" &&
      input.profileId &&
      row.studentId === input.profileId
    )
      return true;
    if (
      input.role === "parent" &&
      input.profileId &&
      row.parentId === input.profileId
    )
      return true;

    return Boolean(email && row.email?.toLowerCase() === email);
  });

  const user =
    input.users.find(
      (row) => String(userIdOf(row) || "") === membershipUserId(membership),
    ) ||
    input.users.find((row) =>
      Boolean(email && row.email?.toLowerCase() === email),
    ) ||
    undefined;

  return { user, membership };
}

function accessState(user?: AppUser, membership?: UserMembership) {
  const hasLogin = Boolean(user?.id || user?.email);
  const hasMembership = Boolean(membership?.id || membership?.role);
  const userInactive = user?.active === false || user?.status === "inactive";
  const membershipInactive =
    membership?.active === false || membership?.status === "inactive";
  const inactive =
    (hasLogin && userInactive) || (hasMembership && membershipInactive);
  const enabled = hasLogin && hasMembership && !inactive;

  return {
    hasLogin,
    hasMembership,
    inactive,
    enabled,
    mustChangePassword: Boolean(
      user?.mustChangePassword || membership?.mustChangePassword,
    ),
  };
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

function authTableId(row?: any) {
  return row?.id;
}

async function authApi<T = any>(
  endpoint: string,
  options: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: any },
): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, {
      method: options.method,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
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
  attempts: Array<{
    endpoint: string;
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: any;
  }>,
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
  if (membership.role === "teacher" && membership.teacherId)
    return `teacher:${membership.teacherId}`;
  if (membership.role === "student" && membership.studentId)
    return `student:${membership.studentId}`;
  if (membership.role === "parent" && membership.parentId)
    return `parent:${membership.parentId}`;
  return `email:${normalizeEmail(membership.email)}`;
}

function membershipLogicalKey(membership: Partial<UserMembership>) {
  return [
    String(membership.accountId || ""),
    String(membership.schoolId || ""),
    String(membership.branchId || ""),
    String(membership.role || ""),
    String(
      membership.userId || membership.userId || membership.accountUserId || "",
    ),
    membershipProfileKey(membership),
  ].join("|");
}

function dedupeMemberships(rows: UserMembership[]) {
  const byExactId = new Map<string, UserMembership>();
  const withoutRealId: UserMembership[] = [];

  rows.filter(Boolean).forEach((row) => {
    const id = String(authTableId(row) || "").trim();

    // Real backend ids are always preferred over synthetic membership_* ids.
    if (id && !id.startsWith("membership_")) {
      byExactId.set(id, { ...(byExactId.get(id) || {}), ...row });
      return;
    }

    withoutRealId.push(row);
  });

  const finalRows = new Map<string, UserMembership>();

  [...byExactId.values(), ...withoutRealId].forEach((row) => {
    const id = String(authTableId(row) || "").trim();
    const key =
      id && !id.startsWith("membership_")
        ? `id:${id}`
        : `logical:${membershipLogicalKey(row)}`;
    const existing = finalRows.get(key);

    // Prefer real backend rows, then active rows, then the latest updated record.
    if (!existing) {
      finalRows.set(key, row);
      return;
    }

    const existingId = String(authTableId(existing) || "");
    const rowHasRealId = id && !id.startsWith("membership_");
    const existingHasRealId =
      existingId && !existingId.startsWith("membership_");

    if (rowHasRealId && !existingHasRealId) {
      finalRows.set(key, row);
      return;
    }

    if (
      (row.active !== false && existing.active === false) ||
      Number(row.updatedAt || 0) >= Number(existing.updatedAt || 0)
    ) {
      finalRows.set(key, { ...existing, ...row });
    }
  });

  const logicalRows = new Map<string, UserMembership>();

  // Second pass removes cases where the same backend membership appears once by id
  // and once as a synthetic row from a flattened backend response.
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
    const existingHasRealId =
      existingId && !existingId.startsWith("membership_");

    if (rowHasRealId && !existingHasRealId) logicalRows.set(key, row);
    else if (
      !existingHasRealId ||
      Number(row.updatedAt || 0) >= Number(existing.updatedAt || 0)
    )
      logicalRows.set(key, { ...existing, ...row });
  });

  return [...logicalRows.values()];
}

function membershipMatchesForm(
  membership: Partial<UserMembership>,
  form: FormState,
  userId: string,
  schoolId: EntityId,
  branchId: EntityId,
) {
  if (!membership || membership.role !== form.role) return false;
  if (
    String(
      membershipUserId(membership as UserMembership) || membership.userId || "",
    ) !== String(userId)
  )
    return false;
  if (String(membership.schoolId ?? "") !== String(schoolId ?? "")) return false;
  if (String(membership.branchId ?? "") !== String(branchId ?? "")) return false;

  if (form.role === "teacher")
    return (
      String((membership.teacherId || 0) ?? "") ===
      String((form.teacherId || 0) ?? "")
    );
  if (form.role === "student")
    return (
      String((membership.studentId || 0) ?? "") ===
      String((form.studentId || 0) ?? "")
    );
  if (form.role === "parent")
    return (
      String((membership.parentId || 0) ?? "") ===
      String((form.parentId || 0) ?? "")
    );

  return (
    normalizeEmail(membership.email) === normalizeEmail(form.email) ||
    Boolean(userId)
  );
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

  const users = userCandidates
    .flatMap(arrayFromAny)
    .filter(Boolean) as AppUser[];

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
      mustChangePassword:
        membership?.mustChangePassword ?? user?.mustChangePassword,
    })) as UserMembership[];
  });

  const syntheticMemberships = users
    .filter((user: any) => {
      const role = String(user?.role || "").toLowerCase();
      const hasNested = nestedMemberships.some(
        (membership) =>
          String(membership.userId || "") === String(userIdOf(user) || "") &&
          String(membership.role || "") === role,
      );
      return ROLES.some((item) => item.value === role) && !hasNested;
    })
    .map((user: any) => ({
      id:
        user?.membershipId ||
        user?.userMembershipId ||
        `membership_${userIdOf(user) || user.email || Math.random()}`,
      accountId: user?.accountId,
      schoolId: user?.schoolId,
      branchId: user?.branchId,
      userId: userIdOf(user),
      title: user?.title,
      fullName: user?.fullName || user?.name,
      email: user?.email,
      role: user?.role,
      active: user?.active !== false && user?.status !== "inactive",
      status:
        user?.active === false || user?.status === "inactive"
          ? "inactive"
          : "active",
      mustChangePassword: Boolean(user?.mustChangePassword),
      isDeleted: Boolean(user?.isDeleted),
    })) as UserMembership[];

  return {
    users,
    memberships: dedupeMemberships([
      ...topLevelMemberships,
      ...nestedMemberships,
      ...syntheticMemberships,
    ]),
  };
}

async function fetchBackendBranchUsers(args: {
  schoolId: EntityId;
  branchId: EntityId;
}) {
  return authApi<any>(
    `/accounts/me/users?schoolId=${encodeURIComponent(String(args.schoolId))}&branchId=${encodeURIComponent(String(args.branchId))}`,
    {
      method: "GET",
    },
  );
}

function profileLocalFields(form: FormState) {
  return {
    teacherId:
      form.role === "teacher" ? num(form.teacherId) || undefined : undefined,
    studentId:
      form.role === "student" ? num(form.studentId) || undefined : undefined,
    parentId:
      form.role === "parent" ? num(form.parentId) || undefined : undefined,
  };
}

function cleanCreateAccountUserDto(
  form: FormState,
  schoolId: EntityId,
  branchId: EntityId,
) {
  return {
    fullName: form.fullName.trim(),
    email: normalizeEmail(form.email),
    phone: normalizePhone(form.phone) || undefined,
    password: form.temporaryPassword.trim(),
    role: form.role,
    schoolId,
    branchId,
    ...profileLocalFields(form),
  };
}

function cleanUpdateAccountUserDto(form: FormState) {
  return {
    fullName: form.fullName.trim(),
    phone: normalizePhone(form.phone) || undefined,
    role: form.role,
  };
}

function cleanMembershipDto(
  form: FormState,
  userId: string,
  schoolId: EntityId,
  branchId: EntityId,
) {
  return {
    userId,
    role: form.role,
    schoolId,
    branchId,
    active: form.active,
    teacherId: form.role === "teacher" ? num(form.teacherId) || null : null,
    studentId: form.role === "student" ? num(form.studentId) || null : null,
    parentId: form.role === "parent" ? num(form.parentId) || null : null,
  };
}

async function updateLinkedProfileContactLocally(args: {
  form: FormState;
  accountId: string;
  schoolId: EntityId;
  branchId: EntityId;
}) {
  // PROFILE DATA FIX:
  // Teacher/student/parent records are normal school operational data.
  // They must use prepareSyncData() and the normal pending-sync metadata.
  //
  // Auth/access tables are different: appUsers/userMemberships stay backend-auth-first
  // and are cached locally only after backend success. But if a branch admin edits
  // a student's email in this Users & Roles drawer, that email belongs to the
  // student profile table too. Without this, portal access saves correctly but the
  // student profile still reloads with a blank/old email.
  if (args.form.mode !== "profile") return;

  const role = args.form.role;
  const email = normalizeEmail(args.form.email);
  const phone = normalizePhone(args.form.phone);

  let table: any = null;
  let id: number | undefined;

  if (role === "teacher") {
    table = (db as any).teachers;
    id = num(args.form.teacherId);
  }

  if (role === "student") {
    table = (db as any).students;
    id = num(args.form.studentId);
  }

  if (role === "parent") {
    table = (db as any).parents;
    id = num(args.form.parentId);
  }

  if (!table?.get || !table?.update || !id) return;

  const existing = await table.get(id).catch(() => undefined);
  if (!existing) return;

  const profilePatch: any = {
    ...existing,
    accountId: existing.accountId || args.accountId,
    schoolId: existing.schoolId ?? args.schoolId,
    branchId: existing.branchId ?? args.branchId,
    email,
  };

  // Keep backward compatibility with older Student shapes that used studentEmail.
  if (role === "student") {
    profilePatch.studentEmail = email;
  }

  // Only write phone if the profile already has a phone-like field or the form contains one.
  if (phone) {
    if (role === "student") {
      profilePatch.phone = phone;
    } else {
      profilePatch.phone = phone;
    }
  }

  // Preserve names by default. Only fill common name fields if they already exist.
  if (args.form.fullName.trim()) {
    if ("fullName" in existing)
      profilePatch.fullName = args.form.fullName.trim();
    if ("name" in existing) profilePatch.name = args.form.fullName.trim();
  }

  const prepared = prepareSyncData(profilePatch, existing);
  await table.update(id, prepared);
}

async function saveBackendBranchAccess(args: {
  form: FormState;
  users: AppUser[];
  memberships: UserMembership[];
  accountId: string;
  schoolId: EntityId;
  branchId: EntityId;
}) {
  const email = normalizeEmail(args.form.email);
  let user =
    (args.form.userId
      ? args.users.find(
          (row) => String(userIdOf(row) || "") === String(args.form.userId),
        )
      : undefined) ||
    args.users.find((row) => normalizeEmail(row.email) === email);

  let membershipsFromCreatedUser: UserMembership[] = [];

  if (user && userIdOf(user)) {
    user = await authApi<AppUser>(
      `/accounts/users/${encodeURIComponent(String(userIdOf(user)))}`,
      {
        method: "PATCH",
        body: cleanUpdateAccountUserDto(args.form),
      },
    );
    membershipsFromCreatedUser =
      extractBackendUsersAndMemberships(user).memberships;
  } else {
    try {
      user = await authApi<AppUser>("/accounts/me/users", {
        method: "POST",
        body: cleanCreateAccountUserDto(
          args.form,
          args.schoolId,
          args.branchId,
        ),
      });

      // DUPLICATE PREVENTION:
      // AccountsService.createUser already creates AppUser + UserMembership in one transaction.
      // Reuse the membership returned inside the created user instead of calling POST /memberships again.
      membershipsFromCreatedUser =
        extractBackendUsersAndMemberships(user).memberships;
    } catch (error: any) {
      const message = endpointErrorMessage(error).toLowerCase();
      if (
        !message.includes("already registered") &&
        !message.includes("already exists")
      )
        throw error;

      const remote = await fetchBackendBranchUsers({
        schoolId: args.schoolId,
        branchId: args.branchId,
      });
      const normalized = extractBackendUsersAndMemberships(remote);
      user = normalized.users.find(
        (row) => normalizeEmail(row.email) === email,
      );
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
      ? allKnownMemberships.find(
          (membership) =>
            String(authTableId(membership) || "") ===
            String(args.form.membershipId),
        )
      : undefined) ||
    allKnownMemberships.find((membership) =>
      membershipMatchesForm(
        membership,
        args.form,
        userId,
        args.schoolId,
        args.branchId,
      ),
    );

  let membership: UserMembership;
  if (matchingMembership?.id) {
    // If the create-user endpoint already returned the exact membership, update it instead of creating another one.
    membership = await authApi<UserMembership>(
      `/memberships/${encodeURIComponent(String(authTableId(matchingMembership)))}`,
      {
        method: "PATCH",
        body: cleanMembershipDto(
          args.form,
          userId,
          args.schoolId,
          args.branchId,
        ),
      },
    );
  } else {
    membership = await authApi<UserMembership>("/memberships", {
      method: "POST",
      body: cleanMembershipDto(args.form, userId, args.schoolId, args.branchId),
    });
  }

  if (args.form.active === false && membership?.id) {
    membership = await authApi<UserMembership>(
      `/memberships/${encodeURIComponent(String(membership.id))}`,
      {
        method: "PATCH",
        body: { active: false },
      },
    );
  }

  return { user, membership };
}

async function cacheAuthUserLocally(args: {
  user: AppUser;
  form: FormState;
  accountId: string;
  schoolId: EntityId;
  branchId: EntityId;
}) {
  const table = getTable<AppUser>("appUsers", "accountUsers", "users");
  if (!table) return;

  const id = userIdOf(args.user) || makeLocalAuthId("user");
  const timestamp = dateishNowForAuthTable(table);
  const payload: Partial<AppUser> = {
    ...args.user,
    id,
    accountId: args.accountId,
    schoolId: args.schoolId,
    branchId: args.branchId,
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
    (await table
      .where?.("email")
      ?.equals?.(payload.email)
      ?.first?.()
      .catch(() => undefined));

  if (existing?.id) {
    await table.update(authTableId(existing), {
      ...payload,
      version: Number(existing.version || 0) + 1,
    });
    return;
  }

  await table.add({
    ...(isStringPrimaryKeyTable(table) ? { id } : {}),
    ...payload,
    createdAt: timestamp as any,
    version: 1,
  });
}

async function cacheAuthMembershipLocally(args: {
  membership: UserMembership;
  user: AppUser;
  form: FormState;
  accountId: string;
  schoolId: EntityId;
  branchId: EntityId;
}) {
  const table = getTable<UserMembership>("userMemberships", "memberships");
  if (!table) return;

  const id =
    authTableId(args.membership) ||
    args.form.membershipId ||
    makeLocalAuthId("membership");
  const userId = String(userIdOf(args.user) || args.membership.userId || "");
  const timestamp = dateishNowForAuthTable(table);
  const payload: Partial<UserMembership> = {
    ...args.membership,
    id,
    accountId: args.accountId,
    schoolId: args.schoolId,
    branchId: args.branchId,
    userId,
    accountUserId: null,
    title: args.form.title.trim() || undefined,
    fullName: args.form.fullName.trim(),
    email: normalizeEmail(args.form.email),
    role: args.form.role,
    active: args.form.active,
    status: args.form.active ? "active" : "inactive",
    teacherId:
      args.form.role === "teacher" ? num(args.form.teacherId) || null : null,
    studentId:
      args.form.role === "student" ? num(args.form.studentId) || null : null,
    parentId:
      args.form.role === "parent" ? num(args.form.parentId) || null : null,
    mustChangePassword: true,
    isDeleted: false,
    updatedAt: timestamp as any,
  };

  const allLocalRows: UserMembership[] = table?.toArray
    ? await table.toArray().catch(() => [])
    : [];
  const existing =
    (await table.get(id).catch(() => undefined)) ||
    allLocalRows.find((membership) =>
      membershipMatchesForm(
        membership,
        args.form,
        userId,
        args.schoolId,
        args.branchId,
      ),
    );

  if (existing?.id) {
    await table.update(authTableId(existing), {
      ...payload,
      id: authTableId(existing),
      version: Number(existing.version || 0) + 1,
    });
    return;
  }

  await table.add({
    ...(isStringPrimaryKeyTable(table) ? { id } : {}),
    ...payload,
    createdAt: timestamp as any,
    version: 1,
  });
}

async function deleteBackendMembership(candidate: Candidate) {
  const membershipId = String(authTableId(candidate.membership) || "").trim();
  if (!membershipId)
    throw new Error("Missing membership id for this access role.");

  // Requires the HARD DELETE backend fix where MembershipsService.remove()
  // uses prisma.userMembership.delete({ where: { id } }) instead of update(active:false).
  return firstWorkingAuthCall<any>([
    {
      endpoint: `/memberships/${encodeURIComponent(membershipId)}`,
      method: "DELETE",
    },
    {
      endpoint: `/user-memberships/${encodeURIComponent(membershipId)}`,
      method: "DELETE",
    },
    {
      endpoint: `/accounts/memberships/${encodeURIComponent(membershipId)}`,
      method: "DELETE",
    },
    {
      endpoint: `/accounts/user-memberships/${encodeURIComponent(membershipId)}`,
      method: "DELETE",
    },
  ]);
}

async function removeAuthAccessLocally(candidate: Candidate) {
  const membershipTable = getTable<UserMembership>(
    "userMemberships",
    "memberships",
  );
  const userTable = getTable<AppUser>("appUsers", "accountUsers", "users");
  const membershipId = authTableId(candidate.membership);
  const userId =
    userIdOf(candidate.user) || membershipUserId(candidate.membership);

  if (membershipTable && membershipId) {
    await membershipTable
      .delete(membershipId)
      .catch((error: any) =>
        console.warn("Failed to remove local membership cache:", error),
      );
  }

  if (userTable && userId && membershipTable?.toArray) {
    const remaining = await membershipTable.toArray();
    const hasOtherRole = remaining.some((membership: UserMembership) => {
      const sameUser = String(membershipUserId(membership)) === String(userId);
      const sameMembership =
        String(authTableId(membership) || "") === String(membershipId || "");
      return sameUser && !sameMembership && membership.isDeleted !== true;
    });

    if (!hasOtherRole) {
      await userTable
        .delete(userId)
        .catch((error: any) =>
          console.warn("Failed to remove local user cache:", error),
        );
    }
  }
}

function profileEmail(
  role: BranchAssignableRole,
  item: Teacher | Student | Parent,
) {
  if (role === "teacher") return normalizeEmail((item as Teacher).email);
  if (role === "parent") return normalizeEmail((item as Parent).email);
  const student = item as any;
  return normalizeEmail(student.email || student.studentEmail || "");
}

function profilePhone(
  role: BranchAssignableRole,
  item: Teacher | Student | Parent,
) {
  if (role === "teacher") return normalizePhone((item as Teacher).phone);
  if (role === "parent") return normalizePhone((item as Parent).phone);
  const student = item as Student;
  return normalizePhone((student as any).phone || student.parentPhone);
}

function profileSub(
  role: BranchAssignableRole,
  item: Teacher | Student | Parent,
) {
  if (role === "teacher")
    return (
      (item as Teacher).email || (item as Teacher).phone || "Teacher profile"
    );
  if (role === "parent")
    return (item as Parent).email || (item as Parent).phone || "Parent profile";
  const student = item as Student;
  return (
    student.admissionNumber ||
    (student as any).studentCode ||
    student.parentPhone ||
    "Student profile"
  );
}

// ======================================================
// COMPONENT
// ======================================================

export default function Usersroles() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();
  const { activeMembership } = useActiveMembership() as any;

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    null,
  );

  const [users, setUsers] = useState<AppUser[]>([]);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/select-role");
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      setUsers([]);
      setMemberships([]);
      setTeachers([]);
      setStudents([]);
      setParents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [teacherRows, studentRows, parentRows] = await Promise.all([
        activeRows<Teacher>("teachers"),
        activeRows<Student>("students"),
        activeRows<Parent>("parents"),
      ]);

      let userRows: AppUser[] = [];
      let membershipRows: UserMembership[] = [];

      try {
        // BACKEND-AUTH-FIRST LOAD:
        // Auth/access data comes from the backend AppUser/UserMembership tables.
        // Dexie is only a local read cache, not the source of truth.
        const remote = await fetchBackendBranchUsers({
          schoolId: schoolId,
          branchId: branchId,
        });

        const normalized = extractBackendUsersAndMemberships(remote);
        userRows = normalized.users;
        membershipRows = dedupeMemberships(normalized.memberships);

        // Cache only the returned branch-scoped auth data locally.
        for (const membership of membershipRows) {
          if (!ROLES.some((role) => role.value === membership.role)) continue;
          if (!sameTenant(membership, accountId, schoolId, branchId)) continue;

          const user =
            userRows.find(
              (row) =>
                String(userIdOf(row) || "") === String(membership.userId || ""),
            ) ||
            userRows.find((row) =>
              Boolean(
                row.email &&
                  membership.email &&
                  normalizeEmail(row.email) ===
                    normalizeEmail(membership.email),
              ),
            );

          if (!user) continue;

          const cacheForm: FormState = {
            mode: membership.role === "accountant" ? "manual" : "profile",
            membershipId: authTableId(membership),
            userId: String(userIdOf(user) || ""),
            title: membership.title || user.title || "",
            fullName:
              membership.fullName ||
              user.fullName ||
              user.name ||
              membership.email ||
              "Portal User",
            email: normalizeEmail(membership.email || user.email),
            phone: normalizePhone(user.phone),
            role: membership.role as BranchAssignableRole,
            active:
              membership.active !== false &&
              membership.status !== "inactive" &&
              user.active !== false &&
              user.status !== "inactive",
            temporaryPassword:
              user.temporaryPassword ||
              tempPasswordFromEmail(membership.email || user.email || ""),
            teacherId: membership.teacherId ? String(membership.teacherId) : "",
            studentId: membership.studentId ? String(membership.studentId) : "",
            parentId: membership.parentId ? String(membership.parentId) : "",
          };

          await cacheAuthUserLocally({
            user,
            form: cacheForm,
            accountId,
            schoolId: schoolId,
            branchId: branchId,
          });
          await cacheAuthMembershipLocally({
            membership,
            user,
            form: cacheForm,
            accountId,
            schoolId: schoolId,
            branchId: branchId,
          });
        }
      } catch (remoteError) {
        console.warn(
          "Backend auth user load failed; using local auth cache fallback:",
          remoteError,
        );
        [userRows, membershipRows] = await Promise.all([
          tableToArray<AppUser>("appUsers", "accountUsers", "users"),
          tableToArray<UserMembership>("userMemberships", "memberships"),
        ]);
      }

      const scopedMemberships = dedupeMemberships(membershipRows)
        .map((membership) => {
          const linkedUser =
            userRows.find(
              (user) =>
                String(userIdOf(user) || "") === membershipUserId(membership),
            ) ||
            userRows.find((user) =>
              Boolean(
                user.email &&
                  membership.email &&
                  normalizeEmail(user.email) ===
                    normalizeEmail(membership.email),
              ),
            );

          return {
            ...membership,
            accountId:
              membership.accountId || linkedUser?.accountId || accountId,
            schoolId: membership.schoolId ?? linkedUser?.schoolId ?? schoolId,
            branchId: membership.branchId ?? linkedUser?.branchId ?? branchId,
            email: membership.email || linkedUser?.email,
            fullName:
              membership.fullName || linkedUser?.fullName || linkedUser?.name,
            active: membership.active ?? linkedUser?.active,
            status: membership.status || linkedUser?.status,
            mustChangePassword:
              membership.mustChangePassword ?? linkedUser?.mustChangePassword,
          } as UserMembership;
        })
        .filter(
          (row) =>
            sameTenant(row, accountId, schoolId, branchId) &&
            ROLES.some((role) => role.value === row.role),
        );

      const scopedUsers = userRows.filter((row) => {
        if (row.isDeleted) return false;
        if (row.accountId && row.accountId !== accountId) return false;

        if (row.schoolId || row.branchId) {
          return sameTenant(row, accountId, schoolId, branchId);
        }

        return scopedMemberships.some(
          (membership) =>
            String(userIdOf(row) || "") === membershipUserId(membership) ||
            Boolean(
              row.email &&
                membership.email &&
                normalizeEmail(row.email) === normalizeEmail(membership.email),
            ),
        );
      });

      setUsers(scopedUsers);
      setMemberships(scopedMemberships);
      setTeachers(
        teacherRows.filter((row) =>
          sameTenant(row, accountId, schoolId, branchId),
        ),
      );
      setStudents(
        studentRows.filter((row) =>
          sameTenant(row, accountId, schoolId, branchId),
        ),
      );
      setParents(
        parentRows.filter((row) =>
          sameTenant(row, accountId, schoolId, branchId),
        ),
      );
    } catch (error) {
      console.error("Failed to load users and roles:", error);
      alert("Failed to load users and roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, dataRevision]);

  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = [];

    const addProfileCandidate = (
      role: Exclude<BranchAssignableRole, "accountant">,
      item: Teacher | Student | Parent,
    ) => {
      const profileId = item.id;
      const email = profileEmail(role, item);
      const phone = profilePhone(role, item);
      const fullName = respectfulName(item as any);
      const match = findUserAndMembership({
        role,
        profileId,
        email,
        users,
        memberships,
      });
      const state = accessState(match.user, match.membership);

      list.push({
        key: `${role}-${profileId || email || fullName}`,
        source: role,
        role,
        profileId,
        user: match.user,
        membership: match.membership,
        title: (item as any).title,
        fullName,
        email,
        phone,
        photo: (item as any).photo,
        subLabel: profileSub(role, item),
        ...state,
      });
    };

    teachers.forEach((teacher) => addProfileCandidate("teacher", teacher));
    students.forEach((student) => addProfileCandidate("student", student));
    parents.forEach((parent) => addProfileCandidate("parent", parent));

    memberships
      .filter((membership) => membership.role === "accountant")
      .forEach((membership) => {
        const user =
          users.find(
            (row) =>
              String(userIdOf(row) || "") === membershipUserId(membership),
          ) ||
          users.find((row) =>
            Boolean(
              row.email &&
                membership.email &&
                row.email.toLowerCase() === membership.email.toLowerCase(),
            ),
          );

        const fullName = respectfulName({
          title: user?.title || membership.title,
          fullName: user?.fullName || user?.name || membership.fullName,
          email: user?.email || membership.email,
        });
        const email = normalizeEmail(user?.email || membership.email);
        const state = accessState(user, membership);

        list.push({
          key: `accountant-${membership.id || email || fullName}`,
          source: "accountant",
          role: "accountant",
          user,
          membership,
          title: user?.title || membership.title,
          fullName,
          email,
          phone: normalizePhone(user?.phone),
          photo: user?.photo,
          subLabel: email || "Manual accountant access",
          ...state,
        });
      });

    return list.sort((a, b) => {
      const order: Record<BranchAssignableRole, number> = {
        accountant: 1,
        teacher: 2,
        student: 3,
        parent: 4,
      };
      return (
        order[a.role] - order[b.role] || a.fullName.localeCompare(b.fullName)
      );
    });
  }, [teachers, students, parents, users, memberships]);

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (roleFilter !== "all" && candidate.role !== roleFilter) return false;
      if (accessFilter === "enabled" && !candidate.enabled) return false;
      if (
        accessFilter === "notEnabled" &&
        (candidate.enabled || candidate.inactive)
      )
        return false;
      if (accessFilter === "inactive" && !candidate.inactive) return false;

      if (!query) return true;

      return `${candidate.fullName} ${candidate.email} ${candidate.phone} ${candidate.role} ${candidate.subLabel}`
        .toLowerCase()
        .includes(query);
    });
  }, [candidates, search, roleFilter, accessFilter]);

  const summary = useMemo(() => {
    return {
      total: candidates.length,
      teachers: candidates.filter((item) => item.role === "teacher").length,
      students: candidates.filter((item) => item.role === "student").length,
      parents: candidates.filter((item) => item.role === "parent").length,
      accountants: candidates.filter((item) => item.role === "accountant")
        .length,
      enabled: candidates.filter((item) => item.enabled).length,
      notEnabled: candidates.filter((item) => !item.enabled && !item.inactive)
        .length,
      inactive: candidates.filter((item) => item.inactive).length,
      temporary: candidates.filter((item) => item.mustChangePassword).length,
    };
  }, [candidates]);

  const updateForm = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "email") {
        const email = normalizeEmail(String(value));
        next.email = email;
        if (
          !current.temporaryPassword ||
          current.temporaryPassword === tempPasswordFromEmail(current.email)
        ) {
          next.temporaryPassword = tempPasswordFromEmail(email);
        }
      }

      if (key === "role") {
        next.teacherId = value === "teacher" ? current.teacherId : "";
        next.studentId = value === "student" ? current.studentId : "";
        next.parentId = value === "parent" ? current.parentId : "";
      }

      return next;
    });
    setMessage("");
  };

  const openManual = () => {
    setForm({ ...DEFAULT_FORM, temporaryPassword: "" });
    setMessage("");
    setDrawerOpen(true);
  };

  const openCandidate = (candidate: Candidate) => {
    setForm({
      mode: candidate.role === "accountant" ? "manual" : "profile",
      membershipId: candidate.membership?.id,
      userId: String(userIdOf(candidate.user) || ""),
      title: candidate.title || candidate.user?.title || "",
      fullName:
        candidate.user?.fullName || candidate.user?.name || candidate.fullName,
      email: candidate.email,
      phone: candidate.user?.phone || candidate.phone,
      role: candidate.role,
      active: !candidate.inactive,
      temporaryPassword:
        candidate.user?.temporaryPassword ||
        tempPasswordFromEmail(candidate.email),
      teacherId:
        candidate.role === "teacher" && candidate.profileId
          ? String(candidate.profileId)
          : String(candidate.membership?.teacherId || ""),
      studentId:
        candidate.role === "student" && candidate.profileId
          ? String(candidate.profileId)
          : String(candidate.membership?.studentId || ""),
      parentId:
        candidate.role === "parent" && candidate.profileId
          ? String(candidate.profileId)
          : String(candidate.membership?.parentId || ""),
    });
    setMessage("");
    setDrawerOpen(true);
  };

  const validate = () => {
    if (!form.email.trim())
      return "Email is required because portal users sign in with email and password.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Please enter a valid email address.";
    if (!form.fullName.trim()) return "Full name is required.";
    if (!ROLES.some((role) => role.value === form.role))
      return "Branch admin can assign only accountant, teacher, student, or parent.";
    if (!form.temporaryPassword.trim())
      return "Temporary password is required.";
    if (form.role === "teacher" && !form.teacherId)
      return "Teacher role must be linked to a teacher profile.";
    if (form.role === "student" && !form.studentId)
      return "Student role must be linked to a student profile.";
    if (form.role === "parent" && !form.parentId)
      return "Parent role must be linked to a parent profile.";
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

      // BACKEND-AUTH-FIRST WRITE:
      // This creates/updates the backend AppUser and UserMembership first.
      // Dexie is updated only as local cache after the backend succeeds.
      const response = await saveBackendBranchAccess({
        form,
        users,
        memberships,
        accountId: accountId!,
        schoolId: schoolId,
        branchId: branchId,
      });

      await cacheAuthUserLocally({
        user: response.user,
        form,
        accountId: accountId!,
        schoolId: schoolId,
        branchId: branchId,
      });

      await cacheAuthMembershipLocally({
        membership: response.membership,
        user: response.user,
        form,
        accountId: accountId!,
        schoolId: schoolId,
        branchId: branchId,
      });

      await updateLinkedProfileContactLocally({
        form,
        accountId: accountId!,
        schoolId: schoolId,
        branchId: branchId,
      });

      setDrawerOpen(false);
      await load();
    } catch (error: any) {
      console.error("Failed to save access through backend auth:", error);
      setMessage(
        error?.message ||
          "Failed to save access. Make sure the backend user and membership routes are running.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleAccess = async (candidate: Candidate) => {
    if (!candidate.membership?.id) {
      openCandidate(candidate);
      setMessage("Create portal access first.");
      return;
    }

    const nextActive = !candidate.enabled;

    try {
      setSaving(true);

      // Membership status controls access for this branch role.
      // Do not deactivate the whole AppUser because the same person may have another role.
      const membershipId = String(authTableId(candidate.membership));
      const membership = await authApi<UserMembership>(
        `/memberships/${encodeURIComponent(membershipId)}`,
        {
          method: "PATCH",
          body: {
            active: nextActive,
            status: nextActive ? "active" : "inactive",
          },
        },
      );

      const cacheForm: FormState = {
        mode: candidate.role === "accountant" ? "manual" : "profile",
        membershipId: authTableId(candidate.membership),
        userId: String(
          userIdOf(candidate.user) ||
            membershipUserId(candidate.membership) ||
            "",
        ),
        title: candidate.title || candidate.user?.title || "",
        fullName:
          candidate.user?.fullName ||
          candidate.user?.name ||
          candidate.fullName,
        email: candidate.email,
        phone: candidate.user?.phone || candidate.phone,
        role: candidate.role,
        active: nextActive,
        temporaryPassword:
          candidate.user?.temporaryPassword ||
          tempPasswordFromEmail(candidate.email),
        teacherId:
          candidate.role === "teacher" && candidate.profileId
            ? String(candidate.profileId)
            : String(candidate.membership?.teacherId || ""),
        studentId:
          candidate.role === "student" && candidate.profileId
            ? String(candidate.profileId)
            : String(candidate.membership?.studentId || ""),
        parentId:
          candidate.role === "parent" && candidate.profileId
            ? String(candidate.profileId)
            : String(candidate.membership?.parentId || ""),
      };

      if (candidate.user) {
        await cacheAuthUserLocally({
          user: candidate.user,
          form: cacheForm,
          accountId: accountId!,
          schoolId: schoolId,
          branchId: branchId,
        });
      }

      await cacheAuthMembershipLocally({
        membership,
        user:
          candidate.user ||
          ({ id: membership.userId, email: candidate.email } as AppUser),
        form: cacheForm,
        accountId: accountId!,
        schoolId: schoolId,
        branchId: branchId,
      });

      await load();
    } catch (error: any) {
      console.error("Failed to toggle access through backend auth:", error);
      alert(error?.message || "Failed to update access.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccess = async (candidate: Candidate) => {
    if (!candidate.membership?.id) {
      alert("No membership exists for this access record yet.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${roleLabel(candidate.role)} access for ${candidate.fullName}?\n\nThis removes the role/membership from the backend database. It does not just deactivate it.`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      await deleteBackendMembership(candidate);
      await removeAuthAccessLocally(candidate);
      await load();
    } catch (error: any) {
      console.error("Failed to delete access through backend auth:", error);
      alert(
        error?.message ||
          "Failed to delete this access role. Make sure MembershipsService.remove() performs a real prisma.userMembership.delete().",
      );
    } finally {
      setSaving(false);
    }
  };

  const activeFilterCount = useMemo(
    () =>
      [
        roleFilter !== "all" ? roleFilter : undefined,
        accessFilter !== "all" ? accessFilter : undefined,
      ].filter(Boolean).length,
    [roleFilter, accessFilter],
  );

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Users & Roles..."
        text="Loading teachers, students, parents and portal access."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing users and roles."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <State
        primary={primary}
        title="Assigned branch required"
        text="Users and roles are locked to your active school branch."
      />
    );
  }

  return (
    <main
      className="ba-page usersroles-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section
        className="ba-search-card"
        aria-label="Users and roles search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder="Search users..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search users and roles"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={openManual}
          aria-label="Add accountant"
          title="Add accountant"
        >
          +
        </button>

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

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active user filters">
          {roleFilter !== "all" && (
            <button type="button" onClick={() => setRoleFilter("all")}>
              Role: {roleLabel(roleFilter)} ×
            </button>
          )}
          {accessFilter !== "all" && (
            <button type="button" onClick={() => setAccessFilter("all")}>
              Access: {accessFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "table" && (
        <section className="ba-table-card usersroles-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>People ({filteredCandidates.length})</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Access</th>
                  <th>Password</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.key}>
                    <td>
                      <strong>{candidate.fullName}</strong>
                      <span>{candidate.phone || candidate.subLabel}</span>
                    </td>
                    <td>
                      <Chip tone={roleTone(candidate.role)}>
                        {roleIcon(candidate.role)} {roleLabel(candidate.role)}
                      </Chip>
                    </td>
                    <td>
                      {candidate.email || (
                        <span className="usersroles-warn">Email needed</span>
                      )}
                    </td>
                    <td>{candidate.source}</td>
                    <td>
                      <Chip
                        tone={
                          candidate.enabled
                            ? "green"
                            : candidate.inactive
                              ? "red"
                              : "orange"
                        }
                      >
                        {candidate.enabled
                          ? "Enabled"
                          : candidate.inactive
                            ? "Inactive"
                            : "Not Enabled"}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        tone={
                          candidate.mustChangePassword
                            ? "orange"
                            : candidate.hasLogin
                              ? "green"
                              : "gray"
                        }
                      >
                        {candidate.mustChangePassword
                          ? "Temporary"
                          : candidate.hasLogin
                            ? "Changed"
                            : "No login"}
                      </Chip>
                    </td>
                    <td>
                      <div className="ba-table-actions">
                        <button
                          type="button"
                          onClick={() => openCandidate(candidate)}
                        >
                          {candidate.hasMembership ? "Edit" : "Create"}
                        </button>
                        {candidate.hasMembership && (
                          <button
                            type="button"
                            onClick={() => toggleAccess(candidate)}
                          >
                            {candidate.enabled ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {candidate.hasMembership && (
                          <button
                            type="button"
                            className="ba-delete"
                            onClick={() => deleteAccess(candidate)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredCandidates.length && (
              <div className="ba-empty-table">
                No people or access records match the selected filters.
              </div>
            )}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list usersroles-list">
          {filteredCandidates.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className="student-row usersroles-row"
              onClick={() => setSelectedCandidate(candidate)}
            >
              <span className="usersroles-avatar">
                {candidate.photo ? (
                  <img src={candidate.photo} alt={candidate.fullName} />
                ) : (
                  initials(candidate.fullName)
                )}
              </span>
              <span className="student-main">
                <strong>{candidate.fullName}</strong>
                <small>
                  {roleIcon(candidate.role)} {roleLabel(candidate.role)} ·{" "}
                  {candidate.email || "Email needed"}
                </small>
                <em>{candidate.phone || candidate.subLabel}</em>
              </span>
              <span className="student-side">
                <span
                  className={`status-dot-mini ${candidate.enabled ? "green" : candidate.inactive ? "red" : "orange"}`}
                />
                <i>⋯</i>
              </span>
            </button>
          ))}
          {!filteredCandidates.length && (
            <Empty
              icon="🔐"
              title="No records found"
              text="No people or access records match the selected filters."
            />
          )}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          roleFilter={roleFilter}
          accessFilter={accessFilter}
          setRoleFilter={setRoleFilter}
          setAccessFilter={setAccessFilter}
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
        <div
          className="ba-sheet-backdrop usersroles-drawer-layer"
          role="dialog"
          aria-modal="true"
        >
          <aside className="ba-sheet usersroles-drawer">
            <div className="ba-sheet-head">
              <div>
                <h2>{form.membershipId ? "Edit Access" : "Create Access"}</h2>
                <p>
                  {form.mode === "manual"
                    ? "Manual Accountant Access"
                    : "Profile Portal Access"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close access form"
              >
                ✕
              </button>
            </div>

            {message && (
              <section className="ba-warning usersroles-message">
                {message}
              </section>
            )}

            <section className="usersroles-note">
              <strong>Temporary password rule</strong>
              <span>
                Password is generated from the email prefix plus @123. The user
                must change it after login.
              </span>
            </section>

            <div className="ba-form compact">
              <label>
                <span>Title</span>
                <select
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                >
                  {TITLES.map((title) => (
                    <option key={title || "none"} value={title}>
                      {title || "No title"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Role</span>
                <select
                  value={form.role}
                  disabled={form.mode === "profile"}
                  onChange={(event) =>
                    updateForm(
                      "role",
                      event.target.value as BranchAssignableRole,
                    )
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Full Name</span>
                <input
                  value={form.fullName}
                  onChange={(event) =>
                    updateForm("fullName", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="user@example.com"
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                />
              </label>
              <label>
                <span>Temporary Password</span>
                <input
                  value={form.temporaryPassword}
                  onChange={(event) =>
                    updateForm("temporaryPassword", event.target.value)
                  }
                />
              </label>
            </div>

            {form.role === "teacher" && (
              <ProfileSelect
                label="Teacher Profile"
                value={form.teacherId}
                disabled={form.mode === "profile"}
                onChange={(value) => updateForm("teacherId", value)}
                options={teachers.map((item) => ({
                  value: String(item.id || ""),
                  label: respectfulName(item as any),
                  sub: item.email || item.phone || "",
                }))}
              />
            )}
            {form.role === "student" && (
              <ProfileSelect
                label="Student Profile"
                value={form.studentId}
                disabled={form.mode === "profile"}
                onChange={(value) => updateForm("studentId", value)}
                options={students.map((item) => ({
                  value: String(item.id || ""),
                  label: respectfulName(item as any),
                  sub: item.admissionNumber || item.parentPhone || "",
                }))}
              />
            )}
            {form.role === "parent" && (
              <ProfileSelect
                label="Parent Profile"
                value={form.parentId}
                disabled={form.mode === "profile"}
                onChange={(value) => updateForm("parentId", value)}
                options={parents.map((item) => ({
                  value: String(item.id || ""),
                  label: respectfulName(item as any),
                  sub: item.email || item.phone || "",
                }))}
              />
            )}

            <label className="usersroles-switch-row">
              <div>
                <strong>Active access</strong>
                <span>
                  Inactive users remain recorded but cannot use this branch
                  role.
                </span>
              </div>
              <button
                type="button"
                className={`usersroles-switch ${form.active ? "on" : ""}`}
                onClick={() => updateForm("active", !form.active)}
                aria-pressed={form.active}
              >
                <span />
              </button>
            </label>

            <div className="ba-sheet-actions">
              <button type="button" onClick={() => setDrawerOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={saveAccess}
              >
                {saving ? "Saving..." : "Save Access"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page usersroles-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function FilterSheet({
  roleFilter,
  accessFilter,
  setRoleFilter,
  setAccessFilter,
  onClose,
}: {
  roleFilter: RoleFilter;
  accessFilter: AccessFilter;
  setRoleFilter: (value: RoleFilter) => void;
  setAccessFilter: (value: AccessFilter) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Filter people by role and portal access state.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>
        <div className="ba-form compact">
          <label>
            <span>Role</span>
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as RoleFilter)
              }
            >
              <option value="all">All Roles</option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Access</span>
            <select
              value={accessFilter}
              onChange={(event) =>
                setAccessFilter(event.target.value as AccessFilter)
              }
            >
              <option value="all">All Access</option>
              <option value="enabled">Access Enabled</option>
              <option value="notEnabled">Not Enabled</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button
            type="button"
            onClick={() => {
              setRoleFilter("all");
              setAccessFilter("all");
            }}
          >
            Clear
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
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
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onAdd: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>View and quick actions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => {
              setViewMode("cards");
              onClose();
            }}
          >
            <span>☰</span>
            <b>Cards view</b>
            <small>Compact people-first cards</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => {
              setViewMode("table");
              onClose();
            }}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense access register</small>
          </button>
          <button
            type="button"
            onClick={() => {
              onAdd();
              onClose();
            }}
          >
            <span>+</span>
            <b>Add accountant</b>
            <small>Create manual accountant portal access</small>
          </button>
          <button
            type="button"
            onClick={() => {
              onRefresh();
              onClose();
            }}
          >
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload backend and local cache</small>
          </button>
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
  toggleAccess: (candidate: Candidate) => void | Promise<void>;
  deleteAccess: (candidate: Candidate) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div>
            <h2>{candidate.fullName}</h2>
            <p>
              {roleIcon(candidate.role)} {roleLabel(candidate.role)} ·{" "}
              {candidate.email || "Email needed"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close user actions"
          >
            ✕
          </button>
        </div>
        <div className="student-detail-strip">
          <span>
            <b>Source</b>
            {candidate.source}
          </span>
          <span>
            <b>Access</b>
            {candidate.enabled
              ? "Enabled"
              : candidate.inactive
                ? "Inactive"
                : "Not enabled"}
          </span>
          <span>
            <b>Password</b>
            {candidate.mustChangePassword
              ? "Temporary"
              : candidate.hasLogin
                ? "Changed"
                : "No login"}
          </span>
        </div>
        <div className="ba-menu-list">
          <button
            type="button"
            onClick={() => {
              openCandidate(candidate);
              onClose();
            }}
          >
            <span>✎</span>
            <b>{candidate.hasMembership ? "Edit access" : "Prepare access"}</b>
            <small>Update login, membership and linked profile details</small>
          </button>
          {candidate.hasMembership && (
            <button
              type="button"
              onClick={() => {
                toggleAccess(candidate);
                onClose();
              }}
            >
              <span>{candidate.enabled ? "⏸" : "✓"}</span>
              <b>{candidate.enabled ? "Deactivate" : "Activate"}</b>
              <small>
                {candidate.enabled
                  ? "Pause this branch role"
                  : "Restore this branch role"}
              </small>
            </button>
          )}
          {candidate.hasMembership && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                deleteAccess(candidate);
                onClose();
              }}
            >
              <span>⌫</span>
              <b>Delete role</b>
              <small>Remove this backend membership role</small>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; sub?: string }[];
  disabled?: boolean;
}) {
  return (
    <section className="usersroles-profile-select">
      <label>
        <span>{label}</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select profile</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.sub ? ` · ${option.sub}` : ""}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page button {
  -webkit-tap-highlight-color: transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state,
.ba-search-card,
.ba-summary-line,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-sheet,
.ba-modal,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-state-button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--ba-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}

.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

/* Compact search/action strip. The page intentionally has no duplicate title header. */
.ba-topbar,
.ba-title,
.ba-topbar-actions {
  display: none;
}

.ba-icon-button,
.ba-filter-button,
.ba-add-inline {
  width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}


.ba-add-inline {
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 42px);
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
}

.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}

.ba-slider-icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ba-filter-button {
  position: relative;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-filter-button b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  border: 2px solid var(--card-bg,#fff);
}

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}

.ba-summary-line div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ba-summary-line strong {
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-summary-line span,
.ba-summary-line p {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
}

.ba-summary-line p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-filter-chips::-webkit-scrollbar {
  display: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}

.student-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}

.ba-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.student-main,
.student-main strong,
.student-main small,
.student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.student-main small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}

.student-main em {
  margin-top: 3px;
  color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827));
  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}

.student-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}

.student-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.status-dot-mini {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
}

.status-dot-mini.green { background: #22c55e; }
.status-dot-mini.red { background: #ef4444; }
.status-dot-mini.blue { background: #3b82f6; }
.status-dot-mini.orange { background: #f59e0b; }
.status-dot-mini.gray { background: var(--muted,#64748b); }

.status-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 8px;
}

.status-sheet-grid span {
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.status-sheet-grid b {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.status-sheet-grid em {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text,#111827);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.ba-sheet-backdrop,
.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}

.ba-sheet {
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}

.ba-sheet.small {
  width: min(520px, 100%);
}

@keyframes sheetIn {
  from { transform: translateY(16px); opacity: .7; }
  to { transform: translateY(0); opacity: 1; }
}

.ba-sheet-head,
.ba-sheet-profile {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.ba-sheet-head h2,
.ba-sheet-profile h2,
.ba-modal-head h2 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-sheet-head p,
.ba-sheet-profile p,
.ba-modal-head p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.ba-sheet-head button,
.ba-sheet-profile button,
.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}

.ba-sheet-actions,
.ba-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}

.ba-sheet-actions button,
.ba-modal-actions button {
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-sheet-actions button.primary,
.ba-modal-actions button:last-child {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}

.ba-menu-list button span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list button b,
.ba-menu-list button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list button b {
  font-size: 13px;
  font-weight: 1000;
}

.ba-menu-list button small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.ba-menu-list button.active {
  border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff));
}

.ba-menu-list button.danger span {
  background: color-mix(in srgb, #dc2626 10%, transparent);
  color: #dc2626;
}

.ba-menu-list button.danger b {
  color: #991b1b;
}

.student-detail-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.student-detail-strip span {
  display: block;
  padding: 9px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-detail-strip b {
  display: block;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

.ba-form.compact {
  gap: 9px;
}

.ba-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ba-form span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-form-section {
  padding: 12px 0;
  border-top: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-form-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.ba-form-section h3 {
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.ba-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ba-media-button {
  width: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--ba-primary);
  color: #fff !important;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0 !important;
  text-transform: none !important;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}

.ba-media-button input {
  display: none;
}

.ba-preview-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-preview-banner {
  width: 100%;
  height: 130px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}

.ba-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 10px;
  margin-top: 10px;
}

.ba-analysis,
.ba-table-card,
.ba-empty {
  padding: 13px;
  border-radius: 24px;
}

.ba-analysis span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-analysis strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px,7vw,30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ba-analysis p {
  margin: 8px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-analysis-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-analysis-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ba-analysis-list b,
.ba-analysis-list small {
  font-size: 12px;
}

.ba-analysis-list small {
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-progress {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent);
  overflow: hidden;
}

.ba-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ba-primary);
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-table-card {
  margin-top: 10px;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-table-scroll td span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.ba-table-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-table-actions::-webkit-scrollbar {
  display: none;
}

.ba-table-actions button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 10px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-table-actions button:first-child {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-delete,
.ba-table-actions button.ba-delete {
  color: #991b1b;
  background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff));
  border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)));
}

.ba-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted,#64748b);
  font-weight: 850;
}

@media (min-width: 680px) {
  .ba-page {
    padding: calc(12px * var(--local-density-scale,1));
    padding-bottom: 44px;
  }

  .ba-search-card {
    grid-template-columns: minmax(0,1fr) repeat(3, 42px);
  }

  .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .student-row {
    border-radius: 24px;
    padding: 12px;
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-modal-backdrop,
  .ba-sheet-backdrop {
    place-items: center;
    padding: 18px;
  }

  .ba-sheet {
    border-radius: 28px;
    padding: 18px;
  }

  .ba-modal {
    padding: 18px;
  }

}

@media (min-width: 1040px) {
  .ba-page {
    padding: calc(16px * var(--local-density-scale,1));
    padding-bottom: 48px;
  }

  .ba-search-card,
  .ba-summary-line,
  .ba-list,
  .ba-analysis-grid,
  .ba-table-card,
  .ba-filter-chips {
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }

  .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  .ba-current-filter {
    grid-column: span 2;
  }

  .ba-form {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

}

@media (max-width: 520px) {
  .ba-page {
    padding: calc(7px * var(--local-density-scale,1));
    padding-bottom: max(38px, env(safe-area-inset-bottom));
  }

  .ba-title h1 {
    font-size: 28px;
  }

  .ba-icon-button,
  .ba-filter-button,
  .ba-add-inline {
    width: 40px;
    height: 40px;
  }

  .ba-summary-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .student-detail-strip {
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet,
  .ba-modal {
    border-radius: 24px 24px 18px 18px;
    padding: 12px;
  }

  .ba-sheet-actions,
  .ba-modal-actions {
    display: grid;
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet-actions button,
  .ba-modal-actions button {
    width: 100%;
  }
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.ba-media-button {
  min-height: 40px;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary);
  box-shadow: none;
}

.ba-media-hint {
  display: block;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.camera-backdrop {
  z-index: 100;
  place-items: center;
}

.ba-camera-modal {
  width: min(720px, 100%);
  max-height: min(92dvh, 880px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-camera-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 24px;
  background: #020617;
  border: 1px solid var(--border, rgba(0,0,0,.10));
}

.ba-camera-preview video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #020617;
}

.ba-camera-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(2,6,23,.72);
  color: #fff;
  font-size: 13px;
  font-weight: 950;
}

.ba-camera-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ba-camera-actions button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-camera-secondary {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--surface, #fff));
  color: var(--text, #111827);
}

.ba-camera-primary {
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-camera-actions button:disabled {
  opacity: .62;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .ba-media-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ba-media-button,
  .ba-camera-actions button {
    width: 100%;
  }

  .ba-camera-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-camera-modal {
    border-radius: 22px;
    padding: 11px;
  }
}

/* Broadsheets golden additions */

/* Extra compact report-only layout */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}


.student-reports-page .ba-list {
  grid-template-columns: minmax(0, 1fr);
}

.ba-report-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  font-size: 18px;
  color: var(--ba-primary);
}

.ba-print-card {
  margin-top: 10px;
  background: var(--card-bg, var(--surface,#fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 24px;
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
  overflow: hidden;
}

.ba-print-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  background: color-mix(in srgb, var(--muted,#64748b) 6%, transparent);
}

.ba-print-head span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-print-head strong {
  display: block;
  margin-top: 3px;
  color: var(--text,#111827);
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-print-head p {
  margin: 3px 0 0;
  color: var(--muted,#64748b);
  font-size: 11px;
  line-height: 1.4;
}

.ba-print-zone {
  padding: 10px;
  background: var(--card-bg, var(--surface,#fff));
}

.ba-report-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
}

.ba-report-toolbar button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--card-bg,#fff));
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-report-toolbar button.primary {
  background: var(--ba-primary);
  color: #fff;
}

.report-table-card {
  grid-column: 1 / -1;
}

.report-table-card > div {
  margin-top: 10px;
}

@media (min-width: 680px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1320px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media print {
  .report-no-print,
  .ba-search-card,
  .ba-filter-chips,
  .ba-sheet-backdrop,
  .ba-modal-backdrop,
  .ba-toast,
  .ba-print-head,
  .ba-report-toolbar {
    display: none !important;
  }

  .ba-page,
  .ba-print-card,
  .ba-print-zone {
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
}


/* StudentReports final golden fixes: one-row action strip, theme-safe buttons/tables, clean preview */
.student-reports-page .ba-search-card {
  grid-template-columns: minmax(0, 1fr) repeat(4, 42px) !important;
  gap: 7px;
  align-items: center;
  overflow: hidden;
}

.student-reports-page .ba-search {
  min-width: 0;
  overflow: hidden;
}

.student-reports-page .ba-icon-button,
.student-reports-page .ba-filter-button,
.student-reports-page .ba-view-button,
.student-reports-page .ba-add-inline {
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  flex: 0 0 42px;
  border-color: var(--border, rgba(0,0,0,.10));
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-add-inline {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-filter-button {
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.student-reports-page .ba-filter-button.active {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-view-button {
  background: color-mix(in srgb, var(--muted,#64748b) 8%, var(--card-bg,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-icon-button:hover,
.student-reports-page .ba-view-button:hover {
  border-color: color-mix(in srgb, var(--ba-primary) 28%, var(--border,rgba(0,0,0,.10)));
  color: var(--ba-primary);
}

.student-reports-page .ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface,#fff))));
  color: var(--table-header-text, var(--muted, var(--text,#111827)));
}

.student-reports-page .ba-table-scroll table,
.student-reports-page .ba-table-scroll td {
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-print-head {
  align-items: center;
}

@media (max-width: 520px) {
  .student-reports-page .ba-search-card {
    grid-template-columns: minmax(0, 1fr) repeat(4, 38px) !important;
    gap: 5px;
    padding: 6px;
  }

  .student-reports-page .ba-icon-button,
  .student-reports-page .ba-filter-button,
  .student-reports-page .ba-view-button,
  .student-reports-page .ba-add-inline {
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    flex-basis: 38px;
  }

  .student-reports-page .ba-search {
    min-height: 38px;
    padding: 0 8px;
  }

  .student-reports-page .ba-search input {
    min-height: 38px;
    font-size: 13px;
  }
}



/* Broadsheets compact overrides */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}



/* Promotion compact golden additions */

/* Promotion table view */
.promotion-table-card{margin-top:8px}
.promotion-table-card .ba-table-scroll table{min-width:1180px}
.promotion-table-card select,
.promotion-table-card input{
  min-height:34px;
  border-radius:12px;
  font-size:11px;
  padding:0 9px;
}
.promo-table-student{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  gap:8px;
  align-items:center;
}
.promo-table-student input{
  width:15px;
  min-height:15px;
  accent-color:var(--ba-primary);
}
.promo-table-student span,
.promo-table-student strong,
.promo-table-student small{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.promo-table-student small{
  margin-top:3px;
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:750;
}


/* Extra compact promotion cleanup */
.promotion-page .ba-list{margin-top:8px;gap:7px}
.promotion-page .ba-add-inline{
  width:42px;
  min-width:42px;
  padding:0;
  font-size:11px;
  letter-spacing:0;
}
.promo-row-card{
  border-radius:18px;
  padding:8px;
}
.promo-row-top{
  gap:8px;
}
.promo-check{
  width:24px;
  height:24px;
  border-radius:10px;
}
.promo-check input{
  width:14px;
  min-height:14px;
}
.promo-avatar{
  width:34px;
  height:34px;
  border-radius:13px;
  font-size:13px;
}
.promotion-page .student-main strong{
  font-size:13px;
}
.promotion-page .student-main small{
  font-size:11px;
}
.promotion-page .student-main em{
  font-size:10px;
}
.promo-mini-grid{
  gap:5px;
  margin-top:7px;
}
.promo-mini-stat{
  padding:6px 7px;
  border-radius:12px;
}
.promo-mini-stat b{
  font-size:12px;
}
.promo-mini-stat small{
  font-size:9px;
}
.promo-row-controls{
  gap:6px;
  margin-top:7px;
}
.promo-row-controls span{
  font-size:9px;
}
.promotion-page input,
.promotion-page select{
  min-height:38px;
  border-radius:13px;
  font-size:12px;
}
.promo-chip-row{
  gap:5px;
  margin-top:7px;
}
.promotion-page .ba-chip{
  min-height:22px;
  padding:3px 7px;
  font-size:10px;
}

.promotion-page .promotion-list{grid-template-columns:minmax(0,1fr)}
.promo-row-card{min-width:0;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045);padding:10px;overflow:hidden}
.promo-row-top{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:10px}
.promo-check{width:28px;height:28px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}
.promo-check input{width:15px;min-height:15px;accent-color:var(--ba-primary)}
.promo-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 14%,transparent);color:var(--ba-primary);font-size:15px;font-weight:1000}
.promo-mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}
.promo-mini-stat{display:grid;gap:2px;min-width:0;padding:8px;border-radius:15px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.promo-mini-stat b,.promo-mini-stat small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.promo-mini-stat b{color:var(--text,#111827);font-size:14px;font-weight:1000}
.promo-mini-stat small{color:var(--muted,#64748b);font-size:10px;font-weight:850}
.promo-row-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:9px}
.promo-row-controls label{display:grid;gap:5px}
.promo-row-controls span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}
.promo-row-controls .wide{grid-column:1/-1}
.promo-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.ba-menu-list button:disabled{opacity:.55;cursor:not-allowed}

@media(min-width:680px){
  .promotion-page .promotion-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .promo-row-controls{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:1040px){
  .promotion-page .promotion-list{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(min-width:1320px){
  .promotion-page .promotion-list{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:520px){
  .promo-row-top{grid-template-columns:auto minmax(0,1fr) auto}
  .promo-check{grid-row:1;grid-column:1}
  .promo-avatar{display:none}
  .promo-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .promo-context-card{border-radius:18px}
}


.usersroles-page .usersroles-list{grid-template-columns:minmax(0,1fr)}
.usersroles-page .ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto}
.usersroles-avatar{width:40px;height:40px;display:grid;place-items:center;overflow:hidden;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 12%,transparent);color:var(--ba-primary);font-size:12px;font-weight:1000}
.usersroles-avatar img{width:100%;height:100%;object-fit:cover}
.usersroles-row{padding:9px}.usersroles-table-card{margin-top:10px}.usersroles-table-card .ba-table-scroll table{min-width:980px}.usersroles-warn{color:#b45309;font-size:12px;font-weight:850}
.usersroles-drawer{width:min(760px,100%)}.usersroles-message{margin:0 0 10px}
.usersroles-note{display:grid;gap:3px;margin-bottom:10px;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}
.usersroles-note strong{font-size:12px;font-weight:1000}.usersroles-note span{font-size:11px;line-height:1.5;font-weight:750}
.usersroles-profile-select{margin-top:10px;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.usersroles-profile-select label{display:grid;gap:6px}.usersroles-profile-select span,.usersroles-switch-row span{color:var(--muted,#64748b);font-size:11px;font-weight:850}
.usersroles-switch-row{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:10px;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}
.usersroles-switch-row strong{display:block;font-size:13px;font-weight:1000}.usersroles-switch{flex:0 0 auto;width:48px;height:28px;border:0;border-radius:999px;padding:3px;background:color-mix(in srgb,var(--muted,#64748b) 20%,transparent);cursor:pointer}
.usersroles-switch span{display:block;width:22px;height:22px;border-radius:999px;background:var(--card-bg,#fff);transition:transform .16s var(--ease)}.usersroles-switch.on{background:var(--ba-primary)}.usersroles-switch.on span{transform:translateX(20px)}
.ba-menu-list button.danger span{background:rgba(239,68,68,.10);color:#dc2626}.ba-menu-list button:disabled,.ba-add-inline:disabled{opacity:.55;cursor:not-allowed}
@media(min-width:680px){.usersroles-page .usersroles-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1040px){.usersroles-page .usersroles-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1320px){.usersroles-page .usersroles-list{grid-template-columns:repeat(4,minmax(0,1fr))}}

`;
