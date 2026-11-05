"use client";

/**
 * Stage 3 — read-only trial/entitlement overview.
 * Uses the account-scoped Stage 2 endpoint. No writes, no payment, no entitlement rebuild.
 * Mount on Owner Billing Overview and Owner My Subscription.
 */
import React, { useEffect, useState } from "react";
import { fetchCurrentAccess } from "../../lib/subscription/subscriptionApi";
import { deriveStatus } from "../../lib/commercial/accessRules";
import type { EffectiveAccessResponse } from "../../lib/subscription/types";

type Props = {
  onExplorePackages?: () => void;
  refreshKey?: number | string;
};

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function dateLabel(value: string | null | undefined): string {
  if (!value) return "Not configured";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Not configured" : d.toLocaleDateString("en-GH", {day:"numeric",month:"short",year:"numeric"});
}
function calculateDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0,Math.ceil((timestamp-Date.now())/86400000)) : null;
}

export default function TrialAccountSummary({onExplorePackages,refreshKey}:Props) {
  const [access,setAccess] = useState<EffectiveAccessResponse | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);

  useEffect(()=>{
    let mounted=true;
    setLoading(true);
    setError("");
    // Never use an entitlement belonging to the previous authenticated session.
    setAccess(null);
    fetchCurrentAccess()
      .then(result=>{if(mounted)setAccess(result);})
      .catch(err=>{if(mounted)setError(err instanceof Error?err.message:"Entitlement unavailable");})
      .finally(()=>{if(mounted)setLoading(false);});
    return ()=>{mounted=false;};
  },[refreshKey,attempt]);

  if(loading) return <section style={panel} aria-label="Checking trial access"><span style={muted}>Checking trial status and student allowance...</span></section>;
  if(error) return <section style={panel} aria-label="Trial status unavailable"><strong>Unable to verify current trial access</strong><p style={muted}>Reconnect and refresh to view your entitlement and student allowance. The displayed information is not a substitute for backend access checks.</p><button type="button" style={button} onClick={()=>setAttempt(x=>x+1)}>Retry</button></section>;
  if(!access) return null;

  const {snapshot,usage}=access;
  // Do not show a trial banner for paid or perpetual subscriptions.
  const isTrial = snapshot.licenseModel === "trial" || snapshot.source === "trial";
  if(!isTrial) return null;

  const status = deriveStatus({status:snapshot.status,validUntil:snapshot.validUntil,graceEndsAt:snapshot.graceEndsAt});
  const expires = snapshot.validUntil;
  const days = calculateDays(expires);
  const limit = numberValue(snapshot.limits.students);
  const used = numberValue(usage?.students);
  const remaining = limit !== null && used !== null ? Math.max(0,limit-used) : null;
  const unlimited = snapshot.limits.students === null;
  // The scheduled reconciliation may still be in observe mode. An elapsed
  // authoritative validUntil must never be displayed as an active trial.
  const elapsed = !!expires && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= Date.now();
  const expired = elapsed || status === "expired" || status === "cancelled" || status === "suspended";
  const missingExpiry = !expires;
  const usageDate = usage?.calculatedAt && !Number.isNaN(Date.parse(usage.calculatedAt)) ? dateLabel(usage.calculatedAt) : null;

  return <section style={panel} aria-label="Your Eleeveon free trial">
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div><strong style={{fontSize:15}}>Your Free Trial</strong><div style={muted}>{expired?"Trial ended or access restricted":status==="trial"?"Trial in progress":`Access status: ${status}`}</div></div>
      <span style={{padding:"5px 10px",borderRadius:99,fontSize:11,fontWeight:800,background:expired?"#fee2e2":"#dcfce7",color:expired?"#991b1b":"#166534"}}>{expired?"Expired / restricted":status.toUpperCase()}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(132px,1fr))",gap:8}}>
      <Metric title="Days remaining" value={days===null?"Not available":String(days)} sub={missingExpiry?"Expiry unavailable":`Ends ${dateLabel(expires)}`}/>
      <Metric title="Students recorded" value={used===null?"Not available":used.toLocaleString("en-GH")} sub={usageDate?`Last snapshot ${usageDate}`:"Based on available usage snapshot"}/>
      <Metric title="Student allowance" value={unlimited?"Unlimited":limit===null?"Not available":limit.toLocaleString("en-GH")} sub="From your effective entitlement"/>
      <Metric title="Places remaining" value={unlimited?"Unlimited":remaining===null?"Not available":remaining.toLocaleString("en-GH")} sub={remaining===0?"No remaining places under this snapshot":"Calculated from the latest usage snapshot"}/>
    </div>
    {missingExpiry?<p style={{...muted,margin:0}}>Your trial expiry is missing from the entitlement response. Please contact Eleeveon support; an unknown expiry is not unlimited access.</p>:null}
    {expired?<p style={{...muted,margin:0}}>Your trial period has ended. Your existing records are not erased by this notice. Choose a supported paid package to request conversion; activation and any access restrictions are determined by the backend.</p>:null}
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"space-between"}}>
      <span style={muted}>Usage figures can lag behind recently synchronized admissions. Server limits remain authoritative.</span>
      {onExplorePackages?<button type="button" style={button} onClick={onExplorePackages}>{expired ? "View paid packages" : "Explore packages"}</button>:<span style={{...muted,fontWeight:700}}>Open My Subscription to explore packages</span>}
    </div>
  </section>;
}

function Metric({title,value,sub}:{title:string;value:string;sub:string}){
  return <div style={{padding:"11px 12px",border:"1px solid var(--border,rgba(148,163,184,.25))",borderRadius:15,background:"color-mix(in srgb,var(--muted,#64748b) 5%,transparent)",minWidth:0}}>
    <div style={{...muted,fontWeight:700,fontSize:11}}>{title}</div>
    <strong style={{display:"block",fontSize:23,lineHeight:1.4,overflowWrap:"anywhere"}}>{value}</strong>
    <span style={{...muted,fontSize:10}}>{sub}</span>
  </div>;
}
const panel:React.CSSProperties={display:"grid",gap:12,padding:14,borderRadius:20,border:"1px solid var(--border,rgba(148,163,184,.25))",background:"var(--card-bg,var(--card,var(--surface,#fff)))",color:"var(--text,#0f172a)"};
const muted:React.CSSProperties={color:"var(--muted,#64748b)",fontSize:11,lineHeight:1.45};
const button:React.CSSProperties={padding:"10px 13px",borderRadius:99,border:0,fontSize:12,fontWeight:800,cursor:"pointer",background:"var(--primary-color,#2563eb)",color:"white"};
