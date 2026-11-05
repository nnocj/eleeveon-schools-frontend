import type { EffectiveSyncPolicy } from './syncPolicy';
const PREFIX='eleeveon_effective_sync_policy';
const key=(accountId:string)=>`${PREFIX}:${accountId}`;
function valid(accountId:string,p:EffectiveSyncPolicy):boolean {
  return !!p && p.accountId===accountId && ['full','hybrid','offline','developer','read_only'].includes(p.mode) &&
    (p.expiresAt==null || (typeof p.expiresAt==='number' && p.expiresAt>Date.now())) &&
    Number.isFinite(p.resolvedAt) &&
    ['allowPush','allowPull','allowPlatformCache','allowDeviceRegistration','allowWorkspaceBootstrap','allowLocalMutations'].every(k=>typeof (p as unknown as Record<string,unknown>)[k]==='boolean');
}
export function readCachedSyncPolicy(accountId:string):EffectiveSyncPolicy|null {
  if(typeof window==='undefined')return null;
  try {const raw=window.localStorage.getItem(key(accountId));if(!raw)return null;
    const p=JSON.parse(raw) as EffectiveSyncPolicy;return valid(accountId,p)?p:null;
  } catch{return null;}
}
export function cacheSyncPolicy(policy:EffectiveSyncPolicy):void {
  if(typeof window==='undefined'||!valid(policy.accountId,policy))return;
  // Limit the age of a policy even if the server omitted an expiry. Existing
  // policies may need refreshing, but browser cache cannot grant rights forever.
  const expiresAt=Math.min(policy.expiresAt??Infinity,Date.now()+15*60*1000);
  try{window.localStorage.setItem(key(policy.accountId),JSON.stringify({...policy,expiresAt}));}catch{}
}
export function clearCachedSyncPolicy(accountId?:string):void {
  if(typeof window==='undefined')return;
  try {if(accountId){window.localStorage.removeItem(key(accountId));return;}
    for(let i=window.localStorage.length-1;i>=0;i--){const k=window.localStorage.key(i);if(k?.startsWith(`${PREFIX}:`))window.localStorage.removeItem(k);}
  }catch{}
}
