"use client";
/** Drop-in capacity strip: render in the Students portal above admission/import actions.
 * The backend is still the authority when several devices admit concurrently.
 */
import React, { useEffect, useState } from "react";
import { readStudentCapacity, type StudentCapacity } from "../../lib/commercial/studentCapacity";

export default function StudentCapacityStrip({accountId}: {accountId: string | null | undefined}) {
  const [capacity, setCapacity] = useState<StudentCapacity | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setCapacity(null);
    setError("");
    if (!accountId) return;
    readStudentCapacity(accountId).then(v => { if(active) setCapacity(v); })
      .catch(e => { if(active) setError(String(e?.message || e)); });
    return () => { active = false; };
  },[accountId,revision]);
  if (!accountId) return null;
  const label = error ? error : !capacity ? "Checking student capacity…" :
    capacity.verified && capacity.limit !== null
      ? `${capacity.effectiveUsed} of ${capacity.limit} students · ${capacity.remaining} remaining`
      : capacity.verified ? `${capacity.effectiveUsed} students · no fixed cap` :
        `${capacity.usedLocal} local students · capacity awaiting verification`;
  return (
    <div role="status" style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",padding:"9px 12px",border:"1px solid var(--border,#cbd5e1)",borderRadius:14,background:"var(--card-bg,transparent)",color:"var(--text,inherit)"}}>
      <strong style={{fontSize:13}}>Student capacity</strong>
      <span style={{fontSize:12,flex:1}}>{label}</span>
      <button type="button" onClick={()=>setRevision(v=>v+1)} aria-label="Recheck local student capacity" style={{border:"1px solid var(--border,#cbd5e1)",background:"transparent",color:"inherit",borderRadius:12,padding:"6px 10px",cursor:"pointer"}}>Recheck</button>
    </div>
  );
}
