import { encryptSchoolArchive, type EncryptedArchive } from "./archive";
import { captureSchoolDatabase } from "./databaseSnapshot";

type DirectoryHandle = { getFileHandle(name: string, options: { create: true }): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }> };
export type BackupResult = { filename: string; tables: number; records: number; createdAt: string; bytes: number };

/** User-selected local/Google Drive Desktop folder. The browser never receives Google credentials. */
export async function backupIndependentToFolder(options: { databaseName: string; passphrase: string; folder: DirectoryHandle }): Promise<BackupResult> {
  const snapshot = await captureSchoolDatabase(options.databaseName);
  const encrypted: EncryptedArchive = await encryptSchoolArchive(snapshot, options.passphrase);
  const content = JSON.stringify(encrypted);
  const timestamp = snapshot.createdAt.replace(/[:.]/g, "-");
  const filename = `eleeveon-${timestamp}-${crypto.randomUUID().slice(0, 8)}.eleeveonbak`;
  const handle = await options.folder.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(content); await writable.close(); }
  catch (error) { try { await writable.abort(); } catch {} throw error; }
  return { filename, tables: snapshot.tables.length, records: snapshot.tables.reduce((n, table) => n + table.rows.length, 0), createdAt: snapshot.createdAt, bytes: new Blob([content]).size };
}
export async function chooseBackupFolder(): Promise<DirectoryHandle> {
  const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: (opts?: { mode: "readwrite" }) => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Folder selection is unavailable in this browser/native shell. Use a supported desktop browser until the native filesystem adapter is installed.");
  return picker({ mode: "readwrite" });
}
