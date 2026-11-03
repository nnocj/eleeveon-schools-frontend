"use client";
/**
 * Historical finance review — Student-style workspace.
 * READ ONLY: no fee invoices, balances, payments, or admissions are posted.
 * The existing legacy parser and approval/validation utilities are authoritative.
 */
import React, { useMemo, useState } from "react";
import type { Student } from "../../lib/db/db";
import type { ParsedExcelWorkbook } from "../../lib/excel/excelTypes";
import { parseExcelFile } from "../../lib/excel/excelWorkbook";
import { reviewLegacyFinanceWorkbook } from "../../lib/excel/finance/financeLegacyReview";
import { prepareOpeningBalanceApproval } from "../../lib/excel/finance/financeApprovalManifest";
import { exportFinanceReviewCsv, validateFinanceReview, type FinanceReviewDecision } from "../../lib/excel/finance/financeImportReview";
import ExcelImportSheet from "./ExcelImportSheet";
import ExcelFilePicker from "./ExcelFilePicker";
import FinanceOpeningBalancePreflight from "./FinanceOpeningBalancePreflight";

type Props = { students: Student[]; accountId: string; schoolId: string; branchId: string };
type ImportStage = "file" | "sheet";
const button = "fh-button";

function downloadText(name: string, body: string, contentType: string) {
  const url = URL.createObjectURL(new Blob([body], { type: contentType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export default function FinanceHistoricalImportReview({ students, accountId, schoolId, branchId }: Props) {
  const [workbook, setWorkbook] = useState<ParsedExcelWorkbook | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, FinanceReviewDecision>>({});
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "blocked">("all");
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<ImportStage>("file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(50);

  const scopedStudents = useMemo(() => students.filter(s => String(s.accountId) === String(accountId) && String(s.schoolId) === String(schoolId) && String(s.branchId) === String(branchId)), [students, accountId, schoolId, branchId]);
  const review = useMemo(() => workbook ? reviewLegacyFinanceWorkbook({ workbook, students: scopedStudents, accountId, schoolId, branchId }) : null, [workbook, scopedStudents, accountId, schoolId, branchId]);
  const relevant = useMemo(() => review ? { ...review, candidates: review.candidates.filter(c => selectedSheets.includes(c.sheetName)) } : null, [review, selectedSheets]);
  const findings = useMemo(() => relevant ? validateFinanceReview(relevant, decisions, new Set(scopedStudents.map(s => s.id))) : [], [relevant, decisions, scopedStudents]);
  const findingsByKey = useMemo(() => new Map(findings.map(f => [f.key, f])), [findings]);
  const approval = useMemo(() => relevant ? prepareOpeningBalanceApproval({ review: relevant, decisions, findings, accountId, schoolId, branchId }) : null, [relevant, decisions, findings, accountId, schoolId, branchId]);
  const readyCount = findings.filter(f => f.status === "ready_for_finance_approval").length;
  const blockedCount = findings.filter(f => f.status === "blocked").length;
  const visible = useMemo(() => (relevant?.candidates || []).filter(c => {
    const q = search.trim().toLowerCase();
    if (q && !`${c.studentName} ${c.admissionNumber || ""} ${c.sheetName}`.toLowerCase().includes(q)) return false;
    const f = findingsByKey.get(c.key);
    if (status === "ready" && f?.status !== "ready_for_finance_approval") return false;
    if (status === "blocked" && f?.status !== "blocked") return false;
    return true;
  }), [relevant, search, status, findingsByKey]);
  const displayed = visible.slice(0, displayCount);

  function change(key: string, patch: Partial<FinanceReviewDecision>) {
    setDecisions(curr => {
      const previous = curr[key];
      return { ...curr, [key]: {
        ...previous, ...patch,
        action: patch.action ?? previous?.action ?? "hold",
        academicYear: patch.academicYear ?? previous?.academicYear ?? year,
        candidateKey: key,
      } };
    });
  }

  function openPicker() { setFile(null); setStage("file"); setError(""); setOpen(true); }
  async function parseSelectedFile() {
    if (!file) { setError("Choose an Excel workbook."); return; }
    setBusy(true); setError("");
    try {
      const parsed = await parseExcelFile(file);
      if (!parsed.sheets?.length) throw new Error("The workbook has no readable worksheets.");
      setWorkbook(parsed); setSelectedSheets(parsed.sheets.map(s => s.name));
      setDecisions({}); setSearch(""); setStatus("all"); setDisplayCount(50);
      setStage("sheet");
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot read workbook."); }
    finally { setBusy(false); }
  }
  function finishSelection() {
    if (!selectedSheets.length) { setError("Select at least one worksheet to review."); return; }
    setOpen(false); setError("");
  }
  function download() {
    if (!relevant) return;
    downloadText("eleeveon-finance-historical-review.csv", exportFinanceReviewCsv(relevant, findings), "text/csv;charset=utf-8");
  }
  function downloadApproval() {
    if (!approval?.manifest) return;
    downloadText("eleeveon-opening-balances-REVIEW-ONLY.json", JSON.stringify(approval.manifest, null, 2), "application/json");
  }

  return <section className="fh-workspace">
    <style>{styles}</style>
    <div className="fh-toolbar">
      <div className="fh-search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search historical records" value={search} onChange={e => { setSearch(e.target.value); setDisplayCount(50); }} placeholder="Search name, admission number, sheet" /></div>
      <button className={`${button} fh-primary`} onClick={openPicker}>＋ <span className="fh-button-label">Workbook</span></button>
      <button className={button} onClick={() => setMore(v => !v)} aria-expanded={more} aria-label="More historical review actions">⋮</button>
    </div>
    {more && <div className="fh-more" role="group" aria-label="More actions">
      <button onClick={() => { setMore(false); openPicker(); }}>Open another workbook</button>
      <button disabled={!relevant} onClick={() => { setMore(false); download(); }}>Export review CSV</button>
      <button disabled={!approval?.manifest} onClick={() => { setMore(false); downloadApproval(); }}>Export review-only JSON</button>
      <button onClick={() => { setMore(false); setPreflightOpen(true); }}>Opening balance preflight</button>
    </div>}
    <div className="fh-heading"><div><h2>Historical Review</h2><p>Review historical worksheets, verify student matches, and prepare reconciliation evidence.</p></div><span className="fh-readonly">Review only · No posting</span></div>
    {!workbook ? <div className="fh-empty">
      <div className="fh-empty-icon">▤</div><h3>Review an existing school workbook</h3>
      <p>Select an Excel workbook. You can choose worksheets, inspect old balances and confirm student matches. Nothing is posted to student accounts.</p>
      <button className={`${button} fh-primary`} onClick={openPicker}>Choose Excel workbook</button>
    </div> : <>
      <div className="fh-file-summary"><div><strong>{file?.name || "Historical workbook"}</strong><small>{selectedSheets.length} of {workbook.sheets.length} worksheets selected · {relevant?.candidates.length || 0} review candidates</small></div><button className={button} onClick={() => { setStage("sheet"); setOpen(true); }}>Select sheets</button></div>
      <div className="fh-stats"><div><small>Review candidates</small><strong>{relevant?.candidates.length || 0}</strong></div><div><small>Ready for later approval</small><strong>{readyCount}</strong></div><div><small>Blocked</small><strong>{blockedCount}</strong></div></div>
      <div className="fh-controls"><label>Academic year<input placeholder="2024/2025" value={year} onChange={e => setYear(e.target.value)} /></label><label>Review status<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setDisplayCount(50); }}><option value="all">All records</option><option value="ready">Ready for approval</option><option value="blocked">Blocked</option></select></label><span className="fh-count">Showing {displayed.length} of {visible.length}</span></div>
      {visible.length === 0 ? <div className="fh-empty"><h3>No matching historical records</h3><p>Adjust your search, status filter, or worksheet selection.</p></div> : <div className="fh-table-scroll"><table className="fh-table"><thead><tr><th>Worksheet / row</th><th>Student</th><th>Source match</th><th>Debt (GHS)</th><th>Action</th><th>Confirm student</th><th>Year / evidence</th><th>Validation</th></tr></thead><tbody>{displayed.map(c => {
        const decision = decisions[c.key]; const finding = findingsByKey.get(c.key);
        return <tr key={c.key}><td><strong>{c.sheetName}</strong><small>Row {c.excelRow}</small></td><td><strong>{c.studentName}</strong><small>{c.admissionNumber || "No admission number"}</small></td><td><span className="fh-tag">{c.matchStatus}</span>{c.warning && <small>{c.warning}</small>}</td><td className="fh-money"><strong>{c.statedTotalDebt ?? "Unknown"}</strong>{c.discrepancy !== undefined && Math.abs(c.discrepancy) > .009 && <small>Difference: {c.discrepancy}</small>}</td><td><select aria-label={`Action for ${c.studentName}`} value={decision?.action || "skip"} onChange={e => change(c.key, { action: e.target.value as FinanceReviewDecision["action"] })}><option value="skip">Skip</option><option value="hold">Hold</option><option value="opening_balance_review">Review opening balance</option></select></td><td><select aria-label={`Match ${c.studentName}`} value={decision?.confirmedStudentId || ""} onChange={e => change(c.key, { confirmedStudentId: e.target.value })}><option value="">Unconfirmed</option>{scopedStudents.map(s => <option key={s.id} value={s.id}>{s.fullName} ({s.admissionNumber || s.id}) — {s.status || "active"}</option>)}</select></td><td><input aria-label={`Academic year for ${c.studentName}`} placeholder="2024/2025" value={decision?.academicYear ?? year} onChange={e => change(c.key, { academicYear: e.target.value })}/><input aria-label={`Evidence for ${c.studentName}`} placeholder="Evidence / note" value={decision?.note || ""} onChange={e => change(c.key, { note: e.target.value })}/></td><td><span className={`fh-tag ${finding?.status === "blocked" ? "fh-blocked" : finding?.status === "ready_for_finance_approval" ? "fh-ready" : ""}`}>{finding?.status || "Not reviewed"}</span>{!!finding?.issues.length && <small>{finding.issues.join("; ")}</small>}</td></tr>;
      })}</tbody></table></div>}
      {displayCount < visible.length && <button className={`${button} fh-more-rows`} onClick={() => setDisplayCount(v => v + 50)}>Show next 50 records</button>}
      <div className="fh-export"><div><strong>Review output</strong><small>{approval?.manifest ? `${approval.manifest.rows.length} verified balances · GHS ${approval.manifest.totalGhs.toFixed(2)} · Review-only export available` : `Approval export blocked: ${approval?.errors?.slice(0, 3).join(" | ") || "Complete review decisions first"}`}</small></div><button className={button} onClick={download}>Export CSV</button><button className={`${button} fh-primary`} disabled={!approval?.manifest} onClick={downloadApproval}>Export review JSON</button></div>
    </>}
    <div className="fh-preflight"><button className="fh-preflight-toggle" onClick={() => setPreflightOpen(x => !x)} aria-expanded={preflightOpen}><span><strong>Opening balance preflight</strong><small>Check a review-only manifest against this device's current records</small></span><b aria-hidden="true">{preflightOpen ? "⌃" : "⌄"}</b></button>{preflightOpen && <div className="fh-preflight-content"><FinanceOpeningBalancePreflight accountId={accountId} schoolId={schoolId} branchId={branchId}/></div>}</div>
    <p className="fh-notice">No invoices, fees, payments or balances are created here. A review-only export is not approval to post. The preflight checks this device only; backend reconciliation and authorization remain necessary.</p>
    <ExcelImportSheet open={open} onClose={() => { if (!busy) setOpen(false); }} busy={busy} step={stage} title="Open historical workbook" subtitle="Choose the workbook and worksheets to review. No financial records are changed." footer={<div className="fh-modal-footer">{stage === "sheet" && <button className={button} onClick={() => { setStage("file"); setError(""); }} disabled={busy}>Back</button>}<button className={button} onClick={() => setOpen(false)} disabled={busy}>Cancel</button><button className={`${button} fh-primary`} disabled={busy || (stage === "file" ? !file : !selectedSheets.length)} onClick={() => stage === "file" ? void parseSelectedFile() : finishSelection()}>{busy ? "Reading…" : stage === "file" ? "Continue" : "Review selected sheets"}</button></div>}>
      {stage === "file" ? <ExcelFilePicker value={file} onChange={f => { setFile(f); setError(""); }} disabled={busy} label="Historical Excel workbook" description="Select an existing .xlsx or .xls workbook. Data will be reviewed, not imported into Finance." error={error}/> : <div className="fh-sheet-step"><strong>Select worksheets</strong><p>Review one or several sheets. Only candidates from selected sheets appear in the results.</p><div className="fh-sheet-options">{(review?.sheets || workbook?.sheets || []).map(sh => <label key={sh.name}><input type="checkbox" checked={selectedSheets.includes(sh.name)} onChange={e => setSelectedSheets(curr => e.target.checked ? [...curr, sh.name] : curr.filter(n => n !== sh.name))}/><span><strong>{sh.name}</strong>{"kind" in sh && <small>{String(sh.kind)} · {String(sh.reviewedRows)} reviewed rows</small>}</span></label>)}</div>{error && <p role="alert" className="fh-error">{error}</p>}</div>}
    </ExcelImportSheet>
  </section>;
}

const styles = `
.fh-workspace{--fh-line:var(--border,rgba(100,116,139,.24));--fh-surface:var(--card-bg,var(--surface,#fff));--fh-text:var(--text,#172033);--fh-muted:var(--muted,#64748b);--fh-accent:var(--ba-primary,var(--primary-color,#2563eb));width:100%;min-width:0;color:var(--fh-text);font:inherit;padding:4px 0 20px}
.fh-workspace *{box-sizing:border-box}.fh-toolbar{display:flex;align-items:center;gap:7px;margin:5px 0 13px;position:relative}.fh-search-wrap{display:flex;align-items:center;flex:1;min-width:0;border:1px solid var(--fh-line);background:var(--fh-surface);border-radius:10px;padding:0 11px;gap:8px}.fh-search-wrap input{border:0!important;outline:0;flex:1;min-width:0;height:38px;background:transparent!important;color:inherit;font:inherit;font-size:13px}.fh-button{border:1px solid var(--fh-line);border-radius:9px;background:var(--fh-surface);color:inherit;padding:8px 12px;min-height:38px;cursor:pointer;font:inherit;font-weight:650;font-size:12px}.fh-button:disabled{opacity:.45;cursor:not-allowed}.fh-primary{background:var(--fh-accent);border-color:var(--fh-accent);color:#fff}.fh-more{position:absolute;right:0;z-index:50;background:var(--fh-surface);border:1px solid var(--fh-line);border-radius:12px;box-shadow:0 12px 28px #0002;padding:6px;display:grid;min-width:230px;margin-top:-7px}.fh-more button{border:0;background:transparent;color:inherit;text-align:left;padding:10px;border-radius:7px;cursor:pointer;font:inherit;font-size:12px}.fh-more button:hover{background:color-mix(in srgb,var(--fh-accent) 8%,var(--fh-surface))}.fh-more button:disabled{opacity:.4}.fh-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:7px 0 14px}.fh-heading h2{margin:0;font-size:19px}.fh-heading p{margin:4px 0 0;font-size:12px;color:var(--fh-muted)}.fh-readonly{font-size:11px;font-weight:700;border:1px solid var(--fh-line);border-radius:30px;padding:5px 10px;white-space:nowrap}.fh-empty{display:grid;justify-items:center;gap:9px;text-align:center;border:1px dashed var(--fh-line);border-radius:13px;padding:30px 15px;background:var(--fh-surface)}.fh-empty h3{font-size:15px;margin:0}.fh-empty p{font-size:12px;color:var(--fh-muted);max-width:460px;margin:0 0 6px}.fh-empty-icon{font-size:32px;color:var(--fh-accent)}.fh-file-summary{border:1px solid var(--fh-line);background:var(--fh-surface);border-radius:11px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.fh-file-summary strong,.fh-file-summary small{display:block;overflow-wrap:anywhere}.fh-file-summary small{color:var(--fh-muted);font-size:11px;margin-top:3px}.fh-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.fh-stats>div{border:1px solid var(--fh-line);border-radius:10px;padding:12px;background:var(--fh-surface)}.fh-stats small,.fh-stats strong{display:block}.fh-stats small{color:var(--fh-muted);font-size:11px}.fh-stats strong{font-size:21px;margin-top:4px}.fh-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:12px 0}.fh-controls label{font-size:11px;color:var(--fh-muted);font-weight:650;display:grid;gap:4px}.fh-workspace input:not([type=checkbox]),.fh-workspace select,.fh-workspace textarea{font:inherit;color:var(--fh-text);background:var(--fh-surface);border:1px solid var(--fh-line);border-radius:8px;padding:8px;min-height:35px;font-size:12px}.fh-count{margin-left:auto;font-size:11px;color:var(--fh-muted)}.fh-table-scroll{overflow:auto;max-height:65vh;border:1px solid var(--fh-line);border-radius:11px;background:var(--fh-surface)}.fh-table{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0}.fh-table th{position:sticky;top:0;background:color-mix(in srgb,var(--fh-surface) 91%,var(--fh-text) 9%);z-index:2;text-align:left;font-size:11px;letter-spacing:.015em;padding:12px 9px;white-space:nowrap;border-bottom:1px solid var(--fh-line)}.fh-table td{border-bottom:1px solid var(--fh-line);vertical-align:top;padding:10px 9px;font-size:12px;max-width:250px}.fh-table td strong,.fh-table td small{display:block}.fh-table td small{color:var(--fh-muted);margin-top:4px;font-size:11px}.fh-table td input{display:block;width:100%;margin-bottom:5px}.fh-table td select{width:100%;min-width:155px}.fh-money strong{font-variant-numeric:tabular-nums}.fh-tag{display:inline-block;border-radius:20px;padding:3px 7px;background:color-mix(in srgb,var(--fh-text) 8%,var(--fh-surface));font-size:10px;font-weight:700;overflow-wrap:anywhere}.fh-blocked{background:rgba(220,38,38,.12)}.fh-ready{background:rgba(22,163,74,.12)}.fh-more-rows{display:block;margin:12px auto}.fh-export{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--fh-surface);border:1px solid var(--fh-line);border-radius:11px;padding:12px;margin:12px 0}.fh-export>div{flex:1;min-width:190px}.fh-export strong,.fh-export small{display:block}.fh-export small{font-size:11px;color:var(--fh-muted);margin-top:3px}.fh-preflight{border:1px solid var(--fh-line);border-radius:11px;background:var(--fh-surface);overflow:hidden;margin-top:12px}.fh-preflight-toggle{width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.fh-preflight-toggle strong,.fh-preflight-toggle small{display:block}.fh-preflight-toggle small{font-size:11px;color:var(--fh-muted);margin-top:4px}.fh-preflight-content{padding:0 10px 12px}.fh-notice{font-size:11px;line-height:1.55;color:var(--fh-muted);margin:14px 0}.fh-modal-footer{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.fh-sheet-step>p{font-size:12px;color:var(--fh-muted)}.fh-sheet-options{display:grid;gap:7px;max-height:310px;overflow:auto}.fh-sheet-options label{display:flex;gap:10px;align-items:center;border:1px solid var(--fh-line);border-radius:10px;padding:11px;cursor:pointer}.fh-sheet-options small{display:block;color:var(--fh-muted);font-size:11px;margin-top:3px}.fh-error{color:#b91c1c;font-size:12px}
@media(max-width:620px){.fh-heading{display:block}.fh-readonly{display:inline-block;margin-top:8px}.fh-stats{gap:5px}.fh-stats>div{padding:9px}.fh-stats strong{font-size:17px}.fh-toolbar .fh-button-label{display:none}.fh-controls label{flex:1;min-width:115px}.fh-controls label input,.fh-controls label select{width:100%}.fh-export .fh-button{flex:1}.fh-file-summary{align-items:flex-start}.fh-file-summary .fh-button{white-space:nowrap}}
`;
