"use client";

/**
 * expenses.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL EXPENSE MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB-safe rewrite for current db.ts.
 *
 * ACTUAL FINANCE MODEL
 * ---------------------------------------------------------
 * Expense:
 * - branchId
 * - organizationId?
 * - title
 * - description?
 * - amount
 * - paymentMethod?
 * - expenseSourceType?
 * - date
 * - paidTo?
 * - approvedBy?
 * - receiptNumber?
 * - referenceNumber?
 * - photo?
 *
 * IMPORTANT ARCHITECTURE
 * ---------------------------------------------------------
 * Active School -> Active Branch -> Organizations -> Expense Records
 *
 * Expense records belong to a branch and may optionally be attached to
 * an organization such as department, house, club, committee or administration.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Expense,
  ExpenseSourceType,
  Organization,
  PaymentMethod,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

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
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

// ======================================================
// COMPONENT
// ======================================================

export default function ExpensesPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

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

  const [form, setForm] = useState<FormState>({
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

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [expenseRows, organizationRows] = await Promise.all([
        db.expenses.toArray(),
        db.organizations.toArray(),
      ]);

      setRows(
        expenseRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setOrganizations(
        organizationRows
          .filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      console.error("Failed to load expenses:", error);
      alert("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ExpenseView[]>(() => {
    return rows.map(row => {
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
      .filter(item => {
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
    const cash = filteredRows
      .filter(item => item.row.paymentMethod === "cash")
      .reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const momo = filteredRows
      .filter(item => item.row.paymentMethod === "momo")
      .reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const bank = filteredRows
      .filter(item => item.row.paymentMethod === "bank")
      .reduce((sum, item) => sum + Number(item.row.amount || 0), 0);
    const cardTotal = filteredRows
      .filter(item => item.row.paymentMethod === "card")
      .reduce((sum, item) => sum + Number(item.row.amount || 0), 0);

    const categories = new Set(
      filteredRows
        .map(item => item.row.expenseSourceType)
        .filter(Boolean)
    ).size;

    return {
      records: filteredRows.length,
      total,
      cash,
      momo,
      bank,
      cardTotal,
      categories,
    };
  }, [filteredRows]);

  const sourceTotals = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();

    filteredRows.forEach(item => {
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

  const organizationTotals = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();

    filteredRows.forEach(item => {
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
    setForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
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

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before recording expense.");
      return;
    }

    setEditMode(false);

    setForm({
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
    if (!activeBranchId) return "Select a branch first";
    if (!form.title.trim()) return "Enter expense title";
    if (Number(form.amount) <= 0) return "Expense amount must be greater than zero";
    if (!form.date) return "Select expense date";

    const duplicateReceipt = form.receiptNumber?.trim()
      ? rows.find(row => {
          if (editMode && row.id === form.id) return false;
          return row.receiptNumber?.trim().toLowerCase() === form.receiptNumber?.trim().toLowerCase();
        })
      : undefined;

    if (duplicateReceipt) return "An expense record with this receipt number already exists";

    const duplicateReference = form.referenceNumber?.trim()
      ? rows.find(row => {
          if (editMode && row.id === form.id) return false;
          return row.referenceNumber?.trim().toLowerCase() === form.referenceNumber?.trim().toLowerCase();
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
          organizationId: payload.organizationId,
          title: payload.title,
          description: payload.description,
          amount: payload.amount,
          paymentMethod: payload.paymentMethod,
          expenseSourceType: payload.expenseSourceType,
          date: payload.date,
          paidTo: payload.paidTo,
          approvedBy: payload.approvedBy,
          receiptNumber: payload.receiptNumber,
          referenceNumber: payload.referenceNumber,
          photo: payload.photo,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading expenses...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Expense records belong to a branch. Select a school and branch from the sidebar before managing expenses.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Expenses</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing expense records in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Record Expense
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search title, paid to, receipt, reference, approved by..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterOrganizationId || ""}
          onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Organizations</option>
          {organizations.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterSourceType}
          onChange={e => setFilterSourceType(e.target.value as "all" | ExpenseSourceType)}
          style={input}
        >
          <option value="all">All Expense Types</option>
          <option value="utilities">Utilities</option>
          <option value="salary">Salary</option>
          <option value="transport">Transport</option>
          <option value="feeding">Feeding</option>
          <option value="maintenance">Maintenance</option>
          <option value="procurement">Procurement</option>
          <option value="events">Events</option>
          <option value="academic">Academic</option>
          <option value="administration">Administration</option>
          <option value="technology">Technology</option>
          <option value="marketing">Marketing</option>
          <option value="security">Security</option>
          <option value="other">Other</option>
        </select>

        <select
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value as "all" | PaymentMethod)}
          style={input}
        >
          <option value="all">All Payment Methods</option>
          <option value="cash">Cash</option>
          <option value="momo">MoMo</option>
          <option value="bank">Bank</option>
          <option value="card">Card</option>
        </select>

        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value as DateFilter)}
          style={input}
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom Range</option>
        </select>

        {dateFilter === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={input} />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={input} />
          </>
        )}
      </div>

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Records</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{summary.records}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total Expenses</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.total)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Cash</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.cash)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>MoMo</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{money(summary.momo)}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Categories</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{summary.categories}</div>
        </div>
      </div>

      {/* EXPENSE TYPE BREAKDOWN */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Expense Type Breakdown</h3>
          <span style={badge("gray")}>{sourceTotals.length} type group(s)</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {sourceTotals.map(item => (
            <div key={item.name} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: 17 }}>{item.name}</strong>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("gray")}>{item.count} record(s)</span>
                    <span style={badge("red")}>{money(item.amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!sourceTotals.length && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              No expense type breakdown available for the selected filters.
            </div>
          )}
        </div>
      </section>

      {/* ORGANIZATION BREAKDOWN */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Organization Breakdown</h3>
          <span style={badge("gray")}>{organizationTotals.length} organization group(s)</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {organizationTotals.map(item => (
            <div key={item.name} style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: 17 }}>{item.name}</strong>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("gray")}>{item.count} record(s)</span>
                    <span style={badge("orange")}>{money(item.amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!organizationTotals.length && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              No organization breakdown available for the selected filters.
            </div>
          )}
        </div>
      </section>

      {/* EXPENSE RECORDS */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Expense Records</h3>
          <span style={badge("gray")}>{filteredRows.length} record(s)</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {filteredRows.map(item => {
            const row = item.row;

            return (
              <div key={row.id} style={card}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        background: row.photo
                          ? `url(${row.photo}) center/cover`
                          : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 950,
                        flex: "0 0 48px",
                      }}
                    >
                      {!row.photo && row.title.slice(0, 1).toUpperCase()}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 900 }}>{row.title}</div>
                      <div style={{ marginTop: 4, display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <span style={badge("red")}>{money(row.amount)}</span>
                        <span style={badge("blue")}>{paymentMethodLabel(row.paymentMethod)}</span>
                        <span style={badge("orange")}>{expenseSourceLabel(row.expenseSourceType)}</span>
                        <span style={badge("gray")}>{row.date}</span>
                        <span style={badge(row.organizationId ? "purple" : "gray")}>{item.organizationName}</span>
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {row.paidTo && <span style={badge("gray")}>Paid to: {row.paidTo}</span>}
                        {row.approvedBy && <span style={badge("gray")}>Approved by: {row.approvedBy}</span>}
                        {row.receiptNumber && <span style={badge("orange")}>Receipt: {row.receiptNumber}</span>}
                        {row.referenceNumber && <span style={badge("orange")}>Ref: {row.referenceNumber}</span>}
                      </div>

                      {row.description && (
                        <div style={{ marginTop: 8, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                          {row.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button style={ghostButton} onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!filteredRows.length && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              No expense records found in this branch for the selected filters.
            </div>
          )}
        </div>
      </section>

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(620px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Expense" : "Record Expense"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  This expense record will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </div>
              </div>
              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>Close</button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Expense Title</label>
                <input
                  value={form.title}
                  onChange={e => updateForm({ title: e.target.value })}
                  placeholder="e.g. Electricity bill, Staff salary, Stationery"
                  style={input}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Amount</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => updateForm({ amount: Number(e.target.value) })}
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => updateForm({ date: e.target.value })}
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Expense Type</label>
                <select
                  value={form.expenseSourceType || ""}
                  onChange={e => updateForm({ expenseSourceType: (e.target.value || undefined) as ExpenseSourceType | undefined })}
                  style={input}
                >
                  <option value="">Unspecified</option>
                  <option value="utilities">Utilities</option>
                  <option value="salary">Salary</option>
                  <option value="transport">Transport</option>
                  <option value="feeding">Feeding</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="procurement">Procurement</option>
                  <option value="events">Events</option>
                  <option value="academic">Academic</option>
                  <option value="administration">Administration</option>
                  <option value="technology">Technology</option>
                  <option value="marketing">Marketing</option>
                  <option value="security">Security</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label style={label}>Payment Method</label>
                <select
                  value={form.paymentMethod || ""}
                  onChange={e => updateForm({ paymentMethod: (e.target.value || undefined) as PaymentMethod | undefined })}
                  style={input}
                >
                  <option value="">Unspecified</option>
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div>
                <label style={label}>Organization</label>
                <select
                  value={form.organizationId || ""}
                  onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">General Expense / No Organization</option>
                  {organizations.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.type}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Paid To</label>
                  <input
                    value={form.paidTo || ""}
                    onChange={e => updateForm({ paidTo: e.target.value })}
                    placeholder="Vendor, staff, supplier or payee"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Approved By</label>
                  <input
                    value={form.approvedBy || ""}
                    onChange={e => updateForm({ approvedBy: e.target.value })}
                    placeholder="Approving officer"
                    style={input}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Receipt Number</label>
                  <input
                    value={form.receiptNumber || ""}
                    onChange={e => updateForm({ receiptNumber: e.target.value })}
                    placeholder="Receipt number"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Reference Number</label>
                  <input
                    value={form.referenceNumber || ""}
                    onChange={e => updateForm({ referenceNumber: e.target.value })}
                    placeholder="Bank/MoMo/reference number"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Description</label>
                <textarea
                  value={form.description || ""}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="Brief note about this expense"
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={label}>Receipt / Proof Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload(e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Expense proof"
                    style={{ width: "100%", height: 140, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Record Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
