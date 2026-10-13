/**
 * app/lib/sync/workspaceBootstrap.ts
 * --------------------------------------------------------------------------
 * PAGINATED OFFLINE-FIRST SELECTED WORKSPACE BOOTSTRAP — PLATFORM V2
 *
 * - Uses the optional backend pageSize/nextCursor protocol (150 rows/page).
 * - Applies each network page in small atomic Dexie transactions.
 * - Saves an opaque resume cursor ONLY after its entire page has committed.
 * - Replays an interrupted page safely; preserves unsynced local edits.
 * - Restarts a changed server snapshot with a bounded retry budget.
 * - Marks complete only after every authorized table/page is verified.
 * - Keeps the old one-response server response compatible during rollout.
 *
 * Sync continues asynchronously in the currently open PWA. When the browser
 * closes, pending network operations stop; a later open can resume.
 * Active-page prioritization is a separate, later synchronization feature.
 */

import { db } from "../db";

import {
  assertAccountId,
  getAccountId,
  getDeviceId,
  SYNC_STATUS_VALUE,
} from "./syncConfig";

import { syncHttp } from "./syncHttp";

import {
  LOCAL_FIRST_SYNC_TABLES,
  isBackendCacheTable,
  isSyncTable,
} from "./syncTables";

import {
  integrityReason,
  quarantineSyncRecord,
  validatePullRecord,
} from "./syncIntegrity";

import { publishSyncPullCompleted } from "./syncEvents";
import { appearanceScopeForRole } from "../theme/appearanceScope";

export type WorkspaceBootstrapMembership = {
  id?: string | number | null;
  role?: string | null;
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  [key: string]: unknown;
};

export type WorkspaceBootstrapRecord = {
  tableName: string;
  localId?: string;
  cloudId?: string;
  entityId?: string;
  id?: string;
  accountId: string;
  deviceId?: string;
  version: number;
  updatedAt: number;
  isDeleted?: boolean;
  payload: Record<string, any>;
};

export type WorkspaceBootstrapResponse = {
  ok: boolean;
  accountId: string;
  membershipId?: string;
  role: string;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  workspace?: {
    appearanceScope?: "platform" | "account" | "school" | "branch";
    school?: Record<string, any> | null;
    branch?: Record<string, any> | null;
    settings?: Record<string, any> | null;
    academicPeriod?: Record<string, any> | null;
  };
  school?: Record<string, any> | null;
  branch?: Record<string, any> | null;
  schoolBranchSettings?: Record<string, any> | null;
  requiredTables?: string[];
  completed?: boolean;
  revision?: string;
  records?: WorkspaceBootstrapRecord[];
  cacheRecords?: Array<{
    tableName: string;
    id?: string;
    accountId?: string;
    updatedAt?: number | string;
    isDeleted?: boolean;
    payload: Record<string, any>;
  }>;
  quarantineRecords?: Array<{
    reason?: string;
    record?: WorkspaceBootstrapRecord;
  }>;
  changedTables?: string[];
  bootstrapSchemaVersion?: number;
  includedTables?: string[];
  tablesWithRecords?: string[];
  bootstrapRevision?: string;
  serverTime?: number;
  recordCount?: number;
  totalRecords?: number;
  tableCounts?: Record<string, number>;
  quarantinedCount?: number;
  truncated?: boolean;
  /** Optional opt-in network pagination response fields. */
  hasMore?: boolean;
  nextCursor?: string | null;
  pageSize?: number;
  pageOffset?: number;
  roleRequiredTables?: string[];
  allRoleTablesRequested?: boolean;
};

export type WorkspaceBootstrapProgress = {
  stage: "checking-cache" | "requesting" | "applying" | "ready";
  title: string;
  detail: string;
  percent: number;
  current?: number;
  total?: number;
  tableName?: string;
};

export type WorkspaceBootstrapResult = {
  ready: boolean;
  fromCache: boolean;
  applied: number;
  cacheApplied: number;
  quarantined: number;
  changedTables: string[];
  bootstrapRevision?: string;
  completedAt: number;
  appearanceScope: "platform" | "account" | "school" | "branch";
  school?: Record<string, any> | null;
  branch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
  workspace?: WorkspaceBootstrapResponse["workspace"];
};

export const WORKSPACE_BOOTSTRAP_SCHEMA_VERSION = 3;
export const CURRENT_WORKSPACE_SETTINGS_KEY =
  "eleeveon_current_workspace_settings";
export const WORKSPACE_BOOTSTRAP_STATUS_EVENT =
  "eleeveon:workspace-bootstrap-status";

const ENDPOINT = "/sync/workspace-bootstrap";
const MARKER_PREFIX = "eleeveon_workspace_bootstrap";
const SETTINGS_CACHE_PREFIX = "eleeveon_cached_settings";
const STATUS_PREFIX = "eleeveon_workspace_bootstrap_status";
const BATCH_SIZE = 150;
const NETWORK_PAGE_SIZE = 150;
const MAX_SNAPSHOT_RESTARTS = 2;
const MAX_NETWORK_PAGES = 100000;
const inFlight = new Map<string, Promise<WorkspaceBootstrapResult>>();

export type ScopedWorkspaceSettingsCache = {
  accountId: string;
  schoolId: string | null;
  branchId: string | null;
  role: string;
  appearanceScope: "platform" | "account" | "school" | "branch";
  settings: Record<string, any> | null;
  cachedAt: number;
  bootstrapRevision?: string;
};

export type WorkspaceDownloadStatus =
  | "not_downloaded"
  | "downloading"
  | "partial"
  | "complete"
  | "failed";

export type WorkspaceDownloadState = {
  status: WorkspaceDownloadStatus;
  accountId: string;
  membershipId: string;
  schemaVersion: number;
  startedAt?: number;
  updatedAt: number;
  completedAt?: number;
  processed: number;
  total?: number;
  includedTables?: string[];
  tablesWithRecords?: string[];
  tableCounts?: Record<string, number>;
  error?: string;
  /** Checkpoint for the NEXT page, never for an uncommitted page. */
  nextCursor?: string | null;
  bootstrapRevision?: string;
  pageSize?: number;
  nextOffset?: number;
  pagesCommitted?: number;
  applied?: number;
  cacheApplied?: number;
  quarantined?: number;
  changedTables?: string[];
};

export type WorkspaceTableAvailability =
  | "not_downloaded"
  | "downloading"
  | "partial"
  | "complete"
  | "failed";

function clean(value: unknown): string | undefined {
  const parsed = String(value ?? "").trim();
  return parsed || undefined;
}

function cleanId(value: unknown): string | null {
  return clean(value) ?? null;
}

function normalizeRole(value: unknown): string {
  const role = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return role === "owner" ? "super_admin" : role;
}

function membershipId(membership: WorkspaceBootstrapMembership): string {
  return (
    clean(membership.id) ||
    [
      normalizeRole(membership.role),
      cleanId(membership.schoolId) || "account",
      cleanId(membership.branchId) || "root",
      cleanId(membership.teacherId) ||
        cleanId(membership.studentId) ||
        cleanId(membership.parentId) ||
        "profile",
    ].join(":")
  );
}

function workspaceIdentity(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): string {
  return [
    accountId,
    membershipId(membership),
    normalizeRole(membership.role),
    cleanId(membership.schoolId) || "school-none",
    cleanId(membership.branchId) || "branch-none",
    cleanId(membership.teacherId) || "teacher-none",
    cleanId(membership.studentId) || "student-none",
    cleanId(membership.parentId) || "parent-none",
  ].join(":");
}

function storageKey(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): string {
  return [
    MARKER_PREFIX,
    accountId,
    membershipId(membership),
    cleanId(membership.schoolId) || "school-none",
    cleanId(membership.branchId) || "branch-none",
  ].join(":");
}

function statusKey(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): string {
  return `${STATUS_PREFIX}:${workspaceIdentity(accountId, membership)}`;
}

export function getScopedWorkspaceSettingsKey(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): string {
  return [
    SETTINGS_CACHE_PREFIX,
    accountId,
    cleanId(membership.schoolId) || "school-none",
    cleanId(membership.branchId) || "branch-none",
  ].join(":");
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures must not interrupt Dexie writes.
  }
}

export function readScopedWorkspaceSettingsCache(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
) {
  return readJson<ScopedWorkspaceSettingsCache>(
    getScopedWorkspaceSettingsKey(accountId, membership),
  );
}

export function readCurrentWorkspaceSettingsCache() {
  return readJson<ScopedWorkspaceSettingsCache>(
    CURRENT_WORKSPACE_SETTINGS_KEY,
  );
}

type CompletionMarker = {
  completedAt?: number;
  bootstrapSchemaVersion?: number;
  includedTables?: string[];
  tablesWithRecords?: string[];
  tableCounts?: Record<string, number>;
  bootstrapRevision?: string;
};

function completionMarker(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): CompletionMarker | null {
  const marker = readJson<CompletionMarker>(storageKey(accountId, membership));
  if (
    !marker?.completedAt ||
    marker.bootstrapSchemaVersion !== WORKSPACE_BOOTSTRAP_SCHEMA_VERSION
  ) {
    return null;
  }
  return marker;
}

function updateDownloadState(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
  next: WorkspaceDownloadState,
): void {
  writeJson(statusKey(accountId, membership), next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_BOOTSTRAP_STATUS_EVENT, {
        detail: {
          accountId,
          membershipId: membershipId(membership),
          status: next.status,
          processed: next.processed,
          total: next.total,
        },
      }),
    );
  }
}

export function readWorkspaceBootstrapDownloadState(
  membership: WorkspaceBootstrapMembership,
): WorkspaceDownloadState | null {
  const accountId = getAccountId();
  if (!accountId) return null;

  const saved = readJson<WorkspaceDownloadState>(statusKey(accountId, membership));
  const marker = completionMarker(accountId, membership);

  // The completed marker is authoritative for a completed older download;
  // subsequent failed refresh attempts do not remove that offline coverage.
  if (saved?.schemaVersion === WORKSPACE_BOOTSTRAP_SCHEMA_VERSION) {
    return saved;
  }
  if (!marker) return null;
  return {
    status: "complete",
    accountId,
    membershipId: membershipId(membership),
    schemaVersion: WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
    updatedAt: marker.completedAt!,
    completedAt: marker.completedAt,
    processed: 0,
    includedTables: marker.includedTables,
    tablesWithRecords: marker.tablesWithRecords,
    tableCounts: marker.tableCounts,
    bootstrapRevision: marker.bootstrapRevision,
  };
}

/**
 * `complete` is only reported when this table is in a valid, complete
 * workspace marker. Partial rows never imply a complete dataset.
 * A full role bootstrap does NOT prove completeness for another role/scope.
 */
export function getWorkspaceTableAvailability(
  membership: WorkspaceBootstrapMembership,
  tableName: string,
): WorkspaceTableAvailability {
  const accountId = getAccountId();
  if (!accountId) return "not_downloaded";
  const marker = completionMarker(accountId, membership);
  if (marker?.includedTables?.includes(tableName)) return "complete";
  const state = readWorkspaceBootstrapDownloadState(membership);
  if (!state) return "not_downloaded";
  if (state.status === "complete") return "not_downloaded";
  return state.status;
}

function assertWorkspaceUnchanged(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
): void {
  if (getAccountId() !== accountId) {
    throw new Error("The active account changed during workspace download.");
  }
  if (membership.accountId && clean(membership.accountId) !== accountId) {
    throw new Error("Workspace membership does not belong to this account.");
  }
  if (typeof window === "undefined") return;

  const opened = readJson<{
    membershipId?: string;
    membership?: WorkspaceBootstrapMembership;
    role?: string;
    schoolId?: string | null;
    branchId?: string | null;
    teacherId?: string | null;
    studentId?: string | null;
    parentId?: string | null;
  }>("eleeveon_open_workspace");

  if (!opened) return;
  const current = opened.membership || {
    id: opened.membershipId,
    role: opened.role,
    schoolId: opened.schoolId,
    branchId: opened.branchId,
    teacherId: opened.teacherId,
    studentId: opened.studentId,
    parentId: opened.parentId,
  };
  if (workspaceIdentity(accountId, current) !== workspaceIdentity(accountId, membership)) {
    throw new Error("The selected role or workspace changed during download.");
  }
}

async function findById(table: any, id?: string) {
  if (!id) return null;
  try {
    const direct = await table.get(id);
    if (direct) return direct;
  } catch {}
  try {
    return (await table.where("id").equals(id).first()) || null;
  } catch {
    const rows = await table.toArray();
    return rows.find((row: any) => String(row.id || "") === id) || null;
  }
}

async function findExistingRecord(
  tableName: string,
  table: any,
  record: WorkspaceBootstrapRecord,
) {
  const permanentId = clean(
    record.localId || record.entityId || record.payload?.id || record.id,
  );
  const direct = await findById(table, permanentId);
  if (direct) return direct;

  const cloudId = clean(record.cloudId || record.payload?.cloudId);
  if (cloudId) {
    try {
      const indexed = await table.where("cloudId").equals(cloudId).first();
      if (indexed) return indexed;
    } catch {
      const rows = await table.toArray();
      const match = rows.find((row: any) => String(row.cloudId || "") === cloudId);
      if (match) return match;
    }
  }

  if (tableName === "mediaAssets") {
    const identityKey = clean(record.payload?.ownerIdentityKey);
    if (identityKey) {
      try {
        const indexed = await table
          .where("ownerIdentityKey")
          .equals(identityKey)
          .first();
        if (indexed && indexed.accountId === record.accountId) return indexed;
      } catch {
        const rows = await table.toArray();
        const match = rows.find(
          (row: any) =>
            row.accountId === record.accountId &&
            row.ownerIdentityKey === identityKey,
        );
        if (match) return match;
      }
    }
  }

  return null;
}

function cleanIncomingPayload(
  record: WorkspaceBootstrapRecord,
  permanentId: string,
) {
  const payload = { ...(record.payload || {}) };
  for (const key of [
    "blob", "file", "originalFile", "optimizedFile", "localBlob",
    "localBlobData", "previewUrl", "objectUrl", "localObjectUrl",
    "dataUrl", "base64",
  ]) {
    delete payload[key];
  }
  payload.id = permanentId;
  return payload;
}

async function applyLocalFirstRecord(
  record: WorkspaceBootstrapRecord,
  accountId: string,
  fallbackDeviceId: string,
): Promise<boolean> {
  const table = (db as any)[record.tableName];
  if (!table) return false;

  const existing = await findExistingRecord(record.tableName, table, record);
  const permanentId = clean(
    existing?.id || record.localId || record.entityId || record.payload?.id || record.id,
  );
  if (existing?.accountId && String(existing.accountId) !== accountId) {
    throw new Error("A matching local record belongs to another account.");
  }
  if (!permanentId) {
    throw new Error(`Workspace record for "${record.tableName}" has no permanent ID.`);
  }

  // A role bootstrap is a pull, not authority to overwrite local pending work.
  if (
    existing?.synced === SYNC_STATUS_VALUE.PENDING ||
    existing?.synced === SYNC_STATUS_VALUE.ERROR ||
    existing?.synced === SYNC_STATUS_VALUE.CONFLICT
  ) {
    return false;
  }

  const incoming = {
    ...cleanIncomingPayload(record, permanentId),
    id: permanentId,
    cloudId: clean(record.cloudId || record.payload?.cloudId) ?? undefined,
    accountId,
    deviceId: record.deviceId || record.payload?.deviceId || fallbackDeviceId,
    version: Number(record.version ?? record.payload?.version ?? 1),
    updatedAt: Number(record.updatedAt ?? record.payload?.updatedAt ?? Date.now()),
    isDeleted: Boolean(record.isDeleted || record.payload?.isDeleted),
    synced: SYNC_STATUS_VALUE.SYNCED,
    syncError: undefined,
  };

  const oldVersion = Number(existing?.version || 0);
  const oldUpdated = Number(existing?.updatedAt || 0);
  if (
    existing &&
    (oldVersion > incoming.version ||
      (oldVersion === incoming.version && oldUpdated > incoming.updatedAt))
  ) {
    return false;
  }

  await table.put(incoming);
  return true;
}

async function applyCacheRecord(record: any, accountId: string) {
  if (!record?.tableName || !isBackendCacheTable(record.tableName)) {
    return false;
  }
  const table = (db as any)[record.tableName];
  if (!table) return false;
  if (record.accountId && String(record.accountId) !== accountId) {
    throw new Error("A platform cache record belongs to a different account.");
  }
  const payload = { ...(record.payload || {}) };
  if (payload.accountId && String(payload.accountId) !== accountId &&
      record.tableName !== "subscriptionPlans" &&
      record.tableName !== "commercialPlans") {
    throw new Error("A platform cache payload belongs to a different account.");
  }
  const id = clean(record.id || payload.id || (
    record.tableName === "accounts" ? accountId : null
  ));
  if (!id) return false;
  payload.id = id;
  if (!payload.accountId && record.tableName !== "subscriptionPlans") {
    payload.accountId = accountId;
  }
  if (record.isDeleted) {
    await table.delete(id);
    return true;
  }
  await table.put(payload);
  return true;
}

async function actualWorkspaceReady(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
) {
  const scope = appearanceScopeForRole(normalizeRole(membership.role));
  if (scope === "platform" || scope === "account") return true;

  const schoolId = cleanId(membership.schoolId);
  const branchId = cleanId(membership.branchId);
  if (!schoolId) return false;

  const schools: any[] = (await (db as any).schools?.toArray?.()) || [];
  const schoolFound = schools.some(
    (row: any) =>
      row.accountId === accountId &&
      !row.isDeleted &&
      String(row.id || row.entityId || "") === schoolId,
  );
  if (scope === "school") return schoolFound;
  if (!schoolFound || !branchId) return false;

  const branchTable = (db as any).branches;
  const settingsTable = (db as any).schoolBranchSettings;
  if (!branchTable || !settingsTable) return false;

  const [branches, settings] = await Promise.all([
    branchTable.toArray(),
    settingsTable.toArray(),
  ]);
  return (
    branches.some(
      (row: any) =>
        row.accountId === accountId &&
        !row.isDeleted &&
        String(row.id || row.entityId || "") === branchId &&
        String(row.schoolId || "") === schoolId,
    ) &&
    settings.some(
      (row: any) =>
        row.accountId === accountId &&
        !row.isDeleted &&
        String(row.schoolId || "") === schoolId &&
        String(row.branchId || "") === branchId,
    )
  );
}

async function readCommittedWorkspaceSummary(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
) {
  const role = normalizeRole(membership.role);
  const appearanceScope = appearanceScopeForRole(role);
  const schoolId = cleanId(membership.schoolId);
  const branchId = cleanId(membership.branchId);

  const [schools, branches, settingsRows]: any[] = await Promise.all([
    (db as any).schools?.toArray?.() || [],
    (db as any).branches?.toArray?.() || [],
    (db as any).schoolBranchSettings?.toArray?.() || [],
  ]);

  const school = schoolId
    ? schools.find(
        (row: any) =>
          row.accountId === accountId &&
          !row.isDeleted &&
          String(row.id || row.entityId || "") === schoolId,
      ) || null
    : null;

  const branch = branchId
    ? branches.find(
        (row: any) =>
          row.accountId === accountId &&
          !row.isDeleted &&
          String(row.id || row.entityId || "") === branchId &&
          (!schoolId || String(row.schoolId || "") === schoolId),
      ) || null
    : null;

  const settings =
    appearanceScope === "branch" && schoolId && branchId
      ? settingsRows
          .filter(
            (row: any) =>
              row.accountId === accountId &&
              !row.isDeleted &&
              String(row.schoolId || "") === schoolId &&
              String(row.branchId || "") === branchId,
          )
          .sort(
            (a: any, b: any) =>
              Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
          )[0] || null
      : null;

  const cached = readScopedWorkspaceSettingsCache(accountId, membership);
  const resolvedSettings =
    settings ||
    (cached && cached.appearanceScope === appearanceScope ? cached.settings : null);

  return {
    appearanceScope,
    school,
    branch,
    settings: resolvedSettings,
    workspace: {
      appearanceScope,
      school,
      branch,
      settings: resolvedSettings,
      academicPeriod: null,
    },
  };
}

function isFullTableRegistryRequired(role: string): boolean {
  return [
    "super_admin", "admin", "school_admin", "branch_admin", "accountant",
  ].includes(role);
}

export async function isWorkspaceLocallyReady(
  membership: WorkspaceBootstrapMembership,
) {
  const accountId = assertAccountId();
  const marker = completionMarker(accountId, membership);
  if (!marker) return false;

  if (isFullTableRegistryRequired(normalizeRole(membership.role))) {
    const included = new Set(marker.includedTables || []);
    if (!LOCAL_FIRST_SYNC_TABLES.every((table) => included.has(table))) {
      return false;
    }
  }

  return actualWorkspaceReady(accountId, membership);
}

type BootstrapItem =
  | { kind: "record"; value: WorkspaceBootstrapRecord }
  | { kind: "cache"; value: NonNullable<WorkspaceBootstrapResponse["cacheRecords"]>[number] }
  | { kind: "quarantine"; value: NonNullable<WorkspaceBootstrapResponse["quarantineRecords"]>[number] };

/**
 * Each chunk uses its own atomic transaction. Earlier committed chunks remain
 * locally available if the next chunk fails; no completeness marker is written.
 */
async function applyBatch(
  batch: BootstrapItem[],
  accountId: string,
  deviceId: string,
): Promise<{
  applied: number;
  cacheApplied: number;
  quarantined: number;
  changedTables: Set<string>;
}> {
  const tables = new Set<any>();
  const quarantineTable = (db as any).syncQuarantine;
  if (quarantineTable) tables.add(quarantineTable);

  for (const item of batch) {
    if (item.kind === "quarantine") continue;
    const tableName = item.value.tableName;
    const allowed = item.kind === "record"
      ? isSyncTable(tableName)
      : isBackendCacheTable(tableName);
    if (allowed && (db as any)[tableName]) {
      tables.add((db as any)[tableName]);
    }
  }

  let applied = 0;
  let cacheApplied = 0;
  let quarantined = 0;
  const changedTables = new Set<string>();

  if (!tables.size) {
    return { applied, cacheApplied, quarantined, changedTables };
  }

  await db.transaction("rw", [...tables], async () => {
    for (const item of batch) {
      if (item.kind === "quarantine") {
        const malformed = item.value;
        await quarantineSyncRecord({
          source: "pull",
          accountId,
          tableName: malformed.record?.tableName,
          entityId: malformed.record?.entityId,
          id: malformed.record?.id,
          reason: malformed.reason || "Backend quarantined a malformed record.",
          payload: malformed.record || malformed,
        });
        quarantined++;
      } else if (item.kind === "record") {
        const record = item.value;
        const integrity = validatePullRecord(record, accountId);
        if (!integrity.ok) {
          await quarantineSyncRecord({
            source: "pull",
            accountId,
            tableName: record.tableName,
            entityId: record.entityId,
            id: record.id,
            reason: integrityReason(integrity.issues),
            payload: record,
          });
          quarantined++;
          continue;
        }
        if (
          isSyncTable(record.tableName) &&
          await applyLocalFirstRecord(record, accountId, deviceId)
        ) {
          applied++;
          changedTables.add(record.tableName);
        }
      } else if (item.kind === "cache") {
        if (await applyCacheRecord(item.value, accountId)) {
          cacheApplied++;
          changedTables.add(item.value.tableName);
        }
      }
    }
  });

  return { applied, cacheApplied, quarantined, changedTables };
}

/**
 * The exported signature is unchanged for all existing callers. In-flight
 * work for a workspace is shared within this browser tab.
 */
export function bootstrapSelectedWorkspace(
  membership: WorkspaceBootstrapMembership,
  options?: {
    force?: boolean;
    allowCached?: boolean;
    onProgress?: (progress: WorkspaceBootstrapProgress) => void;
  },
): Promise<WorkspaceBootstrapResult> {
  const accountId = assertAccountId();
  const key = workspaceIdentity(accountId, membership);
  const running = inFlight.get(key);
  if (running) return running;

  const task = bootstrapWorkspacePages(accountId, membership, options);
  inFlight.set(key, task);
  void task.finally(() => {
    if (inFlight.get(key) === task) inFlight.delete(key);
  }).catch(() => undefined);
  return task;
}

function isSnapshotChanged(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("WORKSPACE_SNAPSHOT_CHANGED");
}

async function bootstrapWorkspacePages(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
  options?: {
    force?: boolean;
    allowCached?: boolean;
    onProgress?: (progress: WorkspaceBootstrapProgress) => void;
  },
): Promise<WorkspaceBootstrapResult> {
  const deviceId = getDeviceId();
  const role = normalizeRole(membership.role);
  assertWorkspaceUnchanged(accountId, membership);

  options?.onProgress?.({
    stage: "checking-cache",
    title: "Checking saved workspace…",
    detail: "Checking complete offline records and any interrupted download.",
    percent: 8,
  });

  if (
    options?.allowCached !== false &&
    !options?.force &&
    await isWorkspaceLocallyReady(membership)
  ) {
    const summary = await readCommittedWorkspaceSummary(accountId, membership);
    const marker = completionMarker(accountId, membership);
    options?.onProgress?.({
      stage: "ready",
      title: "Workspace ready",
      detail: "Using the previously completed offline workspace.",
      percent: 100,
    });
    return {
      ready: true,
      fromCache: true,
      applied: 0,
      cacheApplied: 0,
      quarantined: 0,
      changedTables: [],
      completedAt: marker?.completedAt || Date.now(),
      bootstrapRevision: marker?.bootstrapRevision,
      ...summary,
    };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("The workspace download is incomplete and the device is offline.");
  }

  const startedAt = Date.now();
  const saved = !options?.force
    ? readJson<WorkspaceDownloadState>(statusKey(accountId, membership))
    : null;
  const canResume = Boolean(
    saved &&
    saved.schemaVersion === WORKSPACE_BOOTSTRAP_SCHEMA_VERSION &&
    saved.accountId === accountId &&
    saved.membershipId === membershipId(membership) &&
    saved.pageSize === NETWORK_PAGE_SIZE &&
    saved.nextCursor &&
    saved.bootstrapRevision &&
    Number.isSafeInteger(saved.nextOffset) &&
    (saved.nextOffset ?? 0) > 0 &&
    saved.status !== "complete",
  );

  let cursor: string | null = canResume ? saved?.nextCursor || null : null;
  let revision: string | undefined = canResume ? saved?.bootstrapRevision : undefined;
  let processed = canResume ? saved?.processed || 0 : 0;
  let total = canResume ? saved?.total || 0 : 0;
  let applied = canResume ? saved?.applied || 0 : 0;
  let cacheApplied = canResume ? saved?.cacheApplied || 0 : 0;
  let quarantined = canResume ? saved?.quarantined || 0 : 0;
  let pagesCommitted = canResume ? saved?.pagesCommitted || 0 : 0;
  let nextOffset = canResume ? saved?.nextOffset || 0 : 0;
  let includedTables = canResume ? saved?.includedTables || [] : [];
  let tableCounts = canResume ? { ...(saved?.tableCounts || {}) } : {} as Record<string, number>;
  let tablesWithRecords = new Set<string>(canResume ? saved?.tablesWithRecords || [] : []);
  const changedTables = new Set<string>(canResume ? saved?.changedTables || [] : []);
  let restarts = 0;
  let finalWorkspace: NonNullable<WorkspaceBootstrapResponse["workspace"]> | null = null;

  const saveState = (
    status: WorkspaceDownloadStatus,
    error?: string,
  ): void => {
    // `processed` and `nextCursor` represent FULLY COMMITTED pages only.
    updateDownloadState(accountId, membership, {
      status,
      accountId,
      membershipId: membershipId(membership),
      schemaVersion: WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
      startedAt: canResume ? saved?.startedAt || startedAt : startedAt,
      updatedAt: Date.now(),
      processed,
      total: total || undefined,
      nextCursor: cursor,
      bootstrapRevision: revision,
      pageSize: NETWORK_PAGE_SIZE,
      nextOffset,
      pagesCommitted,
      applied,
      cacheApplied,
      quarantined,
      includedTables,
      tablesWithRecords: [...tablesWithRecords],
      tableCounts,
      changedTables: [...changedTables],
      ...(error ? { error } : {}),
    });
  };

  const resetSnapshot = () => {
    // Previous partial Dexie commits are safe to reapply (stable IDs and
    // version checks); the old checkpoint must not be reused after changes.
    cursor = null;
    revision = undefined;
    processed = 0;
    total = 0;
    applied = 0;
    cacheApplied = 0;
    quarantined = 0;
    pagesCommitted = 0;
    nextOffset = 0;
    includedTables = [];
    tableCounts = {};
    tablesWithRecords = new Set<string>();
    changedTables.clear();
    finalWorkspace = null;
    saveState("downloading");
  };

  try {
    saveState("downloading");

    for (let requestNumber = 0; requestNumber < MAX_NETWORK_PAGES;) {
      assertWorkspaceUnchanged(accountId, membership);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Internet connection was lost. Committed pages are saved for later resume.");
      }

      options?.onProgress?.({
        stage: "requesting",
        title: "Downloading workspace records…",
        detail: `Requesting page ${pagesCommitted + 1} of your authorized workspace.`,
        percent: Math.min(95, total ? Math.round(18 + 75 * processed / total) : 18),
        current: processed,
        total: total || undefined,
      });

      let response: WorkspaceBootstrapResponse;
      try {
        response = await syncHttp<WorkspaceBootstrapResponse>(ENDPOINT, {
          method: "POST",
          body: {
            accountId,
            deviceId,
            membershipId: clean(membership.id),
            role,
            schoolId: cleanId(membership.schoolId),
            branchId: cleanId(membership.branchId),
            teacherId: cleanId(membership.teacherId),
            studentId: cleanId(membership.studentId),
            parentId: cleanId(membership.parentId),
            pageSize: NETWORK_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
            // No tableNames filter: ALWAYS download every table granted to the role.
          },
        });
      } catch (error) {
        if (cursor && isSnapshotChanged(error) && restarts < MAX_SNAPSHOT_RESTARTS) {
          restarts += 1;
          resetSnapshot();
          continue;
        }
        throw error;
      }

      assertWorkspaceUnchanged(accountId, membership);
      if (!response?.ok || response.accountId !== accountId) {
        throw new Error("The server returned data for a different account.");
      }
      if (normalizeRole(response.role) !== role) {
        throw new Error("The server returned a different workspace role.");
      }
      if (
        response.truncated ||
        response.bootstrapSchemaVersion !== WORKSPACE_BOOTSTRAP_SCHEMA_VERSION
      ) {
        throw new Error("The server returned an incomplete or incompatible workspace bundle.");
      }
      if (response.membershipId && clean(membership.id) &&
          response.membershipId !== clean(membership.id)) {
        throw new Error("The server returned a different membership.");
      }
      for (const field of ["schoolId", "branchId", "teacherId", "studentId", "parentId"] as const) {
        if (cleanId(response[field]) && cleanId(membership[field]) &&
            cleanId(response[field]) !== cleanId(membership[field])) {
          throw new Error(`The server response does not match ${field}.`);
        }
      }

      const responseRevision = response.bootstrapRevision || response.revision;
      if (!responseRevision) {
        throw new Error("Workspace response has no snapshot revision.");
      }
      if (revision && responseRevision !== revision) {
        if (restarts < MAX_SNAPSHOT_RESTARTS) {
          restarts += 1;
          resetSnapshot();
          continue;
        }
        throw new Error("WORKSPACE_SNAPSHOT_CHANGED: Workspace changed during download.");
      }

      const responseTables = response.includedTables || response.requiredTables || [];
      if (!Array.isArray(responseTables) || !responseTables.length) {
        // Empty table registries cannot establish full offline coverage.
        throw new Error("Workspace response contains no table coverage information.");
      }
      if (response.allRoleTablesRequested === false) {
        throw new Error("A filtered table response cannot complete a full offline workspace.");
      }
      if (includedTables.length &&
          (includedTables.length !== responseTables.length ||
           includedTables.some(table => !responseTables.includes(table)))) {
        throw new Error("Workspace table coverage changed between pages.");
      }
      if (isFullTableRegistryRequired(role)) {
        const coverage = new Set(responseTables);
        const missing = LOCAL_FIRST_SYNC_TABLES.filter(table => !coverage.has(table));
        if (missing.length) {
          throw new Error(`Workspace response omitted required tables: ${missing.join(", ")}.`);
        }
      }
      if (response.pageOffset !== undefined && response.pageOffset !== nextOffset) {
        throw new Error("Workspace page offset does not match the committed checkpoint.");
      }

      const hasMore = response.hasMore === true;
      const isPaginated = response.hasMore !== undefined;
      if (hasMore && (!response.nextCursor || response.completed === true)) {
        throw new Error("The workspace page did not provide a valid continuation cursor.");
      }
      if (isPaginated && !hasMore &&
          (response.completed === false || Boolean(response.nextCursor))) {
        throw new Error("The final workspace page contains inconsistent completion metadata.");
      }
      if (!isPaginated && response.completed === false) {
        throw new Error("The server returned an incomplete legacy workspace bundle.");
      }
      if (hasMore && !(response.records?.length || response.quarantineRecords?.length)) {
        throw new Error("Server returned a non-final empty page; download cannot advance.");
      }

      // The server returns totalRecords for the full recordset on page one.
      // Later pages may omit first-page-only platform cache from this count.
      const thisTotal = Number(response.totalRecords);
      if (pagesCommitted === 0 && Number.isSafeInteger(thisTotal) && thisTotal >= 0) {
        total = thisTotal;
      }
      revision = responseRevision;
      includedTables = [...responseTables];

      const workspace: NonNullable<WorkspaceBootstrapResponse["workspace"]> = {
        ...(response.workspace || {}),
        appearanceScope: response.workspace?.appearanceScope || appearanceScopeForRole(role),
        school: response.school ?? response.workspace?.school ?? null,
        branch: response.branch ?? response.workspace?.branch ?? null,
        settings: response.schoolBranchSettings ?? response.workspace?.settings ?? null,
      };
      finalWorkspace = workspace;

      const items: BootstrapItem[] = [
        ...(response.quarantineRecords || []).map(
          (value): BootstrapItem => ({ kind: "quarantine", value }),
        ),
        ...(response.records || []).map(
          (value): BootstrapItem => ({ kind: "record", value }),
        ),
        ...(response.cacheRecords || []).map(
          (value): BootstrapItem => ({ kind: "cache", value }),
        ),
      ];

      // Keep checkpoint stable during this page. A crash halfway through it
      // simply replays the entire page on the next app open.
      let pageApplied = 0;
      let pageCacheApplied = 0;
      let pageQuarantined = 0;
      let pageProcessed = 0;
      const pageChanged = new Set<string>();

      for (let index = 0; index < items.length; index += BATCH_SIZE) {
        assertWorkspaceUnchanged(accountId, membership);
        const batch = items.slice(index, index + BATCH_SIZE);
        const result = await applyBatch(batch, accountId, deviceId);
        pageProcessed += batch.length;
        pageApplied += result.applied;
        pageCacheApplied += result.cacheApplied;
        pageQuarantined += result.quarantined;
        for (const table of result.changedTables) pageChanged.add(table);

        // Publish ONLY after this bounded Dexie transaction has committed.
        if (result.changedTables.size) {
          publishSyncPullCompleted({
            accountId,
            changedTables: [...result.changedTables],
          });
        }
        options?.onProgress?.({
          stage: "applying",
          title: "Saving offline records…",
          detail: `Saved ${processed + pageProcessed} of ${Math.max(total, processed + pageProcessed)} items`,
          current: processed + pageProcessed,
          total: total || undefined,
          percent: Math.min(96, Math.round(20 + 76 * (processed + pageProcessed) / Math.max(1, total))),
          tableName: batch.reduce<string | undefined>(
            (name, item) => name || (
              item.kind === "quarantine" ? undefined : item.value.tableName
            ),
            undefined,
          ),
        });
        if (index + BATCH_SIZE < items.length) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }

      assertWorkspaceUnchanged(accountId, membership);
      // Only now is the entire network page committed. Its cursor is durable
      // in localStorage; if this write fails, replaying page is still safe.
      processed += pageProcessed;
      applied += pageApplied;
      cacheApplied += pageCacheApplied;
      quarantined += pageQuarantined + Math.max(
        0,
        Number(response.quarantinedCount || 0) - (response.quarantineRecords || []).length,
      );
      for (const table of pageChanged) changedTables.add(table);
      for (const [table, amount] of Object.entries(response.tableCounts || {})) {
        tableCounts[table] = (tableCounts[table] || 0) + Number(amount || 0);
      }
      for (const table of response.tablesWithRecords || []) tablesWithRecords.add(table);
      for (const table of Object.keys(response.tableCounts || {})) {
        if (Number(response.tableCounts?.[table] || 0) > 0) tablesWithRecords.add(table);
      }
      pagesCommitted += 1;
      nextOffset += (response.records || []).length + (response.quarantineRecords || []).length;
      cursor = hasMore ? response.nextCursor || null : null;
      saveState(hasMore ? "partial" : "downloading");
      requestNumber += 1;

      if (!hasMore) {
        if (total && processed !== total) {
          throw new Error(`Workspace transfer incomplete: received ${processed} of ${total} records.`);
        }
        if (quarantined > 0) {
          throw new Error(`${quarantined} invalid records were quarantined; workspace not marked complete.`);
        }
        assertWorkspaceUnchanged(accountId, membership);
        if (!(await actualWorkspaceReady(accountId, membership))) {
          throw new Error("The downloaded workspace lacks required school, branch, or settings data.");
        }
        const summary = await readCommittedWorkspaceSummary(accountId, membership);
        const completedAt = Date.now();
        assertWorkspaceUnchanged(accountId, membership);

        // Preserve an older complete marker during forced refresh until this
        // entire new snapshot has been applied and checked.
        writeJson(storageKey(accountId, membership), {
          accountId,
          membershipId: membershipId(membership),
          schoolId: cleanId(membership.schoolId),
          branchId: cleanId(membership.branchId),
          bootstrapSchemaVersion: WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
          includedTables,
          tablesWithRecords: [...tablesWithRecords],
          tableCounts,
          bootstrapRevision: revision,
          changedTables: [...changedTables],
          completedAt,
        });
        const settingsCache: ScopedWorkspaceSettingsCache = {
          accountId,
          schoolId: cleanId(membership.schoolId),
          branchId: cleanId(membership.branchId),
          role,
          appearanceScope: summary.appearanceScope,
          settings: summary.settings,
          cachedAt: completedAt,
          bootstrapRevision: revision,
        };
        writeJson(getScopedWorkspaceSettingsKey(accountId, membership), settingsCache);
        writeJson(CURRENT_WORKSPACE_SETTINGS_KEY, settingsCache);
        saveState("complete");
        options?.onProgress?.({
          stage: "ready",
          title: "Workspace ready",
          detail: "All permitted workspace pages are saved for offline use.",
          percent: 100,
          current: processed,
          total: total || processed,
        });
        return {
          ready: true,
          fromCache: false,
          applied,
          cacheApplied,
          quarantined,
          changedTables: [...changedTables],
          bootstrapRevision: revision,
          completedAt,
          appearanceScope: summary.appearanceScope,
          school: summary.school,
          branch: summary.branch,
          settings: summary.settings,
          workspace: {
            ...(finalWorkspace || {}),
            ...summary.workspace,
            academicPeriod: finalWorkspace?.academicPeriod || null,
          },
        };
      }

      // Allow React/Dexie change listeners to repaint between network pages.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    throw new Error("Workspace download exceeded its maximum page count.");
  } catch (error) {
    saveState("failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function clearWorkspaceBootstrapMarker(
  membership: WorkspaceBootstrapMembership,
): void {
  const accountId = assertAccountId();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(accountId, membership));
    window.localStorage.removeItem(statusKey(accountId, membership));
  } catch {}
}
