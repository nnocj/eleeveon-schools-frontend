import { apiRequest } from '../platformApi';
import { listVerifiedBrowserLicenses, provisionBrowserLicense } from '../independent/browserLicense';
import { saveVerifiedOfflineGrant } from './offlineGrantStore';

/** Convert a deployment-pinned SPKI RSA public key to a verification-only JWK. */
async function trustedGrantKeys(): Promise<Record<string, JsonWebKey>> {
  const kid = process.env.NEXT_PUBLIC_ELEEVEON_OFFLINE_GRANT_KID?.trim();
  const pem = process.env.NEXT_PUBLIC_ELEEVEON_OFFLINE_GRANT_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n');
  if (!kid || !pem?.includes('-----BEGIN PUBLIC KEY-----')) throw Error('Offline authorization public key is not configured');
  const encoded = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
  return { [kid]: await crypto.subtle.exportKey('jwk', key) };
}

/** Never treat failure to enroll as successful offline access. Online login remains available. */
export async function enrollOfflineGrantAfterLogin(input: {
  userId: string;
  accountId: string;
  memberships: ReadonlyArray<{ id?: string; role?: string; active?: boolean }>;
}): Promise<'not-independent' | 'enrolled' | 'no-eligible-membership'> {
  let license = (await listVerifiedBrowserLicenses()).find(x=>x.claims.accountId===input.accountId) ?? null;
  if (!license && input.memberships.some(m=>m.active!==false && m.role==='super_admin')) license=await provisionBrowserLicense(input.accountId);
  if (!license || license.claims.accountId !== input.accountId) return 'not-independent';
  const membership = input.memberships.find(m => m.active !== false &&
    typeof m.id === 'string' && m.id.length > 0 &&
    ['owner', 'branch_admin', 'teacher', 'super_admin'].includes(String(m.role)));
  if (!membership?.id) return 'no-eligible-membership';
  const licenseId = String(license.claims.licenseId || '');
  if (!licenseId) throw Error('Installed Independent certificate has no license ID');
  const binding = {
    userId: input.userId,
    accountId: input.accountId,
    licenseId,
    installationId: license.record.installationId,
  };
  const response = await apiRequest<{ grant: string; keyId: string }>('/auth/offline-grant', {
    method: 'POST',
    body: JSON.stringify({ membershipId: membership.id, licenseId, installationId: binding.installationId }),
  });
  const keys = await trustedGrantKeys();
  if (!response?.grant || !keys[response.keyId]) throw Error('Offline grant is missing or signed by an unexpected issuer');
  await saveVerifiedOfflineGrant(response.grant, binding, keys);
  return 'enrolled';
}
