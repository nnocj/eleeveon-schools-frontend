import { listVerifiedBrowserLicenses } from '../independent/browserLicense';
import { restoreOfflineAtStartup } from './restoreOfflineAtStartup';
import type { OfflineGrant } from './verifyOfflineGrant';

/**
 * Lookup identifiers are untrusted hints. Authorization comes ONLY from the
 * signature-verified grant and the separately verified installed certificate.
 * This function does not hydrate providers or select the application database.
 */
export async function restoreIndependentStartupAuthorization(input: {
  expectedUserId: string;
  expectedAccountId: string;
  trustedSigningKeys: Readonly<Record<string, JsonWebKey>>;
}): Promise<OfflineGrant | null> {
  if (!input.expectedUserId?.trim() || !input.expectedAccountId?.trim()) return null;
  const matches = (await listVerifiedBrowserLicenses()).filter(item => item.claims.accountId === input.expectedAccountId);
  const license = matches.length === 1 ? matches[0] : null;
  if (!license || license.claims.accountId !== input.expectedAccountId) return null;
  const licenseId = String(license.claims.licenseId || '');
  const installationId = String(license.record.installationId || '');
  if (!licenseId || !installationId) return null;
  const grant = await restoreOfflineAtStartup({
    userId: input.expectedUserId,
    accountId: input.expectedAccountId,
    licenseId,
    installationId,
  }, input.trustedSigningKeys);
  if (!grant) return null;
  // Never silently cross a package boundary during offline restoration.
  const licenseEdition = String(license.claims.edition || '').toLowerCase();
  if (licenseEdition && grant.edition !== licenseEdition) return null;
  return grant;
}
