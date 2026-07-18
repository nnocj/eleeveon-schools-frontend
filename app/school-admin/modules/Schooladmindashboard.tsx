"use client";

/**
 * app/school-admin/modules/Schooladmindashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOL ADMIN DASHBOARD V2
 * ---------------------------------------------------------
 * School-scoped, offline-first, mobile-first, theme-safe dashboard.
 *
 * Workspace-session aligned:
 * - Reads the selected workspace session written by /select-role first.
 * - Uses the selected schoolId as the main scope.
 * - Does NOT require branchId, because school admin works across all branches.
 * - Dashboard cards are generated from the NAV_SECTIONS passed by
 *   app/school-admin/page.tsx, so changing the menu automatically changes
 *   the dashboard modules.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { db } from "../../lib/db/db";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter =
  | "all"
  | "overview"
  | "finance"
  | "communication"
  | "calendar"
  | "settings"
  | "other";

type Tone = "green" | "red" | "blue" | "gray" | "orange" | "purple";

type RouteProps = {
  navigate?: (key: string) => void;
  navSections?: RoleNavSection[];
};

type DashboardModule = {
  key: string;
  label: string;
  icon: string;
  area: Exclude<AreaFilter, "all">;
  value: string | number;
  note: string;
  tone: Tone;
  routeKey: string;
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";
const HIDDEN_DASHBOARD_KEYS = new Set(["schoolAdminDashboard"]);

const TABLE_NAMES = [
  "schools",
  "branches",
  "students",
  "teachers",
  "parents",
  "classes",
  "subjects",
  "classSubjects",
  "studentEnrollments",
  "attendance",
  "teacherAttendance",
  "announcements",
  "messageThreads",
  "messages",
  "calendarEvents",
  "scheduleTimetables",
  "scheduleSessions",
  "incomes",
  "expenses",
  "feeStructures",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "payments",
  "paymentTransactions",
  "paymentSettlements",
  "withdrawalRequests",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "branchFundingRequests",
  "schoolBranchFundings",
  "schoolFinanceApprovals",
  "userMemberships",
  "memberships",
  "appUsers",
  "users",
  "accountUsers",
] as const;

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
};

function safeRead(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession(): OpenWorkspaceSession | null {
  return safeJson<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership(): AnyRow | null {
  return safeJson<AnyRow>("activeMembership");
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed) return parsed;
  }

  return null;
}

function workspaceMembership(openWorkspace?: OpenWorkspaceSession | null, activeMembership?: AnyRow | null) {
  return openWorkspace?.membership || activeMembership || readStoredActiveMembership() || null;
}

function selectedSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeSchoolId?: any;
  activeSchool?: AnyRow | null;
  settings?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return firstPositiveNumber(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeRead("activeSchoolId")
  );
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(row?: AnyRow | null) {
  return row?.id ?? row?.localId ?? row?.cloudId ?? row?.payload?.id ?? row?.payload?.localId;
}

function sameId(a: any, b: any) {
  return String(a ?? "") === String(b ?? "");
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return row && row.isDeleted !== true && (!row.accountId || !accountId || row.accountId === accountId);
}

function schoolScoped(row: AnyRow, accountId?: string | null, schoolId?: any) {
  if (!sameAccount(row, accountId)) return false;

  const rowSchoolId = row.schoolId ?? row.schoolLocalId ?? row.payload?.schoolId;
  if (schoolId && rowSchoolId && !sameId(rowSchoolId, schoolId)) return false;

  return true;
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();

  return (
    row?.isDeleted !== true &&
    row?.active !== false &&
    row?.disabled !== true &&
    !["deleted", "archived", "inactive", "disabled", "withdrawn", "blocked", "suspended"].includes(status)
  );
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function sumMoney(rows: AnyRow[]) {
  return rows.filter(activeRow).reduce((total, row) => total + n(row.amount || row.total || row.balance || row.netAmount), 0);
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
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

function dateLabel(value?: number | string | null) {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "sent", "succeeded", "success", "synced", "present", "approved"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "expired", "suspended", "absent", "rejected"].includes(value)) return "red";
  if (["pending", "processing", "trial", "draft", "late", "partial"].includes(value)) return "orange";
  if (["scheduled", "issued", "completed", "promoted"].includes(value)) return "blue";
  return "gray";
}

function roleCount(rows: AnyRow[], role: string) {
  return rows
    .filter(activeRow)
    .filter((row) => String(row.role || row.roleName || "").toLowerCase() === role).length;
}

function uniqueUsersRoleCount(users: AnyRow[], memberships: AnyRow[]) {
  const map = new Map<string, AnyRow>();

  users.filter(activeRow).forEach((row) => {
    const key = String(row.id || row.userId || row.email || "");
    if (key) map.set(key, row);
  });

  memberships.filter(activeRow).forEach((row) => {
    const key = String(
      row.userId ||
        row.appUserId ||
        row.email ||
        row.userEmail ||
        row.id ||
        `${row.role || "user"}-${row.teacherLocalId || row.studentLocalId || row.parentLocalId || ""}`,
    );

    if (key) map.set(key, row);
  });

  return map.size;
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("overview") || value.includes("school")) return "overview";
  if (value.includes("finance") || value.includes("payment") || value.includes("funding") || value.includes("approval")) return "finance";
  if (value.includes("communication")) return "communication";
  if (value.includes("calendar") || value.includes("timetable")) return "calendar";
  if (value.includes("setting")) return "settings";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    overview: "School Overview",
    finance: "Finance",
    communication: "Communication",
    calendar: "Calendar & Timetable",
    settings: "Settings",
    other: "Other",
  };
  return labels[area] || area;
}

function selectedSchoolName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: AnyRow | null;
  activeSchool?: AnyRow | null;
  school?: AnyRow | null;
}) {
  const membership = workspaceMembership(args.openWorkspace, args.activeMembership);

  return text(
    args.school?.name ||
      args.activeSchool?.name ||
      membership?.schoolName ||
      membership?.school?.name ||
      args.openWorkspace?.memberName,
    "Active School"
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`sad-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="sad-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="sad-empty">
      <div>🏫</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function buildNavModules(navSections?: RoleNavSection[]): Omit<DashboardModule, "value" | "note" | "tone">[] {
  const unique = new Map<string, Omit<DashboardModule, "value" | "note" | "tone">>();

  (navSections || []).forEach((section) => {
    const area = areaFromSectionTitle(section.title);

    section.items.forEach((item) => {
      if (HIDDEN_DASHBOARD_KEYS.has(item.key)) return;
      if (unique.has(item.key)) return;

      unique.set(item.key, {
        key: item.key,
        label: item.label,
        icon: item.icon,
        area,
        routeKey: item.key,
      });
    });
  });

  return [...unique.values()];
}

function metricFor(routeKey: string, rows: Record<string, AnyRow[]>, summary: AnyRow): Pick<DashboardModule, "value" | "note" | "tone"> {
  const map: Record<string, Pick<DashboardModule, "value" | "note" | "tone">> = {
    branches: {
      value: summary.branches,
      note: `${summary.students} student(s), ${summary.teachers} teacher(s) across branches.`,
      tone: summary.branches ? "blue" : "orange",
    },
    schoolUsers: {
      value: summary.users,
      note: `${summary.admins} admin(s), ${summary.branchAdmins} branch admin(s), ${summary.accountants} accountant(s).`,
      tone: summary.users ? "purple" : "orange",
    },
    schoolFinanceOverview: {
      value: money(summary.financeTotal, summary.currencyCode),
      note: `${summary.invoices} invoice(s), ${summary.payments} payment(s), ${summary.expenses} expense(s).`,
      tone: summary.financeTotal ? "green" : "gray",
    },
    schoolBranchFunding: {
      value: summary.fundings || "Open",
      note: "School-to-branch funds, requests and transfers.",
      tone: summary.fundings ? "green" : "blue",
    },
    schoolBranchFinanceMonitor: {
      value: summary.branches,
      note: "Monitor branch income, expenses, fees, payroll and cash movement.",
      tone: summary.branches ? "blue" : "gray",
    },
    schoolFinanceApprovals: {
      value: summary.approvals,
      note: "Finance approvals and pending operational requests.",
      tone: summary.approvals ? "orange" : "green",
    },
    schoolPaymentsOverview: {
      value: summary.payments,
      note: `${money(summary.paymentTotal, summary.currencyCode)} local payment movement.`,
      tone: summary.payments ? "green" : "gray",
    },
    announcements: {
      value: summary.announcements,
      note: "School-wide broadcasts and branch communication.",
      tone: summary.announcements ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "School-level conversations and admin follow-ups.",
      tone: summary.messages ? "green" : "gray",
    },
    schoolCalendar: {
      value: summary.events,
      note: "School-wide calendar events.",
      tone: summary.events ? "blue" : "gray",
    },
    branchCalendar: {
      value: summary.branches,
      note: "Branch calendars under this school.",
      tone: summary.branches ? "purple" : "gray",
    },
    branchTimetableOverview: {
      value: summary.sessions || summary.timetables,
      note: `${summary.timetables} timetable(s), ${summary.sessions} session(s).`,
      tone: summary.sessions ? "green" : "gray",
    },
    localSettings: {
      value: "Open",
      note: "Device display preferences only.",
      tone: "gray",
    },
  };

  if (map[routeKey]) return map[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return {
      value: count(guessedRows),
      note: "Auto-counted from matching local table.",
      tone: count(guessedRows) ? "green" : "gray",
    };
  }

  return {
    value: "Open",
    note: "Module is listed from School Admin navigation.",
    tone: "gray",
  };
}

export default function Schooladmindashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchoolId, activeSchool } = useActiveBranch();
  const { activeMembership } = useActiveMembership();
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";
  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedSchoolId({
    openWorkspace,
    activeMembership,
    activeSchoolId,
    activeSchool,
    settings: settings as AnyRow,
  });

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<AreaFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowsByTable, setRowsByTable] = useState<Record<string, AnyRow[]>>({});

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  async function load() {
    if (!authenticated || !accountId) {
      setRowsByTable({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const loaded = await Promise.all(
        TABLE_NAMES.map(async (tableName) => {
          const rows = await safeArray(tableName);
          return [tableName, rows.filter((row) => schoolScoped(row, accountId, schoolId))] as const;
        })
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load school admin dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const selectedSchool = useMemo(() => {
    const schools = rows.schools || [];
    return schools.find((row) => schoolId && sameId(idOf(row), schoolId)) || activeSchool || null;
  }, [activeSchool, rows.schools, schoolId]);

  const summary = useMemo(() => {
    const memberships = (rows.userMemberships || []).length ? rows.userMemberships || [] : rows.memberships || [];
    const users = (rows.appUsers || []).length
      ? rows.appUsers || []
      : (rows.users || []).length
        ? rows.users || []
        : rows.accountUsers || [];

    const invoices = [...(rows.studentFeeInvoices || []), ...(rows.studentFeeInvoiceItems || [])];
    const payments = [...(rows.payments || []), ...(rows.studentFeePayments || []), ...(rows.paymentTransactions || [])];
    const incomes = rows.incomes || [];
    const expenses = rows.expenses || [];

    const paymentTotal = sumMoney(payments);
    const incomeTotal = sumMoney(incomes);
    const expenseTotal = sumMoney(expenses);
    const invoiceTotal = sumMoney(invoices);

    return {
      schoolName: selectedSchoolName({ openWorkspace, activeMembership, activeSchool, school: selectedSchool }),
      branches: count(rows.branches || []),
      students: count(rows.students || []),
      teachers: count(rows.teachers || []),
      parents: count(rows.parents || []),
      classes: count(rows.classes || []),
      users: uniqueUsersRoleCount(users, memberships),
      admins: roleCount(memberships, "admin"),
      branchAdmins: roleCount(memberships, "branch_admin"),
      accountants: roleCount(memberships, "accountant"),
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      events: count(rows.calendarEvents || []),
      timetables: count(rows.scheduleTimetables || []),
      sessions: count(rows.scheduleSessions || []),
      invoices: count(invoices),
      payments: count(payments),
      incomes: count(incomes),
      expenses: count(expenses),
      invoiceTotal,
      paymentTotal,
      incomeTotal,
      expenseTotal,
      financeTotal: incomeTotal + paymentTotal,
      fundings: count([...(rows.branchFundingRequests || []), ...(rows.schoolBranchFundings || [])]),
      approvals: count(rows.schoolFinanceApprovals || []),
      currencyCode: text(payments[0]?.currency || payments[0]?.currencyCode || invoices[0]?.currencyCode || incomes[0]?.currencyCode, "GHS"),
    };
  }, [activeMembership, activeSchool, openWorkspace, rows, selectedSchool]);

  const modules = useMemo<DashboardModule[]>(() => {
    return buildNavModules(navSections).map((module) => ({
      ...module,
      ...metricFor(module.routeKey, rows, summary),
    }));
  }, [navSections, rows, summary]);

  const filteredModules = useMemo(() => {
    const q = query.toLowerCase().trim();
    return modules.filter((item) => {
      if (area !== "all" && item.area !== area) return false;
      if (!q) return true;
      return `${item.label} ${item.note} ${item.value} ${item.area}`.toLowerCase().includes(q);
    });
  }, [area, modules, query]);

  const recent = useMemo(() => {
    const records: AnyRow[] = [
      ...(rows.branches || []).map((row) => ({ ...row, _kind: "Branch", _icon: "🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.students || []).map((row) => ({ ...row, _kind: "Student", _icon: "🧑‍🎓", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.teachers || []).map((row) => ({ ...row, _kind: "Teacher", _icon: "👨‍🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.announcements || []).map((row) => ({ ...row, _kind: "Announcement", _icon: "📢", _title: text(row.title, "Announcement"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.messageThreads || []).map((row) => ({ ...row, _kind: "Message", _icon: "✉️", _title: text(row.subject || row.title, "Message thread"), _date: row.lastMessageAt || row.updatedAt || row.createdAt })),
      ...([...(rows.payments || []), ...(rows.studentFeePayments || []), ...(rows.paymentTransactions || [])]).map((row) => ({ ...row, _kind: "Payment", _icon: "💳", _title: money(row.amount || row.total, row.currency || row.currencyCode || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
    ];

    return records.filter(activeRow).sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [rows]);

  function openRoute(routeKey: string) {
    if (navigate) {
      navigate(routeKey);
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent("eleeveon:portal-route", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("role-portal:navigate", { detail: { key: routeKey } }));
      window.dispatchEvent(new CustomEvent("portal:navigate", { detail: routeKey }));
    } catch {
      // Optional shell fallback.
    }
  }

  const activeFilterCount = area !== "all" ? 1 : 0;

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening school dashboard..." text="Loading school-wide branches, users, finance and communication records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the school admin portal." />;
  }

  if (!schoolId) {
    return <State primary={primary} title="No school workspace selected" text="Choose your school admin membership again from Select Role so the dashboard can load the correct school." />;
  }

  return (
    <main className="sad-page" style={{ "--sad-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sad-search-card" aria-label="School dashboard search and actions">
        <span className={`status-dot-mini ${summary.branches || summary.students ? "green" : "gray"}`} title={`${summary.schoolName}: ${summary.branches} branch(es), ${summary.students} student(s)`} />

        <label className="sad-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school modules..." aria-label="Search school dashboard" />
        </label>

        <button type="button" className="sad-add-inline" onClick={load} aria-label="Refresh school dashboard" title="Refresh">↻</button>

        <button type="button" className={`sad-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="sad-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="sad-school-strip" aria-label="Current school context">
        <strong>{summary.schoolName}</strong>
        <span>{summary.branches} branch{summary.branches === 1 ? "" : "es"} · {summary.students} students · {summary.teachers} teachers</span>
        <Chip tone={summary.invoices ? "orange" : "green"}>{summary.invoices ? `${summary.invoices} invoice records` : "Clear"}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="sad-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="sad-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="school-row" onClick={() => openRoute(item.routeKey)}>
              <span className="school-avatar">{item.icon}</span>
              <span className="school-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="school-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching school modules" text="Clear filters or search to show your school modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="sad-recent">
          <div className="sad-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="sad-recent-list">
            {recent.map((item, index) => (
              <article key={`${item._kind}-${idOf(item) || index}`} className="recent-row">
                <span>{item._icon}</span>
                <b>{item._title}</b>
                <small>{item._kind} · {dateLabel(item._date)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {filterOpen ? <FilterSheet area={area} setArea={setArea} onClose={() => setFilterOpen(false)} /> : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => { setView(mode); setMoreOpen(false); }}
          summary={summary}
          onRefresh={async () => { setMoreOpen(false); await load(); }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="sad-page" style={{ "--sad-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="sad-state">
        <div className="sad-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="sad-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sad-sheet small">
        <div className="sad-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which school area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="sad-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="overview">School Overview</option>
              <option value="finance">Finance</option>
              <option value="communication">Communication</option>
              <option value="calendar">Calendar & Timetable</option>
              <option value="settings">Settings</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="sad-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="sad-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="sad-sheet small">
        <div className="sad-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the school home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="sad-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact school modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.branches} branches · {summary.students} students · {summary.users} users</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local school dashboard data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="sad-table-card">
      <div className="sad-table-scroll">
        <table>
          <thead>
            <tr>
              <th>School Modules ({modules.length})</th>
              <th>Area</th>
              <th>Value</th>
              <th>Status</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((item) => (
              <tr key={item.key}>
                <td><strong>{item.icon} {item.label}</strong><span>{item.routeKey}</span></td>
                <td>{areaLabel(item.area)}</td>
                <td>{item.value}</td>
                <td><Chip tone={item.tone}>{item.tone}</Chip></td>
                <td>{item.note}</td>
                <td><div className="sad-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="sad-empty-table">No school module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["overview", "finance", "communication", "calendar", "settings", "other"]
    .map((area) => ({
      label: areaLabel(area),
      value: modules.filter((module) => module.area === area).length,
    }))
    .filter((row) => row.value > 0);

  return (
    <section className="sad-analysis-grid">
      <article className="sad-analysis"><span>Branches</span><strong>{summary.branches}</strong><p>{summary.students} student(s), {summary.teachers} teacher(s), {summary.classes} class(es).</p></article>
      <article className="sad-analysis"><span>Users</span><strong>{summary.users}</strong><p>{summary.admins} admin(s), {summary.branchAdmins} branch admin(s), {summary.accountants} accountant(s).</p></article>
      <article className="sad-analysis"><span>Finance</span><strong>{money(summary.financeTotal, summary.currencyCode)}</strong><p>{summary.invoices} invoice record(s), {summary.expenses} expense record(s).</p></article>
      <article className="sad-analysis"><span>Communication</span><strong>{summary.messages}</strong><p>{summary.announcements} announcement(s), {summary.events} calendar event(s).</p></article>
      <article className="sad-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="sad-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="sad-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="sad-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from branches, students, teachers, announcements, messages and payments.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.sad-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--sad-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.sad-page *,.sad-page *::before,.sad-page *::after{box-sizing:border-box;min-width:0}.sad-page button,.sad-page input,.sad-page select{font:inherit;max-width:100%}.sad-page button{-webkit-tap-highlight-color:transparent}.sad-page input,.sad-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.sad-page input:focus,.sad-page select:focus{border-color:color-mix(in srgb,var(--sad-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--sad-primary) 12%,transparent)}.sad-state,.sad-search-card,.school-row,.sad-table-card,.sad-analysis,.sad-empty,.sad-sheet,.sad-recent,.recent-row,.sad-school-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.sad-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.sad-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--sad-primary) 18%,transparent);border-top-color:var(--sad-primary);animation:spin .8s linear infinite}.sad-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.sad-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.sad-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.sad-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.sad-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.sad-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.sad-icon-button,.sad-filter-button,.sad-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.sad-add-inline{border-color:var(--sad-primary);background:var(--sad-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--sad-primary) 22%,transparent)}.sad-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.sad-filter-button{position:relative;background:color-mix(in srgb,var(--sad-primary) 8%,var(--card-bg,#fff));color:var(--sad-primary)}.sad-filter-button.active{background:var(--sad-primary);color:#fff;border-color:var(--sad-primary)}.sad-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.sad-school-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.sad-school-strip strong,.sad-school-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sad-school-strip strong{font-size:13px;font-weight:1000}.sad-school-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.sad-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.sad-filter-chips::-webkit-scrollbar{display:none}.sad-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--sad-primary) 11%,transparent);color:var(--sad-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.sad-list{display:grid;gap:7px;margin-top:10px}.school-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.school-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--sad-primary) 12%,var(--surface,#fff));font-size:22px}.school-main,.school-main strong,.school-main small,.school-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.school-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.school-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.school-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.school-side{display:flex;align-items:center;gap:7px}.school-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.sad-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.sad-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.sad-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.sad-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.sad-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.sad-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.sad-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.sad-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.sad-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.sad-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.sad-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.sad-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.sad-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.sad-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.sad-form{display:grid;gap:10px}.sad-form label{display:grid;gap:6px}.sad-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.sad-menu-list{display:grid;gap:8px}.sad-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.sad-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--sad-primary) 10%,transparent);color:var(--sad-primary);font-weight:1000}.sad-menu-list button b,.sad-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sad-menu-list button b{font-size:13px;font-weight:1000}.sad-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.sad-menu-list button.active{border-color:color-mix(in srgb,var(--sad-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--sad-primary) 8%,var(--surface,#fff))}.sad-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.sad-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.sad-sheet-actions button.primary{border-color:var(--sad-primary);background:var(--sad-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--sad-primary) 25%,transparent)}.sad-table-card,.sad-analysis,.sad-empty{padding:13px;border-radius:24px}.sad-table-card{margin-top:10px}.sad-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.sad-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.sad-table-scroll th,.sad-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.sad-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--sad-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.sad-table-scroll td strong,.sad-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sad-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.sad-table-actions{display:flex;gap:7px;overflow-x:auto}.sad-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--sad-primary);border-radius:999px;padding:0 12px;background:var(--sad-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.sad-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.sad-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.sad-analysis span,.sad-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.sad-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.sad-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.sad-analysis-list{display:grid;gap:10px;margin-top:12px}.sad-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.sad-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.sad-analysis-list b,.sad-analysis-list small{font-size:12px}.sad-analysis-list small{color:var(--muted,#64748b);font-weight:850}.sad-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.sad-progress i{display:block;height:100%;border-radius:inherit;background:var(--sad-primary)}.sad-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.sad-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--sad-primary) 12%,var(--surface,#fff));font-size:28px}.sad-empty h3{margin:0;font-size:18px;font-weight:1000}.sad-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.sad-recent{margin-top:10px;border-radius:24px;padding:12px}.sad-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.sad-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.sad-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--sad-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.sad-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.sad-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.sad-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.school-row{border-radius:24px;padding:12px}.sad-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sad-analysis.wide{grid-column:span 2}.sad-sheet-backdrop{place-items:center;padding:18px}.sad-sheet{border-radius:28px;padding:18px}.sad-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.sad-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.sad-search-card,.sad-school-strip,.sad-list,.sad-analysis-grid,.sad-table-card,.sad-filter-chips,.sad-recent{max-width:1180px;margin-left:auto;margin-right:auto}.sad-list{grid-template-columns:repeat(3,minmax(0,1fr))}.sad-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.sad-analysis.wide{grid-column:span 2}.sad-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.sad-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.sad-icon-button,.sad-filter-button,.sad-add-inline{width:40px;height:40px}.school-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.school-side{grid-column:1/-1;justify-content:flex-end}.sad-school-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.sad-school-strip span{grid-row:2}.sad-sheet{border-radius:24px 24px 18px 18px;padding:12px}.sad-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.sad-sheet-actions button{width:100%}}
`;
