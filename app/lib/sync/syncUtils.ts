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
 * - pulled mediaAssets are matched by cloudId/owner identity/ownerTempKey,
 *   never by local numeric id alone, preventing image bleed across records.
 * - pulled normal records now also avoid unsafe payload.id/localId matching.
 *   CloudId is the only safe cross-device identity for normal synced rows.
 */

import { db } from "../db";
import { assertAccountId, getAccountId, getDeviceId, normalizeSyncStatus, SYNC_STATUS_VALUE } from "./syncConfig";
import { isSyncTable, SyncTableName } from "./syncTables";

export type SyncableRecord = Record<string, any> & {
  id?: number;
  cloudId?: string | null;
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
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
    cloudId: data.cloudId ?? existing?.cloudId,
    createdAt: existing?.createdAt || data.createdAt || nowTimestamp(),
    updatedAt: nowTimestamp(),
    version: Number(existing?.version || data.version || 0) + 1,
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

function sameNumber(a: any, b: any) {
  return Number(a || 0) === Number(b || 0);
}

async function findByCloudId(table: any, cloudId?: string | null) {
  if (!cloudId) return null;

  const byCloudId = await table
    .where("cloudId")
    .equals(cloudId)
    .first()
    .catch(async () => {
      const rows = await table.toArray();
      return rows.find((row: any) => row.cloudId === cloudId);
    });

  return byCloudId || null;
}

async function findMediaAssetByOwnerIdentity(table: any, payload: any) {
  if (!payload?.ownerTable || !payload?.fieldKey) return null;

  const rows = await table.toArray();
  const activeRows = rows.filter((row: any) => !row?.isDeleted);

  const baseMatch = (row: any) => {
    if (payload.accountId && row.accountId !== payload.accountId) return false;
    if (hasValue(payload.schoolId) && !sameNumber(row.schoolId, payload.schoolId)) return false;
    if (hasValue(payload.branchId) && !sameNumber(row.branchId, payload.branchId)) return false;
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

  // Persisted records can match by cloud owner first, then local owner.
  if (hasValue(payload.ownerCloudId)) {
    const byOwnerCloudId = activeRows.find((row: any) => baseMatch(row) && sameString(row.ownerCloudId, payload.ownerCloudId));
    if (byOwnerCloudId) return byOwnerCloudId;
  }

  if (hasValue(payload.ownerLocalId)) {
    const byOwnerLocalId = activeRows.find((row: any) => baseMatch(row) && sameNumber(row.ownerLocalId, payload.ownerLocalId));
    if (byOwnerLocalId) return byOwnerLocalId;
  }

  return null;
}

export async function findExistingLocalRecord(
  table: any,
  record: { tableName?: string | null; cloudId?: string | null; localId?: number | null; payload?: any }
) {
  // Cloud IDs are globally stable. Always trust them before local Dexie IDs.
  // This is critical for multi-device sync because local numeric Dexie ids
  // can collide across browsers/devices.
  const byCloudId = await findByCloudId(table, record.cloudId || record.payload?.cloudId);
  if (byCloudId) return byCloudId;

  // mediaAssets also have safe owner identity matching. This prevents image
  // bleed when media records are pulled from another device.
  if (record.tableName === "mediaAssets" || record.payload?.ownerTable) {
    const byOwnerIdentity = await findMediaAssetByOwnerIdentity(table, record.payload || {});
    if (byOwnerIdentity) return byOwnerIdentity;
    return null;
  }

  // IMPORTANT:
  // Do NOT match normal pulled records by payload.id or record.localId alone.
  // Those are local Dexie ids, not global identities. If device A has student #2
  // and device B already has a different local row #2, matching by numeric id
  // merges two different people into one record. That is exactly how one student
  // can disappear locally while enrollments still show two.
  return null;
}

export async function createLocal<T extends SyncableRecord>(tableName: SyncTableName | string, data: T) {
  assertAccountId();
  const table = getSyncTable(tableName);
  const prepared = prepareSyncData(data);
  delete (prepared as any).id;
  const id = await table.add(prepared);
  return table.get(id);
}

export async function updateLocal<T extends SyncableRecord>(tableName: SyncTableName | string, id: number, patch: Partial<T>) {
  assertAccountId();
  const table = getSyncTable(tableName);
  const existing = await table.get(id);
  if (!existing) throw new Error(`${tableName} record #${id} was not found.`);

  const prepared = prepareSyncData({ ...existing, ...patch } as T, existing);
  await table.update(id, prepared);
  return table.get(id);
}

export async function softDeleteLocal(tableName: SyncTableName | string, id: number) {
  assertAccountId();
  const table = getSyncTable(tableName);
  const existing = await table.get(id);
  if (!existing) throw new Error(`${tableName} record #${id} was not found.`);

  const prepared = prepareSoftDelete(existing);
  await table.update(id, prepared);
  return table.get(id);
}

export async function restoreLocal(tableName: SyncTableName | string, id: number) {
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
