"use client";
/** Read-only review of Phase 4 manifest against CURRENT local finance records. Never posts. */
import React, {useState} from 'react';
import {db} from '../../lib/db/db';
import type {ApprovalManifest} from '../../lib/excel/finance/financeApprovalManifest';
import {createFinanceReviewHandoff,financeReviewHandoffCSV} from '../../lib/excel/finance/financeReviewHandoff';
import {preflightOpeningBalances,type PreflightResult} from '../../lib/excel/finance/financePostingPreflight';

type Props={accountId:string;schoolId:string;branchId:string};
export default function FinanceOpeningBalancePreflight({accountId,schoolId,branchId}:Props){
 const [result,setResult]=useState<PreflightResult|null>(null);
 const [manifest,setManifest]=useState<ApprovalManifest|null>(null);
 const [handoffNote,setHandoffNote]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 async function examine(file?:File){
  if(!file)return;setBusy(true);setError('');setResult(null);setManifest(null);
  try{
   if(file.size>5_000_000)throw new Error('Manifest exceeds 5 MB.');
   const m=JSON.parse(await file.text()) as ApprovalManifest;
   if(!m || m.schema!=='eleeveon.finance.opening-balance-review.v1'||m.reviewOnly!==true||!Array.isArray(m.rows))throw new Error('Choose a valid Phase 4 review-only JSON manifest.');
   if(m.accountId!==accountId||m.schoolId!==schoolId||m.branchId!==branchId)throw new Error('This manifest belongs to a different account, school or branch.');
   const [students,invoices,payments,legacyPayments]=await Promise.all([db.students.toArray(),db.studentFeeInvoices.toArray(),db.studentFeePayments.toArray(),db.payments.toArray()]);
   const current=preflightOpeningBalances({manifest:m,students,invoices,payments:[...payments,...legacyPayments]});
   setResult(current);setManifest(m);
  }catch(e){setError(e instanceof Error?e.message:'Unable to inspect manifest.');}finally{setBusy(false);}
 }
 function downloadReview(format:'json'|'csv'){
  if(!result||!manifest)return;
  try{
   setError('');
   const handoff=createFinanceReviewHandoff({manifest,preflight:result,accountId,schoolId,branchId,notes:handoffNote});
   const body=format==='json'?JSON.stringify(handoff,null,2):financeReviewHandoffCSV(handoff);
   const blob=new Blob([body],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`opening-balance-review-${new Date().toISOString().slice(0,10)}.${format}`;a.click();URL.revokeObjectURL(url);
  }catch(e){setError(e instanceof Error?e.message:'Could not prepare handoff.');}
 }
 return <section style={{display:'grid',gap:10,padding:16,border:'1px solid var(--ba-border,#ccc)',borderRadius:12}}>
  <h3 style={{margin:0}}>Opening balance preflight — read only</h3>
  <p style={{margin:0}}>Check a previously exported historical balance manifest against students, invoices and payments currently on this device. This does not approve, create or alter debts.</p>
  <label>Review manifest (.json) <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void examine(e.target.files?.[0])}/></label>
  {busy&&<p>Checking local records…</p>}{error&&<p role="alert" style={{color:'crimson'}}>{error}</p>}
  {result&&<><p role="status"><strong>{result.rows.length}</strong> proposed balances · GH₵ {result.totalGhs.toFixed(2)} · <strong>{result.blockedCount}</strong> blocking issues · <strong>{result.reviewCount}</strong> review warnings. Posting disabled.</p>
  <div style={{maxHeight:400,overflow:'auto'}}><table style={{width:'100%',minWidth:700}}><thead><tr><th>Student ID</th><th>Year</th><th>Balance</th><th>Invoices</th><th>Payments</th><th>Issues</th></tr></thead><tbody>{result.rows.map((r,i)=><tr key={r.sourceKey+':'+i}><td>{r.studentId}</td><td>{r.academicYear}</td><td>GH₵ {r.balanceGhs.toFixed(2)}</td><td>{r.existingInvoiceCount}</td><td>{r.existingPaymentCount}</td><td>{r.issues.length?r.issues.map(x=>x.message).join('; '):'No local conflict detected; backend approval still required'}</td></tr>)}</tbody></table></div>
  <div style={{display:"grid",gap:8}}><label>Reconciliation notes for finance reviewer<textarea value={handoffNote} onChange={e=>setHandoffNote(e.target.value)} rows={3} placeholder="Describe source documents, outstanding conflicts, and who will verify the balances." style={{display:"block",width:"100%"}} /></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" onClick={()=>downloadReview("json")}>Export review handoff (JSON)</button><button type="button" onClick={()=>downloadReview("csv")}>Export findings (CSV)</button></div><p style={{fontSize:12,margin:0}}>Handoff exports contain student and financial information. Share only with authorized staff. Neither export authorizes posting.</p></div>
  <p style={{fontSize:12}}>This is a device-local preflight, not a clean bill of health: unsynced devices or backend transactions may contain additional records. No posting is available until the authoritative backend ledger, finance permissions and idempotency are implemented.</p></>}
 </section>;
}
