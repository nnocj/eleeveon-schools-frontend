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
import { lockLocalSession } from "../independent/localStaffAuth";
import { forgetAllOfflineGrants } from "./offlineGrantStore";

export const LOGOUT_EVENT_NAME = "eleeveon:atomic-logout";
let activeLogoutPromise: Promise<void> | null = null;

const AUTH_SESSION_KEYS = [
  "eleeveon_offline_session_meta_v1", "eleeveon_auth_token", "eleeveon_access_token", "accessToken", "token", "authToken",
  "eleeveon_auth_user", "eleeveon_auth_account", "eleeveon_account_user",
  "eleeveon_account_info", "eleeveon_user_memberships", "eleeveon_open_workspace",
  "activeMembership", "activeMembershipId", "activeRole", "activeSchoolId",
  "activeBranchId", "activeTeacherId", "activeStudentId", "activeParentId",
  "eleeveon_branding_refresh_key", "user", "account", "portalUser",
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
    // Best-effort server refresh-session revocation; local logout must work offline.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const { apiRequest } = await import("../platformApi");
        await Promise.race([apiRequest("/auth/logout", { method: "POST" }), new Promise(resolve => setTimeout(resolve, 2500))]);
      } catch { /* Browser session still clears locally; server-side session expires/revokes separately. */ }
    }
    // Prevent a previous Independent staff identity surviving an account change.
    lockLocalSession();
    disconnectRealtime();
    abortSessionRequests("Logout");
    notifyReactContexts();
    await options.clearReactState?.();
    // Fail closed: never report logout complete while an offline grant remains reusable.
    await forgetAllOfflineGrants();
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