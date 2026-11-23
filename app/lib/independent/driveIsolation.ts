import type { SchoolArchive } from "./archive";

/** Fail-closed preflight for uploading a full IndexedDB snapshot to a third-party drive.
 * A full-database archive is safe only if every stored row is explicitly tenant-bound.
 * This does not certify that a database is single-tenant or suitable for restoration.
 */
export function assertDriveSnapshotIsolation(snapshot: SchoolArchive, accountId: string): void {
  if (!accountId || snapshot.accountId !== accountId) throw new Error("Backup account binding does not match the signed-in account.");
  const unsafe: string[] = [];
  const sensitive = /^(appUsers|users|accountUsers|userMemberships|memberships|accounts|userSessions|sessions|apiKeys|apiClients|paymentProviderEvents|paymentTransactions|webhookLogs|auditLogs|backgroundJobs|integrationMappings)$/i;
  for (const table of snapshot.tables) {
    if (sensitive.test(table.name) && table.rows.length) {
      unsafe.push(`${table.name}: platform/security data`);
      continue;
    }
    for (const row of table.rows) {
      // Encoded IndexedDB values may not be plain objects. Unknown formats are unsafe.
      const value: unknown = row.value;
      if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).accountId !== accountId) {
        unsafe.push(`${table.name}: missing or different account binding`);
        break;
      }
    }
  }
  if (unsafe.length) {
    throw new Error(`Google Drive upload blocked to protect other accounts and platform credentials. Unsafe stores: ${unsafe.slice(0, 8).join("; ")}${unsafe.length > 8 ? ` (+${unsafe.length - 8} more)` : ""}. A dedicated account-scoped export format is required; no data was uploaded.`);
  }
}
