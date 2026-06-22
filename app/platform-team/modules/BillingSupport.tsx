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

export default function BillingSupport(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const[status,setStatus]=useState("all");const invoices=usePlatformTeamApi<any>("/billing/invoices",["invoices","items","data"]);const payments=usePlatformTeamApi<any>("/billing/payments",["payments","items","data"]);const notes=useLocalRecords<any>("eleeveon.platformTeam.billingNotes",[]);const rows=filterRows([...invoices.rows.map((x:any)=>({...x,kind:"Invoice"})),...payments.rows.map((x:any)=>({...x,kind:"Payment"}))],query,status,["invoiceNumber","receiptNumber","payerName","payerEmail","status","kind"]);return <main className="pt-page"><PageHeader eyebrow="Billing Support" title="Invoices and payment help" description="Support customers with subscription, invoice and payment questions. This area is read-first and support-focused; it does not expose payment provider secrets." ><button className="pt-btn secondary" onClick={()=>{invoices.refresh();payments.refresh()}} type="button">Refresh billing</button></PageHeader><div className="pt-grid"><MetricCard label="Invoices" value={invoices.rows.length} icon="🧾"/><MetricCard label="Payments" value={payments.rows.length} icon="💰" tone="green"/><MetricCard label="Unpaid/failed" value={rows.filter((r:any)=>["failed","overdue","pending","part_paid"].includes(String(r.status).toLowerCase())).length} icon="⚠️" tone="orange"/></div><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView}/><LoadingOrError loading={invoices.loading||payments.loading} error={invoices.error||payments.error}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Billing support rules"/><div className="pt-list">{["Confirm payer identity before discussing invoice","Never expose Paystack secret keys","Check provider reference before marking paid","Record every billing support action","Escalate refund requests to Platform Lead"].map(x=><div className="pt-row" key={x}><h3>{x}</h3><Badge tone="blue">Rule</Badge></div>)}</div></section><section className="pt-card half"><SectionTitle title="Billing status"/><MiniBarChart rows={countBy(rows,(r:any)=>r.status)}/></section>{rows.map((r:any)=><section className="pt-card" key={`${r.kind}-${r.id}`}><div className="pt-toolbar"><Badge tone="purple">{r.kind}</Badge><Badge tone={toneFromStatus(r.status)}>{r.status||"pending"}</Badge></div><h3>{r.invoiceNumber||r.receiptNumber||r.providerReference||r.id}</h3><p>{r.payerName||r.account?.name||r.accountName||"Customer"} • {money(r.total||r.amount||0,r.currency||"GHS")}</p><div className="pt-kv"><b>Reference</b><span>{r.providerReference||r.reference||"—"}</span><b>Date</b><span>{timeText(r.paidAt||r.issueDate||r.createdAt)}</span></div><button className="pt-btn secondary" onClick={()=>notes.add({id:makeId("bill_note"),recordId:r.id,text:`Reviewed ${r.kind} ${r.invoiceNumber||r.id}`,createdAt:new Date().toISOString()})} type="button">Record note</button></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"kind",label:"Type"},{key:"invoiceNumber",label:"Number",render:r=>r.invoiceNumber||r.receiptNumber||r.id},{key:"amount",label:"Amount",render:r=>money(r.total||r.amount||0,r.currency||"GHS")},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status}</Badge>},{key:"providerReference",label:"Reference"},{key:"createdAt",label:"Date",render:r=>timeText(r.paidAt||r.createdAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Billing notes"/><div className="pt-list">{notes.records.map((n:any)=><div className="pt-row" key={n.id}><div><h3>{n.recordId}</h3><p>{n.text}</p></div><Badge>{timeText(n.createdAt)}</Badge></div>)}</div></section>}</section></main>}
