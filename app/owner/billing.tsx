"use client";

/**
 * app/owner/billing.tsx
 * ---------------------------------------------------------
 * OWNER — BILLING OVERVIEW
 * Golden compact rewrite
 * ---------------------------------------------------------
 *
 * Data behavior preserved:
 * - Requires authenticated account.
 * - Loads account billing from /accounts/me.
 * - Falls back to local IndexedDB billing tables when live server is unavailable.
 * - Keeps invoice, payment, subscription and feature calculations.
 *
 * UI upgrade:
 * - Removed the large hero/header card.
 * - Removed the large current plan card.
 * - Removed the large summary card grid.
 * - Uses the Golden compact pattern:
 *   - search + view + refresh + more top row
 *   - compact active chips only when useful
 *   - row/list style for invoices and payments
 *   - compact analytics rows for overview
 *   - compact feature grid
 *   - More sheet for billing summary and current plan details
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
import { db } from "../lib/db";

type InvoiceStatus = "draft" | "issued" | "part_paid" | "paid" | "overdue" | "cancelled" | "void" | string;
type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "cancelled" | "refunded" | string;

type AccountData = {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  subscription?: {
    id?: string;
    status?: string;
    billingCycle?: string;
    currentPeriodEnd?: string;
    nextBillingDate?: string;
    trialEndsAt?: string;
    plan?: {
      name?: string;
      code?: string;
      currency?: string;
      priceMonthly?: number;
      priceYearly?: number;
      maxSchools?: number | null;
      maxBranches?: number | null;
      maxUsers?: number | null;
      maxStudents?: number | null;
      maxTeachers?: number | null;
      cloudBackup?: boolean;
      reports?: boolean;
      finance?: boolean;
      parentPortal?: boolean;
      studentPortal?: boolean;
      teacherPortal?: boolean;
      advancedAnalytics?: boolean;
      apiAccess?: boolean;
    };
  } | null;
  invoices?: Invoice[];
  payments?: Payment[];
};

type Invoice = {
  id?: string;
  invoiceNumber?: string;
  currency?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  balance?: number;
  status?: InvoiceStatus;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string;
  createdAt?: string;
};

type Payment = {
  id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  provider?: string;
  status?: PaymentStatus;
  providerReference?: string;
  receiptNumber?: string;
  paidAt?: string;
  createdAt?: string;
};

type ViewMode = "overview" | "invoices" | "payments" | "features";

function money(amount?: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function safeDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getTable(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable(...names);
  return table?.toArray ? table.toArray() : [];
}

function statusTone(status?: string): "green" | "red" | "orange" | "blue" | "gray" {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "completed", "success", "succeeded"].includes(value)) return "green";
  if (["failed", "cancelled", "void", "expired", "suspended"].includes(value)) return "red";
  if (["trial", "pending", "processing", "issued", "part_paid", "past_due", "overdue"].includes(value)) return "orange";
  if (["draft"].includes(value)) return "gray";
  return "blue";
}

function displayStatus(status?: string, fallback = "not set") {
  const value = String(status || "").trim();
  if (!value) return fallback;
  return value.replace(/_/g, " ");
}

export default function BillingPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState<AccountData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setNotice("");

      try {
        const remote = await apiRequest<AccountData>("/accounts/me");
        setAccount(remote);
        setInvoices(normalizeArray(remote?.invoices));
        setPayments(normalizeArray(remote?.payments));
      } catch {
        const [localSubscriptions, localInvoices, localPayments, localPlans] = await Promise.all([
          tableToArray<any>("accountSubscriptions"),
          tableToArray<Invoice>("invoices"),
          tableToArray<Payment>("appPayments", "payments"),
          tableToArray<any>("subscriptionPlans"),
        ]);

        const subscription = localSubscriptions.find((row) => row.accountId === accountId) || null;
        const plan = localPlans.find((row) => row.id === subscription?.planId) || subscription?.plan || null;

        setAccount({
          id: accountId,
          name: "Owner Account",
          subscription: subscription ? { ...subscription, plan } : null,
        });

        setInvoices(localInvoices.filter((row: any) => !row.accountId || row.accountId === accountId));
        setPayments(localPayments.filter((row: any) => !row.accountId || row.accountId === accountId));

        setNotice("Live billing server was not available. Showing latest billing data saved on this device.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  const currency = account?.subscription?.plan?.currency || invoices[0]?.currency || payments[0]?.currency || "GHS";
  const plan = account?.subscription?.plan;
  const subscription = account?.subscription;

  const summary = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const totalPaid = payments
      .filter((row) => String(row.status || "").toLowerCase() === "paid")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const outstanding = invoices.reduce(
      (sum, row) => sum + Number(row.balance ?? Math.max(Number(row.total || 0) - Number(row.amountPaid || 0), 0)),
      0
    );

    return {
      totalInvoiced,
      totalPaid,
      outstanding,
      invoices: invoices.length,
      payments: payments.length,
      unpaidInvoices: invoices.filter((row) => !["paid", "void", "cancelled"].includes(String(row.status || "").toLowerCase())).length,
    };
  }, [invoices, payments]);

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices.filter((row) => !q || `${row.invoiceNumber} ${row.status} ${row.total} ${row.balance}`.toLowerCase().includes(q));
  }, [invoices, search]);

  const filteredPayments = useMemo(() => {
    const q = search.toLowerCase().trim();
    return payments.filter((row) => !q || `${row.receiptNumber} ${row.providerReference} ${row.status} ${row.method} ${row.provider}`.toLowerCase().includes(q));
  }, [payments, search]);

  const features = [
    ["Offline Sync", true],
    ["Cloud Backup", plan?.cloudBackup],
    ["Reports", plan?.reports],
    ["Finance", plan?.finance],
    ["Teacher Portal", plan?.teacherPortal],
    ["Student Portal", plan?.studentPortal],
    ["Parent Portal", plan?.parentPortal],
    ["Advanced Analytics", plan?.advancedAnalytics],
    ["API Access", plan?.apiAccess],
  ];

  const activeCount = viewMode === "invoices" ? filteredInvoices.length : viewMode === "payments" ? filteredPayments.length : viewMode === "features" ? features.length : 4;

  if (accountLoading || settingsLoading || loading) {
    return (
      <main className="ba-page billing-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <div className="ba-spinner" />
          <h2>Opening billing overview...</h2>
          <p>Loading subscription, invoices and payment history.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page billing-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Billing search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            placeholder={viewMode === "invoices" ? "Search invoices..." : viewMode === "payments" ? "Search payments..." : "Search billing..."}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search billing records"
          />
        </label>

        <button type="button" className="ba-add-inline" onClick={load} aria-label="Refresh billing">
          ↻
        </button>

        <button
          type="button"
          className="ba-filter-button"
          onClick={() => setMoreOpen(true)}
          aria-label="Open billing views"
          title="Views"
        >
          {activeCount}
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

      <section className="ba-filter-chips" aria-label="Billing views">
        <button type="button" className={viewMode === "overview" ? "active" : ""} onClick={() => setViewMode("overview")}>
          Overview
        </button>
        <button type="button" className={viewMode === "invoices" ? "active" : ""} onClick={() => setViewMode("invoices")}>
          Invoices ({summary.invoices})
        </button>
        <button type="button" className={viewMode === "payments" ? "active" : ""} onClick={() => setViewMode("payments")}>
          Payments ({summary.payments})
        </button>
        <button type="button" className={viewMode === "features" ? "active" : ""} onClick={() => setViewMode("features")}>
          Features
        </button>
      </section>

      {viewMode === "overview" && (
        <section className="billing-compact-grid">
          <OverviewRow
            icon="💳"
            title={plan?.name || "No active plan"}
            subtitle={`${subscription?.billingCycle || "No billing cycle"} · ${displayStatus(subscription?.status, "No subscription status")}`}
            note={`Next billing: ${safeDate(subscription?.nextBillingDate || subscription?.currentPeriodEnd)}`}
            tone={statusTone(subscription?.status)}
          />
          <OverviewRow
            icon="🧾"
            title="Total Invoiced"
            subtitle={money(summary.totalInvoiced, currency)}
            note={`${summary.invoices} invoice record(s)`}
            tone="blue"
          />
          <OverviewRow
            icon="✅"
            title="Total Paid"
            subtitle={money(summary.totalPaid, currency)}
            note={`${summary.payments} payment record(s)`}
            tone="green"
          />
          <OverviewRow
            icon="⚠️"
            title="Outstanding"
            subtitle={money(summary.outstanding, currency)}
            note={`${summary.unpaidInvoices} unpaid invoice(s)`}
            tone={summary.outstanding > 0 ? "orange" : "green"}
          />
          <OverviewRow
            icon="📆"
            title="Monthly Price"
            subtitle={money(plan?.priceMonthly, currency)}
            note="Current plan monthly value"
            tone="gray"
          />
          <OverviewRow
            icon="🗓️"
            title="Yearly Price"
            subtitle={money(plan?.priceYearly, currency)}
            note="Current plan yearly value"
            tone="gray"
          />
          <OverviewRow
            icon="📦"
            title="Plan Limits"
            subtitle={`${plan?.maxSchools ?? "∞"} school(s)`}
            note={`${plan?.maxBranches ?? "∞"} branches · ${plan?.maxUsers ?? "∞"} users`}
            tone="blue"
          />
        </section>
      )}

      {viewMode === "invoices" && (
        <section className="ba-list">
          {filteredInvoices.map((invoice) => (
            <InvoiceRow key={invoice.id || invoice.invoiceNumber} invoice={invoice} currency={currency} />
          ))}
          {!filteredInvoices.length && <EmptyCard text="No invoices match your search." />}
        </section>
      )}

      {viewMode === "payments" && (
        <section className="ba-list">
          {filteredPayments.map((payment) => (
            <PaymentRow key={payment.id || payment.providerReference || payment.receiptNumber} payment={payment} currency={currency} />
          ))}
          {!filteredPayments.length && <EmptyCard text="No payments match your search." />}
        </section>
      )}

      {viewMode === "features" && (
        <section className="feature-grid">
          {features.map(([label, enabled]) => (
            <article key={String(label)} className="feature-row">
              <span className={enabled ? "on" : "off"}>{enabled ? "✓" : "×"}</span>
              <div>
                <strong>{label}</strong>
                <small>{enabled ? "Available on this plan" : "Not enabled on this plan"}</small>
              </div>
            </article>
          ))}
        </section>
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
          planName={plan?.name || "No active plan"}
          subscriptionStatus={displayStatus(subscription?.status, "not set")}
          billingCycle={subscription?.billingCycle || "not set"}
          nextBillingDate={safeDate(subscription?.nextBillingDate || subscription?.currentPeriodEnd)}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

function OverviewRow({
  icon,
  title,
  subtitle,
  note,
  tone,
}: {
  icon: string;
  title: string;
  subtitle: string;
  note: string;
  tone: "green" | "red" | "orange" | "blue" | "gray";
}) {
  return (
    <article className="billing-row">
      <span className="billing-row-icon">{icon}</span>
      <span className="billing-row-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
        <em>{note}</em>
      </span>
      <span className="billing-row-side">
        <span className={`status-dot-mini ${tone}`} />
      </span>
    </article>
  );
}

function InvoiceRow({ invoice, currency }: { invoice: Invoice; currency: string }) {
  return (
    <article className="billing-row">
      <span className="billing-row-icon">🧾</span>
      <span className="billing-row-main">
        <strong>{invoice.invoiceNumber || "Invoice"}</strong>
        <small>{money(invoice.total, invoice.currency || currency)} · {displayStatus(invoice.status, "draft")}</small>
        <em>Issued {safeDate(invoice.issueDate || invoice.createdAt)} · Due {safeDate(invoice.dueDate)}</em>
      </span>
      <span className="billing-row-side">
        <span className={`status-dot-mini ${statusTone(invoice.status)}`} />
        <i>{money(invoice.balance ?? 0, invoice.currency || currency)}</i>
      </span>
    </article>
  );
}

function PaymentRow({ payment, currency }: { payment: Payment; currency: string }) {
  return (
    <article className="billing-row">
      <span className="billing-row-icon">💰</span>
      <span className="billing-row-main">
        <strong>{payment.receiptNumber || payment.providerReference || "Payment"}</strong>
        <small>{money(payment.amount, payment.currency || currency)} · {displayStatus(payment.status, "pending")}</small>
        <em>{payment.provider || "manual"} · {payment.method || "method not set"} · {safeDate(payment.paidAt || payment.createdAt)}</em>
      </span>
      <span className="billing-row-side">
        <span className={`status-dot-mini ${statusTone(payment.status)}`} />
      </span>
    </article>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  summary,
  currency,
  planName,
  subscriptionStatus,
  billingCycle,
  nextBillingDate,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    invoices: number;
    payments: number;
    unpaidInvoices: number;
  };
  currency: string;
  planName: string;
  subscriptionStatus: string;
  billingCycle: string;
  nextBillingDate: string;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  const views: { key: ViewMode; icon: string; label: string; note: string }[] = [
    { key: "overview", icon: "◔", label: "Overview", note: "Plan, totals, outstanding and limits" },
    { key: "invoices", icon: "🧾", label: "Invoices", note: `${summary.invoices} invoice record(s)` },
    { key: "payments", icon: "💰", label: "Payments", note: `${summary.payments} payment record(s)` },
    { key: "features", icon: "✓", label: "Features", note: "Enabled plan modules" },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Billing</h2>
            <p>Compact billing summary and view switcher.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close billing menu">✕</button>
        </div>

        <div className="billing-info-list">
          <InfoLine label="Plan" value={planName} />
          <InfoLine label="Status" value={subscriptionStatus} />
          <InfoLine label="Billing" value={billingCycle} />
          <InfoLine label="Next billing" value={nextBillingDate} />
          <InfoLine label="Invoiced" value={money(summary.totalInvoiced, currency)} />
          <InfoLine label="Paid" value={money(summary.totalPaid, currency)} />
          <InfoLine label="Outstanding" value={money(summary.outstanding, currency)} />
        </div>

        <div className="ba-menu-list">
          {views.map((view) => (
            <button key={view.key} type="button" className={viewMode === view.key ? "active" : ""} onClick={() => setViewMode(view.key)}>
              <span>{view.icon}</span>
              <b>{view.label}</b>
              <small>{view.note}</small>
            </button>
          ))}

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload subscription, invoices and payments</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
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

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page button {
  -webkit-tap-highlight-color: transparent;
}

.ba-state,
.ba-search-card,
.ba-slim-notice,
.billing-row,
.feature-row,
.ba-empty,
.ba-sheet {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 24px;
}

.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

.ba-search input {
  width: 100%;
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text,#111827);
  outline: none;
  box-shadow: none;
  font-size: 14px;
  font-weight: 750;
}

.ba-add-inline,
.ba-filter-button,
.ba-icon-button {
  min-width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 18px;
}

.ba-filter-button {
  color: var(--ba-primary);
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
}

.ba-icon-button {
  width: 42px;
  font-size: 18px;
}

.ba-slim-notice {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 9px;
  margin-top: 8px;
  border-radius: 17px;
  padding: 8px 10px;
  color: #92400e;
  background: rgba(245,158,11,.1);
  border-color: rgba(245,158,11,.24);
}

.ba-slim-notice p {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  font-weight: 850;
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-filter-chips::-webkit-scrollbar {
  display: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-filter-chips button.active {
  background: var(--ba-primary);
  color: #fff;
}

.billing-compact-grid,
.ba-list,
.feature-grid {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.billing-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 18px;
  color: var(--text,#111827);
}

.billing-row-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--ba-primary), rgba(15,23,42,.9));
  color: #fff;
  font-size: 13px;
  font-weight: 1000;
  box-shadow: 0 8px 18px rgba(15,23,42,.10);
}

.billing-row-main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.billing-row-main strong,
.billing-row-main small,
.billing-row-main em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.billing-row-main strong {
  font-size: 13px;
  font-weight: 1000;
  color: var(--text,#111827);
  line-height: 1.15;
}

.billing-row-main small,
.billing-row-main em {
  color: var(--muted,#64748b);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.22;
}

.billing-row-side {
  display: flex;
  align-items: center;
  gap: 6px;
}

.billing-row-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 10px;
  font-weight: 950;
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot-mini {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.status-dot-mini.blue{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.13)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.feature-grid {
  grid-template-columns: repeat(2, minmax(0,1fr));
}

.feature-row {
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-radius: 18px;
}

.feature-row > span {
  width: 30px;
  height: 30px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 1000;
}

.feature-row > span.on {
  background: rgba(34,197,94,.12);
  color: #16a34a;
}

.feature-row > span.off {
  background: rgba(100,116,139,.12);
  color: var(--muted,#64748b);
}

.feature-row strong,
.feature-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-row strong {
  font-size: 12px;
  font-weight: 1000;
}

.feature-row small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 800;
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 180px;
  padding: 18px;
  border-radius: 24px;
  text-align: center;
  border-style: dashed;
}

.ba-empty-icon {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: color-mix(in srgb, var(--ba-primary) 12%, var(--surface,#fff));
  font-size: 24px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(2,6,23,.46);
  display: grid;
  align-items: end;
  padding: 10px;
}

.ba-sheet {
  width: min(540px, 100%);
  margin: 0 auto;
  border-radius: 28px 28px 20px 20px;
  padding: 14px;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.ba-sheet.small {
  width: min(440px, 100%);
}

.ba-sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.ba-sheet-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-sheet-head p {
  margin: 3px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.ba-sheet-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
}

.billing-info-list {
  display: grid;
  gap: 7px;
  margin-bottom: 10px;
}

.billing-info-list div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 15px;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--muted,#64748b) 5%, transparent);
}

.billing-info-list span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
}

.billing-info-list strong {
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 1000;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  grid-template-rows: auto auto;
  column-gap: 10px;
  text-align: left;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 10px;
  background: color-mix(in srgb, var(--muted,#64748b) 5%, transparent);
  color: var(--text,#111827);
  cursor: pointer;
}

.ba-menu-list button.active {
  border-color: var(--ba-primary);
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
}

.ba-menu-list span {
  grid-row: 1 / span 2;
  width: 32px;
  height: 32px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ba-primary) 12%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list b {
  font-size: 13px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list small {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 680px) {
  .ba-page {
    padding: calc(12px * var(--local-density-scale, 1));
  }

  .billing-compact-grid,
  .feature-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .billing-row {
    min-height: 68px;
  }
}

@media (min-width: 1040px) {
  .billing-compact-grid {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .feature-grid {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }
}

@media (min-width: 1280px) {
  .billing-compact-grid,
  .feature-grid {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  .billing-row {
    min-height: 64px;
  }
}

@media (max-width: 520px) {
  .ba-search-card {
    gap: 6px;
    padding: 7px;
    border-radius: 22px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .billing-row-side i {
    display: none;
  }
}
`;
