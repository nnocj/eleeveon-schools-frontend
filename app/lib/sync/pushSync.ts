import { db } from "../db";
import { apiClient } from "../api/apiClient";

import {
  getAccountId,
  getDeviceId,
  PushResponseItem,
  SyncPushRecord,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
} from "./syncConfig";

import { SYNC_TABLES } from "./syncTables";

function isAlreadySynced(row: any) {
  return String(row.synced).toLowerCase() === SYNC_STATUS_VALUE.SYNCED;
}

function shouldPush(row: any) {
  if (!row?.id) return false;
  return !isAlreadySynced(row);
}

export async function pushSync() {
  const accountId = getAccountId();
  const deviceId = getDeviceId();

  let pushed = 0;
  const errors: string[] = [];
  const records: SyncPushRecord[] = [];

  for (const tableName of SYNC_TABLES) {
    const table = (db as any)[tableName];
    if (!table) continue;

    const rows = await table.toArray();

    rows.filter(shouldPush).forEach((row: any) => {
      const updatedAt = Number(row.updatedAt || Date.now());
      const version = Number(row.version || 1);

      records.push({
        tableName,
        localId: row.id,
        cloudId: row.cloudId,
        accountId: row.accountId || accountId,
        deviceId: row.deviceId || deviceId,
        version,
        updatedAt,
        isDeleted: !!row.isDeleted,
        payload: {
          ...row,
          accountId: row.accountId || accountId,
          deviceId: row.deviceId || deviceId,
          version,
          updatedAt,
        },
      });
    });
  }

  if (!records.length) {
    return { pushed: 0, errors };
  }

  try {
    const response = await apiClient<{ results: PushResponseItem[] }>(
      SYNC_ENDPOINTS.PUSH,
      {
        method: "POST",
        body: {
          accountId,
          deviceId,
          records,
        },
      }
    );

    for (const result of response.results || []) {
      const table = (db as any)[result.tableName];
      if (!table) continue;

      if (!result.ok) {
        errors.push(
          `${result.tableName} #${result.localId}: ${
            result.error || "Failed to push"
          }`
        );

        await table.update(result.localId, {
          synced: SYNC_STATUS_VALUE.ERROR as any,
        });

        continue;
      }

      await table.update(result.localId, {
        cloudId: result.cloudId,
        accountId,
        version: result.version,
        updatedAt: result.updatedAt,
        synced: SYNC_STATUS_VALUE.SYNCED as any,
      });

      pushed++;
    }
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  return { pushed, errors };
}