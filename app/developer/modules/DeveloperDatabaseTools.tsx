"use client";

/**
 * app/developer/modules/DeveloperDatabaseTools.tsx
 * ---------------------------------------------------------
 * DEVELOPER DATABASE TOOLS
 * ---------------------------------------------------------
 * Real database inspection and maintenance module for the developer portal.
 *
 * Purpose:
 * - Inspect local Dexie tables in the PWA.
 * - Load backend database diagnostics when available.
 * - View table counts, sample records, sync state and storage usage.
 * - Search tables/records.
 * - Export local table data as JSON.
 * - Clear local table data with confirmation.
 * - Show card, table and analytics/chart views.
 *
 * Expected API endpoints, when available:
 * GET /developer/database-tools
 * GET /database/tools
 *
 * Local fallback:
 * Uses app/lib/db Dexie instance.
 *
 * Requires:
 * npm install recharts
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
import { db } from "../../lib/db/db";

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type TableHealth = "healthy" | "empty" | "warning" | "error";

type DbTableInfo = {
  id: string;
  name: string;
  source: "local" | "server";
  count: number;
  pendingSync: number;
  deletedRecords: number;
  failedRecords: number;
  estimatedSizeKb: number;
  primaryKey?: string | null;
  indexes: string[];
  health: TableHealth;
  sample: any[];
  lastUpdatedAt?: string | number | null;
  error?: string | null;
};

type ChartRow = {
  label: string;
  value: number;
};

// ======================================================
// CONSTANTS
// ======================================================

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

const SAMPLE_LIMIT = 25;

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

const bytesFromJson = (value: unknown) => {
  try {
    return Math.round(new Blob([JSON.stringify(value)]).size / 1024);
  } catch {
    try {
      return Math.round(JSON.stringify(value).length / 1024);
    } catch {
      return 0;
    }
  }
};

const tableHealthTone = (health?: TableHealth): Tone => {
  if (health === "healthy") return "green";
  if (health === "empty") return "gray";
  if (health === "warning") return "orange";
  if (health === "error") return "red";
  return "gray";
};

const inferHealth = ({
  count,
  pendingSync,
  failedRecords,
  error,
}: {
  count: number;
  pendingSync: number;
  failedRecords: number;
  error?: string | null;
}): TableHealth => {
  if (error || failedRecords > 0) return "error";
  if (pendingSync > 0) return "warning";
  if (count === 0) return "empty";
  return "healthy";
};

const getLastUpdated = (sample: any[]) => {
  let latest = 0;

  sample.forEach((record) => {
    const time = safeTime(record?.updatedAt || record?.createdAt || record?.lastModifiedAt);
    if (time > latest) latest = time;
  });

  return latest || null;
};

const stringifyRecord = (record: any) => {
  try {
    return JSON.stringify(record, null, 2);
  } catch {
    return String(record);
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

const normalizeServerTable = (raw: any, index: number): DbTableInfo => {
  const count = Number(raw.count || raw.records || raw.rows || 0);
  const pendingSync = Number(raw.pendingSync || raw.pending || raw.unsynced || 0);
  const deletedRecords = Number(raw.deletedRecords || raw.deleted || 0);
  const failedRecords = Number(raw.failedRecords || raw.failed || raw.errors || 0);
  const error = raw.error || null;

  return {
    id: String(raw.id || raw.name || raw.tableName || `server-table-${index}`),
    name: raw.name || raw.tableName || `Server Table ${index + 1}`,
    source: "server",
    count,
    pendingSync,
    deletedRecords,
    failedRecords,
    estimatedSizeKb: Number(raw.estimatedSizeKb || raw.sizeKb || 0),
    primaryKey: raw.primaryKey || null,
    indexes: Array.isArray(raw.indexes) ? raw.indexes : [],
    health: raw.health || inferHealth({ count, pendingSync, failedRecords, error }),
    sample: Array.isArray(raw.sample) ? raw.sample : Array.isArray(raw.recordsSample) ? raw.recordsSample : [],
    lastUpdatedAt: raw.lastUpdatedAt || raw.updatedAt || null,
    error,
  };
};

const inspectLocalTables = async (): Promise<DbTableInfo[]> => {
  const tables: any[] = Array.isArray((db as any).tables)
    ? (db as any).tables
    : Object.values((db as any)._allTables || {});

  const results: DbTableInfo[] = [];

  for (const tableRef of tables) {
    const name = tableRef?.name || tableRef?.schema?.name || "unknown";

    try {
      const count = await tableRef.count();
      const sample = await tableRef.limit(SAMPLE_LIMIT).toArray();

      const pendingSync = sample.filter((record: any) => {
        const sync = String(record?.synced || record?.syncStatus || "").toLowerCase();
        return ["pending", "local", "unsynced", "failed"].includes(sync) || record?.synced === false;
      }).length;

      const failedRecords = sample.filter((record: any) => {
        const sync = String(record?.synced || record?.syncStatus || "").toLowerCase();
        return sync === "failed" || sync === "error" || Boolean(record?.syncError || record?.error);
      }).length;

      const deletedRecords = sample.filter((record: any) => Boolean(record?.isDeleted)).length;

      const indexes = Array.isArray(tableRef?.schema?.indexes)
        ? tableRef.schema.indexes.map((index: any) => index?.name || index?.keyPath || String(index))
        : [];

      const primaryKey = tableRef?.schema?.primKey?.name || tableRef?.schema?.primKey?.keyPath || "id";

      results.push({
        id: name,
        name,
        source: "local",
        count,
        pendingSync,
        deletedRecords,
        failedRecords,
        estimatedSizeKb: bytesFromJson(sample),
        primaryKey: String(primaryKey || "id"),
        indexes: indexes.map(String).filter(Boolean),
        health: inferHealth({ count, pendingSync, failedRecords }),
        sample,
        lastUpdatedAt: getLastUpdated(sample),
        error: null,
      });
    } catch (error: any) {
      results.push({
        id: name,
        name,
        source: "local",
        count: 0,
        pendingSync: 0,
        deletedRecords: 0,
        failedRecords: 0,
        estimatedSizeKb: 0,
        primaryKey: null,
        indexes: [],
        health: "error",
        sample: [],
        lastUpdatedAt: null,
        error: error?.message || "Could not inspect table.",
      });
    }
  }

  return results.sort((a, b) => b.count - a.count);
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

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperDatabaseTools({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [tables, setTables] = useState<DbTableInfo[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedTable, setSelectedTable] = useState<DbTableInfo | null>(null);
  const [recordQuery, setRecordQuery] = useState("");

  // ======================================================
  // LOAD
  // ======================================================

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");

      const [localTables, serverResponse] = await Promise.all([
        inspectLocalTables(),
        apiClient<any>("/developer/database-tools").catch(async () =>
          apiClient<any>("/database/tools").catch(() => null)
        ),
      ]);

      const serverTables = toArray<any>(serverResponse, [
        "tables",
        "databaseTables",
        "diagnostics",
      ]).map(normalizeServerTable);

      setTables([...localTables, ...serverTables]);
    } catch (err: any) {
      setError(err?.message || "Could not inspect database tables.");
      setTables(await inspectLocalTables());
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

  const filteredTables = useMemo(() => {
    const term = query.trim().toLowerCase();

    return tables
      .filter((table) => {
        const haystack = `${table.name} ${table.primaryKey || ""} ${table.indexes.join(" ")} ${
          table.error || ""
        }`.toLowerCase();

        const searchOk = !term || haystack.includes(term);
        const healthOk = healthFilter === "all" || table.health === healthFilter;
        const sourceOk = sourceFilter === "all" || table.source === sourceFilter;

        return searchOk && healthOk && sourceOk;
      })
      .sort((a, b) => {
        if (a.health !== b.health) {
          if (a.health === "error") return -1;
          if (b.health === "error") return 1;
          if (a.health === "warning") return -1;
          if (b.health === "warning") return 1;
        }

        return b.count - a.count;
      });
  }, [tables, query, healthFilter, sourceFilter]);

  const selectedRecords = useMemo(() => {
    if (!selectedTable) return [];

    const term = recordQuery.trim().toLowerCase();
    if (!term) return selectedTable.sample;

    return selectedTable.sample.filter((record) => stringifyRecord(record).toLowerCase().includes(term));
  }, [selectedTable, recordQuery]);

  const totalRecords = tables.reduce((sum, table) => sum + Number(table.count || 0), 0);
  const totalPending = tables.reduce((sum, table) => sum + Number(table.pendingSync || 0), 0);
  const totalDeleted = tables.reduce((sum, table) => sum + Number(table.deletedRecords || 0), 0);
  const totalFailed = tables.reduce((sum, table) => sum + Number(table.failedRecords || 0), 0);
  const estimatedSize = tables.reduce((sum, table) => sum + Number(table.estimatedSizeKb || 0), 0);

  const healthChart = useMemo<ChartRow[]>(
    () => countBy(tables, (table) => table.health),
    [tables]
  );

  const sourceChart = useMemo<ChartRow[]>(
    () => countBy(tables, (table) => table.source),
    [tables]
  );

  const recordChart = useMemo<ChartRow[]>(
    () =>
      [...tables]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((table) => ({
          label: table.name.length > 16 ? `${table.name.slice(0, 16)}…` : table.name,
          value: table.count,
        })),
    [tables]
  );

  const syncChart = useMemo<ChartRow[]>(
    () =>
      [...tables]
        .sort((a, b) => b.pendingSync - a.pendingSync)
        .slice(0, 10)
        .map((table) => ({
          label: table.name.length > 16 ? `${table.name.slice(0, 16)}…` : table.name,
          value: table.pendingSync,
        })),
    [tables]
  );

  // ======================================================
  // ACTIONS
  // ======================================================

  const exportTable = async (table: DbTableInfo) => {
    try {
      setError("");
      setNotice("");

      if (table.source === "local") {
        const tableRef = (db as any).table(table.name);
        const rows = await tableRef.toArray();
        downloadJson(`${table.name}-export.json`, rows);
        setNotice(`${table.name} exported.`);
      } else {
        downloadJson(`${table.name}-diagnostic.json`, table);
        setNotice(`${table.name} diagnostic exported.`);
      }
    } catch (err: any) {
      setError(err?.message || "Could not export table.");
    }
  };

  const exportAllDiagnostics = () => {
    downloadJson("eleeveon-database-diagnostics.json", {
      exportedAt: new Date().toISOString(),
      tables,
    });
    setNotice("Database diagnostics exported.");
  };

  const clearLocalTable = async (table: DbTableInfo) => {
    if (table.source !== "local") {
      setError("Only local PWA tables can be cleared from this tool.");
      return;
    }

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `This will clear all local records from "${table.name}" on this device only. This is dangerous. Continue?`
      );

    if (!confirmed) return;

    try {
      setError("");
      setNotice("");

      await (db as any).table(table.name).clear();
      setSelectedTable(null);
      await load(true);
      setNotice(`${table.name} cleared locally.`);
    } catch (err: any) {
      setError(err?.message || "Could not clear local table.");
    }
  };

  const openTable = (table: DbTableInfo) => {
    setSelectedTable(table);
    setRecordQuery("");
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main className="devdb-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devdb-state">
          <div className="devdb-spinner" />
          <h2>Inspecting database...</h2>
          <p>Reading local PWA tables, sync flags, sample records and backend diagnostics.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="devdb-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devdb-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to inspect database tools.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="devdb-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="devdb-hero">
        <div>
          <span className="devdb-eyebrow">Data operations</span>
          <h1>Database Tools</h1>
          <p>
            Inspect local PWA tables, sample records, sync health, deleted records and backend
            database diagnostics. Use dangerous actions carefully because local table clearing affects
            this device.
          </p>
        </div>

        <div className="devdb-hero-actions">
          <div className="devdb-switch" role="tablist" aria-label="Database tool views">
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

          <button type="button" className="devdb-white-btn" onClick={exportAllDiagnostics}>
            Export Diagnostics
          </button>

          <button
            type="button"
            className="devdb-glass-btn"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`devdb-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="devdb-stat-grid">
        <StatCard label="Tables" value={tables.length} detail={`${filteredTables.length} shown`} icon="🗄️" />
        <StatCard label="Records" value={compact(totalRecords)} detail={`${compact(estimatedSize)} KB sampled`} icon="📦" />
        <StatCard label="Pending Sync" value={totalPending} detail={`${totalDeleted} deleted sampled`} icon="🔄" />
        <StatCard label="Failed Records" value={totalFailed} detail="Sampled sync failures" icon="⚠️" />
      </section>

      <section className="devdb-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search table, primary key, indexes..."
        />

        <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
          <option value="all">All health</option>
          <option value="healthy">Healthy</option>
          <option value="empty">Empty</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>

        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">All sources</option>
          <option value="local">Local PWA</option>
          <option value="server">Server</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setHealthFilter("all");
            setSourceFilter("all");
          }}
        >
          Reset
        </button>
      </section>

      {viewMode === "analytics" ? (
        <AnalyticsView
          healthChart={healthChart}
          sourceChart={sourceChart}
          recordChart={recordChart}
          syncChart={syncChart}
        />
      ) : viewMode === "table" ? (
        <TableView
          tables={filteredTables}
          onOpen={openTable}
          onExport={exportTable}
          onClear={clearLocalTable}
        />
      ) : (
        <CardsView
          tables={filteredTables}
          onOpen={openTable}
          onExport={exportTable}
          onClear={clearLocalTable}
          navigate={navigate}
        />
      )}

      {selectedTable && (
        <TableInspector
          table={selectedTable}
          records={selectedRecords}
          recordQuery={recordQuery}
          setRecordQuery={setRecordQuery}
          onClose={() => setSelectedTable(null)}
          onExport={exportTable}
          onClear={clearLocalTable}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  tables,
  onOpen,
  onExport,
  onClear,
  navigate,
}: {
  tables: DbTableInfo[];
  onOpen: (table: DbTableInfo) => void;
  onExport: (table: DbTableInfo) => void;
  onClear: (table: DbTableInfo) => void;
  navigate?: (key: string) => void;
}) {
  return (
    <section className="devdb-card-grid">
      {tables.map((table) => (
        <article key={`${table.source}-${table.name}`} className={`devdb-table-card ${table.health}`}>
          <div className="devdb-table-top">
            <span className="devdb-table-icon">🗄️</span>

            <div className="devdb-chip-row">
              <Chip tone={tableHealthTone(table.health)}>{table.health}</Chip>
              <Chip tone={table.source === "local" ? "blue" : "purple"}>{table.source}</Chip>
            </div>
          </div>

          <h2>{table.name}</h2>
          <p>
            {table.error ||
              `${compact(table.count)} records · ${table.indexes.length} index(es) · ${table.estimatedSizeKb} KB sampled`}
          </p>

          <div className="devdb-mini-grid">
            <span>
              <b>Records</b>
              {compact(table.count)}
            </span>
            <span>
              <b>Pending Sync</b>
              {table.pendingSync}
            </span>
            <span>
              <b>Deleted</b>
              {table.deletedRecords}
            </span>
            <span>
              <b>Failed</b>
              {table.failedRecords}
            </span>
            <span>
              <b>Primary Key</b>
              {table.primaryKey || "—"}
            </span>
            <span>
              <b>Last Update</b>
              {timeText(table.lastUpdatedAt)}
            </span>
          </div>

          <div className="devdb-index-pills">
            {table.indexes.slice(0, 6).map((index) => (
              <span key={index}>{index}</span>
            ))}
            {table.indexes.length > 6 && <span>+{table.indexes.length - 6} more</span>}
            {!table.indexes.length && <span>No secondary indexes</span>}
          </div>

          <div className="devdb-actions">
            <button type="button" onClick={() => onOpen(table)}>
              Inspect
            </button>
            <button type="button" onClick={() => onExport(table)}>
              Export
            </button>
            <button type="button" onClick={() => navigate?.("syncDiagnostics")}>
              Sync
            </button>
            {table.source === "local" && (
              <button type="button" className="danger" onClick={() => onClear(table)}>
                Clear Local
              </button>
            )}
          </div>
        </article>
      ))}

      {!tables.length && <Empty text="No database tables match your filters." />}
    </section>
  );
}

function TableView({
  tables,
  onOpen,
  onExport,
  onClear,
}: {
  tables: DbTableInfo[];
  onOpen: (table: DbTableInfo) => void;
  onExport: (table: DbTableInfo) => void;
  onClear: (table: DbTableInfo) => void;
}) {
  return (
    <section className="devdb-table-list-card">
      <div className="devdb-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Source</th>
              <th>Health</th>
              <th>Records</th>
              <th>Pending</th>
              <th>Deleted</th>
              <th>Failed</th>
              <th>Primary Key</th>
              <th>Indexes</th>
              <th>Sample Size</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {tables.map((table) => (
              <tr key={`${table.source}-${table.name}`}>
                <td>
                  <strong>{table.name}</strong>
                  {table.error && <small>{table.error}</small>}
                </td>
                <td>{table.source}</td>
                <td>
                  <Chip tone={tableHealthTone(table.health)}>{table.health}</Chip>
                </td>
                <td>{compact(table.count)}</td>
                <td>{table.pendingSync}</td>
                <td>{table.deletedRecords}</td>
                <td>{table.failedRecords}</td>
                <td>{table.primaryKey || "—"}</td>
                <td>{table.indexes.length}</td>
                <td>{table.estimatedSizeKb} KB</td>
                <td>{timeText(table.lastUpdatedAt)}</td>
                <td>
                  <div className="devdb-table-actions">
                    <button type="button" onClick={() => onOpen(table)}>
                      Inspect
                    </button>
                    <button type="button" onClick={() => onExport(table)}>
                      Export
                    </button>
                    {table.source === "local" && (
                      <button type="button" className="danger" onClick={() => onClear(table)}>
                        Clear
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!tables.length && <Empty text="No database tables match your filters." />}
    </section>
  );
}

function AnalyticsView({
  healthChart,
  sourceChart,
  recordChart,
  syncChart,
}: {
  healthChart: ChartRow[];
  sourceChart: ChartRow[];
  recordChart: ChartRow[];
  syncChart: ChartRow[];
}) {
  return (
    <section className="devdb-chart-grid">
      <ChartCard title="Table Health" description="Healthy, warning, empty and error table states.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie
              data={healthChart}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
            >
              {healthChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={healthChart} />
      </ChartCard>

      <ChartCard title="Source Mix" description="Local PWA versus server diagnostics.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie
              data={sourceChart}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
            >
              {sourceChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={sourceChart} />
      </ChartCard>

      <ChartCard title="Largest Tables" description="Top tables by record count.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={recordChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={120} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Pending Sync by Table" description="Tables with sampled unsynced records.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={syncChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={120} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ======================================================
// INSPECTOR
// ======================================================

function TableInspector({
  table,
  records,
  recordQuery,
  setRecordQuery,
  onClose,
  onExport,
  onClear,
}: {
  table: DbTableInfo;
  records: any[];
  recordQuery: string;
  setRecordQuery: (value: string) => void;
  onClose: () => void;
  onExport: (table: DbTableInfo) => void;
  onClear: (table: DbTableInfo) => void;
}) {
  return (
    <div className="devdb-modal-backdrop" role="dialog" aria-modal="true">
      <section className="devdb-modal">
        <div className="devdb-modal-head">
          <div>
            <h2>{table.name}</h2>
            <p>
              {table.source} table · {compact(table.count)} records · {table.sample.length} sampled
            </p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className="devdb-modal-summary">
          <Chip tone={tableHealthTone(table.health)}>{table.health}</Chip>
          <Chip tone={table.source === "local" ? "blue" : "purple"}>{table.source}</Chip>
          <span>{table.primaryKey || "no primary key"}</span>
          <span>{table.indexes.length} index(es)</span>
          <span>{table.estimatedSizeKb} KB sampled</span>
        </section>

        {table.error && <section className="devdb-alert error">{table.error}</section>}

        <div className="devdb-inspector-actions">
          <input
            value={recordQuery}
            onChange={(event) => setRecordQuery(event.target.value)}
            placeholder="Search sampled records..."
          />
          <button type="button" onClick={() => onExport(table)}>
            Export
          </button>
          {table.source === "local" && (
            <button type="button" className="danger" onClick={() => onClear(table)}>
              Clear Local Table
            </button>
          )}
        </div>

        <section className="devdb-record-list">
          {records.map((record, index) => (
            <details key={index} className="devdb-record">
              <summary>
                Record {index + 1}
                {record?.id ? ` · ID: ${record.id}` : ""}
                {record?.cloudId ? ` · Cloud: ${record.cloudId}` : ""}
              </summary>
              <pre>{stringifyRecord(record)}</pre>
            </details>
          ))}

          {!records.length && <Empty text="No sampled records match your search." />}
        </section>
      </section>
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
    <article className="devdb-stat">
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
  return <span className={`devdb-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="devdb-empty">{text}</div>;
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
    <section className="devdb-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="devdb-legend">
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
@keyframes devdbSpin { to { transform: rotate(360deg); } }

.devdb-page {
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

.devdb-page *,
.devdb-page *::before,
.devdb-page *::after {
  box-sizing: border-box;
}

.devdb-page button,
.devdb-page input,
.devdb-page select,
.devdb-page textarea {
  font: inherit;
  max-width: 100%;
}

.devdb-page button {
  -webkit-tap-highlight-color: transparent;
}

.devdb-state {
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

.devdb-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devdb-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.devdb-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--dev-primary) 18%, transparent);
  border-top-color: var(--dev-primary);
  animation: devdbSpin .8s linear infinite;
}

.devdb-hero {
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

.devdb-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.devdb-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.devdb-hero p {
  max-width: 850px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.devdb-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.devdb-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.devdb-switch button {
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

.devdb-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.devdb-white-btn,
.devdb-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.devdb-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.devdb-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.devdb-glass-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.devdb-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.devdb-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.devdb-alert.success {
  background: #dcfce7;
  color: #166534;
}

.devdb-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devdb-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devdb-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devdb-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.devdb-stat small {
  display: block;
  margin-top: 8px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devdb-toolbar {
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

.devdb-toolbar input,
.devdb-toolbar select {
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

.devdb-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--dev-primary) 10%, white);
  color: var(--dev-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.devdb-card-grid,
.devdb-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devdb-table-card,
.devdb-chart-card,
.devdb-table-list-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devdb-table-card.error {
  border-color: rgba(220, 38, 38, .24);
  background: linear-gradient(180deg, #fff, #fff7f7);
}

.devdb-table-card.warning {
  border-color: rgba(249, 115, 22, .24);
}

.devdb-table-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.devdb-table-icon {
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

.devdb-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.devdb-table-card h2 {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devdb-table-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.45;
}

.devdb-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.devdb-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
}

.devdb-mini-grid b {
  display: block;
  color: var(--muted, #64748b);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.devdb-index-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.devdb-index-pills span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.devdb-actions,
.devdb-table-actions,
.devdb-inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.devdb-actions {
  margin-top: 14px;
}

.devdb-actions button,
.devdb-table-actions button,
.devdb-inspector-actions button {
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

.devdb-actions button:first-child,
.devdb-table-actions button:first-child,
.devdb-inspector-actions button:first-of-type {
  background: var(--dev-primary);
  color: #fff;
}

.devdb-actions button.danger,
.devdb-table-actions button.danger,
.devdb-inspector-actions button.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.devdb-chip {
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

.devdb-chip.green { background: #dcfce7; color: #166534; }
.devdb-chip.blue { background: #dbeafe; color: #1d4ed8; }
.devdb-chip.purple { background: #f3e8ff; color: #7e22ce; }
.devdb-chip.orange { background: #ffedd5; color: #c2410c; }
.devdb-chip.red { background: #fee2e2; color: #b91c1c; }
.devdb-chip.gray { background: #f1f5f9; color: #475569; }

.devdb-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.devdb-table-wrap table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
}

.devdb-table-wrap th {
  text-align: left;
  color: var(--muted, #64748b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.devdb-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.devdb-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.devdb-table-wrap small {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.35;
}

.devdb-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devdb-chart-card p {
  margin: 5px 0 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devdb-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.devdb-legend span {
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

.devdb-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.devdb-empty {
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

.devdb-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.devdb-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: var(--surface, #fff);
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.devdb-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.devdb-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devdb-modal-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devdb-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.devdb-modal-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-radius: 18px;
  background: #f8fafc;
  margin-bottom: 12px;
}

.devdb-modal-summary span:not(.devdb-chip) {
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

.devdb-inspector-actions {
  margin-bottom: 12px;
}

.devdb-inspector-actions input {
  min-height: 38px;
  flex: 1 1 240px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, .32);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 850;
}

.devdb-record-list {
  display: grid;
  gap: 8px;
}

.devdb-record {
  border-radius: 18px;
  background: #0f172a;
  color: #e5e7eb;
  overflow: hidden;
}

.devdb-record summary {
  cursor: pointer;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 1000;
}

.devdb-record pre {
  max-height: 320px;
  overflow: auto;
  margin: 0;
  padding: 0 12px 12px;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}

@media (min-width: 520px) {
  .devdb-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devdb-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devdb-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .devdb-card-grid,
  .devdb-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devdb-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .devdb-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .devdb-page {
    padding: 14px;
  }

  .devdb-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .devdb-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .devdb-toolbar {
    grid-template-columns: minmax(240px, 2fr) repeat(2, minmax(130px, 1fr)) auto;
  }

  .devdb-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .devdb-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
