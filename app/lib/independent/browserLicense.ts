/** Browser-only Independent licence storage. No Electron/Capacitor bridge.
 * The installation UUID identifies a browser profile, not trusted hardware.
 * Certificates are checked with a deploy-time pinned issuer public key.
 */
import { apiRequest } from '../platformApi';
import { verifyOfflineLicense, type OfflineLicenseClaims, type OfflineLicenseEnvelope } from './offlineLicense';
const KEY = 'eleeveon_independent_browser_license_v1';
const REGISTRY_KEY = 'eleeveon_independent_browser_licenses_v2';
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
export type VerifiedBrowserLicense = {claims:OfflineLicenseClaims;record:BrowserLicenseRecord;selector:string};
function licenseSelector(record:BrowserLicenseRecord):string {
 const payload=JSON.parse(record.envelope.payload);
 const id=String(payload.licenseId || payload.id || '');
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new Error('Certificate has no valid licence identifier');
 return id;
}
function registry():BrowserLicenseRecord[] {
 const raw=localStorage.getItem(REGISTRY_KEY);
 if(!raw)return [];
 const data=JSON.parse(raw);
 if(!Array.isArray(data))throw new Error('Installed licence registry is damaged');
 return data;
}
export function selectedLicenseId():string|null {
 if(typeof window==='undefined')return null;
 const id=new URLSearchParams(window.location.search).get('license');
 if(!id)return null;
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new Error('Invalid licence selection');
 return id;
}
export function independentWorkspaceUrl(selector?:string|null):string {
 return selector?`/independent/workspace?license=${encodeURIComponent(selector)}`:'/independent/workspace';
}
export async function listVerifiedBrowserLicenses():Promise<VerifiedBrowserLicense[]> {
 if(typeof window==='undefined')return [];
 const records:BrowserLicenseRecord[]=[];
 const legacy=localStorage.getItem(KEY);
 if(legacy){try{records.push(JSON.parse(legacy));}catch{throw new Error('Legacy licence record is damaged');}}
 records.push(...registry());
 const verified:VerifiedBrowserLicense[]=[];
 const seen=new Set<string>();
 for(const record of records){
  if(record.installationId!==browserInstallationId())throw new Error('Licence belongs to another browser installation');
  const edition=JSON.parse(record.envelope.payload)?.edition;
  if(edition!=='independent_essentials'&&edition!=='independent_multi_device')throw new Error('Unsupported Independent edition');
  const claims=await verifyOfflineLicense({envelope:record.envelope,publicKeys:pinnedKeys(),expectedAccountId:record.accountId,expectedInstallationId:record.installationId,expectedEdition:edition,appMajorVersion:1});
  const selector=licenseSelector(record);
  if(seen.has(selector))continue;
  seen.add(selector);verified.push({claims,record,selector});
 }
 return verified;
}
export async function readVerifiedBrowserLicense():Promise<{claims:OfflineLicenseClaims;record:BrowserLicenseRecord}|null>{
 const selected=selectedLicenseId();
 const all=await listVerifiedBrowserLicenses();
 if(selected){const found=all.find(x=>x.selector===selected);if(!found)throw new Error('Selected licence is not installed or is not verified');return found;}
 // Prefer an explicitly selected certificate. Otherwise only auto-select when
 // exactly one verified installation exists; never guess between accounts.
 if(all.length===1)return all[0];
 if(all.length>1)throw new Error('Multiple Independent licences are installed. Select the intended licence using the license parameter.');
 return null;
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
  const existing=registry();
  const selector=licenseSelector(record);
  const legacyRaw=localStorage.getItem(KEY);
  if(!legacyRaw){localStorage.setItem(KEY,JSON.stringify(record));}
  else {const legacyRecord=JSON.parse(legacyRaw) as BrowserLicenseRecord;
    if(licenseSelector(legacyRecord)===selector) localStorage.setItem(KEY,JSON.stringify(record));
    else localStorage.setItem(REGISTRY_KEY,JSON.stringify([...existing.filter(x=>licenseSelector(x)!==selector),record]));
  }
  return claims;
}

/** Provision from the authenticated account, without exposing a raw license key. */
export async function provisionBrowserLicense(accountId:string):Promise<VerifiedBrowserLicense|null> {
 const installationId=browserInstallationId();
 const response=await apiRequest<{kind:'not-independent'}|{kind:'independent';accountId:string;envelope:OfflineLicenseEnvelope}>('/licenses/provision-browser',{method:'POST',body:JSON.stringify({installationId})});
 if(response.kind==='not-independent')return null;
 if(response.kind!=='independent'||response.accountId!==accountId)throw Error('Provisioned account mismatch');
 const record:BrowserLicenseRecord={accountId,installationId,envelope:response.envelope};
 const edition=JSON.parse(record.envelope.payload)?.edition;
 if(edition!=='independent_essentials'&&edition!=='independent_multi_device')throw Error('Invalid Independent edition');
 const claims=await verifyOfflineLicense({envelope:record.envelope,publicKeys:pinnedKeys(),expectedAccountId:accountId,expectedInstallationId:installationId,expectedEdition:edition,appMajorVersion:1});
 const selector=licenseSelector(record);
 const existing=registry();
 const legacy=localStorage.getItem(KEY);
 if(legacy && licenseSelector(JSON.parse(legacy))===selector) localStorage.setItem(KEY,JSON.stringify(record));
 else localStorage.setItem(REGISTRY_KEY,JSON.stringify([...existing.filter(x=>licenseSelector(x)!==selector),record]));
 return {claims,record,selector};
}
