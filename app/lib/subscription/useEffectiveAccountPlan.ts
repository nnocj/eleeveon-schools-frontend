"use client";
import { useEffect, useState } from "react";
import { fetchCurrentAccess } from "./subscriptionApi";
import type { EffectiveAccessSnapshot } from "./types";

/** Display only: server-resolved effective access takes precedence over stale trial subscription. */
export function useEffectiveAccountPlan(accountId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<EffectiveAccessSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setSnapshot(null);
    setError("");
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    fetchCurrentAccess().then(response => {
      if (!live) return;
      if (response.snapshot.accountId !== accountId) throw new Error("Entitlement account mismatch");
      setSnapshot(response.snapshot);
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Entitlement unavailable"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [accountId]);
  return { snapshot, loading, error };
}

export function effectivePlanDisplay(snapshot: EffectiveAccessSnapshot | null) {
  if (!snapshot) return null;
  const independent = snapshot.licenseModel === "perpetual" || snapshot.source === "perpetual_license";
  const details = snapshot.sourceDetails || {};
  const edition = String(details.edition || details.licenseEdition || snapshot.metadata?.edition || "").toLowerCase();
  const name = independent
    ? edition.includes("multi") ? "Independent Multi-Device" : edition.includes("essential") ? "Independent Essentials" : "Independent (perpetual licence)"
    : snapshot.licenseModel === "trial" ? "Free Trial" : "Cloud subscription";
  return { independent, name, status: snapshot.status, kind: independent ? "Independent licence" : snapshot.licenseModel === "trial" ? "Free trial" : "Cloud subscription", description: independent ? "One-time perpetual licence · school records stored independently" : snapshot.licenseModel === "trial" ? "Trial access" : "Subscription access" };
}
