"use client";
import React,{useRef,useState} from "react";
import {commitRemarksPreview,exportRemarks,previewRemarksFile,type RemarksExcelRow,type RemarksExcelScope,type RemarksPreview} from "../../lib/excel/remarks/remarksExcel";
export default function RemarksExcelActions({rows,scope,onImported}:{rows:RemarksExcelRow[];scope:RemarksExcelScope;onImported:()=>Promise<void>|void}){
 const input=useRef<HTMLInputElement>(null),[preview,setPreview]=useState<RemarksPreview[]|null>(null),[busy,setBusy]=useState(false),[overwrite,setOverwrite]=useState(false),[error,setError]=useState("");
 const valid=!!(scope.accountId&&scope.schoolId&&scope.branchId&&scope.academicStructureId&&scope.academicPeriodId&&rows.length);
 return <section className="report-no-print" style={{padding:"8px 0"}} aria-label="Remarks Excel import and export">
 <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
 <button type="button" disabled={!valid||busy} onClick={()=>exportRemarks(rows,scope)}>Export remarks Excel</button>
 <button type="button" disabled={!valid||busy} onClick={()=>input.current?.click()}>Import remarks Excel</button>
 <input ref={input} type="file" accept=".xlsx,.xls,.xlsm,.xlsb" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;setError("");setPreview(null);setBusy(true);try{setPreview(await previewRemarksFile(f,rows,scope));}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}}}/>
 </div>
 {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
 {preview&&<div style={{padding:12,marginTop:8,border:"1px solid currentColor",borderRadius:8}}>
 <strong>Import preview</strong><p>{preview.filter(p=>p.status==="create").length} new · {preview.filter(p=>p.status==="update").length} updates · {preview.filter(p=>p.status==="unchanged").length} unchanged · {preview.filter(p=>p.status==="error").length} errors</p>
 <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> Overwrite existing remarks with nonblank Excel values</label>
 {preview.filter(p=>p.status==="error").slice(0,12).map(p=><p key={p.row} style={{color:"#b91c1c"}}>Row {p.row}: {p.message}</p>)}
 <div style={{display:"flex",gap:8,marginTop:8}}><button type="button" disabled={busy||!preview.some(p=>p.status==="create"||p.status==="update")} onClick={async()=>{setBusy(true);setError("");try{const r=await commitRemarksPreview(preview,scope,{overwrite});setPreview(null);await onImported();alert(`Remarks import: ${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ${r.errors} rejected.`);}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}}}>Confirm import</button><button type="button" onClick={()=>setPreview(null)}>Cancel</button></div>
 </div>}
 </section>;
}
