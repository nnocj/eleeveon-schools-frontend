/** Read-only validation and recovery preview for account-scoped Drive archives.
 * This module NEVER writes, clears, or upgrades IndexedDB.
 * Account ID must come from a server-verified active membership/license.
 */
import { decryptSchoolArchive, type EncryptedArchive, type SchoolArchive } from './archive';
import { validateAccountBoundSnapshot } from './backupVerification';
import { assertDriveSnapshotIsolation } from './driveIsolation';

export type ScopedRestorePreview = {
  accountId: string;
  database: string;
  createdAt: string;
  archiveVersion: number;
  localVersion: number;
  storeCount: number;
  recordCount: number;
  stores: { name: string; records: number; existsLocally: boolean; schemaCompatible: boolean }[];
  warnings: string[];
  canRestoreAutomatically: false;
};

function schemaKey(value: string | string[] | null): string { return JSON.stringify(value); }

async function inspectExistingDatabase(name: string): Promise<{
  version: number;
  stores: Map<string, { keyPath: string | string[] | null; autoIncrement: boolean }>;
}> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    throw new Error('IndexedDB database discovery is unavailable; cannot safely inspect restore target.');
  }
  const databases = await indexedDB.databases();
  if (!databases.some(db => db.name === name)) throw new Error('The expected local database does not exist.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Database creation or upgrade is prohibited.')); };
    request.onerror = () => reject(request.error ?? new Error('Could not inspect local database.'));
    request.onblocked = () => reject(new Error('Close other application windows before inspection.'));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const names = Array.from(db.objectStoreNames);
    const stores = new Map<string, { keyPath: string | string[] | null; autoIncrement: boolean }>();
    if (names.length) {
      const tx = db.transaction(names, 'readonly');
      for (const name of names) {
        const store = tx.objectStore(name);
        stores.set(name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement });
      }
    }
    return { version: db.version, stores };
  } finally { db.close(); }
}

export async function previewAccountScopedDriveRestore(args: {
  encryptedFile: string;
  passphrase: string;
  databaseName: string;
  verifiedAccountId: string;
}): Promise<ScopedRestorePreview> {
  if (!args.verifiedAccountId || !args.databaseName) throw new Error('Verified account and database are required.');
  if (args.encryptedFile.length > 250_000_000) throw new Error('Archive exceeds the preview size limit.');
  let envelope: EncryptedArchive;
  try { envelope = JSON.parse(args.encryptedFile) as EncryptedArchive; }
  catch { throw new Error('The selected file is not a valid encrypted archive.'); }
  const archive: SchoolArchive = await decryptSchoolArchive(envelope, args.passphrase);
  validateAccountBoundSnapshot(archive, args.databaseName, args.verifiedAccountId);
  assertDriveSnapshotIsolation(archive, args.verifiedAccountId);
  const local = await inspectExistingDatabase(args.databaseName);
  const warnings: string[] = [];
  if (archive.indexedDBVersion !== local.version) warnings.push('Archive and local IndexedDB versions differ.');
  const stores = archive.tables.map(table => {
    const target = local.stores.get(table.name);
    const schemaCompatible = !!target && schemaKey(target.keyPath) === schemaKey(table.keyPath) && target.autoIncrement === table.autoIncrement;
    if (!target) warnings.push(`Missing local store: ${table.name}`);
    else if (!schemaCompatible) warnings.push(`Schema differs for store: ${table.name}`);
    return { name: table.name, records: table.rows.length, existsLocally: !!target, schemaCompatible };
  });
  const excludedLocal = [...local.stores.keys()].filter(name => !archive.tables.some(t => t.name === name));
  if (excludedLocal.length) warnings.push(`${excludedLocal.length} local stores are absent from this scoped archive; they must not be cleared.`);
  warnings.push('Preview only: no data has been restored. Account-scoped archives must not use the legacy full-database restore routine.');
  return {
    accountId: args.verifiedAccountId,
    database: archive.database,
    createdAt: archive.createdAt,
    archiveVersion: archive.indexedDBVersion,
    localVersion: local.version,
    storeCount: stores.length,
    recordCount: stores.reduce((sum, store) => sum + store.records, 0),
    stores,
    warnings,
    canRestoreAutomatically: false,
  };
}
