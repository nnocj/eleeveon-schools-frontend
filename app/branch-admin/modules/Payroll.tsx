"use client";

/**
 * app/branch-admin/modules/Payroll.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH TEACHER PAYROLL V2
 * ---------------------------------------------------------
 * Golden Standard Finance Module.
 * Branch-scoped, offline-first, mobile-first, syncUtils powered.
 *
 * Purpose:
 * - Let a Branch Admin set teachers/staff on payroll.
 * - Create payroll profiles with salary, allowance, deduction and payment method.
 * - Generate payroll runs and payroll items.
 * - Record staff salary payments with references/receipt numbers for future Teacher Portal salary history.
 *
 * Golden UI behavior:
 * - no hero card
 * - compact search + inline add + slider filter + More sheet
 * - one visible section at a time
 * - profiles, salary setup table, runs, payroll items, payments, receipts and analytics views
 * - bottom sheets/drawers for forms and filters
 * - dark-mode safe table headers and surfaces
 *
 * Tables used:
 * - teachers
 * - staffPayrollProfiles
 * - payrollRuns
 * - payrollItems
 * - staffPaymentRecords
 * - schoolCurrencySettings
 *
 * Sync behavior:
 * - createLocal(...) creates payroll records
 * - updateLocal(...) updates payroll records
 * - softDeleteLocal(...) archives records
 * - listActiveLocal(...) reads active branch-scoped rows
 * - no manual sync/version fields are written directly here
 *
 * Workspace source fix:
 * - Resolves the active school/branch from eleeveon_open_workspace first.
 * - Falls back to active membership, ActiveBranchContext, settings, then storage.
 * - Prevents stale branch payroll data after role/workspace switching.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import {
  createLocal,
  listActiveLocal,
  softDeleteLocal,
  updateLocal,
} from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type AnyRow = Record<string, any>;

type PayrollItemRow = AnyRow & {
  paid: number;
  grossPay: number;
  netPay: number;
  balance: number;
  computedStatus: string;
};
type ViewMode =
  | "profiles"
  | "profilesTable"
  | "runs"
  | "payments"
  | "paymentsTable"
  | "receipts"
  | "table"
  | "analytics";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";
type PayType =
  | "monthly"
  | "weekly"
  | "daily"
  | "hourly"
  | "contract"
  | "commission";
type PayMethod = "cash" | "momo" | "bank" | "card" | "manual";
type RunStatus =
  | "draft"
  | "review"
  | "approved"
  | "processing"
  | "paid"
  | "cancelled";
type ItemStatus = "pending" | "approved" | "paid" | "failed" | "cancelled";
type StatusFilter = "all" | RunStatus | ItemStatus | "active" | "inactive";

type ProfileForm = {
  id: string;
  teacherId: string;
  fullName: string;
  role: string;
  payType: PayType;
  baseSalary: string;
  allowanceDefault: string;
  deductionDefault: string;
  preferredPaymentMethod: PayMethod;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  momoNetwork: string;
  momoNumber: string;
  momoName: string;
  currencyCode: string;
  currencySymbol: string;
  active: boolean;
};

type RunForm = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  note: string;
};

type PaymentForm = {
  payrollItemId: string;
  amount: string;
  method: PayMethod;
  provider: string;
  referenceNumber: string;
  receiptNumber: string;
  paidAt: string;
  note: string;
};

const emptyProfileForm: ProfileForm = {
  id: "",
  teacherId: "",
  fullName: "",
  role: "teacher",
  payType: "monthly",
  baseSalary: "",
  allowanceDefault: "0",
  deductionDefault: "0",
  preferredPaymentMethod: "momo",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  momoNetwork: "mtn",
  momoNumber: "",
  momoName: "",
  currencyCode: "GHS",
  currencySymbol: "₵",
  active: true,
};

const emptyRunForm: RunForm = {
  id: "",
  title: "",
  periodStart: new Date().toISOString().slice(0, 10),
  periodEnd: new Date().toISOString().slice(0, 10),
  payDate: new Date().toISOString().slice(0, 10),
  note: "",
};

const emptyPaymentForm: PaymentForm = {
  payrollItemId: "",
  amount: "",
  method: "momo",
  provider: "manual",
  referenceNumber: "",
  receiptNumber: "",
  paidAt: new Date().toISOString().slice(0, 10),
  note: "",
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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

function cleanId(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function idOf(row?: AnyRow | null): string {
  return cleanId(row?.id ?? row?.payload?.id);
}

function sameScope(
  row: AnyRow,
  accountId?: string | null,
  schoolId?: string,
  branchId?: string,
) {
  if (!row || row.isDeleted === true) return false;
  if (accountId && row.accountId && row.accountId !== accountId) return false;
  if (schoolId && String(row.schoolId ?? "") !== String(schoolId ?? ""))
    return false;
  if (branchId && String(row.branchId ?? "") !== String(branchId ?? ""))
    return false;
  return true;
}

function rowName(row?: AnyRow | null) {
  return text(
    row?.fullName || row?.name || row?.title || row?.label || row?.email,
    "Unnamed",
  );
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

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "active", "approved"].includes(value)) return "green";
  if (["failed", "cancelled", "inactive"].includes(value)) return "red";
  if (["processing", "review", "pending"].includes(value)) return "orange";
  if (["draft"].includes(value)) return "blue";
  return "gray";
}

function methodTone(method?: string): Tone {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "green";
  if (value === "momo") return "orange";
  if (value === "bank") return "blue";
  if (value === "card") return "purple";
  return "gray";
}

function monthTitle() {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`pr-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="pr-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="pr-empty">
      <div>🧾</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function PayrollPage() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeMembership } = useActiveMembership() as any;
  const { activeSchoolId, activeBranchId, activeSchool, activeBranch } =
    useActiveBranch();
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
    ],
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
    ],
  );

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("profiles");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PayMethod>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileDrawer, setProfileDrawer] = useState(false);
  const [runDrawer, setRunDrawer] = useState(false);
  const [paymentDrawer, setPaymentDrawer] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [currencySettings, setCurrencySettings] = useState<AnyRow[]>([]);
  const [profiles, setProfiles] = useState<AnyRow[]>([]);
  const [runs, setRuns] = useState<AnyRow[]>([]);
  const [items, setItems] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [runForm, setRunForm] = useState<RunForm>({
    ...emptyRunForm,
    title: monthTitle(),
  });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  function showToast(tone: ToastTone, message: string) {
    setToast({ tone, message });
    window.setTimeout(
      () =>
        setToast((current) => (current?.message === message ? null : current)),
      4200,
    );
  }

  async function load() {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        teacherRows,
        currencyRows,
        profileRows,
        runRows,
        itemRows,
        paymentRows,
      ] = await Promise.all([
        listActiveLocal<AnyRow>("teachers" as any),
        listActiveLocal<AnyRow>("schoolCurrencySettings" as any),
        listActiveLocal<AnyRow>("staffPayrollProfiles" as any),
        listActiveLocal<AnyRow>("payrollRuns" as any),
        listActiveLocal<AnyRow>("payrollItems" as any),
        listActiveLocal<AnyRow>("staffPaymentRecords" as any),
      ]);

      setTeachers(
        teacherRows
          .filter((row) => sameScope(row, accountId, schoolId, branchId))
          .sort((a, b) => rowName(a).localeCompare(rowName(b))),
      );
      setCurrencySettings(
        currencyRows.filter((row) =>
          sameScope(row, accountId, schoolId, branchId),
        ),
      );
      setProfiles(
        profileRows.filter((row) =>
          sameScope(row, accountId, schoolId, branchId),
        ),
      );
      setRuns(
        runRows.filter((row) => sameScope(row, accountId, schoolId, branchId)),
      );
      setItems(
        itemRows.filter((row) => sameScope(row, accountId, schoolId, branchId)),
      );
      setPayments(
        paymentRows.filter((row) =>
          sameScope(row, accountId, schoolId, branchId),
        ),
      );
    } catch (error) {
      console.error("Failed to load payroll:", error);
      showToast("error", "Failed to load payroll.");
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
    const preferred =
      currencySettings.find(
        (row) => row.defaultForPayroll || row.active !== false,
      ) || currencySettings[0];
    return {
      code: text(
        preferred?.currencyCode ||
          profiles[0]?.currencyCode ||
          items[0]?.currencyCode,
        "GHS",
      ),
      symbol: text(preferred?.currencySymbol, "₵"),
      name: text(preferred?.currencyName, "Ghana Cedi"),
    };
  }, [currencySettings, items, profiles]);

  const teacherMap = useMemo(
    () => new Map(teachers.map((item) => [idOf(item), rowName(item)])),
    [teachers],
  );
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [idOf(item), item])),
    [profiles],
  );
  const runMap = useMemo(
    () => new Map(runs.map((item) => [idOf(item), item])),
    [runs],
  );

  const filteredProfiles = useMemo(() => {
    const q = query.toLowerCase().trim();
    return profiles
      .filter((row) => {
        if (statusFilter === "active") return row.active !== false;
        if (statusFilter === "inactive") return row.active === false;
        return true;
      })
      .filter(
        (row) =>
          methodFilter === "all" ||
          String(row.preferredPaymentMethod || "") === methodFilter,
      )
      .filter((row) => {
        if (!q) return true;
        return [
          row.fullName,
          row.role,
          row.payType,
          row.momoNumber,
          row.bankAccountNumber,
          row.preferredPaymentMethod,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => rowName(a).localeCompare(rowName(b)));
  }, [methodFilter, profiles, query, statusFilter]);

  const filteredRuns = useMemo(() => {
    const q = query.toLowerCase().trim();
    return runs
      .filter(
        (row) =>
          statusFilter === "all" ||
          ["active", "inactive"].includes(statusFilter) ||
          String(row.status || "draft") === statusFilter,
      )
      .filter((row) => {
        if (!q) return true;
        return [row.title, row.status, row.note]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) =>
          n(b.payDate || b.periodEnd || b.updatedAt || b.createdAt) -
          n(a.payDate || a.periodEnd || a.updatedAt || a.createdAt),
      );
  }, [query, runs, statusFilter]);

  const payrollItemRows = useMemo<PayrollItemRow[]>(() => {
    const q = query.toLowerCase().trim();
    return items
      .map((item) => {
        const paid = payments
          .filter(
            (payment) =>
              cleanId(payment.payrollItemId) === idOf(item),
          )
          .filter((payment) =>
            ["paid", "success", "succeeded"].includes(
              String(payment.status || "paid").toLowerCase(),
            ),
          )
          .reduce((sum, payment) => sum + n(payment.amount), 0);
        const grossPay =
          n(item.grossPay || item.baseSalary) + n(item.allowance);
        const netPay = n(
          item.netPay || Math.max(0, grossPay - n(item.deduction)),
        );
        const balance = Math.max(0, netPay - paid);
        const computedStatus =
          balance <= 0 && netPay > 0
            ? "paid"
            : paid > 0
              ? "approved"
              : item.status || "pending";
        return {
          ...(item as AnyRow),
          paid,
          grossPay,
          netPay,
          balance,
          computedStatus,
        } as PayrollItemRow;
      })
      .filter(
        (item) =>
          statusFilter === "all" ||
          ["active", "inactive"].includes(statusFilter) ||
          String(item.computedStatus || item.status) === statusFilter,
      )
      .filter(
        (item) =>
          methodFilter === "all" ||
          String(item.paymentMethod || item.preferredPaymentMethod || "") ===
            methodFilter,
      )
      .filter((item) => {
        if (!q) return true;
        const profile = profileMap.get(
          cleanId(item.staffPayrollProfileId || item.profileId),
        );
        const run = runMap.get(cleanId(item.payrollRunId));
        return [
          item.fullName,
          profile?.fullName,
          run?.title,
          item.status,
          item.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) => n(b.updatedAt || b.createdAt) - n(a.updatedAt || a.createdAt),
      );
  }, [items, methodFilter, payments, profileMap, query, runMap, statusFilter]);

  const filteredPayments = useMemo(() => {
    const q = query.toLowerCase().trim();
    return payments
      .filter(
        (row) =>
          methodFilter === "all" ||
          String(row.method || row.paymentMethod || "") === methodFilter,
      )
      .filter(
        (row) =>
          statusFilter === "all" ||
          ["active", "inactive"].includes(statusFilter) ||
          String(row.status || "paid") === statusFilter,
      )
      .filter((row) => {
        if (!q) return true;
        return [
          row.fullName,
          row.recipientName,
          row.referenceNumber,
          row.receiptNumber,
          row.method,
          row.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) =>
          n(b.paidAt || b.date || b.createdAt) -
          n(a.paidAt || a.date || a.createdAt),
      );
  }, [methodFilter, payments, query, statusFilter]);

  const summary = useMemo(() => {
    const activeProfiles = profiles.filter(
      (row) => row.active !== false,
    ).length;
    const monthlyCost = profiles
      .filter((row) => row.active !== false)
      .reduce(
        (sum, row) =>
          sum +
          Math.max(
            0,
            n(row.baseSalary) +
              n(row.allowanceDefault) -
              n(row.deductionDefault),
          ),
        0,
      );
    const runTotal = payrollItemRows.reduce(
      (sum, row) => sum + n(row.netPay),
      0,
    );
    const paid = payrollItemRows.reduce((sum, row) => sum + n(row.paid), 0);
    const balance = payrollItemRows.reduce(
      (sum, row) => sum + n(row.balance),
      0,
    );
    return {
      profiles: profiles.length,
      activeProfiles,
      runs: runs.length,
      items: payrollItemRows.length,
      payments: payments.length,
      monthlyCost,
      runTotal,
      paid,
      balance,
      pendingItems: payrollItemRows.filter(
        (row) => String(row.computedStatus || row.status) !== "paid",
      ).length,
      paidItems: payrollItemRows.filter(
        (row) => String(row.computedStatus || row.status) === "paid",
      ).length,
    };
  }, [payments.length, payrollItemRows, profiles, runs.length]);

  const activeFilterCount = useMemo(
    () =>
      [statusFilter !== "all", methodFilter !== "all"].filter(Boolean).length,
    [methodFilter, statusFilter],
  );

  function openProfileDrawer(existing?: AnyRow) {
    const preferred = currency;
    setMessage("");
    setProfileForm(
      existing
        ? {
            id: cleanId(idOf(existing)),
            teacherId: existing.teacherId ? String(existing.teacherId) : "",
            fullName: text(existing.fullName),
            role: text(existing.role, "teacher"),
            payType: (existing.payType || "monthly") as PayType,
            baseSalary: String(existing.baseSalary || ""),
            allowanceDefault: String(existing.allowanceDefault || 0),
            deductionDefault: String(existing.deductionDefault || 0),
            preferredPaymentMethod: (existing.preferredPaymentMethod ||
              "momo") as PayMethod,
            bankName: text(existing.bankName),
            bankAccountName: text(existing.bankAccountName),
            bankAccountNumber: text(existing.bankAccountNumber),
            momoNetwork: text(existing.momoNetwork, "mtn"),
            momoNumber: text(existing.momoNumber),
            momoName: text(existing.momoName),
            currencyCode: text(existing.currencyCode, preferred.code),
            currencySymbol: text(existing.currencySymbol, preferred.symbol),
            active: existing.active !== false,
          }
        : {
            ...emptyProfileForm,
            currencyCode: preferred.code,
            currencySymbol: preferred.symbol,
          },
    );
    setProfileDrawer(true);
  }

  function openRunDrawer(existing?: AnyRow) {
    setMessage("");
    setRunForm(
      existing
        ? {
            id: cleanId(idOf(existing)),
            title: text(existing.title, monthTitle()),
            periodStart: text(
              existing.periodStart,
              new Date().toISOString().slice(0, 10),
            ),
            periodEnd: text(
              existing.periodEnd,
              new Date().toISOString().slice(0, 10),
            ),
            payDate: text(
              existing.payDate,
              new Date().toISOString().slice(0, 10),
            ),
            note: text(existing.note),
          }
        : { ...emptyRunForm, title: monthTitle() },
    );
    setRunDrawer(true);
  }

  function openPaymentDrawer(item?: AnyRow) {
    setMessage("");
    const itemId = item ? String(idOf(item)) : "";
    const amount = item ? n((item as any).balance ?? item.netPay) : 0;
    setPaymentForm({
      ...emptyPaymentForm,
      payrollItemId: itemId,
      amount: amount ? String(amount) : "",
    });
    setPaymentDrawer(true);
  }

  async function saveProfile() {
    if (!accountId || !schoolId || !branchId)
      return setMessage("Select a school and branch before saving payroll.");
    const teacherId = cleanId(profileForm.teacherId);
    const teacher = teachers.find(
      (row) => String(idOf(row) ?? "") === String(teacherId ?? ""),
    );
    const fullName = text(
      profileForm.fullName || teacher?.fullName || rowName(teacher),
    );
    if (!fullName || fullName === "Unnamed")
      return setMessage("Select a teacher or enter staff name.");
    if (n(profileForm.baseSalary) <= 0) return setMessage("Enter base salary.");

    setSaving(true);
    try {
      const payload: AnyRow = {
        accountId: String(accountId),
        schoolId,
        branchId,
        teacherId: teacherId || undefined,
        fullName,
        role: profileForm.role || teacher?.role || "teacher",
        payType: profileForm.payType,
        baseSalary: n(profileForm.baseSalary),
        allowanceDefault: n(profileForm.allowanceDefault),
        deductionDefault: n(profileForm.deductionDefault),
        preferredPaymentMethod: profileForm.preferredPaymentMethod,
        bankName: profileForm.bankName.trim(),
        bankAccountName: profileForm.bankAccountName.trim(),
        bankAccountNumber: profileForm.bankAccountNumber.trim(),
        momoNetwork: profileForm.momoNetwork.trim(),
        momoNumber: profileForm.momoNumber.trim(),
        momoName: profileForm.momoName.trim(),
        currencyCode: profileForm.currencyCode || currency.code,
        currencySymbol: profileForm.currencySymbol || currency.symbol,
        active: profileForm.active,
        isDeleted: false,
      };
      if (profileForm.id)
        await updateLocal(
          "staffPayrollProfiles" as any,
          profileForm.id,
          payload,
        );
      else await createLocal("staffPayrollProfiles" as any, payload);
      setProfileDrawer(false);
      showToast(
        "success",
        profileForm.id ? "Payroll profile updated." : "Payroll profile saved.",
      );
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to save payroll profile.");
    } finally {
      setSaving(false);
    }
  }

  async function generateRun() {
    if (!accountId || !schoolId || !branchId)
      return setMessage(
        "Select a school and branch before creating payroll run.",
      );
    const activeProfiles = profiles.filter((row) => row.active !== false);
    if (!activeProfiles.length)
      return setMessage("Create active payroll profiles first.");

    setSaving(true);
    try {
      const totalGross = activeProfiles.reduce(
        (sum, row) => sum + n(row.baseSalary) + n(row.allowanceDefault),
        0,
      );
      const totalDeductions = activeProfiles.reduce(
        (sum, row) => sum + n(row.deductionDefault),
        0,
      );
      const totalNet = Math.max(0, totalGross - totalDeductions);
      const createdRun = (await createLocal(
        "payrollRuns" as any,
        {
          accountId: String(accountId),
          schoolId,
          branchId,
          title: runForm.title || monthTitle(),
          periodStart: runForm.periodStart,
          periodEnd: runForm.periodEnd,
          payDate: runForm.payDate,
          status: "draft",
          totalGross,
          totalDeductions,
          totalNet,
          note: runForm.note,
          currencyCode: currency.code,
          currencySymbol: currency.symbol,
          active: true,
          isDeleted: false,
        } as AnyRow,
      )) as AnyRow | undefined;

      const payrollRunId = cleanId(idOf(createdRun));
      if (!payrollRunId)
        throw new Error(
          "Payroll run was created but its local id could not be resolved.",
        );

      for (const profile of activeProfiles) {
        const grossPay = n(profile.baseSalary) + n(profile.allowanceDefault);
        const deduction = n(profile.deductionDefault);
        const netPay = Math.max(0, grossPay - deduction);
        await createLocal(
          "payrollItems" as any,
          {
            accountId: String(accountId),
            schoolId,
            branchId,
            payrollRunId,
            staffPayrollProfileId: cleanId(idOf(profile)),
            teacherId: cleanId(profile.teacherId),
            fullName: profile.fullName,
            role: profile.role,
            baseSalary: n(profile.baseSalary),
            allowance: n(profile.allowanceDefault),
            deduction,
            grossPay,
            netPay,
            amountPaid: 0,
            balance: netPay,
            status: "pending",
            paymentMethod: profile.preferredPaymentMethod || "momo",
            currencyCode: profile.currencyCode || currency.code,
            currencySymbol: profile.currencySymbol || currency.symbol,
            active: true,
            isDeleted: false,
          } as AnyRow,
        );
      }

      setRunDrawer(false);
      showToast("success", "Payroll run generated.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to generate payroll run.");
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!accountId || !schoolId || !branchId)
      return setMessage("Select a school and branch before recording payment.");
    const payrollItemId = cleanId(paymentForm.payrollItemId);
    const item: AnyRow | undefined =
      (payrollItemRows.find(
        (row) => String(idOf(row) ?? "") === String(payrollItemId ?? ""),
      ) as AnyRow | undefined) ??
      (items.find(
        (row) => String(idOf(row) ?? "") === String(payrollItemId ?? ""),
      ) as AnyRow | undefined);
    const amount = n(paymentForm.amount);
    if (!item) return setMessage("Select a payroll item.");
    if (amount <= 0) return setMessage("Enter payment amount.");

    const previousPaid = n((item as any).paid || item.amountPaid);
    const netPay = n((item as any).netPay);
    const newPaid = Math.min(netPay, previousPaid + amount);
    const balance = Math.max(0, netPay - newPaid);
    const nextStatus = balance <= 0 ? "paid" : "approved";

    setSaving(true);
    try {
      await createLocal(
        "staffPaymentRecords" as any,
        {
          accountId: String(accountId),
          schoolId,
          branchId,
          payrollItemId,
          payrollRunId: cleanId(item.payrollRunId),
          staffPayrollProfileId: cleanId(
            item.staffPayrollProfileId || item.profileId,
          ),
          teacherId: cleanId(item.teacherId),
          fullName: item.fullName,
          amount,
          method: paymentForm.method,
          provider: paymentForm.provider || "manual",
          status: "paid",
          referenceNumber: paymentForm.referenceNumber,
          receiptNumber:
            paymentForm.receiptNumber ||
            `SAL-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          paidAt: paymentForm.paidAt || new Date().toISOString().slice(0, 10),
          note: paymentForm.note,
          currencyCode: item.currencyCode || currency.code,
          currencySymbol: item.currencySymbol || currency.symbol,
          active: true,
          isDeleted: false,
        } as AnyRow,
      );

      await updateLocal("payrollItems" as any, payrollItemId, {
        amountPaid: newPaid,
        balance,
        status: nextStatus,
        paidAt: nextStatus === "paid" ? paymentForm.paidAt : item.paidAt,
      } as AnyRow);

      setPaymentDrawer(false);
      showToast("success", "Staff payment recorded.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to record staff payment.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(row: AnyRow) {
    const id = cleanId(idOf(row));
    if (!id) return;
    if (
      !window.confirm(`Delete payroll profile for ${row.fullName || "staff"}?`)
    )
      return;
    try {
      await softDeleteLocal("staffPayrollProfiles" as any, id);
      showToast("success", "Payroll profile deleted.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete profile.");
    }
  }

  async function deleteRun(row: AnyRow) {
    const id = cleanId(idOf(row));
    if (!id) return;
    if (
      !window.confirm(
        `Delete payroll run ${row.title || "record"}? Payroll items will also be archived.`,
      )
    )
      return;
    try {
      await softDeleteLocal("payrollRuns" as any, id);
      for (const item of items.filter(
        (entry) => cleanId(entry.payrollRunId) === id,
      )) {
        const itemId = cleanId(idOf(item));
        if (itemId) await softDeleteLocal("payrollItems" as any, itemId);
      }
      showToast("success", "Payroll run deleted.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Failed to delete payroll run.");
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return (
      <State
        primary={primary}
        title="Opening payroll..."
        text="Loading branch teachers, payroll profiles, runs and payments."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before managing branch payroll."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <State
        primary={primary}
        title="Select branch context"
        text="Payroll is branch-scoped. Choose an active school and branch before continuing."
      />
    );
  }

  return (
    <main
      className="pr-page"
      style={{ "--pr-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`pr-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      <section
        className="pr-search-card"
        aria-label="Payroll search and actions"
      >
        <span
          className={`status-dot-mini ${summary.balance ? "orange" : summary.profiles ? "green" : "gray"}`}
          title={`${summary.profiles} profile(s)`}
        />

        <label className="pr-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search payroll..."
            aria-label="Search payroll"
          />
        </label>

        <button
          type="button"
          className="pr-add-inline"
          onClick={() => openProfileDrawer()}
          aria-label="Add payroll profile"
        >
          +
        </button>

        <button
          type="button"
          className={`pr-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="pr-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {(statusFilter !== "all" || methodFilter !== "all" || query.trim()) && (
        <section className="pr-filter-chips" aria-label="Active filters">
          {statusFilter !== "all" && (
            <button type="button" onClick={() => setStatusFilter("all")}>
              Status: {statusFilter.replaceAll("_", " ")} ×
            </button>
          )}
          {methodFilter !== "all" && (
            <button type="button" onClick={() => setMethodFilter("all")}>
              Method: {methodFilter} ×
            </button>
          )}
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")}>
              Search: {query.trim()} ×
            </button>
          )}
        </section>
      )}

      {view === "analytics" && (
        <AnalyticsView summary={summary} currency={currency.code} />
      )}

      {view === "profilesTable" && (
        <ProfilesTableView
          rows={filteredProfiles}
          currency={currency.code}
          openDrawer={openProfileDrawer}
          deleteProfile={deleteProfile}
        />
      )}

      {view === "table" && (
        <TableView
          rows={payrollItemRows}
          currency={currency.code}
          openPaymentDrawer={openPaymentDrawer}
        />
      )}

      {view === "profiles" && (
        <section className="pr-list">
          {filteredProfiles.map((row) => (
            <ProfileCard
              key={String(idOf(row))}
              row={row}
              currency={row.currencyCode || currency.code}
              openDrawer={openProfileDrawer}
              deleteProfile={deleteProfile}
            />
          ))}
          {!filteredProfiles.length && (
            <Empty
              title="No payroll profiles"
              text="Tap + to place teachers or staff on branch payroll."
            />
          )}
        </section>
      )}

      {view === "runs" && (
        <section className="pr-list">
          {filteredRuns.map((row) => (
            <RunCard
              key={String(idOf(row))}
              row={row}
              items={items.filter(
                (item) => cleanId(item.payrollRunId) === idOf(row),
              )}
              currency={row.currencyCode || currency.code}
              openDrawer={openRunDrawer}
              deleteRun={deleteRun}
            />
          ))}
          {!filteredRuns.length && (
            <Empty
              title="No payroll runs"
              text="Open More and generate a payroll run from active payroll profiles."
            />
          )}
        </section>
      )}

      {view === "payments" && (
        <section className="pr-list">
          {filteredPayments.map((row) => (
            <PaymentCard
              key={String(idOf(row))}
              row={row}
              currency={row.currencyCode || currency.code}
            />
          ))}
          {!filteredPayments.length && (
            <Empty
              title="No staff payments"
              text="Record salary payments from payroll items after generating a run."
            />
          )}
        </section>
      )}

      {view === "paymentsTable" && (
        <PaymentsTableView rows={filteredPayments} currency={currency.code} />
      )}

      {view === "receipts" && (
        <ReceiptsTableView rows={filteredPayments} currency={currency.code} />
      )}

      {filterOpen && (
        <FilterSheet
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          methodFilter={methodFilter}
          setMethodFilter={setMethodFilter}
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
          onProfile={() => {
            setMoreOpen(false);
            openProfileDrawer();
          }}
          onRun={() => {
            setMoreOpen(false);
            openRunDrawer();
          }}
          onPayment={() => {
            setMoreOpen(false);
            openPaymentDrawer();
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {profileDrawer && (
        <ProfileDrawer
          form={profileForm}
          setForm={setProfileForm}
          teachers={teachers}
          teacherMap={teacherMap}
          message={message}
          saving={saving}
          save={saveProfile}
          close={() => setProfileDrawer(false)}
        />
      )}

      {runDrawer && (
        <RunDrawer
          form={runForm}
          setForm={setRunForm}
          summary={summary}
          currency={currency.code}
          message={message}
          saving={saving}
          generate={generateRun}
          close={() => setRunDrawer(false)}
        />
      )}

      {paymentDrawer && (
        <PaymentDrawer
          form={paymentForm}
          setForm={setPaymentForm}
          items={payrollItemRows}
          currency={currency.code}
          message={message}
          saving={saving}
          record={recordPayment}
          close={() => setPaymentDrawer(false)}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text: body,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="pr-page"
      style={{ "--pr-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="pr-state">
        <div className="pr-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function ProfileCard({
  row,
  currency,
  openDrawer,
  deleteProfile,
}: {
  row: AnyRow;
  currency: string;
  openDrawer: (row: AnyRow) => void;
  deleteProfile: (row: AnyRow) => void;
}) {
  const net = Math.max(
    0,
    n(row.baseSalary) + n(row.allowanceDefault) - n(row.deductionDefault),
  );
  return (
    <article className="pay-row">
      <span className="pay-avatar">👨‍🏫</span>
      <span className="pay-main">
        <strong>{row.fullName || "Staff"}</strong>
        <small>
          {row.role || "teacher"} · {row.payType || "monthly"}
        </small>
        <em>
          {row.preferredPaymentMethod || "momo"} ·{" "}
          {row.momoNumber || row.bankAccountNumber || "No payout details"}
        </em>
      </span>
      <span className="pay-side">
        <Chip tone={row.active === false ? "red" : "green"}>
          {row.active === false ? "inactive" : money(net, currency)}
        </Chip>
        <button type="button" onClick={() => openDrawer(row)}>
          Edit
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => deleteProfile(row)}
        >
          ⌫
        </button>
      </span>
    </article>
  );
}

function RunCard({
  row,
  items,
  currency,
  openDrawer,
  deleteRun,
}: {
  row: AnyRow;
  items: AnyRow[];
  currency: string;
  openDrawer: (row: AnyRow) => void;
  deleteRun: (row: AnyRow) => void;
}) {
  const total =
    n(row.totalNet) || items.reduce((sum, item) => sum + n(item.netPay), 0);
  return (
    <article className="pay-row">
      <span className="pay-avatar">🧾</span>
      <span className="pay-main">
        <strong>{row.title || "Payroll Run"}</strong>
        <small>
          {dateLabel(row.periodStart)} - {dateLabel(row.periodEnd)}
        </small>
        <em>
          {items.length} staff item(s) · pay date {dateLabel(row.payDate)}
        </em>
      </span>
      <span className="pay-side">
        <Chip tone={statusTone(row.status)}>{row.status || "draft"}</Chip>
        <Chip tone="purple">{money(total, currency)}</Chip>
        <button type="button" onClick={() => openDrawer(row)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => deleteRun(row)}>
          ⌫
        </button>
      </span>
    </article>
  );
}

function PaymentCard({ row, currency }: { row: AnyRow; currency: string }) {
  return (
    <article className="pay-row">
      <span className="pay-avatar">💰</span>
      <span className="pay-main">
        <strong>{row.fullName || row.recipientName || "Staff Payment"}</strong>
        <small>
          {money(row.amount, currency)} · {dateLabel(row.paidAt || row.date)}
        </small>
        <em>
          {row.method || "momo"} ·{" "}
          {row.referenceNumber || row.receiptNumber || "No reference"}
        </em>
      </span>
      <span className="pay-side">
        <Chip tone={statusTone(row.status || "paid")}>
          {row.status || "paid"}
        </Chip>
      </span>
    </article>
  );
}

function PaymentsTableView({
  rows,
  currency,
}: {
  rows: AnyRow[];
  currency: string;
}) {
  return (
    <section className="pr-table-card">
      <div className="pr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Salary Payments ({rows.length})</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Provider</th>
              <th>Reference</th>
              <th>Receipt</th>
              <th>Date Paid</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(idOf(row))}>
                <td>
                  <strong>
                    {row.fullName || row.recipientName || "Staff Payment"}
                  </strong>
                  <span>
                    Item #{row.payrollItemId || "—"} · Run #
                    {row.payrollRunId || "—"}
                  </span>
                </td>
                <td>{money(row.amount, row.currencyCode || currency)}</td>
                <td>
                  <Chip tone={methodTone(row.method || row.paymentMethod)}>
                    {row.method || row.paymentMethod || "manual"}
                  </Chip>
                </td>
                <td>{row.provider || "manual"}</td>
                <td>{row.referenceNumber || "—"}</td>
                <td>{row.receiptNumber || "—"}</td>
                <td>{dateLabel(row.paidAt || row.date || row.createdAt)}</td>
                <td>
                  <Chip tone={statusTone(row.status || "paid")}>
                    {row.status || "paid"}
                  </Chip>
                </td>
                <td>{row.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="pr-empty-table">
            No salary payment matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function ReceiptsTableView({
  rows,
  currency,
}: {
  rows: AnyRow[];
  currency: string;
}) {
  return (
    <section className="pr-table-card">
      <div className="pr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Receipts ({rows.length})</th>
              <th>Staff</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Date</th>
              <th>Status</th>
              <th>Memo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const receipt =
                row.receiptNumber ||
                `PAY-${String(idOf(row) || "").padStart(4, "0")}`;
              return (
                <tr key={String(idOf(row))}>
                  <td>
                    <strong>{receipt}</strong>
                    <span>Payroll receipt</span>
                  </td>
                  <td>{row.fullName || row.recipientName || "Staff"}</td>
                  <td>{money(row.amount, row.currencyCode || currency)}</td>
                  <td>
                    <Chip tone={methodTone(row.method || row.paymentMethod)}>
                      {row.method || row.paymentMethod || "manual"}
                    </Chip>
                  </td>
                  <td>{row.referenceNumber || "—"}</td>
                  <td>{dateLabel(row.paidAt || row.date || row.createdAt)}</td>
                  <td>
                    <Chip tone={statusTone(row.status || "paid")}>
                      {row.status || "paid"}
                    </Chip>
                  </td>
                  <td>{row.note || "Salary payment recorded locally."}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="pr-empty-table">No receipt records yet.</div>
        )}
      </div>
    </section>
  );
}

function ProfilesTableView({
  rows,
  currency,
  openDrawer,
  deleteProfile,
}: {
  rows: AnyRow[];
  currency: string;
  openDrawer: (row: AnyRow) => void;
  deleteProfile: (row: AnyRow) => void;
}) {
  return (
    <section className="pr-table-card">
      <div className="pr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Payroll Profiles ({rows.length})</th>
              <th>Role</th>
              <th>Pay Type</th>
              <th>Base</th>
              <th>Allowance</th>
              <th>Deduction</th>
              <th>Net</th>
              <th>Method</th>
              <th>Payout</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const net = Math.max(
                0,
                n(row.baseSalary) +
                  n(row.allowanceDefault) -
                  n(row.deductionDefault),
              );
              const payout =
                row.preferredPaymentMethod === "bank"
                  ? [row.bankName, row.bankAccountNumber]
                      .filter(Boolean)
                      .join(" · ")
                  : row.preferredPaymentMethod === "momo"
                    ? [row.momoNetwork, row.momoNumber]
                        .filter(Boolean)
                        .join(" · ")
                    : row.preferredPaymentMethod || "manual";

              return (
                <tr key={String(idOf(row))}>
                  <td>
                    <strong>{row.fullName || "Staff"}</strong>
                    <span>
                      {row.teacherId
                        ? `Teacher ID ${row.teacherId}`
                        : "Manual payroll profile"}
                    </span>
                  </td>
                  <td>{row.role || "teacher"}</td>
                  <td>{row.payType || "monthly"}</td>
                  <td>{money(row.baseSalary, row.currencyCode || currency)}</td>
                  <td>
                    {money(row.allowanceDefault, row.currencyCode || currency)}
                  </td>
                  <td>
                    {money(row.deductionDefault, row.currencyCode || currency)}
                  </td>
                  <td>{money(net, row.currencyCode || currency)}</td>
                  <td>
                    <Chip tone={methodTone(row.preferredPaymentMethod)}>
                      {row.preferredPaymentMethod || "manual"}
                    </Chip>
                  </td>
                  <td>{payout || "Not set"}</td>
                  <td>
                    <Chip tone={row.active === false ? "red" : "green"}>
                      {row.active === false ? "inactive" : "active"}
                    </Chip>
                  </td>
                  <td>
                    <div className="pr-table-actions">
                      <button type="button" onClick={() => openDrawer(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteProfile(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="pr-empty-table">
            No payroll profile matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function TableView({
  rows,
  currency,
  openPaymentDrawer,
}: {
  rows: AnyRow[];
  currency: string;
  openPaymentDrawer: (item: AnyRow) => void;
}) {
  return (
    <section className="pr-table-card">
      <div className="pr-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Payroll Items ({rows.length})</th>
              <th>Run</th>
              <th>Gross</th>
              <th>Deductions</th>
              <th>Net</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(idOf(row))}>
                <td>
                  <strong>{row.fullName || "Staff"}</strong>
                  <span>{row.role || "staff"}</span>
                </td>
                <td>{row.payrollRunId || "Run"}</td>
                <td>{money(row.grossPay, row.currencyCode || currency)}</td>
                <td>{money(row.deduction, row.currencyCode || currency)}</td>
                <td>{money(row.netPay, row.currencyCode || currency)}</td>
                <td>{money(row.paid, row.currencyCode || currency)}</td>
                <td>{money(row.balance, row.currencyCode || currency)}</td>
                <td>
                  <Chip tone={statusTone(row.computedStatus || row.status)}>
                    {row.computedStatus || row.status || "pending"}
                  </Chip>
                </td>
                <td>
                  <div className="pr-table-actions">
                    {n(row.balance) > 0 ? (
                      <button
                        type="button"
                        onClick={() => openPaymentDrawer(row)}
                      >
                        Pay
                      </button>
                    ) : (
                      <button type="button" disabled>
                        Paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="pr-empty-table">
            No payroll item matches your filters.
          </div>
        )}
      </div>
    </section>
  );
}

function FilterSheet({
  statusFilter,
  setStatusFilter,
  methodFilter,
  setMethodFilter,
  onClose,
}: {
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  methodFilter: "all" | PayMethod;
  setMethodFilter: (value: "all" | PayMethod) => void;
  onClose: () => void;
}) {
  return (
    <div className="pr-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="pr-sheet small">
        <div className="pr-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose payroll status and payment method.</p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="pr-form compact">
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active Profiles</option>
              <option value="inactive">Inactive Profiles</option>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            <span>Payment Method</span>
            <select
              value={methodFilter}
              onChange={(event) =>
                setMethodFilter(event.target.value as "all" | PayMethod)
              }
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="momo">Momo</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
              <option value="manual">Manual</option>
            </select>
          </label>
        </div>
        <div className="pr-sheet-actions">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setMethodFilter("all");
            }}
          >
            Reset
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  view,
  setView,
  summary,
  currency,
  onProfile,
  onRun,
  onPayment,
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  summary: AnyRow;
  currency: string;
  onProfile: () => void;
  onRun: () => void;
  onPayment: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="pr-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="pr-sheet small">
        <div className="pr-sheet-head">
          <div>
            <h2>More</h2>
            <p>Views and payroll actions are kept here to save space.</p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="pr-menu-list">
          <button
            type="button"
            className={view === "profiles" ? "active" : ""}
            onClick={() => setView("profiles")}
          >
            <span>👨‍🏫</span>
            <b>Profiles</b>
            <small>{summary.activeProfiles} active payroll profile(s)</small>
          </button>
          <button
            type="button"
            className={view === "profilesTable" ? "active" : ""}
            onClick={() => setView("profilesTable")}
          >
            <span>☷</span>
            <b>Profiles table</b>
            <small>Dense salary and payout profile records</small>
          </button>
          <button
            type="button"
            className={view === "runs" ? "active" : ""}
            onClick={() => setView("runs")}
          >
            <span>🧾</span>
            <b>Runs</b>
            <small>{summary.runs} payroll run(s)</small>
          </button>
          <button
            type="button"
            className={view === "payments" ? "active" : ""}
            onClick={() => setView("payments")}
          >
            <span>💰</span>
            <b>Payments</b>
            <small>{summary.payments} staff payment card(s)</small>
          </button>
          <button
            type="button"
            className={view === "paymentsTable" ? "active" : ""}
            onClick={() => setView("paymentsTable")}
          >
            <span>☷</span>
            <b>Payments table</b>
            <small>Dense salary payment records</small>
          </button>
          <button
            type="button"
            className={view === "receipts" ? "active" : ""}
            onClick={() => setView("receipts")}
          >
            <span>🧾</span>
            <b>Receipts</b>
            <small>Receipt numbers and payment references</small>
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <span>☷</span>
            <b>Payroll items table</b>
            <small>Dense run item and payment balances</small>
          </button>
          <button
            type="button"
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>
              {money(summary.monthlyCost, currency)} monthly profile cost
            </small>
          </button>
          <button type="button" onClick={onProfile}>
            <span>＋</span>
            <b>New payroll profile</b>
            <small>Add teacher/staff to payroll</small>
          </button>
          <button type="button" onClick={onRun}>
            <span>⚙️</span>
            <b>Generate payroll run</b>
            <small>Create items from active profiles</small>
          </button>
          <button type="button" onClick={onPayment}>
            <span>💳</span>
            <b>Record payment</b>
            <small>Pay pending payroll item</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local payroll data</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfileDrawer({
  form,
  setForm,
  teachers,
  teacherMap,
  message,
  saving,
  save,
  close,
}: {
  form: ProfileForm;
  setForm: React.Dispatch<React.SetStateAction<ProfileForm>>;
  teachers: AnyRow[];
  teacherMap: Map<string, string>;
  message: string;
  saving: boolean;
  save: () => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="pr-drawer-layer" role="dialog" aria-modal="true">
      <button className="pr-drawer-overlay" type="button" onClick={close} />
      <aside className="pr-drawer">
        <div className="pr-drawer-head">
          <div>
            <p>{form.id ? "Edit Payroll Profile" : "New Payroll Profile"}</p>
            <h2>Teacher Payroll</h2>
            <span>
              {form.baseSalary
                ? money(
                    Math.max(
                      0,
                      n(form.baseSalary) +
                        n(form.allowanceDefault) -
                        n(form.deductionDefault),
                    ),
                    form.currencyCode,
                  )
                : "Set salary and payout details"}
            </span>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        {message && <section className="pr-inline-error">{message}</section>}
        <section className="pr-form-card">
          <div className="pr-form-grid">
            <label>
              <span>Teacher</span>
              <select
                value={form.teacherId}
                onChange={(event) => {
                  const teacher = teachers.find(
                    (row) => String(idOf(row)) === event.target.value,
                  );
                  setForm({
                    ...form,
                    teacherId: event.target.value,
                    fullName: teacher ? rowName(teacher) : form.fullName,
                    role: teacher?.role || form.role,
                  });
                }}
              >
                <option value="">Manual / Staff not linked</option>
                {teachers.map((item) => (
                  <option key={String(idOf(item))} value={String(idOf(item))}>
                    {teacherMap.get(idOf(item))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Full Name</span>
              <input
                value={form.fullName}
                onChange={(event) =>
                  setForm({ ...form, fullName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Role</span>
              <input
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              />
            </label>
            <label>
              <span>Pay Type</span>
              <select
                value={form.payType}
                onChange={(event) =>
                  setForm({ ...form, payType: event.target.value as PayType })
                }
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
                <option value="contract">Contract</option>
                <option value="commission">Commission</option>
              </select>
            </label>
            <label>
              <span>Base Salary</span>
              <input
                type="number"
                value={form.baseSalary}
                onChange={(event) =>
                  setForm({ ...form, baseSalary: event.target.value })
                }
              />
            </label>
            <label>
              <span>Allowance</span>
              <input
                type="number"
                value={form.allowanceDefault}
                onChange={(event) =>
                  setForm({ ...form, allowanceDefault: event.target.value })
                }
              />
            </label>
            <label>
              <span>Deduction</span>
              <input
                type="number"
                value={form.deductionDefault}
                onChange={(event) =>
                  setForm({ ...form, deductionDefault: event.target.value })
                }
              />
            </label>
            <label>
              <span>Preferred Method</span>
              <select
                value={form.preferredPaymentMethod}
                onChange={(event) =>
                  setForm({
                    ...form,
                    preferredPaymentMethod: event.target.value as PayMethod,
                  })
                }
              >
                <option value="momo">Momo</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              <span>Momo Network</span>
              <input
                value={form.momoNetwork}
                onChange={(event) =>
                  setForm({ ...form, momoNetwork: event.target.value })
                }
              />
            </label>
            <label>
              <span>Momo Number</span>
              <input
                value={form.momoNumber}
                onChange={(event) =>
                  setForm({ ...form, momoNumber: event.target.value })
                }
              />
            </label>
            <label>
              <span>Momo Name</span>
              <input
                value={form.momoName}
                onChange={(event) =>
                  setForm({ ...form, momoName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Bank Name</span>
              <input
                value={form.bankName}
                onChange={(event) =>
                  setForm({ ...form, bankName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Bank Account Name</span>
              <input
                value={form.bankAccountName}
                onChange={(event) =>
                  setForm({ ...form, bankAccountName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Bank Account Number</span>
              <input
                value={form.bankAccountNumber}
                onChange={(event) =>
                  setForm({ ...form, bankAccountNumber: event.target.value })
                }
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                value={form.currencyCode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currencyCode: event.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.value === "active" })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>
        <div className="pr-drawer-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function RunDrawer({
  form,
  setForm,
  summary,
  currency,
  message,
  saving,
  generate,
  close,
}: {
  form: RunForm;
  setForm: React.Dispatch<React.SetStateAction<RunForm>>;
  summary: AnyRow;
  currency: string;
  message: string;
  saving: boolean;
  generate: () => void | Promise<void>;
  close: () => void;
}) {
  return (
    <div className="pr-drawer-layer" role="dialog" aria-modal="true">
      <button className="pr-drawer-overlay" type="button" onClick={close} />
      <aside className="pr-drawer">
        <div className="pr-drawer-head">
          <div>
            <p>Generate Payroll Run</p>
            <h2>Payroll Run</h2>
            <span>
              {summary.activeProfiles} active profile(s) ·{" "}
              {money(summary.monthlyCost, currency)} estimated
            </span>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        {message && <section className="pr-inline-error">{message}</section>}
        <section className="pr-form-card">
          <div className="pr-form-grid">
            <label className="wide">
              <span>Title</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <label>
              <span>Period Start</span>
              <input
                type="date"
                value={form.periodStart}
                onChange={(event) =>
                  setForm({ ...form, periodStart: event.target.value })
                }
              />
            </label>
            <label>
              <span>Period End</span>
              <input
                type="date"
                value={form.periodEnd}
                onChange={(event) =>
                  setForm({ ...form, periodEnd: event.target.value })
                }
              />
            </label>
            <label>
              <span>Pay Date</span>
              <input
                type="date"
                value={form.payDate}
                onChange={(event) =>
                  setForm({ ...form, payDate: event.target.value })
                }
              />
            </label>
            <label className="wide">
              <span>Note</span>
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
          </div>
          <p className="pr-hint">
            This creates one payroll item for each active payroll profile. You
            can then record payments against the items.
          </p>
        </section>
        <div className="pr-drawer-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={generate}
          >
            {saving ? "Generating..." : "Generate Run"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function PaymentDrawer({
  form,
  setForm,
  items,
  currency,
  message,
  saving,
  record,
  close,
}: {
  form: PaymentForm;
  setForm: React.Dispatch<React.SetStateAction<PaymentForm>>;
  items: AnyRow[];
  currency: string;
  message: string;
  saving: boolean;
  record: () => void | Promise<void>;
  close: () => void;
}) {
  const selected = items.find(
    (row) => String(idOf(row)) === form.payrollItemId,
  );
  return (
    <div className="pr-drawer-layer" role="dialog" aria-modal="true">
      <button className="pr-drawer-overlay" type="button" onClick={close} />
      <aside className="pr-drawer">
        <div className="pr-drawer-head">
          <div>
            <p>Record Staff Payment</p>
            <h2>Salary Payment</h2>
            <span>
              {selected
                ? `${selected.fullName} · ${money(selected.balance, selected.currencyCode || currency)} balance`
                : "Select payroll item"}
            </span>
          </div>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        {message && <section className="pr-inline-error">{message}</section>}
        <section className="pr-form-card">
          <div className="pr-form-grid">
            <label className="wide">
              <span>Payroll Item</span>
              <select
                value={form.payrollItemId}
                onChange={(event) =>
                  setForm({ ...form, payrollItemId: event.target.value })
                }
              >
                <option value="">Select item</option>
                {items
                  .filter((row) => n(row.balance) > 0)
                  .map((item) => (
                    <option key={String(idOf(item))} value={String(idOf(item))}>
                      {item.fullName} ·{" "}
                      {money(item.balance, item.currencyCode || currency)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Amount</span>
              <input
                type="number"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </label>
            <label>
              <span>Method</span>
              <select
                value={form.method}
                onChange={(event) =>
                  setForm({ ...form, method: event.target.value as PayMethod })
                }
              >
                <option value="momo">Momo</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              <span>Date Paid</span>
              <input
                type="date"
                value={form.paidAt}
                onChange={(event) =>
                  setForm({ ...form, paidAt: event.target.value })
                }
              />
            </label>
            <label>
              <span>Reference</span>
              <input
                value={form.referenceNumber}
                onChange={(event) =>
                  setForm({ ...form, referenceNumber: event.target.value })
                }
              />
            </label>
            <label>
              <span>Receipt</span>
              <input
                value={form.receiptNumber}
                onChange={(event) =>
                  setForm({ ...form, receiptNumber: event.target.value })
                }
              />
            </label>
            <label className="wide">
              <span>Note</span>
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
          </div>
        </section>
        <div className="pr-drawer-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={record}
          >
            {saving ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function AnalyticsView({
  summary,
  currency,
}: {
  summary: AnyRow;
  currency: string;
}) {
  const rows = [
    { label: "Paid Items", value: summary.paidItems },
    { label: "Pending Items", value: summary.pendingItems },
  ];
  return (
    <section className="pr-analysis-grid">
      <article className="pr-analysis">
        <span>Active Payroll</span>
        <strong>{summary.activeProfiles}</strong>
        <p>{summary.profiles} staff payroll profile(s).</p>
      </article>
      <article className="pr-analysis">
        <span>Estimated Monthly Cost</span>
        <strong>{money(summary.monthlyCost, currency)}</strong>
        <p>Based on active payroll profiles.</p>
      </article>
      <article className="pr-analysis">
        <span>Generated Payroll</span>
        <strong>{money(summary.runTotal, currency)}</strong>
        <p>{summary.items} payroll item(s) currently shown.</p>
      </article>
      <article className="pr-analysis">
        <span>Outstanding</span>
        <strong>{money(summary.balance, currency)}</strong>
        <p>{summary.pendingItems} unpaid or partially settled item(s).</p>
      </article>
      <article className="pr-analysis wide">
        <span>Payment Completion</span>
        <strong>{summary.items}</strong>
        <div className="pr-analysis-list">
          {rows.map((row) => (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>{row.value}</small>
              </div>
              <div className="pr-progress">
                <i
                  style={{
                    width: `${Math.max(5, Math.round((row.value / Math.max(1, summary.items)) * 100))}%`,
                  }}
                />
              </div>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.pr-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--pr-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.pr-page *,.pr-page *::before,.pr-page *::after{box-sizing:border-box;min-width:0}.pr-page button,.pr-page input,.pr-page select,.pr-page textarea{font:inherit;max-width:100%}.pr-page button{-webkit-tap-highlight-color:transparent}.pr-page input,.pr-page select,.pr-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.pr-page textarea{min-height:110px;padding:12px;resize:vertical;line-height:1.5}.pr-page input:focus,.pr-page select:focus,.pr-page textarea:focus{border-color:color-mix(in srgb,var(--pr-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--pr-primary) 12%,transparent)}.pr-state,.pr-search-card,.pay-row,.pr-table-card,.pr-analysis,.pr-empty,.pr-sheet,.pr-form-card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.pr-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.pr-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--pr-primary) 18%,transparent);border-top-color:var(--pr-primary);animation:spin .8s linear infinite}.pr-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.pr-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.pr-toast{position:sticky;top:8px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px 14px;border-radius:18px;font-size:13px;font-weight:850;box-shadow:0 18px 40px rgba(15,23,42,.12)}.pr-toast.success{background:rgba(34,197,94,.14);color:#166534}.pr-toast.error,.pr-inline-error{background:rgba(239,68,68,.12);color:#991b1b}.pr-toast.info{background:rgba(59,130,246,.13);color:#1d4ed8}.pr-toast button{border:0;background:transparent;color:currentColor;font-weight:1000;cursor:pointer}.pr-inline-error{padding:10px 12px;border-radius:18px;font-size:12px;font-weight:850;margin-bottom:10px}.pr-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.pr-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.pr-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.pr-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.pr-icon-button,.pr-filter-button,.pr-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.pr-add-inline{border-color:var(--pr-primary);background:var(--pr-primary);color:#fff;font-size:25px;box-shadow:0 12px 28px color-mix(in srgb,var(--pr-primary) 22%,transparent)}.pr-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.pr-filter-button{position:relative;background:color-mix(in srgb,var(--pr-primary) 8%,var(--card-bg,#fff));color:var(--pr-primary)}.pr-filter-button.active{background:var(--pr-primary);color:#fff;border-color:var(--pr-primary)}.pr-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.pr-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.pr-filter-chips::-webkit-scrollbar{display:none}.pr-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--pr-primary) 11%,transparent);color:var(--pr-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.pr-list{display:grid;gap:8px;margin-top:10px}.pay-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left}.pay-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--pr-primary) 12%,var(--surface,#fff));font-size:22px}.pay-main,.pay-main strong,.pay-main small,.pay-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pay-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000}.pay-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.pay-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.pay-side{display:flex;align-items:center;gap:5px}.pay-side button{min-height:31px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-size:11px;font-weight:950;padding:0 9px;cursor:pointer}.pay-side button.danger{color:#991b1b;background:color-mix(in srgb,#dc2626 7%,var(--surface,#fff));border-color:color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)))}.pr-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.pr-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.pr-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.pr-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.pr-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.pr-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.pr-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.pr-sheet-backdrop,.pr-drawer-layer{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.pr-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.pr-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.pr-sheet-head,.pr-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.pr-sheet-head h2,.pr-drawer-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.pr-sheet-head p,.pr-drawer-head p{margin:0;color:var(--pr-primary);font-size:10px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase}.pr-sheet-head span,.pr-drawer-head span{display:block;margin-top:5px;color:var(--muted,#64748b);font-size:12px;font-weight:800}.pr-sheet-head button,.pr-drawer-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.pr-form{display:grid;gap:10px}.pr-form label{display:grid;gap:6px}.pr-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.pr-menu-list{display:grid;gap:8px}.pr-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.pr-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--pr-primary) 10%,transparent);color:var(--pr-primary);font-weight:1000}.pr-menu-list button b,.pr-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr-menu-list button b{font-size:13px;font-weight:1000}.pr-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.pr-menu-list button.active{border-color:color-mix(in srgb,var(--pr-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--pr-primary) 8%,var(--surface,#fff))}.pr-sheet-actions,.pr-drawer-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.pr-sheet-actions button,.pr-drawer-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.pr-sheet-actions button.primary,.pr-drawer-actions button.primary{border-color:var(--pr-primary);background:var(--pr-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--pr-primary) 25%,transparent)}.pr-table-card,.pr-analysis,.pr-empty,.pr-form-card{padding:13px;border-radius:24px}.pr-table-card{margin-top:10px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.pr-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.pr-table-scroll table{width:100%;min-width:980px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.pr-table-scroll th,.pr-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.pr-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--pr-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.pr-table-scroll td strong,.pr-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.pr-table-actions{display:flex;gap:7px;overflow-x:auto}.pr-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--pr-primary);border-radius:999px;padding:0 12px;background:var(--pr-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.pr-table-actions button:disabled{opacity:.55;cursor:not-allowed;background:color-mix(in srgb,var(--muted,#64748b) 20%,var(--surface,#fff));border-color:var(--border,rgba(0,0,0,.10));color:var(--muted,#64748b)}.pr-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.pr-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.pr-analysis{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.pr-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.pr-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.pr-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.pr-analysis-list{display:grid;gap:10px;margin-top:12px}.pr-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.pr-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.pr-analysis-list b,.pr-analysis-list small{font-size:12px}.pr-analysis-list small{color:var(--muted,#64748b);font-weight:850}.pr-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.pr-progress i{display:block;height:100%;border-radius:inherit;background:var(--pr-primary)}.pr-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed;margin-top:10px}.pr-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--pr-primary) 12%,var(--surface,#fff));font-size:28px}.pr-empty h3{margin:0;font-size:18px;font-weight:1000}.pr-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.pr-drawer-layer{place-items:stretch end;padding:0}.pr-drawer-overlay{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.pr-drawer{position:relative;z-index:1;width:min(720px,100%);height:100dvh;overflow-y:auto;padding:14px;background:var(--card-bg,var(--surface,#fff));box-shadow:-24px 0 80px rgba(15,23,42,.28)}.pr-form-card{display:grid;gap:10px}.pr-form-grid{display:grid;grid-template-columns:1fr;gap:10px}.pr-form-grid label{display:grid;gap:6px}.pr-form-grid label.wide{grid-column:1/-1}.pr-form-grid span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.pr-hint{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750;line-height:1.55}@media (min-width:680px){.pr-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.pr-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.pr-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pay-row{border-radius:24px;padding:12px;grid-template-columns:auto minmax(0,1fr)}.pay-side{grid-column:1/-1;justify-content:flex-end}.pr-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pr-analysis.wide{grid-column:span 2}.pr-sheet-backdrop{place-items:center;padding:18px}.pr-sheet{border-radius:28px;padding:18px}.pr-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.pr-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.pr-search-card,.pr-list,.pr-analysis-grid,.pr-table-card,.pr-filter-chips{max-width:1180px;margin-left:auto;margin-right:auto}.pr-list{grid-template-columns:repeat(3,minmax(0,1fr))}.pr-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.pr-analysis.wide{grid-column:span 2}.pay-row{grid-template-columns:auto minmax(0,1fr) auto}.pay-side{grid-column:auto;justify-content:flex-end}}@media (max-width:520px){.pr-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.pr-icon-button,.pr-filter-button,.pr-add-inline{width:40px;height:40px}.pay-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.pay-side{grid-column:1/-1;justify-content:flex-end;overflow-x:auto}.pr-sheet,.pr-drawer{padding:12px}.pr-sheet-actions,.pr-drawer-actions{display:grid;grid-template-columns:minmax(0,1fr)}.pr-sheet-actions button,.pr-drawer-actions button{width:100%}}
`;
