import { SyncStatus } from "../constants/syncStatus";

/**
 * app/lib/sync/syncConfig.ts
 * ---------------------------------------------------------
 * ELEEVEON OFFLINE-FIRST SYNC CONFIG
 * ---------------------------------------------------------
 * Backward-compatible with your existing app.
 */

export const SYNC_ENDPOINTS = {
  PUSH: "/sync/push",
  PULL: "/sync/pull",
  STATUS: "/sync/status",

  // Optional upgraded endpoints. If the backend does not have these yet,
  // the frontend helpers fail softly and the normal sync still works.
  BOOTSTRAP: "/sync/bootstrap",
  PLATFORM_CACHE: "/sync/platform-cache",
  DEVICE_REGISTER: "/sync/devices/register",
  CONFLICTS: "/sync/conflicts",
} as const;

export const LOCAL_STORAGE_KEYS = {
  ACCOUNT_ID: "eleeveon_account_id",
  DEVICE_ID: "eleeveon_device_id",
  LAST_SYNC_AT: "eleeveon_last_sync_at",
  AUTH_TOKEN: "eleeveon_auth_token",
  ACCESS_TOKEN: "eleeveon_access_token",
  SYNC_LOCK: "eleeveon_sync_lock",
  LAST_PLATFORM_CACHE_AT: "eleeveon_last_platform_cache_at",
  LAST_SYNC_OK_AT: "eleeveon_last_sync_ok_at",
  LAST_SYNC_ERROR: "eleeveon_last_sync_error",
} as const;

export const SYNC_STATUS_VALUE = {
  SYNCED: SyncStatus.SYNCED,
  PENDING: SyncStatus.PENDING,
  ERROR: SyncStatus.FAILED,
  CONFLICT: SyncStatus.CONFLICT,
} as const;

export type SyncStatusValue = SyncStatus;

export function normalizeSyncStatus(value: unknown): SyncStatus {
  if (value === SyncStatus.PENDING || value === "pending" || value === "PENDING") {
    return SyncStatus.PENDING;
  }

  if (value === SyncStatus.SYNCED || value === "synced" || value === "SYNCED") {
    return SyncStatus.SYNCED;
  }

  if (
    value === SyncStatus.FAILED ||
    value === "failed" ||
    value === "FAILED" ||
    value === "error" ||
    value === "ERROR"
  ) {
    return SyncStatus.FAILED;
  }

  if (value === SyncStatus.CONFLICT || value === "conflict" || value === "CONFLICT") {
    return SyncStatus.CONFLICT;
  }

  return SyncStatus.PENDING;
}

export type SyncPushRecord = {
  tableName: string;
  localId: number;
  cloudId?: string | null;
  accountId: string;
  deviceId: string;
  version: number;
  updatedAt: number;
  isDeleted: boolean;
  payload: Record<string, any>;
};

export type SyncPullRecord = {
  tableName: string;
  localId?: number | null;
  cloudId?: string | null;
  accountId: string;
  deviceId?: string | null;
  version: number;
  updatedAt: number;
  isDeleted: boolean;
  payload: Record<string, any>;
};

export type CachePullRecord = {
  tableName: string;
  id?: string | number | null;
  cloudId?: string | null;
  accountId?: string | null;
  updatedAt?: number | string | null;
  isDeleted?: boolean;
  payload: Record<string, any>;
};

export type PushResponseItem = {
  tableName: string;
  localId: number;
  cloudId?: string | null;
  version: number;
  updatedAt: number;
  ok: boolean;
  error?: string;
  conflict?: boolean;
};

export type PullResponse = {
  records: SyncPullRecord[];
  cacheRecords?: CachePullRecord[];
  platformRecords?: CachePullRecord[];
  serverTime: number;
};

export type PushResponse = {
  results: PushResponseItem[];
  conflicts?: any[];
};

export type SyncResult = {
  ok: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
  startedAt: number;
  finishedAt: number;
  conflicts?: number;
  cacheUpdated?: number;
};

export type SyncStatusResponse = {
  ok: boolean;
  service?: string;
  accountId?: string;
  user?: string;
  role?: string;
  serverTime?: number;
  deviceId?: string;
  conflicts?: number;
};

export type PlatformCacheResponse = {
  records?: CachePullRecord[];
  cacheRecords?: CachePullRecord[];
  platformRecords?: CachePullRecord[];
  serverTime?: number;
};

export function getApiBaseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  return String(fromEnv || "").replace(/\/$/, "");
}

export function getStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so offline pages do not crash.
  }
}

export function removeStorageItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function getAccountId(): string | null {
  return getStorageItem(LOCAL_STORAGE_KEYS.ACCOUNT_ID);
}

export function setAccountId(accountId: string) {
  setStorageItem(LOCAL_STORAGE_KEYS.ACCOUNT_ID, accountId);
}


export function clearAccountId() {
  removeStorageItem(LOCAL_STORAGE_KEYS.ACCOUNT_ID);
}

export function getAuthToken(): string | null {
  return (
    getStorageItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN) ||
    getStorageItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN) ||
    getStorageItem("token") ||
    getStorageItem("accessToken")
  );
}

export function setAuthToken(token: string) {
  setStorageItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN, token);
}

export function clearAuthToken() {
  removeStorageItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
  removeStorageItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
  removeStorageItem("token");
  removeStorageItem("accessToken");
}

export function createFallbackUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getDeviceId() {
  if (typeof window === "undefined") return "server-device";

  let deviceId = getStorageItem(LOCAL_STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    deviceId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : createFallbackUuid();

    setStorageItem(LOCAL_STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
}

export function getLastSyncAt() {
  return Number(getStorageItem(LOCAL_STORAGE_KEYS.LAST_SYNC_AT) || 0);
}

export function setLastSyncAt(value: number) {
  setStorageItem(LOCAL_STORAGE_KEYS.LAST_SYNC_AT, String(value || Date.now()));
}

export function clearLastSyncAt() {
  removeStorageItem(LOCAL_STORAGE_KEYS.LAST_SYNC_AT);
}

export function clearLastPlatformCacheAt() {
  removeStorageItem(LOCAL_STORAGE_KEYS.LAST_PLATFORM_CACHE_AT);
}

/**
 * ---------------------------------------------------------
 * REPAIR / FULL SYNC HELPERS
 * ---------------------------------------------------------
 * Use when local Dexie data becomes incomplete while backend
 * SyncRecord data is still correct.
 *
 * Example:
 * - Backend has 2 students
 * - Dexie has only 1 student
 * - Incremental pull will not recover the missing record
 *
 * Calling forceFullSyncNextRun() clears sync cursors so the
 * next pull behaves like a fresh account bootstrap.
 */
export function forceFullSyncNextRun() {
  clearLastSyncAt();
  clearLastPlatformCacheAt();

  try {
    const accountId = getAccountId();

    if (accountId) {
      removeStorageItem(
        accountScopedStorageKey(
          LOCAL_STORAGE_KEYS.LAST_SYNC_OK_AT,
          accountId
        )
      );

      removeStorageItem(
        accountScopedStorageKey(
          LOCAL_STORAGE_KEYS.LAST_SYNC_ERROR,
          accountId
        )
      );
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getLastPlatformCacheAt() {
  return Number(getStorageItem(LOCAL_STORAGE_KEYS.LAST_PLATFORM_CACHE_AT) || 0);
}

export function setLastPlatformCacheAt(value: number) {
  setStorageItem(LOCAL_STORAGE_KEYS.LAST_PLATFORM_CACHE_AT, String(value || Date.now()));
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function assertAccountId(): string {
  const accountId = getAccountId();
  if (!accountId) {
    throw new Error("No accountId found. Please log in again before syncing.");
  }
  return accountId;
}


export function accountScopedStorageKey(baseKey: string, accountId?: string | null) {
  return accountId ? `${baseKey}:${accountId}` : baseKey;
}

export function getLastSyncOkAt(accountId?: string | null) {
  return Number(getStorageItem(accountScopedStorageKey(LOCAL_STORAGE_KEYS.LAST_SYNC_OK_AT, accountId || getAccountId())) || 0);
}

export function setLastSyncOkAt(value: number, accountId?: string | null) {
  setStorageItem(accountScopedStorageKey(LOCAL_STORAGE_KEYS.LAST_SYNC_OK_AT, accountId || getAccountId()), String(value || Date.now()));
}

export function getLastSyncError(accountId?: string | null) {
  return getStorageItem(accountScopedStorageKey(LOCAL_STORAGE_KEYS.LAST_SYNC_ERROR, accountId || getAccountId()));
}

export function setLastSyncError(message: string | null, accountId?: string | null) {
  const key = accountScopedStorageKey(LOCAL_STORAGE_KEYS.LAST_SYNC_ERROR, accountId || getAccountId());
  if (!message) removeStorageItem(key);
  else setStorageItem(key, message);
}

