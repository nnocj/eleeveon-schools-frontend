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

export default function KnowledgeBase(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const kb=useLocalRecords<KnowledgeArticle>("eleeveon.platformTeam.knowledge",[]);const[form,setForm]=useState({title:"",category:"Support",audience:"Platform Team",answer:"",tags:""});const rows=filterRows(kb.records,query,"all",["title","category","audience","answer"]);const add=()=>{if(!form.title.trim()||!form.answer.trim())return;kb.add({id:makeId("kb"),title:form.title,category:form.category,audience:form.audience,answer:form.answer,tags:form.tags.split(",").map(s=>s.trim()).filter(Boolean),updatedAt:new Date().toISOString()});setForm({...form,title:"",answer:"",tags:""})};return <main className="pt-page"><PageHeader eyebrow="Knowledge Base" title="Internal answers and guides" description="Create support guides so new team members can help customers consistently."/><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Add guide"/><div className="pt-form"><input className="pt-input" placeholder="Question or guide title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><div className="pt-form-grid"><select className="pt-select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["Support","Sync","Billing","Release","QA","Schools","Learn","Business","Sites"].map(x=><option key={x}>{x}</option>)}</select><input className="pt-input" placeholder="Audience" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}/></div><textarea className="pt-textarea" placeholder="Answer or steps" value={form.answer} onChange={e=>setForm({...form,answer:e.target.value})}/><input className="pt-input" placeholder="Tags comma separated" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/><button className="pt-btn" onClick={add}>Save guide</button></div></section><section className="pt-card half"><SectionTitle title="Guides by category"/><MiniBarChart rows={countBy(kb.records,a=>a.category)}/></section>{rows.map(a=><section className="pt-card" key={a.id}><div className="pt-toolbar"><Badge tone="purple">{a.category}</Badge><Badge tone="blue">{a.audience}</Badge></div><h3>{a.title}</h3><p style={{whiteSpace:"pre-wrap"}}>{a.answer}</p><p className="pt-help">Tags: {(a.tags||[]).join(", ")||"None"} • Updated {timeText(a.updatedAt)}</p></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"title",label:"Guide"},{key:"category",label:"Category"},{key:"audience",label:"Audience"},{key:"updatedAt",label:"Updated",render:r=>timeText(r.updatedAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Quick support scripts" text="Use the knowledge base to build exact answers for common customer questions."/><div className="pt-list">{rows.map(a=><div className="pt-row" key={a.id}><div><h3>{a.title}</h3><p>{a.answer.slice(0,240)}{a.answer.length>240?"...":""}</p></div><Badge>{a.category}</Badge></div>)}</div></section>}</section></main>}
