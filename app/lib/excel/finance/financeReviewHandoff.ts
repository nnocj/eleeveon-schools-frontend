/**
 * Finance opening balance handoff. A REVIEW ARTIFACT, never a posting authorization.
 * Treat input workbook/manifests as untrusted. No finance database mutation here.
 */
import type { ApprovalManifest } from './financeApprovalManifest';
import type { PreflightResult } from './financePostingPreflight';

export type ReviewHandoffRow = {
  sourceKey: string;
  sheetName: string;
  excelRow: number;
  studentId: string;
  academicYear: string;
  balanceMinorGhs: number;
  studentStatus: string;
  existingInvoiceCount: number;
  existingPaymentCount: number;
  evidence: string;
  identity: string;
  issueCodes: string[];
  issues: string[];
};
export type FinanceReviewHandoff = {
  schema: 'eleeveon.finance.opening-balance-handoff.v1';
  postingAuthorized: false;
  generatedAt: string;
  sourceManifestCreatedAt: string;
  accountId: string;
  schoolId: string;
  branchId: string;
  totalMinorGhs: number;
  blockedCount: number;
  reviewCount: number;
  notes: string;
  rows: ReviewHandoffRow[];
};
const text = (v: unknown) => String(v ?? '').trim();
const minor = (n: number) => Math.round(n * 100);
function isValidMoney(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.abs(n*100 - minor(n)) <= 0.000001;
}
/** Fail closed: don't produce an approval handoff for partial or inconsistent preflights. */
export function createFinanceReviewHandoff(args: {
  manifest: ApprovalManifest;
  preflight: PreflightResult;
  accountId: string;
  schoolId: string;
  branchId: string;
  notes: string;
  generatedAt?: string;
}): FinanceReviewHandoff {
  const {manifest:m, preflight:p} = args;
  if (m.schema !== 'eleeveon.finance.opening-balance-review.v1' || m.reviewOnly !== true)
    throw new Error('Invalid review-only manifest.');
  if (![args.accountId,args.schoolId,args.branchId].every(Boolean) || m.accountId !== args.accountId || m.schoolId !== args.schoolId || m.branchId !== args.branchId)
    throw new Error('Account, school or branch scope mismatch.');
  if (!Array.isArray(m.rows) || !m.rows.length || !Array.isArray(p.rows) || p.rows.length !== m.rows.length)
    throw new Error('A complete, nonempty preflight is required.');
  if (!text(args.notes)) throw new Error('Add a reconciliation note before exporting the handoff.');
  const keyed = new Map<string, typeof p.rows[number]>();
  for (const row of p.rows) {
    if (!text(row.sourceKey) || keyed.has(row.sourceKey)) throw new Error('Duplicate or missing preflight source keys.');
    keyed.set(row.sourceKey,row);
  }
  const seen = new Set<string>();
  let total = 0;
  const rows = m.rows.map(r => {
    if (!text(r.sourceKey) || seen.has(r.sourceKey)) throw new Error('Duplicate or missing manifest source key.');
    seen.add(r.sourceKey);
    if (!text(r.studentId) || !/^\d{4}\/\d{4}$/.test(r.academicYear) || !isValidMoney(r.balanceGhs)) throw new Error(`Invalid amount, year, or student for ${r.sourceKey}.`);
    const pf = keyed.get(r.sourceKey);
    if (!pf || pf.studentId !== r.studentId || pf.academicYear !== r.academicYear || minor(pf.balanceGhs) !== minor(r.balanceGhs))
      throw new Error(`Stale or mismatched preflight for ${r.sourceKey}. Run preflight again.`);
    total += minor(r.balanceGhs);
    return {
      sourceKey:r.sourceKey,sheetName:r.sheetName,excelRow:r.excelRow,studentId:r.studentId,
      academicYear:r.academicYear,balanceMinorGhs:minor(r.balanceGhs),studentStatus:pf.studentStatus,
      existingInvoiceCount:pf.existingInvoiceCount,existingPaymentCount:pf.existingPaymentCount,
      evidence:r.evidence,identity:r.identity,issueCodes:pf.issues.map(x=>x.code),issues:pf.issues.map(x=>x.message),
    };
  });
  if (total !== minor(m.totalGhs) || total !== minor(p.totalGhs)) throw new Error('Financial total mismatch. Run preflight again.');
  if (p.blockedCount !== p.issues.filter(x=>x.severity === 'block').length || p.reviewCount !== p.issues.filter(x=>x.severity === 'review').length)
    throw new Error('Preflight issue totals do not match.');
  return {
    schema:'eleeveon.finance.opening-balance-handoff.v1',postingAuthorized:false,
    generatedAt:args.generatedAt || new Date().toISOString(),sourceManifestCreatedAt:m.createdAt,
    accountId:m.accountId,schoolId:m.schoolId,branchId:m.branchId,
    totalMinorGhs:total,blockedCount:p.blockedCount,reviewCount:p.reviewCount,
    notes:text(args.notes),rows,
  };
}
function csvCell(v:unknown):string {
  const raw = String(v ?? '');
  // Prevent formula injection if a reviewer opens the CSV in Excel.
  const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? "'"+raw : raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function financeReviewHandoffCSV(handoff:FinanceReviewHandoff):string {
  const header=['Source key','Sheet','Excel row','Student ID','Identity as entered','Academic year','Balance GHS','Student status','Existing invoices','Existing payments','Issue codes','Issues','Evidence'];
  const output = handoff.rows.map(r=>[r.sourceKey,r.sheetName,r.excelRow,r.studentId,r.identity,r.academicYear,(r.balanceMinorGhs/100).toFixed(2),r.studentStatus,r.existingInvoiceCount,r.existingPaymentCount,r.issueCodes.join('; '),r.issues.join('; '),r.evidence]);
  return '\uFEFF'+[header,...output].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
