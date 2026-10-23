"use client";
import React,{useEffect,useState} from "react";
import { identityApi,type IdentityPolicy,type IssuanceMode } from "./identityApi";
const defaultPolicy:IdentityPolicy={studentMode:"manual",teacherMode:"manual",expiryMonths:12,showClassPublicly:true,showNamePublicly:false};
export default function IdentityIssuanceSettings({schoolId,branchId,onClose}:{schoolId:string;branchId:string;onClose:()=>void}) {
 const [policy,setPolicy]=useState<IdentityPolicy>(defaultPolicy);
 const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{let current=true;identityApi.policy(schoolId,branchId).then(p=>{if(current)setPolicy(p)}).catch(()=>{if(current)setMessage("Could not load settings; connect to the server.")});return()=>{current=false}},[schoolId,branchId]);
 const select=(key:"studentMode"|"teacherMode",label:string)=><label style={{display:"grid",gap:5,marginBottom:12,fontSize:13}}>{label}<select value={policy[key]} onChange={e=>setPolicy(p=>({...p,[key]:e.target.value as IssuanceMode}))} style={{minHeight:40,padding:8,borderRadius:8,background:"var(--surface,#fff)",color:"var(--text,#111827)"}}><option value="manual">Manual — Generate from person</option><option value="automatic">Automatic — After sync</option><option value="disabled">Disabled</option></select></label>;
 return <div className="ba-sheet-backdrop" role="dialog" aria-modal="true" style={{zIndex:2000}}><section className="ba-sheet small" style={{padding:16,maxWidth:520,margin:"auto"}}>
 <div className="ba-sheet-head"><h2>ID issuance</h2><button type="button" onClick={onClose}>✕</button></div>
 <p style={{fontSize:12}}>Choose how the school issues ID cards. Automatic IDs become publicly valid only after the person synchronizes.</p>
 {select("studentMode","Students")}{select("teacherMode","Teachers")}
 <label style={{display:"grid",gap:5,fontSize:13}}>Expiry (months)<input type="number" min={1} max={120} value={policy.expiryMonths} onChange={e=>setPolicy(p=>({...p,expiryMonths:Number(e.target.value)}))}/></label>
 <label style={{display:"flex",gap:8,marginTop:12,fontSize:13}}><input type="checkbox" checked={policy.showClassPublicly} onChange={e=>setPolicy(p=>({...p,showClassPublicly:e.target.checked}))}/>Show a student's class on public verification</label>
 <label style={{display:"flex",gap:8,marginTop:12,fontSize:13}}><input type="checkbox" checked={policy.showNamePublicly} onChange={e=>setPolicy(p=>({...p,showNamePublicly:e.target.checked}))}/>Show full name publicly when a QR is scanned</label>
 {message&&<p role="status" style={{fontSize:12}}>{message}</p>}
 <div className="ba-sheet-actions" style={{display:"flex",gap:8,marginTop:16}}><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={async()=>{setSaving(true);setMessage("");try{await identityApi.savePolicy({...policy,schoolId,branchId});setMessage("Settings saved.")}catch(e:any){setMessage(e?.message||"Settings could not be saved.")}finally{setSaving(false)}}}>{saving?"Saving...":"Save"}</button></div>
 </section></div>;
}
