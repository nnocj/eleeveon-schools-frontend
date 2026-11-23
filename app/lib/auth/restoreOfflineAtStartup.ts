import { restoreVerifiedOfflineGrant } from './offlineGrantStore';
import type { OfflineGrant, OfflineGrantBinding } from './verifyOfflineGrant';

/**
 * Offline-only authorization check for application bootstrap.
 * The caller must supply the expected user and trusted bundled signing keys.
 * This does not itself hydrate React providers or change the active database.
 */
export async function restoreOfflineAtStartup(
  binding: OfflineGrantBinding,
  pinnedPublicKeys: Readonly<Record<string, JsonWebKey>>,
): Promise<OfflineGrant | null> {
  if (!binding.userId?.trim() || !binding.accountId?.trim() ||
      !binding.licenseId?.trim() || !binding.installationId?.trim()) {
    return null;
  }
  if (!Object.keys(pinnedPublicKeys).length) return null;
  try {
    return await restoreVerifiedOfflineGrant(binding, pinnedPublicKeys);
  } catch {
    return null;
  }
}
