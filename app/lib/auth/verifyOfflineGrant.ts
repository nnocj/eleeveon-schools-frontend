/** Browser-safe signature verification. Never use unverified payloads for authorization. */
export type OfflineGrant = {
  typ: 'eleeveon.offline-grant.v1'; grantId: string; accountId: string; userId: string;
  membershipId: string; role: 'owner' | 'branch_admin' | 'teacher';
  schoolId: string | null; branchId: string | null; teacherId: string | null;
  licenseId: string; edition: 'independent_essentials' | 'independent_multi_device' | 'cloud';
  installationId: string; permissionsRevision: string; issuedAt: string;
};
export type OfflineGrantBinding = { accountId: string; licenseId: string; installationId: string; userId: string };
function decode64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid base64url');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function jsonPart(value: string): unknown {
  const decoded = new TextDecoder().decode(decode64url(value));
  return JSON.parse(decoded);
}
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
/** publicKeys must come from a pinned/trusted app configuration, never the JWT header or an untrusted endpoint. */
export async function verifyOfflineGrant(
  token: string,
  binding: OfflineGrantBinding,
  publicKeys: Readonly<Record<string, JsonWebKey>>,
): Promise<OfflineGrant> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !p)) throw Error('Malformed offline authorization');
  const header = jsonPart(parts[0]);
  if (!isRecord(header) || header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') throw Error('Unsupported offline authorization signature');
  const jwk = publicKeys[header.kid];
  if (!jwk || jwk.kty !== 'RSA' || jwk.d || jwk.alg && jwk.alg !== 'RS256') throw Error('Untrusted offline authorization signing key');
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['verify'], ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64url(parts[2]) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!verified) throw Error('Offline authorization signature invalid');
  const payload = jsonPart(parts[1]);
  if (!isRecord(payload) || payload.typ !== 'eleeveon.offline-grant.v1') throw Error('Invalid offline authorization type');
  const fields = ['grantId', 'accountId', 'userId', 'membershipId', 'licenseId', 'installationId', 'permissionsRevision', 'issuedAt'];
  if (fields.some(k => typeof payload[k] !== 'string' || !(payload[k] as string).trim())) throw Error('Incomplete offline authorization');
  if (payload.accountId !== binding.accountId || payload.licenseId !== binding.licenseId || payload.installationId !== binding.installationId || payload.userId !== binding.userId) throw Error('Offline authorization belongs to a different account, user, license or installation');
  if (!['owner', 'branch_admin', 'teacher'].includes(String(payload.role))) throw Error('Unsupported offline role');
  if (!['independent_essentials', 'independent_multi_device', 'cloud'].includes(String(payload.edition))) throw Error('Unsupported edition');
  if (payload.role === 'teacher' && (payload.edition === 'independent_essentials' || typeof payload.teacherId !== 'string' || !payload.teacherId)) throw Error('Teacher permission not available');
  if (!Number.isFinite(Date.parse(String(payload.issuedAt))) || Date.parse(String(payload.issuedAt)) > Date.now() + 300000) throw Error('Offline authorization issued in the future or invalid');
  for (const keyName of ['schoolId', 'branchId', 'teacherId']) if (payload[keyName] !== null && typeof payload[keyName] !== 'string') throw Error('Invalid membership scope');
  if (payload.role !== 'owner' && (!payload.schoolId || !payload.branchId)) throw Error('Branch-scoped offline authorization is incomplete');
  return payload as OfflineGrant;
}
