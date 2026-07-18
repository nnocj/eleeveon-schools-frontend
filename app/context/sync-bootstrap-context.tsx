"use client";

/**
 * app/context/sync-bootstrap-context.tsx
 * --------------------------------------------------------------------------
 * Global synchronization state.
 *
 * `initialSyncing` describes network synchronization for diagnostics.
 * `applyingChanges` is the only state intended for a visible portal indicator.
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
  applyingChanges: boolean;
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
  markSyncSuccess: (
    pushed: number,
    pulled: number,
    conflicts?: number,
  ) => void;
  markSyncFailure: (errors: string[]) => void;
  markSyncOffline: () => void;
  markSyncSkipped: () => void;
  markApplyingChanges: (value: boolean) => void;
  markDeviceRegistered: () => void;
  markPlatformCacheRefreshed: () => void;
  markConflictsDetected: (count: number) => void;
};

const SyncBootstrapContext =
  createContext<SyncBootstrapContextValue | null>(null);

export function SyncBootstrapProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [status, setStatus] =
    useState<SyncBootstrapStatus>("idle");
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [pushed, setPushed] = useState(0);
  const [pulled, setPulled] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const [platformCacheRefreshed, setPlatformCacheRefreshed] =
    useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] =
    useState<number | undefined>();

  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("eleeveon-auto-sync") !== "false";
  });

  const setAutoSyncEnabled = useCallback((value: boolean) => {
    setAutoSyncEnabledState(value);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "eleeveon-auto-sync",
        String(value),
      );
    }
  }, []);

  const markSyncStart = useCallback(() => {
    setStatus("syncing");
    setErrors([]);
  }, []);

  const markSyncSuccess = useCallback(
    (
      nextPushed: number,
      nextPulled: number,
      nextConflicts = 0,
    ) => {
      setPushed(nextPushed);
      setPulled(nextPulled);
      setConflicts(nextConflicts);
      setErrors([]);
      setStatus("success");
      setInitialSyncDone(true);
      setLastSyncedAt(Date.now());
    },
    [],
  );

  const markSyncFailure = useCallback((nextErrors: string[]) => {
    setErrors(nextErrors);
    setStatus("failed");
    setInitialSyncDone(true);
    setApplyingChanges(false);
    setLastSyncedAt(Date.now());
  }, []);

  const markSyncOffline = useCallback(() => {
    setStatus("offline");
    setInitialSyncDone(true);
    setApplyingChanges(false);
  }, []);

  const markSyncSkipped = useCallback(() => {
    setStatus("skipped");
    setInitialSyncDone(true);
    setApplyingChanges(false);
  }, []);

  const markApplyingChanges = useCallback((value: boolean) => {
    setApplyingChanges(Boolean(value));
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

  const value = useMemo<SyncBootstrapContextValue>(
    () => ({
      initialSyncDone,
      initialSyncing:
        status === "checking" || status === "syncing",
      applyingChanges,
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
      markApplyingChanges,
      markDeviceRegistered,
      markPlatformCacheRefreshed,
      markConflictsDetected,
    }),
    [
      initialSyncDone,
      status,
      applyingChanges,
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
      markApplyingChanges,
      markDeviceRegistered,
      markPlatformCacheRefreshed,
      markConflictsDetected,
    ],
  );

  return (
    <SyncBootstrapContext.Provider value={value}>
      {children}
    </SyncBootstrapContext.Provider>
  );
}

export function useSyncBootstrap() {
  const context = useContext(SyncBootstrapContext);

  if (!context) {
    throw new Error(
      "useSyncBootstrap must be used inside SyncBootstrapProvider",
    );
  }

  return context;
}