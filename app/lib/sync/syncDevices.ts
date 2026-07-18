/**
 * app/lib/sync/syncDevices.ts
 * ---------------------------------------------------------
 * Optional device registration helpers for upgraded Prisma SyncDevice.
 */

import { db } from "../db/db";
import { assertAccountId, getDeviceId, SYNC_ENDPOINTS } from "./syncConfig";
import { syncHttp } from "./syncHttp";

export async function upsertLocalSyncDevice(patch?: Record<string, any>) {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();
  const id = `${accountId}:${deviceId}`;
  const now = new Date().toISOString();

  const record = {
    id,
    accountId,
    deviceId,
    deviceName: typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 120) : undefined,
    platform: typeof navigator !== "undefined" ? navigator.platform : "web",
    lastSeenAt: now,
    active: true,
    updatedAt: now,
    createdAt: now,
    ...(patch || {}),
  };

  const table = (db as any).syncDevices;
  if (table) {
    const existing = await table.get(id).catch(() => null);
    await table.put({ ...(existing || {}), ...record, createdAt: existing?.createdAt || record.createdAt });
  }

  return record;
}

export async function registerSyncDevice(options?: { silent?: boolean; patch?: Record<string, any> }) {
  const local = await upsertLocalSyncDevice(options?.patch);

  try {
    await syncHttp(SYNC_ENDPOINTS.DEVICE_REGISTER, {
      method: "POST",
      body: local,
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    if (!options?.silent && !/404|not found|Cannot POST|Cannot GET/i.test(message)) {
      throw error;
    }
  }

  return local;
}
