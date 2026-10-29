/** Offline-safe review decisions for historical finance rows. NO financial writes. */
import type { LegacyFinanceCandidate, LegacyFinanceReview } from './financeLegacyReview';

export type FinanceReviewDecision = {
  candidateKey: string;
  action: 'skip' | 'hold' | 'opening_balance_review';
  confirmedStudentId?: string;
  academicYear?: string;
  note?: string;
};
export type FinanceReviewFinding = {
  key: string;
  sheet: string;
  row: number;
  status: 'ready_for_finance_approval' | 'blocked' | 'skipped';
  issues: string[];
  studentId?: string;
  proposedOpeningBalance?: number;
};
const nonblank = (value: unknown) => String(value ?? '').trim();
export function validateFinanceReview(
  review: LegacyFinanceReview,
  decisions: Record<string, FinanceReviewDecision>,
  allowedStudentIds: ReadonlySet<string>,
): FinanceReviewFinding[] {
  return review.candidates.map((candidate: LegacyFinanceCandidate) => {
    const d = decisions[candidate.key];
    if (!d || d.action === 'skip') return {key:candidate.key,sheet:candidate.sheetName,row:candidate.excelRow,status:'skipped',issues:[]};
    const issues: string[] = [];
    if (d.action === 'hold') issues.push('Held for manual review');
    const studentId = nonblank(d.confirmedStudentId);
    if (!studentId || !allowedStudentIds.has(studentId)) issues.push('Select an existing student with verified identity');
    if (!/^\d{4}\/\d{4}$/.test(nonblank(d.academicYear))) issues.push('Specify an academic year, e.g. 2024/2025');
    if (candidate.discrepancy !== undefined && Math.abs(candidate.discrepancy) > 0.009) issues.push('Workbook debt figures do not reconcile');
    if (candidate.statedTotalDebt === undefined || candidate.statedTotalDebt < 0) issues.push('No valid nonnegative closing balance recognized');
    if (candidate.sheetKind === 'former_students' && !nonblank(d.note)) issues.push('Former student: record evidence/justification');
    return {
      key:candidate.key, sheet:candidate.sheetName,row:candidate.excelRow,
      status: issues.length ? 'blocked' : 'ready_for_finance_approval', issues,
      studentId:studentId || undefined,
      proposedOpeningBalance: candidate.statedTotalDebt,
    };
  });
}
/** CSV is a review log, not a transaction file. */
export function exportFinanceReviewCsv(review: LegacyFinanceReview, findings: FinanceReviewFinding[]): string {
  const f = new Map(findings.map(x=>[x.key,x]));
  const cols = ['Sheet','Excel row','Name in workbook','Admission number','Match','Previous debt','Term debt','Stated debt','Discrepancy','Review status','Confirmed student ID','Issues'];
  const escape=(v: unknown)=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+\-@\t\r]/,'\u0027$&')+'"';
  return '\uFEFF'+[cols,...review.candidates.map(c=>{const result=f.get(c.key);return [c.sheetName,c.excelRow,c.studentName,c.admissionNumber,c.matchStatus,c.previousDebt,c.termDebt,c.statedTotalDebt,c.discrepancy,result?.status,result?.studentId,result?.issues.join('; ')];})].map(row=>row.map(escape).join(',')).join('\r\n');
}
