"use client";

import type { ModuleDataAvailability } from "../../hooks/useOfflineTableReadiness";

type Props = {
  availability: ModuleDataAvailability;
  moduleLabel: string;
  missingCount: number;
  totalCount: number;
  online: boolean;
  preparing?: boolean;
};

/** Never hides module content or pretends that pending records are zero. */
export default function OfflineDataStatus({ availability, moduleLabel, missingCount, totalCount, online, preparing }: Props) {
  if (availability === "complete" || availability === "not_required") return null;
  const fetching = online && (preparing || availability === "downloading");
  const heading = fetching ? "Preparing offline records" : online ? "Records may be incomplete" : "Limited offline records";
  const detail = fetching
    ? `Downloading the records needed for ${moduleLabel}. Existing local records remain usable.`
    : online
      ? `Some records for ${moduleLabel} have not been confirmed as fully downloaded. An empty table may not mean there are no records.`
      : `This device has not completed offline preparation for ${moduleLabel}. Only previously saved local records are available.`;
  return (
    <div role="status" aria-live="polite" style={{
      margin:"0 0 10px", padding:"10px 12px", borderRadius:12,
      background:"color-mix(in srgb, var(--primary-color, #2563eb) 7%, var(--surface, #fff))",
      border:"1px solid color-mix(in srgb, var(--primary-color, #2563eb) 20%, transparent)",
      color:"var(--text, #0f172a)", display:"flex", flexWrap:"wrap", gap:8, alignItems:"center"
    }}>
      <span aria-hidden="true" style={{fontSize:16}}>{fetching ? "↻" : "ⓘ"}</span>
      <div style={{flex:"1 1 220px", minWidth:0}}>
        <div style={{fontWeight:800, fontSize:12}}>{heading}</div>
        <div style={{fontSize:11, lineHeight:1.5, opacity:.8}}>{detail}</div>
      </div>
      <small style={{fontSize:10, opacity:.75, whiteSpace:"nowrap"}}>
        {Math.max(0, totalCount - missingCount)}/{totalCount} data groups verified
      </small>
    </div>
  );
}
