/**
 * Verify an offline, account-and-installation-bound ECDSA P-256 licence.
 * Do not use localStorage flags, unsigned JSON, or a shipped HMAC secret for authorization.
 * The public key must be pinned in the packaged application's trusted assets.
 */
export type IndependentEdition = 'independent_essentials' | 'independent_multi_device';
export interface OfflineLicenseClaims {
  v: 1;
  licenseId: string;
  accountId: string;
  installationId: string;
  edition: IndependentEdition;
  issuedAt: number;       // UTC seconds
  notBefore: number;      // UTC seconds
  expiresAt: number | null; // null only for paid perpetual rights
  entitledMajorVersion: number;
  limits: { schools: number|null; branches: number|null; users: number|null; students: number|null; teachers: number|null; devices: number|null };
}
export interface OfflineLicenseEnvelope { alg: 'ES256'; kid: string; payload: string; signature: string; }
function bytesFromB64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Malformed base64url field');
  const chars = atob(text.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-text.length%4)%4));
  return Uint8Array.from(chars, x=>x.charCodeAt(0));
}
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const b=new Uint8Array(bytes.byteLength); b.set(bytes); return b.buffer;
}
function pemToDer(pem:string):ArrayBuffer {
  const body=pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');
  return toBuffer(Uint8Array.from(atob(body),x=>x.charCodeAt(0)));
}
const limitKeys = ['schools','branches','users','students','teachers','devices'] as const;
/** Caller must obtain installationId from a protected native installation identity, not a mutable UI field. */
export async function verifyOfflineLicense(args: {
  envelope: OfflineLicenseEnvelope;
  publicKeys: Record<string,string>;
  expectedAccountId: string;
  expectedInstallationId: string;
  expectedEdition: IndependentEdition;
  appMajorVersion: number;
  nowSeconds?: number;
}): Promise<OfflineLicenseClaims> {
  const {envelope}=args;
  if (envelope.alg!=='ES256' || !envelope.kid || !args.publicKeys[envelope.kid]) throw new Error('Untrusted license signing key');
  const key = await crypto.subtle.importKey('spki', pemToDer(args.publicKeys[envelope.kid]), { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,toBuffer(bytesFromB64url(envelope.signature)),new TextEncoder().encode(envelope.payload));
  if (!ok) throw new Error('License signature invalid');
  let claims:OfflineLicenseClaims;
  try {claims=JSON.parse(envelope.payload) as OfflineLicenseClaims;} catch {throw new Error('Malformed license claims');}
  if (claims.v!==1 || !claims.licenseId || !claims.accountId || !claims.installationId) throw new Error('Unsupported license claims');
  if (claims.accountId!==args.expectedAccountId || claims.installationId!==args.expectedInstallationId || claims.edition!==args.expectedEdition) throw new Error('License belongs to another account, installation, or edition');
  const now=args.nowSeconds??Math.floor(Date.now()/1000);
  if (!Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.notBefore) || claims.issuedAt>now+300 || claims.notBefore>now+300) throw new Error('License not yet valid');
  if (claims.expiresAt!==null && (!Number.isSafeInteger(claims.expiresAt) || claims.expiresAt<=now)) throw new Error('License expired');
  if (!Number.isSafeInteger(claims.entitledMajorVersion) || claims.entitledMajorVersion < args.appMajorVersion) throw new Error('Application version not licensed');
  if (!claims.limits || limitKeys.some(k=>claims.limits[k]!==null && (!Number.isSafeInteger(claims.limits[k]) || claims.limits[k]<0))) throw new Error('Invalid license limits');
  return claims;
}
