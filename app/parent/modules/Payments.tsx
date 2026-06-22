"use client";

/**
 * app/parent/modules/Payments.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — PAYMENT HISTORY
 * ---------------------------------------------------------
 *
 * Parent-scoped payment view:
 * - No school selector.
 * - No branch selector.
 * - Uses the active parent membership.
 * - Shows only payments for children linked to the logged-in parent.
 *
 * Supports:
 * - old `payments` table
 * - new `studentFeePayments`
 * - new `paymentTransactions`
 *
 * UI:
 * - cards / table / analytics view switching
 * - mobile-first
 * - dark-mode safe
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  db,
  Parent,
  Payment,
  PaymentMethod,
  PaymentTransaction,
  Student,
  StudentFeeInvoice,
  StudentFeePayment,
  StudentParent,
} from "../../lib/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ViewMode = "cards" | "table" | "analytics";
type DateFilter = "all" | "today" | "week" | "month" | "custom";

type PaymentStatus =
  | "draft"
  | "pending"
  | "processing"
  | "paid"
  | "part_paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "reversed"
  | string;

type PaymentChannel = PaymentMethod | "manual" | string;

type UnifiedPayment = {
  id: string;
  localId?: number;
  sourceTable: "payments" | "studentFeePayments" | "paymentTransactions";
  studentId?: number;
  studentName: string;
  admissionNumber?: string;
  invoiceId?: number;
  invoiceNumber?: string;
  amount: number;
  currencyCode: string;
  currencySymbol: string;
  method?: PaymentChannel;
  provider?: string;
  status: PaymentStatus;
  date: string;
  paidAt?: string;
  receiptNumber?: string;
  referenceNumber?: string;
  providerReference?: string;
  note?: string;
};

type Breakdown = {
  name: string;
  amount: number;
  count: number;
};

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

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

const dateValue = (value?: string) => {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
};

const money = (amount: number, symbol = "GH₵", code = "GHS") => {
  const value = Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol || code} ${value}`;
};

const methodLabel = (method?: PaymentChannel) => {
  if (!method) return "Unspecified";
  if (method === "momo") return "MoMo";
  return String(method).charAt(0).toUpperCase() + String(method).slice(1);
};

const statusTone = (status?: PaymentStatus): "green" | "red" | "blue" | "gray" | "orange" | "purple" => {
  if (status === "paid") return "green";
  if (status === "part_paid" || status === "processing") return "blue";
  if (status === "pending" || status === "draft") return "orange";
  if (status === "failed" || status === "cancelled") return "red";
  if (status === "refunded" || status === "reversed") return "purple";
  return "gray";
};

const statusLabel = (status?: PaymentStatus) =>
  String(status || "unknown").replaceAll("_", " ");

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

// ======================================================
// COMPONENT
// ======================================================

export default function Payments() {
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

  const membershipContext = useActiveMembership() as any;

  const activeMembership = membershipContext?.activeMembership;
  const activeParentId =
    membershipContext?.activeParentId ||
    activeMembership?.parentLocalId ||
    undefined;

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [studentFeePayments, setStudentFeePayments] = useState<StudentFeePayment[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [studentFeeInvoices, setStudentFeeInvoices] = useState<StudentFeeInvoice[]>([]);

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [methodFilter, setMethodFilter] = useState<PaymentChannel | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [fromDate, setFromDate] = useState(startOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/owner");
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
    setParents([]);
    setStudentParents([]);
    setStudents([]);
    setPayments([]);
    setStudentFeePayments([]);
    setPaymentTransactions([]);
    setStudentFeeInvoices([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        parentRows,
        studentParentRows,
        studentRows,
        paymentRows,
        feePaymentRows,
        transactionRows,
        invoiceRows,
      ] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
        db.payments.toArray(),
        "studentFeePayments" in db ? db.studentFeePayments.toArray() : Promise.resolve([]),
        "paymentTransactions" in db ? db.paymentTransactions.toArray() : Promise.resolve([]),
        "studentFeeInvoices" in db ? db.studentFeeInvoices.toArray() : Promise.resolve([]),
      ]);

      const scopedParents = parentRows.filter(sameTenant);
      const scopedStudentParents = studentParentRows.filter(sameTenant);
      const scopedStudents = studentRows.filter(sameTenant);

      const parentIds = new Set<number>();

      if (activeParentId) {
        parentIds.add(Number(activeParentId));
      }

      const membershipParentId = activeMembership?.parentLocalId;
      if (membershipParentId) {
        parentIds.add(Number(membershipParentId));
      }

      const parentRowsFromEmailOrPhone = scopedParents.filter((parent) => {
        const userEmail = String((activeMembership as any)?.email || "").toLowerCase();
        const parentEmail = String(parent.email || "").toLowerCase();
        return userEmail && parentEmail && userEmail === parentEmail;
      });

      parentRowsFromEmailOrPhone.forEach((parent) => {
        if (parent.id) parentIds.add(parent.id);
      });

      const childIds = new Set<number>(
        scopedStudentParents
          .filter((link) => !parentIds.size || parentIds.has(link.parentId))
          .map((link) => link.studentId)
      );

      const childRows = scopedStudents.filter((student) => student.id && childIds.has(student.id));

      setParents(parentIds.size ? scopedParents.filter((parent) => parent.id && parentIds.has(parent.id)) : scopedParents);
      setStudentParents(scopedStudentParents.filter((link) => childIds.has(link.studentId)));
      setStudents(childRows);

      setPayments(
        paymentRows
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );

      setStudentFeePayments(
        (feePaymentRows as StudentFeePayment[])
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );

      setPaymentTransactions(
        (transactionRows as PaymentTransaction[])
          .filter(sameTenant)
          .filter((row) => {
            if (row.purpose !== "student_fee") return false;

            const feePayment = (feePaymentRows as StudentFeePayment[]).find(
              (payment) =>
                payment.paymentTransactionId === row.id &&
                payment.studentId &&
                childIds.has(payment.studentId)
            );

            return Boolean(feePayment);
          })
      );

      setStudentFeeInvoices(
        (invoiceRows as StudentFeeInvoice[])
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );
    } catch (error) {
      console.error("Failed to load parent payments:", error);
      clearData();
      alert("Failed to load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, activeParentId]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const invoiceMap = useMemo(() => new Map(studentFeeInvoices.map((row) => [row.id, row])), [studentFeeInvoices]);

  const unifiedPayments = useMemo<UnifiedPayment[]>(() => {
    const oldPayments: UnifiedPayment[] = payments.map((row) => {
      const student = studentMap.get(row.studentId);

      return {
        id: `payment-${row.id}`,
        localId: row.id,
        sourceTable: "payments",
        studentId: row.studentId,
        studentName: student?.fullName || "Student",
        admissionNumber: student?.admissionNumber,
        amount: Number(row.amount || 0),
        currencyCode: (row as any).currencyCode || settings?.currencyCode || "GHS",
        currencySymbol: (row as any).currencySymbol || settings?.currencySymbol || "GH₵",
        method: row.method,
        status: "paid",
        date: row.date,
        paidAt: row.date,
        receiptNumber: row.receiptNumber,
        note: row.note,
      };
    });

    const feePayments: UnifiedPayment[] = studentFeePayments.map((row) => {
      const student = studentMap.get(row.studentId);
      const invoice = row.invoiceId ? invoiceMap.get(row.invoiceId) : undefined;

      return {
        id: `fee-payment-${row.id}`,
        localId: row.id,
        sourceTable: "studentFeePayments",
        studentId: row.studentId,
        studentName: student?.fullName || "Student",
        admissionNumber: student?.admissionNumber,
        invoiceId: row.invoiceId,
        invoiceNumber: invoice?.invoiceNumber,
        amount: Number(row.amount || 0),
        currencyCode: row.currencyCode || invoice?.currencyCode || settings?.currencyCode || "GHS",
        currencySymbol: row.currencySymbol || invoice?.currencySymbol || settings?.currencySymbol || "GH₵",
        method: row.method,
        provider: row.provider,
        status: row.status || "pending",
        date: row.date,
        paidAt: row.paidAt,
        receiptNumber: row.receiptNumber,
        referenceNumber: row.referenceNumber,
        providerReference: row.providerReference,
        note: row.note,
      };
    });

    return [...feePayments, ...oldPayments].sort((a, b) => dateValue(b.paidAt || b.date) - dateValue(a.paidAt || a.date));
  }, [payments, studentFeePayments, studentMap, invoiceMap, settings?.currencyCode, settings?.currencySymbol]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = todayISO();
    const weekStart = startOfWeekISO();
    const monthStart = startOfMonthISO();

    return unifiedPayments.filter((item) => {
      const date = item.paidAt || item.date;

      if (studentFilter !== "all" && item.studentId !== studentFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (methodFilter !== "all" && item.method !== methodFilter) return false;

      if (dateFilter === "today" && date !== today) return false;
      if (dateFilter === "week" && (date < weekStart || date > today)) return false;
      if (dateFilter === "month" && (date < monthStart || date > today)) return false;
      if (dateFilter === "custom") {
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
      }

      if (!query) return true;

      return `
        ${item.studentName}
        ${item.admissionNumber || ""}
        ${item.invoiceNumber || ""}
        ${item.method || ""}
        ${item.provider || ""}
        ${item.status || ""}
        ${item.receiptNumber || ""}
        ${item.referenceNumber || ""}
        ${item.providerReference || ""}
        ${item.note || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [
    unifiedPayments,
    search,
    studentFilter,
    statusFilter,
    methodFilter,
    dateFilter,
    fromDate,
    toDate,
  ]);

  const summary = useMemo(() => {
    const total = filteredPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = filteredPayments
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = filteredPayments
      .filter((item) => item.status === "pending" || item.status === "processing" || item.status === "draft")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const failed = filteredPayments
      .filter((item) => item.status === "failed" || item.status === "cancelled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      records: filteredPayments.length,
      total,
      paid,
      pending,
      failed,
      currencyCode: filteredPayments[0]?.currencyCode || settings?.currencyCode || "GHS",
      currencySymbol: filteredPayments[0]?.currencySymbol || settings?.currencySymbol || "GH₵",
    };
  }, [filteredPayments, settings?.currencyCode, settings?.currencySymbol]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredPayments.forEach((item) => {
      const key = statusLabel(item.status);
      const existing = map.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += Number(item.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  const methodBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredPayments.forEach((item) => {
      const key = methodLabel(item.method);
      const existing = map.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += Number(item.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  const childBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredPayments.forEach((item) => {
      const key = item.studentName;
      const existing = map.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += Number(item.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  const uniqueStatuses = useMemo(() => {
    return Array.from(new Set(unifiedPayments.map((item) => item.status).filter(Boolean)));
  }, [unifiedPayments]);

  const uniqueMethods = useMemo(() => {
    return Array.from(new Set(unifiedPayments.map((item) => item.method).filter(Boolean)));
  }, [unifiedPayments]);

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="ppay-page" style={{ "--ppay-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ppay-state-card">
          <div className="ppay-spinner" />
          <h2>Opening payments...</h2>
          <p>Checking parent profile, children, fee invoices and payment history.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="ppay-page" style={{ "--ppay-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ppay-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing payment history.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ppay-page" style={{ "--ppay-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ppay-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent portal must be linked to a school branch before payment history can be shown.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="ppay-page" style={{ "--ppay-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ppay-hero">
        <div className="ppay-hero-left">
          <div className="ppay-hero-icon">🧾</div>
          <div className="ppay-title-wrap">
            <p>Parent Finance</p>
            <h2>Payment History</h2>
            <span>
              {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
            </span>
          </div>
        </div>

        <div className="ppay-hero-actions">
          <button type="button" className="ppay-ghost-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      <section className="ppay-context-grid">
        <article>
          <div className="ppay-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{students.length}</strong>
            <p>Only payments for your linked children appear here.</p>
          </div>
        </article>

        <article>
          <div className="ppay-context-icon">🏫</div>
          <div>
            <span>School Branch</span>
            <strong>{activeBranch?.name || "Assigned branch"}</strong>
            <p>Parent portal is locked to the child’s school branch.</p>
          </div>
        </article>
      </section>

      <section className="ppay-summary-grid" aria-label="Payment summary">
        <SummaryCard label="Records" value={summary.records} icon="🧾" />
        <SummaryCard label="Total Paid/Recorded" value={money(summary.total, summary.currencySymbol, summary.currencyCode)} icon="💳" positive />
        <SummaryCard label="Successful" value={money(summary.paid, summary.currencySymbol, summary.currencyCode)} icon="✅" />
        <SummaryCard label="Pending" value={money(summary.pending, summary.currencySymbol, summary.currencyCode)} icon="⏳" />
        <SummaryCard label="Failed/Cancelled" value={money(summary.failed, summary.currencySymbol, summary.currencyCode)} icon="⚠️" />
      </section>

      <section className="ppay-toolbar">
        <div className="ppay-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{filteredPayments.length} payment(s)</Chip>
      </section>

      <section className="ppay-filter-card">
        <input
          placeholder="Search student, receipt, reference, invoice..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Children</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName}
              {student.admissionNumber ? ` • ${student.admissionNumber}` : ""}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PaymentStatus | "all")}>
          <option value="all">All Statuses</option>
          {uniqueStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>

        <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as PaymentChannel | "all")}>
          <option value="all">All Methods</option>
          {uniqueMethods.map((method) => (
            <option key={method} value={method}>
              {methodLabel(method)}
            </option>
          ))}
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

      {viewMode === "analytics" && (
        <>
          <BreakdownSection title="Payments by Child" total={summary.total} items={childBreakdown} tone="purple" currencyCode={summary.currencyCode} currencySymbol={summary.currencySymbol} />
          <BreakdownSection title="Payments by Method" total={summary.total} items={methodBreakdown} tone="blue" currencyCode={summary.currencyCode} currencySymbol={summary.currencySymbol} />
          <BreakdownSection title="Payments by Status" total={summary.total} items={statusBreakdown} tone="green" currencyCode={summary.currencyCode} currencySymbol={summary.currencySymbol} />
        </>
      )}

      {viewMode === "table" && (
        <section className="ppay-table-card">
          <div className="ppay-section-head">
            <div>
              <p>Parent Payment Register</p>
              <h3>Payment Table</h3>
            </div>
            <Chip tone="blue">Parent Scoped</Chip>
          </div>

          <div className="ppay-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Reference</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((item) => (
                  <tr key={item.id}>
                    <td>{item.paidAt || item.date || "-"}</td>
                    <td>
                      <strong>{item.studentName}</strong>
                      <span>{item.admissionNumber || "No admission number"}</span>
                    </td>
                    <td>{item.invoiceNumber || "-"}</td>
                    <td>{methodLabel(item.method)}</td>
                    <td>{item.provider || "-"}</td>
                    <td><Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip></td>
                    <td><strong>{money(item.amount, item.currencySymbol, item.currencyCode)}</strong></td>
                    <td>{item.receiptNumber || "-"}</td>
                    <td>{item.referenceNumber || item.providerReference || "-"}</td>
                  </tr>
                ))}

                {!filteredPayments.length && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyCard text="No payments were found for your linked children under the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ppay-section">
          <div className="ppay-section-head">
            <div>
              <p>Parent Payment Register</p>
              <h3>Payment Records</h3>
            </div>
            <Chip tone="gray">{filteredPayments.length} payment(s)</Chip>
          </div>

          <div className="ppay-list">
            {filteredPayments.map((item) => (
              <article key={item.id} className="ppay-card">
                <div className="ppay-card-top">
                  <div className="ppay-card-icon">💳</div>

                  <div className="ppay-card-main">
                    <h3>{money(item.amount, item.currencySymbol, item.currencyCode)}</h3>
                    <p>{item.studentName}{item.admissionNumber ? ` · ${item.admissionNumber}` : ""}</p>

                    <div className="ppay-chip-row">
                      <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
                      <Chip tone="blue">{methodLabel(item.method)}</Chip>
                      <Chip tone="gray">{item.paidAt || item.date || "-"}</Chip>
                      {item.invoiceNumber && <Chip tone="purple">{item.invoiceNumber}</Chip>}
                    </div>
                  </div>
                </div>

                <div className="ppay-meta-grid">
                  <MiniStat label="Provider" value={item.provider || "-"} />
                  <MiniStat label="Receipt" value={item.receiptNumber || "-"} />
                  <MiniStat label="Reference" value={item.referenceNumber || item.providerReference || "-"} />
                  <MiniStat label="Source" value={item.sourceTable} />
                </div>

                {item.note && <p className="ppay-note">{item.note}</p>}
              </article>
            ))}

            {!filteredPayments.length && (
              <EmptyCard text="No payments were found for your linked children under the selected filters." />
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

function SummaryCard({ label, value, icon, positive = false }: { label: string; value: string | number; icon: string; positive?: boolean }) {
  return (
    <article className={`ppay-summary-card ${positive ? "positive" : ""}`}>
      <div className="ppay-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function BreakdownSection({
  title,
  total,
  items,
  tone,
  currencyCode,
  currencySymbol,
}: {
  title: string;
  total: number;
  items: Breakdown[];
  tone: "green" | "blue" | "purple";
  currencyCode: string;
  currencySymbol: string;
}) {
  return (
    <section className="ppay-section">
      <div className="ppay-section-head">
        <div>
          <p>Analytical View</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="ppay-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="ppay-breakdown-card">
            <div className="ppay-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone={tone}>{money(item.amount, currencySymbol, currencyCode)}</Chip>
            </div>

            <div className="ppay-bar-track">
              <div style={{ width: `${percentage(item.amount, total)}%` }} />
            </div>

            <div className="ppay-chip-row">
              <Chip tone="gray">{item.count} payment(s)</Chip>
              <Chip tone="gray">{percentage(item.amount, total)}%</Chip>
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available for the selected filters.`} />}
      </div>
    </section>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`ppay-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ppay-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="ppay-empty-card">
      <div className="ppay-empty-icon">🧾</div>
      <h3>No payment data</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes ppaySpin { to { transform: rotate(360deg); } }

.ppay-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ppay-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 16px);
  overflow-x: hidden;
}

.ppay-page *,
.ppay-page *::before,
.ppay-page *::after {
  box-sizing: border-box;
}

.ppay-page button,
.ppay-page input,
.ppay-page select {
  font: inherit;
  max-width: 100%;
}

.ppay-page input,
.ppay-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid var(--input-border, var(--border, rgba(148,163,184,.28)));
  border-radius: 15px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #0f172a));
  outline: none;
  font-weight: 750;
}

.ppay-page input:focus,
.ppay-page select:focus {
  border-color: var(--ppay-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ppay-primary) 12%, transparent);
}

.ppay-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.ppay-state-card h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ppay-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ppay-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ppay-primary) 18%, transparent);
  border-top-color: var(--ppay-primary);
  animation: ppaySpin .8s linear infinite;
}

.ppay-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--ppay-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--ppay-primary) 7%, var(--card, #fff)) 72%);
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.ppay-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.ppay-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--ppay-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ppay-primary) 28%, transparent);
  font-size: 22px;
}

.ppay-title-wrap {
  min-width: 0;
}

.ppay-title-wrap p,
.ppay-title-wrap h2,
.ppay-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppay-title-wrap p {
  margin: 0 0 2px;
  color: var(--ppay-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ppay-title-wrap h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.ppay-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.ppay-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.ppay-ghost-btn {
  min-height: 44px;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 999px;
  padding: 0 16px;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  font-weight: 950;
  cursor: pointer;
}

.ppay-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.ppay-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ppay-primary) 10%, var(--card, var(--surface, #fff))), var(--card, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.ppay-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--ppay-primary);
  color: #fff;
  font-size: 20px;
}

.ppay-context-grid article > div:last-child {
  min-width: 0;
}

.ppay-context-grid span {
  display: block;
  color: var(--ppay-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ppay-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ppay-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.ppay-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.ppay-summary-card,
.ppay-toolbar,
.ppay-filter-card,
.ppay-table-card,
.ppay-breakdown-card,
.ppay-card,
.ppay-empty-card {
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ppay-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.ppay-summary-card.positive {
  background:
    linear-gradient(135deg, rgba(34,197,94,.10), var(--card, var(--surface, #fff)));
}

.ppay-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--ppay-primary) 12%, var(--surface, #fff));
}

.ppay-summary-card div:last-child {
  min-width: 0;
}

.ppay-summary-card strong,
.ppay-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppay-summary-card strong {
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ppay-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.ppay-toolbar,
.ppay-filter-card,
.ppay-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.ppay-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ppay-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--ppay-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.ppay-view-tabs button {
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

.ppay-view-tabs button.active {
  background: var(--ppay-primary);
  color: #fff;
}

.ppay-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.ppay-section {
  margin-top: 16px;
}

.ppay-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.ppay-section-head p {
  margin: 0;
  color: var(--ppay-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ppay-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ppay-list,
.ppay-breakdown-grid {
  display: grid;
  gap: 10px;
}

.ppay-card,
.ppay-breakdown-card,
.ppay-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.ppay-card {
  background:
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--ppay-primary) 4%, var(--card, #fff)));
}

.ppay-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ppay-card-icon {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--ppay-primary);
  color: #fff;
  font-size: 22px;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.ppay-card-main {
  min-width: 0;
  flex: 1;
}

.ppay-card-main h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ppay-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.ppay-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ppay-chip {
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

.ppay-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.ppay-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.ppay-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.ppay-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.ppay-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.ppay-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.ppay-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.ppay-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.13));
  overflow: hidden;
}

.ppay-mini-stat strong,
.ppay-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppay-mini-stat strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.ppay-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.ppay-note {
  margin: 10px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ppay-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ppay-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ppay-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.ppay-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--ppay-primary);
}

.ppay-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.ppay-table-scroll table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--card, var(--surface, #fff));
}

.ppay-table-scroll th,
.ppay-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(148,163,184,.16));
  text-align: left;
  vertical-align: top;
  color: var(--text, #0f172a);
  font-size: 13px;
}

.ppay-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--ppay-primary) 6%, var(--card, #fff));
}

.ppay-table-scroll td strong,
.ppay-table-scroll td span {
  display: block;
}

.ppay-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.ppay-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.ppay-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ppay-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.ppay-empty-card h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.ppay-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

@media (min-width: 680px) {
  .ppay-page { padding: 12px; }
  .ppay-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ppay-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ppay-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .ppay-page { padding: 16px; }
  .ppay-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ppay-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .ppay-list,
  .ppay-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .ppay-page { padding: 6px; }
  .ppay-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .ppay-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .ppay-ghost-btn { width: 100%; }
  .ppay-summary-grid { gap: 6px; }
  .ppay-summary-card { padding: 10px; border-radius: 19px; }
  .ppay-summary-card strong { font-size: 16px; }
  .ppay-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .ppay-view-tabs { width: 100%; }
  .ppay-card,
  .ppay-empty-card,
  .ppay-breakdown-card { border-radius: 20px; padding: 11px; }
  .ppay-card-icon { width: 52px; height: 52px; flex-basis: 52px; }
  .ppay-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
