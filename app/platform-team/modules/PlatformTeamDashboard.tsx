"use client";

/**
 * app/platform-team/modules/PlatformTeamDashboard.tsx
 * ---------------------------------------------------------
 * ELEEVEON PLATFORM TEAM DASHBOARD V2
 * ---------------------------------------------------------
 * Safe platform-operations dashboard.
 * Platform-scoped, offline-first, mobile-first, theme-safe.
 *
 * Workspace-session aligned:
 * - Reads the selected workspace session written by /select-role first.
 * - Does NOT require schoolId or branchId because platform team works across
 *   customer operations, support, QA and releases.
 * - Receives NAV_SECTIONS from app/platform-team/page.tsx, so changing the
 *   portal menu automatically changes dashboard modules.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { db } from "../../lib/db";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import type { RoleNavSection } from "../../components/role-portals/RolePortalShell";

type AnyRow = Record<string, any>;
type ViewMode = "cards" | "table" | "analytics";
type AreaFilter = "all" | "today" | "customer" | "quality" | "knowledge" | "management" | "other";
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
const HIDDEN_DASHBOARD_KEYS = new Set(["dashboard"]);

const TABLE_NAMES = [
  "accounts",
  "schools",
  "branches",
  "appUsers",
  "users",
  "accountUsers",
  "userMemberships",
  "memberships",
  "supportTickets",
  "supportMessages",
  "supportDesk",
  "syncConflicts",
  "syncDevices",
  "billingEvents",
  "invoices",
  "appPayments",
  "payments",
  "bugReports",
  "errorReports",
  "qaTests",
  "qaTestRuns",
  "releaseBoard",
  "releases",
  "knowledgeBase",
  "knowledgeBaseArticles",
  "workNotes",
  "activityLogs",
  "auditLogs",
  "internalAnnouncements",
  "announcements",
  "teamTasks",
  "platformWorkItems",
  "platformTeamMembers",
  "teamPermissions",
  "permissionRules",
  "featureFlags",
  "accountFeatureFlags",
] as const;

type OpenWorkspaceSession = {
  membership?: AnyRow | null;
  membershipId?: string | null;
  role?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  email?: string | null;
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

function count(rows: AnyRow[]) {
  return rows.filter(activeRow).length;
}

function roleCount(rows: AnyRow[], role: string) {
  return rows
    .filter(activeRow)
    .filter((row) => String(row.role || row.roleName || "").toLowerCase() === role).length;
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
  if (["active", "paid", "sent", "succeeded", "success", "synced", "resolved", "closed", "passed", "released", "approved", "completed"].includes(value)) return "green";
  if (["failed", "overdue", "cancelled", "expired", "suspended", "critical", "error", "open", "blocked"].includes(value)) return "red";
  if (["pending", "processing", "trial", "draft", "warning", "queued", "in_progress"].includes(value)) return "orange";
  if (["scheduled", "issued", "running", "testing"].includes(value)) return "blue";
  return "gray";
}

function selectedMemberName(args: { openWorkspace?: OpenWorkspaceSession | null; user?: AnyRow | null }) {
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
      args.user?.email,
    "Platform Team"
  );
}

function selectedMemberRole(args: { openWorkspace?: OpenWorkspaceSession | null; user?: AnyRow | null }) {
  const membership = args.openWorkspace?.membership || readStoredActiveMembership();

  return text(args.openWorkspace?.role || membership?.role || args.user?.role, "platform_team").replaceAll("_", " ");
}

function areaFromSectionTitle(title: string): Exclude<AreaFilter, "all"> {
  const value = String(title || "").toLowerCase().trim();
  if (value.includes("today")) return "today";
  if (value.includes("customer")) return "customer";
  if (value.includes("quality") || value.includes("build")) return "quality";
  if (value.includes("knowledge")) return "knowledge";
  if (value.includes("management") || value.includes("team")) return "management";
  return "other";
}

function areaLabel(area: string) {
  const labels: Record<string, string> = {
    all: "All areas",
    today: "Today",
    customer: "Customer Operations",
    quality: "Build Quality",
    knowledge: "Team Knowledge",
    management: "Team Management",
    other: "Other",
  };
  return labels[area] || area;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ptd-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ptd-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
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
    <section className="ptd-empty">
      <div>🏠</div>
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
    myWork: {
      value: summary.myWork,
      note: `${summary.openWork} open work item(s), ${summary.completedWork} completed.`,
      tone: summary.openWork ? "orange" : summary.myWork ? "green" : "gray",
    },
    announcements: {
      value: summary.announcements,
      note: "Internal team updates and platform announcements.",
      tone: summary.announcements ? "blue" : "gray",
    },
    supportDesk: {
      value: summary.supportTickets,
      note: `${summary.openSupportTickets} open support ticket(s).`,
      tone: summary.openSupportTickets ? "orange" : "green",
    },
    clientAccounts: {
      value: summary.accounts,
      note: `${summary.schools} school record(s), ${summary.branches} branch record(s).`,
      tone: summary.accounts ? "blue" : "gray",
    },
    syncHelp: {
      value: summary.openConflicts,
      note: `${summary.devices} sync device(s), ${summary.openConflicts} open conflict(s).`,
      tone: summary.openConflicts ? "red" : "green",
    },
    billingSupport: {
      value: summary.billingItems,
      note: `${summary.invoices} invoice(s), ${summary.payments} payment record(s), ${money(summary.billingTotal, summary.currencyCode)} movement.`,
      tone: summary.billingItems ? "green" : "gray",
    },
    bugReports: {
      value: summary.bugs,
      note: `${summary.openBugs} open bug/error report(s).`,
      tone: summary.openBugs ? "red" : "green",
    },
    qaTesting: {
      value: summary.qaTests,
      note: `${summary.failedQa} failed/blocked QA item(s).`,
      tone: summary.failedQa ? "orange" : summary.qaTests ? "green" : "gray",
    },
    releaseBoard: {
      value: summary.releases,
      note: `${summary.pendingReleases} pending/scheduled release item(s).`,
      tone: summary.pendingReleases ? "blue" : summary.releases ? "green" : "gray",
    },
    knowledgeBase: {
      value: summary.knowledge,
      note: "Team articles, guides and support knowledge records.",
      tone: summary.knowledge ? "purple" : "gray",
    },
    workNotes: {
      value: summary.workNotes,
      note: "Internal working notes and customer-success notes.",
      tone: summary.workNotes ? "blue" : "gray",
    },
    activityLogs: {
      value: summary.logs,
      note: "Team activity and platform audit logs.",
      tone: summary.logs ? "blue" : "gray",
    },
    teamMembers: {
      value: summary.teamMembers,
      note: `${summary.platformTeam} platform team member(s), ${summary.developers} developer(s).`,
      tone: summary.teamMembers ? "green" : "orange",
    },
    teamPermissions: {
      value: summary.permissions,
      note: "Permission rules and team access controls.",
      tone: summary.permissions ? "purple" : "gray",
    },
    settings: {
      value: "Open",
      note: "Local platform-team preferences and workspace settings.",
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
    note: "Module is listed from Platform Team navigation.",
    tone: "gray",
  };
}

export default function PlatformTeamDashboard({ navigate, navSections }: RouteProps) {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading, user } = useAccount() as any;
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
      console.error("Failed to load platform team dashboard:", error);
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
    const memberships = (rows.userMemberships || []).length ? rows.userMemberships || [] : rows.memberships || [];
    const supportTickets = [...(rows.supportTickets || []), ...(rows.supportDesk || [])];
    const bugs = [...(rows.bugReports || []), ...(rows.errorReports || [])];
    const qa = [...(rows.qaTests || []), ...(rows.qaTestRuns || [])];
    const releases = [...(rows.releaseBoard || []), ...(rows.releases || [])];
    const invoices = rows.invoices || [];
    const payments = [...(rows.appPayments || []), ...(rows.payments || [])];
    const work = [...(rows.teamTasks || []), ...(rows.platformWorkItems || [])];
    const notes = rows.workNotes || [];
    const announcements = [...(rows.internalAnnouncements || []), ...(rows.announcements || [])];
    const logs = [...(rows.activityLogs || []), ...(rows.auditLogs || [])];
    const knowledge = [...(rows.knowledgeBase || []), ...(rows.knowledgeBaseArticles || [])];
    const permissions = [...(rows.teamPermissions || []), ...(rows.permissionRules || [])];
    const conflicts = rows.syncConflicts || [];
    const devices = rows.syncDevices || [];

    return {
      memberName: selectedMemberName({ openWorkspace, user }),
      memberRole: selectedMemberRole({ openWorkspace, user }),
      accounts: count(rows.accounts || []),
      schools: count(rows.schools || []),
      branches: count(rows.branches || []),
      myWork: count(work),
      openWork: work.filter((row) => !["done", "closed", "completed"].includes(String(row.status || "open").toLowerCase())).length,
      completedWork: work.filter((row) => ["done", "closed", "completed"].includes(String(row.status || "").toLowerCase())).length,
      announcements: count(announcements),
      supportTickets: count(supportTickets),
      openSupportTickets: supportTickets.filter((row) => !["closed", "resolved", "done"].includes(String(row.status || "open").toLowerCase())).length,
      openConflicts: conflicts.filter((row) => String(row.status || "open").toLowerCase() === "open").length,
      devices: count(devices),
      invoices: count(invoices),
      payments: count(payments),
      billingItems: count([...invoices, ...payments, ...(rows.billingEvents || [])]),
      billingTotal: sumMoney(invoices) + sumMoney(payments),
      bugs: count(bugs),
      openBugs: bugs.filter((row) => !["closed", "resolved", "fixed"].includes(String(row.status || "open").toLowerCase())).length,
      qaTests: count(qa),
      failedQa: qa.filter((row) => ["failed", "blocked", "error"].includes(String(row.status || row.result || "").toLowerCase())).length,
      releases: count(releases),
      pendingReleases: releases.filter((row) => ["pending", "scheduled", "draft", "testing"].includes(String(row.status || "").toLowerCase())).length,
      knowledge: count(knowledge),
      workNotes: count(notes),
      logs: count(logs),
      teamMembers: count(rows.platformTeamMembers || []) || roleCount(memberships, "platform_team") + roleCount(memberships, "developer"),
      platformTeam: roleCount(memberships, "platform_team"),
      developers: roleCount(memberships, "developer"),
      permissions: count(permissions),
      currencyCode: text(payments[0]?.currency || invoices[0]?.currency || payments[0]?.currencyCode, "GHS"),
    };
  }, [openWorkspace, rows, user]);

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
      ...([...(rows.supportTickets || []), ...(rows.supportDesk || [])]).map((row) => ({ ...row, _kind: "Support", _icon: "🎫", _title: text(row.subject || row.title || rowName(row), "Support ticket"), _date: row.updatedAt || row.createdAt })),
      ...([...(rows.bugReports || []), ...(rows.errorReports || [])]).map((row) => ({ ...row, _kind: "Bug", _icon: "🐞", _title: text(row.title || row.message, "Bug report"), _date: row.updatedAt || row.createdAt })),
      ...([...(rows.qaTests || []), ...(rows.qaTestRuns || [])]).map((row) => ({ ...row, _kind: "QA", _icon: "🧪", _title: text(row.title || row.name || row.result, "QA test"), _date: row.updatedAt || row.createdAt })),
      ...([...(rows.releaseBoard || []), ...(rows.releases || [])]).map((row) => ({ ...row, _kind: "Release", _icon: "🚀", _title: text(row.title || row.version || row.name, "Release"), _date: row.releaseDate || row.updatedAt || row.createdAt })),
      ...([...(rows.internalAnnouncements || []), ...(rows.announcements || [])]).map((row) => ({ ...row, _kind: "Update", _icon: "📣", _title: text(row.title, "Team update"), _date: row.sentAt || row.publishAt || row.updatedAt || row.createdAt })),
      ...(rows.workNotes || []).map((row) => ({ ...row, _kind: "Note", _icon: "📝", _title: text(row.title || row.note, "Work note"), _date: row.updatedAt || row.createdAt })),
      ...([...(rows.activityLogs || []), ...(rows.auditLogs || [])]).map((row) => ({ ...row, _kind: "Log", _icon: "📜", _title: text(row.action || row.event, "Activity log"), _date: row.updatedAt || row.createdAt })),
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
    return <State primary={primary} title="Opening platform team dashboard..." text="Loading support, QA, releases, billing help and team work records." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing the platform team workspace." />;
  }

  return (
    <main className="ptd-page" style={{ "--ptd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ptd-search-card" aria-label="Platform team dashboard search and actions">
        <span className={`status-dot-mini ${summary.openSupportTickets || summary.openBugs || summary.openConflicts ? "orange" : "green"}`} title={`${summary.openSupportTickets} support · ${summary.openBugs} bugs · ${summary.openConflicts} sync conflicts`} />

        <label className="ptd-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team modules..." aria-label="Search platform team dashboard" />
        </label>

        <button type="button" className="ptd-add-inline" onClick={load} aria-label="Refresh platform team dashboard" title="Refresh">↻</button>

        <button type="button" className={`ptd-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ptd-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      <section className="ptd-team-strip" aria-label="Current platform team context">
        <strong>{summary.memberName}</strong>
        <span>{summary.memberRole} · Safe platform workspace</span>
        <Chip tone={summary.openSupportTickets || summary.openBugs || summary.openConflicts ? "orange" : "green"}>
          {summary.openSupportTickets || summary.openBugs || summary.openConflicts ? "Needs attention" : "Clear"}
        </Chip>
      </section>

      {(area !== "all" || query.trim()) && (
        <section className="ptd-filter-chips" aria-label="Active filters">
          {area !== "all" && <button type="button" onClick={() => setArea("all")}>Area: {areaLabel(area)} ×</button>}
          {query.trim() && <button type="button" onClick={() => setQuery("")}>Search: {query.trim()} ×</button>}
        </section>
      )}

      {view === "analytics" ? <AnalyticsView summary={summary} modules={modules} recent={recent} /> : null}
      {view === "table" ? <TableView modules={filteredModules} openRoute={openRoute} /> : null}

      {view === "cards" ? (
        <section className="ptd-list">
          {filteredModules.map((item) => (
            <button key={item.key} type="button" className="team-row" onClick={() => openRoute(item.routeKey)}>
              <span className="team-avatar">{item.icon}</span>
              <span className="team-main">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
                <em>{areaLabel(item.area)}</em>
              </span>
              <span className="team-side">
                <Chip tone={item.tone}>{item.value}</Chip>
                <i>›</i>
              </span>
            </button>
          ))}

          {!filteredModules.length ? <Empty title="No matching team modules" text="Clear filters or search to show your platform team modules." /> : null}
        </section>
      ) : null}

      {recent.length ? (
        <section className="ptd-recent">
          <div className="ptd-section-head">
            <h2>Recent Activity</h2>
            <span>{recent.length}</span>
          </div>
          <div className="ptd-recent-list">
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
    <main className="ptd-page" style={{ "--ptd-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ptd-state">
        <div className="ptd-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function FilterSheet({ area, setArea, onClose }: { area: AreaFilter; setArea: (value: AreaFilter) => void; onClose: () => void }) {
  return (
    <div className="ptd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ptd-sheet small">
        <div className="ptd-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose which platform-team area to show.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>

        <div className="ptd-form compact">
          <label>
            <span>Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value as AreaFilter)}>
              <option value="all">All areas</option>
              <option value="today">Today</option>
              <option value="customer">Customer Operations</option>
              <option value="quality">Build Quality</option>
              <option value="knowledge">Team Knowledge</option>
              <option value="management">Team Management</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="ptd-sheet-actions">
          <button type="button" onClick={() => setArea("all")}>Reset</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({ view, setView, summary, onRefresh, onClose }: { view: ViewMode; setView: (value: ViewMode) => void; summary: AnyRow; onRefresh: () => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ptd-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ptd-sheet small">
        <div className="ptd-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views stay here so the team workspace remains compact.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="ptd-menu-list">
          <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}><span>☰</span><b>List view</b><small>Compact team modules</small></button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><span>☷</span><b>Table view</b><small>Dense module list</small></button>
          <button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}><span>◔</span><b>Analytics</b><small>{summary.openSupportTickets} support · {summary.openBugs} bugs · {summary.openConflicts} sync</small></button>
          <button type="button" onClick={onRefresh}><span>↻</span><b>Refresh</b><small>Reload local platform-team data</small></button>
        </div>
      </section>
    </div>
  );
}

function TableView({ modules, openRoute }: { modules: DashboardModule[]; openRoute: (routeKey: string) => void }) {
  return (
    <section className="ptd-table-card">
      <div className="ptd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Team Modules ({modules.length})</th>
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
                <td><div className="ptd-table-actions"><button type="button" onClick={() => openRoute(item.routeKey)}>Open</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!modules.length ? <div className="ptd-empty-table">No platform-team module matches your filters.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ summary, modules, recent }: { summary: AnyRow; modules: DashboardModule[]; recent: AnyRow[] }) {
  const areaRows = ["today", "customer", "quality", "knowledge", "management", "other"]
    .map((area) => ({
      label: areaLabel(area),
      value: modules.filter((module) => module.area === area).length,
    }))
    .filter((row) => row.value > 0);

  return (
    <section className="ptd-analysis-grid">
      <article className="ptd-analysis"><span>Support</span><strong>{summary.openSupportTickets}</strong><p>{summary.supportTickets} total support ticket record(s).</p></article>
      <article className="ptd-analysis"><span>Sync Help</span><strong>{summary.openConflicts}</strong><p>{summary.devices} sync device record(s).</p></article>
      <article className="ptd-analysis"><span>Build Quality</span><strong>{summary.openBugs}</strong><p>{summary.bugs} bug/error record(s), {summary.failedQa} failed QA item(s).</p></article>
      <article className="ptd-analysis"><span>Billing Help</span><strong>{money(summary.billingTotal, summary.currencyCode)}</strong><p>{summary.invoices} invoice(s), {summary.payments} payment record(s).</p></article>
      <article className="ptd-analysis wide"><span>Module Areas</span><strong>{modules.length}</strong><div className="ptd-analysis-list">{areaRows.map((row) => <section key={row.label}><div><b>{row.label}</b><small>{row.value}</small></div><div className="ptd-progress"><i style={{ width: `${Math.max(6, Math.round((row.value / Math.max(1, modules.length)) * 100))}%` }} /></div></section>)}</div></article>
      <article className="ptd-analysis wide"><span>Recent Activity</span><strong>{recent.length}</strong><p>Recent support, bugs, QA, releases, updates, notes and logs.</p></article>
    </section>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}.ptd-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ptd-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ptd-page *,.ptd-page *::before,.ptd-page *::after{box-sizing:border-box;min-width:0}.ptd-page button,.ptd-page input,.ptd-page select{font:inherit;max-width:100%}.ptd-page button{-webkit-tap-highlight-color:transparent}.ptd-page input,.ptd-page select{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ptd-page input:focus,.ptd-page select:focus{border-color:color-mix(in srgb,var(--ptd-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ptd-primary) 12%,transparent)}.ptd-state,.ptd-search-card,.team-row,.ptd-table-card,.ptd-analysis,.ptd-empty,.ptd-sheet,.ptd-recent,.recent-row,.ptd-team-strip{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ptd-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ptd-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ptd-primary) 18%,transparent);border-top-color:var(--ptd-primary);animation:spin .8s linear infinite}.ptd-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ptd-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ptd-search-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ptd-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ptd-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ptd-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ptd-icon-button,.ptd-filter-button,.ptd-add-inline{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ptd-add-inline{border-color:var(--ptd-primary);background:var(--ptd-primary);color:#fff;box-shadow:0 12px 28px color-mix(in srgb,var(--ptd-primary) 22%,transparent)}.ptd-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ptd-filter-button{position:relative;background:color-mix(in srgb,var(--ptd-primary) 8%,var(--card-bg,#fff));color:var(--ptd-primary)}.ptd-filter-button.active{background:var(--ptd-primary);color:#fff;border-color:var(--ptd-primary)}.ptd-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.status-dot-mini{width:10px;height:10px;border-radius:999px;display:inline-flex;box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 10%,transparent)}.status-dot-mini.green{background:#22c55e}.status-dot-mini.orange{background:#f59e0b}.status-dot-mini.gray{background:var(--muted,#64748b)}.ptd-team-strip{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px;padding:9px 10px;border-radius:20px}.ptd-team-strip strong,.ptd-team-strip span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ptd-team-strip strong{font-size:13px;font-weight:1000}.ptd-team-strip span{color:var(--muted,#64748b);font-size:12px;font-weight:850}.ptd-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ptd-filter-chips::-webkit-scrollbar{display:none}.ptd-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ptd-primary) 11%,transparent);color:var(--ptd-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ptd-list{display:grid;gap:7px;margin-top:10px}.team-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;cursor:pointer;color:inherit}.team-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--ptd-primary) 12%,var(--surface,#fff));font-size:22px}.team-main,.team-main strong,.team-main small,.team-main em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.team-main strong{color:var(--text,#111827);font-size:14px;font-weight:1000;letter-spacing:-.02em}.team-main small{margin-top:3px;color:var(--muted,#64748b);font-size:12px;font-weight:850}.team-main em{margin-top:3px;color:color-mix(in srgb,var(--muted,#64748b) 86%,var(--text,#111827));font-size:11px;font-weight:750;font-style:normal}.team-side{display:flex;align-items:center;gap:7px}.team-side i{color:var(--muted,#64748b);font-style:normal;font-weight:1000}.ptd-chip{max-width:100%;display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize}.ptd-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ptd-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ptd-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ptd-chip.gray{background:color-mix(in srgb,var(--muted,#64748b) 14%,transparent);color:var(--muted,#64748b)}.ptd-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ptd-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ptd-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.50);backdrop-filter:blur(12px)}.ptd-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow-y:auto;padding:14px;border-radius:28px 28px 22px 22px;box-shadow:0 30px 90px rgba(15,23,42,.32);animation:sheetIn .18s var(--ease)}.ptd-sheet.small{width:min(520px,100%)}@keyframes sheetIn{from{transform:translateY(16px);opacity:.7}to{transform:translateY(0);opacity:1}}.ptd-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px}.ptd-sheet-head h2{margin:0;color:var(--text,#111827);font-size:21px;font-weight:1000;letter-spacing:-.05em}.ptd-sheet-head p{margin:5px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5;font-weight:750}.ptd-sheet-head button{width:38px;height:38px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;background:var(--surface,#fff);color:var(--text,#111827);font-weight:1000;cursor:pointer;flex:0 0 auto}.ptd-form{display:grid;gap:10px}.ptd-form label{display:grid;gap:6px}.ptd-form span{color:var(--muted,#64748b);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ptd-menu-list{display:grid;gap:8px}.ptd-menu-list button{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);column-gap:10px;align-items:center;min-height:58px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);text-align:left;cursor:pointer}.ptd-menu-list button span{grid-row:span 2;width:42px;height:42px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ptd-primary) 10%,transparent);color:var(--ptd-primary);font-weight:1000}.ptd-menu-list button b,.ptd-menu-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ptd-menu-list button b{font-size:13px;font-weight:1000}.ptd-menu-list button small{margin-top:2px;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ptd-menu-list button.active{border-color:color-mix(in srgb,var(--ptd-primary) 34%,var(--border,rgba(0,0,0,.10)));background:color-mix(in srgb,var(--ptd-primary) 8%,var(--surface,#fff))}.ptd-sheet-actions{position:sticky;bottom:-14px;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px;padding:12px 0 2px;background:linear-gradient(to top,var(--card-bg,var(--surface,#fff)) 70%,transparent)}.ptd-sheet-actions button{min-height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;padding:0 16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-size:12px;font-weight:950;cursor:pointer}.ptd-sheet-actions button.primary{border-color:var(--ptd-primary);background:var(--ptd-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ptd-primary) 25%,transparent)}.ptd-table-card,.ptd-analysis,.ptd-empty{padding:13px;border-radius:24px}.ptd-table-card{margin-top:10px}.ptd-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:18px;border:1px solid var(--border,rgba(0,0,0,.08))}.ptd-table-scroll table{width:100%;min-width:920px;border-collapse:collapse;background:var(--card-bg,var(--surface,var(--bg,transparent)))}.ptd-table-scroll th,.ptd-table-scroll td{padding:10px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px}.ptd-table-scroll th{background:var(--table-header-bg,color-mix(in srgb,var(--ptd-primary) 6%,var(--card-bg,var(--surface,var(--bg,transparent)))));color:var(--table-header-text,var(--muted,var(--text)));font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.ptd-table-scroll td strong,.ptd-table-scroll td span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ptd-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.ptd-table-actions{display:flex;gap:7px;overflow-x:auto}.ptd-table-actions button{flex:0 0 auto;min-height:34px;border:1px solid var(--ptd-primary);border-radius:999px;padding:0 12px;background:var(--ptd-primary);color:#fff;font-size:11px;font-weight:950;cursor:pointer}.ptd-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ptd-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}.ptd-analysis span,.ptd-section-head span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ptd-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ptd-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ptd-analysis-list{display:grid;gap:10px;margin-top:12px}.ptd-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ptd-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ptd-analysis-list b,.ptd-analysis-list small{font-size:12px}.ptd-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ptd-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ptd-progress i{display:block;height:100%;border-radius:inherit;background:var(--ptd-primary)}.ptd-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ptd-empty div{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ptd-primary) 12%,var(--surface,#fff));font-size:28px}.ptd-empty h3{margin:0;font-size:18px;font-weight:1000}.ptd-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ptd-recent{margin-top:10px;border-radius:24px;padding:12px}.ptd-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.ptd-section-head h2{margin:0;color:var(--text,#111827);font-size:15px;font-weight:1000;letter-spacing:-.03em}.ptd-recent-list{display:grid;gap:7px}.recent-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:9px;align-items:center;border-radius:18px;padding:9px}.recent-row span{grid-row:span 2;width:34px;height:34px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--ptd-primary) 10%,transparent)}.recent-row b,.recent-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-row b{font-size:12px;font-weight:1000}.recent-row small{font-size:11px;color:var(--muted,#64748b);font-weight:800}@media (min-width:680px){.ptd-page{padding:calc(12px * var(--local-density-scale,1));padding-bottom:44px}.ptd-search-card{grid-template-columns:auto minmax(0,1fr) 48px 48px 48px}.ptd-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.team-row{border-radius:24px;padding:12px}.ptd-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ptd-analysis.wide{grid-column:span 2}.ptd-sheet-backdrop{place-items:center;padding:18px}.ptd-sheet{border-radius:28px;padding:18px}.ptd-recent-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1040px){.ptd-page{padding:calc(16px * var(--local-density-scale,1));padding-bottom:48px}.ptd-search-card,.ptd-team-strip,.ptd-list,.ptd-analysis-grid,.ptd-table-card,.ptd-filter-chips,.ptd-recent{max-width:1180px;margin-left:auto;margin-right:auto}.ptd-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ptd-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ptd-analysis.wide{grid-column:span 2}.ptd-recent-list{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.ptd-page{padding:calc(7px * var(--local-density-scale,1));padding-bottom:max(38px,env(safe-area-inset-bottom))}.ptd-icon-button,.ptd-filter-button,.ptd-add-inline{width:40px;height:40px}.team-row{grid-template-columns:auto minmax(0,1fr);align-items:start}.team-side{grid-column:1/-1;justify-content:flex-end}.ptd-team-strip{display:grid;grid-template-columns:minmax(0,1fr) auto}.ptd-team-strip span{grid-row:2}.ptd-sheet{border-radius:24px 24px 18px 18px;padding:12px}.ptd-sheet-actions{display:grid;grid-template-columns:minmax(0,1fr)}.ptd-sheet-actions button{width:100%}}
`;
