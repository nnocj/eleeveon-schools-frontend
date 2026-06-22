/**
 * app/lib/sync/platformCache.ts
 * ---------------------------------------------------------
 * Backend-owned platform cache helpers.
 * ---------------------------------------------------------
 * These helpers update local Dexie cache tables used for UI display:
 * accounts, subscriptions, invoices, API clients, webhooks, audit logs, etc.
 * They do not push secrets or backend-only records from the browser.
 */

import { db } from "../db";
import {
  assertAccountId,
  CachePullRecord,
  getDeviceId,
  getLastPlatformCacheAt,
  PlatformCacheResponse,
  setLastPlatformCacheAt,
  SYNC_ENDPOINTS,
} from "./syncConfig";
import { syncHttp } from "./syncHttp";
import { isBackendCacheTable } from "./syncTables";

export type PlatformCacheResult = {
  updated: number;
  skipped: number;
  errors: string[];
};

function normalizeCachePayload(record: CachePullRecord) {
  const payload = { ...(record.payload || {}) } as any;

  const id = record.id || payload.id || record.cloudId || payload.cloudId;
  if (id !== undefined && id !== null) payload.id = String(id);

  if (record.accountId && !payload.accountId) payload.accountId = record.accountId;
  if (record.updatedAt && !payload.updatedAt) payload.updatedAt = record.updatedAt;

  return payload;
}

export async function applyPlatformCacheRecords(records: CachePullRecord[] = []): Promise<PlatformCacheResult> {
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      if (!record?.tableName || !isBackendCacheTable(record.tableName)) {
        skipped++;
        continue;
      }

      const table = (db as any)[record.tableName];
      if (!table) {
        skipped++;
        continue;
      }

      const payload = normalizeCachePayload(record);
      const id = payload.id;

      if (!id) {
        skipped++;
        continue;
      }

      if (record.isDeleted) {
        await table.delete(id).catch(async () => {
          const existing = await table.get(id);
          if (existing) await table.update(id, { ...existing, isDeleted: true });
        });
        updated++;
        continue;
      }

      await table.put(payload);
      updated++;
    } catch (error: any) {
      errors.push(`${record?.tableName || "unknown"}: ${error?.message || String(error)}`);
    }
  }

  return { updated, skipped, errors };
}

export async function refreshPlatformCache(options?: { silent?: boolean }): Promise<PlatformCacheResult> {
  const errors: string[] = [];

  try {
    const accountId = assertAccountId();
    const deviceId = getDeviceId();
    const since = getLastPlatformCacheAt();

    const response = await syncHttp<PlatformCacheResponse>(SYNC_ENDPOINTS.PLATFORM_CACHE, {
      method: "POST",
      body: { accountId, deviceId, since },
    });

    const records = [
      ...(response.records || []),
      ...(response.cacheRecords || []),
      ...(response.platformRecords || []),
    ];

    const result = await applyPlatformCacheRecords(records);
    if (response.serverTime) setLastPlatformCacheAt(Number(response.serverTime));
    return result;
  } catch (error: any) {
    const message = error?.message || String(error);

    // Keep this drop-in safe while your backend catches up.
    // Missing optional platform-cache endpoint should not break normal school sync.
    if (options?.silent || /404|not found|Cannot POST|Cannot GET/i.test(message)) {
      return { updated: 0, skipped: 0, errors: [] };
    }

    errors.push(message);
    return { updated: 0, skipped: 0, errors };
  }
}

export async function bootstrapAccountContext(options?: { silent?: boolean }) {
  try {
    const accountId = assertAccountId();
    const deviceId = getDeviceId();
    const response = await syncHttp<PlatformCacheResponse>(SYNC_ENDPOINTS.BOOTSTRAP, {
      method: "POST",
      body: { accountId, deviceId },
    });

    const records = [
      ...(response.records || []),
      ...(response.cacheRecords || []),
      ...(response.platformRecords || []),
    ];

    return applyPlatformCacheRecords(records);
  } catch (error: any) {
    const message = error?.message || String(error);
    if (options?.silent || /404|not found|Cannot POST|Cannot GET/i.test(message)) {
      return { updated: 0, skipped: 0, errors: [] };
    }
    return { updated: 0, skipped: 0, errors: [message] };
  }
}
