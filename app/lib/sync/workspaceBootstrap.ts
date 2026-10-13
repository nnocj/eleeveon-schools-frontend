
/**
 * app/lib/sync/workspaceBootstrap.ts
 * --------------------------------------------------------------------------
 * NON-BLOCKING ROLE-WIDE WORKSPACE BOOTSTRAP — PLATFORM V2
 *
 * The existing backend returns ONE role-scoped response. This implementation
 * preserves that API and the schema-v3 completeness contract, but applies the
 * returned records in bounded Dexie transactions rather than one giant one.
 *
 * Features:
 * - permanent string IDs in requests and local records;
 * - scoped progress and completion markers (including table coverage);
 * - per-batch events so pages can update while records are being saved;
 * - protection for pending/failed/conflicted local writes;
 * - account/workspace checks before applying each batch;
 * - no false "complete" state after a failed or truncated bootstrap.
 *
 * NOTE: The server still sends one bundle. Network-level pagination, resume
 * cursors and active-module prioritization REQUIRE matching backend changes.
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
  }>("eleeveon_open_workspace");

  if (!opened) return;
  const current = opened.membership || {
    id: opened.membershipId,
    role: opened.role,
    schoolId: opened.schoolId,
    branchId: opened.branchId,
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
  const payload = { ...(record.payload || {}) };
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
    (cached?.appearanceScope === appearanceScope ? cached.settings : null);

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
 * Fetch and apply an entire selected-role workspace in the background.
 * NOTE: Network request is still ONE bundle, not paginated.
 */
export async function bootstrapSelectedWorkspace(
  membership: WorkspaceBootstrapMembership,
  options?: {
    force?: boolean;
    allowCached?: boolean;
    onProgress?: (progress: WorkspaceBootstrapProgress) => void;
  },
): Promise<WorkspaceBootstrapResult> {
  const accountId = assertAccountId();
  const deviceId = getDeviceId();
  const role = normalizeRole(membership.role);
  assertWorkspaceUnchanged(accountId, membership);

  options?.onProgress?.({
    stage: "checking-cache",
    title: "Checking saved workspace…",
    detail: "Checking complete locally saved records.",
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
      detail: "Using previously downloaded offline records.",
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
    throw new Error(
      "Workspace data has not finished downloading and this device is offline.",
    );
  }

  const startedAt = Date.now();
  let processed = 0;
  let total = 0;
  let applied = 0;
  let cacheApplied = 0;
  let quarantined = 0;
  const changedTables = new Set<string>();

  const saveState = (
    status: WorkspaceDownloadStatus,
    extra: Partial<WorkspaceDownloadState> = {},
  ) => {
    updateDownloadState(accountId, membership, {
      status,
      accountId,
      membershipId: membershipId(membership),
      schemaVersion: WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
      startedAt,
      updatedAt: Date.now(),
      processed,
      total: total || undefined,
      ...extra,
    });
  };

  try {
    saveState("downloading");
    options?.onProgress?.({
      stage: "requesting",
      title: "Downloading workspace data…",
      detail: "Fetching all records permitted for this role.",
      percent: 18,
    });

    // IMPORTANT: the deployed endpoint has no page/cursor request contract yet.
    const response = await syncHttp<WorkspaceBootstrapResponse>(ENDPOINT, {
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
      },
    });

    assertWorkspaceUnchanged(accountId, membership);
    if (!response?.ok || response.accountId !== accountId) {
      throw new Error("Workspace bootstrap response does not match this account.");
    }
    if (response.truncated || response.completed === false) {
      throw new Error("The server returned an incomplete workspace bundle.");
    }
    if (response.bootstrapSchemaVersion !== WORKSPACE_BOOTSTRAP_SCHEMA_VERSION) {
      throw new Error("The backend bootstrap schema does not match this app build.");
    }
    if (normalizeRole(response.role) !== role) {
      throw new Error("The server returned data for a different role.");
    }
    for (const key of ["schoolId", "branchId", "teacherId", "studentId", "parentId"] as const) {
      if (
        cleanId(response[key]) &&
        cleanId(membership[key]) &&
        cleanId(response[key]) !== cleanId(membership[key])
      ) {
        throw new Error(`Workspace bootstrap ${key} does not match this membership.`);
      }
    }

    const includedTables = response.includedTables || response.requiredTables || [];
    if (isFullTableRegistryRequired(role)) {
      const covered = new Set(includedTables);
      const missing = LOCAL_FIRST_SYNC_TABLES.filter((table) => !covered.has(table));
      if (missing.length) {
        throw new Error(`Bootstrap response omitted required tables: ${missing.join(", ")}.`);
      }
    }

    const responseWorkspace: NonNullable<WorkspaceBootstrapResponse["workspace"]> = {
      ...(response.workspace || {}),
      appearanceScope: response.workspace?.appearanceScope || appearanceScopeForRole(role),
      school: response.school ?? response.workspace?.school ?? null,
      branch: response.branch ?? response.workspace?.branch ?? null,
      settings: response.schoolBranchSettings ?? response.workspace?.settings ?? null,
    };
    response.workspace = responseWorkspace;
    const bootstrapRevision = response.bootstrapRevision || response.revision;

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

    total = items.length;
    saveState("downloading", {
      includedTables,
      tablesWithRecords: response.tablesWithRecords || [],
      tableCounts: response.tableCounts,
    });

    // Do not claim full coverage just because the first batch was stored.
    // Each batch commits atomically, and sends its own data-change event.
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      assertWorkspaceUnchanged(accountId, membership);
      const batch = items.slice(offset, offset + BATCH_SIZE);
      const result = await applyBatch(batch, accountId, deviceId);
      processed += batch.length;
      applied += result.applied;
      cacheApplied += result.cacheApplied;
      quarantined += result.quarantined;
      for (const table of result.changedTables) changedTables.add(table);

      if (result.changedTables.size) {
        publishSyncPullCompleted({
          accountId,
          changedTables: [...result.changedTables],
        });
      }

      saveState("partial", {
        includedTables,
        tablesWithRecords: response.tablesWithRecords || [],
        tableCounts: response.tableCounts,
      });

      options?.onProgress?.({
        stage: "applying",
        title: "Preparing offline records…",
        detail: `Saved ${processed.toLocaleString()} of ${total.toLocaleString()} items`,
        percent: Math.min(96, Math.round(30 + (processed / Math.max(1, total)) * 66)),
        current: processed,
        total,
        tableName: batch.reduce<string | undefined>(
          (found, item) => found || (item.kind === "quarantine" ? undefined : item.value.tableName),
          undefined,
        ),
      });

      // Yield AFTER the Dexie transaction commits so the portal can paint.
      if (offset + BATCH_SIZE < items.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    assertWorkspaceUnchanged(accountId, membership);
    if (quarantined > 0 || Number(response.quarantinedCount || 0) > 0) {
      throw new Error(
        `Workspace download contained ${Math.max(quarantined, Number(response.quarantinedCount || 0))} quarantined records; it was not marked complete.`,
      );
    }

    const completedAt = Date.now();
    const summary = await readCommittedWorkspaceSummary(accountId, membership);
    if (!await actualWorkspaceReady(accountId, membership)) {
      throw new Error("The downloaded workspace is missing essential school, branch or settings records.");
    }
    assertWorkspaceUnchanged(accountId, membership);

    writeJson(storageKey(accountId, membership), {
      accountId,
      membershipId: membershipId(membership),
      schoolId: cleanId(membership.schoolId),
      branchId: cleanId(membership.branchId),
      bootstrapSchemaVersion: WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
      includedTables,
      tablesWithRecords: response.tablesWithRecords || [],
      tableCounts: response.tableCounts,
      bootstrapRevision,
      changedTables: [...changedTables],
      completedAt,
    });

    const cacheEnvelope: ScopedWorkspaceSettingsCache = {
      accountId,
      schoolId: cleanId(membership.schoolId),
      branchId: cleanId(membership.branchId),
      role,
      appearanceScope: summary.appearanceScope,
      settings: summary.settings,
      cachedAt: completedAt,
      bootstrapRevision,
    };
    writeJson(getScopedWorkspaceSettingsKey(accountId, membership), cacheEnvelope);
    writeJson(CURRENT_WORKSPACE_SETTINGS_KEY, cacheEnvelope);

    saveState("complete", {
      completedAt,
      includedTables,
      tablesWithRecords: response.tablesWithRecords || [],
      tableCounts: response.tableCounts,
    });

    options?.onProgress?.({
      stage: "ready",
      title: "Workspace data ready",
      detail: "All permitted records have been saved for offline use.",
      percent: 100,
      current: processed,
      total,
    });

    return {
      ready: true,
      fromCache: false,
      applied,
      cacheApplied,
      quarantined,
      changedTables: [...changedTables],
      bootstrapRevision,
      completedAt,
      appearanceScope: summary.appearanceScope,
      school: summary.school,
      branch: summary.branch,
      settings: summary.settings,
      workspace: {
        ...responseWorkspace,
        ...summary.workspace,
        academicPeriod: responseWorkspace.academicPeriod || null,
      },
    };
  } catch (error) {
    saveState("failed", {
      error: error instanceof Error ? error.message : String(error),
    });
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
