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
  entityId?: string;
  reason: string;
  payload?: unknown;
  source: "pull" | "push" | "health-check" | "manual";
  quarantinedAt: number;
  resolvedAt?: number;
  resolution?: string;
}

export const LOCAL_PROTECTION_STORES: Record<string, string> = {
  migrationJournal: "++id,&[version+name],version,status,startedAt,completedAt",
  databaseRecoveryBackups: "&id,databaseName,sourceVersion,targetVersion,status,createdAt,completedAt",
  syncQuarantine: "++id,accountId,tableName,entityId,source,quarantinedAt,resolvedAt",
};
