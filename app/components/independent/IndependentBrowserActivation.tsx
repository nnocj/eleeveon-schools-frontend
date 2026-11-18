'use client';
import {useState,type FormEvent} from 'react';
import {activateBrowserLicense} from '../../lib/independent/browserLicense';
import {apiRequest,extractToken,saveAuthToken} from '../../lib/platformApi';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
export default function IndependentBrowserActivation({onActivated}:{onActivated:(claims:OfflineLicenseClaims)=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[key,setKey]=useState(''),[licenseId,setLicenseId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const auth=await apiRequest<any>('/auth/login',{method:'POST',body:JSON.stringify({email:email.trim().toLowerCase(),password})});
  const token=extractToken(auth);if(!token||!auth.user?.accountId)throw new Error('Owner authentication failed');
  const memberships=[...(auth.user?.memberships||[]),...(auth.memberships||[])];
  if(!['owner','super_admin'].includes(String(auth.user?.role||''))&&!memberships.some((m:any)=>m.accountId===auth.user.accountId&&m.active!==false&&['owner','super_admin'].includes(String(m.role))))throw new Error('Only an account owner may activate Independent');
  saveAuthToken(token);
  const claims=await activateBrowserLicense({licenseKey:key.trim(),licenseId:licenseId.trim(),accountId:auth.user.accountId});setPassword('');setKey('');onActivated(claims);
 }catch(err){setError(err instanceof Error?err.message:'Activation failed');}finally{setBusy(false);}}
 return <main className="min-h-dvh grid place-items-center p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-xl border p-6 grid gap-3"><h1 className="text-xl font-semibold">Activate Independent on this PWA</h1><p className="text-sm">Sign in as the commercial account owner. Your school records and staff will remain in this browser's local storage.</p><input required type="email" autoComplete="username" placeholder="Owner email" className="rounded border p-3" value={email} onChange={e=>setEmail(e.target.value)}/><input required type="password" autoComplete="current-password" placeholder="Owner account password" className="rounded border p-3" value={password} onChange={e=>setPassword(e.target.value)}/><input required placeholder="Paid licence ID" className="rounded border p-3" value={licenseId} onChange={e=>setLicenseId(e.target.value)}/><input required type="password" placeholder="Licence activation key" className="rounded border p-3" value={key} onChange={e=>setKey(e.target.value)}/><button disabled={busy} className="rounded bg-blue-700 p-3 text-white">{busy?'Verifying…':'Activate this browser'}</button>{error&&<p role="alert" className="text-red-600">{error}</p>}<p className="text-xs">Browser profiles are not tamper-proof devices. Clearing site data can require reactivation. Do not use private browsing.</p></form></main>;
}
