
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/db/db";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

type AnyRow = Record<string, any>;
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";
type ApprovalType = "payroll" | "payments" | "funding";

type ApprovalRow = AnyRow & {
  _type: ApprovalType;
  _title: string;
  _amount: number;
  _date?: string | number | null;
};

type BranchSummary = {
  id: number;
  name: string;
  code?: string;
  active: boolean;
  income: number;
  expenses: number;
  studentFees: number;
  payrollDue: number;
  payrollPaid: number;
  payrollItems: number;
  pendingPayments: number;
  paidPayments: number;
  paymentCount: number;
  approvalsNeeded: number;
  balance: number;
};

function getTable(...names: string[]): any {
  const anyDb = db as any;
  for (const name of names) if (anyDb?.[name]) return anyDb[name];
  return null;
}

async function tableToArray<T = AnyRow>(...names: string[]): Promise<T[]> {
  for (const name of names) {
    const table = getTable(name);
    if (table?.toArray) return table.toArray();
  }
  return [];
}

function cleanId(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rowId(row?: AnyRow) {
  return cleanId(row?.id ?? row?.localId ?? row?.payload?.id ?? row?.payload?.localId);
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  if (!row || row.isDeleted) return false;
  return !row.accountId || !accountId || row.accountId === accountId;
}

function sameSchool(row: AnyRow, accountId: string | null | undefined, schoolId: number, branchIds: Set<number>) {
  if (!sameAccount(row, accountId)) return false;
  const rowSchoolId = cleanId(row.schoolId ?? row.payload?.schoolId);
  const rowBranchId = cleanId(row.branchId ?? row.payload?.branchId);
  if (rowSchoolId && rowSchoolId === schoolId) return true;
  if (rowBranchId && branchIds.has(rowBranchId)) return true;
  return false;
}

function branchIdOf(row: AnyRow) {
  return cleanId(row.branchId ?? row.payload?.branchId);
}

function amountOf(row: AnyRow, keys: string[] = []) {
  const candidates = [
    ...keys,
    "amount",
    "total",
    "netAmount",
    "grossAmount",
    "balance",
    "amountPaid",
    "subtotal",
    "baseSalary",
  ];
  for (const key of candidates) {
    const value = Number(row?.[key] ?? row?.payload?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function statusOf(row: AnyRow) {
  return String(row.status ?? row.paymentStatus ?? row.payrollStatus ?? row.payload?.status ?? "").toLowerCase();
}

function isPaid(row: AnyRow) {
  const status = statusOf(row);
  return ["paid", "success", "successful", "completed", "confirmed", "approved"].some((word) => status.includes(word));
}

function isPending(row: AnyRow) {
  const status = statusOf(row);
  return !isPaid(row) && !["cancelled", "failed", "void", "reversed", "refunded"].some((word) => status.includes(word));
}

function needsApproval(row: AnyRow) {
  const status = statusOf(row);
  return ["pending", "review", "draft", "issued", "processing"].some((word) => status.includes(word));
}

function money(value: number, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function dateText(value?: string | number | null) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

function percent(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function toneFor(value: number): Tone {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "gray";
}

function toneForStatus(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["paid", "approved", "success", "completed", "confirmed", "active"].some((x) => value.includes(x))) return "green";
  if (["pending", "review", "processing", "draft", "issued"].some((x) => value.includes(x))) return "orange";
  if (["failed", "cancelled", "void", "rejected", "overdue"].some((x) => value.includes(x))) return "red";
  return "gray";
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`saf-chip ${tone}`}>{children}</span>;
}

function StatCard({ label, value, detail, icon, tone = "gray" }: { label: string; value: string | number; detail: string; icon: string; tone?: Tone }) {
  return (
    <article className={`saf-stat ${tone}`}>
      <div><span>{label}</span><b>{icon}</b></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="saf-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </section>
  );
}

function Bar({ label, value, max, tone = "blue" }: { label: string; value: number; max: number; tone?: Tone }) {
  const width = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <article className="saf-bar-row">
      <div><strong>{label}</strong><span>{money(value)}</span></div>
      <div className="saf-track"><i className={tone} style={{ width: `${width}%` }} /></div>
    </article>
  );
}

function useSchoolFinanceData() {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeSchool, loading: contextLoading } = useActiveBranch();

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [branches, setBranches] = useState<AnyRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<AnyRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<AnyRow[]>([]);
  const [feeRows, setFeeRows] = useState<AnyRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<AnyRow[]>([]);
  const [payrollRows, setPayrollRows] = useState<AnyRow[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<AnyRow[]>([]);
  const [transactions, setTransactions] = useState<AnyRow[]>([]);
  const [intents, setIntents] = useState<AnyRow[]>([]);
  const [branchAdmins, setBranchAdmins] = useState<AnyRow[]>([]);
  const [schoolId, setSchoolId] = useState(0);

  async function load() {
    if (accountLoading || settingsLoading || contextLoading) return;
    if (!authenticated || !accountId) {
      setLoading(false);
      setNotice("Sign in again to view school finance records.");
      return;
    }

    try {
      setLoading(true);
      setNotice("");

      const [
        branchRows,
        membershipRows,
        fallbackMembershipRows,
        incomeTable,
        expenseTable,
        legacyPayments,
        studentFeePayments,
        studentFeeInvoices,
        paymentTransactions,
        paymentIntents,
        payrollItems,
        payrollRunRows,
        staffPayments,
      ] = await Promise.all([
        tableToArray("branches"),
        tableToArray("userMemberships"),
        tableToArray("memberships"),
        tableToArray("income", "incomes"),
        tableToArray("expenses"),
        tableToArray("payments"),
        tableToArray("studentFeePayments"),
        tableToArray("studentFeeInvoices"),
        tableToArray("paymentTransactions"),
        tableToArray("paymentIntents"),
        tableToArray("payrollItems"),
        tableToArray("payrollRuns"),
        tableToArray("staffPaymentRecords"),
      ]);

      const memberships = [...membershipRows, ...fallbackMembershipRows].filter((row) => sameAccount(row, accountId));
      const adminMembership = memberships.find((row) => {
        const role = String(row.role || "").toLowerCase();
        return row.active !== false && ["school_admin", "admin", "super_admin"].includes(role) && cleanId(row.schoolId);
      });

      const realSchoolId = cleanId(adminMembership?.schoolId) || cleanId(activeSchoolId || activeSchool?.id || settings?.schoolId);
      setSchoolId(realSchoolId);

      const schoolBranches = branchRows
        .filter((row) => sameAccount(row, accountId))
        .filter((row) => cleanId(row.schoolId ?? row.payload?.schoolId) === realSchoolId);

      const branchIds = new Set(schoolBranches.map(rowId).filter(Boolean));
      const inSchool = (row: AnyRow) => sameSchool(row, accountId, realSchoolId, branchIds);

      setBranches(schoolBranches);
      setBranchAdmins(
        memberships.filter((row) => {
          const role = String(row.role || "").toLowerCase();
          return row.active !== false && role === "branch_admin" && branchIds.has(cleanId(row.branchId));
        })
      );
      setIncomeRows(incomeTable.filter(inSchool));
      setExpenseRows(expenseTable.filter(inSchool));
      setFeeRows([...studentFeePayments, ...studentFeeInvoices].filter(inSchool));
      setPaymentRows([...legacyPayments, ...studentFeePayments, ...paymentTransactions].filter(inSchool));
      setTransactions(paymentTransactions.filter(inSchool));
      setIntents(paymentIntents.filter(inSchool));
      setPayrollRows([...payrollItems, ...staffPayments].filter(inSchool));
      setPayrollRuns(payrollRunRows.filter(inSchool));

      if (!realSchoolId) setNotice("No school assignment was found for this school admin account.");
    } catch (err) {
      setNotice("Some finance records could not be loaded from the local database.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, activeSchoolId, activeSchool?.id, settings?.schoolId, accountLoading, settingsLoading, contextLoading]);

  const branchSummaries = useMemo<BranchSummary[]>(() => {
    return branches.map((branch) => {
      const bid = rowId(branch);
      const branchIncome = incomeRows.filter((row) => branchIdOf(row) === bid).reduce((sum, row) => sum + amountOf(row), 0);
      const branchExpenses = expenseRows.filter((row) => branchIdOf(row) === bid).reduce((sum, row) => sum + amountOf(row), 0);
      const branchFees = feeRows.filter((row) => branchIdOf(row) === bid).reduce((sum, row) => sum + amountOf(row, ["amountPaid", "amount", "total"]), 0);
      const branchPayroll = payrollRows.filter((row) => branchIdOf(row) === bid);
      const branchPayments = paymentRows.filter((row) => branchIdOf(row) === bid);
      const due = branchPayroll.filter(isPending).reduce((sum, row) => sum + amountOf(row, ["netAmount", "amount", "baseSalary"]), 0);
      const paid = branchPayroll.filter(isPaid).reduce((sum, row) => sum + amountOf(row, ["netAmount", "amount", "baseSalary"]), 0);
      const approvals = [...branchPayroll, ...branchPayments, ...paymentRows.filter((row) => branchIdOf(row) === bid)].filter(needsApproval).length;

      return {
        id: bid,
        name: branch.name || branch.branchName || `Branch ${bid}`,
        code: branch.code,
        active: branch.active !== false,
        income: branchIncome,
        expenses: branchExpenses,
        studentFees: branchFees,
        payrollDue: due,
        payrollPaid: paid,
        payrollItems: branchPayroll.length,
        pendingPayments: branchPayments.filter(isPending).length,
        paidPayments: branchPayments.filter(isPaid).length,
        paymentCount: branchPayments.length,
        approvalsNeeded: approvals,
        balance: branchIncome + branchFees - branchExpenses - due,
      };
    }).sort((a,b)=> b.balance - a.balance);
  }, [branches, incomeRows, expenseRows, feeRows, payrollRows, paymentRows]);

  const totals = useMemo(() => {
    const income = branchSummaries.reduce((sum, row) => sum + row.income, 0);
    const fees = branchSummaries.reduce((sum, row) => sum + row.studentFees, 0);
    const expenses = branchSummaries.reduce((sum, row) => sum + row.expenses, 0);
    const payrollDue = branchSummaries.reduce((sum, row) => sum + row.payrollDue, 0);
    const payrollPaid = branchSummaries.reduce((sum, row) => sum + row.payrollPaid, 0);
    const pendingPayments = branchSummaries.reduce((sum, row) => sum + row.pendingPayments, 0);
    const approvals = branchSummaries.reduce((sum, row) => sum + row.approvalsNeeded, 0);
    return {
      income,
      fees,
      expenses,
      payrollDue,
      payrollPaid,
      pendingPayments,
      approvals,
      branchBalance: income + fees - expenses - payrollDue,
      branches: branchSummaries.length,
      activeBranches: branchSummaries.filter((row) => row.active).length,
    };
  }, [branchSummaries]);

  return {
    loading,
    notice,
    reload: load,
    accountId,
    settings,
    schoolId,
    branches,
    branchAdmins,
    incomeRows,
    expenseRows,
    feeRows,
    paymentRows,
    payrollRows,
    payrollRuns,
    transactions,
    intents,
    branchSummaries,
    totals,
    primary: settings?.primaryColor || "var(--primary-color,#2563eb)",
  };
}

const css = `
.saf-page{width:100%;max-width:100%;min-width:0;display:grid;gap:14px;color:var(--text,#0f172a);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
.saf-page *{box-sizing:border-box}.saf-hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;gap:14px;padding:16px;border-radius:26px;background:radial-gradient(circle at top right,rgba(255,255,255,.2),transparent 34%),linear-gradient(135deg,var(--saf-primary),#020617 78%);color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.16)}.saf-hero>*{position:relative;z-index:1}.saf-hero:after{content:"";position:absolute;right:-90px;bottom:-120px;width:240px;height:240px;border-radius:999px;background:rgba(255,255,255,.08)}.saf-eyebrow{margin:0 0 5px;font-size:9px;font-weight:1000;letter-spacing:.14em;text-transform:uppercase;opacity:.86}.saf-hero h1{margin:0;font-size:clamp(1.35rem,3.7vw,2.25rem);line-height:1;font-weight:1000;letter-spacing:-.055em}.saf-hero p{margin:8px 0 0;max-width:760px;font-size:12.5px;line-height:1.45;opacity:.9}.saf-actions{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}.saf-btn,.saf-btn-soft,.saf-btn-light{border:0;border-radius:999px;padding:10px 13px;font-size:11.5px;font-weight:1000;cursor:pointer}.saf-btn{background:linear-gradient(135deg,var(--saf-primary),#1d4ed8);color:#fff;box-shadow:0 10px 22px color-mix(in srgb,var(--saf-primary) 25%,transparent)}.saf-btn-soft{background:color-mix(in srgb,var(--saf-primary) 9%,var(--card,#fff));color:var(--saf-primary);border:1px solid color-mix(in srgb,var(--saf-primary) 18%,transparent)}.saf-btn-light{background:#fff;color:#0f172a}.saf-btn:disabled,.saf-btn-soft:disabled{opacity:.55;cursor:not-allowed}.saf-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.saf-stat{overflow:hidden;position:relative;display:grid;gap:8px;padding:13px;border-radius:22px;background:var(--card,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 12px 28px rgba(15,23,42,.06)}.saf-stat:after{content:"";position:absolute;right:-36px;bottom:-45px;width:100px;height:100px;border-radius:999px;background:color-mix(in srgb,var(--saf-primary) 8%,transparent)}.saf-stat>div{display:flex;justify-content:space-between;gap:8px}.saf-stat span,.saf-stat small{color:var(--muted,#64748b);font-size:10.5px;font-weight:850}.saf-stat strong{font-size:clamp(1.15rem,2.8vw,1.75rem);line-height:1;font-weight:1000;letter-spacing:-.05em}.saf-stat.green strong{color:#047857}.saf-stat.red strong{color:#b91c1c}.saf-stat.orange strong{color:#c2410c}.saf-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.75fr);gap:14px}.saf-card{min-width:0;display:grid;gap:12px;padding:13px;border-radius:24px;background:var(--card,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 12px 28px rgba(15,23,42,.055)}.saf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.saf-head h2{margin:0;color:var(--text,#0f172a);font-size:17px;line-height:1.05;font-weight:1000;letter-spacing:-.04em}.saf-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:11.5px;line-height:1.4;font-weight:750}.saf-chip{display:inline-flex;align-items:center;width:max-content;max-width:100%;border-radius:999px;padding:5px 8px;font-size:9.5px;font-weight:1000;text-transform:uppercase;letter-spacing:.05em}.saf-chip.green{background:#ecfdf5;color:#047857;border:1px solid #bbf7d0}.saf-chip.blue{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}.saf-chip.purple{background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe}.saf-chip.orange{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}.saf-chip.red{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}.saf-chip.gray{background:#f8fafc;color:#475569;border:1px solid #e2e8f0}.saf-table-wrap{width:100%;overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.18)}.saf-table{width:100%;border-collapse:collapse;min-width:760px}.saf-table th,.saf-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.16);font-size:11.5px;text-align:left;vertical-align:middle}.saf-table th{background:rgba(15,23,42,.025);color:var(--muted,#64748b);font-size:9.5px;text-transform:uppercase;letter-spacing:.09em;font-weight:1000}.saf-table td{color:var(--text,#0f172a);font-weight:800}.saf-table tr:last-child td{border-bottom:0}.saf-money-pos{color:#047857!important}.saf-money-neg{color:#b91c1c!important}.saf-mini-list{display:grid;gap:8px}.saf-mini-item{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border-radius:17px;background:rgba(15,23,42,.027);border:1px solid rgba(148,163,184,.16)}.saf-mini-item strong{font-size:12px;font-weight:1000}.saf-mini-item span{font-size:10.5px;color:var(--muted,#64748b);font-weight:850}.saf-form{display:grid;gap:10px}.saf-form-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.saf-field{display:grid;gap:5px}.saf-field label{color:var(--muted,#64748b);font-size:10px;font-weight:1000;text-transform:uppercase;letter-spacing:.08em}.saf-input,.saf-select,.saf-textarea{width:100%;border:1px solid rgba(148,163,184,.35);border-radius:15px;padding:10px 11px;background:var(--card,#fff);color:var(--text,#0f172a);font-size:12px;font-weight:850;outline:none}.saf-textarea{resize:vertical;min-height:84px}.saf-input:focus,.saf-select:focus,.saf-textarea:focus{border-color:var(--saf-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--saf-primary) 13%,transparent)}.saf-notice,.saf-empty{border-radius:18px;padding:12px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:12px;font-weight:850}.saf-empty{display:grid;gap:4px;background:rgba(15,23,42,.025);color:var(--muted,#64748b);border-color:rgba(148,163,184,.18)}.saf-empty strong{color:var(--text,#0f172a);font-size:13px}.saf-bars{display:grid;gap:9px}.saf-bar-row{display:grid;gap:5px}.saf-bar-row>div:first-child{display:flex;justify-content:space-between;gap:10px}.saf-bar-row strong{font-size:11.5px}.saf-bar-row span{font-size:10.5px;color:var(--muted,#64748b);font-weight:850}.saf-track{height:9px;border-radius:999px;background:rgba(148,163,184,.18);overflow:hidden}.saf-track i{display:block;height:100%;border-radius:999px;background:var(--saf-primary)}.saf-track i.green{background:#10b981}.saf-track i.orange{background:#f97316}.saf-track i.red{background:#ef4444}.saf-track i.purple{background:#8b5cf6}.saf-kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.saf-kpi{padding:10px;border-radius:17px;background:rgba(15,23,42,.028);border:1px solid rgba(148,163,184,.16)}.saf-kpi span{display:block;color:var(--muted,#64748b);font-size:10px;font-weight:900}.saf-kpi strong{display:block;margin-top:3px;font-size:16px;font-weight:1000}.saf-loading{min-height:260px;display:grid;place-items:center;border-radius:24px;background:var(--card,#fff);border:1px solid rgba(148,163,184,.22);color:var(--muted,#64748b);font-weight:950}.saf-tabs{display:flex;gap:6px;flex-wrap:wrap}.saf-tabs button{border:1px solid rgba(148,163,184,.24);background:var(--card,#fff);color:var(--muted,#64748b);border-radius:999px;padding:8px 10px;font-size:11px;font-weight:1000;cursor:pointer}.saf-tabs button.active{background:var(--saf-primary);border-color:var(--saf-primary);color:#fff}.saf-mobile-cards{display:none;gap:10px}.saf-branch-card{display:grid;gap:8px;padding:12px;border-radius:20px;background:var(--card,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 10px 24px rgba(15,23,42,.05)}.saf-branch-card h3{margin:0;font-size:15px;font-weight:1000;letter-spacing:-.03em}.saf-branch-card p{margin:0;color:var(--muted,#64748b);font-size:11px;font-weight:800}.saf-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media(max-width:980px){.saf-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.saf-grid{grid-template-columns:1fr}.saf-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.saf-hero{display:grid;padding:14px;border-radius:22px}.saf-actions{width:100%}.saf-actions button{flex:1}.saf-stat-grid{grid-template-columns:1fr}.saf-form-row{grid-template-columns:1fr}.saf-table-wrap{display:none}.saf-mobile-cards{display:grid}.saf-card-grid{grid-template-columns:1fr}.saf-card{border-radius:20px;padding:12px}.saf-head{display:grid}.saf-kpi-grid{grid-template-columns:1fr 1fr}}
`;


export default function SchoolFinanceApprovals() {
  const data = useSchoolFinanceData();
  const [tab, setTab] = useState<"all" | "payroll" | "payments" | "funding">("all");

  const approvalRows = useMemo<ApprovalRow[]>(() => {
    const payroll: ApprovalRow[] = data.payrollRows.map((row: AnyRow) => ({
      ...row,
      _type: "payroll",
      _title: String(row.fullName || row.staffName || row.teacherName || "Payroll item"),
      _amount: amountOf(row, ["netAmount", "amount", "baseSalary"]),
      _date: row.paidAt || row.date || row.updatedAt || row.createdAt,
    }));

    const payments: ApprovalRow[] = data.paymentRows.map((row: AnyRow) => ({
      ...row,
      _type: "payments",
      _title: String(row.payerName || row.studentName || row.title || row.purpose || "Payment record"),
      _amount: amountOf(row, ["amount", "total", "amountPaid"]),
      _date: row.paidAt || row.date || row.updatedAt || row.createdAt,
    }));

    const funding: ApprovalRow[] = [...data.incomeRows, ...data.transactions]
      .filter((row: AnyRow) => {
        const sourceText = String(row.source || row.title || row.purpose || "").toLowerCase();
        const referenceNumber = String(row.referenceNumber || "");
        return sourceText.includes("allocation") || referenceNumber.startsWith("SAF-");
      })
      .map((row: AnyRow) => ({
        ...row,
        _type: "funding",
        _title: String(row.title || row.recipientName || "Branch funding"),
        _amount: amountOf(row),
        _date: row.date || row.updatedAt || row.createdAt,
      }));

    return [...payroll, ...payments, ...funding]
      .filter((row: ApprovalRow) => needsApproval(row))
      .filter((row: ApprovalRow) => tab === "all" || row._type === tab)
      .sort((a: ApprovalRow, b: ApprovalRow) => {
        const bDate = Number(b.updatedAt || b.createdAt || b._date || 0);
        const aDate = Number(a.updatedAt || a.createdAt || a._date || 0);
        return bDate - aDate;
      });
  }, [data.payrollRows, data.paymentRows, data.incomeRows, data.transactions, tab]);

  async function markReviewed(row: ApprovalRow) {
    const tableName = row._type === "payroll" ? "payrollItems" : row._type === "funding" ? "income" : "paymentTransactions";
    const table = getTable(tableName, row._type === "funding" ? "incomes" : tableName);
    const id = rowId(row);
    if (!table?.update || !id) return;
    await table.update(id, { status: "approved", updatedAt: Date.now(), synced: "pending" });
    await data.reload();
  }

  if (data.loading) {
    return <main className="saf-page" style={{ "--saf-primary": data.primary } as React.CSSProperties}><style>{css}</style><section className="saf-loading">Loading finance approvals...</section></main>;
  }

  return (
    <main className="saf-page" style={{ "--saf-primary": data.primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="saf-hero"><div><p className="saf-eyebrow">Finance Approvals</p><h1>Review branch finance requests</h1><p>School admin approves or monitors sensitive branch finance records. Branch admins still perform salary and payment execution.</p></div><div className="saf-actions"><button className="saf-btn-light" onClick={() => data.reload()}>Refresh</button></div></section>
      {data.notice ? <div className="saf-notice">{data.notice}</div> : null}

      <section className="saf-stat-grid">
        <StatCard label="All Reviews" value={approvalRows.length} detail="filtered approval queue" icon="📝" tone={approvalRows.length ? "orange" : "green"} />
        <StatCard label="Payroll Reviews" value={data.payrollRows.filter(needsApproval).length} detail="salary-related records" icon="🧾" tone="orange" />
        <StatCard label="Payment Reviews" value={data.paymentRows.filter(needsApproval).length} detail="payment records" icon="🏦" tone="blue" />
        <StatCard label="Funding Records" value={[...data.incomeRows, ...data.transactions].filter((row)=>String(row.referenceNumber || "").startsWith("SAF-")).length} detail="school-to-branch allocations" icon="💸" tone="purple" />
      </section>

      <section className="saf-card">
        <div className="saf-head"><div><h2>Approval queue</h2><p>Mark records as approved after school admin review.</p></div><div className="saf-tabs"><button className={tab === "all" ? "active" : ""} onClick={()=>setTab("all")}>All</button><button className={tab === "payroll" ? "active" : ""} onClick={()=>setTab("payroll")}>Payroll</button><button className={tab === "payments" ? "active" : ""} onClick={()=>setTab("payments")}>Payments</button><button className={tab === "funding" ? "active" : ""} onClick={()=>setTab("funding")}>Funding</button></div></div>
        <div className="saf-table-wrap"><table className="saf-table"><thead><tr><th>Record</th><th>Branch</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>{approvalRows.map((row,index)=>{const branch = data.branchSummaries.find((b)=>b.id===branchIdOf(row)); return <tr key={`${row._type}-${rowId(row)}-${index}`}><td><strong>{row._title}</strong><br/><small>{row.note || row.description || row.referenceNumber || "No note"}</small></td><td>{branch?.name || "School level"}</td><td><Chip tone={row._type === "payroll" ? "orange" : row._type === "funding" ? "purple" : "blue"}>{row._type}</Chip></td><td>{money(row._amount)}</td><td><Chip tone={toneForStatus(statusOf(row))}>{statusOf(row) || "pending"}</Chip></td><td>{dateText(row._date)}</td><td><button className="saf-btn-soft" onClick={()=>markReviewed(row)}>Approve</button></td></tr>})}</tbody></table></div>
        <div className="saf-mobile-cards">{approvalRows.map((row,index)=>{const branch = data.branchSummaries.find((b)=>b.id===branchIdOf(row)); return <article className="saf-branch-card" key={`${row._type}-${rowId(row)}-${index}`}><div className="saf-head"><div><h3>{row._title}</h3><p>{branch?.name || "School level"} · {dateText(row._date)}</p></div><Chip tone={toneForStatus(statusOf(row))}>{statusOf(row) || "pending"}</Chip></div><div className="saf-kpi-grid"><div className="saf-kpi"><span>Type</span><strong>{row._type}</strong></div><div className="saf-kpi"><span>Amount</span><strong>{money(row._amount)}</strong></div></div><button className="saf-btn-soft" onClick={()=>markReviewed(row)}>Approve</button></article>})}</div>
        {!approvalRows.length ? <EmptyState title="No records need approval" detail="Finance records that need school-level review will appear here." /> : null}
      </section>
    </main>
  );
}
