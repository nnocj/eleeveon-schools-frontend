"use client";

import React, { useMemo, useState } from "react";
import {
  Badge,
  ClientAccount,
  DataTable,
  EmptyState,
  LoadingOrError,
  MetricCard,
  MiniBarChart,
  PageHeader,
  SectionTitle,
  SupportTicket,
  TeamWorkItem,
  Toolbar,
  ViewMode,
  WorkPriority,
  WorkStatus,
  BugReport,
  ReleaseItem,
  KnowledgeArticle,
  countBy,
  dateText,
  filterRows,
  makeId,
  money,
  timeText,
  toneFromStatus,
  useLocalRecords,
  usePlatformTeamApi,
} from "../components/PlatformTeamKit";

export default function MyWork() {
  const [view,setView]=useState<ViewMode>("cards"); const [query,setQuery]=useState(""); const [status,setStatus]=useState("all");
  const work=useLocalRecords<TeamWorkItem>("eleeveon.platformTeam.work",[]);
  const [form,setForm]=useState({title:"",description:"",area:"Support",priority:"normal" as WorkPriority,assignee:"",accountName:"",dueAt:""});
  const rows=filterRows(work.records,query,status,["title","description","area","priority","status","assignee","accountName"]);
  const add=()=>{ if(!form.title.trim()) return; const now=new Date().toISOString(); work.add({id:makeId("work"),title:form.title.trim(),description:form.description.trim(),area:form.area,status:"open",priority:form.priority,assignee:form.assignee.trim(),accountName:form.accountName.trim(),dueAt:form.dueAt,createdAt:now,updatedAt:now,source:"local",tags:[]}); setForm({...form,title:"",description:"",accountName:"",dueAt:""}); };
  const stats=countBy(work.records,r=>r.status);
  return <main className="pt-page"><PageHeader eyebrow="My Work" title="Assigned team work" description="Create, track, and close the operational work assigned to platform team members. Saved locally in the PWA so it still works offline." /><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Add work item" text="Use this for support follow-ups, QA tasks, customer calls, content tasks, and release work."/><div className="pt-form"><input className="pt-input" placeholder="Work title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="pt-textarea" placeholder="Describe what must be done" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><div className="pt-form-grid"><select className="pt-select" value={form.area} onChange={e=>setForm({...form,area:e.target.value})}>{["Support","Sync Help","Billing","QA","Release","Content","Design","Development"].map(x=><option key={x}>{x}</option>)}</select><select className="pt-select" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as WorkPriority})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><input className="pt-input" placeholder="Assignee" value={form.assignee} onChange={e=>setForm({...form,assignee:e.target.value})}/><input className="pt-input" placeholder="Client/account" value={form.accountName} onChange={e=>setForm({...form,accountName:e.target.value})}/><input className="pt-input" type="date" value={form.dueAt} onChange={e=>setForm({...form,dueAt:e.target.value})}/></div><button className="pt-btn" onClick={add} type="button">Add work item</button></div></section><section className="pt-card half"><SectionTitle title="Work status"/><MiniBarChart rows={stats}/></section>{rows.map(item=><section className="pt-card" key={item.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(item.priority)}>{item.priority}</Badge><Badge tone={toneFromStatus(item.status)}>{item.status}</Badge></div><h3>{item.title}</h3><p>{item.description||"No description"}</p><div className="pt-kv"><b>Area</b><span>{item.area}</span><b>Assignee</b><span>{item.assignee||"Unassigned"}</span><b>Client</b><span>{item.accountName||"General"}</span><b>Due</b><span>{dateText(item.dueAt)}</span></div><div className="pt-actions" style={{marginTop:12}}>{["open","in_progress","waiting","resolved","closed"].map(s=><button className="pt-btn secondary" key={s} onClick={()=>work.update(x=>x.id===item.id,{status:s as WorkStatus,updatedAt:new Date().toISOString()})} type="button">{s}</button>)}<button className="pt-btn danger" onClick={()=>work.remove(x=>x.id===item.id)} type="button">Remove</button></div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"title",label:"Title"},{key:"area",label:"Area"},{key:"assignee",label:"Assignee"},{key:"accountName",label:"Client"},{key:"priority",label:"Priority",render:r=><Badge tone={toneFromStatus(r.priority)}>{r.priority}</Badge>},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge>},{key:"dueAt",label:"Due",render:r=>dateText(r.dueAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Priority order" text="Recommended order for doing platform-team work."/><div className="pt-list">{rows.sort((a,b)=>({urgent:4,high:3,normal:2,low:1} as any)[b.priority]-({urgent:4,high:3,normal:2,low:1} as any)[a.priority]).map(r=><div className="pt-row" key={r.id}><div><h3>{r.title}</h3><p>{r.area} • {r.description}</p></div><Badge tone={toneFromStatus(r.priority)}>{r.priority}</Badge></div>)}</div></section>}</section></main>;
}
