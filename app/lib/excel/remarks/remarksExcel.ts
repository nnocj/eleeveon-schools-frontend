/** Eleeveon Remarks Excel: scoped, offline-first; only stable identifiers can match students. */
import { db, type ReportCard } from "../../db/db";
import { createLocal, updateLocal } from "../../sync/syncUtils";
import { downloadExcelWorkbook, parseExcelFile } from "../excelWorkbook";

export type RemarksExcelRow = {
  student: { id: string; fullName?: string; admissionNumber?: string };
  enrollment: { classId: string; academicStructureId: string; academicPeriodId: string };
  reportCard?: ReportCard;
};
export type RemarksExcelScope = { accountId: string; schoolId: string; branchId: string; academicStructureId: string; academicPeriodId: string; teacherOnly: boolean };
export type RemarksPreview = { row: number; source: string; target?: RemarksExcelRow; teacherRemark?: string; headRemark?: string; status: "update"|"create"|"unchanged"|"error"; message?: string };
const s = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => s(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const allowedColumns = ["studentId", "admissionNumber", "studentName", "classTeacherRemark", "headTeacherRemark"] as const;
const headers: Record<string,string[]> = {
  studentId: ["studentid","studentuuid","id"],
  admissionNumber: ["admissionnumber","admissionno","admissionid","studentnumber","studentno"],
  studentName: ["studentname","fullname","name","learnername"],
  classTeacherRemark: ["classteacherremark","classremark","teacherremark","classteacherscomment","classteachercomment"],
  headTeacherRemark: ["headteacherremark","headremark","headteachercomment","headmasterremark","headmistressremark"],
};
export function exportRemarks(rows: RemarksExcelRow[], scope: RemarksExcelScope) {
  downloadExcelWorkbook({
    fileName: `Eleeveon-Remarks-${scope.academicPeriodId}.xlsx`,
    sheets: [{ name: "Remarks", freezeHeader: true, columns: [
      {key:"studentId",header:"Student ID",width:38},
      {key:"admissionNumber",header:"Admission Number",width:22},
      {key:"studentName",header:"Student Name",width:32},
      {key:"classTeacherRemark",header:"Class Teacher Remark",width:55},
      ...(!scope.teacherOnly ? [{key:"headTeacherRemark",header:"Head Teacher Remark",width:55}] : []),
    ], rows: rows.map(r=>({studentId:r.student.id, admissionNumber:r.student.admissionNumber||"",studentName:r.student.fullName||"",classTeacherRemark:r.reportCard?.classTeacherRemark||"", ...(!scope.teacherOnly?{headTeacherRemark:r.reportCard?.headTeacherRemark||""}:{})})), preambleRows: [["Academic structure ID",scope.academicStructureId],["Academic period ID",scope.academicPeriodId],["Branch ID",scope.branchId]] }],
  });
}
export async function previewRemarksFile(file: File, rows: RemarksExcelRow[], scope: RemarksExcelScope): Promise<RemarksPreview[]> {
  const workbook = await parseExcelFile(file);
  const sheet = workbook.sheets.find(x=>x.rows.some(r=>r.some(c=>key(c)==="studentid"||key(c)==="admissionnumber")));
  if(!sheet) throw new Error("No remarks sheet containing Student ID or Admission Number headers was found.");
  const headerIndex = sheet.rows.findIndex(r=>r.some(c=>key(c)==="studentid"||key(c)==="admissionnumber"));
  // Eleeveon exported workbooks include scope identifiers before the header.
  // Reject a workbook exported for a different branch or academic period.
  const meta: Record<string,string> = {};
  for (const cells of sheet.rows.slice(0,headerIndex)) {
    const field = key(cells?.[0]);
    if (["academicstructureid","academicperiodid","branchid"].includes(field)) meta[field]=s(cells?.[1]);
  }
  if(meta.branchid && meta.branchid!==scope.branchId) throw new Error("Workbook belongs to a different branch.");
  if(meta.academicstructureid && meta.academicstructureid!==scope.academicStructureId) throw new Error("Workbook belongs to a different academic year.");
  if(meta.academicperiodid && meta.academicperiodid!==scope.academicPeriodId) throw new Error("Workbook belongs to a different academic period.");
  const header = sheet.rows[headerIndex].map(key);
  const cols = Object.fromEntries(allowedColumns.map(field=>[field,header.findIndex(h=>headers[field].includes(h))])) as Record<typeof allowedColumns[number],number>;
  if(cols.studentId<0 && cols.admissionNumber<0) throw new Error("Student ID or Admission Number is required.");
  if(cols.classTeacherRemark<0 && cols.headTeacherRemark<0) throw new Error("No remark columns found.");
  if(scope.teacherOnly && cols.headTeacherRemark>=0) throw new Error("Teacher imports cannot include head-teacher remark columns. Use a teacher-only export.");
  const byId = new Map(rows.map(r=>[s(r.student.id),r]));
  const byAdmission = new Map<string,RemarksExcelRow[]>();
  for(const r of rows){const a=key(r.student.admissionNumber);if(a)byAdmission.set(a,[...(byAdmission.get(a)||[]),r]);}
  const seen = new Set<string>();
  const out:RemarksPreview[]=[];
  for(let n=headerIndex+1;n<sheet.rows.length;n++){
    const cells=sheet.rows[n];if(!cells || cells.every(c=>!s(c)))continue;
    const val=(field:typeof allowedColumns[number])=>cols[field]<0?"":s(cells[cols[field]]);
    const sid=val("studentId"), adm=val("admissionNumber");
    const candidate = sid ? byId.get(sid) : undefined;
    const matches = adm ? byAdmission.get(key(adm))||[] : [];
    const target = candidate || (!sid && matches.length===1?matches[0]:undefined);
    const entry:RemarksPreview={row:n+1,source:sid||adm,target,status:"error"};
    if(!target){entry.message=sid?"Student ID is not in this selected class/term":matches.length>1?"Ambiguous admission number":"Student not found in the selected class/term";out.push(entry);continue;}
    if(sid && adm && key(target.student.admissionNumber)!==key(adm)){entry.message="Student ID and admission number disagree";out.push(entry);continue;}
    if(seen.has(target.student.id)){entry.message="Duplicate student in workbook";out.push(entry);continue;}
    seen.add(target.student.id);
    if(target.enrollment.academicStructureId!==scope.academicStructureId || target.enrollment.academicPeriodId!==scope.academicPeriodId){entry.message="Enrollment is outside selected academic period";out.push(entry);continue;}
    const teacherRemark=val("classTeacherRemark"), headRemark=val("headTeacherRemark");
    if(teacherRemark.length>2500 || headRemark.length>2500){entry.message="Remark exceeds 2500 characters";out.push(entry);continue;}
    // Blank cells do not erase saved remarks.
    entry.teacherRemark=teacherRemark || undefined;entry.headRemark=scope.teacherOnly?undefined:(headRemark||undefined);
    const changed=Boolean((entry.teacherRemark && entry.teacherRemark!==s(target.reportCard?.classTeacherRemark))||(entry.headRemark && entry.headRemark!==s(target.reportCard?.headTeacherRemark)));
    entry.status=changed?(target.reportCard?.id?"update":"create"):"unchanged";
    out.push(entry);
  }
  return out;
}
export async function commitRemarksPreview(preview:RemarksPreview[],scope:RemarksExcelScope, options?:{overwrite?:boolean}) {
  if(!scope.accountId || !scope.schoolId || !scope.branchId || !scope.academicStructureId || !scope.academicPeriodId) throw new Error("Choose an authorized branch and academic period.");
  // A changed row in the DB is rechecked immediately before saving.
  let created=0,updated=0,unchanged=0;
  for(const p of preview){if(p.status==="error")continue;if(!p.target || p.status==="unchanged"){unchanged++;continue;}
    const t=p.target;
    const existing = (await db.reportCards.toArray()).find(r=>r.accountId===scope.accountId && r.schoolId===scope.schoolId && r.branchId===scope.branchId && r.studentId===t.student.id && r.classId===t.enrollment.classId && r.academicStructureId===scope.academicStructureId && r.academicPeriodId===scope.academicPeriodId && !r.isDeleted);
    const teacherRemark=p.teacherRemark && (options?.overwrite || !s(existing?.classTeacherRemark))?p.teacherRemark:undefined;
    const headRemark=!scope.teacherOnly && p.headRemark && (options?.overwrite || !s(existing?.headTeacherRemark))?p.headRemark:undefined;
    if(!teacherRemark&&!headRemark){unchanged++;continue;}
    const changes={...(teacherRemark?{classTeacherRemark:teacherRemark}:{}),...(headRemark?{headTeacherRemark:headRemark}:{})};
    if(existing?.id){await updateLocal("reportCards" as any,existing.id,changes as Partial<ReportCard>);updated++;}
    else {await createLocal("reportCards" as any,{accountId:scope.accountId,schoolId:scope.schoolId,branchId:scope.branchId,studentId:t.student.id,classId:t.enrollment.classId,academicStructureId:scope.academicStructureId,academicPeriodId:scope.academicPeriodId,total:0,average:0,published:false,...changes} as Partial<ReportCard>);created++;}
  }
  return {created,updated,unchanged,errors:preview.filter(p=>p.status==="error").length};
}
