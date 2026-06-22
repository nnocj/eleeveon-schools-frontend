"use client";

/**
 * app/developer/modules/DeveloperFeatureFlags.tsx
 * ---------------------------------------------------------
 * DEVELOPER FEATURE FLAGS
 * ---------------------------------------------------------
 * Real feature-flag management module for the developer portal.
 *
 * Purpose:
 * - Create, edit, enable/disable and archive feature flags.
 * - Control rollout percentage, environments, target roles and target plans.
 * - Show card, table and analytics/chart views.
 * - Use backend API where available.
 * - Fall back to localStorage so the page still works before backend endpoints exist.
 *
 * Expected API endpoints, when available:
 * GET    /developer/feature-flags
 * POST   /developer/feature-flags
 * PATCH  /developer/feature-flags/:id
 *
 * Safe response shapes supported:
 * []
 * { data: [] }
 * { flags: [] }
 * { featureFlags: [] }
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

// ======================================================
// TYPES
// ======================================================

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "analytics";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type FlagStatus = "enabled" | "disabled" | "archived";
type Environment = "development" | "staging" | "production";
type FlagCategory = "core" | "billing" | "reports" | "sync" | "portal" | "analytics" | "experimental";

type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category: FlagCategory;
  status: FlagStatus;
  rolloutPercent: number;
  environments: Environment[];
  targetRoles: string[];
  targetPlans: string[];
  owner?: string | null;
  riskLevel: "low" | "medium" | "high";
  createdAt?: string | number;
  updatedAt?: string | number;
};

type FlagForm = {
  id?: string;
  key: string;
  name: string;
  description: string;
  category: FlagCategory;
  status: FlagStatus;
  rolloutPercent: string;
  environments: Environment[];
  targetRoles: string[];
  targetPlans: string[];
  owner: string;
  riskLevel: "low" | "medium" | "high";
};

type ChartRow = {
  label: string;
  value: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const STORAGE_KEY = "eleeveon_developer_feature_flags";

const CATEGORIES: FlagCategory[] = [
  "core",
  "billing",
  "reports",
  "sync",
  "portal",
  "analytics",
  "experimental",
];

const ENVIRONMENTS: Environment[] = ["development", "staging", "production"];

const TARGET_ROLES = [
  "owner",
  "school_admin",
  "branch_admin",
  "teacher",
  "accountant",
  "parent",
  "student",
  "developer",
];

const TARGET_PLANS = ["free", "starter", "growth", "professional", "enterprise"];

const EMPTY_FORM: FlagForm = {
  key: "",
  name: "",
  description: "",
  category: "experimental",
  status: "disabled",
  rolloutPercent: "0",
  environments: ["development"],
  targetRoles: [],
  targetPlans: [],
  owner: "",
  riskLevel: "low",
};

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

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const clampPercent = (value: string | number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
};

const statusTone = (status?: string): Tone => {
  if (status === "enabled") return "green";
  if (status === "disabled") return "gray";
  if (status === "archived") return "orange";
  return "gray";
};

const riskTone = (risk?: string): Tone => {
  if (risk === "low") return "green";
  if (risk === "medium") return "orange";
  if (risk === "high") return "red";
  return "gray";
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

const normalizeFlag = (raw: any, index: number): FeatureFlag => {
  const name = raw.name || raw.title || "Unnamed Feature";
  const key = slugify(raw.key || raw.code || name || `feature_${index + 1}`);

  return {
    id: String(raw.id || raw.localId || key || `flag-${index}-${Date.now()}`),
    key,
    name,
    description: raw.description || raw.message || "",
    category: raw.category || "experimental",
    status: raw.status || (raw.enabled ? "enabled" : "disabled"),
    rolloutPercent: clampPercent(raw.rolloutPercent ?? raw.rollout ?? (raw.enabled ? 100 : 0)),
    environments: Array.isArray(raw.environments)
      ? raw.environments
      : raw.environment
        ? [raw.environment]
        : ["development"],
    targetRoles: Array.isArray(raw.targetRoles) ? raw.targetRoles : [],
    targetPlans: Array.isArray(raw.targetPlans) ? raw.targetPlans : [],
    owner: raw.owner || raw.ownerEmail || "",
    riskLevel: raw.riskLevel || raw.risk || "low",
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
};

const formFromFlag = (flag: FeatureFlag): FlagForm => ({
  id: flag.id,
  key: flag.key,
  name: flag.name,
  description: flag.description || "",
  category: flag.category,
  status: flag.status,
  rolloutPercent: String(flag.rolloutPercent),
  environments: flag.environments,
  targetRoles: flag.targetRoles,
  targetPlans: flag.targetPlans,
  owner: flag.owner || "",
  riskLevel: flag.riskLevel,
});

const flagFromForm = (form: FlagForm): FeatureFlag => ({
  id: form.id || `flag-${Date.now()}`,
  key: slugify(form.key || form.name),
  name: form.name.trim(),
  description: form.description.trim(),
  category: form.category,
  status: form.status,
  rolloutPercent: clampPercent(form.rolloutPercent),
  environments: form.environments,
  targetRoles: form.targetRoles,
  targetPlans: form.targetPlans,
  owner: form.owner.trim(),
  riskLevel: form.riskLevel,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const loadLocalFlags = (): FeatureFlag[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return toArray<any>(JSON.parse(raw), ["flags", "featureFlags"]).map(normalizeFlag);
  } catch {
    return [];
  }
};

const saveLocalFlags = (flags: FeatureFlag[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // ignore localStorage write failures
  }
};

const toggleListValue = <T extends string>(list: T[], value: T) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperFeatureFlags({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FlagForm>(EMPTY_FORM);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");

      const response = await apiClient<any>("/developer/feature-flags").catch(async () =>
        apiClient<any>("/feature-flags").catch(() => null)
      );

      const apiFlags = toArray<any>(response, ["flags", "featureFlags"]).map(normalizeFlag);

      if (apiFlags.length) {
        setFlags(apiFlags);
        saveLocalFlags(apiFlags);
      } else {
        setFlags(loadLocalFlags());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load feature flags from the server. Showing local saved flags.");
      setFlags(loadLocalFlags());
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

  const filteredFlags = useMemo(() => {
    const term = query.trim().toLowerCase();

    return flags
      .filter((flag) => {
        const haystack = `${flag.name} ${flag.key} ${flag.description || ""} ${
          flag.owner || ""
        } ${flag.category} ${flag.status}`.toLowerCase();

        const searchOk = !term || haystack.includes(term);
        const statusOk = statusFilter === "all" || flag.status === statusFilter;
        const categoryOk = categoryFilter === "all" || flag.category === categoryFilter;
        const environmentOk =
          environmentFilter === "all" || flag.environments.includes(environmentFilter as Environment);
        const riskOk = riskFilter === "all" || flag.riskLevel === riskFilter;

        return searchOk && statusOk && categoryOk && environmentOk && riskOk;
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          if (a.status === "enabled") return -1;
          if (b.status === "enabled") return 1;
        }

        return safeTime(b.updatedAt || b.createdAt) - safeTime(a.updatedAt || a.createdAt);
      });
  }, [flags, query, statusFilter, categoryFilter, environmentFilter, riskFilter]);

  const enabledCount = flags.filter((flag) => flag.status === "enabled").length;
  const disabledCount = flags.filter((flag) => flag.status === "disabled").length;
  const archivedCount = flags.filter((flag) => flag.status === "archived").length;
  const highRiskCount = flags.filter((flag) => flag.riskLevel === "high").length;
  const productionCount = flags.filter((flag) => flag.environments.includes("production")).length;

  const averageRollout = flags.length
    ? Math.round(flags.reduce((sum, flag) => sum + Number(flag.rolloutPercent || 0), 0) / flags.length)
    : 0;

  const statusChart = useMemo<ChartRow[]>(
    () => countBy(flags, (flag) => flag.status),
    [flags]
  );

  const categoryChart = useMemo<ChartRow[]>(
    () => countBy(flags, (flag) => flag.category),
    [flags]
  );

  const riskChart = useMemo<ChartRow[]>(
    () => countBy(flags, (flag) => flag.riskLevel),
    [flags]
  );

  const rolloutChart = useMemo<ChartRow[]>(() => {
    const buckets = [
      { label: "0%", min: 0, max: 0 },
      { label: "1-24%", min: 1, max: 24 },
      { label: "25-49%", min: 25, max: 49 },
      { label: "50-74%", min: 50, max: 74 },
      { label: "75-99%", min: 75, max: 99 },
      { label: "100%", min: 100, max: 100 },
    ];

    return buckets.map((bucket) => ({
      label: bucket.label,
      value: flags.filter(
        (flag) => flag.rolloutPercent >= bucket.min && flag.rolloutPercent <= bucket.max
      ).length,
    }));
  }, [flags]);

  // ======================================================
  // MUTATIONS
  // ======================================================

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (flag: FeatureFlag) => {
    setError("");
    setNotice("");
    setForm(formFromFlag(flag));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const saveFlag = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Feature name is required.");
      return;
    }

    const payload = flagFromForm(form);

    if (!payload.key) {
      setError("Feature key is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      if (form.id) {
        const response = await apiClient<any>(`/developer/feature-flags/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }).catch(async () =>
          apiClient<any>(`/feature-flags/${form.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }).catch(() => null)
        );

        const updated = normalizeFlag(response?.flag || response?.data || response || payload, 0);

        setFlags((current) => {
          const next = current.map((flag) =>
            flag.id === form.id
              ? {
                  ...flag,
                  ...updated,
                  id: form.id,
                  createdAt: flag.createdAt,
                  updatedAt: Date.now(),
                }
              : flag
          );

          saveLocalFlags(next);
          return next;
        });

        setNotice("Feature flag updated.");
      } else {
        const response = await apiClient<any>("/developer/feature-flags", {
          method: "POST",
          body: JSON.stringify(payload),
        }).catch(async () =>
          apiClient<any>("/feature-flags", {
            method: "POST",
            body: JSON.stringify(payload),
          }).catch(() => null)
        );

        const created = normalizeFlag(response?.flag || response?.data || response || payload, 0);

        setFlags((current) => {
          const exists = current.some((flag) => flag.key === created.key);
          const next = exists
            ? current.map((flag) => (flag.key === created.key ? { ...flag, ...created } : flag))
            : [created, ...current];

          saveLocalFlags(next);
          return next;
        });

        setNotice("Feature flag created.");
      }

      closeModal();
    } catch (err: any) {
      setError(err?.message || "Could not save feature flag.");
    } finally {
      setSaving(false);
    }
  };

  const updateFlagStatus = async (flag: FeatureFlag, status: FlagStatus) => {
    try {
      setError("");
      setNotice("");

      const updated: FeatureFlag = {
        ...flag,
        status,
        rolloutPercent: status === "enabled" && flag.rolloutPercent === 0 ? 100 : flag.rolloutPercent,
        updatedAt: Date.now(),
      };

      await apiClient<any>(`/developer/feature-flags/${flag.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: updated.status,
          rolloutPercent: updated.rolloutPercent,
        }),
      }).catch(async () =>
        apiClient<any>(`/feature-flags/${flag.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: updated.status,
            rolloutPercent: updated.rolloutPercent,
          }),
        }).catch(() => null)
      );

      setFlags((current) => {
        const next = current.map((item) => (item.id === flag.id ? updated : item));
        saveLocalFlags(next);
        return next;
      });

      setNotice(`Feature flag ${status}.`);
    } catch (err: any) {
      setError(err?.message || "Could not update feature flag.");
    }
  };

  const updateRollout = async (flag: FeatureFlag, rolloutPercent: number) => {
    try {
      setError("");
      setNotice("");

      const updated: FeatureFlag = {
        ...flag,
        rolloutPercent: clampPercent(rolloutPercent),
        updatedAt: Date.now(),
      };

      await apiClient<any>(`/developer/feature-flags/${flag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rolloutPercent: updated.rolloutPercent }),
      }).catch(async () =>
        apiClient<any>(`/feature-flags/${flag.id}`, {
          method: "PATCH",
          body: JSON.stringify({ rolloutPercent: updated.rolloutPercent }),
        }).catch(() => null)
      );

      setFlags((current) => {
        const next = current.map((item) => (item.id === flag.id ? updated : item));
        saveLocalFlags(next);
        return next;
      });

      setNotice("Rollout updated.");
    } catch (err: any) {
      setError(err?.message || "Could not update rollout.");
    }
  };

  const removeLocalFlag = (flag: FeatureFlag) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Remove ${flag.name} from your local feature flag list?`);

    if (!confirmed) return;

    setFlags((current) => {
      const next = current.filter((item) => item.id !== flag.id);
      saveLocalFlags(next);
      return next;
    });

    setNotice("Feature flag removed locally.");
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main className="devflags-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devflags-state">
          <div className="devflags-spinner" />
          <h2>Loading feature flags...</h2>
          <p>Preparing rollout controls, environments, targeting and analytics.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="devflags-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devflags-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to manage platform feature flags.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="devflags-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="devflags-hero">
        <div>
          <span className="devflags-eyebrow">Feature control</span>
          <h1>Feature Flags</h1>
          <p>
            Roll out beta features safely, target specific roles or plans, control production
            exposure, and disable risky changes without redeploying the whole platform.
          </p>
        </div>

        <div className="devflags-hero-actions">
          <div className="devflags-switch" role="tablist" aria-label="Feature flag views">
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

          <button type="button" className="devflags-white-btn" onClick={openCreate}>
            New Flag
          </button>

          <button
            type="button"
            className="devflags-glass-btn"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`devflags-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="devflags-stat-grid">
        <StatCard label="Flags" value={flags.length} detail={`${filteredFlags.length} shown`} icon="🚩" />
        <StatCard label="Enabled" value={enabledCount} detail={`${disabledCount} disabled`} icon="✅" />
        <StatCard label="Production" value={productionCount} detail={`${archivedCount} archived`} icon="🚀" />
        <StatCard label="Avg Rollout" value={`${averageRollout}%`} detail={`${highRiskCount} high-risk flags`} icon="📊" />
      </section>

      <section className="devflags-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, key, owner, description..."
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
          <option value="archived">Archived</option>
        </select>

        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={environmentFilter}
          onChange={(event) => setEnvironmentFilter(event.target.value)}
        >
          <option value="all">All environments</option>
          {ENVIRONMENTS.map((environment) => (
            <option key={environment} value={environment}>
              {environment}
            </option>
          ))}
        </select>

        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
          <option value="all">All risk levels</option>
          <option value="low">Low risk</option>
          <option value="medium">Medium risk</option>
          <option value="high">High risk</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
            setCategoryFilter("all");
            setEnvironmentFilter("all");
            setRiskFilter("all");
          }}
        >
          Reset
        </button>
      </section>

      {viewMode === "analytics" ? (
        <AnalyticsView
          statusChart={statusChart}
          categoryChart={categoryChart}
          riskChart={riskChart}
          rolloutChart={rolloutChart}
        />
      ) : viewMode === "table" ? (
        <TableView
          flags={filteredFlags}
          onEdit={openEdit}
          onStatus={updateFlagStatus}
          onRollout={updateRollout}
          onDelete={removeLocalFlag}
        />
      ) : (
        <CardsView
          flags={filteredFlags}
          onEdit={openEdit}
          onStatus={updateFlagStatus}
          onRollout={updateRollout}
          onDelete={removeLocalFlag}
          navigate={navigate}
        />
      )}

      {modalOpen && (
        <FlagModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={closeModal}
          onSubmit={saveFlag}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  flags,
  onEdit,
  onStatus,
  onRollout,
  onDelete,
  navigate,
}: {
  flags: FeatureFlag[];
  onEdit: (flag: FeatureFlag) => void;
  onStatus: (flag: FeatureFlag, status: FlagStatus) => void;
  onRollout: (flag: FeatureFlag, rolloutPercent: number) => void;
  onDelete: (flag: FeatureFlag) => void;
  navigate?: (key: string) => void;
}) {
  return (
    <section className="devflags-card-grid">
      {flags.map((flag) => (
        <article key={flag.id} className={`devflags-flag-card ${flag.status}`}>
          <div className="devflags-flag-top">
            <span className="devflags-flag-icon">🚩</span>
            <div className="devflags-chip-row">
              <Chip tone={statusTone(flag.status)}>{flag.status}</Chip>
              <Chip tone={riskTone(flag.riskLevel)}>{flag.riskLevel} risk</Chip>
            </div>
          </div>

          <h2>{flag.name}</h2>
          <p>{flag.description || "No description added."}</p>

          <div className="devflags-key">{flag.key}</div>

          <div className="devflags-rollout">
            <div>
              <strong>{flag.rolloutPercent}%</strong>
              <span>rollout</span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              value={flag.rolloutPercent}
              onChange={(event) => onRollout(flag, Number(event.target.value))}
            />
          </div>

          <div className="devflags-mini-grid">
            <span>
              <b>Category</b>
              {flag.category}
            </span>
            <span>
              <b>Environments</b>
              {flag.environments.join(", ") || "None"}
            </span>
            <span>
              <b>Roles</b>
              {flag.targetRoles.length ? flag.targetRoles.join(", ") : "All roles"}
            </span>
            <span>
              <b>Plans</b>
              {flag.targetPlans.length ? flag.targetPlans.join(", ") : "All plans"}
            </span>
            <span>
              <b>Owner</b>
              {flag.owner || "Unassigned"}
            </span>
            <span>
              <b>Updated</b>
              {dateText(flag.updatedAt)}
            </span>
          </div>

          <div className="devflags-actions">
            <button type="button" onClick={() => onEdit(flag)}>
              Edit
            </button>

            {flag.status === "enabled" ? (
              <button type="button" onClick={() => onStatus(flag, "disabled")}>
                Disable
              </button>
            ) : (
              <button type="button" onClick={() => onStatus(flag, "enabled")}>
                Enable
              </button>
            )}

            {flag.status !== "archived" && (
              <button type="button" onClick={() => onStatus(flag, "archived")}>
                Archive
              </button>
            )}

            <button type="button" onClick={() => navigate?.("auditLogs")}>
              Audit
            </button>

            <button type="button" className="danger" onClick={() => onDelete(flag)}>
              Remove
            </button>
          </div>
        </article>
      ))}

      {!flags.length && <Empty text="No feature flags match your filters." />}
    </section>
  );
}

function TableView({
  flags,
  onEdit,
  onStatus,
  onRollout,
  onDelete,
}: {
  flags: FeatureFlag[];
  onEdit: (flag: FeatureFlag) => void;
  onStatus: (flag: FeatureFlag, status: FlagStatus) => void;
  onRollout: (flag: FeatureFlag, rolloutPercent: number) => void;
  onDelete: (flag: FeatureFlag) => void;
}) {
  return (
    <section className="devflags-table-card">
      <div className="devflags-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Rollout</th>
              <th>Category</th>
              <th>Environments</th>
              <th>Targets</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {flags.map((flag) => (
              <tr key={flag.id}>
                <td>
                  <strong>{flag.name}</strong>
                  <small>{flag.key}</small>
                </td>
                <td>
                  <Chip tone={statusTone(flag.status)}>{flag.status}</Chip>
                </td>
                <td>
                  <Chip tone={riskTone(flag.riskLevel)}>{flag.riskLevel}</Chip>
                </td>
                <td>
                  <div className="devflags-table-rollout">
                    <span>{flag.rolloutPercent}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={flag.rolloutPercent}
                      onChange={(event) => onRollout(flag, Number(event.target.value))}
                    />
                  </div>
                </td>
                <td>{flag.category}</td>
                <td>{flag.environments.join(", ")}</td>
                <td>
                  {flag.targetRoles.length ? flag.targetRoles.join(", ") : "All roles"}
                  {" · "}
                  {flag.targetPlans.length ? flag.targetPlans.join(", ") : "All plans"}
                </td>
                <td>{dateText(flag.updatedAt)}</td>
                <td>
                  <div className="devflags-table-actions">
                    <button type="button" onClick={() => onEdit(flag)}>
                      Edit
                    </button>

                    {flag.status === "enabled" ? (
                      <button type="button" onClick={() => onStatus(flag, "disabled")}>
                        Disable
                      </button>
                    ) : (
                      <button type="button" onClick={() => onStatus(flag, "enabled")}>
                        Enable
                      </button>
                    )}

                    <button type="button" className="danger" onClick={() => onDelete(flag)}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!flags.length && <Empty text="No feature flags match your filters." />}
    </section>
  );
}

function AnalyticsView({
  statusChart,
  categoryChart,
  riskChart,
  rolloutChart,
}: {
  statusChart: ChartRow[];
  categoryChart: ChartRow[];
  riskChart: ChartRow[];
  rolloutChart: ChartRow[];
}) {
  return (
    <section className="devflags-chart-grid">
      <ChartCard title="Flag Status" description="Enabled, disabled and archived feature flags.">
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

      <ChartCard title="Categories" description="Flags grouped by product area.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={categoryChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={110} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Risk Levels" description="Low, medium and high-risk release controls.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie
              data={riskChart}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
            >
              {riskChart.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={riskChart} />
      </ChartCard>

      <ChartCard title="Rollout Distribution" description="How widely features are exposed.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rolloutChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--dev-primary)" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ======================================================
// MODAL
// ======================================================

function FlagModal({
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  form: FlagForm;
  setForm: React.Dispatch<React.SetStateAction<FlagForm>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const setField = <K extends keyof FlagForm>(key: K, value: FlagForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && !current.key ? { key: slugify(String(value)) } : {}),
    }));
  };

  return (
    <div className="devflags-modal-backdrop" role="dialog" aria-modal="true">
      <form className="devflags-modal" onSubmit={onSubmit}>
        <div className="devflags-modal-head">
          <div>
            <h2>{form.id ? "Edit Feature Flag" : "Create Feature Flag"}</h2>
            <p>Control rollout, environments and target users for this feature.</p>
          </div>

          <button type="button" onClick={onClose} disabled={saving} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="devflags-form-grid">
          <label>
            Feature name
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="New report analytics"
              required
            />
          </label>

          <label>
            Feature key
            <input
              value={form.key}
              onChange={(event) => setField("key", slugify(event.target.value))}
              placeholder="new_report_analytics"
              required
            />
          </label>

          <label>
            Owner
            <input
              value={form.owner}
              onChange={(event) => setField("owner", event.target.value)}
              placeholder="developer@example.com"
            />
          </label>

          <label>
            Category
            <select value={form.category} onChange={(event) => setField("category", event.target.value as FlagCategory)}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select value={form.status} onChange={(event) => setField("status", event.target.value as FlagStatus)}>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label>
            Risk level
            <select value={form.riskLevel} onChange={(event) => setField("riskLevel", event.target.value as FlagForm["riskLevel"])}>
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
            </select>
          </label>

          <label>
            Rollout percentage
            <input
              type="number"
              min="0"
              max="100"
              value={form.rolloutPercent}
              onChange={(event) => setField("rolloutPercent", event.target.value)}
            />
          </label>

          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Describe what this feature unlocks and when it should be enabled."
              rows={3}
            />
          </label>
        </div>

        <section className="devflags-target-editor">
          <EditorGroup title="Environments" description="Where this feature may run.">
            {ENVIRONMENTS.map((environment) => (
              <label key={environment} className="devflags-toggle">
                <input
                  type="checkbox"
                  checked={form.environments.includes(environment)}
                  onChange={() =>
                    setField("environments", toggleListValue(form.environments, environment))
                  }
                />
                <span>{environment}</span>
              </label>
            ))}
          </EditorGroup>

          <EditorGroup title="Target roles" description="Leave empty to target all roles.">
            {TARGET_ROLES.map((role) => (
              <label key={role} className="devflags-toggle">
                <input
                  type="checkbox"
                  checked={form.targetRoles.includes(role)}
                  onChange={() => setField("targetRoles", toggleListValue(form.targetRoles, role))}
                />
                <span>{role}</span>
              </label>
            ))}
          </EditorGroup>

          <EditorGroup title="Target plans" description="Leave empty to target all subscription plans.">
            {TARGET_PLANS.map((plan) => (
              <label key={plan} className="devflags-toggle">
                <input
                  type="checkbox"
                  checked={form.targetPlans.includes(plan)}
                  onChange={() => setField("targetPlans", toggleListValue(form.targetPlans, plan))}
                />
                <span>{plan}</span>
              </label>
            ))}
          </EditorGroup>
        </section>

        <div className="devflags-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Flag"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditorGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="devflags-editor-group">
      <h3>{title}</h3>
      <p>{description}</p>
      <div>{children}</div>
    </article>
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
    <article className="devflags-stat">
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
  return <span className={`devflags-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="devflags-empty">{text}</div>;
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
    <section className="devflags-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="devflags-legend">
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
@keyframes devflagsSpin { to { transform: rotate(360deg); } }

.devflags-page {
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

.devflags-page *,
.devflags-page *::before,
.devflags-page *::after {
  box-sizing: border-box;
}

.devflags-page button,
.devflags-page input,
.devflags-page select,
.devflags-page textarea {
  font: inherit;
  max-width: 100%;
}

.devflags-page button {
  -webkit-tap-highlight-color: transparent;
}

.devflags-state {
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

.devflags-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devflags-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.devflags-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--dev-primary) 18%, transparent);
  border-top-color: var(--dev-primary);
  animation: devflagsSpin .8s linear infinite;
}

.devflags-hero {
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

.devflags-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.devflags-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.devflags-hero p {
  max-width: 780px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.devflags-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.devflags-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.devflags-switch button {
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

.devflags-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.devflags-white-btn,
.devflags-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.devflags-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.devflags-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.devflags-glass-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.devflags-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.devflags-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.devflags-alert.success {
  background: #dcfce7;
  color: #166534;
}

.devflags-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devflags-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devflags-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devflags-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.devflags-stat small {
  display: block;
  margin-top: 8px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devflags-toolbar {
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

.devflags-toolbar input,
.devflags-toolbar select {
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

.devflags-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--dev-primary) 10%, white);
  color: var(--dev-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.devflags-card-grid,
.devflags-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devflags-flag-card,
.devflags-chart-card,
.devflags-table-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devflags-flag-card.disabled {
  opacity: .78;
}

.devflags-flag-card.archived {
  background: linear-gradient(180deg, #fff, #f8fafc);
}

.devflags-flag-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.devflags-flag-icon {
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

.devflags-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.devflags-flag-card h2 {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devflags-flag-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.45;
}

.devflags-key {
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

.devflags-rollout {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--dev-primary) 7%, white);
}

.devflags-rollout div {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.devflags-rollout strong {
  font-size: 28px;
  line-height: .9;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.devflags-rollout span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 900;
}

.devflags-rollout input,
.devflags-table-rollout input {
  width: 100%;
  accent-color: var(--dev-primary);
}

.devflags-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.devflags-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
}

.devflags-mini-grid b {
  display: block;
  color: var(--muted, #64748b);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.devflags-actions,
.devflags-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.devflags-actions {
  margin-top: 14px;
}

.devflags-actions button,
.devflags-table-actions button {
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

.devflags-actions button:first-child,
.devflags-table-actions button:first-child {
  background: var(--dev-primary);
  color: #fff;
}

.devflags-actions button.danger,
.devflags-table-actions button.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.devflags-chip {
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

.devflags-chip.green { background: #dcfce7; color: #166534; }
.devflags-chip.blue { background: #dbeafe; color: #1d4ed8; }
.devflags-chip.purple { background: #f3e8ff; color: #7e22ce; }
.devflags-chip.orange { background: #ffedd5; color: #c2410c; }
.devflags-chip.red { background: #fee2e2; color: #b91c1c; }
.devflags-chip.gray { background: #f1f5f9; color: #475569; }

.devflags-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.devflags-table-wrap table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
}

.devflags-table-wrap th {
  text-align: left;
  color: var(--muted, #64748b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.devflags-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.devflags-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.devflags-table-wrap small {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
}

.devflags-table-rollout {
  display: grid;
  gap: 6px;
  width: 160px;
}

.devflags-table-rollout span {
  font-weight: 1000;
}

.devflags-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devflags-chart-card p {
  margin: 5px 0 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devflags-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.devflags-legend span {
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

.devflags-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.devflags-empty {
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

.devflags-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.devflags-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: var(--surface, #fff);
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.devflags-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.devflags-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devflags-modal-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devflags-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.devflags-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.devflags-form-grid label,
.devflags-target-editor {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
}

.devflags-form-grid input,
.devflags-form-grid select,
.devflags-form-grid textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .32);
  border-radius: 16px;
  background: #fff;
  color: #0f172a;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 800;
}

.devflags-form-grid input,
.devflags-form-grid select {
  min-height: 42px;
}

.devflags-form-grid textarea {
  resize: vertical;
}

.devflags-target-editor {
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
}

.devflags-editor-group {
  padding: 12px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .18);
}

.devflags-editor-group + .devflags-editor-group {
  margin-top: 10px;
}

.devflags-editor-group h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.devflags-editor-group p {
  margin: 4px 0 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.devflags-editor-group > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.devflags-toggle {
  display: inline-flex !important;
  align-items: center;
  gap: 8px !important;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.devflags-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--dev-primary);
}

.devflags-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--surface, #fff) 70%, transparent);
}

.devflags-modal-actions button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.devflags-modal-actions button:first-child {
  background: #f1f5f9;
  color: #0f172a;
}

.devflags-modal-actions button:last-child {
  background: var(--dev-primary);
  color: #fff;
}

.devflags-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

@media (min-width: 520px) {
  .devflags-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devflags-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devflags-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .devflags-card-grid,
  .devflags-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devflags-form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .devflags-form-grid .wide {
    grid-column: 1 / -1;
  }

  .devflags-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .devflags-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .devflags-page {
    padding: 14px;
  }

  .devflags-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .devflags-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .devflags-toolbar {
    grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)) auto;
  }

  .devflags-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .devflags-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
