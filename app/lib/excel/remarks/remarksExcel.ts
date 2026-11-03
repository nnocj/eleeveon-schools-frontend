/** Eleeveon Remarks Excel: branch/term scoped, offline-first, stable IDs only. */
import {db, type ReportCard} from "../../db/db";
import {createLocal, updateLocal} from "../../sync/syncUtils";
import {downloadExcelWorkbook, parseExcelFile} from "../excelWorkbook";

export type RemarksExcelRow = {
 student: {id:string;fullName?:string;admissionNumber?:string};
 enrollment: {classId:string;academicStructureId:string;academicPeriodId:string};
 reportCard?: ReportCard;
};
export type RemarksExcelScope = {accountId:string;schoolId:string;branchId:string;academicStructureId:string;academicPeriodId:string;teacherOnly:boolean};
export type RemarksPreview = {row:number;source:string;target?:RemarksExcelRow;teacherRemark?:string;headRemark?:string;status:"update"|"create"|"unchanged"|"error";message?:string};
export type RemarksExcelSelection = {sheetName:string;headerRowIndex:number;mapping:Partial<Record<RemarksColumn,number>>};
export type RemarksColumn = "studentId"|"admissionNumber"|"studentName"|"classTeacherRemark"|"headTeacherRemark";
export const REMARKS_FIELDS:RemarksColumn[]=["studentId","admissionNumber","studentName","classTeacherRemark","headTeacherRemark"];
const s=(v:unknown)=>String(v??"").trim();
const key=(v:unknown)=>s(v).toLowerCase().replace(/[^a-z0-9]/g,"");
const HEADERS:Record<RemarksColumn,string[]>={
 studentId:["studentid","studentuuid","id"],
 admissionNumber:["admissionnumber","admissionno","admissionid","studentnumber","studentno"],
 studentName:["studentname","fullname","name","learnername"],
 classTeacherRemark:["classteacherremark","classremark","teacherremark","classteacherscomment","classteachercomment"],
 headTeacherRemark:["headteacherremark","headremark","headteachercomment","headmasterremark","headmistressremark"]
};
export function suggestRemarksMapping(cells:unknown[]):Partial<Record<RemarksColumn,number>> {
 const headings=cells.map(key);
 return Object.fromEntries(REMARKS_FIELDS.map(field=>[field,headings.findIndex(h=>HEADERS[field].includes(h))])) as Partial<Record<RemarksColumn,number>>;
}
export function exportRemarks(rows:RemarksExcelRow[],scope:RemarksExcelScope) {
 downloadExcelWorkbook({fileName:`Eleeveon-Remarks-${scope.academicPeriodId}.xlsx`,sheets:[{name:"Remarks",freezeHeader:true,columns:[
  {key:"studentId",header:"Student ID",width:38},{key:"admissionNumber",header:"Admission Number",width:22},
  {key:"studentName",header:"Student Name",width:32},{key:"classTeacherRemark",header:"Class Teacher Remark",width:55},
  ...(!scope.teacherOnly?[{key:"headTeacherRemark",header:"Head Teacher Remark",width:55}]:[])
 ],rows:rows.map(r=>({studentId:r.student.id,admissionNumber:r.student.admissionNumber||"",studentName:r.student.fullName||"",classTeacherRemark:r.reportCard?.classTeacherRemark||"",...(!scope.teacherOnly?{headTeacherRemark:r.reportCard?.headTeacherRemark||""}:{})})),preambleRows:[["Academic structure ID",scope.academicStructureId],["Academic period ID",scope.academicPeriodId],["Branch ID",scope.branchId]]}]});
}
export async function previewRemarksFile(file:File,rows:RemarksExcelRow[],scope:RemarksExcelScope,selection?:RemarksExcelSelection):Promise<RemarksPreview[]> {
 const workbook=await parseExcelFile(file);
 const sheet=selection?workbook.sheets.find(x=>x.name===selection.sheetName):workbook.sheets.find(x=>x.rows.some(r=>r.some(c=>key(c)==="studentid"||key(c)==="admissionnumber")));
 if(!sheet)throw Error("Choose the worksheet containing the remarks to import.");
 const headerIndex=selection?.headerRowIndex??sheet.rows.findIndex(r=>r.some(c=>key(c)==="studentid"||key(c)==="admissionnumber"));
 if(!Number.isInteger(headerIndex)||headerIndex<0||headerIndex>=sheet.rows.length)throw Error("Choose a valid column header row.");
 const meta:Record<string,string>={};
 for(const cells of sheet.rows.slice(0,headerIndex)){
  const field=key(cells?.[0]);
  if(["academicstructureid","academicperiodid","branchid"].includes(field))meta[field]=s(cells?.[1]);
 }
 if(meta.branchid&&meta.branchid!==scope.branchId)throw Error("Workbook belongs to a different branch.");
 if(meta.academicstructureid&&meta.academicstructureid!==scope.academicStructureId)throw Error("Workbook belongs to a different academic year.");
 if(meta.academicperiodid&&meta.academicperiodid!==scope.academicPeriodId)throw Error("Workbook belongs to a different academic period.");
 const header=sheet.rows[headerIndex];
 const suggested=suggestRemarksMapping(header);
 const cols=selection?selection.mapping:suggested;
 const index=(field:RemarksColumn)=>cols[field]??-1;
 const validIndex=(field:RemarksColumn)=>Number.isInteger(index(field))&&index(field)>=0&&index(field)<header.length;
 if(!validIndex("studentId")&&!validIndex("admissionNumber"))throw Error("Student ID or Admission Number mapping is required. Names cannot identify students.");
 if(!validIndex("classTeacherRemark")&&!validIndex("headTeacherRemark"))throw Error("Map at least one remark column.");
 if(scope.teacherOnly&&validIndex("headTeacherRemark"))throw Error("Teacher imports cannot include head-teacher remarks.");
 const usedSource=new Set<number>();
 for(const field of REMARKS_FIELDS){if(!validIndex(field))continue;const i=index(field);if(usedSource.has(i))throw Error("A spreadsheet column cannot be mapped to multiple fields.");usedSource.add(i);}
 const byId=new Map(rows.map(r=>[s(r.student.id),r]));
 const byAdmission=new Map<string,RemarksExcelRow[]>();
 for(const r of rows){const a=key(r.student.admissionNumber);if(a)byAdmission.set(a,[...(byAdmission.get(a)||[]),r]);}
 const seen=new Set<string>(),out:RemarksPreview[]=[];
 for(let n=headerIndex+1;n<sheet.rows.length;n++){
  const cells=sheet.rows[n];if(!cells||cells.every(c=>!s(c)))continue;
  const val=(field:RemarksColumn)=>validIndex(field)?s(cells[index(field)]):"";
  const sid=val("studentId"),adm=val("admissionNumber");
  const candidate=sid?byId.get(sid):undefined;
  const matches=adm?byAdmission.get(key(adm))||[]:[];
  const target=candidate||(!sid&&matches.length===1?matches[0]:undefined);
  const entry:RemarksPreview={row:n+1,source:sid||adm,target,status:"error"};
  if(!target){entry.message=sid?"Student ID is not in this selected class/term":matches.length>1?"Ambiguous admission number":"Student not found in the selected class/term";out.push(entry);continue;}
  if(sid&&adm&&key(target.student.admissionNumber)!==key(adm)){entry.message="Student ID and admission number disagree";out.push(entry);continue;}
  if(seen.has(target.student.id)){entry.message="Duplicate student in workbook";out.push(entry);continue;}
  seen.add(target.student.id);
  if(target.enrollment.academicStructureId!==scope.academicStructureId||target.enrollment.academicPeriodId!==scope.academicPeriodId){entry.message="Enrollment is outside selected academic period";out.push(entry);continue;}
  const teacherRemark=val("classTeacherRemark"),headRemark=val("headTeacherRemark");
  if(teacherRemark.length>2500||headRemark.length>2500){entry.message="Remark exceeds 2500 characters";out.push(entry);continue;}
  entry.teacherRemark=teacherRemark||undefined;entry.headRemark=scope.teacherOnly?undefined:(headRemark||undefined);
  const changed=Boolean((entry.teacherRemark&&entry.teacherRemark!==s(target.reportCard?.classTeacherRemark))||(entry.headRemark&&entry.headRemark!==s(target.reportCard?.headTeacherRemark)));
  entry.status=changed?(target.reportCard?.id?"update":"create"):"unchanged";out.push(entry);
 }
 return out;
}
export async function commitRemarksPreview(preview:RemarksPreview[],scope:RemarksExcelScope,options?:{overwrite?:boolean}){
 if(!scope.accountId||!scope.schoolId||!scope.branchId||!scope.academicStructureId||!scope.academicPeriodId)throw Error("Choose an authorized branch and academic period.");
 let created=0,updated=0,unchanged=0;
 for(const p of preview){if(p.status==="error")continue;if(!p.target||p.status==="unchanged"){unchanged++;continue;}
  const t=p.target;
  const existing=(await db.reportCards.toArray()).find(r=>r.accountId===scope.accountId&&r.schoolId===scope.schoolId&&r.branchId===scope.branchId&&r.studentId===t.student.id&&r.classId===t.enrollment.classId&&r.academicStructureId===scope.academicStructureId&&r.academicPeriodId===scope.academicPeriodId&&!r.isDeleted);
  const teacherRemark=p.teacherRemark&&(options?.overwrite||!s(existing?.classTeacherRemark))?p.teacherRemark:undefined;
  const headRemark=!scope.teacherOnly&&p.headRemark&&(options?.overwrite||!s(existing?.headTeacherRemark))?p.headRemark:undefined;
  if(!teacherRemark&&!headRemark){unchanged++;continue;}
  const changes={...(teacherRemark?{classTeacherRemark:teacherRemark}:{}),...(headRemark?{headTeacherRemark:headRemark}:{})};
  if(existing?.id){await updateLocal("reportCards" as any,existing.id,changes as Partial<ReportCard>);updated++;}
  else{await createLocal("reportCards" as any,{accountId:scope.accountId,schoolId:scope.schoolId,branchId:scope.branchId,studentId:t.student.id,classId:t.enrollment.classId,academicStructureId:scope.academicStructureId,academicPeriodId:scope.academicPeriodId,total:0,average:0,published:false,...changes} as Partial<ReportCard>);created++;}
 }
 return{created,updated,unchanged,errors:preview.filter(p=>p.status==="error").length};
}
