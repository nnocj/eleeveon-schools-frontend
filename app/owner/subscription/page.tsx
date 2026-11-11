"use client";

/**
 * Direct onboarding route for links coming from Eleeveon Schools public pricing.
 *
 * The existing Owner subscription workspace lives in
 * app/owner/subscriptions.tsx (a component, not a URL route).
 * This page mounts that exact component at /owner/subscription, so the
 * public-pricing query parameters remain available to its existing handoff
 * logic, without creating a new checkout or modifying payment records.
 */
import Link from "next/link";
import OwnerSubscriptions from "../subscriptions";

export default function OwnerSubscriptionOnboardingPage() {
  return (
    <main className="min-h-dvh bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6">
        <Link
          href="/owner"
          className="inline-flex min-h-10 items-center rounded-xl border border-zinc-200 px-4 text-sm font-medium transition hover:bg-zinc-100 dark:border-white/20 dark:hover:bg-white/10"
        >
          ← Back to Owner portal
        </Link>
      </div>
      <OwnerSubscriptions />
    </main>
  );
}
