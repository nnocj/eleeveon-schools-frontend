/**
 * app/lib/sync/pushSync.ts
 * ---------------------------------------------------------
 * Pushes pending/error local Dexie records to the backend SyncRecord table.
 * Backend-owned cache tables are intentionally excluded.
 *
 * Media asset safety upgrade:
 * - shouldPush(row, tableName) is called explicitly so table-aware rules work.
 * - mediaAssets that are still attached only to ownerTempKey are held locally
 *   until the real owner record is saved and attachMediaAssetToOwner(...) clears
 *   ownerTempKey.
 * - mediaBlobs are never included because they are not part of PUSH_SYNC_TABLES
 *   and should remain browser-local binary storage.
 * - stripLocalOnlyFields(...) still removes Blob/File/object-url/base64 fields
 *   before payloads are sent to the backend.
 */

import { db } from "../db";
import {
  assertAccountId,
  getDeviceId,
  PushResponse,
  SyncPushRecord,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
} from "./syncConfig";
import { syncHttp } from "./syncHttp";
import { PUSH_SYNC_TABLES } from "./syncTables";
import { markSyncError, shouldPush, stripLocalOnlyFields } from "./syncUtils";
import { registerSyncDevice } from "./syncDevices";

export type PushSyncResult = {
  pushed: number;
  attempted: number;
  errors: string[];
  conflicts?: number;
};

function hasRealMediaOwner(row: any) {
  return !!(row?.ownerLocalId || row?.ownerCloudId);
}

function isTemporaryUnattachedMediaAsset(tableName: string, row: any) {
  if (tableName !== "mediaAssets") return false;

  // ownerTempKey is only a local form/session association. It prevents one
  // unsaved form upload from being confused with another. Do not push it as a
  // final media relationship until the owning Student/Teacher/Parent/etc. exists.
  return !!row?.ownerTempKey && !hasRealMediaOwner(row);
}

function cleanPayloadForPush(tableName: string, row: any, patch: Record<string, any>) {
  const payload = stripLocalOnlyFields({
    ...row,
    ...patch,
  });

  if (tableName === "mediaAssets") {
    // Once media has a real owner, ownerTempKey is not needed by the server.
    // Keeping it out of payloads avoids syncing temporary form/session IDs.
    delete (payload as any).ownerTempKey;
  }

  return payload;
}

export async function collectPendingSyncRecords(): Promise<SyncPushRecord[]> {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();
  const records: SyncPushRecord[] = [];

  for (const tableName of PUSH_SYNC_TABLES) {
    const table = (db as any)[tableName];
    if (!table) continue;

    const rows = await table.toArray();

    rows
      .filter((row: any) => shouldPush(row, tableName))
      .filter((row: any) => !isTemporaryUnattachedMediaAsset(tableName, row))
      .forEach((row: any) => {
        const updatedAt = Number(row.updatedAt || Date.now());
        const version = Math.max(1, Number(row.version || 1));
        const rowAccountId = row.accountId || accountId;
        const rowDeviceId = row.deviceId || deviceId;

        records.push({
          tableName,
          localId: Number(row.id),
          cloudId: row.cloudId || undefined,
          accountId: rowAccountId,
          deviceId: rowDeviceId,
          version,
          updatedAt,
          isDeleted: !!row.isDeleted,
          payload: cleanPayloadForPush(tableName, row, {
            accountId: rowAccountId,
            deviceId: rowDeviceId,
            version,
            updatedAt,
          }),
        });
      });
  }

  return records;
}

export async function pushSync(): Promise<PushSyncResult> {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();
  const errors: string[] = [];
  let pushed = 0;
  let conflicts = 0;

  const records = await collectPendingSyncRecords();

  if (!records.length) {
    await registerSyncDevice({ silent: true, patch: { lastPushAt: new Date().toISOString() } }).catch(() => undefined);
    return { pushed: 0, attempted: 0, errors, conflicts };
  }

  try {
    await registerSyncDevice({ silent: true, patch: { lastPushAt: new Date().toISOString() } }).catch(() => undefined);

    const response = await syncHttp<PushResponse>(SYNC_ENDPOINTS.PUSH, {
      method: "POST",
      body: {
        accountId,
        deviceId,
        records,
      },
    });

    conflicts += Number(response.conflicts?.length || 0);

    for (const result of response.results || []) {
      const table = (db as any)[result.tableName];
      if (!table) continue;

      if (!result.ok) {
        if ((result as any).conflict) conflicts++;

        const errorMessage = `${result.tableName} #${result.localId}: ${result.error || "Failed to push"}`;
        errors.push(errorMessage);

        const existing = await table.get(result.localId);
        if (existing) {
          await table.update(result.localId, markSyncError(existing, errorMessage));
        }

        continue;
      }

      const patch: Record<string, any> = {
        cloudId: result.cloudId || undefined,
        accountId,
        version: result.version,
        updatedAt: Number(result.updatedAt || Date.now()),
        deviceId,
        synced: SYNC_STATUS_VALUE.SYNCED,
        syncError: undefined,
      };

      // If a media asset was successfully pushed, it should already have a real
      // owner. Clear any stale temp key locally as a safety cleanup.
      if (result.tableName === "mediaAssets") {
        patch.ownerTempKey = undefined;
      }

      await table.update(result.localId, patch);

      pushed++;
    }
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  return { pushed, attempted: records.length, errors, conflicts };
}
