"use client";
import {useEffect,useState,type FormEvent} from "react";
import {listLocalStaff,signInLocal,lockLocalSession,localStaffLockStatus,type LocalSession,type LocalStaffPublic} from "../../lib/independent/localStaffAuth";

/** Browser-based Independent login; mounted only after offline license verification. */
export default function IndependentLocalSignIn({accountId,onAuthenticated}:{accountId:string;onAuthenticated:(s:LocalSession)=>void}) {
 const [users,setUsers]=useState<LocalStaffPublic[]>([]);
 const [staffId,setStaffId]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [lockedUntil,setLockedUntil]=useState(0);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  lockLocalSession();let active=true;
  void listLocalStaff(accountId).then(list=>{
   if(!active)return;
   const available=list.filter(u=>u.active);
   setUsers(available);
   // Prefer the Owner on a fresh sign-in, never silently assume the first teacher.
   setStaffId(available.find(u=>u.role==="owner")?.id??available[0]?.id??"");
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});
  return()=>{active=false;};
 },[accountId]);
 useEffect(()=>{
  setPassword("");setError("");setLockedUntil(0);
  if(!staffId)return;
  let active=true;
  const check=()=>{void localStaffLockStatus(accountId,staffId).then(status=>{
   if(active){setLockedUntil(status.lockedUntil);setNow(Date.now());}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});};
  check();
  const timer=window.setInterval(check,1000);
  return()=>{active=false;window.clearInterval(timer);};
 },[accountId,staffId]);
 const remainingSeconds=Math.max(0,Math.ceil((lockedUntil-now)/1000));
 const countdown=remainingSeconds>0?`${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,"0")}`:"";
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||remainingSeconds>0)return;
  setBusy(true);setError("");
  try{const s=await signInLocal({accountId,id:staffId,password});setPassword("");onAuthenticated(s);}
  catch(e){setError(e instanceof Error?e.message:"Local sign-in failed");
   try{const status=await localStaffLockStatus(accountId,staffId);setLockedUntil(status.lockedUntil);setNow(Date.now());}catch{}}
  finally{setBusy(false);}
 }
 return <section className="min-h-dvh flex items-center justify-center bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
  <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
   <h1 className="text-xl font-semibold">Eleeveon Schools · Independent</h1>
   <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Sign in securely using this browser installation. An internet connection is not required.</p>
   <label htmlFor="independent-user" className="mt-6 block text-sm font-medium">Local staff account</label>
   <select id="independent-user" className="mt-2 w-full rounded-lg border bg-transparent p-3" value={staffId} onChange={e=>setStaffId(e.target.value)} required>
    <option value="">Select account</option>{users.map(u=><option key={u.id} value={u.id}>{u.displayName} · {u.role.replaceAll("_"," ")}</option>)}
   </select>
   <label htmlFor="independent-password" className="mt-4 block text-sm font-medium">Password</label>
   <input id="independent-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-lg border bg-transparent p-3" disabled={remainingSeconds>0} required/>
   <button type="submit" disabled={busy||!staffId||remainingSeconds>0} className="mt-5 w-full rounded-lg bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
    {busy?"Unlocking…":remainingSeconds>0?`Try again in ${countdown}`:"Unlock this installation"}
   </button>
   {remainingSeconds>0&&<p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">This account is temporarily locked after unsuccessful sign-in attempts. It will unlock automatically in {countdown}. Other accounts are unaffected.</p>}
   {error&&<p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
   <p className="mt-4 text-xs text-zinc-500">For your security, sign in again after closing or restarting the browser. Your school data and local accounts remain stored on this installation.</p>
  </form>
 </section>;
}
