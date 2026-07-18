/**
 * app/lib/sync/syncStorage.ts
 * --------------------------------------------------------------------------
 * Environment-aware, account-scoped synchronization storage.
 *
 * Scoped key format:
 *   eleeveon:{environment}:{accountId}:{name}
 *
 * Examples:
 *   eleeveon:production:account-uuid:last_sync_at
 *   eleeveon:preview:account-uuid:sync_lock
 *
 * Authentication and device identity remain global because they identify the
 * currently signed-in session/device. Cursor, diagnostics, lock, platform
 * cache, and bootstrap state are always account-scoped.
 */

export type SyncEnvironment = "development" | "preview" | "production" | string;

export const SYNC_STORAGE_PREFIX = "eleeveon";

export const SCOPED_SYNC_NAMES = {
  LAST_SYNC_AT: "last_sync_at",
  LAST_PLATFORM_CACHE_AT: "last_platform_cache_at",
  SYNC_LOCK: "sync_lock",
  BOOTSTRAP_COMPLETED: "bootstrap_completed",
  LAST_SYNC_OK_AT: "last_sync_ok_at",
  LAST_SYNC_ERROR: "last_sync_error",
} as const;

export type ScopedSyncName =
  (typeof SCOPED_SYNC_NAMES)[keyof typeof SCOPED_SYNC_NAMES];

const LEGACY_KEYS: Partial<Record<ScopedSyncName, readonly string[]>> = {
  last_sync_at: ["eleeveon_last_sync_at"],
  last_platform_cache_at: ["eleeveon_last_platform_cache_at"],
  sync_lock: ["eleeveon_sync_lock"],
  bootstrap_completed: ["eleeveon_bootstrap_completed"],
  last_sync_ok_at: ["eleeveon_last_sync_ok_at"],
  last_sync_error: ["eleeveon_last_sync_error"],
};

function safeSegment(value: string) {
  return encodeURIComponent(value.trim());
}

export function getSyncEnvironment(): SyncEnvironment {
  const explicit =
    process.env.NEXT_PUBLIC_ELEEVEON_ENV ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV;

  if (explicit) return String(explicit).trim().toLowerCase();

  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.NODE_ENV === "test") return "test";

  return "production";
}

export function getLocalStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage failures must not crash offline pages.
  }
}

export function removeLocalStorageItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable/private-mode storage failures.
  }
}

export function buildAccountSyncStorageKey(
  accountId: string,
  name: ScopedSyncName,
  environment: SyncEnvironment = getSyncEnvironment(),
) {
  if (!accountId?.trim()) {
    throw new Error(`Cannot build scoped sync key for "${name}" without accountId.`);
  }

  return [
    SYNC_STORAGE_PREFIX,
    safeSegment(environment),
    safeSegment(accountId),
    name,
  ].join(":");
}

export function readAccountSyncStorage(
  accountId: string,
  name: ScopedSyncName,
): string | null {
  return getLocalStorageItem(buildAccountSyncStorageKey(accountId, name));
}

export function writeAccountSyncStorage(
  accountId: string,
  name: ScopedSyncName,
  value: string,
) {
  setLocalStorageItem(buildAccountSyncStorageKey(accountId, name), value);
}

export function removeAccountSyncStorage(
  accountId: string,
  name: ScopedSyncName,
) {
  removeLocalStorageItem(buildAccountSyncStorageKey(accountId, name));
}

export function readAccountSyncNumber(
  accountId: string,
  name: ScopedSyncName,
  fallback = 0,
) {
  const parsed = Number(readAccountSyncStorage(accountId, name));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function writeAccountSyncNumber(
  accountId: string,
  name: ScopedSyncName,
  value: number,
) {
  const safeValue = Number.isFinite(value) && value >= 0 ? value : Date.now();
  writeAccountSyncStorage(accountId, name, String(safeValue));
}

/**
 * Migrate a legacy global value only when it can safely be attributed to the
 * active account. The legacy key is removed after migration so another account
 * cannot inherit it later.
 */
export function migrateLegacySyncStorageForAccount(accountId: string) {
  if (!accountId || typeof window === "undefined") return;

  for (const name of Object.values(SCOPED_SYNC_NAMES)) {
    const scopedKey = buildAccountSyncStorageKey(accountId, name);
    if (getLocalStorageItem(scopedKey) !== null) continue;

    const candidates = LEGACY_KEYS[name] || [];

    for (const legacyKey of candidates) {
      const legacyValue = getLocalStorageItem(legacyKey);
      if (legacyValue === null) continue;

      setLocalStorageItem(scopedKey, legacyValue);
      removeLocalStorageItem(legacyKey);
      break;
    }
  }
}

export function clearAccountSyncStorage(accountId: string) {
  if (!accountId) return;

  for (const name of Object.values(SCOPED_SYNC_NAMES)) {
    removeAccountSyncStorage(accountId, name);
  }
}

export type SyncLockRecord = {
  owner: string;
  accountId: string;
  environment: string;
  acquiredAt: number;
  expiresAt: number;
};

export function readSyncLock(accountId: string): SyncLockRecord | null {
  const raw = readAccountSyncStorage(accountId, SCOPED_SYNC_NAMES.SYNC_LOCK);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SyncLockRecord;
    if (!parsed?.owner || parsed.accountId !== accountId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function acquireSyncLock(input: {
  accountId: string;
  owner: string;
  ttlMs?: number;
}) {
  const ttlMs = Math.max(5_000, input.ttlMs ?? 120_000);
  const now = Date.now();
  const existing = readSyncLock(input.accountId);

  if (
    existing &&
    existing.expiresAt > now &&
    existing.owner !== input.owner
  ) {
    return false;
  }

  const lock: SyncLockRecord = {
    owner: input.owner,
    accountId: input.accountId,
    environment: getSyncEnvironment(),
    acquiredAt: now,
    expiresAt: now + ttlMs,
  };

  writeAccountSyncStorage(
    input.accountId,
    SCOPED_SYNC_NAMES.SYNC_LOCK,
    JSON.stringify(lock),
  );

  return readSyncLock(input.accountId)?.owner === input.owner;
}

export function refreshSyncLock(input: {
  accountId: string;
  owner: string;
  ttlMs?: number;
}) {
  const current = readSyncLock(input.accountId);
  if (!current || current.owner !== input.owner) return false;

  return acquireSyncLock(input);
}

export function releaseSyncLock(accountId: string, owner: string) {
  const current = readSyncLock(accountId);
  if (!current || current.owner === owner || current.expiresAt <= Date.now()) {
    removeAccountSyncStorage(accountId, SCOPED_SYNC_NAMES.SYNC_LOCK);
  }
}