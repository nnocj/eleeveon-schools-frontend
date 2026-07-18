"use client";

/**
 * app/owner/modules/SyncBackup.tsx
 * Eleeveon Owner Sync & Backup V3.
 * Account-scoped, offline-first, mobile-first, Dexie/local-backup powered.
 *
 * Rebuilt to the Owner Schools golden standard:
 * - no large hero/header block
 * - compact search strip with inline sync action, slider filter and More sheet
 * - cards, table, devices, conflicts and analytics views are switched from More
 * - active filters are shown as small removable chips only when needed
 * - local records are scanned from known school + platform cache tables
 * - no bulky sync-health card and no separate count strip; counts live only in table/list headers, rows, filters and More sheet
 * - backup export supports school-only, platform-cache-only and full account-scoped backups
 * - conflict rows can be marked reviewed locally when the syncConflicts table supports put/update
 * - all UI uses ba-* theme variables for dark mode, local density and owner branding support
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { apiRequest } from "../lib/platformApi";
import { db } from "../lib/db/db";

type ViewMode = "cards" | "table" | "devices" | "conflicts" | "analytics";
type SyncFilter = "all" | "pending" | "synced" | "deleted" | "conflicts" | "empty";
type BackupScope = "school" | "platform" | "full";
type ToastTone = "success" | "error" | "info";
type Tone = "green" | "red" | "orange" | "blue" | "gray" | "purple";

type SyncTableSummary = {
  tableName: string;
  category: "school" | "platform";
  total: number;
  pending: number;
  synced: number;
  deleted: number;
  conflicts: number;
  latestUpdatedAt?: number;
};

type SyncDevice = {
  id?: string | number;
  accountId?: string;
  deviceId?: string;
  userId?: string | null;
  deviceName?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | number | null;
  active?: boolean;
};

type SyncConflict = {
  id?: string | number;
  accountId?: string;
  tableName?: string;
  localId?: number | string | null;
  cloudId?: string | null;
  deviceId?: string | null;
  status?: string;
  resolution?: string | null;
  createdAt?: string | number;
  updatedAt?: string | number;
};

const SCHOOL_TABLES = [
  "schools",
  "branches",
  "academicStructures",
  "academicPeriods",
  "organizations",
  "students",
  "teachers",
  "parents",
  "studentParents",
  "classes",
  "subjects",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "classSubjects",
  "subjectPrerequisites",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "classTeachers",
  "studentEnrollments",
  "assessmentApplicabilities",
  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "assessmentComponents",
  "assessmentEntries",
  "computedResults",
  "attendance",
  "teacherAttendance",
  "reportCards",
  "reportCardItems",
  "studentReportSnapshots",
  "studentPromotions",
  "feeStructures",
  "payments",
  "income",
  "expenses",
  "currencies",
  "schoolCurrencySettings",
  "paymentIntents",
  "paymentTransactions",
  "paymentProviderEvents",
  "paymentRefunds",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "announcements",
  "announcementRecipients",
  "messageThreads",
  "messages",
  "communicationLogs",
  "notificationTemplates",
  "schoolBranchSettings",
  "calendarEvents",
  "calendarEventParticipants",
  "calendarEventReminders",
  "calendarEventResponses",
  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "scheduleConflicts",
];

const PLATFORM_CACHE_TABLES = [
  "users",
  "appUsers",
  "accountUsers",
  "userMemberships",
  "memberships",
  "permissionRules",
  "accounts",
  "accountSubscriptions",
  "subscriptionPlans",
  "invoices",
  "appPayments",
  "billingEvents",
  "syncDevices",
  "syncConflicts",
  "apiClients",
  "apiKeys",
  "webhooks",
  "webhookLogs",
  "integrationMappings",
  "auditLogs",
  "backgroundJobs",
  "storageUsage",
  "accountFeatureFlags",
  "accountSystemSettings",
  "notificationDeliveryLogs",
];

const cleanText = (value: any) => String(value || "").trim();
const safeLower = (value: any) => cleanText(value).toLowerCase();
const uniqueTables = (items: string[]) => Array.from(new Set(items)).filter(Boolean);
const getTable = (name: string): any => (db as any)[name] || null;

async function tableToArray<T = any>(name: string): Promise<T[]> {
  const table = getTable(name);
  return table?.toArray ? table.toArray() : [];
}

function sameAccount(row: any, accountId?: string | null) {
  if (!row || row.isDeleted === true) return false;
  return !row.accountId || row.accountId === accountId;
}

function statusOf(row: any) {
  const direct = row?.syncStatus ?? row?.synced ?? row?.status ?? "";
  return String(direct).toLowerCase();
}

function isPending(row: any) {
  const status = statusOf(row);
  return ["pending", "local", "dirty", "queued", "unsynced"].includes(status) || row?.synced === false;
}

function isSynced(row: any) {
  const status = statusOf(row);
  return ["synced", "success", "clean", "done"].includes(status) || row?.synced === true;
}

function valueTime(value: any) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}



function deviceRawSignature(device: SyncDevice) {
  return cleanText(device.deviceName || (device as any).userAgent || (device as any).ua || device.deviceId || device.id);
}

function parseUserAgent(raw: string) {
  const ua = raw || "";
  const lower = ua.toLowerCase();

  const browserMatch = ua.match(/(Chrome|CriOS|Edg|Firefox|FxiOS|Safari|OPR)\/?\s*(\d+)?/i);
  const browserName = browserMatch?.[1]
    ? browserMatch[1].replace("CriOS", "Chrome").replace("FxiOS", "Firefox").replace("Edg", "Edge").replace("OPR", "Opera")
    : "Browser";
  const browserVersion = browserMatch?.[2] || "";

  let os = "Unknown";
  let icon = "📱";
  let label = "Device";

  if (lower.includes("windows nt")) {
    os = "Windows";
    icon = "💻";
    label = "Windows PC";
  } else if (lower.includes("android")) {
    const model = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\)|;)/i)?.[1]?.trim();
    os = "Android";
    icon = "📱";
    label = model ? `Android · ${model}` : "Android Phone";
  } else if (lower.includes("iphone")) {
    os = "iOS";
    icon = "📱";
    label = "iPhone";
  } else if (lower.includes("ipad")) {
    os = "iPadOS";
    icon = "📱";
    label = "iPad";
  } else if (lower.includes("mac os") || lower.includes("macintosh")) {
    os = "macOS";
    icon = "💻";
    label = "Mac";
  } else if (lower.includes("linux")) {
    os = "Linux";
    icon = "💻";
    label = "Linux Device";
  }

  return {
    icon,
    os,
    label,
    browser: `${browserName}${browserVersion ? ` ${browserVersion}` : ""}`,
    browserKey: `${browserName.toLowerCase()}:${browserVersion || "x"}`,
  };
}

function friendlyDevice(device: SyncDevice) {
  const raw = deviceRawSignature(device);
  const parsed = parseUserAgent(raw);
  const manualName = cleanText(device.deviceName);
  const looksLikeUserAgent = /^mozilla\//i.test(manualName) || manualName.length > 80;

  const name = manualName && !looksLikeUserAgent ? manualName : parsed.label;
  const platform = cleanText(device.platform);
  const version = cleanText(device.appVersion);
  const userCount = Number((device as any).__userCount || (device.userId ? 1 : 0));

  return {
    ...parsed,
    name,
    subtitle: `${parsed.browser}${platform ? ` · ${platform}` : ""}${version ? ` · App ${version}` : ""}${userCount > 1 ? ` · ${userCount} users` : ""}`,
    userLabel: userCount > 1 ? `${userCount} linked users` : device.userId ? `User ${device.userId}` : "No linked user",
  };
}

function normalizedDeviceKey(device: SyncDevice) {
  const raw = deviceRawSignature(device).toLowerCase().replace(/\s+/g, " ").trim();
  const parsed = parseUserAgent(raw);
  const platform = cleanText(device.platform).toLowerCase();

  // Browser/device rows in syncDevices can be heartbeat history. Do not group by row id.
  // Group by real device fingerprint so repeated Windows/Android browser rows become one card.
  if (raw.includes("mozilla/") || raw.includes("chrome") || raw.includes("android") || raw.includes("windows nt")) {
    return `ua:${parsed.os.toLowerCase()}:${parsed.browserKey}:${platform || "platform"}:${parsed.label.toLowerCase()}`;
  }

  const stableDeviceId = cleanText(device.deviceId);
  if (stableDeviceId) return `device:${stableDeviceId.toLowerCase()}`;

  const name = cleanText(device.deviceName).toLowerCase();
  return `fallback:${name || "unknown"}:${platform || "unknown"}`;
}

function mergeDeviceRows(existing: SyncDevice, incoming: SyncDevice) {
  const users = new Set<string>();
  [existing.userId, incoming.userId, ...(((existing as any).__users || []) as string[]), ...(((incoming as any).__users || []) as string[])].forEach((user) => {
    const clean = cleanText(user);
    if (clean) users.add(clean);
  });

  const incomingSeen = valueTime(incoming.lastSeenAt || (incoming as any).updatedAt || (incoming as any).createdAt);
  const existingSeen = valueTime(existing.lastSeenAt || (existing as any).updatedAt || (existing as any).createdAt);
  const newest = incomingSeen >= existingSeen ? incoming : existing;

  return {
    ...existing,
    ...newest,
    active: existing.active !== false || incoming.active !== false,
    __users: Array.from(users),
    __userCount: users.size,
  } as SyncDevice;
}

function dedupeDevices(rows: SyncDevice[]) {
  const map = new Map<string, SyncDevice>();

  rows.forEach((device) => {
    const key = normalizedDeviceKey(device);
    const existing = map.get(key);
    map.set(key, existing ? mergeDeviceRows(existing, device) : { ...device, __users: device.userId ? [device.userId] : [], __userCount: device.userId ? 1 : 0 } as SyncDevice);
  });

  return Array.from(map.values()).sort((a, b) => {
    const bSeen = valueTime(b.lastSeenAt || (b as any).updatedAt || (b as any).createdAt);
    const aSeen = valueTime(a.lastSeenAt || (a as any).updatedAt || (a as any).createdAt);
    const aName = friendlyDevice(a).name;
    const bName = friendlyDevice(b).name;
    return bSeen - aSeen || aName.localeCompare(bName);
  });
}

function latestTime(rows: any[]) {
  return rows.reduce((latest, row) => Math.max(latest, valueTime(row.updatedAt || row.createdAt)), 0);
}

function safeDateTime(value?: number | string | null) {
  const time = valueTime(value);
  if (!time) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
}

function toneForSync(pending: number, conflicts: number): Tone {
  if (conflicts > 0) return "red";
  if (pending > 0) return "orange";
  return "green";
}

function formatNumber(value: number) {
  try {
    return new Intl.NumberFormat("en-GH").format(value);
  } catch {
    return String(value);
  }
}

function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

export default function SyncBackupGoldenCompactPage() {
  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filter, setFilter] = useState<SyncFilter>("all");
  const [backupScope, setBackupScope] = useState<BackupScope>("school");
  const [search, setSearch] = useState("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<SyncTableSummary | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [tableSummaries, setTableSummaries] = useState<SyncTableSummary[]>([]);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  useEffect(() => {
    if (accountLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
  }, [accountLoading, authenticated, accountId, router]);

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 4200);
  };

  async function load() {
    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const allConflicts = (await tableToArray<SyncConflict>("syncConflicts")).filter((row) => !row.accountId || row.accountId === accountId);
      const conflictCount = new Map<string, number>();
      allConflicts.forEach((conflict) => {
        const tableName = cleanText(conflict.tableName);
        if (!tableName) return;
        const open = !conflict.status || safeLower(conflict.status) === "open" || safeLower(conflict.status) === "pending";
        if (open) conflictCount.set(tableName, (conflictCount.get(tableName) || 0) + 1);
      });

      const summaries: SyncTableSummary[] = [];
      const scan = async (tableName: string, category: "school" | "platform") => {
        const table = getTable(tableName);
        if (!table?.toArray) return;
        const rows = (await table.toArray()).filter((row: any) => sameAccount(row, accountId));
        summaries.push({
          tableName,
          category,
          total: rows.length,
          pending: rows.filter(isPending).length,
          synced: rows.filter(isSynced).length,
          deleted: rows.filter((row: any) => row.isDeleted === true).length,
          conflicts: conflictCount.get(tableName) || 0,
          latestUpdatedAt: latestTime(rows),
        });
      };

      for (const tableName of uniqueTables(SCHOOL_TABLES)) await scan(tableName, "school");
      for (const tableName of uniqueTables(PLATFORM_CACHE_TABLES)) await scan(tableName, "platform");

      setTableSummaries(summaries.sort((a, b) => b.pending - a.pending || b.conflicts - a.conflicts || b.total - a.total || a.tableName.localeCompare(b.tableName)));
      setDevices(dedupeDevices((await tableToArray<SyncDevice>("syncDevices")).filter((row) => !row.accountId || row.accountId === accountId)));
      setConflicts(allConflicts.sort((a, b) => valueTime(b.updatedAt || b.createdAt) - valueTime(a.updatedAt || a.createdAt)));
    } catch (error: any) {
      showToast("error", error?.message || "Unable to read local sync and backup data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accountLoading || settingsLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading, settingsLoading]);

  const summary = useMemo(() => {
    const totalRecords = tableSummaries.reduce((sum, row) => sum + row.total, 0);
    const pending = tableSummaries.reduce((sum, row) => sum + row.pending, 0);
    const synced = tableSummaries.reduce((sum, row) => sum + row.synced, 0);
    const deleted = tableSummaries.reduce((sum, row) => sum + row.deleted, 0);
    const latest = tableSummaries.reduce((value, row) => Math.max(value, row.latestUpdatedAt || 0), 0);
    const openConflicts = conflicts.filter((row) => !row.status || ["open", "pending"].includes(safeLower(row.status))).length;

    return {
      tables: tableSummaries.length,
      schoolTables: tableSummaries.filter((row) => row.category === "school").length,
      platformTables: tableSummaries.filter((row) => row.category === "platform").length,
      totalRecords,
      pending,
      synced,
      deleted,
      devices: devices.length,
      openConflicts,
      latest,
      healthTone: toneForSync(pending, openConflicts),
      healthLabel: openConflicts ? "Conflicts" : pending ? "Pending" : "Healthy",
    };
  }, [conflicts, devices.length, tableSummaries]);

  const activeFilterCount = useMemo(() => (filter === "all" ? 0 : 1), [filter]);

  const filteredTables = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tableSummaries.filter((row) => {
      if (filter === "pending" && row.pending <= 0) return false;
      if (filter === "synced" && row.synced <= 0) return false;
      if (filter === "deleted" && row.deleted <= 0) return false;
      if (filter === "conflicts" && row.conflicts <= 0) return false;
      if (filter === "empty" && row.total > 0) return false;
      if (!query) return true;
      return `${row.tableName} ${row.category}`.toLowerCase().includes(query);
    });
  }, [filter, search, tableSummaries]);

  const filteredConflicts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conflicts.filter((row) => {
      if (!query) return true;
      return `${row.tableName || ""} ${row.status || ""} ${row.deviceId || ""} ${row.cloudId || ""} ${row.localId || ""}`.toLowerCase().includes(query);
    });
  }, [conflicts, search]);

  const analyticsRows = useMemo(
    () => [
      { label: "School tables", value: summary.schoolTables },
      { label: "Platform cache", value: summary.platformTables },
      { label: "Pending records", value: summary.pending },
      { label: "Synced records", value: summary.synced },
      { label: "Deleted records", value: summary.deleted },
      { label: "Open conflicts", value: summary.openConflicts },
    ],
    [summary]
  );

  async function triggerSync() {
    if (!authenticated || !accountId) {
      showToast("error", "Sign in before running sync.");
      return;
    }

    try {
      setSyncing(true);
      showToast("info", "Sync request started.");

      try {
        await apiRequest<any>("/sync/push", { method: "POST", body: JSON.stringify({ accountId }) } as any);
        showToast("success", "Sync request completed. Local health refreshed.");
      } catch (error: any) {
        showToast("error", error?.message || "Live sync endpoint was unavailable. Local records remain safe.");
      }

      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function exportBackup(scope: BackupScope = backupScope) {
    if (!accountId) {
      showToast("error", "Sign in before exporting a backup.");
      return;
    }

    try {
      setBackingUp(true);
      const tableNames = scope === "school" ? SCHOOL_TABLES : scope === "platform" ? PLATFORM_CACHE_TABLES : [...SCHOOL_TABLES, ...PLATFORM_CACHE_TABLES];
      const backup: Record<string, any[]> = {};

      for (const tableName of uniqueTables(tableNames)) {
        const table = getTable(tableName);
        if (!table?.toArray) continue;
        backup[tableName] = (await table.toArray()).filter((row: any) => sameAccount(row, accountId));
      }

      downloadJson(`eleeveon-${scope}-backup-${Date.now()}.json`, {
        accountId,
        scope,
        exportedAt: new Date().toISOString(),
        source: "Eleeveon Schools PWA local IndexedDB",
        tableCount: Object.keys(backup).length,
        recordCount: Object.values(backup).reduce((sum, rows) => sum + rows.length, 0),
        tables: backup,
      });

      showToast("success", `${scope === "full" ? "Full" : scope === "platform" ? "Platform" : "School"} backup exported.`);
    } catch (error: any) {
      showToast("error", error?.message || "Backup export failed.");
    } finally {
      setBackingUp(false);
    }
  }

  async function markConflictReviewed(conflict: SyncConflict) {
    const table = getTable("syncConflicts");
    const id = conflict.id;
    if (!table || id === undefined || id === null) {
      showToast("error", "This conflict cannot be updated locally because it has no saved id.");
      return;
    }

    try {
      const patch = { status: "reviewed", resolution: conflict.resolution || "Reviewed locally", updatedAt: new Date().toISOString() };
      if (table.update) await table.update(id, patch);
      else if (table.put) await table.put({ ...conflict, ...patch });
      setSelectedConflict(null);
      showToast("success", "Conflict marked reviewed locally.");
      await load();
    } catch (error: any) {
      showToast("error", error?.message || "Unable to update conflict locally.");
    }
  }

  if (accountLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Sync & Backup..." text="Reading local database health, sync queues, devices and conflicts." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before viewing sync and backup tools." />;
  }

  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ba-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ba-search-card" aria-label="Sync and backup actions">
        <label className="ba-search">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sync tables..." aria-label="Search sync tables" />
        </label>

        <button type="button" className="ba-add-inline" onClick={triggerSync} disabled={syncing} aria-label="Run sync" title="Run sync">
          {syncing ? "…" : "↻"}
        </button>

        <button type="button" className={`ba-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options" title="More options">⋯</button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          <button type="button" onClick={() => setFilter("all")}>Filter: {filterTitle(filter)} ×</button>
        </section>
      )}


      {viewMode === "cards" && (
        <section className="ba-list">
          {filteredTables.map((row) => <SyncTableCard key={row.tableName} row={row} onOpen={() => setSelectedTable(row)} />)}
          {!filteredTables.length && <Empty icon="☁️" title="No sync tables found" text="Try clearing filters or refreshing the local sync scan." />}
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredTables} conflicts={conflicts} onOpen={setSelectedTable} />}
      {viewMode === "devices" && <DeviceView devices={devices} />}
      {viewMode === "conflicts" && <ConflictView rows={filteredConflicts} onOpen={setSelectedConflict} />}
      {viewMode === "analytics" && <AnalyticsView rows={analyticsRows} total={Math.max(summary.totalRecords, 1)} />}

      {filterOpen && <FilterSheet filter={filter} setFilter={setFilter} onClose={() => setFilterOpen(false)} />}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          backupScope={backupScope}
          setBackupScope={setBackupScope}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onRunSync={async () => {
            setMoreOpen(false);
            await triggerSync();
          }}
          onExport={async (scope) => {
            setMoreOpen(false);
            await exportBackup(scope);
          }}
          syncing={syncing}
          backingUp={backingUp}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selectedTable && <TableActionSheet row={selectedTable} conflicts={conflicts.filter((c) => c.tableName === selectedTable.tableName)} onClose={() => setSelectedTable(null)} />}

      {selectedConflict && <ConflictActionSheet conflict={selectedConflict} onReviewed={markConflictReviewed} onClose={() => setSelectedConflict(null)} />}
    </main>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function filterTitle(filter: SyncFilter) {
  if (filter === "pending") return "Pending only";
  if (filter === "synced") return "Synced only";
  if (filter === "deleted") return "Deleted only";
  if (filter === "conflicts") return "Conflicts only";
  if (filter === "empty") return "Empty tables";
  return "All tables";
}

function SyncTableCard({ row, onOpen }: { row: SyncTableSummary; onOpen: () => void }) {
  const tone = toneForSync(row.pending, row.conflicts);
  return (
    <button type="button" className="student-row" onClick={onOpen}>
      <span className={`ba-sync-avatar ${tone}`}>{row.category === "school" ? "🏫" : "⚙️"}</span>
      <span className="student-main">
        <strong>{row.tableName}</strong>
        <small>{row.category} · {formatNumber(row.total)} record(s) · {safeDateTime(row.latestUpdatedAt)}</small>
        <em>{row.pending} pending · {row.synced} synced · {row.conflicts} conflict(s)</em>
      </span>
      <span className="student-side">
        <span className={`status-dot-mini ${tone}`} title={tone} aria-label={tone} />
        <i>⋯</i>
      </span>
    </button>
  );
}

function TableView({ rows, conflicts, onOpen }: { rows: SyncTableSummary[]; conflicts: SyncConflict[]; onOpen: (row: SyncTableSummary) => void }) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tables ({rows.length})</th>
              <th>Category</th>
              <th>Total</th>
              <th>Pending</th>
              <th>Synced</th>
              <th>Deleted</th>
              <th>Conflicts</th>
              <th>Latest</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const conflictCount = conflicts.filter((c) => c.tableName === row.tableName).length;
              return (
                <tr key={row.tableName}>
                  <td><strong>{row.tableName}</strong><span>{row.category} table</span></td>
                  <td><Chip tone={row.category === "school" ? "blue" : "purple"}>{row.category}</Chip></td>
                  <td>{row.total}</td>
                  <td><Chip tone={row.pending ? "orange" : "gray"}>{row.pending}</Chip></td>
                  <td><Chip tone={row.synced ? "green" : "gray"}>{row.synced}</Chip></td>
                  <td><Chip tone={row.deleted ? "red" : "gray"}>{row.deleted}</Chip></td>
                  <td><Chip tone={conflictCount ? "red" : "gray"}>{conflictCount}</Chip></td>
                  <td>{safeDateTime(row.latestUpdatedAt)}</td>
                  <td><div className="ba-table-actions"><button type="button" onClick={() => onOpen(row)}>Open</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ba-empty-table">No table matches your filters.</div>}
      </div>
    </section>
  );
}

function DeviceView({ devices }: { devices: SyncDevice[] }) {
  return (
    <section className="ba-list">
      {devices.map((device, index) => {
        const info = friendlyDevice(device);
        const lastSeen = safeDateTime(device.lastSeenAt || (device as any).updatedAt || (device as any).createdAt);

        return (
          <article key={String(normalizedDeviceKey(device) || index)} className="ba-device-card compact">
            <div className="ba-device-head">
              <span className="ba-sync-avatar blue">{info.icon}</span>
              <div>
                <h3>{info.name}</h3>
                <p>{info.subtitle}</p>
                <em>{info.userLabel} · Last seen {lastSeen}</em>
              </div>
              <Chip tone={device.active === false ? "red" : "green"}>{device.active === false ? "Inactive" : "Active"}</Chip>
            </div>
          </article>
        );
      })}
      {!devices.length && <Empty icon="📱" title="No devices found" text="No sync devices have been cached locally yet." />}
    </section>
  );
}

function ConflictView({ rows, onOpen }: { rows: SyncConflict[]; onOpen: (row: SyncConflict) => void }) {
  return (
    <section className="ba-list">
      {rows.map((conflict, index) => {
        const open = !conflict.status || ["open", "pending"].includes(safeLower(conflict.status));
        return (
          <button type="button" key={String(conflict.id || `${conflict.tableName}-${conflict.localId}-${index}`)} className="student-row" onClick={() => onOpen(conflict)}>
            <span className={`ba-sync-avatar ${open ? "red" : "green"}`}>!</span>
            <span className="student-main">
              <strong>{conflict.tableName || "Unknown table"}</strong>
              <small>Local #{conflict.localId || "—"} · Cloud {conflict.cloudId || "not linked"}</small>
              <em>{conflict.deviceId || "No device"} · {safeDateTime(conflict.createdAt)}</em>
            </span>
            <span className="student-side">
              <span className={`status-dot-mini ${open ? "red" : "green"}`} />
              <i>⋯</i>
            </span>
          </button>
        );
      })}
      {!rows.length && <Empty icon="✅" title="No conflicts found" text="No sync conflicts match your search." />}
    </section>
  );
}

function AnalyticsView({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  return (
    <section className="ba-analysis-grid">
      {rows.map((row) => {
        const percent = total ? Math.min(100, Math.round((row.value / total) * 100)) : 0;
        return (
          <article key={row.label} className="ba-analysis">
            <span>{row.label}</span>
            <strong>{formatNumber(row.value)}</strong>
            <div className="ba-progress"><i style={{ width: `${percent}%` }} /></div>
          </article>
        );
      })}
    </section>
  );
}

function FilterSheet({ filter, setFilter, onClose }: { filter: SyncFilter; setFilter: (value: SyncFilter) => void; onClose: () => void }) {
  const options: { value: SyncFilter; label: string; note: string }[] = [
    { value: "all", label: "All tables", note: "Show every readable local table" },
    { value: "pending", label: "Pending only", note: "Tables with local changes waiting for sync" },
    { value: "synced", label: "Synced only", note: "Tables with synced records" },
    { value: "deleted", label: "Deleted only", note: "Tables containing soft-deleted rows" },
    { value: "conflicts", label: "Conflicts only", note: "Tables needing conflict review" },
    { value: "empty", label: "Empty tables", note: "Readable tables without account records" },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div><h2>Filters</h2><p>Keep the sync register focused.</p></div>
          <button type="button" onClick={onClose} aria-label="Close filters">✕</button>
        </div>
        <div className="ba-menu-list">
          {options.map((option) => (
            <button key={option.value} type="button" className={filter === option.value ? "active" : ""} onClick={() => setFilter(option.value)}>
              <span>{filter === option.value ? "✓" : "⌁"}</span>
              <b>{option.label}</b>
              <small>{option.note}</small>
            </button>
          ))}
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={() => setFilter("all")}>Clear</button>
          <button type="button" className="primary" onClick={onClose}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  backupScope,
  setBackupScope,
  onRefresh,
  onRunSync,
  onExport,
  syncing,
  backingUp,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  backupScope: BackupScope;
  setBackupScope: (scope: BackupScope) => void;
  onRefresh: () => void | Promise<void>;
  onRunSync: () => void | Promise<void>;
  onExport: (scope: BackupScope) => void | Promise<void>;
  syncing: boolean;
  backingUp: boolean;
  onClose: () => void;
}) {
  const viewOptions: { value: ViewMode; label: string; note: string; icon: string }[] = [
    { value: "cards", label: "Cards", note: "Compact table health register", icon: "▦" },
    { value: "table", label: "Table view", note: "Dense laptop-friendly records", icon: "☷" },
    { value: "devices", label: "Devices", note: "Cached sync devices", icon: "📱" },
    { value: "conflicts", label: "Conflicts", note: "Rows needing review", icon: "!" },
    { value: "analytics", label: "Analytics", note: "Health distribution", icon: "◔" },
  ];

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div><h2>More</h2><p>Switch views, run sync, refresh or export a safe local backup.</p></div>
          <button type="button" onClick={onClose} aria-label="Close more options">✕</button>
        </div>
        <div className="ba-menu-list">
          {viewOptions.map((option) => (
            <button key={option.value} type="button" className={viewMode === option.value ? "active" : ""} onClick={() => setViewMode(option.value)}>
              <span>{option.icon}</span>
              <b>{option.label}</b>
              <small>{option.note}</small>
            </button>
          ))}
          <button type="button" onClick={onRunSync} disabled={syncing}>
            <span>↻</span><b>{syncing ? "Syncing" : "Run sync"}</b><small>Ask backend to process local pending records</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>⟳</span><b>Refresh scan</b><small>Reload local tables, devices and conflicts</small>
          </button>
        </div>

        <section className="ba-backup-picker">
          <span>Backup scope</span>
          <div>
            {(["school", "platform", "full"] as BackupScope[]).map((scope) => (
              <button key={scope} type="button" className={backupScope === scope ? "active" : ""} onClick={() => setBackupScope(scope)}>{scope}</button>
            ))}
          </div>
          <button type="button" className="ba-export-button" disabled={backingUp} onClick={() => onExport(backupScope)}>
            {backingUp ? "Preparing..." : "Export backup"}
          </button>
        </section>
      </section>
    </div>
  );
}

function TableActionSheet({ row, conflicts, onClose }: { row: SyncTableSummary; conflicts: SyncConflict[]; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div><h2>{row.tableName}</h2><p>{row.category} table · latest {safeDateTime(row.latestUpdatedAt)}</p></div>
          <button type="button" onClick={onClose} aria-label="Close table details">✕</button>
        </div>
        <div className="student-detail-strip">
          <span><b>Total</b>{row.total}</span>
          <span><b>Pending</b>{row.pending}</span>
          <span><b>Synced</b>{row.synced}</span>
          <span><b>Deleted</b>{row.deleted}</span>
          <span><b>Conflicts</b>{conflicts.length}</span>
          <span><b>Status</b>{toneForSync(row.pending, conflicts.length)}</span>
        </div>
        <p className="ba-sheet-note">This screen summarizes IndexedDB records only. Use backup export before clearing local data or changing devices.</p>
      </section>
    </div>
  );
}

function ConflictActionSheet({ conflict, onReviewed, onClose }: { conflict: SyncConflict; onReviewed: (conflict: SyncConflict) => void | Promise<void>; onClose: () => void }) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile">
          <div><h2>{conflict.tableName || "Unknown table"}</h2><p>Local #{conflict.localId || "—"} · Cloud {conflict.cloudId || "not linked"}</p></div>
          <button type="button" onClick={onClose} aria-label="Close conflict actions">✕</button>
        </div>
        <div className="student-detail-strip">
          <span><b>Status</b>{conflict.status || "open"}</span>
          <span><b>Device</b>{conflict.deviceId || "Not set"}</span>
          <span><b>Created</b>{safeDateTime(conflict.createdAt)}</span>
        </div>
        <div className="ba-menu-list">
          <button type="button" onClick={() => onReviewed(conflict)}>
            <span>✓</span><b>Mark reviewed locally</b><small>This does not resolve server truth; it only updates the local cache.</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page { --ease: cubic-bezier(.2,.8,.2,1); min-height: 100dvh; width: 100%; max-width: 100%; min-width: 0; padding: calc(8px * var(--local-density-scale, 1)); padding-bottom: max(40px, env(safe-area-inset-bottom)); background: radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem), var(--bg, #f7f8fb); color: var(--text, #111827); font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size: var(--font-size, 14px); overflow-x: hidden; }
.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }
.ba-page input, .ba-page select { width: 100%; min-height: 44px; border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10))); border-radius: 16px; padding: 0 12px; background: var(--input-bg, var(--surface, #fff)); color: var(--input-text, var(--text, #111827)); outline: none; font-weight: 750; }
.ba-page input:focus, .ba-page select:focus { border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent); }
.ba-state, .ba-search-card, .ba-table-card, .ba-analysis, .ba-empty, .ba-sheet, .student-row, .ba-device-card { background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 12px 28px rgba(15,23,42,.045); }
.ba-state { min-height: min(420px, calc(100dvh - 32px)); width: min(520px, 100%); margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 10px; padding: 22px; border-radius: 28px; text-align: center; }
.ba-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent); border-top-color: var(--ba-primary); animation: spin .8s linear infinite; }
.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.ba-toast { position: sticky; top: 8px; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 12px 14px; border-radius: 18px; font-size: 13px; font-weight: 850; box-shadow: 0 18px 40px rgba(15,23,42,.12); }
.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; } .ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; } .ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }
.ba-toast button { border: 0; background: transparent; color: currentColor; font-weight: 1000; cursor: pointer; }
.ba-icon-button, .ba-filter-button, .ba-add-inline { width: 42px; height: 42px; border: 1px solid var(--border, rgba(0,0,0,.10)); border-radius: 999px; display: grid; place-items: center; background: var(--card-bg, var(--surface,#fff)); color: var(--text,#111827); font-size: 18px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 22px rgba(15,23,42,.045); }
.ba-add-inline { flex: 0 0 42px; border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; font-size: 20px; line-height: 1; box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent); }
.ba-add-inline:disabled { opacity: .72; cursor: not-allowed; }
.ba-search-card { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; margin-top: 2px; padding: 8px; border-radius: 24px; }
.ba-search { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 44px; padding: 0 11px; border-radius: 18px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }
.ba-slider-icon { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.ba-filter-button { position: relative; background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff)); color: var(--ba-primary); }
.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }
.ba-filter-button b { position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; border: 2px solid var(--card-bg,#fff); }
.ba-filter-chips { display: flex; gap: 7px; overflow-x: auto; padding: 8px 1px 0; scrollbar-width: none; }
.ba-filter-chips button { flex: 0 0 auto; min-height: 31px; border: 0; border-radius: 999px; padding: 0 10px; background: color-mix(in srgb, var(--ba-primary) 11%, transparent); color: var(--ba-primary); font-size: 11px; font-weight: 950; white-space: nowrap; cursor: pointer; }
.ba-list { display: grid; gap: 7px; margin-top: 10px; }
.student-row { width: 100%; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 10px; border-radius: 22px; text-align: left; cursor: pointer; transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease); }
.student-row:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10))); box-shadow: 0 16px 34px rgba(15,23,42,.07); }
.ba-sync-avatar { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; color: #fff; font-size: 17px; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); background: var(--ba-primary); }
.ba-sync-avatar.green { background: #22c55e; } .ba-sync-avatar.red { background: #ef4444; } .ba-sync-avatar.orange { background: #f59e0b; } .ba-sync-avatar.blue { background: #3b82f6; } .ba-sync-avatar.gray { background: var(--muted,#64748b); } .ba-sync-avatar.purple { background: #8b5cf6; }
.student-main, .student-main strong, .student-main small, .student-main em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.student-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.student-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.student-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.student-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.student-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }
.ba-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; } .ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; } .ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; } .ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); } .ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; } .ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.status-dot-mini { width: 10px; height: 10px; display: inline-block; border-radius: 999px; background: var(--muted,#64748b); box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent); }
.status-dot-mini.green { background: #22c55e; } .status-dot-mini.red { background: #ef4444; } .status-dot-mini.blue { background: #3b82f6; } .status-dot-mini.orange { background: #f59e0b; } .status-dot-mini.gray { background: var(--muted,#64748b); }
.ba-sheet-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 10px; background: rgba(15,23,42,.50); backdrop-filter: blur(12px); }
.ba-sheet { width: min(760px, 100%); max-height: min(88dvh, 760px); overflow-y: auto; padding: 14px; border-radius: 28px 28px 22px 22px; background: var(--card-bg, var(--surface, #fff)); border: 1px solid var(--border, rgba(0,0,0,.10)); box-shadow: 0 30px 90px rgba(15,23,42,.32); animation: sheetIn .18s var(--ease); }
.ba-sheet.small { width: min(520px, 100%); }
@keyframes sheetIn { from { transform: translateY(16px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }
.ba-sheet-head, .ba-sheet-profile { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.ba-sheet-head h2, .ba-sheet-profile h2 { margin: 0; color: var(--text,#111827); font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p, .ba-sheet-profile p, .ba-sheet-note { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; font-weight: 750; }
.ba-sheet-head button, .ba-sheet-profile button { width: 38px; height: 38px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-weight: 1000; cursor: pointer; flex: 0 0 auto; }
.ba-sheet-actions { position: sticky; bottom: -14px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding: 12px 0 2px; background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent); }
.ba-sheet-actions button, .ba-export-button { min-height: 42px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; padding: 0 16px; background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff)); color: var(--text,#111827); font-size: 12px; font-weight: 950; cursor: pointer; }
.ba-sheet-actions button.primary, .ba-export-button { border-color: var(--ba-primary); background: var(--ba-primary); color: #fff; box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent); }
.ba-menu-list { display: grid; gap: 8px; }
.ba-menu-list button { width: 100%; display: grid; grid-template-columns: 42px minmax(0,1fr); column-gap: 10px; align-items: center; min-height: 58px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 18px; padding: 9px; background: var(--surface,#fff); color: var(--text,#111827); text-align: left; cursor: pointer; }
.ba-menu-list button:disabled { opacity: .6; cursor: not-allowed; }
.ba-menu-list button span { grid-row: span 2; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--ba-primary) 10%, transparent); color: var(--ba-primary); font-weight: 1000; }
.ba-menu-list button b, .ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; } .ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }
.ba-menu-list button.active { border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10))); background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff)); }
.ba-backup-picker { display: grid; gap: 8px; margin-top: 12px; padding: 12px; border-radius: 20px; background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent); }
.ba-backup-picker > span { color: var(--muted,#64748b); font-size: 10px; font-weight: 1000; text-transform: uppercase; letter-spacing: .08em; }
.ba-backup-picker div { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
.ba-backup-picker div button { min-height: 36px; border: 1px solid var(--border,rgba(0,0,0,.10)); border-radius: 999px; background: var(--surface,#fff); color: var(--text,#111827); font-size: 11px; font-weight: 950; text-transform: capitalize; cursor: pointer; }
.ba-backup-picker div button.active { background: var(--ba-primary); border-color: var(--ba-primary); color: #fff; }
.student-detail-strip { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; margin-bottom: 10px; }
.student-detail-strip span { display: block; padding: 9px; border-radius: 16px; background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent); color: var(--muted,#64748b); font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.student-detail-strip b { display: block; margin-bottom: 3px; color: var(--text,#111827); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.ba-table-card, .ba-empty, .ba-analysis, .ba-device-card { padding: 13px; border-radius: 24px; }
.ba-table-card { margin-top: 10px; }
.ba-table-scroll { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 18px; border: 1px solid var(--border,rgba(0,0,0,.08)); }
.ba-table-scroll table { width: 100%; min-width: 980px; border-collapse: collapse; background: var(--card-bg, var(--surface, var(--bg, transparent))); }
.ba-table-scroll th, .ba-table-scroll td { padding: 10px; border-bottom: 1px solid var(--border,rgba(0,0,0,.08)); vertical-align: top; text-align: left; font-size: 13px; }
.ba-table-scroll th { background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent))))); color: var(--table-header-text, var(--muted, var(--text))); font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .07em; }
.ba-table-scroll td strong, .ba-table-scroll td span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ba-table-scroll td span { margin-top: 3px; color: var(--muted,#64748b); font-size: 11px; }
.ba-table-actions { display: flex; flex-wrap: nowrap; gap: 7px; width: 100%; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.ba-table-actions button { flex: 0 0 auto; min-height: 34px; border: 1px solid var(--ba-primary); border-radius: 999px; padding: 0 10px; background: var(--ba-primary); color: #fff; font-size: 11px; font-weight: 950; cursor: pointer; white-space: nowrap; }
.ba-empty-table { padding: 22px; text-align: center; color: var(--muted,#64748b); font-weight: 850; }
.ba-device-head { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: start; gap: 10px; margin-bottom: 10px; }
.ba-device-head h3 { margin: 0; font-size: 15px; font-weight: 1000; letter-spacing: -.03em; }
.ba-device-head p { margin: 3px 0 0; color: var(--muted,#64748b); font-size: 12px; font-weight: 750; }
.ba-analysis-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; margin-top: 10px; }
.ba-analysis span { color: var(--muted,#64748b); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
.ba-analysis strong { display: block; margin-top: 8px; font-size: clamp(22px,7vw,30px); line-height: 1; font-weight: 1000; letter-spacing: -.06em; }
.ba-progress { height: 8px; margin-top: 12px; border-radius: 999px; background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent); overflow: hidden; } .ba-progress i { display: block; height: 100%; border-radius: inherit; background: var(--ba-primary); }
.ba-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 220px; text-align: center; border-style: dashed; }
.ba-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff)); font-size: 28px; }
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; } .ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }
@media (min-width: 680px) { .ba-page { padding: calc(12px * var(--local-density-scale,1)); padding-bottom: 44px; } .ba-search-card { grid-template-columns: minmax(0,1fr) 48px 48px 48px; } .ba-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .student-row { border-radius: 24px; padding: 12px; } .ba-analysis-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .ba-sheet-backdrop { place-items: center; padding: 18px; } .ba-sheet { border-radius: 28px; padding: 18px; } }
@media (min-width: 1040px) { .ba-page { padding: calc(16px * var(--local-density-scale,1)); padding-bottom: 48px; } .ba-search-card, .ba-list, .ba-analysis-grid, .ba-table-card, .ba-filter-chips { max-width: 1180px; margin-left: auto; margin-right: auto; } .ba-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ba-analysis-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 520px) { .ba-page { padding: calc(7px * var(--local-density-scale,1)); padding-bottom: max(38px, env(safe-area-inset-bottom)); } .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; } .student-detail-strip { grid-template-columns: minmax(0,1fr); } .ba-sheet { border-radius: 24px 24px 18px 18px; padding: 12px; } .ba-sheet-actions { display: grid; grid-template-columns: minmax(0,1fr); } .ba-sheet-actions button { width: 100%; } .ba-device-head { grid-template-columns: auto minmax(0,1fr); } .ba-device-head .ba-chip { grid-column: 1 / -1; width: fit-content; } }
`;
