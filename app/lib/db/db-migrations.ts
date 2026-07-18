import type { Transaction } from "dexie";
import { APP_DB_MIGRATION_NAME, APP_DB_VERSION } from "./db-version";

export type MigrationStatus = "running" | "completed" | "failed";

export interface LocalMigrationJournal {
  id?: number;
  version: number;
  name: string;
  startedAt: number;
  completedAt?: number;
  status: MigrationStatus;
  error?: string;
  details?: Record<string, unknown>;
}

export interface DatabaseRecoveryBackup {
  id: string;
  databaseName: string;
  sourceVersion: number;
  targetVersion: number;
  createdAt: number;
  completedAt?: number;
  status: "creating" | "completed" | "failed";
  accountIds: string[];
  tableNames: string[];
  recordCount: number;
  byteEstimate?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncQuarantineRecord {
  id?: number;
  accountId?: string;
  tableName: string;
  localId?: number;
  cloudId?: string;
  reason: string;
  payload?: unknown;
  source: "migration" | "pull" | "push" | "health-check" | "manual";
  quarantinedAt: number;
  resolvedAt?: number;
  resolution?: string;
}

/** Local-only stores added in version 39. */
export const LOCAL_PROTECTION_STORES: Record<string, string> = {
  migrationJournal: "++id,&[version+name],version,status,startedAt,completedAt",
  databaseRecoveryBackups:
    "&id,databaseName,sourceVersion,targetVersion,status,createdAt,completedAt",
  syncQuarantine:
    "++id,accountId,tableName,localId,cloudId,source,quarantinedAt,resolvedAt",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown migration error");
}

/**
 * Safe version 39 migration.
 *
 * This migration intentionally performs no destructive bulk rewrite. It adds
 * protection stores and applies only compatibility defaults to small metadata
 * tables. Existing school records and local media blobs remain untouched.
 */
export async function runVersion39Migration(transaction: Transaction) {
  const startedAt = Date.now();
  const journalTable = transaction.table("migrationJournal");

  const journalId = await journalTable.add({
    version: APP_DB_VERSION,
    name: APP_DB_MIGRATION_NAME,
    startedAt,
    status: "running",
    details: {
      strategy: "additive",
      preservesExistingStores: true,
    },
  } satisfies LocalMigrationJournal);

  try {
    // Compatibility defaults only. Avoid touching large operational tables.
    const templateTables = [
      "reportCardTemplates",
      "reportCardTemplateSettings",
      "reportCardTemplateAssignments",
    ];

    for (const tableName of templateTables) {
      const table = transaction.table(tableName);
      await table.toCollection().modify((row: Record<string, unknown>) => {
        if (!row.reportType) row.reportType = "student_report";
        if (row.active === undefined) row.active = true;
      });
    }

    await transaction
      .table("mediaAssets")
      .toCollection()
      .modify((row: Record<string, unknown>) => {
        if (row.active === undefined) row.active = !row.isDeleted;
        if (!row.remoteUrl && row.publicUrl) row.remoteUrl = row.publicUrl;
        if (!row.publicUrl && row.remoteUrl) row.publicUrl = row.remoteUrl;
      });

    await journalTable.update(journalId, {
      status: "completed",
      completedAt: Date.now(),
    } satisfies Partial<LocalMigrationJournal>);
  } catch (error) {
    // Dexie will abort the upgrade transaction. The external recovery backup
    // created by DatabaseBootstrap remains available for diagnosis/recovery.
    await journalTable.update(journalId, {
      status: "failed",
      completedAt: Date.now(),
      error: errorMessage(error),
    } satisfies Partial<LocalMigrationJournal>);
    throw error;
  }
}