"use client";
/** Finance Excel (operations): controlled local-first import, with explicit dry-run validation.
 * Historical student balances and actual payment posting are NOT handled here.
 */
import React,{useMemo,useState} from "react";
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
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [sheets,setSheets]=useState<Array<{name:string;rows:any[][]}>>([]),[sheet,setSheet]=useState(""),[headerIndex,setHeaderIndex]=useState(0),[mapping,setMapping]=useState<Record<string,number>>({});
 const shown=controlledOpen ?? open;
 const close=()=>{if(controlledOpen===undefined)setOpen(false);else onClose?.();};
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
 async function load(file?:File){if(!file)return;setBusy(true);setError("");setMessage("");try{const w=await parseExcelFile(file);setSheets(w.sheets);const first=w.sheets[0];setSheet(first?.name||"");apply(first,0);}catch(e){setError(e instanceof Error?e.message:"Cannot read workbook");}finally{setBusy(false);}}
 function apply(s:{name:string;rows:any[][]}|undefined,index:number){setHeaderIndex(index);const h=s?.rows[index]||[];const next:Record<string,number>={};fields.forEach(f=>{const acceptable=[f,...(aliases[f]||[])].map(norm);const found=h.findIndex(x=>acceptable.includes(norm(x)));next[f]=found;});setMapping(next);}
 function download(rows:Row[],suffix:string){downloadExcelWorkbook({fileName:`eleeveon-${kind}-${suffix}.xlsx`,sheets:[{name:kind.slice(0,31),rows,columns:[...fields,...(suffix==="review"?["validationErrors"]:[])].map(k=>({key:k,header:k}))}]});}
 async function save(){if(!accountId||!schoolId||!branchId){setError("Missing school/branch workspace");return;}if(invalid.length){setError("Resolve invalid or existing rows before saving; export the rejected rows or choose a clean worksheet.");return;}if(!ok.length)return;
 if(!window.confirm(`Import ${ok.length} new ${kind} records into this branch? Existing records will not be overwritten. Import only once per device after syncing.`))return;
 setBusy(true);setError("");let saved=0;try{for(const entry of ok){const currentKey=keyFor(kind,entry.row);const latest=(await listActiveLocal<Row>(kind as any)||[]).filter(r=>r.accountId===accountId&&String(r.schoolId)===schoolId&&String(r.branchId)===branchId&&!r.isDeleted);
 if(latest.some(x=>keyFor(kind,x)===currentKey))throw Error("Duplicate detected in current local records. Stop and refresh.");
 await createLocal(kind as any,{...entry.row,accountId,schoolId,branchId,active:true,isDeleted:false});saved++;}
 setMessage(`${saved} records saved locally. Check synchronization before another import.`);await onComplete();
 }catch(e){setError(`${saved} saved before failure. Refresh before retrying. ${e instanceof Error?e.message:"Import failed"}`);}finally{setBusy(false);}}
 return <>
 {controlledOpen===undefined && <button type="button" onClick={()=>setOpen(true)}>Excel · Import / Export</button>}
 {shown && <div className="fx-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
 <style>{`
 .fx-backdrop{position:fixed;inset:0;z-index:60020;background:rgba(15,23,42,.60);display:grid;place-items:center;padding:14px;backdrop-filter:blur(5px)}
 .fx-panel{width:min(840px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);border:1px solid var(--border,#d4dae3);border-radius:17px;padding:18px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 28px 70px #0003}
 .fx-panel *{box-sizing:border-box;min-width:0}.fx-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.fx-head h2{margin:0;font-size:19px}.fx-head p{margin:3px 0 0;color:var(--muted,#64748b)}
 .fx-steps{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0}.fx-step{background:color-mix(in srgb,var(--primary-color,#2563eb) 9%,var(--surface,#fff));border:1px solid var(--border,#ddd);border-radius:8px;padding:7px 10px;font-size:11px;font-weight:750}
 .fx-panel button,.fx-panel select,.fx-panel input{font:inherit}.fx-panel button{cursor:pointer;padding:9px 12px;border:1px solid var(--border,#d4dae3);border-radius:9px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:750}.fx-panel button.primary{background:var(--primary-color,#2563eb);color:#fff;border-color:var(--primary-color,#2563eb)}.fx-panel button:disabled{opacity:.5;cursor:not-allowed}
 .fx-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.fx-selectors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.fx-panel label{display:grid;gap:5px;font-weight:650}.fx-panel select,.fx-panel input[type=file]{border:1px solid var(--border,#d4dae3);border-radius:8px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);width:100%}
 .fx-mapping{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px}.fx-preview{overflow:auto;max-height:290px;border:1px solid var(--border,#ddd);border-radius:9px}.fx-preview table{width:100%;min-width:650px;border-collapse:collapse;text-align:left}.fx-preview th,.fx-preview td{padding:9px;border-bottom:1px solid var(--border,#ddd);vertical-align:top}.fx-preview th{position:sticky;top:0;background:var(--card-bg,var(--surface,#fff))}.fx-error{color:#b91c1c}.fx-note{font-size:11px;color:var(--muted,#64748b)}
 @media(max-width:640px){.fx-backdrop{padding:0}.fx-panel{height:100dvh;max-height:100dvh;border-radius:0;padding:15px}.fx-selectors{grid-template-columns:1fr}}
 `}</style>
 <section className="fx-panel" role="dialog" aria-modal="true" aria-label="Finance Excel">
 <header className="fx-head"><div><h2>{kind==="staffPayrollProfiles"?"Payroll":kind==="incomes"?"Income":"Expenses"} · Excel</h2><p>Import, review and export branch records</p></div><button type="button" onClick={close} aria-label="Close Excel">✕</button></header>
 <div className="fx-steps"><span className="fx-step">1 · Workbook</span><span className="fx-step">2 · Worksheet</span><span className="fx-step">3 · Map columns</span><span className="fx-step">4 · Review</span></div>
 <div className="fx-actions"><button onClick={()=>download([],"template")}>↓ Download template</button><button onClick={()=>download(existing.filter(r=>!r.isDeleted),"export")}>↗ Export existing</button></div>
 <label>Choose Excel workbook<input type="file" accept=".xlsx,.xls" onChange={e=>void load(e.target.files?.[0])}/></label>
 {!!sheets.length&&<>
 <div className="fx-selectors"><label>Worksheet<select value={sheet} onChange={e=>{const v=sheets.find(s=>s.name===e.target.value);setSheet(e.target.value);apply(v,0);}}>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
 <label>Header row<select value={headerIndex} onChange={e=>apply(current,Number(e.target.value))}>{(current?.rows||[]).slice(0,Math.min(20,current?.rows.length||0)).map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label></div>
 <h3 style={{fontSize:14,margin:"16px 0 9px"}}>Match workbook columns</h3>
 <div className="fx-mapping">{fields.map(f=><label key={f}>{f}<select value={mapping[f]??-1} onChange={e=>setMapping(x=>({...x,[f]:Number(e.target.value)}))}><option value={-1}>Not mapped</option>{head.map((h,i)=><option key={i} value={i}>{String(h||`Column ${i+1}`)}</option>)}</select></label>)}</div>
 <h3 style={{fontSize:14,margin:"17px 0 6px"}}>Preview and validation</h3><p>{checks.length} candidate rows · {ok.length} valid new · {invalid.length} blocked. Nothing is saved until confirmation.</p>
 <div className="fx-preview"><table><thead><tr><th>Excel row</th><th>Name / title</th><th>Amount</th><th>Validation</th></tr></thead><tbody>{checks.slice(0,150).map(r=><tr key={r.excelRow}><td>{r.excelRow}</td><td>{r.row.fullName||r.row.title||"—"}</td><td>{r.row.amount??r.row.baseSalary??"—"}</td><td className={r.problems.length?"fx-error":""}>{r.problems.join("; ")||"Ready"}</td></tr>)}</tbody></table></div>
 <div className="fx-actions"><button onClick={()=>download(invalid.map(x=>({...x.row,validationErrors:x.problems.join('; ')})),"review")} disabled={!invalid.length}>Download rejected rows</button><button className="primary" disabled={busy||!ok.length||!!invalid.length} onClick={()=>void save()}>Approve & import {ok.length}</button></div>
 </>}
 {busy&&<p role="status">Processing…</p>}{error&&<p className="fx-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <p className="fx-note">Historical student balances and actual payment posting are excluded. Existing records are never overwritten by this importer.</p>
 </section></div>}
 </>;
}
