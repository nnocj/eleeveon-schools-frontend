"use client";

/** Installed PWA: immediately restore portal. Browser visit: show install action. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "../context/account-context";
import { useActiveMembership } from "../context/active-membership-context";
import { resolveSavedLaunch } from "../lib/offline/launchResolver";
import OfflineLaunchScreen from "../components/offline/OfflineLaunchScreen";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean(nav.standalone);
}

export default function LaunchPage() {
  const router = useRouter();
  const { accountId, user, account, loading, restoring, authenticated } = useAccount();
  const { restored: membershipRestored } = useActiveMembership();
  const launched = useRef(false);
  const [detail, setDetail] = useState("Restoring your saved workspace…");
  const [ready, setReady] = useState(false);
  const [destination, setDestination] = useState("/login");
  const [standalone, setStandalone] = useState<boolean | null>(null);

  useEffect(() => { setStandalone(isStandalone()); }, []);

  useEffect(() => {
    if (loading || restoring || !membershipRestored || standalone === null) return;
    let next = "/login";
    if (authenticated && user && accountId) {
      const choice = resolveSavedLaunch({ accountId, user, account });
      if (choice) next = choice.route;
    }
    setDestination(next);
    setReady(true);
    setDetail(next === "/login" ? "No saved authorized workspace. Sign in to continue." : "Your previous workspace is available.");
    // Browser visitors can see the install button; installed app goes straight to role.
    if (standalone && !launched.current) {
      launched.current = true;
      router.replace(next);
    }
  }, [loading, restoring, membershipRestored, authenticated, accountId, user, account, standalone, router]);

  return (
    <OfflineLaunchScreen
      loading={!ready || Boolean(standalone && launched.current)}
      title={ready && !standalone ? "Welcome to Eleeveon Schools" : "Opening your workspace…"}
      detail={detail}
    >
      {ready && !standalone && (
        <button
          type="button"
          onClick={() => router.replace(destination)}
          style={{ border: "1px solid #cbd5e1", background: "var(--surface,#fff)", color: "var(--text,#0f172a)", borderRadius: 12, padding: "12px 18px", minHeight: 44, font: "inherit", fontWeight: 700, cursor: "pointer", width: "100%", maxWidth: 320 }}
        >
          {destination === "/login" ? "Continue to sign in" : "Open saved workspace"}
        </button>
      )}
    </OfflineLaunchScreen>
  );
}
