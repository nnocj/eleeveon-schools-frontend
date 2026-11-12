"use client";
import { useState } from "react";
import { backupIndependentToFolder, chooseBackupFolder } from "../../lib/independent/folderBackup";

/** Mount only within a licensed Independent Owner/Branch Admin screen after authorization. */
export default function IndependentBackupPanel({ databaseName }: { databaseName: string }) {
  const [password, setPassword] = useState("");
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
      const result = await backupIndependentToFolder({ databaseName, passphrase: password, folder });
      setMessage(`Encrypted backup saved: ${result.filename} (${result.records} records across ${result.tables} stores). Confirm your folder-sync app uploaded it.`);
      setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Backup failed. Your local database was not modified."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/15" aria-label="Independent local backup">
    <h2 className="text-lg font-semibold">Encrypted school backup</h2>
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Choose a local folder, including a folder mirrored by Google Drive for desktop. This creates an encrypted backup; it does not synchronize live edits between devices.</p>
    <label htmlFor="independent-backup-password" className="mt-4 block text-sm font-medium">Backup passphrase (minimum 12 characters)</label>
    <input id="independent-backup-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 dark:border-white/20" />
    <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{busy ? "Creating encrypted backup…" : "Back up to selected folder"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    <p className="mt-3 text-xs text-zinc-500">Keep the passphrase separately; losing it means the encrypted backup cannot be opened. Back up other native media directories separately until the native adapter is complete.</p>
  </section>;
}
