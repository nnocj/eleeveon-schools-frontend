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

export default function ReleaseBoard(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const releases=useLocalRecords<ReleaseItem>("eleeveon.platformTeam.releases",[]);const[form,setForm]=useState({version:"",title:"",status:"planning" as ReleaseItem["status"],targetDate:"",owner:"",notes:""});const rows=filterRows(releases.records,query,"all",["version","title","status","owner","notes"]);const add=()=>{if(!form.version.trim()||!form.title.trim())return;const now=new Date().toISOString();releases.add({id:makeId("rel"),...form,checklist:["Code reviewed","Build passes","QA completed","Migration checked","Rollback plan ready","Release notes written","Support team briefed"].map(label=>({label,done:false})),createdAt:now,updatedAt:now});setForm({...form,version:"",title:"",notes:""})};return <main className="pt-page"><PageHeader eyebrow="Release Board" title="Plan, test and publish safely" description="A staff-safe release board. It tracks readiness but does not run deployments or migrations."/><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Create release"/><div className="pt-form"><div className="pt-form-grid"><input className="pt-input" placeholder="Version e.g. 1.3.0" value={form.version} onChange={e=>setForm({...form,version:e.target.value})}/><select className="pt-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value as any})}><option value="planning">Planning</option><option value="testing">Testing</option><option value="ready">Ready</option><option value="released">Released</option><option value="blocked">Blocked</option></select><input className="pt-input" placeholder="Owner" value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})}/><input className="pt-input" type="date" value={form.targetDate} onChange={e=>setForm({...form,targetDate:e.target.value})}/></div><input className="pt-input" placeholder="Release title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="pt-textarea" placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><button className="pt-btn" onClick={add}>Create release</button></div></section><section className="pt-card half"><SectionTitle title="Release status"/><MiniBarChart rows={countBy(releases.records,r=>r.status)}/></section>{rows.map(r=><section className="pt-card" key={r.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge><Badge tone="blue">{r.version}</Badge></div><h3>{r.title}</h3><p>{r.notes||"No release notes yet."}</p><div className="pt-kv"><b>Owner</b><span>{r.owner||"Unassigned"}</span><b>Target</b><span>{dateText(r.targetDate)}</span><b>Ready</b><span>{r.checklist.filter(c=>c.done).length}/{r.checklist.length}</span></div><div className="pt-list" style={{marginTop:12}}>{r.checklist.map((c,i)=><button className="pt-row" key={c.label} onClick={()=>releases.update(x=>x.id===r.id,(old)=>({...old,checklist:old.checklist.map((item,idx)=>idx===i?{...item,done:!item.done}:item),updatedAt:new Date().toISOString()}))} type="button"><h3>{c.done?"✅":"⬜"} {c.label}</h3><Badge tone={c.done?"green":"gray"}>{c.done?"done":"pending"}</Badge></button>)}</div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"version",label:"Version"},{key:"title",label:"Title"},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge>},{key:"owner",label:"Owner"},{key:"targetDate",label:"Target",render:r=>dateText(r.targetDate)},{key:"checklist",label:"Readiness",render:r=>`${r.checklist.filter((c:any)=>c.done).length}/${r.checklist.length}`}]} />}{view==="focus"&&<section className="pt-card full"><SectionTitle title="Ready-to-release items"/><div className="pt-list">{rows.filter(r=>r.status==="ready"||r.checklist.every(c=>c.done)).map(r=><div className="pt-row" key={r.id}><div><h3>{r.version} — {r.title}</h3><p>{r.notes}</p></div><Badge tone="green">ready</Badge></div>)}</div></section>}</section></main>}
