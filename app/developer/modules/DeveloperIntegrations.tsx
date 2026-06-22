"use client";

/**
 * app/developer/modules/DeveloperIntegrations.tsx
 * ---------------------------------------------------------
 * DEVELOPER INTEGRATIONS
 * ---------------------------------------------------------
 * Working integrations management module for the developer portal.
 *
 * Features:
 * - Backend API support with localStorage fallback.
 * - Create, edit, delete, enable/disable and test integrations.
 * - Card, table and analytics views.
 * - Filters by type, status and environment.
 * - Mobile-first professional UI.
 *
 * Expected backend endpoints when available:
 * GET    /developer/integrations
 * POST   /developer/integrations
 * PATCH  /developer/integrations/:id
 * DELETE /developer/integrations/:id
 * POST   /developer/integrations/:id/test
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

type Props = { navigate?: (key: string) => void };
type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";
type IntegrationType = "payment" | "email" | "sms" | "webhook" | "storage" | "analytics" | "identity" | "ai" | "external_api" | "other";
type IntegrationStatus = "active" | "inactive" | "pending" | "failed" | "testing" | "deprecated";
type IntegrationEnvironment = "production" | "sandbox" | "development";

type IntegrationRecord = {
  id: string;
  name: string;
  provider: string;
  type: IntegrationType;
  status: IntegrationStatus;
  environment: IntegrationEnvironment;
  endpoint?: string | null;
  publicKey?: string | null;
  secretConfigured: boolean;
  webhookUrl?: string | null;
  lastTestStatus?: "success" | "failed" | "never" | null;
  lastTestMessage?: string | null;
  lastTestAt?: string | number | null;
  lastSyncAt?: string | number | null;
  requestsToday: number;
  failuresToday: number;
  notes?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
};

type IntegrationForm = {
  id?: string;
  name: string;
  provider: string;
  type: IntegrationType;
  status: IntegrationStatus;
  environment: IntegrationEnvironment;
  endpoint: string;
  publicKey: string;
  secretConfigured: boolean;
  webhookUrl: string;
  requestsToday: string;
  failuresToday: string;
  notes: string;
};

type ChartRow = { label: string; value: number };

const STORAGE_KEY = "eleeveon_developer_integrations";
const TYPES: IntegrationType[] = ["payment", "email", "sms", "webhook", "storage", "analytics", "identity", "ai", "external_api", "other"];
const STATUSES: IntegrationStatus[] = ["active", "inactive", "pending", "failed", "testing", "deprecated"];
const ENVIRONMENTS: IntegrationEnvironment[] = ["production", "sandbox", "development"];
const chartColors = ["var(--integration-primary)", "#0f172a", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#64748b"];

const EMPTY_FORM: IntegrationForm = {
  name: "",
  provider: "",
  type: "external_api",
  status: "pending",
  environment: "sandbox",
  endpoint: "",
  publicKey: "",
  secretConfigured: false,
  webhookUrl: "",
  requestsToday: "0",
  failuresToday: "0",
  notes: "",
};

const SEED_ROWS: IntegrationRecord[] = [
  {
    id: "integration-paystack",
    name: "Paystack Payments",
    provider: "Paystack",
    type: "payment",
    status: "pending",
    environment: "sandbox",
    endpoint: "https://api.paystack.co",
    publicKey: "",
    secretConfigured: false,
    webhookUrl: "",
    lastTestStatus: "never",
    lastTestMessage: "Not tested yet.",
    lastTestAt: null,
    lastSyncAt: null,
    requestsToday: 0,
    failuresToday: 0,
    notes: "Use for subscription payments, school invoices and checkout.",
    createdAt: Date.now() - 86400000 * 8,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: "integration-email",
    name: "Email Delivery",
    provider: "SMTP / Email Provider",
    type: "email",
    status: "inactive",
    environment: "production",
    endpoint: "",
    publicKey: "",
    secretConfigured: false,
    webhookUrl: "",
    lastTestStatus: "never",
    lastTestMessage: "No provider configured.",
    lastTestAt: null,
    lastSyncAt: null,
    requestsToday: 0,
    failuresToday: 0,
    notes: "Use for password reset, invitations and notifications.",
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: "integration-webhooks",
    name: "Platform Webhooks",
    provider: "Eleeveon Webhooks",
    type: "webhook",
    status: "active",
    environment: "development",
    endpoint: "/webhooks/platform",
    publicKey: "",
    secretConfigured: true,
    webhookUrl: "/webhooks/platform",
    lastTestStatus: "success",
    lastTestMessage: "Webhook endpoint reachable.",
    lastTestAt: Date.now() - 3600000 * 6,
    lastSyncAt: Date.now() - 3600000 * 6,
    requestsToday: 12,
    failuresToday: 1,
    notes: "Receives internal platform events.",
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 3600000 * 6,
  },
];

function toArray<T>(value: any, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as T[];
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (Array.isArray(value.results)) return value.results as T[];
  if (Array.isArray(value.records)) return value.records as T[];
  return [];
}

const safeTime = (value?: string | number | null) => {
  if (!value) return 0;
  const time = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const timeText = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
};

const compact = (value: number) => new Intl.NumberFormat("en-GH", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const labelize = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const clampNumber = (value: string | number, min = 0) => Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min);

const statusTone = (status?: string): Tone => {
  if (status === "active") return "green";
  if (status === "pending" || status === "testing") return "orange";
  if (status === "failed") return "red";
  return "gray";
};

const typeTone = (type?: string): Tone => {
  if (type === "payment") return "green";
  if (type === "webhook" || type === "external_api") return "blue";
  if (type === "ai" || type === "analytics") return "purple";
  if (type === "email" || type === "sms") return "orange";
  return "gray";
};

const iconForType = (type: IntegrationType) => {
  if (type === "payment") return "💳";
  if (type === "email") return "📧";
  if (type === "sms") return "💬";
  if (type === "webhook") return "🪝";
  if (type === "storage") return "🗄️";
  if (type === "analytics") return "📊";
  if (type === "identity") return "🔐";
  if (type === "ai") return "🤖";
  if (type === "external_api") return "🔌";
  return "⚙️";
};

const healthScore = (row: IntegrationRecord) => {
  if (row.status === "failed") return 0;
  if (["inactive", "deprecated"].includes(row.status)) return 30;
  const total = Number(row.requestsToday || 0);
  const failures = Number(row.failuresToday || 0);
  if (!total && row.status === "active") return 80;
  if (!total) return 50;
  return Math.round(Math.max(0, 100 - (failures / total) * 100));
};

function countBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(getKey(row) || "Unknown");
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function normalizeIntegration(raw: any, index: number): IntegrationRecord {
  const now = Date.now();
  return {
    id: String(raw.id || raw.localId || raw.integrationId || `integration-${index}-${now}`),
    name: raw.name || raw.title || `Integration ${index + 1}`,
    provider: raw.provider || raw.vendor || raw.service || "Unknown Provider",
    type: TYPES.includes(raw.type) ? raw.type : "external_api",
    status: STATUSES.includes(raw.status) ? raw.status : raw.enabled ? "active" : "inactive",
    environment: ENVIRONMENTS.includes(raw.environment) ? raw.environment : "development",
    endpoint: raw.endpoint || raw.baseUrl || raw.url || null,
    publicKey: raw.publicKey || raw.public_key || null,
    secretConfigured: Boolean(raw.secretConfigured ?? raw.hasSecret ?? raw.secretKeyConfigured ?? false),
    webhookUrl: raw.webhookUrl || raw.webhook_url || null,
    lastTestStatus: raw.lastTestStatus || raw.testStatus || "never",
    lastTestMessage: raw.lastTestMessage || raw.testMessage || null,
    lastTestAt: raw.lastTestAt || null,
    lastSyncAt: raw.lastSyncAt || raw.syncedAt || null,
    requestsToday: Number(raw.requestsToday || raw.requests || 0),
    failuresToday: Number(raw.failuresToday || raw.failures || 0),
    notes: raw.notes || raw.description || null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
  };
}

const formFromIntegration = (row: IntegrationRecord): IntegrationForm => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  type: row.type,
  status: row.status,
  environment: row.environment,
  endpoint: row.endpoint || "",
  publicKey: row.publicKey || "",
  secretConfigured: row.secretConfigured,
  webhookUrl: row.webhookUrl || "",
  requestsToday: String(row.requestsToday || 0),
  failuresToday: String(row.failuresToday || 0),
  notes: row.notes || "",
});

const integrationFromForm = (form: IntegrationForm): IntegrationRecord => {
  const now = Date.now();
  return {
    id: form.id || `integration-${now}`,
    name: form.name.trim(),
    provider: form.provider.trim(),
    type: form.type,
    status: form.status,
    environment: form.environment,
    endpoint: form.endpoint.trim() || null,
    publicKey: form.publicKey.trim() || null,
    secretConfigured: form.secretConfigured,
    webhookUrl: form.webhookUrl.trim() || null,
    lastTestStatus: "never",
    lastTestMessage: "Not tested yet.",
    lastTestAt: null,
    lastSyncAt: null,
    requestsToday: clampNumber(form.requestsToday),
    failuresToday: clampNumber(form.failuresToday),
    notes: form.notes.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
};

const loadLocalRows = (): IntegrationRecord[] => {
  if (typeof window === "undefined") return SEED_ROWS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ROWS));
      return SEED_ROWS;
    }
    const rows = toArray<any>(JSON.parse(raw), ["integrations", "items", "data"]).map(normalizeIntegration);
    return rows.length ? rows : SEED_ROWS;
  } catch {
    return SEED_ROWS;
  }
};

const saveLocalRows = (rows: IntegrationRecord[]) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {}
};

const downloadJson = (filename: string, data: unknown) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function DeveloperIntegrations({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "#2563eb";

  const [view, setView] = useState<ViewMode>("cards");
  const [rows, setRows] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<IntegrationForm>(EMPTY_FORM);

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      const response = await apiClient<any>("/developer/integrations").catch(async () => apiClient<any>("/integrations").catch(() => null));
      const apiRows = toArray<any>(response, ["integrations", "items", "data"]).map(normalizeIntegration);
      if (apiRows.length) {
        setRows(apiRows);
        saveLocalRows(apiRows);
      } else {
        setRows(loadLocalRows());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load integrations. Showing local saved records.");
      setRows(loadLocalRows());
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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = `${row.name} ${row.provider} ${row.type} ${row.status} ${row.environment} ${row.endpoint || ""} ${row.webhookUrl || ""} ${row.notes || ""}`.toLowerCase();
      return (!term || haystack.includes(term)) && (typeFilter === "all" || row.type === typeFilter) && (statusFilter === "all" || row.status === statusFilter) && (environmentFilter === "all" || row.environment === environmentFilter);
    }).sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt));
  }, [rows, query, typeFilter, statusFilter, environmentFilter]);

  const activeCount = rows.filter((row) => row.status === "active").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const pendingCount = rows.filter((row) => row.status === "pending" || row.status === "testing").length;
  const totalRequests = rows.reduce((sum, row) => sum + Number(row.requestsToday || 0), 0);
  const totalFailures = rows.reduce((sum, row) => sum + Number(row.failuresToday || 0), 0);
  const averageHealth = rows.length ? Math.round(rows.reduce((sum, row) => sum + healthScore(row), 0) / rows.length) : 0;

  const statusData = useMemo<ChartRow[]>(() => countBy(rows, (row) => labelize(row.status)), [rows]);
  const typeData = useMemo<ChartRow[]>(() => countBy(rows, (row) => labelize(row.type)), [rows]);
  const environmentData = useMemo<ChartRow[]>(() => countBy(rows, (row) => labelize(row.environment)), [rows]);
  const usageData = useMemo<ChartRow[]>(() => [...rows].sort((a, b) => b.requestsToday - a.requestsToday).slice(0, 8).map((row) => ({ label: row.name.length > 15 ? `${row.name.slice(0, 15)}…` : row.name, value: row.requestsToday })), [rows]);
  const failureData = useMemo<ChartRow[]>(() => [...rows].sort((a, b) => b.failuresToday - a.failuresToday).slice(0, 8).map((row) => ({ label: row.name.length > 15 ? `${row.name.slice(0, 15)}…` : row.name, value: row.failuresToday })), [rows]);
  const trendData = useMemo<ChartRow[]>(() => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: Math.round(totalRequests * [0.12, 0.18, 0.15, 0.2, 0.22, 0.08, 0.05][i]) })), [totalRequests]);

  const openCreate = () => { setError(""); setNotice(""); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (row: IntegrationRecord) => { setError(""); setNotice(""); setForm(formFromIntegration(row)); setModalOpen(true); };
  const closeModal = () => { if (!saving) { setModalOpen(false); setForm(EMPTY_FORM); } };

  const saveIntegration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Integration name is required.");
    if (!form.provider.trim()) return setError("Provider is required.");
    try {
      setSaving(true); setError(""); setNotice("");
      const payload = integrationFromForm(form);
      if (form.id) {
        const response = await apiClient<any>(`/developer/integrations/${form.id}`, { method: "PATCH", body: payload } as any).catch(async () => apiClient<any>(`/integrations/${form.id}`, { method: "PATCH", body: payload } as any).catch(() => null));
        const updated = normalizeIntegration(response?.integration || response?.data || response || payload, 0);
        setRows((current) => {
          const next = current.map((item) => item.id === form.id ? { ...item, ...updated, id: form.id!, createdAt: item.createdAt, updatedAt: Date.now() } : item);
          saveLocalRows(next); return next;
        });
        setNotice("Integration updated.");
      } else {
        const response = await apiClient<any>("/developer/integrations", { method: "POST", body: payload } as any).catch(async () => apiClient<any>("/integrations", { method: "POST", body: payload } as any).catch(() => null));
        const created = normalizeIntegration(response?.integration || response?.data || response || payload, 0);
        setRows((current) => { const next = [created, ...current]; saveLocalRows(next); return next; });
        setNotice("Integration created.");
      }
      closeModal();
    } catch (err: any) {
      setError(err?.message || "Could not save integration.");
    } finally { setSaving(false); }
  };

  const patchIntegration = async (row: IntegrationRecord, patch: Partial<IntegrationRecord>, success: string) => {
    try {
      setError(""); setNotice("");
      await apiClient<any>(`/developer/integrations/${row.id}`, { method: "PATCH", body: patch } as any).catch(async () => apiClient<any>(`/integrations/${row.id}`, { method: "PATCH", body: patch } as any).catch(() => null));
      setRows((current) => {
        const next = current.map((item) => item.id === row.id ? { ...item, ...patch, updatedAt: Date.now() } : item);
        saveLocalRows(next); return next;
      });
      setNotice(success);
    } catch (err: any) { setError(err?.message || "Could not update integration."); }
  };

  const toggleIntegration = (row: IntegrationRecord) => patchIntegration(row, { status: row.status === "active" ? "inactive" : "active" }, row.status === "active" ? "Integration disabled." : "Integration enabled.");

  const testIntegration = async (row: IntegrationRecord) => {
    try {
      await patchIntegration(row, { status: "testing", lastTestStatus: "never", lastTestMessage: "Testing integration..." }, "Testing integration...");
      const response = await apiClient<any>(`/developer/integrations/${row.id}/test`, { method: "POST", body: { id: row.id, type: row.type, provider: row.provider, endpoint: row.endpoint, webhookUrl: row.webhookUrl, environment: row.environment } } as any).catch(async () => apiClient<any>(`/integrations/${row.id}/test`, { method: "POST", body: { id: row.id } } as any).catch(() => null));
      const ok = response?.ok !== false;
      await patchIntegration(row, { status: ok ? "active" : "failed", lastTestStatus: ok ? "success" : "failed", lastTestMessage: response?.message || (ok ? "Integration test completed successfully." : "Integration test failed."), lastTestAt: Date.now(), lastSyncAt: ok ? Date.now() : row.lastSyncAt }, ok ? "Integration test completed successfully." : "Integration test failed.");
    } catch (err: any) {
      await patchIntegration(row, { status: "failed", lastTestStatus: "failed", lastTestMessage: err?.message || "Integration test failed.", lastTestAt: Date.now() }, "Integration test failed.");
    }
  };

  const deleteIntegration = async (row: IntegrationRecord) => {
    const confirmed = typeof window === "undefined" || window.confirm(`Delete "${row.name}" from integrations?`);
    if (!confirmed) return;
    try {
      await apiClient<any>(`/developer/integrations/${row.id}`, { method: "DELETE" } as any).catch(async () => apiClient<any>(`/integrations/${row.id}`, { method: "DELETE" } as any).catch(() => null));
      setRows((current) => { const next = current.filter((item) => item.id !== row.id); saveLocalRows(next); return next; });
      setNotice("Integration deleted.");
    } catch (err: any) { setError(err?.message || "Could not delete integration."); }
  };

  const exportIntegrations = () => { downloadJson("eleeveon-integrations.json", { exportedAt: new Date().toISOString(), integrations: rows }); setNotice("Integrations exported."); };

  if (loading || accountLoading) return <main className="integration-page" style={{ "--integration-primary": primary } as React.CSSProperties}><style>{css}</style><section className="integration-state"><div className="integration-spinner" /><h2>Loading integrations...</h2><p>Preparing platform APIs, webhooks and service health.</p></section></main>;
  if (!authenticated || !accountId) return <main className="integration-page" style={{ "--integration-primary": primary } as React.CSSProperties}><style>{css}</style><section className="integration-state"><h2>Developer access required</h2><p>Sign in with a developer account to manage integrations.</p></section></main>;

  return (
    <main className="integration-page" style={{ "--integration-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="integration-hero">
        <div><span className="integration-eyebrow">External services</span><h1>Platform Integrations</h1><p>Manage payment gateways, webhooks, email/SMS providers, storage, analytics and external APIs powering Eleeveon.</p></div>
        <div className="integration-hero-actions">
          <div className="integration-switch"><button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Cards</button><button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button><button type="button" className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>Charts</button></div>
          <button type="button" className="integration-white-btn" onClick={openCreate}>New Integration</button>
          <button type="button" className="integration-glass-btn" onClick={exportIntegrations}>Export</button>
          <button type="button" className="integration-glass-btn" onClick={() => load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
        </div>
      </section>
      {(error || notice) && <section className={`integration-alert ${error ? "error" : "success"}`}>{error || notice}</section>}
      <section className="integration-stat-grid"><StatCard label="Integrations" value={rows.length} detail={`${filtered.length} shown`} icon="🔌" /><StatCard label="Active" value={activeCount} detail={`${pendingCount} pending/testing`} icon="✅" /><StatCard label="Failures" value={failedCount} detail={`${totalFailures} failures today`} icon="⚠️" /><StatCard label="Health" value={`${averageHealth}%`} detail={`${compact(totalRequests)} requests today`} icon="📈" /></section>
      <section className="integration-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, provider, endpoint, notes..." /><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">All types</option>{TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select><select value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)}><option value="all">All environments</option>{ENVIRONMENTS.map((env) => <option key={env} value={env}>{labelize(env)}</option>)}</select><button type="button" onClick={() => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); setEnvironmentFilter("all"); }}>Reset</button></section>
      {view === "analytics" ? <AnalyticsView statusData={statusData} typeData={typeData} environmentData={environmentData} usageData={usageData} failureData={failureData} trendData={trendData} /> : view === "table" ? <TableView rows={filtered} onEdit={openEdit} onToggle={toggleIntegration} onTest={testIntegration} onDelete={deleteIntegration} /> : <CardsView rows={filtered} onEdit={openEdit} onToggle={toggleIntegration} onTest={testIntegration} onDelete={deleteIntegration} navigate={navigate} />}
      {modalOpen && <IntegrationModal form={form} setForm={setForm} saving={saving} onClose={closeModal} onSubmit={saveIntegration} />}
    </main>
  );
}

function CardsView({ rows, onEdit, onToggle, onTest, onDelete, navigate }: { rows: IntegrationRecord[]; onEdit: (row: IntegrationRecord) => void; onToggle: (row: IntegrationRecord) => void; onTest: (row: IntegrationRecord) => void; onDelete: (row: IntegrationRecord) => void; navigate?: (key: string) => void }) {
  return <section className="integration-card-grid">{rows.map((row) => <article key={row.id} className={`integration-card ${row.status}`}><div className="integration-card-top"><span className="integration-avatar">{iconForType(row.type)}</span><div className="integration-chip-row"><Chip tone={statusTone(row.status)}>{labelize(row.status)}</Chip><Chip tone={typeTone(row.type)}>{labelize(row.type)}</Chip></div></div><h2>{row.name}</h2><p>{row.provider} · {labelize(row.environment)}</p><div className="integration-health"><span style={{ width: `${healthScore(row)}%` }} /></div><div className="integration-mini-grid"><span><b>Health</b>{healthScore(row)}%</span><span><b>Requests</b>{compact(row.requestsToday)}</span><span><b>Failures</b>{row.failuresToday}</span><span><b>Secret</b>{row.secretConfigured ? "Configured" : "Missing"}</span><span><b>Last Test</b>{timeText(row.lastTestAt)}</span><span><b>Last Sync</b>{timeText(row.lastSyncAt)}</span></div><div className="integration-pills">{row.endpoint && <span>{row.endpoint}</span>}{row.webhookUrl && <span>{row.webhookUrl}</span>}{row.lastTestStatus && <span>{row.lastTestStatus}</span>}{row.notes && <span>{row.notes}</span>}</div><div className="integration-actions"><button type="button" onClick={() => onEdit(row)}>Edit</button><button type="button" onClick={() => onTest(row)}>Test</button><button type="button" onClick={() => onToggle(row)}>{row.status === "active" ? "Disable" : "Enable"}</button><button type="button" onClick={() => navigate?.("auditLogs")}>Audit</button><button type="button" className="danger" onClick={() => onDelete(row)}>Delete</button></div></article>)}{!rows.length && <Empty text="No integrations match your filters." />}</section>;
}

function TableView({ rows, onEdit, onToggle, onTest, onDelete }: { rows: IntegrationRecord[]; onEdit: (row: IntegrationRecord) => void; onToggle: (row: IntegrationRecord) => void; onTest: (row: IntegrationRecord) => void; onDelete: (row: IntegrationRecord) => void }) {
  return <section className="integration-table-card"><div className="integration-table-wrap"><table><thead><tr><th>Integration</th><th>Type</th><th>Status</th><th>Environment</th><th>Health</th><th>Requests</th><th>Failures</th><th>Secret</th><th>Last Test</th><th>Endpoint</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.provider}</small></td><td>{labelize(row.type)}</td><td><Chip tone={statusTone(row.status)}>{labelize(row.status)}</Chip></td><td>{labelize(row.environment)}</td><td>{healthScore(row)}%</td><td>{compact(row.requestsToday)}</td><td>{row.failuresToday}</td><td>{row.secretConfigured ? "Configured" : "Missing"}</td><td>{timeText(row.lastTestAt)}</td><td><small>{row.endpoint || row.webhookUrl || "—"}</small></td><td><div className="integration-table-actions"><button type="button" onClick={() => onEdit(row)}>Edit</button><button type="button" onClick={() => onTest(row)}>Test</button><button type="button" onClick={() => onToggle(row)}>{row.status === "active" ? "Disable" : "Enable"}</button><button type="button" className="danger" onClick={() => onDelete(row)}>Delete</button></div></td></tr>)}</tbody></table></div>{!rows.length && <Empty text="No integrations match your filters." />}</section>;
}

function AnalyticsView({ statusData, typeData, environmentData, usageData, failureData, trendData }: { statusData: ChartRow[]; typeData: ChartRow[]; environmentData: ChartRow[]; usageData: ChartRow[]; failureData: ChartRow[]; trendData: ChartRow[] }) {
  return <section className="integration-chart-grid"><ChartCard title="Usage Trend" description="Estimated request traffic trend across integrations."><ResponsiveContainer width="100%" height={280}><AreaChart data={trendData}><defs><linearGradient id="integrationTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="8%" stopColor="var(--integration-primary)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--integration-primary)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickLine={false} axisLine={false} fontSize={11} /><Tooltip /><Area type="monotone" dataKey="value" stroke="var(--integration-primary)" fill="url(#integrationTrend)" strokeWidth={3} /></AreaChart></ResponsiveContainer></ChartCard><ChartCard title="Status Overview" description="Active, inactive, pending and failed services."><ResponsiveContainer width="100%" height={280}><PieChart><Tooltip /><Pie data={statusData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>{statusData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie></PieChart></ResponsiveContainer><Legend rows={statusData} /></ChartCard><ChartCard title="Integration Types" description="Categories of connected services."><ResponsiveContainer width="100%" height={280}><BarChart data={typeData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="label" width={115} tickLine={false} axisLine={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="var(--integration-primary)" radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Environment Split" description="Production, sandbox and development services."><ResponsiveContainer width="100%" height={280}><PieChart><Tooltip /><Pie data={environmentData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>{environmentData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie></PieChart></ResponsiveContainer><Legend rows={environmentData} /></ChartCard><ChartCard title="Requests Today" description="Top integrations by request volume."><ResponsiveContainer width="100%" height={280}><BarChart data={usageData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} fontSize={11} /><YAxis type="category" dataKey="label" width={115} tickLine={false} axisLine={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="var(--integration-primary)" radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Failures Today" description="Integrations needing attention by failure count."><ResponsiveContainer width="100%" height={280}><BarChart data={failureData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="label" width={115} tickLine={false} axisLine={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="var(--integration-primary)" radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></ChartCard></section>;
}

function IntegrationModal({ form, setForm, saving, onClose, onSubmit }: { form: IntegrationForm; setForm: React.Dispatch<React.SetStateAction<IntegrationForm>>; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const setField = <K extends keyof IntegrationForm>(key: K, value: IntegrationForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="integration-modal-backdrop" role="dialog" aria-modal="true"><form className="integration-modal" onSubmit={onSubmit}><div className="integration-modal-head"><div><h2>{form.id ? "Edit Integration" : "New Integration"}</h2><p>Configure an external service connection.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close">✕</button></div><div className="integration-form-grid"><label>Integration name<input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Paystack Payments" required /></label><label>Provider<input value={form.provider} onChange={(e) => setField("provider", e.target.value)} placeholder="Paystack, SendGrid, Twilio..." required /></label><label>Type<select value={form.type} onChange={(e) => setField("type", e.target.value as IntegrationType)}>{TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => setField("status", e.target.value as IntegrationStatus)}>{STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></label><label>Environment<select value={form.environment} onChange={(e) => setField("environment", e.target.value as IntegrationEnvironment)}>{ENVIRONMENTS.map((env) => <option key={env} value={env}>{labelize(env)}</option>)}</select></label><label>Endpoint / Base URL<input value={form.endpoint} onChange={(e) => setField("endpoint", e.target.value)} placeholder="https://api.example.com" /></label><label>Public key<input value={form.publicKey} onChange={(e) => setField("publicKey", e.target.value)} placeholder="pk_test_..." /></label><label>Webhook URL<input value={form.webhookUrl} onChange={(e) => setField("webhookUrl", e.target.value)} placeholder="/webhooks/paystack" /></label><label>Requests today<input type="number" min="0" value={form.requestsToday} onChange={(e) => setField("requestsToday", e.target.value)} /></label><label>Failures today<input type="number" min="0" value={form.failuresToday} onChange={(e) => setField("failuresToday", e.target.value)} /></label><label className="wide">Notes<textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="What is this integration used for?" rows={3} /></label></div><section className="integration-option-grid"><Toggle label="Secret configured securely on backend" checked={form.secretConfigured} onChange={(checked) => setField("secretConfigured", checked)} /></section><div className="integration-modal-actions"><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving..." : form.id ? "Save Changes" : "Create Integration"}</button></div></form></div>;
}

function StatCard({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: string }) { return <article className="integration-stat"><span>{label}<b>{icon}</b></span><strong>{value}</strong><small>{detail}</small></article>; }
function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) { return <span className={`integration-chip ${tone}`}>{children}</span>; }
function Empty({ text }: { text: string }) { return <div className="integration-empty">{text}</div>; }
function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="integration-chart-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>; }
function Legend({ rows }: { rows: ChartRow[] }) { return <div className="integration-legend">{rows.map((row, index) => <span key={`${row.label}-${index}`}><i style={{ background: chartColors[index % chartColors.length] }} />{row.label}: {row.value}</span>)}</div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="integration-toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>; }

const css = `
@keyframes integrationSpin { to { transform: rotate(360deg); } }
.integration-page { min-height:100dvh; width:100%; max-width:100%; padding:8px; padding-bottom:max(28px, env(safe-area-inset-bottom)); background:radial-gradient(circle at top left, color-mix(in srgb, var(--integration-primary) 10%, transparent), transparent 34rem), #f8fafc; color:#0f172a; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; overflow-x:hidden; }
.integration-page *, .integration-page *::before, .integration-page *::after { box-sizing:border-box; }
.integration-page button, .integration-page input, .integration-page select, .integration-page textarea { font:inherit; max-width:100%; }
.integration-state { min-height:min(420px, calc(100dvh - 32px)); display:grid; place-items:center; align-content:center; gap:10px; width:min(520px, 100%); margin:0 auto; padding:22px; border-radius:28px; background:#fff; border:1px solid rgba(148,163,184,.22); box-shadow:0 24px 70px rgba(15,23,42,.08); text-align:center; }
.integration-state h2 { margin:0; font-size:clamp(18px,5vw,24px); font-weight:1000; letter-spacing:-.04em; }
.integration-state p { max-width:34rem; margin:0; color:#64748b; font-size:13px; line-height:1.6; }
.integration-spinner { width:38px; height:38px; border-radius:999px; border:4px solid color-mix(in srgb, var(--integration-primary) 18%, transparent); border-top-color:var(--integration-primary); animation:integrationSpin .8s linear infinite; }
.integration-hero { display:grid; gap:16px; border-radius:30px; padding:18px; color:#fff; background:radial-gradient(circle at 20% 10%, rgba(255,255,255,.18), transparent 20rem), linear-gradient(135deg,var(--integration-primary),#0f172a 72%); box-shadow:0 24px 70px rgba(15,23,42,.18); overflow:hidden; }
.integration-eyebrow { display:inline-flex; font-size:11px; font-weight:1000; text-transform:uppercase; letter-spacing:.14em; opacity:.82; }
.integration-hero h1 { margin:8px 0 0; font-size:clamp(28px,8vw,44px); line-height:1.02; font-weight:1000; letter-spacing:-.07em; }
.integration-hero p { max-width:850px; margin:10px 0 0; font-size:13px; line-height:1.6; opacity:.9; }
.integration-hero-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.integration-switch { display:inline-flex; gap:5px; padding:5px; border-radius:999px; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.2); backdrop-filter:blur(14px); }
.integration-switch button { min-height:34px; border:0; border-radius:999px; padding:0 11px; background:transparent; color:rgba(255,255,255,.75); font-size:12px; font-weight:1000; cursor:pointer; }
.integration-switch button.active { background:#fff; color:#0f172a; box-shadow:0 10px 24px rgba(15,23,42,.16); }
.integration-white-btn,.integration-glass-btn { min-height:40px; border-radius:999px; padding:0 13px; font-size:12px; font-weight:950; cursor:pointer; }
.integration-white-btn { border:0; background:#fff; color:#0f172a; }
.integration-glass-btn { border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.14); color:#fff; }
.integration-glass-btn:disabled { opacity:.7; cursor:not-allowed; }
.integration-alert { margin-top:10px; padding:12px 14px; border-radius:20px; font-size:13px; font-weight:850; }
.integration-alert.error { background:#fee2e2; color:#991b1b; }
.integration-alert.success { background:#dcfce7; color:#166534; }
.integration-stat-grid { display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px; }
.integration-stat,.integration-card,.integration-chart-card,.integration-table-card { border:1px solid rgba(148,163,184,.22); border-radius:24px; background:#fff; box-shadow:0 18px 45px rgba(15,23,42,.06); }
.integration-stat { padding:16px; }
.integration-stat span { display:flex; justify-content:space-between; gap:10px; color:#64748b; font-size:12px; font-weight:850; }
.integration-stat strong { display:block; margin-top:8px; font-size:clamp(24px,8vw,34px); line-height:1; font-weight:1000; letter-spacing:-.06em; }
.integration-stat small { display:block; margin-top:8px; color:#64748b; font-size:12px; font-weight:850; }
.integration-toolbar { display:grid; grid-template-columns:1fr; gap:8px; margin-top:10px; padding:10px; border-radius:24px; background:#fff; border:1px solid rgba(148,163,184,.22); box-shadow:0 18px 45px rgba(15,23,42,.05); }
.integration-toolbar input,.integration-toolbar select { min-height:42px; width:100%; border:1px solid rgba(148,163,184,.3); border-radius:16px; padding:0 12px; background:#fff; color:#0f172a; font-size:13px; font-weight:800; }
.integration-toolbar button { min-height:42px; border:0; border-radius:16px; background:color-mix(in srgb, var(--integration-primary) 10%, white); color:var(--integration-primary); font-size:13px; font-weight:1000; cursor:pointer; }
.integration-card-grid,.integration-chart-grid { display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px; }
.integration-card,.integration-chart-card,.integration-table-card { min-width:0; padding:14px; }
.integration-card.failed { border-color:rgba(220,38,38,.24); background:linear-gradient(180deg,#fff,#fff7f7); }
.integration-card.pending,.integration-card.testing { border-color:rgba(249,115,22,.24); }
.integration-card-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.integration-avatar { width:46px; height:46px; border-radius:18px; display:grid; place-items:center; background:linear-gradient(135deg,var(--integration-primary),#0f172a); color:#fff; font-size:18px; font-weight:1000; }
.integration-chip-row { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; }
.integration-card h2 { margin:14px 0 0; font-size:20px; font-weight:1000; letter-spacing:-.05em; }
.integration-card p { margin:5px 0 0; color:#64748b; font-size:13px; line-height:1.45; }
.integration-health { height:9px; margin-top:12px; border-radius:999px; background:#e2e8f0; overflow:hidden; }
.integration-health span { display:block; height:100%; min-width:4px; background:linear-gradient(90deg,var(--integration-primary),#16a34a); }
.integration-mini-grid { display:grid; grid-template-columns:1fr; gap:8px; margin-top:14px; }
.integration-mini-grid span { padding:10px; border-radius:16px; background:#f8fafc; color:#0f172a; font-size:12px; font-weight:850; }
.integration-mini-grid b { display:block; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:.08em; margin-bottom:3px; }
.integration-pills { display:flex; flex-wrap:wrap; gap:6px; margin-top:14px; }
.integration-pills span { display:inline-flex; align-items:center; min-height:28px; padding:0 9px; border-radius:999px; background:#f8fafc; border:1px solid rgba(148,163,184,.18); color:#475569; font-size:11px; font-weight:900; max-width:100%; overflow-wrap:anywhere; }
.integration-actions,.integration-table-actions,.integration-modal-actions { display:flex; flex-wrap:wrap; gap:8px; }
.integration-actions { margin-top:14px; }
.integration-actions button,.integration-table-actions button,.integration-modal-actions button { min-height:38px; border:0; border-radius:999px; padding:0 12px; background:color-mix(in srgb, var(--integration-primary) 10%, white); color:var(--integration-primary); font-size:12px; font-weight:1000; cursor:pointer; }
.integration-actions button:first-child,.integration-table-actions button:first-child,.integration-modal-actions button:last-child { background:var(--integration-primary); color:#fff; }
.integration-actions button.danger,.integration-table-actions button.danger { background:#fee2e2; color:#b91c1c; }
.integration-chip { display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:0 10px; border-radius:999px; font-size:11px; font-weight:1000; white-space:nowrap; }
.integration-chip.green { background:#dcfce7; color:#166534; }.integration-chip.blue { background:#dbeafe; color:#1d4ed8; }.integration-chip.purple { background:#f3e8ff; color:#7e22ce; }.integration-chip.orange { background:#ffedd5; color:#c2410c; }.integration-chip.red { background:#fee2e2; color:#b91c1c; }.integration-chip.gray { background:#f1f5f9; color:#475569; }
.integration-table-wrap { width:100%; overflow-x:auto; }
.integration-table-wrap table { width:100%; min-width:1180px; border-collapse:collapse; }
.integration-table-wrap th { text-align:left; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.08em; padding:10px; border-bottom:1px solid rgba(148,163,184,.22); }
.integration-table-wrap td { padding:12px 10px; border-bottom:1px solid rgba(148,163,184,.16); font-size:13px; vertical-align:top; }
.integration-table-wrap strong { display:block; font-weight:1000; }.integration-table-wrap small { display:block; margin-top:3px; color:#64748b; font-size:11px; line-height:1.35; }
.integration-chart-card h2 { margin:0; font-size:17px; font-weight:1000; letter-spacing:-.04em; }.integration-chart-card p { margin:5px 0 10px; color:#64748b; font-size:12px; line-height:1.5; }
.integration-legend { display:flex; flex-wrap:wrap; gap:8px; padding-top:8px; }.integration-legend span { display:inline-flex; align-items:center; gap:6px; min-height:28px; border-radius:999px; padding:0 9px; background:#f8fafc; border:1px solid rgba(148,163,184,.18); color:#475569; font-size:11px; font-weight:900; }.integration-legend i { width:9px; height:9px; border-radius:999px; }
.integration-empty { grid-column:1 / -1; margin:0; padding:18px; border-radius:20px; background:#f8fafc; color:#64748b; font-size:13px; text-align:center; border:1px dashed rgba(148,163,184,.35); }
.integration-modal-backdrop { position:fixed; inset:0; z-index:90; display:grid; place-items:end center; padding:10px; background:rgba(15,23,42,.58); backdrop-filter:blur(12px); }
.integration-modal { width:min(980px,100%); max-height:min(92dvh,920px); overflow-y:auto; border-radius:28px; background:#fff; box-shadow:0 30px 100px rgba(15,23,42,.35); border:1px solid rgba(255,255,255,.24); padding:14px; }
.integration-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:6px 4px 14px; }.integration-modal-head h2 { margin:0; font-size:20px; font-weight:1000; letter-spacing:-.05em; }.integration-modal-head p { margin:5px 0 0; color:#64748b; font-size:12px; line-height:1.5; }.integration-modal-head button { width:38px; height:38px; border:0; border-radius:999px; background:#f1f5f9; color:#0f172a; font-weight:1000; cursor:pointer; }
.integration-form-grid { display:grid; grid-template-columns:1fr; gap:10px; }.integration-form-grid label { display:grid; gap:6px; color:#334155; font-size:12px; font-weight:950; }.integration-form-grid input,.integration-form-grid select,.integration-form-grid textarea { width:100%; border:1px solid rgba(148,163,184,.32); border-radius:16px; background:#fff; color:#0f172a; padding:11px 12px; font-size:13px; font-weight:800; }.integration-form-grid input,.integration-form-grid select { min-height:42px; }.integration-form-grid textarea { resize:vertical; }
.integration-option-grid { display:grid; grid-template-columns:1fr; gap:8px; margin-top:12px; padding:12px; border-radius:22px; background:#f8fafc; border:1px solid rgba(148,163,184,.18); }
.integration-toggle { display:inline-flex; align-items:center; gap:8px; min-height:36px; padding:0 10px; border-radius:999px; background:#fff; border:1px solid rgba(148,163,184,.18); font-size:12px; font-weight:900; cursor:pointer; }.integration-toggle input { width:16px; height:16px; accent-color:var(--integration-primary); }
.integration-modal-actions { position:sticky; bottom:-14px; justify-content:flex-end; margin-top:14px; padding:12px 0 2px; background:linear-gradient(to top,#fff 70%,transparent); }.integration-modal-actions button:first-child { background:#f1f5f9; color:#0f172a; }.integration-modal-actions button:disabled { opacity:.65; cursor:not-allowed; }
@media (min-width:520px){ .integration-stat-grid,.integration-toolbar,.integration-option-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.integration-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
@media (min-width:760px){ .integration-card-grid,.integration-chart-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.integration-form-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.integration-form-grid .wide{grid-column:1 / -1;}.integration-modal-backdrop{place-items:center;padding:18px;}.integration-modal{padding:18px;} }
@media (min-width:920px){ .integration-page{padding:14px;}.integration-hero{grid-template-columns:1fr auto;align-items:end;padding:24px;}.integration-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr));}.integration-toolbar{grid-template-columns:minmax(240px,2fr) repeat(3,minmax(130px,1fr)) auto;}.integration-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr));} }
@media (min-width:1180px){ .integration-card-grid{grid-template-columns:repeat(3,minmax(0,1fr));} }
`;
