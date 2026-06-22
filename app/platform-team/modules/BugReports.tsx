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

export default function BugReports(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const[status,setStatus]=useState("all");const bugs=useLocalRecords<BugReport>("eleeveon.platformTeam.bugs",[]);const[form,setForm]=useState({title:"",summary:"",severity:"medium" as BugReport["severity"],moduleKey:"",accountName:"",steps:"",expected:"",actual:""});const rows=filterRows(bugs.records,query,status,["title","summary","severity","status","moduleKey","accountName"]);const add=()=>{if(!form.title.trim())return;const now=new Date().toISOString();bugs.add({id:makeId("bug"),title:form.title,summary:form.summary,severity:form.severity,status:"open",moduleKey:form.moduleKey,accountName:form.accountName,steps:form.steps,expected:form.expected,actual:form.actual,createdAt:now,updatedAt:now});setForm({...form,title:"",summary:"",steps:"",expected:"",actual:""})};return <main className="pt-page"><PageHeader eyebrow="Bug Reports" title="Track product issues clearly" description="Record reproducible bugs with steps, expected result and actual result so development work is easier to complete."/><div className="pt-grid"><MetricCard label="Open bugs" value={bugs.records.filter(b=>b.status!=="closed"&&b.status!=="resolved").length} icon="🐞" tone="orange"/><MetricCard label="Critical" value={bugs.records.filter(b=>b.severity==="critical").length} icon="🚨" tone="red"/><MetricCard label="Resolved" value={bugs.records.filter(b=>b.status==="resolved"||b.status==="closed").length} icon="✅" tone="green"/></div><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="New bug report"/><div className="pt-form"><input className="pt-input" placeholder="Bug title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="pt-textarea" placeholder="Short summary" value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/><div className="pt-form-grid"><select className="pt-select" value={form.severity} onChange={e=>setForm({...form,severity:e.target.value as any})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select><input className="pt-input" placeholder="Module/page" value={form.moduleKey} onChange={e=>setForm({...form,moduleKey:e.target.value})}/><input className="pt-input" placeholder="Account affected" value={form.accountName} onChange={e=>setForm({...form,accountName:e.target.value})}/></div><textarea className="pt-textarea" placeholder="Steps to reproduce" value={form.steps} onChange={e=>setForm({...form,steps:e.target.value})}/><textarea className="pt-textarea" placeholder="Expected result" value={form.expected} onChange={e=>setForm({...form,expected:e.target.value})}/><textarea className="pt-textarea" placeholder="Actual result" value={form.actual} onChange={e=>setForm({...form,actual:e.target.value})}/><button className="pt-btn" onClick={add} type="button">Save bug report</button></div></section><section className="pt-card half"><SectionTitle title="Bugs by severity"/><MiniBarChart rows={countBy(bugs.records,b=>b.severity)}/></section>{rows.map(b=><section className="pt-card" key={b.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(b.severity)}>{b.severity}</Badge><Badge tone={toneFromStatus(b.status)}>{b.status}</Badge></div><h3>{b.title}</h3><p>{b.summary}</p><div className="pt-kv"><b>Module</b><span>{b.moduleKey||"—"}</span><b>Account</b><span>{b.accountName||"—"}</span><b>Updated</b><span>{timeText(b.updatedAt)}</span></div><div className="pt-actions" style={{marginTop:12}}>{["open","in_progress","waiting","resolved","closed"].map(s=><button className="pt-btn secondary" key={s} onClick={()=>bugs.update(x=>x.id===b.id,{status:s as WorkStatus,updatedAt:new Date().toISOString()})} type="button">{s}</button>)}</div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"title",label:"Bug"},{key:"moduleKey",label:"Module"},{key:"accountName",label:"Account"},{key:"severity",label:"Severity",render:r=><Badge tone={toneFromStatus(r.severity)}>{r.severity}</Badge>},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge>},{key:"updatedAt",label:"Updated",render:r=>timeText(r.updatedAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Reproduction details"/><div className="pt-list">{rows.map(b=><div className="pt-row" key={b.id}><div><h3>{b.title}</h3><p><b>Steps:</b> {b.steps||"Not recorded"}<br/><b>Expected:</b> {b.expected||"Not recorded"}<br/><b>Actual:</b> {b.actual||"Not recorded"}</p></div><Badge tone={toneFromStatus(b.severity)}>{b.severity}</Badge></div>)}</div></section>}</section></main>}
