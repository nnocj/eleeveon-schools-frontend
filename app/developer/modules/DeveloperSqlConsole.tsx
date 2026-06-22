"use client";

/**
 * app/developer/modules/DeveloperSqlConsole.tsx
 * ---------------------------------------------------------
 * DEVELOPER SQL CONSOLE — REAL DATABASE FRONTEND
 * ---------------------------------------------------------
 * This frontend DOES NOT import or connect to PostgreSQL directly.
 *
 * Correct architecture:
 * Browser/Next.js UI -> NestJS endpoint -> Prisma -> PostgreSQL DATABASE_URL
 *
 * Why:
 * - DATABASE_URL must remain only in the backend .env file.
 * - Browser code cannot safely connect directly to PostgreSQL.
 * - The backend handles validation, audit, safety and query execution.
 *
 * Required backend endpoints:
 * GET  /developer/sql/status
 * GET  /developer/sql/history
 * POST /developer/sql/execute
 * POST /developer/sql/history
 */

import React, { useEffect, useMemo, useState } from "react";
import {
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

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "results" | "history" | "analytics";
type ResultMode = "table" | "cards";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";
type QueryRisk = "safe" | "write" | "destructive" | "schema" | "unknown";

type SqlHistoryItem = {
  id: string;
  sql: string;
  risk: QueryRisk;
  mode: "read_only" | "write_enabled";
  ok: boolean;
  rowCount: number;
  executionMs: number;
  error?: string | null;
  auditId?: string | null;
  createdAt: number;
};

type SqlResult = {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionMs: number;
  auditId?: string | null;
};

type BackendStatus = {
  ok: boolean;
  service?: string;
  database?: string;
  provider?: string;
  readOnlyDefault?: boolean;
  writesEnabled?: boolean;
  serverTime?: string;
  error?: string;
};

type SavedSnippet = {
  id: string;
  title: string;
  sql: string;
  description: string;
};

type ChartRow = {
  label: string;
  value: number;
};

const HISTORY_KEY = "eleeveon_developer_sql_history";
const DANGEROUS_CONFIRM_TEXT = "I UNDERSTAND";

const DEFAULT_SQL = `-- Real PostgreSQL database query
-- Run one statement at a time.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name
LIMIT 50;
`;

const DEFAULT_SNIPPETS: SavedSnippet[] = [
  {
    id: "list-tables",
    title: "List Tables",
    description: "Shows all public database tables.",
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 100;",
  },
  {
    id: "table-columns",
    title: "Table Columns",
    description: "Shows columns, types and nullability for public tables.",
    sql: "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position LIMIT 300;",
  },
  {
    id: "accounts-safe",
    title: "Accounts",
    description: "Reads account records if the table exists.",
    sql: "SELECT * FROM accounts LIMIT 20;",
  },
  {
    id: "users-safe",
    title: "Users",
    description: "Reads user records if the table exists.",
    sql: "SELECT * FROM users LIMIT 20;",
  },
  {
    id: "schools-safe",
    title: "Schools",
    description: "Reads school records if the table exists.",
    sql: "SELECT * FROM schools LIMIT 20;",
  },
  {
    id: "branches-safe",
    title: "Branches",
    description: "Reads branch records if the table exists.",
    sql: "SELECT * FROM branches LIMIT 20;",
  },
  {
    id: "subscriptions-safe",
    title: "Subscriptions",
    description: "Reads subscription records if the table exists.",
    sql: "SELECT * FROM subscriptions LIMIT 20;",
  },
  {
    id: "payments-safe",
    title: "Payments",
    description: "Reads payment records if the table exists.",
    sql: "SELECT * FROM payments LIMIT 20;",
  },
];

const chartColors = [
  "var(--sql-primary)",
  "#0f172a",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#64748b",
];

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

const stripSqlComments = (sql: string) =>
  sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

const firstKeyword = (sql: string) => {
  const clean = stripSqlComments(sql);
  return clean.split(/\s+/)[0]?.toUpperCase() || "";
};

const detectRisk = (sql: string): QueryRisk => {
  const clean = stripSqlComments(sql).toUpperCase();

  if (!clean) return "unknown";
  if (/^\s*(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE)\b/.test(clean)) return "safe";
  if (/\b(DROP|TRUNCATE|ALTER|CREATE|REINDEX|VACUUM)\b/.test(clean)) return "schema";
  if (/\b(DELETE|UPDATE)\b/.test(clean)) return "destructive";
  if (/\b(INSERT|UPSERT|MERGE|REPLACE)\b/.test(clean)) return "write";

  return "unknown";
};

const riskTone = (risk: QueryRisk): Tone => {
  if (risk === "safe") return "green";
  if (risk === "write") return "orange";
  if (risk === "destructive" || risk === "schema") return "red";
  return "gray";
};

const coerceJson = (value: any): any => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed);
      } catch {
        return { message: parsed };
      }
    }
    return parsed;
  } catch {
    return { message: trimmed };
  }
};

const getErrorMessage = (err: any) => {
  const raw =
    err?.response?.data?.message ||
    err?.response?.message ||
    err?.data?.message ||
    err?.message ||
    "SQL request failed.";

  if (Array.isArray(raw)) return raw.join(" ");
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
};

const apiGet = async <T,>(path: string): Promise<T> => {
  return apiClient<T>(path);
};

const apiPost = async <T,>(path: string, payload: Record<string, any>): Promise<T> => {
  // Do not JSON.stringify here. Your apiClient should serialize object bodies.
  return apiClient<T>(path, {
    method: "POST",
    body: payload,
  } as any);
};

const loadLocalHistory = (): SqlHistoryItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return toArray<SqlHistoryItem>(JSON.parse(raw), ["history", "queries"]);
  } catch {
    return [];
  }
};

const saveLocalHistory = (history: SqlHistoryItem[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch {
    // ignore
  }
};

const normalizeResult = (response: any): SqlResult => {
  const clean = coerceJson(response);
  const rows = toArray<Record<string, any>>(clean, ["rows", "data", "records", "results"]);
  const columns = Array.isArray(clean?.columns)
    ? clean.columns.map(String)
    : rows.length
      ? Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))))
      : [];

  return {
    columns,
    rows,
    rowCount: Number(clean?.rowCount ?? clean?.count ?? rows.length),
    executionMs: Number(clean?.executionMs ?? clean?.durationMs ?? 0),
    auditId: clean?.auditId || clean?.auditLogId || null,
  };
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

const downloadJson = (filename: string, data: unknown) => {
  if (typeof window === "undefined") return;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
};

const downloadCsv = (filename: string, rows: Record<string, any>[], columns: string[]) => {
  if (typeof window === "undefined") return;

  const escapeCell = (value: any) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    columns.map(escapeCell).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
};

export default function DeveloperSqlConsole({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "#2563eb";

  const [viewMode, setViewMode] = useState<ViewMode>("results");
  const [resultMode, setResultMode] = useState<ResultMode>("table");

  const [sql, setSql] = useState(DEFAULT_SQL);
  const [readOnly, setReadOnly] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  const [result, setResult] = useState<SqlResult | null>(null);
  const [history, setHistory] = useState<SqlHistoryItem[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);

  const [historySearch, setHistorySearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBackendStatus = async () => {
    try {
      const response = await apiGet<BackendStatus>("/developer/sql/status");
      setBackendStatus(response);
    } catch (err: any) {
      setBackendStatus({
        ok: false,
        error: getErrorMessage(err),
      });
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      await loadBackendStatus();

      const response = await apiGet<any>("/developer/sql/history").catch(() => null);
      const apiHistory = toArray<SqlHistoryItem>(response, ["history", "queries", "items"]);

      if (apiHistory.length) {
        setHistory(apiHistory);
        saveLocalHistory(apiHistory);
      } else {
        setHistory(loadLocalHistory());
      }
    } catch {
      setHistory(loadLocalHistory());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading) return;

    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  const risk = useMemo(() => detectRisk(sql), [sql]);
  const keyword = useMemo(() => firstKeyword(sql), [sql]);

  const needsConfirmation = risk !== "safe";
  const canRun =
    Boolean(stripSqlComments(sql)) &&
    (!readOnly || risk === "safe") &&
    (!needsConfirmation || confirmText.trim() === DANGEROUS_CONFIRM_TEXT);

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();

    return history
      .filter((item) => {
        const searchOk =
          !term || `${item.sql} ${item.error || ""} ${item.auditId || ""}`.toLowerCase().includes(term);
        const riskOk = riskFilter === "all" || item.risk === riskFilter;
        return searchOk && riskOk;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [history, historySearch, riskFilter]);

  const successCount = history.filter((item) => item.ok).length;
  const failedCount = history.filter((item) => !item.ok).length;
  const writeCount = history.filter((item) => item.risk !== "safe").length;
  const averageMs = history.length
    ? Math.round(history.reduce((sum, item) => sum + Number(item.executionMs || 0), 0) / history.length)
    : 0;

  const riskChart = useMemo<ChartRow[]>(() => countBy(history, (item) => item.risk), [history]);
  const modeChart = useMemo<ChartRow[]>(() => countBy(history, (item) => item.mode), [history]);
  const successChart = useMemo<ChartRow[]>(
    () => [
      { label: "Success", value: successCount },
      { label: "Failed", value: failedCount },
    ],
    [successCount, failedCount]
  );

  const durationChart = useMemo<ChartRow[]>(
    () =>
      history
        .slice(0, 10)
        .map((item, index) => ({
          label: `Q${history.length - index}`,
          value: Number(item.executionMs || 0),
        }))
        .reverse(),
    [history]
  );

  const appendHistory = (item: SqlHistoryItem) => {
    setHistory((current) => {
      const next = [item, ...current].slice(0, 100);
      saveLocalHistory(next);
      return next;
    });
  };

  const runQuery = async () => {
    if (!canRun) {
      if (readOnly && risk !== "safe") {
        setError("Read-only mode is enabled. Disable it before running write/schema queries.");
        return;
      }

      if (needsConfirmation) {
        setError(`Type "${DANGEROUS_CONFIRM_TEXT}" to confirm this risky query.`);
        return;
      }

      setError("SQL query is empty.");
      return;
    }

    const started = performance.now();

    try {
      setRunning(true);
      setError("");
      setNotice("");

      const response = await apiPost<any>("/developer/sql/execute", {
        sql: stripSqlComments(sql),
        rawSql: sql,
        readOnly,
        risk,
        confirmText: needsConfirmation ? confirmText : undefined,
        source: "developer_portal",
      });

      const normalized = normalizeResult(response);
      const elapsed = normalized.executionMs || Math.round(performance.now() - started);

      const nextResult = {
        ...normalized,
        executionMs: elapsed,
      };

      setResult(nextResult);

      const historyItem: SqlHistoryItem = {
        id: `query-${Date.now()}`,
        sql,
        risk,
        mode: readOnly ? "read_only" : "write_enabled",
        ok: true,
        rowCount: nextResult.rowCount,
        executionMs: elapsed,
        auditId: nextResult.auditId,
        error: null,
        createdAt: Date.now(),
      };

      appendHistory(historyItem);

      await apiPost<any>("/developer/sql/history", historyItem).catch(() => null);

      setNotice(`Query completed. ${nextResult.rowCount} row(s) returned/affected.`);
      setViewMode("results");
      setConfirmText("");
      await loadBackendStatus();
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - started);
      const message = getErrorMessage(err);

      const historyItem: SqlHistoryItem = {
        id: `query-${Date.now()}`,
        sql,
        risk,
        mode: readOnly ? "read_only" : "write_enabled",
        ok: false,
        rowCount: 0,
        executionMs: elapsed,
        auditId: null,
        error: message,
        createdAt: Date.now(),
      };

      appendHistory(historyItem);
      setError(message);
      await loadBackendStatus();
    } finally {
      setRunning(false);
    }
  };

  const clearEditor = () => {
    setSql("");
    setConfirmText("");
    setResult(null);
  };

  const useSnippet = (snippet: SavedSnippet) => {
    setSql(snippet.sql);
    setConfirmText("");
    setViewMode("results");
  };

  const useHistoryItem = (item: SqlHistoryItem) => {
    setSql(item.sql);
    setConfirmText("");
    setViewMode("results");
  };

  const exportResultJson = () => {
    if (!result) return;
    downloadJson("sql-result.json", result);
  };

  const exportResultCsv = () => {
    if (!result) return;
    downloadCsv("sql-result.csv", result.rows, result.columns);
  };

  const clearLocalHistory = () => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Clear local SQL query history on this device?");

    if (!confirmed) return;

    setHistory([]);
    saveLocalHistory([]);
    setNotice("Local query history cleared.");
  };

  if (loading || accountLoading) {
    return (
      <main className="sql-page" style={{ "--sql-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sql-state">
          <div className="sql-spinner" />
          <h2>Loading SQL Console...</h2>
          <p>Connecting to backend SQL service and loading query history.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="sql-page" style={{ "--sql-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="sql-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to use the SQL console.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="sql-page" style={{ "--sql-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sql-hero">
        <div>
          <span className="sql-eyebrow">Real PostgreSQL Database</span>
          <h1>SQL Console</h1>
          <p>
            This console queries your actual PostgreSQL database through the NestJS backend using
            Prisma and the backend DATABASE_URL. The database URL is never placed in browser code.
          </p>
        </div>

        <div className="sql-hero-actions">
          <div className="sql-switch">
            <button type="button" className={viewMode === "results" ? "active" : ""} onClick={() => setViewMode("results")}>
              Results
            </button>
            <button type="button" className={viewMode === "history" ? "active" : ""} onClick={() => setViewMode("history")}>
              History
            </button>
            <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
              Charts
            </button>
          </div>

          <button type="button" className="sql-white-btn" onClick={() => loadHistory()}>
            Refresh
          </button>

          <button type="button" className="sql-glass-btn" onClick={() => navigate?.("databaseTools")}>
            Database Tools
          </button>

          <button type="button" className="sql-glass-btn" onClick={() => navigate?.("databaseStudio")}>
            Database Studio
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`sql-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className={`sql-backend-card ${backendStatus?.ok ? "ok" : "bad"}`}>
        <div>
          <h2>{backendStatus?.ok ? "Backend SQL service connected" : "Backend SQL service not ready"}</h2>
          <p>
            {backendStatus?.ok
              ? `${backendStatus.service || "Developer SQL Service"} · ${backendStatus.provider || "PostgreSQL"} · writes ${backendStatus.writesEnabled ? "enabled" : "blocked"}`
              : backendStatus?.error || "Add the backend developer-sql module and restart NestJS."}
          </p>
        </div>

        <Chip tone={backendStatus?.ok ? "green" : "red"}>
          {backendStatus?.ok ? "connected" : "not connected"}
        </Chip>
      </section>

      <section className="sql-stat-grid">
        <StatCard label="Queries" value={history.length} detail={`${successCount} successful`} icon="🧪" />
        <StatCard label="Failures" value={failedCount} detail="Backend/query errors" icon="⚠️" />
        <StatCard label="Write/Schema" value={writeCount} detail="Risky query history" icon="🔐" />
        <StatCard label="Avg Time" value={`${averageMs}ms`} detail="Local/backend history" icon="⏱️" />
      </section>

      <section className="sql-console-grid">
        <section className="sql-editor-card">
          <div className="sql-editor-head">
            <div>
              <h2>Query Editor</h2>
              <p>Current command: {keyword || "None"}</p>
            </div>

            <Chip tone={riskTone(risk)}>{risk}</Chip>
          </div>

          <textarea
            value={sql}
            onChange={(event) => {
              setSql(event.target.value);
              setConfirmText("");
            }}
            spellCheck={false}
          />

          <div className="sql-editor-controls">
            <label className="sql-toggle">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(event) => {
                  setReadOnly(event.target.checked);
                  setConfirmText("");
                }}
              />
              <span>Read-only mode</span>
            </label>

            {!readOnly && <Chip tone="orange">write mode requested</Chip>}

            {needsConfirmation && (
              <label className="sql-confirm">
                Confirmation
                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={DANGEROUS_CONFIRM_TEXT}
                />
              </label>
            )}
          </div>

          <div className="sql-actions">
            <button type="button" onClick={runQuery} disabled={running || !canRun || backendStatus?.ok === false}>
              {running ? "Running..." : "Run Query"}
            </button>

            <button type="button" onClick={clearEditor}>
              Clear
            </button>

            {result && (
              <>
                <button type="button" onClick={exportResultJson}>
                  Export JSON
                </button>
                <button type="button" onClick={exportResultCsv}>
                  Export CSV
                </button>
              </>
            )}
          </div>

          <details className="sql-payload-preview">
            <summary>Backend request preview</summary>
            <pre>{JSON.stringify({
              url: "/developer/sql/execute",
              sql: stripSqlComments(sql),
              readOnly,
              risk,
              confirmText: needsConfirmation ? confirmText : undefined,
              source: "developer_portal",
            }, null, 2)}</pre>
          </details>

          {risk !== "safe" && (
            <section className="sql-warning">
              <strong>Risk warning</strong>
              <p>
                The backend blocks write/schema SQL by default. To enable it, set
                DEVELOPER_SQL_ALLOW_WRITES=true in the backend .env and type the confirmation text.
              </p>
            </section>
          )}
        </section>

        <section className="sql-snippets-card">
          <h2>Real DB Snippets</h2>
          <p>These are safe queries to inspect your actual PostgreSQL schema and records.</p>

          <div className="sql-snippet-list">
            {DEFAULT_SNIPPETS.map((snippet) => (
              <button key={snippet.id} type="button" onClick={() => useSnippet(snippet)}>
                <strong>{snippet.title}</strong>
                <span>{snippet.description}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {viewMode === "results" ? (
        <ResultsView result={result} resultMode={resultMode} setResultMode={setResultMode} />
      ) : viewMode === "history" ? (
        <HistoryView
          history={filteredHistory}
          search={historySearch}
          setSearch={setHistorySearch}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          onUse={useHistoryItem}
          onClear={clearLocalHistory}
        />
      ) : (
        <AnalyticsView
          riskChart={riskChart}
          modeChart={modeChart}
          successChart={successChart}
          durationChart={durationChart}
        />
      )}
    </main>
  );
}

function ResultsView({
  result,
  resultMode,
  setResultMode,
}: {
  result: SqlResult | null;
  resultMode: ResultMode;
  setResultMode: (mode: ResultMode) => void;
}) {
  if (!result) {
    return (
      <section className="sql-empty-card">
        <h2>No query result yet</h2>
        <p>Run a query to see rows, columns, execution time and audit ID here.</p>
      </section>
    );
  }

  return (
    <section className="sql-results-card">
      <div className="sql-results-head">
        <div>
          <h2>Query Results</h2>
          <p>
            {result.rowCount} row(s) · {result.executionMs}ms
            {result.auditId ? ` · Audit: ${result.auditId}` : ""}
          </p>
        </div>

        <div className="sql-mode-switch">
          <button type="button" className={resultMode === "table" ? "active" : ""} onClick={() => setResultMode("table")}>
            Table
          </button>
          <button type="button" className={resultMode === "cards" ? "active" : ""} onClick={() => setResultMode("cards")}>
            Cards
          </button>
        </div>
      </div>

      {resultMode === "table" ? (
        <div className="sql-table-wrap">
          <table>
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index}>
                  {result.columns.map((column) => (
                    <td key={column}>{formatCell(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="sql-result-card-grid">
          {result.rows.map((row, index) => (
            <article key={index} className="sql-result-card">
              <h3>Row {index + 1}</h3>
              <pre>{JSON.stringify(row, null, 2)}</pre>
            </article>
          ))}
        </section>
      )}

      {!result.rows.length && <Empty text="Query returned no rows." />}
    </section>
  );
}

function HistoryView({
  history,
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  onUse,
  onClear,
}: {
  history: SqlHistoryItem[];
  search: string;
  setSearch: (value: string) => void;
  riskFilter: string;
  setRiskFilter: (value: string) => void;
  onUse: (item: SqlHistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <section className="sql-history-card">
      <div className="sql-history-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SQL history..." />

        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
          <option value="all">All risks</option>
          <option value="safe">Safe</option>
          <option value="write">Write</option>
          <option value="destructive">Destructive</option>
          <option value="schema">Schema</option>
          <option value="unknown">Unknown</option>
        </select>

        <button type="button" onClick={onClear}>
          Clear Local History
        </button>
      </div>

      <div className="sql-history-list">
        {history.map((item) => (
          <article key={item.id} className={`sql-history-item ${item.ok ? "ok" : "failed"}`}>
            <div className="sql-history-top">
              <div>
                <Chip tone={riskTone(item.risk)}>{item.risk}</Chip>
                <Chip tone={item.ok ? "green" : "red"}>{item.ok ? "success" : "failed"}</Chip>
              </div>

              <span>{timeText(item.createdAt)}</span>
            </div>

            <pre>{item.sql}</pre>

            <div className="sql-history-meta">
              <span>{item.mode}</span>
              <span>{item.rowCount} row(s)</span>
              <span>{item.executionMs}ms</span>
              {item.auditId && <span>Audit: {item.auditId}</span>}
            </div>

            {item.error && <p>{item.error}</p>}

            <button type="button" onClick={() => onUse(item)}>
              Use Query
            </button>
          </article>
        ))}

        {!history.length && <Empty text="No query history matches your filters." />}
      </div>
    </section>
  );
}

function AnalyticsView({
  riskChart,
  modeChart,
  successChart,
  durationChart,
}: {
  riskChart: ChartRow[];
  modeChart: ChartRow[];
  successChart: ChartRow[];
  durationChart: ChartRow[];
}) {
  return (
    <section className="sql-chart-grid">
      <ChartCard title="Risk Distribution" description="Safe, write, destructive and schema queries.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={riskChart} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {riskChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={riskChart} />
      </ChartCard>

      <ChartCard title="Execution Status" description="Successful versus failed queries.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={successChart} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {successChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={successChart} />
      </ChartCard>

      <ChartCard title="Mode Usage" description="Read-only versus write-enabled query runs.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={modeChart} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {modeChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={modeChart} />
      </ChartCard>

      <ChartCard title="Recent Durations" description="Execution time of recent queries.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={durationChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--sql-primary)" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

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
    <article className="sql-stat">
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
  return <span className={`sql-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="sql-empty">{text}</div>;
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
    <section className="sql-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="sql-legend">
      {rows.map((row, index) => (
        <span key={`${row.label}-${index}`}>
          <i style={{ background: chartColors[index % chartColors.length] }} />
          {row.label}: {row.value}
        </span>
      ))}
    </div>
  );
}

function formatCell(value: any) {
  if (value == null) return "—";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const css = `
@keyframes sqlSpin { to { transform: rotate(360deg); } }

.sql-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--sql-primary) 10%, transparent), transparent 34rem),
    #f8fafc;
  color: #0f172a;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}

.sql-page *,
.sql-page *::before,
.sql-page *::after {
  box-sizing: border-box;
}

.sql-page button,
.sql-page input,
.sql-page select,
.sql-page textarea {
  font: inherit;
  max-width: 100%;
}

.sql-state {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .08);
  text-align: center;
}

.sql-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sql-state p {
  max-width: 34rem;
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.sql-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--sql-primary) 18%, transparent);
  border-top-color: var(--sql-primary);
  animation: sqlSpin .8s linear infinite;
}

.sql-hero {
  display: grid;
  gap: 16px;
  border-radius: 30px;
  padding: 18px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--sql-primary), #0f172a 72%);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  overflow: hidden;
}

.sql-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.sql-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.sql-hero p {
  max-width: 850px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.sql-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sql-switch,
.sql-mode-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.sql-mode-switch {
  background: #f1f5f9;
  border-color: rgba(148, 163, 184, .18);
}

.sql-switch button,
.sql-mode-switch button {
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

.sql-mode-switch button {
  color: #475569;
}

.sql-switch button.active,
.sql-mode-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.sql-white-btn,
.sql-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.sql-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.sql-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.sql-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.sql-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.sql-alert.success {
  background: #dcfce7;
  color: #166534;
}

.sql-backend-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 14px;
  border-radius: 24px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .05);
}

.sql-backend-card.ok {
  border-color: rgba(22, 163, 74, .24);
}

.sql-backend-card.bad {
  border-color: rgba(220, 38, 38, .24);
}

.sql-backend-card h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.sql-backend-card p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.sql-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.sql-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.sql-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.sql-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.sql-stat small {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.sql-console-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.sql-editor-card,
.sql-snippets-card,
.sql-results-card,
.sql-history-card,
.sql-chart-card,
.sql-empty-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.sql-editor-head,
.sql-results-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.sql-editor-head h2,
.sql-snippets-card h2,
.sql-results-head h2,
.sql-chart-card h2,
.sql-empty-card h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sql-editor-head p,
.sql-snippets-card p,
.sql-results-head p,
.sql-chart-card p,
.sql-empty-card p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.sql-editor-card textarea {
  width: 100%;
  min-height: 320px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 22px;
  padding: 14px;
  background: #0f172a;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.sql-editor-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.sql-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.sql-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--sql-primary);
}

.sql-confirm {
  display: inline-grid;
  gap: 4px;
  color: #991b1b;
  font-size: 11px;
  font-weight: 1000;
}

.sql-confirm input {
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(220, 38, 38, .28);
  padding: 0 12px;
  color: #991b1b;
  font-size: 12px;
  font-weight: 900;
}

.sql-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.sql-actions button,
.sql-history-toolbar button,
.sql-history-item button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--sql-primary) 10%, white);
  color: var(--sql-primary);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.sql-actions button:first-child {
  background: var(--sql-primary);
  color: #fff;
}

.sql-actions button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.sql-payload-preview {
  margin-top: 12px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  overflow: hidden;
}

.sql-payload-preview summary {
  cursor: pointer;
  padding: 10px 12px;
  color: #334155;
  font-size: 12px;
  font-weight: 1000;
}

.sql-payload-preview pre {
  margin: 0;
  padding: 0 12px 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  color: #475569;
  font-size: 11px;
  line-height: 1.5;
}

.sql-warning {
  margin-top: 12px;
  padding: 12px;
  border-radius: 20px;
  background: #fff7ed;
  border: 1px solid rgba(249, 115, 22, .24);
}

.sql-warning strong {
  display: block;
  color: #9a3412;
  font-size: 13px;
  font-weight: 1000;
}

.sql-warning p {
  margin: 5px 0 0;
  color: #c2410c;
  font-size: 12px;
  line-height: 1.5;
}

.sql-snippet-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.sql-snippet-list button {
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 18px;
  padding: 12px;
  background: #f8fafc;
  cursor: pointer;
}

.sql-snippet-list strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 1000;
}

.sql-snippet-list span {
  color: #64748b;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 800;
}

.sql-chip {
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

.sql-chip.green { background: #dcfce7; color: #166534; }
.sql-chip.blue { background: #dbeafe; color: #1d4ed8; }
.sql-chip.purple { background: #f3e8ff; color: #7e22ce; }
.sql-chip.orange { background: #ffedd5; color: #c2410c; }
.sql-chip.red { background: #fee2e2; color: #b91c1c; }
.sql-chip.gray { background: #f1f5f9; color: #475569; }

.sql-results-card,
.sql-history-card,
.sql-empty-card,
.sql-chart-grid {
  margin-top: 10px;
}

.sql-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.sql-table-wrap table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}

.sql-table-wrap th {
  text-align: left;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.sql-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
  max-width: 320px;
  overflow-wrap: anywhere;
}

.sql-result-card-grid,
.sql-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.sql-result-card {
  border-radius: 20px;
  background: #0f172a;
  color: #e5e7eb;
  overflow: hidden;
}

.sql-result-card h3 {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 1000;
  border-bottom: 1px solid rgba(255,255,255,.1);
}

.sql-result-card pre,
.sql-history-item pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  font-size: 11px;
  line-height: 1.5;
}

.sql-history-toolbar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.sql-history-toolbar input,
.sql-history-toolbar select {
  min-height: 42px;
  border: 1px solid rgba(148, 163, 184, .3);
  border-radius: 16px;
  padding: 0 12px;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.sql-history-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.sql-history-item {
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 22px;
  padding: 12px;
  background: #fff;
}

.sql-history-item.failed {
  border-color: rgba(220, 38, 38, .22);
  background: #fff7f7;
}

.sql-history-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.sql-history-top > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sql-history-top > span {
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
}

.sql-history-item pre {
  margin-top: 10px;
  border-radius: 16px;
  background: #0f172a;
  color: #e5e7eb;
}

.sql-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.sql-history-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.sql-history-item p {
  margin: 10px 0 0;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 850;
}

.sql-history-item button {
  margin-top: 10px;
}

.sql-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.sql-chart-card p {
  margin: 5px 0 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.sql-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.sql-legend span {
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

.sql-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.sql-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 18px;
  border-radius: 20px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  text-align: center;
  border: 1px dashed rgba(148, 163, 184, .35);
}

@media (min-width: 520px) {
  .sql-stat-grid,
  .sql-history-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sql-result-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .sql-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 920px) {
  .sql-page {
    padding: 14px;
  }

  .sql-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .sql-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .sql-console-grid {
    grid-template-columns: 1.5fr .7fr;
    align-items: start;
  }

  .sql-history-toolbar {
    grid-template-columns: minmax(240px, 1fr) 180px auto;
  }
}
`;
