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
  errors: string[];
  lastSyncedAt?: number;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (value: boolean) => void;
  markSyncStart: () => void;
  markSyncSuccess: (pushed: number, pulled: number) => void;
  markSyncFailure: (errors: string[]) => void;
  markSyncOffline: () => void;
  markSyncSkipped: () => void;
};

const SyncBootstrapContext = createContext<SyncBootstrapContextValue | null>(null);

export function SyncBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [status, setStatus] = useState<SyncBootstrapStatus>("idle");
  const [pushed, setPushed] = useState(0);
  const [pulled, setPulled] = useState(0);
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

  const markSyncSuccess = useCallback((nextPushed: number, nextPulled: number) => {
    setPushed(nextPushed);
    setPulled(nextPulled);
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

  const value = useMemo<SyncBootstrapContextValue>(() => {
    return {
      initialSyncDone,
      initialSyncing: status === "checking" || status === "syncing",
      status,
      pushed,
      pulled,
      errors,
      lastSyncedAt,
      autoSyncEnabled,
      setAutoSyncEnabled,
      markSyncStart,
      markSyncSuccess,
      markSyncFailure,
      markSyncOffline,
      markSyncSkipped,
    };
  }, [
    initialSyncDone,
    status,
    pushed,
    pulled,
    errors,
    lastSyncedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
    markSyncSkipped,
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


