"use client";
import React,{useRef,useState} from "react";
import {commitRemarksPreview,exportRemarks,previewRemarksFile,type RemarksExcelRow,type RemarksExcelScope,type RemarksPreview} from "../../lib/excel/remarks/remarksExcel";
export default function RemarksExcelActions({rows,scope,onImported,open,onClose}:{rows:RemarksExcelRow[];scope:RemarksExcelScope;onImported:()=>Promise<void>|void;open?:boolean;onClose?:()=>void}){
 const input=useRef<HTMLInputElement>(null),[preview,setPreview]=useState<RemarksPreview[]|null>(null),[busy,setBusy]=useState(false),[overwrite,setOverwrite]=useState(false),[error,setError]=useState("");
 const [internalOpen,setInternalOpen]=useState(false);
 const shown=open??internalOpen;
 const close=()=>{if(open===undefined)setInternalOpen(false);else onClose?.();};
 const valid=!!(scope.accountId&&scope.schoolId&&scope.branchId&&scope.academicStructureId&&scope.academicPeriodId&&rows.length);
 return <>{open===undefined&&<button onClick={()=>setInternalOpen(true)}>Remarks Excel</button>}{shown&&<div className="remarks-excel-overlay report-no-print" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
 <style>{`.remarks-excel-overlay{position:fixed;inset:0;z-index:60021;background:rgba(15,23,42,.56);display:grid;place-items:center;padding:12px}.remarks-excel-panel{background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);border:1px solid var(--border,#ccc);border-radius:15px;width:min(720px,100%);max-height:calc(100dvh - 24px);overflow:auto;padding:18px;box-shadow:0 20px 60px #0003}.remarks-excel-panel button{padding:9px 12px;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--border,#ccc);border-radius:8px;cursor:pointer;font-weight:700}.remarks-excel-panel p{line-height:1.5}.remarks-excel-panel button:disabled{opacity:.5}.remarks-excel-panel-header{display:flex;justify-content:space-between;gap:10px;align-items:center}.remarks-excel-panel-header h2{margin:0;font-size:18px}@media(max-width:640px){.remarks-excel-overlay{padding:0}.remarks-excel-panel{width:100vw;height:100dvh;max-height:100dvh;border-radius:0}}`}</style>
 <section className="remarks-excel-panel" role="dialog" aria-modal="true" aria-label="Remarks Excel import export"><header className="remarks-excel-panel-header"><h2>Remarks · Excel</h2><button type="button" onClick={close} aria-label="Close">✕</button></header><p>Export or import remarks for the selected academic structure and period. Preview any changes before saving.</p>
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
 </section></div>}</>;
}
