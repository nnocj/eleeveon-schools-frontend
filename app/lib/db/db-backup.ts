import {
  APP_DB_NAME,
  APP_DB_VERSION,
  RECOVERY_BACKUP_STORE,
  RECOVERY_DB_NAME,
  RECOVERY_DB_VERSION,
} from "./db-version";

export interface RecoveryTableSnapshot {
  tableName: string;
  records: unknown[];
}

export interface ExternalDatabaseBackup {
  id: string;
  databaseName: string;
  sourceVersion: number;
  targetVersion: number;
  createdAt: number;
  completedAt?: number;
  status: "creating" | "completed" | "failed";
  tables: RecoveryTableSnapshot[];
  recordCount: number;
  accountIds: string[];
  storageEntries: Record<string, string>;
  error?: string;
}

const CRITICAL_TABLES = [
  "students",
  "teachers",
  "parents",
  "assessmentEntries",
  "computedResults",
  "attendance",
  "teacherAttendance",
  "reportCards",
  "reportCardItems",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "studentReportSnapshots",
  "studentPromotions",
  "payments",
  "incomes",
  "expenses",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "mediaAssets",
  "mediaBlobs",
] as const;

const SYNC_STATE_KEY_PARTS = [
  "last_sync",
  "last_platform_cache",
  "sync_lock",
  "bootstrap",
  "account_id",
  "device_id",
] as const;

function readRelevantStorageEntries() {
  const entries: Record<string, string> = {};
  if (typeof window === "undefined") return entries;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const normalized = key.toLowerCase();
      if (!normalized.includes("eleeveon")) continue;
      if (!SYNC_STATE_KEY_PARTS.some((part) => normalized.includes(part))) continue;
      const value = storage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }

  return entries;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

async function databaseExists(name: string) {
  if (!("databases" in indexedDB)) return true;
  const databases = await indexedDB.databases();
  return databases.some((item) => item.name === name);
}

async function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
  if (!(await databaseExists(name))) return null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let createdByMistake = false;

    request.onupgradeneeded = (event) => {
      // The database did not exist on browsers without indexedDB.databases().
      createdByMistake = (event as IDBVersionChangeEvent).oldVersion === 0;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (createdByMistake) {
        request.result.close();
        indexedDB.deleteDatabase(name);
        resolve(null);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => {
      if (request.error?.name === "AbortError" && createdByMistake) resolve(null);
      else reject(request.error || new Error(`Failed to open ${name}`));
    };
  });
}

async function openRecoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECOVERY_BACKUP_STORE)) {
        const store = database.createObjectStore(RECOVERY_BACKUP_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("status", "status");
        store.createIndex("databaseName", "databaseName");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open recovery database"));
  });
}

async function readTable(database: IDBDatabase, tableName: string): Promise<unknown[]> {
  if (!database.objectStoreNames.contains(tableName)) return [];
  const transaction = database.transaction(tableName, "readonly");
  const request = transaction.objectStore(tableName).getAll();
  const records = await requestResult(request);
  await transactionDone(transaction);
  return records;
}

async function saveBackup(backup: ExternalDatabaseBackup) {
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(RECOVERY_BACKUP_STORE, "readwrite");
    transaction.objectStore(RECOVERY_BACKUP_STORE).put(backup);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

function accountIdsFromTables(tables: RecoveryTableSnapshot[]) {
  const values = new Set<string>();
  for (const table of tables) {
    for (const record of table.records) {
      const accountId = (record as { accountId?: unknown } | null)?.accountId;
      if (typeof accountId === "string" && accountId) values.add(accountId);
    }
  }
  return [...values];
}

/**
 * Creates an external, structured-clone backup before Dexie opens/upgrades.
 * Blob values from mediaBlobs are preserved because the backup is another
 * IndexedDB database, not JSON/localStorage.
 */
export async function createPreUpgradeBackup(): Promise<ExternalDatabaseBackup | null> {
  if (typeof indexedDB === "undefined") return null;

  const source = await openExistingDatabase(APP_DB_NAME);
  if (!source) return null;

  const sourceVersion = source.version;
  if (sourceVersion >= APP_DB_VERSION) {
    source.close();
    return null;
  }

  const id = `${APP_DB_NAME}:v${sourceVersion}-to-v${APP_DB_VERSION}:${Date.now()}`;
  const backup: ExternalDatabaseBackup = {
    id,
    databaseName: APP_DB_NAME,
    sourceVersion,
    targetVersion: APP_DB_VERSION,
    createdAt: Date.now(),
    status: "creating",
    tables: [],
    recordCount: 0,
    accountIds: [],
    storageEntries: readRelevantStorageEntries(),
  };

  try {
    await saveBackup(backup);

    const captured = new Set<string>();

    for (const tableName of CRITICAL_TABLES) {
      const records = await readTable(source, tableName);
      backup.tables.push({ tableName, records });
      backup.recordCount += records.length;
      captured.add(tableName);
    }

    // Preserve unsynced work from every other application store. SyncStatus is
    // numeric in this app: PENDING=0 and FAILED=2.
    for (const tableName of Array.from(source.objectStoreNames)) {
      if (captured.has(tableName)) continue;
      const records = await readTable(source, tableName);
      const unsynced = records.filter((record) => {
        const status = (record as { synced?: unknown } | null)?.synced;
        return status === 0 || status === 2 || status === "pending" || status === "failed";
      });
      if (!unsynced.length) continue;
      backup.tables.push({ tableName, records: unsynced });
      backup.recordCount += unsynced.length;
    }

    backup.accountIds = accountIdsFromTables(backup.tables);
    backup.status = "completed";
    backup.completedAt = Date.now();
    await saveBackup(backup);
    return backup;
  } catch (error) {
    backup.status = "failed";
    backup.completedAt = Date.now();
    backup.error = error instanceof Error ? error.message : String(error);
    await saveBackup(backup).catch(() => undefined);
    throw error;
  } finally {
    source.close();
  }
}

export async function listRecoveryBackups(): Promise<ExternalDatabaseBackup[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(RECOVERY_BACKUP_STORE, "readonly");
    const backups = await requestResult(
      transaction.objectStore(RECOVERY_BACKUP_STORE).getAll(),
    );
    await transactionDone(transaction);
    return backups.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    database.close();
  }
}