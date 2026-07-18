"use client";

/**
 * app/hooks/useDataRevision.ts
 * --------------------------------------------------------------------------
 * Re-render only when the selected account or tables receive a change event.
 */

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  getDataRevisionSnapshot,
  getServerDataRevisionSnapshot,
  subscribeToDataRevision,
  type DataRevisionSelector,
} from "../lib/events/dataEvents";

export type UseDataRevisionInput =
  | readonly string[]
  | DataRevisionSelector
  | undefined;

function isTableArray(
  input: UseDataRevisionInput,
): input is readonly string[] {
  return Array.isArray(input);
}

function normalizeInput(
  input?: UseDataRevisionInput,
  accountId?: string | null,
): DataRevisionSelector {
  if (isTableArray(input)) {
    return {
      tables: input,
      accountId,
    };
  }

  return {
    tables: input?.tables,
    accountId:
      input?.accountId ??
      accountId,
  };
}

export function useDataRevision(
  input?: UseDataRevisionInput,
  accountId?: string | null,
) {
  const selector = useMemo<DataRevisionSelector>(
    () => normalizeInput(input, accountId),
    [input, accountId],
  );

  const getSnapshot = useCallback(
    () => getDataRevisionSnapshot(selector),
    [selector],
  );

  return useSyncExternalStore(
    subscribeToDataRevision,
    getSnapshot,
    getServerDataRevisionSnapshot,
  );
}

export default useDataRevision;