"use client";

/**
 * app/hooks/useBranchTableRevision.ts
 * --------------------------------------------------------------------------
 * Account-scoped, table-selective revision subscription for Branch Admin pages.
 */

import { useMemo } from "react";

import { useDataRevision } from "./useDataRevision";
import { useBranchWorkspaceScope } from "./useBranchWorkspaceScope";

export function useBranchTableRevision(
  tables: readonly string[],
) {
  const { accountId } =
    useBranchWorkspaceScope();

  const stableTables = useMemo(
    () => [...new Set(tables)].sort(),
    // A semantic signature prevents inline arrays from resubscribing every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables.join("|")],
  );

  return useDataRevision({
    accountId,
    tables: stableTables,
  });
}

export default useBranchTableRevision;
