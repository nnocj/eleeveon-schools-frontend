/** Finance historical migration approval manifest. Never creates a payment or invoice. */
import type { LegacyFinanceReview } from './financeLegacyReview';
import type { FinanceReviewDecision, FinanceReviewFinding } from './financeImportReview';

export type ApprovalRow = {
  sourceKey: string;
  sheetName: string;
  excelRow: number;
  studentId: string;
  academicYear: string;
  balanceGhs: number;
  evidence: string;
  identity: string;
};
export type ApprovalManifest = {
  schema: 'eleeveon.finance.opening-balance-review.v1';
  accountId: string;
  schoolId: string;
  branchId: string;
  createdAt: string;
  reviewOnly: true;
  rows: ApprovalRow[];
  totalGhs: number;
};
export type ManifestCheck = { manifest?: ApprovalManifest; errors: string[]; warnings: string[] };
const clean = (v: unknown) => String(v ?? '').trim();
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
export function prepareOpeningBalanceApproval(args: {
  review: LegacyFinanceReview;
  decisions: Record<string, FinanceReviewDecision>;
  findings: FinanceReviewFinding[];
  accountId: string;
  schoolId: string;
  branchId: string;
  createdAt?: string;
}): ManifestCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ApprovalRow[] = [];
  const findingByKey = new Map(args.findings.map(f => [f.key, f]));
  const selected = args.review.candidates.filter(c => args.decisions[c.key]?.action === 'opening_balance_review');
  if (!clean(args.accountId) || !clean(args.schoolId) || !clean(args.branchId)) errors.push('Account, school and branch scope are required.');
  if (!selected.length) errors.push('No rows are selected for opening-balance review.');
  for (const candidate of selected) {
    const decision = args.decisions[candidate.key];
    const finding = findingByKey.get(candidate.key);
    if (!finding || finding.status !== 'ready_for_finance_approval') {
      errors.push(`${candidate.sheetName} row ${candidate.excelRow}: ${finding?.issues.join('; ') || 'Not validated'}`);
      continue;
    }
    const year = clean(decision.academicYear);
    const m = /^(\d{4})\/(\d{4})$/.exec(year);
    if (!m || +m[2] !== +m[1] + 1) {
      errors.push(`${candidate.sheetName} row ${candidate.excelRow}: invalid academic year ${year}`);
      continue;
    }
    const amount = candidate.statedTotalDebt;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      errors.push(`${candidate.sheetName} row ${candidate.excelRow}: invalid debt amount`);
      continue;
    }
    rows.push({
      sourceKey: candidate.key,
      sheetName: candidate.sheetName,
      excelRow: candidate.excelRow,
      studentId: clean(decision.confirmedStudentId),
      academicYear: year,
      balanceGhs: roundMoney(amount),
      evidence: clean(decision.note),
      identity: clean(candidate.admissionNumber) || clean(candidate.studentName),
    });
  }
  // Multiple sheets may cover the same student/year; never silently sum those balances.
  const byStudentYear = new Map<string, ApprovalRow[]>();
  for (const r of rows) {
    const key = `${r.studentId}|${r.academicYear}`;
    byStudentYear.set(key, [...(byStudentYear.get(key) || []), r]);
  }
  for (const [key, related] of byStudentYear) {
    if (related.length > 1) errors.push(`Multiple possible closing balances for ${key}: ${related.map(r => `${r.sheetName} row ${r.excelRow}`).join(', ')}. Resolve before approval export.`);
  }
  if (selected.length !== rows.length) warnings.push('Some selected rows did not pass validation.');
  if (errors.length) return {errors, warnings};
  return {
    errors, warnings,
    manifest: {
      schema: 'eleeveon.finance.opening-balance-review.v1',
      accountId: clean(args.accountId), schoolId: clean(args.schoolId), branchId: clean(args.branchId),
      createdAt: args.createdAt || new Date().toISOString(), reviewOnly: true,
      rows,
      totalGhs: roundMoney(rows.reduce((s,r) => s + r.balanceGhs, 0)),
    },
  };
}
