"use client";

/**
 * app/components/SyncBootstrap.tsx
 * --------------------------------------------------------------------------
 * Phase 10 synchronization trigger owner.
 *
 * Covers:
 * - authenticated startup and database readiness;
 * - browser online/focus/visibility lifecycle;
 * - backend WebSocket invalidations;
 * - periodic safety polling;
 * - shared single-flight result handling.
 *
 * Successful login and role-selection screens may also call:
 * - triggerLoginSync()
 * - triggerRoleSelectionSync()
 */

import { useEffect, useRef } from "react";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSyncBootstrap } from "../context/sync-bootstrap-context";
import { useDatabase } from "../context/database-context";
import { useRealtime } from "../context/realtime-context";

import { getDeviceId } from "../lib/sync/syncConfig";

import {
  runSync,
  startAutoSync,
  subscribeToSync,
  triggerSyncNow,
} from "../lib/sync/syncEngine";

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown synchronization error.";
  }
}

const PLATFORM_CACHE_EVENT_TYPES =
  new Set([
    "MEMBERSHIPS_CHANGED",
    "PERMISSIONS_CHANGED",
    "APP_MAINTENANCE_CHANGED",
  ]);

export default function SyncBootstrap() {
  const database = useDatabase();

  const {
    authenticated,
    accountId,
    loading: accountLoading,
    refreshAccount,
  } = useAccount();

  const {
    refreshInstitution,
  } = useActiveBranch();

  const {
    lastEvent,
  } = useRealtime();

  const {
    initialSyncDone,
    autoSyncEnabled,
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
    markApplyingChanges,
  } = useSyncBootstrap();

  const bootstrappedAccountRef =
    useRef<string | null>(null);

  const refreshInstitutionRef =
    useRef(refreshInstitution);

  const refreshAccountRef =
    useRef(refreshAccount);

  const markersRef = useRef({
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
    markApplyingChanges,
  });

  const lastHandledFinishedAtRef =
    useRef(0);

  const lastRealtimeRevisionRef =
    useRef(0);

  useEffect(() => {
    refreshInstitutionRef.current =
      refreshInstitution;
  }, [refreshInstitution]);

  useEffect(() => {
    refreshAccountRef.current =
      refreshAccount;
  }, [refreshAccount]);

  useEffect(() => {
    markersRef.current = {
      markSyncStart,
      markSyncSuccess,
      markSyncFailure,
      markSyncOffline,
      markApplyingChanges,
    };
  }, [
    markSyncStart,
    markSyncSuccess,
    markSyncFailure,
    markSyncOffline,
    markApplyingChanges,
  ]);

  useEffect(() => {
    return subscribeToSync(
      (result, syncing) => {
        if (syncing) {
          markersRef.current
            .markSyncStart();
          return;
        }

        if (
          !result ||
          result.finishedAt <=
            lastHandledFinishedAtRef
              .current
        ) {
          return;
        }

        lastHandledFinishedAtRef
          .current =
          result.finishedAt;

        const visibleDataChanged =
          Number(result.pulled || 0) > 0 ||
          Number(
            result.cacheUpdated || 0,
          ) > 0;

        const finish = async () => {
          if (visibleDataChanged) {
            markersRef.current
              .markApplyingChanges(true);

            try {
              await refreshInstitutionRef
                .current();
            } catch (error) {
              console.error(
                "[sync] institution refresh failed",
                error,
              );
            } finally {
              markersRef.current
                .markApplyingChanges(false);
            }
          } else {
            markersRef.current
              .markApplyingChanges(false);
          }

          if (result.ok) {
            markersRef.current
              .markSyncSuccess(
                result.pushed,
                result.pulled,
                Number(
                  result.conflicts || 0,
                ),
              );
          } else if (
            result.errors.some(
              (message) =>
                /offline/i.test(message),
            )
          ) {
            markersRef.current
              .markSyncOffline();
          } else {
            markersRef.current
              .markSyncFailure(
                result.errors,
              );
          }
        };

        void finish();
      },
    );
  }, []);

  /**
   * Authenticated startup + database-ready trigger.
   */
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (
        !database.ready ||
        accountLoading
      ) {
        return;
      }

      if (
        !authenticated ||
        !accountId
      ) {
        bootstrappedAccountRef.current =
          null;
        return;
      }

      if (
        bootstrappedAccountRef.current ===
          accountId ||
        initialSyncDone
      ) {
        return;
      }

      bootstrappedAccountRef.current =
        accountId;

      if (
        typeof navigator !==
          "undefined" &&
        !navigator.onLine
      ) {
        markersRef.current
          .markSyncOffline();

        await refreshInstitutionRef
          .current()
          .catch(() => undefined);

        return;
      }

      try {
        triggerSyncNow({
          trigger: "startup",
          includePlatformCache: true,
        });
      } catch (error) {
        if (cancelled) return;

        markersRef.current
          .markSyncFailure([
            readableError(error),
          ]);
      }
    };

    void start();

    return () => {
      cancelled = true;
    };
  }, [
    database.ready,
    accountLoading,
    authenticated,
    accountId,
    initialSyncDone,
  ]);

  /**
   * Backend WebSocket invalidation trigger.
   */
  useEffect(() => {
    if (
      !lastEvent ||
      !authenticated ||
      !accountId ||
      lastEvent.accountId !==
        accountId ||
      lastEvent.revision <=
        lastRealtimeRevisionRef.current
    ) {
      return;
    }

    lastRealtimeRevisionRef.current =
      lastEvent.revision;

    if (
      lastEvent.sourceDeviceId &&
      lastEvent.sourceDeviceId ===
        getDeviceId()
    ) {
      return;
    }

    const includePlatformCache =
      PLATFORM_CACHE_EVENT_TYPES.has(
        lastEvent.type,
      );

    const handle = async () => {
      if (
        lastEvent.type ===
          "MEMBERSHIPS_CHANGED" ||
        lastEvent.type ===
          "PERMISSIONS_CHANGED"
      ) {
        await refreshAccountRef.current({
          background: true,
          reason:
            "membership-change",
        }).catch(() => undefined);
      }

      await runSync({
        includePlatformCache,
        pullTableNames:
          lastEvent.changedTables
            .length > 0
            ? lastEvent.changedTables
            : undefined,
        trigger:
          "backend-notification",
      });
    };

    void handle().catch((error) => {
      console.error(
        "[realtime] invalidation sync failed",
        error,
      );
    });
  }, [
    lastEvent,
    authenticated,
    accountId,
  ]);

  /**
   * Browser lifecycle + one-minute safety fallback.
   */
  useEffect(() => {
    if (
      !database.ready ||
      !authenticated ||
      !accountId ||
      !autoSyncEnabled
    ) {
      return;
    }

    return startAutoSync({
      intervalMs: 60_000,
      includePlatformCache: true,
      syncOnOnline: true,
      syncOnFocus: true,
      syncOnVisibility: true,
      syncImmediately: false,
      minimumTriggerGapMs: 1_500,
    });
  }, [
    database.ready,
    authenticated,
    accountId,
    autoSyncEnabled,
  ]);

  return null;
}