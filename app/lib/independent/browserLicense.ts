/** Browser-only Independent licence storage. No Electron/Capacitor bridge.
 * The installation UUID identifies a browser profile, not trusted hardware.
 * Certificates are checked with a deploy-time pinned issuer public key.
 */
import { apiRequest } from '../platformApi';
import { verifyOfflineLicense, type OfflineLicenseClaims, type OfflineLicenseEnvelope } from './offlineLicense';
const KEY = 'eleeveon_independent_browser_license_v1';
const INSTALL_KEY = 'eleeveon_independent_installation_id_v1';
export type BrowserLicenseRecord = { installationId:string; accountId:string; envelope:OfflineLicenseEnvelope };
function pinnedKeys(): Record<string,string> {
  const kid=process.env.NEXT_PUBLIC_ELEEVEON_CERT_KID || '';
  const pem=(process.env.NEXT_PUBLIC_ELEEVEON_CERT_PUBLIC_KEY_PEM || '').replace(/\\n/g,'\n');
  if (!kid || !pem.includes('BEGIN PUBLIC KEY')) throw new Error('The PWA has no pinned certificate issuer public key. Configure the public key before activation.');
  return {[kid]:pem};
}
export function browserInstallationId():string {
  if(typeof window==='undefined') throw new Error('Browser installation unavailable');
  let id=localStorage.getItem(INSTALL_KEY);
  if(!id){id=crypto.randomUUID();localStorage.setItem(INSTALL_KEY,id);}
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid browser installation identity');
  return id;
}
export async function readVerifiedBrowserLicense():Promise<{claims:OfflineLicenseClaims;record:BrowserLicenseRecord}|null>{
  if(typeof window==='undefined')return null;
  const raw=localStorage.getItem(KEY);
  if(!raw)return null;
  let record:BrowserLicenseRecord;
  try{record=JSON.parse(raw);}catch{throw new Error('Stored licence is damaged');}
  if(record.installationId!==browserInstallationId())throw new Error('Licence belongs to another browser installation');
  const edition=JSON.parse(record.envelope.payload)?.edition;
  if(edition!=='independent_essentials' && edition!=='independent_multi_device')throw new Error('Unsupported Independent edition');
  const claims=await verifyOfflineLicense({envelope:record.envelope,publicKeys:pinnedKeys(),expectedAccountId:record.accountId,expectedInstallationId:record.installationId,expectedEdition:edition,appMajorVersion:1});
  return {claims,record};
}
export async function activateBrowserLicense(args:{licenseKey:string;licenseId:string;accountId:string}):Promise<OfflineLicenseClaims>{
  if(typeof navigator!=='undefined' && !navigator.onLine)throw new Error('Internet required for first activation');
  const installationId=browserInstallationId();
  // /licenses/activate verifies the raw key and enforces device limits atomically.
  const activation=await apiRequest<{licenseId:string;accountId:string}>('/licenses/activate',{method:'POST',body:JSON.stringify({licenseKey:args.licenseKey,deviceId:installationId,machineFingerprint:installationId,platform:'browser-pwa',deviceName:'Eleeveon Schools PWA',appVersion:'1'})});
  if(activation.accountId!==args.accountId || activation.licenseId!==args.licenseId)throw new Error('Activated licence does not belong to this account');
  // This endpoint requires the currently signed-in owner JWT; never expose a signing key.
  const envelope=await apiRequest<OfflineLicenseEnvelope>(`/licenses/${encodeURIComponent(args.licenseId)}/offline-certificate`,{method:'POST',body:JSON.stringify({installationId})});
  const record:BrowserLicenseRecord={accountId:args.accountId,installationId,envelope};
  const edition=JSON.parse(envelope.payload)?.edition;
  if(edition!=='independent_essentials'&&edition!=='independent_multi_device')throw new Error('Invalid Independent edition');
  const claims=await verifyOfflineLicense({envelope,publicKeys:pinnedKeys(),expectedAccountId:record.accountId,expectedInstallationId:installationId,expectedEdition:edition,appMajorVersion:1});
  localStorage.setItem(KEY,JSON.stringify(record));
  return claims;
}
