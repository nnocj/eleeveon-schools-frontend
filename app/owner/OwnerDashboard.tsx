"use client";

/**
 * app/owner/OwnerDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON OWNER DASHBOARD V4
 * ---------------------------------------------------------
 * Golden Standard Owner Home.
 * Account-scoped, offline-first, mobile-first, theme-safe.
 *
 * What changed in V4:
 * - The dashboard no longer keeps a manually duplicated module list.
 * - It receives the same navSections used by app/owner/page.tsx.
 * - Adding/removing/reordering nav items in owner/page.tsx automatically
 *   updates the dashboard module list.
 * - Counts are still real local Dexie counts, mapped by route key.
 * - Unknown/new module keys safely appear as Open until a metric is added.
 * - The Owner Dashboard item itself is hidden from the dashboard module list.
 * - Users are counted as unique active account users, not raw membership rows.
 *
 * Workspace-session aligned:
 * - Owner is account-scoped, so counts remain account-wide.
 * - The selected workspace session is still read for owner identity/role context
 *   so multi-role users do not accidentally display another selected member.
 * - Data filtering continues to use accountId, not schoolId/branchId.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db";
import type { RoleNavSection } from "../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter =
  | "all"
  | "institution"
  | "access"
  | "billing"
  | "communication"
  | "system"
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

type CountMetric = {
  value: string | number;
  note: string;
  tone: Tone;
};

const HIDDEN_DASHBOARD_KEYS = new Set(["ownerDashboard"]);

const TABLE_NAMES = [
  "schools",
  "branches",
  "appUsers",
  "users",
  "accountUsers",
  "userMemberships",
  "memberships",
  "announcements",
  "messageThreads",
  "invoices",
  "appPayments",
  "payments",
  "accountSubscriptions",
  "subscriptionPlans",
  "syncConflicts",
  "billingEvents",
  "syncDevices",
  "storageUsages",
] as const;

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
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

function selectedOwnerName(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  user?: AnyRow | null;
  account?: AnyRow | null;
}) {
  const membership = args.openWorkspace?.membership || readStoredActiveMembership();

  return text(
    args.openWorkspace?.memberName ||
      args.openWorkspace?.fullName ||
      args.openWorkspace?.userName ||
      membership?.fullName ||
      membership?.memberName ||
      membership?.userName ||
      args.user?.fullName ||
      args.user?.name ||
      args.user?.email ||
      args.account?.name,
    "Owner"
  );
}

function selectedOwnerRole(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  user?: AnyRow | null;
}) {
  const membership = args.openWorkspace?.membership || readStoredActiveMembership();

  return text(
    args.openWorkspace?.role ||
      membership?.role ||
      args.user?.role,
    "owner"
  ).replaceAll("_", " ");
}

function n(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: any, fallback = "") {
  return String(value || "").trim() || fallback;
}

function idOf(row?: AnyRow) {
  return (
    row?.id ??
    row?.localId ??
    row?.cloudId ??
    row?.payload?.id ??
    row?.payload?.localId
  );
}

function sameAccount(row: AnyRow, accountId?: string | null) {
  return (
    row &&
    row.isDeleted !== true &&
    (!row.accountId || !accountId || row.accountId === accountId)
  );
}

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return (
    row?.isDeleted !== true &&
    row?.active !== false &&
    row?.disabled !== true &&
    ![
      "deleted",
      "archived",
      "inactive",
      "disabled",
      "blocked",
      "suspended",
    ].includes(status)
  );
}

function rowName(row?: AnyRow) {
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
      hour: "2-digit",
      minute: "2-digit",
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

async function safeArray<T = AnyRow>(tableName: string): Promise<T[]> {
  const table = (db as any)[tableName];
  return table?.toArray ? table.toArray() : [];
}

function latestOf(rows: AnyRow[]) {
  return [...rows]
    .filter(activeRow)
    .sort(
      (a, b) =>
        n(b.updatedAt || b.createdAt || b.sentAt || b.paidAt) -
        n(a.updatedAt || a.createdAt || a.sentAt || a.paidAt),
    )[0];
}

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function sum(rows: AnyRow[], field: string) {
  return rows
    .filter(activeRow)
    .reduce((total, row) => total + n(row[field]), 0);
}

function roleCount(rows: AnyRow[], role: string) {
  return rows
    .filter(activeRow)
    .filter(
      (row) => String(row.role || row.roleName || "").toLowerCase() === role,
    ).length;
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
        `${row.role || "user"}-${row.teacherLocalId || row.studentLocalId || row.parentLocalId || row.schoolId || row.branchId || ""}`,
    );

    if (key) map.set(key, row);
  });

  return map.size;
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (
    ["active", "paid", "sent", "succeeded", "success", "synced"].includes(value)
  )
    return "green";
  if (
    ["failed", "overdue", "cancelled", "expired", "suspended"].includes(value)
  )
    return "red";
  if (["pending", "processing", "trial", "draft"].includes(value))
    return "orange";
  if (["scheduled", "issued"].includes(value)) return "blue";
  return "gray";
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "")
    .toLowerCase()
    .trim();
  if (
    value.includes("institution") ||
    value.includes("school") ||
    value.includes("branch")
  )
    return "institution";
  if (
    value.includes("access") ||
    value.includes("user") ||
    value.includes("role")
  )
    return "access";
  if (
    value.includes("billing") ||
    value.includes("subscription") ||
    value.includes("invoice") ||
    value.includes("payment")
  )
    return "billing";
  if (
    value.includes("communication") ||
    value.includes("message") ||
    value.includes("announcement")
  )
    return "communication";
  if (
    value.includes("system") ||
    value.includes("profile") ||
    value.includes("sync") ||
    value.includes("calendar")
  )
    return "system";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    institution: "Institution",
    access: "Access Control",
    billing: "Billing",
    communication: "Communication",
    system: "System",
    other: "Other",
  };
  return labels[area] || area;
}

function buildNavModules(
  navSections?: RoleNavSection[],
): Omit<DashboardModule, "value" | "note" | "tone">[] {
  const unique = new Map<
    string,
    Omit<DashboardModule, "value" | "note" | "tone">
  >();

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

function metricFor(
  routeKey: string,
  rows: Record<string, AnyRow[]>,
  summary: AnyRow,
): CountMetric {
  const currency = summary.currency || "GHS";

  const metricMap: Record<string, CountMetric> = {
    schools: {
      value: summary.schools,
      note: `${summary.branches} branch record(s) linked to your account.`,
      tone: summary.schools ? "green" : "orange",
    },
    branches: {
      value: summary.branches,
      note: "Campuses and branch operating units under your schools.",
      tone: summary.branches ? "blue" : "orange",
    },
    users: {
      value: summary.users,
      note: `${summary.schoolAdmins} school admin(s), ${summary.branchAdmins} branch admin(s), ${summary.accountants} accountant(s).`,
      tone: summary.users ? "purple" : "orange",
    },
    billing: {
      value: money(summary.totalPaid || summary.totalInvoice, currency),
      note: `${summary.invoices} invoice(s), ${summary.payments} payment record(s).`,
      tone: summary.totalPaid ? "green" : "gray",
    },
    subscription: {
      value: summary.planName,
      note: `Status: ${summary.subscriptionStatus}.`,
      tone: statusTone(summary.subscriptionStatus),
    },
    invoices: {
      value: summary.invoices,
      note: "Billing invoices and account payment obligations.",
      tone: summary.invoices ? "blue" : "gray",
    },
    payments: {
      value: summary.payments,
      note: "Account payments, receipts and provider references.",
      tone: summary.payments ? "green" : "gray",
    },
    profile: {
      value: "Open",
      note: "Account identity, media, defaults and protected settings.",
      tone: "purple",
    },
    sync: {
      value: summary.openConflicts,
      note: `${summary.openConflicts} open sync conflict(s) from local cache.`,
      tone: summary.openConflicts ? "red" : "green",
    },
    calendarOverview: {
      value: summary.calendarItems || "Open",
      note: "Owner-level calendar overview and upcoming account events.",
      tone: summary.calendarItems ? "blue" : "gray",
    },
    ownerAnnouncements: {
      value: summary.announcements,
      note: "Owner authority broadcasts to school admins and branch admins.",
      tone: summary.announcements ? "blue" : "gray",
    },
    messages: {
      value: summary.messages,
      note: "Direct owner conversations with admins and accountants.",
      tone: summary.messages ? "green" : "gray",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

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
    note: "Module is listed from Owner navigation. Add a metric mapping when data is ready.",
    tone: "gray",
  };
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`od-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="od-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="od-empty">
      <div>👑</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default function OwnerDashboardPage({
  navigate,
  navSections,
}: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading, user, account } = useAccount() as any;
  const { settings, loading: settingsLoading } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color,#2563eb)";

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

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
          const tableRows = await safeArray(tableName);
          return [
            tableName,
            tableRows.filter((row) => sameAccount(row, accountId)),
          ] as const;
        }),
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load owner dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading, settingsLoading]);

  const rows = rowsByTable;

  const summary = useMemo(() => {
    const schools = rows.schools || [];
    const schoolIds = new Set(
      schools
        .filter(activeRow)
        .map((school) => Number(idOf(school)))
        .filter(Boolean),
    );
    const branches = (rows.branches || []).filter(
      (branch) => !schoolIds.size || schoolIds.has(Number(branch.schoolId)),
    );
    const users = (rows.appUsers || []).length
      ? rows.appUsers || []
      : (rows.users || []).length
        ? rows.users || []
        : rows.accountUsers || [];
    const memberships = (rows.userMemberships || []).length
      ? rows.userMemberships || []
      : rows.memberships || [];
    const invoices = rows.invoices || [];
    const payments = [...(rows.appPayments || []), ...(rows.payments || [])];
    const subscriptions = rows.accountSubscriptions || [];
    const plans = rows.subscriptionPlans || [];
    const latestSubscription = latestOf(subscriptions);
    const currentPlan =
      plans.find(
        (plan) => String(plan.id) === String(latestSubscription?.planId),
      ) ||
      plans.find((plan) => plan.active) ||
      null;
    const totalInvoice = invoices.reduce(
      (total, row) => total + n(row.total || row.amount || row.subtotal),
      0,
    );
    const totalPaid = payments
      .filter((row) =>
        ["paid", "succeeded", "success"].includes(
          String(row.status || "").toLowerCase(),
        ),
      )
      .reduce((total, row) => total + n(row.amount || row.total), 0);
    const openConflicts = (rows.syncConflicts || []).filter(
      (row) => String(row.status || "open").toLowerCase() === "open",
    ).length;

    return {
      schools: count(schools),
      branches: count(branches),
      users: uniqueUsersRoleCount(users, memberships),
      memberships: count(memberships),
      schoolAdmins:
        roleCount(memberships, "admin") +
        roleCount(memberships, "school_admin"),
      branchAdmins: roleCount(memberships, "branch_admin"),
      accountants: roleCount(memberships, "accountant"),
      announcements: count(rows.announcements || []),
      messages: count(rows.messageThreads || []),
      invoices: count(invoices),
      payments: count(payments),
      totalInvoice,
      totalPaid,
      openConflicts,
      subscriptionStatus: text(latestSubscription?.status, "Not set"),
      planName: text(
        currentPlan?.name || latestSubscription?.planName,
        "No plan",
      ),
      currency: currentPlan?.currency || latestSubscription?.currency || "GHS",
      calendarItems: 0,
      ownerName: selectedOwnerName({ openWorkspace, user, account }),
      ownerRole: selectedOwnerRole({ openWorkspace, user }),
    };
  }, [rows, openWorkspace, user, account]);

  const modules = useMemo<DashboardModule[]>(() => {
    const navModules = buildNavModules(navSections);

    return navModules.map((module) => {
      const metric = metricFor(module.routeKey, rows, summary);
      return {
        ...module,
        ...metric,
      };
    });
  }, [navSections, rows, summary]);

  const filteredModules = useMemo(() => {
    const q = query.toLowerCase().trim();
    return modules.filter((item) => {
      if (area !== "all" && item.area !== area) return false;
      if (!q) return true;
      return `${item.label} ${item.note} ${item.value} ${item.area}`
        .toLowerCase()
        .includes(q);
    });
  }, [area, modules, query]);

  const recent = useMemo(() => {
    const schools = rows.schools || [];
    const branches = rows.branches || [];
    const announcements = rows.announcements || [];
    const threads = rows.messageThreads || [];
    const payments = [...(rows.appPayments || []), ...(rows.payments || [])];

    const recentRows: AnyRow[] = [
      ...schools.map((row) => ({
        ...row,
        _kind: "School",
        _icon: "🏫",
        _title: rowName(row),
        _date: row.updatedAt || row.createdAt,
      })),
      ...branches.map((row) => ({
        ...row,
        _kind: "Branch",
        _icon: "🏢",
        _title: rowName(row),
        _date: row.updatedAt || row.createdAt,
      })),
      ...announcements.map((row) => ({
        ...row,
        _kind: "Announcement",
        _icon: "📢",
        _title: text(row.title, "Announcement"),
        _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt,
      })),
      ...threads.map((row) => ({
        ...row,
        _kind: "Message",
        _icon: "✉️",
        _title: text(row.subject || row.title, "Message thread"),
        _date: row.lastMessageAt || row.updatedAt || row.createdAt,
      })),
      ...payments.map((row) => ({
        ...row,
        _kind: "Payment",
        _icon: "💰",
        _title: money(
          row.amount || row.total,
          row.currency || summary.currency || "GHS",
        ),
        _date: row.paidAt || row.updatedAt || row.createdAt,
      })),
    ];

    return recentRows
      .filter(activeRow)
      .sort((a, b) => n(b._date) - n(a._date))
      .slice(0, 8);
  }, [rows, summary.currency]);

  const activeFilterCount = area !== "all" ? 1 : 0;

  function openRoute(routeKey: string) {
    if (typeof navigate === "function") {
      navigate(routeKey);
      return;
    }

    try {
      window.dispatchEvent(
        new CustomEvent("eleeveon:portal-route", { detail: { key: routeKey } }),
      );
      window.dispatchEvent(
        new CustomEvent("role-portal:navigate", { detail: { key: routeKey } }),
      );
      window.dispatchEvent(
        new CustomEvent("portal:navigate", { detail: routeKey }),
      );
    } catch {
      // Fallback only. Current RolePortalShell should use the navigate prop.
    }
  }

  if (loading || accountLoading || settingsLoading) {
    return (
      <State
        primary={primary}
        title="Opening owner dashboard..."
        text="Loading account schools, branches, users, billing and communication records."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before viewing the owner dashboard."
      />
    );
  }

  return (
    <main
      className="od-page"
      style={{ "--od-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section
        className="od-search-card"
        aria-label="Owner dashboard search and actions"
      >
        <span
          className={`status-dot-mini ${summary.openConflicts ? "orange" : summary.schools ? "green" : "gray"}`}
          title={`${summary.schools} school(s), ${summary.openConflicts} conflict(s)`}
        />

        <label className="od-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search owner modules..."
            aria-label="Search owner dashboard"
          />
        </label>

        <button
          type="button"
          className="od-add-inline"
          onClick={load}
          aria-label="Refresh owner dashboard"
          title="Refresh"
        >
          ↻
        </button>

        <button
          type="button"
          className={`od-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="od-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      <section className="od-owner-strip" aria-label="Selected owner workspace">
        <strong>{summary.ownerName}</strong>
        <span>{summary.ownerRole} · Account-wide</span>
        <Chip tone={summary.subscriptionStatus === "Not set" ? "gray" : statusTone(summary.subscriptionStatus)}>
          {summary.subscriptionStatus}
        </Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="od-filter-chips" aria-label="Active filters">
          {area !== "all" && (
            <button type="button" onClick={() => setArea("all")}>
              Area: {areaLabel(area)} ×
            </button>
          )}
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")}>
              Search: {query.trim()} ×
            </button>
          )}
        </section>
      )}

      {view === "analytics" ? (
        <AnalyticsView summary={summary} modules={modules} recent={recent} />
      ) : null}

      {view === "table" ? (
        <TableView modules={filteredModules} openRoute={openRoute} />
      ) : null}

      {view === "cards" ? (
        <section className="od-list">
          {filteredModules.map((item) => (
            <button
              key={item.key}
              type="button"
              className="owner-row"
              onClick={() => openRoute(item.routeKey)}
            >
              <span className="owner-avatar">{item.icon}</span>
              <span className="owner-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="owner-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? (
            <Empty
              title="No matching owner modules"
              text="Clear filters or search to show your owner modules."
            />
          ) : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="od-recent">
          <div className="od-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="od-recent-list">
            {recent.map((item, index) => (
              <article
                key={`${item._kind}-${idOf(item) || index}`}
                className="recent-row"
              >
                <span>{item._icon}</span>
                <b>{item._title}</b>
                <small>
                  {item._kind} · {dateLabel(item._date)}
                </small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {filterOpen ? (
        <FilterSheet
          area={area}
          setArea={setArea}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <MoreSheet
          view={view}
          setView={(mode) => {
            setView(mode);
            setMoreOpen(false);
          }}
          summary={summary}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
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
      className="od-page"
      style={{ "--od-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="od-state">
        <div className="od-spinner" />
        <h2>{title}</h2>
        <p>{body}</p>
      </section>
    </main>
  );
}

function FilterSheet({
  area,
  setArea,
  onClose,
}: {
  area: AreaFilter;
  setArea: (value: AreaFilter) => void;
  onClose: () => void;
}) {
  return (
    <div className="od-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="od-sheet small">
        <div className="od-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which owner area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="od-form compact">
          <label>
            <span>Area</span>
            <select
              value={area}
              onChange={(event) => setArea(event.target.value as AreaFilter)}
            >
              <option value="all">All areas</option>
              <option value="institution">Institution</option>
              <option value="access">Access Control</option>
              <option value="billing">Billing</option>
              <option value="communication">Communication</option>
              <option value="system">System</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="od-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>
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
  onRefresh,
  onClose,
}: {
  view: ViewMode;
  setView: (value: ViewMode) => void;
  summary: AnyRow;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="od-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="od-sheet small">
        <div className="od-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the owner home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="od-menu-list">
          <button
            type="button"
            className={view === "cards" ? "active" : ""}
            onClick={() => setView("cards")}
          >
            <span>☰</span>
            <b>List view</b>
            <small>Compact owner modules</small>
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop-friendly module list</small>
          </button>
          <button
            type="button"
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>
              {summary.schools} schools · {summary.branches} branches ·{" "}
              {summary.users} users
            </small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local owner dashboard data</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function TableView({
  modules,
  openRoute,
}: {
  modules: DashboardModule[];
  openRoute: (routeKey: string) => void;
}) {
  return (
    <section className="od-table-card">
      <div className="od-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Owner Modules ({modules.length})</th>
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
                <td>
                  <strong>
                    {item.icon} {item.label}
                  </strong>
                  <span>{item.routeKey}</span>
                </td>
                <td>{areaLabel(item.area)}</td>
                <td>{item.value}</td>
                <td>
                  <Chip tone={item.tone}>{item.tone}</Chip>
                </td>
                <td>{item.note}</td>
                <td>
                  <div className="od-table-actions">
                    <button
                      type="button"
                      onClick={() => openRoute(item.routeKey)}
                    >
                      Open
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? (
          <div className="od-empty-table">
            No owner module matches your filters.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnalyticsView({
  summary,
  modules,
  recent,
}: {
  summary: AnyRow;
  modules: DashboardModule[];
  recent: AnyRow[];
}) {
  const areaRows = [
    "institution",
    "access",
    "billing",
    "communication",
    "system",
    "other",
  ]
    .map((area) => ({
      label: areaLabel(area),
      value: modules.filter((module) => module.area === area).length,
    }))
    .filter((row) => row.value > 0);

  return (
    <section className="od-analysis-grid">
      <article className="od-analysis">
        <span>Schools</span>
        <strong>{summary.schools}</strong>
        <p>{summary.branches} branch record(s) connected to your account.</p>
      </article>
      <article className="od-analysis">
        <span>Authority Users</span>
        <strong>{summary.users}</strong>
        <p>
          {summary.schoolAdmins} school admin(s), {summary.branchAdmins} branch
          admin(s), {summary.accountants} accountant(s).
        </p>
      </article>
      <article className="od-analysis">
        <span>Billing</span>
        <strong>{summary.invoices}</strong>
        <p>
          {summary.payments} payment record(s), {summary.subscriptionStatus}{" "}
          subscription.
        </p>
      </article>
      <article className="od-analysis">
        <span>Sync</span>
        <strong>{summary.openConflicts}</strong>
        <p>Open sync conflict(s) detected in local cache.</p>
      </article>
      <article className="od-analysis wide">
        <span>Module Areas</span>
        <strong>{modules.length}</strong>
        <div className="od-analysis-list">
          {areaRows.map((row) => (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>{row.value}</small>
              </div>
              <div className="od-progress">
                <i
                  style={{
                    width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%`,
                  }}
                />
              </div>
            </section>
          ))}
        </div>
      </article>
      <article className="od-analysis wide">
        <span>Recent Activity</span>
        <strong>{recent.length}</strong>
        <p>
          Recent records from schools, branches, announcements, messages and
          payments.
        </p>
      </article>
    </section>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.od-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--od-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.od-page *,.od-page *::before,.od-page *::after{box-sizing:border-box;min-width:0}.od-page button,.od-page input,.od-page select{font:inherit;max-width:100%}.od-page button{-webkit-tap-highlight-color:transparent}.od-page input,.od-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.od-page input:focus,.od-page select:focus{border-color:color-mix(in srgb,var(--od-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--od-primary) 12%,transparent)}.od-state,.od-search-card,.od-owner-strip,.owner-row,.od-table-card,.od-analysis,.od-empty,.od-sheet,.od-recent,.recent-row{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.od-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.od-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--od-primary) 18%,transparent);border-top-color:var(--od-primary);animation:spin .8s linear infinite}.od-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.od-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.od-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.od-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.od-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.od-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.od-icon-button,.od-filter-button,.od-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.od-add-inline{border-color:var(--od-primary);background:var(--od-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--od-primary) 22%,transparent)}.od-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.od-filter-button{position:relative;background:color-mix(in srgb,var(--od-primary) 8%,var(--card-bg,#fff));color:var(--od-primary)}.od-filter-button.active{background:var(--od-primary);color:#fff;border-color:var(--od-primary)}.od-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.od-owner-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.od-owner-strip strong,.od-owner-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.od-owner-strip strong{font-size:13px;font-weight:1000}.od-owner-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.od-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.od-filter-chips::-webkit-scrollbar{display:none}.od-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--od-primary) 11%,transparent);color:var(--od-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.od-list{display:grid;gap:7px;margin-top:10px}.owner-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.owner-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--od-primary) 12%,var(--surface,#fff));font-size:22px}.owner-main,.owner-main strong,.owner-main small,.owner-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.owner-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.owner-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.owner-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.owner-side{display:flex;align-items:center;gap:7px}.owner-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.od-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.od-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.od-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.od-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.od-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.od-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.od-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.od-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.od-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.od-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.od-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.od-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.od-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.od-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.od-form{display:grid;gap:10px}.od-form label{display:grid;gap:6px}.od-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.od-menu-list{display:grid;gap:8px}.od-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.od-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--od-primary) 10%,transparent);color:var(--od-primary);font-weight:1000}.od-menu-list button b,.od-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.od-menu-list button b{font-size:13px;font-weight:1000}.od-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.od-menu-list button.active{border-color:color-mix(in srgb,var(--od-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--od-primary) 8%,var(--surface,#fff))}.od-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.od-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.od-sheet-actions button.primary{border-color:var(--od-primary);background:var(--od-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--od-primary) 25%,transparent)}.od-table-card,.od-analysis,.od-empty{padding:13px;border-radius:24px}.od-table-card{margin-top:10px}.od-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.od-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.od-table-scroll th,.od-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.od-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--od-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.od-table-scroll td strong,.od-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.od-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.od-table-actions{display:flex;gap:7px;overflow-x:auto}.od-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--od-primary);border-radius:999px;padding:0 12px;background:var(--od-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.od-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.od-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.od-analysis span,.od-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.od-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.od-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.od-analysis-list{display:grid;gap:10px;margin-top:12px}.od-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.od-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.od-analysis-list b,.od-analysis-list small{font-size:12px}.od-analysis-list small{color:var(--muted,#64748b);font-weight:850}.od-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.od-progress i{display:block;height:100%;border-radius:inherit;background:var(--od-primary)}.od-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.od-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--od-primary) 12%,var(--surface,#fff));font-size:28px}.od-empty h3{margin:0;font-size:18px;font-weight:1000}.od-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.od-recent{margin-top:10px;border-radius:24px;padding:12px}.od-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.od-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.od-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--od-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.od-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.od-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.od-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.owner-row{border-radius:24px;padding:12px}.od-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.od-analysis.wide{grid-column:span 2}.od-sheet-backdrop{place-items:center;padding:18px}.od-sheet{border-radius:28px;padding:18px}.od-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.od-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.od-search-card,.od-owner-strip,.od-list,.od-analysis-grid,.od-table-card,.od-filter-chips,.od-recent{max-width:1180px;margin-left:auto;margin-right:auto}.od-list{grid-template-columns:repeat(3,minmax(0,1fr))}.od-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.od-analysis.wide{grid-column:span 2}.od-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.od-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.od-icon-button,.od-filter-button,.od-add-inline{width:40px;height:40px}.owner-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.owner-side{grid-column:1/-1;justify-content:flex-end}.od-sheet{border-radius:24px 24px 18px 18px;padding:12px}.od-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.od-sheet-actions button{width:100%}}
`;
