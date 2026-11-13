/** Contract for an OS-protected, trusted native plugin. NOT PROVIDED by Capacitor out of the box.
 * Do not fake this API in window JavaScript or store the installation ID in localStorage.
 * The implementation must be an audited native plugin with app-specific key storage.
 */
import type { OfflineLicenseEnvelope } from './offlineLicense';
export interface IndependentNativeBridge {
  getInstallationId(): Promise<string>; // backed by OS secure storage
  loadOfflineLicense(): Promise<OfflineLicenseEnvelope | null>; // signed envelope, no issuer private key
  loadPinnedIssuerPublicKeys(): Promise<Record<string, string>>; // bundled trusted public key list
  getLicensedAccountId(): Promise<string>; // provisioned via owner-controlled installation process
  storeEncryptedDatabaseSnapshot?(input: {accountId:string;database:string;snapshot:string}): Promise<{saved:boolean;sha256:string;bytes:number;accountId:string;database:string}>;
  loadEncryptedDatabaseSnapshot?(options: {previous:boolean}): Promise<{accountId:string;database:string;sha256:string;bytes:number;previous:boolean;createdAt:string;indexedDBVersion:number;stores:number;records:number}>;
}
export function getIndependentNativeBridge(): IndependentNativeBridge | null {
  if (typeof window === 'undefined') return null;
  // This is an integration interface ONLY: real native side must be supplied and audited.
  const candidate = (window as Window & { EleeveonIndependentNative?: IndependentNativeBridge }).EleeveonIndependentNative;
  if (!candidate || typeof candidate.getInstallationId !== 'function' || typeof candidate.loadOfflineLicense !== 'function' || typeof candidate.loadPinnedIssuerPublicKeys !== 'function' || typeof candidate.getLicensedAccountId !== 'function') return null;
  return candidate;
}
