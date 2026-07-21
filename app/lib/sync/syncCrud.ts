"use client";

/**
 * app/lib/sync/syncCrud.ts
 * ---------------------------------------------------------
 * Reusable local-first CRUD helpers for role portal pages.
 * Use these for school/branch operational data stored in Dexie.
 */

import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";
import {
  createLocal,
  getSyncTable,
  isActiveRecord,
  listActiveLocal,
  restoreLocal,
  softDeleteLocal,
  SyncableRecord,
  updateLocal,
} from "./syncUtils";
import { SyncTableName } from "./syncTables";

export type ScopeFilter = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  [key: string]: any;
};

export function matchesScope(row: any, scope?: ScopeFilter) {
  if (!scope) return true;

  return Object.entries(scope).every(([key, value]) => {
    if (value === undefined || value === null || value === "") return true;
    return String(row?.[key] ?? "") === String(value);
  });
}

export async function listRecords<T = any>(tableName: SyncTableName, scope?: ScopeFilter) {
  const rows = await listActiveLocal<T>(tableName);
  return rows.filter((row: any) => matchesScope(row, scope)) as T[];
}

export async function getRecord<T = any>(tableName: SyncTableName, id: string) {
  const table = getSyncTable(tableName);
  const record = await table.get(id);
  return record && isActiveRecord(record) ? (record as T) : null;
}

export async function createRecord<T extends SyncableRecord>(tableName: SyncTableName, data: T) {
  return createLocal<T>(tableName, data);
}

export async function updateRecord<T extends SyncableRecord>(tableName: SyncTableName, id: string, patch: Partial<T>) {
  return updateLocal<T>(tableName, id, patch);
}

export async function deleteRecord(tableName: SyncTableName, id: string) {
  return softDeleteLocal(tableName, id);
}

export async function restoreRecord(tableName: SyncTableName, id: string) {
  return restoreLocal(tableName, id);
}

export function watchRecords<T = any>(tableName: SyncTableName, scope?: ScopeFilter) {
  const table = getSyncTable(tableName);

  return liveQuery(async () => {
    const rows = await table.toArray();
    return rows
      .filter(isActiveRecord)
      .filter((row: any) => matchesScope(row, scope)) as T[];
  });
}

export function useLocalRecords<T = any>(tableName: SyncTableName, scope?: ScopeFilter) {
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopeKey = JSON.stringify(scope || {});

  useEffect(() => {
    setLoading(true);
    setError(null);

    const subscription = watchRecords<T>(tableName, scope).subscribe({
      next: (rows) => {
        setRecords(rows);
        setLoading(false);
      },
      error: (err) => {
        setError(err?.message || String(err));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, scopeKey]);

  return useMemo(
    () => ({ records, loading, error }),
    [records, loading, error]
  );
}
