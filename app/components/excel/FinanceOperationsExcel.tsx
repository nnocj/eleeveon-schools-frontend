"use client";
/** Finance Excel (operations): controlled local-first import, with explicit dry-run validation.
 * Historical student balances and actual payment posting are NOT handled here.
 */
import React,{useMemo,useState} from "react";
import ExcelExportSheet from "./ExcelExportSheet";
import ExcelImportSheet, {type ExcelImportStep} from "./ExcelImportSheet";
import ExcelFilePicker from "./ExcelFilePicker";
import ExcelColumnMapping from "./ExcelColumnMapping";
import ExcelImportPreview from "./ExcelImportPreview";
import {parseExcelFile,downloadExcelWorkbook} from "../../lib/excel/excelWorkbook";
import {createLocal,listActiveLocal} from "../../lib/sync/syncUtils";

type Kind="incomes"|"expenses"|"staffPayrollProfiles";
type Row=Record<string,any>;
type Props={kind:Kind; accountId:string; schoolId:string; branchId:string; existing:Row[]; onComplete:()=>Promise<void>|void; open?:boolean; onClose?:()=>void};
const FIELDS:Record<Kind,string[]>={
 incomes:["title","description","amount","date","source","paymentMethod","receivedBy","referenceNumber","receiptNumber","currencyCode"],
 expenses:["title","description","amount","date","expenseSourceType","paymentMethod","paidTo","approvedBy","referenceNumber","receiptNumber","currencyCode"],
 staffPayrollProfiles:["teacherId","staffUserId","fullName","role","payType","baseSalary","allowanceDefault","deductionDefault","preferredPaymentMethod","currencyCode"]
};
const norm=(s:unknown)=>String(s??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const str=(s:unknown)=>String(s??"").trim();
const aliases:Record<string,string[]>={title:["name","item","particulars","descriptionofexpense"],amount:["value","total","paid"],date:["transactiondate","paymentdate"],baseSalary:["salary","basicpay","monthlysalary"],fullName:["staffname","teachername","name"],referenceNumber:["reference","ref"],expenseSourceType:["category","type"],paymentMethod:["method"],preferredPaymentMethod:["method"]};
function parseDate(v:unknown):string {if(typeof v==="number"&&v>20000&&v<100000){let d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10);} const s=str(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s; const d=new Date(s);return s&&Number.isFinite(d.getTime())?d.toISOString().slice(0,10):"";}
function money(v:unknown):number|undefined {if(v===null||v===undefined||str(v)==="")return undefined; const s=str(v).replace(/[₵,\s]/g,"").replace(/^(GHS|GH¢)/i,"");const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:undefined;}
function keyFor(kind:Kind,r:Row){const ref=norm(r.referenceNumber||r.receiptNumber);if(kind==="staffPayrollProfiles"){
 const teacherId=str(r.teacherId),staffUserId=str(r.staffUserId);
 return teacherId?"teacher|"+teacherId:staffUserId?"user|"+staffUserId:"unverified|"+norm(r.fullName)+"|"+norm(r.role);
 }return ref?"ref|"+ref:"fallback|"+[r.date,r.title,r.amount,r.source||r.expenseSourceType,r.receivedBy||r.paidTo].map(norm).join('|');}
export default function FinanceOperationsExcel({kind,accountId,schoolId,branchId,existing,onComplete,open:controlledOpen,onClose}:Props){
 const [open,setOpen]=useState(false),[step,setStep]=useState<ExcelImportStep>("file"),[importOpen,setImportOpen]=useState(false),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [sheets,setSheets]=useState<Array<{name:string;rows:any[][]}>>([]),[sheet,setSheet]=useState(""),[headerIndex,setHeaderIndex]=useState(0),[mapping,setMapping]=useState<Record<string,number>>({});
 const shown=controlledOpen ?? open;
 const close=()=>{if(busy)return;setImportOpen(false);if(controlledOpen===undefined)setOpen(false);else onClose?.();};
 const closeImport=()=>{if(busy)return;setImportOpen(false);setStep("file");};
 const current=sheets.find(s=>s.name===sheet),fields=FIELDS[kind],head=current?.rows[headerIndex]||[];
 const proposed=useMemo(()=>{if(!current)return [];return current.rows.slice(headerIndex+1).map((cells,i)=>{
 const row:Row={};fields.forEach(f=>{const ix=mapping[f];if(ix!==undefined&&ix>=0)row[f]=cells[ix]});return {excelRow:headerIndex+i+2,row};
 }).filter(item=>Object.values(item.row).some(v=>str(v)!==""));},[current,headerIndex,mapping,kind]);
 const checks=useMemo(()=>{const used=new Set<string>();const known=new Set(existing.filter(r=>!r.isDeleted).map(r=>keyFor(kind,r)));return proposed.map(item=>{
 const r={...item.row};const problems:string[]=[];
 if(kind==="staffPayrollProfiles"){
 r.fullName=str(r.fullName);r.role=str(r.role)||"teacher";r.payType=str(r.payType)||"monthly";
 const allowed=["monthly","weekly","daily","hourly","contract","commission"];
 r.teacherId=str(r.teacherId);r.staffUserId=str(r.staffUserId);
 if(!r.teacherId&&!r.staffUserId)problems.push("Missing verified teacherId or staffUserId; import must not create a payroll identity by name alone");
 if(!r.fullName)problems.push("Missing staff name");if(!allowed.includes(r.payType))problems.push("Invalid pay type");
 for(const k of ["baseSalary","allowanceDefault","deductionDefault"]){const n=money(r[k]??0);if(n===undefined)problems.push("Invalid "+k);else r[k]=n;}
 r.preferredPaymentMethod=str(r.preferredPaymentMethod||"momo").toLowerCase();if(!["cash","momo","bank","card","manual"].includes(r.preferredPaymentMethod))problems.push("Invalid method");
 }else{
 r.title=str(r.title);r.description=str(r.description);r.date=parseDate(r.date);r.amount=money(r.amount);
 if(!r.title)problems.push("Missing title");if(!r.date)problems.push("Invalid date");if(r.amount===undefined||r.amount<=0)problems.push("Amount must be positive");
 r.paymentMethod=str(r.paymentMethod||"cash").toLowerCase();if(!["cash","momo","bank","card"].includes(r.paymentMethod))problems.push("Invalid payment method");
 r.source=str(r.source||"other");r.expenseSourceType=str(r.expenseSourceType||"other");
 }
 r.currencyCode=str(r.currencyCode||"GHS").toUpperCase();if(!/^[A-Z]{3}$/.test(r.currencyCode))problems.push("Invalid currency code");
 const key=keyFor(kind,r);if(kind==="staffPayrollProfiles"&&existing.some(x=>!x.isDeleted&&(
 (r.teacherId&&str(x.teacherId)===r.teacherId)||(r.staffUserId&&str(x.staffUserId)===r.staffUserId))))problems.push("Existing payroll profile for this staff identity");
 if(used.has(key))problems.push("Duplicate in selected sheet");used.add(key);if(known.has(key))problems.push("Possible existing record — skip or reconcile manually");
 return {...item,row:r,problems};
 });},[proposed,existing,kind]);
 const ok=checks.filter(r=>r.problems.length===0),invalid=checks.filter(r=>r.problems.length!==0);
 async function load(file?:File){if(!file)return;setFile(file);setBusy(true);setError("");setMessage("");try{const w=await parseExcelFile(file);setSheets(w.sheets);const first=w.sheets[0];setSheet(first?.name||"");apply(first,0);setStep("sheet");}catch(e){setError(e instanceof Error?e.message:"Cannot read workbook");}finally{setBusy(false);}}
 function apply(s:{name:string;rows:any[][]}|undefined,index:number){setHeaderIndex(index);const h=s?.rows[index]||[];const next:Record<string,number>={};fields.forEach(f=>{const acceptable=[f,...(aliases[f]||[])].map(norm);const found=h.findIndex(x=>acceptable.includes(norm(x)));next[f]=found;});setMapping(next);}
 function download(rows:Row[],suffix:string){downloadExcelWorkbook({fileName:`eleeveon-${kind}-${suffix}.xlsx`,sheets:[{name:kind.slice(0,31),rows,columns:[...fields,...(suffix==="review"?["validationErrors"]:[])].map(k=>({key:k,header:k}))}]});}
 async function save(){if(!accountId||!schoolId||!branchId){setError("Missing school/branch workspace");return;}if(invalid.length){setError("Resolve invalid or existing rows before saving; export the rejected rows or choose a clean worksheet.");return;}if(!ok.length)return;
 if(!window.confirm(`Import ${ok.length} new ${kind} records into this branch? Existing records will not be overwritten. Import only once per device after syncing.`))return;
 setBusy(true);setError("");let saved=0;try{for(const entry of ok){const currentKey=keyFor(kind,entry.row);const latest=(await listActiveLocal<Row>(kind as any)||[]).filter(r=>r.accountId===accountId&&String(r.schoolId)===schoolId&&String(r.branchId)===branchId&&!r.isDeleted);
 if(latest.some(x=>keyFor(kind,x)===currentKey))throw Error("Duplicate detected in current local records. Stop and refresh.");
 await createLocal(kind as any,{...entry.row,accountId,schoolId,branchId,active:true,isDeleted:false});saved++;}
 setMessage(`${saved} records saved locally. Check synchronization before another import.`);setStep("result");await onComplete();
 }catch(e){setError(`${saved} saved before failure. Refresh before retrying. ${e instanceof Error?e.message:"Import failed"}`);}finally{setBusy(false);}}
 const columns=head.map((h,i)=>({index:i,header:str(h)||`Column ${i+1}`,columnLetter:(()=>{let n=i+1,out="";while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;})()}));
 const mappingArray=Object.entries(mapping).filter(([,i])=>i>=0).map(([targetKey,sourceIndex])=>({targetKey,sourceIndex,sourceHeader:columns[sourceIndex]?.header||"",confidence:1}));
 const fieldDefs=fields.map(key=>({key,label:key.replace(/([A-Z])/g," $1").replace(/^./,x=>x.toUpperCase()),required:false,aliases:aliases[key]||[]}));
 const validation={totalRows:checks.length,validRows:ok.length,invalidRows:invalid.length,warningRows:0,
  rows:checks.map(x=>({rowNumber:x.excelRow,valid:x.problems.length===0,data:x.row,issues:x.problems.map(message=>({rowNumber:x.excelRow,field:"record",code:"invalid",severity:"error",message}))})),
  issues:checks.flatMap(x=>x.problems.map(message=>({rowNumber:x.excelRow,field:"record",code:"invalid",severity:"error",message})))
 };
 const label=kind==="staffPayrollProfiles"?"Payroll":kind==="incomes"?"Income":"Expenses";
 return <>
  {controlledOpen===undefined&&<button type="button" onClick={()=>setOpen(true)}>Excel · Import / Export</button>}
  <ExcelExportSheet open={shown&&!importOpen} onClose={close} title={`${label} Excel`}
   subtitle="Import an existing workbook, download a template, or export records."
   actions={[
    {key:"import",title:`Import ${label.toLowerCase()}`,description:"Choose worksheet, match columns, and review before saving",onClick:()=>{setError("");setMessage("");setFile(null);setSheets([]);setStep("file");setImportOpen(true);}},
    {key:"template",title:"Download Excel template",description:"A clean workbook with the supported fields",onClick:()=>download([],"template")},
    {key:"export",title:`Export ${label.toLowerCase()} records`,description:"Download existing records for this branch",onClick:()=>download(existing.filter(r=>!r.isDeleted),"export")}
   ]}/>
  <ExcelImportSheet open={shown&&importOpen} onClose={closeImport} title={`Import ${label.toLowerCase()} from Excel`}
   subtitle="Use the same guided workbook workflow as Students. No records are saved before confirmation."
   step={step} busy={busy} width={920}
   footer={<div className="excel-finance-footer">
    {step!=="file"&&step!=="result"&&<button type="button" className="secondary" disabled={busy} onClick={()=>setStep(step==="preview"?"mapping":step==="mapping"?"sheet":"file")}>Back</button>}
    {step==="file"&&<button type="button" className="secondary" disabled={busy} onClick={closeImport}>Cancel</button>}
    {step==="sheet"&&<button type="button" className="primary" disabled={!current||busy} onClick={()=>setStep("mapping")}>Next · Match columns</button>}
    {step==="mapping"&&<button type="button" className="primary" disabled={!mappingArray.length||busy} onClick={()=>setStep("preview")}>Review records</button>}
    {step==="preview"&&<button type="button" className="primary" disabled={busy||!ok.length||!!invalid.length} onClick={()=>void save()}>Confirm import · {ok.length}</button>}
    {step==="result"&&<button type="button" className="primary" onClick={closeImport}>Done</button>}
   </div>}>
   <style>{`.excel-finance-footer{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}.excel-finance-stage{display:grid;gap:13px}.excel-finance-stage label{display:grid;gap:5px;font-weight:650}.excel-finance-stage select{width:100%;padding:9px;border-radius:9px;border:1px solid var(--border,#d4dae3);background:var(--surface,#fff);color:var(--text,#111827)}.excel-finance-stage p{color:var(--muted,#64748b)}.excel-finance-choice{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.excel-finance-error{color:#b91c1c}`}</style>
   {step==="file"&&<ExcelFilePicker value={file} disabled={busy} onChange={f=>{setFile(f);setSheets([]);setError("");if(f)void load(f);}} label={`Choose ${label.toLowerCase()} workbook`} description="Choose an existing Excel workbook or drag it here."/>}
   {step==="sheet"&&<section className="excel-finance-stage"><h3>Choose worksheet and header row</h3><p>Use the sheet with {label.toLowerCase()} records. You can adjust the header row for workbooks with titles above the column headings.</p>
    <div className="excel-finance-choice"><label>Worksheet<select value={sheet} onChange={e=>{const next=sheets.find(x=>x.name===e.target.value);setSheet(e.target.value);apply(next,0);}}>{sheets.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
    <label>Header row<select value={headerIndex} onChange={e=>apply(current,Number(e.target.value))}>{(current?.rows||[]).slice(0,Math.min(current?.rows.length||0,40)).map((_,i)=><option key={i} value={i}>Row {i+1}</option>)}</select></label></div>
    <p>{current?.rows.length||0} worksheet rows available.</p></section>}
   {step==="mapping"&&<section className="excel-finance-stage"><ExcelColumnMapping columns={columns as any} fields={fieldDefs as any} mappings={mappingArray as any} onChange={m=>{const next:Record<string,number>={};fields.forEach(f=>next[f]=-1);m.forEach(x=>next[x.targetKey]=x.sourceIndex);setMapping(next);}} title={`Match ${label.toLowerCase()} columns`} description="Match each Excel heading with the relevant Eleeveon field, or ignore unnecessary columns."/></section>}
   {step==="preview"&&<section className="excel-finance-stage"><ExcelImportPreview validation={validation as any} columns={[{key:"title",label:"Title / staff",render:(r:any)=>(r.title||r.fullName||"—")},{key:"amount",label:"Amount / salary",render:(r:any)=>(r.amount??r.baseSalary??"—")},{key:"date",label:"Date"}]} title={`${label} import preview`} description="Records with errors must be corrected before import. Existing records are not overwritten."/>
   {!!invalid.length&&<button type="button" onClick={()=>download(invalid.map(x=>({...x.row,validationErrors:x.problems.join("; ")})),"review")}>Download rejected rows</button>}</section>}
   {step==="result"&&<section className="excel-finance-stage"><h3>Import completed</h3><p role="status">{message}</p><p>Records are saved locally. Confirm successful synchronization before repeating an import.</p></section>}
   {busy&&<p role="status">Processing…</p>}{error&&<p role="alert" className="excel-finance-error">{error}</p>}
   <p style={{fontSize:12,opacity:.76}}>Historical balances and actual fee-payment posting are excluded. Existing records are never overwritten.</p>
  </ExcelImportSheet>
 </>;
}
