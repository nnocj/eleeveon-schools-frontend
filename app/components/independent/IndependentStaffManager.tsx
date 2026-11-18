"use client";
import React,{useEffect,useState} from 'react';
import {db} from '../../lib/db/db';
import {createLocalStaff,listLocalStaff,setLocalStaffActive,addLocalStaffGrant,currentLocalSession,type LocalStaffPublic} from '../../lib/independent/localStaffAuth';
export default function IndependentStaffManager({accountId}:{accountId:string}){
 const [schools,setSchools]=useState<any[]>([]),[branches,setBranches]=useState<any[]>([]),[staff,setStaff]=useState<LocalStaffPublic[]>([]);
 const [grantStaffId,setGrantStaffId]=useState('');
 const [name,setName]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<'branch_admin'|'teacher'>('branch_admin');
 const [schoolId,setSchoolId]=useState(''),[branchId,setBranchId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const [ss,bb,uu]=await Promise.all([db.schools.toArray(),db.branches.toArray(),listLocalStaff(accountId)]);setSchools(ss.filter((s:any)=>s.accountId===accountId&&!s.isDeleted));setBranches(bb.filter((b:any)=>b.accountId===accountId&&!b.isDeleted));setStaff(uu);}
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[accountId]);
 async function add(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{
  const school=schools.find(s=>String(s.id)===schoolId);const branch=branches.find(b=>String(b.id)===branchId&&String(b.schoolId)===schoolId);
  if(!school||!branch)throw new Error('Choose a valid school and its branch');
  await createLocalStaff({accountId,displayName:name,password,role,schoolId,branchId});setName('');setPassword('');await refresh();
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <section className="rounded-xl border p-4"><h2 className="text-lg font-semibold">Independent staff access</h2><p className="my-2 text-sm">Local credentials for this installation only. Staff must use this device; this does not provision other devices.</p>
 <form onSubmit={add} className="grid gap-2 sm:grid-cols-2"><input className="rounded border p-2" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} required/><select className="rounded border p-2" value={role} onChange={e=>setRole(e.target.value as any)}><option value="branch_admin">Branch Admin</option><option value="teacher">Teacher</option></select>
 <select className="rounded border p-2" value={schoolId} onChange={e=>{setSchoolId(e.target.value);setBranchId('');}} required><option value="">Choose school</option>{schools.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}</select>
 <select className="rounded border p-2" value={branchId} onChange={e=>setBranchId(e.target.value)} required><option value="">Choose branch</option>{branches.filter(b=>String(b.schoolId)===schoolId).map(b=><option key={b.id} value={String(b.id)}>{b.name}</option>)}</select>
 <input className="rounded border p-2" type="password" minLength={12} placeholder="Password (12+ characters)" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="rounded bg-blue-700 p-2 text-white" disabled={busy}>{busy?'Saving…':'Create local staff'}</button></form>
 {error&&<p role="alert" className="mt-2 text-red-600">{error}</p>}
 <div className="mt-4 grid gap-2">{staff.filter(u=>u.role!=='owner').map(u=><div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2"><span>{u.displayName} · {u.role} · {schools.find(s=>String(s.id)===u.schoolId)?.name||'School'} / {branches.find(b=>String(b.id)===u.branchId)?.name||'Branch'} · {u.active?'Enabled':'Disabled'}</span><button className="rounded border px-3 py-1" onClick={()=>void setLocalStaffActive(accountId,u.id,!u.active).then(refresh).catch(e=>setError(String(e)))}>{u.active?'Disable':'Enable'}</button></div>)}</div></section>;
}
