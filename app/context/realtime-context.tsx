"use client";

/**
 * app/context/realtime-context.tsx
 * --------------------------------------------------------------------------
 * Authenticated real-time lifecycle.
 *
 * A short disconnect grace period makes the provider resilient to React Strict
 * Mode's development-only setup -> cleanup -> setup cycle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useAccount,
} from "./account-context";

import {
  useActiveBranch,
} from "./active-branch-context";

import {
  connectRealtime,
  disconnectRealtime,
  getRealtimeStatusSnapshot,
  refreshRealtimeAuthentication,
  subscribeToRealtimeEvents,
  subscribeToRealtimeStatus,
  updateRealtimeContext,
  type RealtimeInvalidationEvent,
  type RealtimeStatusSnapshot,
} from "../lib/realtime/realtimeClient";

type RealtimeContextValue = {
  status:
    RealtimeStatusSnapshot;
  connected: boolean;
  lastEvent:
    RealtimeInvalidationEvent |
    null;
  reconnect: () => void;
  disconnect: () => void;
};

const RealtimeContext =
  createContext<
    RealtimeContextValue |
    null
  >(null);

/**
 * Module-level because the Strict Mode cleanup and the following setup belong
 * to two separate effect executions but must share the same cancellation timer.
 */
let pendingDisconnectTimer:
  | ReturnType<
      typeof setTimeout
    >
  | null = null;

const DISCONNECT_GRACE_MS =
  500;

function cancelPendingDisconnect() {
  if (
    pendingDisconnectTimer
  ) {
    clearTimeout(
      pendingDisconnectTimer,
    );

    pendingDisconnectTimer =
      null;
  }
}

function scheduleProviderDisconnect() {
  cancelPendingDisconnect();

  pendingDisconnectTimer =
    setTimeout(() => {
      pendingDisconnectTimer =
        null;

      disconnectRealtime();
    }, DISCONNECT_GRACE_MS);
}

export function RealtimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    authenticated,
    accountId,
    loading,
  } = useAccount();

  const {
    activeSchoolId,
    activeBranchId,
  } = useActiveBranch();

  const [
    status,
    setStatus,
  ] =
    useState(
      getRealtimeStatusSnapshot,
    );

  const [
    lastEvent,
    setLastEvent,
  ] =
    useState<
      RealtimeInvalidationEvent |
      null
    >(null);

  useEffect(() => {
    return subscribeToRealtimeStatus(
      setStatus,
    );
  }, []);

  useEffect(() => {
    return subscribeToRealtimeEvents(
      setLastEvent,
    );
  }, []);

  useEffect(() => {
    cancelPendingDisconnect();

    if (
      loading ||
      !authenticated ||
      !accountId
    ) {
      /**
       * Authentication removal is a real disconnect, not a Strict Mode probe.
       * Phase 13 atomic logout also closes the socket immediately.
       */
      disconnectRealtime();

      return;
    }

    connectRealtime({
      accountId,
      schoolId:
        activeSchoolId,
      branchId:
        activeBranchId,
    });

    return () => {
      /**
       * Do not immediately close a connecting socket. In development React may
       * mount this effect again immediately. The next setup cancels this timer.
       */
      scheduleProviderDisconnect();
    };
  }, [
    loading,
    authenticated,
    accountId,
  ]);

  useEffect(() => {
    if (
      !authenticated ||
      !accountId
    ) {
      return;
    }

    updateRealtimeContext({
      schoolId:
        activeSchoolId,
      branchId:
        activeBranchId,
    });
  }, [
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
  ]);

  const reconnect =
    useCallback(() => {
      cancelPendingDisconnect();

      refreshRealtimeAuthentication();
    }, []);

  const disconnect =
    useCallback(() => {
      cancelPendingDisconnect();

      disconnectRealtime();
    }, []);

  const value =
    useMemo<
      RealtimeContextValue
    >(
      () => ({
        status,
        connected:
          status.connected,
        lastEvent,
        reconnect,
        disconnect,
      }),
      [
        status,
        lastEvent,
        reconnect,
        disconnect,
      ],
    );

  return (
    <RealtimeContext.Provider
      value={value}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context =
    useContext(
      RealtimeContext,
    );

  if (!context) {
    throw new Error(
      "useRealtime must be used inside RealtimeProvider.",
    );
  }

  return context;
}