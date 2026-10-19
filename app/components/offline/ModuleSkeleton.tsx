"use client";

import React from "react";

export type ModuleSkeletonKind =
  | "student" | "teacher" | "class" | "assessment"
  | "attendance" | "table" | "broadsheet" | "report-card";
export type ModuleSkeletonView = "cards" | "table" | "preview";

interface Props {
  kind: ModuleSkeletonKind;
  view?: ModuleSkeletonView;
  count?: number;
  title?: string;
  message?: string;
  compact?: boolean;
}

const css = `
.eleeveon-skeleton{--sk-base:var(--surface-muted,var(--hover-bg,rgba(127,141,163,.12)));--sk-edge:var(--border,rgba(127,141,163,.2)); color:var(--text,#1f2937);width:100%;min-width:0}
.eleeveon-skeleton *{box-sizing:border-box;min-width:0}
.eleeveon-skeleton .esk-header{margin-bottom:12px}
.eleeveon-skeleton .esk-heading{font-size:13px;font-weight:750;line-height:1.5}
.eleeveon-skeleton .esk-note{font-size:11px;color:var(--muted,#64748b);margin-top:2px}
.eleeveon-skeleton .esk-line{display:block;height:10px;background:var(--sk-base);border-radius:5px;max-width:100%;animation:eleeveon-sk-pulse 1.6s ease-in-out infinite alternate}
.eleeveon-skeleton .esk-line.sm{height:7px}.eleeveon-skeleton .esk-line.lg{height:16px}
.eleeveon-skeleton .esk-card{border:1px solid var(--sk-edge);background:var(--card-bg,var(--surface,#fff));border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:11px;min-height:104px}
.eleeveon-skeleton .esk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:10px}
.eleeveon-skeleton .esk-row{display:flex;align-items:center;gap:10px}.eleeveon-skeleton .esk-col{flex:1;display:flex;flex-direction:column;gap:8px}
.eleeveon-skeleton .esk-avatar{height:43px;width:43px;border-radius:11px;background:var(--sk-base);flex:0 0 auto;animation:eleeveon-sk-pulse 1.6s ease-in-out infinite alternate}
.eleeveon-skeleton .esk-avatar.round{border-radius:50%}
.eleeveon-skeleton .esk-divider{height:1px;background:var(--sk-edge)}
.eleeveon-skeleton .esk-field{flex:1;background:var(--sk-base);height:31px;border-radius:7px;animation:eleeveon-sk-pulse 1.6s ease-in-out infinite alternate}
.eleeveon-skeleton .esk-pill{background:var(--sk-base);width:50px;height:24px;border-radius:30px;animation:eleeveon-sk-pulse 1.6s ease-in-out infinite alternate}
.eleeveon-skeleton .esk-table-scroll{width:100%;overflow:hidden;border:1px solid var(--sk-edge);border-radius:12px;background:var(--card-bg,var(--surface,#fff))}
.eleeveon-skeleton .esk-table{width:100%;border-collapse:collapse;table-layout:fixed}.eleeveon-skeleton .esk-table td,.eleeveon-skeleton .esk-table th{padding:11px 9px;border-bottom:1px solid var(--sk-edge);text-align:left}.eleeveon-skeleton .esk-table th{background:var(--sk-base)}.eleeveon-skeleton .esk-table tr:last-child td{border-bottom:0}
.eleeveon-skeleton .esk-report{max-width:740px;width:100%;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--sk-edge);padding:20px;border-radius:8px;display:flex;flex-direction:column;gap:15px}
.eleeveon-skeleton .esk-report .esk-avatar{height:55px;width:55px}
@keyframes eleeveon-sk-pulse{from{opacity:.65}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.eleeveon-skeleton .esk-line,.eleeveon-skeleton .esk-avatar,.eleeveon-skeleton .esk-field,.eleeveon-skeleton .esk-pill{animation:none}}
@media(max-width:580px){.eleeveon-skeleton .esk-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.eleeveon-skeleton .esk-card{padding:9px;gap:9px}.eleeveon-skeleton .esk-avatar{width:34px;height:34px}.eleeveon-skeleton .esk-report{padding:12px}.eleeveon-skeleton .esk-table td,.eleeveon-skeleton .esk-table th{padding:9px 5px}}
`;
function Bar({ width = "70%", size = "" }: { width?: string; size?: "" | "sm" | "lg" }) {
  return <span aria-hidden="true" className={`esk-line ${size}`} style={{ width }} />;
}
function IdentityCard({ kind }: { kind: ModuleSkeletonKind }) {
  const person = kind === "student" || kind === "teacher" || kind === "assessment" || kind === "attendance";
  return <div className="esk-card" aria-hidden="true">
    <div className="esk-row"><span className={`esk-avatar ${person ? "round" : ""}`} /><div className="esk-col"><Bar width="82%"/><Bar size="sm" width="58%"/></div>{kind === "assessment" ? <span className="esk-pill"/> : null}</div>
    <div className="esk-divider"/>
    {kind === "assessment" ? <div className="esk-row"><div className="esk-col"><Bar size="sm" width="70%"/><span className="esk-field"/></div><div className="esk-col"><Bar size="sm" width="60%"/><span className="esk-field"/></div><div className="esk-col"><Bar size="sm" width="60%"/><span className="esk-field"/></div></div> :
      <><Bar size="sm" width="90%"/><Bar size="sm" width="62%"/></>}
  </div>;
}
function Sheet({ rows, columns, broadsheet }: { rows: number; columns: number; broadsheet: boolean }) {
  return <div className="esk-table-scroll" aria-hidden="true"><table className="esk-table"><thead><tr>{Array.from({length:columns},(_,i)=><th key={i}><Bar width={i===0?"85%":"70%"}/></th>)}</tr></thead><tbody>{Array.from({length:rows},(_,i)=><tr key={i}>{Array.from({length:columns},(_,j)=><td key={j}><Bar size="sm" width={j===0?"90%":broadsheet?"42%":"70%"}/></td>)}</tr>)}</tbody></table></div>;
}
function Report() { return <div className="esk-report" aria-hidden="true">
  <div className="esk-row"><span className="esk-avatar"/><div className="esk-col"><Bar size="lg" width="68%"/><Bar width="48%"/><Bar size="sm" width="60%"/></div><span className="esk-avatar round"/></div>
  <div className="esk-divider"/><div className="esk-row"><div className="esk-col"><Bar width="87%"/><Bar size="sm" width="62%"/></div><div className="esk-col"><Bar width="88%"/><Bar size="sm" width="68%"/></div></div>
  <Sheet rows={5} columns={4} broadsheet={false}/><div className="esk-divider"/><Bar width="55%"/><Bar size="sm" width="96%"/><Bar size="sm" width="81%"/>
  </div>;
}

/** Visual placeholders only. Render real cached records instead whenever available. */
export default function ModuleSkeleton({ kind, view="cards", count=4, title="Getting your records ready…", message, compact=false }:Props) {
  const rows=Math.max(2,Math.min(10,Math.floor(count)));
  const sheet = kind === "broadsheet" || kind === "table" || view === "table";
  const report = kind === "report-card" || view === "preview";
  return <section className="eleeveon-skeleton" role="status" aria-busy="true" aria-label={title}>
    <style>{css}</style>
    <div className="esk-header"><div className="esk-heading">{title}</div>{message && <div className="esk-note">{message}</div>}</div>
    {report ? <Report/> : sheet ? <Sheet rows={rows} columns={kind === "broadsheet" ? 7 : compact ? 3 : 5} broadsheet={kind === "broadsheet"}/> :
      <div className="esk-grid">{Array.from({length:rows},(_,i)=><IdentityCard kind={kind} key={i}/>)}</div>}
  </section>;
}
