"use client";

/**
 * app/context/account-context.tsx
 * ---------------------------------------------------------
 * ELEEVEON ACCOUNT CONTEXT
 * ---------------------------------------------------------
 *
 * Drop-in replacement.
 *
 * Why this version exists:
 * - Login may receive the correct memberships, but after a full page reload
 *   /auth/me can sometimes return a user payload without memberships.
 * - If AccountProvider replaces the user with that thinner payload, the
 *   select-role page sees no memberships and shows "No role membership found".
 * - This context now keeps a small membership backup in localStorage/sessionStorage
 *   and merges it back when /auth/me is missing memberships.
 *
 * Important behavior:
 * - Token/account restoration stays backward-compatible.
 * - Active membership is still cleared only on logout/auth failure.
 * - Account id is still stored for sync.
 * - Membership aliases are preserved exactly as provided so select-role and
 *   RolePortalShell can normalize studentLocalId/teacherLocalId/parentLocalId.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { apiClient, clearAuthToken, getAuthToken } from "../lib/api/apiClient";
import {
  clearAccountId,
  getAccountId,
  setAccountId,
} from "../lib/sync/syncConfig";
import { clearStoredActiveMembership } from "../lib/auth/activeMembership";
import { AccountSubscriptionDTO } from "../lib/billing/subscriptionAccess";
import {
  collectUserMemberships,
  normalizeMemberships,
  type UserMembership,
} from "../lib/auth/roleRedirect";

export type AccountUser = {
  id: string;
  accountId: string;
  fullName?: string;
  name?: string;
  email: string;
  role: string;

  /**
   * Normalized active memberships available to the UI.
   * This may come from /auth/me directly or from the local fallback backup.
   */
  memberships?: UserMembership[];

  /**
   * Allow backend aliases without breaking older auth payloads.
   */
  userMemberships?: UserMembership[];
  accountMemberships?: UserMembership[];
  schoolMemberships?: UserMembership[];
  roleMemberships?: UserMembership[];
  membership?: UserMembership | UserMembership[];
  [key: string]: any;
};

export type AccountInfo = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currency?: string | null;
  status?: string;
  metadata?: any;
  subscription?: AccountSubscriptionDTO | null;

  /**
   * Optional membership aliases from backend/account payloads.
   */
  memberships?: UserMembership[];
  userMemberships?: UserMembership[];
  accountMemberships?: UserMembership[];
  schoolMemberships?: UserMembership[];
  roleMemberships?: UserMembership[];
  membership?: UserMembership | UserMembership[];
  [key: string]: any;
};

type AccountContextType = {
  user: AccountUser | null;
  account: AccountInfo | null;
  subscription: AccountSubscriptionDTO | null;
  accountId: string | null;
  loading: boolean;
  authenticated: boolean;
  refreshAccount: () => Promise<void>;
  logout: () => void;
};

const AccountContext = createContext<AccountContextType | undefined>(undefined);

const STORED_USER_MEMBERSHIPS_KEY = "eleeveon_user_memberships";
const STORED_ACCOUNT_USER_KEY = "eleeveon_account_user";
const STORED_ACCOUNT_INFO_KEY = "eleeveon_account_info";

function safeGetStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage failures.
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function safeRemoveStorage(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore localStorage failures.
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function readJson<T>(key: string): T | null {
  const raw = safeGetStorage(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    safeSetStorage(key, JSON.stringify(value));
  } catch {
    // Ignore serialization/storage failures.
  }
}

function clearStoredAccountSessionCache() {
  safeRemoveStorage(STORED_USER_MEMBERSHIPS_KEY);
  safeRemoveStorage(STORED_ACCOUNT_USER_KEY);
  safeRemoveStorage(STORED_ACCOUNT_INFO_KEY);
}

function clearLocalInstitutionContext() {
  clearStoredActiveMembership();
  safeRemoveStorage("activeSchoolId");
  safeRemoveStorage("activeBranchId");
  safeRemoveStorage("activeRole");
  safeRemoveStorage("activeTeacherId");
  safeRemoveStorage("activeStudentId");
  safeRemoveStorage("activeParentId");
  safeRemoveStorage("activeMembershipId");
}

function normalizeAccountInfo(
  value?: AccountInfo | null,
  fallbackId?: string | null
): AccountInfo | null {
  if (value?.id) return value;
  if (!fallbackId) return null;

  return {
    id: fallbackId,
    name: "Eleeveon Account",
    status: "active",
  };
}

function membershipIdentity(membership: UserMembership) {
  return String(
    membership.id ??
      `${membership.role}-${membership.schoolId ?? "account"}-${
        membership.branchId ?? membership.schoolBranchId ?? "root"
      }-${
        membership.teacherLocalId ??
        membership.studentLocalId ??
        membership.parentLocalId ??
        "profile"
      }`
  );
}

function uniqueMemberships(memberships: UserMembership[]) {
  const unique = new Map<string, UserMembership>();

  memberships.forEach((membership) => {
    if (!membership) return;
    if (membership.active === false) return;
    if (membership.isActive === false) return;
    if (membership.disabled === true) return;
    if (membership.isDeleted === true) return;

    unique.set(membershipIdentity(membership), membership);
  });

  return [...unique.values()];
}

function readStoredMemberships() {
  return normalizeMemberships(readJson<UserMembership[]>(STORED_USER_MEMBERSHIPS_KEY) || []);
}

function saveMembershipBackup(user?: any, account?: any) {
  const memberships = uniqueMemberships([
    ...collectUserMemberships(user),
    ...collectUserMemberships(account),
  ]);

  if (memberships.length) {
    writeJson(STORED_USER_MEMBERSHIPS_KEY, memberships);
  }

  return memberships;
}

function mergeUserWithMembershipFallback(args: {
  incomingUser: AccountUser;
  incomingAccount?: AccountInfo | null;
}) {
  const incomingMemberships = uniqueMemberships([
    ...collectUserMemberships(args.incomingUser),
    ...collectUserMemberships(args.incomingAccount),
  ]);

  const fallbackMemberships = readStoredMemberships();

  const memberships = incomingMemberships.length
    ? incomingMemberships
    : fallbackMemberships;

  if (memberships.length) {
    writeJson(STORED_USER_MEMBERSHIPS_KEY, memberships);
  }

  const nextUser: AccountUser = {
    ...args.incomingUser,
    memberships,
  };

  writeJson(STORED_ACCOUNT_USER_KEY, nextUser);

  if (args.incomingAccount) {
    writeJson(STORED_ACCOUNT_INFO_KEY, args.incomingAccount);
  }

  return nextUser;
}

function readStoredUserWithFallback(storedAccountId?: string | null) {
  const storedUser = readJson<AccountUser>(STORED_ACCOUNT_USER_KEY);
  const memberships = readStoredMemberships();

  if (!storedUser && !memberships.length) return null;

  return {
    ...(storedUser || {
      id: "",
      accountId: storedAccountId || "",
      email: "",
      role: "",
    }),
    accountId: storedUser?.accountId || storedAccountId || "",
    memberships,
  } as AccountUser;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [user, setUser] = useState<AccountUser | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [fallbackAccountId, setFallbackAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAccount = useCallback(async () => {
    setLoading(true);

    try {
      const token = getAuthToken();
      const storedAccountId = getAccountId();

      if (!token) {
        const storedAccount = readJson<AccountInfo>(STORED_ACCOUNT_INFO_KEY);
        const restoredUser = readStoredUserWithFallback(storedAccountId);

        setUser(null);
        setAccount(normalizeAccountInfo(storedAccount || null, storedAccountId || null));
        setFallbackAccountId(restoredUser?.accountId || storedAccountId || null);
        return;
      }

      const res = await apiClient<{
        user: AccountUser;
        account?: AccountInfo | null;
      }>("/auth/me");

      const resolvedAccountId =
        res.user?.accountId || res.account?.id || storedAccountId || null;

      const normalizedAccount = normalizeAccountInfo(
        res.account || null,
        resolvedAccountId
      );

      const nextUser = mergeUserWithMembershipFallback({
        incomingUser: res.user,
        incomingAccount: normalizedAccount,
      });

      setUser(nextUser);
      setAccount(normalizedAccount);

      if (resolvedAccountId) {
        setAccountId(resolvedAccountId);
        setFallbackAccountId(resolvedAccountId);
      }

      saveMembershipBackup(nextUser, normalizedAccount);
    } catch (error) {
      console.error("Failed to restore account session:", error);

      setUser(null);
      setAccount(null);
      setFallbackAccountId(null);

      clearAuthToken();
      clearAccountId();
      clearStoredAccountSessionCache();
      clearLocalInstitutionContext();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const logout = useCallback(() => {
    clearAuthToken();
    clearAccountId();
    clearStoredAccountSessionCache();
    clearLocalInstitutionContext();

    setUser(null);
    setAccount(null);
    setFallbackAccountId(null);

    router.push("/login");
  }, [router]);

  const value = useMemo<AccountContextType>(
    () => ({
      user,
      account,
      subscription: account?.subscription || null,
      accountId: user?.accountId || account?.id || fallbackAccountId,
      loading,
      authenticated: !!user && !!getAuthToken(),
      refreshAccount,
      logout,
    }),
    [user, account, fallbackAccountId, loading, refreshAccount, logout]
  );

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used inside AccountProvider");
  }

  return context;
}
