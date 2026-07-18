"use client";

/**
 * app/context/sync-context.tsx
 * --------------------------------------------------------------------------
 * Phase 20 system-status panel state.
 *
 * Synchronization execution remains owned by SyncBootstrap/syncEngine.
 * This context only coordinates opening, closing, and refreshing the status UI.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SyncContextValue = {
  statusSheetOpen: boolean;
  statusRevision: number;
  openStatusSheet: () => void;
  closeStatusSheet: () => void;
  toggleStatusSheet: () => void;
  refreshSystemStatus: () => void;
};

const SyncContext =
  createContext<SyncContextValue | null>(
    null,
  );

export function SyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    statusSheetOpen,
    setStatusSheetOpen,
  ] = useState(false);

  const [
    statusRevision,
    setStatusRevision,
  ] = useState(0);

  const openStatusSheet =
    useCallback(() => {
      setStatusSheetOpen(true);
    }, []);

  const closeStatusSheet =
    useCallback(() => {
      setStatusSheetOpen(false);
    }, []);

  const toggleStatusSheet =
    useCallback(() => {
      setStatusSheetOpen(
        (current) => !current,
      );
    }, []);

  const refreshSystemStatus =
    useCallback(() => {
      setStatusRevision(
        (current) =>
          Math.max(
            current + 1,
            Date.now(),
          ),
      );
    }, []);

  const value =
    useMemo<SyncContextValue>(
      () => ({
        statusSheetOpen,
        statusRevision,
        openStatusSheet,
        closeStatusSheet,
        toggleStatusSheet,
        refreshSystemStatus,
      }),
      [
        statusSheetOpen,
        statusRevision,
        openStatusSheet,
        closeStatusSheet,
        toggleStatusSheet,
        refreshSystemStatus,
      ],
    );

  return (
    <SyncContext.Provider
      value={value}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context =
    useContext(SyncContext);

  if (!context) {
    throw new Error(
      "useSyncContext must be used inside SyncProvider.",
    );
  }

  return context;
}