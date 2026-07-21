
import type Dexie from "dexie";
import { SyncStatus } from "../constants/syncStatus";
import { APP_DB_VERSION } from "./db-version";

export type DatabaseHealthSeverity = "info" | "warning" | "error";

export interface DatabaseHealthIssue {
  code: string;
  severity: DatabaseHealthSeverity;
  message: string;
  tableName?: string;
  recordId?: string | number;
}

export interface DatabaseHealthReport {
  ok: boolean;
  checkedAt: number;
  databaseVersion: number;
  expectedVersion: number;
  tableCount: number;
  pendingRecords: number;
  failedRecords: number;
  issues: DatabaseHealthIssue[];
}

const REQUIRED_STORES = [
  "students",
  "assessmentEntries",
  "schoolBranchSettings",
  "mediaAssets",
  "mediaBlobs",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "migrationJournal",
  "databaseRecoveryBackups",
  "syncQuarantine",
] as const;

const SYNC_TABLES_TO_SAMPLE = [
  "students",
  "teachers",
  "assessmentEntries",
  "computedResults",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "mediaAssets",
] as const;

function recordId(
  record: Record<string, unknown>,
): string | number | undefined {
  const value = record.id;

  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function permanentId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export async function checkDatabaseHealth(
  database: Dexie,
): Promise<DatabaseHealthReport> {
  const issues: DatabaseHealthIssue[] = [];
  const available = new Set(database.tables.map((table) => table.name));

  for (const tableName of REQUIRED_STORES) {
    if (!available.has(tableName)) {
      issues.push({
        code: "MISSING_STORE",
        severity: "error",
        tableName,
        message: `Required IndexedDB store ${tableName} is missing.`,
      });
    }
  }

  if (database.verno !== APP_DB_VERSION) {
    issues.push({
      code: "VERSION_MISMATCH",
      severity: "error",
      message: `Database opened at version ${database.verno}; expected ${APP_DB_VERSION}.`,
    });
  }

  let pendingRecords = 0;
  let failedRecords = 0;

  for (const tableName of SYNC_TABLES_TO_SAMPLE) {
    if (!available.has(tableName)) {
      continue;
    }

    const table = database.table(tableName);

    pendingRecords += await table
      .filter(
        (row: Record<string, unknown>) =>
          row.synced === SyncStatus.PENDING,
      )
      .count();

    failedRecords += await table
      .filter(
        (row: Record<string, unknown>) =>
          row.synced === SyncStatus.FAILED,
      )
      .count();

    const invalid = await table
      .filter((row: Record<string, unknown>) => {
        if (row.isDeleted === true) {
          return false;
        }

        return (
          !permanentId(row.id) ||
          !permanentId(row.accountId) ||
          typeof row.updatedAt !== "number" ||
          row.updatedAt <= 0 ||
          typeof row.version !== "number" ||
          row.version <= 0 ||
          !permanentId(row.deviceId)
        );
      })
      .limit(25)
      .toArray();

    for (const row of invalid as Record<string, unknown>[]) {
      issues.push({
        code: "INVALID_SYNC_IDENTITY",
        severity: "warning",
        tableName,
        recordId: recordId(row),
        message:
          `${tableName} contains a record missing its permanent id, ` +
          "accountId, updatedAt, version, or deviceId.",
      });
    }
  }

  if (available.has("mediaAssets")) {
    const invalidMedia = await database
      .table("mediaAssets")
      .filter((row: Record<string, unknown>) => {
        if (row.isDeleted === true || row.active === false) {
          return false;
        }

        return (
          !permanentId(row.ownerTable) ||
          !permanentId(row.ownerId) ||
          !permanentId(row.fieldKey)
        );
      })
      .limit(50)
      .toArray();

    for (const row of invalidMedia as Record<string, unknown>[]) {
      issues.push({
        code: "INVALID_MEDIA_OWNER",
        severity: "warning",
        tableName: "mediaAssets",
        recordId: recordId(row),
        message:
          "Active media asset has incomplete permanent owner identity.",
      });
    }
  }

  if (
    available.has("reportCardTemplates") &&
    available.has("reportCardTemplateSettings") &&
    available.has("reportCardTemplateAssignments")
  ) {
    const templateIds = new Set<string>(
      (
        await database
          .table("reportCardTemplates")
          .toArray()
      )
        .map((row: Record<string, unknown>) => permanentId(row.id))
        .filter((id): id is string => Boolean(id)),
    );

    const settingIds = new Set<string>(
      (
        await database
          .table("reportCardTemplateSettings")
          .toArray()
      )
        .map((row: Record<string, unknown>) => permanentId(row.id))
        .filter((id): id is string => Boolean(id)),
    );

    const assignments = await database
      .table("reportCardTemplateAssignments")
      .toArray();

    for (const assignment of assignments as Record<string, unknown>[]) {
      if (
        assignment.isDeleted === true ||
        assignment.active === false
      ) {
        continue;
      }

      const templateId = permanentId(assignment.templateId);
      const settingsId = permanentId(
        assignment.templateSettingsId,
      );

      if (!templateId) {
        issues.push({
          code: "MISSING_TEMPLATE_REFERENCE",
          severity: "warning",
          tableName: "reportCardTemplateAssignments",
          recordId: recordId(assignment),
          message:
            "Template assignment is missing its permanent templateId.",
        });
      } else if (!templateIds.has(templateId)) {
        issues.push({
          code: "ORPHAN_TEMPLATE_ASSIGNMENT",
          severity: "warning",
          tableName: "reportCardTemplateAssignments",
          recordId: recordId(assignment),
          message: `Template assignment points to missing template ${templateId}.`,
        });
      }

      if (!settingsId) {
        issues.push({
          code: "MISSING_TEMPLATE_SETTINGS_REFERENCE",
          severity: "warning",
          tableName: "reportCardTemplateAssignments",
          recordId: recordId(assignment),
          message:
            "Template assignment is missing its permanent templateSettingsId.",
        });
      } else if (!settingIds.has(settingsId)) {
        issues.push({
          code: "ORPHAN_TEMPLATE_SETTINGS",
          severity: "warning",
          tableName: "reportCardTemplateAssignments",
          recordId: recordId(assignment),
          message: `Template assignment points to missing settings ${settingsId}.`,
        });
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    checkedAt: Date.now(),
    databaseVersion: database.verno,
    expectedVersion: APP_DB_VERSION,
    tableCount: database.tables.length,
    pendingRecords,
    failedRecords,
    issues,
  };
}