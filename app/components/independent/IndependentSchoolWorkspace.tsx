'use client';
import React,{useCallback,useEffect,useState} from 'react';
import type {OfflineLicenseClaims} from '../../lib/independent/offlineLicense';
import type {LocalSession} from '../../lib/independent/localStaffAuth';
import {currentLocalSession} from '../../lib/independent/localStaffAuth';
import {addLocalBranch,addLocalClass,addLocalSchool,addLocalStudent,addLocalTeacher,deactivateLocalStudent,readLocalSchoolSummary,type LocalSchoolSummary} from '../../lib/independent/localSchoolOperations';

const empty:LocalSchoolSummary={schools:[],branches:[],classes:[],students:[],teachers:[]};
type Tab='students'|'classes'|'teachers';
/** Offline school-record workspace backed by the real EleeveonDB tables.
 * This is NOT yet the existing Branch Admin module: complex Cloud-coupled
 * Assessment, Finance, Reports and Identity flows remain deliberately disabled.
 */
export default function IndependentSchoolWorkspace({license,session}:{license:OfflineLicenseClaims;session:LocalSession}){
 const [data,setData]=useState<LocalSchoolSummary>(empty);
 const [schoolId,setSchoolId]=useState(''),[branchId,setBranchId]=useState('');
 const [tab,setTab]=useState<Tab>('students');
 const [name,setName]=useState(''),[admission,setAdmission]=useState(''),[classId,setClassId]=useState('');
 const [newSchool,setNewSchool]=useState(''),[newBranch,setNewBranch]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const owner=session.role==='owner',editor=owner||session.role==='branch_admin';
 const refresh=useCallback(async()=>{
  if(!currentLocalSession()||currentLocalSession()?.id!==session.id)throw new Error('Local session expired');
  const rows=await readLocalSchoolSummary(license);
  setData(rows);
  setSchoolId(s=>rows.schools.some(x=>x.id===s)?s:(rows.schools[0]?.id||''));
  setBranchId(b=>rows.branches.some(x=>x.id===b)?b:'');
 },[license,session.id]);
 useEffect(()=>{let alive=true;void refresh().catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});return()=>{alive=false};},[refresh]);
 const branches=data.branches.filter(b=>b.schoolId===schoolId);
 const activeBranch=branches.some(b=>b.id===branchId)?branchId:(branches[0]?.id||'');
 const classes=data.classes.filter(c=>c.schoolId===schoolId&&c.branchId===activeBranch);
 const students=data.students.filter(s=>s.schoolId===schoolId&&s.branchId===activeBranch);
 const teachers=data.teachers.filter(t=>t.schoolId===schoolId&&t.branchId===activeBranch);
 async function action(operation:()=>Promise<unknown>,success:string){setBusy(true);setError('');setMessage('');try{await operation();await refresh();setName('');setAdmission('');setNewBranch('');setNewSchool('');setMessage(success);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const scope={accountId:license.accountId,schoolId,branchId:activeBranch};
 return <section className="space-y-4" aria-label="Independent school records">
  <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900"><h2 className="text-lg font-semibold">School records · offline</h2><p className="text-sm text-zinc-500">Uses the actual EleeveonDB Schools, Branches, Classes, Students and Teachers tables.</p>
   {owner&&<form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void action(()=>addLocalSchool(license,newSchool),'School saved locally');}}><input className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2" value={newSchool} onChange={e=>setNewSchool(e.target.value)} placeholder="New school name" required/><button className="rounded-lg border px-3 py-2" disabled={busy}>Add school</button></form>}
   <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-sm">School<select className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={schoolId} onChange={e=>{setSchoolId(e.target.value);setBranchId('')}}><option value="">Select school</option>{data.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm">Branch<select className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={activeBranch} onChange={e=>setBranchId(e.target.value)}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
   {owner&&schoolId&&<form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void action(()=>addLocalBranch(license,schoolId,newBranch),'Branch saved locally');}}><input className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2" value={newBranch} onChange={e=>setNewBranch(e.target.value)} placeholder="New branch name" required/><button className="rounded-lg border px-3 py-2" disabled={busy}>Add branch</button></form>}
  </div>
  {error&&<div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}{message&&<div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
  {activeBranch&&<><nav className="flex gap-2" aria-label="School record modules">{(['students','classes','teachers'] as Tab[]).map(t=><button key={t} className={`rounded-lg border px-4 py-2 text-sm ${tab===t?'bg-blue-700 text-white':''}`} onClick={()=>setTab(t)}>{t==='students'?`Students (${students.length})`:t==='classes'?`Classes (${classes.length})`:`Teachers (${teachers.length})`}</button>)}</nav>
  {editor&&<form className="grid gap-2 rounded-xl border bg-white p-4 dark:bg-zinc-900 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(tab==='students')void action(()=>addLocalStudent(license,scope,{fullName:name,admissionNumber:admission,currentClassId:classId||undefined}),'Student saved locally');else if(tab==='classes')void action(()=>addLocalClass(license,scope,name),'Class saved locally');else void action(()=>addLocalTeacher(license,scope,name),'Teacher saved locally');}}><label className="text-sm">{tab==='students'?'Student':tab==='classes'?'Class':'Teacher'} name<input className="mt-1 block w-full rounded-lg border bg-transparent p-2" required value={name} onChange={e=>setName(e.target.value)}/></label>{tab==='students'&&<><label className="text-sm">Admission number (optional)<input className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={admission} onChange={e=>setAdmission(e.target.value)}/></label><label className="text-sm">Class<select className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Unassigned</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}<button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy}>Save {tab.slice(0,-1)}</button></form>}
  <div className="overflow-auto rounded-xl border bg-white dark:bg-zinc-900"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Name</th><th className="p-3">Details</th>{editor&&tab==='students'&&<th className="p-3">Action</th>}</tr></thead><tbody>{(tab==='students'?students:tab==='classes'?classes:teachers).map(row=><tr key={row.id} className="border-b last:border-b-0"><td className="p-3">{'fullName' in row?row.fullName:row.name}</td><td className="p-3">{'admissionNumber' in row?(row.admissionNumber||'—'):'role' in row?row.role:'Class'}</td>{editor&&tab==='students'&&<td className="p-3"><button disabled={busy} className="rounded border px-2 py-1" onClick={()=>{if(confirm(`Archive ${'fullName' in row?row.fullName:'student'}?`))void action(()=>deactivateLocalStudent(license,scope,row.id),'Student archived locally');}}>Archive</button></td>}</tr>)}</tbody></table></div></>}
  <p className="text-xs text-zinc-500">Records remain local on this installation. Advanced assessments, reporting, student photos, financial operations and inter-device synchronization are not yet connected to this independent workspace.</p>
 </section>;
}
