"use client";

/**
 * app/components/SyncBootstrap.tsx
 * ---------------------------------------------------------
 * LOGIN / NEW DEVICE SYNC BOOTSTRAP
 * ---------------------------------------------------------
 *
 * IMPORTANT FIX:
 * - No early return before hooks.
 * - Every useEffect/useRef is always called in the same order.
 * - Conditions are handled inside effects only.
 */

import { useEffect, useRef } from "react";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";
import { runSync, startAutoSync } from "../lib/sync/syncEngine";

export default function SyncBootstrap() {
  const { authenticated, accountId, loading: accountLoading } = useAccount();
  const { refreshInstitution } = useActiveBranch();

  const {
    initialSyncDone,
    autoSyncEnabled,
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
  } = useSyncBootstrap();

  const bootstrappedAccountRef = useRef<string | null>(null);
  const refreshInstitutionRef = useRef(refreshInstitution);
  const markersRef = useRef({
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
  });

  // Keep latest refresh function without putting it into the main sync effect.
  useEffect(() => {
    refreshInstitutionRef.current = refreshInstitution;
  }, [refreshInstitution]);

  // Keep latest marker functions without causing sync effect loops.
  useEffect(() => {
    markersRef.current = {
      markSyncStart,
      markSyncSuccess,
      markSyncFailure,
      markSyncOffline,
    };
  }, [markSyncStart, markSyncSuccess, markSyncFailure, markSyncOffline]);

  // First login / new device sync.
  useEffect(() => {
    let cancelled = false;

    const runInitialSync = async () => {
      if (accountLoading) return;

      if (!authenticated || !accountId) {
        bootstrappedAccountRef.current = null;
        return;
      }

      if (bootstrappedAccountRef.current === accountId || initialSyncDone) return;

      bootstrappedAccountRef.current = accountId;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        markersRef.current.markSyncOffline();
        await refreshInstitutionRef.current();
        return;
      }

      markersRef.current.markSyncStart();

      try {
        const result = await runSync();

        if (cancelled) return;

        await refreshInstitutionRef.current();

        if (result.ok) {
          markersRef.current.markSyncSuccess(result.pushed, result.pulled);
        } else {
          markersRef.current.markSyncFailure(result.errors);
        }
      } catch (error: any) {
        if (cancelled) return;

        await refreshInstitutionRef.current();
        markersRef.current.markSyncFailure([error?.message || String(error)]);
      }
    };

    runInitialSync();

    return () => {
      cancelled = true;
    };
  }, [accountLoading, authenticated, accountId, initialSyncDone]);

  // Auto sync every 60 seconds when enabled.
  useEffect(() => {
    if (!authenticated || !accountId || !autoSyncEnabled) return;

    const stopAutoSync = startAutoSync(60_000);

    return () => {
      stopAutoSync();
    };
  }, [authenticated, accountId, autoSyncEnabled]);

  // Sync once when the device comes back online.
  useEffect(() => {
    if (!authenticated || !accountId) return;

    let running = false;

    const onOnline = async () => {
      if (running) return;
      running = true;

      markersRef.current.markSyncStart();

      try {
        const result = await runSync();
        await refreshInstitutionRef.current();

        if (result.ok) {
          markersRef.current.markSyncSuccess(result.pushed, result.pulled);
        } else {
          markersRef.current.markSyncFailure(result.errors);
        }
      } catch (error: any) {
        markersRef.current.markSyncFailure([error?.message || String(error)]);
      } finally {
        running = false;
      }
    };

    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [authenticated, accountId]);

  return null;
}
