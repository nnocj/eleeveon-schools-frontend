
"use client";

/**
 * app/components/role-portals/CrudToolkit.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST CRUD TOOLKIT
 * ---------------------------------------------------------
 * - ApiCrudPage talks to NestJS backend routes.
 * - DexieCrudPage talks to your local-first IndexedDB tables.
 * - Both use the same responsive card UI.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../../lib/db";
import { apiCreate, apiDelete, apiList, apiUpdate } from "../../lib/platformApi";

export type CrudField = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "textarea" | "select" | "checkbox";
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string | number | boolean }[];
  readOnly?: boolean;
  hideInCard?: boolean;
  defaultValue?: any;
  helper?: string;
};

type BaseProps = {
  title: string;
  subtitle: string;
  entityName: string;
  fields: CrudField[];
  primaryField?: string;
  secondaryFields?: string[];
  badgeField?: string;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  allowDelete?: boolean;
  createLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  mobileHint?: string;
};

type ApiProps = BaseProps & {
  mode: "api";
  listPath: string;
  createPath?: string;
  updatePath: (item: any) => string;
  deletePath?: (item: any) => string;
  mapBeforeSave?: (values: any, existing?: any) => any;
};

type DexieProps = BaseProps & {
  mode: "dexie";
  tableName: string;
  accountScoped?: boolean;
  schoolScoped?: boolean;
  branchScoped?: boolean;
  softDelete?: boolean;
  mapBeforeSave?: (values: any, existing?: any) => any;
};

function getLocalNumber(keys: string[]) {
  if (typeof window === "undefined") return undefined;
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

function getLocalString(keys: string[]) {
  if (typeof window === "undefined") return undefined;
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }
  return undefined;
}

function getScopeDefaults() {
  return {
    accountId: getLocalString(["accountId", "eleeveonAccountId", "selectedAccountId"]) || "local-account",
    schoolId: getLocalNumber(["schoolId", "activeSchoolId", "selectedSchoolId", "eleeveonSchoolId"]),
    branchId: getLocalNumber(["branchId", "activeBranchId", "selectedBranchId", "eleeveonBranchId"]),
    deviceId: getLocalString(["deviceId", "eleeveonDeviceId"]) || "web-device",
  };
}

function normalizeInputValue(field: CrudField, value: any) {
  if (field.type === "number") {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(value);
  }
  if (field.type === "checkbox") return Boolean(value);
  return value;
}

function valueToInput(field: CrudField, value: any): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function makeInitialValues(fields: CrudField[], item?: any) {
  const values: Record<string, any> = {};
  for (const field of fields) {
    values[field.key] = item?.[field.key] ?? field.defaultValue ?? (field.type === "checkbox" ? false : "");
  }
  return values;
}

function compactPayload(fields: CrudField[], values: Record<string, any>) {
  const payload: Record<string, any> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const value = normalizeInputValue(field, values[field.key]);
    if (value === undefined || value === "") continue;
    payload[field.key] = value;
  }
  return payload;
}

function formatValue(value: any) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function matchesSearch(item: any, q: string) {
  if (!q.trim()) return true;
  const needle = q.toLowerCase();
  return Object.values(item || {}).some((value) =>
    String(value ?? "").toLowerCase().includes(needle)
  );
}

function PageShell({
  title,
  subtitle,
  children,
  action,
  search,
  setSearch,
  mobileHint,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  search: string;
  setSearch: (value: string) => void;
  mobileHint?: string;
}) {
  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div style={{ minWidth: 0 }}>
          <p style={styles.eyebrow}>Eleeveon Schools</p>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.subtitle}>{subtitle}</p>
          {mobileHint ? <p style={styles.mobileHint}>{mobileHint}</p> : null}
        </div>
        <div style={styles.heroAction}>{action}</div>
      </div>

      <div style={styles.toolbar}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search records..."
          style={styles.search}
        />
      </div>

      {children}
    </section>
  );
}

function CrudForm({
  fields,
  values,
  setValues,
  onSubmit,
  onCancel,
  submitting,
  title,
}: {
  fields: CrudField[];
  values: Record<string, any>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  title: string;
}) {
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modalCard}>
        <div style={styles.modalHeader}>
          <div>
            <p style={styles.eyebrow}>CRUD Form</p>
            <h2 style={styles.modalTitle}>{title}</h2>
          </div>
          <button type="button" onClick={onCancel} style={styles.iconButton}>×</button>
        </div>

        <div style={styles.formGrid}>
          {fields.map((field) => (
            <label key={field.key} style={{ ...styles.field, gridColumn: field.type === "textarea" ? "1 / -1" : undefined }}>
              <span style={styles.label}>{field.label}{field.required ? " *" : ""}</span>
              {field.type === "textarea" ? (
                <textarea
                  value={valueToInput(field, values[field.key])}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  placeholder={field.placeholder}
                  style={{ ...styles.input, minHeight: 92, resize: "vertical" }}
                />
              ) : field.type === "select" ? (
                <select
                  value={String(values[field.key] ?? "")}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  style={styles.input}
                >
                  <option value="">Select...</option>
                  {(field.options || []).map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "checkbox" ? (
                <button
                  type="button"
                  onClick={() => setValues((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                  style={{ ...styles.toggle, background: values[field.key] ? "var(--primary-color, #2563eb)" : "#e5e7eb", color: values[field.key] ? "#fff" : "#111827" }}
                >
                  {values[field.key] ? "Enabled" : "Disabled"}
                </button>
              ) : (
                <input
                  type={field.type || "text"}
                  value={valueToInput(field, values[field.key])}
                  readOnly={field.readOnly}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  placeholder={field.placeholder}
                  style={styles.input}
                />
              )}
              {field.helper ? <span style={styles.helper}>{field.helper}</span> : null}
            </label>
          ))}
        </div>

        <div style={styles.formActions}>
          <button type="button" onClick={onCancel} style={styles.secondaryButton}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={submitting} style={styles.primaryButton}>
            {submitting ? "Saving..." : "Save record"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordGrid({
  items,
  fields,
  primaryField,
  secondaryFields,
  badgeField,
  allowUpdate,
  allowDelete,
  onEdit,
  onDelete,
  emptyTitle,
  emptyMessage,
}: {
  items: any[];
  fields: CrudField[];
  primaryField?: string;
  secondaryFields?: string[];
  badgeField?: string;
  allowUpdate: boolean;
  allowDelete: boolean;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  emptyTitle: string;
  emptyMessage: string;
}) {
  if (!items.length) {
    return (
      <div style={styles.emptyCard}>
        <div style={styles.emptyIcon}>◇</div>
        <h3 style={styles.emptyTitle}>{emptyTitle}</h3>
        <p style={styles.emptyMessage}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div style={styles.grid}>
      {items.map((item) => {
        const titleKey = primaryField || fields[0]?.key || "id";
        const detailKeys = secondaryFields?.length
          ? secondaryFields
          : fields.filter((f) => !f.hideInCard && f.key !== titleKey).slice(0, 5).map((f) => f.key);
        return (
          <article key={String(item.id || item.cloudId || JSON.stringify(item))} style={styles.card}>
            <div style={styles.cardTop}>
              <div style={{ minWidth: 0 }}>
                <h3 style={styles.cardTitle}>{formatValue(item[titleKey])}</h3>
                <p style={styles.cardSub}>ID: {formatValue(item.id || item.cloudId)}</p>
              </div>
              {badgeField ? <span style={styles.badge}>{formatValue(item[badgeField])}</span> : null}
            </div>

            <div style={styles.detailGrid}>
              {detailKeys.map((key) => {
                const field = fields.find((f) => f.key === key);
                return (
                  <div key={key} style={styles.detailItem}>
                    <span style={styles.detailLabel}>{field?.label || key}</span>
                    <strong style={styles.detailValue}>{formatValue(item[key])}</strong>
                  </div>
                );
              })}
            </div>

            <div style={styles.cardActions}>
              {allowUpdate ? <button type="button" onClick={() => onEdit(item)} style={styles.smallButton}>Edit</button> : null}
              {allowDelete ? <button type="button" onClick={() => onDelete(item)} style={styles.dangerButton}>Delete</button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ApiCrudPage(props: Omit<ApiProps, "mode">) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});

  const allowCreate = props.allowCreate !== false;
  const allowUpdate = props.allowUpdate !== false;
  const allowDelete = props.allowDelete !== false && Boolean(props.deletePath);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiList<any>(props.listPath);
      setItems(Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : []);
    } catch (err: any) {
      setError(err?.message || "Unable to load records");
    } finally {
      setLoading(false);
    }
  }, [props.listPath]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => matchesSearch(item, search)), [items, search]);

  const openCreate = () => {
    setEditing(null);
    setValues(makeInitialValues(props.fields));
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setValues(makeInitialValues(props.fields, item));
  };

  const closeForm = () => {
    setEditing(null);
    setValues({});
  };

  const save = async () => {
    setSubmitting(true);
    setError("");
    try {
      const base = compactPayload(props.fields, values);
      const payload = props.mapBeforeSave ? props.mapBeforeSave(base, editing) : base;
      if (editing) {
        await apiUpdate(props.updatePath(editing), payload);
      } else {
        await apiCreate(props.createPath || props.listPath, payload);
      }
      closeForm();
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to save record");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: any) => {
    if (!props.deletePath) return;
    if (!window.confirm(`Delete this ${props.entityName}?`)) return;
    setError("");
    try {
      await apiDelete(props.deletePath(item));
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to delete record");
    }
  };

  return (
    <PageShell
      title={props.title}
      subtitle={props.subtitle}
      action={allowCreate ? <button type="button" onClick={openCreate} style={styles.primaryButton}>{props.createLabel || `New ${props.entityName}`}</button> : null}
      search={search}
      setSearch={setSearch}
      mobileHint={props.mobileHint}
    >
      {error ? <div style={styles.error}>{error}</div> : null}
      {loading ? <div style={styles.loading}>Loading records...</div> : (
        <RecordGrid
          items={filtered}
          fields={props.fields}
          primaryField={props.primaryField}
          secondaryFields={props.secondaryFields}
          badgeField={props.badgeField}
          allowUpdate={allowUpdate}
          allowDelete={allowDelete}
          onEdit={openEdit}
          onDelete={remove}
          emptyTitle={props.emptyTitle || `No ${props.entityName} yet`}
          emptyMessage={props.emptyMessage || "Create the first record to begin."}
        />
      )}
      {(Object.keys(values).length > 0 || editing) ? (
        <CrudForm
          fields={props.fields}
          values={values}
          setValues={setValues}
          onSubmit={save}
          onCancel={closeForm}
          submitting={submitting}
          title={editing ? `Edit ${props.entityName}` : `Create ${props.entityName}`}
        />
      ) : null}
    </PageShell>
  );
}

export function DexieCrudPage(props: Omit<DexieProps, "mode">) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});

  const allowCreate = props.allowCreate !== false;
  const allowUpdate = props.allowUpdate !== false;
  const allowDelete = props.allowDelete !== false;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const table = (db as any)[props.tableName];
      if (!table) throw new Error(`Dexie table '${props.tableName}' was not found in app/lib/db.ts`);
      const scope = getScopeDefaults();
      let collection = table.toCollection();
      let data = await collection.toArray();
      data = data.filter((item: any) => item?.isDeleted !== true);
      if (props.accountScoped !== false) data = data.filter((item: any) => !item.accountId || item.accountId === scope.accountId);
      if (props.schoolScoped && scope.schoolId) data = data.filter((item: any) => Number(item.schoolId) === Number(scope.schoolId));
      if (props.branchScoped && scope.branchId) data = data.filter((item: any) => Number(item.branchId) === Number(scope.branchId));
      data.sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setItems(data);
    } catch (err: any) {
      setError(err?.message || "Unable to load local records");
    } finally {
      setLoading(false);
    }
  }, [props.tableName, props.accountScoped, props.schoolScoped, props.branchScoped]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => matchesSearch(item, search)), [items, search]);

  const openCreate = () => {
    setEditing(null);
    setValues(makeInitialValues(props.fields));
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setValues(makeInitialValues(props.fields, item));
  };

  const closeForm = () => {
    setEditing(null);
    setValues({});
  };

  const save = async () => {
    setSubmitting(true);
    setError("");
    try {
      const table = (db as any)[props.tableName];
      if (!table) throw new Error(`Dexie table '${props.tableName}' was not found`);
      const scope = getScopeDefaults();
      const now = Date.now();
      const base = compactPayload(props.fields, values);
      let payload: any = {
        ...base,
        accountId: editing?.accountId || scope.accountId,
        updatedAt: now,
        version: Number(editing?.version || 0) + 1,
        deviceId: scope.deviceId,
        synced: "pending",
        isDeleted: false,
      };
      if (props.schoolScoped || "schoolId" in base) payload.schoolId = base.schoolId || editing?.schoolId || scope.schoolId;
      if (props.branchScoped || "branchId" in base) payload.branchId = base.branchId || editing?.branchId || scope.branchId;
      if (!editing) payload.createdAt = now;
      if (props.mapBeforeSave) payload = props.mapBeforeSave(payload, editing);

      if (editing?.id) await table.update(editing.id, payload);
      else await table.add(payload);
      closeForm();
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to save local record");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: any) => {
    if (!window.confirm(`Delete this ${props.entityName}?`)) return;
    setError("");
    try {
      const table = (db as any)[props.tableName];
      if (props.softDelete !== false) {
        await table.update(item.id, {
          isDeleted: true,
          synced: "pending",
          updatedAt: Date.now(),
          version: Number(item.version || 0) + 1,
        });
      } else {
        await table.delete(item.id);
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to delete local record");
    }
  };

  return (
    <PageShell
      title={props.title}
      subtitle={props.subtitle}
      action={allowCreate ? <button type="button" onClick={openCreate} style={styles.primaryButton}>{props.createLabel || `New ${props.entityName}`}</button> : null}
      search={search}
      setSearch={setSearch}
      mobileHint={props.mobileHint || "Cards are optimized for phones. Swipe/scroll naturally and edit records without leaving the page."}
    >
      {error ? <div style={styles.error}>{error}</div> : null}
      {loading ? <div style={styles.loading}>Loading local records...</div> : (
        <RecordGrid
          items={filtered}
          fields={props.fields}
          primaryField={props.primaryField}
          secondaryFields={props.secondaryFields}
          badgeField={props.badgeField}
          allowUpdate={allowUpdate}
          allowDelete={allowDelete}
          onEdit={openEdit}
          onDelete={remove}
          emptyTitle={props.emptyTitle || `No ${props.entityName} yet`}
          emptyMessage={props.emptyMessage || "Create the first record to begin."}
        />
      )}
      {(Object.keys(values).length > 0 || editing) ? (
        <CrudForm
          fields={props.fields}
          values={values}
          setValues={setValues}
          onSubmit={save}
          onCancel={closeForm}
          submitting={submitting}
          title={editing ? `Edit ${props.entityName}` : `Create ${props.entityName}`}
        />
      ) : null}
    </PageShell>
  );
}

export function PortalOverview({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle: string;
  cards: { label: string; value: string | number; note: string; icon?: string }[];
}) {
  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Eleeveon Schools</p>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.subtitle}>{subtitle}</p>
        </div>
      </div>
      <div style={styles.grid}>
        {cards.map((card) => (
          <article key={card.label} style={styles.card}>
            <div style={styles.statIcon}>{card.icon || "◆"}</div>
            <h3 style={styles.statValue}>{card.value}</h3>
            <p style={styles.cardTitle}>{card.label}</p>
            <p style={styles.cardSub}>{card.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "grid", gap: 16, width: "100%" },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 24,
    background: "linear-gradient(135deg, var(--primary-color, #2563eb), #111827)",
    color: "#fff",
    boxShadow: "0 18px 40px rgba(15,23,42,.16)",
  },
  heroAction: { flexShrink: 0, display: "flex", alignItems: "center" },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", opacity: .8, fontWeight: 800 },
  title: { margin: "6px 0 4px", fontSize: "clamp(1.4rem, 4vw, 2.25rem)", lineHeight: 1.05, fontWeight: 900 },
  subtitle: { margin: 0, maxWidth: 780, opacity: .88, fontSize: 14, lineHeight: 1.55 },
  mobileHint: { margin: "8px 0 0", fontSize: 12, opacity: .78 },
  toolbar: { display: "flex", gap: 10, alignItems: "center" },
  search: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 18, padding: "13px 15px", fontSize: 14, outline: "none", background: "#fff" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14 },
  card: { background: "#fff", border: "1px solid #eef2f7", borderRadius: 24, padding: 16, boxShadow: "0 10px 30px rgba(15,23,42,.07)", minWidth: 0 },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 850, color: "#0f172a", overflowWrap: "anywhere" },
  cardSub: { margin: "4px 0 0", fontSize: 12, color: "#64748b", overflowWrap: "anywhere" },
  badge: { borderRadius: 999, padding: "6px 9px", background: "rgba(37,99,235,.10)", color: "var(--primary-color, #2563eb)", fontWeight: 800, fontSize: 11, whiteSpace: "nowrap" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 },
  detailItem: { borderRadius: 16, background: "#f8fafc", padding: 10, minWidth: 0 },
  detailLabel: { display: "block", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 },
  detailValue: { display: "block", marginTop: 4, fontSize: 13, color: "#111827", overflowWrap: "anywhere" },
  cardActions: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  primaryButton: { border: 0, borderRadius: 999, padding: "12px 16px", background: "var(--primary-color, #2563eb)", color: "#fff", fontWeight: 900, cursor: "pointer", boxShadow: "0 10px 25px rgba(37,99,235,.25)" },
  secondaryButton: { border: "1px solid #e5e7eb", borderRadius: 999, padding: "11px 15px", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" },
  smallButton: { border: 0, borderRadius: 999, padding: "9px 12px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 850, cursor: "pointer" },
  dangerButton: { border: 0, borderRadius: 999, padding: "9px 12px", background: "#fee2e2", color: "#b91c1c", fontWeight: 850, cursor: "pointer" },
  error: { borderRadius: 18, background: "#fef2f2", color: "#991b1b", padding: 14, border: "1px solid #fecaca", fontWeight: 700 },
  loading: { borderRadius: 20, background: "#fff", border: "1px solid #e5e7eb", padding: 18, color: "#64748b" },
  emptyCard: { background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 24, padding: 24, textAlign: "center" },
  emptyIcon: { width: 42, height: 42, borderRadius: 16, display: "grid", placeItems: "center", background: "#f1f5f9", margin: "0 auto 10px", fontWeight: 900 },
  emptyTitle: { margin: 0, fontSize: 17, fontWeight: 900 },
  emptyMessage: { margin: "6px auto 0", maxWidth: 420, fontSize: 13, color: "#64748b" },
  modalBackdrop: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,.50)", padding: 12, display: "grid", placeItems: "center" },
  modalCard: { width: "min(760px, 100%)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 26, padding: 16, boxShadow: "0 30px 90px rgba(15,23,42,.28)" },
  modalHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  modalTitle: { margin: "4px 0 0", fontSize: 20, fontWeight: 900 },
  iconButton: { width: 38, height: 38, borderRadius: 14, border: 0, background: "#f1f5f9", fontSize: 22, cursor: "pointer" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, color: "#334155", fontWeight: 850 },
  input: { border: "1px solid #e5e7eb", borderRadius: 16, padding: "12px 13px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", background: "#fff" },
  helper: { fontSize: 11, color: "#64748b" },
  toggle: { border: 0, borderRadius: 999, padding: "11px 13px", fontWeight: 900, cursor: "pointer" },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" },
  statIcon: { width: 42, height: 42, borderRadius: 16, background: "#eff6ff", display: "grid", placeItems: "center", color: "var(--primary-color, #2563eb)", fontWeight: 900, marginBottom: 10 },
  statValue: { margin: 0, fontSize: 28, fontWeight: 950, color: "#0f172a" },
};
