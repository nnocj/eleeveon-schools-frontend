"use client";

/**
 * context/account-context.tsx
 * ---------------------------------------------------------
 * ACCOUNT + AUTH SESSION PROVIDER
 * ---------------------------------------------------------
 *
 * FIXED VERSION
 * ---------------------------------------------------------
 * Solves:
 * - Login succeeds but /account or /dashboard sends user back to /login.
 * - Provider only restored session once on mount and did not react to token changes.
 * - authenticated depended on getAuthToken() inside useMemo without token state.
 * - Failed /auth/me clears token safely, but successful login can now be restored.
 *
 * Assumptions:
 * - apiClient("/auth/me") points to app/api/auth/me/route.ts.
 * - Login page saves token using setAuthToken(res.token).
 * - Login page saves accountId using setAccountId(res.user.accountId).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import {
  apiClient,
  clearAuthToken,
  getAuthToken,
} from "../lib/api/apiClient";
import {
  clearAccountId,
  getAccountId,
  setAccountId,
} from "../lib/sync/syncConfig";

// ======================================================
// TYPES
// ======================================================

export type AccountUser = {
  id: string;
  accountId: string;
  fullName?: string;
  name?: string;
  email: string;
  role: string;
};

export type AccountInfo = {
  id: string;
  name: string;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type AccountContextType = {
  user: AccountUser | null;
  account: AccountInfo | null;
  accountId: string | null;
  token: string | null;
  loading: boolean;
  authenticated: boolean;

  refreshAccount: () => Promise<void>;
  logout: () => void;
};

// ======================================================
// CONTEXT
// ======================================================

const AccountContext = createContext<AccountContextType | undefined>(undefined);

// ======================================================
// STORAGE EVENT HELPERS
// ======================================================

export const AUTH_CHANGED_EVENT = "eleeveon-auth-changed";

function emitAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function clearInstitutionStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("activeSchoolId");
  window.localStorage.removeItem("activeBranchId");
}

// ======================================================
// PROVIDER
// ======================================================

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const mountedRef = useRef(true);
  const refreshingRef = useRef(false);

  const [user, setUser] = useState<AccountUser | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [fallbackAccountId, setFallbackAccountId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearSessionState = useCallback((clearToken = true) => {
    if (clearToken) {
      clearAuthToken();
    }

    clearAccountId();
    clearInstitutionStorage();

    setUser(null);
    setAccount(null);
    setFallbackAccountId(null);
    setToken(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    setLoading(true);

    try {
      const currentToken = getAuthToken();
      const storedAccountId = getAccountId();

      if (!mountedRef.current) return;

      setToken(currentToken || null);

      if (!currentToken) {
        setUser(null);
        setAccount(null);
        setFallbackAccountId(storedAccountId || null);
        return;
      }

      const res = await apiClient<{
        user: AccountUser;
        account?: AccountInfo | null;
      }>("/auth/me");

      if (!mountedRef.current) return;

      const resolvedAccountId =
        res.user?.accountId || res.account?.id || storedAccountId || null;

      setUser(res.user || null);
      setAccount(res.account || null);
      setFallbackAccountId(resolvedAccountId);

      if (resolvedAccountId) {
        setAccountId(resolvedAccountId);
      }
    } catch (error) {
      console.error("Failed to restore account session:", error);

      if (!mountedRef.current) return;

      clearSessionState(true);
    } finally {
      refreshingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [clearSessionState]);

  // ======================================================
  // INITIAL SESSION RESTORE
  // ======================================================

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  // ======================================================
  // REACT TO LOGIN TOKEN CHANGES
  // ======================================================
  //
  // IMPORTANT:
  // After login, if AccountProvider is already mounted, it will not remount.
  // This listener allows login code to call:
  // window.dispatchEvent(new Event("eleeveon-auth-changed"));
  // after setAuthToken(...) and setAccountId(...).

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAuthChanged = () => {
      refreshAccount();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;

      const key = event.key.toLowerCase();

      if (
        key.includes("token") ||
        key.includes("account") ||
        key.includes("auth")
      ) {
        refreshAccount();
      }
    };

    const handleFocus = () => {
      const latestToken = getAuthToken() || null;
      if (latestToken !== token) {
        refreshAccount();
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshAccount, token]);

  // ======================================================
  // LOGOUT
  // ======================================================

  const logout = useCallback(() => {
    clearSessionState(true);
    emitAuthChanged();
    router.replace("/login");
  }, [clearSessionState, router]);

  // ======================================================
  // VALUE
  // ======================================================

  const resolvedAccountId = user?.accountId || account?.id || fallbackAccountId;
  const authenticated = !!token && !!user && !!resolvedAccountId;

  const value = useMemo<AccountContextType>(
    () => ({
      user,
      account,
      accountId: resolvedAccountId || null,
      token,
      loading,
      authenticated,
      refreshAccount,
      logout,
    }),
    [
      user,
      account,
      resolvedAccountId,
      token,
      loading,
      authenticated,
      refreshAccount,
      logout,
    ]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

// ======================================================
// HOOK
// ======================================================

export function useAccount() {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error("useAccount must be used inside AccountProvider");
  }

  return context;
}

// ======================================================
// LOGIN PAGE INTEGRATION NOTE
// ======================================================

/**
 * In your login page, after successful login, do this:
 *
 * setAuthToken(res.token);
 * setAccountId(res.user.accountId);
 * window.dispatchEvent(new Event("eleeveon-auth-changed"));
 * router.replace("/account");
 *
 * This tells AccountProvider to immediately restore /auth/me without waiting
 * for a full browser refresh.
 */
