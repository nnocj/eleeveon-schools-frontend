"use client";

/**
 * app/lib/sync/useSyncStatus.ts
 * ---------------------------------------------------------
 * React hook for dashboard sync strips/buttons.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLocalSyncSummary } from "./syncStatus";
import { getLastSyncAt, isOnline, SyncResult } from "./syncConfig";
import { runSync, startAutoSync, subscribeToSync } from "./syncEngine";

type LocalSummary = {
  pending: number;
  errors?: number;
  conflicts?: number;
  checkedAt: number;
};

export function useSyncStatus(options?: { autoStart?: boolean; intervalMs?: number; includePlatformCache?: boolean }) {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [lastSyncAt, setLastSyncAtState] = useState(getLastSyncAt());

  const refreshLocalSummary = useCallback(async () => {
    const summary: LocalSummary = await getLocalSyncSummary();
    setPending(summary.pending);
    setErrors(summary.errors || 0);
    setConflicts(summary.conflicts || 0);
    setLastSyncAtState(getLastSyncAt());
  }, []);

  const syncNow = useCallback(async () => {
    const result = await runSync({ includePlatformCache: options?.includePlatformCache });
    setLastResult(result);
    await refreshLocalSummary();
    return result;
  }, [refreshLocalSummary, options?.includePlatformCache]);

  useEffect(() => {
    const unsubscribe = subscribeToSync((result, isRunning) => {
      setLastResult(result);
      setSyncing(isRunning);
      setLastSyncAtState(getLastSyncAt());
    });

    refreshLocalSummary().catch(console.error);

    return unsubscribe;
  }, [refreshLocalSummary]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!options?.autoStart) return;
    return startAutoSync(options.intervalMs || 60_000, { includePlatformCache: options.includePlatformCache });
  }, [options?.autoStart, options?.intervalMs, options?.includePlatformCache]);

  return useMemo(
    () => ({
      online,
      syncing,
      pending,
      errors,
      conflicts,
      lastResult,
      lastSyncAt,
      refreshLocalSummary,
      syncNow,
    }),
    [online, syncing, pending, errors, conflicts, lastResult, lastSyncAt, refreshLocalSummary, syncNow]
  );
}
