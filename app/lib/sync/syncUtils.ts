/**
 * app/lib/sync/syncUtils.ts
 * ---------------------------------------------------------
 * LOCAL SYNC HELPERS
 * ---------------------------------------------------------
 * Local-first helpers used by CRUD modules and shared media utilities.
 *
 * Media asset upgrade:
 * - mediaAssets can use createLocal/updateLocal/softDeleteLocal like other
 *   local-first tables.
 * - mediaBlobs must remain local-only and must never be pushed through normal
 *   SyncRecord payloads.
 * - stripLocalOnlyFields removes temporary Blob/File/object-url/base64 helper
 *   fields so only small metadata is sent to sync.
 * - pulled mediaAssets are matched by permanent localId, owner identity or
 *   ownerTempKey, preventing image bleed across records;
 * - pulled normal records match by permanent localId first and cloudId only as
 *   a secondary sync-envelope identity;
 * - UUID strings are never coerced to numbers.
 */

import { db } from "../db/db";
import {
  assertAccountId,
  getAccountId,
  getDeviceId,
  normalizeSyncStatus,
  SYNC_STATUS_VALUE,
} from "./syncConfig";
import { isSyncTable, SyncTableName } from "./syncTables";
import { scheduleLocalWriteSync } from "./syncScheduler";
import { publishLocalWrite } from "./syncEvents";

export type SyncableRecord = Record<string, any> & {
  /**
   * Permanent UUID of the local-first entity.
   */
  id?: string;

  /**
   * Prisma SyncRecord UUID.
   */
  cloudId?: string | null;

  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  createdByDeviceId?: string;
  updatedByDeviceId?: string;
  deviceId?: string;
  synced?: string | number;
  isDeleted?: boolean;
  active?: boolean;
};

/**
 * Compatibility fallback.
 *
 * If one older imported copy of syncTables.ts is still missing mediaAssets while
 * this file is already updated, this keeps local media metadata working. The real
 * fix should still be to keep mediaAssets inside LOCAL_FIRST_SYNC_TABLES.
 */
const LOCAL_FIRST_COMPAT_TABLES = new Set<string>(["mediaAssets"]);

/**
 * These tables store actual binary/local-only data and should not use normal
 * SyncRecord payload push. They need their own media upload pipeline.
 */
const LOCAL_ONLY_MEDIA_TABLES = new Set<string>(["mediaBlobs"]);

export function nowTimestamp() {
  return Date.now();
}

export function prepareSyncData<T extends SyncableRecord>(data: T, existing?: Partial<T>): T {
  const accountId = data.accountId || existing?.accountId || getAccountId();

  if (!accountId) {
    throw new Error("Cannot save offline record without accountId. Please log in again.");
  }

  return {
    ...data,
    accountId,
    schoolId: data.schoolId ?? existing?.schoolId,
    branchId: data.branchId ?? existing?.branchId,
    id: data.id ?? existing?.id ?? (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    createdAt: existing?.createdAt || data.createdAt || nowTimestamp(),
    updatedAt: nowTimestamp(),
    version: Number(existing?.version || data.version || 0) + 1,
    createdByDeviceId: existing?.createdByDeviceId || data.createdByDeviceId || getDeviceId(),
    updatedByDeviceId: getDeviceId(),
    deviceId: getDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
    isDeleted: data.isDeleted ?? existing?.isDeleted ?? false,
  } as T;
}

export function prepareSoftDelete<T extends SyncableRecord>(existing: T): T {
  return {
    ...existing,
    updatedAt: nowTimestamp(),
    version: Number(existing.version || 0) + 1,
    createdByDeviceId: existing.createdByDeviceId || getDeviceId(),
    updatedByDeviceId: getDeviceId(),
    deviceId: getDeviceId(),
    synced: SYNC_STATUS_VALUE.PENDING,
    isDeleted: true,
    active: existing.active === undefined ? existing.active : false,
  };
}

export function markSynced<T extends SyncableRecord>(data: T, patch?: Partial<T>): T {
  return {
    ...data,
    ...(patch || {}),
    synced: SYNC_STATUS_VALUE.SYNCED,
  } as T;
}

export function markSyncError<T extends SyncableRecord>(data: T, errorMessage?: string): T {
  return {
    ...data,
    syncError: errorMessage,
    synced: SYNC_STATUS_VALUE.ERROR,
  } as T;
}

export function resolveConflict<T extends SyncableRecord>(local?: T | null, remote?: T | null): T | null {
  if (!local && !remote) return null;
  if (!local) return remote || null;
  if (!remote) return local;

  const localDirty = normalizeSyncStatus(local.synced) !== SYNC_STATUS_VALUE.SYNCED;
  const remoteDirty = normalizeSyncStatus(remote.synced) !== SYNC_STATUS_VALUE.SYNCED;

  if (localDirty && !remoteDirty && Number(local.updatedAt || 0) >= Number(remote.updatedAt || 0)) {
    return local;
  }

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

export function isActiveRecord<T extends { isDeleted?: boolean; active?: boolean }>(row: T) {
  return !row.isDeleted && row.active !== false;
}

export function isPendingSync(row: any) {
  return normalizeSyncStatus(row?.synced) === SYNC_STATUS_VALUE.PENDING;
}

export function isSynced(row: any) {
  return normalizeSyncStatus(row?.synced) === SYNC_STATUS_VALUE.SYNCED;
}

export function isSyncError(row: any) {
  return normalizeSyncStatus(row?.synced) === SYNC_STATUS_VALUE.ERROR;
}

export function shouldPush(row: any, tableName?: string) {
  if (!row?.id) return false;

  // Actual binary/blob storage must never be pushed through SyncRecord JSON.
  if (tableName && LOCAL_ONLY_MEDIA_TABLES.has(tableName)) return false;

  // Normal case: records created/edited by prepareSyncData.
  if (isPendingSync(row) || isSyncError(row)) return true;

  // Soft-deleted records must reach the server even if status was not set correctly.
  if (row.isDeleted && !isSynced(row)) return true;

  return false;
}

export function stripLocalOnlyFields(row: Record<string, any>) {
  const copy = { ...row };

  delete copy.syncError;

  // Never leak temporary UI/helper fields to SyncRecord payload.
  delete copy.__optimistic;
  delete copy.__localOnly;
  delete copy.__previewUrl;
  delete copy.__objectUrl;
  delete copy.__file;
  delete copy.__blob;

  // Media safety: these are local-only or too heavy for JSON SyncRecord payloads.
  delete copy.file;
  delete copy.blob;
  delete copy.originalFile;
  delete copy.optimizedFile;
  delete copy.localBlob;
  delete copy.localBlobData;
  delete copy.localObjectUrl;
  delete copy.previewUrl;
  delete copy.objectUrl;
  delete copy.dataUrl;
  delete copy.base64;

  return copy;
}

export function isLocalOnlyMediaTable(tableName: string) {
  return LOCAL_ONLY_MEDIA_TABLES.has(tableName);
}

export function canUseLocalSyncHelpers(tableName: string) {
  return (isSyncTable(tableName) || LOCAL_FIRST_COMPAT_TABLES.has(tableName)) && !LOCAL_ONLY_MEDIA_TABLES.has(tableName);
}

export function getSyncTable(tableName: SyncTableName | string) {
  if (!canUseLocalSyncHelpers(tableName)) {
    if (LOCAL_ONLY_MEDIA_TABLES.has(tableName)) {
      throw new Error(`${tableName} is local-only blob storage and must not be pushed through normal sync.`);
    }

    throw new Error(`${tableName} is not registered for browser local-first sync. Add it to LOCAL_FIRST_SYNC_TABLES in syncTables.ts if it should push from the browser.`);
  }

  const table = (db as any)[tableName];
  if (!table) {
    throw new Error(`${tableName} table does not exist in Dexie db.ts.`);
  }

  return table;
}

function hasValue(value: any) {
  return value !== undefined && value !== null && value !== "";
}

function sameString(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function sameId(a: any, b: any) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();

  return Boolean(left && right && left === right);
}

async function findById(
  table: any,
  id?: string | null,
) {
  const cleanId = String(id ?? "").trim();
  if (!cleanId) return null;

  const byId = await table
    .where("id")
    .equals(cleanId)
    .first()
    .catch(async () => {
      const rows = await table.toArray();
      return rows.find(
        (row: any) =>
          sameId(row.id, cleanId),
      );
    });

  return byId || null;
}

async function findMediaAssetByOwnerIdentity(table: any, payload: any) {
  if (!payload?.ownerTable || !payload?.fieldKey) return null;

  const rows = await table.toArray();
  const activeRows = rows.filter((row: any) => !row?.isDeleted);

  const baseMatch = (row: any) => {
    if (payload.accountId && row.accountId !== payload.accountId) return false;
    if (hasValue(payload.schoolId) && String(row.schoolId ?? "") !== String(payload.schoolId ?? "")) return false;
    if (hasValue(payload.branchId) && String(row.branchId ?? "") !== String(payload.branchId ?? "")) return false;
    if (row.ownerTable !== payload.ownerTable) return false;
    if (row.fieldKey !== payload.fieldKey) return false;
    return true;
  };

  // Temporary form uploads must only match the exact temporary key.
  // This prevents a latest teacher upload from becoming a student photo before save.
  if (hasValue(payload.ownerTempKey)) {
    const byTempKey = activeRows.find((row: any) => baseMatch(row) && sameString(row.ownerTempKey, payload.ownerTempKey));
    if (byTempKey) return byTempKey;
  }

  // Persisted media first match the permanent owner UUID.
  const ownerLocalId =
    payload.ownerLocalId ??
    payload.ownerId;

  if (hasValue(ownerLocalId)) {
    const byOwnerLocalId = activeRows.find(
      (row: any) =>
        baseMatch(row) &&
        sameId(
          row.ownerLocalId ??
            row.ownerId,
          ownerLocalId,
        ),
    );

    if (byOwnerLocalId) {
      return byOwnerLocalId;
    }
  }

  // A cloud owner UUID is a secondary identity only.
  if (hasValue(payload.ownerCloudId)) {
    const byOwnerCloudId = activeRows.find(
      (row: any) =>
        baseMatch(row) &&
        sameId(
          row.ownerCloudId,
          payload.ownerCloudId,
        ),
    );

    if (byOwnerCloudId) {
      return byOwnerCloudId;
    }
  }

  return null;
}

export type ExistingLocalRecordLookup = {
  tableName?: string | null;

  /**
   * Current UUID-native transport fields.
   */
  localId?: string | null;
  cloudId?: string | null;

  /**
   * Temporary compatibility aliases for callers not yet migrated.
   */
  entityId?: string | null;
  id?: string | null;

  payload?: any;
};

export async function findExistingLocalRecord(
  table: any,
  record: ExistingLocalRecordLookup,
) {
  const payload =
    record.payload || {};

  const localId =
    String(
      record.localId ??
        record.entityId ??
        payload.id ??
        "",
    ).trim();

  /**
   * The permanent local-first UUID is the primary cross-device entity
   * identity. Because every device stores the same entity UUID in `id`, this
   * lookup is safe and deterministic.
   */
  const byLocalId =
    await findById(
      table,
      localId,
    );

  if (byLocalId) {
    return byLocalId;
  }

  /**
   * Older local rows may already have stored the Prisma SyncRecord UUID in
   * `cloudId`. Use that only as a secondary envelope identity.
   */
  const cloudId =
    String(
      record.cloudId ??
        record.id ??
        payload.cloudId ??
        "",
    ).trim();

  if (cloudId) {
    const rows =
      await table.toArray();

    const byCloudId =
      rows.find(
        (row: any) =>
          sameId(
            row.cloudId,
            cloudId,
          ),
      ) || null;

    if (byCloudId) {
      return byCloudId;
    }
  }

  // mediaAssets also have safe owner identity matching.
  if (
    record.tableName === "mediaAssets" ||
    payload.ownerTable
  ) {
    return findMediaAssetByOwnerIdentity(
      table,
      payload,
    );
  }

  return null;
}

export async function createLocal<T extends SyncableRecord>(
  tableName: SyncTableName | string,
  data: T,
) {
  assertAccountId();

  const table = getSyncTable(tableName);
  const prepared = prepareSyncData(data);

  /**
   * All current local-first tables use `id` as their stable primary key.
   * prepareSyncData() guarantees that a string UUID exists, so it must not be
   * deleted before table.add(). Removing it causes IndexedDB DataError:
   * "Evaluating the object store's key path did not yield a value."
   */
  const id = String(prepared.id || "").trim();

  if (!id) {
    throw new Error(
      `Cannot create ${String(tableName)} record without a stable id.`,
    );
  }

  prepared.id = id;

  await table.add(prepared);

  publishLocalWrite({
    accountId: prepared.accountId,
    changedTables: [String(tableName)],
  });

  scheduleLocalWriteSync(
    String(tableName),
  );

  return table.get(id);
}

export async function updateLocal<T extends SyncableRecord>(tableName: SyncTableName | string, id: string, patch: Partial<T>) {
  assertAccountId();
  const table = getSyncTable(tableName);
  const existing = await table.get(id);
  if (!existing) throw new Error(`${tableName} record #${id} was not found.`);

  const prepared = prepareSyncData({ ...existing, ...patch } as T, existing);
  await table.update(id, prepared);

  publishLocalWrite({
    accountId: prepared.accountId,
    changedTables: [String(tableName)],
  });

  scheduleLocalWriteSync(
    String(tableName),
  );

  return table.get(id);
}

export async function softDeleteLocal(tableName: SyncTableName | string, id: string) {
  assertAccountId();
  const table = getSyncTable(tableName);
  const existing = await table.get(id);
  if (!existing) throw new Error(`${tableName} record #${id} was not found.`);

  const prepared = prepareSoftDelete(existing);
  await table.update(id, prepared);

  publishLocalWrite({
    accountId: prepared.accountId,
    changedTables: [String(tableName)],
  });

  scheduleLocalWriteSync(
    String(tableName),
  );

  return table.get(id);
}

export async function restoreLocal(tableName: SyncTableName | string, id: string) {
  return updateLocal(tableName, id, { isDeleted: false, active: true } as any);
}

export async function listActiveLocal<T = any>(tableName: SyncTableName | string, filter?: Partial<Record<keyof T, any>>) {
  const table = getSyncTable(tableName);
  let rows = await table.toArray();
  rows = rows.filter(isActiveRecord);

  if (filter) {
    rows = rows.filter((row: any) =>
      Object.entries(filter).every(([key, value]) => value === undefined || value === null || row[key] === value)
    );
  }

  return rows as T[];
}

export async function countPendingSync() {
  let count = 0;

  const { SYNC_TABLES } = await import("./syncTables");
  const tables = Array.from(new Set<string>([...SYNC_TABLES, ...LOCAL_FIRST_COMPAT_TABLES]));

  for (const tableName of tables) {
    if (LOCAL_ONLY_MEDIA_TABLES.has(tableName)) continue;

    const table = (db as any)[tableName];
    if (!table) continue;
    const rows = await table.toArray();
    count += rows.filter((row: any) => shouldPush(row, tableName)).length;
  }

  return count;
}