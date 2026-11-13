/** Read-only native school snapshot inspection. Never restores or modifies live IndexedDB. */
import { APP_DB_NAME } from '../db/db-version';
import { getIndependentNativeBridge } from './nativeBridge';
import { verifyOfflineLicense } from './offlineLicense';
import { IS_INDEPENDENT_RUNTIME, ELEEVEON_RUNTIME } from './runtimeMode';

type NativeSnapshotResult = {
  accountId: string; database: string; sha256: string; bytes: number;
  previous: boolean; createdAt: string; indexedDBVersion: number; stores: number; records: number;
};
type Bridge = NonNullable<ReturnType<typeof getIndependentNativeBridge>> & {
  loadEncryptedDatabaseSnapshot(options: {previous:boolean}): Promise<NativeSnapshotResult>;
};
export type NativeRecoveryPreview = {
  accountId: string; database: string; sha256: string; previous: boolean; createdAt: string;
  indexedDBVersion: number; stores: number; records: number;
  liveDatabasePresent: boolean; liveIndexedDBVersion: number | null;
  compatibility: 'ready-for-manual-recovery-review' | 'schema-version-differs' | 'live-database-missing';
};

function knownAccount(value: string): boolean { return /^[\w.:-]{1,160}$/.test(value); }

export async function inspectNativeSchoolSnapshot(accountId: string, previous = false): Promise<NativeRecoveryPreview> {
  if (!IS_INDEPENDENT_RUNTIME) throw new Error('Native recovery is available only in Independent mode');
  if (!knownAccount(accountId)) throw new Error('Invalid school account');
  const bridge = getIndependentNativeBridge() as Bridge | null;
  if (!bridge || typeof bridge.loadEncryptedDatabaseSnapshot !== 'function') throw new Error('Native snapshot recovery bridge is unavailable');
  const [installationId, boundAccount, certificate, publicKeys] = await Promise.all([
    bridge.getInstallationId(), bridge.getLicensedAccountId(),
    bridge.loadOfflineLicense(), bridge.loadPinnedIssuerPublicKeys(),
  ]);
  if (!certificate || boundAccount !== accountId) throw new Error('Current signed license does not authorize this school');
  await verifyOfflineLicense({envelope:certificate,publicKeys,expectedAccountId:accountId,
    expectedInstallationId:installationId,expectedEdition:ELEEVEON_RUNTIME as 'independent_essentials'|'independent_multi_device',appMajorVersion:1});
  const result = await bridge.loadEncryptedDatabaseSnapshot({previous});
  if (result.accountId !== accountId || result.database !== APP_DB_NAME || result.previous !== previous) throw new Error('Native recovery metadata mismatch');
  if (!/^[a-f\d]{64}$/i.test(result.sha256) || !Number.isSafeInteger(result.bytes) || result.bytes <= 0 || result.bytes > 50*1024*1024) throw new Error('Native recovery metadata is invalid');
  if (!Number.isInteger(result.indexedDBVersion) || result.indexedDBVersion < 1 || !Number.isSafeInteger(result.stores) || result.stores < 1 || !Number.isSafeInteger(result.records) || result.records < 0) throw new Error('Snapshot metadata is invalid');
  let liveDatabasePresent = false;
  let liveIndexedDBVersion: number | null = null;
  if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
    liveDatabasePresent = (await indexedDB.databases()).some(x=>x.name===APP_DB_NAME);
    if (liveDatabasePresent) {
      const db = await new Promise<IDBDatabase>((resolve,reject)=>{
        const req = indexedDB.open(APP_DB_NAME);
        req.onupgradeneeded = ()=>{req.transaction?.abort();reject(new Error('Cannot create or upgrade the database during inspection'));};
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error||new Error('Unable to inspect local database'));
        req.onblocked=()=>reject(new Error('Another window is blocking the database'));
      });
      liveIndexedDBVersion=db.version;
      db.close();
    }
  }
  const compatibility = !liveDatabasePresent ? 'live-database-missing' : liveIndexedDBVersion === result.indexedDBVersion ? 'ready-for-manual-recovery-review' : 'schema-version-differs';
  return {accountId,database:APP_DB_NAME,sha256:result.sha256.toLowerCase(),previous,createdAt:result.createdAt,
    indexedDBVersion:result.indexedDBVersion,stores:result.stores,records:result.records,liveDatabasePresent,liveIndexedDBVersion,compatibility};
}
