// ======================================================
// FILE 1: app/context/sync-bootstrap-context.tsx
// ======================================================

"use client";

/**
 * sync-bootstrap-context.tsx
 * ---------------------------------------------------------
 * GLOBAL SYNC BOOTSTRAP STATE
 * ---------------------------------------------------------
 *
 * FIXED VERSION:
 * - All action functions are useCallback-stable.
 * - This prevents Maximum update depth loops when SyncBootstrap
 *   uses these actions inside effects.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type SyncBootstrapStatus =
  | "idle"
  | "checking"
  | "syncing"
  | "success"
  | "failed"
  | "offline"
  | "skipped";

type SyncBootstrapContextValue = {
  initialSyncDone: boolean;
  initialSyncing: boolean;
  status: SyncBootstrapStatus;
  pushed: number;
  pulled: number;
  conflicts: number;
  deviceRegistered: boolean;
  platformCacheRefreshed: boolean;
  errors: string[];
  lastSyncedAt?: number;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (value: boolean) => void;
  markSyncStart: () => void;
  markSyncSuccess: (pushed: number, pulled: number, conflicts?: number) => void;
  markSyncFailure: (errors: string[]) => void;
  markSyncOffline: () => void;
  markSyncSkipped: () => void;
  markDeviceRegistered: () => void;
  markPlatformCacheRefreshed: () => void;
  markConflictsDetected: (count: number) => void;
};

const SyncBootstrapContext = createContext<SyncBootstrapContextValue | null>(null);

export function SyncBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [status, setStatus] = useState<SyncBootstrapStatus>("idle");
  const [pushed, setPushed] = useState(0);
  const [pulled, setPulled] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const [platformCacheRefreshed, setPlatformCacheRefreshed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>();

  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("eleeveon-auto-sync") !== "false";
  });

  const setAutoSyncEnabled = useCallback((value: boolean) => {
    setAutoSyncEnabledState(value);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("eleeveon-auto-sync", String(value));
    }
  }, []);

  const markSyncStart = useCallback(() => {
    setStatus("syncing");
    setErrors([]);
  }, []);

  const markSyncSuccess = useCallback((nextPushed: number, nextPulled: number, nextConflicts = 0) => {
    setPushed(nextPushed);
    setPulled(nextPulled);
    setConflicts(nextConflicts);
    setErrors([]);
    setStatus("success");
    setInitialSyncDone(true);
    setLastSyncedAt(Date.now());
  }, []);

  const markSyncFailure = useCallback((nextErrors: string[]) => {
    setErrors(nextErrors);
    setStatus("failed");
    setInitialSyncDone(true);
    setLastSyncedAt(Date.now());
  }, []);

  const markSyncOffline = useCallback(() => {
    setStatus("offline");
    setInitialSyncDone(true);
  }, []);

  const markSyncSkipped = useCallback(() => {
    setStatus("skipped");
    setInitialSyncDone(true);
  }, []);

  const markDeviceRegistered = useCallback(() => {
    setDeviceRegistered(true);
  }, []);

  const markPlatformCacheRefreshed = useCallback(() => {
    setPlatformCacheRefreshed(true);
  }, []);

  const markConflictsDetected = useCallback((count: number) => {
    setConflicts(Math.max(0, Number(count) || 0));
  }, []);

  const value = useMemo<SyncBootstrapContextValue>(() => {
    return {
      initialSyncDone,
      initialSyncing: status === "checking" || status === "syncing",
      status,
      pushed,
      pulled,
      conflicts,
      deviceRegistered,
      platformCacheRefreshed,
      errors,
      lastSyncedAt,
      autoSyncEnabled,
      setAutoSyncEnabled,
      markSyncStart,
      markSyncSuccess,
      markSyncFailure,
      markSyncOffline,
      markSyncSkipped,
      markDeviceRegistered,
      markPlatformCacheRefreshed,
      markConflictsDetected,
    };
  }, [
    initialSyncDone,
    status,
    pushed,
    pulled,
    conflicts,
    deviceRegistered,
    platformCacheRefreshed,
    errors,
    lastSyncedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
    markSyncSkipped,
    markDeviceRegistered,
    markPlatformCacheRefreshed,
    markConflictsDetected,
  ]);

  return (
    <SyncBootstrapContext.Provider value={value}>
      {children}
    </SyncBootstrapContext.Provider>
  );
}

export function useSyncBootstrap() {
  const ctx = useContext(SyncBootstrapContext);

  if (!ctx) {
    throw new Error("useSyncBootstrap must be used inside SyncBootstrapProvider");
  }

  return ctx;
}


