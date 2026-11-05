import type { EffectiveAccessResponse } from './types';
import { normalizeAccessResponse } from '../commercial/normalizeAccess';
import { deriveStatus } from '../commercial/accessRules';
const PREFIX='eleeveon_entitlement_snapshot';
export interface CachedEntitlement { accountId:string; cachedAt:number; expiresAt:number; value:EffectiveAccessResponse; }
const key=(accountId:string)=>`${PREFIX}:${accountId}`;
export function readEntitlementCache(accountId:string):CachedEntitlement|null {
  if(typeof window==='undefined' || !accountId) return null;
  try {
    const raw=window.localStorage.getItem(key(accountId)); if(!raw) return null;
    const cached=JSON.parse(raw) as CachedEntitlement;
    if(cached.accountId!==accountId || !Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now()) return null;
    const value=normalizeAccessResponse(cached.value);
    if(value.snapshot.accountId!==accountId) return null;
    // Don't mutate stored data; read-time status is time-aware.
    const status=deriveStatus(value.snapshot); value.snapshot.status=status==='unknown'?'expired':status;
    return {...cached,value};
  } catch { return null; }
}
export function writeEntitlementCache(accountId:string,value:EffectiveAccessResponse,ttlMs=15*60*1000):void {
  if(typeof window==='undefined' || !accountId) return;
  try {
    const normalized=normalizeAccessResponse(value);
    if(normalized.snapshot.accountId!==accountId) return;
    const now=Date.now(); let expiresAt=now+Math.min(Math.max(ttlMs,0),15*60*1000);
    for(const iso of [normalized.snapshot.validUntil,normalized.snapshot.graceEndsAt]) {
      if(!iso) continue; const stamp=Date.parse(iso); if(Number.isFinite(stamp) && stamp>now) expiresAt=Math.min(expiresAt,stamp);
    }
    window.localStorage.setItem(key(accountId),JSON.stringify({accountId,cachedAt:now,expiresAt,value:normalized} satisfies CachedEntitlement));
  } catch { /* localStorage may be unavailable */ }
}
export function removeEntitlementCache(accountId:string):void {
  if(typeof window==='undefined') return;
  try{window.localStorage.removeItem(key(accountId));}catch{}
}
