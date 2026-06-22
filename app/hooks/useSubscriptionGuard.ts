// ======================================================
// FILE 8: app/hooks/useSubscriptionGuard.ts
// ======================================================

"use client";

import { useMemo } from "react";
import { useAccount } from "../context/account-context";
import { hasFeature, isSubscriptionUsable, PlanFeature } from "../lib/billing/subscriptionAccess";

export function useSubscriptionGuard(feature?: PlanFeature) {
  const { subscription } = useAccount();

  return useMemo(() => {
    const usable = isSubscriptionUsable(subscription);
    const featureAllowed = feature ? hasFeature(subscription, feature) : usable;

    return {
      subscription,
      usable,
      featureAllowed,
      blocked: !usable || !featureAllowed,
    };
  }, [subscription, feature]);
}


