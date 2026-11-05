import { syncHttp } from './syncHttp';
import { cacheSyncPolicy,readCachedSyncPolicy } from './syncPolicyCache';
import { FALLBACK_READ_ONLY_POLICY,type EffectiveSyncPolicy } from './syncPolicy';
const POLICY_ENDPOINT='/sync/policy';
/** The server's /sync/policy remains authoritative. This function does not
 * synthesize permission to sync from stale local subscription records. */
export async function resolveSyncPolicy(accountId:string,options?:{forceRefresh?:boolean;online?:boolean}):Promise<EffectiveSyncPolicy> {
  const cached=readCachedSyncPolicy(accountId);
  if(cached && !options?.forceRefresh) return cached;
  const online=options?.online ?? (typeof navigator==='undefined'?true:navigator.onLine);
  if(!online) return cached??FALLBACK_READ_ONLY_POLICY(accountId,'No verified sync policy while offline.');
  try {
    const policy=await syncHttp<EffectiveSyncPolicy>(POLICY_ENDPOINT,{method:'POST',body:{accountId}});
    if(!policy || policy.accountId!==accountId || !['full','hybrid','offline','developer','read_only'].includes(policy.mode) ||
       !['allowPush','allowPull','allowLocalMutations','allowWorkspaceBootstrap','allowPlatformCache','allowDeviceRegistration'].every(k=>typeof (policy as unknown as Record<string,unknown>)[k]==='boolean')) {
      throw new Error('Invalid account-scoped sync policy received.');
    }
    if(policy.expiresAt != null && policy.expiresAt<=Date.now()) throw new Error('Received an expired sync policy.');
    cacheSyncPolicy(policy);return policy;
  }catch(error){return cached??FALLBACK_READ_ONLY_POLICY(accountId,error instanceof Error?error.message:'Unable to resolve sync policy.');}
}
