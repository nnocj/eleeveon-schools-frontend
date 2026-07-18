import { SyncStatus } from "../constants/syncStatus";
import {
  SCOPED_SYNC_NAMES,
  buildAccountSyncStorageKey,
  clearAccountSyncStorage,
  getLocalStorageItem,
  migrateLegacySyncStorageForAccount,
  readAccountSyncNumber,
  readAccountSyncStorage,
  removeAccountSyncStorage,
  removeLocalStorageItem,
  setLocalStorageItem,
  writeAccountSyncNumber,
  writeAccountSyncStorage,
} from "./syncStorage";

/**
 * app/lib/sync/syncConfig.ts
 * --------------------------------------------------------------------------
 * Eleeveon offline-first synchronization configuration.
 *
 * Account-independent values:
 * - authentication token
 * - active account pointer
 * - physical browser/device id
 *
 * Account + environment scoped values:
 * - stable pull cursor (updatedAt + id)
 * - legacy timestamp cursor for backward compatibility
 * - platform-cache cursor
 * - synchronization lock
 * - bootstrap completion
 * - last success and error diagnostics
 */

export const SYNC_ENDPOINTS = {
  PUSH: "/sync/push",
  PULL: "/sync/pull",
  STATUS: "/sync/status",
  BOOTSTRAP: "/sync/bootstrap",
  PLATFORM_CACHE: "/sync/platform-cache",
  DEVICE_REGISTER: "/sync/devices/register",
  CONFLICTS: "/sync/conflicts",
} as const;

export const LOCAL_STORAGE_KEYS = {
  ACCOUNT_ID: "eleeveon_account_id",
  DEVICE_ID: "eleeveon_device_id",
  AUTH_TOKEN: "eleeveon_auth_token",
  ACCESS_TOKEN: "eleeveon_access_token",

  // Legacy names remain exported so old imports compile. Never use these
  // directly for cursor/lock reads; the helpers below build scoped keys.
  LAST_SYNC_AT: "eleeveon_last_sync_at",
  LAST_SYNC_CURSOR: "eleeveon_last_sync_cursor",
  SYNC_LOCK: "eleeveon_sync_lock",
  LAST_PLATFORM_CACHE_AT: "eleeveon_last_platform_cache_at",
  BOOTSTRAP_COMPLETED: "eleeveon_bootstrap_completed",
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

export const MEDIA_SYNC_TABLES = {
  ASSETS: "mediaAssets",
  BLOBS: "mediaBlobs",
} as const;

export const MEDIA_SYNC_POLICY = {
  MEDIA_ASSETS_SHOULD_SYNC: true,
  MEDIA_BLOBS_SHOULD_SYNC: false,
  MEDIA_ASSETS_ARE_SOURCE_OF_TRUTH: true,
  MEDIA_BLOBS_ARE_LOCAL_ONLY: true,
} as const;

export function isMediaAssetTable(tableName?: string | null) {
  return String(tableName || "") === MEDIA_SYNC_TABLES.ASSETS;
}

export function isMediaBlobTable(tableName?: string | null) {
  return String(tableName || "") === MEDIA_SYNC_TABLES.BLOBS;
}

export function shouldSyncMediaTable(tableName?: string | null) {
  if (isMediaAssetTable(tableName)) return true;
  if (isMediaBlobTable(tableName)) return false;
  return true;
}

export function shouldKeepTableLocalOnly(tableName?: string | null) {
  return isMediaBlobTable(tableName);
}

export function normalizeSyncStatus(value: unknown): SyncStatus {
  if (value === SyncStatus.PENDING || value === "pending" || value === "PENDING") return SyncStatus.PENDING;
  if (value === SyncStatus.SYNCED || value === "synced" || value === "SYNCED") return SyncStatus.SYNCED;
  if (
    value === SyncStatus.FAILED ||
    value === "failed" ||
    value === "FAILED" ||
    value === "error" ||
    value === "ERROR"
  ) return SyncStatus.FAILED;
  if (value === SyncStatus.CONFLICT || value === "conflict" || value === "CONFLICT") return SyncStatus.CONFLICT;
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

export type SyncPullCursor = {
  updatedAt: number;
  id: string;
};

export type PullResponse = {
  records: SyncPullRecord[];
  quarantineRecords?: Array<{
    reason: string;
    record: SyncPullRecord;
  }>;
  cacheRecords?: CachePullRecord[];
  platformRecords?: CachePullRecord[];
  serverTime: number;
  hasMore: boolean;
  nextCursor: SyncPullCursor | null;
  pageSize?: number;
  requestedLimit?: number;
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
  const fromEnv =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;
  return String(fromEnv || "").replace(/\/$/, "");
}

// Backward-compatible raw storage helpers.
export const getStorageItem = getLocalStorageItem;
export const setStorageItem = setLocalStorageItem;
export const removeStorageItem = removeLocalStorageItem;

export function getAccountId(): string | null {
  return getStorageItem(LOCAL_STORAGE_KEYS.ACCOUNT_ID);
}

export function setAccountId(accountId: string) {
  setStorageItem(LOCAL_STORAGE_KEYS.ACCOUNT_ID, accountId);
  migrateLegacySyncStorageForAccount(accountId);
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
    deviceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : createFallbackUuid();
    setStorageItem(LOCAL_STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

export function assertAccountId(): string {
  const accountId = getAccountId();
  if (!accountId) {
    throw new Error("No accountId found. Please log in again before syncing.");
  }
  migrateLegacySyncStorageForAccount(accountId);
  return accountId;
}

function resolveAccountId(accountId?: string | null) {
  const resolved = accountId || getAccountId();
  if (!resolved) return null;
  migrateLegacySyncStorageForAccount(resolved);
  return resolved;
}

/**
 * New public scoped-key helper. `baseKey` may be a legacy constant or the new
 * short scoped name.
 */
export function accountScopedStorageKey(
  baseKey: string,
  accountId?: string | null,
) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return baseKey;

  const mapping: Record<string, string> = {
    [LOCAL_STORAGE_KEYS.LAST_SYNC_AT]: SCOPED_SYNC_NAMES.LAST_SYNC_AT,
    [LOCAL_STORAGE_KEYS.LAST_SYNC_CURSOR]: "last_sync_cursor",
    [LOCAL_STORAGE_KEYS.LAST_PLATFORM_CACHE_AT]: SCOPED_SYNC_NAMES.LAST_PLATFORM_CACHE_AT,
    [LOCAL_STORAGE_KEYS.SYNC_LOCK]: SCOPED_SYNC_NAMES.SYNC_LOCK,
    [LOCAL_STORAGE_KEYS.BOOTSTRAP_COMPLETED]: SCOPED_SYNC_NAMES.BOOTSTRAP_COMPLETED,
    [LOCAL_STORAGE_KEYS.LAST_SYNC_OK_AT]: SCOPED_SYNC_NAMES.LAST_SYNC_OK_AT,
    [LOCAL_STORAGE_KEYS.LAST_SYNC_ERROR]: SCOPED_SYNC_NAMES.LAST_SYNC_ERROR,
  };

  const name = mapping[baseKey] || baseKey.replace(/^eleeveon_/, "");
  return buildAccountSyncStorageKey(resolved, name as any);
}

export function getLastSyncAt(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  return resolved
    ? readAccountSyncNumber(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_AT)
    : 0;
}

export function setLastSyncAt(value: number, accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;
  writeAccountSyncNumber(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_AT, value || Date.now());
}

export function clearLastSyncAt(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (resolved) removeAccountSyncStorage(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_AT);
}

const LAST_SYNC_CURSOR_NAME = "last_sync_cursor" as const;

function isValidSyncPullCursor(value: unknown): value is SyncPullCursor {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SyncPullCursor>;

  return (
    Number.isFinite(Number(candidate.updatedAt)) &&
    Number(candidate.updatedAt) >= 0 &&
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0
  );
}

/**
 * Read the stable account/environment-scoped pull cursor.
 *
 * Older installations may only have LAST_SYNC_AT. In that case this returns
 * null and pullSync will temporarily use the legacy `since` request.
 */
export function getLastSyncCursor(
  accountId?: string | null,
): SyncPullCursor | null {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return null;

  const raw = readAccountSyncStorage(
    resolved,
    LAST_SYNC_CURSOR_NAME as any,
  );

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isValidSyncPullCursor(parsed)) return null;

    return {
      updatedAt: Number(parsed.updatedAt),
      id: String(parsed.id),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a compound cursor only after the complete pull page has been applied.
 *
 * LAST_SYNC_AT is updated at the same time for diagnostics and compatibility
 * with older code that still reads the timestamp-only value.
 */
export function setLastSyncCursor(
  cursor: SyncPullCursor,
  accountId?: string | null,
) {
  const resolved = resolveAccountId(accountId);
  if (!resolved || !isValidSyncPullCursor(cursor)) return;

  const normalized: SyncPullCursor = {
    updatedAt: Number(cursor.updatedAt),
    id: String(cursor.id).trim(),
  };

  writeAccountSyncStorage(
    resolved,
    LAST_SYNC_CURSOR_NAME as any,
    JSON.stringify(normalized),
  );

  setLastSyncAt(normalized.updatedAt, resolved);
}

export function clearLastSyncCursor(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;

  removeAccountSyncStorage(
    resolved,
    LAST_SYNC_CURSOR_NAME as any,
  );
}

/**
 * Return the preferred request position.
 *
 * New clients use cursor. Existing clients/devices can fall back to `since`
 * until their first successful paginated pull stores a compound cursor.
 */
export function getPullPosition(accountId?: string | null): {
  cursor: SyncPullCursor | null;
  since: number;
} {
  const resolved = resolveAccountId(accountId);

  return {
    cursor: resolved ? getLastSyncCursor(resolved) : null,
    since: resolved ? getLastSyncAt(resolved) : 0,
  };
}

export function getLastPlatformCacheAt(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  return resolved
    ? readAccountSyncNumber(resolved, SCOPED_SYNC_NAMES.LAST_PLATFORM_CACHE_AT)
    : 0;
}

export function setLastPlatformCacheAt(value: number, accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;
  writeAccountSyncNumber(
    resolved,
    SCOPED_SYNC_NAMES.LAST_PLATFORM_CACHE_AT,
    value || Date.now(),
  );
}

export function clearLastPlatformCacheAt(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (resolved) {
    removeAccountSyncStorage(resolved, SCOPED_SYNC_NAMES.LAST_PLATFORM_CACHE_AT);
  }
}

export function isBootstrapCompleted(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return false;
  return readAccountSyncStorage(
    resolved,
    SCOPED_SYNC_NAMES.BOOTSTRAP_COMPLETED,
  ) === "true";
}

export function setBootstrapCompleted(
  completed: boolean,
  accountId?: string | null,
) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;

  if (completed) {
    writeAccountSyncStorage(
      resolved,
      SCOPED_SYNC_NAMES.BOOTSTRAP_COMPLETED,
      "true",
    );
  } else {
    removeAccountSyncStorage(
      resolved,
      SCOPED_SYNC_NAMES.BOOTSTRAP_COMPLETED,
    );
  }
}

export function getLastSyncOkAt(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  return resolved
    ? readAccountSyncNumber(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_OK_AT)
    : 0;
}

export function setLastSyncOkAt(value: number, accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;
  writeAccountSyncNumber(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_OK_AT, value || Date.now());
}

export function getLastSyncError(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  return resolved
    ? readAccountSyncStorage(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_ERROR)
    : null;
}

export function setLastSyncError(
  message: string | null,
  accountId?: string | null,
) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;

  if (!message) {
    removeAccountSyncStorage(resolved, SCOPED_SYNC_NAMES.LAST_SYNC_ERROR);
  } else {
    writeAccountSyncStorage(
      resolved,
      SCOPED_SYNC_NAMES.LAST_SYNC_ERROR,
      message,
    );
  }
}

export function forceFullSyncNextRun(accountId?: string | null) {
  const resolved = resolveAccountId(accountId);
  if (!resolved) return;

  clearLastSyncCursor(resolved);
  clearLastSyncAt(resolved);
  clearLastPlatformCacheAt(resolved);
  setBootstrapCompleted(false, resolved);
  setLastSyncOkAt(0, resolved);
  setLastSyncError(null, resolved);
}

export function forceMediaAssetsFullSyncNextRun(accountId?: string | null) {
  forceFullSyncNextRun(accountId);
}

export function clearSyncStateForAccount(accountId: string) {
  clearLastSyncCursor(accountId);
  clearAccountSyncStorage(accountId);
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}