"use client";

/**
 * app/school-admin/modules/Schoolpayrolloverview.tsx
 * ---------------------------------------------------------
 * SCHOOL ADMIN — STAFF PAYROLL PAYMENT CENTER
 * ---------------------------------------------------------
 *
 * School-wide payroll dashboard and safe staff payment center.
 *
 * Upgrade from read-only overview:
 * - Shows all branch payroll positions for the assigned school.
 * - Shows staff payables from payroll items/profiles.
 * - Allows school admin to initiate staff payments.
 * - Uses PaymentCheckout for online payment initiation.
 * - Allows manual/cash/bank confirmation only for manual workflows.
 * - Does NOT blindly mark payroll as paid from the UI.
 *   The frontend records/requests payment; backend reconciliation should
 *   confirm StaffPaymentRecord, PayrollItem, and PayrollRun status.
 *
 * Expected tables when available:
 * - branches
 * - teachers
 * - staffPayrollProfiles
 * - payrollRuns
 * - payrollItems
 * - staffPaymentRecords
 * - schoolCurrencySettings / currencies
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { db } from "../../lib/db";
import PaymentCheckout from "../../components/payments/PaymentCheckout";
import {
  authHeaders,
  getApiBase,
  readJson,
} from "../../components/payments/payment-utils";

// ======================================================
// TYPES
// ======================================================

type ViewMode = "payables" | "branches" | "payments" | "analytics";
type PeriodFilter = "all" | "today" | "week" | "month" | "term" | "year";
type StatusFilter = "all" | "unpaid" | "paid" | "pending" | "partial";
type PaymentMethod = "momo" | "card" | "bank" | "cash" | "manual";

type TenantRow = {
  id?: number | string;
  localId?: number | string;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  createdAt?: number | string;
  updatedAt?: number | string;
  synced?: boolean | string | number | null | unknown;
  syncStatus?: string;
};

type Branch = TenantRow & {
  name?: string;
  code?: string;
  location?: string;
  status?: string;
};

type Teacher = TenantRow & {
  fullName?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  status?: string;
};

type MoneyRow = TenantRow & {
  amount?: number;
  grossAmount?: number;
  netAmount?: number;
  paidAmount?: number;
  totalAmount?: number;
  salaryAmount?: number;
  basicSalary?: number;
  allowanceAmount?: number;
  deductionAmount?: number;
  currencyCode?: string;
  currencySymbol?: string;
  status?: string;
  paymentStatus?: string;
  payrollStatus?: string;
  runStatus?: string;
  teacherLocalId?: number | string | null;
  staffLocalId?: number | string | null;
  staffId?: number | string | null;
  staffName?: string;
  fullName?: string;
  title?: string;
  periodLabel?: string;
  month?: string | number;
  year?: string | number;
  date?: number | string;
  paidAt?: number | string;
  paymentDate?: number | string;
  dueDate?: number | string;
  receiptNumber?: string;
  providerReference?: string;
  method?: string;
  provider?: string;
  note?: string;
  payrollRunId?: number | string | null;
  payrollItemId?: number | string | null;
};

type CurrencySetting = TenantRow & {
  currencyCode?: string;
  currencySymbol?: string;
  code?: string;
  symbol?: string;
  isDefault?: boolean;
};

type BranchPayroll = {
  branchId?: number;
  branchName: string;
  branchCode: string;
  staffCount: number;
  payrollProfiles: number;
  payrollRuns: number;
  payrollItems: number;
  grossPayroll: number;
  netPayroll: number;
  paid: number;
  unpaid: number;
  deductions: number;
  allowances: number;
  paymentRecords: number;
  activeTeachers: number;
  coverageRate: number;
  paidRate: number;
};

type StaffPayable = {
  key: string;
  staffId?: number | string | null;
  teacherLocalId?: number | string | null;
  branchId?: number;
  branchName: string;
  staffName: string;
  staffPhone?: string;
  staffEmail?: string;
  periodLabel: string;
  gross: number;
  net: number;
  paid: number;
  unpaid: number;
  allowances: number;
  deductions: number;
  status: "paid" | "partial" | "pending" | "unpaid";
  payrollItemIds: Array<number | string>;
  payrollRunIds: Array<number | string>;
};

type Breakdown = {
  name: string;
  amount: number;
};

type CheckoutRequest = {
  title: string;
  description: string;
  amount: number;
  currency: string;
  payableKeys: string[];
  staffName?: string;
  method?: PaymentMethod;
};

type ManualForm = {
  receiptNumber: string;
  paidAt: string;
  method: "cash" | "bank" | "manual";
  note: string;
};

// ======================================================
// HELPERS
// ======================================================

const DAY = 24 * 60 * 60 * 1000;

function getTable<T = any>(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) {
    if (anyDb[name]) return anyDb[name];
  }
  return null;
}

async function tableToArray<T = any>(...names: string[]): Promise<T[]> {
  const table = getTable<T>(...names);
  if (!table?.toArray) return [];
  return table.toArray();
}

function rowId(row?: any) {
  return row?.id ?? row?.localId ?? row?.payload?.id ?? row?.payload?.localId;
}

function toNumber(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function rowAmount(row: MoneyRow) {
  return toNumber(
    row.netAmount ??
      row.amount ??
      row.paidAmount ??
      row.totalAmount ??
      row.salaryAmount ??
      row.basicSalary,
  );
}

function rowGross(row: MoneyRow) {
  return toNumber(
    row.grossAmount ??
      row.totalAmount ??
      row.salaryAmount ??
      row.basicSalary ??
      row.amount,
  );
}

function rowNet(row: MoneyRow) {
  return toNumber(
    row.netAmount ??
      row.amount ??
      row.paidAmount ??
      row.totalAmount ??
      row.salaryAmount ??
      row.basicSalary,
  );
}

function rowDate(row: MoneyRow) {
  const value =
    row.paidAt ||
    row.paymentDate ||
    row.date ||
    row.updatedAt ||
    row.createdAt ||
    row.dueDate;
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameSchool(
  row: TenantRow,
  accountId?: string | null,
  schoolId?: number | string | null,
) {
  if (!row || row.isDeleted) return false;
  return (
    (!row.accountId || row.accountId === accountId) &&
    Number(row.schoolId ?? schoolId) === Number(schoolId)
  );
}

function withinPeriod(row: MoneyRow, period: PeriodFilter) {
  if (period === "all" || period === "term") return true;

  const date = rowDate(row);
  if (!date) return true;

  const current = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (period === "today") return date >= startOfToday.getTime();
  if (period === "week") return date >= current - 7 * DAY;
  if (period === "month") return date >= current - 31 * DAY;
  if (period === "year") return date >= current - 365 * DAY;

  return true;
}

function statusText(row: MoneyRow) {
  return String(
    row.status || row.paymentStatus || row.payrollStatus || row.runStatus || "",
  ).toLowerCase();
}

function isPaid(row: MoneyRow) {
  const status = statusText(row);
  return (
    status.includes("paid") ||
    status.includes("success") ||
    status.includes("completed") ||
    status.includes("confirmed")
  );
}

function isPending(row: MoneyRow) {
  const status = statusText(row);
  return (
    status.includes("pending") ||
    status.includes("processing") ||
    status.includes("initiated") ||
    status.includes("draft")
  );
}

function isUnpaid(row: MoneyRow) {
  const status = statusText(row);
  return (
    status.includes("unpaid") ||
    status.includes("pending") ||
    status.includes("due") ||
    status.includes("draft") ||
    !status
  );
}

function normalizeStatus(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function paymentIsConfirmed(row: MoneyRow) {
  return (
    normalizeStatus(row.status || row.paymentStatus) === "paid" || isPaid(row)
  );
}

function money(value: number, symbol = "GHS") {
  const amount = Number(value || 0);

  try {
    return `${symbol} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(amount)}`;
  } catch {
    return `${symbol} ${amount.toFixed(2)}`;
  }
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function safeDate(value?: number | string | null) {
  if (!value) return "Not set";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function getCurrencySymbol(settings: any, currencySettings: CurrencySetting[]) {
  const fromSettings =
    settings?.currencySymbol ||
    settings?.defaultCurrencySymbol ||
    settings?.currencyCode ||
    settings?.defaultCurrencyCode;

  if (fromSettings) return String(fromSettings);

  const defaultCurrency =
    currencySettings.find((row) => row.isDefault) || currencySettings[0];

  return (
    defaultCurrency?.currencySymbol ||
    defaultCurrency?.symbol ||
    defaultCurrency?.currencyCode ||
    defaultCurrency?.code ||
    "GHS"
  );
}

function staffKey(row: MoneyRow) {
  return String(
    row.teacherLocalId ||
      row.staffLocalId ||
      row.staffId ||
      row.staffName ||
      row.fullName ||
      "",
  );
}

function branchName(branches: Branch[], branchId?: number | string | null) {
  const branch = branches.find(
    (row) => Number(rowId(row)) === Number(branchId),
  );
  return branch?.name || `Branch #${branchId || "Unknown"}`;
}

function staffDisplayName(row: MoneyRow, teachers: Teacher[]) {
  const teacher = teachers.find((item) => {
    const id = rowId(item);
    return (
      String(id) === String(row.teacherLocalId) ||
      String(id) === String(row.staffLocalId) ||
      String(id) === String(row.staffId)
    );
  });

  return (
    row.staffName ||
    row.fullName ||
    teacher?.fullName ||
    teacher?.name ||
    teacher?.title ||
    `Staff #${staffKey(row) || "Unknown"}`
  );
}

function staffPhone(row: MoneyRow, teachers: Teacher[]) {
  const teacher = teachers.find(
    (item) =>
      String(rowId(item)) ===
      String(row.teacherLocalId || row.staffLocalId || row.staffId),
  );
  return teacher?.phone || "";
}

function staffEmail(row: MoneyRow, teachers: Teacher[]) {
  const teacher = teachers.find(
    (item) =>
      String(rowId(item)) ===
      String(row.teacherLocalId || row.staffLocalId || row.staffId),
  );
  return teacher?.email || "";
}

function payableStatus(
  unpaid: number,
  paid: number,
  net: number,
): StaffPayable["status"] {
  if (net > 0 && unpaid <= 0) return "paid";
  if (paid > 0 && unpaid > 0) return "partial";
  if (paid <= 0 && unpaid > 0) return "unpaid";
  return "pending";
}

function statusTone(
  status?: string,
): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "completed", "confirmed"].includes(value))
    return "green";
  if (["failed", "cancelled", "void"].includes(value)) return "red";
  if (["partial", "part_paid"].includes(value)) return "purple";
  if (["pending", "processing", "unpaid", "draft", "due"].includes(value))
    return "orange";
  if (!value) return "gray";
  return "blue";
}

async function cachePaymentRecord(record: MoneyRow) {
  const table = getTable<MoneyRow>("staffPaymentRecords");
  if (!table) return;

  try {
    if (table.put) await table.put(record);
    else if (table.add) await table.add(record);
  } catch {
    // Local cache should never block live payroll flow.
  }
}

function buildReference(prefix = "PAYROLL") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// ======================================================
// COMPONENT
// ======================================================

export default function Schoolpayrolloverview() {
  const router = useRouter();

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const {
    activeSchool,
    activeSchoolId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const apiBase = getApiBase();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("payables");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("unpaid");
  const [search, setSearch] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [payrollProfiles, setPayrollProfiles] = useState<MoneyRow[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<MoneyRow[]>([]);
  const [payrollItems, setPayrollItems] = useState<MoneyRow[]>([]);
  const [staffPayments, setStaffPayments] = useState<MoneyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<CurrencySetting[]>(
    [],
  );

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [checkout, setCheckout] = useState<CheckoutRequest | null>(null);
  const [manualPayable, setManualPayable] = useState<StaffPayable | null>(null);
  const [manualForm, setManualForm] = useState<ManualForm>({
    receiptNumber: buildReference("STAFF-RCPT"),
    paidAt: new Date().toISOString().slice(0, 10),
    method: "cash",
    note: "",
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId && !settings?.schoolId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    settings?.schoolId,
    router,
  ]);

  async function load() {
    if (!authenticated || !accountId || !schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [
        branchRows,
        teacherRows,
        profileRows,
        runRows,
        itemRows,
        paymentRows,
        currencyRows,
      ] = await Promise.all([
        db.branches.toArray(),
        db.teachers.toArray(),
        tableToArray<MoneyRow>("staffPayrollProfiles"),
        tableToArray<MoneyRow>("payrollRuns"),
        tableToArray<MoneyRow>("payrollItems"),
        tableToArray<MoneyRow>("staffPaymentRecords"),
        tableToArray<CurrencySetting>("schoolCurrencySettings", "currencies"),
      ]);

      const ownerBranches = (branchRows as unknown as Branch[])
        .filter((row) => sameSchool(row, accountId, Number(schoolId)))
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        );

      const branchIds = new Set(
        ownerBranches.map((branch) => Number(rowId(branch))).filter(Boolean),
      );

      setBranches(ownerBranches);
      setTeachers(
        (teacherRows as unknown as Teacher[]).filter(
          (row) =>
            sameSchool(row, accountId, Number(schoolId)) &&
            row.active !== false &&
            branchIds.has(Number(row.branchId)),
        ),
      );

      const schoolFilter = (row: MoneyRow) =>
        sameSchool(row, accountId, Number(schoolId)) &&
        branchIds.has(Number(row.branchId)) &&
        withinPeriod(row, period);

      const schoolFilterAll = (row: MoneyRow) =>
        sameSchool(row, accountId, Number(schoolId)) &&
        branchIds.has(Number(row.branchId));

      setPayrollProfiles(profileRows.filter(schoolFilterAll));
      setPayrollRuns(runRows.filter(schoolFilter));
      setPayrollItems(itemRows.filter(schoolFilter));
      setStaffPayments(paymentRows.filter(schoolFilter));
      setCurrencySettings(
        currencyRows.filter(
          (row) =>
            sameSchool(row, accountId, Number(schoolId)) || !row.schoolId,
        ),
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load school payroll payment center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, period]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    if (!reference) return;

    verifyPaymentReference(reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings, currencySettings),
    [settings, currencySettings],
  );

  const branchPayroll = useMemo<BranchPayroll[]>(() => {
    return branches
      .map((branch) => {
        const branchId = Number(rowId(branch));

        const branchTeachers = teachers.filter(
          (row) => Number(row.branchId) === branchId,
        );
        const branchProfiles = payrollProfiles.filter(
          (row) => Number(row.branchId) === branchId,
        );
        const branchRuns = payrollRuns.filter(
          (row) => Number(row.branchId) === branchId,
        );
        const branchItems = payrollItems.filter(
          (row) => Number(row.branchId) === branchId,
        );
        const branchPayments = staffPayments.filter(
          (row) => Number(row.branchId) === branchId,
        );

        const grossPayroll = branchItems.reduce(
          (sum, row) => sum + rowGross(row),
          0,
        );
        const netPayroll = branchItems.reduce(
          (sum, row) => sum + rowNet(row),
          0,
        );
        const allowances = branchItems.reduce(
          (sum, row) => sum + toNumber(row.allowanceAmount),
          0,
        );
        const deductions = branchItems.reduce(
          (sum, row) => sum + toNumber(row.deductionAmount),
          0,
        );

        const paidByPaymentRecords = branchPayments
          .filter(paymentIsConfirmed)
          .reduce((sum, row) => sum + rowAmount(row), 0);
        const paidByPayrollItems = branchItems
          .filter(isPaid)
          .reduce((sum, row) => sum + rowNet(row), 0);
        const paid = Math.max(paidByPaymentRecords, paidByPayrollItems);

        const unpaidItems = branchItems.filter(
          (row) => isUnpaid(row) || !isPaid(row),
        );
        const unpaid =
          Math.max(0, netPayroll - paid) ||
          unpaidItems.reduce((sum, row) => sum + rowNet(row), 0);

        const profileStaffKeys = new Set(
          branchProfiles.map(staffKey).filter(Boolean),
        );
        const teacherStaffCount = branchTeachers.length;
        const payrollStaffCount =
          profileStaffKeys.size || branchProfiles.length;
        const staffCount = Math.max(teacherStaffCount, payrollStaffCount);

        const coverageRate =
          teacherStaffCount > 0
            ? (payrollStaffCount / teacherStaffCount) * 100
            : payrollStaffCount > 0
              ? 100
              : 0;
        const paidRate = netPayroll > 0 ? (paid / netPayroll) * 100 : 0;

        return {
          branchId,
          branchName: branch.name || `Branch #${rowId(branch)}`,
          branchCode: branch.code || "",
          staffCount,
          payrollProfiles: branchProfiles.length,
          payrollRuns: branchRuns.length,
          payrollItems: branchItems.length,
          grossPayroll,
          netPayroll,
          paid,
          unpaid,
          deductions,
          allowances,
          paymentRecords: branchPayments.length,
          activeTeachers: teacherStaffCount,
          coverageRate,
          paidRate,
        };
      })
      .sort(
        (a, b) =>
          b.netPayroll - a.netPayroll ||
          a.branchName.localeCompare(b.branchName),
      );
  }, [
    branches,
    teachers,
    payrollProfiles,
    payrollRuns,
    payrollItems,
    staffPayments,
  ]);

  const staffPayables = useMemo<StaffPayable[]>(() => {
    const map = new Map<string, StaffPayable>();

    for (const item of payrollItems) {
      const key =
        staffKey(item) ||
        `${item.branchId || "branch"}-${rowId(item) || Math.random()}`;
      const existing = map.get(key);
      const net = rowNet(item);
      const gross = rowGross(item);
      const paidFromItem = isPaid(item) ? net : 0;

      if (!existing) {
        map.set(key, {
          key,
          staffId: item.staffId || item.staffLocalId || item.teacherLocalId,
          teacherLocalId: item.teacherLocalId,
          branchId: Number(item.branchId),
          branchName: branchName(branches, item.branchId),
          staffName: staffDisplayName(item, teachers),
          staffPhone: staffPhone(item, teachers),
          staffEmail: staffEmail(item, teachers),
          periodLabel:
            item.periodLabel ||
            [item.month, item.year].filter(Boolean).join(" ") ||
            "Payroll period",
          gross,
          net,
          paid: paidFromItem,
          unpaid: Math.max(0, net - paidFromItem),
          allowances: toNumber(item.allowanceAmount),
          deductions: toNumber(item.deductionAmount),
          status: payableStatus(
            Math.max(0, net - paidFromItem),
            paidFromItem,
            net,
          ),
          payrollItemIds: rowId(item) ? [rowId(item)] : [],
          payrollRunIds: item.payrollRunId ? [item.payrollRunId] : [],
        });
      } else {
        existing.gross += gross;
        existing.net += net;
        existing.paid += paidFromItem;
        existing.unpaid = Math.max(0, existing.net - existing.paid);
        existing.allowances += toNumber(item.allowanceAmount);
        existing.deductions += toNumber(item.deductionAmount);
        existing.status = payableStatus(
          existing.unpaid,
          existing.paid,
          existing.net,
        );
        if (rowId(item)) existing.payrollItemIds.push(rowId(item));
        if (item.payrollRunId) existing.payrollRunIds.push(item.payrollRunId);
      }
    }

    for (const payment of staffPayments.filter(paymentIsConfirmed)) {
      const key = staffKey(payment);
      const payable = map.get(key);
      if (!payable) continue;
      payable.paid = Math.max(
        payable.paid,
        toNumber(payable.paid) + rowAmount(payment),
      );
      payable.unpaid = Math.max(0, payable.net - payable.paid);
      payable.status = payableStatus(payable.unpaid, payable.paid, payable.net);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.unpaid - a.unpaid || a.staffName.localeCompare(b.staffName),
    );
  }, [branches, payrollItems, staffPayments, teachers]);

  const filteredPayables = useMemo(() => {
    const query = search.trim().toLowerCase();

    return staffPayables.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!query) return true;
      return `${row.staffName} ${row.branchName} ${row.periodLabel} ${row.staffPhone || ""} ${row.staffEmail || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [search, staffPayables, statusFilter]);

  const selectedPayables = useMemo(() => {
    const selected = new Set(selectedKeys);
    return staffPayables.filter((row) => selected.has(row.key));
  }, [selectedKeys, staffPayables]);

  const selectedTotal = selectedPayables.reduce(
    (sum, row) => sum + row.unpaid,
    0,
  );

  const filteredBranchPayroll = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return branchPayroll;

    return branchPayroll.filter((row) =>
      `${row.branchName} ${row.branchCode}`.toLowerCase().includes(query),
    );
  }, [branchPayroll, search]);

  const paymentHistory = useMemo(() => {
    const query = search.trim().toLowerCase();

    return staffPayments
      .filter((payment) => {
        if (!query) return true;
        return `${payment.staffName || ""} ${payment.receiptNumber || ""} ${payment.providerReference || ""} ${payment.method || ""} ${payment.status || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => rowDate(b) - rowDate(a));
  }, [staffPayments, search]);

  const summary = useMemo(() => {
    const staffCount = branchPayroll.reduce(
      (sum, row) => sum + row.staffCount,
      0,
    );
    const profiles = branchPayroll.reduce(
      (sum, row) => sum + row.payrollProfiles,
      0,
    );
    const runs = branchPayroll.reduce((sum, row) => sum + row.payrollRuns, 0);
    const gross = branchPayroll.reduce((sum, row) => sum + row.grossPayroll, 0);
    const net = branchPayroll.reduce((sum, row) => sum + row.netPayroll, 0);
    const paid = branchPayroll.reduce((sum, row) => sum + row.paid, 0);
    const unpaid = branchPayroll.reduce((sum, row) => sum + row.unpaid, 0);
    const deductions = branchPayroll.reduce(
      (sum, row) => sum + row.deductions,
      0,
    );
    const allowances = branchPayroll.reduce(
      (sum, row) => sum + row.allowances,
      0,
    );
    const paymentRecords = branchPayroll.reduce(
      (sum, row) => sum + row.paymentRecords,
      0,
    );
    const pendingPayments = staffPayments.filter(isPending).length;
    const paidRate = net > 0 ? (paid / net) * 100 : 0;
    const coverageRate = staffCount > 0 ? (profiles / staffCount) * 100 : 0;

    const highestPayrollBranch = [...branchPayroll].sort(
      (a, b) => b.netPayroll - a.netPayroll,
    )[0];
    const attentionBranch = [...branchPayroll].sort(
      (a, b) => b.unpaid - a.unpaid || a.paidRate - b.paidRate,
    )[0];

    return {
      staffCount,
      profiles,
      runs,
      gross,
      net,
      paid,
      unpaid,
      deductions,
      allowances,
      paymentRecords,
      pendingPayments,
      paidRate,
      coverageRate,
      highestPayrollBranch,
      attentionBranch,
    };
  }, [branchPayroll, staffPayments]);

  const breakdowns = useMemo(() => {
    const payroll: Breakdown[] = [
      { name: "Paid Payroll", amount: summary.paid },
      { name: "Unpaid Payroll", amount: summary.unpaid },
      { name: "Deductions", amount: summary.deductions },
      { name: "Allowances", amount: summary.allowances },
    ].filter((item) => item.amount > 0);

    const branchCost: Breakdown[] = branchPayroll
      .map((row) => ({ name: row.branchName, amount: row.netPayroll }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return { payroll, branchCost };
  }, [summary, branchPayroll]);

  async function verifyPaymentReference(reference: string) {
    try {
      setNotice("Verifying staff payment...");

      const res = await fetch(
        `${apiBase}/billing/payments/verify/${reference}?provider=paystack&purpose=staff_payroll`,
        { headers: authHeaders() },
      );

      await readJson(res);
      await load();

      setNotice(
        "Payment verification completed. Staff payroll will show paid only after the backend confirms and reconciles the payment.",
      );

      const url = new URL(window.location.href);
      url.searchParams.delete("reference");
      window.history.replaceState({}, "", url.toString());
    } catch (err: any) {
      setError(err?.message || "Unable to verify staff payment.");
    }
  }

  function toggleSelected(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function selectAllVisibleUnpaid() {
    const keys = filteredPayables
      .filter((row) => row.unpaid > 0)
      .map((row) => row.key);
    setSelectedKeys(keys);
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  function openCheckoutForPayable(payable: StaffPayable) {
    if (payable.unpaid <= 0) {
      setError(
        "This staff member has no unpaid payroll amount for the selected period.",
      );
      return;
    }

    setCheckout({
      title: `Pay ${payable.staffName}`,
      description: `${payable.periodLabel} payroll payment for ${payable.branchName}`,
      amount: payable.unpaid,
      currency: currencySymbol,
      payableKeys: [payable.key],
      staffName: payable.staffName,
    });
  }

  function openCheckoutForSelected() {
    if (!selectedPayables.length || selectedTotal <= 0) {
      setError("Select at least one unpaid staff payroll item before paying.");
      return;
    }

    setCheckout({
      title: `Pay ${selectedPayables.length} staff member(s)`,
      description: `Bulk staff payroll payment for ${activeSchool?.name || "assigned school"}`,
      amount: selectedTotal,
      currency: currencySymbol,
      payableKeys: selectedPayables.map((row) => row.key),
    });
  }

  function openManualPayment(payable: StaffPayable) {
    setManualPayable(payable);
    setManualForm({
      receiptNumber: buildReference("STAFF-RCPT"),
      paidAt: new Date().toISOString().slice(0, 10),
      method: "cash",
      note: "",
    });
    setError("");
  }

  async function confirmManualPayment() {
    if (!manualPayable || manualPayable.unpaid <= 0) return;

    const confirmed = window.confirm(
      `Confirm manual payroll payment for ${manualPayable.staffName}?\n\nAmount: ${money(manualPayable.unpaid, currencySymbol)}\n\nOnly continue if the staff has truly been paid.`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");

      const payload = {
        accountId,
        schoolId: Number(schoolId),
        branchId: manualPayable.branchId,
        teacherLocalId: manualPayable.teacherLocalId,
        staffId: manualPayable.staffId,
        staffName: manualPayable.staffName,
        amount: manualPayable.unpaid,
        currencyCode: currencySymbol,
        method: manualForm.method,
        provider: "manual",
        status: "paid",
        paymentStatus: "paid",
        receiptNumber:
          manualForm.receiptNumber.trim() || buildReference("STAFF-RCPT"),
        paidAt: manualForm.paidAt
          ? new Date(manualForm.paidAt).getTime()
          : Date.now(),
        note: manualForm.note.trim() || undefined,
        payrollItemIds: manualPayable.payrollItemIds,
        payrollRunIds: manualPayable.payrollRunIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
        synced: "pending",
      };

      try {
        const res = await fetch(`${apiBase}/payroll/staff-payments/confirm`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await readJson(res);
        await cachePaymentRecord({ ...payload, ...(json || {}) });
      } catch {
        await cachePaymentRecord(payload);
        setNotice(
          "Manual payment was saved locally. It will need to sync with the backend when the payroll API is available.",
        );
      }

      setManualPayable(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Manual staff payment could not be confirmed.");
    } finally {
      setSaving(false);
    }
  }

  async function recordCheckoutStarted(result: any) {
    const selected = staffPayables.filter((row) =>
      checkout?.payableKeys.includes(row.key),
    );
    const reference =
      result?.reference ||
      result?.data?.reference ||
      result?.payment?.providerReference ||
      buildReference("STAFF-PENDING");

    for (const payable of selected) {
      await cachePaymentRecord({
        accountId,
        schoolId: Number(schoolId),
        branchId: payable.branchId,
        teacherLocalId: payable.teacherLocalId,
        staffId: payable.staffId,
        staffName: payable.staffName,
        amount: payable.unpaid,
        currencyCode: currencySymbol,
        method: "momo",
        provider: result?.provider || "paystack",
        status: "pending",
        paymentStatus: "pending",
        providerReference: reference,
        receiptNumber: reference,
        payrollItemIds: payable.payrollItemIds,
        payrollRunIds: payable.payrollRunIds,
        note: "Staff payroll payment initiated. Awaiting provider/backend confirmation.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
        synced: "pending",
      } as any);
    }

    setNotice(
      "Staff payroll payment started. Payroll will become paid only after provider/backend confirmation.",
    );
    setCheckout(null);
    setSelectedKeys([]);
    await load();
  }

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main
        className="sp-page"
        style={{ "--sp-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="sp-state-card">
          <div className="sp-spinner" />
          <h2>Opening payroll payment center...</h2>
          <p>
            Loading payroll runs, staff payables, payment records and branch
            summaries.
          </p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId || !schoolId) {
    return (
      <main
        className="sp-page"
        style={{ "--sp-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="sp-state-card">
          <h2>Assigned school required</h2>
          <p>
            Please sign in with a school-admin account assigned to a school.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="sp-page"
      style={{ "--sp-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="sp-hero">
        <div className="sp-hero-left">
          <div className="sp-hero-icon">💸</div>
          <div className="sp-title-wrap">
            <p>School Payroll</p>
            <h2>Staff Payment Center</h2>
            <span>
              {activeSchool?.name || "Assigned school"} · Pay staff safely after
              payroll is prepared
            </span>
          </div>
        </div>

        <div className="sp-hero-actions">
          <button type="button" className="sp-ghost-btn" onClick={load}>
            Refresh
          </button>
          <button
            type="button"
            className="sp-primary-btn"
            disabled={!selectedPayables.length}
            onClick={openCheckoutForSelected}
          >
            Pay Selected
          </button>
        </div>
      </section>

      {notice && <section className="sp-notice">{notice}</section>}
      {error && <section className="sp-error">{error}</section>}

      <section className="sp-context-grid">
        <article>
          <div className="sp-context-icon">🔐</div>
          <div>
            <span>Safe payment rule</span>
            <strong>Payroll is paid after confirmation</strong>
            <p>
              Online payments start from this page, but payroll should be
              reconciled by the backend after successful provider verification.
            </p>
          </div>
        </article>

        <article>
          <div className="sp-context-icon">👥</div>
          <div>
            <span>Selection</span>
            <strong>
              {selectedPayables.length} selected ·{" "}
              {money(selectedTotal, currencySymbol)}
            </strong>
            <p>Select unpaid staff and pay individually or in bulk.</p>
          </div>
        </article>
      </section>

      <section className="sp-summary-grid">
        <SummaryCard
          label="Payroll Cost"
          value={money(summary.net, currencySymbol)}
          icon="🧾"
          warning={summary.net > 0}
        />
        <SummaryCard
          label="Paid"
          value={money(summary.paid, currencySymbol)}
          icon="✅"
          positive
        />
        <SummaryCard
          label="Unpaid"
          value={money(summary.unpaid, currencySymbol)}
          icon="⚠️"
          warning={summary.unpaid > 0}
        />
        <SummaryCard
          label="Pending Payments"
          value={summary.pendingPayments}
          icon="⏳"
          warning={summary.pendingPayments > 0}
        />
        <SummaryCard label="Staff Covered" value={summary.profiles} icon="👥" />
        <SummaryCard
          label="Paid Rate"
          value={percent(summary.paidRate)}
          icon="📊"
          positive={summary.paidRate >= 80}
          warning={summary.paidRate < 50}
        />
      </section>

      <section className="sp-insight-grid">
        <article>
          <span>Highest payroll branch</span>
          <strong>
            {summary.highestPayrollBranch?.branchName || "No branch yet"}
          </strong>
          <p>
            {summary.highestPayrollBranch
              ? `${money(summary.highestPayrollBranch.netPayroll, currencySymbol)} payroll cost`
              : "No payroll records found."}
          </p>
        </article>

        <article>
          <span>Needs attention</span>
          <strong>
            {summary.attentionBranch?.branchName || "No branch yet"}
          </strong>
          <p>
            {summary.attentionBranch
              ? `${money(summary.attentionBranch.unpaid, currencySymbol)} unpaid payroll`
              : "No unpaid payroll found."}
          </p>
        </article>

        <article>
          <span>Selected amount</span>
          <strong>{money(selectedTotal, currencySymbol)}</strong>
          <p>Bulk payment amount for selected unpaid staff.</p>
        </article>

        <article>
          <span>Payment records</span>
          <strong>{summary.paymentRecords}</strong>
          <p>Staff payment records found for the selected period.</p>
        </article>
      </section>

      <section className="sp-toolbar">
        <div className="sp-view-tabs">
          <button
            type="button"
            className={viewMode === "payables" ? "active" : ""}
            onClick={() => setViewMode("payables")}
          >
            Payables
          </button>
          <button
            type="button"
            className={viewMode === "branches" ? "active" : ""}
            onClick={() => setViewMode("branches")}
          >
            Branches
          </button>
          <button
            type="button"
            className={viewMode === "payments" ? "active" : ""}
            onClick={() => setViewMode("payments")}
          >
            Payments
          </button>
          <button
            type="button"
            className={viewMode === "analytics" ? "active" : ""}
            onClick={() => setViewMode("analytics")}
          >
            Analytics
          </button>
        </div>
        <Chip tone="gray">
          {viewMode === "payables"
            ? filteredPayables.length
            : filteredBranchPayroll.length}{" "}
          record(s)
        </Chip>
      </section>

      <section className="sp-filter-card">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search staff, branch, receipt, reference..."
        />

        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as PeriodFilter)}
        >
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 31 days</option>
          <option value="term">Current term / all available</option>
          <option value="year">Last 365 days</option>
          <option value="all">All records</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
        >
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
      </section>

      {viewMode === "payables" && (
        <section className="sp-section">
          <div className="sp-section-head">
            <div>
              <p>Staff Payables</p>
              <h3>Staff ready for payment</h3>
            </div>
            <div className="sp-head-actions">
              <button type="button" onClick={selectAllVisibleUnpaid}>
                Select unpaid
              </button>
              <button type="button" onClick={clearSelection}>
                Clear
              </button>
              <button
                type="button"
                className="primary"
                disabled={!selectedPayables.length}
                onClick={openCheckoutForSelected}
              >
                Pay selected
              </button>
            </div>
          </div>

          <div className="sp-list">
            {filteredPayables.map((row) => {
              const checked = selectedKeys.includes(row.key);
              return (
                <article
                  key={row.key}
                  className={`sp-card ${checked ? "selected" : ""}`}
                >
                  <div className="sp-card-top">
                    <button
                      className={`sp-check ${checked ? "on" : ""}`}
                      type="button"
                      onClick={() => toggleSelected(row.key)}
                      aria-pressed={checked}
                    >
                      {checked ? "✓" : ""}
                    </button>
                    <div className="sp-avatar">👤</div>
                    <div className="sp-card-main">
                      <h3>{row.staffName}</h3>
                      <p>
                        {row.branchName} · {row.periodLabel}
                      </p>
                      <div className="sp-chip-row">
                        <Chip tone={statusTone(row.status)}>{row.status}</Chip>
                        <Chip tone={row.unpaid > 0 ? "orange" : "green"}>
                          {money(row.unpaid, currencySymbol)} unpaid
                        </Chip>
                        {row.staffPhone ? (
                          <Chip tone="blue">{row.staffPhone}</Chip>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="sp-mini-grid">
                    <MiniStat
                      label="Gross"
                      value={money(row.gross, currencySymbol)}
                    />
                    <MiniStat
                      label="Net"
                      value={money(row.net, currencySymbol)}
                    />
                    <MiniStat
                      label="Paid"
                      value={money(row.paid, currencySymbol)}
                    />
                    <MiniStat
                      label="Unpaid"
                      value={money(row.unpaid, currencySymbol)}
                    />
                    <MiniStat
                      label="Allowances"
                      value={money(row.allowances, currencySymbol)}
                    />
                    <MiniStat
                      label="Deductions"
                      value={money(row.deductions, currencySymbol)}
                    />
                  </div>

                  <div className="sp-action-row">
                    <button
                      type="button"
                      disabled={row.unpaid <= 0}
                      onClick={() => openCheckoutForPayable(row)}
                    >
                      Pay online
                    </button>
                    <button
                      type="button"
                      disabled={row.unpaid <= 0}
                      onClick={() => openManualPayment(row)}
                    >
                      Confirm manual
                    </button>
                  </div>
                </article>
              );
            })}

            {!filteredPayables.length && (
              <EmptyCard text="No staff payable matches your filters." />
            )}
          </div>
        </section>
      )}

      {viewMode === "branches" && (
        <section className="sp-section">
          <div className="sp-section-head">
            <div>
              <p>Branch Comparison</p>
              <h3>Payroll position by branch</h3>
            </div>
            <Chip tone="blue">School-wide</Chip>
          </div>

          <div className="sp-list">
            {filteredBranchPayroll.map((row) => (
              <article key={row.branchId || row.branchName} className="sp-card">
                <div className="sp-card-top">
                  <div className="sp-avatar">🏫</div>
                  <div className="sp-card-main">
                    <h3>{row.branchName}</h3>
                    <p>
                      {row.branchCode || "No branch code"} · {row.staffCount}{" "}
                      staff considered
                    </p>
                    <div className="sp-chip-row">
                      <Chip
                        tone={
                          row.paidRate >= 80
                            ? "green"
                            : row.paidRate < 50
                              ? "red"
                              : "orange"
                        }
                      >
                        {percent(row.paidRate)} paid
                      </Chip>
                      <Chip tone={row.unpaid > 0 ? "orange" : "green"}>
                        {money(row.unpaid, currencySymbol)} unpaid
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="sp-mini-grid">
                  <MiniStat
                    label="Net Payroll"
                    value={money(row.netPayroll, currencySymbol)}
                  />
                  <MiniStat
                    label="Paid"
                    value={money(row.paid, currencySymbol)}
                  />
                  <MiniStat
                    label="Unpaid"
                    value={money(row.unpaid, currencySymbol)}
                  />
                  <MiniStat label="Runs" value={row.payrollRuns} />
                  <MiniStat label="Profiles" value={row.payrollProfiles} />
                  <MiniStat
                    label="Coverage"
                    value={percent(row.coverageRate)}
                  />
                </div>
              </article>
            ))}

            {!filteredBranchPayroll.length && (
              <EmptyCard text="No branch payroll data matches your filters." />
            )}
          </div>
        </section>
      )}

      {viewMode === "payments" && (
        <section className="sp-table-card">
          <div className="sp-section-head">
            <div>
              <p>Payment Records</p>
              <h3>Staff payroll payment history</h3>
            </div>
            <Chip tone="gray">{paymentHistory.length} payment(s)</Chip>
          </div>

          <div className="sp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Staff</th>
                  <th>Branch</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((row) => (
                  <tr
                    key={String(
                      rowId(row) || row.receiptNumber || row.providerReference,
                    )}
                  >
                    <td>
                      {safeDate(row.paidAt || row.paymentDate || row.createdAt)}
                    </td>
                    <td>{row.staffName || staffDisplayName(row, teachers)}</td>
                    <td>{branchName(branches, row.branchId)}</td>
                    <td>
                      {money(
                        rowAmount(row),
                        row.currencySymbol ||
                          row.currencyCode ||
                          currencySymbol,
                      )}
                    </td>
                    <td>{row.method || row.provider || "manual"}</td>
                    <td>
                      {row.receiptNumber || row.providerReference || "Not set"}
                    </td>
                    <td>
                      <Chip tone={statusTone(row.status || row.paymentStatus)}>
                        {row.status || row.paymentStatus || "pending"}
                      </Chip>
                    </td>
                  </tr>
                ))}
                {!paymentHistory.length && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyCard text="No staff payment records found." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === "analytics" && (
        <>
          <Breakdown
            title="Payroll Status"
            items={breakdowns.payroll}
            symbol={currencySymbol}
          />
          <Breakdown
            title="Payroll Cost by Branch"
            items={breakdowns.branchCost}
            symbol={currencySymbol}
          />
        </>
      )}

      {checkout ? (
        <PaymentCheckout
          open={Boolean(checkout)}
          onClose={() => setCheckout(null)}
          title={checkout.title}
          description={checkout.description}
          amount={checkout.amount}
          currency={checkout.currency}
          planId="staff_payroll"
          onSuccess={recordCheckoutStarted}
          onError={(message) => setError(message)}
        />
      ) : null}

      {manualPayable ? (
        <div className="sp-drawer-layer">
          <button
            type="button"
            className="sp-drawer-overlay"
            onClick={() => setManualPayable(null)}
            aria-label="Close manual payment"
          />
          <aside className="sp-drawer">
            <div className="sp-drawer-head">
              <div>
                <p>Manual payroll payment</p>
                <h2>{manualPayable.staffName}</h2>
                <span>
                  {money(manualPayable.unpaid, currencySymbol)} unpaid
                </span>
              </div>
              <button type="button" onClick={() => setManualPayable(null)}>
                ✕
              </button>
            </div>

            <section className="sp-form-card">
              <div className="sp-note">
                <strong>Only confirm real payments</strong>
                <span>
                  Use this for cash, bank or manually verified payments. Online
                  gateway payments should be verified by the backend provider
                  flow.
                </span>
              </div>

              <div className="sp-form-grid">
                <label>
                  <span>Method</span>
                  <select
                    value={manualForm.method}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        method: event.target.value as ManualForm["method"],
                      }))
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>

                <label>
                  <span>Receipt Number</span>
                  <input
                    value={manualForm.receiptNumber}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        receiptNumber: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>Paid At</span>
                  <input
                    type="date"
                    value={manualForm.paidAt}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        paidAt: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="wide">
                  <span>Note</span>
                  <textarea
                    value={manualForm.note}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            <div className="sp-drawer-actions">
              <button
                type="button"
                className="sp-ghost-btn"
                onClick={() => setManualPayable(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sp-primary-btn"
                disabled={saving}
                onClick={confirmManualPayment}
              >
                {saving ? "Confirming..." : "Confirm Payment"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
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
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article
      className={`sp-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}
    >
      <div className="sp-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sp-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`sp-chip ${tone}`}>{children}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="sp-empty-card">
      <div className="sp-empty-icon">🧾</div>
      <h3>No payroll data</h3>
      <p>{text}</p>
    </section>
  );
}

function Breakdown({
  title,
  items,
  symbol,
}: {
  title: string;
  items: Breakdown[];
  symbol: string;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="sp-section">
      <div className="sp-section-head">
        <div>
          <p>Analytics</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{money(total, symbol)}</Chip>
      </div>

      <div className="sp-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="sp-breakdown-card">
            <div className="sp-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone="blue">{money(item.amount, symbol)}</Chip>
            </div>

            <div className="sp-bar-track">
              <div
                style={{
                  width: `${total ? Math.round((item.amount / total) * 100) : 0}%`,
                }}
              />
            </div>

            <div className="sp-chip-row">
              <Chip tone="gray">
                {total ? Math.round((item.amount / total) * 100) : 0}%
              </Chip>
            </div>
          </article>
        ))}

        {!items.length && (
          <EmptyCard
            text={`No ${title.toLowerCase()} found for this period.`}
          />
        )}
      </div>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes spSpin { to { transform: rotate(360deg); } }

.sp-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--sp-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111111);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.sp-page *, .sp-page *::before, .sp-page *::after { box-sizing: border-box; }
.sp-page button, .sp-page input, .sp-page select, .sp-page textarea { font: inherit; max-width: 100%; }

.sp-page input,
.sp-page select,
.sp-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111111));
  outline: none;
  font-weight: 750;
}

.sp-page textarea {
  min-height: 100px;
  padding-top: 12px;
  resize: vertical;
}

.sp-page input:focus,
.sp-page select:focus,
.sp-page textarea:focus {
  border-color: var(--sp-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--sp-primary) 12%, transparent);
}

.sp-page button:disabled { opacity: .58; cursor: not-allowed; }

.sp-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.sp-state-card h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sp-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.sp-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sp-primary) 18%, transparent);
  border-top-color: var(--sp-primary);
  animation: spSpin .8s linear infinite;
}

.sp-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--sp-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card-bg, var(--surface, #fff)), color-mix(in srgb, var(--sp-primary) 7%, var(--card-bg, #fff)) 72%);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.sp-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }

.sp-hero-icon,
.sp-context-icon,
.sp-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  background: var(--sp-primary);
  color: #fff;
}

.sp-hero-icon {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--sp-primary) 28%, transparent);
  font-size: 22px;
}

.sp-title-wrap { min-width: 0; }
.sp-title-wrap p, .sp-title-wrap h2, .sp-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-title-wrap p {
  margin: 0 0 2px;
  color: var(--sp-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sp-title-wrap h2 {
  margin: 0;
  color: var(--text, #111111);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.sp-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.sp-hero-actions,
.sp-head-actions,
.sp-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.sp-ghost-btn,
.sp-primary-btn,
.sp-head-actions button,
.sp-action-row button,
.sp-drawer-actions button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
}

.sp-ghost-btn,
.sp-head-actions button,
.sp-action-row button {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: var(--text, #111111);
}

.sp-primary-btn,
.sp-head-actions button.primary {
  border: 0;
  background: var(--sp-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--sp-primary) 25%, transparent);
}

.sp-notice,
.sp-error {
  margin-top: 10px;
  padding: 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.5;
}

.sp-notice {
  background: rgba(34,197,94,.10);
  border: 1px solid rgba(34,197,94,.22);
  color: #166534;
}

.sp-error {
  background: rgba(239,68,68,.10);
  border: 1px solid rgba(239,68,68,.22);
  color: #991b1b;
}

.sp-context-grid,
.sp-insight-grid,
.sp-summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.sp-context-grid article,
.sp-insight-grid article,
.sp-summary-card,
.sp-toolbar,
.sp-filter-card,
.sp-table-card,
.sp-card,
.sp-breakdown-card,
.sp-empty-card,
.sp-form-card {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.sp-context-grid article,
.sp-insight-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
}

.sp-insight-grid article { display: grid; gap: 4px; }

.sp-context-icon { width: 42px; height: 42px; border-radius: 16px; font-size: 20px; }

.sp-context-grid span,
.sp-insight-grid span,
.sp-section-head p,
.sp-form-grid span,
.sp-drawer-head p {
  display: block;
  color: var(--sp-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sp-context-grid strong,
.sp-insight-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sp-context-grid p,
.sp-insight-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.sp-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.sp-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.sp-summary-card.positive { background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card-bg, var(--surface, #fff))); }
.sp-summary-card.warning { background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card-bg, var(--surface, #fff))); }

.sp-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--sp-primary) 12%, var(--surface, #fff));
}

.sp-summary-card div:last-child { min-width: 0; }
.sp-summary-card strong, .sp-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-summary-card strong {
  color: var(--text, #111111);
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.sp-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.sp-toolbar,
.sp-filter-card,
.sp-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.sp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

.sp-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  width: min(520px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--sp-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sp-view-tabs button {
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

.sp-view-tabs button.active { background: var(--sp-primary); color: #fff; }

.sp-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.sp-section { margin-top: 16px; }

.sp-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.sp-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #111111);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sp-list,
.sp-breakdown-grid { display: grid; gap: 10px; }

.sp-card,
.sp-breakdown-card,
.sp-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.sp-card.selected {
  border-color: color-mix(in srgb, var(--sp-primary) 45%, transparent);
  box-shadow: 0 18px 38px color-mix(in srgb, var(--sp-primary) 14%, transparent);
}

.sp-card-top { display: flex; align-items: flex-start; gap: 10px; }

.sp-check {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 14px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: var(--surface, #fff);
  color: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.sp-check.on { background: var(--sp-primary); border-color: var(--sp-primary); }

.sp-avatar {
  width: 56px;
  height: 56px;
  border-radius: 19px;
  font-size: 22px;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.sp-card-main { min-width: 0; flex: 1; }

.sp-card-main h3 {
  margin: 0;
  color: var(--text, #111111);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sp-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.sp-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }

.sp-chip {
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
}

.sp-chip.green { background: rgba(34,197,94,.14); color: #15803d; }
.sp-chip.red { background: rgba(239,68,68,.14); color: #dc2626; }
.sp-chip.blue { background: rgba(59,130,246,.15); color: #1d4ed8; }
.sp-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.sp-chip.orange { background: rgba(245,158,11,.16); color: #b45309; }
.sp-chip.purple { background: rgba(147,51,234,.15); color: #7e22ce; }

.sp-mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }

.sp-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(0,0,0,.08));
  overflow: hidden;
}

.sp-mini-stat strong,
.sp-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-mini-stat strong { color: var(--text, #111111); font-size: 13px; font-weight: 1000; }
.sp-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }

.sp-breakdown-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }

.sp-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #111111);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.sp-bar-track div { height: 100%; border-radius: inherit; background: var(--sp-primary); }

.sp-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(0,0,0,.08));
}

.sp-table-scroll table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, #fff));
}

.sp-table-scroll th,
.sp-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  text-align: left;
  vertical-align: top;
  color: var(--text, #111111);
  font-size: 13px;
}

.sp-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--sp-primary) 6%, var(--card-bg, #fff));
}

.sp-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.sp-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--sp-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.sp-empty-card h3 { margin: 0; color: var(--text, #111111); font-size: 18px; font-weight: 1000; }
.sp-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.sp-drawer-layer { position: fixed; inset: 0; z-index: 80; display: flex; justify-content: flex-end; }
.sp-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15,23,42,.42); backdrop-filter: blur(8px); cursor: pointer; }
.sp-drawer { position: relative; z-index: 1; width: min(560px, 100%); height: 100dvh; overflow-y: auto; padding: 12px; padding-bottom: max(22px, env(safe-area-inset-bottom)); background: var(--bg, #f7f8fb); box-shadow: -24px 0 60px rgba(15,23,42,.18); }
.sp-drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 14px; border-radius: 24px; background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); }
.sp-drawer-head h2 { margin: 2px 0 0; font-size: 24px; font-weight: 1000; letter-spacing: -.05em; }
.sp-drawer-head span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.sp-drawer-head button { width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--border, rgba(0,0,0,.10)); background: var(--surface, #fff); cursor: pointer; font-weight: 1000; }
.sp-form-card { margin-top: 10px; padding: 12px; border-radius: 24px; }
.sp-note { display: grid; gap: 3px; padding: 10px; border-radius: 18px; background: color-mix(in srgb, var(--sp-primary) 8%, var(--surface, #fff)); border: 1px solid color-mix(in srgb, var(--sp-primary) 15%, transparent); margin-bottom: 10px; }
.sp-note strong { font-weight: 1000; }
.sp-note span { color: var(--muted, #64748b); font-size: 12px; line-height: 1.45; }
.sp-form-grid { display: grid; grid-template-columns: 1fr; gap: 9px; }
.sp-form-grid label { display: grid; gap: 5px; min-width: 0; }
.sp-form-grid .wide { grid-column: 1 / -1; }
.sp-drawer-actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; padding: 10px; border-radius: 22px; background: color-mix(in srgb, var(--bg, #f7f8fb) 84%, transparent); backdrop-filter: blur(10px); border: 1px solid var(--border, rgba(0,0,0,.08)); }

@media (min-width: 680px) {
  .sp-page { padding: calc(12px * var(--local-density-scale, 1)); }
  .sp-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sp-context-grid, .sp-insight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sp-filter-card { grid-template-columns: minmax(0, 1fr) 220px 180px; }
  .sp-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sp-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .sp-page { padding: calc(16px * var(--local-density-scale, 1)); }
  .sp-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .sp-list, .sp-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .sp-page { padding: calc(6px * var(--local-density-scale, 1)); }
  .sp-hero { flex-direction: column; border-radius: 22px; }
  .sp-hero-actions, .sp-head-actions, .sp-action-row, .sp-drawer-actions { display: grid; grid-template-columns: 1fr; }
  .sp-hero-actions button, .sp-head-actions button, .sp-action-row button, .sp-drawer-actions button { width: 100%; }
  .sp-toolbar { flex-direction: column; align-items: stretch; }
  .sp-view-tabs { width: 100%; border-radius: 22px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
