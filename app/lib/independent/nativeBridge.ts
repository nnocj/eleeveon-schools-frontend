/** Browser/PWA adapter boundary. No Capacitor or Electron runtime is bundled.
 * A browser cannot provide the previously required OS-trusted installation identity
 * or secure device-bound snapshot vault. Fail closed; never emulate with localStorage.
 * Independent Essentials activation requires a separately designed, audited PWA
 * entitlement flow before this runtime can be enabled.
 */
import type { OfflineLicenseEnvelope } from './offlineLicense';
export interface IndependentNativeBridge {
  getInstallationId(): Promise<string>;
  loadOfflineLicense(): Promise<OfflineLicenseEnvelope | null>;
  loadPinnedIssuerPublicKeys(): Promise<Record<string,string>>;
  getLicensedAccountId(): Promise<string>;
  storeEncryptedDatabaseSnapshot?(input: {accountId:string;database:string;snapshot:string}): Promise<{saved:boolean;sha256:string;bytes:number;accountId:string;database:string}>;
  loadEncryptedDatabaseSnapshot?(options: {previous:boolean}): Promise<{accountId:string;database:string;sha256:string;bytes:number;previous:boolean;createdAt:string;indexedDBVersion:number;stores:number;records:number}>;
}
export function getIndependentNativeBridge(): IndependentNativeBridge | null {
  return null;
}
