"use client";

/**
 * app/components/SyncBootstrap.tsx
 * ---------------------------------------------------------
 * LOGIN / NEW DEVICE SYNC BOOTSTRAP - PLATFORM READY
 * ---------------------------------------------------------
 */

import { useEffect, useRef } from "react";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";
import { runSync, startAutoSync } from "../lib/sync/syncEngine";

type OptionalSyncDevicesModule = {
  upsertLocalSyncDevice?: (patch?: Record<string, any>) => Promise<any>;
  registerSyncDevice?: (options?: {
    silent?: boolean;
    patch?: Record<string, any>;
  }) => Promise<any>;

  // Backward compatibility if older/generated sync file used this name.
  registerOrTouchSyncDevice?: () => Promise<any>;
};

type OptionalPlatformCacheModule = {
  refreshPlatformCache?: () => Promise<any>;
};

async function tryRegisterDevice() {
  try {
    const mod = (await import("../lib/sync/syncDevices")) as OptionalSyncDevicesModule;

    if (typeof mod.registerSyncDevice === "function") {
      await mod.registerSyncDevice({ silent: true });
      return;
    }

    if (typeof mod.registerOrTouchSyncDevice === "function") {
      await mod.registerOrTouchSyncDevice();
      return;
    }

    if (typeof mod.upsertLocalSyncDevice === "function") {
      await mod.upsertLocalSyncDevice();
    }
  } catch {
    // Optional device registration must never block the dashboard.
  }
}

async function tryRefreshPlatformCache() {
  try {
    const mod = (await import("../lib/sync/platformCache")) as OptionalPlatformCacheModule;
    await mod.refreshPlatformCache?.();
  } catch {
    // Platform cache is helpful but should never block the dashboard.
  }
}

function getReadableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown sync error";
  }
}

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

  useEffect(() => {
    refreshInstitutionRef.current = refreshInstitution;
  }, [refreshInstitution]);

  useEffect(() => {
    markersRef.current = {
      markSyncStart,
      markSyncSuccess,
      markSyncFailure,
      markSyncOffline,
    };
  }, [markSyncStart, markSyncSuccess, markSyncFailure, markSyncOffline]);

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
        await tryRegisterDevice();

        const result = await runSync({ includePlatformCache: true } as any);

        if (cancelled) return;

        await tryRefreshPlatformCache();
        await refreshInstitutionRef.current();

        if (result.ok) {
          markersRef.current.markSyncSuccess(result.pushed, result.pulled);
        } else {
          markersRef.current.markSyncFailure(result.errors);
        }
      } catch (error) {
        if (cancelled) return;

        await refreshInstitutionRef.current();
        markersRef.current.markSyncFailure([getReadableError(error)]);
      }
    };

    runInitialSync();

    return () => {
      cancelled = true;
    };
  }, [accountLoading, authenticated, accountId, initialSyncDone]);

  useEffect(() => {
    if (!authenticated || !accountId || !autoSyncEnabled) return;

    const stopAutoSync = startAutoSync(60_000, {
      includePlatformCache: true,
    } as any);

    return () => {
      stopAutoSync();
    };
  }, [authenticated, accountId, autoSyncEnabled]);

  useEffect(() => {
    if (!authenticated || !accountId) return;

    let running = false;

    const onOnline = async () => {
      if (running) return;
      running = true;

      markersRef.current.markSyncStart();

      try {
        await tryRegisterDevice();

        const result = await runSync({ includePlatformCache: true } as any);

        await tryRefreshPlatformCache();
        await refreshInstitutionRef.current();

        if (result.ok) {
          markersRef.current.markSyncSuccess(result.pushed, result.pulled);
        } else {
          markersRef.current.markSyncFailure(result.errors);
        }
      } catch (error) {
        markersRef.current.markSyncFailure([getReadableError(error)]);
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