/** Public key is embedded at build time; never accept signing keys from grant payloads. */
export async function trustedOfflineGrantKeys():Promise<Record<string,JsonWebKey>> {
  const kid=process.env.NEXT_PUBLIC_ELEEVEON_OFFLINE_GRANT_KID?.trim();
  const pem=process.env.NEXT_PUBLIC_ELEEVEON_OFFLINE_GRANT_PUBLIC_KEY_PEM?.replace(/\\n/g,'\n');
  if (!kid || !pem?.includes('-----BEGIN PUBLIC KEY-----')) return {};
  try {
    const encoded=pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey('spki',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},true,['verify']);
    return {[kid]:await crypto.subtle.exportKey('jwk',key)};
  }catch{return {};}
}
