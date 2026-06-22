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

export default function TeamMembers(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const members=useLocalRecords<any>("eleeveon.platformTeam.members",[]);const[form,setForm]=useState({fullName:"",email:"",phone:"",role:"support_agent",status:"active"});const rows=filterRows(members.records,query,"all",["fullName","email","phone","role","status"]);const add=()=>{if(!form.fullName.trim())return;members.add({id:makeId("member"),...form,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});setForm({...form,fullName:"",email:"",phone:""})};return <main className="pt-page"><PageHeader eyebrow="Team Members" title="People helping Eleeveon" description="Manage the people you enroll to help with development, QA, support, content, design and operations."/><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Add team member"/><div className="pt-form"><input className="pt-input" placeholder="Full name" value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/><input className="pt-input" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className="pt-input" placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><select className="pt-select" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries({platform_lead:"Platform Lead",developer:"Developer",support_agent:"Support Agent",billing_support:"Billing Support",qa_tester:"QA Tester",content_assistant:"Content Assistant",designer:"Designer"}).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><button className="pt-btn" onClick={add}>Add member</button></div></section><section className="pt-card half"><SectionTitle title="Roles"/><MiniBarChart rows={countBy(members.records,(m:any)=>m.role)}/></section>{rows.map((m:any)=><section className="pt-card" key={m.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(m.role)}>{m.role.replaceAll("_"," ")}</Badge><Badge tone={toneFromStatus(m.status)}>{m.status}</Badge></div><h3>{m.fullName}</h3><p>{m.email||"No email"} • {m.phone||"No phone"}</p><div className="pt-actions">{["active","inactive","suspended"].map(s=><button className="pt-btn secondary" key={s} onClick={()=>members.update((x:any)=>x.id===m.id,{status:s,updatedAt:new Date().toISOString()})}>{s}</button>)}</div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"fullName",label:"Name"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"role",label:"Role",render:r=><Badge tone={toneFromStatus(r.role)}>{r.role}</Badge>},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge>}]} />}{view==="focus"&&<section className="pt-card full"><SectionTitle title="Team onboarding checklist"/><div className="pt-list">{["Create user account with platform_team role","Assign only needed permissions","Explain support standards","Show sync and billing escalation rules","Add first work task","Review activity logs weekly"].map(x=><div className="pt-row" key={x}><h3>{x}</h3><Badge tone="blue">Required</Badge></div>)}</div></section>}</section></main>}
