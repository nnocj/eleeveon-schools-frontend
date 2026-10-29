/**
 * Eleeveon Schools — conservative legacy finance workbook review.
 * No database writes. In particular, historical pupils never become active students.
 * Accepts ParsedExcelWorkbook from ../excelWorkbook and branch-scoped records from db.ts.
 */
import type { ParsedExcelWorkbook, ExcelRawRow } from "../excelTypes";
import type { Student } from "../../db/db";

export type LegacySheetKind = "current_class" | "former_students" | "staff" | "daily_accounts" | "unrecognized";
export type LegacyMatchStatus = "matched_active" | "matched_former" | "unmatched" | "ambiguous";
export interface LegacyFinanceCandidate {
  key: string;
  sheetName: string;
  excelRow: number;
  sheetKind: LegacySheetKind;
  studentName: string;
  admissionNumber?: string;
  previousDebt?: number;
  termDebt?: number;
  statedTotalDebt?: number;
  discrepancy?: number;
  matchedStudentId?: string;
  matchStatus: LegacyMatchStatus;
  recommendation: "review_only" | "eligible_for_explicit_balance_migration";
  warning?: string;
}
export interface LegacyFinanceReview {
  candidates: LegacyFinanceCandidate[];
  sheets: Array<{ name: string; kind: LegacySheetKind; reviewedRows: number; note?: string }>;
  totals: { matchedActive: number; matchedFormer: number; unmatched: number; ambiguous: number; discrepancies: number };
}
const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g," ").toUpperCase();
const bare = (value: unknown) => normalize(value).replace(/[^A-Z0-9]/g, "");
const monetary = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const clean = text.replace(/(?:GH₵|GHS|CEDIS?|,|\s)/gi, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(clean)) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
};
export function classifyLegacyFinanceSheet(sheetName: string): LegacySheetKind {
  const key = normalize(sheetName);
  if (/STOPPED|OLD STUDENTS|FORMER|WITHDRAW|LEFT SCHOOL|ALUMNI/.test(key)) return "former_students";
  if (/TEACHERS|STAFF|PAYROLL|SALAR/.test(key)) return "staff";
  if (/DAILY ACCOUNTS|DAILY ACCOUNT|CASH BOOK|CASHBOOK/.test(key)) return "daily_accounts";
  if (/^(NUR\s?\d|NURSERY\s?\d|CRECHE|CRÈCHE|KG\s?\d|CLASS\s?\d|BASIC\s?\d|FORM\s?\d|JHS\s?\d)/.test(key)) return "current_class";
  return "unrecognized";
}
const isFormer = (student: Student) => ["withdrawn", "transferred", "graduated"].includes(String(student.status || "").toLowerCase()) || student.isDeleted === true;
const isStudentHeader = (value: unknown) => /STUDENT.?S?\s*NAME|LEARNER.?S?\s*NAME|PUPIL.?S?\s*NAME/.test(normalize(value));
const isDebtHeader = (value: unknown) => /\bDEBT\b|ARREARS|BALANCE/.test(normalize(value));
function findHeader(rows: ExcelRawRow[]): { nameCol: number; idCol: number; previousCol: number; termCol: number; totalCol: number; row: number } | null {
  for (let i=0;i<Math.min(rows.length, 20);i++) {
    const r=rows[i] || [];
    const nameCol=r.findIndex(isStudentHeader);
    if(nameCol<0) continue;
    const idCol=r.findIndex(c => /ADMISSION\s*(NO|NUMBER|ID)|STUDENT\s*ID/.test(normalize(c)));
    const debts=r.map((c,j)=>({j,v:c})).filter(x=>isDebtHeader(x.v)).map(x=>x.j);
    const totalCol=r.findIndex(c=> /TOTAL\s*(DEBT|BALANCE|ARREARS)/.test(normalize(c)));
    return { nameCol, idCol, previousCol:debts.find(j=>j!==totalCol) ?? -1, termCol:debts.find(j=>j!==totalCol && j!==debts.find(k=>k!==totalCol)) ?? -1, totalCol, row:i };
  }
  return null;
}
export function reviewLegacyFinanceWorkbook(args: {
  workbook: ParsedExcelWorkbook;
  students: Student[];
  accountId: string;
  schoolId: string;
  branchId: string;
}): LegacyFinanceReview {
  const scoped=args.students.filter(s=>String(s.accountId)===args.accountId && String(s.schoolId)===args.schoolId && String(s.branchId)===args.branchId);
  const byId=new Map<string,Student[]>(); const byName=new Map<string,Student[]>();
  for(const s of scoped){
    const id=bare(s.admissionNumber); const name=normalize(s.fullName);
    if(id) byId.set(id,[...(byId.get(id)||[]),s]);
    if(name) byName.set(name,[...(byName.get(name)||[]),s]);
  }
  const candidates:LegacyFinanceCandidate[]=[];
  const sheets:LegacyFinanceReview["sheets"]=[];
  for(const sheet of args.workbook.sheets){
    const kind=classifyLegacyFinanceSheet(sheet.name);
    if(kind==="staff"||kind==="daily_accounts"||kind==="unrecognized"){
      sheets.push({name:sheet.name,kind,reviewedRows:0,note:"Not student finance rows; separate mapping required"}); continue;
    }
    const header=findHeader(sheet.rows);
    if(!header){sheets.push({name:sheet.name,kind,reviewedRows:0,note:"Student header not recognized; manual mapping required"});continue;}
    let reviewedRows=0;
    for(let i=header.row+1;i<sheet.rows.length;i++){
      const row=sheet.rows[i]||[];
      const name=String(row[header.nameCol]??"").trim();
      if(!name||isStudentHeader(name)||/^(TOTAL|SUBTOTAL|GRAND TOTAL|S\/N)$/i.test(name)||!/[A-Za-z]/.test(name)) continue;
      const admission=header.idCol>=0?String(row[header.idCol]??"").trim():"";
      const explicitId=admission?byId.get(bare(admission))||[]:[];
      // Names are suggestions only: a name match cannot authorize a financial write.
      const suggested=byName.get(normalize(name))||[];
      const matches=admission?explicitId:suggested;
      const unique=matches.length===1?matches[0]:undefined;
      const matchStatus: LegacyMatchStatus=matches.length>1?"ambiguous":!unique?"unmatched":isFormer(unique)?"matched_former":"matched_active";
      const previousDebt=header.previousCol>=0?monetary(row[header.previousCol]):undefined;
      const termDebt=header.termCol>=0?monetary(row[header.termCol]):undefined;
      const statedTotalDebt=header.totalCol>=0?monetary(row[header.totalCol]):undefined;
      const discrepancy=previousDebt!==undefined&&termDebt!==undefined&&statedTotalDebt!==undefined?Math.round((previousDebt+termDebt-statedTotalDebt)*100)/100:undefined;
      const kindFormer=kind==="former_students";
      // Even a unique name does not authorize migration without a stable identifier.
      const eligible=!!admission && !!unique && matches.length===1 && !kindFormer && !isFormer(unique) && discrepancy!==undefined && Math.abs(discrepancy)<0.01;
      candidates.push({key:`${sheet.index}:${i+1}`,sheetName:sheet.name,excelRow:i+1,sheetKind:kind,studentName:name,
        admissionNumber:admission||undefined,previousDebt,termDebt,statedTotalDebt,discrepancy,
        matchedStudentId:unique?.id,matchStatus,recommendation:eligible?"eligible_for_explicit_balance_migration":"review_only",
        warning:kindFormer?"Historical/former-student sheet: never reactivate, enroll or bill automatically":
          !admission?"No permanent admission number: identity requires manual confirmation":
          matches.length!==1?"Unresolved student identity":isFormer(unique!)?"Former student: preserve historical status":
          discrepancy!==undefined&&Math.abs(discrepancy)>=0.01?"Debt columns do not reconcile":undefined});
      reviewedRows++;
    }
    sheets.push({name:sheet.name,kind,reviewedRows});
  }
  return {candidates,sheets,totals:{matchedActive:candidates.filter(c=>c.matchStatus==="matched_active").length,
    matchedFormer:candidates.filter(c=>c.matchStatus==="matched_former").length,
    unmatched:candidates.filter(c=>c.matchStatus==="unmatched").length,
    ambiguous:candidates.filter(c=>c.matchStatus==="ambiguous").length,
    discrepancies:candidates.filter(c=>c.discrepancy!==undefined&&Math.abs(c.discrepancy)>=0.01).length}};
}
