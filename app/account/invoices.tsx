// ======================================================
// FILE 4: app/account/invoices.tsx
// ======================================================

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api/apiClient";
import { useSettings } from "../context/settings-context";

type Payment = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  receiptNumber?: string | null;
  createdAt: string;
  paidAt?: string | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    status: string;
    dueDate?: string | null;
  } | null;
};

const money = (amount: number, currency = "GHS") => new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));

export default function InvoicesPage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setPayments(await apiClient<Payment[]>("/billing/payments"));
      } catch (error: any) {
        alert(error?.message || "Failed to load invoice data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const invoiceRows = useMemo(() => {
    const withInvoice = payments.filter((p) => p.invoice);
    if (withInvoice.length) return withInvoice;
    return payments;
  }, [payments]);

  if (loading) return <section className="inv-state"><style>{css}</style>Loading invoices...</section>;

  return (
    <main className="inv-page" style={{ "--inv-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="inv-hero"><p>Billing Documents</p><h2>Invoices</h2><span>Invoice issuing is ready for backend expansion. Current view uses payment receipts where formal invoices are not yet generated.</span></section>
      <section className="inv-list">{invoiceRows.map((row) => <article key={row.invoice?.id || row.id} className="inv-card"><div><h3>{row.invoice?.invoiceNumber || row.receiptNumber || `Receipt ${row.id.slice(0,8)}`}</h3><p>{row.invoice ? "Invoice" : "Payment receipt"} · {new Date(row.invoice?.dueDate || row.paidAt || row.createdAt).toLocaleDateString()}</p></div><div><strong>{money(row.invoice?.total || row.amount,row.currency)}</strong><span className={row.invoice?.status || row.status}>{row.invoice?.status || row.status}</span></div></article>)} {!invoiceRows.length && <section className="inv-empty">No invoices or receipts found yet.</section>}</section>
    </main>
  );
}

const css = `
.inv-page{display:grid;gap:10px;color:var(--text,#0f172a)}.inv-hero,.inv-card,.inv-empty,.inv-state{background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 14px 34px rgba(15,23,42,.055);border-radius:24px}.inv-hero{padding:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--inv-primary) 12%,#fff),#fff 65%)}.inv-hero p{margin:0;color:var(--inv-primary);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.inv-hero h2{margin:3px 0 0;font-size:clamp(24px,8vw,36px);font-weight:1000;letter-spacing:-.06em}.inv-hero span{display:block;margin-top:5px;color:#64748b;font-size:13px;line-height:1.5;font-weight:750}.inv-list{display:grid;gap:8px}.inv-card{padding:13px;display:grid;gap:10px}.inv-card h3{margin:0;font-size:16px;font-weight:1000}.inv-card p{margin:4px 0 0;color:#64748b;font-size:12px;font-weight:750}.inv-card strong{display:block;font-size:18px;font-weight:1000}.inv-card span{display:inline-flex;margin-top:5px;border-radius:999px;padding:6px 9px;background:rgba(100,116,139,.12);font-size:11px;font-weight:950;text-transform:uppercase}.inv-card span.paid{background:rgba(34,197,94,.12);color:#16a34a}.inv-card span.overdue,.inv-card span.failed{background:rgba(239,68,68,.12);color:#dc2626}.inv-empty,.inv-state{padding:24px;text-align:center;color:#64748b;font-weight:900}@media(min-width:640px){.inv-card{grid-template-columns:1fr auto;align-items:center}.inv-card div:last-child{text-align:right}}
`;


