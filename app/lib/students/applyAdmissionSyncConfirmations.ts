/**
 * Apply successful /sync/push student admission confirmations to Dexie.
 * Call AFTER the existing generic sync-success/version/status logic.
 * Never use updateLocal() here: that would re-queue a server confirmation.
 *
 * This helper does not replace regular pull/bootstrap reconciliation.
 */
import { db } from "../db/db";

export type AdmissionPushResult = {
  tableName: string;
  localId: string;
  ok: boolean;
  admissionNumber?: string;
  admissionNumberConfirmed?: boolean;
};

export async function applyAdmissionSyncConfirmations(
  results: readonly AdmissionPushResult[],
  accountId: string,
): Promise<number> {
  let updated = 0;
  for (const result of results) {
    if (result.tableName !== "students" || !result.ok || !result.localId) continue;
    const row = await db.students.get(result.localId);
    if (!row || row.accountId !== accountId || row.isDeleted) continue;
    const confirmedNumber = String(result.admissionNumber ?? "").trim();
    // A confirmed number is authoritative, even if it differs from an
    // offline-generated candidate. Blank manual-mode numbers are valid.
    if (!result.admissionNumberConfirmed || !confirmedNumber) continue;
    // Guard against a subsequent unsynced local edit: do not silently
    // clear its pending state. The next pull will reconcile as appropriate.
    if (row.synced !== "synced") continue;
    await db.students.update(row.id, {
      admissionNumber: confirmedNumber,
      admissionNumberProvisional: false,
      admissionNumberConfirmed: true,
    });
    updated += 1;
  }
  return updated;
}
