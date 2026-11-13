"use client";
import { useState, type FormEvent } from "react";
import { provisionFirstLocalOwner } from "../../lib/independent/localStaffAuth";

/** The parent mounts this screen ONLY after verifying a native, signed licence.
 * This must never be exposed on the public website as an owner-registration shortcut. */
export default function IndependentFirstOwnerSetup({accountId,installationVerified,onComplete}:{
  accountId:string; installationVerified:boolean; onComplete:()=>void;
}) {
  const [name,setName]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy)return;
    if(!installationVerified){setError("A verified Independent installation is required.");return;}
    if(password!==confirmation){setError("The passwords do not match.");return;}
    if(password.length<12){setError("Use at least 12 characters.");return;}
    setBusy(true);setError("");
    try {
      await provisionFirstLocalOwner({accountId,displayName:name,password,licenseVerified:installationVerified});
      setPassword("");setConfirmation("");onComplete();
    }catch(e){setError(e instanceof Error?e.message:"Unable to create local owner");}
    finally{setBusy(false);}
  }
  return <main className="min-h-dvh flex items-center justify-center bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-xl font-semibold">Set up the local school owner</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">This account is held on this installation. It does not use the Eleeveon Cloud password.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="ind-owner-name">Owner name</label>
      <input id="ind-owner-name" autoComplete="name" required maxLength={120} className="mt-2 w-full rounded-lg border bg-transparent p-3" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="mt-4 block text-sm font-medium" htmlFor="ind-owner-password">Local password (12+ characters)</label>
      <input id="ind-owner-password" autoComplete="new-password" type={visible?"text":"password"} required minLength={12} className="mt-2 w-full rounded-lg border bg-transparent p-3" value={password} onChange={e=>setPassword(e.target.value)}/>
      <label className="mt-4 block text-sm font-medium" htmlFor="ind-owner-confirm">Confirm password</label>
      <input id="ind-owner-confirm" autoComplete="new-password" type={visible?"text":"password"} required minLength={12} className="mt-2 w-full rounded-lg border bg-transparent p-3" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/> Show passwords</label>
      <button disabled={!installationVerified||busy} className="mt-5 w-full rounded-lg bg-blue-700 p-3 font-semibold text-white disabled:opacity-50" type="submit">{busy?"Creating owner…":"Create local owner"}</button>
      {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-xs text-zinc-500">Keep your password safely. Local account recovery is not yet implemented; losing it may require an authorized recovery procedure.</p>
    </form>
  </main>;
}
