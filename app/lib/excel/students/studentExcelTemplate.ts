/** app/lib/excel/students/studentExcelTemplate.ts
 * Protected, colour-coded student template. Existing public function names retained.
 */
import type { ExcelExportWorkbook } from "../excelTypes";
import { downloadProtectedStudentWorkbook } from "./protectedStudentWorkbook";

export interface StudentExcelTemplateOptions {
 fileName?: string; schoolName?: string; branchName?: string;
 academicStructureName?: string; academicPeriodName?: string;
 className?: string; includeClassColumns?: boolean; includeExampleRow?: boolean;
}
type TemplateStudent = Record<string,string>;
const safe=(v:unknown)=>String(v||"").trim().replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").slice(0,80);
export function buildStudentExcelTemplate(options:StudentExcelTemplateOptions={}):ExcelExportWorkbook {
 const {schoolName,branchName,academicStructureName,academicPeriodName,className,includeClassColumns=true,includeExampleRow=true}=options;
 const preambleRows:Array<Array<string>> = [["ELEEVEON STUDENT IMPORT TEMPLATE"]];
 if(schoolName) preambleRows.push(["School",schoolName]);
 if(branchName) preambleRows.push(["Branch",branchName]);
 if(academicStructureName) preambleRows.push(["Academic Structure",academicStructureName]);
 if(academicPeriodName) preambleRows.push(["Academic Period",academicPeriodName]);
 if(className) preambleRows.push(["Selected Class",className]);
 preambleRows.push(["Instructions","Fill GREEN cells only. Keep headers unchanged. Student Name is required; Admission Number may be left empty when the school uses automatic numbering. Dates: 14 June 2026 or YYYY-MM-DD."]);
 const columns = [
  {key:"fullName",header:"Student Name",width:28},
  {key:"admissionNumber",header:"Admission Number",width:20},
  {key:"gender",header:"Gender",width:14},
  {key:"dateOfBirth",header:"Date of Birth",width:19},
  {key:"age",header:"Age",width:10},
  {key:"parentName",header:"Parent / Guardian Name",width:27},
  {key:"parentPhone",header:"Parent Phone",width:20},
  {key:"parentEmail",header:"Parent Email",width:27},
  {key:"address",header:"Address",width:32},
  ...(includeClassColumns?[{key:"className",header:"Class",width:18},{key:"classCode",header:"Class Code",width:16}]:[]),
  {key:"status",header:"Status",width:14},
 ];
 const sample:TemplateStudent={fullName:"Ama Mensah",admissionNumber:"ST001",gender:"Female",dateOfBirth:"14 June 2012",age:"",parentName:"Akosua Mensah",parentPhone:"0240000000",parentEmail:"",address:"Dansoman, Accra",className:includeClassColumns&&!className?"JHS 1A":"",classCode:"",status:"active"};
 const fileBase=["Eleeveon Students",schoolName,branchName,className].map(safe).filter(Boolean).join(" - ");
 return {fileName:options.fileName||`${fileBase||"Eleeveon Students"}.xlsx`,sheets:[{name:"Students",columns,rows:includeExampleRow?[sample]:[],preambleRows,preambleSpacing:1,freezeHeader:true}]};
}
export async function downloadStudentExcelTemplate(options:StudentExcelTemplateOptions={}) {
 return downloadProtectedStudentWorkbook(buildStudentExcelTemplate(options));
}
