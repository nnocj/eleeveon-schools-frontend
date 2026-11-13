/** Readonly preflight. Never opens or creates an unknown school database. */
import { APP_DB_NAME } from '../db/db-version';
export type DatabaseReadiness = { available: boolean; name: string; version: number | null; storeCount: number; reason?: string };
export async function checkIndependentSchoolDatabase(): Promise<DatabaseReadiness> {
  const base: DatabaseReadiness = {available:false,name:APP_DB_NAME,version:null,storeCount:0};
  if(typeof indexedDB==='undefined') return {...base,reason:'IndexedDB not available on this device'};
  // Cannot safely discover missing DB on engines without indexedDB.databases().
  if(typeof indexedDB.databases!=='function') return {...base,reason:'This runtime cannot safely confirm the school database exists'};
  try {
    const known=await indexedDB.databases();
    if(!known.some(item=>item.name===APP_DB_NAME)) return {...base,reason:'The real EleeveonDB has not been initialized on this device'};
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(APP_DB_NAME);
      request.onupgradeneeded=()=>{request.transaction?.abort();reject(new Error('Refusing to create an absent database'));};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error??new Error('Database could not be opened'));
      request.onblocked=()=>reject(new Error('Close other windows and retry'));
    });
    try {
      const count=database.objectStoreNames.length;
      return {name:APP_DB_NAME,available:count>0,version:database.version,storeCount:count,reason:count>0?undefined:'Database contains no stores'};
    }finally{database.close();}
  }catch(error){return {...base,reason:error instanceof Error?error.message:'Database inspection failed'};}
}
