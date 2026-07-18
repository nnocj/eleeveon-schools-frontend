"use client";

/**
 * app/branch-admin/modules/WithdrawMoney.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH WITHDRAW MONEY V1
 * ---------------------------------------------------------
 * Golden Standard compact branch finance module.
 *
 * Purpose:
 * - Let Branch Admin withdraw available school-fee money to saved payout settings.
 * - Uses schoolPayoutSettings as the payout destination source.
 * - Uses paymentTransactions + withdrawalRequests to calculate available balance.
 * - Calls backend first:
 *   POST /finance/withdrawals/initiate
 * - If backend/provider is not ready, the backend should still create a requested withdrawal.
 *
 * Design:
 * - Compact top row only: status dot + search + Withdraw + filter + More.
 * - No large hero cards.
 * - No large empty dashboard card.
 * - More sheet contains table/analytics/refresh.
 *
 * Required backend:
 * - FinanceController.initiateWithdrawal()
 * - FinanceService.initiateWithdrawal()
 * - PaymentGatewayService.initiateTransfer()
 *
 * Workspace source fix:
 * - Resolves the active school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 * - Prevents stale branch withdrawal/wallet data after role/workspace switching.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { listActiveLocal, updateLocal } from "../../lib/sync/syncUtils";
import { apiRequest } from "../../lib/platformApi";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type StatusFilter = "all" | "requested" | "processing" | "paid" | "failed" | "rejected";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type PayoutSetting = {
  id?: number;
  preferredMethod?: "bank" | "momo" | string;
  bankName?: string;
  bankCode?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  momoNetwork?: string;
  momoNumber?: string;
  momoName?: string;
  paystackRecipientCode?: string;
  paystackSubaccountCode?: string;
  settlementMode?: string;
  settlementSchedule?: string;
  active?: boolean;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow | null) {
  return row?.id ?? row?.localId ?? row?.cloudRecordId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function cleanId(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameScope(row: AnyRow, accountId?: string | null, schoolId?: number, branchId?: number) {
  if (!row || row.isDeleted === true) return false;
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  if (schoolId && Number(row.schoolId || 0) !== Number(schoolId)) return false;
  if (branchId && Number(row.branchId || 0) !== Number(branchId)) return false;
  return true;
}

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function money(value: any, currency = "GHS") {
  const amount = n(value);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GHS", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "GHS"} ${amount.toLocaleString()}`;
  }
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "approved", "settled", "success", "succeeded"].includes(value)) return "green";
  if (["failed", "rejected", "cancelled"].includes(value)) return "red";
  if (["pending", "requested", "processing", "review"].includes(value)) return "orange";
  return "gray";
}

function hasValidDestination(setting?: PayoutSetting | null) {
  if (!setting || setting.active === false) return false;

  if (setting.preferredMethod === "momo") {
    return !!(setting.momoNetwork && setting.momoName && setting.momoNumber);
  }

  return !!(setting.bankAccountName && setting.bankAccountNumber && (setting.bankName || setting.bankCode));
}

function destinationText(setting?: PayoutSetting | null) {
  if (!setting) return "No payout settings";

  if (setting.preferredMethod === "momo") {
    return [setting.momoNetwork?.toUpperCase(), setting.momoName, setting.momoNumber].filter(Boolean).join(" · ") || "Momo payout not set";
  }

  return [setting.bankName, setting.bankAccountName, setting.bankAccountNumber].filter(Boolean).join(" · ") || "Bank payout not set";
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`wm-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="wm-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function State({primary, title, text: body,}: { primary: string; title: string; text: string;}) {
  return (
    <main className="wm-page" style={{ "--wm-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="wm-state">
        <div className="wm-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

// WITHDRAW_MONEY_VERSION: golden-compact-real-payout-v1
export default function WithdrawMoneyPage() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";
  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = useMemo(
    () =>
      cleanId(openWorkspace?.schoolId) ||
      cleanId(openWorkspace?.membership?.schoolId) ||
      cleanId(openWorkspace?.membership?.school?.id) ||
      cleanId(activeMembership?.schoolId) ||
      cleanId(activeMembership?.school?.id) ||
      cleanId(activeSchoolId) ||
      cleanId(activeSchool?.id) ||
      cleanId(settings?.schoolId) ||
      cleanId(safeStorageRead("activeSchoolId")),
    [
      activeMembership?.school?.id,
      activeMembership?.schoolId,
      activeSchool?.id,
      activeSchoolId,
      openWorkspace?.membership?.school?.id,
      openWorkspace?.membership?.schoolId,
      openWorkspace?.schoolId,
      settings?.schoolId,
    ]
  );

  const branchId = useMemo(
    () =>
      cleanId(openWorkspace?.branchId) ||
      cleanId(openWorkspace?.membership?.branchId) ||
      cleanId(openWorkspace?.membership?.schoolBranchId) ||
      cleanId(openWorkspace?.membership?.branch?.id) ||
      cleanId(activeMembership?.branchId) ||
      cleanId(activeMembership?.schoolBranchId) ||
      cleanId(activeMembership?.branch?.id) ||
      cleanId(activeBranchId) ||
      cleanId(activeBranch?.id) ||
      cleanId(settings?.branchId) ||
      cleanId(safeStorageRead("activeBranchId")),
    [
      activeBranch?.id,
      activeBranchId,
      activeMembership?.branch?.id,
      activeMembership?.branchId,
      activeMembership?.schoolBranchId,
      openWorkspace?.branchId,
      openWorkspace?.membership?.branch?.id,
      openWorkspace?.membership?.branchId,
      openWorkspace?.membership?.schoolBranchId,
      settings?.branchId,
    ]
  );

  const { loading, setLoading } = useBackgroundLoader();
  const [withdrawing, setWithdrawing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("cards");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [transactions, setTransactions] = useState<AnyRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<AnyRow[]>([]);
  const [payoutSettings, setPayoutSettings] = useState<PayoutSetting[]>([]);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function safeList(table: string) {
    try {
      return await listActiveLocal<AnyRow>(table as any);
    } catch {
      return [];
    }
  }

  async function load() {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [txRows, wdRows, payoutRows] = await Promise.all([
        safeList("paymentTransactions"),
        safeList("withdrawalRequests"),
        safeList("schoolPayoutSettings"),
      ]);

      setTransactions(txRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setWithdrawals(wdRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setPayoutSettings(payoutRows.filter((row) => sameScope(row, accountId, schoolId, branchId)) as PayoutSetting[]);
    } catch (err: any) {
      setError(err?.message || "Unable to load withdrawal records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    activeMembership?.role,
    activeMembership?.schoolId,
    activeMembership?.branchId,
    activeMembership?.schoolBranchId,
    openWorkspace?.openedAt,
    openWorkspace?.membershipId,
    dataRevision,
  ]);

  const payoutSetting = useMemo(
    () => payoutSettings.find((row) => row.active !== false) || payoutSettings[0] || null,
    [payoutSettings]
  );

  const currency = text(transactions[0]?.currencyCode || withdrawals[0]?.currencyCode || settings?.currencyCode, "GHS");

  const summary = useMemo(() => {
    const paidStatuses = new Set(["paid", "success", "succeeded", "approved", "settled"]);
    const pendingStatuses = new Set(["pending", "requested", "processing", "review"]);

    const inflow = transactions
      .filter((row) => row.direction === "inflow" && paidStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + n(row.amount), 0);

    const paidOut = withdrawals
      .filter((row) => paidStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + n(row.amount), 0);

    const pending = withdrawals
      .filter((row) => pendingStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum, row) => sum + n(row.amount), 0);

    return {
      inflow,
      paidOut,
      pending,
      available: Math.max(0, inflow - paidOut - pending),
      count: withdrawals.length,
    };
  }, [transactions, withdrawals]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return withdrawals
      .filter((row) => status === "all" || String(row.status || "requested").toLowerCase() === status)
      .filter((row) => {
        if (!q) return true;
        return [
          row.referenceNumber,
          row.providerReference,
          row.accountName,
          row.accountNumber,
          row.bankName,
          row.momoNetwork,
          row.status,
          row.method,
          row.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.requestedAt || b.paidAt || b.updatedAt || b.createdAt) - n(a.requestedAt || a.paidAt || a.updatedAt || a.createdAt));
  }, [query, status, withdrawals]);

  const destinationReady = hasValidDestination(payoutSetting);
  const canWithdraw = destinationReady && summary.available > 0;

  function openWithdraw() {
    setNotice("");
    setError("");
    setReason("");
    setAmount(String(summary.available || ""));
    setWithdrawOpen(true);
  }

  async function submitWithdraw() {
    if (!payoutSetting) return setError("Set payout settings before withdrawing.");

    const value = n(amount);

    if (value <= 0) return setError("Enter a valid withdrawal amount.");
    if (value > summary.available) return setError("Amount cannot exceed available balance.");
    if (!hasValidDestination(payoutSetting)) return setError("Complete payout settings before withdrawing.");

    setWithdrawing(true);
    setError("");

    try {
      const result: any = await apiRequest("/finance/withdrawals/initiate", {
        method: "POST",
        body: {
          schoolId,
          branchId,
          amount: value,
          currencyCode: currency,
          reason: reason || "School fee withdrawal",
          destination: payoutSetting,
          metadata: {
            source: "branch-admin-withdraw-money",
            availableBeforeWithdrawal: summary.available,
          },
        },
      } as any);

      setWithdrawOpen(false);
      setNotice(result?.ok ? "Withdrawal started." : "Withdrawal request saved for processing.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to start withdrawal.");
    } finally {
      setWithdrawing(false);
    }
  }

  async function markLocalPaid(row: AnyRow) {
    const id = cleanId(idOf(row));
    if (!id) return;

    await updateLocal("withdrawalRequests" as any, id, {
      status: "paid",
      paidAt: new Date().toISOString(),
    });

    await load();
  }

  const activeFilterCount = status !== "all" ? 1 : 0;

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening withdrawals..." text="Loading branch wallet and payout destination." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting..." text="Sign in first." />;
  }

  if (!schoolId || !branchId) {
    return <State primary={primary} title="Select branch context" text="Withdraw money is branch-scoped." />;
  }

  return (
    <main className="wm-page" style={{ "--wm-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="wm-search-card" aria-label="Withdraw money actions">
        <span className={`status-dot-mini ${canWithdraw ? "green" : "gray"}`} />

        <label className="wm-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search withdrawals..." />
        </label>

        <button type="button" className="wm-add-inline" onClick={openWithdraw} disabled={!canWithdraw}>
          Withdraw
        </button>

        <button type="button" className={`wm-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)}>
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="wm-icon-button" onClick={() => setMoreOpen(true)}>
          ⋯
        </button>
      </section>

      <section className="wm-compact-line">
        <b>{money(summary.available, currency)} available</b>
        <Chip tone={destinationReady ? "green" : "orange"}>{destinationReady ? "ready" : "setup needed"}</Chip>
        <small>{destinationText(payoutSetting)}</small>
      </section>

      {status !== "all" || query.trim() ? (
        <section className="wm-filter-chips">
          {status !== "all" && <button type="button" onClick={() => setStatus("all")}>Status: {status} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      ) : null}

      {notice ? <Notice tone="green">{notice}</Notice> : null}
      {error ? <Notice tone="red">{error}</Notice> : null}

      {view === "analytics" && <Analytics summary={summary} currency={currency} payoutSetting={payoutSetting} />}
      {view === "table" && <Table rows={rows} currency={currency} markLocalPaid={markLocalPaid} />}
      {view === "cards" && (
        <section className="wm-list">
          {rows.map((row) => <WithdrawalRow key={String(idOf(row))} row={row} currency={currency} markLocalPaid={markLocalPaid} />)}
          {!rows.length && <CompactEmpty canWithdraw={canWithdraw} openWithdraw={openWithdraw} destinationReady={destinationReady} />}
        </section>
      )}

      {withdrawOpen && (
        <WithdrawSheet
          amount={amount}
          setAmount={setAmount}
          reason={reason}
          setReason={setReason}
          currency={currency}
          available={summary.available}
          payoutSetting={payoutSetting}
          withdrawing={withdrawing}
          error={error}
          close={() => setWithdrawOpen(false)}
          submitWithdraw={submitWithdraw}
        />
      )}

      {filterOpen && <FilterSheet status={status} setStatus={setStatus} close={() => setFilterOpen(false)} />}

      {moreOpen && (
        <MoreSheet
          view={view}
          setView={(next) => {
            setView(next);
            setMoreOpen(false);
          }}
          summary={summary}
          currency={currency}
          payoutSetting={payoutSetting}
          refresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          openWithdraw={() => {
            setMoreOpen(false);
            openWithdraw();
          }}
          close={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

function Notice({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return (
    <section className={`wm-notice ${tone}`}>
      <span className={`status-dot-mini ${tone}`} />
      <p>{children}</p>
    </section>
  );
}

function CompactEmpty({ canWithdraw, openWithdraw, destinationReady }: { canWithdraw: boolean; openWithdraw: () => void; destinationReady: boolean }) {
  return (
    <section className="wm-empty-compact">
      <span>🏧</span>
      <b>No withdrawals</b>
      <small>{destinationReady ? "Withdraw when money is available." : "Complete payout settings first."}</small>
      {canWithdraw && <button type="button" onClick={openWithdraw}>Withdraw</button>}
    </section>
  );
}

function WithdrawalRow({ row, currency, markLocalPaid }: { row: AnyRow; currency: string; markLocalPaid: (row: AnyRow) => void }) {
  const status = String(row.status || "requested").toLowerCase();
  const canMarkPaid = ["requested", "pending", "processing"].includes(status);

  return (
    <article className="wm-row">
      <span className="wm-avatar">🏧</span>
      <span className="wm-main">
        <strong>{money(row.amount, currency)}</strong>
        <small>{row.accountName || row.method || "Withdrawal"} · {dateLabel(row.requestedAt || row.paidAt || row.createdAt)}</small>
      </span>
      <span className="wm-side">
        <Chip tone={statusTone(row.status)}>{row.status || "requested"}</Chip>
        {canMarkPaid ? <button type="button" onClick={() => markLocalPaid(row)}>Paid</button> : null}
      </span>
    </article>
  );
}

function Table({ rows, currency, markLocalPaid }: { rows: AnyRow[]; currency: string; markLocalPaid: (row: AnyRow) => void }) {
  return (
    <section className="wm-table-card">
      <div className="wm-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Withdrawals ({rows.length})</th>
              <th>Amount</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Reference</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const status = String(row.status || "requested").toLowerCase();
              return (
                <tr key={String(idOf(row))}>
                  <td><strong>{row.method || "bank"}</strong><span>{row.note || "No note"}</span></td>
                  <td>{money(row.amount, currency)}</td>
                  <td>{row.accountName || "—"} · {row.accountNumber || "—"}</td>
                  <td><Chip tone={statusTone(row.status)}>{row.status || "requested"}</Chip></td>
                  <td>{row.referenceNumber || row.providerReference || "—"}</td>
                  <td>{dateLabel(row.requestedAt || row.paidAt || row.createdAt)}</td>
                  <td>
                    <div className="wm-table-actions">
                      {["requested", "pending", "processing"].includes(status) ? <button type="button" onClick={() => markLocalPaid(row)}>Paid</button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && <div className="wm-empty-table">No withdrawal matches.</div>}
      </div>
    </section>
  );
}

function Analytics({ summary, currency, payoutSetting }: { summary: AnyRow; currency: string; payoutSetting: PayoutSetting | null }) {
  return (
    <section className="wm-analysis-grid">
      <article className="wm-analysis"><span>Available</span><strong>{money(summary.available, currency)}</strong><p>Ready for withdrawal.</p></article>
      <article className="wm-analysis"><span>Pending</span><strong>{money(summary.pending, currency)}</strong><p>Requested or processing.</p></article>
      <article className="wm-analysis"><span>Withdrawn</span><strong>{money(summary.paidOut, currency)}</strong><p>Paid/settled withdrawals.</p></article>
      <article className="wm-analysis"><span>Destination</span><strong>{payoutSetting?.preferredMethod || "none"}</strong><p>{destinationText(payoutSetting)}</p></article>
    </section>
  );
}

function WithdrawSheet({
  amount,
  setAmount,
  reason,
  setReason,
  currency,
  available,
  payoutSetting,
  withdrawing,
  error,
  close,
  submitWithdraw,
}: {
  amount: string;
  setAmount: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  currency: string;
  available: number;
  payoutSetting: PayoutSetting | null;
  withdrawing: boolean;
  error: string;
  close: () => void;
  submitWithdraw: () => void;
}) {
  const ready = hasValidDestination(payoutSetting);

  return (
    <div className="wm-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="wm-sheet small">
        <div className="wm-sheet-head">
          <div>
            <h2>Withdraw Money</h2>
            <p>{money(available, currency)} available</p>
          </div>
          <button type="button" onClick={close}>✕</button>
        </div>

        {error ? <section className="wm-inline-error">{error}</section> : null}

        <section className="wm-destination">
          <span>{payoutSetting?.preferredMethod === "momo" ? "📱" : "🏦"}</span>
          <b>{ready ? destinationText(payoutSetting) : "Set payout settings first"}</b>
          <small>{payoutSetting?.settlementMode === "direct_subaccount" ? "Direct subaccount" : "Platform wallet"} · {payoutSetting?.settlementSchedule || "manual"}</small>
        </section>

        <div className="wm-form-grid">
          <label>
            <span>Amount</span>
            <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </label>

          <label className="wide">
            <span>Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" />
          </label>
        </div>

        <div className="wm-sheet-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="button" className="primary" disabled={withdrawing || !ready} onClick={submitWithdraw}>
            {withdrawing ? "Processing..." : "Withdraw"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FilterSheet({ status, setStatus, close }: { status: StatusFilter; setStatus: (value: StatusFilter) => void; close: () => void }) {
  return (
    <div className="wm-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="wm-sheet small">
        <div className="wm-sheet-head"><div><h2>Filters</h2><p>Filter withdrawal status.</p></div><button type="button" onClick={close}>✕</button></div>
        <div className="wm-form-grid">
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All</option><option value="requested">Requested</option><option value="processing">Processing</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="rejected">Rejected</option></select></label>
        </div>
        <div className="wm-sheet-actions"><button type="button" onClick={() => setStatus("all")}>Reset</button><button type="button" className="primary" onClick={close}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({
  view,
  setView,
  summary,
  currency,
  payoutSetting,
  refresh,
  openWithdraw,
  close,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  summary: AnyRow;
  currency: string;
  payoutSetting: PayoutSetting | null;
  refresh: () => void | Promise<void>;
  openWithdraw: () => void;
  close: () => void;
}) {
  const canWithdraw = hasValidDestination(payoutSetting) && summary.available > 0;

  return (
    <div className="wm-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="wm-sheet small">
        <div className="wm-sheet-head"><div><h2>More</h2><p>{money(summary.available, currency)} available.</p></div><button type="button" onClick={close}>✕</button></div>
        <div className="wm-menu-list">
          <button type="button" onClick={openWithdraw} disabled={!canWithdraw}><span>🏧</span><b>Withdraw</b><small>{destinationText(payoutSetting)}</small></button>
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards</b><small>Compact withdrawals</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table</b><small>Dense records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>Balance and payout</small></button>
          <button type="button" onClick={refresh}><span>↻</span><b>Refresh</b><small>Reload wallet</small></button>
        </div>
      </section>
    </div>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.wm-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--wm-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.wm-page *,.wm-page *::before,.wm-page *::after{box-sizing:border-box;min-width:0}.wm-page button,.wm-page input,.wm-page select,.wm-page textarea{font:inherit;max-width:100%}.wm-page button{-webkit-tap-highlight-color:transparent}.wm-page input,.wm-page select,.wm-page textarea{width:100%;min-height:40px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:15px;padding:0 11px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.wm-page textarea{min-height:74px;padding:11px;resize:vertical;line-height:1.45}.wm-state,.wm-search-card,.wm-row,.wm-table-card,.wm-analysis,.wm-empty-compact,.wm-sheet,.wm-notice{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.wm-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.wm-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--wm-primary) 18%,transparent);border-top-color:var(--wm-primary);animation:spin .8s linear infinite}.wm-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.wm-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.wm-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.wm-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:42px;padding:0 10px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.wm-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.wm-search input{min-height:40px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:13px}.wm-icon-button,.wm-filter-button,.wm-add-inline{width:40px;height:40px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:17px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.wm-add-inline{width:auto;min-width:82px;padding:0 13px;border-color:var(--wm-primary);background:var(--wm-primary);color:#fff;font-size:12px;box-shadow:0 12px 28px color-mix(in srgb,var(--wm-primary) 22%,transparent)}.wm-add-inline:disabled{opacity:.55;cursor:not-allowed}.wm-filter-button{position:relative;background:color-mix(in srgb,var(--wm-primary) 8%,var(--card-bg,#fff));color:var(--wm-primary)}.wm-filter-button.active{background:var(--wm-primary);color:#fff;border-color:var(--wm-primary)}.wm-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.wm-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.gray{background:var(--muted,#64748b)}.status-dot-mini.red{background:#ef4444}.wm-compact-line{max-width:1180px;margin:8px auto 0;display:flex;align-items:center;gap:7px;overflow-x:auto;white-space:nowrap}.wm-compact-line b{font-size:13px;font-weight:1000;color:var(--text,#111827)}.wm-compact-line small{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.wm-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.wm-filter-chips::-webkit-scrollbar{display:none}.wm-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--wm-primary) 11%,transparent);color:var(--wm-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.wm-notice{max-width:1180px;margin:8px auto 0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:9px;border-radius:17px;padding:8px 10px}.wm-notice p{margin:0;font-size:11px;line-height:1.35;font-weight:850}.wm-notice.green{background:#f0fdf4;color:#166534;border-color:#bbf7d0}.wm-notice.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}.wm-list{display:grid;gap:8px;margin-top:10px}.wm-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.wm-avatar{width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--wm-primary) 12%,var(--surface,#fff));font-size:20px}.wm-main,.wm-main strong,.wm-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wm-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.wm-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.wm-side{display:flex;align-items:center;gap:5px}.wm-side button{min-height:30px;border:1px solid var(--wm-primary);border-radius:999px;background:var(--wm-primary);color:#fff;font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}.wm-chip{max-width:100%;display:inline-flex;align-items:center;min-height:23px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.wm-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.wm-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.wm-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.wm-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.wm-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.wm-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.wm-empty-compact{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;margin-top:10px;padding:10px;border-radius:22px}.wm-empty-compact span{width:42px;height:42px;border-radius:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--wm-primary) 12%,var(--surface,#fff));font-size:20px}.wm-empty-compact b,.wm-empty-compact small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wm-empty-compact b{font-size:13px;font-weight:1000}.wm-empty-compact small{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.wm-empty-compact button{min-height:32px;border:1px solid var(--wm-primary);border-radius:999px;padding:0 11px;background:var(--wm-primary);color:#fff;font-size:11px;font-weight:950}.wm-table-card,.wm-analysis{padding:13px;border-radius:24px}.wm-table-card{margin-top:10px}.wm-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.wm-table-scroll table{width:100%;min-width:860px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.wm-table-scroll th,.wm-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.wm-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--wm-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.wm-table-scroll td strong,.wm-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wm-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.wm-table-actions{display:flex;gap:7px;overflow-x:auto}.wm-table-actions button{flex:0 0 auto;min-height:32px;border:1px solid var(--wm-primary);border-radius:999px;padding:0 11px;background:var(--wm-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.wm-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.wm-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.wm-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.wm-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.wm-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.wm-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.wm-sheet{width:min(620px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.wm-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.wm-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:10px}.wm-sheet-head h2{margin:0;color:var(--text,#111827);font-size:20px;font-weight:1000;letter-spacing:-.05em}.wm-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.45;font-weight:750}.wm-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.wm-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px;background:rgba(239,68,68,.12);color:#991b1b}.wm-destination{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--wm-primary) 9%,transparent);border:1px solid color-mix(in srgb,var(--wm-primary) 18%,var(--border,rgba(0,0,0,.10)))}.wm-destination span{grid-row:span 2;width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:var(--card-bg,var(--surface,#fff));font-size:20px}.wm-destination b,.wm-destination small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wm-destination b{font-size:13px;font-weight:1000}.wm-destination small{font-size:11px;font-weight:800;color:var(--muted,#64748b)}.wm-form-grid{display:grid;gap:8px;margin-top:10px}.wm-form-grid label{display:grid;gap:5px}.wm-form-grid label.wide{grid-column:1/-1}.wm-form-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}.wm-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.wm-sheet-actions button{min-height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 14px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.wm-sheet-actions button.primary{border-color:var(--wm-primary);background:var(--wm-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--wm-primary) 25%,transparent)}.wm-sheet-actions button:disabled{opacity:.55;cursor:not-allowed}.wm-menu-list{display:grid;gap:8px}.wm-menu-list button{width:100%;display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:9px;align-items:center;min-height:54px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:8px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.wm-menu-list button:disabled{opacity:.5;cursor:not-allowed}.wm-menu-list button span{grid-row:span 2;width:40px;height:40px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--wm-primary) 10%,transparent);color:var(--wm-primary);font-weight:1000}.wm-menu-list button b,.wm-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wm-menu-list button b{font-size:13px;font-weight:1000}.wm-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.wm-menu-list button.active{border-color:color-mix(in srgb,var(--wm-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--wm-primary) 8%,var(--surface,#fff))}@media (min-width:680px){.wm-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.wm-search-card{grid-template-columns:auto minmax(0,1fr) auto 44px 44px}.wm-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wm-row{border-radius:24px;padding:11px;grid-template-columns:auto minmax(0,1fr)}.wm-side{grid-column:1/-1;justify-content:flex-end}.wm-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wm-sheet-backdrop{place-items:center;padding:18px}.wm-sheet{border-radius:28px;padding:18px}}@media (min-width:1040px){.wm-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.wm-search-card,.wm-list,.wm-analysis-grid,.wm-table-card,.wm-filter-chips,.wm-compact-line,.wm-notice{max-width:1180px;margin-left:auto;margin-right:auto}.wm-list{grid-template-columns:repeat(3,minmax(0,1fr))}.wm-row{grid-template-columns:auto minmax(0,1fr) auto}.wm-side{grid-column:auto}.wm-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.wm-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.wm-search-card{gap:6px}.wm-icon-button,.wm-filter-button{width:39px;height:39px}.wm-add-inline{min-width:74px;padding:0 10px}.wm-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.wm-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.wm-empty-compact{grid-template-columns:auto minmax(0,1fr)}.wm-empty-compact button{grid-column:1/-1}.wm-sheet{padding:12px}.wm-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.wm-sheet-actions button{width:100%}}
`;
