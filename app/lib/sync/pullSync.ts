/**
 * app/lib/sync/pullSync.ts
 * ---------------------------------------------------------
 * Pulls cloud SyncRecord changes into Dexie.
 * Also understands optional backend cache records returned
 * by upgraded backend.
 *
 * Media safety upgrade:
 * - mediaAssets must not be matched by plain local numeric id first.
 *   Local Dexie ids can collide across browsers/devices, so mediaAssets
 *   are resolved by cloudId, ownerTempKey, ownerCloudId, or strict
 *   ownerTable + ownerLocalId + fieldKey identity before localId fallback.
 * - This prevents the latest teacher/student/parent image from replacing
 *   another record's image when pulled from sync.
 */

import { db } from "../db";
import {
  assertAccountId,
  getDeviceId,
  getLastSyncAt,
  PullResponse,
  setLastSyncAt,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
  forceFullSyncNextRun,
} from "./syncConfig";

import { syncHttp } from "./syncHttp";
import {
  isBackendCacheTable,
  isPullSyncTable,
  isSyncTable,
} from "./syncTables";

import {
  findExistingLocalRecord,
  resolveConflict,
} from "./syncUtils";

import { applyPlatformCacheRecords } from "./platformCache";

export type PullSyncResult = {
  pulled: number;
  skipped: number;
  errors: string[];
  cacheUpdated?: number;
};

function cleanIncomingPayload(payload: Record<string, any>, localId?: number) {
  const copy = { ...(payload || {}) };

  if (localId != null) {
    copy.id = localId;
  } else {
    delete copy.id;
  }

  return copy;
}

function hasValue(value: any) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function sameValue(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

async function findByCloudId(table: any, cloudId?: string | null) {
  if (!hasValue(cloudId)) return null;

  const cleanCloudId = String(cloudId);

  try {
    const indexed = await table.where("cloudId").equals(cleanCloudId).first();
    if (indexed) return indexed;
  } catch {
    // Some old Dexie versions/tables may not have the index available.
  }

  const rows = await table.toArray();
  return rows.find((row: any) => sameValue(row.cloudId, cleanCloudId)) || null;
}

async function findExistingMediaAsset(table: any, record: any) {
  const payload = record.payload || {};
  const cloudId = record.cloudId || payload.cloudId;

  // 1) Cloud id is the only globally safe permanent identity.
  const byCloudId = await findByCloudId(table, cloudId);
  if (byCloudId) return byCloudId;

  const rows = await table.toArray();
  const activeRows = rows.filter((row: any) => !row.isDeleted);

  const accountId = payload.accountId || record.accountId;
  const ownerTable = payload.ownerTable;
  const fieldKey = payload.fieldKey;
  const ownerTempKey = payload.ownerTempKey;
  const ownerCloudId = payload.ownerCloudId;
  const ownerLocalId = payload.ownerLocalId ?? record.localId;

  // 2) Temporary form key is safe for unsaved forms on the same device/session.
  // It prevents "latest upload wins" behavior before ownerLocalId exists.
  if (hasValue(ownerTempKey)) {
    const byTempKey = activeRows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      if (hasValue(ownerTable) && !sameValue(row.ownerTable, ownerTable)) return false;
      if (hasValue(fieldKey) && !sameValue(row.fieldKey, fieldKey)) return false;
      return sameValue(row.ownerTempKey, ownerTempKey);
    });
    if (byTempKey) return byTempKey;
  }

  // 3) Owner cloud id is also stable after the owner has synced.
  if (hasValue(ownerCloudId)) {
    const byOwnerCloud = activeRows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      if (hasValue(ownerTable) && !sameValue(row.ownerTable, ownerTable)) return false;
      if (hasValue(fieldKey) && !sameValue(row.fieldKey, fieldKey)) return false;
      return sameValue(row.ownerCloudId, ownerCloudId);
    });
    if (byOwnerCloud) return byOwnerCloud;
  }

  // 4) Strict ownerLocalId matching is allowed only with ownerTable + fieldKey.
  // Never match mediaAssets by localId alone because local ids collide across devices.
  if (hasValue(ownerLocalId) && hasValue(ownerTable) && hasValue(fieldKey)) {
    const byStrictOwnerLocal = activeRows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      return (
        sameValue(row.ownerTable, ownerTable) &&
        sameValue(row.fieldKey, fieldKey) &&
        sameValue(row.ownerLocalId, ownerLocalId)
      );
    });
    if (byStrictOwnerLocal) return byStrictOwnerLocal;
  }

  // 5) Last fallback: payload.id only if it points to a media row with the same cloudId.
  // This protects against local numeric id collisions.
  const payloadId = payload.id;
  if (hasValue(payloadId)) {
    const byPayloadId = await table.get(Number(payloadId)).catch(() => null);
    if (byPayloadId && hasValue(cloudId) && sameValue(byPayloadId.cloudId, cloudId)) return byPayloadId;
  }

  return null;
}

async function findExistingRecordForPull(tableName: string, table: any, record: any) {
  if (tableName === "mediaAssets") {
    return findExistingMediaAsset(table, record);
  }

  return findExistingLocalRecord(table, {
    cloudId: record.cloudId,
    localId: record.localId,
    payload: record.payload,
  });
}

function normalizeIncomingMediaPayload(payload: Record<string, any>) {
  if (!payload) return payload;
  const copy = { ...payload };

  // Keep media metadata small and safe. Actual Blob/File/object URLs are local-only.
  delete copy.blob;
  delete copy.file;
  delete copy.originalFile;
  delete copy.optimizedFile;
  delete copy.localBlob;
  delete copy.localBlobData;
  delete copy.previewUrl;
  delete copy.objectUrl;
  delete copy.localObjectUrl;
  delete copy.dataUrl;
  delete copy.base64;

  return copy;
}

export async function pullSync(options?: {full?: boolean;}): Promise<PullSyncResult> {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();

  const lastSyncAt = options?.full
    ? 0
    : getLastSyncAt();

  const errors: string[] = [];

  let pulled = 0;
  let skipped = 0;
  let cacheUpdated = 0;

  try {
    const response = await syncHttp<PullResponse>(SYNC_ENDPOINTS.PULL, {
      method: "POST",
      body: {
        accountId,
        deviceId,
        since: lastSyncAt,
      },
    });

    for (const record of response.records || []) {
      if (!isPullSyncTable(record.tableName)) {
        skipped++;
        continue;
      }

      // -------------------------------------------------
      // BACKEND CACHE TABLES
      // -------------------------------------------------

      if (isBackendCacheTable(record.tableName) && !isSyncTable(record.tableName)) {
        const result = await applyPlatformCacheRecords([
          {
            tableName: record.tableName,
            payload: record.payload,
            id: record.payload?.id ?? record.cloudId ?? undefined,
            accountId,
          },
        ]);

        cacheUpdated += result.updated;
        skipped += result.skipped;
        errors.push(...result.errors);

        continue;
      }

      // -------------------------------------------------
      // NORMAL SYNC TABLES
      // -------------------------------------------------

      if (!isSyncTable(record.tableName)) {
        skipped++;
        continue;
      }

      const table = (db as any)[record.tableName];

      if (!table) {
        skipped++;
        continue;
      }

      const payload = record.tableName === "mediaAssets"
        ? normalizeIncomingMediaPayload(record.payload || {})
        : record.payload || {};

      const incomingUpdatedAt = Number(record.updatedAt || payload?.updatedAt || Date.now());

      const existing: any = await findExistingRecordForPull(record.tableName, table, {
        ...record,
        payload,
        accountId,
      });

      const existingId = existing?.id ?? existing?.localId ?? undefined;

      const incoming: any = {
        ...cleanIncomingPayload(payload || {}, existingId),

        cloudId: record.cloudId || payload?.cloudId,

        accountId,

        deviceId: record.deviceId || payload?.deviceId || deviceId,

        version: Number(record.version || payload?.version || 1),

        updatedAt: incomingUpdatedAt,

        isDeleted: !!record.isDeleted,

        synced: SYNC_STATUS_VALUE.SYNCED,

        syncError: undefined,
      };

      // -------------------------------------------------
      // UPDATE EXISTING
      // -------------------------------------------------

      if (existingId != null) {
        const winner = resolveConflict(existing, incoming) as any;

        if (winner === existing) {
          skipped++;
          continue;
        }

        await table.update(existingId, {
          ...winner,
          id: existingId,
          synced: SYNC_STATUS_VALUE.SYNCED,
        });

        pulled++;
        continue;
      }

      // -------------------------------------------------
      // INSERT NEW
      // -------------------------------------------------

      delete incoming.id;

      await table.add(incoming);

      pulled++;
    }

    // -------------------------------------------------
    // PLATFORM CACHE RECORDS
    // -------------------------------------------------

    const cacheRecords = [
      ...(response.cacheRecords || []),
      ...(response.platformRecords || []),
    ];

    if (cacheRecords.length) {
      const cache = await applyPlatformCacheRecords(cacheRecords);

      cacheUpdated += cache.updated;
      skipped += cache.skipped;
      errors.push(...cache.errors);
    }

    if (response.serverTime && !options?.full) {
      setLastSyncAt(Number(response.serverTime));
    }

    if (response.serverTime && options?.full) {
      setLastSyncAt(Number(response.serverTime));
    }
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  return {
    pulled,
    skipped,
    errors,
    cacheUpdated,
  };
}

/**
 * ---------------------------------------------------------
 * REPAIR SYNC
 * ---------------------------------------------------------
 * Forces a full pull from backend regardless of lastSyncAt.
 *
 * Useful when:
 * - backend has records
 * - Dexie is missing records
 * - incremental pull cannot recover them
 */
export async function repairSync(): Promise<PullSyncResult> {
  forceFullSyncNextRun();

  return pullSync({
    full: true,
  });
}