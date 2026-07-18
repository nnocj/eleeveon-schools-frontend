/**
 * app/lib/sync/pushSync.ts
 * --------------------------------------------------------------------------
 * Pushes pending/error local-first rows for the active account only.
 *
 * Phase 3 safety preserved:
 * - records from another account are never pushed under the active account;
 * - account-less rows are rejected instead of silently assigned;
 * - mediaBlobs remain local-only;
 * - unattached temporary media remains local.
 *
 * Payload-size upgrade:
 * - recursively removes accidental Blob/File/base64/object-URL values;
 * - measures UTF-8 JSON size before sending;
 * - splits records into count- and byte-bounded batches;
 * - automatically bisects batches rejected with HTTP 413;
 * - isolates a single oversized row so it cannot block every other record;
 * - continues syncing other safe records whenever possible.
 */

import { db } from "../db";

import {
  assertAccountId,
  getDeviceId,
  type PushResponse,
  type PushResponseItem,
  type SyncPushRecord,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
} from "./syncConfig";

import { syncHttp } from "./syncHttp";
import { PUSH_SYNC_TABLES } from "./syncTables";

import {
  markSyncError,
  shouldPush,
  stripLocalOnlyFields,
} from "./syncUtils";

import { registerSyncDevice } from "./syncDevices";

import {
  integrityReason,
  quarantineSyncRecord,
  validatePushRecord,
} from "./syncIntegrity";

const MAX_RECORDS_PER_BATCH = 40;
const MAX_BATCH_BYTES = 700 * 1024;
const MAX_SINGLE_RECORD_BYTES = 500 * 1024;
const MAX_SANITIZE_DEPTH = 30;

const LOCAL_ONLY_FIELD_NAMES = new Set([
  "blob",
  "file",
  "files",
  "originalFile",
  "optimizedFile",
  "localBlob",
  "localBlobData",
  "blobData",
  "fileData",
  "base64",
  "dataUrl",
  "previewUrl",
  "objectUrl",
  "localObjectUrl",
  "temporaryUrl",
  "rawFile",
  "arrayBuffer",
  "buffer",
  "binary",
  "bytes",
]);

export type PushSyncResult = {
  pushed: number;
  attempted: number;
  skippedWrongAccount: number;
  skippedOversized: number;
  batches: number;
  errors: string[];
  conflicts?: number;
  accountId: string;
};

type OversizedRecord = {
  record: SyncPushRecord;
  bytes: number;
};

type PushBatchPlan = {
  batches: SyncPushRecord[][];
  oversized: OversizedRecord[];
};

type PushAccumulator = {
  pushed: number;
  conflicts: number;
  batches: number;
  errors: string[];
};

function hasRealMediaOwner(row: any) {
  return Boolean(row?.ownerLocalId || row?.ownerCloudId);
}

function isTemporaryUnattachedMediaAsset(tableName: string, row: any) {
  return (
    tableName === "mediaAssets" &&
    Boolean(row?.ownerTempKey) &&
    !hasRealMediaOwner(row)
  );
}

function isBlobLike(value: unknown) {
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof File !== "undefined" && value instanceof File) return true;
  return false;
}

function isUnsafeDataString(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("blob:") ||
    normalized.startsWith("data:image/") ||
    normalized.startsWith("data:application/") ||
    normalized.startsWith("data:audio/") ||
    normalized.startsWith("data:video/") ||
    normalized.startsWith("data:font/")
  );
}

function sanitizeTransportValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return undefined;
  if (value === null || value === undefined) return value;
  if (isBlobLike(value)) return undefined;

  if (typeof value === "string") {
    return isUnsafeDataString(value) ? undefined : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeTransportValue(item, seen, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return undefined;
    seen.add(objectValue);

    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(objectValue)) {
      if (LOCAL_ONLY_FIELD_NAMES.has(key)) continue;

      const sanitized = sanitizeTransportValue(child, seen, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }

    return output;
  }

  return undefined;
}

function cleanPayloadForPush(
  tableName: string,
  row: any,
  patch: Record<string, any>,
) {
  const initiallyStripped = stripLocalOnlyFields({ ...row, ...patch });
  const sanitized = sanitizeTransportValue(initiallyStripped);

  const payload =
    sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? (sanitized as Record<string, any>)
      : {};

  if (tableName === "mediaAssets") delete payload.ownerTempKey;
  delete payload.id;

  return payload;
}

function getJsonByteSize(value: unknown) {
  try {
    const json = JSON.stringify(value);

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(json).byteLength;
    }

    if (typeof Blob !== "undefined") return new Blob([json]).size;

    return unescape(encodeURIComponent(json)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function formatByteSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

function estimateBatchBytes(
  records: SyncPushRecord[],
  accountId = "",
  deviceId = "",
) {
  return getJsonByteSize({ accountId, deviceId, records });
}

function createPushBatches(
  records: SyncPushRecord[],
  accountId: string,
  deviceId: string,
): PushBatchPlan {
  const batches: SyncPushRecord[][] = [];
  const oversized: OversizedRecord[] = [];
  let currentBatch: SyncPushRecord[] = [];

  for (const record of records) {
    const recordBytes = getJsonByteSize(record);

    if (!Number.isFinite(recordBytes) || recordBytes > MAX_SINGLE_RECORD_BYTES) {
      oversized.push({ record, bytes: recordBytes });
      continue;
    }

    const candidate = [...currentBatch, record];
    const wouldExceedCount = candidate.length > MAX_RECORDS_PER_BATCH;
    const wouldExceedBytes =
      estimateBatchBytes(candidate, accountId, deviceId) > MAX_BATCH_BYTES;

    if (currentBatch.length > 0 && (wouldExceedCount || wouldExceedBytes)) {
      batches.push(currentBatch);
      currentBatch = [record];
      continue;
    }

    currentBatch = candidate;
  }

  if (currentBatch.length) batches.push(currentBatch);

  return { batches, oversized };
}

function isRequestTooLargeError(error: unknown) {
  const value = error as any;

  return (
    Number(value?.status) === 413 ||
    Number(value?.statusCode) === 413 ||
    /request entity too large|payload too large|content too large|http 413|\b413\b/i.test(
      String(value?.message || value?.error || ""),
    )
  );
}

function isNetworkError(error: unknown) {
  const value = error as any;

  return (
    value instanceof TypeError ||
    /failed to fetch|network|offline|connection|timeout/i.test(
      String(value?.message || ""),
    )
  );
}

async function markRecordError(record: SyncPushRecord, message: string) {
  const table = (db as any)[record.tableName];
  if (!table) return;

  const existing = await table.get(record.localId).catch(() => null);
  if (!existing) return;

  await table.update(record.localId, markSyncError(existing, message));
}

async function applyPushResult(
  result: PushResponseItem,
  accountId: string,
  deviceId: string,
  accumulator: PushAccumulator,
) {
  const table = (db as any)[result.tableName];

  if (!table) {
    accumulator.errors.push(
      `${result.tableName} #${result.localId}: local table was not found.`,
    );
    return;
  }

  const existing = await table.get(result.localId).catch(() => null);

  if (!existing || existing.accountId !== accountId) {
    accumulator.errors.push(
      `${result.tableName} #${result.localId}: local account changed during push.`,
    );
    return;
  }

  if (!result.ok) {
    if (result.conflict) accumulator.conflicts++;

    const message =
      `${result.tableName} #${result.localId}: ` +
      (result.error || "Failed to push");

    accumulator.errors.push(message);
    await table.update(result.localId, markSyncError(existing, message));
    return;
  }

  const patch: Record<string, any> = {
    cloudId: result.cloudId || existing.cloudId || undefined,
    accountId,
    version: result.version,
    updatedAt: Number(result.updatedAt || Date.now()),
    deviceId,
    synced: SYNC_STATUS_VALUE.SYNCED,
    syncError: undefined,
  };

  if (result.tableName === "mediaAssets") patch.ownerTempKey = undefined;

  await table.update(result.localId, patch);
  accumulator.pushed++;
}

async function sendPushBatch(
  batch: SyncPushRecord[],
  accountId: string,
  deviceId: string,
  accumulator: PushAccumulator,
): Promise<void> {
  if (!batch.length) return;

  accumulator.batches++;

  try {
    const response = await syncHttp<PushResponse>(SYNC_ENDPOINTS.PUSH, {
      method: "POST",
      body: { accountId, deviceId, records: batch },
    });

    accumulator.conflicts += Number(response.conflicts?.length || 0);

    for (const result of response.results || []) {
      await applyPushResult(result, accountId, deviceId, accumulator);
    }

    const returnedKeys = new Set(
      (response.results || []).map(
        (result) => `${result.tableName}:${result.localId}`,
      ),
    );

    for (const record of batch) {
      const key = `${record.tableName}:${record.localId}`;
      if (returnedKeys.has(key)) continue;

      const message =
        `${record.tableName} #${record.localId}: ` +
        "the sync server returned no result for this record.";

      accumulator.errors.push(message);
      await markRecordError(record, message);
    }
  } catch (error: any) {
    if (isRequestTooLargeError(error) && batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);

      await sendPushBatch(
        batch.slice(0, middle),
        accountId,
        deviceId,
        accumulator,
      );

      await sendPushBatch(
        batch.slice(middle),
        accountId,
        deviceId,
        accumulator,
      );

      return;
    }

    if (isRequestTooLargeError(error) && batch.length === 1) {
      const record = batch[0];
      const bytes = getJsonByteSize(record);

      const message =
        `${record.tableName} #${record.localId} ` +
        `is too large for normal sync (${formatByteSize(bytes)}). ` +
        "Remove embedded binary/base64 data or move it through the media upload pipeline.";

      accumulator.errors.push(message);
      await markRecordError(record, message);
      return;
    }

    const message = error?.message || String(error);

    for (const record of batch) {
      const recordMessage =
        `${record.tableName} #${record.localId}: ` +
        `push batch failed: ${message}`;

      accumulator.errors.push(recordMessage);

      if (!isNetworkError(error)) {
        await markRecordError(record, recordMessage);
      }
    }

    if (isNetworkError(error)) throw error;
  }
}

export async function collectPendingSyncRecords(options?: {
  accountId?: string;
}): Promise<{
  records: SyncPushRecord[];
  skippedWrongAccount: number;
  errors: string[];
}> {
  const activeAccountId = assertAccountId();
  const accountId = options?.accountId || activeAccountId;

  if (accountId !== activeAccountId) {
    throw new Error("Refusing to collect records for a non-active account.");
  }

  const deviceId = getDeviceId();
  const records: SyncPushRecord[] = [];
  const errors: string[] = [];
  let skippedWrongAccount = 0;

  for (const tableName of PUSH_SYNC_TABLES) {
    const table = (db as any)[tableName];
    if (!table) continue;

    const rows = await table.toArray();

    for (const row of rows) {
      if (!shouldPush(row, tableName)) continue;
      if (isTemporaryUnattachedMediaAsset(tableName, row)) continue;

      if (!row.accountId) {
        const message =
          `${tableName} #${row.id ?? "?"}: missing accountId.`;

        errors.push(message);

        await quarantineSyncRecord({
          source: "push",
          tableName,
          localId:
            Number.isFinite(Number(row.id))
              ? Number(row.id)
              : undefined,
          reason: message,
          payload: row,
        });

        if (
          Number.isFinite(Number(row.id)) &&
          Number(row.id) > 0
        ) {
          await table.update(
            Number(row.id),
            markSyncError(
              row,
              message,
            ),
          );
        }

        continue;
      }

      if (row.accountId !== accountId) {
        skippedWrongAccount++;
        continue;
      }

      const localId = Number(row.id);
      if (!Number.isFinite(localId) || localId <= 0) {
        const message =
          `${tableName}: pending row has no valid local ID.`;

        errors.push(message);

        await quarantineSyncRecord({
          source: "push",
          accountId,
          tableName,
          reason: message,
          payload: row,
        });

        continue;
      }

      /**
       * Do not repair malformed version/timestamp values silently here.
       * Phase 17 validation must quarantine them so corruption is visible.
       */
      const updatedAt =
        Number(row.updatedAt);

      const version =
        Number(row.version);
      const rowDeviceId = row.deviceId || deviceId;

      const payload = cleanPayloadForPush(tableName, row, {
        accountId,
        deviceId: rowDeviceId,
        version,
        updatedAt,
      });

      const candidate: SyncPushRecord = {
        tableName,
        localId,
        cloudId: row.cloudId || undefined,
        accountId,
        deviceId: rowDeviceId,
        version,
        updatedAt,
        isDeleted: Boolean(row.isDeleted),
        payload,
      };

      const integrity =
        validatePushRecord(
          candidate,
          accountId,
        );

      if (!integrity.ok) {
        const message =
          `${tableName} #${localId}: ` +
          integrityReason(
            integrity.issues,
          );

        errors.push(message);

        await quarantineSyncRecord({
          source: "push",
          accountId,
          tableName,
          localId,
          cloudId:
            row.cloudId ||
            undefined,
          reason: message,
          payload: candidate,
        });

        await table.update(
          localId,
          markSyncError(
            row,
            message,
          ),
        );

        continue;
      }

      records.push(candidate);
    }
  }

  return { records, skippedWrongAccount, errors };
}

export async function pushSync(options?: {
  accountId?: string;
}): Promise<PushSyncResult> {
  const activeAccountId = assertAccountId();
  const accountId = options?.accountId || activeAccountId;

  if (accountId !== activeAccountId) {
    throw new Error("Refusing to push a non-active account.");
  }

  const deviceId = getDeviceId();
  const collected = await collectPendingSyncRecords({ accountId });

  const accumulator: PushAccumulator = {
    pushed: 0,
    conflicts: 0,
    batches: 0,
    errors: [...collected.errors],
  };

  await registerSyncDevice({
    silent: true,
    patch: { lastPushAt: new Date().toISOString() },
  }).catch(() => undefined);

  if (!collected.records.length) {
    return {
      pushed: 0,
      attempted: 0,
      skippedWrongAccount: collected.skippedWrongAccount,
      skippedOversized: 0,
      batches: 0,
      errors: accumulator.errors,
      conflicts: 0,
      accountId,
    };
  }

  const plan = createPushBatches(collected.records, accountId, deviceId);

  for (const oversized of plan.oversized) {
    const message =
      `${oversized.record.tableName} #${oversized.record.localId} ` +
      `is too large to sync normally (${formatByteSize(oversized.bytes)}). ` +
      "Remove embedded binary/base64 data or use the media upload pipeline.";

    accumulator.errors.push(message);
    await markRecordError(oversized.record, message);
  }

  for (const batch of plan.batches) {
    try {
      await sendPushBatch(batch, accountId, deviceId, accumulator);
    } catch (error) {
      if (isNetworkError(error)) break;
    }
  }

  return {
    pushed: accumulator.pushed,
    attempted: collected.records.length,
    skippedWrongAccount: collected.skippedWrongAccount,
    skippedOversized: plan.oversized.length,
    batches: accumulator.batches,
    errors: accumulator.errors,
    conflicts: accumulator.conflicts,
    accountId,
  };
}