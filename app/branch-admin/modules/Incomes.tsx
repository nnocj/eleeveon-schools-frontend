"use client";

/**
 * app/branch-admin/modules/Incomes.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH INCOMES V1
 * ---------------------------------------------------------
 * Golden Standard Finance Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Purpose:
 * - Record non-fee income received by a branch.
 * - Track income source, payment method, receipt/reference and receiver.
 * - Keep income separate from student fee invoices/payments.
 * - Prepare clean income records for future finance reporting.
 *
 * Golden UI behavior:
 * - no hero card
 * - compact search + inline add + slider filter + More sheet
 * - one main section at a time
 * - cards, table and analytics views
 * - filters in bottom sheet
 * - dark-mode safe table headers and surfaces
 *
 * Tables used:
 * - incomes
 * - organizations
 * - schoolCurrencySettings
 *
 * Sync behavior:
 * - createLocal(...) creates income records
 * - updateLocal(...) edits income records
 * - softDeleteLocal(...) archives income rows
 * - listActiveLocal(...) reads active branch-scoped rows
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

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type MethodFilter = "all" | "cash" | "momo" | "bank" | "card";
type SourceFilter = "all" | "fees_related" | "donation" | "admission" | "service" | "canteen" | "transport" | "uniform" | "other";

type IncomeForm = {
  id: number;
  title: string;
  description: string;
  amount: string;
  paymentMethod: "cash" | "momo" | "bank" | "card";
  date: string;
  source: SourceFilter;
  organizationId: string;
  receivedBy: string;
  referenceNumber: string;
  receiptNumber: string;
  currencyCode: string;
  currencySymbol: string;
};

const emptyIncomeForm: IncomeForm = {
  id: 0,
  title: "",
  description: "",
  amount: "",
  paymentMethod: "cash",
  date: new Date().toISOString().slice(0, 10),
  source: "other",
  organizationId: "",
  receivedBy: "",
  referenceNumber: "",
  receiptNumber: "",
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

function today() {
  return new Date().toISOString().slice(0, 10);
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

function sourceLabel(value?: string) {
  const map: Record<string, string> = {
    all: "All sources",
    fees_related: "Fees Related",
    donation: "Donation",
    admission: "Admission",
    service: "Service",
    canteen: "Canteen",
    transport: "Transport",
    uniform: "Uniform",
    other: "Other",
  };
  return map[String(value || "other")] || text(value, "Other");
}

function methodLabel(value?: string) {
  const map: Record<string, string> = { cash: "Cash", momo: "Momo", bank: "Bank", card: "Card", all: "All methods" };
  return map[String(value || "cash")] || text(value, "Cash");
}

function methodTone(method?: string): Tone {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "green";
  if (value === "momo") return "orange";
  if (value === "bank") return "blue";
  if (value === "card") return "purple";
  return "gray";
}

function generateReceipt() {
  return `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`bi-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="bi-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="bi-empty">
      <div>💰</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function IncomesPage() {
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
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<AnyRow | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [organizations, setOrganizations] = useState<AnyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<AnyRow[]>([]);
  const [incomes, setIncomes] = useState<AnyRow[]>([]);
  const [form, setForm] = useState<IncomeForm>(emptyIncomeForm);

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
      const [incomeRows, organizationRows, currencyRows] = await Promise.all([
        listActiveLocal<AnyRow>("incomes" as any),
        listActiveLocal<AnyRow>("organizations" as any),
        listActiveLocal<AnyRow>("schoolCurrencySettings" as any),
      ]);

      setIncomes(incomeRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setOrganizations(organizationRows.filter((row) => sameScope(row, accountId, schoolId, branchId)).sort((a, b) => rowName(a).localeCompare(rowName(b))));
      setCurrencySettings(currencyRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
    } catch (error) {
      console.error("Failed to load branch incomes:", error);
      showToast("error", "Failed to load incomes.");
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

  const currency = useMemo(() => {
    const preferred = currencySettings.find((row) => row.defaultForIncomeExpense || row.active !== false) || currencySettings[0];
    return {
      code: text(preferred?.currencyCode || incomes[0]?.currencyCode, "GHS"),
      symbol: text(preferred?.currencySymbol, "₵"),
      name: text(preferred?.currencyName, "Ghana Cedi"),
    };
  }, [currencySettings, incomes]);

  const organizationMap = useMemo(() => new Map(organizations.map((item) => [Number(idOf(item)), rowName(item)])), [organizations]);

  const incomeRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return incomes
      .filter((row) => methodFilter === "all" || String(row.paymentMethod || "") === methodFilter)
      .filter((row) => sourceFilter === "all" || String(row.source || "other") === sourceFilter)
      .filter((row) => organizationFilter === "all" || String(row.organizationId || "") === organizationFilter)
      .filter((row) => {
        if (!q) return true;
        return [
          row.title,
          row.description,
          row.source,
          row.paymentMethod,
          row.receivedBy,
          row.referenceNumber,
          row.receiptNumber,
          organizationMap.get(Number(row.organizationId)),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.date || b.updatedAt || b.createdAt) - n(a.date || a.updatedAt || a.createdAt));
  }, [incomes, methodFilter, organizationFilter, organizationMap, query, sourceFilter]);

  const summary = useMemo(() => {
    const total = incomeRows.reduce((sum, row) => sum + n(row.amount), 0);
    const cash = incomeRows.filter((row) => String(row.paymentMethod) === "cash").reduce((sum, row) => sum + n(row.amount), 0);
    const momo = incomeRows.filter((row) => String(row.paymentMethod) === "momo").reduce((sum, row) => sum + n(row.amount), 0);
    const bank = incomeRows.filter((row) => String(row.paymentMethod) === "bank").reduce((sum, row) => sum + n(row.amount), 0);
    const card = incomeRows.filter((row) => String(row.paymentMethod) === "card").reduce((sum, row) => sum + n(row.amount), 0);
    return {
      shown: incomeRows.length,
      all: incomes.length,
      total,
      cash,
      momo,
      bank,
      card,
      today: incomeRows.filter((row) => String(row.date || "").slice(0, 10) === today()).reduce((sum, row) => sum + n(row.amount), 0),
    };
  }, [incomeRows, incomes.length]);

  const sourceRows = useMemo(() => {
    const map = new Map<string, number>();
    incomeRows.forEach((row) => {
      const key = sourceLabel(row.source);
      map.set(key, (map.get(key) || 0) + n(row.amount));
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [incomeRows]);

  const activeFilterCount = useMemo(() => [methodFilter !== "all", sourceFilter !== "all", organizationFilter !== "all"].filter(Boolean).length, [methodFilter, organizationFilter, sourceFilter]);

  function openDrawer(existing?: AnyRow) {
    setMessage("");
    setForm(
      existing
        ? {
            id: cleanId(idOf(existing)),
            title: text(existing.title),
            description: text(existing.description),
            amount: String(n(existing.amount) || ""),
            paymentMethod: (existing.paymentMethod || "cash") as IncomeForm["paymentMethod"],
            date: text(existing.date, today()),
            source: (existing.source || "other") as SourceFilter,
            organizationId: existing.organizationId ? String(existing.organizationId) : "",
            receivedBy: text(existing.receivedBy),
            referenceNumber: text(existing.referenceNumber),
            receiptNumber: text(existing.receiptNumber),
            currencyCode: text(existing.currencyCode, currency.code),
            currencySymbol: text(existing.currencySymbol, currency.symbol),
          }
        : {
            ...emptyIncomeForm,
            date: today(),
            currencyCode: currency.code,
            currencySymbol: currency.symbol,
            receiptNumber: generateReceipt(),
          }
    );
    setDrawerOpen(true);
  }

  async function saveIncome() {
    if (!accountId || !schoolId || !branchId) return setMessage("Select a school and branch before saving income.");
    if (!form.title.trim()) return setMessage("Enter income title.");
    if (n(form.amount) <= 0) return setMessage("Enter a valid amount.");
    if (!form.date) return setMessage("Select income date.");

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
        date: form.date,
        source: form.source,
        receivedBy: form.receivedBy.trim(),
        referenceNumber: form.referenceNumber.trim(),
        receiptNumber: form.receiptNumber.trim() || generateReceipt(),
        currencyCode: form.currencyCode || currency.code,
        currencySymbol: form.currencySymbol || currency.symbol,
        active: true,
        isDeleted: false,
      };

      if (form.id) await updateLocal("incomes" as any, form.id, payload);
      else await createLocal("incomes" as any, payload);

      setDrawerOpen(false);
      showToast("success", form.id ? "Income updated." : "Income recorded.");
      await load();
    } catch (error: any) {
      console.error("Failed to save income:", error);
      showToast("error", error?.message || "Failed to save income.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteIncome(row: AnyRow) {
    const id = cleanId(idOf(row));
    if (!id) return;
    if (!window.confirm(`Delete income record ${row.title || ""}?`)) return;
    try {
      await softDeleteLocal("incomes" as any, id);
      showToast("success", "Income deleted.");
      setSelectedIncome(null);
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete income.");
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening incomes..." text="Loading branch income records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing branch incomes." />;
  }

  if (!schoolId || !branchId) {
    return <State primary={primary} title="Select branch context" text="Incomes are branch-scoped. Choose an active school and branch before continuing." />;
  }

  return (
    <main className="bi-page" style={{ "--bi-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`bi-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="bi-search-card" aria-label="Income search and actions">
        <span className={`status-dot-mini ${summary.shown ? "green" : "gray"}`} title={`${summary.shown} income record(s)`} />

        <label className="bi-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incomes..." aria-label="Search incomes" />
        </label>

        <button type="button" className="bi-add-inline" onClick={() => openDrawer()} aria-label="Add income">+</button>

        <button type="button" className={`bi-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="bi-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(methodFilter !== "all" || sourceFilter !== "all" || organizationFilter !== "all" || query.trim()) && (
        <section className="bi-filter-chips" aria-label="Active filters">
          {methodFilter !== "all" && <button type="button" onClick={() => setMethodFilter("all")}>Method: {methodLabel(methodFilter)} ×</button>}
          {sourceFilter !== "all" && <button type="button" onClick={() => setSourceFilter("all")}>Source: {sourceLabel(sourceFilter)} ×</button>}
          {organizationFilter !== "all" && <button type="button" onClick={() => setOrganizationFilter("all")}>Org: {organizationMap.get(Number(organizationFilter)) || organizationFilter} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" && <AnalyticsView summary={summary} sourceRows={sourceRows} currency={currency.code} />}

      {view === "table" && <TableView rows={incomeRows} organizationMap={organizationMap} currency={currency.code} openDrawer={openDrawer} setSelectedIncome={setSelectedIncome} deleteIncome={deleteIncome} />}

      {view === "cards" && (
        <section className="bi-list">
          {incomeRows.map((income) => (
            <IncomeCard
              key={String(idOf(income))}
              income={income}
              organizationName={organizationMap.get(Number(income.organizationId)) || "No organization"}
              currency={income.currencyCode || currency.code}
              openDrawer={openDrawer}
              setSelectedIncome={setSelectedIncome}
              deleteIncome={deleteIncome}
            />
          ))}

          {!incomeRows.length && <Empty title="No income records" text="Record branch income such as donations, forms, services, canteen or other non-fee income." />}
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          methodFilter={methodFilter}
          setMethodFilter={setMethodFilter}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          organizationFilter={organizationFilter}
          setOrganizationFilter={setOrganizationFilter}
          organizations={organizations}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          currency={currency.code}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onAdd={() => { setMoreOpen(false); openDrawer(); }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {drawerOpen && <IncomeDrawer form={form} setForm={setForm} organizations={organizations} message={message} saving={saving} save={saveIncome} close={() => setDrawerOpen(false)} />}

      {selectedIncome && <IncomeSheet income={selectedIncome} organizationName={organizationMap.get(Number(selectedIncome.organizationId)) || "No organization"} currency={selectedIncome.currencyCode || currency.code} openDrawer={openDrawer} deleteIncome={deleteIncome} close={() => setSelectedIncome(null)} />}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="bi-page" style={{ "--bi-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="bi-state">
        <div className="bi-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function IncomeCard({ income, organizationName, currency, openDrawer, setSelectedIncome, deleteIncome }: { income: AnyRow; organizationName: string; currency: string; openDrawer: (income: AnyRow) => void; setSelectedIncome: (income: AnyRow) => void; deleteIncome: (income: AnyRow) => void }) {
  return (
    <article className="income-row">
      <span className="income-avatar">💰</span>
      <span className="income-main">
        <strong>{income.title || "Income"}</strong>
        <small>{sourceLabel(income.source)} · {organizationName}</small>
        <em>{money(income.amount, currency)} · {methodLabel(income.paymentMethod)} · {dateLabel(income.date)}</em>
      </span>
      <span className="income-side">
        <Chip tone={methodTone(income.paymentMethod)}>{methodLabel(income.paymentMethod)}</Chip>
        <button type="button" onClick={() => setSelectedIncome(income)}>View</button>
        <button type="button" onClick={() => openDrawer(income)}>Edit</button>
        <button type="button" className="danger" onClick={() => deleteIncome(income)}>⌫</button>
      </span>
    </article>
  );
}

function TableView({ rows, organizationMap, currency, openDrawer, setSelectedIncome, deleteIncome }: { rows: AnyRow[]; organizationMap: Map<number, string>; currency: string; openDrawer: (income: AnyRow) => void; setSelectedIncome: (income: AnyRow) => void; deleteIncome: (income: AnyRow) => void }) {
  return (
    <section className="bi-table-card">
      <div className="bi-table-scroll">
        <table>
          <thead><tr><th>Incomes ({rows.length})</th><th>Source</th><th>Organization</th><th>Amount</th><th>Method</th><th>Date</th><th>Receipt</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((income) => (
              <tr key={String(idOf(income))}>
                <td><strong>{income.title || "Income"}</strong><span>{income.description || income.receivedBy || "No description"}</span></td>
                <td>{sourceLabel(income.source)}</td>
                <td>{organizationMap.get(Number(income.organizationId)) || "No organization"}</td>
                <td>{money(income.amount, income.currencyCode || currency)}</td>
                <td><Chip tone={methodTone(income.paymentMethod)}>{methodLabel(income.paymentMethod)}</Chip></td>
                <td>{dateLabel(income.date)}</td>
                <td>{income.receiptNumber || income.referenceNumber || "—"}</td>
                <td><div className="bi-table-actions"><button type="button" onClick={() => setSelectedIncome(income)}>View</button><button type="button" onClick={() => openDrawer(income)}>Edit</button><button type="button" className="danger" onClick={() => deleteIncome(income)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="bi-empty-table">No income matches your filters.</div>}
      </div>
    </section>
  );
}

function FilterSheet({ methodFilter, setMethodFilter, sourceFilter, setSourceFilter, organizationFilter, setOrganizationFilter, organizations, onClose }: { methodFilter: MethodFilter; setMethodFilter: (value: MethodFilter) => void; sourceFilter: SourceFilter; setSourceFilter: (value: SourceFilter) => void; organizationFilter: string; setOrganizationFilter: (value: string) => void; organizations: AnyRow[]; onClose: () => void }) {
  return (
    <div className="bi-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bi-sheet small">
        <div className="bi-sheet-head"><div><h2>Filters</h2><p>Filter branch income by source, payment method and organization.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="bi-form compact">
          <label><span>Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="fees_related">Fees Related</option><option value="donation">Donation</option><option value="admission">Admission</option><option value="service">Service</option><option value="canteen">Canteen</option><option value="transport">Transport</option><option value="uniform">Uniform</option><option value="other">Other</option></select></label>
          <label><span>Payment Method</span><select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as MethodFilter)}><option value="all">All methods</option><option value="cash">Cash</option><option value="momo">Momo</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
          <label><span>Organization</span><select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}><option value="all">All organizations</option>{organizations.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        </div>
        <div className="bi-sheet-actions"><button type="button" onClick={() => { setSourceFilter("all"); setMethodFilter("all"); setOrganizationFilter("all"); }}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, currency, onRefresh, onAdd, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; currency: string; onRefresh: () => void | Promise<void>; onAdd: () => void; onClose: () => void }) {
  return (
    <div className="bi-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bi-sheet small">
        <div className="bi-sheet-head"><div><h2>More</h2><p>Views and income actions are kept here to save space.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="bi-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards view</b><small>{summary.shown} income record(s)</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense income records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{money(summary.total, currency)} shown</small></button>
          <button type="button" onClick={onAdd}><span>💰</span><b>Record income</b><small>Add cash, momo, bank or card income</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch incomes</small></button>
        </div>
      </section>
    </div>
  );
}

function IncomeDrawer({ form, setForm, organizations, message, saving, save, close }: { form: IncomeForm; setForm: React.Dispatch<React.SetStateAction<IncomeForm>>; organizations: AnyRow[]; message: string; saving: boolean; save: () => void | Promise<void>; close: () => void }) {
  return (
    <div className="bi-drawer-layer" role="dialog" aria-modal="true"><button className="bi-drawer-overlay" type="button" onClick={close} /><aside className="bi-drawer">
      <div className="bi-drawer-head"><div><p>{form.id ? "Edit Income" : "New Income"}</p><h2>Branch Income</h2><span>{form.amount ? money(form.amount, form.currencyCode) : "Record non-fee income"}</span></div><button type="button" onClick={close}>✕</button></div>
      {message && <section className="bi-inline-error">{message}</section>}
      <section className="bi-form-card"><div className="bi-form-grid">
        <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Donation, Admission forms, Canteen..." /></label>
        <label><span>Amount</span><input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" /></label>
        <label><span>Source</span><select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as SourceFilter })}><option value="fees_related">Fees Related</option><option value="donation">Donation</option><option value="admission">Admission</option><option value="service">Service</option><option value="canteen">Canteen</option><option value="transport">Transport</option><option value="uniform">Uniform</option><option value="other">Other</option></select></label>
        <label><span>Method</span><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as IncomeForm["paymentMethod"] })}><option value="cash">Cash</option><option value="momo">Momo</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
        <label><span>Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label><span>Organization</span><select value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}><option value="">No organization</option>{organizations.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Received By</span><input value={form.receivedBy} onChange={(event) => setForm({ ...form, receivedBy: event.target.value })} /></label>
        <label><span>Reference No.</span><input value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} /></label>
        <label><span>Receipt No.</span><input value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} /></label>
        <label><span>Currency</span><input value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value.toUpperCase() })} /></label>
        <label className="wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Optional notes about this income" /></label>
      </div></section>
      <div className="bi-drawer-actions"><button type="button" onClick={close}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Income"}</button></div>
    </aside></div>
  );
}

function IncomeSheet({ income, organizationName, currency, openDrawer, deleteIncome, close }: { income: AnyRow; organizationName: string; currency: string; openDrawer: (income: AnyRow) => void; deleteIncome: (income: AnyRow) => void; close: () => void }) {
  return (
    <div className="bi-sheet-backdrop" role="dialog" aria-modal="true"><section className="bi-sheet">
      <div className="bi-sheet-head"><div><h2>{income.title || "Income"}</h2><p>{sourceLabel(income.source)} · {organizationName} · {dateLabel(income.date)}</p></div><button type="button" onClick={close}>✕</button></div>
      <div className="bi-detail-grid"><article><span>Amount</span><b>{money(income.amount, currency)}</b></article><article><span>Method</span><b>{methodLabel(income.paymentMethod)}</b></article><article><span>Receipt</span><b>{income.receiptNumber || "Not set"}</b></article></div>
      <div className="bi-info-list"><article><span>Reference</span><b>{income.referenceNumber || "Not set"}</b></article><article><span>Received By</span><b>{income.receivedBy || "Not set"}</b></article><article><span>Description</span><b>{income.description || "No description"}</b></article></div>
      <div className="bi-sheet-actions"><button type="button" onClick={close}>Close</button><button type="button" onClick={() => openDrawer(income)}>Edit</button><button type="button" className="danger" onClick={() => deleteIncome(income)}>Delete</button></div>
    </section></div>
  );
}

function AnalyticsView({ summary, sourceRows, currency }: { summary: AnyRow; sourceRows: { label: string; value: number }[]; currency: string }) {
  const methodRows = [
    { label: "Cash", value: summary.cash },
    { label: "Momo", value: summary.momo },
    { label: "Bank", value: summary.bank },
    { label: "Card", value: summary.card },
  ];
  return (
    <section className="bi-analysis-grid">
      <article className="bi-analysis"><span>Total Income</span><strong>{money(summary.total, currency)}</strong><p>{summary.shown} income record(s) currently shown.</p></article>
      <article className="bi-analysis"><span>Today</span><strong>{money(summary.today, currency)}</strong><p>Income recorded for today.</p></article>
      <article className="bi-analysis"><span>Cash</span><strong>{money(summary.cash, currency)}</strong><p>Cash income in current filter.</p></article>
      <article className="bi-analysis"><span>Digital</span><strong>{money(summary.momo + summary.bank + summary.card, currency)}</strong><p>Momo, bank and card income.</p></article>
      <article className="bi-analysis wide"><span>By Method</span><strong>{money(summary.total, currency)}</strong><div className="bi-analysis-list">{methodRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{money(row.value, currency)}</small></div><div className="bi-progress"><i style={{ width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.total)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="bi-analysis wide"><span>By Source</span><strong>{sourceRows.length}</strong><div className="bi-analysis-list">{sourceRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{money(row.value, currency)}</small></div><div className="bi-progress"><i style={{ width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.total)) * 100))}%` }} /></div></section>)}</div></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.bi-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--bi-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.bi-page *,.bi-page *::before,.bi-page *::after{box-sizing:border-box;min-width:0}.bi-page button,.bi-page input,.bi-page select,.bi-page textarea{font:inherit;max-width:100%}.bi-page button{-webkit-tap-highlight-color:transparent}.bi-page input,.bi-page select,.bi-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.bi-page textarea{min-height:110px;padding:12px;resize:vertical;line-height:1.5}.bi-page input:focus,.bi-page select:focus,.bi-page textarea:focus{border-color:color-mix(in srgb,var(--bi-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--bi-primary) 12%,transparent)}.bi-state,.bi-search-card,.income-row,.bi-table-card,.bi-analysis,.bi-empty,.bi-sheet,.bi-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.bi-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.bi-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--bi-primary) 18%,transparent);border-top-color:var(--bi-primary);animation:spin .8s linear infinite}.bi-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.bi-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bi-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.bi-toast.success{background:rgba(34,197,94,.14);color:#166534}.bi-toast.error,.bi-inline-error{background:rgba(239,68,68,.12);color:#991b1b}.bi-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.bi-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.bi-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px}.bi-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.bi-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.bi-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.bi-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.bi-icon-button,.bi-filter-button,.bi-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.bi-add-inline{border-color:var(--bi-primary);background:var(--bi-primary);color:#fff;font-size:25px;box-shadow:0 12px 28px color-mix(in srgb,var(--bi-primary) 22%,transparent)}.bi-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.bi-filter-button{position:relative;background:color-mix(in srgb,var(--bi-primary) 8%,var(--card-bg,#fff));color:var(--bi-primary)}.bi-filter-button.active{background:var(--bi-primary);color:#fff;border-color:var(--bi-primary)}.bi-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.gray{background:var(--muted,#64748b)}.bi-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.bi-filter-chips::-webkit-scrollbar{display:none}.bi-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--bi-primary) 11%,transparent);color:var(--bi-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.bi-list{display:grid;gap:7px;margin-top:10px}.income-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.income-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--bi-primary) 12%,var(--surface,#fff));font-size:22px}.income-main,.income-main strong,.income-main small,.income-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.income-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.income-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.income-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.income-side{display:flex;align-items:center;gap:5px}.income-side button{min-height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}.income-side button.danger,.bi-table-actions button.danger,.bi-sheet-actions button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.bi-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.bi-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.bi-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.bi-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.bi-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.bi-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.bi-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.bi-sheet-backdrop,.bi-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.bi-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease);background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}.bi-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.bi-sheet-head,.bi-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.bi-sheet-head h2,.bi-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.bi-sheet-head p,.bi-drawer-head span{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.bi-drawer-head p{margin:0;color:var(--bi-primary);font-size:10px;font-weight:1000;text-transform:uppercase;letter-spacing:.08em}.bi-sheet-head button,.bi-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.bi-form{display:grid;gap:10px}.bi-form label{display:grid;gap:6px}.bi-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.bi-menu-list{display:grid;gap:8px}.bi-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.bi-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--bi-primary) 10%,transparent);color:var(--bi-primary);font-weight:1000}.bi-menu-list button b,.bi-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bi-menu-list button b{font-size:13px;font-weight:1000}.bi-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.bi-menu-list button.active{border-color:color-mix(in srgb,var(--bi-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--bi-primary) 8%,var(--surface,#fff))}.bi-sheet-actions,.bi-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.bi-sheet-actions button,.bi-drawer-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.bi-sheet-actions button.primary,.bi-drawer-actions button.primary{border-color:var(--bi-primary);background:var(--bi-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--bi-primary) 25%,transparent)}.bi-drawer-layer{place-items:stretch end;padding:0}.bi-drawer-overlay{position:absolute;inset:0;border:0;background:transparent}.bi-drawer{position:relative;z-index:1;width:min(560px,100%);height:100dvh;overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));box-shadow:-30px 0 90px rgba(15,23,42,.32)}.bi-form-card{padding:12px;border-radius:22px}.bi-form-grid{display:grid;grid-template-columns:1fr;gap:10px}.bi-form-grid label{display:grid;gap:6px}.bi-form-grid label.wide{grid-column:1/-1}.bi-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.bi-table-card,.bi-analysis,.bi-empty{padding:13px;border-radius:24px}.bi-table-card{margin-top:10px}.bi-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.bi-table-scroll table{width:100%;min-width:900px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.bi-table-scroll th,.bi-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.bi-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--bi-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.bi-table-scroll td strong,.bi-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bi-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.bi-table-actions{display:flex;gap:7px;overflow-x:auto}.bi-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--bi-primary);border-radius:999px;padding:0 12px;background:var(--bi-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.bi-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.bi-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.bi-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.bi-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.bi-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.bi-analysis-list{display:grid;gap:10px;margin-top:12px}.bi-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.bi-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.bi-analysis-list b,.bi-analysis-list small{font-size:12px}.bi-analysis-list small{color:var(--muted,#64748b);font-weight:850}.bi-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.bi-progress i{display:block;height:100%;border-radius:inherit;background:var(--bi-primary)}.bi-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.bi-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--bi-primary) 12%,var(--surface,#fff));font-size:28px}.bi-empty h3{margin:0;font-size:18px;font-weight:1000}.bi-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bi-detail-grid{display:grid;grid-template-columns:1fr;gap:8px}.bi-detail-grid article,.bi-info-list article{padding:12px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.bi-detail-grid span,.bi-info-list span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.bi-detail-grid b,.bi-info-list b{display:block;margin-top:5px;font-size:13px;font-weight:1000;overflow-wrap:anywhere}.bi-info-list{display:grid;gap:8px;margin-top:10px}@media (min-width:680px){.bi-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.bi-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.bi-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.income-row{border-radius:24px;padding:12px}.income-row{grid-template-columns:auto minmax(0,1fr)}.income-side{grid-column:1/-1;justify-content:flex-end}.bi-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bi-analysis.wide{grid-column:span 2}.bi-sheet-backdrop{place-items:center;padding:18px}.bi-sheet{border-radius:28px;padding:18px}.bi-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bi-detail-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:1040px){.bi-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.bi-search-card,.bi-list,.bi-analysis-grid,.bi-table-card,.bi-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.bi-list{grid-template-columns:repeat(3,minmax(0,1fr))}.bi-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.bi-analysis.wide{grid-column:span 2}.income-row{grid-template-columns:auto minmax(0,1fr) auto}.income-side{grid-column:auto;justify-content:flex-start}}@media (max-width:520px){.bi-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.bi-icon-button,.bi-filter-button,.bi-add-inline{width:40px;height:40px}.income-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.income-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.bi-drawer{width:100%}.bi-sheet{border-radius:24px 24px 18px 18px;padding:12px}.bi-sheet-actions,.bi-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.bi-sheet-actions button,.bi-drawer-actions button{width:100%}}
`;
