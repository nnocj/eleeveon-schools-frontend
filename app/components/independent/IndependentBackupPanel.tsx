"use client";
import { useState } from "react";
import { previewAccountScopedDriveRestore, type ScopedRestorePreview } from "../../lib/independent/scopedRestorePreview";
import { restoreAccountScopedIntoEmptyStores } from "../../lib/independent/scopedTransactionalRestore";
import { authorizeDrive, listDriveBackups, uploadEncryptedDriveBackup, downloadDriveBackup, type DriveBackup } from "../../lib/independent/googleDriveBackup";
import { backupIndependentToFolder, chooseBackupFolder, inspectBackupFile, downloadIndependentEncryptedBackup } from "../../lib/independent/folderBackup";

/** Owner-only; parent must verify the installed license and local Owner session. */
export default function IndependentBackupPanel({ databaseName, accountId, reauthenticateOwner }: {
  databaseName: string;
  accountId: string;
  /** Must be a fresh server-verified Owner reauthentication, NOT a cached login or confirmation dialog. */
  reauthenticateOwner?: () => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [driveToken,setDriveToken]=useState<string|null>(null);
  const [driveFiles,setDriveFiles]=useState<DriveBackup[]>([]);
  async function connectDrive(){setError("");try{const token=await authorizeDrive();setDriveToken(token);setDriveFiles(await listDriveBackups(token,accountId));setMessage("Google Drive connected for this session. Access tokens are not persisted.");}catch(e){setError(e instanceof Error?e.message:"Drive connection failed");}}
  async function uploadDrive(){if(!driveToken||busy)return;setError("");setMessage("");if(password.length<12){setError("Use a backup passphrase of at least 12 characters.");return;}setBusy(true);try{const result=await uploadEncryptedDriveBackup({token:driveToken,databaseName,accountId,passphrase:password});setMessage(`Google Drive backup uploaded, downloaded and verified: ${result.name} (${result.records} records).`);setDriveFiles(await listDriveBackups(driveToken,accountId));setPassword("");}catch(e){setError(e instanceof Error?e.message:"Google Drive backup failed");}finally{setBusy(false);}}
  async function retrieveDrive(id:string,name:string){if(!driveToken||busy)return;setError("");setBusy(true);try{const content=await downloadDriveBackup(driveToken,id);const blob=new Blob([content],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage("Encrypted backup downloaded. Use the separate Restore panel to inspect and restore it safely.");}catch(e){setError(e instanceof Error?e.message:"Download failed");}finally{setBusy(false);}}

  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restoreName, setRestoreName] = useState("");
  const [restorePreview, setRestorePreview] = useState<ScopedRestorePreview | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [safetyBackupConfirmed, setSafetyBackupConfirmed] = useState(false);
  async function selectRestoreFile(file?: File) {
    setRestoreFile(null); setRestorePreview(null); setRestoreConfirmation(""); setSafetyBackupConfirmed(false);
    if (!file) return;
    if (file.size > 250_000_000) { setError("Backup exceeds 250 MB limit"); return; }
    try { setRestoreFile(await file.text()); setRestoreName(file.name); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read file"); }
  }
  async function previewRestore() {
    if (!restoreFile || busy) return;
    setBusy(true); setError(""); setRestorePreview(null);
    try { setRestorePreview(await previewAccountScopedDriveRestore({ encryptedFile: restoreFile, passphrase: restorePassphrase, databaseName, verifiedAccountId: accountId })); }
    catch (e) { setError(e instanceof Error ? e.message : "Restore preview failed"); }
    finally { setBusy(false); }
  }
  async function performRestore() {
    if (!restoreFile || !restorePreview || !reauthenticateOwner || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await restoreAccountScopedIntoEmptyStores({
        encryptedFile: restoreFile, passphrase: restorePassphrase, databaseName, verifiedAccountId: accountId,
        reauthenticateOwner, safetyBackupConfirmed, confirmation: restoreConfirmation,
      });
      setMessage(`Recovery committed: ${result.inserted} records across ${result.stores} previously empty stores. Reload the application to verify.`);
      setRestorePreview(null); setRestoreFile(null); setRestorePassphrase("");
    } catch (e) { setError(e instanceof Error ? e.message : "Restore failed; transaction rolled back"); }
    finally { setBusy(false); }
  }
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
  async function download() {
    if(busy)return;
    setError("");setMessage("");
    if(password.length<12){setError("Use a backup passphrase of at least 12 characters.");return;}
    setBusy(true);
    try {const result=await downloadIndependentEncryptedBackup({databaseName,accountId,passphrase:password});setMessage(`Encrypted backup verified and download started: ${result.filename}. Confirm the file is saved before clearing this device.`);setPassword("");}
    catch(e){setError(e instanceof Error?e.message:"Backup download failed");}
    finally{setBusy(false);}
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
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Save a full encrypted IndexedDB snapshot locally or directly to Google Drive. This is backup and recovery, not live multi-device synchronization.</p>
    <label htmlFor="independent-backup-password" className="mt-4 block text-sm font-medium">Backup passphrase (minimum 12 characters)</label>
    <div className="mt-2 flex gap-2"><input id="independent-backup-password" type={visible ? "text" : "password"} autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 dark:border-white/20" /><button type="button" className="rounded-xl border px-3" aria-label={visible ? "Hide passphrase" : "Show passphrase"} onClick={()=>setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
    <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{busy ? "Verifying…" : "Create and verify encrypted backup"}</button>
    <button type="button" disabled={busy} onClick={()=>void download()} className="ml-2 mt-4 rounded-xl border px-4 py-3 text-sm disabled:opacity-50">Download encrypted backup file</button>
    <p className="mt-2 text-xs">Folder selection requires a compatible browser. The download option works without a filesystem folder picker.</p>
    <div className="mt-5 rounded-xl border p-3 space-y-3">
      <h3 className="font-semibold">Direct Google Drive backup</h3>
      <p className="text-xs">Uses your Google account without Google Drive desktop. Drive access is limited to files this app creates or opens. Backup passphrase is never uploaded.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void connectDrive()} className="rounded-lg border px-3 py-2">{driveToken?"Reconnect Google Drive":"Connect Google Drive"}</button>
      <button type="button" disabled={!driveToken||busy} onClick={()=>void uploadDrive()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Upload and verify encrypted backup</button>
      {driveToken&&<button type="button" onClick={()=>{setDriveToken(null);setDriveFiles([]);}} className="rounded-lg border px-3 py-2">Disconnect this session</button>}</div>
      {driveFiles.length>0&&<div className="space-y-2"><p className="text-sm font-medium">Recent backups</p>{driveFiles.map(f=><div key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{f.name}</span><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>void retrieveDrive(f.id,f.name)}>Download for restore</button></div>)}</div>}
    </div>
    <label className="mt-5 block text-sm font-medium" htmlFor="independent-backup-inspect">Verify an existing backup without restoring it</label>
    <input id="independent-backup-inspect" type="file" accept=".eleeveonbak,application/json" disabled={busy} className="mt-2 block w-full text-sm" onChange={e=>{const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void inspect(file);}} />
    <div className="mt-5 rounded-xl border p-3 space-y-3" aria-label="Account-scoped restore">
      <h3 className="font-semibold">Account-scoped recovery (empty stores only)</h3>
      <p className="text-xs">Choose an encrypted school-only backup. Preview never modifies data. Restore cannot overwrite existing records and requires a fresh Owner verification.</p>
      <input type="file" accept=".eleeveonbak,application/json" disabled={busy} aria-label="Choose encrypted recovery file" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void selectRestoreFile(file); }} />
      {restoreFile && <p className="text-xs">Selected: {restoreName}</p>}
      <input type="password" autoComplete="off" value={restorePassphrase} onChange={e => { setRestorePassphrase(e.target.value); setRestorePreview(null); }} placeholder="Original backup passphrase" aria-label="Recovery passphrase" className="w-full rounded-lg border bg-transparent p-2 text-sm" />
      <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={!restoreFile || busy || restorePassphrase.length < 12} onClick={() => void previewRestore()}>Verify and preview recovery</button>
      {restorePreview && <div className="space-y-2 text-xs">
        <p>Verified account: {restorePreview.accountId}. Backup: {restorePreview.createdAt}. {restorePreview.recordCount} records in {restorePreview.storeCount} stores.</p>
        <ul className="list-disc pl-5">{restorePreview.stores.map(store => <li key={store.name}>{store.name}: {store.records} records — {store.schemaCompatible ? "schema matches" : "incompatible"}</li>)}</ul>
        {restorePreview.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
        <label className="flex gap-2 items-start"><input type="checkbox" checked={safetyBackupConfirmed} onChange={e => setSafetyBackupConfirmed(e.target.checked)} /> I have separately exported, downloaded, and verified a current safety backup.</label>
        <label className="block">Type RESTORE EMPTY STORES to confirm</label>
        <input className="w-full rounded-lg border bg-transparent p-2" value={restoreConfirmation} onChange={e => setRestoreConfirmation(e.target.value)} />
        {!reauthenticateOwner && <p role="alert">Restore is locked until the application supplies a fresh server-verified Owner reauthentication handler. Preview remains available.</p>}
        <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={busy || !reauthenticateOwner || !safetyBackupConfirmed || restoreConfirmation !== "RESTORE EMPTY STORES" || restorePreview.stores.some(s => !s.schemaCompatible)} onClick={() => void performRestore()}>Restore into empty stores</button>
      </div>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    <p className="mt-3 text-xs text-zinc-500">This does not include external native media folders. Restoration is locked without a fresh Owner reauthentication integration and only supports empty stores. Retain the original passphrase and an off-device backup.</p>
  </section>;
}
