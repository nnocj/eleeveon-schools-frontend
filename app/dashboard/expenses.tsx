"use client";

/**
 * expenses.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE EXPENSE MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: expenses
 * Supporting table: organizations
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  Expense,
  ExpenseSourceType,
  Organization,
  PaymentMethod,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  organizationId?: number;
  title: string;
  description?: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  expenseSourceType?: ExpenseSourceType;
  date: string;
  paidTo?: string;
  approvedBy?: string;
  receiptNumber?: string;
  referenceNumber?: string;
  photo?: string;
};

type ExpenseView = {
  row: Expense;
  organizationName: string;
  organizationType?: Organization["type"];
};

type DateFilter = "all" | "today" | "week" | "month" | "custom";

type Breakdown = {
  name: string;
  amount: number;
  count: number;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const money = (value: number) => {
  return `GHS ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const dateValue = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const startOfWeekISO = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  return start.toISOString().slice(0, 10);
};

const startOfMonthISO = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const paymentMethodLabel = (method?: PaymentMethod) => {
  if (!method) return "Unspecified";
  if (method === "momo") return "MoMo";
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const expenseSourceLabel = (type?: ExpenseSourceType) => {
  if (!type) return "Unspecified";
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const emptyForm = (): FormState => ({
  organizationId: undefined,
  title: "",
  description: "",
  amount: 0,
  paymentMethod: "cash",
  expenseSourceType: "other",
  date: todayISO(),
  paidTo: "",
  approvedBy: "",
  receiptNumber: "",
  referenceNumber: "",
  photo: "",
});

const expenseTypes: ExpenseSourceType[] = [
  "utilities",
  "salary",
  "transport",
  "feeding",
  "maintenance",
  "procurement",
  "events",
  "academic",
  "administration",
  "technology",
  "marketing",
  "security",
  "other",
];

// ======================================================
// COMPONENT
// ======================================================

export default function ExpensesPage() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Expense[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterMethod, setFilterMethod] = useState<"all" | PaymentMethod>("all");
  const [filterSourceType, setFilterSourceType] = useState<"all" | ExpenseSourceType>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [fromDate, setFromDate] = useState(startOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setRows([]);
    setOrganizations([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [expenseRows, organizationRows] = await Promise.all([
        db.expenses.toArray(),
        db.organizations.toArray(),
      ]);

      setRows(expenseRows.filter(sameTenant));

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error("Failed to load expenses:", error);
      clearData();
      alert("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS + VIEW MODEL
  // ======================================================

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const viewRows = useMemo<ExpenseView[]>(() => {
    return rows.map((row) => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;

      return {
        row,
        organizationName: organization?.name || "General Expense",
        organizationType: organization?.type,
      };
    });
  }, [rows, organizationMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = todayISO();
    const weekStart = startOfWeekISO();
    const monthStart = startOfMonthISO();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterMethod !== "all" && row.paymentMethod !== filterMethod) return false;
        if (filterSourceType !== "all" && row.expenseSourceType !== filterSourceType) return false;

        if (dateFilter === "today" && row.date !== today) return false;
        if (dateFilter === "week" && (row.date < weekStart || row.date > today)) return false;
        if (dateFilter === "month" && (row.date < monthStart || row.date > today)) return false;
        if (dateFilter === "custom") {
          if (fromDate && row.date < fromDate) return false;
          if (toDate && row.date > toDate) return false;
        }

        if (!query) return true;

        return `
          ${row.title}
          ${row.description || ""}
          ${row.paidTo || ""}
          ${row.approvedBy || ""}
          ${row.referenceNumber || ""}
          ${row.receiptNumber || ""}
          ${row.paymentMethod || ""}
          ${row.expenseSourceType || ""}
          ${item.organizationName}
          ${item.organizationType || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => dateValue(b.row.date) - dateValue(a.row.date) || a.row.title.localeCompare(b.row.title));
  }, [viewRows, search, filterOrganizationId, filterMethod, filterSourceType, dateFilter, fromDate, toDate]);

  // ======================================================
  // SUMMARY
  // ======================================================

  const summary = useMemo(() => {
    const total = filteredRows.reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const cash = filteredRows.filter((item) => item.row.paymentMethod === "cash").reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const momo = filteredRows.filter((item) => item.row.paymentMethod === "momo").reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const bank = filteredRows.filter((item) => item.row.paymentMethod === "bank").reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const cardTotal = filteredRows.filter((item) => item.row.paymentMethod === "card").reduce((sum, item) => sum + Number(item.row.amount || 0), 0);

    const categories = new Set(filteredRows.map((item) => item.row.expenseSourceType).filter(Boolean)).size;

    return { records: filteredRows.length, total, cash, momo, bank, cardTotal, categories };
  }, [filteredRows]);

  const sourceTotals = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredRows.forEach((item) => {
      const key = item.row.expenseSourceType || "unspecified";
      const existing = map.get(key) || {
        name: expenseSourceLabel(item.row.expenseSourceType),
        amount: 0,
        count: 0,
      };

      existing.amount += Number(item.row.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const organizationTotals = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredRows.forEach((item) => {
      const key = item.row.organizationId ? String(item.row.organizationId) : "general";
      const existing = map.get(key) || {
        name: item.organizationName,
        amount: 0,
        count: 0,
      };

      existing.amount += Number(item.row.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ photo: value });
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }

    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setEditMode(false);
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = (row: Expense) => {
    setEditMode(true);
    setForm({
      id: row.id,
      organizationId: row.organizationId,
      title: row.title,
      description: row.description || "",
      amount: row.amount,
      paymentMethod: row.paymentMethod || "cash",
      expenseSourceType: row.expenseSourceType || "other",
      date: row.date,
      paidTo: row.paidTo || "",
      approvedBy: row.approvedBy || "",
      receiptNumber: row.receiptNumber || "",
      referenceNumber: row.referenceNumber || "",
      photo: row.photo || "",
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!form.title.trim()) return "Enter expense title";
    if (Number(form.amount) <= 0) return "Expense amount must be greater than zero";
    if (!form.date) return "Select expense date";

    const receipt = form.receiptNumber?.trim().toLowerCase();
    const reference = form.referenceNumber?.trim().toLowerCase();

    const duplicateReceipt = receipt
      ? rows.find((row) => {
          if (editMode && row.id === form.id) return false;
          return row.receiptNumber?.trim().toLowerCase() === receipt;
        })
      : undefined;

    if (duplicateReceipt) return "An expense record with this receipt number already exists";

    const duplicateReference = reference
      ? rows.find((row) => {
          if (editMode && row.id === form.id) return false;
          return row.referenceNumber?.trim().toLowerCase() === reference;
        })
      : undefined;

    if (duplicateReference) return "An expense record with this reference number already exists";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        amount: Number(form.amount || 0),
        paymentMethod: form.paymentMethod || undefined,
        expenseSourceType: form.expenseSourceType || undefined,
        date: form.date,
        paidTo: form.paidTo?.trim() || undefined,
        approvedBy: form.approvedBy?.trim() || undefined,
        receiptNumber: form.receiptNumber?.trim() || undefined,
        referenceNumber: form.referenceNumber?.trim() || undefined,
        photo: form.photo || undefined,
      }) as Expense;

      if (editMode && form.id) {
        await db.expenses.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.expenses.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save expense:", error);
      alert("Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("Delete this expense record?")) return;

    await db.expenses.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ex-state-card">
          <div className="ex-spinner" />
          <h2>Opening expenses...</h2>
          <p>Checking account, branch, organizations, and expense records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ex-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing expenses.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ex-state-card">
          <h2>Select a branch first</h2>
          <p>Expense records belong to one active school branch.</p>
          <button type="button" className="ex-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="ex-page" style={{ "--ex-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ex-hero">
        <div className="ex-hero-left">
          <div className="ex-hero-icon">📉</div>
          <div className="ex-title-wrap">
            <p>Finance Outflow</p>
            <h2>Expenses</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="ex-primary-btn" onClick={openCreate}>
          + Record Expense
        </button>
      </section>

      <section className="ex-filter-card">
        <input
          placeholder="Search title, payee, receipt, reference, approver..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterOrganizationId || ""} onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}>
          <option value="">All Organizations</option>
          {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
        </select>

        <select value={filterSourceType} onChange={(event) => setFilterSourceType(event.target.value as "all" | ExpenseSourceType)}>
          <option value="all">All Expense Types</option>
          {expenseTypes.map((type) => <option key={type} value={type}>{expenseSourceLabel(type)}</option>)}
        </select>

        <select value={filterMethod} onChange={(event) => setFilterMethod(event.target.value as "all" | PaymentMethod)}>
          <option value="all">All Payment Methods</option>
          <option value="cash">Cash</option>
          <option value="momo">MoMo</option>
          <option value="bank">Bank</option>
          <option value="card">Card</option>
        </select>

        <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>

        {dateFilter === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </>
        )}
      </section>

      <section className="ex-summary-grid" aria-label="Expense summary">
        <SummaryCard label="Records" value={summary.records} icon="🧾" />
        <SummaryCard label="Total Expenses" value={money(summary.total)} icon="📉" danger />
        <SummaryCard label="Cash" value={money(summary.cash)} icon="💵" />
        <SummaryCard label="MoMo" value={money(summary.momo)} icon="📱" />
        <SummaryCard label="Categories" value={summary.categories} icon="🏷️" />
      </section>

      <BreakdownSection title="Expense Type Breakdown" count={sourceTotals.length} items={sourceTotals} tone="red" />
      <BreakdownSection title="Organization Breakdown" count={organizationTotals.length} items={organizationTotals} tone="orange" />

      <section className="ex-section">
        <div className="ex-section-head">
          <h3>Expense Records</h3>
          <Chip tone="gray">{filteredRows.length} record(s)</Chip>
        </div>

        <div className="ex-list">
          {filteredRows.map((item) => {
            const row = item.row;

            return (
              <article key={row.id} className="ex-entity-card">
                <div className="ex-card-top">
                  <Avatar title={row.title} photo={row.photo} primary={primary} />

                  <div className="ex-card-main">
                    <h3>{row.title}</h3>
                    <p>{row.description || "No description provided."}</p>

                    <div className="ex-chip-row">
                      <Chip tone="red">{money(row.amount)}</Chip>
                      <Chip tone="blue">{paymentMethodLabel(row.paymentMethod)}</Chip>
                      <Chip tone="orange">{expenseSourceLabel(row.expenseSourceType)}</Chip>
                      <Chip tone="gray">{row.date}</Chip>
                      <Chip tone={row.organizationId ? "purple" : "gray"}>{item.organizationName}</Chip>
                    </div>
                  </div>
                </div>

                <div className="ex-meta-grid">
                  <MiniStat label="Paid To" value={row.paidTo || "-"} />
                  <MiniStat label="Approved By" value={row.approvedBy || "-"} />
                  <MiniStat label="Receipt" value={row.receiptNumber || "-"} />
                  <MiniStat label="Reference" value={row.referenceNumber || "-"} />
                </div>

                <div className="ex-action-row">
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>Delete</button>
                </div>
              </article>
            );
          })}

          {!filteredRows.length && <EmptyCard text="No expense records found in this branch for the selected filters." />}
        </div>
      </section>

      {drawerOpen && (
        <div className="ex-drawer-layer">
          <button type="button" className="ex-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="ex-drawer">
            <div className="ex-drawer-head">
              <div>
                <p>Expense Record</p>
                <h2>{editMode ? "Edit Expense" : "Record Expense"}</h2>
                <span>
                  This expense will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="ex-form-grid">
              <Field label="Expense Title">
                <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="e.g. Electricity bill, Staff salary, Stationery" />
              </Field>

              <div className="ex-form-two">
                <Field label="Amount">
                  <input type="number" value={form.amount} onChange={(event) => updateForm({ amount: Number(event.target.value) })} />
                </Field>

                <Field label="Date">
                  <input type="date" value={form.date} onChange={(event) => updateForm({ date: event.target.value })} />
                </Field>
              </div>

              <Field label="Expense Type">
                <select value={form.expenseSourceType || ""} onChange={(event) => updateForm({ expenseSourceType: (event.target.value || undefined) as ExpenseSourceType | undefined })}>
                  <option value="">Unspecified</option>
                  {expenseTypes.map((type) => <option key={type} value={type}>{expenseSourceLabel(type)}</option>)}
                </select>
              </Field>

              <Field label="Payment Method">
                <select value={form.paymentMethod || ""} onChange={(event) => updateForm({ paymentMethod: (event.target.value || undefined) as PaymentMethod | undefined })}>
                  <option value="">Unspecified</option>
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                </select>
              </Field>

              <Field label="Organization">
                <select value={form.organizationId || ""} onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}>
                  <option value="">General Expense / No Organization</option>
                  {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
                </select>
              </Field>

              <div className="ex-form-two">
                <Field label="Paid To">
                  <input value={form.paidTo || ""} onChange={(event) => updateForm({ paidTo: event.target.value })} placeholder="Vendor, staff, supplier or payee" />
                </Field>

                <Field label="Approved By">
                  <input value={form.approvedBy || ""} onChange={(event) => updateForm({ approvedBy: event.target.value })} placeholder="Approving officer" />
                </Field>
              </div>

              <div className="ex-form-two">
                <Field label="Receipt Number">
                  <input value={form.receiptNumber || ""} onChange={(event) => updateForm({ receiptNumber: event.target.value })} placeholder="Receipt number" />
                </Field>

                <Field label="Reference Number">
                  <input value={form.referenceNumber || ""} onChange={(event) => updateForm({ referenceNumber: event.target.value })} placeholder="Bank/MoMo/reference number" />
                </Field>
              </div>

              <Field label="Description">
                <textarea value={form.description || ""} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Brief note about this expense" rows={4} />
              </Field>

              <Field label="Receipt / Proof Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload(event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Expense proof" className="ex-preview-image" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="ex-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Record Expense"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon, danger = false }: { label: string; value: string | number; icon: string; danger?: boolean }) {
  return (
    <article className={`ex-summary-card ${danger ? "danger" : ""}`}>
      <div className="ex-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function BreakdownSection({ title, count, items, tone }: { title: string; count: number; items: Breakdown[]; tone: "red" | "orange" }) {
  return (
    <section className="ex-section">
      <div className="ex-section-head">
        <h3>{title}</h3>
        <Chip tone="gray">{count} group(s)</Chip>
      </div>

      <div className="ex-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="ex-breakdown-card">
            <strong>{item.name}</strong>
            <div className="ex-chip-row">
              <Chip tone="gray">{item.count} record(s)</Chip>
              <Chip tone={tone}>{money(item.amount)}</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available for the selected filters.`} />}
      </div>
    </section>
  );
}

function Avatar({ title, photo, primary }: { title: string; photo?: string; primary: string }) {
  return (
    <div
      className="ex-avatar"
      style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}
    >
      {!photo && title.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ex-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ex-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="ex-empty-card">
      <div className="ex-empty-icon">📉</div>
      <h3>No expense data</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ex-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes exSpin { to { transform: rotate(360deg); } }

.ex-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.ex-page *, .ex-page *::before, .ex-page *::after { box-sizing: border-box; }
.ex-page button, .ex-page input, .ex-page select, .ex-page textarea { font: inherit; max-width: 100%; }
.ex-page img { max-width: 100%; }
.ex-page input, .ex-page select, .ex-page textarea {
  width: 100%; min-height: 43px; border: 1px solid rgba(148,163,184,.28); border-radius: 15px;
  padding: 0 12px; background: var(--surface, #fff); color: var(--text, #0f172a); outline: none; font-weight: 750;
}
.ex-page textarea { padding-top: 10px; resize: vertical; }

.ex-state-card {
  min-height: min(420px, calc(100dvh - 32px)); display: grid; place-items: center; align-content: center; gap: 10px;
  width: min(460px, 100%); margin: 0 auto; padding: 22px; border-radius: 28px; background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.22); box-shadow: 0 24px 60px rgba(15,23,42,.08); text-align: center;
}
.ex-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.ex-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ex-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ex-primary) 18%, transparent); border-top-color: var(--ex-primary); animation: exSpin .8s linear infinite; }

.ex-primary-btn, .ex-save-btn { min-height: 46px; border: 0; border-radius: 999px; padding: 0 18px; background: var(--ex-primary); color: #fff; font-weight: 950; cursor: pointer; }
.ex-save-btn { width: 100%; }
.ex-primary-btn:disabled, .ex-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.ex-hero { display: flex; align-items: stretch; justify-content: space-between; gap: 10px; padding: 12px; border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--ex-primary) 12%, #fff), #fff 64%); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 18px 46px rgba(15,23,42,.07); overflow: hidden; }
.ex-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.ex-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--ex-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--ex-primary) 28%, transparent); font-size: 22px; }
.ex-title-wrap { min-width: 0; }
.ex-title-wrap p, .ex-title-wrap h2, .ex-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-title-wrap p { margin: 0 0 2px; color: var(--ex-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.ex-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.ex-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.ex-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 16px 40px rgba(15,23,42,.055); }
.ex-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.ex-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.04); overflow: hidden; }
.ex-summary-card.danger { background: linear-gradient(135deg, rgba(239,68,68,.08), #fff); }
.ex-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--ex-primary) 12%, #fff); }
.ex-summary-card div:last-child { min-width: 0; }
.ex-summary-card strong, .ex-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-summary-card strong { font-size: 19px; font-weight: 1000; letter-spacing: -.05em; }
.ex-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.ex-section { margin-top: 16px; }
.ex-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ex-section-head h3 { margin: 0; font-size: 19px; font-weight: 1000; letter-spacing: -.04em; }
.ex-breakdown-grid, .ex-list { display: grid; gap: 10px; }
.ex-breakdown-card, .ex-entity-card, .ex-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.045); overflow: hidden; padding: 13px; }
.ex-breakdown-card strong { display: block; font-size: 16px; font-weight: 1000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.ex-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.ex-card-main { min-width: 0; flex: 1; }
.ex-card-main h3, .ex-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.ex-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.ex-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }
.ex-chip-row, .ex-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.ex-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ex-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ex-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ex-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ex-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.ex-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ex-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.ex-meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.ex-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148,163,184,.09); border: 1px solid rgba(148,163,184,.13); overflow: hidden; }
.ex-mini-stat strong, .ex-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-mini-stat strong { font-size: 13px; font-weight: 1000; }
.ex-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.ex-action-row button { min-height: 40px; border: 1px solid rgba(148,163,184,.24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.ex-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.12); }
.ex-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 190px; text-align: center; border-style: dashed; }
.ex-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--ex-primary) 12%, #fff); font-size: 28px; }
.ex-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.ex-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.ex-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.ex-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15,23,42,.52); }
.ex-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15,23,42,.22); }
.ex-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.ex-drawer-head div { min-width: 0; }
.ex-drawer-head p { margin: 0; color: var(--ex-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.ex-drawer-head h2, .ex-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.ex-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.ex-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.ex-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148,163,184,.24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.ex-form-grid { display: grid; gap: 12px; }
.ex-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.ex-field { display: grid; gap: 6px; min-width: 0; }
.ex-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.ex-preview-image { width: 100%; height: 140px; border-radius: 16px; margin-top: 8px; object-fit: cover; }

@media (min-width: 680px) {
  .ex-page { padding: 12px; }
  .ex-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ex-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ex-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1040px) {
  .ex-page { padding: 16px; }
  .ex-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ex-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .ex-breakdown-grid, .ex-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .ex-page { padding: 6px; }
  .ex-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .ex-primary-btn { width: 100%; }
  .ex-summary-grid { gap: 6px; }
  .ex-summary-card { padding: 10px; border-radius: 19px; }
  .ex-summary-card strong { font-size: 16px; }
  .ex-entity-card, .ex-empty-card, .ex-breakdown-card { border-radius: 20px; padding: 11px; }
  .ex-card-top { align-items: flex-start; }
  .ex-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .ex-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ex-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ex-action-row button { width: 100%; padding: 0 8px; }
  .ex-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
