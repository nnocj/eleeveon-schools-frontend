"use client";
import { useEffect, useState } from "react";

type Estimate = { usage?: number; quota?: number; persisted?: boolean; error?: string };
const formatBytes = (bytes?: number) => typeof bytes === "number" && Number.isFinite(bytes)
  ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "Unavailable";

/** Informational only: storage estimates do not establish data integrity or authorization. */
export default function IndependentStorageStatus({databaseName,accountId,lastBackup}:{
 databaseName:string;accountId:string;
 lastBackup?:{filename:string;createdAt:string;records:number;bytes:number}|null;
}) {
 const [estimate,setEstimate] = useState<Estimate>({});
 const [refreshing,setRefreshing] = useState(false);
 async function refresh() {
   setRefreshing(true);
   try {
     const storage = navigator.storage;
     const [size,persisted] = await Promise.all([
       storage?.estimate?.() ?? Promise.resolve({}),
       storage?.persisted?.() ?? Promise.resolve(false),
     ]);
     setEstimate({usage:size.usage,quota:size.quota,persisted});
   } catch(e) {setEstimate({error:e instanceof Error?e.message:"Storage estimate unavailable"});}
   finally {setRefreshing(false);}
 }
 useEffect(()=>{void refresh();},[]);
 return <section className="mt-4 rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/15" aria-label="Local storage status">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Where your school data is saved</h3><button type="button" className="rounded border px-3 py-1" disabled={refreshing} onClick={()=>void refresh()}>Refresh storage</button></div>
  <dl className="mt-2 grid gap-1">
   <div><dt className="inline font-medium">Working database: </dt><dd className="inline">{databaseName} (IndexedDB in this browser profile)</dd></div>
   <div><dt className="inline font-medium">Account scope: </dt><dd className="inline break-all">{accountId}</dd></div>
   <div><dt className="inline font-medium">Origin storage used: </dt><dd className="inline">{formatBytes(estimate.usage)}</dd></div>
   <div><dt className="inline font-medium">Origin storage quota: </dt><dd className="inline">{formatBytes(estimate.quota)}</dd></div>
   <div><dt className="inline font-medium">Persistent storage granted: </dt><dd className="inline">{estimate.persisted ? "Yes" : "No / unavailable"}</dd></div>
   <div><dt className="inline font-medium">Last verified backup this session: </dt><dd className="inline">{lastBackup ? `${lastBackup.filename} · ${lastBackup.records} records · ${formatBytes(lastBackup.bytes)}` : "None recorded in this session"}</dd></div>
  </dl>
  {estimate.error && <p role="status">{estimate.error}</p>}
  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">These are browser-origin estimates, not the size of this school's records alone. IndexedDB has no normal folder path. A selected backup folder may be synchronized by Google Drive for desktop, but successful Google Drive upload is not verified here. Backup files may exclude external media directories.</p>
 </section>;
}
