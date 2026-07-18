/**
 * app/lib/offline/offlineAccountData.ts
 * --------------------------------------------------------------------------
 * Account-scoped offline-data inspection and removal.
 *
 * Normal logout must never call this module.
 *
 * This module:
 * - reports pending, failed, conflict, and unsynced-media totals;
 * - reports the last successful sync time;
 * - deletes only records belonging to the requested account;
 * - preserves other accounts and the Dexie database itself;
 * - clears only the removed account's synchronization cursors.
 */

import { db } from "../db";

import {
  clearSyncStateForAccount,
  getLastSyncError,
  getLastSyncOkAt,
  normalizeSyncStatus,
  SYNC_STATUS_VALUE,
} from "../sync/syncConfig";

import {
  cancelScheduledSync,
} from "../sync/syncEngine";

const INTERNAL_TABLES = new Set([
  "migrationJournal",
  "databaseRecoveryBackups",
  "syncQuarantine",
]);

const MEDIA_ASSET_TABLE = "mediaAssets";
const MEDIA_BLOB_TABLE = "mediaBlobs";

export type OfflineTableSummary = {
  tableName: string;
  total: number;
  pending: number;
  failed: number;
  conflicts: number;
  unsyncedMedia: number;
};

export type OfflineAccountDataSummary = {
  accountId: string;
  totalRecords: number;
  pendingRecords: number;
  failedRecords: number;
  conflictRecords: number;
  unsyncedMedia: number;
  mediaBlobBytes: number;
  lastSuccessfulSyncAt: number;
  lastSuccessfulSyncLabel: string;
  lastSyncError?: string | null;
  tables: OfflineTableSummary[];
  inspectedAt: number;
};

export type OfflineAccountRemovalResult = {
  accountId: string;
  deletedRecords: number;
  deletedMediaAssets: number;
  deletedMediaBlobs: number;
  clearedTables: string[];
  completedAt: number;
};

function sameAccount(
  row: Record<string, any>,
  accountId: string,
  tableName: string,
) {
  if (
    String(row?.accountId || "") ===
    accountId
  ) {
    return true;
  }

  // The cached account row may use the account UUID as its primary id.
  if (
    tableName === "accounts" &&
    String(row?.id || "") ===
      accountId
  ) {
    return true;
  }

  return false;
}

function isDeletedRow(row: any) {
  return (
    row?.isDeleted === true ||
    row?.deleted === true
  );
}

function isPendingRow(row: any) {
  if (isDeletedRow(row) && !row?.synced) {
    return true;
  }

  return (
    normalizeSyncStatus(
      row?.synced ??
      row?.syncStatus ??
      row?.status,
    ) ===
    SYNC_STATUS_VALUE.PENDING
  );
}

function isFailedRow(row: any) {
  return (
    normalizeSyncStatus(
      row?.synced ??
      row?.syncStatus ??
      row?.status,
    ) ===
      SYNC_STATUS_VALUE.ERROR ||
    Boolean(row?.syncError)
  );
}

function isConflictRow(row: any) {
  return (
    normalizeSyncStatus(
      row?.synced ??
      row?.syncStatus ??
      row?.status,
    ) ===
    SYNC_STATUS_VALUE.CONFLICT
  );
}

function isUnsyncedMediaAsset(row: any) {
  const uploadStatus = String(
    row?.uploadStatus || "",
  )
    .trim()
    .toLowerCase();

  const hasRemoteLocation = Boolean(
    row?.remoteUrl ||
    row?.publicUrl ||
    row?.remoteKey,
  );

  const uploadIncomplete =
    ![
      "uploaded",
      "complete",
      "completed",
      "synced",
      "success",
    ].includes(uploadStatus);

  return (
    uploadIncomplete ||
    !hasRemoteLocation ||
    isPendingRow(row) ||
    isFailedRow(row)
  );
}

function formatSyncTime(value: number) {
  if (!value) return "Never";

  try {
    return new Intl.DateTimeFormat(
      undefined,
      {
        dateStyle: "medium",
        timeStyle: "short",
      },
    ).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

async function accountRowsForTable(
  table: any,
  tableName: string,
  accountId: string,
) {
  try {
    // Prefer the accountId index when the table has one.
    return await table
      .where("accountId")
      .equals(accountId)
      .toArray();
  } catch {
    const rows =
      await table.toArray();

    return rows.filter((row: any) =>
      sameAccount(
        row,
        accountId,
        tableName,
      ),
    );
  }
}

export async function inspectOfflineAccountData(
  accountId: string,
): Promise<OfflineAccountDataSummary> {
  const cleanAccountId =
    String(accountId || "").trim();

  if (!cleanAccountId) {
    throw new Error(
      "An account ID is required to inspect offline data.",
    );
  }

  const tableSummaries:
    OfflineTableSummary[] = [];

  let totalRecords = 0;
  let pendingRecords = 0;
  let failedRecords = 0;
  let conflictRecords = 0;
  let unsyncedMedia = 0;
  let mediaBlobBytes = 0;

  for (const table of db.tables) {
    const tableName =
      String(table.name);

    if (INTERNAL_TABLES.has(tableName)) {
      continue;
    }

    const rows =
      await accountRowsForTable(
        table,
        tableName,
        cleanAccountId,
      );

    if (!rows.length) continue;

    const pending =
      rows.filter(isPendingRow).length;

    const failed =
      rows.filter(isFailedRow).length;

    const conflicts =
      rows.filter(isConflictRow).length;

    let tableUnsyncedMedia = 0;

    if (
      tableName ===
      MEDIA_ASSET_TABLE
    ) {
      tableUnsyncedMedia =
        rows.filter(
          isUnsyncedMediaAsset,
        ).length;
    }

    if (
      tableName ===
      MEDIA_BLOB_TABLE
    ) {
      tableUnsyncedMedia =
        rows.length;

      mediaBlobBytes += rows.reduce(
        (
          total: number,
          row: any,
        ) =>
          total +
          Math.max(
            0,
            Number(
              row?.sizeBytes ||
              row?.blob?.size ||
              0,
            ),
          ),
        0,
      );
    }

    totalRecords += rows.length;
    pendingRecords += pending;
    failedRecords += failed;
    conflictRecords += conflicts;
    unsyncedMedia +=
      tableUnsyncedMedia;

    tableSummaries.push({
      tableName,
      total: rows.length,
      pending,
      failed,
      conflicts,
      unsyncedMedia:
        tableUnsyncedMedia,
    });
  }

  tableSummaries.sort(
    (a, b) =>
      b.pending -
        a.pending ||
      b.failed -
        a.failed ||
      b.unsyncedMedia -
        a.unsyncedMedia ||
      a.tableName.localeCompare(
        b.tableName,
      ),
  );

  const lastSuccessfulSyncAt =
    getLastSyncOkAt(
      cleanAccountId,
    );

  return {
    accountId: cleanAccountId,
    totalRecords,
    pendingRecords,
    failedRecords,
    conflictRecords,
    unsyncedMedia,
    mediaBlobBytes,
    lastSuccessfulSyncAt,
    lastSuccessfulSyncLabel:
      formatSyncTime(
        lastSuccessfulSyncAt,
      ),
    lastSyncError:
      getLastSyncError(
        cleanAccountId,
      ),
    tables:
      tableSummaries,
    inspectedAt:
      Date.now(),
  };
}

async function deleteAccountRowsFromTable(
  table: any,
  tableName: string,
  accountId: string,
) {
  const rows =
    await accountRowsForTable(
      table,
      tableName,
      accountId,
    );

  if (!rows.length) return 0;

  const primaryKeys =
    rows
      .map((row: any) =>
        row?.[table.schema.primKey.keyPath || "id"],
      )
      .filter(
        (value: unknown) =>
          value !== undefined &&
          value !== null,
      );

  if (!primaryKeys.length) return 0;

  await table.bulkDelete(
    primaryKeys,
  );

  return primaryKeys.length;
}

export async function removeOfflineAccountData(
  accountId: string,
): Promise<OfflineAccountRemovalResult> {
  const cleanAccountId =
    String(accountId || "").trim();

  if (!cleanAccountId) {
    throw new Error(
      "An account ID is required to remove offline data.",
    );
  }

  cancelScheduledSync();

  let deletedRecords = 0;
  let deletedMediaAssets = 0;
  let deletedMediaBlobs = 0;
  const clearedTables: string[] = [];

  /**
   * One read-write transaction prevents a partially deleted account if a table
   * operation fails. Internal migration/recovery tables are intentionally
   * excluded from deletion.
   */
  const tables =
    db.tables.filter(
      (table) =>
        !INTERNAL_TABLES.has(
          table.name,
        ),
    );

  await db.transaction(
    "rw",
    tables,
    async () => {
      // Delete blobs before assets so no orphaned local binary remains.
      const ordered = [
        ...tables.filter(
          (table) =>
            table.name ===
            MEDIA_BLOB_TABLE,
        ),
        ...tables.filter(
          (table) =>
            table.name ===
            MEDIA_ASSET_TABLE,
        ),
        ...tables.filter(
          (table) =>
            ![
              MEDIA_BLOB_TABLE,
              MEDIA_ASSET_TABLE,
            ].includes(
              table.name,
            ),
        ),
      ];

      for (const table of ordered) {
        const deleted =
          await deleteAccountRowsFromTable(
            table,
            table.name,
            cleanAccountId,
          );

        if (!deleted) continue;

        deletedRecords += deleted;
        clearedTables.push(
          table.name,
        );

        if (
          table.name ===
          MEDIA_ASSET_TABLE
        ) {
          deletedMediaAssets +=
            deleted;
        }

        if (
          table.name ===
          MEDIA_BLOB_TABLE
        ) {
          deletedMediaBlobs +=
            deleted;
        }
      }
    },
  );

  clearSyncStateForAccount(
    cleanAccountId,
  );

  return {
    accountId:
      cleanAccountId,
    deletedRecords,
    deletedMediaAssets,
    deletedMediaBlobs,
    clearedTables:
      [...new Set(
        clearedTables,
      )].sort(),
    completedAt:
      Date.now(),
  };
}