"use client";

/**
 * app/hooks/useOfflineAccountData.ts
 * --------------------------------------------------------------------------
 * React state wrapper for inspecting and removing one account's local data.
 */

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  inspectOfflineAccountData,
  removeOfflineAccountData,
  type OfflineAccountDataSummary,
  type OfflineAccountRemovalResult,
} from "../lib/offline/offlineAccountData";

export function useOfflineAccountData(
  accountId?: string | null,
) {
  const [summary, setSummary] =
    useState<OfflineAccountDataSummary | null>(
      null,
    );

  const [loading, setLoading] =
    useState(false);

  const [removing, setRemoving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const refresh = useCallback(
    async () => {
      if (!accountId) {
        setSummary(null);
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const next =
          await inspectOfflineAccountData(
            accountId,
          );

        setSummary(next);
        return next;
      } catch (reason: any) {
        const message =
          reason?.message ||
          String(reason);

        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  const remove = useCallback(
    async (): Promise<
      OfflineAccountRemovalResult | null
    > => {
      if (!accountId) return null;

      setRemoving(true);
      setError(null);

      try {
        return await removeOfflineAccountData(
          accountId,
        );
      } catch (reason: any) {
        const message =
          reason?.message ||
          String(reason);

        setError(message);
        return null;
      } finally {
        setRemoving(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    summary,
    loading,
    removing,
    error,
    refresh,
    remove,
  };
}

export default useOfflineAccountData;