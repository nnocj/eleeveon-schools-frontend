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

export default function TeamPermissions(){const[view,setView]=useState<ViewMode>("cards");const[query,setQuery]=useState("");const perms=useLocalRecords<any>("eleeveon.platformTeam.permissions",[]);const rows=filterRows(perms.records.length?perms.records:[],query,"all",["memberName","permissionKey","enabled"]);const seed=()=>perms.setRecords(["support","accounts_read","sync_help","billing_help","qa","bugs","releases","knowledge","team_notes","activity_read"].map(key=>({id:makeId("perm"),memberName:"Default Platform Team",permissionKey:key,enabled:true,updatedAt:new Date().toISOString()})));return <main className="pt-page"><PageHeader eyebrow="Team Permissions" title="Safe access control" description="Define what platform team members can do. This intentionally excludes raw SQL, migrations, destructive database actions and secret key exposure." ><button className="pt-btn secondary" onClick={seed}>Create default safe permissions</button></PageHeader><section className="pt-card full"><Toolbar query={query} onQuery={setQuery} view={view} onView={setView}/>{view==="cards"&&<div className="pt-grid"><section className="pt-card half"><SectionTitle title="Allowed permission groups"/><div className="pt-list">{["Support Desk","Client Account View","Sync Help","Billing Help","QA Testing","Bug Reports","Release Board","Knowledge Base","Work Notes","Activity Read"].map(x=><div className="pt-row" key={x}><h3>{x}</h3><Badge tone="green">Safe</Badge></div>)}</div></section><section className="pt-card half"><SectionTitle title="Blocked developer-only tools"/><div className="pt-list">{["Raw SQL Console","Database Reset","Migration Runner","Secret API Key View","Payment Provider Secret Settings","Server Environment Variables"].map(x=><div className="pt-row" key={x}><h3>{x}</h3><Badge tone="red">Blocked</Badge></div>)}</div></section>{rows.map((p:any)=><section className="pt-card" key={p.id}><h3>{p.memberName}</h3><p>{p.permissionKey}</p><Badge tone={p.enabled?"green":"gray"}>{p.enabled?"enabled":"disabled"}</Badge><button className="pt-btn secondary" onClick={()=>perms.update((x:any)=>x.id===p.id,{enabled:!p.enabled,updatedAt:new Date().toISOString()})}>Toggle</button></section>)}</div>}{view==="table"&&<DataTable rows={rows} columns={[{key:"memberName",label:"Member"},{key:"permissionKey",label:"Permission"},{key:"enabled",label:"Status",render:r=><Badge tone={r.enabled?"green":"gray"}>{r.enabled?"enabled":"disabled"}</Badge>},{key:"updatedAt",label:"Updated",render:r=>timeText(r.updatedAt)}]}/>} {view==="focus"&&<section className="pt-card full"><SectionTitle title="Permission policy"/><p>Platform team access should be least-privilege. Team members get the tools needed for their work only. Developer-only controls stay in the Developer Portal.</p></section>}</section></main>}
