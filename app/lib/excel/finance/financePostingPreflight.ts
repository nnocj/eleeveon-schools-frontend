/** Read-only preflight for opening-balance review manifests. DOES NOT authorize or post debt. */
import type { ApprovalManifest, ApprovalRow } from './financeApprovalManifest';

export type FinanceStudentRef = { id: string; accountId?: string; schoolId: string; branchId: string; isDeleted?: boolean; status?: string; fullName?: string };
export type FinanceInvoiceRef = { id: string; accountId?: string; schoolId: string; branchId: string; studentId: string; academicStructureId?: string; academicPeriodId?: string; invoiceNumber?: string; balance?: number; status?: string; isDeleted?: boolean; metadata?: unknown };
export type FinancePaymentRef = { id: string; accountId?: string; schoolId: string; branchId: string; studentId: string; invoiceId?: string; amount?: number; status?: string; isDeleted?: boolean; metadata?: unknown };
export type PreflightIssue = { sourceKey: string; code: string; message: string; severity: 'block'|'review' };
export type PreflightRow = { sourceKey: string; studentId: string; academicYear: string; balanceGhs: number; studentStatus: string; existingInvoiceCount: number; existingPaymentCount: number; issues: PreflightIssue[]; eligibleForPosting: false };
export type PreflightResult = { rows: PreflightRow[]; issues: PreflightIssue[]; blockedCount: number; reviewCount: number; totalGhs: number; postingEnabled: false };
const clean=(v:unknown)=>String(v??'').trim();
const cents=(n:number)=>Math.round(n*100);
const matchScope=(r:{accountId?:string;schoolId:string;branchId:string;isDeleted?:boolean},m:ApprovalManifest)=>r.isDeleted!==true && (!r.accountId || r.accountId===m.accountId) && r.schoolId===m.schoolId && r.branchId===m.branchId;
const sourceFingerprint=(r:ApprovalRow)=>`${r.studentId}|${r.academicYear}`;
export function preflightOpeningBalances(args:{manifest:ApprovalManifest;students:readonly FinanceStudentRef[];invoices:readonly FinanceInvoiceRef[];payments:readonly FinancePaymentRef[]}):PreflightResult {
  const {manifest:m}=args;
  const allIssues:PreflightIssue[]=[];
  const results:PreflightRow[]=[];
  const counts=new Map<string,number>();
  for(const r of m.rows||[]) counts.set(sourceFingerprint(r),(counts.get(sourceFingerprint(r))||0)+1);
  const manifestOK=m.schema==='eleeveon.finance.opening-balance-review.v1' && m.reviewOnly===true && !!clean(m.accountId) && !!clean(m.schoolId) && !!clean(m.branchId) && Array.isArray(m.rows);
  for(const r of m.rows||[]){
    const issues:PreflightIssue[]=[];
    const push=(code:string,message:string,severity:'block'|'review'='block')=>issues.push({sourceKey:r.sourceKey,code,message,severity});
    if(!manifestOK)push('INVALID_MANIFEST','Unrecognized review manifest or missing scope.');
    const student=args.students.find(s=>s.id===r.studentId && matchScope(s,m));
    if(!student)push('STUDENT_NOT_FOUND','No matching student in the current branch.');
    if(!Number.isFinite(r.balanceGhs)||r.balanceGhs<0||Math.abs(r.balanceGhs*100-cents(r.balanceGhs))>0.001)push('INVALID_AMOUNT','Balance must be a nonnegative GHS amount with at most two decimal places.');
    const y=/^(\d{4})\/(\d{4})$/.exec(r.academicYear);
    if(!y || Number(y[2])!==Number(y[1])+1)push('INVALID_YEAR','Academic year must contain consecutive years.');
    if(!clean(r.evidence))push('MISSING_EVIDENCE','Reviewer evidence is required.');
    if((counts.get(sourceFingerprint(r))||0)>1)push('DUPLICATE_STUDENT_YEAR','Multiple balances for the same student/year.');
    if(student && student.status && student.status!=='active')push('FORMER_STUDENT','Former student: historical liability requires explicit authorized reconciliation.','review');
    const invoices=args.invoices.filter(x=>matchScope(x,m) && x.studentId===r.studentId);
    const payments=args.payments.filter(x=>matchScope(x,m) && x.studentId===r.studentId);
    if(invoices.length)push('EXISTING_INVOICES','Student already has invoices; an accountant must determine whether debt is already included.');
    if(payments.length)push('EXISTING_PAYMENTS','Student already has payment history; reconcile before any carry-forward.');
    results.push({sourceKey:r.sourceKey,studentId:r.studentId,academicYear:r.academicYear,balanceGhs:r.balanceGhs,studentStatus:student?.status||'unmatched',existingInvoiceCount:invoices.length,existingPaymentCount:payments.length,issues,eligibleForPosting:false});
    allIssues.push(...issues);
  }
  if(!manifestOK && results.length===0)allIssues.push({sourceKey:'manifest',code:'INVALID_MANIFEST',message:'Unrecognized or empty manifest.',severity:'block'});
  const totalGhs=Math.round(results.reduce((s,r)=>s+r.balanceGhs,0)*100)/100;
  if(cents(totalGhs)!==cents(m.totalGhs))allIssues.push({sourceKey:'manifest',code:'TOTAL_MISMATCH',message:'Manifest total does not agree with its rows.',severity:'block'});
  return {rows:results,issues:allIssues,blockedCount:allIssues.filter(i=>i.severity==='block').length,reviewCount:allIssues.filter(i=>i.severity==='review').length,totalGhs,postingEnabled:false};
}
