
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
 * Coordinator upgrade:
 * - filtered pulls use independent account+environment table-set checkpoints;
 * - the runner can yield after applying a page, then resume later;
 * - page completion callbacks keep the cross-tab sync lock alive.
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
  getAccountId,
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
  accountScopedStorageKey,
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from "./syncStorage";
import { publishSyncPullCompleted } from "./syncEvents";
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
  yielded?: boolean;
  filtered?: boolean;
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

async function findExistingMediaAsset(table: any, record: any) {
  const payload = record.payload || {};
  const localId = String(record.localId || payload.id || "").trim();
  const accountId = String(record.accountId || payload.accountId || "").trim();
  const byId = await findById(table, localId);
  if (byId && String(byId.accountId || "") === accountId) return byId;

  const cloudId = String(record.cloudId || payload.cloudId || "").trim();
  if (cloudId) {
    try {
      const byCloud = await table.where("cloudId").equals(cloudId).first();
      if (byCloud && String(byCloud.accountId || "") === accountId) return byCloud;
    } catch {
      // Legacy media stores may not have a cloudId index.
    }
  }

  const rows: any[] = await table.toArray();
  if (cloudId) {
    const match = rows.find((row) =>
      String(row.accountId || "") === accountId &&
      String(row.cloudId || "") === cloudId,
    );
    if (match) return match;
  }

  const fieldKey = String(payload.fieldKey || "").trim();
  // Gallery assets share an owner and field: NEVER collapse their siblings.
  if (["gallery", "schoolGalleryImages"].includes(fieldKey)) return null;

  const identity = String(payload.ownerIdentityKey || "").trim();
  if (identity) {
    const match = rows.find((row) =>
      String(row.accountId || "") === accountId &&
      !row.isDeleted &&
      String(row.ownerIdentityKey || "") === identity,
    );
    if (match) return match;
  }

  const ownerTable = String(payload.ownerTable || "").trim();
  const ownerId = String(payload.ownerId || "").trim();
  const ownerTempKey = String(payload.ownerTempKey || "").trim();
  if (ownerTable && fieldKey && (ownerId || ownerTempKey)) {
    return rows.find((row) =>
      String(row.accountId || "") === accountId &&
      !row.isDeleted &&
      String(row.ownerTable || "") === ownerTable &&
      String(row.fieldKey || "") === fieldKey &&
      (ownerId
        ? String(row.ownerId || "") === ownerId
        : String(row.ownerTempKey || "") === ownerTempKey),
    ) || null;
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
      if (
        existing?.synced === SYNC_STATUS_VALUE.PENDING ||
        existing?.synced === SYNC_STATUS_VALUE.ERROR ||
        existing?.synced === SYNC_STATUS_VALUE.CONFLICT
      ) {
        return { pulled: 0, skipped: 1, cacheUpdated: 0, errors };
      }
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

/**
 * Separate cursors for filtered pulls. The global cursor is never read or
 * written by a table-filtered request. The key reuses syncConfig's existing
 * account+environment scoping; the stored table list guards hash collisions.
 */
type FilterCursorState = {
  version: 1;
  tables: string[];
  cursor: SyncPullCursor | null;
  completed: boolean;
  updatedAt: number;
};

function canonicalTables(input: string[] | undefined): string[] {
  const tables = [...new Set((input || []).map((name) => String(name).trim()).filter(Boolean))].sort();
  if (tables.length > 100 || tables.some((name) => !isSyncTable(name))) {
    throw new Error("Filtered pulls accept only registered local-first SyncRecord tables.");
  }
  return tables;
}

function filterCursorKey(accountId: string, tables: string[]): string {
  let hash = 2166136261;
  const signature = tables.join("\u001f");
  for (let i = 0; i < signature.length; i++) {
    hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  }
  return accountScopedStorageKey(
    `eleeveon_module_pull_cursor_v1_${(hash >>> 0).toString(16)}`,
    accountId,
  );
}

function readFilterPosition(accountId: string, tables: string[]): SyncPullCursor | null {
  const raw = getLocalStorageItem(filterCursorKey(accountId, tables));
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as FilterCursorState;
    if (
      saved.version !== 1 ||
      JSON.stringify(saved.tables) !== JSON.stringify(tables)
    ) {
      // Never reuse a cursor for another requested table set.
      throw new Error("A filtered sync cursor does not match its tables.");
    }
    return normalizeCursor(saved.cursor);
  } catch (error) {
    throw new Error(
      `Filtered sync checkpoint is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function saveFilterPosition(
  accountId: string,
  tables: string[],
  cursor: SyncPullCursor | null,
  completed: boolean,
): void {
  const state: FilterCursorState = {
    version: 1, tables, cursor, completed, updatedAt: Date.now(),
  };
  setLocalStorageItem(filterCursorKey(accountId, tables), JSON.stringify(state));
}

export function clearFilteredPullCursor(tableNames: string[], accountId = assertAccountId()): void {
  const tables = canonicalTables(tableNames);
  if (!tables.length) throw new Error("Specify at least one table to clear its filtered cursor.");
  removeLocalStorageItem(filterCursorKey(accountId, tables));
}

export function getFilteredPullCursor(
  tableNames: string[],
  accountId = assertAccountId(),
): SyncPullCursor | null {
  const tables = canonicalTables(tableNames);
  if (!tables.length) return null;
  return readFilterPosition(accountId, tables);
}

export type PullSyncOptions = {
  full?: boolean;
  accountId?: string;
  limit?: number;
  tableNames?: string[];
  /** Cooperative preemption: stop AFTER committing the current page. */
  shouldYield?: () => boolean;
  /** The runner can refresh its cross-tab lock after each committed page. */
  onPageApplied?: () => void | Promise<void>;
};

export async function pullSync(options: PullSyncOptions = {}): Promise<PullSyncResult> {
  const accountId = assertAccountId();
  if (options.accountId && options.accountId !== accountId) {
    throw new Error("Refusing to pull a different account into this session.");
  }
  const deviceId = getDeviceId();
  const tables = canonicalTables(options.tableNames);
  const filtered = tables.length > 0;
  const pageLimit = Math.min(2_000, Math.max(1, Math.floor(Number(options.limit) || DEFAULT_PULL_PAGE_LIMIT)));
  const globalPosition = filtered ? null : getPullPosition(accountId);
  const cursorBefore = options.full
    ? null
    : filtered
      ? readFilterPosition(accountId, tables)
      : globalPosition!.cursor;
  const legacySinceBefore = filtered || options.full ? 0 : globalPosition!.since;
  let workingCursor = cursorBefore;
  let useLegacySince = !filtered && !workingCursor && legacySinceBefore > 0;
  let pulled = 0;
  let skipped = 0;
  let cacheUpdated = 0;
  let pages = 0;
  let completed = false;
  let yielded = false;
  const errors: string[] = [];

  try {
    while (pages < MAX_PULL_PAGES_PER_RUN) {
      if (getAccountId() !== accountId) {
        throw new Error("Account changed during pull; page traversal cancelled.");
      }
      const body: Record<string, any> = { accountId, deviceId, limit: pageLimit };
      if (filtered) body.tableNames = tables;
      if (workingCursor) {
        body.cursorUpdatedAt = workingCursor.updatedAt;
        body.cursorId = workingCursor.id;
      } else {
        body.since = useLegacySince ? legacySinceBefore : 0;
      }
      const response = await syncHttp<PullResponse>(SYNC_ENDPOINTS.PULL, {
        method: "POST", body,
      });
      if (getAccountId() !== accountId) {
        throw new Error("Account changed while receiving the pull response.");
      }
      pages++;
      const changedTables = new Set<string>();
      const quarantine = Array.isArray((response as any).quarantineRecords)
        ? (response as any).quarantineRecords
        : [];
      for (const malformed of quarantine) {
        await quarantineSyncRecord({
          source: "pull", accountId,
          tableName: malformed?.record?.tableName,
          entityId: malformed?.record?.localId,
          id: malformed?.record?.cloudId,
          reason: malformed?.reason || "Backend rejected an invalid synchronization record.",
          payload: malformed?.record || malformed,
        });
        skipped++;
      }
      for (const record of response.records || []) {
        if (getAccountId() !== accountId) {
          throw new Error("Account changed while applying pull records.");
        }
        const applied = await applyPulledRecord({ record, accountId, deviceId });
        pulled += applied.pulled;
        skipped += applied.skipped;
        cacheUpdated += applied.cacheUpdated;
        errors.push(...applied.errors);
        if (applied.pulled > 0 && record.tableName) changedTables.add(record.tableName);
      }
      const cacheRecords = [
        ...(response.cacheRecords || []),
        ...(response.platformRecords || []),
      ];
      if (cacheRecords.length) {
        const cache = await applyPlatformCacheRecords(cacheRecords);
        cacheUpdated += cache.updated;
        skipped += cache.skipped;
        errors.push(...cache.errors);
        if (cache.updated > 0) {
          for (const item of cacheRecords) if (item.tableName) changedTables.add(item.tableName);
        }
      }
      if (errors.length) break;
      const nextCursor = normalizeCursor(response.nextCursor);
      if (response.hasMore && !nextCursor) {
        errors.push("The server returned hasMore without a valid continuation cursor.");
        break;
      }
      if (response.hasMore && sameCursor(workingCursor, nextCursor)) {
        errors.push("The pull cursor did not advance; stopped to prevent a loop.");
        break;
      }
      await options.onPageApplied?.();
      if (getAccountId() !== accountId) {
        throw new Error("Account changed after applying a pull page.");
      }
      if (nextCursor) {
        workingCursor = nextCursor;
        useLegacySince = false;
      }
      if (changedTables.size) {
        publishSyncPullCompleted({ accountId, changedTables: [...changedTables] });
      }
      // Only filtered cursors checkpoint after each *fully applied* page.
      // The global cursor advances only after the full account pull completes.
      if (filtered) {
        saveFilterPosition(accountId, tables, workingCursor, !response.hasMore);
      }
      if (!response.hasMore) {
        completed = true;
        break;
      }
      if (options.shouldYield?.()) {
        yielded = true;
        break;
      }
      // Keep rendering responsive between network pages.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (pages >= MAX_PULL_PAGES_PER_RUN && !completed && !yielded && !errors.length) {
      errors.push("Pull exceeded maximum pages before reaching completion.");
    }
    if (completed && !errors.length && !filtered) {
      if (workingCursor) setLastSyncCursor(workingCursor, accountId);
      else clearLastSyncCursor(accountId);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    pulled, skipped, errors, cacheUpdated, accountId,
    cursorBefore,
    cursorAfter: filtered
      ? (errors.length ? cursorBefore : workingCursor)
      : completed && !errors.length ? workingCursor : cursorBefore,
    legacySinceBefore, pages,
    completed: completed && errors.length === 0,
    yielded: yielded && errors.length === 0,
    filtered,
  };
}

export async function repairSync(): Promise<PullSyncResult> {
  const accountId = assertAccountId();
  forceFullSyncNextRun(accountId);
  return pullSync({ full: true, accountId });
}
