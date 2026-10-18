"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceBootstrapMembership, WorkspaceTableAvailability } from "../lib/sync/workspaceBootstrap";
import { WORKSPACE_BOOTSTRAP_STATUS_EVENT, getWorkspaceTableAvailability, arePriorityWorkspaceTablesCached, readWorkspaceBootstrapDownloadState } from "../lib/sync/workspaceBootstrap";

export type ModuleDataAvailability = "not_required" | "complete" | "partial" | "downloading" | "failed" | "not_downloaded";

/** Advisory module coverage, never a permission check or a navigation gate. */
export function useOfflineTableReadiness(
  membership: WorkspaceBootstrapMembership | null | undefined,
  requestedTables: readonly string[],
  preparing = false,
) {
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(true);
  const tablesKey = requestedTables.join("|");

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setRevision(value => value + 1);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(WORKSPACE_BOOTSTRAP_STATUS_EVENT, update);
    window.addEventListener("eleeveon:local-data-changed", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(WORKSPACE_BOOTSTRAP_STATUS_EVENT, update);
      window.removeEventListener("eleeveon:local-data-changed", update);
    };
  }, []);

  return useMemo(() => {
    const tables = [...new Set(tablesKey.split("|").filter(Boolean))];
    if (!tables.length) {
      return { status: "not_required" as ModuleDataAvailability, missingCount: 0, totalCount: 0, online };
    }
    if (!membership) {
      return { status: "not_downloaded" as ModuleDataAvailability, missingCount: tables.length, totalCount: tables.length, online };
    }
    // Full-role completion and independently completed, exact priority groups
    // are both authoritative. Partial rows alone never imply completeness.
    if (arePriorityWorkspaceTablesCached(membership, tables)) {
      return { status: "complete" as ModuleDataAvailability, missingCount: 0, totalCount: tables.length, online };
    }
    const states: WorkspaceTableAvailability[] = tables.map(table => getWorkspaceTableAvailability(membership, table));
    const missingCount = states.filter(state => state !== "complete").length;
    if (!missingCount) return { status: "complete" as ModuleDataAvailability, missingCount: 0, totalCount: tables.length, online };
    const transfer = readWorkspaceBootstrapDownloadState(membership);
    const status: ModuleDataAvailability = preparing || transfer?.status === "downloading"
      ? "downloading"
      : states.some(state => state === "partial") || states.some(state => state === "complete") || transfer?.status === "partial"
        ? "partial"
        : transfer?.status === "failed" ? "failed" : "not_downloaded";
    return { status, missingCount, totalCount: tables.length, online };
  }, [membership, tablesKey, revision, online, preparing]);
}
