"use client";
/** Print-only, A4-safe student collections / requirements register. */
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
export default function StudentTrackingPrintTemplate({
  schoolName, branchName, academicStructure, academicPeriod,
  className, rows, issuedOn,
}: {
  schoolName: string; branchName?: string; academicStructure: string;
  academicPeriod: string; className: string; currencyCode?: string;
  rows: TrackingPrintRow[]; issuedOn: string;
}) {
  const totalsByCurrency = rows.reduce<Record<string, {billed:number;paid:number;balance:number}>>((acc,row) => {
    const currency = row.currencyCode || "GHS";
    const current = acc[currency] || {billed:0,paid:0,balance:0};
    current.billed += row.billed; current.paid += row.paid; current.balance += row.balance;
    acc[currency] = current;
    return acc;
  },{});
  return <article className="ef-tracking-print-sheet">
    <style>{`
      .ef-tracking-print-sheet{font:11px/1.4 Arial,Helvetica,sans-serif;color:#172638;background:white;
        padding:3mm 0;box-sizing:border-box;width:100%;}
      .ef-tracking-print-sheet *{box-sizing:border-box;}
      .ef-tracking-print-sheet header{text-align:center;padding-bottom:10px;border-bottom:2px solid #273c52;}
      .ef-tracking-print-sheet h1{font-size:19px;margin:0;text-transform:uppercase;letter-spacing:.3px;}
      .ef-tracking-print-sheet h2{font-size:14px;margin:10px 0 3px;text-align:center;}
      .ef-tracking-print-sheet p{margin:3px 0;}
      .ef-tracking-print-sheet table{width:100%;border-collapse:collapse;margin-top:11px;table-layout:fixed;}
      .ef-tracking-print-sheet th,.ef-tracking-print-sheet td{border:1px solid #b4c0ca;
        padding:6px 5px;vertical-align:top;overflow-wrap:anywhere;font-size:10px;}
      .ef-tracking-print-sheet th{background:#e7edf3;color:#22364b;text-align:left;font-weight:800;}
      .ef-tracking-print-sheet td:nth-child(n+3){font-variant-numeric:tabular-nums;}
      .ef-tracking-print-sheet .ef-tracking-money{white-space:nowrap;font-size:9.2px;}
      .ef-tracking-print-sheet .ef-tracking-totals{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;}
      .ef-tracking-print-sheet .ef-tracking-totals div{border:1px solid #b4c0ca;padding:7px 9px;}
      .ef-tracking-print-sheet footer{margin-top:12px;border-top:1px solid #b4c0ca;padding-top:8px;color:#536173;}
      @media print{@page{size:A4 portrait;margin:11mm;}
        .ef-tracking-print-sheet{break-before:auto;break-inside:auto;padding:0!important;}
        .ef-tracking-print-sheet thead{display:table-header-group;}
        .ef-tracking-print-sheet tr{break-inside:avoid-page;}
        .ef-tracking-print-sheet header{break-after:avoid-page;}}
    `}</style>
    <header><h1>{schoolName}</h1>{branchName && <p>{branchName}</p>}
      <h2>Student Fees &amp; Materials Register</h2>
      <p>{academicStructure} · {academicPeriod} · {className}</p>
      <p>{rows.length} student{rows.length === 1 ? "" : "s"}</p>
    </header>
    <table><thead><tr><th style={{width:"5%"}}>No.</th><th style={{width:"24%"}}>Student</th>
      <th style={{width:"12%"}}>Admission</th><th style={{width:"12%"}}>Billed</th>
      <th style={{width:"12%"}}>Paid</th><th style={{width:"12%"}}>Balance</th>
      <th style={{width:"11%"}}>Items</th><th style={{width:"12%"}}>Status</th></tr></thead>
      <tbody>{rows.map((row,index) => <tr key={`${row.admissionNumber}-${index}`}>
        <td>{index+1}</td><td><strong>{row.studentName}</strong></td><td>{row.admissionNumber}</td>
        <td className="ef-tracking-money">{formatFinanceMoney(row.billed,row.currencyCode)}</td>
        <td className="ef-tracking-money">{formatFinanceMoney(row.paid,row.currencyCode)}</td>
        <td className="ef-tracking-money">{formatFinanceMoney(row.balance,row.currencyCode)}</td>
        <td>{row.itemsRequired != null ? `${row.itemsReceived || 0}/${row.itemsRequired}` : "—"}</td>
        <td>{row.status}</td>
      </tr>)}</tbody></table>
    <section className="ef-tracking-totals" aria-label="Totals by currency">
      {Object.entries(totalsByCurrency).map(([currency,total])=><div key={currency}>
        <strong>{currency}</strong> · Billed: {formatFinanceMoney(total.billed,currency)} · Paid: {formatFinanceMoney(total.paid,currency)} · Balance: {formatFinanceMoney(total.balance,currency)}
      </div>)}
    </section>
    <footer>Prepared by School Administration · {issuedOn} · Based on recorded payments and issued invoices.</footer>
  </article>;
}
