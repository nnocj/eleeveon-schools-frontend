"use client";

/**
 * Eleeveon Schools — A4 term fees and requirements notice.
 * Current selected academic term is ALWAYS the left-hand panel;
 * the succeeding configured period (if one exists) is ALWAYS the right-hand panel.
 * All amounts come from existing period-specific feeStructures, not projections.
 * This component is presentation-only: printing never issues invoices or payments.
 */
import React from "react";
import type { FeeStructureItem } from "../../../lib/db/db";
import { formatFinanceMoney, getFinanceCurrency } from "./financeCurrency";

export type TermNoticePrintTemplateProps = {
  schoolName: string;
  branchName?: string;
  schoolLogo?: string;
  schoolMotto?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  primaryColor?: string;
  academicStructure: string;
  academicPeriod: string;
  nextAcademicPeriod?: string;
  nextAcademicStructure?: string;
  nextPeriodConfigured?: boolean;
  className: string;
  studentName?: string;
  admissionNumber?: string;
  fees: FeeStructureItem[];
  requirements: FeeStructureItem[];
  nextFees?: FeeStructureItem[];
  nextRequirements?: FeeStructureItem[];
  studentBalance?: number;
  currencyCode?: string;
  nextCurrencyCode?: string;
  dueDate?: string;
  nextDueDate?: string;
  notice?: string;
  nextNotice?: string;
  issuedOn: string;
};

function SumRows({items, currency}: {items: FeeStructureItem[]; currency: string}) {
  const cash = (value: number) => formatFinanceMoney(value, currency);
  const total = items.reduce((value, item) => value + Math.max(0, Number(item.amount) || 0), 0);
  return <div className="ef-notice-amounts">
    {items.length ? <table className="ef-notice-table" aria-label="Term fees">
      <thead><tr><th>Fee</th><th>Amount ({getFinanceCurrency(currency).code})</th></tr></thead>
      <tbody>{items.map((item,index) => <tr key={`${item.itemKey || item.name}-${index}`}>
        <td>{item.name}</td><td>{cash(item.amount)}</td>
      </tr>)}</tbody>
    </table> : <p className="ef-notice-muted">No fees entered for this term.</p>}
    <div className="ef-notice-total"><span>Total fees</span><strong>{items.length ? cash(total) : "Not entered"}</strong></div>
  </div>;
}

function SupplyRows({items}: {items: FeeStructureItem[]}) {
  return items.length ? <ul className="ef-notice-supplies">
    {items.map((item,index) => <li key={`${item.itemKey || item.name}-${index}`}>
      <span>{item.name}{item.required === false ? " (Optional)" : ""}
        {item.instructions ? <small>{item.instructions}</small> : null}</span>
      <b>{Math.max(1, Number(item.quantity) || 1)} {item.unit || "pcs"}</b>
    </li>)}
  </ul> : <p className="ef-notice-muted">No materials specified.</p>;
}

export default function TermNoticePrintTemplate({
  schoolName, branchName, schoolLogo, schoolMotto, schoolAddress, schoolPhone,
  primaryColor = "#1e4f83", academicStructure, academicPeriod, nextAcademicPeriod, nextAcademicStructure,
  nextPeriodConfigured = false, className, studentName, admissionNumber,
  fees, requirements, nextFees = [], nextRequirements = [], studentBalance,
  currencyCode = "GHS", nextCurrencyCode = "GHS", dueDate, nextDueDate, notice,
  nextNotice, issuedOn,
}: TermNoticePrintTemplateProps) {
  return <article className="ef-print-sheet ef-term-notice-a4" data-a4-paper="portrait"
    style={{"--notice-accent":primaryColor} as React.CSSProperties}>
    <style>{`
      .ef-term-notice-a4{color:#142238;background:#fff;font:11px/1.43 Arial,Helvetica,sans-serif;box-sizing:border-box;
        width:100%;min-height:265mm;padding:0;overflow:visible;}
      .ef-term-notice-a4 *{box-sizing:border-box;}
      .ef-term-notice-a4 .ef-document-head{display:grid;grid-template-columns:70px minmax(0,1fr) 70px;
        gap:10px;align-items:center;padding-bottom:12px;border-bottom:2px solid #193655;}
      .ef-term-notice-a4 .ef-document-logo{width:66px;height:66px;object-fit:contain;}
      .ef-term-notice-a4 .ef-document-logo-fallback{width:66px;height:66px;display:grid;place-items:center;
        font-size:9px;text-align:center;border:1px solid #98a8bc;}
      .ef-term-notice-a4 .ef-document-school{font-size:19px;font-weight:900;line-height:1.13;
        margin:0;text-transform:uppercase;overflow-wrap:anywhere;}
      .ef-term-notice-a4 .ef-document-motto{font-size:10px;font-style:italic;margin:4px 0 0;}
      .ef-term-notice-a4 .ef-document-contact{font-size:10px;margin:3px 0 0;}
      .ef-term-notice-a4 .ef-document-title{text-align:center;margin:14px 0 11px;padding:8px 5px;
        border:1px solid #bac7d2;border-left:4px solid var(--notice-accent);background:#f4f7fa;}
      .ef-term-notice-a4 .ef-document-title h2{font-size:16px;margin:0 0 2px;font-weight:900;text-transform:uppercase;}
      .ef-term-notice-a4 .ef-document-title p{margin:0;color:#475569;font-size:10px;}
      .ef-term-notice-a4 .ef-document-info{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        border:1px solid #c5cfd9;margin:0 0 13px;}
      .ef-term-notice-a4 .ef-document-info>div{padding:7px 9px;border-right:1px solid #c5cfd9;min-width:0;}
      .ef-term-notice-a4 .ef-document-info>div:last-child{border:0;}
      .ef-term-notice-a4 .ef-document-info small{display:block;text-transform:uppercase;font-size:9px;
        color:#64748b;font-weight:850;letter-spacing:.2px;}
      .ef-term-notice-a4 .ef-document-info b{display:block;font-size:11px;overflow-wrap:anywhere;}
      .ef-term-notice-a4 .ef-notice-term-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;align-items:start;}
      .ef-term-notice-a4 .ef-notice-term-panel{min-width:0;border:1px solid #b7c5d5;border-radius:5px;
        overflow:hidden;break-inside:avoid-page;}
      .ef-term-notice-a4 .ef-notice-term-panel>header{background:#eaf0f6;padding:9px 10px;
        border-bottom:2px solid var(--notice-accent);}
      .ef-term-notice-a4 .ef-notice-term-panel.next>header{background:#e9f2ee;}
      .ef-term-notice-a4 .ef-notice-term-panel>header small{font-weight:900;font-size:9px;
        text-transform:uppercase;letter-spacing:.65px;display:block;color:#526779;}
      .ef-term-notice-a4 .ef-notice-term-panel>header strong{display:block;font-size:14px;
        margin-top:3px;overflow-wrap:anywhere;}
      .ef-term-notice-a4 .ef-notice-term-body{padding:10px;display:grid;gap:9px;}
      .ef-term-notice-a4 .ef-notice-section-heading{font-size:11px;font-weight:900;color:#243b53;
        text-transform:uppercase;margin:0 0 5px;letter-spacing:.1px;}
      .ef-term-notice-a4 .ef-notice-table{width:100%;border-collapse:collapse;table-layout:fixed;}
      .ef-term-notice-a4 .ef-notice-table td,.ef-term-notice-a4 .ef-notice-table th{
        text-align:left;font-size:10px;border:1px solid #bac7d4;padding:6px;overflow-wrap:anywhere;vertical-align:top;}
      .ef-term-notice-a4 .ef-notice-table th{font-size:9px;background:#f1f5f9;font-weight:850;}
      .ef-term-notice-a4 .ef-notice-table td:last-child,.ef-term-notice-a4 .ef-notice-table th:last-child{
        text-align:right;width:38%;font-variant-numeric:tabular-nums;}
      .ef-term-notice-a4 .ef-notice-total{display:flex;justify-content:space-between;gap:6px;
        align-items:baseline;padding:7px;background:#f0f4f8;font-size:10px;font-weight:850;}
      .ef-term-notice-a4 .ef-notice-total strong{text-align:right;}
      .ef-term-notice-a4 .ef-notice-muted{color:#64748b;font-size:10px;margin:4px 0;}
      .ef-term-notice-a4 .ef-notice-balance{border:1px solid #c5d1dc;background:#f5f8fb;
        padding:8px;font-size:10px;display:flex;justify-content:space-between;gap:6px;}
      .ef-term-notice-a4 .ef-notice-balance b{white-space:nowrap;}
      .ef-term-notice-a4 .ef-notice-supplies{list-style:none;padding:0;margin:0;}
      .ef-term-notice-a4 .ef-notice-supplies li{display:flex;justify-content:space-between;
        align-items:flex-start;gap:6px;border-bottom:1px solid #e2e8ef;padding:6px 0;font-size:10px;}
      .ef-term-notice-a4 .ef-notice-supplies li span{overflow-wrap:anywhere;min-width:0;}
      .ef-term-notice-a4 .ef-notice-supplies li b{flex:0 0 auto;font-size:9.5px;white-space:nowrap;}
      .ef-term-notice-a4 .ef-notice-supplies small{display:block;font-size:9px;color:#64748b;margin-top:2px;}
      .ef-term-notice-a4 .ef-notice-instructions{border-top:1px solid #d7e0e8;
        padding-top:7px;font-size:10px;overflow-wrap:anywhere;}
      .ef-term-notice-a4 .ef-notice-instructions p{margin:3px 0 0;white-space:pre-wrap;}
      .ef-term-notice-a4 .ef-notice-disclaimer{font-size:10px;margin:13px 0 0;color:#536477;}
      .ef-term-notice-a4 .ef-doc-footer{margin-top:22px;padding-top:8px;border-top:1px solid #94a3b8;
        display:flex;justify-content:space-between;font-size:10px;color:#475569;gap:12px;}
      @media print{
        @page{size:A4 portrait;margin:11mm;}
        .ef-term-notice-a4{width:100%!important;min-width:0!important;min-height:0!important;
          padding:0!important;margin:0!important;border:0!important;box-shadow:none!important;
          break-after:page;page-break-after:always;}
        .ef-term-notice-a4 .ef-notice-term-panel{break-inside:avoid-page;}
        .ef-term-notice-a4 .ef-notice-table thead{display:table-header-group;}
        .ef-term-notice-a4 .ef-notice-table tr{break-inside:avoid-page;}
      }
    `}</style>
    <header className="ef-document-head">
      <div>{schoolLogo ? <img className="ef-document-logo" src={schoolLogo} alt="School crest" /> :
        <div className="ef-document-logo-fallback">SCHOOL<br/>CREST</div>}</div>
      <div style={{textAlign:"center"}}>
        <h1 className="ef-document-school">{schoolName}</h1>
        {schoolMotto && <p className="ef-document-motto">{schoolMotto}</p>}
        {branchName && <p className="ef-document-contact" style={{fontWeight:800}}>{branchName}</p>}
        {(schoolAddress || schoolPhone) && <p className="ef-document-contact">
          {[schoolAddress,schoolPhone ? `Tel: ${schoolPhone}` : ""].filter(Boolean).join(" • ")}</p>}
      </div>
      <div aria-hidden="true" />
    </header>
    <div className="ef-document-title"><h2>Term Fees &amp; Requirements Notice</h2>
      <p>{academicStructure} · Current term (left) / Next term (right)</p></div>
    <div className="ef-document-info">
      <div><small>Class</small><b>{className}</b></div>
      <div><small>Student</small><b>{studentName || "All Students"}</b></div>
      <div><small>Admission No.</small><b>{admissionNumber || "—"}</b></div>
    </div>
    <div className="ef-notice-term-grid">
      <section className="ef-notice-term-panel current" aria-label={`Current term: ${academicPeriod}`}>
        <header><small>Current Term</small><strong>{academicPeriod}</strong></header>
        <div className="ef-notice-term-body">
          <section><h3 className="ef-notice-section-heading">Fees for this term</h3>
            <SumRows items={fees} currency={currencyCode}/></section>
          {studentBalance !== undefined && <div className="ef-notice-balance">
            <span>Outstanding on issued invoice</span><b>{formatFinanceMoney(studentBalance,currencyCode)}</b>
          </div>}
          <section><h3 className="ef-notice-section-heading">Materials for this term</h3>
            <SupplyRows items={requirements}/></section>
          {(dueDate || notice) && <div className="ef-notice-instructions">
            <strong>Instructions</strong>{dueDate && <p>Due: {dueDate}</p>}{notice && <p>{notice}</p>}
          </div>}
        </div>
      </section>
      <section className="ef-notice-term-panel next" aria-label={`Next term: ${nextAcademicPeriod || "not configured"}`}>
        <header><small>Next Term</small><strong>{nextAcademicPeriod || "Not configured"}</strong>
          {nextAcademicStructure && nextAcademicStructure !== academicStructure && <small>{nextAcademicStructure}</small>}</header>
        <div className="ef-notice-term-body">
          {!nextAcademicPeriod ? <p className="ef-notice-muted">The next academic term has not yet been set up in the school calendar.</p> :
          !nextPeriodConfigured ? <p className="ef-notice-muted">No fee notice has been prepared for {nextAcademicPeriod}. Amounts and requirements will appear here once the school enters them.</p> : <>
            <section><h3 className="ef-notice-section-heading">Fees for next term</h3>
              <SumRows items={nextFees} currency={nextCurrencyCode}/></section>
            <section><h3 className="ef-notice-section-heading">Materials for next term</h3>
              <SupplyRows items={nextRequirements}/></section>
            {(nextDueDate || nextNotice) && <div className="ef-notice-instructions">
              <strong>Next term instructions</strong>{nextDueDate && <p>Due: {nextDueDate}</p>}
              {nextNotice && <p>{nextNotice}</p>}
            </div>}
          </>}
        </div>
      </section>
    </div>
    <p className="ef-notice-disclaimer">Materials are physical supplies, not additional monetary fees unless listed separately as fees. Current-term balances refer to issued student invoices only.</p>
    <footer className="ef-doc-footer"><span>Issued by School Administration · {issuedOn}</span>
      <span>Keep this notice for your records</span></footer>
  </article>;
}
