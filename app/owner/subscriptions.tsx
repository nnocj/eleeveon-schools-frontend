"use client";

/**
 * app/owner/subscriptions.tsx
 * Owner package selection — Cloud, trials, private pilots and Independent licences.
 * Commercial quote is a preview, never a payment authorization.
 */
import React, { useEffect, useMemo, useState } from "react";
import PaymentCheckout from "../components/payments/PaymentCheckout";
import TrialAccountSummary from "./components/TrialAccountSummary";
import { authHeaders, getApiBase, money, readJson } from "../components/payments/payment-utils";
import { calculateStudentPrice, type StudentPricing } from "../lib/commercial/studentPricing";

type Cycle = "monthly" | "termly" | "yearly";
type Json = Record<string, unknown>;
type Plan = {
  id: string; name: string; code: string; description?: string|null;
  currency?: string|null; active?: boolean; licenseModel?: string|null;
  deploymentMode?: string|null; availableAcquisitionModes?: string[]|null;
  priceMonthly?: number|null; priceTermly?: number|null; priceYearly?: number|null;
  priceOneTime?: number|null; maxSchools?: number|null; maxBranches?: number|null;
  maxUsers?: number|null; maxStudents?: number|null; maxTeachers?: number|null;
  maxStorageMb?: number|null; features?: string[]|null;
  metadata?: (Json & { pricing?: StudentPricing; visibility?: string; publicVisible?: boolean;
    trialDays?: number; featureFlags?: Record<string,boolean>; featureKeys?: string[] })|null;
  [key: string]: unknown;
};
type Payment = { status?: string|null };
type ServerQuote = {
  id: string; accountId?: string; toPlanId: string; status: string;
  currency: string; amountDue: number; quoteExpiresAt: string;
  calculation?: { studentCount?: number; studentPricingMode?: string };
  payment?: { providerReference?: string; authorizationUrl?: string; status?: string };
};
const STUDENT_CHECKOUT_ENABLED = ["test", "live"].includes(
  (process.env.NEXT_PUBLIC_STUDENT_PRICED_CHECKOUT_MODE || "off").toLowerCase()
);
const PENDING_QUOTE_KEY = "eleeveon_owner_student_checkout_quote";

type Invoice = { status?: string|null; invoiceNumber?: string; total?: number; currency?: string };
type Subscription = {
  id?: string; planId?: string|null; plan?: Plan|null; status?: string|null;
  billingCycle?: string|null; currentPeriodEnd?: string|null; trialEndsAt?: string|null;
  invoices?: Invoice[]; payments?: Payment[];
};
const LABELS: Record<string,string> = {
  offlineSync:"Offline-first synchronization", cloudBackup:"Cloud backup", reports:"Assessment and reports",
  finance:"Finance", attendance:"Attendance", identityCards:"ID cards", identitySafety:"Identity and safety",
  transport:"Transport", schoolWebsites:"School websites", communications:"Communication",
  calendarScheduling:"Calendar and scheduling", teacherPortal:"Teacher workspace",
  parentPortal:"Parent portal", studentPortal:"Student portal", advancedAnalytics:"Advanced analytics", apiAccess:"API access"
};
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const formatDate = (v?:string|null) => {
  if (!v) return "No scheduled expiry";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "Not available" : d.toLocaleDateString("en-GH",{year:"numeric",month:"short",day:"numeric"});
};
const array = (v:any): any[] => {
  if (Array.isArray(v)) return v;
  for (const k of ["plans","data","items","results"]) if(Array.isArray(v?.[k])) return v[k];
  return [];
};
function mode(plan:Plan):"trial"|"complimentary"|"perpetual"|"subscription" {
  const m=norm(plan.licenseModel);
  if(m==="trial") return "trial";
  if(m==="complimentary" || m==="pilot") return "complimentary";
  if(m==="perpetual") return "perpetual";
  return "subscription";
}
function privatePlan(p:Plan) {
  const meta=p.metadata;
  return meta?.publicVisible===false || ["private","internal","hidden"].includes(norm(meta?.visibility)) ||
    (Array.isArray(p.availableAcquisitionModes) && p.availableAcquisitionModes.length>0 &&
       p.availableAcquisitionModes.every(a=>["private_offer","complimentary","pilot","internal"].includes(norm(a))));
}
function deploy(p:Plan) {
  const d=norm(p.deploymentMode);
  if(d.includes("multi_device"))return "Independent Multi-device";
  if(d.includes("essentials"))return "Independent Essentials";
  if(d.includes("private")||d.includes("hosted"))return "Private deployment";
  return "Eleeveon Cloud";
}
function kind(p:Plan) {
  if(mode(p)==="trial")return "Free trial";
  if(mode(p)==="complimentary"||privatePlan(p))return "Private arrangement";
  if(mode(p)==="perpetual")return "One-time licence";
  return "Cloud subscription";
}
function pricing(p:Plan): StudentPricing {
  const v=p.metadata?.pricing;
  return v && ["fixed","per_student","tiered"].includes(v.mode) ? v : {mode:"fixed"};
}
function fixedPrice(p:Plan,c:Cycle) {
  if(c==="yearly")return Number(p.priceYearly||0);
  if(c==="termly")return Number(p.priceTermly||0) || Number(p.priceMonthly||0)*4;
  return Number(p.priceMonthly||0);
}
function quote(p:Plan,studentCount:number,cycle:Cycle) {
  if(mode(p)==="trial"||mode(p)==="complimentary")return {amount:0,period:"trial",estimated:false};
  if(mode(p)==="perpetual")return {amount:Number(p.priceOneTime||0),period:"one-time",estimated:false};
  const conf=pricing(p);
  if(conf.mode!=="fixed")return {amount:calculateStudentPrice(conf,studentCount),period:conf.billingPeriod||"termly",estimated:true};
  return {amount:fixedPrice(p,cycle),period:cycle,estimated:false};
}
function paidEvidence(s:Subscription|null) {
  return !!s?.payments?.some(p=>norm(p.status)==="paid") || !!s?.invoices?.some(i=>norm(i.status)==="paid");
}
function trialWindow(s: Subscription | null) {
  const trial = norm(s?.status) === "trial";
  const timestamp = s?.trialEndsAt ? Date.parse(s.trialEndsAt) : NaN;
  const known = Number.isFinite(timestamp);
  const expired = trial && known && timestamp <= Date.now();
  const days = trial && known ? Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000)) : null;
  return { trial, known, expired, days, endsAt: s?.trialEndsAt || null };
}
function currentAccess(s:Subscription|null) {
  if(!s)return false;
  const st=norm(s.status);
  const type=s.plan?mode(s.plan):"subscription";
  if(st==="trial")return !trialWindow(s).expired;
  if(st!=="active")return false;
  if(type==="trial"||type==="complimentary")return true;
  if(s.plan && (privatePlan(s.plan) || norm(s.plan.code).startsWith("pilot_")))return true;
  // The backend subscription status is authoritative for an active subscription.
  // Payments can belong to another invoice; lack of one here is not proof of pending status.
  return true;
}
function features(p:Plan) {
  const flags=p.metadata?.featureFlags||{};
  const keys = new Set<string>([...(p.features||[]),...(p.metadata?.featureKeys||[]),
    ...Object.keys(flags).filter(k=>flags[k]===true)]);
  const output = [
    p.maxSchools==null?"Flexible schools":`${p.maxSchools} schools`,
    p.maxBranches==null?"Flexible branches":`${p.maxBranches} branches`,
    p.maxUsers==null?"Flexible users":`${p.maxUsers} users`,
    p.maxStudents==null?"Flexible students":`${p.maxStudents} students`,
    p.maxTeachers==null?"Flexible teachers":`${p.maxTeachers} teachers`,
  ];
  for(const key of keys) if(flags[key]!==false && p[key]!==false) output.push(LABELS[key]||key.replace(/([a-z])([A-Z])/g,"$1 $2"));
  return Array.from(new Set(output));
}
export default function OwnerSubscriptionPage() {
  const [plans,setPlans]=useState<Plan[]>([]);
  const [current,setCurrent]=useState<Subscription|null>(null);
  const [cycle,setCycle]=useState<Cycle>("termly");
  const [count,setCount]=useState(200);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [moreOpen,setMoreOpen]=useState(false);
  const [selectedPlan,setSelectedPlan]=useState<Plan|null>(null);
  const [studentCheckoutPlan,setStudentCheckoutPlan]=useState<Plan|null>(null);
  const [serverQuote,setServerQuote]=useState<ServerQuote|null>(null);
  const [checkoutBusy,setCheckoutBusy]=useState(false);
  const [payerEmail,setPayerEmail]=useState("");
  const [quotePaymentOpen,setQuotePaymentOpen]=useState(false);
  const [checkoutError,setCheckoutError]=useState("");
  const [recoveredCheckoutUrl,setRecoveredCheckoutUrl]=useState<string|null>(null);
  // A pending payment must remain recoverable after returning from Paystack,
  // closing the sheet, or refreshing the Owner portal. This ID is only a UI hint:
  // every recovery request is independently authorized by the backend.
  const [pendingQuoteId,setPendingQuoteId]=useState<string|null>(null);

  const apiBase=getApiBase();

  async function load(preserveNotice=false) {
    try {
      setLoading(true);setError("");if(!preserveNotice)setNotice("");
      const [pr,sr]=await Promise.all([
        fetch(`${apiBase}/billing/plans`,{headers:authHeaders()}),
        fetch(`${apiBase}/billing/my-subscription`,{headers:authHeaders()})
      ]);
      if(!pr.ok)throw new Error(`Unable to load packages (${pr.status}).`);
      const pj=await readJson(pr);
      const active=array(pj).filter((p:Plan)=>p.active!==false) as Plan[];
      setPlans(active);
      if(sr.ok){const sj=await readJson(sr);setCurrent(sj?.subscription||sj?.data||sj||null);}
      else if(sr.status===404)setCurrent(null);
      else throw new Error(`Unable to load your current package (${sr.status}).`);
      const params=new URLSearchParams(window.location.search);
      const c=params.get("billingCycle");
      if(c==="monthly"||c==="termly"||c==="yearly")setCycle(c);
      const requested=params.get("planId");
      if(requested && params.get("checkout")==="1"){
        const selected=active.find(p=>p.id===requested);
        // Never auto-open an unsupported commercial checkout.
        if(selected && mode(selected)==="subscription" && pricing(selected).mode==="fixed" && fixedPrice(selected,(c==="monthly"||c==="termly"||c==="yearly")?c:"termly")>0) setSelectedPlan(selected);
        else setNotice("Your package is available for review. Activation or checkout is not yet available here for this package type.");
        const url=new URL(window.location.href);
        ["planId","checkout","billingCycle","source"].forEach(k=>url.searchParams.delete(k));
        window.history.replaceState({},"",url.toString());
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not load packages.");}
    finally{setLoading(false);}
  }
  async function quoteRequest(path:string, body?:Record<string,unknown>):Promise<any> {
    const response=await fetch(`${apiBase}${path}`, {
      method:body?"POST":"GET",
      headers:{...authHeaders(),...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const payload=await readJson(response);
    if(!response.ok) throw new Error(String(payload?.message || payload?.error || `Request failed (${response.status}).`));
    return payload;
  }
  function openStudentCheckout(plan:Plan){
    setStudentCheckoutPlan(plan);setServerQuote(null);setCheckoutError("");setRecoveredCheckoutUrl(null);
    try{if(sessionStorage.getItem(PENDING_QUOTE_KEY))setCheckoutError("A previous checkout was started. Check its status before requesting another payment.");}catch{}
  }
  async function requestServerQuote(){
    if(!studentCheckoutPlan||checkoutBusy)return;
    try{if(sessionStorage.getItem(PENDING_QUOTE_KEY)){setCheckoutError("Review the previous quotation first. Do not create another payment request until it is resolved.");return;}}catch{}
    setCheckoutBusy(true);setCheckoutError("");
    try {
      const result=await quoteRequest("/billing/subscription-quotes", {
        toPlanId:studentCheckoutPlan.id,billingCycle:pricing(studentCheckoutPlan).billingPeriod || "termly",
        // Student-priced checkout currently supports new and renewal orders only.
        // A trial, pending or expired account must start a new paid subscription.
        changeType: current?.id && norm(current.status)==="active" && current.planId===studentCheckoutPlan.id
          ? "renewal" : "new",
        effectiveMode:"immediate",
      }) as ServerQuote;
      if(!result.id || result.toPlanId!==studentCheckoutPlan.id ||
         !Number.isFinite(result.amountDue) || result.amountDue<=0 ||
         result.currency!=="GHS" || result.status!=="quoted" ||
         !result.calculation?.studentCount ||
         new Date(result.quoteExpiresAt).getTime()<=Date.now()) {
        throw new Error("The server did not return a valid payable student quotation.");
      }
      setServerQuote(result);
      try{sessionStorage.setItem(PENDING_QUOTE_KEY,result.id);}catch{}
      setPendingQuoteId(result.id);
    }catch(error){setCheckoutError(error instanceof Error?error.message:"Unable to prepare quotation.");}
    finally{setCheckoutBusy(false);}
  }
  async function refreshQuoteStatus(){
    const quoteId=pendingQuoteId || serverQuote?.id || (()=>{try{return sessionStorage.getItem(PENDING_QUOTE_KEY)}catch{return null}})();
    if(!quoteId||checkoutBusy)return;
    setCheckoutBusy(true);setCheckoutError("");
    try{
      const recovery=await quoteRequest(`/billing/subscription-quotes/${encodeURIComponent(quoteId)}/recover`) as {
        changeOrderId:string; status:string; applied:boolean; authorizationUrl?:string|null; requiresManualReview?:boolean; verification?:string;
      };
      const result=await quoteRequest(`/billing/subscription-quotes/${encodeURIComponent(quoteId)}`) as ServerQuote;
      setServerQuote(result);
      if(result.id!==quoteId || recovery.changeOrderId!==quoteId){
        throw new Error("The server returned an inconsistent quotation reference. Please contact support.");
      }
      if(recovery.authorizationUrl){
        setCheckoutError("Your existing Paystack checkout is available. Open that same session below; do not create a second payment.");
        setRecoveredCheckoutUrl(recovery.authorizationUrl);
      } else {
        setRecoveredCheckoutUrl(null);
      }
      if(recovery.requiresManualReview){
        setCheckoutError("The earlier payment attempt is not resolved. Please contact support with the quotation ID. Do not pay again.");
      }
      if(["cancelled","expired"].includes(result.status)){
        try{sessionStorage.removeItem(PENDING_QUOTE_KEY)}catch{}
        setPendingQuoteId(null);
      }
      if(result.status==="applied"){
        try{sessionStorage.removeItem(PENDING_QUOTE_KEY)}catch{}
        setPendingQuoteId(null);
        await load(true);setNotice("The server confirms your subscription was activated.");
      } else if(["payment_pending","checkout_initializing","paid"].includes(result.status)){
        setCheckoutError("Payment is being processed. Verify its status before any new checkout; do not pay twice.");
      }
    }catch(error){
      const message=error instanceof Error?error.message:"Could not refresh payment status.";
      setCheckoutError(message);
      setNotice(`Payment status could not be confirmed. Keep your payment reference and contact support if necessary. ${message}`);
    }
    finally{setCheckoutBusy(false);}
  }
  async function beginStudentPayment(){
    if(!studentCheckoutPlan||!serverQuote||checkoutBusy)return;
    const email=payerEmail.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setCheckoutError("Enter a valid payer email address.");return;}
    if(serverQuote.status!=="quoted" || Date.parse(serverQuote.quoteExpiresAt)<=Date.now()){
      setCheckoutError("This quotation is no longer payable. Refresh the quotation status.");return;
    }
    setCheckoutBusy(true);setCheckoutError("");
    setServerQuote(previous=>previous?{...previous,status:"checkout_initializing"}:previous);
    try{
      const result=await quoteRequest(`/billing/subscription-quotes/${encodeURIComponent(serverQuote.id)}/pay`,{
        paymentMethod:"card",provider:"paystack",payerEmail:email,
      });
      const url=String(result.authorizationUrl||result.providerResponse?.authorizationUrl||"");
      if(!url || !url.startsWith("https://") || !(new URL(url).hostname === "paystack.com" || new URL(url).hostname.endsWith(".paystack.com"))){
        throw new Error("No valid Paystack checkout link was returned. Check payment status; do not attempt another charge.");
      }
      window.location.assign(url);
    }catch(error){
      setCheckoutError(`${error instanceof Error?error.message:"Checkout could not start."} Check the quotation status before trying again.`);
      // Do not automatically allow another payment attempt: the server may already have initialized checkout.
    }finally{setCheckoutBusy(false);}
  }
  async function verifyRedirect(reference:string){
    try {
      setNotice("Verifying payment with the server...");
      const res=await fetch(`${apiBase}/billing/payments/verify/${encodeURIComponent(reference)}?provider=paystack`,{headers:authHeaders()});
      await readJson(res);
      if(!res.ok)throw new Error("Payment could not be verified.");
      await load(true);
      setNotice("The provider verification request completed. Your paid access is confirmed only when your subscription and entitlement are active.");
      // Even after provider verification, the change order might require
      // asynchronous entitlement reconciliation. Do not erase its recovery ID. 
      const url=new URL(window.location.href);url.searchParams.delete("reference");window.history.replaceState({},"",url.toString());
    }catch(e){setError(e instanceof Error?e.message:"Verification failed.");}
  }
  useEffect(()=>{
    try { setPendingQuoteId(sessionStorage.getItem(PENDING_QUOTE_KEY)); } catch {}
    void load();
    const reference=new URLSearchParams(window.location.search).get("reference");
    if(reference)void verifyRedirect(reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const allPlans=useMemo(()=>{
    const q=norm(search);
    const owned=current?.plan;
    const available=plans.filter(p=>!privatePlan(p)||p.id===owned?.id||p.id===current?.planId);
    if(owned && !available.some(p=>p.id===owned.id))available.unshift(owned);
    return available.filter(p=>!q||[p.name,p.code,p.description,kind(p),deploy(p),...features(p)].join(" ").toLowerCase().includes(q))
      .sort((a,b)=>Number(a.metadata?.displayOrder??999)-Number(b.metadata?.displayOrder??999));
  },[plans,current,search]);
  const quotedPlans=useMemo(()=>allPlans.filter(p=>mode(p)==="subscription" && pricing(p).mode!=="fixed" && !privatePlan(p)),[allPlans]);
  const windowStatus = trialWindow(current);
  const active=currentAccess(current);
  const subscriptionRestricted = ["expired", "suspended", "cancelled"].includes(norm(current?.status)) || windowStatus.expired;
  const trialEndingSoon = windowStatus.trial && windowStatus.known && !windowStatus.expired && windowStatus.days !== null && windowStatus.days <= 7;
  const paidOptions = allPlans.filter(canPayForPlan);
  function canPayForPlan(p:Plan) {
    return mode(p)==="subscription" && !privatePlan(p) &&
      (pricing(p).mode==="fixed" ? fixedPrice(p,cycle)>0 : STUDENT_CHECKOUT_ENABLED);
  }
  function jumpToPaidPlans() {
    setSearch("");
    window.requestAnimationFrame(()=>document.getElementById("owner-commercial-packages")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  const currentId=current?.planId||current?.plan?.id;
  const currentPlan=current?.plan || plans.find(p=>p.id===currentId);
  const st=norm(current?.status);
  const trial=st==="trial";
  const pending=!!current && ["pending","pending_payment","unpaid","processing"].includes(st);
  const displayCurrency=(p:Plan)=>p.currency||"GHS";
  function buttonLabel(p:Plan,isCurrent:boolean) {
    if(isCurrent)return "Current package";
    if(mode(p)==="trial")return "Trial activation coming soon";
    if(mode(p)==="perpetual")return "Licence checkout coming soon";
    if(pricing(p).mode!=="fixed")return STUDENT_CHECKOUT_ENABLED?"Get verified quote":"Student checkout not yet enabled";
    if(mode(p)==="complimentary")return "Managed by Eleeveon";
    return fixedPrice(p,cycle)>0?"Choose payment":"Contact Eleeveon";
  }
  function canCheckout(p:Plan) {
    return canPayForPlan(p);
  }
  return (
    <main className="ba-page subscription-page">
      <style>{css}</style>
      <section className="ba-search-card" aria-label="Package search and actions">
        <label className="ba-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search packages..." aria-label="Search packages"/></label>
        <button type="button" className="ba-add-inline" onClick={()=>setCycle(v=>v==="monthly"?"termly":v==="termly"?"yearly":"monthly")} title="Change fixed subscription billing period">{cycle==="monthly"?"Month":cycle==="termly"?"Term":"Year"}</button>
        <button type="button" className="ba-filter-button" onClick={()=>void load()} disabled={loading} aria-label="Refresh">↻</button>
        <button type="button" className="ba-icon-button" onClick={()=>setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>
      <style>{`.trial-conversion-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:15px;border:1px solid var(--border,rgba(148,163,184,.3));background:var(--card-bg,var(--surface,#fff))}.trial-conversion-notice>div{flex:1 1 240px;min-width:0}.trial-conversion-notice strong{font-size:14px}.trial-conversion-notice p{margin:4px 0;font-size:12px;line-height:1.45}.trial-conversion-notice small{display:block;color:var(--muted,#64748b);font-size:11px}.trial-conversion-notice button{border:0;border-radius:12px;background:var(--primary-color,#2563eb);color:white;padding:10px 13px;font-weight:800;cursor:pointer}.trial-conversion-notice button:focus-visible{outline:2px solid currentColor;outline-offset:3px}`}</style>
      <section className="ba-list compact-status-list" aria-label="Current commercial arrangement">
        <button type="button" className="status-row" onClick={()=>setMoreOpen(true)}>
          <span className="status-icon">{active?"✓":pending?"!":"○"}</span>
          <span className="status-main"><strong>{currentPlan?.name || "Choose your package"}</strong>
            <small>{currentPlan?kind(currentPlan):"No active package"} · {current?.status||"Not selected"}</small>
            <em>{windowStatus.expired?`Trial ended ${formatDate(windowStatus.endsAt)}`:trial?`Trial ends ${formatDate(current?.trialEndsAt||current?.currentPeriodEnd)}`:pending?"Awaiting confirmation":active?`Access active · ${formatDate(current?.currentPeriodEnd)}`:"Explore available packages"}</em>
          </span>
          <span className="status-side"><span className={`status-dot-mini ${active?"green":pending?"orange":"gray"}`}/><i>⋯</i></span>
        </button>
        {subscriptionRestricted ? <section className="trial-conversion-notice" role="status"><div><strong>Your package needs attention</strong><p>{windowStatus.expired ? `Your trial ended on ${formatDate(windowStatus.endsAt)}.` : `Your subscription status is ${current?.status || "restricted"}.`} Your school records are not deleted. Access and permitted actions depend on the server's effective entitlement.</p><small>{paidOptions.length ? "Select a supported paid cloud package below to begin checkout. A package is activated only after the server confirms payment." : "No self-service paid package is currently available. Please contact Eleeveon for conversion."}</small></div><button type="button" onClick={jumpToPaidPlans}>View paid packages</button></section> : null}
        {trialEndingSoon ? <section className="trial-conversion-notice" role="status"><div><strong>{windowStatus.days === 0 ? "Trial ends today" : `${windowStatus.days} day${windowStatus.days === 1 ? "" : "s"} left in your trial`}</strong><p>Your trial ends {formatDate(windowStatus.endsAt)}. Choose a supported paid package before it ends to avoid an interruption.</p></div><button type="button" onClick={jumpToPaidPlans}>Explore paid packages</button></section> : null}
        {pendingQuoteId?<section className="trial-conversion-notice" role="status">
          <div><strong>Unresolved subscription quotation</strong><p>A previous checkout or quotation is recorded on this device. Check it before starting another payment. A status check does not charge you.</p><small>Reference: {pendingQuoteId}</small></div>
          <button type="button" disabled={checkoutBusy} onClick={()=>void refreshQuoteStatus()}>{checkoutBusy?"Checking…":"Check pending payment"}</button>
          {recoveredCheckoutUrl?<a href={recoveredCheckoutUrl} target="_blank" rel="noopener noreferrer">Continue existing Paystack session</a>:null}
        </section>:null}
        {pending?<SlimNotice tone="orange">A pending package requires confirmation before activation. Do not make a duplicate payment until the invoice and provider status have been checked.</SlimNotice>:null}
        {notice?<SlimNotice tone="green">{notice}</SlimNotice>:null}
        {error?<SlimNotice tone="red">{error}</SlimNotice>:null}
        {loading?<SlimNotice tone="gray">Loading packages...</SlimNotice>:null}
      </section>
      {!loading && current ? <TrialAccountSummary refreshKey={`${current?.id || ""}:${current?.status || ""}:${current?.trialEndsAt || ""}`} onExplorePackages={jumpToPaidPlans}/> : null}
      {!loading && !current ? <SlimNotice tone="orange">No subscription is assigned to this account. New account trial provisioning is being corrected; an existing account must be reviewed separately. You can explore packages, but server quotations require synchronized students.</SlimNotice> : null}
      <section className="quote-panel" aria-label="Instant student quotation">
        <div className="quote-heading"><strong>Get an instant student quote</strong><small>Enter the number of students. Estimated prices appear here, regardless of the package cards below.</small></div>
        <div className="quote-layout">
          <label className="quote-field"><span>Number of students</span><input type="number" min="1" max="1000000" value={count} onChange={e=>setCount(Math.min(1000000,Math.max(1,Math.floor(Number(e.target.value)||1))))}/></label>
          <div className="quote-results">
            {quotedPlans.length?quotedPlans.map(p=>{
              const q=quote(p,count,cycle);
              return <div className="quote-result" key={p.id}><div><strong>{p.name}</strong><small>{deploy(p)} · /{q.period}</small></div><b>{q.amount==null?"Quote unavailable":money(q.amount,displayCurrency(p))}</b></div>;
            }):<div className="quote-result"><span>No published per-student pricing available.</span></div>}
          </div>
        </div>
        <small className="quote-disclaimer">Estimates only. Your invoice and payment amount must be confirmed by the server. No payment is initiated by entering a student count.</small>
      </section>
      {!loading&&!allPlans.length?<section className="ba-empty"><h3>No packages found</h3><p>Try adjusting your search.</p></section>:null}
      <section id="owner-commercial-packages" className="plans-grid" aria-label="Commercial packages">
        {allPlans.map(p=>{
          const q=quote(p,count,cycle);
          const isCurrent=!!currentId&&currentId===p.id&&active;
          const waiting=!!currentId&&currentId===p.id&&pending;
          const disabled=isCurrent||!canCheckout(p);
          return <article key={p.id} className={isCurrent?"plan current":waiting?"plan waiting":"plan"}>
            {isCurrent?<div className="ribbon">Current</div>:waiting?<div className="ribbon waiting-ribbon">Pending</div>:null}
            <div><span className="badge">{p.code} · {kind(p)}</span><h2>{p.name}</h2><p>{p.description||"An Eleeveon Schools package."}</p></div>
            <div className="price"><div><strong>{mode(p)==="trial"||mode(p)==="complimentary"?"Included":q.amount==null?"Request quote":money(q.amount,displayCurrency(p))}</strong>
              <span>{mode(p)==="trial"?`· ${Number(p.metadata?.trialDays||14)}-day trial`:mode(p)==="perpetual"?"· one-time licence":mode(p)==="complimentary"?"· complimentary":`/${q.period}`}</span></div>
              <small>{q.estimated?`Estimate for ${count.toLocaleString()} students`:mode(p)==="perpetual"?deploy(p):mode(p)==="trial"?"No upfront payment":"Price is configured by the package"}</small>
            </div>
            <ul>{features(p).slice(0,16).map(f=><li key={f}>✓ {f}</li>)}</ul>
            <button type="button" disabled={disabled} onClick={()=>pricing(p).mode==="fixed"?setSelectedPlan(p):openStudentCheckout(p)}>{buttonLabel(p,isCurrent)}</button>
          </article>;
        })}
      </section>
      {moreOpen?<div className="ba-sheet-backdrop" role="dialog" aria-modal="true"><section className="ba-sheet small">
        <div className="ba-sheet-head"><div><h2>Package details</h2><p>Your current commercial arrangement</p></div><button type="button" onClick={()=>setMoreOpen(false)}>✕</button></div>
        <div className="sub-info-list"><InfoLine label="Package" value={currentPlan?.name||"None"}/><InfoLine label="Type" value={currentPlan?kind(currentPlan):"Not selected"}/><InfoLine label="Deployment" value={currentPlan?deploy(currentPlan):"—"}/><InfoLine label="Status" value={current?.status||"None"}/><InfoLine label="Access until" value={formatDate(current?.trialEndsAt||current?.currentPeriodEnd)}/><InfoLine label="Payment recorded" value={paidEvidence(current)?"Yes":"No paid record in this response"}/></div>
        <div className="cycle-sheet">{(["termly","monthly","yearly"] as Cycle[]).map(c=><button key={c} type="button" className={cycle===c?"active":""} onClick={()=>setCycle(c)}>{c}</button>)}</div>
        <div className="ba-menu-list"><button type="button" onClick={()=>{setMoreOpen(false);void load()}}><span>↻</span><b>Refresh</b><small>Reload account and catalogue</small></button></div>
      </section></div>:null}
      {studentCheckoutPlan?<div className="ba-sheet-backdrop" role="presentation"><section className="ba-sheet small" role="dialog" aria-modal="true" aria-label="Verified student subscription checkout">
        <div className="ba-sheet-head"><div><h2>{studentCheckoutPlan.name}</h2><p>Verified server quotation · Paystack</p></div><button type="button" disabled={checkoutBusy} onClick={()=>{setStudentCheckoutPlan(null);setServerQuote(null);setQuotePaymentOpen(false);}}>✕</button></div>
        <div className="student-checkout-content">
          <p>The amount shown on package cards is an estimate. Your school's enrolled student count and amount are verified by the backend before payment.</p>
          {serverQuote?<div className="student-checkout-quote">
            <strong>{money(serverQuote.amountDue,serverQuote.currency)}</strong>
            <span>{serverQuote.calculation?.studentCount ?? "—"} students · expires {formatDate(serverQuote.quoteExpiresAt)}</span>
            <small>Quotation status: {serverQuote.status}</small>
          </div>:null}
          {checkoutError?<p role="alert" className="student-checkout-error">{checkoutError}</p>:null}
          {!serverQuote?<button type="button" className="student-checkout-primary" disabled={checkoutBusy} onClick={()=>void requestServerQuote()}>{checkoutBusy?"Preparing quotation…":"Get server quotation"}</button>:null}
          {serverQuote?.status==="quoted"?<>
            <button type="button" className="student-checkout-primary"
              disabled={checkoutBusy || new Date(serverQuote.quoteExpiresAt).getTime()<=Date.now()}
              onClick={()=>setQuotePaymentOpen(true)}>Continue to secure payment</button>
          </>:null}
          <button type="button" disabled={checkoutBusy} onClick={()=>void refreshQuoteStatus()}>Check existing quotation / payment status</button>
          {recoveredCheckoutUrl && <a href={recoveredCheckoutUrl} rel="noopener noreferrer" target="_blank" className="ba-btn">Continue existing Paystack checkout</a>}
          <small>Never pay twice for an unconfirmed order. Your subscription only activates after verified settlement.</small>
        </div>
      </section></div>:null}
      {quotePaymentOpen && serverQuote && studentCheckoutPlan ? <PaymentCheckout
        open={true}
        purpose="subscription_quote"
        quoteId={serverQuote.id}
        title={`Pay for ${studentCheckoutPlan.name}`}
        description={`Server-verified quote for ${serverQuote.calculation?.studentCount ?? "your"} students. Payment does not activate your account until confirmed.`}
        amount={serverQuote.amountDue}
        currency={serverQuote.currency}
        onClose={()=>setQuotePaymentOpen(false)}
        onError={message=>{setCheckoutError(`${message} Check the quotation before trying again.`);setQuotePaymentOpen(false);}}
      /> : null}
      {selectedPlan?<PaymentCheckout open={true} onClose={()=>setSelectedPlan(null)} title={selectedPlan.name}
        description={selectedPlan.description||"Complete your subscription payment."}
        amount={fixedPrice(selectedPlan,cycle)} currency={displayCurrency(selectedPlan)} planId={selectedPlan.id} billingCycle={cycle}
        onSuccess={async result=>{setNotice(result.message||"Payment request received. Verify payment and refresh your package status. Your plan is not active until confirmed by the backend.");setSelectedPlan(null);await load(true)}}
        onError={msg=>setError(msg)}/>:null}
    </main>
  );
}
function SlimNotice({tone,children}:{tone:"green"|"red"|"orange"|"gray";children:React.ReactNode}){return <section className={`slim-notice ${tone}`}><span className={`status-dot-mini ${tone}`}/><p>{children}</p></section>}
function InfoLine({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}

const css = `
.student-checkout-content{padding:16px;display:grid;gap:12px;}
.student-checkout-content p,.student-checkout-content small{color:var(--muted,#64748b);line-height:1.5;}
.student-checkout-quote{display:grid;gap:4px;padding:14px;border:1px solid var(--border,#cbd5e1);border-radius:12px;}
.student-checkout-quote strong{font-size:24px;color:var(--text,inherit);}
.student-checkout-email{display:grid;gap:6px;font-size:13px;font-weight:600;}
.student-checkout-email input{width:100%;padding:12px;border:1px solid var(--border,#cbd5e1);border-radius:9px;background:var(--input-bg,var(--card-bg,#fff));color:var(--text,inherit);}
.student-checkout-primary{padding:12px;border-radius:10px;background:var(--ba-primary,var(--primary-color,#2563eb));color:#fff;font-weight:700;}
.student-checkout-error{color:#b91c1c!important;}

@keyframes spin{to{transform:rotate(360deg)}}

.ba-page{
  --ease:cubic-bezier(.2,.8,.2,1);
  min-height:100dvh;
  width:100%;
  max-width:100%;
  min-width:0;
  padding:calc(8px * var(--local-density-scale,1));
  padding-bottom:max(40px,env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--primary-color,#2563eb) 9%,transparent),transparent 30rem),
    var(--bg,#f7f8fb);
  color:var(--text,#0f172a);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
  font-size:var(--font-size,14px);
  overflow-x:hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after{
  box-sizing:border-box;
  min-width:0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea{
  font:inherit;
  max-width:100%;
}

.subscription-page{
  display:grid;
  gap:10px;
}

.ba-search-card,
.status-row,
.slim-notice,
.ba-empty,
.ba-sheet{
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.ba-search-card{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  align-items:center;
  padding:8px;
  border-radius:24px;
}

.ba-search{
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:0 11px;
  border-radius:18px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
}

.ba-search span{
  color:var(--muted,#64748b);
  font-size:17px;
  font-weight:1000;
}

.ba-search input{
  width:100%;
  min-height:42px;
  border:0;
  padding:0;
  border-radius:0;
  background:transparent;
  color:var(--text,#0f172a);
  outline:none;
  box-shadow:none;
  font-size:14px;
  font-weight:750;
}

.ba-add-inline,
.ba-filter-button,
.ba-icon-button{
  min-width:42px;
  height:42px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  display:grid;
  place-items:center;
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  color:var(--text,#0f172a);
  font-size:14px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline{
  padding:0 13px;
  border-color:var(--primary-color,#2563eb);
  background:var(--primary-color,#2563eb);
  color:#fff;
  font-size:11px;
}

.ba-filter-button{
  color:var(--primary-color,#2563eb);
  background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,var(--card-bg,#fff));
}

.ba-icon-button{
  width:42px;
  font-size:18px;
}

.ba-list{
  display:grid;
  gap:7px;
}

.status-row{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:9px;
  padding:9px;
  border-radius:20px;
  color:var(--text,#0f172a);
  text-align:left;
  cursor:pointer;
}

.status-icon{
  width:34px;
  height:34px;
  border-radius:14px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,var(--primary-color,#2563eb),rgba(15,23,42,.9));
  color:#fff;
  font-size:13px;
  font-weight:1000;
  box-shadow:0 10px 20px rgba(15,23,42,.12);
}

.status-main{
  display:grid;
  gap:1px;
}

.status-main strong,
.status-main small,
.status-main em{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.status-main strong{
  font-size:13px;
  font-weight:1000;
  line-height:1.15;
}

.status-main small,
.status-main em{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-style:normal;
  font-weight:800;
  line-height:1.25;
}

.status-side{
  display:flex;
  align-items:center;
  gap:6px;
}

.status-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:17px;
  font-weight:1000;
}

.status-dot-mini{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--muted,#64748b);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.slim-notice{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:9px;
  border-radius:17px;
  padding:8px 10px;
}

.slim-notice p{
  margin:0;
  font-size:11px;
  line-height:1.35;
  font-weight:850;
}

.slim-notice.green{background:#f0fdf4;color:#166534;border-color:#bbf7d0}
.slim-notice.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}
.slim-notice.orange{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
.slim-notice.gray{background:var(--card-bg,var(--surface,#fff));color:var(--muted,#64748b)}

.ba-empty{
  display:grid;
  place-items:center;
  align-content:center;
  gap:8px;
  min-height:180px;
  padding:18px;
  border-radius:24px;
  text-align:center;
  border-style:dashed;
}

.ba-empty-icon{
  width:50px;
  height:50px;
  display:grid;
  place-items:center;
  border-radius:20px;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,var(--surface,#fff));
  font-size:24px;
}

.ba-empty h3{
  margin:0;
  font-size:17px;
  font-weight:1000;
}

.ba-empty p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:12px;
  line-height:1.5;
}

/* Selling cards intentionally preserved and lightly theme-safe. */
.plans-grid{
  width:100%;
  min-width:0;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,max-content));
  justify-content:start;
  align-items:start;
  gap:14px;
}

.plan{
  position:relative;
  isolation:isolate;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  gap:9px;
  width:100%;
  max-width:365px;
  min-width:0;
  padding:13px;
  border-radius:22px;
  background:
    linear-gradient(var(--card-bg,var(--card,#fff)),var(--card-bg,var(--card,#fff))) padding-box,
    linear-gradient(145deg,rgba(37,99,235,.18),rgba(15,23,42,.05),rgba(14,165,233,.13)) border-box;
  border:1px solid transparent;
  box-shadow:0 12px 28px rgba(15,23,42,.065);
  transition:transform .18s ease,box-shadow .18s ease;
}

.plan:before{
  content:"";
  position:absolute;
  inset:0;
  z-index:-1;
  background:
    radial-gradient(circle at top right,rgba(37,99,235,.075),transparent 33%),
    radial-gradient(circle at bottom left,rgba(14,165,233,.055),transparent 31%);
}

.plan:hover{
  transform:translateY(-2px);
  box-shadow:0 18px 42px rgba(15,23,42,.1);
}

.plan.current{
  border:2px solid var(--primary-color,#2563eb);
  box-shadow:0 16px 40px rgba(37,99,235,.13);
}

.plan.waiting{
  border:2px solid #f59e0b;
  box-shadow:0 16px 40px rgba(245,158,11,.13);
}

.ribbon{
  position:absolute;
  right:-40px;
  top:15px;
  transform:rotate(38deg);
  background:linear-gradient(135deg,var(--primary-color,#2563eb),#1d4ed8);
  color:#fff;
  font-size:8.5px;
  font-weight:1000;
  padding:5px 42px;
  text-transform:uppercase;
  letter-spacing:.1em;
  box-shadow:0 7px 18px rgba(37,99,235,.23);
}

.waiting-ribbon{
  background:linear-gradient(135deg,#f59e0b,#c2410c);
}

.badge{
  display:inline-flex;
  width:max-content;
  max-width:100%;
  padding:5px 8px;
  border-radius:999px;
  background:rgba(37,99,235,.085);
  color:var(--primary-color,#2563eb);
  border:1px solid rgba(37,99,235,.14);
  font-size:9.5px;
  font-weight:1000;
  text-transform:uppercase;
  overflow-wrap:anywhere;
}

.plan h2{
  margin:6px 0 3px;
  color:var(--text,#0f172a);
  font-size:18px;
  line-height:1.05;
  font-weight:1000;
  letter-spacing:-.04em;
  overflow-wrap:anywhere;
}

.plan p{
  margin:0;
  min-height:auto;
  color:var(--muted,#64748b);
  font-size:11.5px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.price{
  display:grid;
  gap:4px;
  padding:10px;
  border-radius:16px;
  background:color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  border:1px solid var(--border,rgba(148,163,184,.2));
}

.price>div{
  display:flex;
  align-items:flex-end;
  gap:5px;
}

.price strong{
  color:var(--text,#0f172a);
  font-size:clamp(1.22rem,2.4vw,1.6rem);
  line-height:1;
  font-weight:1000;
  letter-spacing:-.055em;
}

.price span{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-weight:900;
  padding-bottom:2px;
}

.price small{
  display:block;
  color:var(--muted,#64748b);
  font-size:10px;
  line-height:1.25;
  font-weight:800;
}

.price small b{
  color:var(--text,#0f172a);
}

.saving-pill{
  display:inline-flex;
  width:max-content;
  max-width:100%;
  align-items:center;
  border-radius:999px;
  padding:5px 8px;
  background:#ecfdf5;
  color:#047857;
  border:1px solid #bbf7d0;
  font-size:10px;
  font-weight:1000;
  overflow-wrap:anywhere;
}

.saving-pill.warning{
  background:#fff7ed;
  color:#c2410c;
  border-color:#fed7aa;
}

.plan ul{
  list-style:none;
  margin:0;
  padding:0;
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:5px 8px;
}

.plan li{
  display:flex;
  align-items:flex-start;
  gap:5px;
  color:var(--text,#334155);
  font-size:11px;
  font-weight:800;
  line-height:1.2;
}

.feature-count{
  display:block;
  width:max-content;
  max-width:100%;
  margin-top:-1px;
  padding:4px 7px;
  border-radius:999px;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,transparent);
  color:var(--primary-color,#2563eb);
  font-size:9.5px;
  font-weight:1000;
}

.plan button{
  margin-top:4px;
  border:0;
  border-radius:999px;
  padding:10px 12px;
  background:linear-gradient(135deg,var(--primary-color,#2563eb),#1d4ed8);
  color:#fff;
  font-size:11.5px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 9px 18px rgba(37,99,235,.18);
}

.plan button:hover:not(:disabled){
  filter:brightness(1.04);
}

.plan button:disabled{
  background:#e5e7eb;
  color:#64748b;
  cursor:not-allowed;
  box-shadow:none;
}

.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:80;
  background:rgba(2,6,23,.46);
  display:grid;
  align-items:end;
  padding:10px;
}

.ba-sheet{
  width:min(540px,100%);
  margin:0 auto;
  border-radius:28px 28px 20px 20px;
  padding:14px;
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  color:var(--text,#0f172a);
}

.ba-sheet.small{
  width:min(440px,100%);
}

.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  margin-bottom:12px;
}

.ba-sheet-head h2{
  margin:0;
  font-size:20px;
  font-weight:1000;
  letter-spacing:-.04em;
}

.ba-sheet-head p{
  margin:3px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:750;
  line-height:1.45;
}

.ba-sheet-head button{
  width:38px;
  height:38px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#0f172a);
  font-weight:1000;
  cursor:pointer;
}

.cycle-sheet{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:7px;
  padding:4px;
  border-radius:999px;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,transparent);
  border:1px solid var(--border,rgba(0,0,0,.10));
}

.cycle-sheet button{
  min-height:38px;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:1000;
  cursor:pointer;
}

.cycle-sheet button.active{
  background:var(--primary-color,#2563eb);
  color:#fff;
}

.cycle-sheet button small{
  display:block;
  margin-top:1px;
  color:inherit;
  font-size:8.5px;
  font-weight:850;
  opacity:.78;
}

.sub-info-list{
  display:grid;
  gap:7px;
  margin:10px 0;
}

.sub-info-list div{
  display:flex;
  justify-content:space-between;
  gap:10px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:15px;
  padding:9px 10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
}

.sub-info-list span{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:900;
}

.sub-info-list strong{
  color:var(--text,#0f172a);
  font-size:11px;
  font-weight:1000;
  text-align:right;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list{
  display:grid;
  gap:8px;
  margin-top:10px;
}

.ba-menu-list button{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px;
  text-align:left;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:18px;
  padding:10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color:var(--text,#0f172a);
  cursor:pointer;
}

.ba-menu-list span{
  grid-row:1 / span 2;
  width:32px;
  height:32px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,transparent);
  color:var(--primary-color,#2563eb);
  font-weight:1000;
}

.ba-menu-list b{
  font-size:13px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:800;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

@media(max-width:720px){
  .subscription-page{gap:9px}
  .ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto}
  .plans-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),max-content));gap:12px}
  .plan{max-width:365px;padding:12px;border-radius:21px}
  .plan ul{grid-template-columns:1fr}
}

@media(max-width:460px){
  .ba-search-card{gap:6px;padding:7px;border-radius:22px}
  .ba-add-inline{padding:0 10px}
  .plans-grid{grid-template-columns:1fr}
  .plan{max-width:100%}
}

@media(prefers-reduced-motion:reduce){
  .plan{transition:none!important}
  .plan:hover{transform:none!important}
}
`;
/* Stage 5: compact expiry and paid-conversion guidance, matching existing Owner theme. */
