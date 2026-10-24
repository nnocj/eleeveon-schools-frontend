"use client";
/** Eleeveon Schools — A4 Student Collections Register.
 * Printed at natural A4 size; on-screen preview is owned by the same
 * BranchReportPreview component used by Student Reports. */
import React from "react";
import { formatFinanceMoney } from "./financeCurrency";

export type TrackingPrintRow = {
  studentName: string;
  admissionNumber: string;
  billed: number;
  paid: number;
  balance: number;
  currencyCode: string;
  itemsReceived?: number;
  itemsRequired?: number;
  status: string;
};

type Props = {
  schoolName: string;
  branchName?: string;
  schoolLogo?: string;
  academicStructure: string;
  academicPeriod: string;
  className: string;
  currencyCode?: string;
  rows: TrackingPrintRow[];
  issuedOn: string;
};
export default function StudentTrackingPrintTemplate({
  schoolName, branchName, schoolLogo, academicStructure, academicPeriod,
  className, rows, issuedOn,
}: Props) {
  const totals = rows.reduce<Record<string, {billed:number;paid:number;balance:number}>>((all,row) => {
    const code = row.currencyCode || "GHS";
    const sum = all[code] || {billed:0, paid:0, balance:0};
    sum.billed += row.billed; sum.paid += row.paid; sum.balance += row.balance;
    all[code] = sum; return all;
  },{});
  const paidCount=rows.filter(r=>r.status.toLowerCase()==="paid").length;
  return <article className="ef-student-tracking-a4" data-a4-paper="portrait">
    <style>{`
      .ef-student-tracking-a4{width:794px;min-width:794px;max-width:794px;min-height:1123px;
        padding:38px 42px 35px;box-sizing:border-box;background:#fff;color:#152538;
        font:12px/1.44 Arial,Helvetica,sans-serif;overflow:visible;}
      .ef-student-tracking-a4 *{box-sizing:border-box;}
      .ef-student-tracking-a4 .finance-document-header{display:grid;grid-template-columns:74px 1fr;
        gap:15px;align-items:center;border-bottom:3px double #203c5e;padding:0 0 15px;margin-bottom:12px;}
      .ef-student-tracking-a4 .finance-document-logo{width:74px;height:74px;display:grid;place-items:center;
        border:1px solid #c5cfda;background:#fff;border-radius:4px;overflow:hidden;color:#203c5e;
        font-weight:900;font-size:24px;}
      .ef-student-tracking-a4 .finance-document-logo img{width:100%;height:100%;object-fit:contain;}
      .ef-student-tracking-a4 h1{font-size:21px;margin:0;line-height:1.13;font-weight:900;
        text-transform:uppercase;overflow-wrap:anywhere;letter-spacing:.15px;}
      .ef-student-tracking-a4 .finance-document-branch{font-size:11px;color:#45556b;margin-top:3px;}
      .ef-student-tracking-a4 .finance-document-title{font-size:14px;font-weight:900;
        color:#203c5e;margin:6px 0 0;letter-spacing:.2px;text-transform:uppercase;}
      .ef-student-tracking-a4 .finance-document-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
        border:1px solid #b9c5d3;margin:12px 0 14px;}
      .ef-student-tracking-a4 .finance-document-meta div{padding:8px;border-right:1px solid #b9c5d3;}
      .ef-student-tracking-a4 .finance-document-meta div:last-child{border-right:0;}
      .ef-student-tracking-a4 .finance-document-meta span{font-size:9px;font-weight:800;
        color:#5a6d81;text-transform:uppercase;letter-spacing:.25px;display:block;}
      .ef-student-tracking-a4 .finance-document-meta strong{font-size:11px;font-weight:850;
        color:#14263b;display:block;margin-top:3px;overflow-wrap:anywhere;}
      .ef-student-tracking-a4 .finance-document-summary{display:flex;justify-content:space-between;
        font-size:11px;color:#516176;margin:8px 0 5px;}
      .ef-student-tracking-a4 table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px;}
      .ef-student-tracking-a4 th,.ef-student-tracking-a4 td{padding:8px 5px;text-align:left;
        vertical-align:top;border:1px solid #b9c5d3;overflow-wrap:anywhere;}
      .ef-student-tracking-a4 th{background:#e7edf4;color:#213951;font-size:10px;
        font-weight:900;letter-spacing:.15px;}
      .ef-student-tracking-a4 tbody tr:nth-child(even){background:#f5f8fb;}
      .ef-student-tracking-a4 .finance-money{font-size:10px;font-variant-numeric:tabular-nums;}
      .ef-student-tracking-a4 .finance-total-grid{display:grid;grid-template-columns:1fr;gap:5px;margin:13px 0;}
      .ef-student-tracking-a4 .finance-total{border:1px solid #c5ced7;padding:8px 10px;
        font-size:10.5px;background:#f4f7fa;display:flex;flex-wrap:wrap;gap:8px 14px;}
      .ef-student-tracking-a4 footer{margin-top:18px;padding-top:9px;border-top:1px solid #b9c5d3;
        font-size:10px;color:#5a6d81;}
      @media print{
        @page{size:A4 portrait;margin:0;}
        .ef-student-tracking-a4{width:210mm!important;min-width:210mm!important;max-width:210mm!important;
          min-height:297mm!important;padding:11mm!important;margin:0!important;box-shadow:none!important;}
        .ef-student-tracking-a4 thead{display:table-header-group!important;}
        .ef-student-tracking-a4 tr,.ef-student-tracking-a4 .finance-total{break-inside:avoid-page;}
        .ef-student-tracking-a4 .finance-document-header{break-after:avoid-page;}
      }
    `}</style>
    <header className="finance-document-header">
      <div className="finance-document-logo">{schoolLogo ? <img src={schoolLogo} alt="School logo" /> : "ES"}</div>
      <div><h1>{schoolName}</h1>{branchName && <div className="finance-document-branch">{branchName}</div>}
        <div className="finance-document-title">Fee Tracking — Fees &amp; Materials Register</div>
      </div>
    </header>
    <div className="finance-document-meta">
      {[["Academic Structure",academicStructure],["Academic Period",academicPeriod],
        ["Class",className],["Prepared",issuedOn]].map(([label,value])=><div key={label}>
        <span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="finance-document-summary"><span><strong>{rows.length}</strong> Students</span>
      <span><strong>{paidCount}</strong> Fully Paid</span></div>
    <table><thead><tr><th style={{width:"4%"}}>#</th><th style={{width:"22%"}}>Student Name</th>
      <th style={{width:"12%"}}>Admission No.</th><th style={{width:"13%"}}>Billed</th>
      <th style={{width:"13%"}}>Paid</th><th style={{width:"13%"}}>Balance</th>
      <th style={{width:"10%"}}>Items</th><th style={{width:"13%"}}>Status</th></tr></thead>
      <tbody>{rows.map((row,index)=><tr key={`${row.admissionNumber}-${index}`}>
        <td>{index+1}</td><td><strong>{row.studentName}</strong></td><td>{row.admissionNumber}</td>
        <td className="finance-money">{formatFinanceMoney(row.billed,row.currencyCode)}</td>
        <td className="finance-money">{formatFinanceMoney(row.paid,row.currencyCode)}</td>
        <td className="finance-money">{formatFinanceMoney(row.balance,row.currencyCode)}</td>
        <td>{row.itemsRequired != null ? `${row.itemsReceived || 0}/${row.itemsRequired}` : "—"}</td>
        <td>{row.status}</td></tr>)}</tbody>
    </table>
    <div className="finance-total-grid">{Object.entries(totals).map(([code,sum])=><div key={code} className="finance-total">
      <strong>{code}</strong><span>Billed: {formatFinanceMoney(sum.billed,code)}</span>
      <span>Received: {formatFinanceMoney(sum.paid,code)}</span>
      <span>Outstanding: {formatFinanceMoney(sum.balance,code)}</span></div>)}</div>
    <footer>Prepared by School Administration · Based on issued invoices and settled payments.</footer>
  </article>;
}
