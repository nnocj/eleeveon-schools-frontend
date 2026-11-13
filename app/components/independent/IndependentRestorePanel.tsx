'use client';
import {useState} from 'react';
import {chooseBackupFolder} from '../../lib/independent/folderBackup';
import {previewIndependentRestore,restoreIndependentFromBackup,type RestorePreview} from '../../lib/independent/databaseRestore';
/** The parent must have already verified the license and active local Owner session. */
export default function IndependentRestorePanel({databaseName,accountId}:{databaseName:string;accountId:string}) {
 const [file,setFile]=useState<File|null>(null);
 const [oldPass,setOldPass]=useState('');
 const [safetyPass,setSafetyPass]=useState('');
 const [show,setShow]=useState(false);
 const [confirm,setConfirm]=useState('');
 const [preview,setPreview]=useState<RestorePreview|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 async function inspect(){
  if(!file||busy)return;setBusy(true);setPreview(null);setMessage('');setError('');
  try{setPreview(await previewIndependentRestore({encryptedFile:await file.text(),passphrase:oldPass,databaseName,accountId}));}
  catch(e){setError(e instanceof Error?e.message:'Inspection failed');}
  finally{setBusy(false);}
 }
 async function restore(){
  if(!file||!preview||busy||confirm!=='RESTORE SCHOOL DATABASE')return;
  setBusy(true);setError('');setMessage('');
  try{
   const folder=await chooseBackupFolder();
   const result=await restoreIndependentFromBackup({encryptedFile:await file.text(),oldPassphrase:oldPass,databaseName,accountId,safetyFolder:folder,safetyPassphrase:safetyPass,confirmedPhrase:confirm});
   setMessage(`Restore committed (${result.restoredRecords} records). Verified safety backup: ${result.safetyBackup}. Close and reopen the app before using school records.`);
   setFile(null);setPreview(null);setOldPass('');setSafetyPass('');setConfirm('');
  }catch(e){setError(e instanceof Error?e.message:'Restore failed');}
  finally{setBusy(false);}
 }
 return <section className="space-y-3 rounded-2xl border border-amber-400 p-4" aria-label="Restore local school database">
  <h2 className="text-lg font-semibold">Restore a school database</h2>
  <p className="text-sm">This replaces all local IndexedDB records. Close every other Eleeveon tab or window first. External media folders are NOT restored. A verified safety backup of the current data is required.</p>
  <label className="block text-sm font-medium" htmlFor="restore-file">Encrypted backup from this licensed school</label>
  <input className="block w-full text-sm" id="restore-file" type="file" accept=".eleeveonbak" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setConfirm('');}}/>
  <label className="block text-sm font-medium" htmlFor="restore-old">Original backup passphrase</label>
  <input className="w-full rounded-lg border bg-transparent p-2" id="restore-old" type={show?'text':'password'} value={oldPass} disabled={busy} onChange={e=>{setOldPass(e.target.value);setPreview(null);}}/>
  <label className="block text-sm font-medium" htmlFor="restore-safety">New safety backup passphrase (minimum 12 characters)</label>
  <input className="w-full rounded-lg border bg-transparent p-2" id="restore-safety" type={show?'text':'password'} value={safetyPass} disabled={busy} onChange={e=>setSafetyPass(e.target.value)}/>
  <button type="button" onClick={()=>setShow(!show)} className="rounded-lg border px-3 py-2 text-sm">{show?'Hide':'Show'} passphrases</button>
  <div><button type="button" disabled={!file||oldPass.length<12||busy} onClick={()=>void inspect()} className="rounded-lg border px-4 py-2 disabled:opacity-50">Preview & verify compatibility</button></div>
  {preview&&<div role="status" className="rounded-lg border p-3 text-sm"><strong>Ready for explicit confirmation</strong><p>{preview.records} records in {preview.stores} stores, from {preview.createdAt}; schema v{preview.version}. Account matches the current license.</p><p className="mt-2">Type <strong>RESTORE SCHOOL DATABASE</strong> to enable replacement.</p><input aria-label="Type restore confirmation" className="mt-2 w-full rounded-lg border bg-transparent p-2" disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)} /></div>}
  <button type="button" className="rounded-lg border border-red-600 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40" disabled={!preview||busy||safetyPass.length<12||confirm!=='RESTORE SCHOOL DATABASE'} onClick={()=>void restore()}>{busy?'Working…':'Create safety backup, then restore'}</button>
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
 </section>;
}
