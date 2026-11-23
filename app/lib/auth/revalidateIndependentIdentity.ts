import {apiRequest,extractToken,saveAuthToken} from '../platformApi';
import {readVerifiedBrowserLicense} from '../independent/browserLicense';
import {saveVerifiedOfflineGrant,forgetOfflineGrant} from './offlineGrantStore';
import {trustedOfflineGrantKeys} from './trustedOfflineGrantKeys';
import type {VerifiedIndependentIdentity} from './independentVerifiedIdentity';

/** Online-only: reissues the grant from live server authorization checks.
 * Network errors preserve previously verified offline access. Explicit forbidden
 * membership/license decisions invalidate the local grant.
 */
export async function revalidateIndependentIdentity(identity:VerifiedIndependentIdentity):Promise<'verified'|'offline'|'revoked'|'signin-required'> {
  if(typeof navigator!=='undefined' && !navigator.onLine)return 'offline';
  const license=await readVerifiedBrowserLicense();
  if(!license)return 'signin-required';
  const binding={userId:identity.userId,accountId:identity.accountId,licenseId:String(license.claims.licenseId),installationId:license.record.installationId};
  const payload={membershipId:identity.membership.id,licenseId:binding.licenseId,installationId:binding.installationId};
  async function issue(){return apiRequest<{grant:string;keyId:string}>('/auth/offline-grant',{method:'POST',body:JSON.stringify(payload)});}
  try {
    let response;
    try {response=await issue();}
    catch(err){
      if((err as {status?:number}).status!==401)throw err;
      const refreshed=await apiRequest<Record<string,unknown>>('/auth/refresh',{method:'POST'});
      const token=extractToken(refreshed);if(!token)return 'signin-required';
      saveAuthToken(token);response=await issue();
    }
    const keys=await trustedOfflineGrantKeys();
    if(!response?.grant||!keys[response.keyId])throw new Error('Unexpected signing key');
    const verified=await saveVerifiedOfflineGrant(response.grant,binding,keys);
    if(verified.membershipId!==identity.membership.id||verified.role!==identity.membership.role||verified.schoolId!==identity.membership.schoolId||verified.branchId!==identity.membership.branchId||verified.teacherId!==identity.membership.teacherId){
      await forgetOfflineGrant(binding);return 'revoked';
    }
    return 'verified';
  }catch(err){
    const status=(err as {status?:number}).status;
    if(status===403){await forgetOfflineGrant(binding);return 'revoked';}
    if(status===401)return 'signin-required';
    return 'offline';
  }
}
