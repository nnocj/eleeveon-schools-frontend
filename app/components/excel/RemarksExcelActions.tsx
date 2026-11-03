"use client";
/** Student-style Excel experience for Report Remarks, preserving scoped import safeguards. */
import React,{useMemo,useState} from "react";
import ExcelExportSheet from "./ExcelExportSheet";
import ExcelImportSheet,{type ExcelImportStep} from "./ExcelImportSheet";
import ExcelFilePicker from "./ExcelFilePicker";
import ExcelColumnMapping from "./ExcelColumnMapping";
import ExcelImportPreview from "./ExcelImportPreview";
import {parseExcelFile} from "../../lib/excel/excelWorkbook";
import {commitRemarksPreview,exportRemarks,previewRemarksFile,suggestRemarksMapping,REMARKS_FIELDS,type RemarksExcelRow,type RemarksExcelScope,type RemarksPreview,type RemarksColumn} from "../../lib/excel/remarks/remarksExcel";

type Props={rows:RemarksExcelRow[];scope:RemarksExcelScope;onImported:()=>Promise<void>|void;open?:boolean;onClose?:()=>void};
const text=(x:unknown)=>String(x??"").trim();
const fieldLabels:Record<RemarksColumn,string>={studentId:"Student ID",admissionNumber:"Admission Number",studentName:"Student Name",classTeacherRemark:"Class Teacher Remark",headTeacherRemark:"Head Teacher Remark"};
function letter(index:number){let n=index+1,out="";while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}
export default function RemarksExcelActions({rows,scope,onImported,open,onClose}:Props){
 const [localOpen,setLocalOpen]=useState(false),shown=open??localOpen;
 const [importOpen,setImportOpen]=useState(false),[step,setStep]=useState<ExcelImportStep>("file"),[file,setFile]=useState<File|null>(null);
 const [sheets,setSheets]=useState<Array<{name:string;rows:unknown[][]}>>([]),[sheetName,setSheetName]=useState(""),[headerIndex,setHeaderIndex]=useState(0);
 const [mapping,setMapping]=useState<Partial<Record<RemarksColumn,number>>>({});
 const [preview,setPreview]=useState<RemarksPreview[]>([]),[overwrite,setOverwrite]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState("");
 const valid=Boolean(scope.accountId&&scope.schoolId&&scope.branchId&&scope.academicStructureId&&scope.academicPeriodId&&rows.length);
 const close=()=>{if(busy)return;setImportOpen(false);if(open===undefined)setLocalOpen(false);else onClose?.();};
 const closeImport=()=>{if(busy)return;setImportOpen(false);setStep("file");};
 const current=sheets.find(x=>x.name===sheetName),head=current?.rows[headerIndex]||[];
 const allowedFields=REMARKS_FIELDS.filter(x=>!scope.teacherOnly||x!=="headTeacherRemark");
 const cols=head.map((value,index)=>({index,header:text(value)||`Column ${index+1}`,columnLetter:letter(index)}));
 const mappings=Object.entries(mapping).filter(([k,i])=>allowedFields.includes(k as RemarksColumn)&&typeof i==="number"&&i>=0).map(([targetKey,sourceIndex])=>({targetKey,sourceIndex,sourceHeader:cols[sourceIndex]?.header||"",confidence:1}));
 const fieldDefs=allowedFields.map(k=>({key:k,label:fieldLabels[k],required:false}));
 const canReview=(mapping.studentId!==undefined&&mapping.studentId>=0)||(mapping.admissionNumber!==undefined&&mapping.admissionNumber>=0);
 const mappedRemark=(mapping.classTeacherRemark!==undefined&&mapping.classTeacherRemark>=0)||(!scope.teacherOnly&&mapping.headTeacherRemark!==undefined&&mapping.headTeacherRemark>=0);
 const ready=preview.filter(x=>x.status==="create"||x.status==="update");
 const rejected=preview.filter(x=>x.status==="error");
 const validation=useMemo(()=>({totalRows:preview.length,validRows:preview.length-rejected.length,invalidRows:rejected.length,warningRows:0,
  rows:preview.map(p=>({rowNumber:p.row,valid:p.status!=="error",data:{student:p.target?.student.fullName||p.source,admissionNumber:p.target?.student.admissionNumber||p.source,teacherRemark:p.teacherRemark||"",headRemark:p.headRemark||"",status:p.status},issues:p.message?[{rowNumber:p.row,severity:"error",code:"remarks",field:"student",message:p.message}]:[]})),
  issues:rejected.map(p=>({rowNumber:p.row,severity:"error",code:"remarks",field:"student",message:p.message||"Invalid record"}))
 }),[preview,rejected.length]);
 const resetForSheet=(name:string,index:number)=>{const s=sheets.find(x=>x.name===name);setSheetName(name);setHeaderIndex(index);setMapping(suggestRemarksMapping(s?.rows[index]||[]));setPreview([]);setError("");};
 async function chooseFile(next:File|null){setFile(next);setError("");setPreview([]);if(!next)return;setBusy(true);try{
  const parsed=await parseExcelFile(next);const list=parsed.sheets as Array<{name:string;rows:unknown[][]}>;setSheets(list);
  const preferred=list.find(x=>x.rows.some(row=>row.some(cell=>["studentid","admissionnumber","admissionno"].includes(text(cell).toLowerCase().replace(/[^a-z0-9]/g,"")))))||list[0];
  if(!preferred)throw Error("Workbook does not contain any worksheets.");
  const idx=preferred.rows.findIndex(row=>row.some(cell=>["studentid","admissionnumber","admissionno"].includes(text(cell).toLowerCase().replace(/[^a-z0-9]/g,""))));
  setSheetName(preferred.name);setHeaderIndex(Math.max(0,idx));setMapping(suggestRemarksMapping(preferred.rows[Math.max(0,idx)]||[]));setStep("sheet");
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function review(){if(!file)return;setBusy(true);setError("");try{const data=await previewRemarksFile(file,rows,scope,{sheetName,headerRowIndex:headerIndex,mapping});setPreview(data);setStep("preview");}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function save(){setBusy(true);setError("");try{const outcome=await commitRemarksPreview(preview,scope,{overwrite});await onImported();setResult(`${outcome.created} created · ${outcome.updated} updated · ${outcome.unchanged} unchanged · ${outcome.errors} rejected`);setStep("result");}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <>
 {open===undefined&&<button type="button" onClick={()=>setLocalOpen(true)}>Remarks Excel</button>}
 <ExcelExportSheet open={shown&&!importOpen} onClose={close} title="Remarks Excel" subtitle="Use an existing workbook, download a remarks template, or export selected class/period remarks."
  actions={[{key:"import",title:"Import remarks",description:"Select sheet, match columns, review and save",disabled:!valid,onClick:()=>{setFile(null);setSheets([]);setPreview([]);setError("");setResult("");setStep("file");setImportOpen(true);}},
   {key:"template",title:"Download remarks template",description:"Includes student IDs, admission numbers and the selected period",disabled:!valid,onClick:()=>exportRemarks(rows.map(r=>({...r,reportCard:undefined})),scope)},
   {key:"export",title:"Export current remarks",description:"Download remarks for the selected class and academic period",disabled:!valid,onClick:()=>exportRemarks(rows,scope)}]}/>
 <ExcelImportSheet open={shown&&importOpen} onClose={closeImport} title="Import remarks from Excel" subtitle="Match a worksheet to the selected class and academic period. Student identity must use an ID or admission number." step={step} busy={busy} width={920}
  footer={<div className="remarks-excel-footer">
   {step==="file"&&<button className="secondary" type="button" onClick={closeImport}>Cancel</button>}
   {step!=="file"&&step!=="result"&&<button className="secondary" type="button" disabled={busy} onClick={()=>{setError("");setStep(step==="preview"?"mapping":step==="mapping"?"sheet":"file");}}>Back</button>}
   {step==="sheet"&&<button className="primary" type="button" onClick={()=>setStep("mapping")}>Next · Match columns</button>}
   {step==="mapping"&&<button className="primary" type="button" disabled={!canReview||!mappedRemark||busy} onClick={()=>void review()}>Review records</button>}
   {step==="preview"&&<button className="primary" type="button" disabled={!ready.length||busy} onClick={()=>void save()}>Confirm import · {ready.length}</button>}
   {step==="result"&&<button className="primary" type="button" onClick={closeImport}>Done</button>}
  </div>}>
  <style>{`.remarks-excel-footer{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}.remarks-excel-stage{display:grid;gap:14px}.remarks-excel-stage label{display:grid;gap:5px;font-weight:650}.remarks-excel-stage select{padding:9px;width:100%;border:1px solid var(--border,#d4dae3);border-radius:9px;background:var(--surface,#fff);color:var(--text,#111827)}.remarks-excel-stage p{color:var(--muted,#64748b)}.remarks-excel-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}`}</style>
  {step==="file"&&<ExcelFilePicker value={file} onChange={f=>void chooseFile(f)} disabled={busy} label="Choose remarks workbook" description="Use the school's existing workbook or an Eleeveon remarks template."/>}
  {step==="sheet"&&<section className="remarks-excel-stage"><h3>Choose worksheet and header row</h3><p>Choose the remarks worksheet and the row containing its column names. Do not select a row containing student data as the header.</p>
   <div className="remarks-excel-choices"><label>Worksheet<select value={sheetName} onChange={e=>resetForSheet(e.target.value,0)}>{sheets.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
   <label>Header row<select value={headerIndex} onChange={e=>{const i=Number(e.target.value);setHeaderIndex(i);setMapping(suggestRemarksMapping(current?.rows[i]||[]));setPreview([]);}}>{(current?.rows||[]).slice(0,Math.min(40,current?.rows.length||0)).map((_,i)=><option key={i} value={i}>Row {i+1}</option>)}</select></label></div>
   <p>Import scope: {rows.length} eligible students in the selected academic period.</p></section>}
  {step==="mapping"&&<section className="remarks-excel-stage"><ExcelColumnMapping columns={cols as any} fields={fieldDefs as any} mappings={mappings as any} onChange={next=>{const newMapping:Partial<Record<RemarksColumn,number>>={};next.forEach(x=>newMapping[x.targetKey as RemarksColumn]=x.sourceIndex);setMapping(newMapping);setPreview([]);}} title="Match remarks columns" description="Student ID or admission number is required. Student names are for reference only; they cannot match records."/></section>}
  {step==="preview"&&<section className="remarks-excel-stage"><ExcelImportPreview validation={validation as any} title="Remarks import preview" description="Errors are skipped. Nonblank Excel remarks can update existing comments only when overwrite is selected." columns={[{key:"student",label:"Student"},{key:"admissionNumber",label:"Admission No."},{key:"teacherRemark",label:"Class Teacher Remark"},{key:"headRemark",label:"Head Teacher Remark"},{key:"status",label:"Action"}]}/>
   <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> Allow nonblank Excel remarks to overwrite existing remarks</label>
   <p>{ready.length} changed · {preview.filter(x=>x.status==="unchanged").length} unchanged · {rejected.length} rejected.</p></section>}
  {step==="result"&&<section className="remarks-excel-stage"><h3>Remarks import completed</h3><p role="status">{result}</p></section>}
  {busy&&<p role="status">Processing workbook…</p>}{error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
 </ExcelImportSheet>
 </>;
}
