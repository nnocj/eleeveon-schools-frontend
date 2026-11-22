"use client";
import {useState,type FormEvent} from "react";
import {getApiBaseUrl} from "../../lib/sync/syncConfig";
import {discoverDeploymentContext,type DeploymentContext} from "../../lib/auth/deploymentDiscovery";

/** Staging-only central identity probe. Never grants local portal access. */
export default function IndependentCentralIdentityProbe({licensedAccountId,onVerified}:{licensedAccountId:string;onVerified?:(context:DeploymentContext)=>void}) {
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState<DeploymentContext|null>(null);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");setResult(null);
  try{
   const base=new URL(getApiBaseUrl());
   if(base.protocol!=="https:" && !(base.protocol==="http:" && ["localhost","127.0.0.1"].includes(base.hostname))) throw Error("Secure Eleeveon API connection required.");
   const endpoint=new URL(`${base.pathname.replace(/\/$/,"")}/auth/login`,base.origin);
   const response=await fetch(endpoint.toString(),{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},cache:"no-store",credentials:"omit",body:JSON.stringify({email:email.trim().toLowerCase(),password})});
   const payload:unknown=await response.json();
   if(!response.ok)throw Error("Eleeveon sign-in failed. Check your email and password.");
   if(!payload || typeof payload!=="object")throw Error("Invalid authentication response.");
   const data=payload as Record<string,unknown>;
   const token=data.accessToken??data.access_token??data.token;
   if(typeof token!=="string"||!token)throw Error("Authentication response did not include an access token.");
   const context=await discoverDeploymentContext(getApiBaseUrl(),token);
   if(context.accountId!==licensedAccountId)throw Error("This Eleeveon account does not own the activated Independent license.");
   // No JWT persistence: this is identity discovery only, not offline provisioning.
   setResult(context);setPassword("");onVerified?.(context);
  }catch(e){setError(e instanceof Error?e.message:"Unable to verify central identity.");}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border p-5 space-y-3 max-w-lg" aria-label="Central identity integration test">
  <h2 className="font-semibold text-lg">Eleeveon central sign-in test</h2>
  <p className="text-sm">Staging verification only. This does not unlock Independent or replace offline sign-in yet.</p>
  <form onSubmit={submit} className="space-y-3">
   <label className="block text-sm">Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="block w-full rounded border p-2"/></label>
   <label className="block text-sm">Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="block w-full rounded border p-2"/></label>
   <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy?"Verifying…":"Verify central account"}</button>
  </form>
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  {result&&<div role="status" className="text-sm"><p>Central account verified for this licensed school.</p><p>Memberships: {result.memberships.length} · Deployment: {result.entitlement?.deploymentMode??"not configured"}</p><p>Portal routing remains disabled until device provisioning and server authorization are complete.</p></div>}
 </section>;
}
