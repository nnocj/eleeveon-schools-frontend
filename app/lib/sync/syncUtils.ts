/**
 * app/lib/sync/syncUtils.ts
 * ---------------------------------------------------------
 * LOCAL SYNC HELPERS
 * ---------------------------------------------------------
 */

import { getAccountId, getDeviceId, SYNC_STATUS_VALUE } from "./syncConfig";

// ======================================================
// PREPARE DATA BEFORE SAVING TO DEXIE
// ======================================================

export function prepareSyncData<T extends Record<string, any>>(
  data: T,
  existing?: Partial<T>
): T {
  return {
    ...data,

    accountId: data.accountId || existing?.accountId || getAccountId(),

    schoolId:
      data.schoolId ??
      existing?.schoolId,

    branchId:
      data.branchId ??
      existing?.branchId,

    cloudId: data.cloudId || existing?.cloudId,

    createdAt: existing?.createdAt || data.createdAt || Date.now(),
    updatedAt: Date.now(),

    version: Number(existing?.version || data.version || 0) + 1,
    deviceId: getDeviceId(),

    synced: SYNC_STATUS_VALUE.PENDING,
    isDeleted: data.isDeleted ?? existing?.isDeleted ?? false,
  } as T;
}

// ======================================================
// SOFT DELETE DATA
// ======================================================

export function prepareSoftDelete<T extends Record<string, any>>(
  existing: T
): T {
  return {
    ...existing,
    updatedAt: Date.now(),
    version: Number(existing.version || 0) + 1,
    deviceId: getDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
    isDeleted: true,
  };
}

// ======================================================
// MARK SYNCED
// ======================================================

export function markSynced<T extends Record<string, any>>(
  data: T,
  patch?: Partial<T>
): T {
  return {
    ...data,
    ...(patch || {}),
    synced: SYNC_STATUS_VALUE.SYNCED,
  };
}

// ======================================================
// MARK ERROR
// ======================================================

export function markSyncError<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    synced: SYNC_STATUS_VALUE.ERROR,
  };
}

// ======================================================
// CONFLICT RESOLUTION
// ======================================================

export function resolveConflict<T extends Record<string, any>>(
  local?: T | null,
  remote?: T | null
): T | null {
  if (!local && !remote) return null;
  if (!local) return remote || null;
  if (!remote) return local;

  const localVersion = Number(local.version || 0);
  const remoteVersion = Number(remote.version || 0);

  if (remoteVersion > localVersion) return remote;
  if (localVersion > remoteVersion) return local;

  const localUpdatedAt = Number(local.updatedAt || 0);
  const remoteUpdatedAt = Number(remote.updatedAt || 0);

  if (remoteUpdatedAt > localUpdatedAt) return remote;
  if (localUpdatedAt > remoteUpdatedAt) return local;

  const localDevice = String(local.deviceId || "");
  const remoteDevice = String(remote.deviceId || "");

  return remoteDevice > localDevice ? remote : local;
}

// ======================================================
// ACTIVE RECORD HELPER
// ======================================================

export function isActiveRecord<T extends { isDeleted?: boolean; active?: boolean }>(
  row: T
) {
  return !row.isDeleted && row.active !== false;
}

// ======================================================
// SYNC STATUS HELPERS
// ======================================================

export function isPendingSync(row: any) {
  return String(row?.synced || "").toLowerCase() === SYNC_STATUS_VALUE.PENDING;
}

export function isSynced(row: any) {
  return String(row?.synced || "").toLowerCase() === SYNC_STATUS_VALUE.SYNCED;
}

export function isSyncError(row: any) {
  return String(row?.synced || "").toLowerCase() === SYNC_STATUS_VALUE.ERROR;
}