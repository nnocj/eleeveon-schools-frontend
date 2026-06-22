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

export default function SupportDesk(){const [view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const[status,setStatus]=useState("all");const api=usePlatformTeamApi<SupportTicket>("/support/tickets",["tickets","items","data","results"]);const notes=useLocalRecords<any>("eleeveon.platformTeam.supportNotes",[]);const rows=filterRows(api.rows,query,status,["subject","message","accountName","requesterName","requesterEmail","status","priority"]);const [note,setNote]=useState({ticketId:"",text:""});const addNote=()=>{if(!note.text.trim())return;notes.add({id:makeId("support_note"),...note,createdAt:new Date().toISOString()});setNote({ticketId:"",text:""})};return <main className="pt-page"><PageHeader eyebrow="Support Desk" title="Customer support queue" description="Respond to schools, owners, parents, teachers and platform users. This page reads real support tickets when the backend endpoint is available and still lets the team record local follow-up notes." ><button className="pt-btn secondary" onClick={api.refresh} disabled={api.loading} type="button">Refresh tickets</button></PageHeader><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView} onRefresh={api.refresh} loading={api.loading}/><LoadingOrError loading={api.loading} error={api.error} onRetry={api.refresh}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Record support note" text="Use this after a call, WhatsApp message, or customer follow-up."/><div className="pt-form"><input className="pt-input" placeholder="Ticket ID or customer name" value={note.ticketId} onChange={e=>setNote({...note,ticketId:e.target.value})}/><textarea className="pt-textarea" placeholder="What happened and next action" value={note.text} onChange={e=>setNote({...note,text:e.target.value})}/><button className="pt-btn" onClick={addNote} type="button">Save note</button></div></section><section className="pt-card half"><SectionTitle title="Ticket status"/><MiniBarChart rows={countBy(api.rows,r=>r.status||"open")}/></section>{rows.map(t=><section className="pt-card" key={t.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(t.priority)}>{t.priority||"normal"}</Badge><Badge tone={toneFromStatus(t.status)}>{t.status||"open"}</Badge></div><h3>{t.subject}</h3><p>{t.message||"No message provided."}</p><div className="pt-kv"><b>Customer</b><span>{t.accountName||t.requesterName||"Unknown"}</span><b>Email</b><span>{t.requesterEmail||"—"}</span><b>Phone</b><span>{t.requesterPhone||"—"}</span><b>Created</b><span>{timeText(t.createdAt)}</span></div></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"subject",label:"Ticket"},{key:"accountName",label:"Account"},{key:"requesterName",label:"Requester"},{key:"priority",label:"Priority",render:r=><Badge tone={toneFromStatus(r.priority)}>{r.priority||"normal"}</Badge>},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status||"open"}</Badge>},{key:"createdAt",label:"Created",render:r=>timeText(r.createdAt)}]}/>} {view==="focus"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Saved follow-up notes"/><div className="pt-list">{notes.records.map((n:any)=><div className="pt-row" key={n.id}><div><h3>{n.ticketId||"General note"}</h3><p>{n.text}</p></div><Badge>{timeText(n.createdAt)}</Badge></div>)}</div></section><section className="pt-card half"><SectionTitle title="Support handling standard"/><div className="pt-list">{["Identify account and contact","Confirm the exact problem","Check sync/billing/account status","Record what you did","Give a clear next action","Close only after customer confirms"].map(x=><div className="pt-row" key={x}><h3>{x}</h3><Badge tone="blue">Required</Badge></div>)}</div></section></div>}</section></main>}
