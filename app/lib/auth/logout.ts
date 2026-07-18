/**
 * app/lib/auth/logout.ts
 * --------------------------------------------------------------------------
 * Atomic logout coordinator. Offline Dexie data is intentionally preserved.
 */

import {
  abortSessionRequests,
  incrementSessionGeneration,
  isLogoutInProgress,
  markLogoutInProgress,
} from "./sessionGeneration";
import { clearAccountId } from "../sync/syncConfig";
import { stopSynchronizationForLogout } from "../sync/syncEngine";
import { disconnectRealtime } from "../realtime/realtimeClient";

export const LOGOUT_EVENT_NAME = "eleeveon:atomic-logout";
let activeLogoutPromise: Promise<void> | null = null;

const AUTH_SESSION_KEYS = [
  "eleeveon_auth_token", "eleeveon_access_token", "accessToken", "token", "authToken",
  "eleeveon_auth_user", "eleeveon_auth_account", "eleeveon_account_user",
  "eleeveon_account_info", "eleeveon_user_memberships", "eleeveon_open_workspace",
  "activeMembership", "activeMembershipId", "activeRole", "activeSchoolId",
  "activeBranchId", "activeTeacherId", "activeStudentId", "activeParentId",
  "eleeveon_branding_refresh_key", "user", "account",
];

function clearStorageKeys() {
  if (typeof window === "undefined") return;
  for (const key of AUTH_SESSION_KEYS) {
    try { window.localStorage.removeItem(key); } catch {}
    try { window.sessionStorage.removeItem(key); } catch {}
  }
}

function notifyReactContexts() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOGOUT_EVENT_NAME));
}

export function subscribeToAtomicLogout(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LOGOUT_EVENT_NAME, listener);
  return () => { window.removeEventListener(LOGOUT_EVENT_NAME, listener); };
}

export type AtomicLogoutOptions = {
  clearReactState?: () => void | Promise<void>;
  redirectTo?: string;
};

export function performAtomicLogout(options: AtomicLogoutOptions = {}) {
  if (activeLogoutPromise) return activeLogoutPromise;

  activeLogoutPromise = (async () => {
    if (!isLogoutInProgress()) markLogoutInProgress(true);
    incrementSessionGeneration();
    stopSynchronizationForLogout();
    disconnectRealtime();
    abortSessionRequests("Logout");
    notifyReactContexts();
    await options.clearReactState?.();
    clearStorageKeys();
    clearAccountId();

    // Do not delete IndexedDB or Cache Storage: offline school data survives logout.
    if (typeof window !== "undefined") {
      window.location.replace(options.redirectTo || "/login");
    }
  })().finally(() => {
    activeLogoutPromise = null;
  });

  return activeLogoutPromise;
}