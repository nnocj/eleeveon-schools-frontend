"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getAuthToken } from "../../lib/platformApi";

type Plan={id:string;code?:string;name?:string;description?:string;active?:boolean;licenseModel?:string;deploymentMode?:string;priceOneTime?:number|null;currency?:string|null;metadata?:{visibility?:string;publicVisible?:boolean}|null};
const codes=new Set(["sp003","sp004"]);
function available(p:Plan){return p.active!==false && codes.has(String(p.code||"").toLowerCase()) && p.metadata?.publicVisible!==false && p.metadata?.visibility!=="private";}
function isId(id:string|null){return !!id && /^[a-zA-Z0-9_-]{1,80}$/.test(id);}

/** This is an ONLINE public catalogue and account handoff, not the native offline launcher. */
export default function IndependentStartPage(){
 const [plans,setPlans]=useState<Plan[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [authenticated,setAuthenticated]=useState(false);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 useEffect(()=>{
   setAuthenticated(Boolean(getAuthToken()));
   const qp=new URLSearchParams(window.location.search).get("planId");
   setSelectedId(isId(qp)?qp:null);
   const abort=new AbortController();
   (async()=>{try{
     const r=await fetch(`${API_BASE_URL.replace(/\/$/,"")}/billing/plans`,{signal:abort.signal,cache:"no-store"});
     if(!r.ok)throw Error(`Package catalogue unavailable (${r.status})`);
     const raw=await r.json();const list=Array.isArray(raw)?raw:Array.isArray(raw?.plans)?raw.plans:Array.isArray(raw?.data)?raw.data:[];
     setPlans(list);
   }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Could not load packages");}
   finally{if(!abort.signal.aborted)setLoading(false);}})();return()=>abort.abort();
 },[]);
 const choices=useMemo(()=>plans.filter(available),[plans]);
 return <main className="min-h-dvh bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><div className="mx-auto max-w-5xl">
  <Link href="/" className="text-sm underline">← Eleeveon Schools</Link>
  <h1 className="mt-6 text-3xl font-bold">Independent Eleeveon Schools</h1>
  <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-400">Choose a one-time licence edition. Your school uses the same Eleeveon Schools portals; records are stored locally in the installed application. Hub, support, and package upgrades can use Eleeveon's online services when connected.</p>
  {loading&&<p role="status" className="mt-6">Loading published packages…</p>}
  {error&&<p role="alert" className="mt-6 text-red-700">{error}</p>}
  {!loading&&!error&&choices.length===0&&<p className="mt-6">No publicly available Independent packages are currently listed. The Developer portal must mark sp003 or sp004 active and public before they appear.</p>}
  <div className="mt-8 grid gap-5 sm:grid-cols-2">{choices.map(plan=>{
   const selected=plan.id===selectedId;
   const label=plan.code?.toLowerCase()==="sp004"?"Independent Multi-Device":"Independent Essentials";
   const query=`independentPlanId=${encodeURIComponent(plan.id)}`;
   return <article key={plan.id} className={`rounded-2xl border bg-white p-6 shadow-sm dark:bg-slate-900 ${selected?"border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800":"border-slate-200 dark:border-slate-800"}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">{plan.code} · One-time licence</p>
    <h2 className="mt-2 text-xl font-semibold">{plan.name||label}</h2>
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{plan.description||"Local-first school operations using the existing Eleeveon Schools interface."}</p>
    {Number(plan.priceOneTime)>0?<p className="mt-4 text-2xl font-bold">{plan.currency||"GHS"} {Number(plan.priceOneTime).toLocaleString()}</p>:<p className="mt-4 text-sm">Final licence pricing is confirmed by Eleeveon.</p>}
    <div className="mt-6 grid gap-2">
     <Link href={`/login?${query}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white">{authenticated?"Sign in with another account":"Sign in to my account"}</Link>
     <Link href={`/register?${query}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold dark:border-slate-700">Create an Owner account</Link>
     {authenticated&&<Link href={`/owner/subscription?planId=${encodeURIComponent(plan.id)}&source=independent-start`} className="text-center text-sm font-semibold text-blue-700 underline dark:text-blue-300">Review this package in my Owner account</Link>}
    </div>
    <p className="mt-3 text-xs text-slate-500">Account registration does not activate a licence. The current Owner screen will show purchase availability.</p>
   </article>;
  })}</div>
  <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><strong>Purchasing is not yet enabled for Independent licences.</strong> This page lets schools select a package and use their Owner account, but it does not charge them or issue an installer. Verified one-time Paystack checkout, entitlement activation and download delivery must be implemented and tested before launch.</section>
 </div></main>;
}
