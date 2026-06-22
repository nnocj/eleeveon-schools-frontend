"use client";

/**
 * app/parent/modules/Childfees.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — CHILD FEE STATEMENTS
 * ---------------------------------------------------------
 *
 * Parent-scoped fee statement center:
 * - No school selector.
 * - No branch selector.
 * - Uses active parent membership.
 * - Shows only fee invoices for children linked to the logged-in parent.
 *
 * Supports:
 * - new studentFeeInvoices
 * - new studentFeeInvoiceItems
 * - new studentFeePayments
 * - fallback old payments table
 *
 * Phase 3 connected:
 * - Pay Now opens a secure checkout modal.
 * - Backend creates a student-fee payment intent/transaction.
 * - Paystack checkout redirects when authorizationUrl is returned.
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
  Student,
  StudentFeeInvoice,
  StudentFeeInvoiceItem,
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
type StatusFilter = "all" | "draft" | "issued" | "part_paid" | "paid" | "overdue" | "cancelled" | "void";
type DateFilter = "all" | "today" | "week" | "month" | "custom";

type FeeStatus = StudentFeeInvoice["status"] | "no_invoice" | string;

type FeeStatement = {
  invoice: StudentFeeInvoice;
  student?: Student;
  items: StudentFeeInvoiceItem[];
  payments: StudentFeePayment[];
  fallbackPayments: Payment[];
  billed: number;
  paid: number;
  balance: number;
  overdue: boolean;
  currencyCode: string;
  currencySymbol: string;
};

type ChildSummary = {
  student: Student;
  invoices: FeeStatement[];
  billed: number;
  paid: number;
  balance: number;
  overdue: number;
};

type Breakdown = {
  name: string;
  amount: number;
  count: number;
};

type PaymentChannel = "momo" | "card" | "bank" | "cash" | "manual";
type MomoNetwork = "mtn" | "telecel" | "airteltigo";

type CheckoutState = {
  open: boolean;
  statement: FeeStatement | null;
  method: PaymentChannel;
  momoNetwork: MomoNetwork;
  payerName: string;
  payerPhone: string;
  payerEmail: string;
  note: string;
  error: string;
  success: string;
};

type CheckoutResponse = {
  ok?: boolean;
  paymentIntent?: any;
  paymentTransaction?: any;
  studentFeePayment?: any;
  providerResponse?: {
    authorizationUrl?: string;
    authorization_url?: string;
    accessCode?: string;
    access_code?: string;
    reference?: string;
  };
  authorizationUrl?: string;
  authorization_url?: string;
  message?: string;
};

// ======================================================
// PAYMENT HELPERS
// ======================================================

const paymentMethods: PaymentChannel[] = ["momo", "card", "bank", "cash", "manual"];

const paymentMethodLabel = (method: PaymentChannel) => {
  if (method === "momo") return "Mobile Money";
  if (method === "card") return "Card";
  if (method === "bank") return "Bank";
  if (method === "cash") return "Cash";
  return "Manual";
};

const providerForMethod = (method: PaymentChannel) => {
  if (method === "momo" || method === "card") return "paystack";
  if (method === "bank") return "bank";
  if (method === "cash") return "cash";
  return "manual";
};

const getApiBase = () => {
  const value =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:4000";

  return value.replace(/\/$/, "");
};

const getAuthToken = () => {
  if (typeof window === "undefined") return "";

  return (
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("eleeveon_token") ||
    localStorage.getItem("eleeveon_access_token") ||
    ""
  );
};

const authHeaders = () => {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function readCheckoutJson(response: Response) {
  const text = await response.text();

  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!response.ok) {
    throw new Error(json?.message || json?.error || "Payment checkout failed.");
  }

  return json as CheckoutResponse;
}

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

const statusLabel = (status?: FeeStatus) => String(status || "unknown").replaceAll("_", " ");

const statusTone = (status?: FeeStatus): "green" | "red" | "blue" | "gray" | "orange" | "purple" => {
  if (status === "paid") return "green";
  if (status === "part_paid") return "blue";
  if (status === "issued" || status === "draft") return "orange";
  if (status === "overdue") return "red";
  if (status === "cancelled" || status === "void") return "purple";
  return "gray";
};

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

// ======================================================
// COMPONENT
// ======================================================

export default function Childfees() {
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
  const [invoices, setInvoices] = useState<StudentFeeInvoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<StudentFeeInvoiceItem[]>([]);
  const [feePayments, setFeePayments] = useState<StudentFeePayment[]>([]);
  const [oldPayments, setOldPayments] = useState<Payment[]>([]);

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [fromDate, setFromDate] = useState(startOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const [checkout, setCheckout] = useState<CheckoutState>({
    open: false,
    statement: null,
    method: "momo",
    momoNetwork: "mtn",
    payerName: "",
    payerPhone: "",
    payerEmail: "",
    note: "",
    error: "",
    success: "",
  });

  const [checkoutLoading, setCheckoutLoading] = useState(false);

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
    setInvoices([]);
    setInvoiceItems([]);
    setFeePayments([]);
    setOldPayments([]);
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
        invoiceRows,
        invoiceItemRows,
        feePaymentRows,
        paymentRows,
      ] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
        "studentFeeInvoices" in db ? db.studentFeeInvoices.toArray() : Promise.resolve([]),
        "studentFeeInvoiceItems" in db ? db.studentFeeInvoiceItems.toArray() : Promise.resolve([]),
        "studentFeePayments" in db ? db.studentFeePayments.toArray() : Promise.resolve([]),
        db.payments.toArray(),
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

      const userEmail = String((activeMembership as any)?.email || "").toLowerCase();
      scopedParents
        .filter((parent) => userEmail && String(parent.email || "").toLowerCase() === userEmail)
        .forEach((parent) => {
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

      setInvoices(
        (invoiceRows as StudentFeeInvoice[])
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );

      setInvoiceItems(
        (invoiceItemRows as StudentFeeInvoiceItem[])
          .filter(sameTenant)
      );

      setFeePayments(
        (feePaymentRows as StudentFeePayment[])
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );

      setOldPayments(
        paymentRows
          .filter(sameTenant)
          .filter((row) => childIds.has(row.studentId))
      );
    } catch (error) {
      console.error("Failed to load child fees:", error);
      clearData();
      alert("Failed to load child fees.");
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

  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  const statements = useMemo<FeeStatement[]>(() => {
    return invoices.map((invoice) => {
      const items = invoiceItems.filter((item) => item.invoiceId === invoice.id);
      const payments = feePayments.filter((payment) => payment.invoiceId === invoice.id);
      const fallbackPayments = oldPayments.filter(
        (payment) =>
          payment.studentId === invoice.studentId &&
          (!invoice.academicPeriodId || (payment as any).academicPeriodId === invoice.academicPeriodId)
      );

      const billed = Number(invoice.total ?? items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      const newPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const storedPaid = Number(invoice.amountPaid || 0);
      const fallbackPaid = !payments.length && !storedPaid
        ? fallbackPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
        : 0;

      const paid = Math.max(newPaid, storedPaid, fallbackPaid);
      const balance = Math.max(0, Number(invoice.balance ?? billed - paid));
      const dueDate = invoice.dueDate || "";
      const overdue = Boolean(balance > 0 && dueDate && dueDate < todayISO() && invoice.status !== "paid");

      return {
        invoice: overdue && invoice.status !== "paid"
          ? { ...invoice, status: "overdue" as any }
          : invoice,
        student: studentMap.get(invoice.studentId),
        items,
        payments,
        fallbackPayments,
        billed,
        paid,
        balance,
        overdue,
        currencyCode: invoice.currencyCode || settings?.currencyCode || "GHS",
        currencySymbol: invoice.currencySymbol || settings?.currencySymbol || "GH₵",
      };
    });
  }, [invoices, invoiceItems, feePayments, oldPayments, studentMap, settings?.currencyCode, settings?.currencySymbol]);

  const filteredStatements = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = todayISO();
    const weekStart = startOfWeekISO();
    const monthStart = startOfMonthISO();

    return statements
      .filter((statement) => {
        const invoice = statement.invoice;
        const student = statement.student;
        const date = invoice.issueDate || invoice.dueDate || "";

        if (studentFilter !== "all" && invoice.studentId !== studentFilter) return false;
        if (statusFilter !== "all" && invoice.status !== statusFilter) return false;

        if (dateFilter === "today" && date !== today) return false;
        if (dateFilter === "week" && (date < weekStart || date > today)) return false;
        if (dateFilter === "month" && (date < monthStart || date > today)) return false;
        if (dateFilter === "custom") {
          if (fromDate && date < fromDate) return false;
          if (toDate && date > toDate) return false;
        }

        if (!query) return true;

        return `
          ${student?.fullName || ""}
          ${student?.admissionNumber || ""}
          ${invoice.invoiceNumber || ""}
          ${invoice.status || ""}
          ${invoice.note || ""}
          ${statement.items.map((item) => item.name).join(" ")}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => dateValue(b.invoice.issueDate || b.invoice.dueDate) - dateValue(a.invoice.issueDate || a.invoice.dueDate));
  }, [statements, search, studentFilter, statusFilter, dateFilter, fromDate, toDate]);

  const childSummaries = useMemo<ChildSummary[]>(() => {
    return students.map((student) => {
      const childInvoices = statements.filter((statement) => statement.invoice.studentId === student.id);
      const billed = childInvoices.reduce((sum, item) => sum + item.billed, 0);
      const paid = childInvoices.reduce((sum, item) => sum + item.paid, 0);
      const balance = childInvoices.reduce((sum, item) => sum + item.balance, 0);
      const overdue = childInvoices.reduce((sum, item) => sum + (item.overdue ? item.balance : 0), 0);

      return { student, invoices: childInvoices, billed, paid, balance, overdue };
    });
  }, [students, statements]);

  const summary = useMemo(() => {
    const billed = filteredStatements.reduce((sum, item) => sum + item.billed, 0);
    const paid = filteredStatements.reduce((sum, item) => sum + item.paid, 0);
    const balance = filteredStatements.reduce((sum, item) => sum + item.balance, 0);
    const overdue = filteredStatements.reduce((sum, item) => sum + (item.overdue ? item.balance : 0), 0);

    return {
      invoices: filteredStatements.length,
      billed,
      paid,
      balance,
      overdue,
      currencyCode: filteredStatements[0]?.currencyCode || settings?.currencyCode || "GHS",
      currencySymbol: filteredStatements[0]?.currencySymbol || settings?.currencySymbol || "GH₵",
    };
  }, [filteredStatements, settings?.currencyCode, settings?.currencySymbol]);

  const feeItemBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredStatements.forEach((statement) => {
      statement.items.forEach((item) => {
        const key = item.name || "Fee Item";
        const existing = map.get(key) || { name: key, amount: 0, count: 0 };
        existing.amount += Number(item.amount || 0);
        existing.count += 1;
        map.set(key, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredStatements]);

  const statusBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();

    filteredStatements.forEach((statement) => {
      const key = statusLabel(statement.invoice.status);
      const existing = map.get(key) || { name: key, amount: 0, count: 0 };
      existing.amount += Number(statement.balance || 0);
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredStatements]);

  const selectedStatement = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return statements.find((statement) => statement.invoice.id === selectedInvoiceId) || null;
  }, [selectedInvoiceId, statements]);

  const closeCheckout = () => {
    if (checkoutLoading) return;

    setCheckout((prev) => ({
      ...prev,
      open: false,
      statement: null,
      error: "",
      success: "",
    }));
  };

  const handlePayNow = (statement: FeeStatement) => {
    if (statement.balance <= 0) return;

    const parent = parents[0];
    const student = statement.student;

    setSelectedInvoiceId(statement.invoice.id || null);
    setCheckout({
      open: true,
      statement,
      method: "momo",
      momoNetwork: "mtn",
      payerName: parent?.fullName || student?.parentName || "",
      payerPhone: parent?.phone || student?.parentPhone || "",
      payerEmail: parent?.email || student?.parentEmail || "",
      note: `Fee payment for invoice ${statement.invoice.invoiceNumber}`,
      error: "",
      success: "",
    });
  };

  const startCheckout = async () => {
    const statement = checkout.statement;

    if (!statement || !statement.invoice.id) {
      setCheckout((prev) => ({ ...prev, error: "Select a valid invoice first." }));
      return;
    }

    if (!accountId || !schoolId || !branchId) {
      setCheckout((prev) => ({ ...prev, error: "Your school branch context is missing." }));
      return;
    }

    if ((checkout.method === "momo" || checkout.method === "card") && !checkout.payerEmail.trim()) {
      setCheckout((prev) => ({ ...prev, error: "Payer email is required for Paystack checkout." }));
      return;
    }

    if (checkout.method === "momo" && !checkout.payerPhone.trim()) {
      setCheckout((prev) => ({ ...prev, error: "Phone number is required for mobile money checkout." }));
      return;
    }

    try {
      setCheckoutLoading(true);
      setCheckout((prev) => ({ ...prev, error: "", success: "" }));

      const apiBase = getApiBase();
      const provider = providerForMethod(checkout.method);

      const payload = {
        accountId,
        schoolId,
        branchId,
        purpose: "student_fee",
        feeInvoiceId: statement.invoice.id,
        invoiceId: statement.invoice.id,
        invoiceNumber: statement.invoice.invoiceNumber,
        studentId: statement.invoice.studentId,
        parentId: activeParentId ? Number(activeParentId) : parents[0]?.id,
        amount: statement.balance,
        currencyCode: statement.currencyCode,
        currencySymbol: statement.currencySymbol,
        currencyName: statement.invoice.currencyName || settings?.currencyName || "Ghanaian Cedi",
        channel: checkout.method,
        method: checkout.method,
        provider,
        momoNetwork: checkout.method === "momo" ? checkout.momoNetwork : undefined,
        payerName: checkout.payerName.trim() || parents[0]?.fullName || statement.student?.parentName,
        payerPhone: checkout.payerPhone.trim() || parents[0]?.phone || statement.student?.parentPhone,
        payerEmail: checkout.payerEmail.trim() || parents[0]?.email || statement.student?.parentEmail,
        description: `School fee payment for ${statement.student?.fullName || "student"} - ${statement.invoice.invoiceNumber}`,
        note: checkout.note.trim(),
        metadata: {
          source: "parent_portal",
          invoiceNumber: statement.invoice.invoiceNumber,
          studentName: statement.student?.fullName,
          schoolName: activeSchool?.name,
          branchName: activeBranch?.name,
        },
      };

      /*
       * Preferred endpoint:
       * Your Phase 3 backend should expose this route and use PaystackProvider
       * to return authorizationUrl for momo/card payments.
       */
      let response = await fetch(`${apiBase}/payment-gateway/student-fees/checkout`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      /*
       * Safe fallback:
       * If the specialized checkout route is not yet added, create a payment
       * intent using the Phase 2 generic payment-gateway endpoint.
       * This records the intent but may not redirect unless your backend returns authorizationUrl.
       */
      if (response.status === 404 || response.status === 405) {
        response = await fetch(`${apiBase}/payment-gateway/intents`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            schoolId,
            branchId,
            purpose: "student_fee",
            amount: statement.balance,
            channel: checkout.method,
            provider,
            studentId: statement.invoice.studentId,
            parentId: activeParentId ? Number(activeParentId) : parents[0]?.id,
            feeInvoiceId: statement.invoice.id,
            currencyCode: statement.currencyCode,
            currencySymbol: statement.currencySymbol,
            currencyName: statement.invoice.currencyName || settings?.currencyName || "Ghanaian Cedi",
            payerName: payload.payerName,
            payerPhone: payload.payerPhone,
            payerEmail: payload.payerEmail,
            momoNetwork: payload.momoNetwork,
            description: payload.description,
            metadata: payload.metadata,
          }),
        });
      }

      const json = await readCheckoutJson(response);
      const authorizationUrl =
        json.authorizationUrl ||
        json.authorization_url ||
        json.providerResponse?.authorizationUrl ||
        json.providerResponse?.authorization_url;

      if (authorizationUrl) {
        window.location.href = authorizationUrl;
        return;
      }

      if (provider === "paystack") {
        setCheckout((prev) => ({
          ...prev,
          error:
            "Payment intent was created, but Paystack did not return a checkout URL. Add the backend student-fee checkout route that calls PaystackProvider.initializePayment.",
        }));
        return;
      }

      setCheckout((prev) => ({
        ...prev,
        success: json.message || "Payment request recorded. The school will confirm this payment.",
      }));

      await load();
    } catch (error: any) {
      setCheckout((prev) => ({
        ...prev,
        error: error?.message || "Payment checkout failed.",
      }));
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="cfees-page" style={{ "--cfees-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cfees-state-card">
          <div className="cfees-spinner" />
          <h2>Opening fee statements...</h2>
          <p>Checking parent profile, children, invoices, and payment records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cfees-page" style={{ "--cfees-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cfees-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing child fees.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cfees-page" style={{ "--cfees-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cfees-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent portal must be linked to a school branch before fee statements can be shown.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="cfees-page" style={{ "--cfees-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cfees-hero">
        <div className="cfees-hero-left">
          <div className="cfees-hero-icon">💳</div>
          <div className="cfees-title-wrap">
            <p>Parent Finance</p>
            <h2>Fee Statements</h2>
            <span>
              {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
            </span>
          </div>
        </div>

        <div className="cfees-hero-actions">
          <button type="button" className="cfees-ghost-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      <section className="cfees-context-grid">
        <article>
          <div className="cfees-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{students.length}</strong>
            <p>Only fee statements for your linked children appear here.</p>
          </div>
        </article>

        <article>
          <div className="cfees-context-icon">🏫</div>
          <div>
            <span>School Branch</span>
            <strong>{activeBranch?.name || "Assigned branch"}</strong>
            <p>The parent portal is locked to your child’s assigned branch.</p>
          </div>
        </article>
      </section>

      <section className="cfees-summary-grid" aria-label="Fee summary">
        <SummaryCard label="Invoices" value={summary.invoices} icon="🧾" />
        <SummaryCard label="Total Billed" value={money(summary.billed, summary.currencySymbol, summary.currencyCode)} icon="📌" />
        <SummaryCard label="Total Paid" value={money(summary.paid, summary.currencySymbol, summary.currencyCode)} icon="✅" positive />
        <SummaryCard label="Outstanding" value={money(summary.balance, summary.currencySymbol, summary.currencyCode)} icon="💳" warning={summary.balance > 0} />
        <SummaryCard label="Overdue" value={money(summary.overdue, summary.currencySymbol, summary.currencyCode)} icon="⚠️" danger={summary.overdue > 0} />
      </section>

      <section className="cfees-toolbar">
        <div className="cfees-view-tabs">
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

        <Chip tone="gray">{filteredStatements.length} invoice(s)</Chip>
      </section>

      <section className="cfees-filter-card">
        <input
          placeholder="Search child, invoice number, fee item..."
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

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="part_paid">Part Paid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
          <option value="void">Void</option>
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
          <section className="cfees-section">
            <div className="cfees-section-head">
              <div>
                <p>Child Overview</p>
                <h3>Fee Position by Child</h3>
              </div>
              <Chip tone="blue">{childSummaries.length} child(ren)</Chip>
            </div>

            <div className="cfees-child-grid">
              {childSummaries.map((child) => (
                <article key={child.student.id} className="cfees-child-card">
                  <div className="cfees-child-top">
                    <div className="cfees-child-avatar">
                      {child.student.photo ? <img src={child.student.photo} alt={child.student.fullName} /> : child.student.fullName.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{child.student.fullName}</strong>
                      <span>{child.student.admissionNumber || "No admission number"}</span>
                    </div>
                  </div>

                  <div className="cfees-mini-grid">
                    <MiniStat label="Billed" value={money(child.billed, summary.currencySymbol, summary.currencyCode)} />
                    <MiniStat label="Paid" value={money(child.paid, summary.currencySymbol, summary.currencyCode)} />
                    <MiniStat label="Balance" value={money(child.balance, summary.currencySymbol, summary.currencyCode)} />
                    <MiniStat label="Overdue" value={money(child.overdue, summary.currencySymbol, summary.currencyCode)} />
                  </div>
                </article>
              ))}

              {!childSummaries.length && <EmptyCard text="No linked child fee data was found." />}
            </div>
          </section>

          <BreakdownSection title="Fee Item Breakdown" total={summary.billed} items={feeItemBreakdown} tone="purple" currencyCode={summary.currencyCode} currencySymbol={summary.currencySymbol} />
          <BreakdownSection title="Balance by Status" total={summary.balance} items={statusBreakdown} tone="orange" currencyCode={summary.currencyCode} currencySymbol={summary.currencySymbol} />
        </>
      )}

      {viewMode === "table" && (
        <section className="cfees-table-card">
          <div className="cfees-section-head">
            <div>
              <p>Parent Fee Register</p>
              <h3>Fee Statement Table</h3>
            </div>
            <Chip tone="blue">Parent Scoped</Chip>
          </div>

          <div className="cfees-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredStatements.map((statement) => (
                  <tr key={statement.invoice.id}>
                    <td>
                      <strong>{statement.student?.fullName || "Student"}</strong>
                      <span>{statement.student?.admissionNumber || "No admission number"}</span>
                    </td>
                    <td>{statement.invoice.invoiceNumber}</td>
                    <td><Chip tone={statusTone(statement.invoice.status)}>{statusLabel(statement.invoice.status)}</Chip></td>
                    <td>{statement.invoice.issueDate || "-"}</td>
                    <td>{statement.invoice.dueDate || "-"}</td>
                    <td>{money(statement.billed, statement.currencySymbol, statement.currencyCode)}</td>
                    <td>{money(statement.paid, statement.currencySymbol, statement.currencyCode)}</td>
                    <td><strong>{money(statement.balance, statement.currencySymbol, statement.currencyCode)}</strong></td>
                    <td>
                      <button type="button" className="cfees-table-btn" onClick={() => setSelectedInvoiceId(statement.invoice.id || null)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {!filteredStatements.length && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyCard text="No fee invoices were found for your linked children under the selected filters." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "cards" && (
        <section className="cfees-section">
          <div className="cfees-section-head">
            <div>
              <p>Parent Fee Register</p>
              <h3>Fee Statements</h3>
            </div>
            <Chip tone="gray">{filteredStatements.length} invoice(s)</Chip>
          </div>

          <div className="cfees-list">
            {filteredStatements.map((statement) => (
              <article key={statement.invoice.id} className="cfees-card">
                <div className="cfees-card-top">
                  <div className="cfees-card-icon">💳</div>

                  <div className="cfees-card-main">
                    <h3>{statement.student?.fullName || "Student"}</h3>
                    <p>
                      {statement.invoice.invoiceNumber}
                      {statement.student?.admissionNumber ? ` · ${statement.student.admissionNumber}` : ""}
                    </p>

                    <div className="cfees-chip-row">
                      <Chip tone={statusTone(statement.invoice.status)}>{statusLabel(statement.invoice.status)}</Chip>
                      <Chip tone="gray">Due: {statement.invoice.dueDate || "-"}</Chip>
                      <Chip tone={statement.balance > 0 ? "orange" : "green"}>
                        Balance: {money(statement.balance, statement.currencySymbol, statement.currencyCode)}
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="cfees-mini-grid">
                  <MiniStat label="Billed" value={money(statement.billed, statement.currencySymbol, statement.currencyCode)} />
                  <MiniStat label="Paid" value={money(statement.paid, statement.currencySymbol, statement.currencyCode)} />
                  <MiniStat label="Balance" value={money(statement.balance, statement.currencySymbol, statement.currencyCode)} />
                  <MiniStat label="Items" value={statement.items.length} />
                </div>

                <div className="cfees-action-row">
                  <button type="button" onClick={() => setSelectedInvoiceId(statement.invoice.id || null)}>
                    View Statement
                  </button>
                  <button type="button" className="primary" disabled={statement.balance <= 0} onClick={() => handlePayNow(statement)}>
                    Pay Now
                  </button>
                </div>
              </article>
            ))}

            {!filteredStatements.length && (
              <EmptyCard text="No fee invoices were found for your linked children under the selected filters." />
            )}
          </div>
        </section>
      )}

      {checkout.open && checkout.statement && (
        <div className="cfees-checkout-layer">
          <button
            type="button"
            className="cfees-checkout-overlay"
            aria-label="Close checkout"
            onClick={closeCheckout}
          />

          <aside className="cfees-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="fee-checkout-title">
            <div className="cfees-checkout-head">
              <div>
                <p>Secure Fee Checkout</p>
                <h2 id="fee-checkout-title">Pay School Fees</h2>
                <span>
                  {checkout.statement.student?.fullName || "Student"} · {checkout.statement.invoice.invoiceNumber}
                </span>
              </div>

              <button type="button" onClick={closeCheckout} disabled={checkoutLoading} aria-label="Close checkout">
                ✕
              </button>
            </div>

            <section className="cfees-checkout-amount">
              <span>Total payable</span>
              <strong>
                {money(checkout.statement.balance, checkout.statement.currencySymbol, checkout.statement.currencyCode)}
              </strong>
              <small>
                {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
              </small>
            </section>

            <section className="cfees-checkout-section">
              <div className="cfees-checkout-section-head">
                <h3>Payment method</h3>
                <p>MoMo and card payments redirect securely to Paystack.</p>
              </div>

              <div className="cfees-method-grid" role="radiogroup" aria-label="Payment method">
                {paymentMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    role="radio"
                    aria-checked={checkout.method === method}
                    className={checkout.method === method ? "active" : ""}
                    onClick={() => setCheckout((prev) => ({ ...prev, method, error: "", success: "" }))}
                    disabled={checkoutLoading}
                  >
                    <span>{method === "momo" ? "Mo" : method === "card" ? "Ca" : method === "bank" ? "Ba" : method === "cash" ? "Cs" : "Mn"}</span>
                    <strong>{paymentMethodLabel(method)}</strong>
                  </button>
                ))}
              </div>
            </section>

            {checkout.method === "momo" && (
              <label className="cfees-checkout-field">
                <span>Mobile Money Network</span>
                <select
                  value={checkout.momoNetwork}
                  onChange={(event) => setCheckout((prev) => ({ ...prev, momoNetwork: event.target.value as MomoNetwork }))}
                  disabled={checkoutLoading}
                >
                  <option value="mtn">MTN Mobile Money</option>
                  <option value="telecel">Telecel Cash</option>
                  <option value="airteltigo">AirtelTigo Money</option>
                </select>
              </label>
            )}

            <div className="cfees-checkout-two">
              <label className="cfees-checkout-field">
                <span>Payer Name</span>
                <input
                  value={checkout.payerName}
                  onChange={(event) => setCheckout((prev) => ({ ...prev, payerName: event.target.value }))}
                  placeholder="Parent / guardian name"
                  disabled={checkoutLoading}
                />
              </label>

              <label className="cfees-checkout-field">
                <span>Phone</span>
                <input
                  value={checkout.payerPhone}
                  onChange={(event) => setCheckout((prev) => ({ ...prev, payerPhone: event.target.value }))}
                  placeholder="024..."
                  disabled={checkoutLoading}
                />
              </label>
            </div>

            <label className="cfees-checkout-field">
              <span>Email {checkout.method === "momo" || checkout.method === "card" ? "(required for Paystack)" : ""}</span>
              <input
                type="email"
                value={checkout.payerEmail}
                onChange={(event) => setCheckout((prev) => ({ ...prev, payerEmail: event.target.value }))}
                placeholder="parent@example.com"
                disabled={checkoutLoading}
              />
            </label>

            <label className="cfees-checkout-field">
              <span>Note</span>
              <input
                value={checkout.note}
                onChange={(event) => setCheckout((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Optional payment note"
                disabled={checkoutLoading}
              />
            </label>

            {checkout.error && <div className="cfees-checkout-alert error">{checkout.error}</div>}
            {checkout.success && <div className="cfees-checkout-alert success">{checkout.success}</div>}

            <button
              type="button"
              className="cfees-checkout-submit"
              onClick={startCheckout}
              disabled={checkoutLoading || checkout.statement.balance <= 0}
            >
              {checkoutLoading
                ? "Starting checkout..."
                : providerForMethod(checkout.method) === "paystack"
                  ? "Continue to Paystack"
                  : "Record Payment Request"}
            </button>

            <p className="cfees-checkout-footnote">
              Online payments are confirmed by the backend webhook after Paystack reports success.
            </p>
          </aside>
        </div>
      )}

      {selectedStatement && (
        <div className="cfees-drawer-layer">
          <button type="button" className="cfees-drawer-overlay" aria-label="Close statement" onClick={() => setSelectedInvoiceId(null)} />

          <aside className="cfees-drawer">
            <div className="cfees-drawer-head">
              <div>
                <p>Fee Statement</p>
                <h2>{selectedStatement.invoice.invoiceNumber}</h2>
                <span>{selectedStatement.student?.fullName || "Student"} · {activeBranch?.name || "Branch"}</span>
              </div>
              <button type="button" onClick={() => setSelectedInvoiceId(null)}>✕</button>
            </div>

            <section className="cfees-statement-summary">
              <MiniStat label="Billed" value={money(selectedStatement.billed, selectedStatement.currencySymbol, selectedStatement.currencyCode)} />
              <MiniStat label="Paid" value={money(selectedStatement.paid, selectedStatement.currencySymbol, selectedStatement.currencyCode)} />
              <MiniStat label="Balance" value={money(selectedStatement.balance, selectedStatement.currencySymbol, selectedStatement.currencyCode)} />
              <MiniStat label="Status" value={statusLabel(selectedStatement.invoice.status)} />
            </section>

            <section className="cfees-drawer-section">
              <h3>Fee Items</h3>
              <div className="cfees-line-list">
                {selectedStatement.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.name}</span>
                    <strong>{money(item.amount, selectedStatement.currencySymbol, selectedStatement.currencyCode)}</strong>
                  </div>
                ))}

                {!selectedStatement.items.length && (
                  <div>
                    <span>No itemized fee breakdown found.</span>
                    <strong>{money(selectedStatement.billed, selectedStatement.currencySymbol, selectedStatement.currencyCode)}</strong>
                  </div>
                )}
              </div>
            </section>

            <section className="cfees-drawer-section">
              <h3>Payments</h3>
              <div className="cfees-line-list">
                {selectedStatement.payments.map((payment) => (
                  <div key={`fee-payment-${payment.id}`}>
                    <span>{payment.date || payment.paidAt || "Payment"} · {payment.method}</span>
                    <strong>{money(payment.amount, selectedStatement.currencySymbol, selectedStatement.currencyCode)}</strong>
                  </div>
                ))}

                {!selectedStatement.payments.length && selectedStatement.fallbackPayments.map((payment) => (
                  <div key={`old-payment-${payment.id}`}>
                    <span>{payment.date || "Payment"} · {payment.method}</span>
                    <strong>{money(payment.amount, selectedStatement.currencySymbol, selectedStatement.currencyCode)}</strong>
                  </div>
                ))}

                {!selectedStatement.payments.length && !selectedStatement.fallbackPayments.length && (
                  <div>
                    <span>No payment has been recorded for this invoice yet.</span>
                    <strong>{money(0, selectedStatement.currencySymbol, selectedStatement.currencyCode)}</strong>
                  </div>
                )}
              </div>
            </section>

            <button
              type="button"
              className="cfees-pay-btn"
              disabled={selectedStatement.balance <= 0}
              onClick={() => handlePayNow(selectedStatement)}
            >
              {selectedStatement.balance > 0
                ? `Pay ${money(selectedStatement.balance, selectedStatement.currencySymbol, selectedStatement.currencyCode)}`
                : "Fully Paid"}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
  danger = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <article className={`cfees-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""} ${danger ? "danger" : ""}`}>
      <div className="cfees-summary-icon">{icon}</div>
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
  tone: "green" | "blue" | "purple" | "orange";
  currencyCode: string;
  currencySymbol: string;
}) {
  return (
    <section className="cfees-section">
      <div className="cfees-section-head">
        <div>
          <p>Analytical View</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="cfees-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="cfees-breakdown-card">
            <div className="cfees-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone={tone}>{money(item.amount, currencySymbol, currencyCode)}</Chip>
            </div>

            <div className="cfees-bar-track">
              <div style={{ width: `${percentage(item.amount, total)}%` }} />
            </div>

            <div className="cfees-chip-row">
              <Chip tone="gray">{item.count} item(s)</Chip>
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
  return <span className={`cfees-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cfees-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cfees-empty-card">
      <div className="cfees-empty-icon">💳</div>
      <h3>No fee data</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes cfeesSpin { to { transform: rotate(360deg); } }

.cfees-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--cfees-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 16px);
  overflow-x: hidden;
}

.cfees-page *,
.cfees-page *::before,
.cfees-page *::after {
  box-sizing: border-box;
}

.cfees-page button,
.cfees-page input,
.cfees-page select {
  font: inherit;
  max-width: 100%;
}

.cfees-page input,
.cfees-page select {
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

.cfees-page input:focus,
.cfees-page select:focus {
  border-color: var(--cfees-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--cfees-primary) 12%, transparent);
}

.cfees-state-card {
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

.cfees-state-card h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.cfees-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.cfees-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--cfees-primary) 18%, transparent);
  border-top-color: var(--cfees-primary);
  animation: cfeesSpin .8s linear infinite;
}

.cfees-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--cfees-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--cfees-primary) 7%, var(--card, #fff)) 72%);
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.cfees-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.cfees-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--cfees-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--cfees-primary) 28%, transparent);
  font-size: 22px;
}

.cfees-title-wrap {
  min-width: 0;
}

.cfees-title-wrap p,
.cfees-title-wrap h2,
.cfees-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfees-title-wrap p {
  margin: 0 0 2px;
  color: var(--cfees-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cfees-title-wrap h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.cfees-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.cfees-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.cfees-ghost-btn,
.cfees-table-btn,
.cfees-action-row button,
.cfees-pay-btn {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.cfees-ghost-btn,
.cfees-table-btn,
.cfees-action-row button {
  border: 1px solid var(--border, rgba(148,163,184,.24));
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
}

.cfees-action-row button.primary,
.cfees-pay-btn {
  border: 0;
  background: var(--cfees-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--cfees-primary) 26%, transparent);
}

.cfees-action-row button:disabled,
.cfees-pay-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.cfees-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.cfees-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cfees-primary) 10%, var(--card, var(--surface, #fff))), var(--card, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.cfees-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--cfees-primary);
  color: #fff;
  font-size: 20px;
}

.cfees-context-grid article > div:last-child {
  min-width: 0;
}

.cfees-context-grid span {
  display: block;
  color: var(--cfees-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cfees-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.cfees-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.cfees-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.cfees-summary-card,
.cfees-toolbar,
.cfees-filter-card,
.cfees-table-card,
.cfees-breakdown-card,
.cfees-child-card,
.cfees-card,
.cfees-empty-card {
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.cfees-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.cfees-summary-card.positive {
  background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card, var(--surface, #fff)));
}

.cfees-summary-card.warning {
  background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card, var(--surface, #fff)));
}

.cfees-summary-card.danger {
  background: linear-gradient(135deg, rgba(239,68,68,.10), var(--card, var(--surface, #fff)));
}

.cfees-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--cfees-primary) 12%, var(--surface, #fff));
}

.cfees-summary-card div:last-child {
  min-width: 0;
}

.cfees-summary-card strong,
.cfees-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfees-summary-card strong {
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.cfees-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.cfees-toolbar,
.cfees-filter-card,
.cfees-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.cfees-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cfees-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--cfees-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.cfees-view-tabs button {
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

.cfees-view-tabs button.active {
  background: var(--cfees-primary);
  color: #fff;
}

.cfees-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.cfees-section {
  margin-top: 16px;
}

.cfees-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.cfees-section-head p {
  margin: 0;
  color: var(--cfees-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cfees-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.cfees-list,
.cfees-breakdown-grid,
.cfees-child-grid {
  display: grid;
  gap: 10px;
}

.cfees-card,
.cfees-breakdown-card,
.cfees-child-card,
.cfees-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.cfees-card {
  background:
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--cfees-primary) 4%, var(--card, #fff)));
}

.cfees-card-top,
.cfees-child-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.cfees-card-icon,
.cfees-child-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--cfees-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.cfees-child-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cfees-card-main {
  min-width: 0;
  flex: 1;
}

.cfees-card-main h3,
.cfees-child-top strong {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.cfees-card-main p,
.cfees-child-top span {
  display: block;
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.cfees-chip-row,
.cfees-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.cfees-chip {
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

.cfees-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.cfees-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.cfees-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.cfees-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.cfees-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.cfees-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.cfees-mini-grid,
.cfees-statement-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.cfees-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.13));
  overflow: hidden;
}

.cfees-mini-stat strong,
.cfees-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfees-mini-stat strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.cfees-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.cfees-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.cfees-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfees-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.cfees-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--cfees-primary);
}

.cfees-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.cfees-table-scroll table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--card, var(--surface, #fff));
}

.cfees-table-scroll th,
.cfees-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(148,163,184,.16));
  text-align: left;
  vertical-align: top;
  color: var(--text, #0f172a);
  font-size: 13px;
}

.cfees-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--cfees-primary) 6%, var(--card, #fff));
}

.cfees-table-scroll td strong,
.cfees-table-scroll td span {
  display: block;
}

.cfees-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.cfees-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.cfees-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--cfees-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.cfees-empty-card h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.cfees-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.cfees-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.cfees-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.cfees-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 620px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.cfees-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--card, var(--surface, #fff));
}

.cfees-drawer-head div {
  min-width: 0;
}

.cfees-drawer-head p {
  margin: 0;
  color: var(--cfees-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cfees-drawer-head h2,
.cfees-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cfees-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.cfees-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.cfees-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 1000;
  cursor: pointer;
}

.cfees-drawer-section {
  margin-top: 16px;
}

.cfees-drawer-section h3 {
  margin: 0 0 10px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
}

.cfees-line-list {
  display: grid;
  gap: 7px;
}

.cfees-line-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.14));
}

.cfees-line-list span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.cfees-line-list strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.cfees-pay-btn {
  width: 100%;
  margin-top: 16px;
}


.cfees-checkout-layer {
  position: fixed;
  inset: 0;
  z-index: 95;
}

.cfees-checkout-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .58);
}

.cfees-checkout-modal {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(94vw, 620px);
  max-height: min(92dvh, 760px);
  transform: translate(-50%, -50%);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px;
  border-radius: 28px;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  border: 1px solid var(--border, rgba(148,163,184,.24));
  box-shadow: var(--shell-shadow, 0 28px 80px rgba(15,23,42,.28));
}

.cfees-checkout-head {
  position: sticky;
  top: -14px;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--card, var(--surface, #fff));
}

.cfees-checkout-head div {
  min-width: 0;
}

.cfees-checkout-head p {
  margin: 0;
  color: var(--cfees-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.cfees-checkout-head h2,
.cfees-checkout-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cfees-checkout-head h2 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 23px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.cfees-checkout-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.cfees-checkout-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 1000;
  cursor: pointer;
}

.cfees-checkout-amount {
  padding: 14px;
  border-radius: 22px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--cfees-primary) 18%, transparent), transparent 16rem),
    color-mix(in srgb, var(--cfees-primary) 8%, var(--card, #fff));
  border: 1px solid color-mix(in srgb, var(--cfees-primary) 20%, var(--border, rgba(148,163,184,.2)));
}

.cfees-checkout-amount span,
.cfees-checkout-amount small {
  display: block;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.cfees-checkout-amount strong {
  display: block;
  margin: 4px 0;
  color: var(--text, #0f172a);
  font-size: clamp(24px, 8vw, 36px);
  font-weight: 1000;
  letter-spacing: -.07em;
}

.cfees-checkout-section {
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--muted, #64748b) 7%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.16));
}

.cfees-checkout-section-head h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 15px;
  font-weight: 1000;
}

.cfees-checkout-section-head p {
  margin: 3px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.cfees-method-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.cfees-method-grid button {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.22));
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  cursor: pointer;
}

.cfees-method-grid button.active {
  border-color: var(--cfees-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--cfees-primary) 12%, transparent);
}

.cfees-method-grid button span {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--cfees-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 1000;
}

.cfees-method-grid button strong {
  min-width: 0;
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfees-checkout-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.cfees-checkout-field {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.cfees-checkout-field span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.cfees-checkout-alert {
  margin-top: 12px;
  padding: 11px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.5;
}

.cfees-checkout-alert.error {
  background: rgba(239,68,68,.12);
  color: #ef4444;
  border: 1px solid rgba(239,68,68,.18);
}

.cfees-checkout-alert.success {
  background: rgba(34,197,94,.12);
  color: #22c55e;
  border: 1px solid rgba(34,197,94,.18);
}

.cfees-checkout-submit {
  width: 100%;
  min-height: 46px;
  margin-top: 12px;
  border: 0;
  border-radius: 999px;
  background: var(--cfees-primary);
  color: #fff;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--cfees-primary) 26%, transparent);
}

.cfees-checkout-submit:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.cfees-checkout-footnote {
  margin: 10px 0 0;
  color: var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}


@media (min-width: 680px) {
  .cfees-page { padding: 12px; }
  .cfees-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cfees-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cfees-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .cfees-page { padding: 16px; }
  .cfees-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cfees-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .cfees-list,
  .cfees-breakdown-grid,
  .cfees-child-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .cfees-page { padding: 6px; }
  .cfees-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cfees-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .cfees-ghost-btn { width: 100%; }
  .cfees-summary-grid { gap: 6px; }
  .cfees-summary-card { padding: 10px; border-radius: 19px; }
  .cfees-summary-card strong { font-size: 16px; }
  .cfees-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .cfees-view-tabs { width: 100%; }
  .cfees-card,
  .cfees-empty-card,
  .cfees-breakdown-card,
  .cfees-child-card { border-radius: 20px; padding: 11px; }
  .cfees-card-icon,
  .cfees-child-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .cfees-mini-grid,
  .cfees-statement-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cfees-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cfees-action-row button { width: 100%; padding: 0 8px; }
  .cfees-drawer { width: min(96vw, 620px); padding: 12px; }
  .cfees-checkout-modal { width: min(96vw, 620px); border-radius: 22px; padding: 12px; }
  .cfees-method-grid { grid-template-columns: minmax(0, 1fr); }
}

`;
