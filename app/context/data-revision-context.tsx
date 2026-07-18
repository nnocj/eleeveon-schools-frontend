"use client";

/**
 * app/context/data-revision-context.tsx
 * --------------------------------------------------------------------------
 * Optional context wrapper around the selective revision hook.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useDataRevision } from "../hooks/useDataRevision";

type DataRevisionContextValue = {
  revision: number;
  tables: readonly string[];
  accountId?: string | null;
};

const DataRevisionContext =
  createContext<DataRevisionContextValue>({
    revision: 0,
    tables: [],
    accountId: null,
  });

export function DataRevisionProvider({
  children,
  tables = [],
  accountId,
}: {
  children: ReactNode;
  tables?: readonly string[];
  accountId?: string | null;
}) {
  const revision = useDataRevision(
    {
      tables,
      accountId,
    },
  );

  const value = useMemo(
    () => ({
      revision,
      tables,
      accountId,
    }),
    [revision, tables, accountId],
  );

  return (
    <DataRevisionContext.Provider value={value}>
      {children}
    </DataRevisionContext.Provider>
  );
}

export function useDataRevisionContext() {
  return useContext(DataRevisionContext);
}