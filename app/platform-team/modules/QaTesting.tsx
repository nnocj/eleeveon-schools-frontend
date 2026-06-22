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

export default function QaTesting(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const tests=useLocalRecords<any>("eleeveon.platformTeam.qaTests",[]);const[form,setForm]=useState({title:"",module:"",steps:"",result:"pending",release:""});const rows=filterRows(tests.records,query,"all",["title","module","result","release"]);const add=()=>{if(!form.title.trim())return;tests.add({id:makeId("qa"),...form,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});setForm({title:"",module:"",steps:"",result:"pending",release:""})};return <main className="pt-page"><PageHeader eyebrow="QA Testing" title="Release test records" description="Track tests before releases. Each failed test can later become a bug report."/><div className="pt-grid"><MetricCard label="Tests" value={tests.records.length} icon="🧪"/><MetricCard label="Passed" value={tests.records.filter((t:any)=>t.result==="passed").length} icon="✅" tone="green"/><MetricCard label="Failed" value={tests.records.filter((t:any)=>t.result==="failed").length} icon="❌" tone="red"/></div><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Add test case"/><div className="pt-form"><input className="pt-input" placeholder="Test title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input className="pt-input" placeholder="Module/page" value={form.module} onChange={e=>setForm({...form,module:e.target.value})}/><input className="pt-input" placeholder="Release/version" value={form.release} onChange={e=>setForm({...form,release:e.target.value})}/><textarea className="pt-textarea" placeholder="Test steps" value={form.steps} onChange={e=>setForm({...form,steps:e.target.value})}/><select className="pt-select" value={form.result} onChange={e=>setForm({...form,result:e.target.value})}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option></select><button className="pt-btn" onClick={add}>Save test</button></div></section><section className="pt-card half"><SectionTitle title="Results"/><MiniBarChart rows={countBy(tests.records,(t:any)=>t.result)}/></section>{rows.map((t:any)=><section className="pt-card" key={t.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(t.result)}>{t.result}</Badge><Badge tone="blue">{t.release||"No release"}</Badge></div><h3>{t.title}</h3><p>{t.steps}</p><div className="pt-actions">{["pending","passed","failed","blocked"].map(r=><button className="pt-btn secondary" onClick={()=>tests.update((x:any)=>x.id===t.id,{result:r,updatedAt:new Date().toISOString()})} key={r}>{r}</button>)}</div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"title",label:"Test"},{key:"module",label:"Module"},{key:"release",label:"Release"},{key:"result",label:"Result",render:r=><Badge tone={toneFromStatus(r.result)}>{r.result}</Badge>},{key:"updatedAt",label:"Updated",render:r=>timeText(r.updatedAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Failed and blocked tests"/><div className="pt-list">{rows.filter((t:any)=>["failed","blocked"].includes(t.result)).map((t:any)=><div className="pt-row" key={t.id}><div><h3>{t.title}</h3><p>{t.module} • {t.steps}</p></div><Badge tone={toneFromStatus(t.result)}>{t.result}</Badge></div>)}</div></section>}</section></main>}
