import { db } from "../db";
import { apiClient } from "../api/apiClient";

import {
  getAccountId,
  getDeviceId,
  getLastSyncAt,
  PullResponse,
  setLastSyncAt,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
} from "./syncConfig";

async function findExistingLocalRecord(table: any, cloudId?: string) {
  if (!cloudId) return null;

  const rows = await table.toArray();

  return rows.find((row: any) => row.cloudId === cloudId) || null;
}

export async function pullSync() {
  const accountId = getAccountId();
  const deviceId = getDeviceId();
  const lastSyncAt = getLastSyncAt();

  let pulled = 0;
  const errors: string[] = [];

  try {
    const response = await apiClient<PullResponse>(SYNC_ENDPOINTS.PULL, {
      method: "POST",
      body: {
        accountId,
        deviceId,
        since: lastSyncAt,
      },
    });

    for (const record of response.records || []) {
      const table = (db as any)[record.tableName];
      if (!table) continue;

      const incoming = record.payload || {};
      const incomingUpdatedAt = Number(
        record.updatedAt || incoming.updatedAt || Date.now()
      );

      const existing = await findExistingLocalRecord(table, record.cloudId);

      if (existing?.id) {
        const localUpdatedAt = Number(existing.updatedAt || 0);

        if (incomingUpdatedAt >= localUpdatedAt) {
          await table.update(existing.id, {
            ...incoming,
            id: existing.id,
            cloudId: record.cloudId,
            accountId,
            deviceId: incoming.deviceId || record.deviceId || deviceId,
            version: record.version,
            updatedAt: incomingUpdatedAt,
            isDeleted: record.isDeleted,
            synced: SYNC_STATUS_VALUE.SYNCED as any,
          });

          pulled++;
        }

        continue;
      }

      const payloadToAdd = {
        ...incoming,
        cloudId: record.cloudId,
        accountId,
        deviceId: incoming.deviceId || record.deviceId || deviceId,
        version: record.version,
        updatedAt: incomingUpdatedAt,
        isDeleted: record.isDeleted,
        synced: SYNC_STATUS_VALUE.SYNCED as any,
      };

      delete payloadToAdd.id;

      await table.add(payloadToAdd);
      pulled++;
    }

    if (response.serverTime) {
      setLastSyncAt(response.serverTime);
    }
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  return { pulled, errors };
}