/**
 * app/lib/sync/syncStatus.ts
 * ---------------------------------------------------------
 * Backend sync status + local pending count helpers.
 */

import { db } from "../db";
import { SYNC_ENDPOINTS, SyncStatusResponse } from "./syncConfig";
import { syncHttp } from "./syncHttp";
import { countPendingSync, isSyncError } from "./syncUtils";

export async function getSyncStatus() {
  return syncHttp<SyncStatusResponse>(SYNC_ENDPOINTS.STATUS, { method: "GET" });
}

export async function getLocalSyncSummary() {
  let errors = 0;
  let conflicts = 0;

  const { SYNC_TABLES } = await import("./syncTables");

  for (const tableName of SYNC_TABLES) {
    const table = (db as any)[tableName];
    if (!table) continue;
    const rows = await table.toArray();
    errors += rows.filter(isSyncError).length;
  }

  const conflictTable = (db as any).syncConflicts;
  if (conflictTable) {
    const rows = await conflictTable.toArray().catch(() => []);
    conflicts = rows.filter((row: any) => String(row.status || "open") === "open").length;
  }

  return {
    pending: await countPendingSync(),
    errors,
    conflicts,
    checkedAt: Date.now(),
  };
}
