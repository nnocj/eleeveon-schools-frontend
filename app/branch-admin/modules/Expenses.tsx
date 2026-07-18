"use client";

/**
 * app/branch-admin/modules/Expenses.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH EXPENSES V1
 * ---------------------------------------------------------
 * Golden Standard Finance Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Purpose:
 * - Let a Branch Admin record, review and control branch expenses.
 * - Track amount, category, payment method, vendor/paid-to, approver,
 *   reference number and receipt number.
 * - Keep expense records ready for branch finance analytics and future reports.
 *
 * Golden UI behavior:
 * - no hero card
 * - compact search + inline add + slider filter + More sheet
 * - one visible section at a time
 * - cards, table and analytics views
 * - filters moved into a bottom sheet
 * - dark-mode safe table headers and surfaces
 *
 * Tables used:
 * - expenses
 * - organizations
 * - schoolCurrencySettings
 *
 * Sync behavior:
 * - createLocal(...) creates expenses
 * - updateLocal(...) updates expenses
 * - softDeleteLocal(...) archives expenses
 * - listActiveLocal(...) reads active branch-scoped rows
 * - no manual sync/version fields are written directly here
 *
 * Workspace source fix:
 * - Resolves the active school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 * - Prevents stale branch finance data after role/workspace switching.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { createLocal, listActiveLocal, softDeleteLocal, updateLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type ExpenseCategory =
  | "utilities"
  | "salary"
  | "transport"
  | "feeding"
  | "maintenance"
  | "procurement"
  | "events"
  | "academic"
  | "administration"
  | "technology"
  | "marketing"
  | "security"
  | "other";

type MethodFilter = "all" | "cash" | "momo" | "bank" | "card";
type CategoryFilter = "all" | ExpenseCategory;

type ExpenseForm = {
  id: number;
  title: string;
  description: string;
  amount: string;
  paymentMethod: "cash" | "momo" | "bank" | "card";
  expenseSourceType: ExpenseCategory;
  date: string;
  organizationId: string;
  paidTo: string;
  approvedBy: string;
  receiptNumber: string;
  referenceNumber: string;
  currencyCode: string;
  currencySymbol: string;
};

const emptyExpenseForm: ExpenseForm = {
  id: 0,
  title: "",
  description: "",
  amount: "",
  paymentMethod: "cash",
  expenseSourceType: "other",
  date: new Date().toISOString().slice(0, 10),
  organizationId: "",
  paidTo: "",
  approvedBy: "",
  receiptNumber: "",
  referenceNumber: "",
  currencyCode: "GHS",
  currencySymbol: "₵",
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

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: "utilities", label: "Utilities", icon: "💡" },
  { value: "salary", label: "Salary", icon: "🧾" },
  { value: "transport", label: "Transport", icon: "🚌" },
  { value: "feeding", label: "Feeding", icon: "🍲" },
  { value: "maintenance", label: "Maintenance", icon: "🛠️" },
  { value: "procurement", label: "Procurement", icon: "📦" },
  { value: "events", label: "Events", icon: "🎪" },
  { value: "academic", label: "Academic", icon: "📚" },
  { value: "administration", label: "Administration", icon: "🗂️" },
  { value: "technology", label: "Technology", icon: "💻" },
  { value: "marketing", label: "Marketing", icon: "📣" },
  { value: "security", label: "Security", icon: "🛡️" },
  { value: "other", label: "Other", icon: "📌" },
];

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

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
}

function categoryInfo(value?: string) {
  return CATEGORY_OPTIONS.find((item) => item.value === value) || CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
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

function methodTone(method?: string): Tone {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "green";
  if (value === "momo") return "orange";
  if (value === "bank") return "blue";
  if (value === "card") return "purple";
  return "gray";
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ex-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ex-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="ex-empty">
      <div>📉</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function ExpensesPage() {
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
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [organizations, setOrganizations] = useState<AnyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<AnyRow[]>([]);
  const [expenses, setExpenses] = useState<AnyRow[]>([]);
  const [form, setForm] = useState<ExpenseForm>(emptyExpenseForm);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  function showToast(tone: ToastTone, message: string) {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  }

  async function load() {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [organizationRows, currencyRows, expenseRows] = await Promise.all([
        listActiveLocal<AnyRow>("organizations" as any),
        listActiveLocal<AnyRow>("schoolCurrencySettings" as any),
        listActiveLocal<AnyRow>("expenses" as any),
      ]);

      setOrganizations(organizationRows.filter((row) => sameScope(row, accountId, schoolId, branchId)).sort((a, b) => rowName(a).localeCompare(rowName(b))));
      setCurrencySettings(currencyRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setExpenses(expenseRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
    } catch (error) {
      console.error("Failed to load branch expenses:", error);
      showToast("error", "Failed to load expenses.");
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

  const currency = useMemo(() => {
    const preferred = currencySettings.find((row) => row.defaultForIncomeExpense || row.active !== false) || currencySettings[0];
    return {
      code: text(preferred?.currencyCode || expenses[0]?.currencyCode, "GHS"),
      symbol: text(preferred?.currencySymbol, "₵"),
      name: text(preferred?.currencyName, "Ghana Cedi"),
    };
  }, [currencySettings, expenses]);

  const organizationMap = useMemo(() => new Map(organizations.map((item) => [Number(idOf(item)), rowName(item)])), [organizations]);

  const filteredExpenses = useMemo(() => {
    const q = query.toLowerCase().trim();

    return expenses
      .filter((row) => category === "all" || String(row.expenseSourceType || "other") === category)
      .filter((row) => method === "all" || String(row.paymentMethod || "") === method)
      .filter((row) => organizationFilter === "all" || String(row.organizationId || "") === organizationFilter)
      .filter((row) => {
        if (!q) return true;
        return [
          row.title,
          row.description,
          row.source,
          row.paidTo,
          row.approvedBy,
          row.referenceNumber,
          row.receiptNumber,
          row.expenseSourceType,
          row.paymentMethod,
          organizationMap.get(Number(row.organizationId)),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.date || b.updatedAt || b.createdAt) - n(a.date || a.updatedAt || a.createdAt));
  }, [category, expenses, method, organizationFilter, organizationMap, query]);

  const summary = useMemo(() => {
    const total = filteredExpenses.reduce((sum, row) => sum + n(row.amount), 0);
    const allTotal = expenses.reduce((sum, row) => sum + n(row.amount), 0);
    const cash = filteredExpenses.filter((row) => String(row.paymentMethod) === "cash").reduce((sum, row) => sum + n(row.amount), 0);
    const momo = filteredExpenses.filter((row) => String(row.paymentMethod) === "momo").reduce((sum, row) => sum + n(row.amount), 0);
    const bank = filteredExpenses.filter((row) => String(row.paymentMethod) === "bank").reduce((sum, row) => sum + n(row.amount), 0);
    const card = filteredExpenses.filter((row) => String(row.paymentMethod) === "card").reduce((sum, row) => sum + n(row.amount), 0);

    return {
      shown: filteredExpenses.length,
      all: expenses.length,
      total,
      allTotal,
      cash,
      momo,
      bank,
      card,
      categories: CATEGORY_OPTIONS.map((item) => ({
        ...item,
        count: filteredExpenses.filter((row) => String(row.expenseSourceType || "other") === item.value).length,
        amount: filteredExpenses.filter((row) => String(row.expenseSourceType || "other") === item.value).reduce((sum, row) => sum + n(row.amount), 0),
      })),
    };
  }, [expenses, filteredExpenses]);

  const activeFilterCount = useMemo(
    () => [category !== "all", method !== "all", organizationFilter !== "all"].filter(Boolean).length,
    [category, method, organizationFilter]
  );

  function openDrawer(existing?: AnyRow) {
    const preferred = currency;
    setMessage("");
    setForm(
      existing
        ? {
            id: cleanId(idOf(existing)),
            title: text(existing.title),
            description: text(existing.description),
            amount: String(existing.amount || ""),
            paymentMethod: (existing.paymentMethod || "cash") as ExpenseForm["paymentMethod"],
            expenseSourceType: (existing.expenseSourceType || "other") as ExpenseCategory,
            date: text(existing.date, new Date().toISOString().slice(0, 10)),
            organizationId: existing.organizationId ? String(existing.organizationId) : "",
            paidTo: text(existing.paidTo),
            approvedBy: text(existing.approvedBy),
            receiptNumber: text(existing.receiptNumber),
            referenceNumber: text(existing.referenceNumber),
            currencyCode: text(existing.currencyCode, preferred.code),
            currencySymbol: text(existing.currencySymbol, preferred.symbol),
          }
        : { ...emptyExpenseForm, currencyCode: preferred.code, currencySymbol: preferred.symbol }
    );
    setDrawerOpen(true);
  }

  async function saveExpense() {
    if (!accountId || !schoolId || !branchId) return setMessage("Select a school and branch before saving expenses.");
    if (!form.title.trim()) return setMessage("Enter an expense title.");
    if (n(form.amount) <= 0) return setMessage("Enter a valid expense amount.");

    setSaving(true);

    try {
      const payload: AnyRow = {
        accountId: String(accountId),
        schoolId,
        branchId,
        organizationId: cleanId(form.organizationId) || undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        amount: n(form.amount),
        paymentMethod: form.paymentMethod,
        expenseSourceType: form.expenseSourceType,
        date: form.date || new Date().toISOString().slice(0, 10),
        paidTo: form.paidTo.trim(),
        approvedBy: form.approvedBy.trim(),
        receiptNumber: form.receiptNumber.trim(),
        referenceNumber: form.referenceNumber.trim(),
        currencyCode: form.currencyCode || currency.code,
        currencySymbol: form.currencySymbol || currency.symbol,
        active: true,
        isDeleted: false,
      };

      if (form.id) await updateLocal("expenses" as any, form.id, payload);
      else await createLocal("expenses" as any, payload);

      setDrawerOpen(false);
      showToast("success", form.id ? "Expense updated." : "Expense saved.");
      await load();
    } catch (error: any) {
      console.error("Failed to save expense:", error);
      showToast("error", error?.message || "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(row: AnyRow) {
    const id = cleanId(idOf(row));
    if (!id) return;
    if (!window.confirm(`Delete expense ${row.title || "record"}?`)) return;

    try {
      await softDeleteLocal("expenses" as any, id);
      showToast("success", "Expense deleted.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete expense.");
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening expenses..." text="Loading branch expenses and finance records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing branch expenses." />;
  }

  if (!schoolId || !branchId) {
    return <State primary={primary} title="Select branch context" text="Expenses are branch-scoped. Choose an active school and branch before continuing." />;
  }

  return (
    <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ex-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ex-search-card" aria-label="Expenses search and actions">
        <span className={`status-dot-mini ${summary.shown ? "red" : "gray"}`} title={`${summary.shown} expense(s)`} />

        <label className="ex-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses..." aria-label="Search expenses" />
        </label>

        <button type="button" className="ex-add-inline" onClick={() => openDrawer()} aria-label="Add expense">+</button>

        <button type="button" className={`ex-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ex-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(category !== "all" || method !== "all" || organizationFilter !== "all" || query.trim()) && (
        <section className="ex-filter-chips" aria-label="Active filters">
          {category !== "all" && <button type="button" onClick={() => setCategory("all")}>Category: {categoryInfo(category).label} ×</button>}
          {method !== "all" && <button type="button" onClick={() => setMethod("all")}>Method: {method} ×</button>}
          {organizationFilter !== "all" && <button type="button" onClick={() => setOrganizationFilter("all")}>Organization: {organizationMap.get(Number(organizationFilter)) || organizationFilter} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" && <AnalyticsView summary={summary} currency={currency.code} />}

      {view === "table" && <TableView rows={filteredExpenses} organizationMap={organizationMap} currency={currency.code} openDrawer={openDrawer} deleteExpense={deleteExpense} />}

      {view === "cards" && (
        <section className="ex-list">
          {filteredExpenses.map((row) => (
            <ExpenseCard
              key={String(idOf(row))}
              row={row}
              organizationName={organizationMap.get(Number(row.organizationId)) || "General branch"}
              currency={row.currencyCode || currency.code}
              openDrawer={openDrawer}
              deleteExpense={deleteExpense}
            />
          ))}

          {!filteredExpenses.length && <Empty title="No expenses found" text="Tap + to record branch expenses such as utilities, feeding, transport, maintenance and procurement." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          category={category}
          setCategory={setCategory}
          method={method}
          setMethod={setMethod}
          organizationFilter={organizationFilter}
          setOrganizationFilter={setOrganizationFilter}
          organizations={organizations}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          view={view}
          setView={(mode) => {
            setView(mode);
            setMoreOpen(false);
          }}
          summary={summary}
          currency={currency.code}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onAdd={() => {
            setMoreOpen(false);
            openDrawer();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {drawerOpen && (
        <ExpenseDrawer
          form={form}
          setForm={setForm}
          organizations={organizations}
          message={message}
          saving={saving}
          save={saveExpense}
          close={() => setDrawerOpen(false)}
        />
      )}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ex-state">
        <div className="ex-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function ExpenseCard({ row, organizationName, currency, openDrawer, deleteExpense }: { row: AnyRow; organizationName: string; currency: string; openDrawer: (row: AnyRow) => void; deleteExpense: (row: AnyRow) => void }) {
  const category = categoryInfo(row.expenseSourceType || "other");

  return (
    <article className="expense-row">
      <span className="expense-avatar">{category.icon}</span>
      <span className="expense-main">
        <strong>{row.title || "Expense"}</strong>
        <small>{organizationName} · {dateLabel(row.date || row.createdAt)}</small>
        <em>{text(row.paidTo, "No paid-to name")} · {text(row.referenceNumber || row.receiptNumber, "No reference")}</em>
      </span>
      <span className="expense-side">
        <Chip tone="red">{money(row.amount, currency)}</Chip>
        <Chip tone={methodTone(row.paymentMethod)}>{row.paymentMethod || "cash"}</Chip>
        <button type="button" onClick={() => openDrawer(row)}>Edit</button>
        <button type="button" className="danger" onClick={() => deleteExpense(row)}>⌫</button>
      </span>
    </article>
  );
}

function TableView({ rows, organizationMap, currency, openDrawer, deleteExpense }: { rows: AnyRow[]; organizationMap: Map<number, string>; currency: string; openDrawer: (row: AnyRow) => void; deleteExpense: (row: AnyRow) => void }) {
  return (
    <section className="ex-table-card">
      <div className="ex-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Expenses ({rows.length})</th>
              <th>Category</th>
              <th>Organization</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Paid To</th>
              <th>Date</th>
              <th>Reference</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const category = categoryInfo(row.expenseSourceType || "other");
              return (
                <tr key={String(idOf(row))}>
                  <td><strong>{row.title || "Expense"}</strong><span>{row.description || "No description"}</span></td>
                  <td>{category.icon} {category.label}</td>
                  <td>{organizationMap.get(Number(row.organizationId)) || "General branch"}</td>
                  <td>{money(row.amount, row.currencyCode || currency)}</td>
                  <td><Chip tone={methodTone(row.paymentMethod)}>{row.paymentMethod || "cash"}</Chip></td>
                  <td>{row.paidTo || "Not set"}</td>
                  <td>{dateLabel(row.date || row.createdAt)}</td>
                  <td>{row.referenceNumber || row.receiptNumber || "Not set"}</td>
                  <td><div className="ex-table-actions"><button type="button" onClick={() => openDrawer(row)}>Edit</button><button type="button" className="danger" onClick={() => deleteExpense(row)}>Delete</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ex-empty-table">No expense matches your filters.</div>}
      </div>
    </section>
  );
}

function FilterSheet({ category, setCategory, method, setMethod, organizationFilter, setOrganizationFilter, organizations, onClose }: { category: CategoryFilter; setCategory: (value: CategoryFilter) => void; method: MethodFilter; setMethod: (value: MethodFilter) => void; organizationFilter: string; setOrganizationFilter: (value: string) => void; organizations: AnyRow[]; onClose: () => void }) {
  return (
    <div className="ex-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ex-sheet small">
        <div className="ex-sheet-head"><div><h2>Filters</h2><p>Choose category, payment method and organization.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ex-form compact">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}><option value="all">All categories</option>{CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Payment Method</span><select value={method} onChange={(event) => setMethod(event.target.value as MethodFilter)}><option value="all">All methods</option><option value="cash">Cash</option><option value="momo">Momo</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
          <label><span>Organization</span><select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}><option value="all">All organizations</option>{organizations.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        </div>
        <div className="ex-sheet-actions"><button type="button" onClick={() => { setCategory("all"); setMethod("all"); setOrganizationFilter("all"); }}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, currency, onRefresh, onAdd, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; currency: string; onRefresh: () => void | Promise<void>; onAdd: () => void; onClose: () => void }) {
  return (
    <div className="ex-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ex-sheet small">
        <div className="ex-sheet-head"><div><h2>More</h2><p>Views and finance actions are kept here to save space.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ex-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards view</b><small>{summary.shown} expense(s) shown</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense expense records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{money(summary.total, currency)} total shown</small></button>
          <button type="button" onClick={onAdd}><span>📉</span><b>New expense</b><small>Record branch spending</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch expenses</small></button>
        </div>
      </section>
    </div>
  );
}

function ExpenseDrawer({ form, setForm, organizations, message, saving, save, close }: { form: ExpenseForm; setForm: React.Dispatch<React.SetStateAction<ExpenseForm>>; organizations: AnyRow[]; message: string; saving: boolean; save: () => void | Promise<void>; close: () => void }) {
  return (
    <div className="ex-drawer-layer" role="dialog" aria-modal="true"><button className="ex-drawer-overlay" type="button" onClick={close} /><aside className="ex-drawer">
      <div className="ex-drawer-head"><div><p>{form.id ? "Edit Expense" : "New Expense"}</p><h2>Branch Expense</h2><span>{form.amount ? money(form.amount, form.currencyCode) : "Record spending"}</span></div><button type="button" onClick={close}>✕</button></div>
      {message && <section className="ex-inline-error">{message}</section>}
      <section className="ex-form-card"><div className="ex-form-grid">
        <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Electricity bill, chalk purchase..." /></label>
        <label><span>Amount</span><input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label><span>Category</span><select value={form.expenseSourceType} onChange={(event) => setForm({ ...form, expenseSourceType: event.target.value as ExpenseCategory })}>{CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>Payment Method</span><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as ExpenseForm["paymentMethod"] })}><option value="cash">Cash</option><option value="momo">Momo</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
        <label><span>Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label><span>Organization</span><select value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}><option value="">General branch</option>{organizations.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Paid To / Vendor</span><input value={form.paidTo} onChange={(event) => setForm({ ...form, paidTo: event.target.value })} placeholder="Vendor or recipient name" /></label>
        <label><span>Approved By</span><input value={form.approvedBy} onChange={(event) => setForm({ ...form, approvedBy: event.target.value })} placeholder="Approver name" /></label>
        <label><span>Reference Number</span><input value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} /></label>
        <label><span>Receipt Number</span><input value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} /></label>
        <label><span>Currency</span><input value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value.toUpperCase() })} /></label>
        <label className="wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Optional notes for audit and reporting" /></label>
      </div></section>
      <div className="ex-drawer-actions"><button type="button" onClick={close}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Expense"}</button></div>
    </aside></div>
  );
}

function AnalyticsView({ summary, currency }: { summary: AnyRow; currency: string }) {
  const methodRows = [
    { label: "Cash", value: summary.cash },
    { label: "Momo", value: summary.momo },
    { label: "Bank", value: summary.bank },
    { label: "Card", value: summary.card },
  ];
  const maxCategory = Math.max(1, ...summary.categories.map((item: any) => n(item.amount)));

  return (
    <section className="ex-analysis-grid">
      <article className="ex-analysis"><span>Total Expenses</span><strong>{money(summary.total, currency)}</strong><p>{summary.shown} expense record(s) currently shown.</p></article>
      <article className="ex-analysis"><span>All Records</span><strong>{summary.all}</strong><p>{money(summary.allTotal, currency)} across all branch expenses.</p></article>
      <article className="ex-analysis"><span>Cash</span><strong>{money(summary.cash, currency)}</strong><p>Cash expense amount currently shown.</p></article>
      <article className="ex-analysis"><span>Momo / Bank / Card</span><strong>{money(summary.momo + summary.bank + summary.card, currency)}</strong><p>Digital and bank payment methods.</p></article>

      <article className="ex-analysis wide"><span>Payment Method</span><strong>{money(summary.total, currency)}</strong><div className="ex-analysis-list">{methodRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{money(row.value, currency)}</small></div><div className="ex-progress"><i style={{ width: `${Math.max(5, Math.round((n(row.value) / Math.max(1, n(summary.total))) * 100))}%` }} /></div></section>)}</div></article>
      <article className="ex-analysis wide"><span>Categories</span><strong>{summary.categories.filter((item: any) => item.count).length}</strong><div className="ex-analysis-list">{summary.categories.filter((item: any) => item.count).map((row: any) => <section key={row.value}><div><b>{row.icon} {row.label}</b><small>{money(row.amount, currency)}</small></div><div className="ex-progress"><i style={{ width: `${Math.max(5, Math.round((n(row.amount) / maxCategory) * 100))}%` }} /></div></section>)}</div></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.ex-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ex-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ex-page *,.ex-page *::before,.ex-page *::after{box-sizing:border-box;min-width:0}.ex-page button,.ex-page input,.ex-page select,.ex-page textarea{font:inherit;max-width:100%}.ex-page button{-webkit-tap-highlight-color:transparent}.ex-page input,.ex-page select,.ex-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ex-page textarea{min-height:110px;padding:12px;resize:vertical;line-height:1.5}.ex-page input:focus,.ex-page select:focus,.ex-page textarea:focus{border-color:color-mix(in srgb,var(--ex-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ex-primary) 12%,transparent)}.ex-state,.ex-search-card,.expense-row,.ex-table-card,.ex-analysis,.ex-empty,.ex-sheet,.ex-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ex-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ex-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ex-primary) 18%,transparent);border-top-color:var(--ex-primary);animation:spin .8s linear infinite}.ex-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ex-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ex-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.ex-toast.success{background:rgba(34,197,94,.14);color:#166534}.ex-toast.error,.ex-inline-error{background:rgba(239,68,68,.12);color:#991b1b}.ex-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.ex-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.ex-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px}.ex-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ex-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ex-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ex-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ex-icon-button,.ex-filter-button,.ex-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ex-add-inline{border-color:var(--ex-primary);background:var(--ex-primary);color:#fff;font-size:25px;box-shadow:0 12px 28px color-mix(in srgb,var(--ex-primary) 22%,transparent)}.ex-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ex-filter-button{position:relative;background:color-mix(in srgb,var(--ex-primary) 8%,var(--card-bg,#fff));color:var(--ex-primary)}.ex-filter-button.active{background:var(--ex-primary);color:#fff;border-color:var(--ex-primary)}.ex-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.red{background:#ef4444}.status-dot-mini.gray{background:var(--muted,#64748b)}.ex-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ex-filter-chips::-webkit-scrollbar{display:none}.ex-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ex-primary) 11%,transparent);color:var(--ex-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ex-list{display:grid;gap:8px;margin-top:10px}.expense-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.expense-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ex-primary) 12%,var(--surface,#fff));font-size:22px}.expense-main,.expense-main strong,.expense-main small,.expense-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.expense-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.expense-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.expense-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.expense-side{display:flex;align-items:center;gap:5px}.expense-side button{min-height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}.expense-side button.danger,.ex-table-actions button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.ex-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ex-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ex-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ex-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ex-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ex-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ex-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ex-sheet-backdrop,.ex-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ex-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ex-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ex-sheet-head,.ex-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ex-sheet-head h2,.ex-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ex-sheet-head p,.ex-drawer-head p{margin:0;color:var(--ex-primary);font-size:10px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase}.ex-sheet-head p+*,.ex-drawer-head p+*{margin-top:2px}.ex-sheet-head span,.ex-drawer-head span{display:block;margin-top:5px;color:var(--muted,#64748b);font-size:12px;font-weight:800}.ex-sheet-head button,.ex-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ex-form{display:grid;gap:10px}.ex-form label{display:grid;gap:6px}.ex-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ex-menu-list{display:grid;gap:8px}.ex-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ex-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ex-primary) 10%,transparent);color:var(--ex-primary);font-weight:1000}.ex-menu-list button b,.ex-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ex-menu-list button b{font-size:13px;font-weight:1000}.ex-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ex-menu-list button.active{border-color:color-mix(in srgb,var(--ex-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ex-primary) 8%,var(--surface,#fff))}.ex-sheet-actions,.ex-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ex-sheet-actions button,.ex-drawer-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ex-sheet-actions button.primary,.ex-drawer-actions button.primary{border-color:var(--ex-primary);background:var(--ex-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ex-primary) 25%,transparent)}.ex-table-card,.ex-analysis,.ex-empty,.ex-form-card{padding:13px;border-radius:24px}.ex-table-card{margin-top:10px}.ex-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ex-table-scroll table{width:100%;min-width:1020px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ex-table-scroll th,.ex-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ex-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ex-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ex-table-scroll td strong,.ex-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ex-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ex-table-actions{display:flex;gap:7px;overflow-x:auto}.ex-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--ex-primary);border-radius:999px;padding:0 12px;background:var(--ex-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.ex-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ex-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ex-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ex-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ex-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ex-analysis-list{display:grid;gap:10px;margin-top:12px}.ex-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ex-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ex-analysis-list b,.ex-analysis-list small{font-size:12px}.ex-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ex-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ex-progress i{display:block;height:100%;border-radius:inherit;background:var(--ex-primary)}.ex-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;margin-top:10px}.ex-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ex-primary) 12%,var(--surface,#fff));font-size:28px}.ex-empty h3{margin:0;font-size:18px;font-weight:1000}.ex-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ex-drawer-layer{place-items:stretch end;padding:0}.ex-drawer-overlay{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.ex-drawer{position:relative;z-index:1;width:min(720px,100%);height:100dvh;overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));box-shadow:-24px 0 80px rgba(15,23,42,.28)}.ex-form-card{display:grid;gap:10px}.ex-form-grid{display:grid;grid-template-columns:1fr;gap:10px}.ex-form-grid label{display:grid;gap:6px}.ex-form-grid label.wide{grid-column:1/-1}.ex-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}@media (min-width:680px){.ex-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ex-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.ex-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.expense-row{border-radius:24px;padding:12px}.expense-row{grid-template-columns:auto minmax(0,1fr)}.expense-side{grid-column:1/-1;justify-content:flex-end}.ex-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ex-analysis.wide{grid-column:span 2}.ex-sheet-backdrop{place-items:center;padding:18px}.ex-sheet{border-radius:28px;padding:18px}.ex-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.ex-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ex-search-card,.ex-list,.ex-analysis-grid,.ex-table-card,.ex-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.ex-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ex-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ex-analysis.wide{grid-column:span 2}.expense-row{grid-template-columns:auto minmax(0,1fr) auto}.expense-side{grid-column:auto;justify-content:flex-end}}@media (max-width:520px){.ex-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ex-icon-button,.ex-filter-button,.ex-add-inline{width:40px;height:40px}.expense-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.expense-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.ex-sheet,.ex-drawer{padding:12px}.ex-sheet-actions,.ex-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ex-sheet-actions button,.ex-drawer-actions button{width:100%}}
`;
