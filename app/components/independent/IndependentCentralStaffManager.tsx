"use client";
import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../lib/platformApi";
import { useAccount } from "../../context/account-context";
import { useActiveMembership } from "../../context/active-membership-context";

type Entry = { id:string; userId:string; role:string; schoolId?:string|null; branchId?:string|null; teacherId?:string|null; active:boolean; status:string; user?:{fullName?:string;email?:string} };
const request = <T,>(url:string,method:"GET"|"POST"|"PATCH"|"DELETE",body?:unknown):Promise<T> =>
  apiRequest<T>(url,{method, ...(body === undefined ? {} : {body:JSON.stringify(body)})} as any);

/** Existing centrally registered users only. No local password or session is created. */
export default function IndependentCentralStaffManager({accountId}:{accountId:string}) {
 const {authenticated,accountId:authenticatedAccount} = useAccount();
 const {activeMembership} = useActiveMembership() as any;
 const role = String(activeMembership?.role||"");
 const owner = role === "super_admin";
 const manager = owner || role === "branch_admin";
 const branchId = String(activeMembership?.branchId||"");
 const schoolId = String(activeMembership?.schoolId||"");
 const permitted = Boolean(authenticated && authenticatedAccount === accountId && activeMembership?.accountId === accountId && manager && (owner || (branchId && schoolId)));
 const [items,setItems]=useState<Entry[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [staffEmail,setStaffEmail]=useState(""),[targetRole,setTargetRole]=useState<"teacher"|"branch_admin">("teacher"),[targetSchool,setTargetSchool]=useState(schoolId),[targetBranch,setTargetBranch]=useState(branchId),[teacherId,setTeacherId]=useState("");
 const reload=useCallback(async()=>{if(!permitted)return;const data=await request<Entry[]>(`/memberships/account/${encodeURIComponent(accountId)}`,"GET");setItems(Array.isArray(data)?data:[]);},[permitted,accountId]);
 useEffect(()=>{void reload().catch(e=>setError(String(e)));},[reload]);
 async function execute(fn:()=>Promise<unknown>,success:string){setBusy(true);setError("");setNotice("");try{await fn();await reload();setNotice(success);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 if(!permitted)return <section role="alert" className="p-4">An active verified Owner or branch administrator membership is required.</section>;
 const visible=items.filter(i=>owner || (i.role==="teacher" && i.schoolId===schoolId && i.branchId===branchId));
 return <main className="mx-auto max-w-4xl p-4 space-y-4"><header><h1 className="text-xl font-bold">Users &amp; Roles</h1><p className="text-sm opacity-75">Central Eleeveon identities. No second Independent password.</p></header>
 <p className="rounded border p-3 text-sm">Assign access to an existing Eleeveon user by email. New email-account invitations are not yet enabled. Changes require a connection to Eleeveon services; offline staff provisioning is not permitted.</p>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void execute(async()=>{if(!staffEmail.trim())throw new Error("Enter an existing staff email address");if(!targetSchool.trim()||!targetBranch.trim())throw new Error("School and branch are required");if(targetRole==="teacher"&&!teacherId.trim())throw new Error("Select an existing teacher profile ID");if(!owner&&(targetRole!=="teacher"||targetSchool!==schoolId||targetBranch!==branchId))throw new Error("Branch administrators can only assign Teachers in their own branch");const matched=await request<{id:string;email:string}>(`/memberships/account/${encodeURIComponent(accountId)}/staff-lookup?email=${encodeURIComponent(staffEmail.trim())}`,"GET");await request(`/memberships/account/${encodeURIComponent(accountId)}`,"POST",{userId:matched.id,role:owner?targetRole:"teacher",schoolId:owner?targetSchool:schoolId,branchId:owner?targetBranch:branchId,...(targetRole==="teacher"?{teacherId:teacherId.trim()}:{})});setStaffEmail("");},"Central membership created");}}>
 <label className="grid gap-1 text-sm">Existing Eleeveon account email<input type="email" autoComplete="email" className="rounded border p-2" required value={staffEmail} onChange={e=>setStaffEmail(e.target.value)}/></label>
 {owner&&<label className="grid gap-1 text-sm">Role<select className="rounded border p-2" value={targetRole} onChange={e=>setTargetRole(e.target.value as any)}><option value="teacher">Teacher</option><option value="branch_admin">Branch Admin</option></select></label>}
 {owner&&<><label className="grid gap-1 text-sm">School ID<input className="rounded border p-2" required value={targetSchool} onChange={e=>setTargetSchool(e.target.value)}/></label><label className="grid gap-1 text-sm">Branch ID<input className="rounded border p-2" required value={targetBranch} onChange={e=>setTargetBranch(e.target.value)}/></label></>}
 {targetRole==="teacher"&&<label className="grid gap-1 text-sm">Existing Teacher profile ID<input className="rounded border p-2" required value={teacherId} onChange={e=>setTeacherId(e.target.value)}/></label>}
 <button disabled={busy} className="rounded bg-blue-700 p-2 text-white sm:col-span-2">{busy?"Saving…":"Assign central membership"}</button></form>
 <section className="space-y-2">{visible.map(i=><article key={i.id} className="flex items-center justify-between gap-3 rounded border p-3"><div><strong>{i.user?.fullName||i.user?.email||i.userId}</strong><p className="text-sm opacity-70">{i.role} · {i.branchId||"Account"} · {i.active?"Active":"Inactive"}</p></div><button disabled={busy || !i.active} className="rounded border p-2" onClick={()=>{if(!window.confirm("Revoke this central membership?"))return;void execute(()=>request(`/memberships/${encodeURIComponent(i.id)}`,"DELETE"),"Membership revoked");}}>Revoke</button></article>)}{!visible.length&&<p>No memberships in your authorized scope.</p>}</section>
 </main>;
}
