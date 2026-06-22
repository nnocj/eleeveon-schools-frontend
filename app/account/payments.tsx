"use client";

import React, { useEffect, useMemo, useState } from "react";

import { apiClient } from "../lib/api/apiClient";
import { useSettings } from "../context/settings-context";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

type Payment = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  provider?: string | null;
  status: PaymentStatus;
  providerReference?: string | null;
  receiptNumber?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  payerEmail?: string | null;
  paidAt?: string | null;
  createdAt: string;
  note?: string | null;
};

type PaymentForm = {
  title: string;
  amount: string;
  method: "momo" | "cash" | "bank" | "card" | "manual";
  payerName: string;
  payerPhone: string;
  payerEmail: string;
  providerReference: string;
  note: string;
};

const emptyForm = (): PaymentForm => ({
  title: "",
  amount: "",
  method: "momo",
  payerName: "",
  payerPhone: "",
  payerEmail: "",
  providerReference: "",
  note: "",
});

const money = (value: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function PaymentsPage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>(emptyForm());

  const loadPayments = async () => {
    try {
      setLoading(true);
      const data = await apiClient<Payment[]>("/billing/payments");
      setPayments(data || []);
    } catch (error: any) {
      console.error("Failed to load payments:", error);
      alert(error?.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const summary = useMemo(() => {
    const paid = payments.filter((payment) => payment.status === "paid");

    return {
      records: payments.length,
      total: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      paid: paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      pending: payments.filter((payment) => payment.status === "pending").length,
    };
  }, [payments]);

  const updateForm = (patch: Partial<PaymentForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submitPayment = async () => {
    const amount = Number(form.amount);

    if (!amount || amount <= 0) {
      alert("Enter a valid payment amount");
      return;
    }

    try {
      setSaving(true);

      await apiClient("/billing/payments/manual", {
        method: "POST",
        body: {
          title: form.title.trim() || "Manual subscription payment",
          amount,
          currency: "GHS",
          method: form.method,
          provider: "manual",
          payerName: form.payerName.trim() || undefined,
          payerPhone: form.payerPhone.trim() || undefined,
          payerEmail: form.payerEmail.trim() || undefined,
          providerReference: form.providerReference.trim() || undefined,
          note: form.note.trim() || undefined,
        },
      });

      setForm(emptyForm());
      setDrawerOpen(false);
      await loadPayments();
    } catch (error: any) {
      console.error("Failed to record payment:", error);
      alert(error?.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="pay-page" style={{ "--pay-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pay-state-card">Loading payments...</section>
      </main>
    );
  }

  return (
    <main className="pay-page" style={{ "--pay-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="pay-hero">
        <div>
          <p>Billing Payments</p>
          <h2>{money(summary.paid)}</h2>
          <span>
            {summary.records} payment record(s) · {summary.pending} pending
          </span>
        </div>

        <button type="button" onClick={() => setDrawerOpen(true)}>
          + Record Payment
        </button>
      </section>

      <section className="pay-summary-grid">
        <SummaryCard label="Total Recorded" value={money(summary.total)} icon="💳" />
        <SummaryCard label="Paid Amount" value={money(summary.paid)} icon="✅" />
        <SummaryCard label="Payment Records" value={summary.records} icon="🧾" />
      </section>

      <section className="pay-list">
        {payments.map((payment) => (
          <article key={payment.id} className="pay-card">
            <div className="pay-card-main">
              <h3>{money(payment.amount, payment.currency)}</h3>
              <p>
                {payment.method?.toUpperCase() || "PAYMENT"}
                {payment.provider ? ` · ${payment.provider}` : ""}
              </p>
              <span>
                {payment.receiptNumber ||
                  payment.providerReference ||
                  payment.payerName ||
                  "No reference"}
              </span>
            </div>

            <div className="pay-card-side">
              <StatusBadge status={payment.status} />
              <small>
                {new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}
              </small>
            </div>
          </article>
        ))}

        {!payments.length && (
          <section className="pay-empty">
            <div>💰</div>
            <h3>No payments recorded</h3>
            <p>Record manual subscription payments here.</p>
            <button type="button" onClick={() => setDrawerOpen(true)}>
              Record First Payment
            </button>
          </section>
        )}
      </section>

      {drawerOpen && (
        <div className="pay-drawer-layer">
          <button
            type="button"
            className="pay-drawer-overlay"
            aria-label="Close payment drawer"
            onClick={() => setDrawerOpen(false)}
          />

          <aside className="pay-drawer">
            <div className="pay-drawer-head">
              <div>
                <p>Manual Payment</p>
                <h2>Record Payment</h2>
                <span>This records money received for this account subscription.</span>
              </div>

              <button type="button" onClick={() => setDrawerOpen(false)}>
                ✕
              </button>
            </div>

            <div className="pay-form-grid">
              <Field label="Payment Title">
                <input
                  value={form.title}
                  onChange={(event) => updateForm({ title: event.target.value })}
                  placeholder="Manual subscription payment"
                />
              </Field>

              <Field label="Amount">
                <input
                  type="number"
                  value={form.amount}
                  onChange={(event) => updateForm({ amount: event.target.value })}
                  placeholder="Amount received"
                />
              </Field>

              <Field label="Payment Method">
                <select
                  value={form.method}
                  onChange={(event) =>
                    updateForm({ method: event.target.value as PaymentForm["method"] })
                  }
                >
                  <option value="momo">Mobile Money</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                  <option value="manual">Manual</option>
                </select>
              </Field>

              <div className="pay-two">
                <Field label="Payer Name">
                  <input
                    value={form.payerName}
                    onChange={(event) => updateForm({ payerName: event.target.value })}
                    placeholder="Optional"
                  />
                </Field>

                <Field label="Payer Phone">
                  <input
                    value={form.payerPhone}
                    onChange={(event) => updateForm({ payerPhone: event.target.value })}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <Field label="Payer Email">
                <input
                  value={form.payerEmail}
                  onChange={(event) => updateForm({ payerEmail: event.target.value })}
                  placeholder="Optional"
                />
              </Field>

              <Field label="Reference Number">
                <input
                  value={form.providerReference}
                  onChange={(event) => updateForm({ providerReference: event.target.value })}
                  placeholder="MoMo transaction ID, bank ref, receipt ref..."
                />
              </Field>

              <Field label="Note">
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => updateForm({ note: event.target.value })}
                  placeholder="Optional payment note"
                />
              </Field>

              <button
                type="button"
                className="pay-save-btn"
                onClick={submitPayment}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <article className="pay-summary-card">
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  return <b className={`pay-status ${status}`}>{status}</b>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="pay-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const css = `
.pay-page {
  width: 100%;
  max-width: 100%;
  display: grid;
  gap: 10px;
  color: var(--text, #0f172a);
  overflow-x: hidden;
}

.pay-page *,
.pay-page *::before,
.pay-page *::after {
  box-sizing: border-box;
}

.pay-page button,
.pay-page input,
.pay-page select,
.pay-page textarea {
  font: inherit;
  max-width: 100%;
}

.pay-hero,
.pay-summary-card,
.pay-card,
.pay-empty,
.pay-state-card {
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 14px 34px rgba(15, 23, 42, .055);
  border-radius: 24px;
  overflow: hidden;
}

.pay-hero {
  padding: 14px;
  display: grid;
  gap: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--pay-primary) 12%, #fff), #fff 65%);
}

.pay-hero p,
.pay-drawer-head p {
  margin: 0;
  color: var(--pay-primary);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.pay-hero h2 {
  margin: 2px 0 0;
  font-size: clamp(24px, 8vw, 38px);
  font-weight: 1000;
  letter-spacing: -.06em;
}

.pay-hero span,
.pay-drawer-head span {
  display: block;
  margin-top: 4px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pay-hero button,
.pay-save-btn,
.pay-empty button {
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  background: var(--pay-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.pay-summary-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.pay-summary-card {
  min-width: 0;
  padding: 12px;
}

.pay-summary-card div {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--pay-primary) 12%, #fff);
}

.pay-summary-card strong,
.pay-summary-card span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pay-summary-card strong {
  margin-top: 10px;
  font-size: 20px;
  font-weight: 1000;
}

.pay-summary-card span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.pay-list {
  display: grid;
  gap: 8px;
}

.pay-card {
  padding: 13px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.pay-card-main,
.pay-card-side {
  min-width: 0;
}

.pay-card-main h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.pay-card-main p,
.pay-card-main span,
.pay-card-side small {
  display: block;
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pay-card-side {
  text-align: right;
  flex: 0 0 auto;
}

.pay-status {
  display: inline-flex;
  border-radius: 999px;
  padding: 6px 9px;
  background: rgba(100,116,139,.12);
  color: #475569;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.pay-status.paid {
  background: rgba(34,197,94,.12);
  color: #16a34a;
}

.pay-status.pending {
  background: rgba(245,158,11,.14);
  color: #b45309;
}

.pay-status.failed,
.pay-status.cancelled {
  background: rgba(239,68,68,.12);
  color: #dc2626;
}

.pay-status.refunded {
  background: rgba(59,130,246,.12);
  color: #2563eb;
}

.pay-empty,
.pay-state-card {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 220px;
  padding: 24px;
  text-align: center;
  color: var(--muted, #64748b);
}

.pay-empty div {
  font-size: 34px;
}

.pay-empty h3 {
  margin: 8px 0 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.pay-empty p {
  margin: 5px 0 12px;
  font-size: 13px;
  line-height: 1.5;
}

.pay-empty button {
  padding: 0 16px;
}

.pay-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.pay-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.pay-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 540px);
  max-width: 100vw;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  overflow-y: auto;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.pay-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  background: var(--surface, #fff);
}

.pay-drawer-head div {
  min-width: 0;
}

.pay-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 24px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pay-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 15px;
  border: 1px solid rgba(148, 163, 184, .24);
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.pay-form-grid {
  display: grid;
  gap: 11px;
}

.pay-two {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.pay-field {
  display: grid;
  gap: 6px;
}

.pay-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.pay-field input,
.pay-field select,
.pay-field textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  min-height: 44px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 750;
  outline: none;
}

.pay-field textarea {
  padding: 12px;
  resize: vertical;
}

.pay-save-btn {
  width: 100%;
  margin-top: 4px;
}

.pay-save-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

@media (min-width: 680px) {
  .pay-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .pay-hero button {
    padding: 0 18px;
  }

  .pay-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pay-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;