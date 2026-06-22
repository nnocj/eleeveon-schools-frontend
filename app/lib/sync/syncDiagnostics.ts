/**
 * app/lib/sync/syncDiagnostics.ts
 * ---------------------------------------------------------
 * SYNC COUNTS + HEALTH HELPERS FOR DASHBOARD STRIPS
 * ---------------------------------------------------------
 */

import { db } from "../db";
import {
  getAccountId,
  getLastSyncError,
  getLastSyncOkAt,
  isOnline,
  SYNC_STATUS_VALUE,
  normalizeSyncStatus,
} from "./syncConfig";
import { getSyncTables } from "./syncTables";

export type SyncDiagnostics = {
  accountId: string | null;
  online: boolean;
  pending: number;
  errors: number;
  synced: number;
  deleted: number;
  lastSyncOkAt: number;
  lastSyncError: string | null;
  byTable: Record<string, { pending: number; errors: number; synced: number; deleted: number; total: number }>;
};

export async function getSyncDiagnostics(options?: { tables?: string[]; excludeTables?: string[] }): Promise<SyncDiagnostics> {
  const accountId = getAccountId();
  const byTable: SyncDiagnostics["byTable"] = {};
  let pending = 0;
  let errors = 0;
  let synced = 0;
  let deleted = 0;

  for (const tableName of getSyncTables({ include: options?.tables, exclude: options?.excludeTables })) {
    const table = (db as any)[tableName];
    if (!table) continue;

    const rows = await table.toArray();
    const scopedRows = accountId ? rows.filter((row: any) => !row.accountId || row.accountId === accountId) : rows;

    const tableCounts = { pending: 0, errors: 0, synced: 0, deleted: 0, total: scopedRows.length };

    for (const row of scopedRows) {
      const status = normalizeSyncStatus(row.synced);
      if (status === SYNC_STATUS_VALUE.PENDING) tableCounts.pending++;
      else if (status === SYNC_STATUS_VALUE.ERROR) tableCounts.errors++;
      else if (status === SYNC_STATUS_VALUE.SYNCED) tableCounts.synced++;
      if (row.isDeleted) tableCounts.deleted++;
    }

    pending += tableCounts.pending;
    errors += tableCounts.errors;
    synced += tableCounts.synced;
    deleted += tableCounts.deleted;
    byTable[tableName] = tableCounts;
  }

  return {
    accountId,
    online: isOnline(),
    pending,
    errors,
    synced,
    deleted,
    lastSyncOkAt: getLastSyncOkAt(accountId),
    lastSyncError: getLastSyncError(accountId),
    byTable,
  };
}
