/**
 * Destructive local IndexedDB restore, strictly scoped to a verified Independent account.
 * This does NOT restore external native media folders. This is not an inter-device sync.
 * The caller must require a fresh owner authentication and close other application windows.
 */
import { captureSchoolDatabase } from './databaseSnapshot';
import { decryptSchoolArchive, type EncryptedArchive, type SchoolArchive, type TableArchive } from './archive';
import { validateAccountBoundSnapshot } from './backupVerification';
import { backupIndependentToFolder } from './folderBackup';
import { decodeIDB } from './restoreCodec';

type DirectoryHandle = Parameters<typeof backupIndependentToFolder>[0]['folder'];
export type RestorePreview = { database: string; accountId: string; stores: number; records: number; createdAt: string; version: number };

function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??new Error('IndexedDB operation failed'));}); }
function complete(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Restore transaction aborted; existing data preserved'));tx.onerror=()=>reject(tx.error??new Error('Restore transaction failed; existing data preserved'));});}
function validKeyPath(k: string | string[] | null): string {return JSON.stringify(k);}

/** No database creation or schema upgrades allowed while restoring. */
async function openExistingDatabase(name:string):Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined' || typeof indexedDB.databases!=='function')throw new Error('Cannot safely discover an existing IndexedDB database on this device');
 if(!(await indexedDB.databases()).some(x=>x.name===name)) throw new Error('The local school database does not exist');
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(name);
  req.onupgradeneeded=()=>{req.transaction?.abort();reject(new Error('Restore cannot create or upgrade a database'));};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error??new Error('Database could not open'));
  req.onblocked=()=>reject(new Error('Database is in use by another window'));
 });
}

export function assertExactRestoreSchema(backup:SchoolArchive, live:{version:number; tables:{name:string;keyPath:string|string[]|null;autoIncrement:boolean}[]}):void{
 if(backup.indexedDBVersion!==live.version)throw new Error('Backup and installed database schema versions differ; a migration is required');
 if(backup.tables.length!==live.tables.length)throw new Error('Backup and installed database store counts differ');
 const current=new Map(live.tables.map(table=>[table.name,table]));
 for(const stored of backup.tables){
  const target=current.get(stored.name);
  if(!target || validKeyPath(stored.keyPath)!==validKeyPath(target.keyPath) || stored.autoIncrement!==target.autoIncrement)
   throw new Error(`Schema mismatch: ${stored.name}. No records were changed.`);
 }
}
function readLiveSchema(db:IDBDatabase):{version:number;tables:{name:string;keyPath:string|string[]|null;autoIncrement:boolean}[]}{
 const names=Array.from(db.objectStoreNames);
 const tx=db.transaction(names,'readonly');
 const tables=names.map(name=>{const s=tx.objectStore(name);return {name,keyPath:s.keyPath,autoIncrement:s.autoIncrement};});
 return {version:db.version,tables};
}
export async function decryptBoundRestoreArchive(fileContents:string, passphrase:string, databaseName:string, accountId:string):Promise<SchoolArchive>{
 if(fileContents.length>1_000_000_000)throw new Error('Backup is too large to restore in memory');
 let encrypted:EncryptedArchive;
 try{encrypted=JSON.parse(fileContents) as EncryptedArchive;}catch{throw new Error('Not a valid Eleeveon encrypted backup');}
 const snapshot=await decryptSchoolArchive(encrypted,passphrase);
 validateAccountBoundSnapshot(snapshot,databaseName,accountId);
 return snapshot;
}
export async function previewIndependentRestore(args:{encryptedFile:string;passphrase:string;databaseName:string;accountId:string}):Promise<RestorePreview>{
 const snapshot=await decryptBoundRestoreArchive(args.encryptedFile,args.passphrase,args.databaseName,args.accountId);
 const db=await openExistingDatabase(args.databaseName);
 try{assertExactRestoreSchema(snapshot,readLiveSchema(db));}finally{db.close();}
 const recordCount=snapshot.tables.reduce((sum,t)=>sum+t.rows.length,0);
 return {database:snapshot.database,accountId:args.accountId,stores:snapshot.tables.length,records:recordCount,createdAt:snapshot.createdAt,version:snapshot.indexedDBVersion};
}

/** A single readwrite transaction either commits every store or rolls them all back. */
async function replaceAllStores(db:IDBDatabase, tables:TableArchive[]):Promise<void>{
 const allNames=tables.map(t=>t.name);
 // Decode before starting a transaction: asynchronous decode would allow IndexedDB to auto-commit.
 const decoded = await Promise.all(tables.map(async table => ({
  name: table.name, keyPath: table.keyPath,
  rows: await Promise.all(table.rows.map(async row => ({
   key: await decodeIDB(row.key), value: await decodeIDB(row.value)
  })))
 })));
 const tx=db.transaction(allNames,'readwrite',{ durability: 'strict' });
 const finished=complete(tx);
 try{
  for(const t of decoded)tx.objectStore(t.name).clear();
  for(const t of decoded){
   const store=tx.objectStore(t.name);
   for(const row of t.rows){
    // Inline key stores derive primary keys from the record; explicit keys there throw DataError.
    if(t.keyPath===null)store.put(row.value,row.key as IDBValidKey);
    else store.put(row.value);
   }
  }
 }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
 await finished;
}

/**
 * Restore requires a verified safety backup written AND read back to a user-selected folder.
 * The app must be quiescent. If another tab writes during restoration, that write must be
 * prevented at the app level; this module cannot coordinate third-party open tabs.
 */
export async function restoreIndependentFromBackup(args:{
 encryptedFile:string;oldPassphrase:string;databaseName:string;accountId:string;
 safetyFolder:DirectoryHandle;safetyPassphrase:string;confirmedPhrase:string;
}):Promise<{restoredRecords:number;safetyBackup:string}> {
 if(args.confirmedPhrase!=='RESTORE SCHOOL DATABASE')throw new Error('Explicit restore confirmation is required');
 // Repeated validation is intentional: never rely on a previous UI preview.
 const snapshot=await decryptBoundRestoreArchive(args.encryptedFile,args.oldPassphrase,args.databaseName,args.accountId);
 const lockName=`eleeveon-restore:${args.databaseName}`;
 const locks=typeof navigator!=='undefined'?navigator.locks:null;
 if(!locks)throw new Error('Exclusive browser lock support is required for restoration');
 return locks.request(lockName,{mode:'exclusive'},async()=>{
  const db=await openExistingDatabase(args.databaseName);
  try{assertExactRestoreSchema(snapshot,readLiveSchema(db));}finally{db.close();}
  // No destructive action until a verified, account-bound safety backup exists.
  const safety=await backupIndependentToFolder({databaseName:args.databaseName,accountId:args.accountId,passphrase:args.safetyPassphrase,folder:args.safetyFolder});
  if(!safety.verified)throw new Error('Safety backup failed verification');
  const writer=await openExistingDatabase(args.databaseName);
  try{
   assertExactRestoreSchema(snapshot,readLiveSchema(writer));
   await replaceAllStores(writer,snapshot.tables);
  }finally{writer.close();}
  return {restoredRecords:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),safetyBackup:safety.filename};
 });
}
