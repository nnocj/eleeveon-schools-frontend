"use client";

/**
 * app/developer/modules/DeveloperTeam.tsx
 * ---------------------------------------------------------
 * DEVELOPER / PLATFORM TEAM MANAGEMENT - AUTH-FIRST VERSION
 * ---------------------------------------------------------
 * This file does NOT only save a local staff card.
 * It creates/updates real backend AppUser + UserMembership records first so
 * added people can sign in with email + temporary password.
 *
 * Important:
 * - Platform team members are NOT attached to any school or branch.
 * - Browser does not push auth tables through SyncRecord.
 * - Backend auth is source of truth; Dexie/localStorage are only display caches.
 * - Department, title and fine-grained permissions are UI/team metadata.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { db } from "../../lib/db/db";

type Props = { navigate?: (key: string) => void };
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type PlatformRole =
  | "developer"
  | "platform_admin"
  | "support_agent"
  | "billing_officer"
  | "qa_tester"
  | "sync_technician";

type BackendRole = "developer" | "platform_team";
type Department = "Engineering" | "Support" | "Billing" | "QA" | "Operations" | "Management";

type PermissionKey =
  | "canViewAccounts"
  | "canManageAccounts"
  | "canManageSubscriptions"
  | "canViewPayments"
  | "canManagePayments"
  | "canResolveSupport"
  | "canViewDiagnostics"
  | "canViewAuditLogs"
  | "canManageReleases"
  | "canManageBackups"
  | "canManageSettings";

type PermissionMap = Record<PermissionKey, boolean>;

type AppUser = {
  id?: string | number;
  localId?: string | number;
  cloudId?: string | null;
  accountId?: string | null;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  role?: string;
  active?: boolean;
  status?: string;
  lastLoginAt?: string | number | null;
  createdAt?: string | number;
  updatedAt?: string | number;
  memberships?: UserMembership[];
  userMemberships?: UserMembership[];
  isDeleted?: boolean;
  version?: number;
};

type UserMembership = {
  id?: string | number;
  localId?: string | number;
  cloudId?: string | null;
  accountId?: string | null;
  userId?: string | number | null;
  userLocalId?: string | number | null;
  accountUserId?: string | number | null;
  role?: string;
  schoolId?: number | null;
  branchId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
  active?: boolean;
  status?: string;
  fullName?: string;
  email?: string;
  mustChangePassword?: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
  isDeleted?: boolean;
  version?: number;
};

type PlatformTeamMeta = {
  id: string;
  userId?: string;
  membershipId?: string;
  email: string;
  platformRole: PlatformRole;
  backendRole: BackendRole;
  department: Department;
  title?: string | null;
  permissions: PermissionMap;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type TeamMember = {
  id: string;
  userId?: string;
  membershipId?: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: PlatformRole;
  backendRole: BackendRole;
  department: Department;
  title?: string | null;
  status: "active" | "inactive" | "suspended";
  permissions: PermissionMap;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  lastActiveAt?: string | number | null;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type TeamForm = {
  id?: string;
  userId?: string;
  membershipId?: string;
  fullName: string;
  email: string;
  phone: string;
  role: PlatformRole;
  department: Department;
  title: string;
  status: "active" | "inactive" | "suspended";
  permissions: PermissionMap;
  temporaryPassword: string;
  mustChangePassword: boolean;
};

type ChartRow = { label: string; value: number };

type BackendTeamPayload = {
  accountId: string;
  fullName: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  temporaryPassword: string;
  role: BackendRole;
  platformRole: PlatformRole;
  department: Department;
  title?: string;
  permissions: PermissionMap;
  mustChangePassword: boolean;
  active: boolean;
  status: "active" | "inactive" | "suspended";
  userId?: string;
  membershipId?: string;
};

const STORAGE_KEY = "eleeveon_developer_team_members";
const META_KEY = "eleeveon_platform_team_auth_metadata";

const ROLE_OPTIONS: { value: PlatformRole; label: string; description: string; backendRole: BackendRole }[] = [
  { value: "developer", label: "Developer", backendRole: "developer", description: "Core engineering access. Use carefully." },
  { value: "platform_admin", label: "Platform Admin", backendRole: "platform_team", description: "Leads platform operations without raw database power." },
  { value: "support_agent", label: "Support Agent", backendRole: "platform_team", description: "Handles tickets, onboarding support and client issues." },
  { value: "billing_officer", label: "Billing Officer", backendRole: "platform_team", description: "Handles subscriptions, invoices and payment follow-up." },
  { value: "qa_tester", label: "QA Tester", backendRole: "platform_team", description: "Tests releases, features, bugs and platform quality." },
  { value: "sync_technician", label: "Sync Technician", backendRole: "platform_team", description: "Supports offline-first sync and diagnostics." },
];

const DEPARTMENTS: Department[] = ["Engineering", "Support", "Billing", "QA", "Operations", "Management"];

const PERMISSIONS: { key: PermissionKey; label: string; description: string; danger?: boolean }[] = [
  { key: "canViewAccounts", label: "View Accounts", description: "Can view SaaS client accounts." },
  { key: "canManageAccounts", label: "Manage Accounts", description: "Can edit onboarding and safe account details." },
  { key: "canManageSubscriptions", label: "Manage Subscriptions", description: "Can help with plan and subscription support." },
  { key: "canViewPayments", label: "View Payments", description: "Can inspect billing and payment records." },
  { key: "canManagePayments", label: "Manage Payments", description: "Can verify or reconcile payment records." },
  { key: "canResolveSupport", label: "Resolve Support", description: "Can handle and close support tickets." },
  { key: "canViewDiagnostics", label: "View Diagnostics", description: "Can inspect sync and system health tools." },
  { key: "canViewAuditLogs", label: "View Audit Logs", description: "Can inspect security and activity logs.", danger: true },
  { key: "canManageReleases", label: "Manage Releases", description: "Can prepare releases, rollbacks and changelogs.", danger: true },
  { key: "canManageBackups", label: "Manage Backups", description: "Can run backup and recovery operations.", danger: true },
  { key: "canManageSettings", label: "Manage Settings", description: "Can change platform-team settings.", danger: true },
];

const EMPTY_PERMISSIONS: PermissionMap = {
  canViewAccounts: false,
  canManageAccounts: false,
  canManageSubscriptions: false,
  canViewPayments: false,
  canManagePayments: false,
  canResolveSupport: false,
  canViewDiagnostics: false,
  canViewAuditLogs: false,
  canManageReleases: false,
  canManageBackups: false,
  canManageSettings: false,
};

const DEFAULT_PERMISSIONS_BY_ROLE: Record<PlatformRole, PermissionMap> = {
  developer: Object.fromEntries(Object.keys(EMPTY_PERMISSIONS).map((k) => [k, true])) as PermissionMap,
  platform_admin: {
    ...EMPTY_PERMISSIONS,
    canViewAccounts: true,
    canManageAccounts: true,
    canManageSubscriptions: true,
    canViewPayments: true,
    canResolveSupport: true,
    canViewDiagnostics: true,
    canViewAuditLogs: true,
    canManageReleases: true,
  },
  support_agent: { ...EMPTY_PERMISSIONS, canViewAccounts: true, canResolveSupport: true, canViewDiagnostics: true },
  billing_officer: { ...EMPTY_PERMISSIONS, canViewAccounts: true, canManageSubscriptions: true, canViewPayments: true, canManagePayments: true },
  qa_tester: { ...EMPTY_PERMISSIONS, canViewDiagnostics: true, canManageReleases: true },
  sync_technician: { ...EMPTY_PERMISSIONS, canViewAccounts: true, canResolveSupport: true, canViewDiagnostics: true },
};

const EMPTY_FORM: TeamForm = {
  fullName: "",
  email: "",
  phone: "",
  role: "support_agent",
  department: "Support",
  title: "",
  status: "active",
  permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE.support_agent },
  temporaryPassword: "",
  mustChangePassword: true,
};

const chartColors = ["var(--dev-primary)", "#0f172a", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#64748b"];

const toArray = <T,>(value: any, keys: string[] = []): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as T[];
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (Array.isArray(value.results)) return value.results as T[];
  if (Array.isArray(value.records)) return value.records as T[];
  if (Array.isArray(value.rows)) return value.rows as T[];
  return [];
};

const safeTime = (value?: string | number | null) => {
  if (!value) return 0;
  const time = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const dateText = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(time));
};

const timeText = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
};

function makeLocalAuthId(prefix: string) {
  const safePrefix = String(prefix || "auth").replace(/[^a-zA-Z0-9_-]/g, "");
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}_${random}`;
}

function isStringPrimaryKeyTable(table: any) {
  const primaryKey = table?.schema?.primKey;
  return primaryKey?.keyPath === "id" && primaryKey?.auto === false;
}

function dateishNowForAuthTable(table: any) {
  return isStringPrimaryKeyTable(table) ? new Date().toISOString() : Date.now();
}

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  if (!table?.toArray) return [];
  return table.toArray();
}

function normalizeEmail(email?: string | number | boolean | null) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizePhone(phone?: string | number | boolean | null) {
  return String(phone ?? "").trim().replace(/\s+/g, " ");
}

function tempPasswordFromEmail(email: string) {
  const prefix = normalizeEmail(email).split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix || "team"}@${new Date().getFullYear()}${tail}`;
}

function userIdOf(user?: AppUser) {
  return user?.id ?? user?.localId;
}

function membershipUserId(membership?: UserMembership) {
  return String(membership?.userId ?? membership?.userLocalId ?? membership?.accountUserId ?? "");
}

const roleOption = (role: PlatformRole | string) => ROLE_OPTIONS.find((item) => item.value === role);
const roleLabel = (role: PlatformRole | string) => roleOption(role)?.label || String(role || "Team Member");
const backendRoleFor = (role: PlatformRole): BackendRole => roleOption(role)?.backendRole || "platform_team";
const statusTone = (status?: string): Tone => (status === "active" ? "green" : status === "suspended" ? "red" : "gray");
const roleTone = (role?: string): Tone => (role === "developer" ? "purple" : role === "platform_admin" ? "blue" : role === "billing_officer" ? "green" : role === "support_agent" ? "orange" : "gray");
const permissionCount = (permissions?: PermissionMap) => (permissions ? Object.values(permissions).filter(Boolean).length : 0);

function initials(name: string) {
  return String(name || "Team").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TM";
}

async function authApi<T = any>(
  endpoint: string,
  options: {
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: any;
  }
): Promise<T> {
  try {
    return await apiClient<T>(endpoint, {
      method: options.method,
      body: options.body,
    } as any);
  } catch (error: any) {
    const message = String(
      error?.message || error || "Request failed"
    );
    throw new Error(
      `${options.method} ${endpoint} failed: ${message}`
    );
  }
}

function endpointErrorMessage(error: any) {
  return String(error?.message || error?.statusText || error || "");
}

function isEndpointMissing(error: any) {
  const message = endpointErrorMessage(error).toLowerCase();
  return error?.status === 404 || error?.statusCode === 404 || message.includes("404") || message.includes("not found") || message.includes("cannot ") || message.includes("no route");
}

async function firstWorkingAuthCall<T = any>(attempts: Array<{ endpoint: string; method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: any }>): Promise<T> {
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
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.members)) return value.members;
  return [];
}

function extractBackendUsersAndMemberships(remote: any) {
  const userCandidates = [remote?.users, remote?.appUsers, remote?.accountUsers, remote?.platformTeam, remote?.members, remote?.team, remote?.data?.users, remote?.data?.appUsers, remote?.data?.accountUsers, remote?.data?.platformTeam, remote?.data?.members, remote?.data, remote?.items, remote?.rows, remote?.results, remote];
  const users = userCandidates.flatMap(arrayFromAny).filter(Boolean) as AppUser[];

  const topLevelMembershipCandidates = [remote?.memberships, remote?.userMemberships, remote?.data?.memberships, remote?.data?.userMemberships];
  const topLevelMemberships = topLevelMembershipCandidates.flatMap(arrayFromAny).filter(Boolean) as UserMembership[];

  const nestedMemberships = users.flatMap((user: any) => {
    const nested = [user?.memberships, user?.userMemberships, user?.membership ? [user.membership] : [], user?.userMembership ? [user.userMembership] : []].flatMap(arrayFromAny);
    return nested.map((membership: any) => ({
      ...membership,
      userId: membership?.userId || userIdOf(user),
      fullName: membership?.fullName || user?.fullName || user?.name,
      email: membership?.email || user?.email,
      accountId: membership?.accountId || user?.accountId,
      active: membership?.active ?? user?.active,
      status: membership?.status || user?.status,
      mustChangePassword: membership?.mustChangePassword ?? user?.mustChangePassword,
    })) as UserMembership[];
  });

  const syntheticMemberships = users
    .filter((user: any) => {
      const role = String(user?.role || "").toLowerCase();
      const hasNested = nestedMemberships.some((membership) => String(membership.userId || "") === String(userIdOf(user) || ""));
      return (role === "developer" || role === "platform_team" || role === "platform_admin") && !hasNested;
    })
    .map((user: any) => ({
      id: user?.membershipId || user?.userMembershipId || `membership_${userIdOf(user) || user.email || Math.random()}`,
      accountId: user?.accountId,
      userId: userIdOf(user),
      fullName: user?.fullName || user?.name,
      email: user?.email,
      role: user?.role === "developer" ? "developer" : "platform_team",
      schoolId: null,
      branchId: null,
      active: user?.active !== false && user?.status !== "inactive",
      status: user?.active === false || user?.status === "inactive" ? "inactive" : "active",
      mustChangePassword: Boolean(user?.mustChangePassword),
      isDeleted: Boolean(user?.isDeleted),
    })) as UserMembership[];

  return { users, memberships: [...topLevelMemberships, ...nestedMemberships, ...syntheticMemberships] };
}

function loadMeta(): PlatformTeamMeta[] {
  if (typeof window === "undefined") return [];
  try {
    return toArray<PlatformTeamMeta>(JSON.parse(window.localStorage.getItem(META_KEY) || "[]"), ["meta", "members"]);
  } catch {
    return [];
  }
}

function saveMeta(rows: PlatformTeamMeta[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(rows));
  } catch {}
}

function loadLegacyMembers(): TeamMember[] {
  if (typeof window === "undefined") return [];
  try {
    return toArray<TeamMember>(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"), ["members", "team"]).map((raw, index) => normalizeMember(raw, index));
  } catch {
    return [];
  }
}

function saveLegacyMembers(members: TeamMember[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  } catch {}
}

function getMetaFor(user: AppUser | undefined, membership: UserMembership | undefined, metaRows: PlatformTeamMeta[]) {
  const email = normalizeEmail(user?.email || membership?.email);
  const userId = String(userIdOf(user) || membership?.userId || "");
  const membershipId = String(membership?.id || membership?.localId || "");
  return metaRows.find((m) => (m.userId && userId && String(m.userId) === userId) || (m.membershipId && membershipId && String(m.membershipId) === membershipId) || (m.email && email && normalizeEmail(m.email) === email));
}

function normalizeMember(raw: any, index: number): TeamMember {
  const platformRole = (raw.platformRole || raw.role || "support_agent") as PlatformRole;
  const role: PlatformRole = ROLE_OPTIONS.some((r) => r.value === platformRole) ? platformRole : raw.role === "developer" ? "developer" : "support_agent";
  const backendRole = raw.backendRole || backendRoleFor(role);
  return {
    id: String(raw.id || raw.localId || raw.userId || raw.email || `team-${index}-${Date.now()}`),
    userId: raw.userId || raw.id,
    membershipId: raw.membershipId,
    fullName: raw.fullName || raw.name || raw.displayName || "Unnamed Team Member",
    email: normalizeEmail(raw.email),
    phone: raw.phone || "",
    role,
    backendRole,
    department: raw.department || "Support",
    title: raw.title || raw.jobTitle || roleLabel(role),
    status: raw.status || (raw.active === false ? "inactive" : "active"),
    permissions: { ...EMPTY_PERMISSIONS, ...DEFAULT_PERMISSIONS_BY_ROLE[role], ...(raw.permissions || {}) },
    temporaryPassword: raw.temporaryPassword,
    mustChangePassword: Boolean(raw.mustChangePassword),
    lastActiveAt: raw.lastActiveAt || raw.lastLoginAt || raw.updatedAt || null,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function composeTeamMembers(users: AppUser[], memberships: UserMembership[], metaRows: PlatformTeamMeta[]) {
  const platformMemberships = memberships.filter((membership) => {
    const role = String(membership.role || "").toLowerCase();
    return !membership.isDeleted && (role === "developer" || role === "platform_team" || role === "platform_admin");
  });

  const fromMemberships = platformMemberships.map((membership, index) => {
    const user = users.find((row) => String(userIdOf(row) || "") === membershipUserId(membership)) || users.find((row) => normalizeEmail(row.email) === normalizeEmail(membership.email));
    const meta = getMetaFor(user, membership, metaRows);
    const backendRole = String(membership.role || user?.role || "platform_team") === "developer" ? "developer" : "platform_team";
    const role = (meta?.platformRole || (backendRole === "developer" ? "developer" : "support_agent")) as PlatformRole;
    return normalizeMember({
      id: userIdOf(user) || membership.userId || membership.id,
      userId: userIdOf(user) || membership.userId,
      membershipId: membership.id || membership.localId,
      fullName: user?.fullName || user?.name || membership.fullName || user?.email || membership.email,
      email: user?.email || membership.email,
      phone: user?.phone,
      role,
      backendRole,
      department: meta?.department,
      title: meta?.title,
      permissions: meta?.permissions,
      status: membership.active === false || user?.active === false || membership.status === "inactive" || user?.status === "inactive" ? "inactive" : membership.status === "suspended" || user?.status === "suspended" ? "suspended" : "active",
      temporaryPassword: meta?.temporaryPassword || user?.temporaryPassword,
      mustChangePassword: meta?.mustChangePassword ?? membership.mustChangePassword ?? user?.mustChangePassword,
      lastActiveAt: user?.lastLoginAt || user?.updatedAt,
      createdAt: membership.createdAt || user?.createdAt,
      updatedAt: membership.updatedAt || user?.updatedAt || meta?.updatedAt,
    }, index);
  });

  const ids = new Set(fromMemberships.map((m) => normalizeEmail(m.email)).filter(Boolean));
  const userOnlyRows = users
    .filter((user) => {
      const role = String(user.role || "").toLowerCase();
      const email = normalizeEmail(user.email);
      return !user.isDeleted && !ids.has(email) && (role === "developer" || role === "platform_team");
    })
    .map((user, index) => {
      const meta = getMetaFor(user, undefined, metaRows);
      const backendRole = user.role === "developer" ? "developer" : "platform_team";
      const role = (meta?.platformRole || (backendRole === "developer" ? "developer" : "support_agent")) as PlatformRole;
      return normalizeMember({
        id: userIdOf(user),
        userId: userIdOf(user),
        fullName: user.fullName || user.name || user.email,
        email: user.email,
        phone: user.phone,
        role,
        backendRole,
        department: meta?.department,
        title: meta?.title,
        permissions: meta?.permissions,
        status: user.active === false || user.status === "inactive" ? "inactive" : user.status === "suspended" ? "suspended" : "active",
        temporaryPassword: meta?.temporaryPassword || user.temporaryPassword,
        mustChangePassword: meta?.mustChangePassword ?? user.mustChangePassword,
        lastActiveAt: user.lastLoginAt || user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt || meta?.updatedAt,
      }, index);
    });

  return [...fromMemberships, ...userOnlyRows].sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) || safeTime(b.updatedAt || b.createdAt) - safeTime(a.updatedAt || a.createdAt));
}

function cleanCreatePlatformUserDto(payload: BackendTeamPayload) {
  return {
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone || undefined,
    password: payload.password,
    role: payload.role,
    mustChangePassword: payload.mustChangePassword,
    platformRole: payload.platformRole,
    department: payload.department,
    title: payload.title,
    permissions: payload.permissions,
    active: payload.active,
  };
}

function cleanUpdatePlatformUserDto(payload: BackendTeamPayload) {
  return {
    fullName: payload.fullName,
    phone: payload.phone || undefined,
    role: payload.role,
    platformRole: payload.platformRole,
    department: payload.department,
    title: payload.title,
    permissions: payload.permissions,
    active: payload.active,
  };
}

function pickBackendUser(response: any, fallback: Partial<AppUser>) {
  return (response?.user || response?.appUser || response?.accountUser || response?.data?.user || response?.data?.appUser || response?.data?.accountUser || response?.data || response || fallback) as AppUser;
}

function pickBackendMembership(response: any, fallback: Partial<UserMembership>) {
  return (response?.membership || response?.userMembership || response?.data?.membership || response?.data?.userMembership || pickBackendUser(response, {})?.memberships?.[0] || fallback) as UserMembership;
}

async function fetchBackendPlatformTeam() {
  const remote = await firstWorkingAuthCall<any>([
    { endpoint: "/accounts/me/users?role=platform_team", method: "GET" },
    { endpoint: "/accounts/me/users?role=developer", method: "GET" },
    { endpoint: "/accounts/me/users", method: "GET" },
  ]);

  if (Array.isArray(remote)) return remote;

  const second = await authApi<any>("/accounts/me/users?role=developer", { method: "GET" }).catch(() => null);
  const firstUsers = arrayFromAny(remote);
  const secondUsers = arrayFromAny(second);
  const mergedByEmail = new Map<string, any>();
  [...firstUsers, ...secondUsers].forEach((user) => mergedByEmail.set(normalizeEmail(user.email || user.id), user));
  return Array.from(mergedByEmail.values());
}

async function saveBackendPlatformTeamMember(payload: BackendTeamPayload) {
  if (payload.userId) {
    const user = await firstWorkingAuthCall<AppUser>([
      { endpoint: `/accounts/users/${encodeURIComponent(payload.userId)}`, method: "PATCH", body: cleanUpdatePlatformUserDto(payload) },
      { endpoint: `/developer/team/${encodeURIComponent(payload.userId)}`, method: "PATCH", body: cleanUpdatePlatformUserDto(payload) },
      { endpoint: `/platform-team/${encodeURIComponent(payload.userId)}`, method: "PATCH", body: cleanUpdatePlatformUserDto(payload) },
    ]);

    let statusResult: any = null;
    try {
      statusResult = await authApi<any>(`/accounts/users/${encodeURIComponent(payload.userId)}/status`, { method: "PATCH", body: { active: payload.active } });
    } catch (error) {
      console.warn("Failed to update platform team user status:", error);
    }

    return {
      user: {
        ...(user || {}),
        ...(statusResult || {}),
        id: payload.userId,
        accountId: payload.accountId,
        email: payload.email,
        fullName: payload.fullName,
        phone: payload.phone,
        role: payload.role,
        active: payload.active,
      },
      membership: {
        id: payload.membershipId,
        accountId: payload.accountId,
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role,
        schoolId: null,
        branchId: null,
        teacherLocalId: null,
        studentLocalId: null,
        parentLocalId: null,
        active: payload.active,
        status: payload.status,
      },
    };
  }

  const created = await firstWorkingAuthCall<AppUser>([
    { endpoint: "/accounts/me/users", method: "POST", body: cleanCreatePlatformUserDto(payload) },
    { endpoint: "/developer/team", method: "POST", body: cleanCreatePlatformUserDto(payload) },
    { endpoint: "/platform-team", method: "POST", body: cleanCreatePlatformUserDto(payload) },
  ]);

  const membership = (created as any)?.memberships?.find?.((m: UserMembership) => String(m.role) === payload.role) || (created as any)?.memberships?.[0] || {
    accountId: payload.accountId,
    userId: userIdOf(created),
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    schoolId: null,
    branchId: null,
    teacherLocalId: null,
    studentLocalId: null,
    parentLocalId: null,
    active: payload.active,
    status: payload.status,
  };

  return { user: created, membership };
}

async function cacheAuthUserLocally(args: { user: AppUser; payload: BackendTeamPayload }) {
  const userTable = getTable<AppUser>("users", "accountUsers", "appUsers");
  if (!userTable) return;

  const timestamp = dateishNowForAuthTable(userTable);
  const id = userIdOf(args.user) || makeLocalAuthId("user");

  const cachePayload: Partial<AppUser> = {
    ...args.user,
    id,
    accountId: args.payload.accountId,
    fullName: args.payload.fullName,
    name: args.payload.name,
    email: args.payload.email,
    phone: args.payload.phone,
    role: args.payload.role,
    active: args.payload.active,
    status: args.payload.status,
    temporaryPassword: args.payload.temporaryPassword,
    mustChangePassword: args.payload.mustChangePassword,
    isDeleted: false,
    updatedAt: timestamp as any,
  };

  const existing = (await userTable.get(id).catch(() => undefined)) || (await userTable.where?.("email")?.equals?.(args.payload.email)?.first?.().catch(() => undefined));

  if (existing?.id) {
    await userTable.update(existing.id, { ...cachePayload, version: Number(existing.version || 0) + 1 });
    return;
  }

  await userTable.add({ ...(isStringPrimaryKeyTable(userTable) ? { id } : {}), ...cachePayload, createdAt: timestamp as any, version: 1 });
}

async function cacheAuthMembershipLocally(args: { membership: UserMembership; user: AppUser; payload: BackendTeamPayload }) {
  const membershipTable = getTable<UserMembership>("userMemberships", "memberships");
  if (!membershipTable) return;

  const timestamp = dateishNowForAuthTable(membershipTable);
  const userId = String(userIdOf(args.user) || args.payload.userId || "");
  const membershipId = args.membership.id || args.payload.membershipId || makeLocalAuthId("membership");

  const cachePayload: Partial<UserMembership> = {
    ...args.membership,
    id: membershipId,
    accountId: args.payload.accountId,
    userId,
    userLocalId: null,
    accountUserId: null,
    fullName: args.payload.fullName,
    email: args.payload.email,
    role: args.payload.role,
    schoolId: null,
    branchId: null,
    teacherLocalId: null,
    studentLocalId: null,
    parentLocalId: null,
    active: args.payload.active,
    status: args.payload.status,
    mustChangePassword: args.payload.mustChangePassword,
    isDeleted: false,
    updatedAt: timestamp as any,
  };

  const existing = (await membershipTable.get(membershipId).catch(() => undefined)) || (await membershipTable.where?.("userId")?.equals?.(userId)?.first?.().catch(() => undefined));

  if (existing?.id) {
    await membershipTable.update(existing.id, { ...cachePayload, version: Number(existing.version || 0) + 1 });
    return;
  }

  await membershipTable.add({ ...(isStringPrimaryKeyTable(membershipTable) ? { id: membershipId } : {}), ...cachePayload, createdAt: timestamp as any, version: 1 });
}

async function removeAuthMembershipLocally(member: TeamMember) {
  const membershipTable = getTable<UserMembership>("userMemberships", "memberships");
  const userTable = getTable<AppUser>("users", "accountUsers", "appUsers");

  if (membershipTable && member.membershipId) {
    try {
      await membershipTable.delete(member.membershipId);
    } catch (error) {
      console.warn("Failed to remove local platform team membership cache:", error);
    }
  }

  if (userTable && member.userId) {
    try {
      await userTable.delete(member.userId);
    } catch (error) {
      console.warn("Failed to remove local platform team user cache:", error);
    }
  }
}

function upsertMeta(row: PlatformTeamMeta) {
  const rows = loadMeta();
  const next = rows.some((item) => (row.userId && item.userId === row.userId) || normalizeEmail(item.email) === normalizeEmail(row.email))
    ? rows.map((item) => ((row.userId && item.userId === row.userId) || normalizeEmail(item.email) === normalizeEmail(row.email) ? { ...item, ...row, updatedAt: Date.now() } : item))
    : [{ ...row, updatedAt: Date.now(), createdAt: row.createdAt || Date.now() }, ...rows];
  saveMeta(next);
}

function removeMeta(member: TeamMember) {
  const rows = loadMeta();
  saveMeta(rows.filter((item) => !(item.userId === member.userId || item.membershipId === member.membershipId || normalizeEmail(item.email) === normalizeEmail(member.email))));
}

const countBy = <T,>(rows: T[], getKey: (row: T) => string | null | undefined) => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

const monthLabels = (count = 6) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(date);
  });
};

const monthKey = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Unknown";
  return new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit" }).format(new Date(time));
};

const formFromMember = (member: TeamMember): TeamForm => ({
  id: member.id,
  userId: member.userId,
  membershipId: member.membershipId,
  fullName: member.fullName,
  email: member.email,
  phone: member.phone || "",
  role: member.role,
  department: member.department,
  title: member.title || "",
  status: member.status,
  permissions: { ...EMPTY_PERMISSIONS, ...member.permissions },
  temporaryPassword: member.temporaryPassword || "",
  mustChangePassword: member.mustChangePassword ?? true,
});

function buildPayload(form: TeamForm, accountId: string): BackendTeamPayload {
  const role = form.role;
  const backendRole = backendRoleFor(role);
  const email = normalizeEmail(form.email);
  const temporaryPassword = form.temporaryPassword.trim() || tempPasswordFromEmail(email);
  return {
    accountId,
    fullName: form.fullName.trim(),
    name: form.fullName.trim(),
    email,
    phone: normalizePhone(form.phone) || undefined,
    password: temporaryPassword,
    temporaryPassword,
    role: backendRole,
    platformRole: role,
    department: form.department,
    title: form.title.trim() || roleLabel(role),
    permissions: form.permissions,
    mustChangePassword: form.mustChangePassword,
    active: form.status === "active",
    status: form.status,
    userId: form.userId,
    membershipId: form.membershipId,
  };
}

export default function DeveloperTeam({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TeamForm>({ ...EMPTY_FORM });

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");
      const remote = await fetchBackendPlatformTeam();
      const { users, memberships } = extractBackendUsersAndMemberships(remote);
      const metaRows = loadMeta();
      const platformMembers = composeTeamMembers(users, memberships, metaRows);

      if (platformMembers.length) {
        setMembers(platformMembers);
        saveLegacyMembers(platformMembers);
        for (const user of users) {
          const matchingMembership = memberships.find((m) => String(m.userId || "") === String(userIdOf(user) || "") || normalizeEmail(m.email) === normalizeEmail(user.email));
          if (!matchingMembership) continue;
          const role = String(matchingMembership.role || user.role || "").toLowerCase();
          if (role !== "developer" && role !== "platform_team" && role !== "platform_admin") continue;
          const meta = getMetaFor(user, matchingMembership, metaRows);
          const platformRole = meta?.platformRole || (role === "developer" ? "developer" : "support_agent");
          const payload = buildPayload(
            {
              id: String(userIdOf(user) || ""),
              userId: String(userIdOf(user) || ""),
              membershipId: String(matchingMembership.id || ""),
              fullName: user.fullName || user.name || matchingMembership.fullName || user.email || "Platform Team Member",
              email: normalizeEmail(user.email || matchingMembership.email),
              phone: normalizePhone(user.phone),
              role: platformRole as PlatformRole,
              department: meta?.department || "Support",
              title: meta?.title || roleLabel(platformRole),
              status: user.active === false || matchingMembership.active === false ? "inactive" : "active",
              permissions: meta?.permissions || DEFAULT_PERMISSIONS_BY_ROLE[platformRole as PlatformRole],
              temporaryPassword: meta?.temporaryPassword || user.temporaryPassword || "",
              mustChangePassword: meta?.mustChangePassword ?? user.mustChangePassword ?? matchingMembership.mustChangePassword ?? true,
            },
            accountId || String(user.accountId || "")
          );
          await cacheAuthUserLocally({ user, payload });
          await cacheAuthMembershipLocally({ membership: matchingMembership, user, payload });
        }
      } else {
        const localUsers = await tableToArray<AppUser>("users", "accountUsers", "appUsers");
        const localMemberships = await tableToArray<UserMembership>("userMemberships", "memberships");
        const localComposed = composeTeamMembers(localUsers, localMemberships, metaRows);
        setMembers(localComposed.length ? localComposed : loadLegacyMembers());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load platform team from the server. Showing local saved team records.");
      const localUsers = await tableToArray<AppUser>("users", "accountUsers", "appUsers");
      const localMemberships = await tableToArray<UserMembership>("userMemberships", "memberships");
      const localComposed = composeTeamMembers(localUsers, localMemberships, loadMeta());
      setMembers(localComposed.length ? localComposed : loadLegacyMembers());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  const filteredMembers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members
      .filter((member) => {
        const haystack = `${member.fullName} ${member.email} ${member.phone || ""} ${member.title || ""} ${member.role} ${member.department} ${member.backendRole}`.toLowerCase();
        return (!term || haystack.includes(term)) && (roleFilter === "all" || member.role === roleFilter) && (departmentFilter === "all" || member.department === departmentFilter) && (statusFilter === "all" || member.status === statusFilter);
      })
      .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) || safeTime(b.updatedAt || b.createdAt) - safeTime(a.updatedAt || a.createdAt));
  }, [members, query, roleFilter, departmentFilter, statusFilter]);

  const activeCount = members.filter((m) => m.status === "active").length;
  const suspendedCount = members.filter((m) => m.status === "suspended").length;
  const inactiveCount = members.filter((m) => m.status === "inactive").length;
  const temporaryCount = members.filter((m) => m.mustChangePassword || m.temporaryPassword).length;
  const sensitiveAccessCount = members.filter((m) => m.permissions.canManageBackups || m.permissions.canManageReleases || m.permissions.canManageSettings || m.permissions.canViewAuditLogs).length;
  const roleChart = useMemo<ChartRow[]>(() => countBy(members, (m) => roleLabel(m.role)), [members]);
  const departmentChart = useMemo<ChartRow[]>(() => countBy(members, (m) => m.department), [members]);
  const statusChart = useMemo<ChartRow[]>(() => countBy(members, (m) => m.status), [members]);
  const growthChart = useMemo<ChartRow[]>(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));
    members.forEach((m) => {
      const key = monthKey(m.createdAt);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    return labels.map((label) => ({ label, value: map.get(label) || 0 }));
  }, [members]);

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm({ ...EMPTY_FORM, permissions: { ...EMPTY_FORM.permissions }, temporaryPassword: "" });
    setModalOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setError("");
    setNotice("");
    setForm(formFromMember(member));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setForm({ ...EMPTY_FORM, permissions: { ...EMPTY_FORM.permissions } });
  };

  const updateForm = <K extends keyof TeamForm>(key: K, value: TeamForm[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "role") {
        const role = value as PlatformRole;
        next.permissions = { ...DEFAULT_PERMISSIONS_BY_ROLE[role] };
        next.title = current.title || roleLabel(role);
      }
      if (key === "email") {
        const email = normalizeEmail(String(value));
        next.email = email;
        if (!current.temporaryPassword || current.temporaryPassword === tempPasswordFromEmail(current.email).slice(0, current.temporaryPassword.length)) {
          next.temporaryPassword = tempPasswordFromEmail(email);
        }
      }
      return next;
    });
  };

  const validate = () => {
    if (!accountId) return "Account session is missing. Please log out and sign in again.";
    if (!form.fullName.trim()) return "Team member name is required.";
    if (!form.email.trim()) return "Team member email is required because the person signs in with email and password.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
    if (!form.id && !form.temporaryPassword.trim()) return "Temporary password is required for the first login.";
    return "";
  };

  const saveMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validate();
    if (validation) return setError(validation);

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const payload = buildPayload(form, accountId!);
      const response = await saveBackendPlatformTeamMember(payload);
      const user = pickBackendUser(response, { id: payload.userId, accountId: payload.accountId, fullName: payload.fullName, email: payload.email, phone: payload.phone, role: payload.role, active: payload.active });
      const membership = pickBackendMembership(response, { id: payload.membershipId, accountId: payload.accountId, userId: userIdOf(user), email: payload.email, fullName: payload.fullName, role: payload.role, active: payload.active, schoolId: null, branchId: null });

      const effectivePayload = { ...payload, userId: String(userIdOf(user) || payload.userId || ""), membershipId: String(membership.id || payload.membershipId || "") };
      await cacheAuthUserLocally({ user, payload: effectivePayload });
      await cacheAuthMembershipLocally({ membership, user, payload: effectivePayload });

      const meta: PlatformTeamMeta = {
        id: String(userIdOf(user) || payload.email),
        userId: String(userIdOf(user) || ""),
        membershipId: String(membership.id || ""),
        email: payload.email,
        platformRole: payload.platformRole,
        backendRole: payload.role,
        department: payload.department,
        title: payload.title,
        permissions: payload.permissions,
        temporaryPassword: payload.temporaryPassword,
        mustChangePassword: payload.mustChangePassword,
        updatedAt: Date.now(),
      };
      upsertMeta(meta);

      const created = normalizeMember({
        id: userIdOf(user) || payload.email,
        userId: userIdOf(user),
        membershipId: membership.id,
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        role: payload.platformRole,
        backendRole: payload.role,
        department: payload.department,
        title: payload.title,
        permissions: payload.permissions,
        status: payload.status,
        temporaryPassword: payload.temporaryPassword,
        mustChangePassword: payload.mustChangePassword,
        createdAt: (user as any)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }, 0);

      setMembers((current) => {
        const next = current.some((m) => m.userId === created.userId || normalizeEmail(m.email) === normalizeEmail(created.email)) ? current.map((m) => (m.userId === created.userId || normalizeEmail(m.email) === normalizeEmail(created.email) ? { ...m, ...created, createdAt: m.createdAt || created.createdAt } : m)) : [created, ...current];
        saveLegacyMembers(next);
        return next;
      });

      setNotice(form.id ? "Team member updated. Their login account remains active in AppUser/UserMembership." : `Team member added. Temporary password: ${payload.temporaryPassword}`);
      closeModal();
    } catch (err: any) {
      setError(err?.message || "Could not save platform team member.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (member: TeamMember, nextStatus: TeamMember["status"]) => {
    try {
      setError("");
      setNotice("");
      const memberUserId = String(member.userId || "").trim();
      if (memberUserId) {
        const encodedUserId = encodeURIComponent(memberUserId);
        await authApi<any>(`/accounts/users/${encodedUserId}/status`, { method: "PATCH", body: { active: nextStatus === "active" } }).catch(async () =>
          authApi<any>(`/accounts/users/${encodedUserId}`, { method: "PATCH", body: { active: nextStatus === "active", status: nextStatus } })
        );
      }
      setMembers((current) => {
        const next = current.map((m) => (m.id === member.id ? { ...m, status: nextStatus, updatedAt: Date.now() } : m));
        saveLegacyMembers(next);
        return next;
      });
      const rows = loadMeta();
      saveMeta(rows.map((m) => (m.userId === member.userId || normalizeEmail(m.email) === normalizeEmail(member.email) ? { ...m, updatedAt: Date.now() } : m)));
      setNotice(`Team member ${nextStatus === "active" ? "reactivated" : nextStatus}.`);
    } catch (err: any) {
      setError(err?.message || "Could not update team member status.");
    }
  };

  const removeMember = async (member: TeamMember) => {
    const confirmed = typeof window === "undefined" || window.confirm(`Remove ${member.fullName} from platform team access? This removes local cache and tries to remove the backend membership if available.`);
    if (!confirmed) return;
    try {
      setError("");
      setNotice("");
      const memberMembershipId = String(member.membershipId || "").trim();
      const memberUserId = String(member.userId || "").trim();

      if (memberMembershipId && !memberMembershipId.startsWith("membership_")) {
        await authApi<any>(`/memberships/${encodeURIComponent(memberMembershipId)}`, { method: "DELETE" }).catch(() => null);
      } else if (memberUserId) {
        await authApi<any>(`/accounts/users/${encodeURIComponent(memberUserId)}/status`, { method: "PATCH", body: { active: false } }).catch(() => null);
      }
      await removeAuthMembershipLocally(member);
      removeMeta(member);
      setMembers((current) => {
        const next = current.filter((m) => m.id !== member.id);
        saveLegacyMembers(next);
        return next;
      });
      setNotice("Team member removed from the local list and backend access was disabled/removed where possible.");
    } catch (err: any) {
      setError(err?.message || "Could not remove platform team member.");
    }
  };

  if (loading || accountLoading) {
    return (
      <main className="devteam-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devteam-state"><div className="devteam-spinner" /><h2>Loading platform team...</h2><p>Preparing staff login accounts, memberships, permissions and departments.</p></section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="devteam-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devteam-state"><h2>Developer access required</h2><p>Sign in with a developer account to manage platform team members.</p></section>
      </main>
    );
  }

  return (
    <main className="devteam-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="devteam-hero">
        <div>
          <span className="devteam-eyebrow">Auth-first platform workforce</span>
          <h1>Developer Team</h1>
          <p>Add people who can actually log into Eleeveon. This creates backend AppUser and UserMembership records with no school or branch assignment, then stores department and permission metadata for team operations.</p>
        </div>
        <div className="devteam-hero-actions">
          <div className="devteam-switch"><button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Cards</button><button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>Table</button><button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>Charts</button></div>
          <button type="button" className="devteam-white-btn" onClick={openCreate}>Add Login Member</button>
          <button type="button" className="devteam-glass-btn" onClick={() => load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
        </div>
      </section>

      {(error || notice) && <section className={`devteam-alert ${error ? "error" : "success"}`}>{error || notice}</section>}

      <section className="devteam-stat-grid"><StatCard label="Team Members" value={members.length} detail={`${filteredMembers.length} shown`} icon="👥" /><StatCard label="Active Logins" value={activeCount} detail={`${inactiveCount} inactive`} icon="✅" /><StatCard label="Suspended" value={suspendedCount} detail="Blocked access" icon="⛔" /><StatCard label="Temporary Passwords" value={temporaryCount} detail="Initial login access" icon="🔑" /><StatCard label="Sensitive Access" value={sensitiveAccessCount} detail="Audit/release/backup/settings" icon="🔐" /></section>

      <section className="devteam-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, phone, title..." /><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">All roles</option>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select><select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}><option value="all">All departments</option>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select><button type="button" onClick={() => { setQuery(""); setRoleFilter("all"); setDepartmentFilter("all"); setStatusFilter("all"); }}>Reset</button></section>

      {viewMode === "analytics" ? <AnalyticsView roleChart={roleChart} departmentChart={departmentChart} statusChart={statusChart} growthChart={growthChart} /> : viewMode === "table" ? <TableView members={filteredMembers} onEdit={openEdit} onStatus={changeStatus} onDelete={removeMember} /> : <CardsView members={filteredMembers} onEdit={openEdit} onStatus={changeStatus} onDelete={removeMember} navigate={navigate} />}
      {modalOpen && <TeamModal form={form} updateForm={updateForm} setForm={setForm} saving={saving} onClose={closeModal} onSubmit={saveMember} />}
    </main>
  );
}

function CardsView({ members, onEdit, onStatus, onDelete, navigate }: { members: TeamMember[]; onEdit: (m: TeamMember) => void; onStatus: (m: TeamMember, s: TeamMember["status"]) => void; onDelete: (m: TeamMember) => void; navigate?: (key: string) => void }) {
  return <section className="devteam-card-grid">{members.map((member) => <article key={member.id} className={`devteam-member-card ${member.status}`}><div className="devteam-member-top"><span className="devteam-avatar">{initials(member.fullName)}</span><Chip tone={statusTone(member.status)}>{member.status}</Chip></div><h2>{member.fullName}</h2><p>{member.title || roleLabel(member.role)}</p><div className="devteam-mini-grid"><span><b>Email</b>{member.email || "—"}</span><span><b>Login Role</b>{member.backendRole}</span><span><b>Team Role</b>{roleLabel(member.role)}</span><span><b>Department</b>{member.department}</span><span><b>Permissions</b>{permissionCount(member.permissions)}/{PERMISSIONS.length}</span><span><b>Temp Password</b>{member.temporaryPassword || "Hidden/changed"}</span><span><b>Last Active</b>{timeText(member.lastActiveAt)}</span><span><b>Updated</b>{dateText(member.updatedAt)}</span></div><div className="devteam-permission-pills">{PERMISSIONS.filter((item) => member.permissions[item.key]).slice(0, 5).map((item) => <span key={item.key}>{item.label}</span>)}{permissionCount(member.permissions) > 5 && <span>+{permissionCount(member.permissions) - 5} more</span>}{!permissionCount(member.permissions) && <span>No permissions</span>}</div><div className="devteam-actions"><button type="button" onClick={() => onEdit(member)}>Edit</button>{member.status === "active" ? <button type="button" onClick={() => onStatus(member, "inactive")}>Deactivate</button> : <button type="button" onClick={() => onStatus(member, "active")}>Reactivate</button>}{member.status !== "suspended" && <button type="button" onClick={() => onStatus(member, "suspended")}>Suspend</button>}<button type="button" onClick={() => navigate?.("auditLogs")}>Audit</button><button type="button" className="danger" onClick={() => onDelete(member)}>Remove</button></div></article>)}{!members.length && <Empty text="No platform team members match your filters." />}</section>;
}

function TableView({ members, onEdit, onStatus, onDelete }: { members: TeamMember[]; onEdit: (m: TeamMember) => void; onStatus: (m: TeamMember, s: TeamMember["status"]) => void; onDelete: (m: TeamMember) => void }) {
  return <section className="devteam-table-card"><div className="devteam-table-wrap"><table><thead><tr><th>Member</th><th>Login Role</th><th>Team Role</th><th>Department</th><th>Status</th><th>Permissions</th><th>Temporary Password</th><th>Actions</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong><small>{member.email}</small></td><td><Chip tone={member.backendRole === "developer" ? "purple" : "blue"}>{member.backendRole}</Chip></td><td><Chip tone={roleTone(member.role)}>{roleLabel(member.role)}</Chip></td><td>{member.department}</td><td><Chip tone={statusTone(member.status)}>{member.status}</Chip></td><td>{permissionCount(member.permissions)}/{PERMISSIONS.length}</td><td>{member.temporaryPassword || "Hidden/changed"}</td><td><div className="devteam-table-actions"><button type="button" onClick={() => onEdit(member)}>Edit</button>{member.status === "active" ? <button type="button" onClick={() => onStatus(member, "inactive")}>Deactivate</button> : <button type="button" onClick={() => onStatus(member, "active")}>Reactivate</button>}<button type="button" className="danger" onClick={() => onDelete(member)}>Remove</button></div></td></tr>)}</tbody></table></div>{!members.length && <Empty text="No platform team members match your filters." />}</section>;
}

function AnalyticsView({ roleChart, departmentChart, statusChart, growthChart }: { roleChart: ChartRow[]; departmentChart: ChartRow[]; statusChart: ChartRow[]; growthChart: ChartRow[] }) {
  return <section className="devteam-analytics"><ChartCard title="Team Roles"><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={roleChart} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88}>{roleChart.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></ChartCard><ChartCard title="Departments"><ResponsiveContainer width="100%" height={260}><BarChart data={departmentChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="var(--dev-primary)" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Status"><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statusChart} dataKey="value" nameKey="label" outerRadius={88}>{statusChart.map((_, i) => <Cell key={i} fill={chartColors[(i + 2) % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></ChartCard><ChartCard title="Added Over Time"><ResponsiveContainer width="100%" height={260}><BarChart data={growthChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="var(--dev-primary)" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard></section>;
}

function TeamModal({ form, updateForm, setForm, saving, onClose, onSubmit }: { form: TeamForm; updateForm: <K extends keyof TeamForm>(key: K, value: TeamForm[K]) => void; setForm: React.Dispatch<React.SetStateAction<TeamForm>>; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="devteam-modal-backdrop" role="dialog" aria-modal="true"><form className="devteam-modal" onSubmit={onSubmit}><div className="devteam-modal-head"><div><h2>{form.id ? "Edit Platform Team Login" : "Add Platform Team Login"}</h2><p>{form.id ? "Update backend login profile and local team metadata." : "Creates AppUser + UserMembership first so the person can sign in."}</p></div><button type="button" onClick={onClose}>×</button></div><div className="devteam-form-grid"><label>Full Name<input value={form.fullName} onChange={(e) => updateForm("fullName", e.target.value)} placeholder="e.g. Ama Mensah" /></label><label>Email / Login<input value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="name@example.com" /></label><label>Phone<input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="024..." /></label><label>Title<input value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Support Lead" /></label><label>Team Role<select value={form.role} onChange={(e) => updateForm("role", e.target.value as PlatformRole)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label} → login as {role.backendRole}</option>)}</select></label><label>Department<select value={form.department} onChange={(e) => updateForm("department", e.target.value as Department)}>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => updateForm("status", e.target.value as TeamForm["status"])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label><label>Temporary Password<div className="password-row"><input value={form.temporaryPassword} onChange={(e) => updateForm("temporaryPassword", e.target.value)} placeholder="Required for first login" /><button type="button" onClick={() => updateForm("temporaryPassword", tempPasswordFromEmail(form.email))}>Generate</button></div></label></div><label className="devteam-check"><input type="checkbox" checked={form.mustChangePassword} onChange={(e) => updateForm("mustChangePassword", e.target.checked)} /> Force password change after first login</label><section className="devteam-permissions"><h3>Permissions</h3><p>These control what the team member should see in the platform-team working area. Backend role remains developer/platform_team.</p>{PERMISSIONS.map((permission) => <label key={permission.key} className={permission.danger ? "danger" : ""}><input type="checkbox" checked={Boolean(form.permissions[permission.key])} onChange={(e) => setForm((current) => ({ ...current, permissions: { ...current.permissions, [permission.key]: e.target.checked } }))} /><span><b>{permission.label}</b><small>{permission.description}</small></span></label>)}</section><div className="devteam-modal-actions"><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Create Login Account"}</button></div></form></div>;
}

function StatCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: string }) {
  return <article className="devteam-stat-card"><span>{icon}</span><div><p>{label}</p><h2>{value}</h2><small>{detail}</small></div></article>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="devteam-chart-card"><h2>{title}</h2>{children}</article>;
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`devteam-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <section className="devteam-empty"><h2>No records found</h2><p>{text}</p></section>;
}

const css = `
.devteam-page{--dev-primary:#2563eb;min-height:100vh;padding:16px;background:linear-gradient(180deg,#eef4ff 0%,#f8fafc 34%,#ffffff 100%);color:#0f172a}.devteam-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:24px;border-radius:28px;background:linear-gradient(135deg,var(--dev-primary),#0f172a);color:white;box-shadow:0 24px 60px rgba(15,23,42,.18)}.devteam-eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:900;opacity:.8}.devteam-hero h1{font-size:clamp(1.8rem,4vw,3.1rem);line-height:1;margin:8px 0}.devteam-hero p{max-width:760px;margin:0;color:rgba(255,255,255,.88)}.devteam-hero-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.devteam-switch{display:flex;gap:4px;padding:4px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);border-radius:999px}.devteam-switch button,.devteam-glass-btn,.devteam-white-btn{border:0;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.devteam-switch button{background:transparent;color:white}.devteam-switch button.active,.devteam-white-btn{background:white;color:#0f172a}.devteam-glass-btn{background:rgba(255,255,255,.16);color:white;border:1px solid rgba(255,255,255,.28)}.devteam-alert{margin:14px 0;padding:14px 16px;border-radius:18px;font-weight:800}.devteam-alert.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.devteam-alert.success{background:#ecfdf5;color:#065f46;border:1px solid #bbf7d0}.devteam-stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:16px 0}.devteam-stat-card{display:flex;gap:12px;align-items:center;background:white;border:1px solid #e2e8f0;border-radius:22px;padding:16px;box-shadow:0 14px 36px rgba(15,23,42,.06)}.devteam-stat-card>span{display:grid;place-items:center;width:42px;height:42px;border-radius:16px;background:#eff6ff}.devteam-stat-card p,.devteam-stat-card h2{margin:0}.devteam-stat-card p{font-size:.8rem;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.devteam-stat-card h2{font-size:1.8rem}.devteam-stat-card small{color:#64748b}.devteam-toolbar{display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:10px;margin:16px 0}.devteam-toolbar input,.devteam-toolbar select,.devteam-toolbar button,.devteam-modal input,.devteam-modal select{width:100%;border:1px solid #dbe3ef;border-radius:16px;padding:12px 14px;background:white;color:#0f172a;outline:none}.devteam-toolbar button{font-weight:900;cursor:pointer}.devteam-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.devteam-member-card{background:white;border:1px solid #e2e8f0;border-radius:24px;padding:18px;box-shadow:0 18px 46px rgba(15,23,42,.07)}.devteam-member-card.suspended{border-color:#fecaca}.devteam-member-top{display:flex;justify-content:space-between;align-items:center}.devteam-avatar{display:grid;place-items:center;width:54px;height:54px;border-radius:20px;background:linear-gradient(135deg,var(--dev-primary),#0f172a);color:white;font-weight:950}.devteam-member-card h2{margin:14px 0 4px}.devteam-member-card p{margin:0 0 12px;color:#64748b}.devteam-mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.devteam-mini-grid span{background:#f8fafc;border:1px solid #edf2f7;border-radius:16px;padding:10px;min-width:0;word-break:break-word}.devteam-mini-grid b{display:block;color:#64748b;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.devteam-permission-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.devteam-permission-pills span{background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:6px 9px;font-size:.75rem;font-weight:900}.devteam-actions,.devteam-table-actions,.devteam-modal-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.devteam-actions button,.devteam-table-actions button,.devteam-modal-actions button{border:0;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer;background:#eef2ff;color:#1e3a8a}.devteam-actions .danger,.devteam-table-actions .danger{background:#fef2f2;color:#991b1b}.devteam-chip{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:.76rem;font-weight:950;text-transform:capitalize}.devteam-chip.green{background:#dcfce7;color:#166534}.devteam-chip.blue{background:#dbeafe;color:#1d4ed8}.devteam-chip.purple{background:#ede9fe;color:#6d28d9}.devteam-chip.orange{background:#ffedd5;color:#c2410c}.devteam-chip.red{background:#fee2e2;color:#b91c1c}.devteam-chip.gray{background:#f1f5f9;color:#475569}.devteam-table-card,.devteam-chart-card{background:white;border:1px solid #e2e8f0;border-radius:24px;padding:16px;box-shadow:0 18px 46px rgba(15,23,42,.07)}.devteam-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:920px}th,td{text-align:left;border-bottom:1px solid #edf2f7;padding:12px}th{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#64748b}td small{display:block;color:#64748b;margin-top:3px}.devteam-analytics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.devteam-chart-card h2{margin:0 0 10px}.devteam-empty,.devteam-state{grid-column:1/-1;text-align:center;background:white;border:1px dashed #cbd5e1;border-radius:24px;padding:40px 18px}.devteam-spinner{width:42px;height:42px;border-radius:999px;border:4px solid #dbeafe;border-top-color:var(--dev-primary);animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}.devteam-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:80;display:grid;place-items:center;padding:14px}.devteam-modal{width:min(940px,100%);max-height:92vh;overflow:auto;background:white;border-radius:28px;padding:18px;box-shadow:0 40px 90px rgba(15,23,42,.28)}.devteam-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.devteam-modal-head h2{margin:0}.devteam-modal-head p{margin:4px 0 0;color:#64748b}.devteam-modal-head button{border:0;background:#f1f5f9;width:40px;height:40px;border-radius:999px;font-size:1.5rem;cursor:pointer}.devteam-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.devteam-modal label{font-weight:900;color:#334155}.devteam-modal label input,.devteam-modal label select{margin-top:6px}.password-row{display:flex;gap:8px}.password-row button{margin-top:6px;border:0;border-radius:14px;background:#0f172a;color:white;font-weight:900;padding:0 12px;cursor:pointer}.devteam-check{display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:12px;margin:12px 0}.devteam-check input{width:auto!important;margin:0!important}.devteam-permissions{margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:22px;padding:14px}.devteam-permissions h3{margin:0}.devteam-permissions p{margin:4px 0 12px;color:#64748b}.devteam-permissions label{display:flex;gap:10px;align-items:flex-start;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:10px;margin-bottom:8px}.devteam-permissions label.danger{border-color:#fed7aa}.devteam-permissions input{width:auto!important;margin-top:3px!important}.devteam-permissions small{display:block;color:#64748b;font-weight:500}.devteam-modal-actions{justify-content:flex-end}.devteam-modal-actions button[type=submit]{background:var(--dev-primary);color:white}.devteam-modal-actions button[type=button]{background:#f1f5f9;color:#0f172a}@media(max-width:1100px){.devteam-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devteam-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.devteam-toolbar{grid-template-columns:1fr 1fr}.devteam-analytics{grid-template-columns:1fr}}@media(max-width:720px){.devteam-page{padding:10px}.devteam-hero{border-radius:22px;flex-direction:column}.devteam-hero-actions,.devteam-switch{width:100%}.devteam-switch button{flex:1}.devteam-white-btn,.devteam-glass-btn{width:100%}.devteam-stat-grid,.devteam-card-grid,.devteam-toolbar,.devteam-form-grid{grid-template-columns:1fr}.devteam-mini-grid{grid-template-columns:1fr}.devteam-modal{border-radius:20px;padding:14px}.password-row{flex-direction:column}.password-row button{padding:12px}}`;
