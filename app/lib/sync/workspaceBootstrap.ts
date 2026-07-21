/**
 * app/lib/sync/workspaceBootstrap.ts
 * --------------------------------------------------------------------------
 * Phase 21 priority selected-workspace bootstrap.
 *
 * The endpoint returns one role-scoped bundle. This module:
 * - validates the authenticated account;
 * - uses a cache-aware local readiness fast path;
 * - applies local-first and platform-cache records in one Dexie transaction;
 * - quarantines malformed records;
 * - publishes one change event after the transaction;
 * - stores a workspace bootstrap marker and fast branding/settings cache.
 */

import { db } from "../db";

import {
  assertAccountId,
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

import {
  publishSyncPullCompleted,
} from "./syncEvents";

import {
  appearanceScopeForRole,
} from "../theme/appearanceScope";

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

  /** Permanent Dexie entity UUID. */
  localId?: string;

  /** Prisma SyncRecord UUID. */
  cloudId?: string;

  /** Temporary compatibility aliases. */
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
  stage:
    | "checking-cache"
    | "requesting"
    | "applying"
    | "ready";
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

const WORKSPACE_BOOTSTRAP_ENDPOINT =
  "/sync/workspace-bootstrap";

const MARKER_PREFIX =
  "eleeveon_workspace_bootstrap";

const SETTINGS_CACHE_PREFIX =
  "eleeveon_cached_settings";

/**
 * Bump when the definition of a complete initial workspace changes.
 * Version 2 invalidates the earlier essential-table-only markers.
 */
const WORKSPACE_BOOTSTRAP_SCHEMA_VERSION = 2;


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

export const CURRENT_WORKSPACE_SETTINGS_KEY =
  "eleeveon_current_workspace_settings";

function cleanString(
  value: unknown,
) {
  const result =
    String(value ?? "").trim();

  return result || undefined;
}

function cleanOptionalId(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return id || null;
}

function positiveNumber(
  value: unknown,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
}

function normalizeRole(
  value: unknown,
) {
  const role =
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");

  if (role === "owner") {
    return "super_admin";
  }

  return role;
}

function membershipId(
  membership:
    WorkspaceBootstrapMembership,
) {
  return (
    cleanString(membership.id) ||
    [
      normalizeRole(
        membership.role,
      ),
      positiveNumber(
        membership.schoolId,
      ) || "account",
      positiveNumber(
        membership.branchId,
      ) || "root",
      positiveNumber(
        membership.teacherId,
      ) ||
        positiveNumber(
          membership.studentId,
        ) ||
        positiveNumber(
          membership.parentId,
        ) ||
        "profile",
    ].join(":")
  );
}

function storageKey(
  accountId: string,
  membership:
    WorkspaceBootstrapMembership,
) {
  return [
    MARKER_PREFIX,
    accountId,
    membershipId(membership),
    cleanOptionalId(membership.schoolId) || "school-none",
    cleanOptionalId(membership.branchId) || "branch-none",
  ].join(":");
}

export function getScopedWorkspaceSettingsKey(
  accountId: string,
  membership:
    WorkspaceBootstrapMembership,
) {
  return [
    SETTINGS_CACHE_PREFIX,
    accountId,
    cleanOptionalId(membership.schoolId) || "school-none",
    cleanOptionalId(membership.branchId) || "branch-none",
  ].join(":");
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

function readJson<T>(
  key: string,
): T | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        key,
      );

    return raw
      ? JSON.parse(raw) as T
      : null;
  } catch {
    return null;
  }
}

function writeJson(
  key: string,
  value: unknown,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value),
    );
  } catch {}
}

async function findById(
  table: any,
  id?: string,
) {
  if (!id) return null;

  try {
    const indexed =
      await table
        .where("id")
        .equals(id)
        .first();

    if (indexed) {
      return indexed;
    }
  } catch {}

  const rows =
    await table.toArray();

  return (
    rows.find(
      (row: any) =>
        String(
          row.id || "",
        ) === id,
    ) || null
  );
}

async function findExistingRecord(
  tableName: string,
  table: any,
  record:
    WorkspaceBootstrapRecord,
) {
  const permanentId =
    cleanString(
      record.localId ||
        record.entityId ||
        record.payload?.id ||
        record.id,
    );

  const directMatch =
    await findById(
      table,
      permanentId,
    );

  if (directMatch) {
    return directMatch;
  }

  const cloudId =
    cleanString(
      record.cloudId ||
        record.payload?.cloudId,
    );

  if (cloudId) {
    try {
      const indexed =
        await table
          .where("cloudId")
          .equals(cloudId)
          .first();

      if (indexed) {
        return indexed;
      }
    } catch {}

    const rows =
      await table.toArray();

    const cloudMatch =
      rows.find(
        (row: any) =>
          String(
            row.cloudId || "",
          ) === cloudId,
      );

    if (cloudMatch) {
      return cloudMatch;
    }
  }

  if (
    tableName ===
    "mediaAssets"
  ) {
    const identityKey =
      cleanString(
        record.payload
          ?.ownerIdentityKey,
      );

    if (identityKey) {
      try {
        const indexed =
          await table
            .where(
              "ownerIdentityKey",
            )
            .equals(
              identityKey,
            )
            .first();

        if (indexed) {
          return indexed;
        }
      } catch {}

      const rows =
        await table.toArray();

      const exact =
        rows.find(
          (row: any) =>
            row.accountId ===
              record.accountId &&
            row.ownerIdentityKey ===
              identityKey,
        );

      if (exact) {
        return exact;
      }
    }
  }

  return null;
}

function cleanIncomingPayload(
  record:
    WorkspaceBootstrapRecord,
  permanentId: string,
) {
  const payload = {
    ...(record.payload ||
      {}),
  };

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
    delete payload[key];
  }

  payload.id =
    permanentId;

  return payload;
}

async function applyLocalFirstRecord(
  record:
    WorkspaceBootstrapRecord,
  accountId: string,
  fallbackDeviceId: string,
) {
  const table =
    (db as any)[
      record.tableName
    ];

  if (!table) {
    return false;
  }

  const existing =
    await findExistingRecord(
      record.tableName,
      table,
      record,
    );

  const permanentId =
    cleanString(
      existing?.id ||
        record.localId ||
        record.entityId ||
        record.payload?.id ||
        record.id,
    );

  if (!permanentId) {
    throw new Error(
      `Workspace bootstrap record for "${record.tableName}" has no permanent localId.`,
    );
  }

  const incoming = {
    ...cleanIncomingPayload(
      record,
      permanentId,
    ),
    cloudId:
      cleanString(
        record.cloudId ||
          record.payload
            ?.cloudId,
      ) ??
      undefined,
    accountId,
    deviceId:
      record.deviceId ||
      record.payload
        ?.deviceId ||
      fallbackDeviceId,
    version:
      Number(
        record.version ||
          record.payload
            ?.version ||
          1,
      ),
    updatedAt:
      Number(
        record.updatedAt ||
          record.payload
            ?.updatedAt ||
          Date.now(),
      ),
    isDeleted:
      Boolean(
        record.isDeleted ||
        record.payload
          ?.isDeleted,
      ),
    synced:
      SYNC_STATUS_VALUE.SYNCED,
    syncError:
      undefined,
  };

  const currentVersion =
    Number(
      existing?.version ||
        0,
    );

  const currentUpdatedAt =
    Number(
      existing?.updatedAt ||
        0,
    );

  if (
    existing &&
    (
      currentVersion >
        incoming.version ||
      (
        currentVersion ===
          incoming.version &&
        currentUpdatedAt >
          incoming.updatedAt
      )
    )
  ) {
    return false;
  }

  await table.put({
    ...incoming,
    id: permanentId,
  });

  return true;
}

async function applyCacheRecord(
  record: any,
  accountId: string,
) {
  if (
    !record?.tableName ||
    !isBackendCacheTable(
      record.tableName,
    )
  ) {
    return false;
  }

  const table =
    (db as any)[
      record.tableName
    ];

  if (!table) {
    return false;
  }

  const payload = {
    ...(record.payload ||
      {}),
  };

  const id =
    record.id ||
    payload.id ||
    record.id ||
    payload.id ||
    (
      record.tableName ===
      "accounts"
        ? accountId
        : undefined
    );

  if (!id) {
    return false;
  }

  payload.id =
    String(id);

  if (
    !payload.accountId &&
    record.tableName !==
      "subscriptionPlans"
  ) {
    payload.accountId =
      accountId;
  }

  if (record.isDeleted) {
    await table.delete(
      String(id),
    );

    return true;
  }

  await table.put(
    payload,
  );

  return true;
}

async function actualWorkspaceReady(
  accountId: string,
  membership:
    WorkspaceBootstrapMembership,
) {
  const role =
    normalizeRole(
      membership.role,
    );

  const appearanceScope =
    appearanceScopeForRole(role);

  if (
    appearanceScope === "platform" ||
    appearanceScope === "account"
  ) {
    return true;
  }

  const schoolId =
    cleanOptionalId(membership.schoolId);

  const branchId =
    cleanOptionalId(membership.branchId);

  if (!schoolId) {
    return false;
  }

  if (appearanceScope === "school") {
    const schools = await (db as any).schools?.toArray?.() || [];
    return schools.some(
      (row: any) =>
        row.accountId === accountId &&
        !row.isDeleted &&
        String(row.id || row.entityId || "") === schoolId,
    );
  }

  if (!branchId) {
    return false;
  }

  const branchTable =
    (db as any).branches;

  const settingsTable =
    (db as any)
      .schoolBranchSettings;

  if (
    !branchTable ||
    !settingsTable
  ) {
    return false;
  }

  const [
    branches,
    settings,
  ] = await Promise.all([
    branchTable.toArray(),
    settingsTable.toArray(),
  ]);

  const branchExists =
    branches.some(
      (row: any) =>
        row.accountId ===
          accountId &&
        !row.isDeleted &&
        String(row.id || row.entityId || "") === branchId &&
        String(row.schoolId || "") === schoolId,
    );

  const settingsExist =
    settings.some(
      (row: any) =>
        row.accountId ===
          accountId &&
        !row.isDeleted &&
        String(row.schoolId || "") === schoolId &&
        String(row.branchId || "") === branchId,
    );

  return (
    branchExists &&
    settingsExist
  );
}


async function readCommittedWorkspaceSummary(
  accountId: string,
  membership: WorkspaceBootstrapMembership,
) {
  const role = normalizeRole(membership.role);
  const appearanceScope = appearanceScopeForRole(role);
  const schoolId = cleanOptionalId(membership.schoolId);
  const branchId = cleanOptionalId(membership.branchId);

  const [schools, branches, settingsRows] = await Promise.all([
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

  const exactSettings =
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
            (left: any, right: any) =>
              Number(right.updatedAt || 0) - Number(left.updatedAt || 0),
          )[0] || null
      : null;

  const cached = readScopedWorkspaceSettingsCache(accountId, membership);
  const settings = exactSettings ||
    (cached?.appearanceScope === appearanceScope ? cached.settings : null);

  return {
    appearanceScope,
    school,
    branch,
    settings,
    workspace: {
      appearanceScope,
      school,
      branch,
      settings,
      academicPeriod: null,
    },
  };
}

export async function isWorkspaceLocallyReady(
  membership:
    WorkspaceBootstrapMembership,
) {
  const accountId =
    assertAccountId();

  const marker =
    readJson<{
      completedAt?: number;
      bootstrapRevision?: string;
      bootstrapSchemaVersion?: number;
      includedTables?: string[];
    }>(
      storageKey(
        accountId,
        membership,
      ),
    );

  if (
    !marker?.completedAt ||
    marker.bootstrapSchemaVersion !==
      WORKSPACE_BOOTSTRAP_SCHEMA_VERSION
  ) {
    return false;
  }

  const role =
    normalizeRole(
      membership.role,
    );

  if (
    [
      "super_admin",
      "admin",
      "school_admin",
      "branch_admin",
      "accountant",
    ].includes(role)
  ) {
    const included =
      new Set(
        marker.includedTables ||
          [],
      );

    const complete =
      LOCAL_FIRST_SYNC_TABLES.every(
        (table) =>
          included.has(table),
      );

    if (!complete) {
      return false;
    }
  }

  return actualWorkspaceReady(
    accountId,
    membership,
  );
}

export async function bootstrapSelectedWorkspace(
  membership:
    WorkspaceBootstrapMembership,
  options?: {
    force?: boolean;
    allowCached?: boolean;
    onProgress?: (
      progress:
        WorkspaceBootstrapProgress,
    ) => void;
  },
): Promise<WorkspaceBootstrapResult> {
  const accountId =
    assertAccountId();

  const deviceId =
    getDeviceId();

  const role =
    normalizeRole(
      membership.role,
    );

  options?.onProgress?.({
    stage:
      "checking-cache",
    title:
      "Checking saved workspace…",
    detail:
      "Looking for a complete local workspace bundle.",
    percent: 8,
  });

  if (
    options?.allowCached !==
      false &&
    !options?.force &&
    await isWorkspaceLocallyReady(
      membership,
    )
  ) {
    options?.onProgress?.({
      stage: "ready",
      title:
        "Workspace ready",
      detail:
        "Opening from protected offline data.",
      percent: 100,
    });

    const cachedSummary =
      await readCommittedWorkspaceSummary(
        accountId,
        membership,
      );

    return {
      ready: true,
      fromCache: true,
      applied: 0,
      cacheApplied: 0,
      quarantined: 0,
      changedTables: [],
      completedAt: Date.now(),
      appearanceScope:
        cachedSummary.appearanceScope,
      school: cachedSummary.school,
      branch: cachedSummary.branch,
      settings: cachedSummary.settings,
      workspace: cachedSummary.workspace,
    };
  }

  if (
    typeof navigator !==
      "undefined" &&
    !navigator.onLine
  ) {
    throw new Error(
      "This workspace has not finished its first download and the device is offline. Connect to the internet and try again.",
    );
  }

  options?.onProgress?.({
    stage: "requesting",
    title:
      "Preparing workspace…",
    detail:
      "Downloading all permitted workspace data for this role.",
    percent: 18,
  });

  const response =
    await syncHttp<WorkspaceBootstrapResponse>(
      WORKSPACE_BOOTSTRAP_ENDPOINT,
      {
        method: "POST",
        body: {
          accountId,
          deviceId,
          membershipId:
            cleanString(
              membership.id,
            ),
          role,
          schoolId:
            positiveNumber(
              membership.schoolId,
            ),
          branchId:
            positiveNumber(
              membership.branchId,
            ),
          teacherId:
            positiveNumber(
              membership.teacherId,
            ),
          studentId:
            positiveNumber(
              membership.studentId,
            ),
          parentId:
            positiveNumber(
              membership.parentId,
            ),
        },
      },
    );

  if (
    !response?.ok ||
    response.accountId !==
      accountId
  ) {
    throw new Error(
      "The workspace bootstrap response did not match the active account.",
    );
  }

  if (response.truncated) {
    throw new Error(
      "The server returned an incomplete workspace bundle. The portal was not opened.",
    );
  }

  if (
    response.bootstrapSchemaVersion !==
      WORKSPACE_BOOTSTRAP_SCHEMA_VERSION
  ) {
    throw new Error(
      "The server workspace-bootstrap version does not match this application build.",
    );
  }


  const responseWorkspace = {
    ...(response.workspace || {}),
    appearanceScope:
      response.workspace?.appearanceScope ||
      appearanceScopeForRole(role),
    school:
      response.school ??
      response.workspace?.school ??
      null,
    branch:
      response.branch ??
      response.workspace?.branch ??
      null,
    settings:
      response.schoolBranchSettings ??
      response.workspace?.settings ??
      null,
  } satisfies NonNullable<WorkspaceBootstrapResponse["workspace"]>;

  response.workspace = responseWorkspace;
  response.bootstrapRevision =
    response.bootstrapRevision ||
    response.revision;
  response.includedTables =
    response.includedTables ||
    response.requiredTables ||
    [];

  if (
    [
      "super_admin",
      "admin",
      "school_admin",
      "branch_admin",
      "accountant",
    ].includes(role)
  ) {
    const included =
      new Set(
        response.includedTables ||
          [],
      );

    const missing =
      LOCAL_FIRST_SYNC_TABLES.filter(
        (table) =>
          !included.has(table),
      );

    if (missing.length) {
      throw new Error(
        `The workspace response omitted required tables: ${missing.join(", ")}.`,
      );
    }
  }

  options?.onProgress?.({
    stage: "applying",
    title:
      "Applying workspace data…",
    detail:
      "Saving the complete workspace bundle safely.",
    percent: 30,
    current: 0,
    total:
      Number(response.totalRecords || 0),
  });

  const records =
    Array.isArray(
      response.records,
    )
      ? response.records
      : [];

  const cacheRecords =
    Array.isArray(
      response.cacheRecords,
    )
      ? response.cacheRecords
      : [];

  const serverQuarantine =
    Array.isArray(
      response.quarantineRecords,
    )
      ? response.quarantineRecords
      : [];

  let applied = 0;
  let cacheApplied = 0;
  let quarantined = 0;
  let processed = 0;

  const totalToApply = Math.max(
    1,
    Number(response.totalRecords || records.length + cacheRecords.length),
  );

  const emitApplyProgress = () => {
    const ratio = Math.min(1, processed / totalToApply);
    options?.onProgress?.({
      stage: "applying",
      title: "Applying workspace data…",
      detail: `Saved ${processed.toLocaleString()} of ${totalToApply.toLocaleString()} records`,
      percent: Math.min(96, Math.round(48 + ratio * 48)),
      current: processed,
      total: totalToApply,
    });
  };

  const changedTables =
    new Set<string>(
      response.changedTables ||
        [],
    );

  const transactionTables =
    [
      ...new Set([
        ...records.map(
          (record) =>
            record.tableName,
        ),
        ...cacheRecords.map(
          (record) =>
            record.tableName,
        ),
        "syncQuarantine",
      ]),
    ]
      .map(
        (tableName) =>
          (db as any)[
            tableName
          ],
      )
      .filter(Boolean);

  await db.transaction(
    "rw",
    transactionTables,
    async () => {
      for (
        const malformed of
        serverQuarantine
      ) {
        await quarantineSyncRecord({
          source: "pull",
          accountId,
          tableName:
            malformed.record
              ?.tableName,
          entityId:
            malformed.record
              ?.entityId,
          id:
            malformed.record
              ?.id,
          reason:
            malformed.reason ||
            "The backend quarantined a malformed workspace record.",
          payload:
            malformed.record ||
            malformed,
        });

        quarantined += 1;
      }

      for (
        const record of
        records
      ) {
        processed += 1;
        if (processed === 1 || processed % 25 === 0 || processed === totalToApply) {
          emitApplyProgress();
        }

        const integrity =
          validatePullRecord(
            record,
            accountId,
          );

        if (!integrity.ok) {
          await quarantineSyncRecord({
            source: "pull",
            accountId,
            tableName:
              record.tableName,
            entityId:
              record.entityId,
            id:
              record.id,
            reason:
              integrityReason(
                integrity.issues,
              ),
            payload: record,
          });

          quarantined += 1;
          continue;
        }

        if (
          !isSyncTable(
            record.tableName,
          )
        ) {
          continue;
        }

        if (
          await applyLocalFirstRecord(
            record,
            accountId,
            deviceId,
          )
        ) {
          applied += 1;
          changedTables.add(
            record.tableName,
          );
        }
      }

      for (
        const record of
        cacheRecords
      ) {
        processed += 1;
        if (processed === 1 || processed % 25 === 0 || processed === totalToApply) {
          emitApplyProgress();
        }

        if (
          await applyCacheRecord(
            record,
            accountId,
          )
        ) {
          cacheApplied += 1;
          changedTables.add(
            record.tableName,
          );
        }
      }
    },
  );

  const completedAt =
    Date.now();

  writeJson(
    storageKey(
      accountId,
      membership,
    ),
    {
      accountId,
      membershipId:
        membershipId(
          membership,
        ),
      schoolId:
        positiveNumber(
          membership.schoolId,
        ),
      branchId:
        positiveNumber(
          membership.branchId,
        ),
      bootstrapSchemaVersion:
        response.bootstrapSchemaVersion,
      includedTables:
        response.includedTables ||
        [],
      tablesWithRecords:
        response.tablesWithRecords ||
        [],
      bootstrapRevision:
        response.bootstrapRevision,
      changedTables:
        [...changedTables],
      completedAt,
    },
  );

  const committedSummary =
    await readCommittedWorkspaceSummary(
      accountId,
      membership,
    );

  const cacheEnvelope: ScopedWorkspaceSettingsCache = {
    accountId,
    schoolId:
      cleanOptionalId(membership.schoolId) || null,
    branchId:
      cleanOptionalId(membership.branchId) || null,
    role,
    appearanceScope:
      committedSummary.appearanceScope,
    settings:
      committedSummary.settings,
    cachedAt: completedAt,
    bootstrapRevision:
      response.bootstrapRevision,
  };

  writeJson(
    getScopedWorkspaceSettingsKey(
      accountId,
      membership,
    ),
    cacheEnvelope,
  );

  // This pointer is scoped and self-describing. Consumers must still verify
  // account/school/branch/role before treating it as effective settings.
  writeJson(
    CURRENT_WORKSPACE_SETTINGS_KEY,
    cacheEnvelope,
  );

  if (
    changedTables.size
  ) {
    publishSyncPullCompleted({
      accountId,
      changedTables:
        [...changedTables],
    });
  }

  options?.onProgress?.({
    stage: "ready",
    title:
      "Workspace ready",
    detail:
      "All permitted workspace tables have been saved. Opening the selected portal.",
    percent: 100,
    current:
      applied + cacheApplied,
    total:
      Number(response.totalRecords || records.length + cacheRecords.length),
  });

  return {
    ready: true,
    fromCache: false,
    applied,
    cacheApplied,
    quarantined,
    changedTables:
      [...changedTables],
    bootstrapRevision:
      response.bootstrapRevision,
    completedAt,
    appearanceScope:
      committedSummary.appearanceScope,
    school: committedSummary.school,
    branch: committedSummary.branch,
    settings: committedSummary.settings,
    workspace: {
      ...(response.workspace || {}),
      ...committedSummary.workspace,
      academicPeriod:
        response.workspace?.academicPeriod ||
        null,
    },
  };
}

export function clearWorkspaceBootstrapMarker(
  membership:
    WorkspaceBootstrapMembership,
) {
  const accountId =
    assertAccountId();

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem(
      storageKey(
        accountId,
        membership,
      ),
    );
  } catch {}
}