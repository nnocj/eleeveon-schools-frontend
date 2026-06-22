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

export default function SyncHelpDesk(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const[status,setStatus]=useState("all");const conflicts=usePlatformTeamApi<any>("/sync/conflicts",["conflicts","items","data"]);const diagnostics=usePlatformTeamApi<any>("/sync/diagnostics",["tables","devices","conflicts"],{fallback:[]});const notes=useLocalRecords<any>("eleeveon.platformTeam.syncNotes",[]);const rows=filterRows(conflicts.rows,query,status,["tableName","conflictType","status","severity","deviceId","cloudId"]);return <main className="pt-page"><PageHeader eyebrow="Sync Help Desk" title="Device and offline-sync support" description="Help schools resolve new-device, offline, duplicate, and conflict problems without touching raw database tools." ><button className="pt-btn secondary" onClick={()=>{conflicts.refresh();diagnostics.refresh()}} type="button">Refresh sync info</button></PageHeader><div className="pt-grid"><MetricCard label="Open conflicts" value={conflicts.rows.filter((c:any)=>String(c.status||"open")==="open").length} icon="⚠️" tone="orange"/><MetricCard label="Devices/rows" value={diagnostics.rows.length||"—"} icon="📱" tone="blue"/><MetricCard label="Resolved" value={conflicts.rows.filter((c:any)=>String(c.status)==="resolved").length} icon="✅" tone="green"/></div><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} view={view} onView={setView} onRefresh={conflicts.refresh} loading={conflicts.loading}/><LoadingOrError loading={conflicts.loading} error={conflicts.error} onRetry={conflicts.refresh}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Safe sync support steps"/><div className="pt-list">{["Confirm user is logged into correct account","Check device last seen and internet status","Run pull sync before push if device is stale","Never delete local data before backup/export","Record what was changed for audit"].map(s=><div className="pt-row" key={s}><h3>{s}</h3><Badge tone="blue">Safe</Badge></div>)}</div></section><section className="pt-card half"><SectionTitle title="Conflicts by table"/><MiniBarChart rows={countBy(conflicts.rows,(r:any)=>r.tableName)}/></section>{rows.map((c:any)=><section className="pt-card" key={c.id}><div className="pt-toolbar"><Badge tone={toneFromStatus(c.severity)}>{c.severity||"medium"}</Badge><Badge tone={toneFromStatus(c.status)}>{c.status||"open"}</Badge></div><h3>{c.tableName||"Sync conflict"}</h3><p>{c.conflictType||"Version conflict"} • Device {c.deviceId||"unknown"}</p><div className="pt-kv"><b>Local ID</b><span>{c.localId||"—"}</span><b>Cloud ID</b><span>{c.cloudId||"—"}</span><b>Detected</b><span>{timeText(c.detectedAt||c.createdAt)}</span></div><button className="pt-btn secondary" onClick={()=>notes.add({id:makeId("sync_note"),conflictId:c.id,text:`Reviewed ${c.tableName} conflict`,createdAt:new Date().toISOString()})} type="button">Record review</button></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"tableName",label:"Table"},{key:"conflictType",label:"Type"},{key:"severity",label:"Severity",render:r=><Badge tone={toneFromStatus(r.severity)}>{r.severity||"medium"}</Badge>},{key:"status",label:"Status",render:r=><Badge tone={toneFromStatus(r.status)}>{r.status||"open"}</Badge>},{key:"deviceId",label:"Device"},{key:"detectedAt",label:"Detected",render:r=>timeText(r.detectedAt||r.createdAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Sync support notes"/><div className="pt-list">{notes.records.map((n:any)=><div className="pt-row" key={n.id}><div><h3>{n.conflictId}</h3><p>{n.text}</p></div><Badge>{timeText(n.createdAt)}</Badge></div>)}</div></section>}</section></main>}
