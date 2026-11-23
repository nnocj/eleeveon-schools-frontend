'use client';
import React, {useEffect, useState} from 'react';
import {useActiveMembership} from '../../context/active-membership-context';
import {db} from '../../lib/db/db';
import CopyLinkStaffInvitation from './CopyLinkStaffInvitation';

/** UI scope comes from the verified membership provider; server independently authorizes writes. */
export default function IndependentStaffInvitations({owner=false}:{owner?:boolean}) {
 const {activeMembership}=useActiveMembership();
 const [schools,setSchools]=useState<Array<{id:string;name:string}>>([]);
 const [branches,setBranches]=useState<Array<{id:string;schoolId:string;name:string}>>([]);
 const [teachers,setTeachers]=useState<Array<{id:string;branchId:string;name:string}>>([]);
 const [schoolId,setSchoolId]=useState(''); const [branchId,setBranchId]=useState(''); const [teacherId,setTeacherId]=useState('');
 const [loading,setLoading]=useState(true);
 const authorized=Boolean(activeMembership?.active!==false && (owner ? activeMembership?.role==='super_admin' : activeMembership?.role==='branch_admin'));
 const accountId=String(activeMembership?.accountId||'');
 useEffect(()=>{let cancelled=false;setLoading(true);
  if(!authorized||!accountId){setLoading(false);return;}
  Promise.all([db.schools.toArray(),db.branches.toArray(),db.teachers.toArray()]).then(([s,b,t])=>{
   if(cancelled)return;
   const scoped=(r:{accountId?:string|null;isDeleted?:boolean})=>String(r.accountId||'')===accountId&&!r.isDeleted;
   setSchools(s.filter(scoped).map(x=>({id:String(x.id),name:String(x.name||x.id)})));
   setBranches(b.filter(scoped).map(x=>({id:String(x.id),schoolId:String(x.schoolId||''),name:String(x.name||x.id)})));
   setTeachers(t.filter(scoped).map(x=>({id:String(x.id),branchId:String(x.branchId||''),name:String(x.fullName||x.id)})));
  }).catch(()=>{if(!cancelled){setSchools([]);setBranches([]);setTeachers([]);}}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true};
 },[authorized,accountId]);
 useEffect(()=>{if(!owner){setSchoolId(String(activeMembership?.schoolId||''));setBranchId(String(activeMembership?.branchId||''));}},[owner,activeMembership?.schoolId,activeMembership?.branchId]);
 useEffect(()=>{setTeacherId('');},[branchId]);
 if(!authorized)return <p role="alert">You do not have permission to invite staff.</p>;
 const visibleSchools=owner?schools:schools.filter(x=>x.id===schoolId);
 const visibleBranches=branches.filter(x=>x.schoolId===schoolId&&(!owner?x.id===String(activeMembership?.branchId||''):true));
 const visibleTeachers=teachers.filter(x=>x.branchId===branchId);
 return <section className="mx-auto max-w-3xl space-y-4 p-4">
  <h2 className="text-xl font-semibold">Staff invitations</h2>
  <p className="text-sm opacity-75">Invite staff to their existing central Eleeveon identity. Invitation links are single-use; never post them publicly.</p>
  {loading?<p>Loading authorized school records…</p>:<>
   {owner&&<label className="block">School<select className="mt-1 block w-full rounded border p-2" value={schoolId} onChange={e=>{setSchoolId(e.target.value);setBranchId('')}}><option value="">Choose school</option>{visibleSchools.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {owner&&<label className="block">Branch<select className="mt-1 block w-full rounded border p-2" value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Choose branch</option>{visibleBranches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {!owner&&<p>Invitations are restricted to your assigned branch.</p>}
   <label className="block">Teacher profile (required for Teacher invitations)<select className="mt-1 block w-full rounded border p-2" value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">Choose teacher</option>{visibleTeachers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   {schoolId&&branchId?<CopyLinkStaffInvitation schoolId={schoolId} branchId={branchId} teacherId={teacherId||undefined} canInviteBranchAdmins={owner}/>:<p role="status">Select a valid school and branch before creating an invitation.</p>}
  </>}
 </section>;
}
