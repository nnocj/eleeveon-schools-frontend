"use client";

/**
 * app/independent/start/page.tsx
 * Customer purchase, Paystack recovery, native Windows activation and certificate delivery.
 * No payment / licence authority lives in the browser.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/platformApi";

type Purchase = {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  authorizationUrl?: string | null;
  licenseId?: string | null;
  licenseKey?: string | null;
  verified?: boolean;
};
type Plan = {
  id: string;
  name: string;
  code: string;
  licenseModel: string;
  deploymentMode: string;
  priceOneTime: number;
  currency: string;
  active?: boolean;
};
type Step = "purchase" | "payment" | "activation";

const PENDING_PURCHASE_KEY = "eleeveon_independent_purchase_id";
const statusText: Record<string, string> = {
  pending: "Checkout is being prepared",
  requires_customer_action: "Awaiting payment",
  paid: "Payment verified",
  success: "Payment received",
  failed: "Payment not completed",
  abandoned: "Payment abandoned",
};
function safePaystackUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "checkout.paystack.com" || u.hostname === "paystack.com" || u.hostname.endsWith(".paystack.com")) ? u.toString() : null;
  } catch { return null; }
}
function displayError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  if (/escrow encryption key|32-byte license escrow/i.test(message)) {
    return "Checkout is temporarily unavailable: Eleeveon's secure licence-key storage is not configured on the server. No payment was started. Please contact Eleeveon support.";
  }
  if (/certificate signing is not configured/i.test(message)) {
    return "Checkout is temporarily unavailable: Eleeveon's licence certificate signing is not configured. No payment was started. Please contact Eleeveon support.";
  }
  return message;
}

export default function IndependentStartPage() {
  const router = useRouter();
  const [planId, setPlanId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [payerEmail, setPayerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [machineFingerprint, setMachineFingerprint] = useState("");
  const [certificate, setCertificate] = useState<unknown>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const selectedPlan = params.get("planId") || "";
    const redirectedId = params.get("paymentId") || "";
    setPlanId(selectedPlan);
    async function initialize() {
      try {
        const stored = (() => { try { return sessionStorage.getItem(PENDING_PURCHASE_KEY); } catch { return null; } })();
        const id = redirectedId || stored;
        const requests: Promise<unknown>[] = [];
        if (selectedPlan) {
          requests.push(apiRequest<unknown>("/billing/plans").then(response => {
            if (!alive) return;
            const value = response as { plans?: Plan[]; data?: Plan[] } | Plan[];
            const plans = Array.isArray(value) ? value : Array.isArray(value?.plans) ? value.plans : Array.isArray(value?.data) ? value.data : [];
            const found = plans.find(p => p.id === selectedPlan && p.licenseModel === "perpetual" && p.active !== false);
            if (found) setPlan(found);
            else setError("The selected Independent package is unavailable. Return to Owner Billing and choose another package.");
          }));
        }
        if (id) {
          setPaymentId(id);
          requests.push(apiRequest<Purchase>(`/licenses/independent-checkout/${encodeURIComponent(id)}`).then(p => {
            if (alive) { setPurchase(p); setPaymentId(p.paymentId); }
          }));
        } else {
          requests.push(apiRequest<Purchase | null>("/licenses/independent-checkout/latest").then(p => {
            if (!alive || !p?.paymentId) return;
            // Recover every prior purchase rather than initiating a duplicate charge.
            setPurchase(p);
            setPaymentId(p.paymentId);
          }));
        }
        const results = await Promise.allSettled(requests);
        if (alive) {
          const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
          if (failed) setError(displayError(failed.reason));
        }
      } finally { if (alive) setLoading(false); }
    }
    void initialize();
    return () => { alive = false; };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(displayError(e)); } finally { setBusy(false); }
  };
  const start = () => run(async () => {
    if (!planId || !plan || plan.licenseModel !== "perpetual") throw new Error("Select a valid Independent package first.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())) throw new Error("Enter a valid payer email address.");
    const p = await apiRequest<Purchase>("/licenses/independent-checkout", { method: "POST", body: JSON.stringify({ planId, payerEmail: payerEmail.trim().toLowerCase() }) });
    if (!p.paymentId || !safePaystackUrl(p.authorizationUrl)) throw new Error("Checkout needs confirmation. Do not try to pay again; refresh the purchase status first.");
    try { sessionStorage.setItem(PENDING_PURCHASE_KEY, p.paymentId); } catch {}
    setPaymentId(p.paymentId); setPurchase(p);
    window.location.assign(safePaystackUrl(p.authorizationUrl)!);
  });
  const refresh = (verify = false) => run(async () => {
    if (!paymentId) throw new Error("No purchase reference is available.");
    const p = await apiRequest<Purchase>(`/licenses/independent-checkout/${encodeURIComponent(paymentId)}${verify ? "/verify" : ""}`, verify ? { method: "POST" } : undefined);
    if (!p.paymentId || p.paymentId !== paymentId) throw new Error("The server returned an unexpected purchase reference.");
    setPurchase(p);
    if (p.licenseId) {
      setNotice("Your paid licence is available. Continue with Windows activation below.");
      try { sessionStorage.removeItem(PENDING_PURCHASE_KEY); } catch {}
    } else if (verify) {
      setNotice("The server checked Paystack. Your licence will only be issued after successful payment verification.");
    }
  });
  const activate = () => run(async () => {
    if (!purchase?.licenseKey || !purchase.licenseId) throw new Error("A verified licence key is required.");
    const installationId = deviceId.trim();
    const fingerprint = machineFingerprint.trim();
    if (!/^[0-9a-f-]{36}$/i.test(installationId) || !fingerprint) throw new Error("Copy both the installation ID and fingerprint exactly from the Windows activation screen.");
    await apiRequest("/licenses/activate", { method: "POST", body: JSON.stringify({ licenseKey: purchase.licenseKey, deviceId: installationId, machineFingerprint: fingerprint, platform: "windows" }) });
    const signed = await apiRequest<unknown>(`/licenses/${encodeURIComponent(purchase.licenseId)}/offline-certificate`, { method: "POST", body: JSON.stringify({ installationId }) });
    setCertificate(signed);
    setNotice("Your signed certificate has been issued. Save it, then import it into Eleeveon Schools Desktop.");
  });
  const saveCertificate = () => {
    if (!certificate) return;
    const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = objectUrl; a.download = "eleeveon-offline-license.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setError("Clipboard permission is unavailable. Select and copy the text manually."); }
  };
  const step: Step = purchase?.licenseId ? "activation" : paymentId ? "payment" : "purchase";
  const paymentUrl = safePaystackUrl(purchase?.authorizationUrl);
  const amount = purchase?.amount ?? plan?.priceOneTime;
  const currency = purchase?.currency || plan?.currency || "GHS";
  const price = amount == null ? "Server-confirmed amount" : `${currency} ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <main className="ind-page">
      <style>{styles}</style>
      <div className="ind-wrap">
        <header className="ind-top">
          <div className="ind-brand"><span className="ind-mark">E</span><span><strong>Eleeveon Schools</strong><small>Independent licensing</small></span></div>
          <button type="button" className="ind-btn ind-outline ind-back" onClick={() => router.push("/owner/subscription")}>← Back to Owner Billing</button>
        </header>
        <section className="ind-hero">
          <span className="ind-eyebrow">ONE-TIME WINDOWS LICENCE</span>
          <h1>Get your Independent licence</h1>
          <p>Purchase once, activate your Windows installation, and keep a signed certificate for offline access.</p>
        </section>
        <nav aria-label="Purchase progress" className="ind-progress">
          {([ ["purchase", "1", "Purchase"], ["payment", "2", "Verify payment"], ["activation", "3", "Activate Windows"] ] as const).map(([id, number, title]) => (
            <div key={id} className={`ind-progress-step ${step === id ? "current" : id === "purchase" || (id === "payment" && step === "activation") ? "completed" : ""}`}>
              <span className="ind-progress-num">{number}</span><span>{title}</span>
            </div>
          ))}
        </nav>
        {error && <div role="alert" className="ind-alert error"><strong>Action needed</strong><p>{error}</p></div>}
        {notice && <div role="status" className="ind-alert success">{notice}</div>}
        {loading && <section className="ind-panel"><p>Loading your selected package and checking for existing purchases…</p></section>}
        {!loading && <div className="ind-layout">
          <div className="ind-main">
            {step === "purchase" && <section className="ind-panel">
              <div className="ind-panel-title"><span className="ind-step-label">STEP 1 OF 3</span><h2>Confirm your purchase</h2><p>Review the one-time licence and enter the email address for your payment receipt.</p></div>
              {!plan ? <div className="ind-empty">No valid Independent package selected. <button type="button" onClick={() => router.push("/owner/subscription")}>Choose a package</button></div> : <>
                <div className="ind-plan"><div><small>SELECTED PACKAGE</small><h3>{plan.name}</h3><p>Windows desktop · One-time licence</p></div><strong>{price}</strong></div>
                {Number(plan.priceOneTime) === 1 && <p className="ind-hint warn">This package is currently listed at GH₵1.00. Confirm the intended price in Eleeveon's billing catalogue before using live Paystack payments.</p>}
                <label className="ind-field" htmlFor="ind-email"><span>Payer email address</span><input id="ind-email" type="email" autoComplete="email" placeholder="you@example.com" value={payerEmail} onChange={e => setPayerEmail(e.target.value)} disabled={busy} /><small>Paystack will use this address for your checkout.</small></label>
                <button type="button" className="ind-btn ind-primary ind-full" onClick={start} disabled={busy || !plan}>{busy ? "Preparing secure checkout…" : "Continue to Paystack →"}</button>
                <p className="ind-hint">You won't be charged until you complete payment on Paystack. A licence is issued only after the server verifies payment.</p>
              </>}
            </section>}
            {step === "payment" && <section className="ind-panel">
              <div className="ind-panel-title"><span className="ind-step-label">STEP 2 OF 3</span><h2>Verify your payment</h2><p>If you have returned from Paystack, confirm the result here. Never pay twice for the same order.</p></div>
              <div className="ind-status"><span>Purchase status</span><strong>{statusText[purchase?.status || ""] || (purchase?.status || "Checking with server")}</strong></div>
              <div className="ind-reference"><span>Purchase reference</span><code>{paymentId}</code><button type="button" className="ind-btn ind-outline" onClick={() => void copy(paymentId, "Reference")}>Copy</button></div>
              <div className="ind-actions"><button type="button" className="ind-btn ind-primary" disabled={busy} onClick={() => refresh(true)}>{busy ? "Checking…" : "Verify with Paystack"}</button><button type="button" className="ind-btn ind-outline" disabled={busy} onClick={() => refresh(false)}>Refresh status</button></div>
              {paymentUrl && <a className="ind-btn ind-secondary ind-full ind-anchor" href={paymentUrl} rel="noopener noreferrer">Return to existing Paystack checkout ↗</a>}
              <p className="ind-hint">If payment succeeded but no licence appears, use Verify with Paystack again. Keep this reference and contact support if it remains unresolved.</p>
            </section>}
            {step === "activation" && <section className="ind-panel">
              <div className="ind-panel-title"><span className="ind-step-label">STEP 3 OF 3</span><h2>Activate Eleeveon on Windows</h2><p>Your licence is issued. Open the Eleeveon desktop activation window to copy your native identifiers.</p></div>
              <div className="ind-status"><span>Licence status</span><strong>Verified and issued</strong></div>
              <div className="ind-reference"><span>Licence ID</span><code>{purchase?.licenseId}</code></div>
              {purchase?.licenseKey ? <>
                <div className="ind-key"><div><strong>Private licence key</strong><small>Keep this secret. Do not share it publicly.</small></div><code>{showKey ? purchase.licenseKey : "•••• •••• •••• ••••"}</code><div className="ind-actions"><button type="button" className="ind-btn ind-outline" onClick={() => setShowKey(v => !v)}>{showKey ? "Hide key" : "Show key"}</button><button type="button" className="ind-btn ind-outline" onClick={() => void copy(purchase.licenseKey!, "Licence key")}>Copy key</button></div></div>
                <label className="ind-field" htmlFor="ind-device"><span>Desktop installation ID</span><input id="ind-device" value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="Paste the UUID from the desktop app" autoComplete="off" spellCheck={false} /></label>
                <label className="ind-field" htmlFor="ind-fingerprint"><span>Desktop machine fingerprint</span><input id="ind-fingerprint" value={machineFingerprint} onChange={e => setMachineFingerprint(e.target.value)} placeholder="Paste the fingerprint from the desktop app" autoComplete="off" spellCheck={false} /></label>
                <button type="button" className="ind-btn ind-primary ind-full" disabled={busy} onClick={activate}>{busy ? "Activating and signing…" : "Activate and issue certificate →"}</button>
                {certificate && <div className="ind-certificate"><strong>Your signed certificate is ready</strong><p>Save the file, then choose <b>Import signed certificate</b> in the Windows app.</p><button type="button" className="ind-btn ind-secondary" onClick={saveCertificate}>↓ Download signed certificate (.json)</button></div>}
              </> : <div className="ind-alert error">The server recorded this licence but could not recover its key. Do not purchase again. Contact Eleeveon support and provide the purchase reference.</div>}
            </section>}
          </div>
          <aside className="ind-side"><div className="ind-panel ind-summary"><h2>Your licence</h2><div className="ind-summary-row"><span>Package</span><b>{plan?.name || (purchase?.licenseId ? "Independent licence" : "Select a package")}</b></div><div className="ind-summary-row"><span>Payment type</span><b>One-time</b></div><div className="ind-summary-row"><span>Amount</span><b>{price}</b></div><div className="ind-summary-row"><span>Delivery</span><b>Windows activation</b></div><div className="ind-summary-row"><span>Offline certificate</span><b>Signed JSON file</b></div><div className="ind-divider" /><h3>Secure by design</h3><p>Paystack verifies the charge. Eleeveon issues your licence only after server-side verification. Windows checks the certificate signature locally.</p><p className="ind-small">Need assistance? Keep your purchase reference and contact Eleeveon support. Never send your password or private licence key.</p></div></aside>
        </div>}
        <footer className="ind-footer">Eleeveon Schools · Secure Independent Licensing</footer>
      </div>
    </main>
  );
}

const styles = `
.ind-page{min-height:100dvh;background:var(--bg,#f6f8fc);color:var(--text,#172338);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);padding:0 18px 40px}
.ind-page *{box-sizing:border-box}.ind-wrap{max-width:1100px;margin:0 auto}.ind-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0;border-bottom:1px solid var(--border,#dde4ed)}
.ind-brand{display:flex;align-items:center;gap:12px}.ind-brand strong,.ind-brand small{display:block}.ind-brand strong{font-size:16px;font-weight:800}.ind-brand small{color:var(--muted,#687789);font-size:12px;margin-top:2px}.ind-mark{display:grid;place-items:center;background:var(--primary-color,#2367e8);color:#fff;font-size:21px;font-weight:900;width:42px;height:42px;border-radius:13px}
.ind-hero{padding:40px 0 24px;max-width:750px}.ind-eyebrow,.ind-step-label{font-size:11px;font-weight:850;letter-spacing:.1em;color:var(--primary-color,#2367e8)}.ind-hero h1{font-size:clamp(28px,4vw,43px);letter-spacing:-.035em;line-height:1.12;margin:11px 0}.ind-hero p{color:var(--muted,#687789);font-size:15px;line-height:1.7;margin:0}
.ind-progress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:24px}.ind-progress-step{display:flex;align-items:center;gap:10px;padding:13px;border-radius:13px;background:var(--surface,#fff);border:1px solid var(--border,#dde4ed);color:var(--muted,#687789);font-size:13px;font-weight:700}.ind-progress-step.current{color:var(--primary-color,#2367e8);border-color:var(--primary-color,#2367e8)}.ind-progress-step.completed{color:var(--text,#172338)}.ind-progress-num{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:var(--bg,#f0f4f9);flex:none}.ind-progress-step.current .ind-progress-num{background:var(--primary-color,#2367e8);color:white}
.ind-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(270px,1fr);gap:20px;align-items:start}.ind-main{min-width:0}.ind-panel{background:var(--surface,#fff);border:1px solid var(--border,#dce4ef);border-radius:21px;padding:26px;box-shadow:0 6px 24px rgba(20,36,68,.04)}.ind-panel-title{margin-bottom:22px}.ind-panel-title h2{font-size:24px;letter-spacing:-.025em;margin:7px 0}.ind-panel-title p{font-size:14px;color:var(--muted,#687789);line-height:1.6;margin:0}
.ind-plan{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px;border:1px solid var(--border,#dde4ed);background:var(--bg,#f6f8fc);border-radius:14px;margin:0 0 22px}.ind-plan small{font-size:10px;letter-spacing:.08em;font-weight:800;color:var(--muted,#687789)}.ind-plan h3{font-size:17px;margin:5px 0}.ind-plan p{font-size:12px;color:var(--muted,#687789);margin:0}.ind-plan>strong{font-size:18px;white-space:nowrap}.ind-field{display:grid;gap:7px;margin:18px 0;font-size:13px;font-weight:800}.ind-field input{width:100%;height:49px;font:inherit;font-size:14px;font-weight:500;padding:0 14px;border-radius:12px;color:var(--text,#172338);background:var(--surface,#fff);border:1px solid var(--border,#cad4e2);outline:0;min-width:0}.ind-field input:focus{border-color:var(--primary-color,#2367e8);box-shadow:0 0 0 3px rgba(35,103,232,.12)}.ind-field small{font-size:12px;font-weight:500;color:var(--muted,#687789)}
.ind-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:11px 16px;border-radius:11px;border:1px solid transparent;font:inherit;font-size:13px;font-weight:800;line-height:1.3;text-align:center;cursor:pointer;text-decoration:none;transition:filter .15s}.ind-btn:hover:not(:disabled){filter:brightness(.95)}.ind-btn:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}.ind-btn:disabled{cursor:not-allowed;opacity:.5}.ind-primary{background:var(--primary-color,#2367e8);color:#fff}.ind-secondary{background:#102a4a;color:#fff}.ind-outline{background:var(--surface,#fff);border-color:var(--border,#cad4e2);color:var(--text,#172338)}.ind-full{width:100%;margin-top:8px}.ind-actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 10px}.ind-actions .ind-btn{flex:1 1 150px}
.ind-hint{font-size:12px;line-height:1.6;color:var(--muted,#687789);margin:15px 0 0}.ind-hint.warn{padding:11px 13px;background:#fff8e8;border:1px solid #f5d69b;color:#775011;border-radius:11px;margin:0 0 18px}.ind-alert{border-radius:13px;padding:14px 18px;margin:0 0 18px;line-height:1.6;font-size:13px}.ind-alert strong{display:block}.ind-alert p{margin:4px 0 0}.ind-alert.error{color:#9d2525;background:#fff2f2;border:1px solid #f5b7b7}.ind-alert.success{background:#eaf8f1;color:#146f45;border:1px solid #acdfc5}.ind-empty{padding:22px 0;font-size:14px}.ind-empty button{border:0;background:transparent;color:var(--primary-color,#2367e8);font-weight:800;cursor:pointer}
.ind-status{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;background:#eaf7f0;border-radius:13px;color:#166b41;font-size:13px}.ind-reference{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:20px 0 10px}.ind-reference span{font-size:12px;color:var(--muted,#687789)}.ind-reference code{font-size:12px;overflow-wrap:anywhere;flex:1 1 180px}.ind-key{padding:17px;background:var(--bg,#f6f8fc);border:1px solid var(--border,#dde4ed);border-radius:13px;margin:18px 0}.ind-key strong,.ind-key small{display:block}.ind-key small{color:var(--muted,#687789);font-size:11px;margin-top:4px}.ind-key code{display:block;overflow-wrap:anywhere;margin-top:12px;font-size:12px}.ind-key .ind-actions{margin-bottom:0}.ind-certificate{padding:18px;margin-top:20px;border:1px solid #a8dcbf;background:#eaf8f1;color:#145c39;border-radius:13px}.ind-certificate p{font-size:13px;line-height:1.5}
.ind-summary h2{font-size:19px;margin:0 0 18px}.ind-summary h3{font-size:14px;margin:18px 0 8px}.ind-summary-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#e4e9f1);font-size:12px}.ind-summary-row span{color:var(--muted,#687789)}.ind-summary-row b{text-align:right;overflow-wrap:anywhere;font-size:12px}.ind-summary p{font-size:12px;line-height:1.7;color:var(--muted,#687789)}.ind-summary .ind-small{margin-top:18px}.ind-divider{height:1px;background:var(--border,#dde4ed);margin:18px 0}.ind-footer{text-align:center;color:var(--muted,#687789);font-size:12px;padding:30px 0}
@media(max-width:780px){.ind-layout{grid-template-columns:minmax(0,1fr)}.ind-side{order:2}.ind-hero{padding-top:28px}.ind-panel{padding:20px}}@media(max-width:480px){.ind-page{padding:0 12px 24px}.ind-top{padding:16px 0}.ind-back{padding:9px 11px;font-size:11px}.ind-brand strong{font-size:13px}.ind-mark{width:35px;height:35px}.ind-progress-step{padding:10px 6px;font-size:10px;gap:5px;flex-direction:column;text-align:center}.ind-plan{align-items:flex-start;flex-direction:column}.ind-plan>strong{font-size:20px}}
@media(prefers-color-scheme:dark){.ind-page{--bg:#0d1524;--surface:#162238;--border:#2b3d56;--text:#f1f5fa;--muted:#a2b0c4}.ind-status,.ind-certificate{background:#113d2f;color:#9be3bc}.ind-hint.warn{background:#473317;color:#ffe2ae;border-color:#805c27}.ind-alert.error{background:#471f29;color:#ffc3c3;border-color:#85414b}.ind-alert.success{background:#123d2e;color:#b7ebce;border-color:#2a6950}.ind-secondary{background:#2b5b9b}.ind-progress-num{background:#263953}}
`;
