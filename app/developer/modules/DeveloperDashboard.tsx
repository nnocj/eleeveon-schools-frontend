"use client";

/**
 * app/developer/modules/DeveloperDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON DEVELOPER DASHBOARD V2
 * ---------------------------------------------------------
 * Golden Standard Platform Home.
 * Platform-scoped, offline-first, mobile-first, theme-safe.
 *
 * Workspace-session aligned:
 * - Prefer the selected workspace session written by /select-role and opened
 *   by RolePortalShell for developer identity display.
 * - Developer dashboard remains platform/account-wide and does not use
 *   schoolId/branchId as data scope.
 * - Receives NAV_SECTIONS from app/developer/page.tsx, so dashboard modules
 *   automatically match the actual Developer Portal menu.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { db } from "../../lib/db/db";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter =
  | "all"
  | "saas"
  | "team"
  | "billing"
  | "support"
  | "tools"
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

const HIDDEN_DASHBOARD_KEYS = new Set(["developerDashboard"]);

const TABLE_NAMES = [
  "accounts",
  "schools",
  "branches",
  "appUsers",
  "users",
  "accountUsers",
  "userMemberships",
  "memberships",
  "subscriptionPlans",
  "accountSubscriptions",
  "invoices",
  "appPayments",
  "payments",
  "billingEvents",
  "featureFlags",
  "accountFeatureFlags",
  "supportTickets",
  "supportMessages",
  "syncConflicts",
  "syncDevices",
  "auditLogs",
  "backgroundJobs",
  "errorReports",
  "systemHealthChecks",
  "apiClients",
  "apiKeys",
  "webhooks",
  "webhookLogs",
  "integrationMappings",
  "storageUsages",
  "backups",
  "releases",
] as const;

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
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

function activeRow(row: AnyRow) {
  const status = String(row?.status || "").toLowerCase();
  return (
    row?.isDeleted !== true &&
    row?.active !== false &&
    row?.disabled !== true &&
    !["deleted", "archived", "inactive", "disabled", "blocked", "suspended"].includes(status)
  );
}

function rowName(row?: AnyRow | null) {
  return text(row?.fullName || row?.name || row?.title || row?.label || row?.email, "Unnamed");
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

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function sum(rows: AnyRow[], field: string) {
  return rows.filter(activeRow).reduce((total, row) => total + n(row[field]), 0);
}

function latestOf(rows: AnyRow[]) {
  return [...rows]
    .filter(activeRow)
    .sort((a, b) => n(b.updatedAt || b.createdAt || b.startedAt || b.finishedAt) - n(a.updatedAt || a.createdAt || a.startedAt || a.finishedAt))[0];
}

function uniqueAccounts(rows: AnyRow[]) {
  const ids = new Set<string>();
  rows.filter(activeRow).forEach((row) => {
    const key = String(row.accountId || row.id || row.email || "");
    if (key) ids.add(key);
  });
  return ids.size;
}

function roleCount(rows: AnyRow[], role: string) {
  return rows
    .filter(activeRow)
    .filter((row) => String(row.role || row.roleName || "").toLowerCase() === role).length;
}

function statusTone(status?: string): Tone {
  const value = String(status || "").toLowerCase();
  if (["active", "paid", "sent", "succeeded", "success", "synced", "healthy", "resolved", "completed"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "expired", "suspended", "critical", "error", "open"].includes(value)) return "red";
  if (["pending", "processing", "trial", "draft", "warning", "queued"].includes(value)) return "orange";
  if (["scheduled", "issued", "running"].includes(value)) return "blue";
  return "gray";
}

function selectedDeveloperName(args: {
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
    "Developer"
  );
}

function selectedDeveloperRole(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  user?: AnyRow | null;
}) {
  const membership = args.openWorkspace?.membership || readStoredActiveMembership();

  return text(
    args.openWorkspace?.role ||
      membership?.role ||
      args.user?.role,
    "developer"
  ).replaceAll("_", " ");
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("saas") || value.includes("control")) return "saas";
  if (value.includes("team")) return "team";
  if (value.includes("billing")) return "billing";
  if (value.includes("support") || value.includes("technical")) return "support";
  if (value.includes("developer tools") || value.includes("tools")) return "tools";
  if (value.includes("system")) return "system";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    saas: "SaaS Control",
    team: "Platform Team",
    billing: "Platform Billing",
    support: "Technical Support",
    tools: "Developer Tools",
    system: "System",
    other: "Other",
  };
  return labels[area] || area;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`dd-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="dd-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="dd-empty">
      <div>🧭</div>
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

function metricFor(routeKey: string, rows: Record<string, AnyRow[]>, summary: AnyRow): CountMetric {
  const metricMap: Record<string, CountMetric> = {
    plans: {
      value: summary.plans,
      note: `${summary.activePlans} active plan(s), latest ${summary.latestPlan}.`,
      tone: summary.activePlans ? "green" : "orange",
    },
    subscriptions: {
      value: summary.subscriptions,
      note: `${summary.activeSubscriptions} active, ${summary.pendingSubscriptions} pending/trial.`,
      tone: summary.activeSubscriptions ? "green" : summary.subscriptions ? "orange" : "gray",
    },
    accounts: {
      value: summary.accounts,
      note: `${summary.schools} school record(s), ${summary.branches} branch record(s).`,
      tone: summary.accounts ? "blue" : "orange",
    },
    featureFlags: {
      value: summary.featureFlags,
      note: "Platform and account-level feature switches.",
      tone: summary.featureFlags ? "purple" : "gray",
    },
    developerTeam: {
      value: summary.team,
      note: `${summary.developers} developer(s), ${summary.platformTeam} platform team member(s).`,
      tone: summary.team ? "green" : "orange",
    },
    invoices: {
      value: summary.invoices,
      note: `${money(summary.invoiceTotal, summary.currencyCode)} total invoice value.`,
      tone: summary.invoices ? "blue" : "gray",
    },
    payments: {
      value: summary.payments,
      note: `${money(summary.paymentTotal, summary.currencyCode)} total payment value.`,
      tone: summary.payments ? "green" : "gray",
    },
    support: {
      value: summary.supportTickets,
      note: `${summary.openSupportTickets} open support ticket(s).`,
      tone: summary.openSupportTickets ? "orange" : "green",
    },
    systemHealth: {
      value: summary.healthStatus,
      note: `${summary.jobs} background job(s), ${summary.errorReports} error report(s).`,
      tone: statusTone(summary.healthStatus),
    },
    syncDiagnostics: {
      value: summary.openConflicts,
      note: `${summary.devices} sync device(s), ${summary.openConflicts} open conflict(s).`,
      tone: summary.openConflicts ? "red" : "green",
    },
    errorReports: {
      value: summary.errorReports,
      note: "Runtime and client error reports.",
      tone: summary.errorReports ? "red" : "green",
    },
    auditLogs: {
      value: summary.auditLogs,
      note: "Platform audit activity and sensitive operations.",
      tone: summary.auditLogs ? "blue" : "gray",
    },
    databaseTools: {
      value: "Open",
      note: "Database health, counts and diagnostics.",
      tone: "blue",
    },
    databaseStudio: {
      value: "Open",
      note: "Inspect platform tables and records.",
      tone: "purple",
    },
    databaseDesigner: {
      value: "Open",
      note: "Design and review data models.",
      tone: "purple",
    },
    sqlConsole: {
      value: "Safe",
      note: "Guarded SQL console for developer operations.",
      tone: "orange",
    },
    backups: {
      value: summary.backups,
      note: "Backup and restore points.",
      tone: summary.backups ? "green" : "gray",
    },
    integrations: {
      value: summary.integrations,
      note: `${summary.apiClients} API client(s), ${summary.webhooks} webhook(s).`,
      tone: summary.integrations ? "blue" : "gray",
    },
    releases: {
      value: summary.releases,
      note: "Release planning, rollout and version records.",
      tone: summary.releases ? "green" : "gray",
    },
    settings: {
      value: "Open",
      note: "Developer settings and platform controls.",
      tone: "gray",
    },
  };

  if (metricMap[routeKey]) return metricMap[routeKey];

  const guessedRows = rows[routeKey] || [];
  if (guessedRows.length) {
    return { value: count(guessedRows), note: "Auto-counted from matching local table.", tone: count(guessedRows) ? "green" : "gray" };
  }

  return { value: "Open", note: "Module is listed from Developer navigation. Add a metric mapping when data is ready.", tone: "gray" };
}

export default function DeveloperDashboard({ navigate, navSections }: RouteProps) {
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
          const rows = await safeArray(tableName);
          return [tableName, rows.filter((row) => row?.isDeleted !== true)] as const;
        })
      );

      setRowsByTable(Object.fromEntries(loaded));
    } catch (error) {
      console.error("Failed to load developer dashboard:", error);
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
    const accounts = rows.accounts || [];
    const schools = rows.schools || [];
    const branches = rows.branches || [];
    const users = (rows.appUsers || []).length ? rows.appUsers || [] : (rows.users || []).length ? rows.users || [] : rows.accountUsers || [];
    const memberships = (rows.userMemberships || []).length ? rows.userMemberships || [] : rows.memberships || [];
    const plans = rows.subscriptionPlans || [];
    const subscriptions = rows.accountSubscriptions || [];
    const invoices = rows.invoices || [];
    const payments = [...(rows.appPayments || []), ...(rows.payments || [])];
    const syncConflicts = rows.syncConflicts || [];
    const syncDevices = rows.syncDevices || [];
    const supportTickets = rows.supportTickets || [];
    const errors = rows.errorReports || [];
    const latestPlan = latestOf(plans);
    const latestHealth = latestOf(rows.systemHealthChecks || []);
    const jobs = rows.backgroundJobs || [];

    const invoiceTotal = invoices.reduce((total, row) => total + n(row.total || row.amount || row.subtotal), 0);
    const paymentTotal = payments.reduce((total, row) => total + n(row.amount || row.total), 0);
    const openConflicts = syncConflicts.filter((row) => String(row.status || "open").toLowerCase() === "open").length;
    const openSupportTickets = supportTickets.filter((row) => !["closed", "resolved", "done"].includes(String(row.status || "open").toLowerCase())).length;

    return {
      developerName: selectedDeveloperName({ openWorkspace, user, account }),
      developerRole: selectedDeveloperRole({ openWorkspace, user }),
      accounts: uniqueAccounts(accounts),
      schools: count(schools),
      branches: count(branches),
      users: count(users),
      team: roleCount(memberships, "developer") + roleCount(memberships, "platform_team"),
      developers: roleCount(memberships, "developer"),
      platformTeam: roleCount(memberships, "platform_team"),
      plans: count(plans),
      activePlans: plans.filter((row) => activeRow(row) && row.active !== false).length,
      latestPlan: text(latestPlan?.name || latestPlan?.code, "No plan"),
      subscriptions: count(subscriptions),
      activeSubscriptions: subscriptions.filter((row) => String(row.status || "").toLowerCase() === "active").length,
      pendingSubscriptions: subscriptions.filter((row) => ["pending", "trial", "processing"].includes(String(row.status || "").toLowerCase())).length,
      invoices: count(invoices),
      payments: count(payments),
      invoiceTotal,
      paymentTotal,
      currencyCode: text(payments[0]?.currency || invoices[0]?.currency || latestPlan?.currency, "GHS"),
      featureFlags: count([...(rows.featureFlags || []), ...(rows.accountFeatureFlags || [])]),
      supportTickets: count(supportTickets),
      openSupportTickets,
      auditLogs: count(rows.auditLogs || []),
      openConflicts,
      devices: count(syncDevices),
      jobs: count(jobs),
      errorReports: count(errors),
      healthStatus: text(latestHealth?.status || (errors.length ? "warning" : "healthy"), "healthy"),
      backups: count(rows.backups || []),
      apiClients: count(rows.apiClients || []),
      webhooks: count([...(rows.webhooks || []), ...(rows.webhookLogs || [])]),
      integrations: count([...(rows.integrationMappings || []), ...(rows.apiClients || []), ...(rows.webhooks || [])]),
      releases: count(rows.releases || []),
    };
  }, [account, openWorkspace, rows, user]);

  const modules = useMemo<DashboardModule[]>(() => {
    const navModules = buildNavModules(navSections);
    return navModules.map((module) => ({ ...module, ...metricFor(module.routeKey, rows, summary) }));
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
      ...(rows.accounts || []).map((row) => ({ ...row, _kind: "Account", _icon: "🏫", _title: rowName(row), _date: row.updatedAt || row.createdAt })),
      ...(rows.accountSubscriptions || []).map((row) => ({ ...row, _kind: "Subscription", _icon: "🔁", _title: text(row.planName || row.status, "Subscription"), _date: row.updatedAt || row.createdAt })),
      ...(rows.invoices || []).map((row) => ({ ...row, _kind: "Invoice", _icon: "🧾", _title: money(row.total || row.amount, row.currency || "GHS"), _date: row.issuedAt || row.updatedAt || row.createdAt })),
      ...([...(rows.appPayments || []), ...(rows.payments || [])]).map((row) => ({ ...row, _kind: "Payment", _icon: "💰", _title: money(row.amount || row.total, row.currency || "GHS"), _date: row.paidAt || row.updatedAt || row.createdAt })),
      ...(rows.syncConflicts || []).map((row) => ({ ...row, _kind: "Sync Conflict", _icon: "🔄", _title: text(row.tableName || row.status, "Sync conflict"), _date: row.updatedAt || row.createdAt })),
      ...(rows.errorReports || []).map((row) => ({ ...row, _kind: "Error", _icon: "🐞", _title: text(row.title || row.message, "Error report"), _date: row.updatedAt || row.createdAt })),
      ...(rows.auditLogs || []).map((row) => ({ ...row, _kind: "Audit", _icon: "📜", _title: text(row.action || row.event, "Audit log"), _date: row.createdAt || row.updatedAt })),
    ];

    return records.filter(activeRow).sort((a, b) => n(b._date) - n(a._date)).slice(0, 8);
  }, [rows]);

  const activeFilterCount = area !== "all" ? 1 : 0;

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

  if (loading || accountLoading || settingsLoading) {
    return <State primary={primary} title="Opening developer dashboard..." text="Loading accounts, billing, support, sync health and developer tools." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the developer portal." />;
  }

  return (
    <main className="dd-page" style={{ "--dd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="dd-search-card" aria-label="Developer dashboard search and actions">
        <span className={`status-dot-mini ${summary.openConflicts || summary.errorReports ? "orange" : "green"}`} title={`${summary.accounts} account(s), ${summary.openConflicts} conflict(s), ${summary.errorReports} error(s)`} />

        <label className="dd-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search developer modules..." aria-label="Search developer dashboard" />
        </label>

        <button type="button" className="dd-add-inline" onClick={load} aria-label="Refresh developer dashboard" title="Refresh">↻</button>

        <button type="button" className={`dd-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="dd-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="dd-developer-strip" aria-label="Current developer context">
        <strong>{summary.developerName}</strong>
        <span>{summary.developerRole} · Platform-wide</span>
        <Chip tone={statusTone(summary.healthStatus)}>{summary.healthStatus}</Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="dd-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="dd-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="developer-row" onClick={() => openRoute(item.routeKey)}>
              <span className="developer-avatar">{item.icon}</span>
              <span className="developer-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="developer-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching developer modules" text="Clear filters or search to show your developer modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="dd-recent">
          <div className="dd-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="dd-recent-list">
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

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main className="dd-page" style={{ "--dd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="dd-state">
        <div className="dd-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="dd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="dd-sheet small">
        <div className="dd-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which developer area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="dd-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="saas">SaaS Control</option>
              <option value="team">Platform Team</option>
              <option value="billing">Platform Billing</option>
              <option value="support">Technical Support</option>
              <option value="tools">Developer Tools</option>
              <option value="system">System</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="dd-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="dd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="dd-sheet small">
        <div className="dd-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the developer home remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="dd-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact developer modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.accounts} accounts · {summary.subscriptions} subscriptions · {summary.openConflicts} conflicts</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local platform dashboard data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="dd-table-card">
      <div className="dd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Developer Modules ({modules.length})</th>
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
                <td><div className="dd-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="dd-empty-table">No developer module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["saas", "team", "billing", "support", "tools", "system", "other"].map((area) => ({
    label: areaLabel(area),
    value: modules.filter((module) => module.area === area).length,
  })).filter((row) => row.value > 0);

  return (
    <section className="dd-analysis-grid">
      <article className="dd-analysis"><span>Accounts</span><strong>{summary.accounts}</strong><p>{summary.schools} school(s), {summary.branches} branch(es), {summary.users} user record(s).</p></article>
      <article className="dd-analysis"><span>Subscriptions</span><strong>{summary.activeSubscriptions}</strong><p>{summary.subscriptions} total subscription record(s), {summary.pendingSubscriptions} pending/trial.</p></article>
      <article className="dd-analysis"><span>Billing</span><strong>{money(summary.paymentTotal, summary.currencyCode)}</strong><p>{summary.invoices} invoice(s), {summary.payments} payment record(s).</p></article>
      <article className="dd-analysis"><span>Health</span><strong>{summary.healthStatus}</strong><p>{summary.openConflicts} conflict(s), {summary.errorReports} error report(s), {summary.jobs} job(s).</p></article>
      <article className="dd-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="dd-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="dd-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="dd-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent records from accounts, subscriptions, invoices, payments, sync, errors and audit logs.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.dd-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--dd-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.dd-page *,.dd-page *::before,.dd-page *::after{box-sizing:border-box;min-width:0}.dd-page button,.dd-page input,.dd-page select{font:inherit;max-width:100%}.dd-page button{-webkit-tap-highlight-color:transparent}.dd-page input,.dd-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.dd-page input:focus,.dd-page select:focus{border-color:color-mix(in srgb,var(--dd-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--dd-primary) 12%,transparent)}.dd-state,.dd-search-card,.developer-row,.dd-table-card,.dd-analysis,.dd-empty,.dd-sheet,.dd-recent,.recent-row,.dd-developer-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.dd-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.dd-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--dd-primary) 18%,transparent);border-top-color:var(--dd-primary);animation:spin .8s linear infinite}.dd-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.dd-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.dd-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.dd-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.dd-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.dd-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.dd-icon-button,.dd-filter-button,.dd-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.dd-add-inline{border-color:var(--dd-primary);background:var(--dd-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--dd-primary) 22%,transparent)}.dd-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.dd-filter-button{position:relative;background:color-mix(in srgb,var(--dd-primary) 8%,var(--card-bg,#fff));color:var(--dd-primary)}.dd-filter-button.active{background:var(--dd-primary);color:#fff;border-color:var(--dd-primary)}.dd-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.dd-developer-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.dd-developer-strip strong,.dd-developer-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dd-developer-strip strong{font-size:13px;font-weight:1000}.dd-developer-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.dd-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.dd-filter-chips::-webkit-scrollbar{display:none}.dd-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--dd-primary) 11%,transparent);color:var(--dd-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.dd-list{display:grid;gap:7px;margin-top:10px}.developer-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.developer-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--dd-primary) 12%,var(--surface,#fff));font-size:22px}.developer-main,.developer-main strong,.developer-main small,.developer-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.developer-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.developer-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.developer-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.developer-side{display:flex;align-items:center;gap:7px}.developer-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.dd-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.dd-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.dd-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.dd-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.dd-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.dd-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.dd-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.dd-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.dd-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.dd-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.dd-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.dd-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.dd-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.dd-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.dd-form{display:grid;gap:10px}.dd-form label{display:grid;gap:6px}.dd-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.dd-menu-list{display:grid;gap:8px}.dd-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.dd-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--dd-primary) 10%,transparent);color:var(--dd-primary);font-weight:1000}.dd-menu-list button b,.dd-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dd-menu-list button b{font-size:13px;font-weight:1000}.dd-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.dd-menu-list button.active{border-color:color-mix(in srgb,var(--dd-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--dd-primary) 8%,var(--surface,#fff))}.dd-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.dd-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.dd-sheet-actions button.primary{border-color:var(--dd-primary);background:var(--dd-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--dd-primary) 25%,transparent)}.dd-table-card,.dd-analysis,.dd-empty{padding:13px;border-radius:24px}.dd-table-card{margin-top:10px}.dd-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.dd-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.dd-table-scroll th,.dd-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.dd-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--dd-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.dd-table-scroll td strong,.dd-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dd-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.dd-table-actions{display:flex;gap:7px;overflow-x:auto}.dd-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--dd-primary);border-radius:999px;padding:0 12px;background:var(--dd-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.dd-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.dd-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.dd-analysis span,.dd-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.dd-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere;text-transform:capitalize}.dd-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.dd-analysis-list{display:grid;gap:10px;margin-top:12px}.dd-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.dd-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.dd-analysis-list b,.dd-analysis-list small{font-size:12px}.dd-analysis-list small{color:var(--muted,#64748b);font-weight:850}.dd-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.dd-progress i{display:block;height:100%;border-radius:inherit;background:var(--dd-primary)}.dd-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.dd-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--dd-primary) 12%,var(--surface,#fff));font-size:28px}.dd-empty h3{margin:0;font-size:18px;font-weight:1000}.dd-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.dd-recent{margin-top:10px;border-radius:24px;padding:12px}.dd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.dd-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.dd-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--dd-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.dd-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.dd-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.dd-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.developer-row{border-radius:24px;padding:12px}.dd-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dd-analysis.wide{grid-column:span 2}.dd-sheet-backdrop{place-items:center;padding:18px}.dd-sheet{border-radius:28px;padding:18px}.dd-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.dd-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.dd-search-card,.dd-developer-strip,.dd-list,.dd-analysis-grid,.dd-table-card,.dd-filter-chips,.dd-recent{max-width:1180px;margin-left:auto;margin-right:auto}.dd-list{grid-template-columns:repeat(3,minmax(0,1fr))}.dd-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.dd-analysis.wide{grid-column:span 2}.dd-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.dd-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.dd-icon-button,.dd-filter-button,.dd-add-inline{width:40px;height:40px}.developer-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.developer-side{grid-column:1/-1;justify-content:flex-end}.dd-developer-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.dd-developer-strip span{grid-row:2}.dd-sheet{border-radius:24px 24px 18px 18px;padding:12px}.dd-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.dd-sheet-actions button{width:100%}}
`;
