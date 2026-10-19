"use client";

import React from "react";
import ModuleSkeleton, { type ModuleSkeletonKind, type ModuleSkeletonView } from "./ModuleSkeleton";

type Phase = "checking" | "downloading" | "complete" | "offline" | "error";

type Props = {
  phase: Phase;
  hasRecords: boolean;
  kind: ModuleSkeletonKind;
  view?: ModuleSkeletonView;
  count?: number;
  moduleName: string;
  errorText?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  emptyState?: React.ReactNode;
};

/**
 * Caller owns data truth: only pass `complete` after the relevant selected-
 * membership datasets have been confirmed, NOT after a query returns zero.
 * Do not use account-wide completeness to infer Teacher profile completeness.
 */
export default function ModuleDataBoundary({
  phase, hasRecords, kind, view, count, moduleName,
  errorText, onRetry, children, emptyState,
}: Props) {
  if (hasRecords) return <>{children}</>;
  if (phase === "checking" || phase === "downloading") {
    return <ModuleSkeleton
      kind={kind} view={view} count={count}
      title={phase === "checking" ? "Preparing your records…" : `Getting ${moduleName.toLowerCase()} ready…`}
      message={phase === "downloading" ? "Your records will appear here as soon as they're available." : undefined}
    />;
  }
  if (phase === "complete") return <>{emptyState ?? <p>No {moduleName.toLowerCase()} yet.</p>}</>;
  return <div role="status" style={{ padding: "16px", border:"1px solid var(--border,#d1d5db)", borderRadius:12, color:"var(--text,#111827)", background:"var(--card-bg,var(--surface,#fff))" }}>
    <strong>{phase === "offline" ? "Connect to load your records" : "Records couldn't be loaded"}</strong>
    <p style={{ color:"var(--muted,#64748b)",fontSize:13,margin:"6px 0 12px" }}>
      {phase === "offline" ? `Your ${moduleName.toLowerCase()} haven't been prepared for offline use on this device yet.` : errorText || "Please try again."}
    </p>
    {onRetry && <button type="button" onClick={onRetry} style={{ padding:"8px 14px", borderRadius:8,border:"1px solid var(--border,#d1d5db)",background:"var(--surface,#fff)",color:"inherit",cursor:"pointer" }}>Retry</button>}
  </div>;
}
