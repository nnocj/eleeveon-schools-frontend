'use client';
/** Finance workbook ingestion and manual review. READ ONLY: never posts financial records. */
import React, {useMemo, useState} from 'react';
import type {Student} from '../../lib/db/db';
import type {ParsedExcelWorkbook} from '../../lib/excel/excelTypes';
import {parseExcelFile} from '../../lib/excel/excelWorkbook';
import {reviewLegacyFinanceWorkbook} from '../../lib/excel/finance/financeLegacyReview';
import {prepareOpeningBalanceApproval} from '../../lib/excel/finance/financeApprovalManifest';
import FinanceOpeningBalancePreflight from './FinanceOpeningBalancePreflight';
import {
 exportFinanceReviewCsv, validateFinanceReview,
 type FinanceReviewDecision,
} from '../../lib/excel/finance/financeImportReview';

type Props={students: Student[]; accountId:string; schoolId:string; branchId:string};
export default function FinanceHistoricalImportReview({students,accountId,schoolId,branchId}:Props){
 const [workbook,setWorkbook]=useState<ParsedExcelWorkbook|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [selectedSheets,setSelectedSheets]=useState<string[]>([]);
 const [decisions,setDecisions]=useState<Record<string,FinanceReviewDecision>>({});
 const [search,setSearch]=useState('');
 const [year,setYear]=useState('');
 const scopedStudents=useMemo(()=>students.filter(s=>s.accountId===accountId&&s.schoolId===schoolId&&s.branchId===branchId),[students,accountId,schoolId,branchId]);
 const review=useMemo(()=>workbook?reviewLegacyFinanceWorkbook({workbook,students:scopedStudents,accountId,schoolId,branchId}):null,[workbook,scopedStudents,accountId,schoolId,branchId]);
 const relevant=useMemo(()=>review?{...review,candidates:review.candidates.filter(c=>selectedSheets.includes(c.sheetName))}:null,[review,selectedSheets]);
 const findings=useMemo(()=>relevant?validateFinanceReview(relevant,decisions,new Set(scopedStudents.map(s=>s.id))):[],[relevant,decisions,scopedStudents]);
 const findByKey=new Map(findings.map(f=>[f.key,f]));
 const approval=useMemo(()=>relevant?prepareOpeningBalanceApproval({review:relevant,decisions,findings,accountId,schoolId,branchId}):null,[relevant,decisions,findings,accountId,schoolId,branchId]);
 const visible=(relevant?.candidates||[]).filter(c=>(`${c.studentName} ${c.admissionNumber||''} ${c.sheetName}`).toLowerCase().includes(search.trim().toLowerCase()));
 function change(key:string,patch:Partial<FinanceReviewDecision>){setDecisions(curr=>({...curr,[key]:{candidateKey:key,action:'hold',academicYear:year,...curr[key],...patch}}));}
 async function selectFile(file?:File){if(!file)return;setError('');setLoading(true);try{const parsed=await parseExcelFile(file);setWorkbook(parsed);setSelectedSheets(parsed.sheets.map(s=>s.name));setDecisions({});}catch(e){setError(e instanceof Error?e.message:'Cannot read workbook');setWorkbook(null);}finally{setLoading(false);}}
 function downloadApproval(){if(!approval?.manifest)return;const blob=new Blob([JSON.stringify(approval.manifest,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='eleeveon-opening-balances-REVIEW-ONLY.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function download(){if(!relevant)return;const csv=exportFinanceReviewCsv(relevant,findings);const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='eleeveon-finance-historical-review.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section style={{padding:16,border:'1px solid var(--ba-border, #ccc)',borderRadius:12,display:'grid',gap:12}}>
  <div><h3 style={{margin:0}}>Historical finance workbook review</h3><p style={{margin:'5px 0'}}>Import worksheets for review. No student admissions, fee charges, payment entries or balances are changed here.</p></div>
  <label>Choose Excel file (.xlsx/.xls) <input type="file" accept=".xlsx,.xls" disabled={loading} onChange={e=>void selectFile(e.target.files?.[0])}/></label>
  {loading&&<p>Reading workbook…</p>}{error&&<p role="alert" style={{color:'crimson'}}>{error}</p>}
  {review&&<>
    <div><strong>Worksheets</strong><div style={{display:'flex',flexWrap:'wrap',gap:10}}>{review.sheets.map(s=><label key={s.name}><input type="checkbox" checked={selectedSheets.includes(s.name)} onChange={e=>setSelectedSheets(curr=>e.target.checked?[...curr,s.name]:curr.filter(x=>x!==s.name))}/>{s.name} ({s.kind}, {s.reviewedRows})</label>)}</div></div>
    <div style={{display:'flex',flexWrap:'wrap',gap:10}}><label>Academic year for review <input placeholder="2024/2025" value={year} onChange={e=>setYear(e.target.value)}/></label><label>Find a row <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, admission number, sheet"/></label><button type="button" onClick={download}>Download review CSV</button><button type="button" disabled={!approval?.manifest} onClick={downloadApproval}>Export approval review JSON (no posting)</button></div>
    <p><strong>{relevant?.candidates.length||0}</strong> candidates · <strong>{findings.filter(f=>f.status==='ready_for_finance_approval').length}</strong> verified for later approval · <strong>{findings.filter(f=>f.status==='blocked').length}</strong> held/blocked. None posted.</p>
    <div style={{overflowX:'auto',maxHeight:520}}><table style={{borderCollapse:'collapse',width:'100%',minWidth:950}}><thead><tr>{['Sheet / row','Student in workbook','Status','Debt (GHS)','Action','Existing student','Year / evidence','Validation'].map(x=><th key={x} style={{textAlign:'left',padding:8,borderBottom:'1px solid #aaa'}}>{x}</th>)}</tr></thead><tbody>{visible.map(c=>{const decision=decisions[c.key];const finding=findByKey.get(c.key);return <tr key={c.key} style={{borderBottom:'1px solid #ddd'}}><td style={{padding:6}}>{c.sheetName} / {c.excelRow}</td><td style={{padding:6}}>{c.studentName}<div style={{fontSize:12}}>{c.admissionNumber||'No admission number'}</div></td><td>{c.matchStatus}{c.warning&&<div style={{fontSize:12}}>{c.warning}</div>}</td><td>{c.statedTotalDebt??'Unknown'}{c.discrepancy!==undefined&&Math.abs(c.discrepancy)>0.009&&<div>Difference: {c.discrepancy}</div>}</td><td><select aria-label={'Action for '+c.studentName} value={decision?.action||'skip'} onChange={e=>change(c.key,{action:e.target.value as FinanceReviewDecision['action']})}><option value="skip">Skip</option><option value="hold">Hold</option><option value="opening_balance_review">Review opening balance</option></select></td><td><select aria-label={'Match '+c.studentName} value={decision?.confirmedStudentId||''} onChange={e=>change(c.key,{confirmedStudentId:e.target.value})}><option value="">Unconfirmed</option>{scopedStudents.map(s=><option key={s.id} value={s.id}>{s.fullName} ({s.admissionNumber||s.id}) — {s.status||'active'}</option>)}</select></td><td><input aria-label="Academic year" style={{width:100}} placeholder="2024/2025" value={decision?.academicYear??year} onChange={e=>change(c.key,{academicYear:e.target.value})}/><input aria-label="Identity or balance evidence" placeholder="Evidence / note" value={decision?.note||''} onChange={e=>change(c.key,{note:e.target.value})}/></td><td style={{fontSize:12}}>{finding?.status}{!!finding?.issues.length&&<div>{finding.issues.join('; ')}</div>}</td></tr>;})}</tbody></table></div>
    {approval&&<div role="status" style={{fontSize:12}}>{approval.manifest?`${approval.manifest.rows.length} verified balances · GHS ${approval.manifest.totalGhs.toFixed(2)} · Review-only export ready`:`Approval export blocked: ${approval.errors.slice(0,5).join(' | ')}`}</div>}
    <p style={{fontSize:12}}>Ready for finance approval is NOT a payment or invoice. This screen exports an audit CSV only. Backend reconciliation, authorization and idempotent posting must be implemented before applying transactions.</p>
  </>}
  <FinanceOpeningBalancePreflight accountId={accountId} schoolId={schoolId} branchId={branchId}/>
 </section>;
}
