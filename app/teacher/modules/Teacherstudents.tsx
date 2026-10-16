"use client";
/**
 * Eleeveon Schools — Teacher Students V30
 * app/teacher/modules/Teacherstudents.tsx
 *
 * Branch Admin visual parity without administrative actions:
 * - Starts DIRECTLY with student cards on phone and desktop; table under More.
 * - Compact photographs, names, admission numbers and school-friendly labels.
 * - Shared toolbar Search / Filter / More; no Add, Delete, Enrollment, Transfer.
 * - Theme-safe modal with dim/blur overlay and visible close control.
 * - Gender preselection normalizes legacy "M", "F", "male", "female"
 *   and Branch Admin "Male", "Female" values, without clearing unknown values.
 * - Edit ONLY permitted student profile fields; offline-first updateLocal/media.
 * - Recheck selected teacher assignment immediately before save.
 * - Backend and sync authorization MUST enforce the same field allowlist.
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
/** Use Branch Admin's persisted capitalized values. Keep unknown values untouched. */
function normalizeGender(raw: unknown): string {
  const original = value(raw).trim();
  const key = original.toLowerCase();
  if (["m", "male", "boy", "boys"].includes(key)) return "Male";
  if (["f", "female", "girl", "girls"].includes(key)) return "Female";
  if (["o", "other", "non-binary", "nonbinary"].includes(key)) return "Other";
  return original;
}
export default function Teacherstudents() {
 const access=useTeacherWorkspaceAccess();
 const revision=useBranchTableRevision(["students","studentEnrollments","classes","mediaAssets"]);
 const [rows,setRows]=useState<StudentView[]>([]);
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [search,setSearch]=useState("");
  const [classId,setClassId]=useState("all");
  const [genderFilter,setGenderFilter]=useState("all");
 const [filterOpen,setFilterOpen]=useState(false);
 const [view,setView]=useState<"cards"|"table">("cards");
 const [moreOpen,setMoreOpen]=useState(false);
 const [selected,setSelected]=useState<StudentView|null>(null);
 const [form,setForm]=useState<ProfileForm>(blank);
 const [stagedPhoto,setStagedPhoto]=useState<{assetId:string;previewUrl:string}|null>(null);
 const [feedback,setFeedback]=useState("");
 const photoSession=useRef(createMediaSessionKey("students"));
  // Cards are the landing view on every device. The table is optional under More.
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
   // Dexie offline media often resolves to blob: URLs; these must display.
   return src || undefined;
 };
 const classes=useMemo(()=>[...new Map(rows.map(x=>[x.classId,x.classLabel])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[rows]);
 const shown=useMemo(()=>rows.filter(({row,classId:cls})=>{
   if(classId!=="all"&&cls!==classId)return false;
   if(genderFilter!=="all"&&normalizeGender((row as any).gender || (row as any).sex)!==genderFilter)return false;
   const q=search.toLowerCase().trim();return !q||`${row.fullName||""} ${(row as any).admissionNumber||""} ${cls}`.toLowerCase().includes(q);
  }),[rows,classId,genderFilter,search]);
 useRegisterBranchWorkspaceToolbar("teacherStudents",{search:setSearch,filter:()=>setFilterOpen(true),more:()=>setMoreOpen(true)});
 const startEdit=(item:StudentView)=>{
  const r:any=item.row;
  setSelected(item);setStagedPhoto(null);photoSession.current=createMediaSessionKey("students");
   setForm({fullName:value(r.fullName),gender:normalizeGender(r.gender || r.sex),dateOfBirth:value(r.dateOfBirth).slice(0,10),age:value(r.age),parentName:value(r.parentName),parentPhone:value(r.parentPhone),parentEmail:value(r.parentEmail),address:value(r.address)});
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
   {view==="table"?<div className="ts-table"><table><thead><tr><th>Student</th><th>Admission No.</th><th>Class</th><th>Gender</th><th>Age</th><th>Action</th></tr></thead><tbody>{shown.map(item=><tr key={asId((item.row as any).id)}><td><div className="ts-person"><Avatar src={photoFor(item.row)} name={value(item.row.fullName)}/><strong>{item.row.fullName}</strong></div></td><td>{(item.row as any).admissionNumber||"—"}</td><td>{item.classLabel}</td><td>{normalizeGender((item.row as any).gender || (item.row as any).sex)||"—"}</td><td>{(item.row as any).age??"—"}</td><td><button onClick={()=>startEdit(item)}>Edit</button></td></tr>)}</tbody></table></div>:
    <div className="ts-cards">{shown.map(item=><article className="ts-card" key={asId((item.row as any).id)}><div className="ts-person"><Avatar src={photoFor(item.row)} name={value(item.row.fullName)}/><div><strong>{item.row.fullName}</strong><small>{(item.row as any).admissionNumber||"No admission number"} · {item.classLabel}</small><small>{normalizeGender((item.row as any).gender || (item.row as any).sex)||"Gender not set"} · Age {(item.row as any).age??"—"}</small></div></div><button className="ts-edit-action" onClick={()=>startEdit(item)} aria-label={`Edit ${value(item.row.fullName)}`}>Edit <span aria-hidden="true">✎</span></button></article>)}</div>}
   {!shown.length&&<div className="ts-state">No students match your assigned classes and filters.</div>}
  </>}
  {filterOpen&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFilterOpen(false)}}><section className="ts-modal" role="dialog" aria-modal="true" aria-label="Student filters"><header><h3>Student filters</h3><button onClick={()=>setFilterOpen(false)} aria-label="Close filters">×</button></header><label>Class<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="all">All assigned classes</option>{classes.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Gender<select value={genderFilter} onChange={e=>setGenderFilter(e.target.value)}><option value="all">All genders</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></label><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Student name or admission number"/></label><footer><button onClick={()=>{setClassId("all");setGenderFilter("all");setSearch("")}}>Clear</button><button className="primary" onClick={()=>setFilterOpen(false)}>Apply</button></footer></section></div>,document.body)}
  {moreOpen&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMoreOpen(false)}}><section className="ts-modal" role="dialog" aria-modal="true" aria-label="Student display"><header><h3>Display</h3><button onClick={()=>setMoreOpen(false)} aria-label="Close">×</button></header><button onClick={()=>{setView("cards");setMoreOpen(false)}}>Cards</button><button onClick={()=>{setView("table");setMoreOpen(false)}}>Table</button></section></div>,document.body)}
  {selected&&typeof document!=="undefined"&&createPortal(<div className="ts-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null)}}><section className="ts-modal ts-editor" role="dialog" aria-modal="true" aria-label="Edit student"><header><div><h3>Edit student</h3><small>{(selected.row as any).admissionNumber||"Admission number unavailable"} · {selected.classLabel}</small></div><button disabled={saving} onClick={()=>setSelected(null)} aria-label="Close editor">×</button></header><div className="ts-form"><div className="ts-photo"><Avatar src={stagedPhoto?.previewUrl||photoFor(selected.row)} name={form.fullName}/><label>Change photo<input type="file" accept="image/*" onChange={e=>void pickPhoto(e.target.files?.[0])}/></label></div><label>Full name<input value={form.fullName} onChange={e=>setForm(p=>({...p,fullName:e.target.value}))}/></label><label>Gender<select value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}><option value="">Not specified</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>{form.gender && !["Male","Female","Other"].includes(form.gender) && <option value={form.gender}>{form.gender} (existing)</option>}</select></label><label>Date of birth<input type="date" value={form.dateOfBirth} onChange={e=>setForm(p=>({...p,dateOfBirth:e.target.value}))}/></label><label>Age<input type="number" min="0" max="130" value={form.age} onChange={e=>setForm(p=>({...p,age:e.target.value}))}/></label><label>Parent/guardian name<input value={form.parentName} onChange={e=>setForm(p=>({...p,parentName:e.target.value}))}/></label><label>Parent/guardian phone<input value={form.parentPhone} onChange={e=>setForm(p=>({...p,parentPhone:e.target.value}))}/></label><label>Parent/guardian email<input type="email" value={form.parentEmail} onChange={e=>setForm(p=>({...p,parentEmail:e.target.value}))}/></label><label className="wide">Address<input value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))}/></label><div className="ts-locked wide"><strong>School-managed fields</strong><span>Admission number: {(selected.row as any).admissionNumber||"—"} · Class: {selected.classLabel}. Enrollment and admission details can only be changed by authorized administrators.</span></div></div><footer><button disabled={saving} onClick={()=>setSelected(null)}>Cancel</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save changes"}</button></footer></section></div>,document.body)}
 </main>
}
function Avatar({src,name}:{src?:string;name:string}){return <span className="ts-avatar">{src?<img src={src} alt=""/>:value(name).trim().slice(0,1).toUpperCase()||"S"}</span>}
const styles = `
/* Teacher Students V30 — cards first, no introductory banner or admin actions. */
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Add in Students"],
.role-shell.branch-workspace-layout .ba-v7-nav .ba-v7-tool[aria-label="Print in Students"] {display:none!important}
.ts-page{--ts-card:var(--card-bg,var(--surface,#fff));--ts-text:var(--text,#172033);--ts-muted:var(--muted,#667085);--ts-border:var(--border,rgba(15,23,42,.13));--ts-primary:var(--ba-primary,var(--primary-color,#2563eb));--ts-shade:var(--surface-2,color-mix(in srgb,var(--ts-card) 94%,var(--ts-text) 6%));color:var(--ts-text);width:100%;min-width:0;padding:4px 5px max(24px,env(safe-area-inset-bottom));background:transparent;font:inherit}
.ts-page *,.ts-backdrop *{box-sizing:border-box;min-width:0}.ts-page button,.ts-backdrop button{cursor:pointer;font:inherit}
.ts-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;align-content:start}
.ts-card,.ts-table,.ts-state{background:var(--ts-card);border:1px solid var(--ts-border);border-radius:17px;box-shadow:0 8px 22px rgba(15,23,42,.045)}
.ts-card{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:12px;min-height:88px;transition:border-color .15s,box-shadow .15s}
.ts-card:focus-within{border-color:var(--ts-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--ts-primary) 15%,transparent)}
.ts-person{display:flex;align-items:center;gap:11px;min-width:0;flex:1}.ts-person>div{display:grid;align-content:center;gap:3px;min-width:0}
.ts-person strong{font-size:13px;line-height:1.3;font-weight:850;overflow-wrap:anywhere}.ts-person small{display:block;font-size:11px;line-height:1.35;color:var(--ts-muted);overflow-wrap:anywhere}
.ts-avatar{flex:0 0 45px;width:45px;height:45px;display:grid;place-items:center;border:1px solid var(--ts-border);border-radius:14px;background:var(--ts-shade);font-size:17px;font-weight:850;color:var(--ts-muted);overflow:hidden}.ts-avatar img{width:100%;height:100%;object-fit:cover}
.ts-card button,.ts-table button{flex:0 0 auto;min-height:36px;padding:7px 12px;border-radius:11px;border:1px solid color-mix(in srgb,var(--ts-primary) 22%,var(--ts-border));background:color-mix(in srgb,var(--ts-primary) 8%,var(--ts-card));color:var(--ts-primary);font-size:12px;font-weight:800}
.ts-card button:hover,.ts-table button:hover{background:color-mix(in srgb,var(--ts-primary) 15%,var(--ts-card))}.ts-edit-action span{margin-left:3px;font-size:13px}
.ts-table{padding:3px;overflow-x:auto;max-width:100%}.ts-table table{min-width:640px;width:100%;border-collapse:collapse}.ts-table th,.ts-table td{padding:11px;border-bottom:1px solid var(--ts-border);text-align:left;font-size:12px;vertical-align:middle}.ts-table th{background:var(--ts-shade);font-size:11px;color:var(--ts-muted);font-weight:850}.ts-table tbody tr:last-child td{border-bottom:0}.ts-table .ts-person strong{font-size:12px}.ts-state{padding:28px;text-align:center;color:var(--ts-muted);line-height:1.5}
.ts-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 11px;margin-bottom:9px;border:1px solid var(--ts-border);border-radius:12px;background:var(--ts-card);font-size:12px}.ts-notice button{border:0;background:transparent;color:inherit;font-size:20px}
.ts-backdrop{--ts-card:var(--card-bg,var(--surface,#fff));--ts-text:var(--text,#172033);--ts-muted:var(--muted,#667085);--ts-border:var(--border,rgba(15,23,42,.13));--ts-primary:var(--ba-primary,var(--primary-color,#2563eb));--ts-shade:var(--surface-2,color-mix(in srgb,var(--ts-card) 94%,var(--ts-text) 6%));position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.59);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);padding:8px max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom));color:var(--ts-text)}
.ts-modal{width:min(560px,100%);max-height:calc(100dvh - 16px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--ts-card);border-radius:20px;border:1px solid var(--ts-border);padding:13px;display:grid;align-content:start;gap:12px;box-shadow:0 28px 75px rgba(0,0,0,.28)}
.ts-modal.ts-editor{width:min(730px,100%)}
.ts-modal header{position:sticky;top:-13px;background:var(--ts-card);display:flex;justify-content:space-between;align-items:center;gap:10px;margin:-13px -13px 0;padding:13px;border-bottom:1px solid var(--ts-border);z-index:5}.ts-modal h3{margin:0;font-size:16px;font-weight:850}.ts-modal small{color:var(--ts-muted);font-size:11px}
.ts-modal header button{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border:1px solid var(--ts-border);border-radius:50%;background:var(--ts-shade);color:var(--ts-text);font-weight:800;opacity:1;visibility:visible;font-size:24px;line-height:1}
.ts-modal label{display:grid;gap:5px;font-size:12px;font-weight:800;color:var(--ts-text)}.ts-modal input,.ts-modal select{display:block;width:100%;min-height:42px;border:1px solid var(--ts-border);border-radius:12px;background:var(--input-bg,var(--ts-card));color:var(--input-text,var(--ts-text));padding:0 10px;font:inherit;font-size:16px;outline:none}.ts-modal input:focus,.ts-modal select:focus{border-color:var(--ts-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--ts-primary) 16%,transparent)}
.ts-modal>button{min-height:40px;border:1px solid var(--ts-border);padding:10px;background:var(--ts-card);color:var(--ts-text);border-radius:12px;text-align:left}
.ts-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.ts-form .wide,.ts-form .ts-photo{grid-column:1/-1}.ts-photo{display:flex;gap:13px;align-items:center}.ts-photo .ts-avatar{width:67px;height:67px;flex-basis:67px;border-radius:20px}.ts-photo input{font-size:11px;height:auto;padding:9px}.ts-locked{display:grid;gap:6px;padding:12px;background:var(--ts-shade);border:1px solid var(--ts-border);border-radius:13px}.ts-locked strong{font-size:12px}.ts-locked span{font-size:11px;line-height:1.5;color:var(--ts-muted)}
.ts-modal footer{position:sticky;bottom:-13px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--ts-border);padding:12px 13px;margin:0 -13px -13px;background:var(--ts-card);z-index:4}.ts-modal footer button{min-height:42px;border:1px solid var(--ts-border);border-radius:12px;padding:9px 15px;background:var(--ts-card);color:var(--ts-text);font-size:12px;font-weight:850}.ts-modal footer .primary{background:var(--ts-primary);color:#fff;border-color:var(--ts-primary)}.ts-modal button:disabled{opacity:.55;cursor:not-allowed}
@media(min-width:740px){.ts-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1300px){.ts-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:440px){.ts-form{grid-template-columns:minmax(0,1fr)}.ts-card{padding:10px;gap:6px}.ts-avatar{width:41px;height:41px;flex-basis:41px}.ts-card button{padding:7px 9px}}
@media print{.ts-modal,.ts-backdrop{display:none!important}}
`;
