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
  forceFullSyncNextRun,
  getDeviceId,
  type PullResponse,
  type SyncPullCursor,
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
 * Selected-workspace cursor isolation.
 *
 * A cursor is scoped by account+environment (syncStorage), membership ID,
 * and the exact sorted requested table set. An account-wide cursor CANNOT be
 * reused by a teacher/parent/student membership after a role switch.
 *
 * Version 2 deliberately does not import the former account-wide checkpoint;
 * the first run re-downloads all records permitted to the selected membership.
 */
export type PullMembershipSelection = {
  membershipId: string;
  role: string;
  schoolId?: string;
  branchId?: string;
  teacherId?: string;
  studentId?: string;
  parentId?: string;
};

type PullCursorState = {
  version: 2;
  membershipId: string;
  tables: string[];
  cursor: SyncPullCursor | null;
  completed: boolean;
  updatedAt: number;
};

function pullIdentity(value: unknown): string | undefined {
  const parsed = String(value ?? "").trim();
  return parsed || undefined;
}

export function readSelectedPullMembership(
  accountId = assertAccountId(),
): PullMembershipSelection {
  if (typeof window === "undefined") {
    throw new Error("Workspace synchronization requires a browser session.");
  }
  let opened: any = null;
  try {
    const raw = window.localStorage.getItem("eleeveon_open_workspace");
    if (raw) opened = JSON.parse(raw);
  } catch {
    // Selected membership is checked below; malformed local state is denied.
  }
  let member = opened?.membership;
  if (!member) {
    try {
      const raw = window.localStorage.getItem("activeMembership");
      if (raw) member = JSON.parse(raw);
    } catch {
      // No usable membership.
    }
  }
  const membershipId = pullIdentity(member?.id || opened?.membershipId);
  const role = pullIdentity(member?.role || opened?.role);
  if (!membershipId || !role) {
    throw new Error("Select your active workspace role before synchronizing.");
  }
  if (member?.accountId && String(member.accountId) !== accountId) {
    throw new Error("The selected workspace membership belongs to another account.");
  }
  const fields = ["schoolId", "branchId", "teacherId", "studentId", "parentId"] as const;
  const scope: PullMembershipSelection = { membershipId, role };
  for (const field of fields) {
    const value = pullIdentity(member?.[field] ?? opened?.[field]);
    if (value) scope[field] = value;
  }
  return scope;
}

function assertSelectedPullMembership(
  expected: PullMembershipSelection,
  accountId: string,
): void {
  const current = readSelectedPullMembership(accountId);
  if (current.membershipId !== expected.membershipId || current.role !== expected.role) {
    throw new Error("The selected role changed during synchronization.");
  }
  for (const field of ["schoolId", "branchId", "teacherId", "studentId", "parentId"] as const) {
    if (current[field] !== expected[field]) {
      throw new Error("The selected workspace scope changed during synchronization.");
    }
  }
}

function canonicalTables(input: string[] | undefined): string[] {
  const tables = [...new Set((input || []).map((name) => String(name).trim()).filter(Boolean))].sort();
  if (tables.length > 100 || tables.some((name) => !isSyncTable(name))) {
    throw new Error("Filtered pulls accept only registered local-first SyncRecord tables.");
  }
  return tables;
}

function pullCursorKey(accountId: string, membershipId: string, tables: string[]): string {
  // Store the whole membership UUID and table-set hash; the payload itself
  // contains the tables to prevent accidental reuse after hash collisions.
  let hash = 2166136261;
  for (const character of tables.join("\u001f")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const group = tables.length ? "filtered" : "all";
  return accountScopedStorageKey(
    `selected_pull_cursor_v2_${encodeURIComponent(membershipId)}_${group}_${(hash >>> 0).toString(16)}`,
    accountId,
  );
}

function readScopedPullPosition(
  accountId: string,
  membershipId: string,
  tables: string[],
): SyncPullCursor | null {
  const raw = getLocalStorageItem(pullCursorKey(accountId, membershipId, tables));
  if (!raw) return null;
  let saved: PullCursorState;
  try {
    saved = JSON.parse(raw) as PullCursorState;
  } catch {
    throw new Error("Selected-workspace pull cursor is not valid JSON.");
  }
  if (
    saved.version !== 2 || saved.membershipId !== membershipId ||
    JSON.stringify(saved.tables) !== JSON.stringify(tables)
  ) {
    throw new Error("Selected-workspace pull cursor does not match this membership and table set.");
  }
  return normalizeCursor(saved.cursor);
}

function writeScopedPullPosition(
  accountId: string,
  membershipId: string,
  tables: string[],
  cursor: SyncPullCursor | null,
  completed: boolean,
): void {
  const state: PullCursorState = {
    version: 2, membershipId, tables, cursor, completed, updatedAt: Date.now(),
  };
  setLocalStorageItem(
    pullCursorKey(accountId, membershipId, tables),
    JSON.stringify(state),
  );
}

export function clearFilteredPullCursor(
  tableNames: string[],
  accountId = assertAccountId(),
): void {
  const tables = canonicalTables(tableNames);
  if (!tables.length) throw new Error("Specify at least one table to clear its filtered cursor.");
  const membership = readSelectedPullMembership(accountId);
  removeLocalStorageItem(pullCursorKey(accountId, membership.membershipId, tables));
}

export function getFilteredPullCursor(
  tableNames: string[],
  accountId = assertAccountId(),
): SyncPullCursor | null {
  const tables = canonicalTables(tableNames);
  if (!tables.length) return null;
  const membership = readSelectedPullMembership(accountId);
  return readScopedPullPosition(accountId, membership.membershipId, tables);
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
  const membership = readSelectedPullMembership(accountId);
  const tables = canonicalTables(options.tableNames);
  const filtered = tables.length > 0;
  const pageLimit = Math.min(2_000, Math.max(1, Math.floor(Number(options.limit) || DEFAULT_PULL_PAGE_LIMIT)));
  const cursorBefore = options.full
    ? null
    : readScopedPullPosition(accountId, membership.membershipId, tables);
  // Membership-scoped checkpoints begin at zero, never a legacy account cursor.
  const legacySinceBefore = 0;
  let workingCursor = cursorBefore;
  let useLegacySince = false;
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
      assertSelectedPullMembership(membership, accountId);
      const body: Record<string, any> = {
        accountId, deviceId, limit: pageLimit, ...membership,
      };
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
      assertSelectedPullMembership(membership, accountId);
      if ((response as any).membershipId &&
          String((response as any).membershipId) !== membership.membershipId) {
        throw new Error("The backend pull response belongs to a different membership.");
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
        assertSelectedPullMembership(membership, accountId);
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
      assertSelectedPullMembership(membership, accountId);
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
      // Each checkpoint belongs exclusively to this selected membership.
      // Persist it only after all records in this page were applied.
      writeScopedPullPosition(
        accountId, membership.membershipId, tables,
        workingCursor, !response.hasMore,
      );
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
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    pulled, skipped, errors, cacheUpdated, accountId,
    cursorBefore,
    cursorAfter: errors.length ? cursorBefore : workingCursor,
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
