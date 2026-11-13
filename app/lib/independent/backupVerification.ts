import { decryptSchoolArchive, type EncryptedArchive, type SchoolArchive } from "./archive";

/** Validation is intentionally read-only. Never restore an untrusted archive directly. */
export function validateSnapshot(snapshot: SchoolArchive, expectedDatabase: string): { tables: number; records: number; createdAt: string } {
  if (!snapshot || snapshot.format !== "eleeveon-independent-snapshot" || snapshot.version !== 1) throw new Error("Unsupported school snapshot");
  if (!expectedDatabase || snapshot.database !== expectedDatabase) throw new Error("Backup is for a different database");
  if (!Number.isSafeInteger(snapshot.indexedDBVersion) || snapshot.indexedDBVersion < 1) throw new Error("Invalid database version");
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length === 0 || snapshot.tables.length > 1000) throw new Error("Invalid backup store list");
  if (Number.isNaN(Date.parse(snapshot.createdAt))) throw new Error("Invalid creation date");
  const names = new Set<string>();
  let records = 0;
  for (const table of snapshot.tables) {
    if (!table || typeof table.name !== "string" || !table.name || names.has(table.name)) throw new Error("Duplicate or invalid backup store name");
    names.add(table.name);
    if (!Array.isArray(table.rows) || typeof table.autoIncrement !== "boolean") throw new Error("Invalid backup store");
    if (table.keyPath !== null && typeof table.keyPath !== "string" && !(Array.isArray(table.keyPath) && table.keyPath.every(x => typeof x === "string"))) throw new Error("Invalid store key path");
    for (const row of table.rows) if (!row || !("key" in row) || !("value" in row)) throw new Error("Malformed backup row");
    records += table.rows.length;
    if (!Number.isSafeInteger(records)) throw new Error("Backup record count exceeds supported limit");
  }
  return { tables: snapshot.tables.length, records, createdAt: snapshot.createdAt };
}

export async function inspectEncryptedBackup(content: string, passphrase: string, expectedDatabase: string): Promise<{ tables: number; records: number; createdAt: string }> {
  if (content.length > 1_000_000_000) throw new Error("Backup is too large to inspect in memory");
  let envelope: EncryptedArchive;
  try { envelope = JSON.parse(content) as EncryptedArchive; }
  catch { throw new Error("Not a valid encrypted backup file"); }
  const snapshot = await decryptSchoolArchive(envelope, passphrase);
  return validateSnapshot(snapshot, expectedDatabase);
}

/** Restore is forbidden for legacy backups that lack a signed-session account binding. */
export function validateAccountBoundSnapshot(snapshot: SchoolArchive, databaseName: string, verifiedAccountId: string) {
  const result = validateSnapshot(snapshot, databaseName);
  if (!verifiedAccountId || snapshot.accountId !== verifiedAccountId) throw new Error("Backup account binding is missing or belongs to another account; inspection only");
  return result;
}
