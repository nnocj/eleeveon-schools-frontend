"use client";

/**
 * app/accountant/modules/Accountantdashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON ACCOUNTANT DASHBOARD V2
 * ---------------------------------------------------------
 * Golden Standard Accountant Home.
 * Finance-scoped, offline-first, mobile-first, theme-safe.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and opened
 *   by RolePortalShell.
 * - Uses selected schoolId and branchId when available.
 * - If branchId is not present, counts school-wide finance records.
 * - Receives NAV_SECTIONS from app/accountant/page.tsx so dashboard modules
 *   always match the actual Accountant Portal menu.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { db } from "../../lib/db/db";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter = "all" | "finance" | "reports" | "communication" | "calendar" | "other";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type RouteProps = {
  navigate?: (key: string) => void;
  navSections?: RoleNavSection[];
};

type DashboardModule = {
  key: string;
  label: string;
  icon: string;
  area: Exclude<AreaFilter, "all">;
  value: string | number;
  note: string;
  tone: Tone;
  routeKey: string;
};

type CountMetric = {
  value: string | number;
  note: string;
  tone: Tone;
};

const HIDDEN_DASHBOARD_KEYS = new Set(["accountantDashboard"]);

const TABLE_NAMES = [
  "branches",
  "schools",
  "students",
  "studentEnrollments",
  "feeStructures",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "payments",
  "paymentTransactions",
  "paymentSettlements",
  "incomes",
  "expenses",
  "currencies",
  "schoolCurrencySettings",
  "announcements",
  "messageThreads",
  "messages",
  "calendarEvents",
] as const;

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession(): OpenWorkspaceSession | null {
  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership(): AnyRow | null {
  return safeJson<AnyRow>("activeMembership");
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed) return parsed;
  }

  return null;
}

function workspaceMembership(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  return (
    openWorkspace?.membership ||
    activeMembership ||
    readStoredActiveMembership() ||
    null
  );
}

function selectedSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeSchoolId?: any;
  activeSchool?: AnyRow | null;
  settings?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return firstPositiveNumber(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeRead("activeSchoolId")
  );
}

function selectedBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeBranchId?: any;
  activeBranch?: AnyRow | null;
  settings?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return firstPositiveNumber(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeRead("activeBranchId")
  );
}

function selectedAccountantName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  user?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return text(
    args.openWorkspace?.memberName ||
      args.openWorkspace?.fullName ||
      args.openWorkspace?.userName ||
      membership?.fullName ||
      membership?.memberName ||
      membership?.userName ||
      args.user?.fullName ||
      args.user?.name ||
      args.user?.email,
    "Accountant"
  );
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

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function scoped(row: AnyRow, args: { accountId?: string | null; schoolId?: any; branchId?: any }) {
  if (!sameAccount(row, args.accountId)) return false;

  const rowSchoolId = row.schoolId ?? row.schoolLocalId ?? row.payload?.schoolId;
  const rowBranchId = row.branchId ?? row.branchLocalId ?? row.payload?.branchId;

  if (args.schoolId && rowSchoolId && !sameId(rowSchoolId, args.schoolId)) return false;
  if (args.branchId && rowBranchId && !sameId(rowBranchId, args.branchId)) return false;

  return true;
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return (
    row?.isDeleted !== true &&
    row?.active !== false &&
    row?.disabled !== true &&
    !["deleted", "archived", "inactive", "disabled", "cancelled", "void"].includes(status)
  );
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function money(value: any, currency = "GHS") {
  const amount = n(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "GHS",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "GHS"} ${amount.toLocaleString()}`;
  }
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function sumMoney(rows: AnyRow[]) {
  return rows.filter(activeRow).reduce((total, row) => total + n(row.amount || row.total || row.balance || row.netAmount), 0);
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "sent", "succeeded", "success", "synced", "approved", "completed"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "expired", "suspended", "rejected"].includes(value)) return "red";
  if (["pending", "processing", "trial", "draft", "partial"].includes(value)) return "orange";
  if (["scheduled", "issued"].includes(value)) return "blue";
  return "gray";
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("finance")) return "finance";
  if (value.includes("report")) return "reports";
  if (value.includes("communication")) return "communication";
  if (value.includes("calendar")) return "calendar";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    finance: "Finance",
    reports: "Reports",
    communication: "Communication",
    calendar: "Calendar",
    other: "Other",
  };
  return labels[area] || area;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ad-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ad-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="ad-empty">
      <div>💼</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function buildNavModules(navSections?: RoleNavSection[]): Omit<DashboardModule, "value" | "note" | "tone">[] {
  const unique = new Map<string, Omit<DashboardModule, "value" | "note" | "tone">>();

  (navSections || []).forEach((section) => {
    const area = areaFromSectionTitle(section.title);

    section.items.forEach((item) => {
      if (HIDDEN_DASHBOARD_KEYS.has(item.key)) return;
      if (unique.has(item.key)) return;

      unique.set(item.key, {
        key: item.key,
        label: item.label,
        icon: item.icon,
        area,
        routeKey: item.key,
      });
    });
  });

  return [...unique.values()];
}

function metricFor(routeKey: string, rows: Record<string, AnyRow[]>, summary: AnyRow): CountMetric {
  const metricMap: Record<string, CountMetric> = {
    fees: {
      value: summary.feeBalance ? money(summary.feeBalance, summary.currencyCode) : summary.invoices,
      note: `${summary.invoices} invoice(s), ${summary.pendingInvoices} pending/partial.`,
      tone: summary.feeBalance ? "orange" : summary.invoices ? "green" : "gray",
    },
    payments: {
      value: summary.payments,
      note: `${money(summary.paymentTotal, summary.currencyCode)} total payment movement.`,
      tone: summary.payments ? "green" : "gray",
    },
    income: {
      value: money(summary.incomeTotal, summary.currencyCode),
      note: `${summary.incomes} income record(s).`,
      tone: summary.incomeTotal ? "green" : "gray",
    },
    expenses: {
      value: money(summary.expenseTotal, summary.currencyCode),
      note: `${summary.expenses} expense record(s).`,
      tone: summary.expenseTotal ? "orange" : "gray",
    },
    balances: {
      value: money(summary.balance, summary.currencyCode),
      note: `Income + payments less expenses and outstanding fees.`,
      tone: summary.balance >= 0 ? "green" : "red",
    },
    financeReports: {
      value: "Open",
      note: `${summary.invoices} invoices · ${summary.payments} payments · ${summary.expenses} expenses.`,
      tone: "blue",
    },
    announcements: {
      value: summary.announcements,
      note: "Finance-related school or branch announcements.",
      tone: summary.announcements ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "Finance communication threads and messages.",
      tone: summary.messages ? "green" : "gray",
    },
    calendar: {
      value: summary.events,
      note: "Payment dates, finance events and calendar records.",
      tone: summary.events ? "blue" : "gray",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return { value: count(guessedRows), note: "Auto-counted from matching local table.", tone: count(guessedRows) ? "green" : "gray" };
  }

  return { value: "Open", note: "Module is listed from Accountant navigation. Add a metric mapping when data is ready.", tone: "gray" };
}

export default function Accountantdashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading, user } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch();
  const { activeMembership } = useActiveMembership();
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedSchoolId({
    openWorkspace,
    activeMembership,
    activeSchoolId,
    activeSchool,
    settings: settings as AnyRow,
  });

  const branchId = selectedBranchId({
    openWorkspace,
    activeMembership,
    activeBranchId,
    activeBranch,
    settings: settings as AnyRow,
  });

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<AreaFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowsByTable, setRowsByTable] = useState<Record<string, AnyRow[]>>({});

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setRowsByTable({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const loaded = await Promise.all(
        TABLE_NAMES.map(async (tableName) => {
          const rows = await safeArray(tableName);
          return [tableName, rows.filter((row) => scoped(row, { accountId, schoolId, branchId }))] as const;
        })
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load accountant dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const summary = useMemo(() => {
    const invoices = rows.studentFeeInvoices || [];
    const invoiceItems = rows.studentFeeInvoiceItems || [];
    const payments = [...(rows.studentFeePayments || []), ...(rows.payments || []), ...(rows.paymentTransactions || [])];
    const incomes = rows.incomes || [];
    const expenses = rows.expenses || [];
    const settlements = rows.paymentSettlements || [];
    const schools = rows.schools || [];
    const branches = rows.branches || [];

    const invoiceTotal = invoices.reduce((total, row) => total + n(row.total || row.amount || row.balance || row.netAmount), 0);
    const invoiceItemsTotal = invoiceItems.reduce((total, row) => total + n(row.amount || row.total), 0);
    const paymentTotal = payments.reduce((total, row) => total + n(row.amount || row.total), 0);
    const incomeTotal = incomes.reduce((total, row) => total + n(row.amount || row.total), 0);
    const expenseTotal = expenses.reduce((total, row) => total + n(row.amount || row.total), 0);
    const pendingInvoices = invoices.filter((row) => ["pending", "partial", "overdue", ""].includes(String(row.status || "").toLowerCase())).length;
    const feeBalance = Math.max(0, Math.max(invoiceTotal, invoiceItemsTotal) - paymentTotal);
    const branchName = activeBranch?.name || branches.find((row) => branchId && sameId(idOf(row), branchId))?.name;
    const schoolName = activeSchool?.name || schools.find((row) => schoolId && sameId(idOf(row), schoolId))?.name;

    return {
      accountantName: selectedAccountantName({ openWorkspace, activeMembership, user }),
      schoolName: text(schoolName, schoolId ? `School ${schoolId}` : "School-wide"),
      branchName: text(branchName, branchId ? `Branch ${branchId}` : "All branches"),
      invoices: count(invoices),
      invoiceItems: count(invoiceItems),
      pendingInvoices,
      invoiceTotal: Math.max(invoiceTotal, invoiceItemsTotal),
      payments: count(payments),
      paymentTotal,
      incomes: count(incomes),
      incomeTotal,
      expenses: count(expenses),
      expenseTotal,
      settlements: count(settlements),
      feeBalance,
      balance: incomeTotal + paymentTotal - expenseTotal - feeBalance,
      students: count(rows.students || []),
      enrollments: count(rows.studentEnrollments || []),
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      events: count(rows.calendarEvents || []),
      currencyCode: text(payments[0]?.currency || payments[0]?.currencyCode || invoices[0]?.currencyCode || incomes[0]?.currencyCode || expenses[0]?.currencyCode, "GHS"),
    };
  }, [activeBranch, activeMembership, activeSchool, branchId, openWorkspace, rows, schoolId, user]);

  const modules = useMemo<DashboardModule[]>(() => {
    const navModules = buildNavModules(navSections);
    return navModules.map((module) => ({ ...module, ...metricFor(module.routeKey, rows, summary) }));
  }, [navSections, rows, summary]);

  const filteredModules = useMemo(() => {
    const q = query.toLowerCase().trim();
    return modules.filter((item) => {
      if (area !== "all" && item.area !== area) return false;
      if (!q) return true;
      return `${item.label} ${item.note} ${item.value} ${item.area}`.toLowerCase().includes(q);
    });
  }, [area, modules, query]);

  const recent = useMemo(() => {
    const records: AnyRow[] = [
      ...(rows.studentFeeInvoices || []).map((row) => ({ ...row, _kind: "Invoice", _icon: "💳", _title: money(row.total || row.amount || row.balance, row.currencyCode || "GHS"), _date: row.issuedAt || row.updatedAt || row.createdAt })),
      ...([...(rows.studentFeePayments || []), ...(rows.payments || []), ...(rows.paymentTransactions || [])]).map((row) => ({ ...row, _kind: "Payment", _icon: "🧾", _title: money(row.amount || row.total, row.currency || row.currencyCode || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
      ...(rows.incomes || []).map((row) => ({ ...row, _kind: "Income", _icon: "📈", _title: text(row.title || row.description || row.source, "Income"), _date: row.date || row.updatedAt || row.createdAt })),
      ...(rows.expenses || []).map((row) => ({ ...row, _kind: "Expense", _icon: "📉", _title: text(row.title || row.description || row.category, "Expense"), _date: row.date || row.updatedAt || row.createdAt })),
      ...(rows.announcements || []).map((row) => ({ ...row, _kind: "Announcement", _icon: "📢", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.calendarEvents || []).map((row) => ({ ...row, _kind: "Calendar", _icon: "📅", _title: text(row.title, "Calendar event"), _date: row.startAt || row.startTime || row.date || row.updatedAt || row.createdAt })),
    ];

    return records.filter(activeRow).sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [rows]);

  const activeFilterCount = area !== "all" ? 1 : 0;

  function openRoute(routeKey: string) {
    if (navigate) {
      navigate(routeKey);
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent("eleeveon:portal-route", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("role-portal:navigate", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("portal:navigate", { detail: routeKey }));
    } catch {
      // Optional shell fallback.
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening accountant dashboard..." text="Loading fees, payments, income, expenses and reports." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the accountant portal." />;
  }

  if (!schoolId) {
    return <State primary={primary} title="No finance workspace selected" text="Choose your accountant membership again from Select Role so finance records load for the right school." />;
  }

  return (
    <main className="ad-page" style={{ "--ad-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ad-search-card" aria-label="Accountant dashboard search and actions">
        <span className={`status-dot-mini ${summary.pendingInvoices || summary.feeBalance ? "orange" : "green"}`} title={`${summary.invoices} invoice(s), ${summary.payments} payment(s)`} />

        <label className="ad-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search finance modules..." aria-label="Search accountant dashboard" />
        </label>

        <button type="button" className="ad-add-inline" onClick={load} aria-label="Refresh accountant dashboard" title="Refresh">↻</button>

        <button type="button" className={`ad-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ad-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="ad-finance-strip" aria-label="Current finance context">
        <strong>{summary.accountantName}</strong>
        <span>{summary.schoolName} · {summary.branchName}</span>
        <Chip tone={summary.feeBalance ? "orange" : "green"}>{summary.feeBalance ? `${money(summary.feeBalance, summary.currencyCode)} due` : "Clear"}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="ad-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="ad-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="accountant-row" onClick={() => openRoute(item.routeKey)}>
              <span className="accountant-avatar">{item.icon}</span>
              <span className="accountant-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="accountant-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching finance modules" text="Clear filters or search to show your accountant modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="ad-recent">
          <div className="ad-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="ad-recent-list">
            {recent.map((item, index) => (
              <article key={`${item._kind}-${idOf(item) || index}`} className="recent-row">
                <span>{item._icon}</span>
                <b>{item._title}</b>
                <small>{item._kind} · {dateLabel(item._date)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {filterOpen ? <FilterSheet area={area} setArea={setArea} onClose={() => setFilterOpen(false)} /> : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ad-page" style={{ "--ad-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ad-state">
        <div className="ad-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="ad-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ad-sheet small">
        <div className="ad-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which finance area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ad-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="finance">Finance</option>
              <option value="reports">Reports</option>
              <option value="communication">Communication</option>
              <option value="calendar">Calendar</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="ad-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ad-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ad-sheet small">
        <div className="ad-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the finance home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ad-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact finance modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.invoices} invoices · {summary.payments} payments · {summary.expenses} expenses</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local finance data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="ad-table-card">
      <div className="ad-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Finance Modules ({modules.length})</th>
              <th>Area</th>
              <th>Value</th>
              <th>Status</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((item) => (
              <tr key={item.key}>
                <td><strong>{item.icon} {item.label}</strong><span>{item.routeKey}</span></td>
                <td>{areaLabel(item.area)}</td>
                <td>{item.value}</td>
                <td><Chip tone={item.tone}>{item.tone}</Chip></td>
                <td>{item.note}</td>
                <td><div className="ad-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="ad-empty-table">No finance module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["finance", "reports", "communication", "calendar", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="ad-analysis-grid">
      <article className="ad-analysis"><span>Invoices</span><strong>{summary.invoices}</strong><p>{summary.pendingInvoices} pending/partial, {money(summary.feeBalance, summary.currencyCode)} outstanding.</p></article>
      <article className="ad-analysis"><span>Payments</span><strong>{summary.payments}</strong><p>{money(summary.paymentTotal, summary.currencyCode)} total payment movement.</p></article>
      <article className="ad-analysis"><span>Income</span><strong>{money(summary.incomeTotal, summary.currencyCode)}</strong><p>{summary.incomes} income record(s).</p></article>
      <article className="ad-analysis"><span>Expenses</span><strong>{money(summary.expenseTotal, summary.currencyCode)}</strong><p>{summary.expenses} expense record(s).</p></article>
      <article className="ad-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="ad-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="ad-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="ad-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent invoices, payments, income, expenses, announcements and calendar events.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.ad-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ad-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ad-page *,.ad-page *::before,.ad-page *::after{box-sizing:border-box;min-width:0}.ad-page button,.ad-page input,.ad-page select{font:inherit;max-width:100%}.ad-page button{-webkit-tap-highlight-color:transparent}.ad-page input,.ad-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ad-page input:focus,.ad-page select:focus{border-color:color-mix(in srgb,var(--ad-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ad-primary) 12%,transparent)}.ad-state,.ad-search-card,.accountant-row,.ad-table-card,.ad-analysis,.ad-empty,.ad-sheet,.ad-recent,.recent-row,.ad-finance-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ad-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ad-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ad-primary) 18%,transparent);border-top-color:var(--ad-primary);animation:spin .8s linear infinite}.ad-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ad-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ad-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ad-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ad-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ad-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ad-icon-button,.ad-filter-button,.ad-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ad-add-inline{border-color:var(--ad-primary);background:var(--ad-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--ad-primary) 22%,transparent)}.ad-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ad-filter-button{position:relative;background:color-mix(in srgb,var(--ad-primary) 8%,var(--card-bg,#fff));color:var(--ad-primary)}.ad-filter-button.active{background:var(--ad-primary);color:#fff;border-color:var(--ad-primary)}.ad-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.ad-finance-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.ad-finance-strip strong,.ad-finance-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ad-finance-strip strong{font-size:13px;font-weight:1000}.ad-finance-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.ad-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ad-filter-chips::-webkit-scrollbar{display:none}.ad-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ad-primary) 11%,transparent);color:var(--ad-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ad-list{display:grid;gap:7px;margin-top:10px}.accountant-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.accountant-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ad-primary) 12%,var(--surface,#fff));font-size:22px}.accountant-main,.accountant-main strong,.accountant-main small,.accountant-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.accountant-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.accountant-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.accountant-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.accountant-side{display:flex;align-items:center;gap:7px}.accountant-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.ad-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ad-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ad-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ad-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ad-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ad-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ad-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ad-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ad-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ad-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ad-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ad-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ad-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ad-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ad-form{display:grid;gap:10px}.ad-form label{display:grid;gap:6px}.ad-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ad-menu-list{display:grid;gap:8px}.ad-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ad-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ad-primary) 10%,transparent);color:var(--ad-primary);font-weight:1000}.ad-menu-list button b,.ad-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ad-menu-list button b{font-size:13px;font-weight:1000}.ad-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ad-menu-list button.active{border-color:color-mix(in srgb,var(--ad-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ad-primary) 8%,var(--surface,#fff))}.ad-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ad-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ad-sheet-actions button.primary{border-color:var(--ad-primary);background:var(--ad-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ad-primary) 25%,transparent)}.ad-table-card,.ad-analysis,.ad-empty{padding:13px;border-radius:24px}.ad-table-card{margin-top:10px}.ad-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ad-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ad-table-scroll th,.ad-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ad-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ad-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ad-table-scroll td strong,.ad-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ad-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ad-table-actions{display:flex;gap:7px;overflow-x:auto}.ad-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--ad-primary);border-radius:999px;padding:0 12px;background:var(--ad-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.ad-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ad-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ad-analysis span,.ad-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ad-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ad-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ad-analysis-list{display:grid;gap:10px;margin-top:12px}.ad-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ad-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ad-analysis-list b,.ad-analysis-list small{font-size:12px}.ad-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ad-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ad-progress i{display:block;height:100%;border-radius:inherit;background:var(--ad-primary)}.ad-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ad-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ad-primary) 12%,var(--surface,#fff));font-size:28px}.ad-empty h3{margin:0;font-size:18px;font-weight:1000}.ad-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ad-recent{margin-top:10px;border-radius:24px;padding:12px}.ad-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.ad-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.ad-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ad-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.ad-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ad-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.ad-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.accountant-row{border-radius:24px;padding:12px}.ad-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ad-analysis.wide{grid-column:span 2}.ad-sheet-backdrop{place-items:center;padding:18px}.ad-sheet{border-radius:28px;padding:18px}.ad-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.ad-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ad-search-card,.ad-finance-strip,.ad-list,.ad-analysis-grid,.ad-table-card,.ad-filter-chips,.ad-recent{max-width:1180px;margin-left:auto;margin-right:auto}.ad-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ad-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ad-analysis.wide{grid-column:span 2}.ad-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.ad-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ad-icon-button,.ad-filter-button,.ad-add-inline{width:40px;height:40px}.accountant-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.accountant-side{grid-column:1/-1;justify-content:flex-end}.ad-finance-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.ad-finance-strip span{grid-row:2}.ad-sheet{border-radius:24px 24px 18px 18px;padding:12px}.ad-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ad-sheet-actions button{width:100%}}
`;
