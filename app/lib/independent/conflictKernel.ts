/**
 * Eleeveon Independent Multi-Device — deterministic, transport-neutral conflict core.
 * No network activity, cloud dependency, storage writes or automatic deletions.
 * This is a review/merge kernel, not a complete LAN sync implementation.
 */
export type VersionVector = Record<string, number>;
export type JournalMutation<T = unknown> = {
  accountId: string;
  table: string;
  recordId: string;
  changeId: string;
  deviceId: string;
  clock: VersionVector;
  deleted: boolean;
  value: T | null;
};
export type CompareResult = 'equal' | 'before' | 'after' | 'concurrent';
export type MergeResult<T = unknown> =
  | { status: 'applied'; record: JournalMutation<T>; explanation: string }
  | { status: 'ignored'; record: JournalMutation<T>; explanation: string }
  | { status: 'conflict'; local: JournalMutation<T>; incoming: JournalMutation<T>; explanation: string };

const ID=/^[a-zA-Z0-9._:@-]{1,150}$/;
function own(o:object,key:string):boolean{return Object.prototype.hasOwnProperty.call(o,key);}
/** Avoid arbitrary object keys like __proto__ and negative counters in serialised vectors. */
export function validateVector(vector:VersionVector):void{
  if(!vector || typeof vector!=='object' || Array.isArray(vector))throw Error('Invalid vector clock');
  for(const [device,count] of Object.entries(vector)){
    if(!ID.test(device)||device==='__proto__'||device==='constructor'||device==='prototype')throw Error('Invalid device ID');
    if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid clock counter');
  }
}
export function compareVectors(a:VersionVector,b:VersionVector):CompareResult{
  validateVector(a);validateVector(b);
  let earlier=false,later=false;
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const key of keys){const left=a[key]??0,right=b[key]??0;if(left<right)earlier=true;if(left>right)later=true;}
  return earlier&&later?'concurrent':earlier?'before':later?'after':'equal';
}
export function incrementVector(vector:VersionVector,deviceId:string):VersionVector{
  validateVector(vector);
  if(!ID.test(deviceId)||['__proto__','constructor','prototype'].includes(deviceId))throw Error('Invalid device ID');
  const current=own(vector,deviceId)?vector[deviceId]:0;
  if(current>=Number.MAX_SAFE_INTEGER)throw Error('Vector counter exhausted');
  return {...vector,[deviceId]:current+1};
}
export function combineVectors(a:VersionVector,b:VersionVector):VersionVector{
  validateVector(a);validateVector(b);
  const result:VersionVector=Object.create(null);
  for(const id of new Set([...Object.keys(a),...Object.keys(b)]))result[id]=Math.max(a[id]??0,b[id]??0);
  return result;
}
export function validateMutation<T>(mutation:JournalMutation<T>):void{
  for(const field of ['accountId','table','recordId','changeId','deviceId'] as const){
    if(typeof mutation?.[field]!=='string'||!ID.test(mutation[field])||['__proto__','constructor','prototype'].includes(mutation[field]))throw Error(`Invalid ${field}`);
  }
  if(typeof mutation.deleted!=='boolean')throw Error('Invalid deletion flag');
  if(mutation.deleted ? mutation.value!==null : mutation.value===undefined || mutation.value===null)throw Error('Invalid tombstone or record value');
  validateVector(mutation.clock);
  if((mutation.clock[mutation.deviceId]??0)<1)throw Error('Origin device has no change counter');
}
/** A server or trusted native layer must validate authenticated device membership before calling this kernel. */
export function mergeChanges<T>(local:JournalMutation<T>,incoming:JournalMutation<T>):MergeResult<T>{
  validateMutation(local);validateMutation(incoming);
  if(local.accountId!==incoming.accountId || local.table!==incoming.table || local.recordId!==incoming.recordId)throw Error('Cross-account or cross-record merge rejected');
  const comparison=compareVectors(local.clock,incoming.clock);
  if(comparison==='before')return {status:'applied',record:incoming,explanation:'Incoming edit causally succeeds local edit'};
  if(comparison==='after')return {status:'ignored',record:local,explanation:'Incoming edit is older'};
  if(comparison==='equal'){
    // Equal vector clocks are only safe to deduplicate when they name the same mutation.
    if(local.changeId===incoming.changeId && local.deviceId===incoming.deviceId && local.deleted===incoming.deleted && JSON.stringify(local.value)===JSON.stringify(incoming.value))return {status:'ignored',record:local,explanation:'Same change already applied'};
    return {status:'conflict',local,incoming,explanation:'Same clock but inconsistent contents: possible corruption or duplicate origin'};
  }
  return {status:'conflict',local,incoming,explanation:'Concurrent edits require authorized resolution; deletion is never silently applied'};
}
/** Explicit authorized resolution after displaying both conflicting records. */
export function resolveConflict<T>(local:JournalMutation<T>,incoming:JournalMutation<T>,resolution:{deviceId:string;changeId:string;deleted:boolean;value:T|null}):JournalMutation<T>{
  const merged=mergeChanges(local,incoming);
  if(merged.status!=='conflict')throw Error('No conflict to resolve');
  const mergedClock=combineVectors(local.clock,incoming.clock);
  const output:JournalMutation<T>={accountId:local.accountId,table:local.table,recordId:local.recordId,deviceId:resolution.deviceId,changeId:resolution.changeId,deleted:resolution.deleted,value:resolution.value,clock:incrementVector(mergedClock,resolution.deviceId)};
  validateMutation(output);
  if(output.changeId===local.changeId||output.changeId===incoming.changeId)throw Error('Resolution must have a new change ID');
  return output;
}
