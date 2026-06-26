/**
 * app/lib/sync/pullSync.ts
 * ---------------------------------------------------------
 * Pulls cloud SyncRecord changes into Dexie.
 * Also understands optional backend cache records returned
 * by upgraded backend.
 *
 * Media source-of-truth upgrade:
 * - mediaAssets are synced metadata and are the cross-device image source.
 * - mediaBlobs remain local-only and are never expected from normal pull sync.
 * - mediaAssets are not matched by plain local numeric id first because local
 *   Dexie ids can collide across browsers/devices.
 * - incoming mediaAssets from cloud replace stale local metadata, including
 *   previewDataUrl, thumbnailDataUrl, remoteUrl/publicUrl, active and isDeleted.
 * - deleted/inactive mediaAssets are applied locally so replaced images stop
 *   appearing on other devices.
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

import {
  clearMediaObjectUrlCache,
  revokeMediaObjectUrl,
} from "../media/mediaAssetUtils";

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

function toNumber(value: any) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isMediaAssetsTable(tableName?: string | null) {
  return String(tableName || "") === "mediaAssets";
}

function isMediaBlobsTable(tableName?: string | null) {
  return String(tableName || "") === "mediaBlobs";
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

  const accountId = payload.accountId || record.accountId;
  const ownerTable = payload.ownerTable;
  const fieldKey = payload.fieldKey;
  const ownerTempKey = payload.ownerTempKey;
  const ownerCloudId = payload.ownerCloudId;
  const ownerLocalId = payload.ownerLocalId;

  // 2) Temporary form key is safe for unsaved forms on the same device/session.
  if (hasValue(ownerTempKey)) {
    const byTempKey = rows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      if (hasValue(ownerTable) && !sameValue(row.ownerTable, ownerTable)) return false;
      if (hasValue(fieldKey) && !sameValue(row.fieldKey, fieldKey)) return false;
      return sameValue(row.ownerTempKey, ownerTempKey);
    });
    if (byTempKey) return byTempKey;
  }

  // 3) Owner cloud id is stable after the owner has synced.
  if (hasValue(ownerCloudId)) {
    const byOwnerCloud = rows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      if (hasValue(ownerTable) && !sameValue(row.ownerTable, ownerTable)) return false;
      if (hasValue(fieldKey) && !sameValue(row.fieldKey, fieldKey)) return false;
      return sameValue(row.ownerCloudId, ownerCloudId);
    });
    if (byOwnerCloud) return byOwnerCloud;
  }

  // 4) Strict ownerLocalId matching is allowed only with ownerTable + fieldKey.
  // Never match mediaAssets by local numeric id alone because local ids collide
  // across devices.
  if (hasValue(ownerLocalId) && hasValue(ownerTable) && hasValue(fieldKey)) {
    const byStrictOwnerLocal = rows.find((row: any) => {
      if (hasValue(accountId) && !sameValue(row.accountId, accountId)) return false;
      return (
        sameValue(row.ownerTable, ownerTable) &&
        sameValue(row.fieldKey, fieldKey) &&
        sameValue(row.ownerLocalId, ownerLocalId)
      );
    });
    if (byStrictOwnerLocal) return byStrictOwnerLocal;
  }

  // 5) Last fallback: payload.id only if it points to a row with the same cloudId.
  const payloadId = payload.id;
  if (hasValue(payloadId)) {
    const byPayloadId = await table.get(Number(payloadId)).catch(() => null);
    if (byPayloadId && hasValue(cloudId) && sameValue(byPayloadId.cloudId, cloudId)) return byPayloadId;
  }

  return null;
}

async function findExistingRecordForPull(tableName: string, table: any, record: any) {
  if (isMediaAssetsTable(tableName)) {
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

  // Never trust local blob pointers from another browser/device.
  delete copy.localBlobId;
  delete copy.localObjectUrl;

  return copy;
}

function normalizeIncomingPayloadForTable(tableName: string, payload: Record<string, any>) {
  if (isMediaAssetsTable(tableName)) return normalizeIncomingMediaPayload(payload || {});
  return payload || {};
}

function isIncomingMediaDeleted(incoming: any) {
  return !!incoming?.isDeleted || incoming?.active === false;
}

function mediaCloudWins(existing: any, incoming: any) {
  const existingUpdatedAt = Number(existing?.updatedAt || 0);
  const incomingUpdatedAt = Number(incoming?.updatedAt || 0);

  if (!existing) return incoming;

  // Deleted/inactive cloud media must always be applied locally.
  if (isIncomingMediaDeleted(incoming)) return incoming;

  // If cloud is newer or equal, cloud metadata is source of truth.
  if (incomingUpdatedAt >= existingUpdatedAt) return incoming;

  // If local has pending unsynced changes that are newer, keep local.
  if (existing?.synced && existing.synced !== SYNC_STATUS_VALUE.SYNCED) return existing;

  return existing;
}

async function invalidateMediaPreview(existing: any, incoming: any) {
  const ids = [
    existing?.id,
    incoming?.id,
    existing?.localId,
    incoming?.localId,
  ]
    .map(toNumber)
    .filter((value): value is number => value !== undefined);

  ids.forEach((id) => {
    try {
      revokeMediaObjectUrl(existing?.localObjectUrl);
      revokeMediaObjectUrl(incoming?.localObjectUrl);
    } catch {
      // ignore
    }
  });

  // The shared media utility keeps a small in-memory cache. Clearing it after a
  // media pull is safer than letting list pages reuse a stale data/blob URL.
  clearMediaObjectUrlCache();
}

function mergeIncomingMediaForUpdate(existing: any, incoming: any, existingId: number) {
  const winner = mediaCloudWins(existing, incoming);

  if (winner === existing) return existing;

  return {
    ...existing,
    ...incoming,

    // Preserve this browser's local blob pointer only if the cloud did not mark
    // the media deleted. mediaBlobs are local-only and cannot be trusted from cloud.
    localBlobId: isIncomingMediaDeleted(incoming) ? undefined : existing?.localBlobId,
    localObjectUrl: undefined,

    id: existingId,
    synced: SYNC_STATUS_VALUE.SYNCED,
    syncError: undefined,
  };
}

function mergeIncomingRecordForUpdate(tableName: string, existing: any, incoming: any, existingId: number) {
  if (isMediaAssetsTable(tableName)) {
    return mergeIncomingMediaForUpdate(existing, incoming, existingId);
  }

  const winner = resolveConflict(existing, incoming) as any;
  if (winner === existing) return existing;

  return {
    ...winner,
    id: existingId,
    synced: SYNC_STATUS_VALUE.SYNCED,
  };
}

function prepareIncomingForInsert(tableName: string, incoming: any) {
  const copy = { ...incoming };
  delete copy.id;

  if (isMediaAssetsTable(tableName)) {
    // Do not keep foreign local blob pointers from another device.
    copy.localBlobId = undefined;
    copy.localObjectUrl = undefined;
  }

  return copy;
}

export async function pullSync(options?: { full?: boolean }): Promise<PullSyncResult> {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();

  const lastSyncAt = options?.full ? 0 : getLastSyncAt();

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
      // mediaBlobs are local-only browser Blob records and must never be pulled
      // through normal SyncRecord.
      if (isMediaBlobsTable(record.tableName)) {
        skipped++;
        continue;
      }

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

      const payload = normalizeIncomingPayloadForTable(record.tableName, record.payload || {});
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

        isDeleted: !!record.isDeleted || !!payload?.isDeleted,

        synced: SYNC_STATUS_VALUE.SYNCED,

        syncError: undefined,
      };

      // -------------------------------------------------
      // UPDATE EXISTING
      // -------------------------------------------------

      if (existingId != null) {
        if (isMediaAssetsTable(record.tableName)) {
          await invalidateMediaPreview(existing, incoming);
        }

        const merged = mergeIncomingRecordForUpdate(record.tableName, existing, incoming, Number(existingId));

        if (merged === existing) {
          skipped++;
          continue;
        }

        await table.update(existingId, merged);

        pulled++;
        continue;
      }

      // -------------------------------------------------
      // INSERT NEW
      // -------------------------------------------------

      const insert = prepareIncomingForInsert(record.tableName, incoming);

      if (isMediaAssetsTable(record.tableName)) {
        await invalidateMediaPreview(undefined, insert);
      }

      await table.add(insert);

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

    if (response.serverTime) {
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
 * - mediaAssets changed on another device but this browser has stale metadata
 */
export async function repairSync(): Promise<PullSyncResult> {
  forceFullSyncNextRun();

  return pullSync({
    full: true,
  });
}
