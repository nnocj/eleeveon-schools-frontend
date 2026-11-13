/** Independent native persistence adapter. No Cloud fallback and no editable localStorage grant. */
import { APP_DB_NAME } from "../db/db-version";
import { captureSchoolDatabase } from "./databaseSnapshot";
import { getIndependentNativeBridge } from "./nativeBridge";
import { ELEEVEON_RUNTIME, IS_INDEPENDENT_RUNTIME } from "./runtimeMode";
import { verifyOfflineLicense } from "./offlineLicense";

type NativeSnapshotReceipt = { saved: boolean; sha256: string; bytes: number; accountId: string; database: string };
interface NativeStorage extends NonNullable<ReturnType<typeof getIndependentNativeBridge>> {
  storeEncryptedDatabaseSnapshot(input: {
    accountId: string;
    database: string;
    snapshot: string;
  }): Promise<NativeSnapshotReceipt>;
}

/** Persists the same real EleeveonDB the portals write to, but only in a verified native installation.
 * The native vault must already be unlocked; this is snapshot persistence, NOT multi-device sync.
 */
export async function persistIndependentDatabase(accountId: string): Promise<NativeSnapshotReceipt> {
  if (!IS_INDEPENDENT_RUNTIME) throw new Error("Independent persistence is not enabled in this build");
  if (!accountId) throw new Error("An account identity is required");
  const bridge = getIndependentNativeBridge() as NativeStorage | null;
  if (!bridge || typeof bridge.storeEncryptedDatabaseSnapshot !== "function") throw new Error("Encrypted native school-folder storage is not installed");
  const [installationId, licensedAccountId, certificate, trustedKeys] = await Promise.all([
    bridge.getInstallationId(), bridge.getLicensedAccountId(),
    bridge.loadOfflineLicense(), bridge.loadPinnedIssuerPublicKeys(),
  ]);
  if (licensedAccountId !== accountId) throw new Error("Local account differs from licensed account");
  if (!certificate) throw new Error("Signed offline license is missing");
  await verifyOfflineLicense({
    envelope: certificate, publicKeys: trustedKeys, expectedAccountId: licensedAccountId,
    expectedInstallationId: installationId, expectedEdition: ELEEVEON_RUNTIME as "independent_essentials" | "independent_multi_device", appMajorVersion: 1,
  });
  const snapshot = await captureSchoolDatabase(APP_DB_NAME, accountId);
  const encoded = JSON.stringify(snapshot);
  if (encoded.length > 50 * 1024 * 1024) throw new Error("Database snapshot exceeds the 50 MiB IPC safety limit. Use a streaming native adapter before production use.");
  const receipt = await bridge.storeEncryptedDatabaseSnapshot({ accountId, database: APP_DB_NAME, snapshot: encoded });
  if (!receipt || receipt.saved !== true || receipt.accountId !== accountId || receipt.database !== APP_DB_NAME ||
      !/^[a-f0-9]{64}$/i.test(receipt.sha256) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0) {
    throw new Error("Native persistence returned an invalid confirmation");
  }
  return receipt;
}
