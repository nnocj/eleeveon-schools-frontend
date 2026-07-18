"use client";

/**
 * app/owner/payments.tsx
 * ---------------------------------------------------------
 * OWNER — PAYMENTS
 * Golden compact rewrite
 * ---------------------------------------------------------
 *
 * Data behavior preserved:
 * - Requires authenticated account.
 * - Loads payments from /billing/payments.
 * - Caches live payments locally.
 * - Falls back to local IndexedDB payments when live server is unavailable.
 * - Keeps manual confirmation restrictions for cash, bank and manual payments.
 * - Keeps print receipt behavior.
 *
 * UI upgrade:
 * - Removed large hero/header block.
 * - Removed large context/safety cards.
 * - Removed large always-visible summary cards.
 * - Uses Golden compact pattern:
 *   - search + refresh + filter + more top row
 *   - active filters as compact chips
 *   - payments shown as compact StudentEnrollment-style rows
 *   - table and analytics moved to More sheet view switch
 *   - payment details use compact bottom sheet/drawer
 *
 * Dashboard-shell safe:
 * - Mobile-first.
 * - No horizontal overflow.
 * - Theme variables are used for dark mode and local density support.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { apiRequest } from "../lib/platformApi";
import { db } from "../lib/db/db";

type ViewMode = "cards" | "table" | "analytics";
type StatusFilter =
  | "all"
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled";

type MethodFilter =
  | "all"
  | "momo"
  | "card"
  | "bank"
  | "cash"
  | "manual";

type Payment = {
  id?: string;
  accountId?: string;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  amount?: number;
  currency?: string;
  method?: string;
  provider?: string | null;
  status?: string;
  providerReference?: string | null;
  accessCode?: string | null;
  authorizationUrl?: string | null;
  receiptNumber?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  payerEmail?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  note?: string | null;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
  invoice?: {
    id?: string;
    invoiceNumber?: string;
    total?: number;
    currency?: string;
    status?: string;
  } | null;
  subscription?: {
    id?: string;
    status?: string;
    billingCycle?: string;
    plan?: {
      id?: string;
      name?: string;
      code?: string;
    };
  } | null;
};

type ConfirmForm = {
  paymentId: string;
  receiptNumber: string;
  paidAt: string;
  note: string;
};

const DEFAULT_CONFIRM_FORM: ConfirmForm = {
  paymentId: "",
  receiptNumber: "",
  paidAt: "",
  note: "",
};

function normalizeArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.payments)) return payload.payments;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function money(amount?: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency || "GHS",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function safeDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function safeDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(status?: string) {
  return String(status || "pending").toLowerCase();
}

function normalizeMethod(method?: string) {
  return String(method || "manual").toLowerCase();
}

function statusTone(status?: string): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  const value = normalizeStatus(status);
  if (value === "paid") return "green";
  if (["failed", "cancelled"].includes(value)) return "red";
  if (["pending", "processing"].includes(value)) return "orange";
  if (value === "refunded") return "purple";
  return "gray";
}

function methodIcon(method?: string) {
  const value = normalizeMethod(method);
  if (value === "momo") return "📱";
  if (value === "card") return "💳";
  if (value === "bank") return "🏦";
  if (value === "cash") return "💵";
  return "🧾";
}

function paymentTitle(payment: Payment) {
  return (
    payment.receiptNumber ||
    payment.providerReference ||
    payment.invoice?.invoiceNumber ||
    `Payment ${payment.id?.slice(0, 8) || ""}`
  );
}

function canConfirmManually(payment: Payment) {
  const status = normalizeStatus(payment.status);
  const method = normalizeMethod(payment.method);
  const provider = String(payment.provider || "").toLowerCase();

  return (
    ["pending", "processing"].includes(status) &&
    ["cash", "bank", "manual"].includes(method) &&
    (!provider || provider === "manual" || provider === "cash" || provider === "bank")
  );
}

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) {
    if (anyDb[name]) return anyDb[name];
  }
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  return table?.toArray ? table.toArray() : [];
}

async function cachePaymentsLocally(rows: Payment[]) {
  const table = getTable<Payment>("appPayments", "payments");
  if (!table?.put) return;

  for (const row of rows) {
    if (!row?.id) continue;
    try {
      await table.put(row);
    } catch {
      // Local cache should never block live billing work.
    }
  }
}

export default function PaymentsPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [search, setSearch] = useState("");

  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [confirmForm, setConfirmForm] = useState<ConfirmForm>(DEFAULT_CONFIRM_FORM);

  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setPayments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setNotice("");
      setMessage("");

      try {
        const remote = await apiRequest<any>("/billing/payments");
        const rows = normalizeArray(remote) as Payment[];
        setPayments(rows);
        await cachePaymentsLocally(rows);
      } catch {
        const localRows = await tableToArray<Payment>("appPayments", "payments");
        setPayments(localRows.filter((row) => !row.accountId || row.accountId === accountId));
        setNotice("Live billing server was not available, so this page is showing the latest payment data saved on this device.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const status = normalizeStatus(payment.status);
      const method = normalizeMethod(payment.method);

      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (methodFilter !== "all" && method !== methodFilter) return false;

      if (!query) return true;

      return `${payment.receiptNumber || ""} ${payment.providerReference || ""} ${
        payment.payerName || ""
      } ${payment.payerPhone || ""} ${payment.payerEmail || ""} ${payment.status || ""} ${
        payment.method || ""
      } ${payment.provider || ""} ${payment.invoice?.invoiceNumber || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [methodFilter, payments, search, statusFilter]);

  const currency = payments[0]?.currency || "GHS";

  const summary = useMemo(() => {
    const paidPayments = payments.filter((row) => normalizeStatus(row.status) === "paid");
    const pendingPayments = payments.filter((row) =>
      ["pending", "processing"].includes(normalizeStatus(row.status))
    );
    const failedPayments = payments.filter((row) =>
      ["failed", "cancelled"].includes(normalizeStatus(row.status))
    );
    const refundedPayments = payments.filter((row) => normalizeStatus(row.status) === "refunded");

    return {
      payments: payments.length,
      collected: paidPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      pending: pendingPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      failed: failedPayments.length,
      refunded: refundedPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      manualConfirmable: payments.filter(canConfirmManually).length,
    };
  }, [payments]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();

    for (const payment of payments) {
      const status = normalizeStatus(payment.status);
      const current = map.get(status) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(payment.amount || 0);
      map.set(status, current);
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.count - a.count);
  }, [payments]);

  const methodBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();

    for (const payment of payments) {
      const method = normalizeMethod(payment.method);
      const current = map.get(method) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(payment.amount || 0);
      map.set(method, current);
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const activeFilterCount = useMemo(() => {
    return [statusFilter !== "all" ? statusFilter : "", methodFilter !== "all" ? methodFilter : ""].filter(Boolean).length;
  }, [methodFilter, statusFilter]);

  function clearFilters() {
    setStatusFilter("all");
    setMethodFilter("all");
  }

  function openDetails(payment: Payment) {
    setSelectedPayment(payment);
    setConfirmForm({
      paymentId: payment.id || "",
      receiptNumber: payment.receiptNumber || `RCPT-${Date.now()}`,
      paidAt: new Date().toISOString().slice(0, 10),
      note: payment.note || "",
    });
    setMessage("");
  }

  async function confirmManualPayment() {
    if (!selectedPayment?.id) {
      setMessage("Missing payment ID.");
      return;
    }

    if (!canConfirmManually(selectedPayment)) {
      setMessage("Only pending manual, cash, or bank payments can be confirmed from this page.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm this payment as paid?\n\n${paymentTitle(selectedPayment)}\n${money(
        selectedPayment.amount,
        selectedPayment.currency
      )}\n\nThis should only be done after money has truly been received.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage("");

      const payload = {
        receiptNumber: confirmForm.receiptNumber.trim() || undefined,
        paidAt: confirmForm.paidAt ? new Date(confirmForm.paidAt).toISOString() : undefined,
        note: confirmForm.note.trim() || undefined,
      };

      const response = await apiRequest<any>(
        `/billing/payments/${encodeURIComponent(selectedPayment.id)}/confirm`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        } as any
      );

      await cachePaymentsLocally([response as Payment]);
      setSelectedPayment(null);
      setNotice("Payment confirmed. The backend should now reconcile the invoice and activate the subscription where applicable.");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Payment could not be confirmed.");
    } finally {
      setSaving(false);
    }
  }

  function printReceipt(payment: Payment) {
    const receiptHtml = `
      <html>
        <head>
          <title>${paymentTitle(payment)}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;color:#111827}
            .receipt{max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:18px;padding:22px}
            h1{margin:0 0 4px;font-size:24px}
            p{margin:4px 0;color:#4b5563}
            table{width:100%;border-collapse:collapse;margin-top:18px}
            td{padding:10px 0;border-bottom:1px solid #e5e7eb}
            td:last-child{text-align:right;font-weight:700;color:#111827}
            .status{display:inline-block;margin-top:12px;padding:7px 12px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:800}
          </style>
        </head>
        <body>
          <div class="receipt">
            <h1>Eleeveon Schools Receipt</h1>
            <p>Owner account payment record</p>
            <span class="status">${payment.status || "pending"}</span>
            <table>
              <tr><td>Receipt</td><td>${payment.receiptNumber || "Not set"}</td></tr>
              <tr><td>Reference</td><td>${payment.providerReference || "Not set"}</td></tr>
              <tr><td>Amount</td><td>${money(payment.amount, payment.currency)}</td></tr>
              <tr><td>Method</td><td>${payment.method || "Not set"}</td></tr>
              <tr><td>Provider</td><td>${payment.provider || "manual"}</td></tr>
              <tr><td>Payer</td><td>${payment.payerName || payment.payerEmail || payment.payerPhone || "Not set"}</td></tr>
              <tr><td>Invoice</td><td>${payment.invoice?.invoiceNumber || payment.invoiceId || "Not linked"}</td></tr>
              <tr><td>Paid At</td><td>${safeDateTime(payment.paidAt || payment.createdAt)}</td></tr>
            </table>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=720,height=800");
    if (!win) return;
    win.document.write(receiptHtml);
    win.document.close();
  }

  if (accountLoading || settingsLoading || loading) {
    return (
      <main className="ba-page payments-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening payments...</h2>
          <p>Loading payment records, receipts and confirmation status.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page payments-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Payments search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder="Search payments..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search payments"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={load} aria-label="Refresh payments" title="Refresh">
          ↻
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open payment filters"
          title="Filters"
        >
          ☷
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {notice ? (
        <section className="ba-slim-notice">
          <span className="status-dot-mini orange" />
          <p>{notice}</p>
        </section>
      ) : null}

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active payment filters">
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter} ×
            </button>
          )}
          {methodFilter !== "all" && (
            <button type="button" onClick={() => setMethodFilter("all")}>
              Method: {methodFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "analytics" && (
        <section className="analytics-grid">
          <Breakdown title="Status Breakdown" items={statusBreakdown} total={payments.length} currency={currency} />
          <Breakdown title="Method Breakdown" items={methodBreakdown} total={payments.length} currency={currency} />
        </section>
      )}

      {viewMode === "table" && (
        <section className="ba-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Payments ({filteredPayments.length})</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Payer</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Paid At</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id || payment.providerReference || payment.receiptNumber}>
                    <td>
                      <strong>{paymentTitle(payment)}</strong>
                      <span>{payment.providerReference || payment.id || "No reference"}</span>
                    </td>
                    <td>{money(payment.amount, payment.currency)}</td>
                    <td>{methodIcon(payment.method)} {payment.method || "manual"}</td>
                    <td>{payment.payerName || payment.payerEmail || payment.payerPhone || "Not set"}</td>
                    <td>{payment.invoice?.invoiceNumber || payment.invoiceId || "Not linked"}</td>
                    <td><Chip tone={statusTone(payment.status)}>{payment.status || "pending"}</Chip></td>
                    <td>{safeDate(payment.paidAt || payment.createdAt)}</td>
                    <td>
                      <button className="table-action" type="button" onClick={() => openDetails(payment)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredPayments.length && <div className="ba-empty-table">No payment matches the selected filters.</div>}
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredPayments.map((payment) => (
            <button
              key={payment.id || payment.providerReference || payment.receiptNumber}
              type="button"
              className="payment-row"
              onClick={() => openDetails(payment)}
            >
              <span className="payment-avatar">{methodIcon(payment.method)}</span>

              <span className="payment-main">
                <strong>{paymentTitle(payment)}</strong>
                <small>
                  {money(payment.amount, payment.currency)} · {payment.method || "manual"} · {payment.provider || "recorded"}
                </small>
                <em>
                  {payment.payerName || payment.payerEmail || payment.payerPhone || "No payer"} · {safeDate(payment.paidAt || payment.createdAt)}
                </em>
              </span>

              <span className="payment-side">
                <span className={`status-dot-mini ${statusTone(payment.status)}`} />
                <i>⋯</i>
              </span>
            </button>
          ))}

          {!filteredPayments.length && <EmptyCard text="No payment matches the selected filters." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          statusFilter={statusFilter}
          methodFilter={methodFilter}
          setStatusFilter={setStatusFilter}
          setMethodFilter={setMethodFilter}
          clearFilters={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          summary={summary}
          currency={currency}
          filteredCount={filteredPayments.length}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedPayment && (
        <PaymentSheet
          payment={selectedPayment}
          message={message}
          saving={saving}
          confirmForm={confirmForm}
          setConfirmForm={setConfirmForm}
          confirmManualPayment={confirmManualPayment}
          printReceipt={printReceipt}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </main>
  );
}

function FilterSheet({
  statusFilter,
  methodFilter,
  setStatusFilter,
  setMethodFilter,
  clearFilters,
  onClose,
}: {
  statusFilter: StatusFilter;
  methodFilter: MethodFilter;
  setStatusFilter: (value: StatusFilter) => void;
  setMethodFilter: (value: MethodFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Filter payments by status and method.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label>
            <span>Method</span>
            <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as MethodFilter)}>
              <option value="all">All methods</option>
              <option value="momo">Momo</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="manual">Manual</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={clearFilters}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  summary,
  currency,
  filteredCount,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  summary: {
    payments: number;
    collected: number;
    pending: number;
    failed: number;
    refunded: number;
    manualConfirmable: number;
  };
  currency: string;
  filteredCount: number;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Payments</h2>
            <p>{filteredCount} of {summary.payments} payment record(s) shown.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="payment-insights">
          <span><b>{money(summary.collected, currency)}</b>Collected</span>
          <span><b>{money(summary.pending, currency)}</b>Pending</span>
          <span><b>{summary.failed}</b>Failed</span>
          <span><b>{summary.manualConfirmable}</b>Manual review</span>
        </div>

        <div className="ba-menu-list">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <span>☰</span>
            <b>List view</b>
            <small>Compact payment rows</small>
          </button>

          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop payment records</small>
          </button>

          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            <span>◔</span>
            <b>Analytics</b>
            <small>Status and method breakdown</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload payment data</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function PaymentSheet({
  payment,
  message,
  saving,
  confirmForm,
  setConfirmForm,
  confirmManualPayment,
  printReceipt,
  onClose,
}: {
  payment: Payment;
  message: string;
  saving: boolean;
  confirmForm: ConfirmForm;
  setConfirmForm: React.Dispatch<React.SetStateAction<ConfirmForm>>;
  confirmManualPayment: () => void | Promise<void>;
  printReceipt: (payment: Payment) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop detail-layer" role="dialog" aria-modal="true">
      <section className="ba-sheet detail-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>{paymentTitle(payment)}</h2>
            <p>{money(payment.amount, payment.currency)} · {payment.status || "pending"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close payment details">✕</button>
        </div>

        {message ? <section className="ba-slim-notice error"><span className="status-dot-mini red" /><p>{message}</p></section> : null}

        <section className="safety-note">
          <strong>Financial safety rule</strong>
          <span>Gateway records should not be edited manually. Only pending manual, cash or bank payments can be confirmed here.</span>
        </section>

        <div className="detail-grid">
          <Detail label="Amount" value={money(payment.amount, payment.currency)} />
          <Detail label="Status" value={payment.status || "pending"} />
          <Detail label="Method" value={payment.method || "manual"} />
          <Detail label="Provider" value={payment.provider || "manual"} />
          <Detail label="Reference" value={payment.providerReference || "Not set"} />
          <Detail label="Receipt" value={payment.receiptNumber || "Not set"} />
          <Detail label="Payer" value={payment.payerName || payment.payerEmail || payment.payerPhone || "Not set"} />
          <Detail label="Invoice" value={payment.invoice?.invoiceNumber || payment.invoiceId || "Not linked"} />
          <Detail label="Subscription" value={payment.subscription?.plan?.name || payment.subscriptionId || "Not linked"} />
          <Detail label="Created" value={safeDateTime(payment.createdAt)} />
          <Detail label="Paid At" value={safeDateTime(payment.paidAt)} />
          <Detail label="Note" value={payment.note || "No note"} wide />
        </div>

        {canConfirmManually(payment) && (
          <section className="confirm-box">
            <div className="section-mini-head">
              <strong>Manual confirmation</strong>
              <small>Confirm only after receiving the money.</small>
            </div>

            <div className="ba-form compact">
              <label>
                <span>Receipt Number</span>
                <input
                  value={confirmForm.receiptNumber}
                  onChange={(event) =>
                    setConfirmForm((current) => ({ ...current, receiptNumber: event.target.value }))
                  }
                />
              </label>

              <label>
                <span>Paid At</span>
                <input
                  type="date"
                  value={confirmForm.paidAt}
                  onChange={(event) =>
                    setConfirmForm((current) => ({ ...current, paidAt: event.target.value }))
                  }
                />
              </label>

              <label className="wide">
                <span>Confirmation Note</span>
                <textarea
                  value={confirmForm.note}
                  onChange={(event) =>
                    setConfirmForm((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </label>
            </div>
          </section>
        )}

        <div className="ba-sheet-actions sticky">
          <button type="button" onClick={() => printReceipt(payment)}>Print Receipt</button>

          {canConfirmManually(payment) && (
            <button type="button" className="primary" disabled={saving} onClick={confirmManualPayment}>
              {saving ? "Confirming..." : "Confirm Payment"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function Detail({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`detail-item ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">💳</div>
      <h3>No records found</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({
  title,
  items,
  total,
  currency,
}: {
  title: string;
  items: { name: string; count: number; amount: number }[];
  total: number;
  currency: string;
}) {
  return (
    <section className="analytics-card">
      <div className="section-mini-head">
        <strong>{title}</strong>
        <small>{items.length} group(s)</small>
      </div>

      <div className="breakdown-list">
        {items.map((item) => (
          <article key={item.name} className="breakdown-row">
            <div>
              <strong>{item.name}</strong>
              <small>{money(item.amount, currency)}</small>
            </div>
            <span>{item.count}</span>
            <div className="bar-track">
              <i style={{ width: `${total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available.`} />}
      </div>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}

.ba-page{
  --ease:cubic-bezier(.2,.8,.2,1);
  min-height:100dvh;
  width:100%;
  max-width:100%;
  min-width:0;
  padding:calc(8px * var(--local-density-scale,1));
  padding-bottom:max(40px,env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),
    var(--bg,#f7f8fb);
  color:var(--text,#111827);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
  font-size:var(--font-size,14px);
  overflow-x:hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after{
  box-sizing:border-box;
  min-width:0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea{
  font:inherit;
  max-width:100%;
}

.ba-page button{
  -webkit-tap-highlight-color:transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea{
  width:100%;
  min-height:44px;
  border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));
  border-radius:16px;
  padding:0 12px;
  background:var(--input-bg,var(--surface,#fff));
  color:var(--input-text,var(--text,#111827));
  outline:none;
  font-weight:750;
}

.ba-page textarea{
  min-height:86px;
  resize:vertical;
  padding-top:10px;
}

.ba-state,
.ba-search-card,
.ba-slim-notice,
.payment-row,
.ba-table-card,
.analytics-card,
.breakdown-row,
.ba-empty,
.ba-sheet,
.safety-note,
.confirm-box,
.detail-item{
  background:var(--card-bg,var(--surface,#fff));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.ba-state{
  min-height:min(420px,calc(100dvh - 32px));
  width:min(520px,100%);
  margin:0 auto;
  display:grid;
  place-items:center;
  align-content:center;
  gap:10px;
  padding:22px;
  border-radius:28px;
  text-align:center;
}

.ba-spinner{
  width:38px;
  height:38px;
  border-radius:999px;
  border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);
  border-top-color:var(--ba-primary);
  animation:spin .8s linear infinite;
}

.ba-state h2{
  margin:0;
  font-size:22px;
  font-weight:1000;
  letter-spacing:-.04em;
}

.ba-state p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:13px;
  line-height:1.6;
}

.ba-search-card{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  align-items:center;
  padding:8px;
  border-radius:24px;
}

.ba-search{
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:0 11px;
  border-radius:18px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
}

.ba-search span{
  color:var(--muted,#64748b);
  font-size:17px;
  font-weight:1000;
}

.ba-search input{
  min-height:42px;
  border:0;
  padding:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  font-size:14px;
}

.ba-add-inline,
.ba-filter-button,
.ba-icon-button{
  min-width:42px;
  height:42px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  display:grid;
  place-items:center;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:15px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
  font-size:18px;
}

.ba-filter-button{
  position:relative;
  color:var(--ba-primary);
  background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));
}

.ba-filter-button.active{
  background:var(--ba-primary);
  color:#fff;
  border-color:var(--ba-primary);
}

.ba-filter-button b{
  position:absolute;
  top:-4px;
  right:-4px;
  min-width:19px;
  height:19px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#ef4444;
  color:#fff;
  font-size:10px;
  border:2px solid var(--card-bg,#fff);
}

.ba-icon-button{
  width:42px;
  font-size:18px;
}

.ba-slim-notice{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:9px;
  margin-top:8px;
  border-radius:17px;
  padding:8px 10px;
  color:#92400e;
  background:rgba(245,158,11,.1);
  border-color:rgba(245,158,11,.24);
}

.ba-slim-notice.error{
  color:#991b1b;
  background:rgba(239,68,68,.10);
  border-color:rgba(239,68,68,.20);
}

.ba-slim-notice p{
  margin:0;
  font-size:11px;
  line-height:1.35;
  font-weight:850;
}

.ba-filter-chips{
  display:flex;
  gap:7px;
  overflow-x:auto;
  padding:8px 1px 0;
  scrollbar-width:none;
  -ms-overflow-style:none;
}

.ba-filter-chips::-webkit-scrollbar{display:none}

.ba-filter-chips button{
  flex:0 0 auto;
  min-height:31px;
  border:0;
  border-radius:999px;
  padding:0 10px;
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
  color:var(--ba-primary);
  font-size:11px;
  font-weight:950;
  white-space:nowrap;
  cursor:pointer;
}

.ba-list,
.analytics-grid,
.breakdown-list{
  display:grid;
  gap:7px;
  margin-top:10px;
}

.payment-row{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  padding:8px;
  border-radius:18px;
  color:var(--text,#111827);
  text-align:left;
  cursor:pointer;
}

.payment-avatar{
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border-radius:14px;
  background:linear-gradient(135deg,var(--ba-primary),rgba(15,23,42,.9));
  color:#fff;
  font-size:15px;
  box-shadow:0 8px 18px rgba(15,23,42,.10);
}

.payment-main{
  display:grid;
  gap:1px;
  min-width:0;
}

.payment-main strong,
.payment-main small,
.payment-main em{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.payment-main strong{
  font-size:13px;
  font-weight:1000;
  line-height:1.15;
}

.payment-main small,
.payment-main em{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-style:normal;
  font-weight:800;
  line-height:1.22;
}

.payment-side{
  display:flex;
  align-items:center;
  gap:6px;
}

.payment-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:17px;
  font-weight:1000;
}

.status-dot-mini{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--muted,#64748b);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.status-dot-mini.blue{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.13)}
.status-dot-mini.purple{background:#9333ea;box-shadow:0 0 0 3px rgba(147,51,234,.13)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.ba-chip{
  display:inline-flex;
  align-items:center;
  min-height:24px;
  padding:0 9px;
  border-radius:999px;
  font-size:11px;
  font-weight:950;
  text-transform:capitalize;
}

.ba-chip.green{background:rgba(34,197,94,.11);color:#15803d}
.ba-chip.red{background:rgba(239,68,68,.1);color:#dc2626}
.ba-chip.blue{background:rgba(37,99,235,.1);color:#1d4ed8}
.ba-chip.orange{background:rgba(245,158,11,.12);color:#b45309}
.ba-chip.purple{background:rgba(124,58,237,.1);color:#6d28d9}
.ba-chip.gray{background:rgba(100,116,139,.1);color:#64748b}

.ba-table-card{
  margin-top:10px;
  padding:10px;
  border-radius:24px;
}

.ba-table-scroll{
  overflow-x:auto;
  border-radius:18px;
  border:1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table{
  width:100%;
  min-width:940px;
  border-collapse:collapse;
}

.ba-table-scroll th,
.ba-table-scroll td{
  padding:10px;
  text-align:left;
  border-bottom:1px solid var(--border,rgba(0,0,0,.08));
  vertical-align:top;
  font-size:12px;
}

.ba-table-scroll th{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:950;
  text-transform:uppercase;
  letter-spacing:.06em;
  background:color-mix(in srgb,var(--ba-primary) 5%,transparent);
}

.ba-table-scroll td strong,
.ba-table-scroll td span{
  display:block;
}

.ba-table-scroll td span{
  margin-top:3px;
  color:var(--muted,#64748b);
  font-size:11px;
}

.table-action{
  min-height:32px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 10px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:11px;
  font-weight:950;
  cursor:pointer;
}

.ba-empty-table{
  padding:22px;
  text-align:center;
  color:var(--muted,#64748b);
  font-weight:850;
}

.analytics-grid{
  grid-template-columns:1fr;
}

.analytics-card{
  padding:10px;
  border-radius:22px;
}

.section-mini-head{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:10px;
  margin-bottom:8px;
}

.section-mini-head strong{
  font-size:13px;
  font-weight:1000;
}

.section-mini-head small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.breakdown-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:8px;
  padding:9px;
  border-radius:17px;
}

.breakdown-row strong,
.breakdown-row small{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.breakdown-row strong{
  font-size:12px;
  font-weight:1000;
  text-transform:capitalize;
}

.breakdown-row small{
  margin-top:2px;
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.breakdown-row > span{
  font-size:12px;
  font-weight:1000;
}

.bar-track{
  grid-column:1/-1;
  height:8px;
  border-radius:999px;
  background:color-mix(in srgb,var(--muted,#64748b) 16%,transparent);
  overflow:hidden;
}

.bar-track i{
  display:block;
  height:100%;
  border-radius:inherit;
  background:var(--ba-primary);
}

.ba-empty{
  display:grid;
  place-items:center;
  align-content:center;
  gap:8px;
  min-height:180px;
  padding:18px;
  border-radius:24px;
  text-align:center;
  border-style:dashed;
}

.ba-empty-icon{
  width:50px;
  height:50px;
  display:grid;
  place-items:center;
  border-radius:20px;
  background:color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size:24px;
}

.ba-empty h3{
  margin:0;
  font-size:17px;
  font-weight:1000;
}

.ba-empty p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:12px;
  line-height:1.5;
}

.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:80;
  background:rgba(2,6,23,.46);
  display:grid;
  align-items:end;
  padding:10px;
}

.ba-sheet{
  width:min(540px,100%);
  max-height:92dvh;
  overflow-y:auto;
  margin:0 auto;
  border-radius:28px 28px 20px 20px;
  padding:14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
}

.ba-sheet.small{
  width:min(440px,100%);
}

.detail-sheet{
  width:min(720px,100%);
}

.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  margin-bottom:12px;
}

.ba-sheet-head h2{
  margin:0;
  font-size:20px;
  font-weight:1000;
  letter-spacing:-.04em;
  overflow-wrap:anywhere;
}

.ba-sheet-head p{
  margin:3px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:750;
  line-height:1.45;
}

.ba-sheet-head button{
  width:38px;
  height:38px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-weight:1000;
  cursor:pointer;
}

.ba-form{
  display:grid;
  grid-template-columns:1fr;
  gap:9px;
}

.ba-form label{
  display:grid;
  gap:5px;
  min-width:0;
}

.ba-form label.wide{
  grid-column:1/-1;
}

.ba-form span{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:950;
}

.ba-sheet-actions{
  display:flex;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}

.ba-sheet-actions.sticky{
  position:sticky;
  bottom:-14px;
  padding-top:10px;
  background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 76%,transparent);
}

.ba-sheet-actions button{
  min-height:40px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:12px;
  font-weight:950;
  cursor:pointer;
}

.ba-sheet-actions button.primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}

.payment-insights{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
  margin-bottom:10px;
}

.payment-insights span{
  display:grid;
  gap:2px;
  padding:9px;
  border-radius:16px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:850;
}

.payment-insights b{
  color:var(--text,#111827);
  font-size:12px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list{
  display:grid;
  gap:8px;
  margin-top:10px;
}

.ba-menu-list button{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px;
  text-align:left;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:18px;
  padding:10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color:var(--text,#111827);
  cursor:pointer;
}

.ba-menu-list button.active{
  border-color:var(--ba-primary);
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
}

.ba-menu-list span{
  grid-row:1 / span 2;
  width:32px;
  height:32px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,var(--ba-primary) 12%,transparent);
  color:var(--ba-primary);
  font-weight:1000;
}

.ba-menu-list b{
  font-size:13px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:800;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.safety-note{
  display:grid;
  gap:3px;
  margin-bottom:10px;
  padding:10px;
  border-radius:18px;
  background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));
}

.safety-note strong{
  font-size:12px;
  font-weight:1000;
}

.safety-note span{
  color:var(--muted,#64748b);
  font-size:11px;
  line-height:1.45;
  font-weight:800;
}

.detail-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
}

.detail-item{
  min-width:0;
  padding:9px;
  border-radius:17px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
}

.detail-item span{
  display:block;
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:950;
  text-transform:uppercase;
  letter-spacing:.05em;
}

.detail-item strong{
  display:block;
  margin-top:3px;
  font-size:12px;
  font-weight:1000;
  overflow-wrap:anywhere;
}

.confirm-box{
  display:grid;
  gap:8px;
  margin-top:10px;
  padding:10px;
  border-radius:20px;
}

@media(min-width:680px){
  .ba-page{
    padding:calc(12px * var(--local-density-scale,1));
  }

  .ba-list{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .payment-row{
    min-height:68px;
  }

  .analytics-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .detail-grid,
  .ba-form.compact{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .detail-item.wide{
    grid-column:1/-1;
  }
}

@media(min-width:1040px){
  .ba-list{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media(min-width:1280px){
  .ba-list{
    grid-template-columns:repeat(4,minmax(0,1fr));
  }

  .payment-row{
    min-height:64px;
  }
}

@media(max-width:520px){
  .ba-search-card{
    gap:6px;
    padding:7px;
    border-radius:22px;
  }

  .payment-insights{
    grid-template-columns:1fr;
  }
}
`;
