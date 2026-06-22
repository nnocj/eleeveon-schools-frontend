"use client";

/**
 * app/developer/modules/DeveloperErrorReports.tsx
 * ---------------------------------------------------------
 * DEVELOPER ERROR REPORTS
 * ---------------------------------------------------------
 * Real platform diagnostics module for frontend, backend,
 * sync, database, billing and PWA failures.
 *
 * Purpose:
 * - Load real error reports from backend when available.
 * - Fall back to localStorage so the module still works before endpoints exist.
 * - Filter by severity, status, source, date and search text.
 * - Resolve, reopen, assign and remove local reports.
 * - Show card, table and analytics/chart views.
 *
 * Expected API endpoints, when available:
 * GET    /developer/error-reports
 * PATCH  /developer/error-reports/:id
 *
 * Alternative endpoint fallback:
 * GET    /error-reports
 * PATCH  /error-reports/:id
 *
 * Safe response shapes supported:
 * []
 * { data: [] }
 * { errors: [] }
 * { reports: [] }
 * { errorReports: [] }
 *
 * Requires:
 * npm install recharts
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type ErrorSource = "frontend" | "backend" | "sync" | "database" | "billing" | "pwa" | "unknown";
type ErrorSeverity = "info" | "low" | "medium" | "high" | "critical";
type ErrorStatus = "open" | "investigating" | "resolved" | "ignored";

type ErrorReport = {
  id: string;
  title: string;
  message: string;
  stack?: string | null;
  source: ErrorSource;
  severity: ErrorSeverity;
  status: ErrorStatus;
  route?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  userEmail?: string | null;
  browser?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  environment?: string | null;
  occurrences: number;
  assignedTo?: string | null;
  resolutionNote?: string | null;
  firstSeenAt?: string | number | null;
  lastSeenAt?: string | number | null;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type ActionForm = {
  assignedTo: string;
  resolutionNote: string;
};

type ChartRow = {
  label: string;
  value: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const STORAGE_KEY = "eleeveon_developer_error_reports";

const SOURCES: ErrorSource[] = [
  "frontend",
  "backend",
  "sync",
  "database",
  "billing",
  "pwa",
  "unknown",
];

const SEVERITIES: ErrorSeverity[] = ["critical", "high", "medium", "low", "info"];

const STATUSES: ErrorStatus[] = ["open", "investigating", "resolved", "ignored"];

const chartColors = [
  "var(--dev-primary)",
  "#0f172a",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#64748b",
];

// ======================================================
// HELPERS
// ======================================================

const toArray = <T,>(value: any, keys: string[] = []): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key] as T[];
  }

  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (Array.isArray(value.results)) return value.results as T[];
  if (Array.isArray(value.records)) return value.records as T[];
  if (Array.isArray(value.rows)) return value.rows as T[];

  return [];
};

const safeTime = (value?: string | number | null) => {
  if (!value) return 0;
  const time = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const dateText = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Not set";

  return new Intl.DateTimeFormat("en-GH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(time));
};

const timeText = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Not set";

  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
};

const compact = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const severityTone = (severity?: string): Tone => {
  const key = String(severity || "").toLowerCase();
  if (key === "critical" || key === "high") return "red";
  if (key === "medium") return "orange";
  if (key === "low") return "blue";
  if (key === "info") return "gray";
  return "gray";
};

const statusTone = (status?: string): Tone => {
  const key = String(status || "").toLowerCase();
  if (key === "resolved") return "green";
  if (key === "investigating") return "blue";
  if (key === "ignored") return "gray";
  if (key === "open") return "orange";
  return "gray";
};

const sourceIcon = (source?: string) => {
  switch (source) {
    case "frontend":
      return "🖥️";
    case "backend":
      return "🧠";
    case "sync":
      return "🔄";
    case "database":
      return "🗄️";
    case "billing":
      return "💳";
    case "pwa":
      return "📱";
    default:
      return "⚠️";
  }
};

const countBy = <T,>(rows: T[], getKey: (row: T) => string | null | undefined) => {
  const map = new Map<string, number>();

  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown").trim() || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

const monthLabels = (count = 6) => {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);

    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      year: "2-digit",
    }).format(date);
  });
};

const monthKey = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Unknown";

  return new Intl.DateTimeFormat("en-GH", {
    month: "short",
    year: "2-digit",
  }).format(new Date(time));
};

const normalizeReport = (raw: any, index: number): ErrorReport => {
  const title =
    raw.title ||
    raw.name ||
    raw.errorName ||
    raw.exception ||
    raw.message?.split("\n")?.[0] ||
    `Error Report ${index + 1}`;

  const source = (raw.source || raw.area || raw.module || "unknown") as ErrorSource;
  const severity = (raw.severity || raw.level || raw.priority || "medium") as ErrorSeverity;
  const status = (raw.status || (raw.resolved ? "resolved" : "open")) as ErrorStatus;

  return {
    id: String(raw.id || raw.localId || raw.fingerprint || `error-${index}-${Date.now()}`),
    title,
    message: raw.message || raw.errorMessage || raw.description || "No error message recorded.",
    stack: raw.stack || raw.stackTrace || null,
    source: SOURCES.includes(source) ? source : "unknown",
    severity: SEVERITIES.includes(severity) ? severity : "medium",
    status: STATUSES.includes(status) ? status : "open",
    route: raw.route || raw.path || raw.url || null,
    accountId: raw.accountId || null,
    accountName: raw.accountName || raw.schoolName || null,
    userEmail: raw.userEmail || raw.email || null,
    browser: raw.browser || raw.userAgent || null,
    deviceId: raw.deviceId || null,
    appVersion: raw.appVersion || raw.version || null,
    environment: raw.environment || raw.env || "production",
    occurrences: Number(raw.occurrences || raw.count || 1),
    assignedTo: raw.assignedTo || null,
    resolutionNote: raw.resolutionNote || raw.note || null,
    firstSeenAt: raw.firstSeenAt || raw.createdAt || Date.now(),
    lastSeenAt: raw.lastSeenAt || raw.updatedAt || raw.createdAt || Date.now(),
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || raw.lastSeenAt || Date.now(),
  };
};

const loadLocalReports = (): ErrorReport[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return toArray<any>(JSON.parse(raw), ["errors", "reports", "errorReports"]).map(normalizeReport);
  } catch {
    return [];
  }
};

const saveLocalReports = (reports: ErrorReport[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // ignore localStorage failure
  }
};

const makeClientReport = (): ErrorReport | null => {
  if (typeof window === "undefined") return null;

  return {
    id: `client-diagnostic-${Date.now()}`,
    title: "Client Diagnostic Snapshot",
    message: "Manual browser-side diagnostic snapshot captured from the developer portal.",
    source: "frontend",
    severity: navigator.onLine ? "info" : "medium",
    status: "open",
    route: window.location.pathname,
    accountId: null,
    accountName: null,
    userEmail: null,
    browser: navigator.userAgent,
    deviceId: null,
    appVersion: null,
    environment: process.env.NODE_ENV || "development",
    occurrences: 1,
    assignedTo: null,
    resolutionNote: null,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperErrorReports({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [reports, setReports] = useState<ErrorReport[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>({
    assignedTo: "",
    resolutionNote: "",
  });

  // ======================================================
  // LOAD
  // ======================================================

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");

      const response = await apiClient<any>("/developer/error-reports").catch(async () =>
        apiClient<any>("/error-reports").catch(() => null)
      );

      const apiReports = toArray<any>(response, ["errors", "reports", "errorReports"]).map(
        normalizeReport
      );

      if (apiReports.length) {
        setReports(apiReports);
        saveLocalReports(apiReports);
      } else {
        setReports(loadLocalReports());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load server error reports. Showing local saved reports.");
      setReports(loadLocalReports());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (accountLoading) return;

    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  // ======================================================
  // DERIVED
  // ======================================================

  const environments = useMemo(
    () => Array.from(new Set(reports.map((report) => report.environment || "unknown"))).sort(),
    [reports]
  );

  const filteredReports = useMemo(() => {
    const term = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : 0;

    return reports
      .filter((report) => {
        const haystack = `${report.title} ${report.message} ${report.stack || ""} ${
          report.route || ""
        } ${report.accountName || ""} ${report.userEmail || ""} ${
          report.assignedTo || ""
        }`.toLowerCase();

        const time = safeTime(report.lastSeenAt || report.updatedAt || report.createdAt);

        const searchOk = !term || haystack.includes(term);
        const statusOk = statusFilter === "all" || report.status === statusFilter;
        const severityOk = severityFilter === "all" || report.severity === severityFilter;
        const sourceOk = sourceFilter === "all" || report.source === sourceFilter;
        const environmentOk =
          environmentFilter === "all" || report.environment === environmentFilter;
        const fromOk = !from || time >= from;
        const toOk = !to || time <= to;

        return searchOk && statusOk && severityOk && sourceOk && environmentOk && fromOk && toOk;
      })
      .sort((a, b) => {
        const severityRank: Record<ErrorSeverity, number> = {
          critical: 5,
          high: 4,
          medium: 3,
          low: 2,
          info: 1,
        };

        const openRank = (report: ErrorReport) => (report.status === "open" ? 2 : report.status === "investigating" ? 1 : 0);
        const byOpen = openRank(b) - openRank(a);
        if (byOpen) return byOpen;

        const bySeverity = severityRank[b.severity] - severityRank[a.severity];
        if (bySeverity) return bySeverity;

        return safeTime(b.lastSeenAt || b.updatedAt) - safeTime(a.lastSeenAt || a.updatedAt);
      });
  }, [
    reports,
    query,
    statusFilter,
    severityFilter,
    sourceFilter,
    environmentFilter,
    dateFrom,
    dateTo,
  ]);

  const openCount = reports.filter((report) => report.status === "open").length;
  const investigatingCount = reports.filter((report) => report.status === "investigating").length;
  const resolvedCount = reports.filter((report) => report.status === "resolved").length;
  const criticalCount = reports.filter((report) => report.severity === "critical").length;
  const highRiskCount = reports.filter((report) => ["critical", "high"].includes(report.severity)).length;
  const totalOccurrences = reports.reduce((sum, report) => sum + Number(report.occurrences || 0), 0);

  const statusChart = useMemo<ChartRow[]>(
    () => countBy(reports, (report) => report.status),
    [reports]
  );

  const severityChart = useMemo<ChartRow[]>(
    () => countBy(reports, (report) => report.severity),
    [reports]
  );

  const sourceChart = useMemo<ChartRow[]>(
    () => countBy(reports, (report) => report.source),
    [reports]
  );

  const occurrenceChart = useMemo<ChartRow[]>(() => {
    return reports
      .map((report) => ({
        label: report.title.length > 22 ? `${report.title.slice(0, 22)}…` : report.title,
        value: Number(report.occurrences || 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [reports]);

  const trendChart = useMemo<ChartRow[]>(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));

    reports.forEach((report) => {
      const key = monthKey(report.firstSeenAt || report.createdAt);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });

    return labels.map((label) => ({
      label,
      value: map.get(label) || 0,
    }));
  }, [reports]);

  // ======================================================
  // MUTATIONS
  // ======================================================

  const persistPatch = async (report: ErrorReport, patch: Partial<ErrorReport>) => {
    const payload = {
      ...patch,
      updatedAt: Date.now(),
    };

    await apiClient<any>(`/developer/error-reports/${report.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }).catch(async () =>
      apiClient<any>(`/error-reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }).catch(() => null)
    );

    setReports((current) => {
      const next = current.map((item) =>
        item.id === report.id ? { ...item, ...payload } : item
      );
      saveLocalReports(next);
      return next;
    });
  };

  const setReportStatus = async (report: ErrorReport, status: ErrorStatus) => {
    try {
      setError("");
      setNotice("");

      await persistPatch(report, {
        status,
        resolutionNote:
          status === "resolved"
            ? report.resolutionNote || "Marked as resolved from developer portal."
            : report.resolutionNote,
      });

      setNotice(`Error report ${status}.`);
    } catch (err: any) {
      setError(err?.message || "Could not update error report.");
    }
  };

  const openActionModal = (report: ErrorReport) => {
    setSelectedReport(report);
    setActionForm({
      assignedTo: report.assignedTo || "",
      resolutionNote: report.resolutionNote || "",
    });
  };

  const saveAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedReport) return;

    try {
      setError("");
      setNotice("");

      await persistPatch(selectedReport, {
        assignedTo: actionForm.assignedTo.trim(),
        resolutionNote: actionForm.resolutionNote.trim(),
        status: actionForm.resolutionNote.trim() ? "resolved" : selectedReport.status,
      });

      setSelectedReport(null);
      setNotice("Error report action saved.");
    } catch (err: any) {
      setError(err?.message || "Could not save report action.");
    }
  };

  const captureClientDiagnostic = () => {
    const report = makeClientReport();
    if (!report) return;

    setReports((current) => {
      const next = [report, ...current];
      saveLocalReports(next);
      return next;
    });

    setNotice("Client diagnostic snapshot captured.");
  };

  const removeLocalReport = (report: ErrorReport) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Remove "${report.title}" from local error reports?`);

    if (!confirmed) return;

    setReports((current) => {
      const next = current.filter((item) => item.id !== report.id);
      saveLocalReports(next);
      return next;
    });

    setNotice("Error report removed locally.");
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main className="deverrors-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="deverrors-state">
          <div className="deverrors-spinner" />
          <h2>Loading error reports...</h2>
          <p>Preparing diagnostics, stack traces, sources and incident analytics.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="deverrors-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="deverrors-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to inspect platform error reports.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="deverrors-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="deverrors-hero">
        <div>
          <span className="deverrors-eyebrow">Diagnostics</span>
          <h1>Error Reports</h1>
          <p>
            Monitor frontend, backend, sync, billing and database failures. Prioritize critical
            incidents, assign fixes, resolve reports and understand failure patterns over time.
          </p>
        </div>

        <div className="deverrors-hero-actions">
          <div className="deverrors-switch" role="tablist" aria-label="Error report views">
            <button
              type="button"
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={viewMode === "table" ? "active" : ""}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={viewMode === "analytics" ? "active" : ""}
              onClick={() => setViewMode("analytics")}
            >
              Charts
            </button>
          </div>

          <button type="button" className="deverrors-white-btn" onClick={captureClientDiagnostic}>
            Capture Client Diagnostic
          </button>

          <button
            type="button"
            className="deverrors-glass-btn"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`deverrors-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="deverrors-stat-grid">
        <StatCard label="Reports" value={reports.length} detail={`${filteredReports.length} shown`} icon="🐞" />
        <StatCard label="Open" value={openCount} detail={`${investigatingCount} investigating`} icon="📬" />
        <StatCard label="High Risk" value={highRiskCount} detail={`${criticalCount} critical`} icon="🚨" />
        <StatCard label="Occurrences" value={compact(totalOccurrences)} detail={`${resolvedCount} resolved`} icon="📈" />
      </section>

      <section className="deverrors-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, message, stack, route, account..."
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
          <option value="all">All severity</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">All sources</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        <select
          value={environmentFilter}
          onChange={(event) => setEnvironmentFilter(event.target.value)}
        >
          <option value="all">All environments</option>
          {environments.map((environment) => (
            <option key={environment} value={environment}>
              {environment}
            </option>
          ))}
        </select>

        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
            setSeverityFilter("all");
            setSourceFilter("all");
            setEnvironmentFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        >
          Reset
        </button>
      </section>

      {viewMode === "analytics" ? (
        <AnalyticsView
          statusChart={statusChart}
          severityChart={severityChart}
          sourceChart={sourceChart}
          occurrenceChart={occurrenceChart}
          trendChart={trendChart}
        />
      ) : viewMode === "table" ? (
        <TableView
          reports={filteredReports}
          onOpenAction={openActionModal}
          onStatus={setReportStatus}
          onDelete={removeLocalReport}
        />
      ) : (
        <CardsView
          reports={filteredReports}
          onOpenAction={openActionModal}
          onStatus={setReportStatus}
          onDelete={removeLocalReport}
          navigate={navigate}
        />
      )}

      {selectedReport && (
        <ActionModal
          report={selectedReport}
          form={actionForm}
          setForm={setActionForm}
          onClose={() => setSelectedReport(null)}
          onSubmit={saveAction}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  reports,
  onOpenAction,
  onStatus,
  onDelete,
  navigate,
}: {
  reports: ErrorReport[];
  onOpenAction: (report: ErrorReport) => void;
  onStatus: (report: ErrorReport, status: ErrorStatus) => void;
  onDelete: (report: ErrorReport) => void;
  navigate?: (key: string) => void;
}) {
  return (
    <section className="deverrors-card-grid">
      {reports.map((report) => (
        <article key={report.id} className={`deverrors-report-card ${report.severity}`}>
          <div className="deverrors-report-top">
            <span className="deverrors-report-icon">{sourceIcon(report.source)}</span>

            <div className="deverrors-chip-row">
              <Chip tone={severityTone(report.severity)}>{report.severity}</Chip>
              <Chip tone={statusTone(report.status)}>{report.status}</Chip>
            </div>
          </div>

          <h2>{report.title}</h2>
          <p>{report.message}</p>

          <div className="deverrors-route">{report.route || report.source}</div>

          <div className="deverrors-mini-grid">
            <span>
              <b>Source</b>
              {report.source}
            </span>
            <span>
              <b>Occurrences</b>
              {report.occurrences}
            </span>
            <span>
              <b>Account</b>
              {report.accountName || report.accountId || "—"}
            </span>
            <span>
              <b>User</b>
              {report.userEmail || "—"}
            </span>
            <span>
              <b>Assigned</b>
              {report.assignedTo || "Unassigned"}
            </span>
            <span>
              <b>Last Seen</b>
              {timeText(report.lastSeenAt || report.updatedAt)}
            </span>
          </div>

          {report.stack && (
            <details className="deverrors-stack">
              <summary>Stack trace</summary>
              <pre>{report.stack}</pre>
            </details>
          )}

          <div className="deverrors-actions">
            <button type="button" onClick={() => onOpenAction(report)}>
              Assign / Resolve
            </button>

            {report.status !== "investigating" && report.status !== "resolved" && (
              <button type="button" onClick={() => onStatus(report, "investigating")}>
                Investigate
              </button>
            )}

            {report.status !== "resolved" ? (
              <button type="button" onClick={() => onStatus(report, "resolved")}>
                Resolve
              </button>
            ) : (
              <button type="button" onClick={() => onStatus(report, "open")}>
                Reopen
              </button>
            )}

            <button type="button" onClick={() => navigate?.("auditLogs")}>
              Audit
            </button>

            <button type="button" className="danger" onClick={() => onDelete(report)}>
              Remove
            </button>
          </div>
        </article>
      ))}

      {!reports.length && <Empty text="No error reports match your filters." />}
    </section>
  );
}

function TableView({
  reports,
  onOpenAction,
  onStatus,
  onDelete,
}: {
  reports: ErrorReport[];
  onOpenAction: (report: ErrorReport) => void;
  onStatus: (report: ErrorReport, status: ErrorStatus) => void;
  onDelete: (report: ErrorReport) => void;
}) {
  return (
    <section className="deverrors-table-card">
      <div className="deverrors-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Error</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Source</th>
              <th>Occurrences</th>
              <th>Route</th>
              <th>Account/User</th>
              <th>Assigned</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>{report.title}</strong>
                  <small>{report.message}</small>
                </td>
                <td>
                  <Chip tone={severityTone(report.severity)}>{report.severity}</Chip>
                </td>
                <td>
                  <Chip tone={statusTone(report.status)}>{report.status}</Chip>
                </td>
                <td>{report.source}</td>
                <td>{report.occurrences}</td>
                <td>{report.route || "—"}</td>
                <td>
                  {report.accountName || report.accountId || "—"}
                  <br />
                  <small>{report.userEmail || "—"}</small>
                </td>
                <td>{report.assignedTo || "Unassigned"}</td>
                <td>{timeText(report.lastSeenAt || report.updatedAt)}</td>
                <td>
                  <div className="deverrors-table-actions">
                    <button type="button" onClick={() => onOpenAction(report)}>
                      Action
                    </button>

                    {report.status !== "resolved" ? (
                      <button type="button" onClick={() => onStatus(report, "resolved")}>
                        Resolve
                      </button>
                    ) : (
                      <button type="button" onClick={() => onStatus(report, "open")}>
                        Reopen
                      </button>
                    )}

                    <button type="button" className="danger" onClick={() => onDelete(report)}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!reports.length && <Empty text="No error reports match your filters." />}
    </section>
  );
}

function AnalyticsView({
  statusChart,
  severityChart,
  sourceChart,
  occurrenceChart,
  trendChart,
}: {
  statusChart: ChartRow[];
  severityChart: ChartRow[];
  sourceChart: ChartRow[];
  occurrenceChart: ChartRow[];
  trendChart: ChartRow[];
}) {
  return (
    <section className="deverrors-chart-grid">
      <ChartCard title="Error Trend" description="New reports captured over the last six months.">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendChart}>
            <defs>
              <linearGradient id="errorTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="8%" stopColor="var(--dev-primary)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--dev-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--dev-primary)"
              fill="url(#errorTrend)"
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Severity" description="Risk level distribution.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie
              data={severityChart}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
            >
              {severityChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={severityChart} />
      </ChartCard>

      <ChartCard title="Status" description="Open, investigating, resolved and ignored reports.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie
              data={statusChart}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
            >
              {statusChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={statusChart} />
      </ChartCard>

      <ChartCard title="Sources" description="Where failures are coming from.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sourceChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={100} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top Occurrences" description="Most repeated errors by occurrence count.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={occurrenceChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={130} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ======================================================
// MODAL
// ======================================================

function ActionModal({
  report,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  report: ErrorReport;
  form: ActionForm;
  setForm: React.Dispatch<React.SetStateAction<ActionForm>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="deverrors-modal-backdrop" role="dialog" aria-modal="true">
      <form className="deverrors-modal" onSubmit={onSubmit}>
        <div className="deverrors-modal-head">
          <div>
            <h2>Assign / Resolve Report</h2>
            <p>{report.title}</p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className="deverrors-modal-summary">
          <Chip tone={severityTone(report.severity)}>{report.severity}</Chip>
          <Chip tone={statusTone(report.status)}>{report.status}</Chip>
          <span>{report.source}</span>
          <span>{report.occurrences} occurrence(s)</span>
        </section>

        <div className="deverrors-form-grid">
          <label>
            Assign to
            <input
              value={form.assignedTo}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  assignedTo: event.target.value,
                }))
              }
              placeholder="developer@example.com"
            />
          </label>

          <label className="wide">
            Resolution / investigation note
            <textarea
              value={form.resolutionNote}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  resolutionNote: event.target.value,
                }))
              }
              rows={5}
              placeholder="Describe what was fixed, ignored, or assigned for investigation."
            />
          </label>
        </div>

        {report.stack && (
          <details className="deverrors-stack modal-stack">
            <summary>Stack trace</summary>
            <pre>{report.stack}</pre>
          </details>
        )}

        <div className="deverrors-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button type="submit">Save Action</button>
        </div>
      </form>
    </div>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
}) {
  return (
    <article className="deverrors-stat">
      <span>
        {label}
        <b>{icon}</b>
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={`deverrors-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="deverrors-empty">{text}</div>;
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="deverrors-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="deverrors-legend">
      {rows.map((row, index) => (
        <span key={`${row.label}-${index}`}>
          <i style={{ background: chartColors[index % chartColors.length] }} />
          {row.label}: {row.value}
        </span>
      ))}
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes deverrorsSpin { to { transform: rotate(360deg); } }

.deverrors-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--dev-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.deverrors-page *,
.deverrors-page *::before,
.deverrors-page *::after {
  box-sizing: border-box;
}

.deverrors-page button,
.deverrors-page input,
.deverrors-page select,
.deverrors-page textarea {
  font: inherit;
  max-width: 100%;
}

.deverrors-page button {
  -webkit-tap-highlight-color: transparent;
}

.deverrors-state {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .08);
  text-align: center;
}

.deverrors-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.deverrors-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.deverrors-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--dev-primary) 18%, transparent);
  border-top-color: var(--dev-primary);
  animation: deverrorsSpin .8s linear infinite;
}

.deverrors-hero {
  display: grid;
  gap: 16px;
  border-radius: 30px;
  padding: 18px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--dev-primary), #0f172a 72%);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  overflow: hidden;
}

.deverrors-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.deverrors-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.deverrors-hero p {
  max-width: 820px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.deverrors-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.deverrors-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.deverrors-switch button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 11px;
  background: transparent;
  color: rgba(255, 255, 255, .75);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.deverrors-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.deverrors-white-btn,
.deverrors-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.deverrors-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.deverrors-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.deverrors-glass-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.deverrors-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.deverrors-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.deverrors-alert.success {
  background: #dcfce7;
  color: #166534;
}

.deverrors-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.deverrors-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.deverrors-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.deverrors-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.deverrors-stat small {
  display: block;
  margin-top: 8px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.deverrors-toolbar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .05);
}

.deverrors-toolbar input,
.deverrors-toolbar select {
  min-height: 42px;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .3);
  border-radius: 16px;
  padding: 0 12px;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.deverrors-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--dev-primary) 10%, white);
  color: var(--dev-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.deverrors-card-grid,
.deverrors-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.deverrors-report-card,
.deverrors-chart-card,
.deverrors-table-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.deverrors-report-card.critical,
.deverrors-report-card.high {
  border-color: rgba(220, 38, 38, .24);
  background: linear-gradient(180deg, #fff, #fff7f7);
}

.deverrors-report-card.medium {
  border-color: rgba(249, 115, 22, .2);
}

.deverrors-report-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.deverrors-report-icon {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--dev-primary), #0f172a);
  color: #fff;
  font-size: 18px;
  font-weight: 1000;
}

.deverrors-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.deverrors-report-card h2 {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.deverrors-report-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.45;
}

.deverrors-route {
  display: inline-flex;
  max-width: 100%;
  margin-top: 10px;
  padding: 7px 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.deverrors-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.deverrors-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
}

.deverrors-mini-grid b {
  display: block;
  color: var(--muted, #64748b);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.deverrors-stack {
  margin-top: 12px;
  border-radius: 18px;
  background: #0f172a;
  color: #e5e7eb;
  overflow: hidden;
}

.deverrors-stack summary {
  cursor: pointer;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 1000;
}

.deverrors-stack pre {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 0 12px 12px;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.deverrors-actions,
.deverrors-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.deverrors-actions {
  margin-top: 14px;
}

.deverrors-actions button,
.deverrors-table-actions button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--dev-primary) 10%, white);
  color: var(--dev-primary);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.deverrors-actions button:first-child,
.deverrors-table-actions button:first-child {
  background: var(--dev-primary);
  color: #fff;
}

.deverrors-actions button.danger,
.deverrors-table-actions button.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.deverrors-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 1000;
  white-space: nowrap;
}

.deverrors-chip.green { background: #dcfce7; color: #166534; }
.deverrors-chip.blue { background: #dbeafe; color: #1d4ed8; }
.deverrors-chip.purple { background: #f3e8ff; color: #7e22ce; }
.deverrors-chip.orange { background: #ffedd5; color: #c2410c; }
.deverrors-chip.red { background: #fee2e2; color: #b91c1c; }
.deverrors-chip.gray { background: #f1f5f9; color: #475569; }

.deverrors-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.deverrors-table-wrap table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
}

.deverrors-table-wrap th {
  text-align: left;
  color: var(--muted, #64748b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.deverrors-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.deverrors-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.deverrors-table-wrap small {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.35;
}

.deverrors-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.deverrors-chart-card p {
  margin: 5px 0 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.deverrors-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.deverrors-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 9px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.deverrors-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.deverrors-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 18px;
  border-radius: 20px;
  background: #f8fafc;
  color: var(--muted, #64748b);
  font-size: 13px;
  text-align: center;
  border: 1px dashed rgba(148, 163, 184, .35);
}

.deverrors-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.deverrors-modal {
  width: min(860px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: var(--surface, #fff);
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.deverrors-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.deverrors-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.deverrors-modal-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.deverrors-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.deverrors-modal-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-radius: 18px;
  background: #f8fafc;
  margin-bottom: 12px;
}

.deverrors-modal-summary span:not(.deverrors-chip) {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .18);
  font-size: 11px;
  font-weight: 900;
  color: #475569;
}

.deverrors-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.deverrors-form-grid label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
}

.deverrors-form-grid input,
.deverrors-form-grid textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .32);
  border-radius: 16px;
  background: #fff;
  color: #0f172a;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 800;
}

.deverrors-form-grid input {
  min-height: 42px;
}

.deverrors-form-grid textarea {
  resize: vertical;
}

.deverrors-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--surface, #fff) 70%, transparent);
}

.deverrors-modal-actions button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.deverrors-modal-actions button:first-child {
  background: #f1f5f9;
  color: #0f172a;
}

.deverrors-modal-actions button:last-child {
  background: var(--dev-primary);
  color: #fff;
}

.modal-stack {
  margin-top: 12px;
}

@media (min-width: 520px) {
  .deverrors-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .deverrors-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .deverrors-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .deverrors-card-grid,
  .deverrors-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .deverrors-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .deverrors-form-grid .wide {
    grid-column: 1 / -1;
  }

  .deverrors-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .deverrors-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .deverrors-page {
    padding: 14px;
  }

  .deverrors-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .deverrors-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .deverrors-toolbar {
    grid-template-columns: minmax(240px, 2fr) repeat(6, minmax(120px, 1fr)) auto;
  }

  .deverrors-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .deverrors-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
