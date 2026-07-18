"use client";

/**
 * app/developer/modules/DeveloperDatabaseStudio.tsx
 * ---------------------------------------------------------
 * DEVELOPER DATABASE STUDIO — FILE 2 OF 3
 * ---------------------------------------------------------
 * Full record manager for local Dexie tables.
 *
 * Purpose:
 * - Browse local tables.
 * - View records.
 * - Add records.
 * - Edit records.
 * - Delete records.
 * - Bulk delete.
 * - Import JSON.
 * - Export JSON.
 * - Search/filter records.
 * - Pagination.
 * - Table schema preview.
 * - Mobile-first CRUD studio.
 *
 * DOES NOT EXECUTE SQL.
 * SQL belongs to file 3.
 *
 * Requires:
 * npm install recharts
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { db } from "../../lib/db/db";
import { useSettings } from "../../context/settings-context";
import { useAccount } from "../../context/account-context";

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type TableInfo = {
  name: string;
  count: number;
  primaryKey: string;
  indexes: string[];
};

type JsonRecord = Record<string, any>;

type ViewMode = "cards" | "table";

// ======================================================
// HELPERS
// ======================================================

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const compact = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

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

const inferTone = (count: number): Tone => {
  if (count > 5000) return "red";
  if (count > 1000) return "orange";
  if (count > 100) return "purple";
  if (count > 20) return "blue";
  return "green";
};

const readJsonFile = async (file: File) => {
  const text = await file.text();
  return JSON.parse(text);
};

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperDatabaseStudio({ navigate }: Props) {
  const { settings } = useSettings();
  const { authenticated, accountId, loading: accountLoading } = useAccount();

  const primary = settings?.primaryColor || "#2563eb";

  const [loading, setLoading] = useState(true);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);

  const [records, setRecords] = useState<JsonRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<JsonRecord[]>([]);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedIds, setSelectedIds] = useState<any[]>([]);

  const [editingRecord, setEditingRecord] = useState<JsonRecord | null>(null);
  const [editingText, setEditingText] = useState("");

  const [showEditor, setShowEditor] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ======================================================
  // LOAD TABLES
  // ======================================================

  const loadTables = async () => {
    try {
      setLoading(true);

      const dexieTables: any[] = Array.isArray((db as any).tables)
        ? (db as any).tables
        : Object.values((db as any)._allTables || {});

      const rows: TableInfo[] = [];

      for (const tableRef of dexieTables) {
        const count = await tableRef.count();

        rows.push({
          name: tableRef.name,
          count,
          primaryKey:
            tableRef?.schema?.primKey?.name ||
            tableRef?.schema?.primKey?.keyPath ||
            "id",
          indexes: Array.isArray(tableRef?.schema?.indexes)
            ? tableRef.schema.indexes.map(
                (index: any) => index?.name || index?.keyPath || String(index)
              )
            : [],
        });
      }

      rows.sort((a, b) => b.count - a.count);

      setTables(rows);

      if (rows.length && !selectedTable) {
        await openTable(rows[0]);
      }
    } catch (err: any) {
      setError(err?.message || "Could not load database studio.");
    } finally {
      setLoading(false);
    }
  };

  // ======================================================
  // LOAD TABLE RECORDS
  // ======================================================

  const openTable = async (table: TableInfo) => {
    try {
      setSelectedTable(table);
      setPage(1);
      setSelectedIds([]);

      const tableRef = (db as any).table(table.name);

      const rows = await tableRef.toArray();

      setRecords(rows);
      setFilteredRecords(rows);
    } catch (err: any) {
      setError(err?.message || "Could not open table.");
    }
  };

  // ======================================================
  // EFFECTS
  // ======================================================

  useEffect(() => {
    if (accountLoading) return;

    if (!authenticated || !accountId) {
      setLoading(false);
      return;
    }

    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, accountLoading]);

  useEffect(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      setFilteredRecords(records);
      return;
    }

    setFilteredRecords(
      records.filter((record) =>
        safeStringify(record).toLowerCase().includes(term)
      )
    );
  }, [search, records]);

  // ======================================================
  // PAGINATION
  // ======================================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / pageSize)
  );

  const pageRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page]);

  // ======================================================
  // CRUD ACTIONS
  // ======================================================

  const createRecord = () => {
    setEditingRecord(null);
    setEditingText("{\n  \n}");
    setShowEditor(true);
  };

  const editRecord = (record: JsonRecord) => {
    setEditingRecord(record);
    setEditingText(safeStringify(record));
    setShowEditor(true);
  };

  const saveRecord = async () => {
    if (!selectedTable) return;

    try {
      setError("");

      const parsed = JSON.parse(editingText);

      const tableRef = (db as any).table(selectedTable.name);

      if (editingRecord) {
        const key =
          editingRecord[selectedTable.primaryKey] ??
          editingRecord.id;

        await tableRef.put({
          ...editingRecord,
          ...parsed,
        }, key);

        setNotice("Record updated.");
      } else {
        await tableRef.add(parsed);
        setNotice("Record created.");
      }

      setShowEditor(false);

      await openTable(selectedTable);
      await loadTables();
    } catch (err: any) {
      setError(err?.message || "Could not save record.");
    }
  };

  const deleteRecord = async (record: JsonRecord) => {
    if (!selectedTable) return;

    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this record permanently?");

    if (!confirmed) return;

    try {
      const tableRef = (db as any).table(selectedTable.name);

      const key =
        record[selectedTable.primaryKey] ??
        record.id;

      await tableRef.delete(key);

      setNotice("Record deleted.");

      await openTable(selectedTable);
      await loadTables();
    } catch (err: any) {
      setError(err?.message || "Could not delete record.");
    }
  };

  const bulkDelete = async () => {
    if (!selectedTable || !selectedIds.length) return;

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Delete ${selectedIds.length} selected records permanently?`
      );

    if (!confirmed) return;

    try {
      const tableRef = (db as any).table(selectedTable.name);

      await tableRef.bulkDelete(selectedIds);

      setSelectedIds([]);

      setNotice(`${selectedIds.length} records deleted.`);

      await openTable(selectedTable);
      await loadTables();
    } catch (err: any) {
      setError(err?.message || "Bulk delete failed.");
    }
  };

  const exportTable = async () => {
    if (!selectedTable) return;

    const tableRef = (db as any).table(selectedTable.name);

    const rows = await tableRef.toArray();

    downloadJson(`${selectedTable.name}.json`, rows);
  };

  const importJson = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!selectedTable) return;

    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const parsed = await readJsonFile(file);

      if (!Array.isArray(parsed)) {
        throw new Error("JSON file must contain an array.");
      }

      const tableRef = (db as any).table(selectedTable.name);

      await tableRef.bulkAdd(parsed);

      setNotice(`${parsed.length} records imported.`);

      await openTable(selectedTable);
      await loadTables();
    } catch (err: any) {
      setError(err?.message || "Import failed.");
    }
  };

  // ======================================================
  // CHARTS
  // ======================================================

  const chartData = tables.slice(0, 10).map((table) => ({
    label:
      table.name.length > 16
        ? `${table.name.slice(0, 16)}…`
        : table.name,
    value: table.count,
  }));

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main
        className="studio-page"
        style={{ "--studio-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>

        <section className="studio-loading">
          <div className="studio-spinner" />
          <h2>Loading Database Studio...</h2>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main
        className="studio-page"
        style={{ "--studio-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>

        <section className="studio-loading">
          <h2>Developer authentication required.</h2>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main
      className="studio-page"
      style={{ "--studio-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="studio-hero">
        <div>
          <span className="studio-eyebrow">
            CRUD DATABASE MANAGER
          </span>

          <h1>Database Studio</h1>

          <p>
            Add, edit, delete, inspect, import and export local
            PWA database records with a mobile-first developer
            interface.
          </p>
        </div>

        <div className="studio-hero-actions">
          <button
            type="button"
            className="studio-white-btn"
            onClick={createRecord}
          >
            + New Record
          </button>

          <button
            type="button"
            className="studio-glass-btn"
            onClick={() => navigate?.("databaseTools")}
          >
            Back To Tools
          </button>

          <button
            type="button"
            className="studio-glass-btn"
            onClick={() => navigate?.("sqlConsole")}
          >
            SQL Console
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section
          className={`studio-alert ${
            error ? "error" : "success"
          }`}
        >
          {error || notice}
        </section>
      )}

      <section className="studio-grid">
        {/* SIDEBAR */}
        <aside className="studio-sidebar">
          <div className="studio-side-head">
            <h2>Tables</h2>

            <span>{tables.length}</span>
          </div>

          <div className="studio-table-list">
            {tables.map((table) => (
              <button
                key={table.name}
                type="button"
                className={`studio-table-item ${
                  selectedTable?.name === table.name
                    ? "active"
                    : ""
                }`}
                onClick={() => openTable(table)}
              >
                <div>
                  <strong>{table.name}</strong>
                  <small>
                    {compact(table.count)} records
                  </small>
                </div>

                <Chip tone={inferTone(table.count)}>
                  {table.count}
                </Chip>
              </button>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <section className="studio-main">
          {/* TOOLBAR */}
          <section className="studio-toolbar">
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search records..."
            />

            <div className="studio-switch">
              <button
                type="button"
                className={
                  viewMode === "cards" ? "active" : ""
                }
                onClick={() => setViewMode("cards")}
              >
                Cards
              </button>

              <button
                type="button"
                className={
                  viewMode === "table" ? "active" : ""
                }
                onClick={() => setViewMode("table")}
              >
                Table
              </button>
            </div>

            <button
              type="button"
              onClick={exportTable}
            >
              Export
            </button>

            <label className="studio-import">
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={importJson}
              />
            </label>

            {!!selectedIds.length && (
              <button
                type="button"
                className="danger"
                onClick={bulkDelete}
              >
                Delete Selected
              </button>
            )}
          </section>

          {/* CHART */}
          <section className="studio-chart-card">
            <h2>Largest Tables</h2>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />

                <Tooltip />

                <Bar
                  dataKey="value"
                  fill="var(--studio-primary)"
                  radius={[12, 12, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* SCHEMA */}
          {selectedTable && (
            <section className="studio-schema-card">
              <div>
                <h2>{selectedTable.name}</h2>

                <p>
                  Primary Key:{" "}
                  {selectedTable.primaryKey}
                </p>
              </div>

              <div className="studio-indexes">
                {selectedTable.indexes.map((index) => (
                  <span key={index}>{index}</span>
                ))}
              </div>
            </section>
          )}

          {/* RECORDS */}
          {viewMode === "cards" ? (
            <section className="studio-card-grid">
              {pageRecords.map((record, index) => {
                const key =
                  record?.[
                    selectedTable?.primaryKey || "id"
                  ] ?? record.id ?? index;

                const selected =
                  selectedIds.includes(key);

                return (
                  <article
                    key={key}
                    className="studio-record-card"
                  >
                    <div className="studio-record-head">
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedIds((prev) => [
                                ...prev,
                                key,
                              ]);
                            } else {
                              setSelectedIds((prev) =>
                                prev.filter(
                                  (item) => item !== key
                                )
                              );
                            }
                          }}
                        />
                      </label>

                      <div className="studio-record-actions">
                        <button
                          type="button"
                          onClick={() =>
                            editRecord(record)
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            deleteRecord(record)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <pre>
                      {safeStringify(record)}
                    </pre>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="studio-table-card">
              <div className="studio-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Record</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pageRecords.map(
                      (record, index) => {
                        const key =
                          record?.[
                            selectedTable?.primaryKey ||
                              "id"
                          ] ??
                          record.id ??
                          index;

                        const selected =
                          selectedIds.includes(key);

                        return (
                          <tr key={key}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(
                                  event
                                ) => {
                                  if (
                                    event.target.checked
                                  ) {
                                    setSelectedIds(
                                      (prev) => [
                                        ...prev,
                                        key,
                                      ]
                                    );
                                  } else {
                                    setSelectedIds(
                                      (prev) =>
                                        prev.filter(
                                          (item) =>
                                            item !==
                                            key
                                        )
                                    );
                                  }
                                }}
                              />
                            </td>

                            <td>
                              <pre>
                                {safeStringify(
                                  record
                                )}
                              </pre>
                            </td>

                            <td>
                              <div className="studio-table-actions">
                                <button
                                  type="button"
                                  onClick={() =>
                                    editRecord(
                                      record
                                    )
                                  }
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() =>
                                    deleteRecord(
                                      record
                                    )
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* PAGINATION */}
          <section className="studio-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((prev) => prev - 1)
              }
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((prev) => prev + 1)
              }
            >
              Next
            </button>
          </section>
        </section>
      </section>

      {/* EDITOR */}
      {showEditor && (
        <div
          className="studio-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <section className="studio-modal">
            <div className="studio-modal-head">
              <div>
                <h2>
                  {editingRecord
                    ? "Edit Record"
                    : "New Record"}
                </h2>

                <p>
                  Modify JSON directly and save to the
                  selected table.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowEditor(false)
                }
              >
                ✕
              </button>
            </div>

            <textarea
              value={editingText}
              onChange={(event) =>
                setEditingText(event.target.value)
              }
            />

            <div className="studio-modal-actions">
              <button
                type="button"
                onClick={saveRecord}
              >
                Save Record
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowEditor(false)
                }
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`studio-chip ${tone}`}>
      {children}
    </span>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes studioSpin {
  to {
    transform: rotate(360deg);
  }
}

.studio-page {
  min-height: 100dvh;
  padding: 10px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--studio-primary) 10%, transparent), transparent 32rem),
    #f8fafc;
  color: #0f172a;
  overflow-x: hidden;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.studio-page *,
.studio-page *::before,
.studio-page *::after {
  box-sizing: border-box;
}

.studio-loading {
  min-height: 60dvh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
}

.studio-spinner {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 4px solid rgba(148,163,184,.2);
  border-top-color: var(--studio-primary);
  animation: studioSpin .7s linear infinite;
}

.studio-hero {
  display: grid;
  gap: 14px;
  border-radius: 30px;
  padding: 20px;
  color: #fff;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,.15), transparent 20rem),
    linear-gradient(135deg, var(--studio-primary), #0f172a 70%);
  box-shadow: 0 24px 70px rgba(15,23,42,.18);
}

.studio-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: .14em;
  opacity: .8;
}

.studio-hero h1 {
  margin: 10px 0 0;
  font-size: clamp(30px, 8vw, 48px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.08em;
}

.studio-hero p {
  margin: 10px 0 0;
  max-width: 800px;
  font-size: 13px;
  line-height: 1.6;
  opacity: .92;
}

.studio-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-white-btn,
.studio-glass-btn {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.studio-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.studio-glass-btn {
  border: 1px solid rgba(255,255,255,.25);
  background: rgba(255,255,255,.12);
  color: #fff;
}

.studio-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 900;
}

.studio-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.studio-alert.success {
  background: #dcfce7;
  color: #166534;
}

.studio-grid {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.studio-sidebar,
.studio-main {
  min-width: 0;
}

.studio-sidebar {
  border-radius: 28px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.2);
  box-shadow: 0 18px 45px rgba(15,23,42,.05);
  overflow: hidden;
}

.studio-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(148,163,184,.14);
}

.studio-side-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.studio-side-head span {
  display: inline-flex;
  min-height: 28px;
  padding: 0 10px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eff6ff;
  color: var(--studio-primary);
  font-size: 11px;
  font-weight: 1000;
}

.studio-table-list {
  display: grid;
}

.studio-table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid rgba(148,163,184,.12);
  background: transparent;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
}

.studio-table-item.active {
  background: color-mix(in srgb, var(--studio-primary) 8%, white);
}

.studio-table-item strong {
  display: block;
  font-size: 13px;
  font-weight: 1000;
}

.studio-table-item small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.studio-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 1000;
}

.studio-chip.green {
  background: #dcfce7;
  color: #166534;
}

.studio-chip.blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.studio-chip.purple {
  background: #f3e8ff;
  color: #7e22ce;
}

.studio-chip.orange {
  background: #ffedd5;
  color: #c2410c;
}

.studio-chip.red {
  background: #fee2e2;
  color: #b91c1c;
}

.studio-chip.gray {
  background: #f1f5f9;
  color: #475569;
}

.studio-main {
  display: grid;
  gap: 10px;
}

.studio-toolbar,
.studio-chart-card,
.studio-schema-card,
.studio-table-card {
  border-radius: 28px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.2);
  box-shadow: 0 18px 45px rgba(15,23,42,.05);
}

.studio-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.studio-toolbar input {
  flex: 1 1 240px;
  min-height: 42px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,.28);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.studio-toolbar button,
.studio-import {
  min-height: 42px;
  border-radius: 16px;
  border: 0;
  padding: 0 14px;
  background: color-mix(in srgb, var(--studio-primary) 10%, white);
  color: var(--studio-primary);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.studio-toolbar .danger {
  background: #fee2e2;
  color: #b91c1c;
}

.studio-import input {
  display: none;
}

.studio-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: #f1f5f9;
}

.studio-switch button {
  background: transparent;
}

.studio-switch button.active {
  background: #fff;
  box-shadow: 0 8px 20px rgba(15,23,42,.08);
}

.studio-chart-card,
.studio-schema-card {
  padding: 16px;
}

.studio-chart-card h2,
.studio-schema-card h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.studio-schema-card p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

.studio-indexes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.studio-indexes span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(148,163,184,.18);
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}

.studio-card-grid {
  display: grid;
  gap: 10px;
}

.studio-record-card {
  border-radius: 26px;
  background: #fff;
  border: 1px solid rgba(148,163,184,.2);
  box-shadow: 0 18px 45px rgba(15,23,42,.05);
  overflow: hidden;
}

.studio-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid rgba(148,163,184,.14);
}

.studio-record-actions,
.studio-table-actions,
.studio-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-record-actions button,
.studio-table-actions button,
.studio-modal-actions button {
  min-height: 34px;
  border-radius: 999px;
  border: 0;
  padding: 0 12px;
  background: color-mix(in srgb, var(--studio-primary) 10%, white);
  color: var(--studio-primary);
  font-size: 11px;
  font-weight: 1000;
  cursor: pointer;
}

.studio-record-actions .danger,
.studio-table-actions .danger {
  background: #fee2e2;
  color: #b91c1c;
}

.studio-record-card pre,
.studio-table-wrap pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  background: #0f172a;
  color: #e5e7eb;
}

.studio-table-card {
  overflow: hidden;
}

.studio-table-wrap {
  overflow-x: auto;
}

.studio-table-wrap table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
}

.studio-table-wrap th {
  text-align: left;
  padding: 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748b;
  border-bottom: 1px solid rgba(148,163,184,.14);
}

.studio-table-wrap td {
  padding: 12px;
  vertical-align: top;
  border-bottom: 1px solid rgba(148,163,184,.12);
}

.studio-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
}

.studio-pagination button {
  min-height: 40px;
  border-radius: 999px;
  border: 0;
  padding: 0 14px;
  background: var(--studio-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.studio-pagination button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.studio-pagination span {
  font-size: 12px;
  font-weight: 900;
  color: #475569;
}

.studio-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 12px;
  background: rgba(15,23,42,.6);
  backdrop-filter: blur(12px);
}

.studio-modal {
  width: min(980px, 100%);
  max-height: 92dvh;
  overflow: auto;
  border-radius: 30px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 30px 100px rgba(15,23,42,.35);
}

.studio-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.studio-modal-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
}

.studio-modal-head p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
}

.studio-modal-head button {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 0;
  background: #f1f5f9;
  cursor: pointer;
}

.studio-modal textarea {
  width: 100%;
  min-height: 420px;
  margin-top: 16px;
  border-radius: 24px;
  border: 1px solid rgba(148,163,184,.22);
  padding: 14px;
  resize: vertical;
  font-size: 12px;
  line-height: 1.6;
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
}

.studio-modal-actions {
  margin-top: 14px;
}

@media (min-width: 920px) {
  .studio-grid {
    grid-template-columns: 320px 1fr;
    align-items: start;
  }

  .studio-card-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }
}

@media (min-width: 1280px) {
  .studio-card-grid {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }
}
`;