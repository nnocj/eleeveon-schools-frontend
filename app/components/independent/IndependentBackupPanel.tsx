"use client";
import { useState } from "react";
import { backupIndependentToFolder, chooseBackupFolder, inspectBackupFile } from "../../lib/independent/folderBackup";

/** Owner-only; parent must verify the installed license and local Owner session. */
export default function IndependentBackupPanel({ databaseName, accountId }: { databaseName: string; accountId: string }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setError(""); setMessage("");
    if (password.length < 12) { setError("Use a backup passphrase of at least 12 characters."); return; }
    setBusy(true);
    try {
      const folder = await chooseBackupFolder();
      const result = await backupIndependentToFolder({ databaseName, accountId, passphrase: password, folder });
      setMessage(`Backup saved AND verified: ${result.filename} (${result.records} records in ${result.tables} stores). Folder sync/upload is separate.`);
      setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Backup failed or could not be verified."); }
    finally { setBusy(false); }
  }
  async function inspect(file: File | undefined) {
    if (!file || busy) return;
    setError(""); setMessage("");
    if (password.length < 12) { setError("Enter the original backup passphrase before inspecting."); return; }
    setBusy(true);
    try {
      const result = await inspectBackupFile(file, password, databaseName);
      setMessage(`Backup verified (read-only): ${result.records} records, ${result.tables} stores, created ${result.createdAt}. No data was restored or modified.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not inspect backup."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/15" aria-label="Independent encrypted backup">
    <h2 className="text-lg font-semibold">Encrypted school backup & verification</h2>
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Save a full IndexedDB snapshot to a folder (including a Google Drive Desktop mirrored folder). After saving, the app reads and decrypts that file to verify it. This is not live synchronization.</p>
    <label htmlFor="independent-backup-password" className="mt-4 block text-sm font-medium">Backup passphrase (minimum 12 characters)</label>
    <div className="mt-2 flex gap-2"><input id="independent-backup-password" type={visible ? "text" : "password"} autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 dark:border-white/20" /><button type="button" className="rounded-xl border px-3" aria-label={visible ? "Hide passphrase" : "Show passphrase"} onClick={()=>setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
    <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{busy ? "Verifying…" : "Create and verify encrypted backup"}</button>
    <label className="mt-5 block text-sm font-medium" htmlFor="independent-backup-inspect">Verify an existing backup without restoring it</label>
    <input id="independent-backup-inspect" type="file" accept=".eleeveonbak,application/json" disabled={busy} className="mt-2 block w-full text-sm" onChange={e=>{const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void inspect(file);}} />
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    <p className="mt-3 text-xs text-zinc-500">This does not include external native media folders. This screen deliberately does not restore data. Retain the original passphrase and an off-device backup.</p>
  </section>;
}
