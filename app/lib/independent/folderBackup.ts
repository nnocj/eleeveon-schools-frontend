import { encryptSchoolArchive, type EncryptedArchive } from "./archive";
import { captureSchoolDatabase } from "./databaseSnapshot";
import { inspectEncryptedBackup, validateSnapshot } from "./backupVerification";

type Writable = { write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type FileHandle = { createWritable(): Promise<Writable>; getFile(): Promise<{ text(): Promise<string> }> };
type DirectoryHandle = { getFileHandle(name: string, options?: { create: true }): Promise<FileHandle> };
export type BackupResult = { filename: string; tables: number; records: number; createdAt: string; bytes: number; verified: true };

/** Read, encrypt, save, reopen and decrypt the actual saved bytes before claiming success. */
export async function backupIndependentToFolder(options: { databaseName: string; accountId: string; passphrase: string; folder: DirectoryHandle }): Promise<BackupResult> {
  const snapshot = await captureSchoolDatabase(options.databaseName, options.accountId);
  const expected = validateSnapshot(snapshot, options.databaseName);
  const encrypted: EncryptedArchive = await encryptSchoolArchive(snapshot, options.passphrase);
  const content = JSON.stringify(encrypted);
  const timestamp = snapshot.createdAt.replace(/[:.]/g, "-");
  const filename = `eleeveon-${timestamp}-${crypto.randomUUID().slice(0, 8)}.eleeveonbak`;
  const handle = await options.folder.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(content); await writable.close(); }
  catch (error) { try { await writable.abort(); } catch {} throw error; }
  // Never report success merely because the write promise completed.
  const savedText = await (await (await options.folder.getFileHandle(filename)).getFile()).text();
  if (savedText !== content) throw new Error("Written backup did not match the encrypted source. Backup is NOT verified.");
  const actual = await inspectEncryptedBackup(savedText, options.passphrase, options.databaseName);
  if (actual.records !== expected.records || actual.tables !== expected.tables || actual.createdAt !== expected.createdAt) throw new Error("Backup verification failed: snapshot metadata differs");
  return { filename, ...actual, bytes: new Blob([savedText]).size, verified: true };
}

export async function chooseBackupFolder(): Promise<DirectoryHandle> {
  const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: (opts?: { mode: "readwrite" }) => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Folder selection is not available in this runtime. A native filesystem adapter is required for this device.");
  return picker({ mode: "readwrite" });
}

export async function inspectBackupFile(file: { text(): Promise<string> }, passphrase: string, databaseName: string) {
  return inspectEncryptedBackup(await file.text(), passphrase, databaseName);
}
