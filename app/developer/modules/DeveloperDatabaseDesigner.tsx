"use client";

/**
 * app/developer/modules/DeveloperDatabaseDesigner.tsx
 * ---------------------------------------------------------
 * DEVELOPER DATABASE DESIGNER
 * ---------------------------------------------------------
 * Safe low-code database table/schema designer for Eleeveon.
 *
 * Important:
 * IndexedDB/Dexie tables should NOT be created casually at runtime
 * inside a production PWA because schema changes require a Dexie
 * version upgrade and database re-open. Doing it carelessly can corrupt
 * local data or break offline sync.
 *
 * This module therefore does the professional safe approach:
 * - Design new table blueprints.
 * - Define fields, field types, primary key and indexes.
 * - Mark table as syncable.
 * - Generate Dexie schema line.
 * - Generate migration/code notes.
 * - Save blueprint metadata locally.
 * - Export blueprints as JSON.
 * - Optionally copy generated code.
 *
 * The actual Dexie db.ts upgrade should then be applied by you or by
 * a controlled backend/build migration process.
 *
 * Future backend endpoints, when available:
 * GET    /developer/database-designs
 * POST   /developer/database-designs
 * PATCH  /developer/database-designs/:id
 * DELETE /developer/database-designs/:id
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

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "timestamp"
  | "json"
  | "array"
  | "email"
  | "phone"
  | "currency"
  | "enum";

type TableStatus = "draft" | "ready" | "applied" | "archived";

type FieldDesign = {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  indexed: boolean;
  unique: boolean;
  defaultValue?: string;
  enumValues?: string;
  description?: string;
};

type TableDesign = {
  id: string;
  tableName: string;
  displayName: string;
  description: string;
  status: TableStatus;
  primaryKey: string;
  autoIncrement: boolean;
  syncEnabled: boolean;
  softDelete: boolean;
  timestamps: boolean;
  accountScoped: boolean;
  schoolScoped: boolean;
  branchScoped: boolean;
  fields: FieldDesign[];
  createdAt: number;
  updatedAt: number;
};

type TableForm = Omit<TableDesign, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

type ChartRow = {
  label: string;
  value: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const STORAGE_KEY = "eleeveon_developer_database_designs";

const FIELD_TYPES: FieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "timestamp",
  "json",
  "array",
  "email",
  "phone",
  "currency",
  "enum",
];

const DEFAULT_FIELD = (): FieldDesign => ({
  id: `field-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  type: "string",
  required: false,
  indexed: false,
  unique: false,
  defaultValue: "",
  enumValues: "",
  description: "",
});

const EMPTY_FORM: TableForm = {
  tableName: "",
  displayName: "",
  description: "",
  status: "draft",
  primaryKey: "++id",
  autoIncrement: true,
  syncEnabled: true,
  softDelete: true,
  timestamps: true,
  accountScoped: true,
  schoolScoped: false,
  branchScoped: false,
  fields: [
    {
      id: "field-name",
      name: "name",
      type: "string",
      required: true,
      indexed: true,
      unique: false,
      defaultValue: "",
      enumValues: "",
      description: "Human readable name.",
    },
  ],
};

const chartColors = [
  "var(--designer-primary)",
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

const slugifyTable = (value: string) =>
  value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeFieldName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

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

const statusTone = (status: TableStatus): Tone => {
  if (status === "applied") return "green";
  if (status === "ready") return "blue";
  if (status === "draft") return "orange";
  if (status === "archived") return "gray";
  return "gray";
};

const fieldTone = (type: FieldType): Tone => {
  if (["email", "phone", "string", "enum"].includes(type)) return "blue";
  if (["number", "currency"].includes(type)) return "green";
  if (["date", "timestamp"].includes(type)) return "purple";
  if (["json", "array"].includes(type)) return "orange";
  if (type === "boolean") return "gray";
  return "gray";
};

const loadLocalDesigns = (): TableDesign[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return toArray<TableDesign>(JSON.parse(raw), ["designs", "tables"]);
  } catch {
    return [];
  }
};

const saveLocalDesigns = (designs: TableDesign[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
  } catch {
    // ignore local storage issue
  }
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

const copyText = async (text: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const formToDesign = (form: TableForm): TableDesign => {
  const now = Date.now();

  return {
    id: form.id || `table-design-${now}`,
    tableName: slugifyTable(form.tableName),
    displayName: form.displayName.trim() || titleCase(form.tableName),
    description: form.description.trim(),
    status: form.status,
    primaryKey: form.primaryKey.trim() || "++id",
    autoIncrement: form.autoIncrement,
    syncEnabled: form.syncEnabled,
    softDelete: form.softDelete,
    timestamps: form.timestamps,
    accountScoped: form.accountScoped,
    schoolScoped: form.schoolScoped,
    branchScoped: form.branchScoped,
    fields: form.fields.map((field) => ({
      ...field,
      name: normalizeFieldName(field.name),
    })),
    createdAt: now,
    updatedAt: now,
  };
};

const designToForm = (design: TableDesign): TableForm => ({
  id: design.id,
  tableName: design.tableName,
  displayName: design.displayName,
  description: design.description,
  status: design.status,
  primaryKey: design.primaryKey,
  autoIncrement: design.autoIncrement,
  syncEnabled: design.syncEnabled,
  softDelete: design.softDelete,
  timestamps: design.timestamps,
  accountScoped: design.accountScoped,
  schoolScoped: design.schoolScoped,
  branchScoped: design.branchScoped,
  fields: design.fields,
});

const getSystemFields = (design: Pick<TableDesign, "syncEnabled" | "softDelete" | "timestamps" | "accountScoped" | "schoolScoped" | "branchScoped">) => {
  const fields: string[] = [];

  if (design.accountScoped) fields.push("accountId");
  if (design.schoolScoped) fields.push("schoolId");
  if (design.branchScoped) fields.push("branchId");

  if (design.timestamps) {
    fields.push("createdAt", "updatedAt");
  }

  if (design.syncEnabled) {
    fields.push("cloudId", "version", "synced", "deviceId");
  }

  if (design.softDelete) fields.push("isDeleted");

  return fields;
};

const generateDexieSchemaLine = (design: TableDesign) => {
  const primary = design.primaryKey || "++id";

  const fieldIndexes = design.fields
    .filter((field) => field.indexed || field.unique)
    .map((field) => `${field.unique ? "&" : ""}${field.name}`);

  const systemIndexes = getSystemFields(design).filter((field) =>
    ["accountId", "schoolId", "branchId", "cloudId", "updatedAt", "synced", "isDeleted"].includes(field)
  );

  const allParts = Array.from(new Set([primary, ...systemIndexes, ...fieldIndexes])).filter(Boolean);

  return `${design.tableName}: "${allParts.join(", ")}"`;
};

const generateDexieUpgradeCode = (design: TableDesign) => {
  const schemaLine = generateDexieSchemaLine(design);

  return `/**
 * Add this table to app/lib/db.ts inside a NEW db.version(n).stores({ ... }) block.
 * Do not edit an already-shipped Dexie version in production.
 */

db.version(NEXT_VERSION_NUMBER).stores({
  ${schemaLine},
});

/**
 * Suggested TypeScript type
 */
export type ${titleCase(design.tableName).replace(/\s/g, "")} = {
  id?: number;
${getSystemFields(design)
  .map((field) => `  ${field}?: ${field.endsWith("Id") || field === "cloudId" || field === "deviceId" ? "string | number" : field === "isDeleted" ? "boolean" : "number | string"};`)
  .join("\n")}
${design.fields
  .map((field) => {
    const optional = field.required ? "" : "?";
    const type =
      field.type === "number" || field.type === "currency"
        ? "number"
        : field.type === "boolean"
          ? "boolean"
          : field.type === "json"
            ? "Record<string, any>"
            : field.type === "array"
              ? "any[]"
              : field.type === "timestamp"
                ? "number"
                : "string";

    return `  ${field.name}${optional}: ${type};`;
  })
  .join("\n")}
};`;
};

const validateDesign = (form: TableForm) => {
  const errors: string[] = [];

  if (!slugifyTable(form.tableName)) {
    errors.push("Table name is required.");
  }

  if (!form.primaryKey.trim()) {
    errors.push("Primary key is required.");
  }

  const names = form.fields.map((field) => normalizeFieldName(field.name)).filter(Boolean);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length) {
    errors.push(`Duplicate field name(s): ${Array.from(new Set(duplicates)).join(", ")}`);
  }

  form.fields.forEach((field, index) => {
    if (!normalizeFieldName(field.name)) {
      errors.push(`Field ${index + 1} needs a valid name.`);
    }

    if (field.type === "enum" && !field.enumValues?.trim()) {
      errors.push(`Enum field "${field.name || index + 1}" needs values.`);
    }
  });

  return errors;
};

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperDatabaseDesigner({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "#2563eb";

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [designs, setDesigns] = useState<TableDesign[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [previewDesign, setPreviewDesign] = useState<TableDesign | null>(null);
  const [form, setForm] = useState<TableForm>(EMPTY_FORM);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ======================================================
  // LOAD
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiClient<any>("/developer/database-designs").catch(() => null);
      const apiDesigns = toArray<TableDesign>(response, ["designs", "tables", "databaseDesigns"]);

      if (apiDesigns.length) {
        setDesigns(apiDesigns);
        saveLocalDesigns(apiDesigns);
      } else {
        setDesigns(loadLocalDesigns());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load database designs. Showing local saved designs.");
      setDesigns(loadLocalDesigns());
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

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  // ======================================================
  // DERIVED
  // ======================================================

  const filteredDesigns = useMemo(() => {
    const term = query.trim().toLowerCase();

    return designs
      .filter((design) => {
        const haystack = `${design.tableName} ${design.displayName} ${design.description} ${design.fields
          .map((field) => field.name)
          .join(" ")}`.toLowerCase();

        const searchOk = !term || haystack.includes(term);
        const statusOk = statusFilter === "all" || design.status === statusFilter;

        return searchOk && statusOk;
      })
      .sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt));
  }, [designs, query, statusFilter]);

  const readyCount = designs.filter((design) => design.status === "ready").length;
  const appliedCount = designs.filter((design) => design.status === "applied").length;
  const syncCount = designs.filter((design) => design.syncEnabled).length;
  const totalFields = designs.reduce((sum, design) => sum + design.fields.length, 0);

  const statusChart = useMemo<ChartRow[]>(
    () => countBy(designs, (design) => design.status),
    [designs]
  );

  const scopeChart = useMemo<ChartRow[]>(() => {
    return [
      { label: "Account Scoped", value: designs.filter((design) => design.accountScoped).length },
      { label: "School Scoped", value: designs.filter((design) => design.schoolScoped).length },
      { label: "Branch Scoped", value: designs.filter((design) => design.branchScoped).length },
      { label: "Sync Enabled", value: designs.filter((design) => design.syncEnabled).length },
    ];
  }, [designs]);

  const fieldTypeChart = useMemo<ChartRow[]>(() => {
    const fields = designs.flatMap((design) => design.fields);
    return countBy(fields, (field) => field.type);
  }, [designs]);

  const tableSizeChart = useMemo<ChartRow[]>(
    () =>
      designs.map((design) => ({
        label: design.tableName.length > 16 ? `${design.tableName.slice(0, 16)}…` : design.tableName,
        value: design.fields.length,
      })),
    [designs]
  );

  // ======================================================
  // FORM ACTIONS
  // ======================================================

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm({
      ...EMPTY_FORM,
      fields: EMPTY_FORM.fields.map((field) => ({ ...field, id: `field-${Date.now()}` })),
    });
    setModalOpen(true);
  };

  const openEdit = (design: TableDesign) => {
    setError("");
    setNotice("");
    setForm(designToForm(design));
    setModalOpen(true);
  };

  const updateForm = <K extends keyof TableForm>(key: K, value: TableForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "tableName" && !current.displayName
        ? { displayName: titleCase(String(value)) }
        : {}),
    }));
  };

  const updateField = <K extends keyof FieldDesign>(
    fieldId: string,
    key: K,
    value: FieldDesign[K]
  ) => {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              [key]: key === "name" ? normalizeFieldName(String(value)) : value,
            }
          : field
      ),
    }));
  };

  const addField = () => {
    setForm((current) => ({
      ...current,
      fields: [...current.fields, DEFAULT_FIELD()],
    }));
  };

  const removeField = (fieldId: string) => {
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  };

  const saveDesign = async (event: React.FormEvent) => {
    event.preventDefault();

    const errors = validateDesign(form);

    if (errors.length) {
      setError(errors.join(" "));
      return;
    }

    try {
      setError("");
      setNotice("");

      const nextDesign = formToDesign(form);

      if (form.id) {
        await apiClient<any>(`/developer/database-designs/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(nextDesign),
        }).catch(() => null);

        setDesigns((current) => {
          const next = current.map((design) =>
            design.id === form.id
              ? {
                  ...nextDesign,
                  id: form.id,
                  createdAt: design.createdAt,
                  updatedAt: Date.now(),
                }
              : design
          );

          saveLocalDesigns(next);
          return next;
        });

        setNotice("Table design updated.");
      } else {
        await apiClient<any>("/developer/database-designs", {
          method: "POST",
          body: JSON.stringify(nextDesign),
        }).catch(() => null);

        setDesigns((current) => {
          const next = [nextDesign, ...current];
          saveLocalDesigns(next);
          return next;
        });

        setNotice("Table design saved.");
      }

      setModalOpen(false);
    } catch (err: any) {
      setError(err?.message || "Could not save table design.");
    }
  };

  const changeStatus = async (design: TableDesign, status: TableStatus) => {
    const updated = {
      ...design,
      status,
      updatedAt: Date.now(),
    };

    await apiClient<any>(`/developer/database-designs/${design.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => null);

    setDesigns((current) => {
      const next = current.map((item) => (item.id === design.id ? updated : item));
      saveLocalDesigns(next);
      return next;
    });

    setNotice(`Design marked as ${status}.`);
  };

  const deleteDesign = (design: TableDesign) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete the table design "${design.displayName || design.tableName}"?`);

    if (!confirmed) return;

    setDesigns((current) => {
      const next = current.filter((item) => item.id !== design.id);
      saveLocalDesigns(next);
      return next;
    });

    setNotice("Table design deleted locally.");
  };

  const exportDesign = (design: TableDesign) => {
    downloadJson(`${design.tableName}-table-design.json`, design);
    setNotice("Table design exported.");
  };

  const exportAllDesigns = () => {
    downloadJson("eleeveon-database-designs.json", {
      exportedAt: new Date().toISOString(),
      designs,
    });
    setNotice("All database designs exported.");
  };

  const copySchema = async (design: TableDesign) => {
    const ok = await copyText(generateDexieUpgradeCode(design));
    setNotice(ok ? "Generated Dexie code copied." : "Could not copy code in this browser.");
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main
        className="designer-page"
        style={{ "--designer-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>

        <section className="designer-state">
          <div className="designer-spinner" />
          <h2>Loading Database Designer...</h2>
          <p>Preparing table blueprints, fields and schema generation.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main
        className="designer-page"
        style={{ "--designer-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>

        <section className="designer-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to design database tables.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main
      className="designer-page"
      style={{ "--designer-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="designer-hero">
        <div>
          <span className="designer-eyebrow">Schema designer</span>
          <h1>Database Designer</h1>
          <p>
            Create safe table blueprints, define fields and indexes, then generate Dexie migration
            code. This avoids dangerous runtime schema changes while still giving you a professional
            low-code database design workflow.
          </p>
        </div>

        <div className="designer-hero-actions">
          <div className="designer-switch">
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

          <button type="button" className="designer-white-btn" onClick={openCreate}>
            New Table Design
          </button>

          <button type="button" className="designer-glass-btn" onClick={exportAllDesigns}>
            Export All
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`designer-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="designer-stat-grid">
        <StatCard label="Designs" value={designs.length} detail={`${filteredDesigns.length} shown`} icon="🧱" />
        <StatCard label="Ready" value={readyCount} detail={`${appliedCount} applied`} icon="✅" />
        <StatCard label="Syncable" value={syncCount} detail="Offline-first tables" icon="🔄" />
        <StatCard label="Fields" value={totalFields} detail="Designed data fields" icon="🧩" />
      </section>

      <section className="designer-tool-links">
        <button type="button" onClick={() => navigate?.("databaseTools")}>
          🗄️ Database Tools
          <span>Inspect existing local and server tables.</span>
        </button>

        <button type="button" onClick={() => navigate?.("databaseStudio")}>
          🧾 Database Studio
          <span>Manage records in existing tables.</span>
        </button>

        <button type="button" onClick={() => navigate?.("sqlConsole")}>
          🧪 SQL Console
          <span>Protected server-side SQL actions.</span>
        </button>
      </section>

      <section className="designer-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search table name, display name, fields..."
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="applied">Applied</option>
          <option value="archived">Archived</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
          }}
        >
          Reset
        </button>
      </section>

      {viewMode === "analytics" ? (
        <AnalyticsView
          statusChart={statusChart}
          scopeChart={scopeChart}
          fieldTypeChart={fieldTypeChart}
          tableSizeChart={tableSizeChart}
        />
      ) : viewMode === "table" ? (
        <TableView
          designs={filteredDesigns}
          onEdit={openEdit}
          onPreview={setPreviewDesign}
          onCopy={copySchema}
          onExport={exportDesign}
          onDelete={deleteDesign}
          onStatus={changeStatus}
        />
      ) : (
        <CardsView
          designs={filteredDesigns}
          onEdit={openEdit}
          onPreview={setPreviewDesign}
          onCopy={copySchema}
          onExport={exportDesign}
          onDelete={deleteDesign}
          onStatus={changeStatus}
        />
      )}

      {modalOpen && (
        <DesignModal
          form={form}
          updateForm={updateForm}
          updateField={updateField}
          addField={addField}
          removeField={removeField}
          onClose={() => setModalOpen(false)}
          onSubmit={saveDesign}
        />
      )}

      {previewDesign && (
        <PreviewModal
          design={previewDesign}
          onClose={() => setPreviewDesign(null)}
          onCopy={copySchema}
          onExport={exportDesign}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  designs,
  onEdit,
  onPreview,
  onCopy,
  onExport,
  onDelete,
  onStatus,
}: {
  designs: TableDesign[];
  onEdit: (design: TableDesign) => void;
  onPreview: (design: TableDesign) => void;
  onCopy: (design: TableDesign) => void;
  onExport: (design: TableDesign) => void;
  onDelete: (design: TableDesign) => void;
  onStatus: (design: TableDesign, status: TableStatus) => void;
}) {
  return (
    <section className="designer-card-grid">
      {designs.map((design) => (
        <article key={design.id} className="designer-card">
          <div className="designer-card-top">
            <span className="designer-avatar">🧱</span>

            <div className="designer-chip-row">
              <Chip tone={statusTone(design.status)}>{design.status}</Chip>
              {design.syncEnabled && <Chip tone="blue">sync</Chip>}
            </div>
          </div>

          <h2>{design.displayName || design.tableName}</h2>
          <p>{design.description || "No description added."}</p>

          <code className="designer-code">{generateDexieSchemaLine(design)}</code>

          <div className="designer-mini-grid">
            <span>
              <b>Table</b>
              {design.tableName}
            </span>
            <span>
              <b>Primary Key</b>
              {design.primaryKey}
            </span>
            <span>
              <b>Fields</b>
              {design.fields.length}
            </span>
            <span>
              <b>System Fields</b>
              {getSystemFields(design).length}
            </span>
            <span>
              <b>Indexes</b>
              {design.fields.filter((field) => field.indexed || field.unique).length}
            </span>
            <span>
              <b>Updated</b>
              {dateText(design.updatedAt)}
            </span>
          </div>

          <div className="designer-field-pills">
            {design.fields.slice(0, 6).map((field) => (
              <span key={field.id}>{field.name}: {field.type}</span>
            ))}
            {design.fields.length > 6 && <span>+{design.fields.length - 6} fields</span>}
          </div>

          <div className="designer-actions">
            <button type="button" onClick={() => onEdit(design)}>
              Edit
            </button>
            <button type="button" onClick={() => onPreview(design)}>
              Preview
            </button>
            <button type="button" onClick={() => onCopy(design)}>
              Copy Code
            </button>
            <button type="button" onClick={() => onExport(design)}>
              Export
            </button>
            {design.status !== "ready" && (
              <button type="button" onClick={() => onStatus(design, "ready")}>
                Mark Ready
              </button>
            )}
            {design.status !== "applied" && (
              <button type="button" onClick={() => onStatus(design, "applied")}>
                Mark Applied
              </button>
            )}
            <button type="button" className="danger" onClick={() => onDelete(design)}>
              Delete
            </button>
          </div>
        </article>
      ))}

      {!designs.length && <Empty text="No table designs match your filters." />}
    </section>
  );
}

function TableView({
  designs,
  onEdit,
  onPreview,
  onCopy,
  onExport,
  onDelete,
  onStatus,
}: {
  designs: TableDesign[];
  onEdit: (design: TableDesign) => void;
  onPreview: (design: TableDesign) => void;
  onCopy: (design: TableDesign) => void;
  onExport: (design: TableDesign) => void;
  onDelete: (design: TableDesign) => void;
  onStatus: (design: TableDesign, status: TableStatus) => void;
}) {
  return (
    <section className="designer-table-card">
      <div className="designer-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Status</th>
              <th>Primary Key</th>
              <th>Fields</th>
              <th>Scopes</th>
              <th>Sync</th>
              <th>Schema</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {designs.map((design) => (
              <tr key={design.id}>
                <td>
                  <strong>{design.displayName}</strong>
                  <small>{design.tableName}</small>
                </td>
                <td>
                  <Chip tone={statusTone(design.status)}>{design.status}</Chip>
                </td>
                <td>{design.primaryKey}</td>
                <td>{design.fields.length}</td>
                <td>
                  {[
                    design.accountScoped ? "account" : "",
                    design.schoolScoped ? "school" : "",
                    design.branchScoped ? "branch" : "",
                  ]
                    .filter(Boolean)
                    .join(", ") || "global"}
                </td>
                <td>{design.syncEnabled ? "Yes" : "No"}</td>
                <td>
                  <code>{generateDexieSchemaLine(design)}</code>
                </td>
                <td>{dateText(design.updatedAt)}</td>
                <td>
                  <div className="designer-table-actions">
                    <button type="button" onClick={() => onEdit(design)}>Edit</button>
                    <button type="button" onClick={() => onPreview(design)}>Preview</button>
                    <button type="button" onClick={() => onCopy(design)}>Copy</button>
                    <button type="button" onClick={() => onExport(design)}>Export</button>
                    {design.status !== "ready" && (
                      <button type="button" onClick={() => onStatus(design, "ready")}>Ready</button>
                    )}
                    <button type="button" className="danger" onClick={() => onDelete(design)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!designs.length && <Empty text="No table designs match your filters." />}
    </section>
  );
}

function AnalyticsView({
  statusChart,
  scopeChart,
  fieldTypeChart,
  tableSizeChart,
}: {
  statusChart: ChartRow[];
  scopeChart: ChartRow[];
  fieldTypeChart: ChartRow[];
  tableSizeChart: ChartRow[];
}) {
  return (
    <section className="designer-chart-grid">
      <ChartCard title="Design Status" description="Draft, ready, applied and archived table designs.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={statusChart} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {statusChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={statusChart} />
      </ChartCard>

      <ChartCard title="Scopes & Sync" description="How new tables are designed for tenancy and offline sync.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={scopeChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--designer-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Field Types" description="Field type distribution across all designs.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={fieldTypeChart} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {fieldTypeChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={fieldTypeChart} />
      </ChartCard>

      <ChartCard title="Fields Per Table" description="Table complexity by number of custom fields.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={tableSizeChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--designer-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ======================================================
// MODALS
// ======================================================

function DesignModal({
  form,
  updateForm,
  updateField,
  addField,
  removeField,
  onClose,
  onSubmit,
}: {
  form: TableForm;
  updateForm: <K extends keyof TableForm>(key: K, value: TableForm[K]) => void;
  updateField: <K extends keyof FieldDesign>(fieldId: string, key: K, value: FieldDesign[K]) => void;
  addField: () => void;
  removeField: (fieldId: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const tempDesign = formToDesign({
    ...form,
    tableName: form.tableName || "new_table",
  });

  return (
    <div className="designer-modal-backdrop" role="dialog" aria-modal="true">
      <form className="designer-modal" onSubmit={onSubmit}>
        <div className="designer-modal-head">
          <div>
            <h2>{form.id ? "Edit Table Design" : "Create Table Design"}</h2>
            <p>Define the table blueprint and generate safe Dexie migration code.</p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <section className="designer-form-grid">
          <label>
            Table name
            <input
              value={form.tableName}
              onChange={(event) => updateForm("tableName", slugifyTable(event.target.value))}
              placeholder="student_notes"
              required
            />
          </label>

          <label>
            Display name
            <input
              value={form.displayName}
              onChange={(event) => updateForm("displayName", event.target.value)}
              placeholder="Student Notes"
            />
          </label>

          <label>
            Primary key
            <input
              value={form.primaryKey}
              onChange={(event) => updateForm("primaryKey", event.target.value)}
              placeholder="++id"
              required
            />
          </label>

          <label>
            Status
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value as TableStatus)}>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="applied">Applied</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              rows={3}
              placeholder="What will this table store?"
            />
          </label>
        </section>

        <section className="designer-option-grid">
          <Toggle label="Auto Increment" checked={form.autoIncrement} onChange={(checked) => updateForm("autoIncrement", checked)} />
          <Toggle label="Sync Enabled" checked={form.syncEnabled} onChange={(checked) => updateForm("syncEnabled", checked)} />
          <Toggle label="Soft Delete" checked={form.softDelete} onChange={(checked) => updateForm("softDelete", checked)} />
          <Toggle label="Timestamps" checked={form.timestamps} onChange={(checked) => updateForm("timestamps", checked)} />
          <Toggle label="Account Scoped" checked={form.accountScoped} onChange={(checked) => updateForm("accountScoped", checked)} />
          <Toggle label="School Scoped" checked={form.schoolScoped} onChange={(checked) => updateForm("schoolScoped", checked)} />
          <Toggle label="Branch Scoped" checked={form.branchScoped} onChange={(checked) => updateForm("branchScoped", checked)} />
        </section>

        <section className="designer-fields-section">
          <div className="designer-section-head">
            <div>
              <h3>Fields</h3>
              <p>{form.fields.length} custom field(s). System fields are generated automatically.</p>
            </div>

            <button type="button" onClick={addField}>Add Field</button>
          </div>

          <div className="designer-field-list">
            {form.fields.map((field, index) => (
              <article key={field.id} className="designer-field-card">
                <div className="designer-field-head">
                  <span>Field {index + 1}</span>
                  <Chip tone={fieldTone(field.type)}>{field.type}</Chip>
                </div>

                <div className="designer-field-grid">
                  <label>
                    Name
                    <input
                      value={field.name}
                      onChange={(event) => updateField(field.id, "name", event.target.value)}
                      placeholder="studentId"
                      required
                    />
                  </label>

                  <label>
                    Type
                    <select value={field.type} onChange={(event) => updateField(field.id, "type", event.target.value as FieldType)}>
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Default value
                    <input
                      value={field.defaultValue || ""}
                      onChange={(event) => updateField(field.id, "defaultValue", event.target.value)}
                      placeholder="optional"
                    />
                  </label>

                  {field.type === "enum" && (
                    <label>
                      Enum values
                      <input
                        value={field.enumValues || ""}
                        onChange={(event) => updateField(field.id, "enumValues", event.target.value)}
                        placeholder="draft,active,archived"
                      />
                    </label>
                  )}

                  <label className="wide">
                    Description
                    <input
                      value={field.description || ""}
                      onChange={(event) => updateField(field.id, "description", event.target.value)}
                      placeholder="What does this field store?"
                    />
                  </label>
                </div>

                <div className="designer-field-options">
                  <Toggle label="Required" checked={field.required} onChange={(checked) => updateField(field.id, "required", checked)} />
                  <Toggle label="Indexed" checked={field.indexed} onChange={(checked) => updateField(field.id, "indexed", checked)} />
                  <Toggle label="Unique" checked={field.unique} onChange={(checked) => updateField(field.id, "unique", checked)} />

                  <button type="button" className="danger" onClick={() => removeField(field.id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="designer-preview-card">
          <h3>Generated Dexie Schema</h3>
          <code>{generateDexieSchemaLine(tempDesign)}</code>
          <p>This is preview code. Apply it through a proper db.ts version upgrade.</p>
        </section>

        <div className="designer-modal-actions">
          <button type="submit">Save Design</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function PreviewModal({
  design,
  onClose,
  onCopy,
  onExport,
}: {
  design: TableDesign;
  onClose: () => void;
  onCopy: (design: TableDesign) => void;
  onExport: (design: TableDesign) => void;
}) {
  return (
    <div className="designer-modal-backdrop" role="dialog" aria-modal="true">
      <section className="designer-modal">
        <div className="designer-modal-head">
          <div>
            <h2>{design.displayName}</h2>
            <p>{design.tableName} migration preview</p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <section className="designer-warning">
          <strong>Safe schema rule</strong>
          <p>
            Do not create production Dexie tables by directly mutating IndexedDB at runtime. Add
            this schema through a new Dexie version block in db.ts, then test migration carefully.
          </p>
        </section>

        <pre className="designer-code-block">{generateDexieUpgradeCode(design)}</pre>

        <div className="designer-modal-actions">
          <button type="button" onClick={() => onCopy(design)}>Copy Code</button>
          <button type="button" onClick={() => onExport(design)}>Export JSON</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
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
    <article className="designer-stat">
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
  return <span className={`designer-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="designer-empty">{text}</div>;
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
    <section className="designer-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="designer-legend">
      {rows.map((row, index) => (
        <span key={`${row.label}-${index}`}>
          <i style={{ background: chartColors[index % chartColors.length] }} />
          {row.label}: {row.value}
        </span>
      ))}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="designer-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes designerSpin { to { transform: rotate(360deg); } }

.designer-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--designer-primary) 10%, transparent), transparent 34rem),
    #f8fafc;
  color: #0f172a;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}

.designer-page *,
.designer-page *::before,
.designer-page *::after {
  box-sizing: border-box;
}

.designer-page button,
.designer-page input,
.designer-page select,
.designer-page textarea {
  font: inherit;
  max-width: 100%;
}

.designer-state {
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

.designer-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.designer-state p {
  max-width: 34rem;
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.designer-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--designer-primary) 18%, transparent);
  border-top-color: var(--designer-primary);
  animation: designerSpin .8s linear infinite;
}

.designer-hero {
  display: grid;
  gap: 16px;
  border-radius: 30px;
  padding: 18px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--designer-primary), #0f172a 72%);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  overflow: hidden;
}

.designer-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.designer-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.designer-hero p {
  max-width: 850px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.designer-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.designer-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.designer-switch button {
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

.designer-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.designer-white-btn,
.designer-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.designer-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.designer-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.designer-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.designer-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.designer-alert.success {
  background: #dcfce7;
  color: #166534;
}

.designer-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.designer-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.designer-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.designer-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.designer-stat small {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.designer-tool-links {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 10px;
}

.designer-tool-links button {
  display: grid;
  gap: 3px;
  text-align: left;
  min-height: 62px;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 22px;
  padding: 12px 14px;
  background: #fff;
  color: #0f172a;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .05);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.designer-tool-links span {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
}

.designer-toolbar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .05);
}

.designer-toolbar input,
.designer-toolbar select {
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

.designer-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--designer-primary) 10%, white);
  color: var(--designer-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.designer-card-grid,
.designer-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.designer-card,
.designer-chart-card,
.designer-table-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.designer-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.designer-avatar {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--designer-primary), #0f172a);
  color: #fff;
  font-size: 18px;
  font-weight: 1000;
}

.designer-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.designer-card h2 {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.designer-card p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.designer-code {
  display: block;
  margin-top: 10px;
  padding: 10px;
  border-radius: 16px;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 11px;
  line-height: 1.5;
  overflow-x: auto;
}

.designer-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.designer-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
}

.designer-mini-grid b {
  display: block;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.designer-field-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.designer-field-pills span {
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

.designer-actions,
.designer-table-actions,
.designer-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.designer-actions {
  margin-top: 14px;
}

.designer-actions button,
.designer-table-actions button,
.designer-modal-actions button,
.designer-section-head button,
.designer-field-options button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--designer-primary) 10%, white);
  color: var(--designer-primary);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.designer-actions button:first-child,
.designer-modal-actions button:first-child {
  background: var(--designer-primary);
  color: #fff;
}

.designer-actions button.danger,
.designer-table-actions button.danger,
.designer-field-options button.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.designer-chip {
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

.designer-chip.green { background: #dcfce7; color: #166534; }
.designer-chip.blue { background: #dbeafe; color: #1d4ed8; }
.designer-chip.purple { background: #f3e8ff; color: #7e22ce; }
.designer-chip.orange { background: #ffedd5; color: #c2410c; }
.designer-chip.red { background: #fee2e2; color: #b91c1c; }
.designer-chip.gray { background: #f1f5f9; color: #475569; }

.designer-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.designer-table-wrap table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
}

.designer-table-wrap th {
  text-align: left;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.designer-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.designer-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.designer-table-wrap small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
}

.designer-table-wrap code {
  display: block;
  max-width: 340px;
  overflow-x: auto;
  padding: 8px;
  border-radius: 12px;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 11px;
}

.designer-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.designer-chart-card p {
  margin: 5px 0 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.designer-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.designer-legend span {
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

.designer-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.designer-empty {
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

.designer-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.designer-modal {
  width: min(1080px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.designer-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.designer-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.designer-modal-head p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.designer-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.designer-form-grid,
.designer-field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.designer-form-grid label,
.designer-field-grid label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
}

.designer-form-grid input,
.designer-form-grid select,
.designer-form-grid textarea,
.designer-field-grid input,
.designer-field-grid select {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .32);
  border-radius: 16px;
  background: #fff;
  color: #0f172a;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 800;
}

.designer-form-grid input,
.designer-form-grid select,
.designer-field-grid input,
.designer-field-grid select {
  min-height: 42px;
}

.designer-form-grid textarea {
  resize: vertical;
}

.designer-option-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
}

.designer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .18);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.designer-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--designer-primary);
}

.designer-fields-section {
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
}

.designer-section-head,
.designer-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.designer-section-head h3,
.designer-preview-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
}

.designer-section-head p,
.designer-preview-card p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
}

.designer-field-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.designer-field-card {
  padding: 12px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .18);
}

.designer-field-head span {
  color: #64748b;
  font-size: 12px;
  font-weight: 1000;
}

.designer-field-grid {
  margin-top: 10px;
}

.designer-field-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.designer-preview-card,
.designer-warning {
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
}

.designer-preview-card code {
  display: block;
  margin-top: 10px;
  padding: 10px;
  border-radius: 16px;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 11px;
  overflow-x: auto;
}

.designer-warning {
  background: #fff7ed;
  border-color: rgba(249, 115, 22, .24);
}

.designer-warning strong {
  display: block;
  color: #9a3412;
  font-size: 13px;
  font-weight: 1000;
}

.designer-warning p {
  margin: 5px 0 0;
  color: #c2410c;
  font-size: 12px;
  line-height: 1.5;
}

.designer-code-block {
  margin: 12px 0 0;
  max-height: 520px;
  overflow: auto;
  padding: 14px;
  border-radius: 22px;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.designer-modal-actions {
  position: sticky;
  bottom: -14px;
  justify-content: flex-end;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, #fff 70%, transparent);
}

@media (min-width: 520px) {
  .designer-stat-grid,
  .designer-tool-links,
  .designer-toolbar,
  .designer-option-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .designer-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .designer-card-grid,
  .designer-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .designer-form-grid,
  .designer-field-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .designer-form-grid .wide,
  .designer-field-grid .wide {
    grid-column: 1 / -1;
  }

  .designer-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .designer-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .designer-page {
    padding: 14px;
  }

  .designer-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .designer-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .designer-tool-links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .designer-toolbar {
    grid-template-columns: minmax(240px, 2fr) minmax(160px, 1fr) auto;
  }

  .designer-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .designer-option-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .designer-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
