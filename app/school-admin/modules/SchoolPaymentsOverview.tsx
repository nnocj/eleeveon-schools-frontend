"use client";

/**
 * app/school-admin/modules/Schoolpaymentsoverview.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — PAYMENTS OVERVIEW
 * ---------------------------------------------------------
 *
 * School-wide payment gateway dashboard across all branches.
 *
 * This is intentionally READ-ONLY:
 * - School admin monitors payment health across branches.
 * - Branch admin/finance modules handle actual fee/payment records.
 *
 * Uses available db.ts tables when present:
 * - branches
 * - payments
 * - studentFeePayments
 * - paymentIntents
 * - paymentTransactions
 * - paymentRefunds
 * - paymentProviderEvents
 * - currencies
 * - schoolCurrencySettings
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import { db } from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "cards" | "table" | "analytics";
type PeriodFilter = "all" | "today" | "week" | "month" | "term" | "year";
type StatusFilter = "all" | "successful" | "pending" | "failed" | "refunded";

type TenantRow = {
  id?: number;
  accountId?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
  isDeleted?: boolean;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type Branch = TenantRow & {
  name?: string;
  code?: string;
  location?: string;
  status?: string;
};

type PaymentRow = TenantRow & {
  amount?: number;
  paidAmount?: number;
  totalAmount?: number;
  refundAmount?: number;
  currencyCode?: string;
  currencySymbol?: string;
  status?: string;
  paymentStatus?: string;
  providerStatus?: string;
  gatewayStatus?: string;
  provider?: string;
  gateway?: string;
  channel?: string;
  method?: string;
  paymentMethod?: string;
  reference?: string;
  providerReference?: string;
  transactionReference?: string;
  intentReference?: string;
  customerEmail?: string;
  payerEmail?: string;
  payerName?: string;
  studentName?: string;
  description?: string;
  eventType?: string;
  type?: string;
  date?: number | string;
  paidAt?: number | string;
  createdAt?: number;
  updatedAt?: number;
};

type CurrencySetting = TenantRow & {
  currencyCode?: string;
  currencySymbol?: string;
  code?: string;
  symbol?: string;
  isDefault?: boolean;
};

type PaymentEntry = {
  key: string;
  branchId?: number;
  branchName: string;
  branchCode: string;
  source: "payments" | "studentFeePayments" | "paymentIntents" | "paymentTransactions" | "paymentRefunds" | "paymentProviderEvents";
  provider: string;
  method: string;
  reference: string;
  payer: string;
  description: string;
  amount: number;
  status: "successful" | "pending" | "failed" | "refunded" | "unknown";
  date: number;
};

type BranchPayments = {
  branchId?: number;
  branchName: string;
  branchCode: string;
  totalAmount: number;
  successfulAmount: number;
  pendingAmount: number;
  failedAmount: number;
  refundedAmount: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  transactionCount: number;
  successRate: number;
};

type Breakdown = {
  name: string;
  amount: number;
  count?: number;
};

// ======================================================
// HELPERS
// ======================================================

const DAY = 24 * 60 * 60 * 1000;

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) {
    if (anyDb[name]) return anyDb[name];
  }
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  if (!table?.toArray) return [];
  return table.toArray();
}

function toNumber(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function rowAmount(row: PaymentRow) {
  return toNumber(row.amount ?? row.paidAmount ?? row.totalAmount ?? row.refundAmount);
}

function rowDate(row: PaymentRow) {
  const value = row.paidAt || row.date || row.updatedAt || row.createdAt;
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameSchool(row: TenantRow, accountId?: string | null, schoolId?: number | null) {
  if (!row || row.isDeleted) return false;
  return (
    (row.accountId || accountId) === accountId &&
    Number(row.schoolId ?? schoolId) === Number(schoolId)
  );
}

function withinPeriod(row: PaymentRow, period: PeriodFilter) {
  if (period === "all" || period === "term") return true;

  const date = rowDate(row);
  if (!date) return true;

  const current = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (period === "today") return date >= startOfToday.getTime();
  if (period === "week") return date >= current - 7 * DAY;
  if (period === "month") return date >= current - 31 * DAY;
  if (period === "year") return date >= current - 365 * DAY;

  return true;
}

function getStatus(row: PaymentRow, source: PaymentEntry["source"]): PaymentEntry["status"] {
  const status = String(row.status || row.paymentStatus || row.providerStatus || row.gatewayStatus || row.eventType || row.type || "").toLowerCase();

  if (source === "paymentRefunds" || status.includes("refund")) return "refunded";
  if (status.includes("success") || status.includes("paid") || status.includes("complete") || status.includes("confirm")) return "successful";
  if (status.includes("fail") || status.includes("cancel") || status.includes("declin") || status.includes("abandon")) return "failed";
  if (status.includes("pending") || status.includes("draft") || status.includes("init") || status.includes("processing")) return "pending";

  return "unknown";
}

function money(value: number, symbol = "GHS") {
  const amount = Number(value || 0);

  try {
    return `${symbol} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(amount)}`;
  } catch {
    return `${symbol} ${amount.toFixed(2)}`;
  }
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatDate(value?: number) {
  if (!value) return "No date";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "No date";
  }
}

function getCurrencySymbol(settings: any, currencySettings: CurrencySetting[]) {
  const fromSettings =
    settings?.currencySymbol ||
    settings?.defaultCurrencySymbol ||
    settings?.currencyCode ||
    settings?.defaultCurrencyCode;

  if (fromSettings) return String(fromSettings);

  const defaultCurrency =
    currencySettings.find((row) => row.isDefault) ||
    currencySettings[0];

  return defaultCurrency?.currencySymbol || defaultCurrency?.symbol || defaultCurrency?.currencyCode || defaultCurrency?.code || "GHS";
}

function cleanText(value?: string, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

// ======================================================
// COMPONENT
// ======================================================

export default function SchoolPaymentsOverview() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, loading: contextLoading } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [studentFeePayments, setStudentFeePayments] = useState<PaymentRow[]>([]);
  const [paymentIntents, setPaymentIntents] = useState<PaymentRow[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentRow[]>([]);
  const [paymentRefunds, setPaymentRefunds] = useState<PaymentRow[]>([]);
  const [paymentProviderEvents, setPaymentProviderEvents] = useState<PaymentRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<CurrencySetting[]>([]);

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId && !settings?.schoolId) {
      router.replace("/owner");
    }
  }, [accountLoading, contextLoading, authenticated, accountId, activeSchoolId, settings?.schoolId, router]);

  const load = async () => {
    if (!authenticated || !accountId || !schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        branchRows,
        paymentRows,
        feePaymentRows,
        intentRows,
        transactionRows,
        refundRows,
        providerEventRows,
        currencyRows,
      ] = await Promise.all([
        db.branches.toArray(),
        tableToArray<PaymentRow>("payments"),
        tableToArray<PaymentRow>("studentFeePayments"),
        tableToArray<PaymentRow>("paymentIntents"),
        tableToArray<PaymentRow>("paymentTransactions"),
        tableToArray<PaymentRow>("paymentRefunds"),
        tableToArray<PaymentRow>("paymentProviderEvents"),
        tableToArray<CurrencySetting>("schoolCurrencySettings", "currencies"),
      ]);

      setBranches(
        branchRows
          .filter((row: Branch) => sameSchool(row, accountId, Number(schoolId)))
          .sort((a: Branch, b: Branch) => String(a.name || "").localeCompare(String(b.name || ""))) as Branch[]
      );

      const schoolFilter = (row: PaymentRow) => sameSchool(row, accountId, Number(schoolId)) && withinPeriod(row, period);

      setPayments(paymentRows.filter(schoolFilter));
      setStudentFeePayments(feePaymentRows.filter(schoolFilter));
      setPaymentIntents(intentRows.filter(schoolFilter));
      setPaymentTransactions(transactionRows.filter(schoolFilter));
      setPaymentRefunds(refundRows.filter(schoolFilter));
      setPaymentProviderEvents(providerEventRows.filter(schoolFilter));
      setCurrencySettings(currencyRows.filter((row) => sameSchool(row, accountId, Number(schoolId)) || !row.schoolId));
    } catch (error) {
      console.error("Failed to load school payments overview:", error);
      alert("Failed to load school payments overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, period]);

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings, currencySettings),
    [settings, currencySettings]
  );

  const branchMap = useMemo(() => {
    return new Map(branches.map((branch) => [Number(branch.id), branch]));
  }, [branches]);

  const entries = useMemo<PaymentEntry[]>(() => {
    const convert = (rows: PaymentRow[], source: PaymentEntry["source"]) =>
      rows.map((row, index): PaymentEntry => {
        const branch = branchMap.get(Number(row.branchId));
        const status = getStatus(row, source);

        return {
          key: `${source}-${row.id || row.reference || row.providerReference || index}`,
          branchId: Number(row.branchId) || undefined,
          branchName: branch?.name || `Branch #${row.branchId || "Unknown"}`,
          branchCode: branch?.code || "",
          source,
          provider: cleanText(row.provider || row.gateway, "Paystack / Gateway"),
          method: cleanText(row.method || row.paymentMethod || row.channel, "Not specified"),
          reference: cleanText(row.reference || row.providerReference || row.transactionReference || row.intentReference, "No reference"),
          payer: cleanText(row.payerName || row.studentName || row.customerEmail || row.payerEmail, "Unknown payer"),
          description: cleanText(row.description || row.eventType || row.type, source),
          amount: rowAmount(row),
          status,
          date: rowDate(row),
        };
      });

    return [
      ...convert(payments, "payments"),
      ...convert(studentFeePayments, "studentFeePayments"),
      ...convert(paymentIntents, "paymentIntents"),
      ...convert(paymentTransactions, "paymentTransactions"),
      ...convert(paymentRefunds, "paymentRefunds"),
      ...convert(paymentProviderEvents, "paymentProviderEvents"),
    ].sort((a, b) => b.date - a.date);
  }, [payments, studentFeePayments, paymentIntents, paymentTransactions, paymentRefunds, paymentProviderEvents, branchMap]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;

      if (!query) return true;

      return `
        ${entry.branchName}
        ${entry.branchCode}
        ${entry.reference}
        ${entry.payer}
        ${entry.provider}
        ${entry.method}
        ${entry.description}
        ${entry.status}
        ${entry.source}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [entries, statusFilter, search]);

  const branchPayments = useMemo<BranchPayments[]>(() => {
    return branches.map((branch) => {
      const branchId = Number(branch.id);
      const rows = entries.filter((entry) => Number(entry.branchId) === branchId);

      const successful = rows.filter((entry) => entry.status === "successful");
      const pending = rows.filter((entry) => entry.status === "pending" || entry.status === "unknown");
      const failed = rows.filter((entry) => entry.status === "failed");
      const refunded = rows.filter((entry) => entry.status === "refunded");

      const successfulAmount = successful.reduce((sum, row) => sum + row.amount, 0);
      const pendingAmount = pending.reduce((sum, row) => sum + row.amount, 0);
      const failedAmount = failed.reduce((sum, row) => sum + row.amount, 0);
      const refundedAmount = refunded.reduce((sum, row) => sum + row.amount, 0);
      const totalAmount = successfulAmount + pendingAmount + failedAmount + refundedAmount;
      const counted = successful.length + pending.length + failed.length + refunded.length;
      const successRate = counted > 0 ? (successful.length / counted) * 100 : 0;

      return {
        branchId,
        branchName: branch.name || `Branch #${branch.id}`,
        branchCode: branch.code || "",
        totalAmount,
        successfulAmount,
        pendingAmount,
        failedAmount,
        refundedAmount,
        successfulCount: successful.length,
        pendingCount: pending.length,
        failedCount: failed.length,
        refundedCount: refunded.length,
        transactionCount: rows.length,
        successRate,
      };
    }).sort((a, b) => b.successfulAmount - a.successfulAmount || a.branchName.localeCompare(b.branchName));
  }, [branches, entries]);

  const filteredBranchPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return branchPayments;

    return branchPayments.filter((row) =>
      `${row.branchName} ${row.branchCode}`.toLowerCase().includes(query)
    );
  }, [branchPayments, search]);

  const summary = useMemo(() => {
    const successful = entries.filter((entry) => entry.status === "successful");
    const pending = entries.filter((entry) => entry.status === "pending" || entry.status === "unknown");
    const failed = entries.filter((entry) => entry.status === "failed");
    const refunded = entries.filter((entry) => entry.status === "refunded");

    const successfulAmount = successful.reduce((sum, row) => sum + row.amount, 0);
    const pendingAmount = pending.reduce((sum, row) => sum + row.amount, 0);
    const failedAmount = failed.reduce((sum, row) => sum + row.amount, 0);
    const refundedAmount = refunded.reduce((sum, row) => sum + row.amount, 0);
    const totalCount = entries.length;
    const successRate = totalCount > 0 ? (successful.length / totalCount) * 100 : 0;

    const bestBranch = [...branchPayments].sort((a, b) => b.successfulAmount - a.successfulAmount)[0];
    const attentionBranch = [...branchPayments].sort((a, b) => b.failedCount - a.failedCount || a.successRate - b.successRate)[0];

    return {
      successfulAmount,
      pendingAmount,
      failedAmount,
      refundedAmount,
      successfulCount: successful.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      refundedCount: refunded.length,
      totalCount,
      successRate,
      bestBranch,
      attentionBranch,
    };
  }, [entries, branchPayments]);

  const breakdowns = useMemo(() => {
    const status: Breakdown[] = [
      { name: "Successful", amount: summary.successfulAmount, count: summary.successfulCount },
      { name: "Pending / Unknown", amount: summary.pendingAmount, count: summary.pendingCount },
      { name: "Failed", amount: summary.failedAmount, count: summary.failedCount },
      { name: "Refunded", amount: summary.refundedAmount, count: summary.refundedCount },
    ].filter((item) => item.amount > 0 || (item.count || 0) > 0);

    const byProviderMap = new Map<string, Breakdown>();
    entries.forEach((entry) => {
      const key = entry.provider || "Unknown provider";
      const existing = byProviderMap.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += entry.amount;
      existing.count = (existing.count || 0) + 1;
      byProviderMap.set(key, existing);
    });

    const byProvider = Array.from(byProviderMap.values()).sort((a, b) => b.amount - a.amount);

    const byMethodMap = new Map<string, Breakdown>();
    entries.forEach((entry) => {
      const key = entry.method || "Unknown method";
      const existing = byMethodMap.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += entry.amount;
      existing.count = (existing.count || 0) + 1;
      byMethodMap.set(key, existing);
    });

    const byMethod = Array.from(byMethodMap.values()).sort((a, b) => b.amount - a.amount);

    return { status, byProvider, byMethod };
  }, [entries, summary]);

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="spy-page" style={{ "--spy-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="spy-state-card">
          <div className="spy-spinner" />
          <h2>Opening payments overview...</h2>
          <p>Loading gateway transactions, refunds and branch payment summaries.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId || !schoolId) {
    return (
      <main className="spy-page" style={{ "--spy-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="spy-state-card">
          <h2>Assigned school required</h2>
          <p>Please sign in with a school-admin account assigned to a school.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="spy-page" style={{ "--spy-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="spy-hero">
        <div className="spy-hero-left">
          <div className="spy-hero-icon">🏦</div>
          <div className="spy-title-wrap">
            <p>School Payments</p>
            <h2>Payments Overview</h2>
            <span>{activeSchool?.name || "Assigned school"} · Gateway and fee-payment monitoring</span>
          </div>
        </div>

        <div className="spy-hero-actions">
          <button type="button" className="spy-ghost-btn" onClick={load}>Refresh</button>
        </div>
      </section>

      <section className="spy-context-grid">
        <article>
          <div className="spy-context-icon">🔎</div>
          <div>
            <span>Gateway monitoring</span>
            <strong>{summary.totalCount} payment record(s)</strong>
            <p>Track successful, pending, failed and refunded payments across the school.</p>
          </div>
        </article>

        <article>
          <div className="spy-context-icon">🔒</div>
          <div>
            <span>Read-only</span>
            <strong>School-wide dashboard</strong>
            <p>Branch admins and finance modules handle actual payment reconciliation and fee updates.</p>
          </div>
        </article>
      </section>

      <section className="spy-summary-grid">
        <SummaryCard label="Successful" value={money(summary.successfulAmount, currencySymbol)} icon="✅" positive />
        <SummaryCard label="Pending" value={money(summary.pendingAmount, currencySymbol)} icon="⏳" warning={summary.pendingAmount > 0} />
        <SummaryCard label="Failed" value={money(summary.failedAmount, currencySymbol)} icon="⛔" warning={summary.failedAmount > 0} />
        <SummaryCard label="Refunded" value={money(summary.refundedAmount, currencySymbol)} icon="↩️" warning={summary.refundedAmount > 0} />
        <SummaryCard label="Success Rate" value={percent(summary.successRate)} icon="📊" positive={summary.successRate >= 80} warning={summary.successRate < 50} />
        <SummaryCard label="Transactions" value={summary.totalCount} icon="🧾" />
      </section>

      <section className="spy-insight-grid">
        <article>
          <span>Top payment branch</span>
          <strong>{summary.bestBranch?.branchName || "No branch yet"}</strong>
          <p>{summary.bestBranch ? `${money(summary.bestBranch.successfulAmount, currencySymbol)} successful payments` : "No successful payment record found."}</p>
        </article>

        <article>
          <span>Needs attention</span>
          <strong>{summary.attentionBranch?.branchName || "No branch yet"}</strong>
          <p>{summary.attentionBranch ? `${summary.attentionBranch.failedCount} failed payment(s)` : "No failed payment record found."}</p>
        </article>

        <article>
          <span>Pending count</span>
          <strong>{summary.pendingCount}</strong>
          <p>Payments that may need verification or follow-up.</p>
        </article>

        <article>
          <span>Refund count</span>
          <strong>{summary.refundedCount}</strong>
          <p>Refund records found for the selected period.</p>
        </article>
      </section>

      <section className="spy-toolbar">
        <div className="spy-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Cards</button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>Table</button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>Analytics</button>
        </div>
        <Chip tone="gray">{viewMode === "table" ? filteredEntries.length : filteredBranchPayments.length} shown</Chip>
      </section>

      <section className="spy-filter-card">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search branch, payer, reference, provider..."
        />

        <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)}>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 31 days</option>
          <option value="term">Current term / all available</option>
          <option value="year">Last 365 days</option>
          <option value="all">All records</option>
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">All Statuses</option>
          <option value="successful">Successful</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </section>

      {viewMode === "analytics" && (
        <>
          <Breakdown title="Payment Status" items={breakdowns.status} symbol={currencySymbol} />
          <Breakdown title="Payment Providers" items={breakdowns.byProvider} symbol={currencySymbol} />
          <Breakdown title="Payment Methods" items={breakdowns.byMethod} symbol={currencySymbol} />
        </>
      )}

      {viewMode === "table" && (
        <section className="spy-table-card">
          <div className="spy-section-head">
            <div>
              <p>Payment Register</p>
              <h3>Recent Payment Records</h3>
            </div>
            <Chip tone="blue">Read-only</Chip>
          </div>

          <div className="spy-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Branch</th>
                  <th>Payer</th>
                  <th>Reference</th>
                  <th>Provider</th>
                  <th>Method</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.key}>
                    <td>{formatDate(entry.date)}</td>
                    <td>
                      <strong>{entry.branchName}</strong>
                      <span>{entry.branchCode || "No code"}</span>
                    </td>
                    <td>{entry.payer}</td>
                    <td>{entry.reference}</td>
                    <td>{entry.provider}</td>
                    <td>{entry.method}</td>
                    <td>{entry.source}</td>
                    <td><Chip tone={statusTone(entry.status)}>{entry.status}</Chip></td>
                    <td>{money(entry.amount, currencySymbol)}</td>
                  </tr>
                ))}

                {!filteredEntries.length && (
                  <tr>
                    <td colSpan={9}><EmptyCard text="No payment record matches your filters." /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="spy-section">
          <div className="spy-section-head">
            <div>
              <p>Branch Comparison</p>
              <h3>Payment Health by Branch</h3>
            </div>
            <Chip tone="gray">{filteredBranchPayments.length} branch(es)</Chip>
          </div>

          <div className="spy-list">
            {filteredBranchPayments.map((row) => (
              <article key={row.branchId || row.branchName} className="spy-card">
                <div className="spy-card-top">
                  <div className="spy-avatar">🏫</div>
                  <div className="spy-card-main">
                    <h3>{row.branchName}</h3>
                    <p>{row.branchCode || "No branch code"} · {row.transactionCount} payment record(s)</p>
                    <div className="spy-chip-row">
                      <Chip tone={row.successRate >= 80 ? "green" : row.successRate < 50 ? "red" : "orange"}>
                        {percent(row.successRate)} success
                      </Chip>
                      <Chip tone={row.failedCount > 0 ? "red" : "green"}>
                        {row.failedCount} failed
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="spy-mini-grid">
                  <MiniStat label="Successful" value={money(row.successfulAmount, currencySymbol)} />
                  <MiniStat label="Pending" value={money(row.pendingAmount, currencySymbol)} />
                  <MiniStat label="Failed" value={money(row.failedAmount, currencySymbol)} />
                  <MiniStat label="Refunded" value={money(row.refundedAmount, currencySymbol)} />
                  <MiniStat label="Transactions" value={row.transactionCount} />
                  <MiniStat label="Success Rate" value={percent(row.successRate)} />
                </div>
              </article>
            ))}

            {!filteredBranchPayments.length && (
              <EmptyCard text="No branch payment data matches your filters." />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function statusTone(status: PaymentEntry["status"]): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  if (status === "successful") return "green";
  if (status === "failed") return "red";
  if (status === "pending" || status === "unknown") return "orange";
  if (status === "refunded") return "purple";
  return "gray";
}

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`spy-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="spy-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="spy-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
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
  return <span className={`spy-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="spy-empty-card">
      <div className="spy-empty-icon">🏦</div>
      <h3>No payment data</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({ title, items, symbol }: { title: string; items: Breakdown[]; symbol: string }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="spy-section">
      <div className="spy-section-head">
        <div>
          <p>Analytics</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{money(total, symbol)}</Chip>
      </div>

      <div className="spy-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="spy-breakdown-card">
            <div className="spy-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone="blue">{money(item.amount, symbol)}</Chip>
            </div>

            <div className="spy-bar-track">
              <div style={{ width: `${total ? Math.round((item.amount / total) * 100) : 0}%` }} />
            </div>

            <div className="spy-chip-row">
              <Chip tone="gray">{item.count || 0} record(s)</Chip>
              <Chip tone="gray">{total ? Math.round((item.amount / total) * 100) : 0}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} found for this period.`} />}
      </div>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes spySpin { to { transform: rotate(360deg); } }

.spy-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--spy-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.spy-page *,
.spy-page *::before,
.spy-page *::after {
  box-sizing: border-box;
}

.spy-page button,
.spy-page input,
.spy-page select {
  font: inherit;
  max-width: 100%;
}

.spy-page input,
.spy-page select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.spy-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.spy-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.spy-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.spy-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--spy-primary) 18%, transparent);
  border-top-color: var(--spy-primary);
  animation: spySpin .8s linear infinite;
}

.spy-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--spy-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--spy-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.spy-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.spy-hero-icon,
.spy-context-icon,
.spy-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  background: var(--spy-primary);
  color: #fff;
}

.spy-hero-icon {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--spy-primary) 28%, transparent);
  font-size: 22px;
}

.spy-title-wrap {
  min-width: 0;
}

.spy-title-wrap p,
.spy-title-wrap h2,
.spy-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spy-title-wrap p {
  margin: 0 0 2px;
  color: var(--spy-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.spy-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.spy-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.spy-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.spy-ghost-btn {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.spy-context-grid,
.spy-insight-grid,
.spy-summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.spy-context-grid article,
.spy-insight-grid article,
.spy-summary-card,
.spy-toolbar,
.spy-filter-card,
.spy-table-card,
.spy-card,
.spy-breakdown-card,
.spy-empty-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.spy-context-grid article,
.spy-insight-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
}

.spy-insight-grid article {
  display: grid;
  gap: 4px;
}

.spy-context-icon {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  font-size: 20px;
}

.spy-context-grid span,
.spy-insight-grid span,
.spy-section-head p {
  display: block;
  color: var(--spy-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.spy-context-grid strong,
.spy-insight-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.spy-context-grid p,
.spy-insight-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.spy-summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.spy-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.spy-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff)));
}

.spy-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff)));
}

.spy-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--spy-primary) 12%, var(--surface, #fff));
}

.spy-summary-card div:last-child {
  min-width: 0;
}

.spy-summary-card strong,
.spy-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spy-summary-card strong {
  color: var(--text, #111111);
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.spy-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.spy-toolbar,
.spy-filter-card,
.spy-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.spy-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.spy-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--spy-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.spy-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.spy-view-tabs button.active {
  background: var(--spy-primary);
  color: #fff;
}

.spy-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.spy-section {
  margin-top: 16px;
}

.spy-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.spy-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.spy-list,
.spy-breakdown-grid {
  display: grid;
  gap: 10px;
}

.spy-card,
.spy-breakdown-card,
.spy-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.spy-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.spy-avatar {
  width: 56px;
  height: 56px;
  border-radius: 19px;
  font-size: 22px;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.spy-card-main {
  min-width: 0;
  flex: 1;
}

.spy-card-main h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.spy-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.spy-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.spy-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.spy-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.spy-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.spy-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.spy-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.spy-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.spy-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.spy-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.spy-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.spy-mini-stat strong,
.spy-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spy-mini-stat strong {
  color: var(--text, #111111);
  font-size: 13px;
  font-weight: 1000;
}

.spy-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.spy-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.spy-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spy-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.spy-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--spy-primary);
}

.spy-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.spy-table-scroll table {
  width: 100%;
  min-width: 1160px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, #fff));
}

.spy-table-scroll th,
.spy-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
  color: var(--text, #111111);
  font-size: 13px;
}

.spy-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--spy-primary) 6%, var(--card-bg, #fff));
}

.spy-table-scroll td strong,
.spy-table-scroll td span {
  display: block;
}

.spy-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.spy-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.spy-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--spy-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.spy-empty-card h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
}

.spy-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

@media (min-width: 680px) {
  .spy-page { padding: calc(12px * var(--local-density-scale, 1)); }
  .spy-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .spy-context-grid, .spy-insight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .spy-filter-card { grid-template-columns: minmax(0, 1fr) 220px 180px; }
  .spy-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .spy-page { padding: calc(16px * var(--local-density-scale, 1)); }
  .spy-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .spy-list, .spy-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .spy-page { padding: calc(6px * var(--local-density-scale, 1)); }
  .spy-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .spy-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .spy-ghost-btn { width: 100%; }
  .spy-summary-grid { gap: 6px; }
  .spy-summary-card { padding: 10px; border-radius: 19px; }
  .spy-summary-card strong { font-size: 15px; }
  .spy-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .spy-view-tabs { width: 100%; }
  .spy-card, .spy-empty-card, .spy-breakdown-card { border-radius: 20px; padding: 11px; }
  .spy-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .spy-mini-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
}
`;
