"use client";

/**
 * Eleeveon Schools — printable A4 next-term fee and materials notice.
 * A presentation component, like a student report template: it never reads
 * Dexie and never creates invoices or payment records.
 * Keep the amount payable independent from the physical supplies checklist.
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
  className: string;
  studentName?: string;
  admissionNumber?: string;
  fees: FeeStructureItem[];
  requirements: FeeStructureItem[];
  studentBalance?: number;
  currencyCode?: string;
  dueDate?: string;
  notice?: string;
  issuedOn: string;
};

export default function TermNoticePrintTemplate({
  schoolName, branchName, schoolLogo, schoolMotto, schoolAddress,
  schoolPhone, primaryColor = "#1e4f83", academicStructure,
  academicPeriod, className, studentName, admissionNumber,
  fees, requirements, studentBalance, dueDate, notice, issuedOn, currencyCode = "GHS",
}: TermNoticePrintTemplateProps) {
  const cash = (amount: number) => formatFinanceMoney(amount, currencyCode);
  const currencyLabel = getFinanceCurrency(currencyCode);
  const total = fees.reduce((value, item) => value + Math.max(0, Number(item.amount) || 0), 0);

  return (
    <article className="ef-print-sheet ef-term-notice-a4" style={{ "--notice-accent": primaryColor } as React.CSSProperties}>
      <style>{`
        .ef-term-notice-a4 { color:#142238; background:white; font-family:Arial, Helvetica,sans-serif;
          box-sizing:border-box; width:100%; padding:5mm 0 7mm; line-height:1.42; }
        .ef-term-notice-a4 * {box-sizing:border-box;}
        .ef-term-notice-a4 .ef-document-head {display:grid;grid-template-columns:82px minmax(0,1fr) 82px;gap:12px;align-items:center;padding-bottom:10px;border-bottom:2px solid #193655;}
        .ef-term-notice-a4 .ef-document-logo {width:78px;height:78px;object-fit:contain;}
        .ef-term-notice-a4 .ef-document-logo-fallback {display:grid;place-items:center;width:78px;height:78px;font-size:11px;text-align:center;border:1px solid #98a8bc;}
        .ef-term-notice-a4 .ef-document-school {font-size:21px;font-weight:900;line-height:1.1;margin:0;letter-spacing:.25px;text-transform:uppercase;overflow-wrap:anywhere;}
        .ef-term-notice-a4 .ef-document-motto {font-size:11px;font-style:italic;margin:4px 0 0;}
        .ef-term-notice-a4 .ef-document-contact {font-size:10px;margin:3px 0 0;}
        .ef-term-notice-a4 .ef-document-title {text-align:center;margin:14px 0 10px;padding:7px;border:1px solid #bac7d2;border-left:4px solid var(--notice-accent,#1e4f83);background:#f6f8fa;}
        .ef-term-notice-a4 .ef-document-title h2 {font-size:15.5px;letter-spacing:.4px;margin:0 0 2px;font-weight:850;text-transform:uppercase;}
        .ef-term-notice-a4 .ef-document-title p {margin:0;font-size:11px;font-weight:650;}
        .ef-term-notice-a4 .ef-document-info {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #c5cfd9;margin:0 0 12px;}
        .ef-term-notice-a4 .ef-document-info>div {padding:7px 9px;border-right:1px solid #c5cfd9;min-width:0;}
        .ef-term-notice-a4 .ef-document-info>div:last-child {border-right:0;}
        .ef-term-notice-a4 .ef-document-info small {display:block;text-transform:uppercase;font-size:9px;letter-spacing:.3px;color:#64748b;font-weight:850;}
        .ef-term-notice-a4 .ef-document-info b {display:block;font-size:12px;overflow-wrap:anywhere;}
        .ef-term-notice-a4 .ef-doc-section {margin-top:16px;break-inside:auto;}
        .ef-term-notice-a4 .ef-doc-section h3 {font-size:13.5px;text-transform:uppercase;margin:0 0 6px;color:#182d47;}
        .ef-term-notice-a4 .ef-doc-table {border-collapse:collapse;width:100%;table-layout:fixed;}
        .ef-term-notice-a4 .ef-doc-table th {background:#e9eff5;color:#1b3148;text-align:left;font-weight:800;font-size:11px;}
        .ef-term-notice-a4 .ef-doc-table td,.ef-term-notice-a4 .ef-doc-table th {border:1px solid #a9b6c5;padding:7px 8px;overflow-wrap:anywhere;font-size:11.5px;vertical-align:top;}
        .ef-term-notice-a4 .ef-doc-table .ef-doc-number {text-align:right;width:130px;font-variant-numeric:tabular-nums;}
        .ef-term-notice-a4 .ef-doc-total {font-weight:850;background:#f2f6fa;}
        .ef-term-notice-a4 .ef-doc-note {margin-top:14px;border:1px solid #bac7d2;padding:9px 11px;background:#fafbfc;font-size:11px;break-inside:avoid-page;}
        .ef-term-notice-a4 .ef-doc-note strong {display:block;margin-bottom:3px;}
        .ef-term-notice-a4 .ef-doc-footer {margin-top:24px;padding-top:8px;border-top:1px solid #94a3b8;display:flex;justify-content:space-between;font-size:10px;color:#475569;}
        @media print {
          @page {size:A4 portrait;margin:11mm;}
          .ef-term-notice-a4{width:100%;padding:0!important;page-break-after:always;break-after:page;box-shadow:none!important;border:0!important;}
          .ef-term-notice-a4 .ef-doc-note {break-inside:avoid-page;}
          .ef-term-notice-a4 thead{display:table-header-group;}
          .ef-term-notice-a4 tr{break-inside:avoid-page;}
        }
      `}</style>
      <header className="ef-document-head">
        <div>{schoolLogo ? <img className="ef-document-logo" src={schoolLogo} alt="School crest" /> : <div className="ef-document-logo-fallback">SCHOOL<br />CREST</div>}</div>
        <div style={{ textAlign:"center" }}>
          <h1 className="ef-document-school">{schoolName}</h1>
          {schoolMotto && <p className="ef-document-motto">{schoolMotto}</p>}
          {branchName && <p className="ef-document-contact" style={{fontWeight:800}}>{branchName}</p>}
          {(schoolAddress || schoolPhone) && <p className="ef-document-contact">{[schoolAddress,schoolPhone ? `Tel: ${schoolPhone}` : ""].filter(Boolean).join("  •  ")}</p>}
        </div>
        <div aria-hidden="true" />
      </header>
      <div className="ef-document-title">
        <h2>Next Term Fees &amp; Requirements</h2>
        <p>{academicStructure} · {academicPeriod}</p>
      </div>
      <div className="ef-document-info">
        <div><small>Class</small><b>{className}</b></div>
        <div><small>Student</small><b>{studentName || "All Students"}</b></div>
        <div><small>Admission No.</small><b>{admissionNumber || "—"}</b></div>
      </div>
      <section className="ef-doc-section">
        <h3>A. Fees Payable</h3>
        <table className="ef-doc-table">
          <thead><tr><th>Fee Description</th><th className="ef-doc-number">Amount ({currencyLabel.code})</th></tr></thead>
          <tbody>
            {fees.length ? fees.map((item,index)=><tr key={`${item.itemKey || item.name}-${index}`}><td>{item.name}</td><td className="ef-doc-number">{cash(item.amount)}</td></tr>) : <tr><td colSpan={2}>No fees specified for this period.</td></tr>}
            <tr className="ef-doc-total"><td>Total Fees</td><td className="ef-doc-number">{cash(total)}</td></tr>
          </tbody>
        </table>
        {studentBalance !== undefined && <p style={{fontSize:11.5,margin:"7px 0 0"}}><strong>Recorded outstanding balance:</strong> {cash(studentBalance)}</p>}
      </section>
      <section className="ef-doc-section">
        <h3>B. Books, Materials &amp; Supplies</h3>
        <table className="ef-doc-table">
          <thead><tr><th style={{width:"42%"}}>Item</th><th style={{width:92}}>Quantity</th><th>Instructions / Specification</th></tr></thead>
          <tbody>
            {requirements.length ? requirements.map((item,index)=><tr key={`${item.itemKey || item.name}-${index}`}><td>{item.name}{item.required === false ? " (Optional)" : ""}</td><td>{Math.max(1, Number(item.quantity) || 1)} {item.unit || "pcs"}</td><td>{item.instructions || "—"}</td></tr>) : <tr><td colSpan={3}>No physical supplies specified for this period.</td></tr>}
          </tbody>
        </table>
        <p style={{fontSize:10.5,color:"#526276",marginTop:5}}>Items listed here are physical supplies, not additional fees unless shown separately in Section A.</p>
      </section>
      {(dueDate || notice) && <div className="ef-doc-note"><strong>School Instructions</strong>{dueDate && <div>Payment / submission due date: {dueDate}</div>}{notice && <div>{notice}</div>}</div>}
      <footer className="ef-doc-footer"><span>Issued by School Administration · {issuedOn}</span><span>Keep this notice for your records</span></footer>
    </article>
  );
}
