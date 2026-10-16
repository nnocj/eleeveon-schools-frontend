"use client";

/**
 * app/teacher/modules/Teacherstudents.tsx
 * Eleeveon Schools — Teacher Students V31, Branch Admin visual parity.
 *
 * Visual contract: copies Branch Admin Students class names, hierarchy, and
 * cascade-preserving CSS for the student cards, table, modal, and More/Filter.
 * Desktop >=900px initially opens TABLE. Mobile initially opens CARDS.
 * There is no redundant heading, count strip, or role explanation above rows.
 *
 * Authorization contract: this page only reads students enrolled in classes
 * assigned to the selected teacher, verifies assignment before saving, and
 * updates only approved student profile fields. Admission, enrollment, class
 * placement, status, deletion, and organization are never mutated here.
 * Server and sync layers MUST independently enforce this contract.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { db, type Student } from "../../lib/db/db";
import { updateLocal } from "../../lib/sync/syncUtils";
import {
  MediaFieldKeys, MediaOwners, saveImageAsset, createMediaSessionKey,
  commitMediaAssetsToOwner,
} from "../../lib/media/mediaAssetUtils";
import { useSettings } from "../../context/settings-context";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import {
  asId, idsEqual, useTeacherWorkspaceAccess, verifyTeacherStudentAssignment,
} from "../hooks/useTeacherWorkspaceAccess";

type ViewMode = "cards" | "table";
type StudentView = {
  row: Student;
  classId: string;
  className: string;
  organizationName: string;
  enrollmentCount: number;
};
type ProfileForm = {
  fullName:string; gender:string; dateOfBirth:string; age:string;
  parentName:string; parentPhone:string; parentEmail:string; address:string;
};
const emptyForm: ProfileForm = {
  fullName:"", gender:"", dateOfBirth:"", age:"", parentName:"",
  parentPhone:"", parentEmail:"", address:"",
};
const value=(v:unknown):string=>v==null?"":String(v);
function normalizeGender(raw:unknown):string{
  const original=value(raw).trim();
  const key=original.toLowerCase();
  if(["m","male","boy","boys"].includes(key))return "Male";
  if(["f","female","girl","girls"].includes(key))return "Female";
  if(["o","other","nonbinary","non-binary"].includes(key))return "Other";
  return original;
}
function studentGender(row:Student):string {
  return normalizeGender((row as any).gender || (row as any).sex);
}
function studentStatus(row:Student):string { return value((row as any).status||"active").toLowerCase(); }
function statusTone(row:Student):string{
  const s=studentStatus(row);
  return s==="graduated"?"blue":s==="transferred"?"orange":s==="withdrawn"?"red":"green";
}
function formatDate(v:unknown):string{
  if(!v)return "—";
  const d=new Date(v as string);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GH",{day:"2-digit",month:"short",year:"numeric"}):"—";
}
function readableTextColor(color:string):string{
  const hex=value(color).trim().replace(/^#/,"");
  const six=hex.length===3?hex.split("").map(c=>c+c).join(""):hex;
  if(!/^[0-9a-f]{6}$/i.test(six))return "#ffffff";
  const n=parseInt(six,16);const l=(((n>>16)&255)*299+((n>>8)&255)*587+(n&255)*114)/1000;
  return l>155?"#111827":"#ffffff";
}
function Avatar({name,photo,primary}:{name:string;photo?:string;primary:string}){
  return <div className="ba-avatar" style={{
    background:photo?`url(${photo}) center/cover`:primary,
    color:photo?"#fff":readableTextColor(primary),
    borderColor:photo?"transparent":`color-mix(in srgb, ${primary} 76%, transparent)`,
  }}>{!photo&&value(name||"S").slice(0,1).toUpperCase()}</div>;
}
function StatusDot({row}:{row:Student}){
  const tone=statusTone(row);
  return <span className={`status-dot-mini ${tone}`} title={studentStatus(row)} aria-label={studentStatus(row)}/>;
}
function ScopedDialog({children,onClose,type="modal",primary}:{children:React.ReactNode;onClose:()=>void;type?:"modal"|"sheet";primary:string}){
  const [themeStyle,setThemeStyle]=useState<React.CSSProperties>({});
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  useEffect(()=>{
    if(typeof window==="undefined")return;
    const previous=document.body.style.overflow;
    const previousHtml=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.style.overflow="hidden";
    const src=document.querySelector(".teacher-students-page")||document.documentElement;
    const computed=window.getComputedStyle(src);
    const names=["--ba-primary","--ba-primary-text","--card-bg","--surface","--surface-2","--text","--muted","--border","--bg","--input-bg","--input-text","--input-border","--font-family","--font-size"];
    const vars:Record<string,string>={};
    names.forEach(name=>{const val=computed.getPropertyValue(name).trim();if(val)vars[name]=val;});
    vars["--ba-primary"]=primary;
    setThemeStyle(vars as React.CSSProperties);
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onCloseRef.current();};
    window.addEventListener("keydown",close);
    return ()=>{document.body.style.overflow=previous;document.documentElement.style.overflow=previousHtml;window.removeEventListener("keydown",close);};
  },[primary]);
  if(typeof document==="undefined")return null;
  return createPortal(<div className={`teacher-students-overlay ${type==="modal"?"ba-modal-backdrop":"ba-sheet-backdrop"}`}
    style={themeStyle} onPointerDown={e=>{if(e.currentTarget===e.target)onClose();}}>{children}</div>,document.body);
}

export default function Teacherstudents(){
  const access=useTeacherWorkspaceAccess();
  const {settings}=useSettings();
  const primary=settings?.primaryColor||"var(--primary-color,#2563eb)";
  const revision=useBranchTableRevision(["students","studentEnrollments","classes","organizations","mediaAssets","mediaBlobs"]);
  const [rows,setRows]=useState<StudentView[]>([]);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [search,setSearch]=useState("");
  const [filterClass,setFilterClass]=useState("all");
  const [filterGender,setFilterGender]=useState("all");
  const [view,setView]=useState<ViewMode>("cards");
  const [filterOpen,setFilterOpen]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false);
  const [selected,setSelected]=useState<StudentView|null>(null);
  const [form,setForm]=useState<ProfileForm>(emptyForm);
  const [stagedPhoto,setStagedPhoto]=useState<{assetId:string;previewUrl:string}|null>(null);
  const [feedback,setFeedback]=useState("");
  const mediaSession=useRef("");
  const mediaRows=useMemo(()=>rows.map(r=>r.row),[rows]);
  const photoMedia=useEntityMediaUrls({accountId:access.accountId,ownerTable:"students",rows:mediaRows,fields:[{fieldKey:"photo",mediaIdKey:"photoMediaId"}]});
  const classScopeKey=[...access.allowedClassIds].sort().join("|");

  // Exact Branch Admin default breakpoint. Deliberate user view changes persist
  // within the mounted workspace (screen width changes do not reset their choice).
  useEffect(()=>{
    if(typeof window!=="undefined")setView(window.matchMedia("(min-width: 900px)").matches?"table":"cards");
  },[]);

  const load=async()=>{
    if(!access.permitted||!access.ready){setRows([]);setBusy(false);return;}
    setBusy(true);
    try{
      const [studentRows,enrollments,classes,organizations]=await Promise.all([
        db.students.toArray(),db.studentEnrollments.toArray(),db.classes.toArray(),(db as any).organizations?.toArray?.()||Promise.resolve([]),
      ]);
      const sameTenant=(r:any)=>r?.isDeleted!==true && r?.active!==false && idsEqual(r.accountId,access.accountId) && idsEqual(r.schoolId,access.schoolId) && idsEqual(r.branchId,access.branchId);
      const classNames=new Map<string,string>((classes as any[]).filter(sameTenant).map(r=>[asId(r.id),value(r.name)]));
      const orgNames=new Map<string,string>((organizations as any[]).filter(sameTenant).map(r=>[asId(r.id),value(r.name)]));
      const allEligible=(enrollments as any[]).filter(r=>sameTenant(r)&&access.allowedClassIds.has(asId(r.classId)));
      const active=allEligible.filter(r=>r.status==="active"||(!r.status&&r.active!==false));
      const byStudent=new Map<string,{classId:string;className:string}>();
      active.forEach(r=>{
        const sid=asId(r.studentId),cls=asId(r.classId);
        if(sid&&!byStudent.has(sid))byStudent.set(sid,{classId:cls,className:classNames.get(cls)||"Class"});
      });
      const counts=new Map<string,number>();
      allEligible.forEach(r=>{const sid=asId(r.studentId);counts.set(sid,(counts.get(sid)||0)+1);});
      const next=(studentRows as Student[]).filter(r=>sameTenant(r)&&byStudent.has(asId(r.id))&&!(["withdrawn","graduated","deleted"].includes(studentStatus(r))))
        .map(r=>({row:r,...byStudent.get(asId(r.id))!,organizationName:orgNames.get(asId((r as any).organizationId))||"—",enrollmentCount:counts.get(asId(r.id))||0}))
        .sort((a,b)=>value(a.row.fullName).localeCompare(value(b.row.fullName)));
      setRows(next);
    }catch(err){console.error("Teacher Students load:",err);setRows([]);setFeedback("Unable to open students in your assigned classes.");}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();/* eslint-disable-next-line react-hooks/exhaustive-deps */},[access.ready,access.permitted,access.teacherId,access.accountId,access.schoolId,access.branchId,classScopeKey,revision]);
  const photoFor=(row:Student):string|undefined=>{
    const raw=photoMedia[asId(row.id)]?.photo||value((row as any).photo);
    return raw||undefined; // blob: URLs are valid offline images; don't discard them.
  };
  const classOptions=useMemo(()=>[...new Map(rows.map(r=>[r.classId,r.className])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[rows]);
  const shown=useMemo(()=>rows.filter(item=>{
    if(filterClass!=="all"&&item.classId!==filterClass)return false;
    if(filterGender!=="all"&&studentGender(item.row)!==filterGender)return false;
    const q=search.toLowerCase().trim();
    return !q||`${item.row.fullName||""} ${(item.row as any).admissionNumber||""} ${item.className} ${(item.row as any).parentPhone||""}`.toLowerCase().includes(q);
  }),[rows,filterClass,filterGender,search]);
  useRegisterBranchWorkspaceToolbar("teacherStudents",{search:setSearch,filter:()=>setFilterOpen(true),more:()=>setMoreOpen(true)});

  const startEdit=(item:StudentView)=>{
    const r:any=item.row;
    setSelected(item);setFeedback("");setStagedPhoto(null);
    mediaSession.current=createMediaSessionKey(MediaOwners.STUDENTS);
    setForm({fullName:value(r.fullName),gender:studentGender(item.row),dateOfBirth:value(r.dateOfBirth).slice(0,10),age:value(r.age),parentName:value(r.parentName),parentPhone:value(r.parentPhone),parentEmail:value(r.parentEmail),address:value(r.address)});
  };
  const closeEdit=()=>{if(!saving){setSelected(null);setStagedPhoto(null);}};
  const choosePhoto=async(file?:File)=>{
    if(!file||!selected)return;
    if(!file.type.startsWith("image/")){setFeedback("Choose an image file.");return;}
    try{
      const item=await saveImageAsset(file,{accountId:access.accountId,schoolId:access.schoolId,branchId:access.branchId,ownerTable:MediaOwners.STUDENTS,ownerId:undefined,ownerTempKey:mediaSession.current,fieldKey:MediaFieldKeys.PHOTO,variant:"avatar",replaceExisting:true});
      if(!item.assetId)throw new Error("Photo could not be staged.");
      setStagedPhoto({assetId:asId(item.assetId),previewUrl:item.previewUrl});
    }catch(error){setFeedback(error instanceof Error?error.message:"Photo upload failed.");}
  };
  const save=async(event?:React.FormEvent)=>{
    event?.preventDefault();
    if(!selected||!access.permitted||saving)return;
    const name=form.fullName.trim();if(!name){setFeedback("Student name is required.");return;}
    const age=form.age.trim()===""?undefined:Number(form.age);
    if(age!==undefined&&(!Number.isFinite(age)||age<0||age>130)){setFeedback("Enter a valid age.");return;}
    const sid=asId(selected.row.id);
    setSaving(true);
    try{
      if(!await verifyTeacherStudentAssignment(access,sid))throw new Error("This student is no longer assigned to one of your classes.");
      const existing=await db.students.get(sid);
      if(!existing || !idsEqual(existing.accountId,access.accountId) || !idsEqual(existing.schoolId,access.schoolId) || !idsEqual(existing.branchId,access.branchId) || (existing as any).isDeleted)throw new Error("Student record is no longer available.");
      // Whitelist only these fields; never spread the form or student record.
      // Preserve unmodified legacy 'sex' / 'gender' data; save canonical gender
      // only when the teacher actually selects a different value.
      const genderChanged=form.gender!==studentGender(existing);
      const update:Partial<Student>={
        fullName:name, dateOfBirth:form.dateOfBirth||undefined,age,
        parentName:form.parentName.trim()||undefined,
        parentPhone:form.parentPhone.trim()||undefined,
        parentEmail:form.parentEmail.trim()||undefined,
        address:form.address.trim()||undefined,
        ...(genderChanged?{gender:form.gender||undefined}:{}),
      };
      await updateLocal("students",sid,update);
      if(stagedPhoto?.assetId){
        const committed=await commitMediaAssetsToOwner({accountId:access.accountId,ownerTable:MediaOwners.STUDENTS,ownerId:sid,ownerTempKey:mediaSession.current,assets:[{assetId:stagedPhoto.assetId,fieldKey:MediaFieldKeys.PHOTO}]});
        const assetId=committed.find(r=>r.fieldKey===MediaFieldKeys.PHOTO)?.assetId;
        if(assetId)await updateLocal("students",sid,{photoMediaId:assetId} as Partial<Student>);
      }
      setSelected(null);setStagedPhoto(null);setFeedback("Student details saved.");await load();
    }catch(error){console.error("Teacher Student save:",error);setFeedback(error instanceof Error?error.message:"Could not save student.");}
    finally{setSaving(false);}
  };

  return <main className="ba-page students-page teacher-students-page" style={{"--ba-primary":primary,"--ba-primary-text":readableTextColor(primary)} as React.CSSProperties}>
    <style>{css}</style>
    {feedback&&<section className="ba-toast info" role="status">{feedback}<button type="button" onClick={()=>setFeedback("")} aria-label="Dismiss message">✕</button></section>}
    {!access.ready||busy?<div className="teacher-loading">Loading assigned students…</div>:!access.permitted?<section className="ba-state"><h2>Teacher workspace required</h2><p>Select your teacher role to view assigned students.</p></section>:<>
      {view==="cards"&&<section className="ba-list">{shown.map(item=><button key={asId(item.row.id)} type="button" className="student-row" onClick={()=>startEdit(item)} aria-label={`Edit ${value(item.row.fullName)}`}>
        <Avatar name={value(item.row.fullName)} photo={photoFor(item.row)} primary={primary}/>
        <span className="student-main"><strong>{item.row.fullName||"Unnamed student"}</strong><small>{item.className}{(item.row as any).admissionNumber?` · ${(item.row as any).admissionNumber}`:""}</small><em>{(item.row as any).parentPhone?`Parent: ${(item.row as any).parentPhone}`:(item.row as any).parentName?`Parent: ${(item.row as any).parentName}`:item.organizationName}</em></span>
        <span className="student-side"><StatusDot row={item.row}/><i aria-hidden="true">✎</i></span>
      </button>)}</section>}
      {view==="table"&&<section className="ba-table-card"><div className="ba-table-scroll"><table><thead><tr><th>Students ({shown.length})</th><th>Admission No.</th><th>Class</th><th>Organization</th><th>Gender</th><th>Age</th><th>Parent</th><th>Phone</th><th>Enrollments</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
        {shown.map(item=><tr key={asId(item.row.id)}><td><div className="ba-table-person"><Avatar name={value(item.row.fullName)} photo={photoFor(item.row)} primary="var(--ba-primary,#64748b)"/><div><strong>{item.row.fullName}</strong><span>{(item.row as any).address||""}</span></div></div></td><td>{(item.row as any).admissionNumber||"—"}</td><td>{item.className}</td><td>{item.organizationName}</td><td>{studentGender(item.row)||"—"}</td><td>{(item.row as any).age??"—"}</td><td>{(item.row as any).parentName||"—"}</td><td>{(item.row as any).parentPhone||"—"}</td><td>{item.enrollmentCount}</td><td><span className={`ba-chip ${statusTone(item.row)}`}>{studentStatus(item.row)}</span></td><td>{formatDate((item.row as any).updatedAt||(item.row as any).createdAt)}</td><td><div className="ba-table-actions"><button type="button" onClick={()=>startEdit(item)}>Edit</button></div></td></tr>)}
      </tbody></table>{!shown.length&&<div className="ba-empty-table">No student matches your filters.</div>}</div></section>}
      {!shown.length&&view==="cards"&&<section className="ba-state"><h2>No students found</h2><p>No assigned students match your current filters.</p></section>}
    </>}
    {filterOpen&&<ScopedDialog type="sheet" primary={primary} onClose={()=>setFilterOpen(false)}><section className="ba-sheet small" role="dialog" aria-modal="true" aria-label="Student filters" onPointerDown={e=>e.stopPropagation()}><div className="ba-sheet-head"><div><h2>Filters</h2><p>Find students in your assigned classes.</p></div><button className="ba-modal-close" type="button" onClick={()=>setFilterOpen(false)} aria-label="Close filters">✕</button></div>
      <div className="ba-form two"><label><span>Search</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or admission number"/></label><label><span>Class</span><select value={filterClass} onChange={e=>setFilterClass(e.target.value)}><option value="all">All assigned classes</option>{classOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><label><span>Gender</span><select value={filterGender} onChange={e=>setFilterGender(e.target.value)}><option value="all">All genders</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></label></div>
      <div className="ba-sheet-actions"><button type="button" onClick={()=>{setFilterClass("all");setFilterGender("all");setSearch("");}}>Clear</button><button type="button" className="primary" onClick={()=>setFilterOpen(false)}>Apply</button></div>
    </section></ScopedDialog>}
    {moreOpen&&<ScopedDialog type="sheet" primary={primary} onClose={()=>setMoreOpen(false)}><section className="ba-sheet small" role="dialog" aria-modal="true" aria-label="Student display" onPointerDown={e=>e.stopPropagation()}><div className="ba-sheet-head"><div><h2>More</h2><p>Choose a student display.</p></div><button className="ba-modal-close" type="button" aria-label="Close More" onClick={()=>setMoreOpen(false)}>✕</button></div><div className="ba-menu-list">
      <button type="button" className={view==="cards"?"active":""} onClick={()=>{setView("cards");setMoreOpen(false);}}><span>☰</span><b>List view</b><small>Compact student cards</small></button>
      <button type="button" className={view==="table"?"active":""} onClick={()=>{setView("table");setMoreOpen(false);}}><span>☷</span><b>Table view</b><small>Dense records for laptop work</small></button>
      <button type="button" onClick={()=>{setMoreOpen(false);void load();}}><span>↻</span><b>Refresh</b><small>Reload assigned students</small></button>
    </div></section></ScopedDialog>}
    {selected&&<ScopedDialog primary={primary} onClose={closeEdit}><form className="ba-modal" role="dialog" aria-modal="true" aria-label="Edit student" onSubmit={save} onPointerDown={e=>e.stopPropagation()}><div className="ba-modal-head"><div><h2>Edit Student</h2><p>{(selected.row as any).admissionNumber||"No admission number"} · {selected.className}</p></div><button type="button" className="ba-modal-close" disabled={saving} onClick={closeEdit} aria-label="Close student editor">✕</button></div>
      <section className="ba-form-section"><h3>Student</h3><div className="ba-form"><label><span>Full Name</span><input autoFocus value={form.fullName} onChange={e=>setForm(f=>({...f,fullName:e.target.value}))} required/></label><label><span>Gender</span><select value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>{form.gender&&!(["Male","Female","Other"].includes(form.gender))&&<option value={form.gender}>{form.gender} (existing)</option>}</select></label><label><span>Date of Birth</span><input type="date" value={form.dateOfBirth} onChange={e=>setForm(f=>({...f,dateOfBirth:e.target.value}))}/></label><label><span>Age</span><input type="number" min="0" max="130" value={form.age} onChange={e=>setForm(f=>({...f,age:e.target.value}))}/></label></div></section>
      <section className="ba-form-section"><h3>Parent / Guardian</h3><div className="ba-form"><label><span>Parent / Guardian Name</span><input value={form.parentName} onChange={e=>setForm(f=>({...f,parentName:e.target.value}))}/></label><label><span>Parent Phone</span><input value={form.parentPhone} onChange={e=>setForm(f=>({...f,parentPhone:e.target.value}))}/></label><label><span>Parent Email</span><input type="email" value={form.parentEmail} onChange={e=>setForm(f=>({...f,parentEmail:e.target.value}))}/></label><label className="wide"><span>Address</span><textarea value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></label></div></section>
      <section className="ba-form-section"><h3>Media</h3><div className="ba-media-section"><Avatar name={form.fullName} photo={stagedPhoto?.previewUrl||photoFor(selected.row)} primary={primary}/><label className="ba-media-button secondary">Upload photo<input type="file" accept="image/*" disabled={saving} onChange={e=>void choosePhoto(e.target.files?.[0])}/></label></div></section>
      <section className="ba-form-section"><div className="ba-school-managed"><strong>School-managed fields</strong><p>Admission number: {(selected.row as any).admissionNumber||"—"} · Class: {selected.className}. Enrollment, class assignment, organization, and student status cannot be edited by teachers.</p></div></section>
      <div className="ba-modal-actions"><button type="button" disabled={saving} onClick={closeEdit}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div>
    </form></ScopedDialog>}
  </main>;
}

const css = `
@keyframes  spin { to { transform: rotate(360deg); } }
.teacher-students-page{
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}
.teacher-students-page *,
.teacher-students-page *::before,
.teacher-students-page *::after{
  box-sizing: border-box;
  min-width: 0;
}
.teacher-students-page button,
.teacher-students-page input,
.teacher-students-page select,
.teacher-students-page textarea{
  font: inherit;
  max-width: 100%;
}
.teacher-students-page button{
  -webkit-tap-highlight-color: transparent;
}
.teacher-students-page input,
.teacher-students-page select,
.teacher-students-page textarea{
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}
.teacher-students-page input:focus,
.teacher-students-page select:focus,
.teacher-students-page textarea:focus{
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}
:where(.teacher-students-page) .ba-state,
:where(.teacher-students-page) .ba-table-card,
:where(.teacher-students-page) .ba-empty,
.teacher-students-overlay .ba-sheet,
.teacher-students-overlay .ba-modal,
:where(.teacher-students-page) .student-row{
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}
:where(.teacher-students-page) .ba-state{
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}
:where(.teacher-students-page) .ba-spinner{
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}
:where(.teacher-students-page) .ba-state h2{
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}
:where(.teacher-students-page) .ba-state p{
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}
:where(.teacher-students-page) .ba-state-button{
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--ba-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
:where(.teacher-students-page) .ba-toast{
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}
:where(.teacher-students-page) .ba-toast.success{ background: rgba(34,197,94,.14); color: #166534; }
:where(.teacher-students-page) .ba-toast.error{ background: rgba(239,68,68,.12); color: #991b1b; }
:where(.teacher-students-page) .ba-toast.info{ background: rgba(59,130,246,.13); color: #1d4ed8; }
:where(.teacher-students-page) .ba-toast button{
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}
:where(.teacher-students-page) .ba-list{
  display: grid;
  gap: 7px;
  margin-top: 10px;
}
:where(.teacher-students-page) .student-row{
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}
:where(.teacher-students-page) .student-row:hover{
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}
:where(.teacher-students-page) .ba-avatar{
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}
:where(.teacher-students-page) .student-main,
:where(.teacher-students-page) .student-main strong,
:where(.teacher-students-page) .student-main small,
:where(.teacher-students-page) .student-main em{
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:where(.teacher-students-page) .student-main strong{
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}
:where(.teacher-students-page) .student-main small{
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}
:where(.teacher-students-page) .student-main em{
  margin-top: 3px;
  color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827));
  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}
:where(.teacher-students-page) .student-side{
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}
:where(.teacher-students-page) .student-side i{
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}
:where(.teacher-students-page) .ba-chip{
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}
:where(.teacher-students-page) .ba-chip.green{ background: rgba(34,197,94,.12); color: #16a34a; }
:where(.teacher-students-page) .ba-chip.red{ background: rgba(239,68,68,.12); color: #dc2626; }
:where(.teacher-students-page) .ba-chip.blue{ background: rgba(59,130,246,.12); color: #2563eb; }
:where(.teacher-students-page) .ba-chip.gray{ background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
:where(.teacher-students-page) .ba-chip.orange{ background: rgba(245,158,11,.14); color: #b45309; }
:where(.teacher-students-page) .ba-chip.purple{ background: rgba(147,51,234,.12); color: #7e22ce; }
:where(.teacher-students-page) .status-dot-mini{
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
}
:where(.teacher-students-page) .status-dot-mini.green{ background: #22c55e; }
:where(.teacher-students-page) .status-dot-mini.red{ background: #ef4444; }
:where(.teacher-students-page) .status-dot-mini.blue{ background: #3b82f6; }
:where(.teacher-students-page) .status-dot-mini.orange{ background: #f59e0b; }
:where(.teacher-students-page) .status-dot-mini.gray{ background: var(--muted,#64748b); }
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}
.teacher-students-overlay .ba-sheet{
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}
.teacher-students-overlay .ba-sheet.small{
  width: min(520px, 100%);
}
@keyframes  sheetIn {
  from { transform: translateY(16px); opacity: .7; }
  to { transform: translateY(0); opacity: 1; }
}
.teacher-students-overlay .ba-sheet-head,
.teacher-students-overlay .ba-sheet-profile{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}
.teacher-students-overlay .ba-sheet-head h2,
.teacher-students-overlay .ba-sheet-profile h2,
.teacher-students-overlay .ba-modal-head h2{
  margin: 0;
  color: var(--text,#111827);
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}
.teacher-students-overlay .ba-sheet-head p,
.teacher-students-overlay .ba-sheet-profile p,
.teacher-students-overlay .ba-modal-head p{
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}
.teacher-students-overlay .ba-sheet-head button,
.teacher-students-overlay .ba-sheet-profile button,
.teacher-students-overlay .ba-modal-head button{
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}
.teacher-students-overlay .ba-sheet-actions,
.teacher-students-overlay .ba-modal-actions{
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}
.teacher-students-overlay .ba-sheet-actions button,
.teacher-students-overlay .ba-modal-actions button{
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.teacher-students-overlay .ba-sheet-actions button.primary,
.teacher-students-overlay .ba-modal-actions button:last-child{
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}
.teacher-students-overlay .ba-modal-actions button:disabled{
  opacity: .65;
  cursor: not-allowed;
}
.teacher-students-overlay .ba-menu-list{
  display: grid;
  gap: 8px;
}
.teacher-students-overlay .ba-menu-list button{
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}
.teacher-students-overlay .ba-menu-list button span{
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}
.teacher-students-overlay .ba-menu-list button b,
.teacher-students-overlay .ba-menu-list button small{
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teacher-students-overlay .ba-menu-list button b{
  font-size: 13px;
  font-weight: 1000;
}
.teacher-students-overlay .ba-menu-list button small{
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}
.teacher-students-overlay .ba-menu-list button.active{
  border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff));
}
.teacher-students-overlay .ba-menu-list button.danger span{
  background: color-mix(in srgb, #dc2626 10%, transparent);
  color: #dc2626;
}
.teacher-students-overlay .ba-menu-list button.danger b{
  color: #991b1b;
}
.teacher-students-overlay .student-detail-strip{
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 7px;
  margin-bottom: 10px;
}
.teacher-students-overlay .student-detail-strip span{
  display: block;
  padding: 9px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teacher-students-overlay .student-detail-strip b{
  display: block;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.teacher-students-overlay .ba-form{
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}
.teacher-students-overlay .ba-form.two{
  grid-template-columns: minmax(0,1fr);
}
.teacher-students-overlay .ba-form.compact{
  gap: 9px;
}
.teacher-students-overlay .ba-form label{
  display: grid;
  gap: 6px;
  min-width: 0;
}
.teacher-students-overlay .ba-form span{
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.teacher-students-overlay .ba-form .wide{
  grid-column: 1 / -1;
}
.teacher-students-overlay .ba-form-section{
  padding: 12px 0;
  border-top: 1px solid var(--border,rgba(0,0,0,.08));
}
.teacher-students-overlay .ba-form-section:first-of-type{
  border-top: 0;
  padding-top: 0;
}
.teacher-students-overlay .ba-form-section h3{
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.03em;
}
.teacher-students-page input[type="file"]{
  padding: 10px;
  font-size: 12px;
}
.teacher-students-page textarea{
  min-height: 92px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}
.teacher-students-overlay .ba-media-button{
  width: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--ba-primary);
  color: #fff !important;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0 !important;
  text-transform: none !important;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ba-primary) 18%, transparent);
  transition: transform .18s var(--ease), background .18s var(--ease), border-color .18s var(--ease), box-shadow .18s var(--ease), filter .18s var(--ease);
}
.teacher-students-overlay .ba-media-button.secondary{
  background: var(--surface, #fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}
.teacher-students-overlay .ba-media-button input{
  display: none;
}
.teacher-students-overlay .ba-preview-photo{
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}
.teacher-students-overlay .ba-modal{
  width: min(980px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}
.teacher-students-overlay .ba-modal-head{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}
:where(.teacher-students-page) .ba-table-card,
:where(.teacher-students-page) .ba-empty{
  padding: 13px;
  border-radius: 24px;
}
:where(.teacher-students-page) .ba-empty{
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}
:where(.teacher-students-page) .ba-empty-icon{
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}
:where(.teacher-students-page) .ba-empty h3{
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}
:where(.teacher-students-page) .ba-empty p{
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}
:where(.teacher-students-page) .ba-table-card{
  margin-top: 10px;
}
:where(.teacher-students-page) .ba-table-scroll{
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}
:where(.teacher-students-page) .ba-table-scroll table{
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}
:where(.teacher-students-page) .ba-table-scroll th,
:where(.teacher-students-page) .ba-table-scroll td{
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}
:where(.teacher-students-page) .ba-table-scroll th{
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}
:where(.teacher-students-page) .ba-table-scroll td strong,
:where(.teacher-students-page) .ba-table-scroll td span{
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:where(.teacher-students-page) .ba-table-scroll td span{
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 11px;
}
:where(.teacher-students-page) .ba-table-actions{
  display: flex;
  flex-wrap: nowrap;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
:where(.teacher-students-page) .ba-table-actions::-webkit-scrollbar{
  display: none;
}
:where(.teacher-students-page) .ba-table-actions button{
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 10px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}
:where(.teacher-students-page) .ba-table-actions button:first-child{
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}
:where(.teacher-students-page) .ba-table-actions button.ba-delete{
  color: #991b1b;
  background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff));
  border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)));
}
:where(.teacher-students-page) .ba-empty-table{
  padding: 22px;
  text-align: center;
  color: var(--muted,#64748b);
  font-weight: 850;
}
@media  (min-width: 680px) {
.teacher-students-page{
    padding: calc(12px * var(--local-density-scale,1));
    padding-bottom: 44px;
  }
:where(.teacher-students-page) .ba-list{
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
:where(.teacher-students-page) .student-row{
    border-radius: 24px;
    padding: 12px;
  }
.teacher-students-overlay .ba-form{
    grid-template-columns: repeat(2, minmax(0,1fr));
  }
.teacher-students-overlay .ba-form.two{
    grid-template-columns: repeat(2, minmax(0,1fr));
  }
.teacher-students-overlay.ba-modal-backdrop,
.teacher-students-overlay.ba-sheet-backdrop{
    place-items: center;
    padding: 18px;
  }
.teacher-students-overlay .ba-sheet{
    border-radius: 28px;
    padding: 18px;
  }
.teacher-students-overlay .ba-modal{
    padding: 18px;
  }
}
@media  (min-width: 1040px) {
.teacher-students-page{
    padding: calc(16px * var(--local-density-scale,1));
    padding-bottom: 48px;
  }
:where(.teacher-students-page) .ba-list,
:where(.teacher-students-page) .ba-table-card{
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }
:where(.teacher-students-page) .ba-list{
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
.teacher-students-overlay .ba-form{
    grid-template-columns: repeat(3, minmax(0,1fr));
  }
.teacher-students-overlay .ba-form.two{
    grid-template-columns: repeat(2, minmax(0,1fr));
  }
}
@media  (max-width: 520px) {
.teacher-students-page{
    padding: calc(7px * var(--local-density-scale,1));
    padding-bottom: max(38px, env(safe-area-inset-bottom));
  }
.teacher-students-overlay .student-detail-strip{
    grid-template-columns: minmax(0,1fr);
  }
.teacher-students-overlay .ba-sheet,
.teacher-students-overlay .ba-modal{
    border-radius: 24px 24px 18px 18px;
    padding: 12px;
  }
.teacher-students-overlay .ba-sheet-actions,
.teacher-students-overlay .ba-modal-actions{
    display: grid;
    grid-template-columns: minmax(0,1fr);
  }
.teacher-students-overlay .ba-sheet-actions button,
.teacher-students-overlay .ba-modal-actions button{
    width: 100%;
  }
}
.teacher-students-overlay .ba-media-button{
  min-height: 40px;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}
.teacher-students-overlay .ba-media-button.secondary{
  background: var(--surface, #fff);
  color: var(--ba-primary);
  box-shadow: none;
}
@media  (max-width: 520px) {
.teacher-students-overlay .ba-media-button{
    width: 100%;
  }
}
.teacher-students-page .settings-save-button{
  width: 42px;
  min-width: 42px;
  padding: 0;
  font-size: 25px;
  letter-spacing: 0;
}
.teacher-students-overlay .ba-modal-actions button:last-child,
.teacher-students-overlay .ba-sheet-actions .primary,
.teacher-students-page .ba-state-button,
.teacher-students-overlay .ba-media-button:not(.secondary){
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff !important;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}
.teacher-students-overlay .ba-media-button.secondary{
  border-color: var(--ba-primary);
  background: var(--surface,#fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}
.teacher-students-page .ba-cancel-button,
.teacher-students-overlay .ba-modal-actions button:not(:last-child),
.teacher-students-overlay .ba-sheet-actions button:not(.primary){
  border-color: var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted,#64748b) 8%, var(--surface,#fff));
  color: var(--text,#111827) !important;
  box-shadow: none;
}
.teacher-students-overlay .ba-modal-actions button:last-child:hover,
.teacher-students-overlay .ba-sheet-actions .primary:hover,
.teacher-students-page .ba-state-button:hover,
.teacher-students-overlay .ba-media-button:not(.secondary):hover{
  filter: brightness(.96);
  transform: translateY(-1px);
}
.teacher-students-overlay .ba-media-button.secondary:hover{
  background: color-mix(in srgb, var(--ba-primary) 7%, var(--surface,#fff));
  transform: translateY(-1px);
}
.teacher-students-overlay .ba-media-button:focus-visible,
.teacher-students-overlay .ba-modal-actions button:focus-visible,
.teacher-students-overlay .ba-sheet-actions button:focus-visible{
  outline: 3px solid color-mix(in srgb, var(--ba-primary) 28%, transparent);
  outline-offset: 2px;
}
.teacher-students-page button:disabled,
.teacher-students-overlay .ba-media-button[aria-disabled="true"]{
  cursor: not-allowed;
  opacity: .58;
  transform: none !important;
  filter: none !important;
  box-shadow: none !important;
}
.teacher-students-page .ba-search:focus-within{
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}
.teacher-students-page .student-row{
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--ba-primary) 15%, var(--border, rgba(0,0,0,.10)));
}
.teacher-students-page .student-row::before{
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--ba-primary);
  opacity: .78;
}
.teacher-students-page .student-row:hover,
.teacher-students-page .student-row:focus-within{
  border-color: color-mix(in srgb, var(--ba-primary) 46%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 5%, var(--card-bg, var(--surface, #fff)));
  box-shadow: 0 14px 30px color-mix(in srgb, var(--ba-primary) 10%, transparent);
}
.teacher-students-page .ba-avatar{
  border: 1px solid color-mix(in srgb, var(--ba-primary) 42%, transparent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}
.teacher-students-page .ba-chip.blue,
.teacher-students-page .ba-chip.purple{
  border-color: color-mix(in srgb, var(--ba-primary) 30%, transparent);
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--card-bg, var(--surface, #fff)));
  color: var(--ba-primary);
}
.teacher-students-page .ba-table-scroll th{
  background: color-mix(in srgb, var(--ba-primary) 9%, var(--table-head, var(--card-bg, #fff)));
  color: var(--text, #111827);
}
@media  (max-width: 640px) {
.teacher-students-overlay .ba-section-heading-row .ba-media-button{
    width: 100%;
  }
}
.teacher-students-overlay .ba-field-hint{
  display: block;
  margin-top: 6px;
  color: var(--muted, #64748b);
  font-size: .74rem;
  line-height: 1.4;
  font-weight: 650;
}
.teacher-students-page select:disabled,
.teacher-students-page input:disabled{
  opacity: .68;
  cursor: not-allowed;
  background: color-mix(in srgb, var(--surface, #fff) 86%, var(--border, rgba(0,0,0,.10)));
}
.teacher-students-overlay .ba-inline-info{
  align-self: stretch;
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--ba-primary) 22%, var(--border, rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 7%, var(--card-bg, var(--surface, #fff)));
}
.teacher-students-overlay .ba-inline-info b{
  font-size: .8rem;
  color: var(--text, #111827);
}
.teacher-students-overlay .ba-inline-info span{
  color: var(--muted, #64748b);
  font-size: .73rem;
  line-height: 1.45;
}
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
  --ba-card: var(--card-bg, var(--surface, #ffffff));
  --ba-text: var(--text, var(--foreground, #111827));
  --ba-muted: var(--muted, var(--muted-foreground, #64748b));
  --ba-border: var(--border, rgba(15, 23, 42, .12));

  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  min-width: 100vw !important;
  min-height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  z-index: 2147482000 !important;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  box-sizing: border-box !important;
  padding:
    max(10px, env(safe-area-inset-top, 0px))
    10px
    max(10px, env(safe-area-inset-bottom, 0px)) !important;
  overflow: hidden !important;

  background: rgba(2, 6, 23, .68) !important;
  -webkit-backdrop-filter: blur(11px) saturate(.9);
  backdrop-filter: blur(11px) saturate(.9);
}
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet{
  position: relative;
  width: min(760px, calc(100vw - 20px)) !important;
  max-width: calc(100vw - 20px) !important;
  max-height: calc(100dvh - 20px) !important;
  min-height: 0 !important;
  margin: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-padding-bottom: 90px;
  border: 1px solid var(--ba-border) !important;
  border-radius: 24px !important;
  background: var(--ba-card) !important;
  color: var(--ba-text) !important;
  box-shadow: 0 28px 90px rgba(2, 6, 23, .34) !important;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet.small{
  width: min(520px, calc(100vw - 20px)) !important;
}
.teacher-students-overlay.ba-modal-backdrop .ba-modal{
  position: relative;
  width: min(980px, calc(100vw - 20px)) !important;
  max-width: calc(100vw - 20px) !important;
  max-height: calc(100dvh - 20px) !important;
  min-height: 0 !important;
  margin: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-padding-bottom: 96px;
  border: 1px solid var(--ba-border) !important;
  border-radius: 24px !important;
  background: var(--ba-card) !important;
  color: var(--ba-text) !important;
  box-shadow: 0 28px 90px rgba(2, 6, 23, .36) !important;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head{
  position: sticky;
  top: -14px;
  z-index: 8;
  margin: -14px -14px 12px;
  padding: 14px;
  border-bottom: 1px solid var(--ba-border);
  background: var(--ba-card);
}
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head h2,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile h2,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head h2,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head p,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile p,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head p{
  color: inherit;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-modal-close,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-close{
  position: relative;
  z-index: 10;
  flex: 0 0 auto;
  width: 44px !important;
  min-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
  display: grid !important;
  place-items: center !important;
  padding: 0 !important;
  border: 1px solid var(--ba-border) !important;
  border-radius: 999px !important;
  background: color-mix(in srgb, var(--ba-text) 6%, var(--ba-card)) !important;
  color: var(--ba-text) !important;
  box-shadow: none !important;
  opacity: 1 !important;
  font-size: 20px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  cursor: pointer;
  pointer-events: auto !important;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-modal-close:hover,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-close:hover{
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--ba-card)) !important;
  border-color: color-mix(in srgb, var(--ba-primary) 38%, var(--ba-border)) !important;
}
.teacher-students-overlay.ba-sheet-backdrop input,
.teacher-students-overlay.ba-sheet-backdrop select,
.teacher-students-overlay.ba-sheet-backdrop textarea,
.teacher-students-overlay.ba-modal-backdrop input,
.teacher-students-overlay.ba-modal-backdrop select,
.teacher-students-overlay.ba-modal-backdrop textarea{
  background: var(--input-bg, var(--ba-card)) !important;
  color: var(--input-text, var(--ba-text)) !important;
  border-color: var(--input-border, var(--ba-border)) !important;
}
.teacher-students-overlay.ba-sheet-backdrop select option,
.teacher-students-overlay.ba-modal-backdrop select option{
  background: var(--ba-card);
  color: var(--ba-text);
}
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-actions,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-actions{
  position: sticky !important;
  bottom: -14px !important;
  z-index: 7;
  margin: 14px -14px -14px !important;
  padding: 12px 14px 14px !important;
  border-top: 1px solid var(--ba-border);
  background: var(--ba-card) !important;
}
@media  (prefers-color-scheme: dark) {
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
    background: rgba(2, 6, 23, .80) !important;
  }
}
@media  (max-width: 520px) {
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
    padding:
      max(8px, env(safe-area-inset-top, 0px))
      8px
      max(8px, env(safe-area-inset-bottom, 0px)) !important;
  }
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet,
.teacher-students-overlay.ba-modal-backdrop .ba-modal{
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
    border-radius: 20px !important;
  }
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head{
    top: -12px;
    margin: -12px -12px 12px;
    padding: 12px;
  }
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-actions,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-actions{
    bottom: -12px !important;
    margin: 12px -12px -12px !important;
    padding: 10px 12px 12px !important;
  }
}
.teacher-students-page{
  --excel-surface: var(--card-bg, var(--surface, #fff));
  --excel-surface-2: var(--surface-2, color-mix(in srgb, var(--excel-surface) 93%, var(--text, #111827) 7%));
  --excel-text: var(--text, #111827);
  --excel-muted: var(--muted, color-mix(in srgb, var(--excel-text) 62%, transparent));
  --excel-border: var(--border, color-mix(in srgb, var(--excel-text) 14%, transparent));
  --excel-soft: color-mix(in srgb, var(--excel-text) 5%, transparent);
}
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
  background: rgba(2, 6, 23, .66) !important;
  -webkit-backdrop-filter: blur(12px) saturate(.9) !important;
  backdrop-filter: blur(12px) saturate(.9) !important;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-modal-close,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-close,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head > button,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile > button,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head > button{
  position: relative !important;
  z-index: 20 !important;
  width: 42px !important;
  min-width: 42px !important;
  height: 42px !important;
  min-height: 42px !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  border: 1px solid rgba(15, 23, 42, .20) !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #111827 !important;
  opacity: 1 !important;
  visibility: visible !important;
  box-shadow: 0 5px 16px rgba(15, 23, 42, .16) !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  pointer-events: auto !important;
}
.teacher-students-overlay.ba-sheet-backdrop .ba-modal-close:hover,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-close:hover,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head > button:hover,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile > button:hover,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head > button:hover{
  border-color: color-mix(in srgb, var(--ba-primary, #2563eb) 42%, rgba(15, 23, 42, .20)) !important;
  background: color-mix(in srgb, var(--ba-primary, #2563eb) 8%, #ffffff) !important;
  color: #111827 !important;
}
@media  (prefers-color-scheme: dark) {
.teacher-students-overlay.ba-sheet-backdrop,
.teacher-students-overlay.ba-modal-backdrop{
    background: rgba(2, 6, 23, .78) !important;
  }
.teacher-students-overlay.ba-sheet-backdrop .ba-modal-close,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-close,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-head > button,
.teacher-students-overlay.ba-sheet-backdrop .ba-sheet-profile > button,
.teacher-students-overlay.ba-modal-backdrop .ba-modal-head > button{
    border-color: rgba(255, 255, 255, .22) !important;
    background: #1f2937 !important;
    color: #ffffff !important;
    box-shadow: 0 5px 18px rgba(0, 0, 0, .36) !important;
  }
}
:where(.teacher-students-page) .ba-table-person{ display:flex; align-items:center; gap:9px; min-width:160px; }
:where(.teacher-students-page) .ba-table-person .ba-avatar{ width:32px; height:32px; font-size:12px; flex:0 0 32px; }
.teacher-students-page{ background: var(--bg, var(--background, #f2f4f7)); padding: 5px; min-height: 0; }
:where(.teacher-students-page) .ba-list{ gap: 9px; margin-top: 2px; }
:where(.teacher-students-page) .student-row,
:where(.teacher-students-page) .ba-table-card{
  background: color-mix(in srgb, var(--card-bg, var(--surface, #fff)) 93%, var(--text, #182235) 7%);
  border: 1px solid color-mix(in srgb, var(--border, #d4dae3) 85%, var(--text, #182235) 15%);
  box-shadow: none; border-radius: 13px; transition: border-color .12s ease;
}
:where(.teacher-students-page) .student-row:hover{ transform: none; box-shadow: none; }
:where(.teacher-students-page) .ba-table-card{ padding: 4px; margin-top: 2px; }
:where(.teacher-students-page) .ba-table-scroll{ border-radius: 10px; }
:where(.teacher-students-page) .ba-table-scroll table{ background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 95%, var(--text,#182235) 5%); }
:where(.teacher-students-page) .ba-table-scroll thead th{ position: sticky; top: 0; z-index: 2;
  background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 85%, var(--text,#182235) 15%); }
:where(.teacher-students-page) .ba-table-scroll tbody tr:nth-child(even){ background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 89%, var(--text,#182235) 11%); }
:where(.teacher-students-page) .ba-table-scroll td{ background: transparent; }
:where(.teacher-students-page) .ba-avatar{ box-shadow: none; border-radius: 12px; }
.teacher-students-page .student-row::before{ display: none; }
@media  (min-width: 1024px) {
:where(.teacher-students-page) .ba-list{ grid-template-columns: repeat(4,minmax(0,1fr)); }
}
@media  (max-width: 639px) {
.teacher-students-page{ padding: 3px; }
:where(.teacher-students-page) .student-row{ padding: 9px; }
}
@media  (prefers-reduced-motion: reduce) {
:where(.teacher-students-page) .student-row{ transition: none; }
}
.teacher-students-page{
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 5px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  overflow-x: clip;
}
.teacher-students-page .ba-list,
.teacher-students-page .ba-table-card{
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: none;
  margin-left: 0;
  margin-right: 0;
}
.teacher-students-page .ba-list{
  gap: 9px;
  margin-top: 2px;
  align-items: stretch;
}
.teacher-students-page .ba-list > .student-row{
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 9px 10px;
}
.teacher-students-page .ba-table-card{
  display: block;
  padding: 4px;
  margin-top: 2px;
  overflow: visible;
}
.teacher-students-page .ba-table-scroll{
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
}
.teacher-students-page .ba-table-scroll table{
  width: 100%;
  margin: 0;
}
.teacher-students-page .ba-table-scroll th,
.teacher-students-page .ba-table-scroll td{
  padding: 9px 10px;
}
@media  (min-width: 680px) and (max-width: 1023px) {
.teacher-students-page .ba-list{ grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media  (min-width: 1024px) {
.teacher-students-page .ba-list{ grid-template-columns: repeat(4, minmax(0,1fr)); }
}
@media  (max-width: 679px) {
.teacher-students-page .ba-list{ grid-template-columns: minmax(0,1fr); }
}
@media  (max-width: 639px) {
.teacher-students-page{
    padding: 3px;
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }
.teacher-students-page .ba-list{ gap: 7px; }
.teacher-students-page .ba-list > .student-row{ padding: 9px; }
.teacher-students-page .ba-table-scroll th,
.teacher-students-page .ba-table-scroll td{ padding: 8px 9px; }
}

/* Teacher-specific actions: original Branch Admin cards and tables retain the same
   surface, texture, spacing, typography, and responsive layout. */
.teacher-students-page .student-row:focus-visible,
.teacher-students-page .ba-table-actions button:focus-visible{outline:2px solid var(--ba-primary);outline-offset:2px}
.teacher-students-page .ba-table-actions button{min-width:58px}
.teacher-students-page .ba-table-person{min-width:160px}
.teacher-students-page .ba-page{max-width:none}
/* Keep the original Branch Admin automatic card height. */
.teacher-students-overlay{--ease:cubic-bezier(.2,.8,.2,1);font-family:var(--font-family,system-ui);font-size:var(--font-size,14px)}
.teacher-students-overlay *,.teacher-students-overlay *::before,.teacher-students-overlay *::after{box-sizing:border-box;min-width:0}
.teacher-students-overlay .ba-modal,.teacher-students-overlay .ba-sheet{color:var(--text,#111827);background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.1))}
.teacher-students-overlay .ba-modal-head,.teacher-students-overlay .ba-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.teacher-students-overlay .ba-modal-head h2,.teacher-students-overlay .ba-sheet-head h2{margin:0}
.teacher-students-overlay .ba-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.teacher-students-overlay .ba-form label,.teacher-students-overlay .ba-filter-field{display:grid;gap:6px;font-size:12px;font-weight:900}
.teacher-students-overlay .ba-form label>span,.teacher-students-overlay .ba-filter-field>span{color:var(--text,#111827)}
.teacher-students-overlay .ba-form input,.teacher-students-overlay .ba-form select,.teacher-students-overlay .ba-form textarea,
.teacher-students-overlay .ba-filter-field input,.teacher-students-overlay .ba-filter-field select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.1)));border-radius:14px;padding:8px 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));font:inherit;font-size:16px;outline:none}
.teacher-students-overlay .ba-form textarea{min-height:90px;resize:vertical}
.teacher-students-overlay .ba-form .wide{grid-column:1/-1}
.teacher-students-overlay .ba-media-section{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0 2px}
.teacher-students-overlay .ba-media-section .ba-avatar{width:70px;height:70px;flex:0 0 70px}
.teacher-students-overlay .ba-media-button{width:auto;position:relative;min-height:42px;cursor:pointer}
.teacher-students-overlay .ba-media-button input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;display:block}
.teacher-students-overlay .ba-school-managed{background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 91%,var(--text,#182235) 9%);border:1px solid var(--border,rgba(0,0,0,.1));border-radius:12px;padding:10px 12px;display:grid;gap:5px}
.teacher-students-overlay .ba-school-managed strong{font-size:12px}
.teacher-students-overlay .ba-school-managed p{font-size:12px;line-height:1.5;color:var(--muted,#64748b);margin:0}
.teacher-students-overlay .ba-modal-actions button:disabled,.teacher-students-overlay .ba-media-button:has(input:disabled){opacity:.55;pointer-events:none}
.teacher-students-overlay .ba-menu-list{margin-top:12px}
.teacher-students-overlay .ba-menu-list button.active{border-color:var(--ba-primary);background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,var(--surface,#fff)))}
.teacher-students-page .teacher-loading{padding:24px;text-align:center;color:var(--muted,#64748b)}
.teacher-students-page .ba-table-scroll{scrollbar-width:thin}
@media(max-width:580px){.teacher-students-overlay .ba-form{grid-template-columns:minmax(0,1fr)}.teacher-students-overlay .ba-modal,.teacher-students-overlay .ba-sheet{border-radius:16px!important}}
@media(prefers-reduced-motion:reduce){.teacher-students-page .student-row{transition:none}}

`;
