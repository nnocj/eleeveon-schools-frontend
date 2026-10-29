/**
 * app/lib/sync/syncDiagnostics.ts
 * Account-scoped sync counts and real successful network-phase timestamps.
 */

import { db } from "../db/db";
import {
  getAccountId,
  getLastSyncError,
  getLastSyncOkAt,
  isOnline,
  SYNC_STATUS_VALUE,
  normalizeSyncStatus,
} from "./syncConfig";
import { getSyncTables } from "./syncTables";
import { getSyncSuccessTimestamps } from "./syncSuccessTimestamps";

export type SyncDiagnostics = {
  accountId: string | null;
  online: boolean;
  pending: number;
  errors: number;
  synced: number;
  deleted: number;
  lastSyncOkAt: number;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastSyncError: string | null;
  byTable: Record<string, {
    pending: number;
    errors: number;
    synced: number;
    deleted: number;
    total: number;
    records: Array<{
      id: string;
      label: string;
      status: string | number | undefined;
      syncError?: string;
    }>;
  }>;
};

export async function getSyncDiagnostics(options?: {
  accountId?: string | null;
  tables?: string[];
  excludeTables?: string[];
}): Promise<SyncDiagnostics> {
  // The active sync account is authoritative: never read the history of
  // a different account solely because a caller passed its ID.
  const accountId = getAccountId();
  const byTable: SyncDiagnostics["byTable"] = {};
  let pending = 0;
  let errors = 0;
  let synced = 0;
  let deleted = 0;

  for (const tableName of getSyncTables({
    include: options?.tables,
    exclude: options?.excludeTables,
  })) {
    const table = (db as any)[tableName];
    if (!table) continue;

    const rows = await table.toArray();
    const scopedRows = accountId
      ? rows.filter((row: any) => !row.accountId || row.accountId === accountId)
      : rows;

    const counts: SyncDiagnostics["byTable"][string] = {
      pending: 0,
      errors: 0,
      synced: 0,
      deleted: 0,
      total: scopedRows.length,
      records: [],
    };

    for (const row of scopedRows) {
      const status = normalizeSyncStatus(row.synced);
      if (status === SYNC_STATUS_VALUE.PENDING) counts.pending++;
      else if (status === SYNC_STATUS_VALUE.ERROR) counts.errors++;
      else if (status === SYNC_STATUS_VALUE.SYNCED) counts.synced++;
      if (row.isDeleted) counts.deleted++;

      if (status === SYNC_STATUS_VALUE.PENDING || status === SYNC_STATUS_VALUE.ERROR) {
        counts.records.push({
          id: String(row.id ?? ""),
          label: String(row.name ?? row.title ?? row.subject ?? row.code ?? row.id ?? "Record"),
          status: row.synced,
          syncError: typeof row.syncError === "string" ? row.syncError : undefined,
        });
      }
    }

    pending += counts.pending;
    errors += counts.errors;
    synced += counts.synced;
    deleted += counts.deleted;
    byTable[tableName] = counts;
  }

  const times = getSyncSuccessTimestamps(accountId);
  return {
    accountId,
    online: isOnline(),
    pending,
    errors,
    synced,
    deleted,
    lastSyncOkAt: getLastSyncOkAt(accountId),
    lastPushAt: times.lastPushAt,
    lastPullAt: times.lastPullAt,
    lastSyncError: getLastSyncError(accountId),
    byTable,
  };
}
