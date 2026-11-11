"use client";

/** Student-capacity notice for the Branch Admin Students workspace.
 * This is advisory. The authoritative quota is enforced by the backend.
 * onRequestUpgrade can navigate to the application's Owner billing workspace
 * when invoked by an account Owner; Branch Admins can copy a request instead.
 */
import React, { useEffect, useState } from "react";
import { readStudentCapacity, type StudentCapacity } from "../../lib/commercial/studentCapacity";

type Props = {
  accountId: string | null | undefined;
  onRequestUpgrade?: () => void;
};

export default function StudentCapacityStrip({ accountId, onRequestUpgrade }: Props) {
  const [capacity, setCapacity] = useState<StudentCapacity | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setCapacity(null);
    setError("");
    if (!accountId) return;
    readStudentCapacity(accountId).then(value => { if (active) setCapacity(value); })
      .catch(err => { if (active) setError(String(err?.message || err)); });
    return () => { active = false; };
  }, [accountId, revision]);
  if (!accountId) return null;
  const maxed = Boolean(capacity?.verified && capacity.limit !== null && capacity.remaining === 0);
  const label = error ? error : !capacity ? "Checking student capacity…" :
    capacity.verified && capacity.limit !== null
      ? `${capacity.effectiveUsed} of ${capacity.limit} student places used · ${capacity.remaining} remaining`
      : capacity.verified ? `${capacity.effectiveUsed} students · no fixed cap` :
        `${capacity.usedLocal} local students · capacity awaiting verification`;
  const requestText = `Eleeveon Schools: Our student allowance has reached ${capacity?.limit ?? "its"} places. Please open the Owner subscription workspace to purchase additional student capacity. Our existing term's remaining value should be credited in the server-verified upgrade quotation.`;
  async function copyRequest() {
    try { await navigator.clipboard.writeText(requestText); setMessage("Request copied. Share it with the account Owner."); }
    catch { setMessage("Please ask the account Owner to review the subscription and request more student places."); }
  }
  return (
    <section role="status" aria-live="polite" style={{ padding: "12px 14px", border: `1px solid ${maxed ? "#d97706" : "var(--border,#cbd5e1)"}`, borderRadius: 14, background: "var(--card-bg,transparent)", color: "var(--text,inherit)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <strong style={{ display: "block", fontSize: 14 }}>{maxed ? "Student allowance reached" : "Student capacity"}</strong>
          <span style={{ fontSize: 13 }}>{label}</span>
          {maxed && <p style={{ fontSize: 13, margin: "6px 0 0" }}>The account Owner can request more places. Existing student records remain safe; no additional admission will be authorized until the purchased allowance increases.</p>}
        </div>
        <button type="button" onClick={() => setRevision(value => value + 1)} aria-label="Recheck student capacity" style={{ border: "1px solid var(--border,#cbd5e1)", borderRadius: 10, padding: "8px 12px", color: "inherit", background: "transparent", cursor: "pointer" }}>Recheck</button>
        {maxed && <button type="button" onClick={onRequestUpgrade || (() => void copyRequest())} style={{ border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 700, color: "#fff", background: "#2563eb", cursor: "pointer" }}>{onRequestUpgrade ? "Increase capacity" : "Request more places"}</button>}
      </div>
      {message && <p style={{ fontSize: 12, marginTop: 8 }}>{message}</p>}
    </section>
  );
}
