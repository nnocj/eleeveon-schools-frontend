"use client";

/** Paystack browser return: always verify with authenticated backend.
 * Set PAYSTACK_LIVE_CALLBACK_URL on Render to this FRONTEND route.
 * The callback URL is for browser UX only. Webhooks remain authoritative.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authHeaders, getApiBase, readJson } from "../../components/payments/payment-utils";

type Result = { stage: "checking"|"active"|"pending"|"error"; message:string; quoteId?:string; reference?:string };
const QUOTE_KEY="eleeveon_owner_student_checkout_quote";

export default function PaymentConfirmationPage(){
  const [result,setResult]=useState<Result>({stage:"checking",message:"Checking your existing Paystack transaction…"});
  const [busy,setBusy]=useState(false);
  const verify=useCallback(async()=>{
    if(busy)return;
    setBusy(true);
    const params=new URLSearchParams(window.location.search);
    const reference=params.get("reference")?.trim() || "";
    const quoteId=(()=>{try{return sessionStorage.getItem(QUOTE_KEY)||""}catch{return ""}})();
    const apiBase=getApiBase();
    setResult({stage:"checking",message:"Verifying with the backend. This does not create another payment.",quoteId,reference});
    try{
      // A registered quotation ID is scoped to the signed-in account on the server.
      // Prefer it because it allows verification and activation together.
      if(quoteId){
        const response=await fetch(`${apiBase}/billing/subscription-quotes/${encodeURIComponent(quoteId)}/recover`,{headers:authHeaders()});
        const recovered=await readJson(response);
        if(!response.ok)throw new Error(String(recovered?.message||"Sign in to your Owner account and retry verification."));
        if(recovered.status==="applied" && recovered.applied){
          try{sessionStorage.removeItem(QUOTE_KEY)}catch{}
          setResult({stage:"active",message:"Payment confirmed and your subscription is active.",quoteId,reference});return;
        }
        if(["paid","payment_pending"].includes(recovered.status) && recovered.paymentStatus==="paid"){
          const settle=await fetch(`${apiBase}/billing/subscription-quotes/${encodeURIComponent(quoteId)}/reconcile`,{method:"POST",headers:authHeaders()});
          const payload=await readJson(settle);
          if(!settle.ok)throw new Error(String(payload?.message||"Activation requires review. No further charge was made."));
          if(payload.applied===true && payload.status==="applied"){
            try{sessionStorage.removeItem(QUOTE_KEY)}catch{}
            setResult({stage:"active",message:"Payment verified and your Standard subscription is activated.",quoteId,reference});return;
          }
        }
      }
      // A return on another device may not have the session quotation ID.
      // The existing protected verify route is still useful in that case.
      if(reference){
        const response=await fetch(`${apiBase}/billing/payments/verify/${encodeURIComponent(reference)}?provider=paystack`,{headers:authHeaders()});
        const payload=await readJson(response);
        if(!response.ok)throw new Error(String(payload?.message||"Payment verification could not be completed."));
        // Only the scoped subscription quote status can confirm activation.
        if(quoteId){
          const statusResponse=await fetch(`${apiBase}/billing/subscription-quotes/${encodeURIComponent(quoteId)}/recover`,{headers:authHeaders()});
          const status=await readJson(statusResponse);
          if(statusResponse.ok && status.status==="applied" && status.applied){
            try{sessionStorage.removeItem(QUOTE_KEY)}catch{}
            setResult({stage:"active",message:"Payment verified, subscription activated and entitlements available.",quoteId,reference});return;
          }
        }
        setResult({stage:"pending",message:"Your payment verification was received. Please open Owner → My Subscription to confirm that activation is complete. Do not pay again.",quoteId,reference});return;
      }
      setResult({stage:"pending",message:"No Paystack reference was supplied in the return URL. Your payment record has not been erased. Open My Subscription to reconcile the existing quotation; do not pay again.",quoteId});
    }catch(error){
      setResult({stage:"error",message:`Could not finish verification: ${error instanceof Error?error.message:"Unexpected error"}. If you already paid, do not pay again. Sign in to your Owner account and reconcile the existing transaction.`,quoteId,reference});
    }finally{setBusy(false)}
  // busy deliberately excluded; only called by user or initial mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{void verify()},[verify]);
  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24,background:"var(--background,#f6f8fb)",color:"var(--foreground,#172033)"}}>
    <section style={{width:"min(100%,650px)",background:"var(--card-bg,#fff)",border:"1px solid var(--border,#e2e8f0)",borderRadius:20,padding:"clamp(20px,5vw,40px)",boxShadow:"0 16px 48px rgba(0,0,0,.09)"}}>
      <p style={{fontSize:13,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Eleeveon Schools · Payment Confirmation</p>
      <h1 style={{fontSize:"clamp(22px,4vw,32px)",margin:"12px 0"}}>{result.stage==="active"?"Subscription activated":result.stage==="checking"?"Verifying payment":result.stage==="error"?"Verification needs attention":"Payment confirmation pending"}</h1>
      <p role="status" aria-live="polite" style={{lineHeight:1.7}}>{result.message}</p>
      {result.quoteId?<p style={{fontSize:12,overflowWrap:"anywhere",opacity:.75}}>Quotation: {result.quoteId}</p>:null}
      {result.reference?<p style={{fontSize:12,overflowWrap:"anywhere",opacity:.75}}>Paystack reference: {result.reference}</p>:null}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
        <Link href="/owner" style={{background:"#1d4ed8",color:"#fff",padding:"12px 16px",borderRadius:12,fontWeight:700,textDecoration:"none"}}>Open Owner portal</Link>
        <button type="button" disabled={busy} onClick={()=>void verify()} style={{border:"1px solid #64748b",borderRadius:12,padding:"12px 16px",background:"transparent",color:"inherit",fontWeight:700,cursor:"pointer"}}>{busy?"Verifying…":"Check again"}</button>
      </div>
      <p style={{marginTop:20,fontSize:12,opacity:.75}}>Checking does not charge your account. Subscription activation requires verified settlement on the server.</p>
    </section>
  </main>;
}
