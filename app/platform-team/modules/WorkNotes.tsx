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

export default function WorkNotes(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const local=useLocalRecords<any>("eleeveon.platformTeam.notes",[]);const api=usePlatformTeamApi<any>("/sync/bootstrap",["auditLogs","records","items"],{auto:false,fallback:[]});const[form,setForm]=useState<any>({title:"",message:"",text:"",category:"General",priority:"normal",audience:"Platform Team",accountName:"",key:"",value:"",status:"active"});const rows=filterRows([...(api.rows||[]),...local.records],query,"all",["title,text,accountName,category".split(",")].flat());const add=()=>{const now=new Date().toISOString();const label=form.title||form.key||form.category;if(!String(label).trim()&&!String(form.message||form.text||form.value).trim())return;local.add({id:makeId("pt_record"),...form,createdAt:now,updatedAt:now});setForm({...form,title:"",message:"",text:"",key:"",value:"",accountName:""})};return <main className="pt-page"><PageHeader eyebrow="Platform Team" title="Operational work notes" description="Keep notes attached to accounts, tickets, bugs, releases and customer follow-ups."><button className="pt-btn secondary" onClick={api.refresh} disabled={api.loading} type="button">Refresh server data</button></PageHeader><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView} onRefresh={api.refresh} loading={api.loading}/><LoadingOrError loading={api.loading} error={api.error} onRetry={api.refresh}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Add record"/><div className="pt-form"><input className="pt-input" placeholder="Title / key" value={form.title||form.key} onChange={e=>setForm({...form,title:e.target.value,key:e.target.value})}/><div className="pt-form-grid"><input className="pt-input" placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><select className="pt-select" value={form.priority||form.status} onChange={e=>setForm({...form,priority:e.target.value,status:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="active">Active</option></select><input className="pt-input" placeholder="Audience / account" value={form.audience||form.accountName} onChange={e=>setForm({...form,audience:e.target.value,accountName:e.target.value})}/></div><textarea className="pt-textarea" placeholder="Details" value={form.message||form.text||form.value} onChange={e=>setForm({...form,message:e.target.value,text:e.target.value,value:e.target.value})}/><button className="pt-btn" onClick={add} type="button">Save</button></div></section><section className="pt-card half"><SectionTitle title="Summary"/><MiniBarChart rows={countBy(rows,(r:any)=>r.category||r.action||r.priority||r.status)}/></section>{rows.map((r:any)=><section className="pt-card" key={r.id||r.createdAt}><div className="pt-toolbar"><Badge tone={toneFromStatus(r.priority||r.status||r.action)}>{r.priority||r.status||r.action||"record"}</Badge><Badge tone="blue">{r.category||r.moduleKey||r.audience||"Platform Team"}</Badge></div><h3>{r.title||r.key||r.action||"Team record"}</h3><p>{r.message||r.text||r.value||r.metadata?.message||r.entityType||"No details provided."}</p><div className="pt-kv"><b>Account</b><span>{r.accountName||r.accountId||"General"}</span><b>Actor</b><span>{r.actorEmail||r.createdBy||"Platform team"}</span><b>Time</b><span>{timeText(r.updatedAt||r.createdAt)}</span></div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"title",label:"Title",render:(r:any)=>r.title||r.key||r.action||"Record"},{key:"category",label:"Category",render:(r:any)=>r.category||r.moduleKey||r.audience||"—"},{key:"status",label:"Status",render:(r:any)=><Badge tone={toneFromStatus(r.priority||r.status||r.action)}>{r.priority||r.status||r.action||"record"}</Badge>},{key:"createdAt",label:"Time",render:(r:any)=>timeText(r.updatedAt||r.createdAt)}]}/>}{view==="focus"&&<section className="pt-card full"><SectionTitle title="Working standard"/><p>This page is for safe team operations. Use it to document work, communicate clearly, and keep Eleeveon support consistent.</p></section>}</section></main>}
