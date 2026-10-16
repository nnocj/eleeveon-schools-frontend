"use client";
/**
 * app/teacher/modules/Teacherstudents.tsx
 * Student directory for the selected teacher membership.
 * EDIT ONLY: admission number and enrollment are display-only and never enter payload.
 * All records and mutations scoped to the current teacher's assigned classes.
 * Backend/sync must enforce the same field and assignment allowlist.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { db, type Student } from "../../lib/db/db";
import { updateLocal } from "../../lib/sync/syncUtils";
import {
  MediaFieldKeys, saveImageAsset, createMediaSessionKey,
  commitMediaAssetsToOwner,
} from "../../lib/media/mediaAssetUtils";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { asId, idsEqual, useTeacherWorkspaceAccess, verifyTeacherStudentAssignment } from "../hooks/useTeacherWorkspaceAccess";

type StudentView = { row: Student; classLabel:string; classId:string };
type ProfileForm = {
 fullName:string; gender:string; dateOfBirth:string; age:string;
 parentName:string; parentPhone:string; parentEmail:string; address:string;
};
const blank:ProfileForm = {fullName:"",gender:"",dateOfBirth:"",age:"",parentName:"",parentPhone:"",parentEmail:"",address:""};
const value=(v:unknown)=>v==null?"":String(v);
export default function Teacherstudents() {
 const access=useTeacherWorkspaceAccess();
 const revision=useBranchTableRevision(["students","studentEnrollments","classes","mediaAssets"]);
 const [rows,setRows]=useState<StudentView[]>([]);
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [search,setSearch]=useState("");
 const [classId,setClassId]=useState("all");
 const [filterOpen,setFilterOpen]=useState(false);
 const [view,setView]=useState<"cards"|"table">("cards");
 const [moreOpen,setMoreOpen]=useState(false);
 const [selected,setSelected]=useState<StudentView|null>(null);
 const [form,setForm]=useState<ProfileForm>(blank);
 const [stagedPhoto,setStagedPhoto]=useState<{assetId:string;previewUrl:string}|null>(null);
 const [feedback,setFeedback]=useState("");
 const photoSession=useRef(createMediaSessionKey("students"));
 useEffect(()=>{if(typeof window!=="undefined")setView(window.matchMedia("(min-width:768px)").matches?"table":"cards")},[]);
 const load=async()=>{
  if(!access.permitted||!access.ready){setRows([]);return;}
  setBusy(true);
  try{
    const [students,enrollments,classes]=await Promise.all([(db as any).students.toArray(),(db as any).studentEnrollments.toArray(),(db as any).classes.toArray()]);
    const isTenant=(r:any)=>r?.isDeleted!==true&&idsEqual(r.accountId,access.accountId)&&idsEqual(r.schoolId,access.schoolId)&&idsEqual(r.branchId,access.branchId);
    const names=new Map<string,string>((classes as any[]).filter(isTenant).map(c=>[asId(c.id),value(c.name)]));
    const enrolled=(enrollments as any[]).filter((e:any)=>isTenant(e)&&e.active!==false&&e.status==="active"&&access.allowedClassIds.has(asId(e.classId)));
    const byStudent=new Map<string,{classId:string;classLabel:string}>();
    enrolled.forEach((e:any)=>{const id=asId(e.studentId);if(!byStudent.has(id))byStudent.set(id,{classId:asId(e.classId),classLabel:names.get(asId(e.classId))||"Class"})});
    setRows((students as Student[]).filter((s:any)=>isTenant(s)&&byStudent.has(asId(s.id))&&!(["withdrawn","graduated","deleted"].includes(value(s.status).toLowerCase())))
     .map(s=>({row:s,...byStudent.get(asId(s.id))!})).sort((a,b)=>value(a.row.fullName).localeCompare(value(b.row.fullName))));
  }catch(error){console.error(error);setFeedback("Could not load assigned students.");setRows([])}finally{setBusy(false)}
 };
 useEffect(()=>{void load()},[access.ready,access.permitted,access.teacherId,access.accountId,access.schoolId,access.branchId,[...access.allowedClassIds].sort().join(","),revision]);
 const mediaRows=useMemo(()=>rows.map(x=>x.row),[rows]);
 const media=useEntityMediaUrls({accountId:access.accountId,ownerTable:"students",rows:mediaRows,fields:[{fieldKey:"photo",mediaIdKey:"photoMediaId"}]});
 const photoFor=(row:Student)=>{
  const src=media[asId((row as any).id)]?.photo||value((row as any).photo);
  return src.startsWith("blob:")||src.startsWith("data:")?undefined:src||undefined;
 };
 const classes=useMemo(()=>[...new Map(rows.map(x=>[x.classId,x.classLabel])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[rows]);
 const shown=useMemo(()=>rows.filter(({row,classId:cls})=>{
  if(classId!=="all"&&cls!==classId)return false;
  const q=search.toLowerCase().trim();return !q||`${row.fullName||""} ${(row as any).admissionNumber||""}`.toLowerCase().includes(q);
 }),[rows,classId,search]);
 useRegisterBranchWorkspaceToolbar("teacherStudents",{search:setSearch,filter:()=>setFilterOpen(true),more:()=>setMoreOpen(true)});
 const startEdit=(item:StudentView)=>{
  const r:any=item.row;
  setSelected(item);setStagedPhoto(null);photoSession.current=createMediaSessionKey("students");
  setForm({fullName:value(r.fullName),gender:value(r.gender),dateOfBirth:value(r.dateOfBirth).slice(0,10),age:value(r.age),parentName:value(r.parentName),parentPhone:value(r.parentPhone),parentEmail:value(r.parentEmail),address:value(r.address)});
 };
 const pickPhoto=async(file?:File)=>{
  if(!file||!selected)return;
  if(!file.type.startsWith("image/")){setFeedback("Choose an image file.");return;}
  try{
   const result=await saveImageAsset(file,{accountId:access.accountId,schoolId:access.schoolId,branchId:access.branchId,ownerTable:"students",ownerId:undefined,ownerTempKey:photoSession.current,fieldKey:MediaFieldKeys.PHOTO,variant:"avatar",replaceExisting:true});
   if(!result.assetId)throw new Error("Photo asset was not created.");
   setStagedPhoto({assetId:asId(result.assetId),previewUrl:result.previewUrl});
  }catch(error){setFeedback(error instanceof Error?error.message:"Could not process photo.")}
 };
 const save=async()=>{
  if(!selected||!access.permitted)return;
  if(!form.fullName.trim()){setFeedback("Student name is required.");return;}
  const studentId=asId((selected.row as any).id);
  setSaving(true);
  try{
   if(!await verifyTeacherStudentAssignment(access,studentId))throw new Error("This student is no longer in a class assigned to you.");
   const studentList:any[]=await (db as any).students.toArray();
   const existing:any=studentList.find((r:any)=>idsEqual(r.id,studentId));
   if(!existing||!idsEqual(existing.accountId,access.accountId)||!idsEqual(existing.schoolId,access.schoolId)||!idsEqual(existing.branchId,access.branchId)||existing.isDeleted)throw new Error("Student record is no longer available.");
   // Explicit allowlist. No admissionNumber, currentClassId, organizationId,
   // enrollment IDs, status, financial records, deletion, or role information.
   const ageNumber=form.age.trim()===""?undefined:Number(form.age);
   if(ageNumber!==undefined&&(!Number.isFinite(ageNumber)||ageNumber<0||ageNumber>130))throw new Error("Enter a valid age.");
   await updateLocal("students",studentId,{
    fullName:form.fullName.trim(),gender:form.gender||undefined,
    dateOfBirth:form.dateOfBirth||undefined,age:ageNumber,
    parentName:form.parentName.trim()||undefined,parentPhone:form.parentPhone.trim()||undefined,
    parentEmail:form.parentEmail.trim()||undefined,address:form.address.trim()||undefined,
   } as Partial<Student>);
   if(stagedPhoto?.assetId){
    const committed=await commitMediaAssetsToOwner({accountId:access.accountId,ownerTable:"students",ownerId:studentId,ownerTempKey:photoSession.current,assets:[{assetId:stagedPhoto.assetId,fieldKey:MediaFieldKeys.PHOTO}]});
    const id=committed.find(item=>item.fieldKey===MediaFieldKeys.PHOTO)?.assetId;
    if(id)await updateLocal("students",studentId,{photoMediaId:id} as Partial<Student>);
   }
   setFeedback("Student details saved.");setSelected(null);setStagedPhoto(null);await load();
  }catch(error){console.error(error);setFeedback(error instanceof Error?error.message:"Save failed.");}finally{setSaving(false)}
 };
 return <main className="ts-page"><style>{styles}</style>
  {!access.ready||busy?<div className="ts-state">Loading assigned students…</div>:!access.permitted?<div className="ts-state">A linked teacher membership is required.</div>:<>
   {feedback&&<div className="ts-notice" role="status">{feedback}<button onClick={()=>setFeedback("")} aria-label="Dismiss">×</button></div>}
   <div className="ts-context"><strong>{shown.length} student{shown.length===1?"":"s"}</strong><span>Assigned classes · Edit student details only</span></div>
   {view==="table"?<div className="ts-table"><table><thead><tr><th>Student</th><th>Admission No.</th><th>Class</th><th>Gender</th><th>Age</th><th>Action</th></tr></thead><tbody>{shown.map(item=><tr key={asId((item.row as any).id)}><td><div className="ts-person"><Avatar src={photoFor(item.row)} name={value(item.row.fullName)}/><strong>{item.row.fullName}</strong></div></td><td>{(item.row as any).admissionNumber||"—"}</td><td>{item.classLabel}</td><td>{(item.row as any).gender||"—"}</td><td>{(item.row as any).age??"—"}</td><td><button onClick={()=>startEdit(item)}>Edit</button></td></tr>)}</tbody></table></div>:
    <div className="ts-cards">{shown.map(item=><article className="ts-card" key={asId((item.row as any).id)}><div className="ts-person"><Avatar src={photoFor(item.row)} name={value(item.row.fullName)}/><div><strong>{item.row.fullName}</strong><small>{(item.row as any).admissionNumber||"No admission number"} · {item.classLabel}</small><small>{(item.row as any).gender||"Gender not set"} · Age {(item.row as any).age??"—"}</small></div></div><button onClick={()=>startEdit(item)}>Edit</button></article>)}</div>}
   {!shown.length&&<div className="ts-state">No students match your assigned classes and filters.</div>}
  </>}
  {filterOpen&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFilterOpen(false)}}><section className="ts-modal" role="dialog" aria-modal="true" aria-label="Student filters"><header><h3>Student filters</h3><button onClick={()=>setFilterOpen(false)} aria-label="Close filters">×</button></header><label>Class<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="all">All assigned classes</option>{classes.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Student name or admission number"/></label><footer><button onClick={()=>{setClassId("all");setSearch("")}}>Clear</button><button className="primary" onClick={()=>setFilterOpen(false)}>Apply</button></footer></section></div>,document.body)}
  {moreOpen&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMoreOpen(false)}}><section className="ts-modal" role="dialog" aria-modal="true" aria-label="Student display"><header><h3>Display</h3><button onClick={()=>setMoreOpen(false)} aria-label="Close">×</button></header><button onClick={()=>{setView("cards");setMoreOpen(false)}}>Cards</button><button onClick={()=>{setView("table");setMoreOpen(false)}}>Table</button></section></div>,document.body)}
  {selected&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null)}}><section className="ts-modal ts-editor" role="dialog" aria-modal="true" aria-label="Edit student"><header><div><h3>Edit student</h3><small>{(selected.row as any).admissionNumber||"Admission number unavailable"} · {selected.classLabel}</small></div><button disabled={saving} onClick={()=>setSelected(null)} aria-label="Close editor">×</button></header><div className="ts-form"><div className="ts-photo"><Avatar src={stagedPhoto?.previewUrl||photoFor(selected.row)} name={form.fullName}/><label>Change photo<input type="file" accept="image/*" onChange={e=>void pickPhoto(e.target.files?.[0])}/></label></div><label>Full name<input value={form.fullName} onChange={e=>setForm(p=>({...p,fullName:e.target.value}))}/></label><label>Gender<select value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label>Date of birth<input type="date" value={form.dateOfBirth} onChange={e=>setForm(p=>({...p,dateOfBirth:e.target.value}))}/></label><label>Age<input type="number" min="0" max="130" value={form.age} onChange={e=>setForm(p=>({...p,age:e.target.value}))}/></label><label>Parent/guardian name<input value={form.parentName} onChange={e=>setForm(p=>({...p,parentName:e.target.value}))}/></label><label>Parent/guardian phone<input value={form.parentPhone} onChange={e=>setForm(p=>({...p,parentPhone:e.target.value}))}/></label><label>Parent/guardian email<input type="email" value={form.parentEmail} onChange={e=>setForm(p=>({...p,parentEmail:e.target.value}))}/></label><label className="wide">Address<input value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))}/></label><div className="ts-locked wide"><strong>School-managed fields</strong><span>Admission number: {(selected.row as any).admissionNumber||"—"} · Class: {selected.classLabel}. Enrollment and admission details can only be changed by authorized administrators.</span></div></div><footer><button disabled={saving} onClick={()=>setSelected(null)}>Cancel</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save changes"}</button></footer></section></div>,document.body)}
 </main>
}
function Avatar({src,name}:{src?:string;name:string}){return <span className="ts-avatar">{src?<img src={src} alt=""/>:value(name).trim().slice(0,1).toUpperCase()||"S"}</span>}
const styles=`
/* Teacher Students has only Edit as a record action. Do not show Add or generic Print. */
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Add in Students"],
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Print in Students"]{display:none!important}
.ts-page{--ts-bg:var(--bg,#f4f5f7);--ts-card:var(--card-bg,var(--surface,#fff));--ts-text:var(--text,#111827);--ts-muted:var(--muted,#64748b);--ts-border:var(--border,rgba(15,23,42,.12));color:var(--ts-text);background:transparent;min-width:0;padding:4px;font:inherit}
.ts-page *,.ts-backdrop *{box-sizing:border-box}.ts-page button,.ts-backdrop button{cursor:pointer;font:inherit}.ts-context{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:3px 0 8px}.ts-context span{font-size:12px;color:var(--ts-muted)}.ts-cards{display:grid;grid-template-columns:1fr;gap:8px}.ts-card,.ts-table,.ts-state{border:1px solid var(--ts-border);border-radius:12px;background:color-mix(in srgb,var(--ts-card) 95%,var(--ts-text) 5%);padding:10px}.ts-card{display:flex;align-items:center;justify-content:space-between;gap:9px}.ts-person{display:flex;align-items:center;gap:9px;min-width:0}.ts-person>div{display:flex;flex-direction:column;min-width:0;gap:2px}.ts-person strong{font-size:12px;overflow-wrap:anywhere}.ts-person small{font-size:10.5px;color:var(--ts-muted)}.ts-avatar{flex:0 0 40px;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--ts-border);border-radius:12px;background:var(--ts-bg);font-weight:700;overflow:hidden}.ts-avatar img{width:100%;height:100%;object-fit:cover}.ts-card button,.ts-table button{padding:7px 11px;border-radius:9px;border:1px solid var(--ts-border);background:var(--ts-card);color:var(--ts-text);font-size:12px}.ts-table{padding:3px;overflow-x:auto}.ts-table table{min-width:680px;width:100%;border-collapse:collapse}.ts-table th,.ts-table td{padding:10px;border-bottom:1px solid var(--ts-border);text-align:left;font-size:12px}.ts-table th{background:color-mix(in srgb,var(--ts-card) 90%,var(--ts-text) 10%);font-size:11px}.ts-state{padding:25px;text-align:center;color:var(--ts-muted)}.ts-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px;margin-bottom:8px;border:1px solid var(--ts-border);border-radius:9px}.ts-notice button{border:0;background:transparent;color:inherit;font-size:20px}
.ts-backdrop{--ts-card:var(--card-bg,var(--surface,#fff));--ts-text:var(--text,#111827);--ts-muted:var(--muted,#64748b);--ts-border:var(--border,rgba(15,23,42,.12));position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.65);backdrop-filter:blur(11px);padding:calc(var(--portal-header-height,48px) + 10px) 8px calc(66px + env(safe-area-inset-bottom,0px));color:var(--ts-text)}.ts-modal{width:min(570px,100%);max-height:100%;overflow-y:auto;overscroll-behavior:contain;background:var(--ts-card);border-radius:15px;border:1px solid var(--ts-border);padding:12px;display:grid;gap:12px;box-shadow:0 24px 70px rgba(0,0,0,.3)}.ts-modal header{position:sticky;top:-12px;background:var(--ts-card);display:flex;justify-content:space-between;align-items:center;gap:10px;margin:-12px -12px 0;padding:12px;border-bottom:1px solid var(--ts-border);z-index:2}.ts-modal h3{margin:0;font-size:15px}.ts-modal small{color:var(--ts-muted)}.ts-modal header button{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border:1px solid var(--ts-border);border-radius:50%;background:color-mix(in srgb,var(--ts-card) 90%,var(--ts-text) 10%);color:var(--ts-text);font-size:23px}.ts-modal label{display:grid;gap:4px;font-size:11px;font-weight:650}.ts-modal input,.ts-modal select{width:100%;min-height:40px;border:1px solid var(--ts-border);border-radius:9px;background:var(--ts-card);color:var(--ts-text);padding:0 10px;font:inherit}.ts-modal>button{border:1px solid var(--ts-border);padding:10px;background:var(--ts-card);color:var(--ts-text);border-radius:10px}.ts-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ts-form .wide,.ts-form .ts-photo{grid-column:1/-1}.ts-photo{display:flex;gap:12px;align-items:center}.ts-photo .ts-avatar{width:64px;height:64px;flex-basis:64px}.ts-photo input{font-size:11px;padding:8px}.ts-locked{display:grid;gap:4px;padding:10px;background:color-mix(in srgb,var(--ts-card) 92%,var(--ts-text) 8%);border-radius:9px}.ts-locked span{font-size:11px;color:var(--ts-muted)}.ts-modal footer{position:sticky;bottom:-12px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--ts-border);padding:12px;margin:0 -12px -12px;background:var(--ts-card)}.ts-modal footer button{border:1px solid var(--ts-border);border-radius:9px;padding:10px 13px;background:var(--ts-card);color:var(--ts-text)}.ts-modal footer .primary{background:var(--primary-color,#2563eb);color:#fff;border-color:transparent}
@media(min-width:760px){.ts-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:440px){.ts-form{grid-template-columns:1fr}}
`;
