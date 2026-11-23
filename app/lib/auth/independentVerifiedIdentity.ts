import { readVerifiedBrowserLicense } from '../independent/browserLicense';
import { restoreIndependentStartupAuthorization } from './restoreIndependentStartupAuthorization';
import { trustedOfflineGrantKeys } from './trustedOfflineGrantKeys';
import { membershipFromVerifiedIndependentGrant } from './independentMembershipBridge';
import type { OfflineGrant } from './verifyOfflineGrant';
import type { UserMembership } from './roleRedirect';

export type VerifiedIndependentIdentity = {
  grant: OfflineGrant;
  membership: UserMembership;
  accountId: string;
  userId: string;
  email: string;
  fullName: string;
  edition: 'independent_essentials' | 'independent_multi_device';
};

const CACHED_USER_KEY = 'eleeveon_account_user';
function readCachedUser(): {id:string; accountId:string; email:string; fullName:string}|null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const user:unknown = JSON.parse(raw);
    if (!user || typeof user !== 'object') return null;
    const u = user as Record<string,unknown>;
    if (typeof u.id !== 'string' || typeof u.accountId !== 'string') return null;
    return {id:u.id,accountId:u.accountId,email:typeof u.email==='string'?u.email:'',fullName:typeof u.fullName==='string'?u.fullName:''};
  } catch { return null; }
}
/** Never infer authorization from cached user data. Cached data is only a lookup hint. */
export async function restoreVerifiedIndependentIdentity():Promise<VerifiedIndependentIdentity|null> {
  const user=readCachedUser();
  if (!user) return null;
  const license=await readVerifiedBrowserLicense();
  if (!license || license.claims.accountId!==user.accountId) return null;
  const keys=await trustedOfflineGrantKeys();
  if (!Object.keys(keys).length) return null;
  const grant=await restoreIndependentStartupAuthorization({expectedUserId:user.id,expectedAccountId:user.accountId,trustedSigningKeys:keys});
  if (!grant) return null;
  const membership=membershipFromVerifiedIndependentGrant(grant,{
    accountId:user.accountId,userId:user.id,licenseId:String(license.claims.licenseId||''),installationId:license.record.installationId,
  });
  if (grant.edition!==license.claims.edition) return null;
  return {grant,membership,accountId:grant.accountId,userId:grant.userId,email:user.email,fullName:user.fullName,edition:grant.edition as VerifiedIndependentIdentity['edition']};
}
