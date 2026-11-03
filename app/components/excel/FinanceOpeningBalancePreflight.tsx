"use client";
/** Device-local, READ-ONLY opening-balance preflight. Never posts. */
import React, { useState } from "react";
import { db } from "../../lib/db/db";
import type { ApprovalManifest } from "../../lib/excel/finance/financeApprovalManifest";
import { createFinanceReviewHandoff, financeReviewHandoffCSV } from "../../lib/excel/finance/financeReviewHandoff";
import { preflightOpeningBalances, type PreflightResult } from "../../lib/excel/finance/financePostingPreflight";

type Props = { accountId: string; schoolId: string; branchId: string };
function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
export default function FinanceOpeningBalancePreflight({ accountId, schoolId, branchId }: Props) {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [manifest, setManifest] = useState<ApprovalManifest | null>(null);
  const [handoffNote, setHandoffNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function examine(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setResult(null); setManifest(null);
    try {
      if (file.size > 5_000_000) throw new Error("Manifest exceeds 5 MB.");
      const m = JSON.parse(await file.text()) as ApprovalManifest;
      if (!m || m.schema !== "eleeveon.finance.opening-balance-review.v1" || m.reviewOnly !== true || !Array.isArray(m.rows)) throw new Error("Choose a valid review-only JSON manifest.");
      if (m.accountId !== accountId || m.schoolId !== schoolId || m.branchId !== branchId) throw new Error("The manifest belongs to another account, school, or branch.");
      const [students, invoices, payments, legacyPayments] = await Promise.all([db.students.toArray(), db.studentFeeInvoices.toArray(), db.studentFeePayments.toArray(), db.payments.toArray()]);
      setResult(preflightOpeningBalances({ manifest: m, students, invoices, payments: [...payments, ...legacyPayments] }));
      setManifest(m);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to inspect manifest."); }
    finally { setBusy(false); }
  }
  function exportHandoff(format: "json" | "csv") {
    if (!result || !manifest) return;
    try {
      setError("");
      const handoff = createFinanceReviewHandoff({ manifest, preflight: result, accountId, schoolId, branchId, notes: handoffNote });
      saveFile(`opening-balance-review-${new Date().toISOString().slice(0, 10)}.${format}`, format === "json" ? JSON.stringify(handoff, null, 2) : financeReviewHandoffCSV(handoff), format === "json" ? "application/json" : "text/csv;charset=utf-8");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare handoff."); }
  }
  return <div className="fh-preflight-inner">
    <p className="fh-preflight-intro">Select a previously exported review-only JSON manifest. It will be checked against students, invoices and payments <strong>on this device</strong>. Nothing will be posted.</p>
    <label className="fh-manifest-picker"><span className="fh-manifest-icon">▤</span><span><strong>Choose review manifest</strong><small>JSON only · 5 MB maximum</small></span><input type="file" accept=".json,application/json" disabled={busy} onChange={e => { void examine(e.target.files?.[0]); e.currentTarget.value = ""; }}/></label>
    {busy && <p role="status">Checking current local records…</p>}
    {error && <p role="alert" className="fh-preflight-error">{error}</p>}
    {result && <>
      <div className="fh-preflight-stats"><div><small>Proposed balances</small><strong>{result.rows.length}</strong></div><div><small>Total (GHS)</small><strong>{result.totalGhs.toFixed(2)}</strong></div><div><small>Blocking issues</small><strong>{result.blockedCount}</strong></div><div><small>Warnings</small><strong>{result.reviewCount}</strong></div></div>
      <div className="fh-preflight-table-wrap"><table><thead><tr>{["Student ID", "Academic year", "Balance", "Invoices", "Payments", "Review findings"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{result.rows.map((r, i) => <tr key={`${r.sourceKey}:${i}`}><td>{r.studentId}</td><td>{r.academicYear}</td><td>GH₵ {r.balanceGhs.toFixed(2)}</td><td>{r.existingInvoiceCount}</td><td>{r.existingPaymentCount}</td><td>{r.issues.length ? r.issues.map(x => x.message).join("; ") : "No local conflict detected; backend approval still required"}</td></tr>)}</tbody></table></div>
      <label className="fh-preflight-notes">Reconciliation notes<textarea value={handoffNote} onChange={e => setHandoffNote(e.target.value)} rows={3} placeholder="Source documents, unresolved discrepancies, reviewer notes" /></label>
      <div className="fh-preflight-actions"><button type="button" onClick={() => exportHandoff("json")}>Export handoff JSON</button><button type="button" onClick={() => exportHandoff("csv")}>Export findings CSV</button></div>
      <p className="fh-preflight-disclaimer">These exports contain student financial information. Share only with authorized staff. Neither export approves a balance or authorizes posting.</p>
    </>}
    <p className="fh-preflight-disclaimer">This is a device-local check, not proof that the backend ledger is clear. Unsynced or remote transactions may exist. Posting requires separate backend reconciliation, authorization, and idempotency controls.</p>
    <style>{`
      .fh-preflight-inner{display:grid;gap:12px;color:var(--fh-text,var(--text,#172033));font:inherit}.fh-preflight-intro,.fh-preflight-disclaimer{font-size:12px;line-height:1.55;color:var(--fh-muted,var(--muted,#64748b));margin:0}.fh-manifest-picker{display:flex;align-items:center;gap:12px;padding:16px;border:1px dashed var(--fh-line,var(--border,#cbd5e1));border-radius:11px;cursor:pointer;position:relative;background:var(--fh-surface,var(--surface,#fff))}.fh-manifest-picker input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}.fh-manifest-icon{font-size:24px;color:var(--fh-accent,var(--primary-color,#2563eb))}.fh-manifest-picker strong,.fh-manifest-picker small{display:block}.fh-manifest-picker small{font-size:11px;color:var(--fh-muted,var(--muted,#64748b))}.fh-preflight-error{color:#dc2626;font-size:12px}.fh-preflight-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.fh-preflight-stats>div{border:1px solid var(--fh-line,var(--border,#cbd5e1));border-radius:9px;padding:10px;min-width:0}.fh-preflight-stats small,.fh-preflight-stats strong{display:block}.fh-preflight-stats small{font-size:10px;color:var(--fh-muted,var(--muted,#64748b))}.fh-preflight-stats strong{font-size:17px;overflow-wrap:anywhere}.fh-preflight-table-wrap{overflow:auto;max-height:390px;border:1px solid var(--fh-line,var(--border,#cbd5e1));border-radius:9px}.fh-preflight-table-wrap table{border-collapse:separate;border-spacing:0;min-width:750px;width:100%;font-size:12px}.fh-preflight-table-wrap th{text-align:left;position:sticky;top:0;background:color-mix(in srgb,var(--fh-surface,var(--surface,#fff)) 90%,var(--fh-text,var(--text,#172033)) 10%);padding:10px;border-bottom:1px solid var(--fh-line,var(--border,#cbd5e1))}.fh-preflight-table-wrap td{padding:10px;vertical-align:top;border-bottom:1px solid var(--fh-line,var(--border,#cbd5e1))}.fh-preflight-notes{display:grid;gap:5px;font-size:12px;font-weight:650}.fh-preflight-notes textarea{width:100%;resize:vertical}.fh-preflight-actions{display:flex;flex-wrap:wrap;gap:8px}.fh-preflight-actions button{border:1px solid var(--fh-line,var(--border,#cbd5e1));background:var(--fh-surface,var(--surface,#fff));color:inherit;border-radius:8px;padding:9px 12px;font-weight:650;cursor:pointer;font:inherit;font-size:12px}@media(max-width:600px){.fh-preflight-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </div>;
}
