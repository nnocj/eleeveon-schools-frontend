"use client";

import type { ModuleDataAvailability } from "../../hooks/useOfflineTableReadiness";

type Props = {
  availability: ModuleDataAvailability;
  moduleLabel: string;
  missingCount: number;
  totalCount: number;
  online: boolean;
  preparing?: boolean;
  progress?: { done: number; total: number } | null;
  onRetry?: () => void;
};

/** Advisory only. Never prevents using cached local records. */
export default function OfflineDataStatus({
  availability, moduleLabel, missingCount, totalCount, online,
  preparing = false, progress, onRetry,
}: Props) {
  if (availability === "complete" || availability === "not_required") return null;

  const fetching = online && (preparing || availability === "downloading");
  const heading = fetching
    ? "Preparing this page's offline records"
    : !online
      ? "Limited offline records"
      : availability === "failed"
        ? "The last data download was interrupted"
        : "Records may be incomplete";
  const detail = fetching
    ? `Loading records needed by ${moduleLabel}. You can use locally saved records while this continues.`
    : !online
      ? `Offline preparation for ${moduleLabel} is incomplete. Only locally saved records are available.`
      : `Some records for ${moduleLabel} have not been confirmed as completely downloaded. An empty table may not mean that no records exist.`;

  const done = Math.max(0, Number(progress?.done || 0));
  const total = Math.max(0, Number(progress?.total || 0));
  const percent = total ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : null;

  return (
    <section role="status" aria-live="polite" style={{
      margin: "0 0 10px", padding: "11px 12px", borderRadius: 13,
      background: "color-mix(in srgb, var(--primary-color, #2563eb) 7%, var(--surface, #fff))",
      border: "1px solid color-mix(in srgb, var(--primary-color, #2563eb) 20%, transparent)",
      color: "var(--text, #0f172a)", display: "flex", flexWrap: "wrap",
      alignItems: "center", gap: 9,
    }}>
      <span aria-hidden="true" style={{fontSize: 18}}>{fetching ? "↻" : "ⓘ"}</span>
      <div style={{flex: "1 1 220px", minWidth: 0}}>
        <strong style={{display: "block", fontSize: 12}}>{heading}</strong>
        <p style={{margin: "3px 0 0", fontSize: 11, lineHeight: 1.5, opacity: .82}}>{detail}</p>
        {fetching && percent !== null && (
          <div style={{marginTop: 8}}>
            <div role="progressbar" aria-label={`${moduleLabel} data download`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
              style={{height: 5, borderRadius: 10, background: "rgba(120,120,120,.15)", overflow: "hidden"}}>
              <div style={{height: "100%", width: `${percent}%`, borderRadius: "inherit", background: "var(--primary-color, #2563eb)"}} />
            </div>
            <small style={{fontSize: 10, opacity: .75}}>{done.toLocaleString()} of {total.toLocaleString()} records processed</small>
          </div>
        )}
      </div>
      <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
        <small style={{fontSize: 10, opacity: .75}}>{Math.max(0, totalCount - missingCount)}/{totalCount} groups verified</small>
        {online && !fetching && onRetry && (
          <button type="button" onClick={onRetry} style={{
            minHeight: 34, padding: "5px 11px", borderRadius: 10, cursor: "pointer",
            fontSize: 11, fontWeight: 800,
            border: "1px solid color-mix(in srgb, var(--primary-color, #2563eb) 30%, transparent)",
            background: "var(--surface, #fff)", color: "var(--text, #0f172a)",
          }}>Retry this page</button>
        )}
      </div>
    </section>
  );
}
