"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IndependentOriginalPortalHost from "../../components/independent/IndependentOriginalPortalHost";
import { restoreVerifiedIndependentIdentity, type VerifiedIndependentIdentity } from "../../lib/auth/independentVerifiedIdentity";
import { readVerifiedBrowserLicense, type VerifiedBrowserLicense } from "../../lib/independent/browserLicense";
import { clearStoredActiveMembership, setStoredActiveMembership } from "../../lib/auth/activeMembership";
import { setAccountId } from "../../lib/sync/syncConfig";

/** Shared portal host: no separate Independent business pages or local passwords. */
export default function IndependentWorkspacePage() {
  const router = useRouter();
  const [state, setState] = useState<{identity: VerifiedIndependentIdentity; license: VerifiedBrowserLicense} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [identity, license] = await Promise.all([
          restoreVerifiedIndependentIdentity(),
          readVerifiedBrowserLicense(),
        ]);
        if (!identity || !license) throw new Error("A verified Independent licence and signed offline membership authorization are required. Sign in online to renew authorization.");
        if (identity.accountId !== license.claims.accountId || identity.edition !== license.claims.edition)
          throw new Error("The licence and signed membership do not belong to the same Independent account.");
        if (!mounted) return;
        setAccountId(identity.accountId);
        setStoredActiveMembership(identity.membership);
        setState({ identity, license: { ...license, selector: "" } });
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Independent workspace authorization failed.");
      } finally { if (mounted) setBusy(false); }
    })();
    return () => { mounted = false; };
  }, []);
  if (busy) return <main role="status" style={{padding:24}}>Verifying Independent workspace authorization…</main>;
  if (error || !state) return <main role="alert" style={{padding:24, maxWidth:640, margin:"auto"}}>
    <h2>Workspace needs attention</h2><p>{error || "Authorization unavailable."}</p>
    <p>Local school records have not been changed.</p>
    <button onClick={() => router.replace("/login")}>Sign in to renew access</button>
  </main>;
  return <IndependentOriginalPortalHost
    identity={state.identity}
    license={state.license.claims}
    onLogout={() => { clearStoredActiveMembership(); router.replace("/login"); }}
  />;
}
