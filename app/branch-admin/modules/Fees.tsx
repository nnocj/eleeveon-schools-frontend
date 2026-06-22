"use client";

/**
 * app/branch-admin/modules/Fees.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH FEES V1
 * ---------------------------------------------------------
 * Golden Standard Finance Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Purpose:
 * - Let a Branch Admin define fee structures for classes/terms.
 * - Automatically generate student fee invoices from those structures when saved.
 * - Manual invoice generation remains available for special cases.
 * - Track invoice items, balances, manual payments and parent/student payment readiness.
 * - Prepare clean invoice/payment data for future Parent and Student portal checkout screens.
 *
 * Enrollment authority fix:
 * - Class/term invoices are generated from studentEnrollments, not only Student.currentClassId.
 * - This means a student in Basic 1 Term 2 receives the invoice when their active
 *   enrollment matches feeStructure.classId + academicStructureId + academicPeriodId.
 * - Student.currentClassId is used only as a fallback when enrollment is missing.
 *
 * Student portal visibility fix:
 * - Fee structures are treated as class/term fee templates.
 * - The Student Fees page can now show applicable fee structures to enrolled students
 *   even before an invoice is generated, while invoices remain the payment source of truth.
 *
 * FINAL enrollment/status fix:
 * - Billing generation accepts active and promoted enrollments as billable.
 * - Saving a class/term fee structure now immediately creates payable
 *   StudentFeeInvoice rows for matching enrolled students.
 * - Completed enrollments remain visible to students for fee history, but this Branch Admin
 *   page does not generate fresh invoices for completed records by default.
 * - Deleted or inactive fee structures are intentionally not payable/visible as active fees.
 * - This file now includes an explicit version marker so the replacement size visibly changes.
 *
 * Golden UI behavior:
 * - no hero card
 * - compact search + inline add + slider filter + More sheet
 * - filters moved into a bottom sheet
 * - cards, table and analytics views
 * - actions live in sheets/drawers to save vertical space
 * - table headers use theme variables for dark/system mode readability
 *
 * Tables used:
 * - feeStructures
 * - studentFeeInvoices
 * - studentFeeInvoiceItems
 * - studentFeePayments
 * - students
 * - studentEnrollments
 * - classes
 * - academicStructures
 * - academicPeriods
 * - schoolCurrencySettings
 *
 * Sync behavior:
 * - createLocal(...) creates fee structures, invoices, invoice items and payments
 * - updateLocal(...) recalculates invoice balances/status after payment
 * - softDeleteLocal(...) archives fee structures/invoices/payment rows
 * - listActiveLocal(...) reads active branch-scoped rows
 * - no manual sync/version fields are written directly here
 *
 * Workspace source fix:
 * - Resolves school/branch from eleeveon_open_workspace first, then active
 *   membership, ActiveBranchContext, settings and storage fallback.
 * - This keeps Fees aligned with role switching and prevents empty finance
 *   selectors when the branch is selected through the role workspace session.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { createLocal, listActiveLocal, softDeleteLocal, updateLocal } from "../../lib/sync/syncUtils";

type AnyRow = Record<string, any>;

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

type ViewMode = "cards" | "table" | "analytics";
type ActiveSection = "fees" | "invoices" | "payments";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type StatusFilter = "all" | "draft" | "issued" | "part_paid" | "paid" | "overdue" | "cancelled";
type DrawerMode = "fee" | "invoice" | "payment";
type InvoiceTarget = "single_student" | "selected_class" | "matching_students";

type InvoiceRow = AnyRow & {
  amountPaid: number;
  balance: number;
  computedStatus: "issued" | "part_paid" | "paid" | "overdue";
};

type FeeForm = {
  id: number;
  classId: string;
  academicStructureId: string;
  academicPeriodId: string;
  itemName: string;
  itemAmount: string;
  items: { name: string; amount: number }[];
  currencyCode: string;
  currencySymbol: string;
};

type InvoiceForm = {
  studentId: string;
  classId: string;
  feeStructureId: string;
  invoiceTarget: InvoiceTarget;
  dueDate: string;
  discount: string;
  tax: string;
  note: string;
};

type PaymentForm = {
  invoiceId: string;
  amount: string;
  method: "cash" | "momo" | "bank" | "card" | "manual";
  provider: string;
  payerName: string;
  payerPhone: string;
  payerEmail: string;
  referenceNumber: string;
  receiptNumber: string;
  note: string;
  date: string;
};

const emptyFeeForm: FeeForm = {
  id: 0,
  classId: "all",
  academicStructureId: "",
  academicPeriodId: "",
  itemName: "",
  itemAmount: "",
  items: [],
  currencyCode: "GHS",
  currencySymbol: "₵",
};

const emptyInvoiceForm: InvoiceForm = {
  studentId: "",
  classId: "",
  feeStructureId: "",
  invoiceTarget: "single_student",
  dueDate: "",
  discount: "0",
  tax: "0",
  note: "",
};

const emptyPaymentForm: PaymentForm = {
  invoiceId: "",
  amount: "",
  method: "cash",
  provider: "manual",
  payerName: "",
  payerPhone: "",
  payerEmail: "",
  referenceNumber: "",
  receiptNumber: "",
  note: "",
  date: new Date().toISOString().slice(0, 10),
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

/**
 * Enrollment statuses that can receive newly generated fee invoices.
 * Your real data can have status="promoted", so billing must not be active-only.
 */
const BILLABLE_ENROLLMENT_STATUSES = new Set(["active", "promoted"]);

/**
 * Enrollment statuses that can remain visible in student fee history/context.
 * Branch billing uses BILLABLE_ENROLLMENT_STATUSES, while student read views may
 * also show completed records for history.
 */
const VISIBLE_ENROLLMENT_STATUSES = new Set(["active", "promoted", "completed"]);

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

function cleanText(value: any) {
  return String(value || "").trim();
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
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.invoiceNumber || row?.email, "Unnamed");
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

function invoiceStatus(total: number, paid: number, dueDate?: string): "issued" | "part_paid" | "paid" | "overdue" {
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "part_paid";
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return "overdue";
  return "issued";
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "succeeded"].includes(value)) return "green";
  if (["overdue", "failed", "cancelled"].includes(value)) return "red";
  if (["part_paid", "pending", "processing"].includes(value)) return "orange";
  if (["issued", "draft"].includes(value)) return "blue";
  return "gray";
}

function paymentTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "succeeded"].includes(value)) return "green";
  if (["failed", "cancelled", "reversed", "refunded"].includes(value)) return "red";
  if (["pending", "processing"].includes(value)) return "orange";
  return "blue";
}

function generateInvoiceNumber() {
  const part = Date.now().toString(36).toUpperCase().slice(-6);
  return `FEE-${part}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dueIn(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`bf-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="bf-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="bf-empty">
      <div>💳</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

// FEES_WORKFLOW_FIX_VERSION: auto-invoice-on-fee-save-v5
// Confirm this marker exists after replacement.
export default function FeesPage() {
  const router = useRouter();
  const { accountId: rawAccountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } = useActiveBranch() as any;
  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const accountId = useMemo(
    () =>
      cleanText(rawAccountId) ||
      cleanText(openWorkspace?.membership?.accountId) ||
      cleanText(activeMembership?.accountId) ||
      cleanText(settings?.accountId),
    [activeMembership?.accountId, openWorkspace?.membership?.accountId, rawAccountId, settings?.accountId]
  );

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

  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [activeSection, setActiveSection] = useState<ActiveSection>("fees");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<AnyRow | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [students, setStudents] = useState<AnyRow[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AnyRow[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AnyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<AnyRow[]>([]);
  const [feeStructures, setFeeStructures] = useState<AnyRow[]>([]);
  const [invoices, setInvoices] = useState<AnyRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [feeForm, setFeeForm] = useState<FeeForm>(emptyFeeForm);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);

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
      const [studentRows, enrollmentRows, classRows, structureRows, periodRows, currencyRows, feeRows, invoiceRows, itemRows, paymentRows] = await Promise.all([
        listActiveLocal<AnyRow>("students" as any),
        listActiveLocal<AnyRow>("studentEnrollments" as any),
        listActiveLocal<AnyRow>("classes" as any),
        listActiveLocal<AnyRow>("academicStructures" as any),
        listActiveLocal<AnyRow>("academicPeriods" as any),
        listActiveLocal<AnyRow>("schoolCurrencySettings" as any),
        listActiveLocal<AnyRow>("feeStructures" as any),
        listActiveLocal<AnyRow>("studentFeeInvoices" as any),
        listActiveLocal<AnyRow>("studentFeeInvoiceItems" as any),
        listActiveLocal<AnyRow>("studentFeePayments" as any),
      ]);

      setStudents(studentRows.filter((row) => sameScope(row, accountId, schoolId, branchId)).sort((a, b) => rowName(a).localeCompare(rowName(b))));
      setStudentEnrollments(
        enrollmentRows.filter(
          (row) =>
            sameScope(row, accountId, schoolId, branchId) &&
            BILLABLE_ENROLLMENT_STATUSES.has(String(row.status || "active").toLowerCase())
        )
      );
      setClasses(classRows.filter((row) => sameScope(row, accountId, schoolId, branchId)).sort((a, b) => rowName(a).localeCompare(rowName(b))));
      setAcademicStructures(structureRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setAcademicPeriods(periodRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setCurrencySettings(currencyRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setFeeStructures(feeRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setInvoices(invoiceRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setInvoiceItems(itemRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
      setPayments(paymentRows.filter((row) => sameScope(row, accountId, schoolId, branchId)));
    } catch (error) {
      console.error("Failed to load branch fees:", error);
      showToast("error", "Failed to load fees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading]);

  const currency = useMemo(() => {
    const preferred = currencySettings.find((row) => row.defaultForFees || row.active !== false) || currencySettings[0];
    return {
      code: text(preferred?.currencyCode || invoices[0]?.currencyCode || payments[0]?.currencyCode, "GHS"),
      symbol: text(preferred?.currencySymbol, "₵"),
      name: text(preferred?.currencyName, "Ghana Cedi"),
    };
  }, [currencySettings, invoices, payments]);

  const classMap = useMemo(() => new Map(classes.map((item) => [Number(idOf(item)), rowName(item)])), [classes]);
  const studentMap = useMemo(() => new Map(students.map((item) => [Number(idOf(item)), rowName(item)])), [students]);

  const studentById = useMemo(() => new Map(students.map((student) => [Number(idOf(student)), student])), [students]);

  const enrollmentByStudentId = useMemo(() => {
    const map = new Map<number, AnyRow[]>();
    studentEnrollments.forEach((enrollment) => {
      const studentId = cleanId(enrollment.studentId);
      if (!studentId) return;
      const list = map.get(studentId) || [];
      list.push(enrollment);
      map.set(studentId, list);
    });
    return map;
  }, [studentEnrollments]);


  const invoiceRows = useMemo<InvoiceRow[]>(() => {
    const q = query.toLowerCase().trim();
    return invoices
      .map((invoice) => {
        const paidFromRows = payments
          .filter((payment) => Number(payment.invoiceId || 0) === Number(idOf(invoice)))
          .filter((payment) => ["paid", "success", "succeeded"].includes(String(payment.status || "paid").toLowerCase()))
          .reduce((sum, payment) => sum + n(payment.amount), 0);
        const amountPaid = Math.max(n(invoice.amountPaid), paidFromRows);
        const total = n(invoice.total);
        const balance = Math.max(0, total - amountPaid);
        const computedStatus = invoiceStatus(total, amountPaid, invoice.dueDate);
        return { ...(invoice as AnyRow), amountPaid, balance, computedStatus } as InvoiceRow;
      })
      .filter((invoice) => status === "all" || String(invoice.status || invoice.computedStatus || "issued") === status || invoice.computedStatus === status)
      .filter((invoice) => classFilter === "all" || String(invoice.classId || "") === classFilter)
      .filter((invoice) => {
        if (!q) return true;
        return [invoice.invoiceNumber, studentMap.get(Number(invoice.studentId)), classMap.get(Number(invoice.classId)), invoice.status, invoice.note]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.updatedAt || b.issueDate || b.createdAt) - n(a.updatedAt || a.issueDate || a.createdAt));
  }, [classFilter, classMap, invoices, payments, query, status, studentMap]);

  const filteredFeeStructures = useMemo(() => {
    const q = query.toLowerCase().trim();
    return feeStructures
      .filter((row) => classFilter === "all" || String(row.classId || "all") === classFilter)
      .filter((row) => {
        if (!q) return true;
        return [classMap.get(Number(row.classId)) || "All classes", (row.items || []).map((item: any) => item.name).join(" ")].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt));
  }, [classFilter, classMap, feeStructures, query]);

  const filteredPayments = useMemo(() => {
    const q = query.toLowerCase().trim();
    return payments
      .filter((payment) => {
        const invoice = invoices.find((row) => Number(idOf(row)) === Number(payment.invoiceId || 0));
        if (classFilter !== "all" && String(invoice?.classId || "") !== classFilter) return false;
        if (!q) return true;
        return [
          payment.receiptNumber,
          payment.referenceNumber,
          payment.payerName,
          payment.payerPhone,
          payment.method,
          payment.status,
          studentMap.get(Number(payment.studentId)),
          invoice?.invoiceNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => n(b.paidAt || b.date || b.createdAt) - n(a.paidAt || a.date || a.createdAt));
  }, [classFilter, invoices, payments, query, studentMap]);

  const summary = useMemo(() => {
    const total = invoiceRows.reduce((sum, invoice) => sum + n(invoice.total), 0);
    const paid = invoiceRows.reduce((sum, invoice) => sum + n(invoice.amountPaid), 0);
    const balance = invoiceRows.reduce((sum, invoice) => sum + n(invoice.balance), 0);
    return {
      invoices: invoiceRows.length,
      allInvoices: invoices.length,
      feeStructures: feeStructures.length,
      payments: payments.length,
      students: students.length,
      total,
      paid,
      balance,
      paidInvoices: invoiceRows.filter((row) => String(row.computedStatus || row.status) === "paid").length,
      overdue: invoiceRows.filter((row) => String(row.computedStatus || row.status) === "overdue").length,
      partPaid: invoiceRows.filter((row) => String(row.computedStatus || row.status) === "part_paid").length,
    };
  }, [feeStructures.length, invoiceRows, invoices.length, payments.length, students.length]);

  const activeFilterCount = useMemo(() => [status !== "all", classFilter !== "all"].filter(Boolean).length, [classFilter, status]);

  const selectedInvoiceItems = useMemo(() => {
    const id = cleanId(idOf(selectedInvoice));
    return invoiceItems.filter((item) => Number(item.invoiceId) === Number(id)).sort((a, b) => n(a.order) - n(b.order));
  }, [invoiceItems, selectedInvoice]);

  const selectedInvoicePayments = useMemo(() => {
    const id = cleanId(idOf(selectedInvoice));
    return payments.filter((item) => Number(item.invoiceId) === Number(id)).sort((a, b) => n(b.paidAt || b.date || b.createdAt) - n(a.paidAt || a.date || a.createdAt));
  }, [payments, selectedInvoice]);

  function openFeeDrawer(existing?: AnyRow) {
    const preferred = currency;
    setMessage("");
    setFeeForm(
      existing
        ? {
            id: cleanId(idOf(existing)),
            classId: existing.classId ? String(existing.classId) : "all",
            academicStructureId: existing.academicStructureId ? String(existing.academicStructureId) : "",
            academicPeriodId: existing.academicPeriodId ? String(existing.academicPeriodId) : "",
            itemName: "",
            itemAmount: "",
            items: Array.isArray(existing.items) ? existing.items : [],
            currencyCode: text(existing.currencyCode, preferred.code),
            currencySymbol: text(existing.currencySymbol, preferred.symbol),
          }
        : { ...emptyFeeForm, currencyCode: preferred.code, currencySymbol: preferred.symbol }
    );
    setDrawer("fee");
  }

  function openInvoiceDrawer(fee?: AnyRow) {
    setMessage("");
    setInvoiceForm({
      ...emptyInvoiceForm,
      classId: fee?.classId ? String(fee.classId) : "",
      feeStructureId: fee ? String(idOf(fee)) : "",
      dueDate: dueIn(14),
    });
    setDrawer("invoice");
  }

  function openPaymentDrawer(invoice?: AnyRow) {
    const invoiceId = invoice ? String(idOf(invoice)) : "";
    const balance = invoice ? n((invoice as any).balance ?? invoice.balance ?? Math.max(0, n(invoice.total) - n(invoice.amountPaid))) : 0;
    setMessage("");
    setPaymentForm({ ...emptyPaymentForm, invoiceId, amount: balance ? String(balance) : "", date: today() });
    setDrawer("payment");
  }

  function addFeeItem() {
    const name = feeForm.itemName.trim();
    const amount = n(feeForm.itemAmount);
    if (!name || amount <= 0) {
      setMessage("Enter a fee item name and amount.");
      return;
    }
    setFeeForm((current) => ({ ...current, items: [...current.items, { name, amount }], itemName: "", itemAmount: "" }));
    setMessage("");
  }

  function removeFeeItem(index: number) {
    setFeeForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function createInvoicesForFeeStructure(fee: AnyRow, feeStructureId: number, options?: { silent?: boolean }) {
    if (!accountId || !schoolId || !branchId || !feeStructureId) return 0;

    const items = Array.isArray(fee.items) ? fee.items : [];
    const subtotal = items.reduce((sum: number, item: any) => sum + n(item.amount), 0);
    const total = Math.max(0, subtotal);
    const feeClassId = cleanId(fee.classId);
    const feeAcademicStructureId = cleanId(fee.academicStructureId);
    const feeAcademicPeriodId = cleanId(fee.academicPeriodId);

    if (!items.length || total <= 0 || !feeAcademicStructureId || !feeAcademicPeriodId) return 0;

    const isActiveStudent = (student?: AnyRow | null) =>
      !!student && student.isDeleted !== true && !["withdrawn", "graduated", "transferred"].includes(String(student.status || "active").toLowerCase());

    const enrollmentMatches = (enrollment: AnyRow) => {
      if (!enrollment || enrollment.isDeleted === true) return false;
      if (!BILLABLE_ENROLLMENT_STATUSES.has(String(enrollment.status || "active").toLowerCase())) return false;
      if (feeClassId && Number(enrollment.classId || 0) !== Number(feeClassId)) return false;
      if (feeAcademicStructureId && Number(enrollment.academicStructureId || 0) !== Number(feeAcademicStructureId)) return false;
      if (feeAcademicPeriodId && Number(enrollment.academicPeriodId || 0) !== Number(feeAcademicPeriodId)) return false;
      return true;
    };

    const studentMatchesFallback = (student: AnyRow) => {
      if (feeClassId && Number(student.currentClassId || student.classId || 0) !== Number(feeClassId)) return false;
      return true;
    };

    const matchingEnrollmentRows = studentEnrollments.filter(enrollmentMatches);
    const enrolledStudents = matchingEnrollmentRows
      .map((enrollment) => studentById.get(Number(enrollment.studentId || 0)))
      .filter(Boolean) as AnyRow[];

    // Fallback only protects old data where enrollment rows were not created yet.
    const fallbackStudents = !matchingEnrollmentRows.length ? students.filter(studentMatchesFallback) : [];

    const seen = new Set<number>();
    const targetStudents = [...enrolledStudents, ...fallbackStudents]
      .filter(isActiveStudent)
      .filter((student) => {
        const studentId = cleanId(idOf(student));
        if (!studentId || seen.has(studentId)) return false;
        seen.add(studentId);
        return true;
      });

    if (!targetStudents.length) return 0;

    const alreadyHasInvoice = (studentId: number) =>
      invoices.some((invoice) => {
        const sameStudent = Number(invoice.studentId || 0) === Number(studentId);
        const sameFee = Number(invoice.feeStructureId || 0) === Number(feeStructureId);
        const samePeriod = Number(invoice.academicPeriodId || 0) === Number(feeAcademicPeriodId);
        const stillActive = invoice.isDeleted !== true && !["cancelled", "void"].includes(String(invoice.status || "").toLowerCase());
        return sameStudent && sameFee && samePeriod && stillActive;
      });

    const studentsToInvoice = targetStudents.filter((student) => !alreadyHasInvoice(cleanId(idOf(student))));

    if (!studentsToInvoice.length) return 0;

    let createdCount = 0;

    for (let studentIndex = 0; studentIndex < studentsToInvoice.length; studentIndex += 1) {
      const student = studentsToInvoice[studentIndex];
      const studentId = cleanId(idOf(student));
      const matchedEnrollment =
        (enrollmentByStudentId.get(studentId) || []).find(enrollmentMatches);

      const classId = cleanId(matchedEnrollment?.classId) || feeClassId || cleanId(student.currentClassId || student.classId);

      const createdInvoice = (await createLocal("studentFeeInvoices" as any, {
        accountId: String(accountId),
        schoolId,
        branchId,
        studentId,
        classId: classId || undefined,
        feeStructureId,
        academicStructureId: feeAcademicStructureId,
        academicPeriodId: feeAcademicPeriodId,
        enrollmentId: cleanId(idOf(matchedEnrollment)) || undefined,
        invoiceNumber: `${generateInvoiceNumber()}-${studentIndex + 1}`,
        subtotal,
        discount: 0,
        tax: 0,
        total,
        amountPaid: 0,
        balance: total,
        status: "issued",
        issueDate: today(),
        dueDate: dueIn(14),
        note: "Auto-generated when Branch Admin saved the fee structure.",
        currencyCode: fee.currencyCode || currency.code,
        currencySymbol: fee.currencySymbol || currency.symbol,
        active: true,
        isDeleted: false,
      } as AnyRow)) as AnyRow | undefined;

      const invoiceId = cleanId(idOf(createdInvoice));
      if (!invoiceId) throw new Error("Invoice was created but its local id could not be resolved.");

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await createLocal("studentFeeInvoiceItems" as any, {
          accountId: String(accountId),
          schoolId,
          branchId,
          invoiceId,
          feeStructureId,
          name: text(item.name, `Fee Item ${index + 1}`),
          quantity: 1,
          unitAmount: n(item.amount),
          amount: n(item.amount),
          required: true,
          order: index + 1,
          currencyCode: fee.currencyCode || currency.code,
          currencySymbol: fee.currencySymbol || currency.symbol,
          active: true,
          isDeleted: false,
        } as AnyRow);
      }

      createdCount += 1;
    }

    if (!options?.silent && createdCount) {
      showToast("success", createdCount === 1 ? "Fee saved and 1 invoice was created." : `Fee saved and ${createdCount} invoices were created.`);
    }

    return createdCount;
  }

  async function saveFeeStructure() {
    if (!accountId || !schoolId || !branchId) return setMessage("Select a school and branch before saving fees.");
    if (!feeForm.academicStructureId || !feeForm.academicPeriodId) return setMessage("Select academic structure and period.");
    if (!feeForm.items.length) return setMessage("Add at least one fee item.");

    setSaving(true);
    try {
      const payload: AnyRow = {
        accountId: String(accountId),
        schoolId,
        branchId,
        classId: feeForm.classId === "all" ? undefined : Number(feeForm.classId),
        academicStructureId: Number(feeForm.academicStructureId),
        academicPeriodId: Number(feeForm.academicPeriodId),
        items: feeForm.items,
        currencyCode: feeForm.currencyCode || currency.code,
        currencySymbol: feeForm.currencySymbol || currency.symbol,
        active: true,
        isDeleted: false,
      };

      const savedFee = feeForm.id
        ? ((await updateLocal("feeStructures" as any, feeForm.id, payload)) as AnyRow | undefined)
        : ((await createLocal("feeStructures" as any, payload)) as AnyRow | undefined);

      const feeStructureId = feeForm.id || cleanId(idOf(savedFee));
      const invoiceCount = await createInvoicesForFeeStructure({ ...payload, id: feeStructureId }, feeStructureId, { silent: true });

      setDrawer(null);
      setActiveSection(invoiceCount ? "invoices" : "fees");
      showToast(
        "success",
        invoiceCount
          ? feeForm.id
            ? `Fee structure updated. ${invoiceCount} new invoice(s) generated for students without invoices.`
            : `Fee structure saved. ${invoiceCount} payable student invoice(s) generated.`
          : feeForm.id
            ? "Fee structure updated. No new matching student needed an invoice."
            : "Fee structure saved. No enrolled student matched yet."
      );
      await load();
    } catch (error: any) {
      console.error("Failed to save fee structure:", error);
      showToast("error", error?.message || "Failed to save fee structure.");
    } finally {
      setSaving(false);
    }
  }

  async function generateInvoice() {
    if (!accountId || !schoolId || !branchId) return setMessage("Select a school and branch before generating invoices.");

    const feeStructureId = cleanId(invoiceForm.feeStructureId);
    const fee = feeStructures.find((row) => Number(idOf(row)) === feeStructureId);
    if (!fee) return setMessage("Select a fee structure.");

    const items = Array.isArray(fee.items) ? fee.items : [];
    const subtotal = items.reduce((sum: number, item: any) => sum + n(item.amount), 0);
    const discount = n(invoiceForm.discount);
    const tax = n(invoiceForm.tax);
    const total = Math.max(0, subtotal - discount + tax);

    const feeClassId = cleanId(fee.classId);
    const feeAcademicStructureId = cleanId(fee.academicStructureId);
    const feeAcademicPeriodId = cleanId(fee.academicPeriodId);
    const selectedClassId = cleanId(invoiceForm.classId) || feeClassId;
    const target = invoiceForm.invoiceTarget || "single_student";

    if (!items.length || total <= 0) return setMessage("Selected fee structure has no payable items.");
    if (!feeAcademicStructureId || !feeAcademicPeriodId) return setMessage("Selected fee structure needs academic structure and period.");

    const isActiveStudent = (student?: AnyRow | null) =>
      !!student && student.isDeleted !== true && !["withdrawn", "graduated", "transferred"].includes(String(student.status || "active").toLowerCase());

    const enrollmentMatches = (enrollment: AnyRow, classId?: number) => {
      if (!enrollment || enrollment.isDeleted === true) return false;
      if (!BILLABLE_ENROLLMENT_STATUSES.has(String(enrollment.status || "active").toLowerCase())) return false;
      if (classId && Number(enrollment.classId || 0) !== Number(classId)) return false;
      if (feeAcademicStructureId && Number(enrollment.academicStructureId || 0) !== Number(feeAcademicStructureId)) return false;
      if (feeAcademicPeriodId && Number(enrollment.academicPeriodId || 0) !== Number(feeAcademicPeriodId)) return false;
      return true;
    };

    const studentMatchesClassFallback = (student: AnyRow, classId?: number) => {
      if (!classId) return true;
      return Number(student.currentClassId || student.classId || 0) === Number(classId);
    };

    const uniqueStudents = (rows: AnyRow[]) => {
      const seen = new Set<number>();
      return rows.filter((student) => {
        const studentId = cleanId(idOf(student));
        if (!studentId || seen.has(studentId)) return false;
        seen.add(studentId);
        return true;
      });
    };

    let targetStudents: AnyRow[] = [];

    if (target === "single_student") {
      const studentId = cleanId(invoiceForm.studentId);
      if (!studentId) return setMessage("Select a student or change the target to class/all matching students.");

      const student = students.find((row) => Number(idOf(row)) === Number(studentId));
      if (!student) return setMessage("Selected student could not be found.");

      const enrollments = enrollmentByStudentId.get(studentId) || [];
      const hasMatchingEnrollment = enrollments.some((enrollment) => enrollmentMatches(enrollment, selectedClassId || feeClassId));
      const hasClassFallback = studentMatchesClassFallback(student, selectedClassId || feeClassId);

      if (!hasMatchingEnrollment && !hasClassFallback) {
        return setMessage("Selected student is not enrolled in the fee structure class/term.");
      }

      targetStudents = [student];
    }

    if (target === "selected_class" || target === "matching_students") {
      const targetClassId = target === "selected_class" ? selectedClassId : feeClassId;

      if (target === "selected_class" && !targetClassId) return setMessage("Select a class before generating class invoices.");

      const matchingEnrollmentRows = studentEnrollments.filter((enrollment) => enrollmentMatches(enrollment, targetClassId));
      const enrolledStudents = matchingEnrollmentRows
        .map((enrollment) => studentById.get(Number(enrollment.studentId || 0)))
        .filter(Boolean) as AnyRow[];

      const fallbackStudents = !matchingEnrollmentRows.length
        ? students.filter((student) => studentMatchesClassFallback(student, targetClassId))
        : [];

      targetStudents = uniqueStudents([...enrolledStudents, ...fallbackStudents]);
    }

    targetStudents = uniqueStudents(targetStudents).filter(isActiveStudent);

    if (!targetStudents.length) {
      return setMessage("No active/promoted enrolled students match this fee structure class, academic structure and period.");
    }

    const alreadyHasInvoice = (studentId: number) =>
      invoices.some((invoice) => {
        const sameStudent = Number(invoice.studentId || 0) === Number(studentId);
        const sameFee = Number(invoice.feeStructureId || 0) === Number(feeStructureId);
        const samePeriod = Number(invoice.academicPeriodId || 0) === Number(feeAcademicPeriodId);
        const stillActive = invoice.isDeleted !== true && !["cancelled", "void"].includes(String(invoice.status || "").toLowerCase());
        return sameStudent && sameFee && samePeriod && stillActive;
      });

    const studentsToInvoice = targetStudents.filter((student) => !alreadyHasInvoice(cleanId(idOf(student))));

    if (!studentsToInvoice.length) return setMessage("Matching enrolled students already have invoices for this fee structure and period.");

    setSaving(true);
    try {
      let createdCount = 0;

      for (let studentIndex = 0; studentIndex < studentsToInvoice.length; studentIndex += 1) {
        const student = studentsToInvoice[studentIndex];
        const studentId = cleanId(idOf(student));
        const matchedEnrollment =
          (enrollmentByStudentId.get(studentId) || []).find((enrollment) => enrollmentMatches(enrollment, selectedClassId || feeClassId)) ||
          (enrollmentByStudentId.get(studentId) || []).find((enrollment) => enrollmentMatches(enrollment));

        const classId = cleanId(matchedEnrollment?.classId) || selectedClassId || feeClassId || cleanId(student.currentClassId || student.classId);

        const createdInvoice = (await createLocal("studentFeeInvoices" as any, {
          accountId: String(accountId),
          schoolId,
          branchId,
          studentId,
          classId: classId || undefined,
          feeStructureId,
          academicStructureId: feeAcademicStructureId,
          academicPeriodId: feeAcademicPeriodId,
          enrollmentId: cleanId(idOf(matchedEnrollment)) || undefined,
          invoiceNumber: `${generateInvoiceNumber()}-${studentIndex + 1}`,
          subtotal,
          discount,
          tax,
          total,
          amountPaid: 0,
          balance: total,
          status: "issued",
          issueDate: today(),
          dueDate: invoiceForm.dueDate || dueIn(14),
          note: invoiceForm.note,
          currencyCode: fee.currencyCode || currency.code,
          currencySymbol: fee.currencySymbol || currency.symbol,
          active: true,
          isDeleted: false,
        } as AnyRow)) as AnyRow | undefined;

        const invoiceId = cleanId(idOf(createdInvoice));
        if (!invoiceId) throw new Error("Invoice was created but its local id could not be resolved.");

        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          await createLocal("studentFeeInvoiceItems" as any, {
            accountId: String(accountId),
            schoolId,
            branchId,
            invoiceId,
            feeStructureId,
            name: text(item.name, `Fee Item ${index + 1}`),
            quantity: 1,
            unitAmount: n(item.amount),
            amount: n(item.amount),
            required: true,
            order: index + 1,
            currencyCode: fee.currencyCode || currency.code,
            currencySymbol: fee.currencySymbol || currency.symbol,
            active: true,
            isDeleted: false,
          } as AnyRow);
        }

        createdCount += 1;
      }

      setDrawer(null);
      setActiveSection("invoices");
      showToast("success", createdCount === 1 ? "Student invoice generated from enrollment." : `${createdCount} enrollment-based student invoices generated.`);
      await load();
    } catch (error: any) {
      console.error("Failed to generate invoice:", error);
      showToast("error", error?.message || "Failed to generate invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!accountId || !schoolId || !branchId) return setMessage("Select a school and branch before recording payment.");
    const invoiceId = cleanId(paymentForm.invoiceId);
    const invoice = (invoiceRows.find((row) => Number(idOf(row)) === invoiceId) || invoices.find((row) => Number(idOf(row)) === invoiceId)) as InvoiceRow | AnyRow | undefined;
    const amount = n(paymentForm.amount);

    if (!invoice) return setMessage("Select a valid invoice.");
    if (amount <= 0) return setMessage("Enter a payment amount.");

    const previousPaid = n((invoice as any).amountPaid);
    const total = n(invoice.total);
    const newPaid = Math.min(total, previousPaid + amount);
    const balance = Math.max(0, total - newPaid);
    const nextStatus = invoiceStatus(total, newPaid, invoice.dueDate);

    setSaving(true);
    try {
      await createLocal("studentFeePayments" as any, {
        accountId: String(accountId),
        schoolId,
        branchId,
        invoiceId,
        studentId: cleanId(invoice.studentId),
        amount,
        method: paymentForm.method,
        provider: paymentForm.provider || "manual",
        status: "paid",
        receiptNumber: paymentForm.receiptNumber || `RCPT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        referenceNumber: paymentForm.referenceNumber,
        payerName: paymentForm.payerName,
        payerPhone: paymentForm.payerPhone,
        payerEmail: paymentForm.payerEmail,
        date: paymentForm.date || today(),
        paidAt: paymentForm.date || today(),
        note: paymentForm.note,
        currencyCode: invoice.currencyCode || currency.code,
        currencySymbol: invoice.currencySymbol || currency.symbol,
        active: true,
        isDeleted: false,
      } as AnyRow);

      await updateLocal("studentFeeInvoices" as any, invoiceId, {
        amountPaid: newPaid,
        balance,
        status: nextStatus,
        paidAt: nextStatus === "paid" ? paymentForm.date || today() : invoice.paidAt,
      } as AnyRow);

      setDrawer(null);
      showToast("success", "Payment recorded and invoice balance updated.");
      await load();
    } catch (error: any) {
      console.error("Failed to record payment:", error);
      showToast("error", error?.message || "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvoice(invoice: AnyRow) {
    const id = cleanId(idOf(invoice));
    if (!id) return;
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber || "record"}?`)) return;
    try {
      await softDeleteLocal("studentFeeInvoices" as any, id);
      for (const item of invoiceItems.filter((row) => Number(row.invoiceId) === id)) {
        const itemId = cleanId(idOf(item));
        if (itemId) await softDeleteLocal("studentFeeInvoiceItems" as any, itemId);
      }
      showToast("success", "Invoice deleted.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete invoice.");
    }
  }

  async function deleteFeeStructure(fee: AnyRow) {
    const id = cleanId(idOf(fee));
    if (!id) return;
    if (!window.confirm("Delete this fee structure? Existing invoices will remain.")) return;
    try {
      await softDeleteLocal("feeStructures" as any, id);
      showToast("success", "Fee structure deleted.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete fee structure.");
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening fees..." text="Loading branch fee structures, invoices and payments." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before managing branch fees." />;
  }

  if (!schoolId || !branchId) {
    return <State primary={primary} title="Select branch context" text="Fees are branch-scoped. Choose an active school and branch before continuing." />;
  }

  return (
    <main className="bf-page" style={{ "--bf-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`bf-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="bf-search-card" aria-label="Fees search and actions">
        <span className={`status-dot-mini ${summary.overdue ? "orange" : summary.invoices ? "green" : "gray"}`} title={`${summary.invoices} invoice(s)`} />

        <label className="bf-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeSection === "fees" ? "Search fee structures..." : activeSection === "payments" ? "Search payments..." : "Search invoices..."} aria-label="Search fees" />
        </label>

        <button type="button" className="bf-add-inline" onClick={() => activeSection === "fees" ? openFeeDrawer() : activeSection === "payments" ? openPaymentDrawer() : openInvoiceDrawer()} aria-label="Create finance record">+</button>

        <button type="button" className={`bf-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="bf-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {(status !== "all" || classFilter !== "all" || query.trim()) && (
        <section className="bf-filter-chips" aria-label="Active filters">
          {status !== "all" && <button type="button" onClick={() => setStatus("all")}>Status: {status.replaceAll("_", " ")} ×</button>}
          {classFilter !== "all" && <button type="button" onClick={() => setClassFilter("all")}>Class: {classMap.get(Number(classFilter)) || classFilter} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      <section className="bf-section-tabs" aria-label="Finance sections">
        <button type="button" className={activeSection === "fees" ? "active" : ""} onClick={() => setActiveSection("fees")}>💳 Fee Structures <b>{filteredFeeStructures.length}</b></button>
        <button type="button" className={activeSection === "invoices" ? "active" : ""} onClick={() => setActiveSection("invoices")}>🧾 Invoices <b>{invoiceRows.length}</b></button>
        <button type="button" className={activeSection === "payments" ? "active" : ""} onClick={() => setActiveSection("payments")}>💰 Payments <b>{filteredPayments.length}</b></button>
      </section>

      {view === "analytics" && <AnalyticsView summary={summary} currency={currency.code} invoices={invoiceRows} feeStructures={feeStructures} payments={payments} />}

      {view === "table" && activeSection === "fees" && <FeeStructureTable rows={filteredFeeStructures} classMap={classMap} currency={currency.code} openInvoiceDrawer={openInvoiceDrawer} openFeeDrawer={openFeeDrawer} deleteFeeStructure={deleteFeeStructure} />}

      {view === "table" && activeSection === "invoices" && <TableView rows={invoiceRows} studentMap={studentMap} classMap={classMap} currency={currency.code} openPaymentDrawer={openPaymentDrawer} setSelectedInvoice={setSelectedInvoice} deleteInvoice={deleteInvoice} />}

      {view === "table" && activeSection === "payments" && <PaymentTable rows={filteredPayments} invoices={invoiceRows} studentMap={studentMap} currency={currency.code} />}

      {view === "cards" && activeSection === "fees" && (
        <section className="bf-list finance-grid">
          {filteredFeeStructures.map((fee) => (
            <article key={String(idOf(fee))} className="fee-row">
              <span>💳</span>
              <b>{fee.classId ? classMap.get(Number(fee.classId)) || "Class fees" : "All classes"}</b>
              <small>{(fee.items || []).length} item(s) · {money((fee.items || []).reduce((sum: number, item: any) => sum + n(item.amount), 0), fee.currencyCode || currency.code)}</small>
              <div>
                <button type="button" onClick={() => openInvoiceDrawer(fee)}>Invoice</button>
                <button type="button" onClick={() => openFeeDrawer(fee)}>Edit</button>
                <button type="button" className="danger" onClick={() => deleteFeeStructure(fee)}>Delete</button>
              </div>
            </article>
          ))}
          {!filteredFeeStructures.length && <Empty title="No fee structures found" text="Tap + to create the branch fee structure for a class, term or all classes." />}
        </section>
      )}

      {view === "cards" && activeSection === "invoices" && (
        <section className="bf-list finance-grid">
          {invoiceRows.map((invoice) => (
            <InvoiceCard
              key={String(idOf(invoice))}
              invoice={invoice}
              studentName={studentMap.get(Number(invoice.studentId)) || "Unknown student"}
              className={classMap.get(Number(invoice.classId)) || "No class"}
              currency={invoice.currencyCode || currency.code}
              openPaymentDrawer={openPaymentDrawer}
              setSelectedInvoice={setSelectedInvoice}
              deleteInvoice={deleteInvoice}
            />
          ))}
          {!invoiceRows.length && <Empty title="No invoices found" text="Switch to Fee Structures, create fees, then generate student invoices." />}
        </section>
      )}

      {view === "cards" && activeSection === "payments" && (
        <section className="bf-list finance-grid">
          {filteredPayments.map((payment) => {
            const invoice = invoiceRows.find((row) => Number(idOf(row)) === Number(payment.invoiceId || 0));
            return <PaymentCard key={String(idOf(payment))} payment={payment} invoice={invoice} studentName={studentMap.get(Number(payment.studentId)) || "Unknown student"} currency={payment.currencyCode || currency.code} />;
          })}
          {!filteredPayments.length && <Empty title="No payments found" text="Tap + to record a cash, momo, bank, card or manual fee payment." />}
        </section>
      )}

      {filterOpen && <FilterSheet status={status} setStatus={setStatus} classFilter={classFilter} setClassFilter={setClassFilter} classes={classes} onClose={() => setFilterOpen(false)} />}

      {moreOpen && <MoreSheet view={view} setView={(mode) => { setView(mode); setMoreOpen(false); }} summary={summary} onRefresh={async () => { setMoreOpen(false); await load(); }} onFee={() => { setMoreOpen(false); openFeeDrawer(); }} onPayment={() => { setMoreOpen(false); openPaymentDrawer(); }} onClose={() => setMoreOpen(false)} />}

      {drawer === "fee" && <FeeDrawer form={feeForm} setForm={setFeeForm} classes={classes} academicStructures={academicStructures} academicPeriods={academicPeriods} message={message} saving={saving} addFeeItem={addFeeItem} removeFeeItem={removeFeeItem} save={saveFeeStructure} close={() => setDrawer(null)} />}

      {drawer === "invoice" && <InvoiceDrawer form={invoiceForm} setForm={setInvoiceForm} students={students} classes={classes} feeStructures={feeStructures} classMap={classMap} currency={currency.code} message={message} saving={saving} generate={generateInvoice} close={() => setDrawer(null)} />}

      {drawer === "payment" && <PaymentDrawer form={paymentForm} setForm={setPaymentForm} invoices={invoiceRows} studentMap={studentMap} currency={currency.code} message={message} saving={saving} record={recordPayment} close={() => setDrawer(null)} />}

      {selectedInvoice && <InvoiceSheet invoice={selectedInvoice} studentName={studentMap.get(Number(selectedInvoice.studentId)) || "Unknown student"} className={classMap.get(Number(selectedInvoice.classId)) || "No class"} items={selectedInvoiceItems} payments={selectedInvoicePayments} currency={selectedInvoice.currencyCode || currency.code} openPaymentDrawer={openPaymentDrawer} close={() => setSelectedInvoice(null)} />}
    </main>
  );
}

function State({ primary, title, text: body }: { primary: string; title: string; text: string }) {
  return (
    <main className="bf-page" style={{ "--bf-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="bf-state">
        <div className="bf-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function InvoiceCard({ invoice, studentName, className, currency, openPaymentDrawer, setSelectedInvoice, deleteInvoice }: { invoice: AnyRow; studentName: string; className: string; currency: string; openPaymentDrawer: (invoice: AnyRow) => void; setSelectedInvoice: (invoice: AnyRow) => void; deleteInvoice: (invoice: AnyRow) => void }) {
  const status = invoice.computedStatus || invoice.status || "issued";
  return (
    <article className="invoice-row">
      <span className="invoice-avatar">🧾</span>
      <span className="invoice-main">
        <strong>{studentName}</strong>
        <small>{invoice.invoiceNumber || "Invoice"} · {className}</small>
        <em>{money(invoice.balance, currency)} balance · due {dateLabel(invoice.dueDate)}</em>
      </span>
      <span className="invoice-side">
        <Chip tone={statusTone(status)}>{String(status).replaceAll("_", " ")}</Chip>
        <button type="button" onClick={() => setSelectedInvoice(invoice)}>View</button>
        <button type="button" onClick={() => openPaymentDrawer(invoice)}>Pay</button>
        <button type="button" className="danger" onClick={() => deleteInvoice(invoice)}>⌫</button>
      </span>
    </article>
  );
}

function PaymentCard({ payment, invoice, studentName, currency }: { payment: AnyRow; invoice?: AnyRow; studentName: string; currency: string }) {
  return (
    <article className="payment-row">
      <span className="invoice-avatar">💰</span>
      <span className="invoice-main">
        <strong>{studentName}</strong>
        <small>{payment.receiptNumber || payment.referenceNumber || "Payment"} · {invoice?.invoiceNumber || "Manual record"}</small>
        <em>{money(payment.amount, currency)} · {payment.method || "manual"} · {dateLabel(payment.paidAt || payment.date)}</em>
      </span>
      <span className="invoice-side">
        <Chip tone={paymentTone(payment.status)}>{payment.status || "paid"}</Chip>
      </span>
    </article>
  );
}

function FeeStructureTable({ rows, classMap, currency, openInvoiceDrawer, openFeeDrawer, deleteFeeStructure }: { rows: AnyRow[]; classMap: Map<number, string>; currency: string; openInvoiceDrawer: (fee?: AnyRow) => void; openFeeDrawer: (fee?: AnyRow) => void; deleteFeeStructure: (fee: AnyRow) => void }) {
  return (
    <section className="bf-table-card">
      <div className="bf-table-scroll">
        <table>
          <thead><tr><th>Fee Structures ({rows.length})</th><th>Class</th><th>Items</th><th>Total</th><th>Period</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((fee) => {
              const total = (fee.items || []).reduce((sum: number, item: any) => sum + n(item.amount), 0);
              return (
                <tr key={String(idOf(fee))}>
                  <td><strong>{fee.classId ? classMap.get(Number(fee.classId)) || "Class fees" : "All classes"}</strong><span>{dateLabel(fee.updatedAt || fee.createdAt)}</span></td>
                  <td>{fee.classId ? classMap.get(Number(fee.classId)) || "Class" : "All classes"}</td>
                  <td>{(fee.items || []).length}</td>
                  <td>{money(total, fee.currencyCode || currency)}</td>
                  <td>{fee.academicPeriodId || "Not set"}</td>
                  <td><div className="bf-table-actions"><button type="button" onClick={() => openInvoiceDrawer(fee)}>Invoice</button><button type="button" onClick={() => openFeeDrawer(fee)}>Edit</button><button type="button" className="danger" onClick={() => deleteFeeStructure(fee)}>Delete</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="bf-empty-table">No fee structure matches your filters.</div>}
      </div>
    </section>
  );
}

function PaymentTable({ rows, invoices, studentMap, currency }: { rows: AnyRow[]; invoices: AnyRow[]; studentMap: Map<number, string>; currency: string }) {
  return (
    <section className="bf-table-card">
      <div className="bf-table-scroll">
        <table>
          <thead><tr><th>Payments ({rows.length})</th><th>Student</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((payment) => {
              const invoice = invoices.find((row) => Number(idOf(row)) === Number(payment.invoiceId || 0));
              return (
                <tr key={String(idOf(payment))}>
                  <td><strong>{payment.receiptNumber || payment.referenceNumber || "Payment"}</strong><span>{payment.provider || "manual"}</span></td>
                  <td>{studentMap.get(Number(payment.studentId)) || "Unknown student"}</td>
                  <td>{invoice?.invoiceNumber || "Manual record"}</td>
                  <td>{money(payment.amount, payment.currencyCode || currency)}</td>
                  <td>{payment.method || "manual"}</td>
                  <td><Chip tone={paymentTone(payment.status)}>{payment.status || "paid"}</Chip></td>
                  <td>{dateLabel(payment.paidAt || payment.date || payment.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="bf-empty-table">No payment matches your filters.</div>}
      </div>
    </section>
  );
}

function TableView({ rows, studentMap, classMap, currency, openPaymentDrawer, setSelectedInvoice, deleteInvoice }: { rows: AnyRow[]; studentMap: Map<number, string>; classMap: Map<number, string>; currency: string; openPaymentDrawer: (invoice: AnyRow) => void; setSelectedInvoice: (invoice: AnyRow) => void; deleteInvoice: (invoice: AnyRow) => void }) {
  return (
    <section className="bf-table-card">
      <div className="bf-table-scroll">
        <table>
          <thead><tr><th>Invoices ({rows.length})</th><th>Student</th><th>Class</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((invoice) => {
              const status = invoice.computedStatus || invoice.status || "issued";
              return (
                <tr key={String(idOf(invoice))}>
                  <td><strong>{invoice.invoiceNumber || "Invoice"}</strong><span>{dateLabel(invoice.issueDate || invoice.createdAt)}</span></td>
                  <td>{studentMap.get(Number(invoice.studentId)) || "Unknown student"}</td>
                  <td>{classMap.get(Number(invoice.classId)) || "No class"}</td>
                  <td>{money(invoice.total, invoice.currencyCode || currency)}</td>
                  <td>{money(invoice.amountPaid, invoice.currencyCode || currency)}</td>
                  <td>{money(invoice.balance, invoice.currencyCode || currency)}</td>
                  <td><Chip tone={statusTone(status)}>{String(status).replaceAll("_", " ")}</Chip></td>
                  <td>{dateLabel(invoice.dueDate)}</td>
                  <td><div className="bf-table-actions"><button type="button" onClick={() => setSelectedInvoice(invoice)}>View</button><button type="button" onClick={() => openPaymentDrawer(invoice)}>Pay</button><button type="button" className="danger" onClick={() => deleteInvoice(invoice)}>Delete</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="bf-empty-table">No invoice matches your filters.</div>}
      </div>
    </section>
  );
}

function FilterSheet({ status, setStatus, classFilter, setClassFilter, classes, onClose }: { status: StatusFilter; setStatus: (value: StatusFilter) => void; classFilter: string; setClassFilter: (value: string) => void; classes: AnyRow[]; onClose: () => void }) {
  return (
    <div className="bf-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bf-sheet small">
        <div className="bf-sheet-head"><div><h2>Filters</h2><p>Choose invoice status and class.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="bf-form compact">
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="issued">Issued</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option></select></label>
          <label><span>Class</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">All classes</option>{classes.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        </div>
        <div className="bf-sheet-actions"><button type="button" onClick={() => { setStatus("all"); setClassFilter("all"); }}>Reset</button><button type="button" className="primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onFee, onPayment, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onFee: () => void; onPayment: () => void; onClose: () => void }) {
  return (
    <div className="bf-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="bf-sheet small">
        <div className="bf-sheet-head"><div><h2>More</h2><p>Views and finance actions are kept here to save space.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="bf-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>Cards view</b><small>{summary.invoices} invoice(s) shown</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense invoice records</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{money(summary.balance)} balance · {summary.overdue} overdue</small></button>
          <button type="button" onClick={onFee}><span>💳</span><b>New fee structure</b><small>Set branch fees for class and term</small></button>
          <button type="button" onClick={onPayment}><span>💰</span><b>Record payment</b><small>Manual cash, momo, bank or card record</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local branch fees</small></button>
        </div>
      </section>
    </div>
  );
}

function FeeDrawer({ form, setForm, classes, academicStructures, academicPeriods, message, saving, addFeeItem, removeFeeItem, save, close }: { form: FeeForm; setForm: React.Dispatch<React.SetStateAction<FeeForm>>; classes: AnyRow[]; academicStructures: AnyRow[]; academicPeriods: AnyRow[]; message: string; saving: boolean; addFeeItem: () => void; removeFeeItem: (index: number) => void; save: () => void | Promise<void>; close: () => void }) {
  const total = form.items.reduce((sum, item) => sum + n(item.amount), 0);
  return (
    <div className="bf-drawer-layer" role="dialog" aria-modal="true"><button className="bf-drawer-overlay" type="button" onClick={close} /><aside className="bf-drawer">
      <div className="bf-drawer-head"><div><p>{form.id ? "Edit Fee Structure" : "New Fee Structure"}</p><h2>Branch Fees</h2><span>{form.items.length} item(s) · {money(total, form.currencyCode)}</span></div><button type="button" onClick={close}>✕</button></div>
      {message && <section className="bf-inline-error">{message}</section>}
      <section className="bf-form-card"><div className="bf-form-grid">
        <label><span>Class</span><select value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value })}><option value="all">All classes</option>{classes.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Academic Structure</span><select value={form.academicStructureId} onChange={(event) => setForm({ ...form, academicStructureId: event.target.value })}><option value="">Select</option>{academicStructures.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Academic Period</span><select value={form.academicPeriodId} onChange={(event) => setForm({ ...form, academicPeriodId: event.target.value })}><option value="">Select</option>{academicPeriods.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Currency</span><input value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value.toUpperCase() })} /></label>
        <label><span>Item Name</span><input value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} placeholder="Tuition, Feeding, PTA..." /></label>
        <label><span>Amount</span><input type="number" value={form.itemAmount} onChange={(event) => setForm({ ...form, itemAmount: event.target.value })} placeholder="0" /></label>
      </div><button type="button" className="bf-soft-wide" onClick={addFeeItem}>Add Fee Item</button>
      <div className="bf-item-list">{form.items.map((item, index) => <article key={`${item.name}-${index}`}><b>{item.name}</b><span>{money(item.amount, form.currencyCode)}</span><button type="button" onClick={() => removeFeeItem(index)}>×</button></article>)}</div></section>
      <div className="bf-drawer-actions"><button type="button" onClick={close}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save Fees"}</button></div>
    </aside></div>
  );
}

function InvoiceDrawer({ form, setForm, students, classes, feeStructures, classMap, currency, message, saving, generate, close }: { form: InvoiceForm; setForm: React.Dispatch<React.SetStateAction<InvoiceForm>>; students: AnyRow[]; classes: AnyRow[]; feeStructures: AnyRow[]; classMap: Map<number, string>; currency: string; message: string; saving: boolean; generate: () => void | Promise<void>; close: () => void }) {
  const selectedFee = feeStructures.find((row) => String(idOf(row)) === form.feeStructureId);
  const total = selectedFee ? (selectedFee.items || []).reduce((sum: number, item: any) => sum + n(item.amount), 0) : 0;
  const selectedClassId = cleanId(form.classId || selectedFee?.classId);
  const filteredStudents = students.filter((student) => !selectedClassId || Number(student.currentClassId || student.classId || 0) === Number(selectedClassId));
  const targetCount = form.invoiceTarget === "single_student" ? (form.studentId ? 1 : 0) : filteredStudents.length;
  return (
    <div className="bf-drawer-layer" role="dialog" aria-modal="true"><button className="bf-drawer-overlay" type="button" onClick={close} /><aside className="bf-drawer">
      <div className="bf-drawer-head"><div><p>Generate Invoice</p><h2>Student Fees</h2><span>{selectedFee ? money(total, selectedFee.currencyCode || currency) : "Select fee structure"}</span></div><button type="button" onClick={close}>✕</button></div>
      {message && <section className="bf-inline-error">{message}</section>}
      <section className="bf-form-card"><div className="bf-form-grid">
        <label><span>Invoice Target</span><select value={form.invoiceTarget} onChange={(event) => setForm({ ...form, invoiceTarget: event.target.value as InvoiceTarget, studentId: event.target.value === "single_student" ? form.studentId : "" })}><option value="single_student">One student</option><option value="selected_class">Selected class</option><option value="matching_students">All matching students</option></select></label>
        <label><span>Class</span><select value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value, studentId: "" })}><option value="">Use fee structure class</option>{classes.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Student</span><select value={form.studentId} disabled={form.invoiceTarget !== "single_student"} onChange={(event) => setForm({ ...form, studentId: event.target.value })}><option value="">{form.invoiceTarget === "single_student" ? "Select student" : `${targetCount} student(s) will be targeted`}</option>{filteredStudents.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{rowName(item)}</option>)}</select></label>
        <label><span>Fee Structure</span><select value={form.feeStructureId} onChange={(event) => { const selected = feeStructures.find((item) => String(idOf(item)) === event.target.value); setForm({ ...form, feeStructureId: event.target.value, classId: selected?.classId ? String(selected.classId) : form.classId }); }}><option value="">Select fee structure</option>{feeStructures.map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{item.classId ? classMap.get(Number(item.classId)) || "Class" : "All classes"} · {(item.items || []).length} item(s)</option>)}</select></label>
        <label><span>Due Date</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label><span>Discount</span><input type="number" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></label>
        <label><span>Tax</span><input type="number" value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} /></label>
        <label className="wide"><span>Note</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional note for parent/student portal" /></label>
      </div><p className="bf-hint">Choose one student, a whole class, or all students matching the fee structure. Parent/student portal reads the generated invoices.</p></section>
      <div className="bf-drawer-actions"><button type="button" onClick={close}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={generate}>{saving ? "Generating..." : form.invoiceTarget === "single_student" ? "Generate Invoice" : "Generate Invoices"}</button></div>
    </aside></div>
  );
}

function PaymentDrawer({ form, setForm, invoices, studentMap, currency, message, saving, record, close }: { form: PaymentForm; setForm: React.Dispatch<React.SetStateAction<PaymentForm>>; invoices: AnyRow[]; studentMap: Map<number, string>; currency: string; message: string; saving: boolean; record: () => void | Promise<void>; close: () => void }) {
  const selectedInvoice = invoices.find((row) => String(idOf(row)) === form.invoiceId);
  return (
    <div className="bf-drawer-layer" role="dialog" aria-modal="true"><button className="bf-drawer-overlay" type="button" onClick={close} /><aside className="bf-drawer">
      <div className="bf-drawer-head"><div><p>Record Payment</p><h2>Fee Payment</h2><span>{selectedInvoice ? `${studentMap.get(Number(selectedInvoice.studentId)) || "Student"} · ${money(selectedInvoice.balance, selectedInvoice.currencyCode || currency)} balance` : "Select invoice"}</span></div><button type="button" onClick={close}>✕</button></div>
      {message && <section className="bf-inline-error">{message}</section>}
      <section className="bf-form-card"><div className="bf-form-grid">
        <label className="wide"><span>Invoice</span><select value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })}><option value="">Select invoice</option>{invoices.filter((row) => n(row.balance) > 0).map((item) => <option key={String(idOf(item))} value={String(idOf(item))}>{item.invoiceNumber} · {studentMap.get(Number(item.studentId)) || "Student"} · {money(item.balance, item.currencyCode || currency)}</option>)}</select></label>
        <label><span>Amount</span><input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label><span>Method</span><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentForm["method"] })}><option value="cash">Cash</option><option value="momo">Momo</option><option value="bank">Bank</option><option value="card">Card</option><option value="manual">Manual</option></select></label>
        <label><span>Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label><span>Reference</span><input value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} /></label>
        <label><span>Receipt</span><input value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} /></label>
        <label><span>Payer Name</span><input value={form.payerName} onChange={(event) => setForm({ ...form, payerName: event.target.value })} /></label>
        <label><span>Payer Phone</span><input value={form.payerPhone} onChange={(event) => setForm({ ...form, payerPhone: event.target.value })} /></label>
        <label className="wide"><span>Note</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
      </div></section>
      <div className="bf-drawer-actions"><button type="button" onClick={close}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={record}>{saving ? "Recording..." : "Record Payment"}</button></div>
    </aside></div>
  );
}

function InvoiceSheet({ invoice, studentName, className, items, payments, currency, openPaymentDrawer, close }: { invoice: AnyRow; studentName: string; className: string; items: AnyRow[]; payments: AnyRow[]; currency: string; openPaymentDrawer: (invoice: AnyRow) => void; close: () => void }) {
  return (
    <div className="bf-sheet-backdrop" role="dialog" aria-modal="true"><section className="bf-sheet">
      <div className="bf-sheet-head"><div><h2>{invoice.invoiceNumber || "Invoice"}</h2><p>{studentName} · {className} · {money(invoice.balance, currency)} balance</p></div><button type="button" onClick={close}>✕</button></div>
      <div className="bf-detail-grid"><article><span>Total</span><b>{money(invoice.total, currency)}</b></article><article><span>Paid</span><b>{money(invoice.amountPaid, currency)}</b></article><article><span>Balance</span><b>{money(invoice.balance, currency)}</b></article></div>
      <div className="bf-item-list sheet"><h3>Items</h3>{items.map((item) => <article key={String(idOf(item))}><b>{item.name}</b><span>{money(item.amount, item.currencyCode || currency)}</span></article>)}{!items.length && <p>No invoice items found.</p>}</div>
      <div className="bf-item-list sheet"><h3>Payments</h3>{payments.map((payment) => <article key={String(idOf(payment))}><b>{money(payment.amount, payment.currencyCode || currency)}</b><span>{payment.method} · {dateLabel(payment.paidAt || payment.date)}</span></article>)}{!payments.length && <p>No payment records yet.</p>}</div>
      <div className="bf-sheet-actions"><button type="button" onClick={close}>Close</button><button type="button" className="primary" onClick={() => openPaymentDrawer(invoice)}>Record Payment</button></div>
    </section></div>
  );
}

function AnalyticsView({ summary, currency, invoices, feeStructures, payments }: { summary: AnyRow; currency: string; invoices: AnyRow[]; feeStructures: AnyRow[]; payments: AnyRow[] }) {
  const rows = [
    { label: "Paid", value: summary.paidInvoices },
    { label: "Part Paid", value: summary.partPaid },
    { label: "Overdue", value: summary.overdue },
    { label: "Open", value: Math.max(0, summary.invoices - summary.paidInvoices - summary.partPaid - summary.overdue) },
  ];
  return (
    <section className="bf-analysis-grid">
      <article className="bf-analysis"><span>Total Invoiced</span><strong>{money(summary.total, currency)}</strong><p>{summary.invoices} invoice(s) currently shown.</p></article>
      <article className="bf-analysis"><span>Collected</span><strong>{money(summary.paid, currency)}</strong><p>{payments.length} payment record(s) in this branch.</p></article>
      <article className="bf-analysis"><span>Balance</span><strong>{money(summary.balance, currency)}</strong><p>{summary.overdue} overdue invoice(s).</p></article>
      <article className="bf-analysis"><span>Fee Setup</span><strong>{feeStructures.length}</strong><p>Fee structure(s) available for invoice generation.</p></article>
      <article className="bf-analysis wide"><span>Invoice Status</span><strong>{invoices.length}</strong><div className="bf-analysis-list">{rows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="bf-progress"><i style={{ width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.invoices)) * 100))}%` }} /></div></section>)}</div></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.bf-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--bf-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.bf-page *,.bf-page *::before,.bf-page *::after{box-sizing:border-box;min-width:0}.bf-page button,.bf-page input,.bf-page select,.bf-page textarea{font:inherit;max-width:100%}.bf-page button{-webkit-tap-highlight-color:transparent}.bf-page input,.bf-page select,.bf-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.bf-page textarea{min-height:110px;padding:12px;resize:vertical;line-height:1.5}.bf-page input:focus,.bf-page select:focus,.bf-page textarea:focus{border-color:color-mix(in srgb,var(--bf-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--bf-primary) 12%,transparent)}.bf-state,.bf-search-card,.invoice-row,.payment-row,.bf-table-card,.bf-analysis,.bf-empty,.bf-sheet,.bf-recent,.fee-row,.bf-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.bf-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.bf-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--bf-primary) 18%,transparent);border-top-color:var(--bf-primary);animation:spin .8s linear infinite}.bf-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.bf-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bf-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.bf-toast.success{background:rgba(34,197,94,.14);color:#166534}.bf-toast.error,.bf-inline-error{background:rgba(239,68,68,.12);color:#991b1b}.bf-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.bf-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.bf-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px}.bf-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.bf-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.bf-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.bf-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.bf-icon-button,.bf-filter-button,.bf-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.bf-add-inline{border-color:var(--bf-primary);background:var(--bf-primary);color:#fff;font-size:25px;box-shadow:0 12px 28px color-mix(in srgb,var(--bf-primary) 22%,transparent)}.bf-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.bf-filter-button{position:relative;background:color-mix(in srgb,var(--bf-primary) 8%,var(--card-bg,#fff));color:var(--bf-primary)}.bf-filter-button.active{background:var(--bf-primary);color:#fff;border-color:var(--bf-primary)}.bf-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.bf-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.bf-filter-chips::-webkit-scrollbar{display:none}.bf-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--bf-primary) 11%,transparent);color:var(--bf-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.bf-section-tabs{display:flex;gap:7px;overflow-x:auto;margin:8px auto 0;padding:1px;max-width:1180px;scrollbar-width:none}.bf-section-tabs::-webkit-scrollbar{display:none}.bf-section-tabs button{flex:0 0 auto;min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 11px;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.bf-section-tabs button.active{border-color:var(--bf-primary);background:var(--bf-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--bf-primary) 18%,transparent)}.bf-section-tabs b{margin-left:5px}.bf-list{display:grid;gap:7px;margin-top:10px}.bf-create-row{display:grid;grid-template-columns:1fr;gap:7px}.bf-create-row button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:20px;padding:10px;background:color-mix(in srgb,var(--bf-primary) 7%,var(--surface,#fff));color:var(--text,#111827);text-align:left;cursor:pointer}.bf-create-row span{grid-row:span 2;width:38px;height:38px;display:grid;place-items:center;border-radius:15px;background:var(--bf-primary);color:#fff;font-weight:1000}.bf-create-row b,.bf-create-row small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bf-create-row b{font-size:13px;font-weight:1000}.bf-create-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}.payment-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.invoice-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.invoice-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--bf-primary) 12%,var(--surface,#fff));font-size:22px}.invoice-main,.invoice-main strong,.invoice-main small,.invoice-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.invoice-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.invoice-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.invoice-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.invoice-side{display:flex;align-items:center;gap:5px}.invoice-side button{min-height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}.invoice-side button.danger,.fee-row button.danger,.bf-table-actions button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.bf-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.bf-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.bf-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.bf-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.bf-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.bf-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.bf-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.bf-sheet-backdrop,.bf-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.bf-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.bf-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.bf-sheet-head,.bf-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.bf-sheet-head h2,.bf-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.bf-sheet-head p,.bf-drawer-head p,.bf-drawer-head span{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.bf-sheet-head button,.bf-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.bf-menu-list{display:grid;gap:8px}.bf-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.bf-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--bf-primary) 10%,transparent);color:var(--bf-primary);font-weight:1000}.bf-menu-list button b,.bf-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bf-menu-list button b{font-size:13px;font-weight:1000}.bf-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.bf-menu-list button.active{border-color:color-mix(in srgb,var(--bf-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--bf-primary) 8%,var(--surface,#fff))}.bf-sheet-actions,.bf-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.bf-sheet-actions button,.bf-drawer-actions button,.bf-soft-wide{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.bf-sheet-actions button.primary,.bf-drawer-actions button.primary{border-color:var(--bf-primary);background:var(--bf-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--bf-primary) 25%,transparent)}.bf-drawer-layer{place-items:stretch end;padding:0}.bf-drawer-overlay{position:absolute;inset:0;border:0;background:transparent}.bf-drawer{position:relative;z-index:1;width:min(720px,100%);height:100dvh;overflow-y:auto;background:var(--card-bg,var(--surface,#fff));border-left:1px solid var(--border,rgba(0,0,0,.10));padding:14px;box-shadow:-28px 0 80px rgba(15,23,42,.28)}.bf-form-card{padding:12px;border-radius:24px}.bf-form,.bf-form-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.bf-form label,.bf-form-grid label{display:grid;gap:6px;min-width:0}.bf-form span,.bf-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.bf-form .wide,.bf-form-grid .wide{grid-column:1/-1}.bf-soft-wide{width:100%;margin-top:10px;background:var(--bf-primary);border-color:var(--bf-primary);color:#fff}.bf-hint{margin:10px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:800}.bf-item-list{display:grid;gap:7px;margin-top:10px}.bf-item-list h3{margin:0;font-size:13px;font-weight:1000}.bf-item-list article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:9px;border-radius:15px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.bf-item-list b,.bf-item-list span{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bf-item-list span{color:var(--muted,#64748b);font-weight:900}.bf-item-list button{width:28px;height:28px;border:0;border-radius:999px;background:rgba(239,68,68,.12);color:#991b1b;font-weight:1000}.bf-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.bf-detail-grid article{padding:12px;border-radius:18px;background:color-mix(in srgb,var(--bf-primary) 7%,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10))}.bf-detail-grid span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:900}.bf-detail-grid b{display:block;margin-top:5px;font-size:16px;font-weight:1000}.bf-table-card,.bf-analysis,.bf-empty{padding:13px;border-radius:24px}.bf-table-card{margin-top:10px}.bf-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.bf-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.bf-table-scroll th,.bf-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.bf-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--bf-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.bf-table-scroll td strong,.bf-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bf-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.bf-table-actions{display:flex;flex-wrap:nowrap;gap:7px;width:100%;overflow-x:auto;scrollbar-width:none}.bf-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 10px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;cursor:pointer;white-space:nowrap}.bf-table-actions button:first-child{background:var(--bf-primary);color:#fff;border-color:var(--bf-primary)}.bf-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.bf-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.bf-analysis span,.bf-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.bf-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.bf-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.bf-analysis-list{display:grid;gap:10px;margin-top:12px}.bf-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.bf-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.bf-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.bf-progress i{display:block;height:100%;border-radius:inherit;background:var(--bf-primary)}.bf-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.bf-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--bf-primary) 12%,var(--surface,#fff));font-size:28px}.bf-empty h3{margin:0;font-size:18px;font-weight:1000}.bf-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.bf-recent{margin-top:10px;border-radius:24px;padding:12px}.bf-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.bf-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.bf-fee-grid{display:grid;gap:7px}.fee-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.fee-row>span{grid-row:span 3;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--bf-primary) 10%,transparent)}.fee-row b,.fee-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fee-row b{font-size:12px;font-weight:1000}.fee-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}.fee-row div{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px;margin-top:7px}.fee-row button{min-height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}@media (min-width:680px){.bf-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.bf-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.bf-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bf-create-row{grid-template-columns:repeat(3,minmax(0,1fr));grid-column:1/-1}.invoice-row{border-radius:24px;padding:12px}.bf-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bf-analysis.wide{grid-column:span 2}.bf-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bf-sheet-backdrop{place-items:center;padding:18px}.bf-sheet{border-radius:28px;padding:18px}.bf-drawer{padding:18px}.bf-fee-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.bf-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.bf-search-card,.bf-list,.bf-analysis-grid,.bf-table-card,.bf-filter-chips,.bf-recent,.bf-section-tabs{max-width:1180px;margin-left:auto;margin-right:auto}.bf-list{grid-template-columns:repeat(3,minmax(0,1fr))}.bf-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.bf-analysis.wide{grid-column:span 2}.bf-fee-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:520px){.bf-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.bf-icon-button,.bf-filter-button,.bf-add-inline{width:40px;height:40px}.invoice-row,.payment-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.invoice-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.bf-sheet{border-radius:24px 24px 18px 18px;padding:12px}.bf-sheet-actions,.bf-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.bf-sheet-actions button,.bf-drawer-actions button{width:100%}.bf-drawer{width:100%;padding:12px}.bf-detail-grid{grid-template-columns:1fr}}
`;
