"use client";

/** Compatibility route for Paystack sessions created with the old callback URL.
 * The Owner subscription workspace is a component, not this URL route.
 * Preserve Paystack reference/trxref and send users to the payment confirmation page.
 * Does not create any new charge or mark a payment as paid.
 */
import { useEffect } from "react";

export default function LegacySubscriptionPaymentReturnPage() {
  useEffect(() => {
    const target = new URL("/payment/confirmation", window.location.origin);
    target.search = window.location.search;
    window.location.replace(target.toString());
  }, []);

  return (
    <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24}}>
      <div role="status" aria-live="polite" style={{textAlign:"center",maxWidth:480}}>
        <h1 style={{fontSize:22,marginBottom:12}}>Opening payment confirmation…</h1>
        <p>Your payment will be checked securely. You will not be charged again.</p>
        <p style={{fontSize:14,marginTop:18}}>If this screen remains open, visit <a href="/payment/confirmation">payment confirmation</a> and then check your existing subscription in the Owner portal.</p>
      </div>
    </main>
  );
}
