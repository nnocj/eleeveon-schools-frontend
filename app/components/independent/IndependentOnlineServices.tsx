"use client";
import {useEffect,useState} from 'react';
import {clearOnlineServicesSession,setOnlineServicesSession} from '../../lib/independent/onlineServicesSession';
import {getApiBaseUrl} from '../../lib/sync/syncConfig';
type Bridge={setOnlineServicesAccess?:(enabled:boolean)=>Promise<unknown>;openServicePage?:(page:string)=>Promise<unknown>};
function native():Bridge|undefined{return (window as Window & {EleeveonIndependentNative?:Bridge}).EleeveonIndependentNative;}
/** Online login authorizes Hub/support only. Local Owner/Teacher access stays independent. */
export default function IndependentOnlineServices({accountId}:{accountId:string}){
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(false),[connected,setConnected]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{clearOnlineServicesSession();void native()?.setOnlineServicesAccess?.(false);},[]);
 async function enable(){try{setError('');if(!native()?.setOnlineServicesAccess)throw Error('Online services native bridge is missing');await native()!.setOnlineServicesAccess!(true);setEnabled(true);}catch(e){setError(e instanceof Error?e.message:'Could not enable online services');}}
 async function connect(){setBusy(true);setError('');try{
  if(!enabled)throw Error('Enable online services first');
  const origin=new URL(getApiBaseUrl()).origin;
  // This login is to the official remote backend, NEVER to local IndexedDB.
  const res=await fetch(`${origin}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password}),cache:'no-store'});
  const body=await res.json();if(!res.ok)throw Error(String(body?.message||`Online sign-in failed (${res.status})`));
  const token=body?.accessToken||body?.token||body?.access_token;
  if(typeof token!=='string'||body?.user?.accountId!==accountId)throw Error('Online account does not match the licensed school account.');
  setOnlineServicesSession(token,accountId);setPassword('');setConnected(true);
 }catch(e){setError(e instanceof Error?e.message:'Online sign-in failed');}finally{setBusy(false);}}
 async function disconnect(){clearOnlineServicesSession();setConnected(false);setPassword('');await native()?.setOnlineServicesAccess?.(false);setEnabled(false);}
 async function openWeb(page:string){try{setError('');if(!native()?.openServicePage)throw Error('Native website opener unavailable');await native()!.openServicePage!(page);}catch(e){setError(e instanceof Error?e.message:'Could not open website');}}
 return <div className="border-b border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-900">
  <div className="flex flex-wrap items-center gap-2"><strong>Online Eleeveon services</strong><span>{connected?'Hub/support connected':enabled?'Online access enabled · sign in for Hub':'Local-only by default'}</span><button className="rounded border px-3 py-1" onClick={()=>setOpen(v=>!v)}>{open?'Close':'Manage'}</button></div>
  {open&&<div className="my-2 max-w-xl space-y-2"><p>School records remain local. An online session is separate from your Independent staff login. Internet is required for Hub, support and purchasing/upgrading packages.</p>
  <div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-2" onClick={()=>void openWeb('/owner/subscriptions')}>Upgrade or change plan on Eleeveon website</button><button className="rounded border px-3 py-2" onClick={()=>void openWeb('/login')}>Open online account</button></div>
  {!enabled&&<button className="rounded border px-3 py-2" onClick={()=>void enable()}>Enable Eleeveon online services</button>}
  {enabled&&!connected&&<div className="space-y-2"><label className="block">Online account email<input className="ml-2 rounded border px-2 py-1" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block">Online account password<input className="ml-2 rounded border px-2 py-1" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="rounded border px-3 py-2" disabled={busy||!email||!password} onClick={()=>void connect()}>{busy?'Connecting…':'Connect Hub and support'}</button></div>}
  {connected&&<button className="rounded border px-3 py-2" onClick={()=>void disconnect()}>Disconnect online services</button>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <p className="text-xs">Online account authorization is checked by the Eleeveon backend. Remote service traffic is restricted to authentication, support, billing and licensing endpoints. School SyncRecord push/pull remains blocked. Some Hub realtime and attachment functions may require additional server transport integration.</p></div>}</div>;
}
