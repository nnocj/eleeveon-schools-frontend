/** Conservative, atomic account-scoped restore for empty target stores only.
 * Never clears stores or overwrites existing records. Requires verified Owner reauthentication.
 * Keep other application tabs closed during recovery.
 */
import { decryptSchoolArchive, type EncryptedArchive, type Encoded } from './archive';
import { validateAccountBoundSnapshot } from './backupVerification';
import { assertDriveSnapshotIsolation } from './driveIsolation';
import { previewAccountScopedDriveRestore } from './scopedRestorePreview';

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function decode(value: Encoded): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const obj = value as Record<string, any>;
  if (typeof obj.__eleeveonType === 'string') {
    switch (obj.__eleeveonType) {
      case 'undefined': return undefined;
      case 'bigint': return BigInt(obj.value);
      case 'date': return new Date(obj.value);
      case 'blob': return new Blob([new Uint8Array(fromBase64(obj.data))], { type: obj.mime || '' });
      case 'bytes': {
        const bytes = fromBase64(obj.data);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (obj.ctor === 'ArrayBuffer') return buffer;
        const constructors: Record<string, any> = {
          Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
          Float32Array, Float64Array, Uint8ClampedArray, DataView,
          ...(typeof BigInt64Array !== 'undefined' ? { BigInt64Array, BigUint64Array } : {}),
        };
        const ctor = constructors[obj.ctor];
        if (!ctor) throw new Error(`Unsupported binary type: ${obj.ctor}`);
        return new ctor(buffer);
      }
      case 'map': return new Map(obj.entries.map(([k, v]: any[]) => [decode(k), decode(v)]));
      case 'set': return new Set(obj.values.map(decode));
      default: throw new Error(`Unsupported archive type: ${obj.__eleeveonType}`);
    }
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) result[key] = decode(entry);
  return result;
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}
function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Restore transaction rolled back'));
    tx.onerror = () => reject(tx.error || new Error('Restore transaction failed'));
  });
}
async function openExisting(name: string): Promise<IDBDatabase> {
  if (!name || typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    throw new Error('Safe IndexedDB discovery is unavailable');
  }
  if (!(await indexedDB.databases()).some(item => item.name === name)) throw new Error('Local database is missing');
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => { req.transaction?.abort(); reject(new Error('Database creation/upgrade is prohibited')); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Cannot open local database'));
    req.onblocked = () => reject(new Error('Close other application tabs'));
  });
}
export type ScopedRestoreResult = { inserted: number; stores: number; mode: 'empty-stores-only' };
/**
 * This is a deliberately restricted recovery operation. The caller MUST provide
 * a server-verified Owner account ID and a fresh reauthentication callback.
 * The caller MUST ensure the user has saved an independently verified safety
 * backup before calling this function. No legacy replace/clear path is used.
 */
export async function restoreAccountScopedIntoEmptyStores(args: {
  encryptedFile: string;
  passphrase: string;
  databaseName: string;
  verifiedAccountId: string;
  reauthenticateOwner: () => Promise<boolean>;
  safetyBackupConfirmed: boolean;
  confirmation: string;
}): Promise<ScopedRestoreResult> {
  if (!args.safetyBackupConfirmed) throw new Error('Export and verify a separate safety backup before restoring');
  if (args.confirmation !== 'RESTORE EMPTY STORES') throw new Error('Explicit restore confirmation is required');
  if (!args.verifiedAccountId || !(await args.reauthenticateOwner())) throw new Error('Fresh Owner reauthentication failed');
  const preview = await previewAccountScopedDriveRestore(args);
  if (preview.stores.some(store => !store.schemaCompatible)) throw new Error('Restore blocked: incompatible or missing store');
  if (args.encryptedFile.length > 250_000_000) throw new Error('Backup is too large');
  const archive = await decryptSchoolArchive(JSON.parse(args.encryptedFile) as EncryptedArchive, args.passphrase);
  validateAccountBoundSnapshot(archive, args.databaseName, args.verifiedAccountId);
  assertDriveSnapshotIsolation(archive, args.verifiedAccountId);
  // Decode before starting an IndexedDB transaction; async work would otherwise auto-close it.
  const prepared = archive.tables.map(table => ({
    name: table.name,
    keyPath: table.keyPath,
    autoIncrement: table.autoIncrement,
    rows: table.rows.map(row => ({ key: decode(row.key), value: decode(row.value) })),
  }));
  const database = await openExisting(args.databaseName);
  try {
    const names = prepared.map(table => table.name);
    if (!names.length) throw new Error('Empty archive');
    // One readwrite transaction covers BOTH empty-store verification and insertion.
    // A concurrent writer cannot interleave writes to these stores.
    const tx = database.transaction(names, 'readwrite');
    const done = finished(tx);
    try {
      for (const table of prepared) {
        const store = tx.objectStore(table.name);
        if (JSON.stringify(store.keyPath) !== JSON.stringify(table.keyPath) || store.autoIncrement !== table.autoIncrement) {
          throw new Error(`Store schema changed: ${table.name}`);
        }
        const count = await request(store.count());
        if (count !== 0) throw new Error(`Restore blocked: ${table.name} contains ${count} existing records; no records were overwritten`);
      }
      for (const table of prepared) {
        const store = tx.objectStore(table.name);
        for (const row of table.rows) {
          // Inline-key stores must not receive an explicit key.
          if (table.keyPath === null) store.add(row.value, row.key as IDBValidKey);
          else store.add(row.value);
        }
      }
      await done;
    } catch (error) {
      try { tx.abort(); } catch { /* already aborted or committed */ }
      await done.catch(() => undefined);
      throw error;
    }
    return { inserted: prepared.reduce((sum, table) => sum + table.rows.length, 0), stores: prepared.length, mode: 'empty-stores-only' };
  } finally { database.close(); }
}
