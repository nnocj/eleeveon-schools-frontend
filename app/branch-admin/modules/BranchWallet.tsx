"use client";

/**
 * app/branch-admin/modules/BranchWallet.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH WALLET V1
 * ---------------------------------------------------------
 * Golden Standard Branch Finance Wallet.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Purpose:
 * - Show the branch's student-fee money position.
 * - Track payment inflows from paymentTransactions/studentFeePayments.
 * - Show settlements and withdrawal requests beside available balance.
 * - Help Branch Admin understand money received, pending settlement and withdrawn.
 *
 * Important:
 * - This is a tracking UI, not the payment gateway itself.
 * - Student/Parent payment confirmation creates studentFeePayments/paymentTransactions.
 * - Settlements/withdrawals can be synced from backend/provider later.
 *
 * Workspace source fix:
 * - Resolves the active school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 * - Prevents stale branch wallet data after role/workspace switching.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { listActiveLocal } from "../../lib/sync/syncUtils";


type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

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
  return row?.id ?? row?.localId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
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

function toneForStatus(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "succeeded", "settled", "approved", "active", "verified"].includes(value)) return "green";
  if (["failed", "cancelled", "rejected", "inactive", "disabled"].includes(value)) return "red";
  if (["pending", "processing", "requested", "review"].includes(value)) return "orange";
  if (["draft", "scheduled"].includes(value)) return "blue";
  return "gray";
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`wallet-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="wallet-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function Empty({ title, text: body }: { title: string; text: string }) {
  return (
    <section className="wallet-empty">
      <div>💼</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="wallet-page" style={{ "--wallet-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="wallet-state">
        <div className="wallet-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}


export default function BranchWalletPage() {
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

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"transactions" | "settlements" | "withdrawals">("transactions");
  const [moreOpen, setMoreOpen] = useState(false);

  const [transactions, setTransactions] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [settlements, setSettlements] = useState<AnyRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<AnyRow[]>([]);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function safeList(tableName: string) {
    try {
      return await listActiveLocal<AnyRow>(tableName as any);
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
      const [txRows, paymentRows, settlementRows, withdrawalRows] = await Promise.all([
        safeList("paymentTransactions"),
        safeList("studentFeePayments"),
        safeList("paymentSettlements"),
        safeList("withdrawalRequests"),
      ]);
      setTransactions(txRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setPayments(paymentRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setSettlements(settlementRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setWithdrawals(withdrawalRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
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
  ]);

  const currency = text(transactions[0]?.currencyCode || payments[0]?.currencyCode || settings?.currencyCode, "GHS");

  const rows = useMemo(() => {
    const source = section === "settlements" ? settlements : section === "withdrawals" ? withdrawals : transactions;
    const q = query.trim().toLowerCase();
    return source
      .filter((row) => {
        if (!q) return true;
        return [row.referenceNumber, row.providerReference, row.receiptNumber, row.status, row.payerName, row.note, row.purpose, row.direction].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => n(b.paidAt || b.settledAt || b.requestedAt || b.updatedAt || b.createdAt) - n(a.paidAt || a.settledAt || a.requestedAt || a.updatedAt || a.createdAt));
  }, [query, section, settlements, transactions, withdrawals]);

  const summary = useMemo(() => {
    const inflow = transactions.filter((row) => row.direction === "inflow" && ["paid", "success", "succeeded"].includes(String(row.status || "").toLowerCase())).reduce((sum, row) => sum + n(row.amount), 0);
    const settled = settlements.filter((row) => ["settled", "paid", "success"].includes(String(row.status || "").toLowerCase())).reduce((sum, row) => sum + n(row.amount), 0);
    const withdrawn = withdrawals.filter((row) => ["paid", "approved", "settled"].includes(String(row.status || "").toLowerCase())).reduce((sum, row) => sum + n(row.amount), 0);
    const pendingWithdrawal = withdrawals.filter((row) => ["pending", "requested", "processing", "review"].includes(String(row.status || "").toLowerCase())).reduce((sum, row) => sum + n(row.amount), 0);
    return {
      inflow,
      settled,
      withdrawn,
      pendingWithdrawal,
      available: Math.max(0, inflow - withdrawn - pendingWithdrawal),
      transactions: transactions.length,
      settlements: settlements.length,
      withdrawals: withdrawals.length,
    };
  }, [settlements, transactions, withdrawals]);

  if (loading || accountLoading || settingsLoading) return <State primary={primary} title="Opening wallet..." text="Loading branch inflows, settlements and withdrawal requests." />;
  if (!authenticated || !accountId) return <State primary={primary} title="Redirecting..." text="Sign in before viewing branch wallet." />;
  if (!schoolId || !branchId) return <State primary={primary} title="Select branch context" text="Wallet is branch-scoped. Select an active school and branch." />;

  return (
    <main className="wallet-page" style={{ "--wallet-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="wallet-search-card">
        <span className={`status-dot-mini ${summary.available ? "green" : "gray"}`} />
        <label className="wallet-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search wallet records..." /></label>
        <button type="button" className="wallet-add-inline" onClick={load}>↻</button>
        <button type="button" className="wallet-filter-button" onClick={() => setView(view === "cards" ? "table" : "cards")}>☷</button>
        <button type="button" className="wallet-icon-button" onClick={() => setMoreOpen(true)}>⋯</button>
      </section>

      <section className="wallet-section-tabs">
        <button className={section === "transactions" ? "active" : ""} onClick={() => setSection("transactions")}>Transactions {summary.transactions}</button>
        <button className={section === "settlements" ? "active" : ""} onClick={() => setSection("settlements")}>Settlements {summary.settlements}</button>
        <button className={section === "withdrawals" ? "active" : ""} onClick={() => setSection("withdrawals")}>Withdrawals {summary.withdrawals}</button>
      </section>

      {view === "analytics" && <Analytics summary={summary} currency={currency} />}
      {view === "table" && <Table rows={rows} currency={currency} section={section} />}
      {view === "cards" && (
        <section className="wallet-list">
          {rows.map((row) => <WalletCard key={String(idOf(row))} row={row} currency={row.currencyCode || currency} section={section} />)}
          {!rows.length && <Empty title="No wallet records" text="Student fee transactions, settlements and withdrawal requests will appear here." />}
        </section>
      )}

      {moreOpen && <MoreSheet view={view} setView={setView} summary={summary} currency={currency} close={() => setMoreOpen(false)} refresh={load} />}
    </main>
  );
}

function WalletCard({ row, currency, section }: { row: AnyRow; currency: string; section: string }) {
  return (
    <article className="wallet-card">
      <span className="wallet-avatar">{section === "settlements" ? "🏦" : section === "withdrawals" ? "🏧" : "💰"}</span>
      <span className="wallet-main">
        <strong>{money(row.amount, currency)}</strong>
        <small>{row.referenceNumber || row.providerReference || row.receiptNumber || row.id || "Wallet record"}</small>
        <em>{row.purpose || row.direction || section} · {dateLabel(row.paidAt || row.settledAt || row.requestedAt || row.createdAt)}</em>
      </span>
      <span className="wallet-side"><Chip tone={toneForStatus(row.status)}>{row.status || "recorded"}</Chip></span>
    </article>
  );
}

function Table({ rows, currency, section }: { rows: AnyRow[]; currency: string; section: string }) {
  return (
    <section className="wallet-table-card"><div className="wallet-table-scroll"><table>
      <thead><tr><th>{section} ({rows.length})</th><th>Amount</th><th>Status</th><th>Reference</th><th>Provider</th><th>Date</th><th>Note</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={String(idOf(row))}><td><strong>{row.purpose || row.direction || section}</strong><span>{row.payerName || row.recipientName || "Branch wallet"}</span></td><td>{money(row.amount, row.currencyCode || currency)}</td><td><Chip tone={toneForStatus(row.status)}>{row.status || "recorded"}</Chip></td><td>{row.referenceNumber || row.providerReference || row.receiptNumber || "—"}</td><td>{row.provider || row.channel || "manual"}</td><td>{dateLabel(row.paidAt || row.settledAt || row.requestedAt || row.createdAt)}</td><td>{row.note || "—"}</td></tr>)}</tbody>
    </table>{!rows.length && <div className="wallet-empty-table">No record matches your search.</div>}</div></section>
  );
}

function Analytics({ summary, currency }: { summary: AnyRow; currency: string }) {
  return (
    <section className="wallet-analysis-grid">
      <article className="wallet-analysis"><span>Available</span><strong>{money(summary.available, currency)}</strong><p>Estimated branch wallet balance.</p></article>
      <article className="wallet-analysis"><span>Total Inflow</span><strong>{money(summary.inflow, currency)}</strong><p>Confirmed student-fee inflows.</p></article>
      <article className="wallet-analysis"><span>Withdrawn</span><strong>{money(summary.withdrawn, currency)}</strong><p>Approved/paid withdrawals.</p></article>
      <article className="wallet-analysis"><span>Pending</span><strong>{money(summary.pendingWithdrawal, currency)}</strong><p>Requested or processing withdrawals.</p></article>
    </section>
  );
}

function MoreSheet({ view, setView, summary, currency, close, refresh }: { view: ViewMode; setView: (v: ViewMode) => void; summary: AnyRow; currency: string; close: () => void; refresh: () => void }) {
  return (
    <div className="wallet-sheet-backdrop"><section className="wallet-sheet small">
      <div className="wallet-sheet-head"><div><h2>Wallet</h2><p>{money(summary.available, currency)} available · {summary.transactions} transaction(s)</p></div><button onClick={close}>✕</button></div>
      <div className="wallet-menu-list">
        <button className={view === "cards" ? "active" : ""} onClick={() => { setView("cards"); close(); }}><span>☰</span><b>Cards view</b><small>Compact wallet records</small></button>
        <button className={view === "table" ? "active" : ""} onClick={() => { setView("table"); close(); }}><span>☷</span><b>Table view</b><small>Dense wallet records</small></button>
        <button className={view === "analytics" ? "active" : ""} onClick={() => { setView("analytics"); close(); }}><span>◔</span><b>Analytics</b><small>Available, inflow and withdrawals</small></button>
        <button onClick={() => { refresh(); close(); }}><span>↻</span><b>Refresh</b><small>Reload wallet records</small></button>
      </div>
    </section></div>
  );
}


const css = `
@keyframes spin{to{transform:rotate(360deg)}}
.wallet-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--wallet-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.wallet-page *,.wallet-page *::before,.wallet-page *::after{box-sizing:border-box;min-width:0}.wallet-page button,.wallet-page input,.wallet-page select,.wallet-page textarea{font:inherit;max-width:100%}.wallet-page button{-webkit-tap-highlight-color:transparent}.wallet-page input,.wallet-page select,.wallet-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.wallet-page textarea{min-height:96px;padding:12px;resize:vertical;line-height:1.5}.wallet-state,.wallet-search-card,.wallet-card,.wallet-table-card,.wallet-analysis,.wallet-empty,.wallet-sheet,.wallet-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.wallet-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.wallet-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--wallet-primary) 18%,transparent);border-top-color:var(--wallet-primary);animation:spin .8s linear infinite}.wallet-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.wallet-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.wallet-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.wallet-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.wallet-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.wallet-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.wallet-icon-button,.wallet-filter-button,.wallet-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.wallet-add-inline{border-color:var(--wallet-primary);background:var(--wallet-primary);color:#fff;font-size:15px;box-shadow:0 12px 28px color-mix(in srgb,var(--wallet-primary) 22%,transparent)}.wallet-filter-button{position:relative;background:color-mix(in srgb,var(--wallet-primary) 8%,var(--card-bg,#fff));color:var(--wallet-primary)}.wallet-filter-button.active{background:var(--wallet-primary);color:#fff;border-color:var(--wallet-primary)}.wallet-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.wallet-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.wallet-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.wallet-filter-chips::-webkit-scrollbar{display:none}.wallet-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--wallet-primary) 11%,transparent);color:var(--wallet-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.wallet-list{display:grid;gap:8px;margin-top:10px}.wallet-card{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.wallet-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--wallet-primary) 12%,var(--surface,#fff));font-size:22px}.wallet-main,.wallet-main strong,.wallet-main small,.wallet-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wallet-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.wallet-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.wallet-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.wallet-side{display:flex;align-items:center;gap:5px}.wallet-side button{min-height:31px;border:1px solid var(--wallet-primary);border-radius:999px;background:var(--wallet-primary);color:#fff;font-size:11px;font-weight:950;padding:0 10px;cursor:pointer}.wallet-side button.ghost{background:var(--surface,#fff);color:var(--text,#111827);border-color:var(--border,rgba(0,0,0,.10))}.wallet-side button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.wallet-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.wallet-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.wallet-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.wallet-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.wallet-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.wallet-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.wallet-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.wallet-section-tabs{display:flex;gap:7px;overflow-x:auto;margin-top:10px;scrollbar-width:none}.wallet-section-tabs::-webkit-scrollbar{display:none}.wallet-section-tabs button{flex:0 0 auto;min-height:36px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 12px;background:var(--card-bg,var(--surface,#fff));color:var(--muted,#64748b);font-size:11px;font-weight:950;cursor:pointer}.wallet-section-tabs button.active{background:var(--wallet-primary);border-color:var(--wallet-primary);color:#fff}.wallet-table-card,.wallet-analysis,.wallet-empty,.wallet-form-card{padding:13px;border-radius:24px}.wallet-table-card{margin-top:10px}.wallet-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.wallet-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.wallet-table-scroll th,.wallet-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.wallet-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--wallet-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.wallet-table-scroll td strong,.wallet-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wallet-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.wallet-table-actions{display:flex;gap:7px;overflow-x:auto}.wallet-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--wallet-primary);border-radius:999px;padding:0 12px;background:var(--wallet-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.wallet-table-actions button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.wallet-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.wallet-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.wallet-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.wallet-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.wallet-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.wallet-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;margin-top:10px}.wallet-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--wallet-primary) 12%,var(--surface,#fff));font-size:28px}.wallet-empty h3{margin:0;font-size:18px;font-weight:1000}.wallet-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.wallet-sheet-backdrop,.wallet-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.wallet-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.wallet-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.wallet-sheet-head,.wallet-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.wallet-sheet-head h2,.wallet-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.wallet-sheet-head p,.wallet-drawer-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.wallet-sheet-head button,.wallet-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.wallet-form{display:grid;gap:10px}.wallet-form label{display:grid;gap:6px}.wallet-form span,.wallet-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.wallet-menu-list{display:grid;gap:8px}.wallet-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.wallet-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--wallet-primary) 10%,transparent);color:var(--wallet-primary);font-weight:1000}.wallet-menu-list button b,.wallet-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wallet-menu-list button b{font-size:13px;font-weight:1000}.wallet-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.wallet-menu-list button.active{border-color:color-mix(in srgb,var(--wallet-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--wallet-primary) 8%,var(--surface,#fff))}.wallet-sheet-actions,.wallet-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.wallet-sheet-actions button,.wallet-drawer-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.wallet-sheet-actions button.primary,.wallet-drawer-actions button.primary{border-color:var(--wallet-primary);background:var(--wallet-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--wallet-primary) 25%,transparent)}.wallet-drawer-layer{place-items:stretch end;padding:0}.wallet-drawer-overlay{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.wallet-drawer{position:relative;z-index:1;width:min(720px,100%);height:100dvh;overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));box-shadow:-24px 0 80px rgba(15,23,42,.28)}.wallet-form-card{display:grid;gap:10px}.wallet-form-grid{display:grid;grid-template-columns:1fr;gap:10px}.wallet-form-grid label{display:grid;gap:6px}.wallet-form-grid label.wide{grid-column:1/-1}.wallet-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px;background:rgba(239,68,68,.12);color:#991b1b}@media (min-width:680px){.wallet-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.wallet-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.wallet-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wallet-card{border-radius:24px;padding:12px;grid-template-columns:auto minmax(0,1fr)}.wallet-side{grid-column:1/-1;justify-content:flex-end}.wallet-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wallet-analysis.wide{grid-column:span 2}.wallet-sheet-backdrop{place-items:center;padding:18px}.wallet-sheet{border-radius:28px;padding:18px}.wallet-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.wallet-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.wallet-search-card,.wallet-list,.wallet-analysis-grid,.wallet-table-card,.wallet-filter-chips,.wallet-section-tabs{max-width:1180px;margin-left:auto;margin-right:auto}.wallet-list{grid-template-columns:repeat(3,minmax(0,1fr))}.wallet-card{grid-template-columns:auto minmax(0,1fr) auto}.wallet-side{grid-column:auto}.wallet-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.wallet-analysis.wide{grid-column:span 2}}@media (max-width:520px){.wallet-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.wallet-icon-button,.wallet-filter-button,.wallet-add-inline{width:40px;height:40px}.wallet-card{grid-template-columns:auto minmax(0,1fr);align-items:start}.wallet-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.wallet-sheet,.wallet-drawer{padding:12px}.wallet-sheet-actions,.wallet-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.wallet-sheet-actions button,.wallet-drawer-actions button{width:100%}}
`;

