import { verifyOfflineGrant, type OfflineGrant, type OfflineGrantBinding } from './verifyOfflineGrant';

/** Offline grant persistence. A stored token is NEVER itself evidence of authorization:
 * every read re-verifies the signature and binding against trusted pinned keys.
 * Storage is per browser profile; it is not hardware-bound or protected from XSS.
 */
const DATABASE = 'EleeveonOfflineAuthorization';
const STORE = 'grants';
const VERSION = 1;

type StoredGrant = { key: string; token: string };

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline authorization database unavailable'));
    request.onblocked = () => reject(new Error('Offline authorization database upgrade blocked'));
  });
}
function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  return openStore().then(db => new Promise<T>((resolve, reject) => {
    let value: T;
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Offline authorization transaction failed')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Offline authorization transaction aborted')); };
    run(tx.objectStore(STORE), result => { value = result; });
  }));
}
function keyFor(binding: OfflineGrantBinding): string {
  for (const field of [binding.accountId, binding.licenseId, binding.installationId, binding.userId]) {
    if (typeof field !== 'string' || !field.trim()) throw new Error('Offline authorization requires a specific account, license, installation and user');
  }
  return JSON.stringify([binding.accountId, binding.licenseId, binding.installationId, binding.userId]);
}
/** Only persist grants that validate under the pinned signing keys. */
export async function saveVerifiedOfflineGrant(token: string, binding: OfflineGrantBinding, publicKeys: Readonly<Record<string, JsonWebKey>>): Promise<OfflineGrant> {
  const verified = await verifyOfflineGrant(token, binding, publicKeys);
  const key = keyFor(binding);
  await transaction<void>('readwrite', (store, done) => {
    const req = store.put({ key, token } satisfies StoredGrant);
    req.onsuccess = () => done(undefined);
  });
  return verified;
}
/** Never trust the IndexedDB value without signature verification on EVERY restoration. */
export async function restoreVerifiedOfflineGrant(binding: OfflineGrantBinding, publicKeys: Readonly<Record<string, JsonWebKey>>): Promise<OfflineGrant | null> {
  const key = keyFor(binding);
  const saved = await transaction<StoredGrant | undefined>('readonly', (store, done) => {
    const req = store.get(key);
    req.onsuccess = () => done(req.result as StoredGrant | undefined);
  });
  if (!saved) return null;
  try {
    return await verifyOfflineGrant(saved.token, binding, publicKeys);
  } catch {
    // Invalid or superseded authorization must not be reused.
    await forgetOfflineGrant(binding);
    return null;
  }
}
/** Call on explicit logout, account removal or confirmed online revocation. */
export async function forgetOfflineGrant(binding: OfflineGrantBinding): Promise<void> {
  const key = keyFor(binding);
  await transaction<void>('readwrite', (store, done) => {
    const req = store.delete(key);
    req.onsuccess = () => done(undefined);
  });
}

/** Remove all grants after explicit logout, including grants for other accounts on this browser profile. */
export async function forgetAllOfflineGrants(): Promise<void> {
  await transaction<void>('readwrite', (store, done) => {
    const req = store.clear();
    req.onsuccess = () => done(undefined);
  });
}
