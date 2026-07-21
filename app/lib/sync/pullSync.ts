/**
 * app/lib/sync/pullSync.ts
 * --------------------------------------------------------------------------
 * Pulls cloud SyncRecord changes into Dexie.
 *
 * UUID transport contract:
 * - backend `localId` is the permanent Dexie entity UUID;
 * - backend `cloudId` is the Prisma SyncRecord UUID;
 * - pulled records never replace the permanent local entity `id` with `cloudId`.
 *
 * Phase 4:
 * - uses the stable compound cursor: updatedAt + id;
 * - repeatedly requests pages until hasMore === false;
 * - applies every page before advancing the persisted cursor;
 * - preserves legacy `since` fallback for upgraded devices that do not yet
 *   have a compound cursor;
 * - never advances the stored cursor after a partial or failed pull.
 *
 * Phase 3 protections preserved:
 * - the cursor is scoped to the active account + environment;
 * - another account can never inherit this pull position;
 * - records from another account are rejected;
 * - mediaAssets are never matched by plain numeric local ID first.
 */

import { db } from "../db";

import {
  assertAccountId,
  clearLastSyncCursor,
  forceFullSyncNextRun,
  getDeviceId,
  getPullPosition,
  type PullResponse,
  type SyncPullCursor,
  setLastSyncCursor,
  SYNC_ENDPOINTS,
  SYNC_STATUS_VALUE,
} from "./syncConfig";

import { syncHttp } from "./syncHttp";
import {
  isBackendCacheTable,
  isPullSyncTable,
  isSyncTable,
} from "./syncTables";

import {
  findExistingLocalRecord,
  resolveConflict,
} from "./syncUtils";

import { applyPlatformCacheRecords } from "./platformCache";

import {
  integrityReason,
  quarantineSyncRecord,
  validatePullRecord,
} from "./syncIntegrity";

const DEFAULT_PULL_PAGE_LIMIT = 500;
const MAX_PULL_PAGES_PER_RUN = 10_000;

export type PullSyncResult = {
  pulled: number;
  skipped: number;
  errors: string[];
  cacheUpdated?: number;
  accountId: string;

  cursorBefore: SyncPullCursor | null;
  cursorAfter: SyncPullCursor | null;

  legacySinceBefore: number;
  pages: number;
  completed: boolean;
};

function cleanIncomingPayload(
  payload: Record<string, any>,
  localId?: string,
) {
  const copy = { ...(payload || {}) };

  if (localId != null) {
    copy.id = localId;
  } else {
    delete copy.id;
  }

  return copy;
}

function hasValue(value: any) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

function sameValue(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function sameCursor(
  left: SyncPullCursor | null,
  right: SyncPullCursor | null,
) {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    Number(left.updatedAt) === Number(right.updatedAt) &&
    String(left.id) === String(right.id)
  );
}

function normalizeCursor(
  value: SyncPullCursor | null | undefined,
): SyncPullCursor | null {
  if (!value) return null;

  const updatedAt = Number(value.updatedAt);
  const id = String(value.id || "").trim();

  if (!Number.isFinite(updatedAt) || updatedAt < 0 || !id) {
    return null;
  }

  return {
    updatedAt,
    id,
  };
}

async function findById(
  table: any,
  id?: string | null,
) {
  if (!hasValue(id)) return null;

  const cleanId = String(id);

  try {
    const indexed = await table
      .where("id")
      .equals(cleanId)
      .first();

    if (indexed) return indexed;
  } catch {
    // Some legacy stores may not index id.
  }

  const rows = await table.toArray();

  return (
    rows.find((row: any) =>
      sameValue(row.id, cleanId),
    ) || null
  );
}

async function findExistingMediaAsset(
  table: any,
  record: any,
) {
  const payload = record.payload || {};
  const localId = record.localId || payload.id;

  const byId = await findById(table, localId);
  if (byId) return byId;

  const rows = await table.toArray();

  const activeRows = rows.filter(
    (row: any) => !row.isDeleted,
  );

  const accountId = payload.accountId || record.accountId;
  const ownerTable = payload.ownerTable;
  const fieldKey = payload.fieldKey;
  const ownerTempKey = payload.ownerTempKey;
  const ownerId = payload.ownerId ?? record.localId;

  if (hasValue(ownerTempKey)) {
    const match = activeRows.find(
      (row: any) =>
        (!hasValue(accountId) ||
          sameValue(row.accountId, accountId)) &&
        (!hasValue(ownerTable) ||
          sameValue(row.ownerTable, ownerTable)) &&
        (!hasValue(fieldKey) ||
          sameValue(row.fieldKey, fieldKey)) &&
        sameValue(row.ownerTempKey, ownerTempKey),
    );

    if (match) return match;
  }

  if (hasValue(ownerId)) {
    const match = activeRows.find(
      (row: any) =>
        (!hasValue(accountId) ||
          sameValue(row.accountId, accountId)) &&
        (!hasValue(ownerTable) ||
          sameValue(row.ownerTable, ownerTable)) &&
        (!hasValue(fieldKey) ||
          sameValue(row.fieldKey, fieldKey)) &&
        sameValue(row.ownerId, ownerId),
    );

    if (match) return match;
  }

  if (
    hasValue(ownerId) &&
    hasValue(ownerTable) &&
    hasValue(fieldKey)
  ) {
    const match = activeRows.find(
      (row: any) =>
        (!hasValue(accountId) ||
          sameValue(row.accountId, accountId)) &&
        sameValue(row.ownerTable, ownerTable) &&
        sameValue(row.fieldKey, fieldKey) &&
        sameValue(row.ownerId, ownerId),
    );

    if (match) return match;
  }

  const payloadId = payload.id;

  if (hasValue(payloadId)) {
    const candidate = await table
      .get(Number(payloadId))
      .catch(() => null);

    if (
      candidate &&
      hasValue(localId) &&
      sameValue(candidate.id, localId)
    ) {
      return candidate;
    }
  }

  return null;
}

function normalizeIncomingMediaPayload(
  payload: Record<string, any>,
) {
  const copy = { ...(payload || {}) };

  for (const key of [
    "blob",
    "file",
    "originalFile",
    "optimizedFile",
    "localBlob",
    "localBlobData",
    "previewUrl",
    "objectUrl",
    "localObjectUrl",
    "dataUrl",
    "base64",
  ]) {
    delete copy[key];
  }

  return copy;
}

async function findExistingRecordForPull(
  tableName: string,
  table: any,
  record: any,
) {
  if (tableName === "mediaAssets") {
    return findExistingMediaAsset(table, record);
  }

  return findExistingLocalRecord(table, {
    // Current UUID-native contract.
    localId: record.localId,
    cloudId: record.cloudId,

    // Temporary aliases for an older syncUtils.ts implementation.
    id: record.cloudId,
    entityId: record.localId,

    payload: record.payload,
  } as any);
}

async function applyPulledRecord(input: {
  record: any;
  accountId: string;
  deviceId: string;
}): Promise<{
  pulled: number;
  skipped: number;
  errors: string[];
  cacheUpdated: number;
}> {
  const {
    record,
    accountId,
    deviceId,
  } = input;

  const errors: string[] = [];

  const integrity =
    validatePullRecord(
      {
        ...record,

        // Temporary aliases for an older syncIntegrity.ts implementation.
        entityId: record.localId,
        id: record.cloudId,
      } as any,
      accountId,
    );

  if (!integrity.ok) {
    const reason =
      integrityReason(
        integrity.issues,
      );

    await quarantineSyncRecord({
      source: "pull",
      accountId:
        record?.accountId ||
        accountId,
      tableName:
        record?.tableName,
      entityId:
        record?.localId,
      id:
        record?.cloudId,
      reason,
      payload: record,
    });

    return {
      pulled: 0,
      skipped: 1,
      cacheUpdated: 0,
      errors,
    };
  }

  if (
    record.accountId &&
    record.accountId !== accountId
  ) {
    return {
      pulled: 0,
      skipped: 1,
      cacheUpdated: 0,
      errors: [
        `Rejected ${record.tableName}: account mismatch.`,
      ],
    };
  }

  if (!isPullSyncTable(record.tableName)) {
    return {
      pulled: 0,
      skipped: 1,
      cacheUpdated: 0,
      errors,
    };
  }

  if (
    isBackendCacheTable(record.tableName) &&
    !isSyncTable(record.tableName)
  ) {
    const result = await applyPlatformCacheRecords([
      {
        tableName: record.tableName,
        payload: record.payload,
        id:
          record.payload?.id ??
          record.cloudId ??
          undefined,
        accountId,
      },
    ]);

    return {
      pulled: 0,
      skipped: result.skipped,
      cacheUpdated: result.updated,
      errors: result.errors,
    };
  }

  if (!isSyncTable(record.tableName)) {
    return {
      pulled: 0,
      skipped: 1,
      cacheUpdated: 0,
      errors,
    };
  }

  const table = (db as any)[record.tableName];

  if (!table) {
    return {
      pulled: 0,
      skipped: 1,
      cacheUpdated: 0,
      errors: [
        `No local Dexie table exists for ${record.tableName}.`,
      ],
    };
  }

  try {
    const payload =
      record.tableName === "mediaAssets"
        ? normalizeIncomingMediaPayload(
            record.payload || {},
          )
        : record.payload || {};

    const incomingUpdatedAt = Number(
      record.updatedAt ||
        payload.updatedAt ||
        Date.now(),
    );

    const existing: any =
      await findExistingRecordForPull(
        record.tableName,
        table,
        {
          ...record,
          payload,
          accountId,
        },
      );

    const existingId =
      existing?.id ??
      undefined;

    const permanentLocalId =
      String(
        record.localId ||
          existingId ||
          payload.id ||
          "",
      ).trim();

    if (!permanentLocalId) {
      throw new Error(
        `${record.tableName}: pulled record is missing localId.`,
      );
    }

    const incoming: any = {
      ...cleanIncomingPayload(
        payload,
        permanentLocalId,
      ),

      // Permanent Dexie entity UUID.
      id: permanentLocalId,

      // Prisma SyncRecord UUID.
      cloudId:
        record.cloudId ||
        payload.cloudId ||
        existing?.cloudId ||
        undefined,

      accountId,
      deviceId:
        record.deviceId ||
        payload.deviceId ||
        deviceId,
      version: Number(
        record.version ||
          payload.version ||
          1,
      ),
      updatedAt: incomingUpdatedAt,
      isDeleted:
        !!record.isDeleted ||
        !!payload.isDeleted,
      synced: SYNC_STATUS_VALUE.SYNCED,
      syncError: undefined,
    };

    if (existingId != null) {
      const winner = resolveConflict(
        existing,
        incoming,
      ) as any;

      if (winner === existing) {
        return {
          pulled: 0,
          skipped: 1,
          cacheUpdated: 0,
          errors,
        };
      }

      await table.update(existingId, {
        ...winner,

        // Preserve the permanent Dexie entity UUID.
        id: existingId,

        // Preserve or update the Prisma SyncRecord UUID separately.
        cloudId:
          incoming.cloudId ||
          existing.cloudId ||
          undefined,

        accountId,
        synced: SYNC_STATUS_VALUE.SYNCED,
      });
    } else {
      await table.add(incoming);
    }

    return {
      pulled: 1,
      skipped: 0,
      cacheUpdated: 0,
      errors,
    };
  } catch (error: any) {
    return {
      pulled: 0,
      skipped: 0,
      cacheUpdated: 0,
      errors: [
        `${record.tableName}: ${
          error?.message || String(error)
        }`,
      ],
    };
  }
}

export async function pullSync(options?: {
  full?: boolean;
  accountId?: string;
  limit?: number;
  tableNames?: string[];
}): Promise<PullSyncResult> {
  const activeAccountId = assertAccountId();

  const accountId =
    options?.accountId ||
    activeAccountId;

  if (accountId !== activeAccountId) {
    throw new Error(
      "Refusing to pull a different account into the active session.",
    );
  }

  const deviceId = getDeviceId();

  const storedPosition = getPullPosition(accountId);

  const cursorBefore = options?.full
    ? null
    : storedPosition.cursor;

  const legacySinceBefore = options?.full
    ? 0
    : storedPosition.since;

  let workingCursor = cursorBefore;
  let useLegacySince =
    !workingCursor &&
    legacySinceBefore > 0;

  const errors: string[] = [];

  let pulled = 0;
  let skipped = 0;
  let cacheUpdated = 0;
  let pages = 0;
  let completed = false;

  try {
    while (pages < MAX_PULL_PAGES_PER_RUN) {
      const body: Record<string, any> = {
        accountId,
        deviceId,
        limit:
          options?.limit ||
          DEFAULT_PULL_PAGE_LIMIT,
      };

      if (options?.tableNames?.length) {
        body.tableNames = options.tableNames;
      }

      if (workingCursor) {
        body.cursorUpdatedAt =
          workingCursor.updatedAt;
        body.cursorId =
          workingCursor.id;
      } else if (useLegacySince) {
        body.since =
          legacySinceBefore;
      } else {
        body.since = 0;
      }

      const response =
        await syncHttp<PullResponse>(
          SYNC_ENDPOINTS.PULL,
          {
            method: "POST",
            body,
          },
        );

      pages++;

      const quarantinedFromServer =
        Array.isArray((response as any).quarantineRecords)
          ? (response as any).quarantineRecords
          : [];

      for (const malformed of quarantinedFromServer) {
        await quarantineSyncRecord({
          source: "pull",
          accountId:
            malformed?.record?.accountId ||
            accountId,
          tableName:
            malformed?.record?.tableName,
          entityId:
            malformed?.record?.localId,
          id:
            malformed?.record?.cloudId ||
            undefined,
          reason:
            malformed?.reason ||
            "The backend identified a malformed synchronization record.",
          payload:
            malformed?.record ||
            malformed,
        });

        skipped++;
      }

      for (const record of response.records || []) {
        const result = await applyPulledRecord({
          record,
          accountId,
          deviceId,
        });

        pulled += result.pulled;
        skipped += result.skipped;
        cacheUpdated +=
          result.cacheUpdated;
        errors.push(...result.errors);
      }

      const cacheRecords = [
        ...(response.cacheRecords || []),
        ...(response.platformRecords || []),
      ];

      if (cacheRecords.length) {
        const cache =
          await applyPlatformCacheRecords(
            cacheRecords,
          );

        cacheUpdated += cache.updated;
        skipped += cache.skipped;
        errors.push(...cache.errors);
      }

      if (errors.length) {
        break;
      }

      const nextCursor =
        normalizeCursor(
          response.nextCursor,
        );

      if (
        response.hasMore &&
        !nextCursor
      ) {
        errors.push(
          "The sync server reported another page but did not return a valid next cursor.",
        );
        break;
      }

      if (
        response.hasMore &&
        sameCursor(
          nextCursor,
          workingCursor,
        )
      ) {
        errors.push(
          "The sync cursor did not advance. Pull stopped to prevent an infinite loop.",
        );
        break;
      }

      if (nextCursor) {
        workingCursor = nextCursor;
        useLegacySince = false;
      }

      if (!response.hasMore) {
        completed = true;
        break;
      }
    }

    if (
      pages >= MAX_PULL_PAGES_PER_RUN &&
      !completed &&
      !errors.length
    ) {
      errors.push(
        "Pull stopped after the maximum page count to prevent an infinite loop.",
      );
    }

    /**
     * Critical Phase 4 rule:
     *
     * Persist only after every requested page has been applied successfully.
     * If page 4 fails after pages 1–3 succeeded, the stored cursor remains at
     * the original position. The next run safely replays pages 1–3; conflict
     * resolution and cloud IDs make those applications idempotent.
     */
    if (
      completed &&
      !errors.length
    ) {
      if (workingCursor) {
        setLastSyncCursor(
          workingCursor,
          accountId,
        );
      } else {
        // A successful full pull with no records must remove any stale cursor.
        clearLastSyncCursor(accountId);
      }
    }
  } catch (error: any) {
    errors.push(
      error?.message ||
        String(error),
    );
  }

  return {
    pulled,
    skipped,
    errors,
    cacheUpdated,
    accountId,

    cursorBefore,
    cursorAfter:
      completed &&
      !errors.length
        ? workingCursor
        : cursorBefore,

    legacySinceBefore,
    pages,
    completed:
      completed &&
      errors.length === 0,
  };
}

export async function repairSync(): Promise<PullSyncResult> {
  const accountId = assertAccountId();

  forceFullSyncNextRun(accountId);

  return pullSync({
    full: true,
    accountId,
  });
}