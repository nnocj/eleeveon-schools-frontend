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

export default function ClientAccounts(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const[status,setStatus]=useState("all");const api=usePlatformTeamApi<ClientAccount>("/developer/accounts",["accounts","items","data","results"]);const notes=useLocalRecords<any>("eleeveon.platformTeam.accountNotes",[]);const rows=filterRows(api.rows,query,status,["name","email","phone","status","planName","subscriptionStatus"]);return <main className="pt-page"><PageHeader eyebrow="Client Accounts" title="Safe customer account monitoring" description="View account health, contact details and subscription status. Platform team can support customers here, but this page does not expose owner-only destructive controls." ><button className="pt-btn secondary" onClick={api.refresh} disabled={api.loading} type="button">Refresh accounts</button></PageHeader><div className="pt-grid"><MetricCard label="Visible accounts" value={api.rows.length} icon="🏫"/><MetricCard label="Active" value={api.rows.filter(a=>String(a.status).toLowerCase()==="active").length} icon="✅" tone="green"/><MetricCard label="Needs attention" value={api.rows.filter(a=>["suspended","past_due","expired"].includes(String(a.status||a.subscriptionStatus).toLowerCase())).length} icon="⚠️" tone="orange"/></div><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView} onRefresh={api.refresh} loading={api.loading}/><LoadingOrError loading={api.loading} error={api.error} onRetry={api.refresh}/>{view==="cards"&&<div className="pt-grid">{rows.map(a=><section className="pt-card" key={a.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(a.status)}>{a.status||"active"}</Badge><Badge tone={toneFromStatus(a.subscriptionStatus)}>{a.subscriptionStatus||a.planName||"plan"}</Badge></div><h3>{a.name}</h3><p>{a.email||"No email"} • {a.phone||"No phone"}</p><div className="pt-kv"><b>Account ID</b><span>{a.id}</span><b>Plan</b><span>{a.planName||"Not shown"}</span><b>Updated</b><span>{timeText(a.updatedAt)}</span></div><button className="pt-btn secondary" onClick={()=>notes.add({id:makeId("acct_note"),accountId:a.id,accountName:a.name,text:`Reviewed ${a.name} account`,createdAt:new Date().toISOString()})} type="button">Record review note</button></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"name",label:"Account"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status||"active"}</Badge>},{key:"subscriptionStatus",label:"Subscription",render:r=><Badge tone={toneFromStatus(r.subscriptionStatus)}>{r.subscriptionStatus||r.planName||"—"}</Badge>},{key:"updatedAt",label:"Updated",render:r=>timeText(r.updatedAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Account review notes"/><div className="pt-list">{notes.records.map((n:any)=><div className="pt-row" key={n.id}><div><h3>{n.accountName}</h3><p>{n.text}</p></div><Badge>{timeText(n.createdAt)}</Badge></div>)}</div></section>}</section></main>}
