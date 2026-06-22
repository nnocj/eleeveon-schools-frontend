"use client";

/**
 * app/developer/modules/DeveloperReleases.tsx
 * ---------------------------------------------------------
 * DEVELOPER RELEASE MANAGEMENT
 * ---------------------------------------------------------
 * Real release and deployment management module for the developer portal.
 *
 * Purpose:
 * - Manage platform releases, versions, changelogs and deployment status.
 * - Track environments, rollout percentage, rollback state and approval.
 * - Create/edit/delete release records.
 * - Start rollout, mark deployed, request rollback and mark rollback completed.
 * - Show cards, table and analytics views.
 * - Use backend endpoints where available.
 * - Fall back to localStorage so it works before backend endpoints exist.
 *
 * Expected backend endpoints, when available:
 * GET    /developer/releases
 * POST   /developer/releases
 * PATCH  /developer/releases/:id
 * DELETE /developer/releases/:id
 * POST   /developer/releases/:id/deploy
 * POST   /developer/releases/:id/rollback
 *
 * Supported response shapes:
 * []
 * { data: [] }
 * { releases: [] }
 * { items: [] }
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

type ReleaseStatus =
  | "draft"
  | "scheduled"
  | "in_review"
  | "approved"
  | "deploying"
  | "deployed"
  | "failed"
  | "rollback_requested"
  | "rolled_back";

type ReleaseType = "major" | "minor" | "patch" | "hotfix" | "security";
type ReleaseEnvironment = "development" | "staging" | "production";
type ReleaseRisk = "low" | "medium" | "high" | "critical";

type ReleaseRecord = {
  id: string;
  version: string;
  title: string;
  type: ReleaseType;
  status: ReleaseStatus;
  environment: ReleaseEnvironment;
  risk: ReleaseRisk;
  branchName?: string | null;
  commitSha?: string | null;
  changelog: string;
  releaseNotes?: string | null;
  approvedBy?: string | null;
  deployedBy?: string | null;
  rollbackReason?: string | null;
  rolloutPercent: number;
  testsPassed: number;
  testsFailed: number;
  bugsFixed: number;
  featuresAdded: number;
  breakingChanges: number;
  scheduledAt?: string | number | null;
  approvedAt?: string | number | null;
  deployedAt?: string | number | null;
  rolledBackAt?: string | number | null;
  createdAt: string | number;
  updatedAt: string | number;
};

type ReleaseForm = {
  id?: string;
  version: string;
  title: string;
  type: ReleaseType;
  status: ReleaseStatus;
  environment: ReleaseEnvironment;
  risk: ReleaseRisk;
  branchName: string;
  commitSha: string;
  changelog: string;
  releaseNotes: string;
  approvedBy: string;
  deployedBy: string;
  rolloutPercent: string;
  testsPassed: string;
  testsFailed: string;
  bugsFixed: string;
  featuresAdded: string;
  breakingChanges: string;
  scheduledAt: string;
};

type ChartRow = {
  label: string;
  value: number;
};

// ======================================================
// CONSTANTS
// ======================================================

const STORAGE_KEY = "eleeveon_developer_releases";

const STATUSES: ReleaseStatus[] = [
  "draft",
  "scheduled",
  "in_review",
  "approved",
  "deploying",
  "deployed",
  "failed",
  "rollback_requested",
  "rolled_back",
];

const TYPES: ReleaseType[] = ["major", "minor", "patch", "hotfix", "security"];

const ENVIRONMENTS: ReleaseEnvironment[] = ["development", "staging", "production"];

const RISKS: ReleaseRisk[] = ["low", "medium", "high", "critical"];

const EMPTY_FORM: ReleaseForm = {
  version: "",
  title: "",
  type: "patch",
  status: "draft",
  environment: "staging",
  risk: "low",
  branchName: "",
  commitSha: "",
  changelog: "",
  releaseNotes: "",
  approvedBy: "",
  deployedBy: "",
  rolloutPercent: "0",
  testsPassed: "0",
  testsFailed: "0",
  bugsFixed: "0",
  featuresAdded: "0",
  breakingChanges: "0",
  scheduledAt: "",
};

const SEED_RELEASES: ReleaseRecord[] = [
  {
    id: "release-1",
    version: "1.0.0",
    title: "Developer Portal Foundation",
    type: "major",
    status: "deployed",
    environment: "production",
    risk: "medium",
    branchName: "main",
    commitSha: "a1b2c3d",
    changelog:
      "Initial developer portal with dashboard, database tools, backups, integrations and system diagnostics.",
    releaseNotes: "First stable developer portal release.",
    approvedBy: "developer",
    deployedBy: "developer",
    rollbackReason: null,
    rolloutPercent: 100,
    testsPassed: 38,
    testsFailed: 0,
    bugsFixed: 12,
    featuresAdded: 9,
    breakingChanges: 0,
    scheduledAt: Date.now() - 86400000 * 9,
    approvedAt: Date.now() - 86400000 * 8,
    deployedAt: Date.now() - 86400000 * 8,
    rolledBackAt: null,
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 86400000 * 8,
  },
  {
    id: "release-2",
    version: "1.1.0",
    title: "SQL Console Backend",
    type: "minor",
    status: "approved",
    environment: "staging",
    risk: "high",
    branchName: "feature/developer-sql",
    commitSha: "d4e5f6a",
    changelog:
      "Adds protected SQL console backend endpoints with read-only mode, query history and audit IDs.",
    releaseNotes: "Requires backend module import before use.",
    approvedBy: "developer",
    deployedBy: "",
    rollbackReason: null,
    rolloutPercent: 0,
    testsPassed: 24,
    testsFailed: 1,
    bugsFixed: 4,
    featuresAdded: 3,
    breakingChanges: 0,
    scheduledAt: Date.now() + 86400000 * 1,
    approvedAt: Date.now() - 3600000 * 6,
    deployedAt: null,
    rolledBackAt: null,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 3600000 * 6,
  },
  {
    id: "release-3",
    version: "1.1.1",
    title: "Payment Checkout Polish",
    type: "patch",
    status: "scheduled",
    environment: "staging",
    risk: "low",
    branchName: "fix/payment-checkout",
    commitSha: "b7c8d9e",
    changelog: "Improves checkout modal scrolling, close behavior, mobile UX and accessibility.",
    releaseNotes: "Safe UI-only release.",
    approvedBy: "",
    deployedBy: "",
    rollbackReason: null,
    rolloutPercent: 0,
    testsPassed: 17,
    testsFailed: 0,
    bugsFixed: 5,
    featuresAdded: 1,
    breakingChanges: 0,
    scheduledAt: Date.now() + 86400000 * 2,
    approvedAt: null,
    deployedAt: null,
    rolledBackAt: null,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000 * 3,
  },
];

const chartColors = [
  "var(--release-primary)",
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

const dateInputValue = (value?: string | number | null) => {
  const time = safeTime(value);
  if (!time) return "";
  return new Date(time).toISOString().slice(0, 16);
};

const compact = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const clampNumber = (value: string | number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
};

const labelize = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const statusTone = (status?: string): Tone => {
  const key = String(status || "").toLowerCase();

  if (key === "deployed" || key === "approved") return "green";
  if (key === "deploying" || key === "scheduled" || key === "in_review") return "blue";
  if (key === "rollback_requested") return "orange";
  if (key === "failed" || key === "rolled_back") return "red";
  return "gray";
};

const riskTone = (risk?: string): Tone => {
  if (risk === "low") return "green";
  if (risk === "medium") return "blue";
  if (risk === "high") return "orange";
  if (risk === "critical") return "red";
  return "gray";
};

const typeTone = (type?: string): Tone => {
  if (type === "major") return "purple";
  if (type === "minor") return "blue";
  if (type === "patch") return "green";
  if (type === "hotfix") return "orange";
  if (type === "security") return "red";
  return "gray";
};

const releaseHealth = (row: ReleaseRecord) => {
  const tests = row.testsPassed + row.testsFailed;
  const testScore = tests ? Math.round((row.testsPassed / tests) * 100) : 70;
  const riskPenalty = row.risk === "critical" ? 30 : row.risk === "high" ? 18 : row.risk === "medium" ? 8 : 0;
  const breakingPenalty = row.breakingChanges * 8;
  const statusPenalty = row.status === "failed" ? 45 : row.status === "rollback_requested" ? 35 : row.status === "rolled_back" ? 50 : 0;

  return Math.max(0, Math.min(100, testScore - riskPenalty - breakingPenalty - statusPenalty));
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

const normalizeRelease = (raw: any, index: number): ReleaseRecord => {
  const now = Date.now();

  return {
    id: String(raw.id || raw.localId || raw.releaseId || `release-${index}-${now}`),
    version: raw.version || raw.tag || `0.0.${index + 1}`,
    title: raw.title || raw.name || `Release ${index + 1}`,
    type: TYPES.includes(raw.type) ? raw.type : "patch",
    status: STATUSES.includes(raw.status) ? raw.status : "draft",
    environment: ENVIRONMENTS.includes(raw.environment) ? raw.environment : "staging",
    risk: RISKS.includes(raw.risk) ? raw.risk : "low",
    branchName: raw.branchName || raw.branch || null,
    commitSha: raw.commitSha || raw.commit || null,
    changelog: raw.changelog || raw.description || "",
    releaseNotes: raw.releaseNotes || raw.notes || null,
    approvedBy: raw.approvedBy || null,
    deployedBy: raw.deployedBy || null,
    rollbackReason: raw.rollbackReason || null,
    rolloutPercent: Number(raw.rolloutPercent || raw.rollout || 0),
    testsPassed: Number(raw.testsPassed || raw.passedTests || 0),
    testsFailed: Number(raw.testsFailed || raw.failedTests || 0),
    bugsFixed: Number(raw.bugsFixed || 0),
    featuresAdded: Number(raw.featuresAdded || raw.features || 0),
    breakingChanges: Number(raw.breakingChanges || 0),
    scheduledAt: raw.scheduledAt || null,
    approvedAt: raw.approvedAt || null,
    deployedAt: raw.deployedAt || null,
    rolledBackAt: raw.rolledBackAt || null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
  };
};

const formFromRelease = (row: ReleaseRecord): ReleaseForm => ({
  id: row.id,
  version: row.version,
  title: row.title,
  type: row.type,
  status: row.status,
  environment: row.environment,
  risk: row.risk,
  branchName: row.branchName || "",
  commitSha: row.commitSha || "",
  changelog: row.changelog,
  releaseNotes: row.releaseNotes || "",
  approvedBy: row.approvedBy || "",
  deployedBy: row.deployedBy || "",
  rolloutPercent: String(row.rolloutPercent || 0),
  testsPassed: String(row.testsPassed || 0),
  testsFailed: String(row.testsFailed || 0),
  bugsFixed: String(row.bugsFixed || 0),
  featuresAdded: String(row.featuresAdded || 0),
  breakingChanges: String(row.breakingChanges || 0),
  scheduledAt: dateInputValue(row.scheduledAt),
});

const releaseFromForm = (form: ReleaseForm): ReleaseRecord => {
  const now = Date.now();

  return {
    id: form.id || `release-${now}`,
    version: form.version.trim(),
    title: form.title.trim(),
    type: form.type,
    status: form.status,
    environment: form.environment,
    risk: form.risk,
    branchName: form.branchName.trim() || null,
    commitSha: form.commitSha.trim() || null,
    changelog: form.changelog.trim(),
    releaseNotes: form.releaseNotes.trim() || null,
    approvedBy: form.approvedBy.trim() || null,
    deployedBy: form.deployedBy.trim() || null,
    rollbackReason: null,
    rolloutPercent: clampNumber(form.rolloutPercent, 0, 100),
    testsPassed: clampNumber(form.testsPassed),
    testsFailed: clampNumber(form.testsFailed),
    bugsFixed: clampNumber(form.bugsFixed),
    featuresAdded: clampNumber(form.featuresAdded),
    breakingChanges: clampNumber(form.breakingChanges),
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).getTime() : null,
    approvedAt: form.status === "approved" ? now : null,
    deployedAt: form.status === "deployed" ? now : null,
    rolledBackAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

const loadLocalRows = (): ReleaseRecord[] => {
  if (typeof window === "undefined") return SEED_RELEASES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_RELEASES));
      return SEED_RELEASES;
    }

    const rows = toArray<any>(JSON.parse(raw), ["releases", "items", "data"]).map(normalizeRelease);
    return rows.length ? rows : SEED_RELEASES;
  } catch {
    return SEED_RELEASES;
  }
};

const saveLocalRows = (rows: ReleaseRecord[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
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

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperReleases({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "#2563eb";

  const [view, setView] = useState<ViewMode>("cards");
  const [rows, setRows] = useState<ReleaseRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseRecord | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [form, setForm] = useState<ReleaseForm>(EMPTY_FORM);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");

      const response = await apiClient<any>("/developer/releases").catch(async () =>
        apiClient<any>("/releases").catch(() => null)
      );

      const apiRows = toArray<any>(response, ["releases", "items", "data"]).map(normalizeRelease);

      if (apiRows.length) {
        setRows(apiRows);
        saveLocalRows(apiRows);
      } else {
        setRows(loadLocalRows());
      }
    } catch (err: any) {
      setError(err?.message || "Could not load releases. Showing local saved records.");
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

  // ======================================================
  // DERIVED
  // ======================================================

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows
      .filter((row) => {
        const haystack = `${row.version} ${row.title} ${row.type} ${row.status} ${
          row.environment
        } ${row.risk} ${row.branchName || ""} ${row.commitSha || ""} ${row.changelog} ${
          row.releaseNotes || ""
        }`.toLowerCase();

        const searchOk = !term || haystack.includes(term);
        const statusOk = statusFilter === "all" || row.status === statusFilter;
        const typeOk = typeFilter === "all" || row.type === typeFilter;
        const envOk = environmentFilter === "all" || row.environment === environmentFilter;
        const riskOk = riskFilter === "all" || row.risk === riskFilter;

        return searchOk && statusOk && typeOk && envOk && riskOk;
      })
      .sort((a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt));
  }, [rows, query, statusFilter, typeFilter, environmentFilter, riskFilter]);

  const deployedCount = rows.filter((row) => row.status === "deployed").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const rollbackCount = rows.filter((row) =>
    ["rollback_requested", "rolled_back"].includes(row.status)
  ).length;
  const scheduledCount = rows.filter((row) =>
    ["scheduled", "approved", "deploying"].includes(row.status)
  ).length;
  const totalFeatures = rows.reduce((sum, row) => sum + row.featuresAdded, 0);
  const totalBugs = rows.reduce((sum, row) => sum + row.bugsFixed, 0);
  const avgHealth = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + releaseHealth(row), 0) / rows.length)
    : 0;

  const statusData = useMemo<ChartRow[]>(
    () => countBy(rows, (row) => labelize(row.status)),
    [rows]
  );

  const typeData = useMemo<ChartRow[]>(
    () => countBy(rows, (row) => labelize(row.type)),
    [rows]
  );

  const envData = useMemo<ChartRow[]>(
    () => countBy(rows, (row) => labelize(row.environment)),
    [rows]
  );

  const riskData = useMemo<ChartRow[]>(
    () => countBy(rows, (row) => labelize(row.risk)),
    [rows]
  );

  const trendData = useMemo<ChartRow[]>(() => {
    const labels = monthLabels(6);
    const map = new Map(labels.map((label) => [label, 0]));

    rows.forEach((row) => {
      const key = monthKey(row.deployedAt || row.createdAt);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });

    return labels.map((label) => ({
      label,
      value: map.get(label) || 0,
    }));
  }, [rows]);

  const impactData = useMemo<ChartRow[]>(
    () => [
      { label: "Features", value: totalFeatures },
      { label: "Bug Fixes", value: totalBugs },
      { label: "Breaking", value: rows.reduce((sum, row) => sum + row.breakingChanges, 0) },
      { label: "Failed Tests", value: rows.reduce((sum, row) => sum + row.testsFailed, 0) },
    ],
    [rows, totalFeatures, totalBugs]
  );

  // ======================================================
  // ACTIONS
  // ======================================================

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row: ReleaseRecord) => {
    setError("");
    setNotice("");
    setForm(formFromRelease(row));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const saveRelease = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.version.trim()) {
      setError("Version is required.");
      return;
    }

    if (!form.title.trim()) {
      setError("Release title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const payload = releaseFromForm(form);

      if (form.id) {
        const response = await apiClient<any>(`/developer/releases/${form.id}`, {
          method: "PATCH",
          body: payload,
        } as any).catch(async () =>
          apiClient<any>(`/releases/${form.id}`, {
            method: "PATCH",
            body: payload,
          } as any).catch(() => null)
        );

        const updated = normalizeRelease(response?.release || response?.data || response || payload, 0);

        setRows((current) => {
          const next = current.map((item) =>
            item.id === form.id
              ? {
                  ...item,
                  ...updated,
                  id: form.id,
                  createdAt: item.createdAt,
                  updatedAt: Date.now(),
                }
              : item
          );
          saveLocalRows(next);
          return next;
        });

        setNotice("Release updated.");
      } else {
        const response = await apiClient<any>("/developer/releases", {
          method: "POST",
          body: payload,
        } as any).catch(async () =>
          apiClient<any>("/releases", {
            method: "POST",
            body: payload,
          } as any).catch(() => null)
        );

        const created = normalizeRelease(response?.release || response?.data || response || payload, 0);

        setRows((current) => {
          const next = [created, ...current];
          saveLocalRows(next);
          return next;
        });

        setNotice("Release created.");
      }

      closeModal();
    } catch (err: any) {
      setError(err?.message || "Could not save release.");
    } finally {
      setSaving(false);
    }
  };

  const patchRelease = async (
    row: ReleaseRecord,
    patch: Partial<ReleaseRecord>,
    success: string
  ) => {
    try {
      setError("");
      setNotice("");

      const updated = {
        ...row,
        ...patch,
        updatedAt: Date.now(),
      };

      await apiClient<any>(`/developer/releases/${row.id}`, {
        method: "PATCH",
        body: patch,
      } as any).catch(async () =>
        apiClient<any>(`/releases/${row.id}`, {
          method: "PATCH",
          body: patch,
        } as any).catch(() => null)
      );

      setRows((current) => {
        const next = current.map((item) => (item.id === row.id ? updated : item));
        saveLocalRows(next);
        return next;
      });

      setNotice(success);
    } catch (err: any) {
      setError(err?.message || "Could not update release.");
    }
  };

  const approveRelease = (row: ReleaseRecord) => {
    patchRelease(
      row,
      {
        status: "approved",
        approvedAt: Date.now(),
        approvedBy: row.approvedBy || "developer",
      },
      "Release approved."
    );
  };

  const deployRelease = async (row: ReleaseRecord) => {
    try {
      setError("");
      setNotice("");

      await patchRelease(
        row,
        {
          status: "deploying",
          rolloutPercent: Math.max(10, row.rolloutPercent),
        },
        "Deployment started."
      );

      await apiClient<any>(`/developer/releases/${row.id}/deploy`, {
        method: "POST",
        body: {
          id: row.id,
          version: row.version,
          environment: row.environment,
        },
      } as any).catch(async () =>
        apiClient<any>(`/releases/${row.id}/deploy`, {
          method: "POST",
          body: {
            id: row.id,
            version: row.version,
            environment: row.environment,
          },
        } as any).catch(() => null)
      );

      await patchRelease(
        row,
        {
          status: "deployed",
          rolloutPercent: 100,
          deployedAt: Date.now(),
          deployedBy: row.deployedBy || "developer",
        },
        "Release deployed."
      );
    } catch (err: any) {
      await patchRelease(
        row,
        {
          status: "failed",
        },
        err?.message || "Deployment failed."
      );
    }
  };

  const requestRollback = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!rollbackTarget) return;

    try {
      setError("");
      setNotice("");

      await apiClient<any>(`/developer/releases/${rollbackTarget.id}/rollback`, {
        method: "POST",
        body: {
          reason: rollbackReason,
        },
      } as any).catch(async () =>
        apiClient<any>(`/releases/${rollbackTarget.id}/rollback`, {
          method: "POST",
          body: {
            reason: rollbackReason,
          },
        } as any).catch(() => null)
      );

      await patchRelease(
        rollbackTarget,
        {
          status: "rollback_requested",
          rollbackReason: rollbackReason.trim() || "Rollback requested from developer portal.",
        },
        "Rollback requested."
      );

      setRollbackTarget(null);
      setRollbackReason("");
    } catch (err: any) {
      setError(err?.message || "Could not request rollback.");
    }
  };

  const markRolledBack = (row: ReleaseRecord) => {
    patchRelease(
      row,
      {
        status: "rolled_back",
        rolloutPercent: 0,
        rolledBackAt: Date.now(),
      },
      "Release marked as rolled back."
    );
  };

  const deleteRelease = async (row: ReleaseRecord) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Delete release "${row.version} - ${row.title}"?`);

    if (!confirmed) return;

    try {
      setError("");
      setNotice("");

      await apiClient<any>(`/developer/releases/${row.id}`, {
        method: "DELETE",
      } as any).catch(async () =>
        apiClient<any>(`/releases/${row.id}`, {
          method: "DELETE",
        } as any).catch(() => null)
      );

      setRows((current) => {
        const next = current.filter((item) => item.id !== row.id);
        saveLocalRows(next);
        return next;
      });

      setNotice("Release deleted.");
    } catch (err: any) {
      setError(err?.message || "Could not delete release.");
    }
  };

  const exportReleases = () => {
    downloadJson("eleeveon-releases.json", {
      exportedAt: new Date().toISOString(),
      releases: rows,
    });
    setNotice("Releases exported.");
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main
        className="release-page"
        style={{ "--release-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="release-state">
          <div className="release-spinner" />
          <h2>Loading releases...</h2>
          <p>Preparing deployment pipeline, changelogs and rollback history.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main
        className="release-page"
        style={{ "--release-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="release-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to manage platform releases.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main
      className="release-page"
      style={{ "--release-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section className="release-hero">
        <div>
          <span className="release-eyebrow">Deployment pipeline</span>
          <h1>Release Management</h1>
          <p>
            Track versions, changelogs, approvals, deployments, rollout progress and rollback
            operations across the Eleeveon platform.
          </p>
        </div>

        <div className="release-hero-actions">
          <div className="release-switch">
            <button
              type="button"
              className={view === "cards" ? "active" : ""}
              onClick={() => setView("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={view === "analytics" ? "active" : ""}
              onClick={() => setView("analytics")}
            >
              Charts
            </button>
          </div>

          <button type="button" className="release-white-btn" onClick={openCreate}>
            New Release
          </button>

          <button type="button" className="release-glass-btn" onClick={exportReleases}>
            Export
          </button>

          <button
            type="button"
            className="release-glass-btn"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`release-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="release-stat-grid">
        <StatCard label="Releases" value={rows.length} detail={`${filtered.length} shown`} icon="🚀" />
        <StatCard label="Deployed" value={deployedCount} detail={`${scheduledCount} in pipeline`} icon="✅" />
        <StatCard label="Issues" value={failedCount + rollbackCount} detail={`${rollbackCount} rollback states`} icon="⚠️" />
        <StatCard label="Health" value={`${avgHealth}%`} detail={`${totalFeatures} features · ${totalBugs} fixes`} icon="📈" />
      </section>

      <section className="release-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search version, title, branch, commit, changelog..."
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {labelize(status)}
            </option>
          ))}
        </select>

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {labelize(type)}
            </option>
          ))}
        </select>

        <select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}>
          <option value="all">All environments</option>
          {ENVIRONMENTS.map((environment) => (
            <option key={environment} value={environment}>
              {labelize(environment)}
            </option>
          ))}
        </select>

        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
          <option value="all">All risks</option>
          {RISKS.map((risk) => (
            <option key={risk} value={risk}>
              {labelize(risk)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
            setTypeFilter("all");
            setEnvironmentFilter("all");
            setRiskFilter("all");
          }}
        >
          Reset
        </button>
      </section>

      {view === "analytics" ? (
        <AnalyticsView
          statusData={statusData}
          typeData={typeData}
          envData={envData}
          riskData={riskData}
          trendData={trendData}
          impactData={impactData}
        />
      ) : view === "table" ? (
        <TableView
          rows={filtered}
          onEdit={openEdit}
          onApprove={approveRelease}
          onDeploy={deployRelease}
          onRollback={(row) => {
            setRollbackTarget(row);
            setRollbackReason(row.rollbackReason || "");
          }}
          onRolledBack={markRolledBack}
          onDelete={deleteRelease}
        />
      ) : (
        <CardsView
          rows={filtered}
          onEdit={openEdit}
          onApprove={approveRelease}
          onDeploy={deployRelease}
          onRollback={(row) => {
            setRollbackTarget(row);
            setRollbackReason(row.rollbackReason || "");
          }}
          onRolledBack={markRolledBack}
          onDelete={deleteRelease}
          navigate={navigate}
        />
      )}

      {modalOpen && (
        <ReleaseModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={closeModal}
          onSubmit={saveRelease}
        />
      )}

      {rollbackTarget && (
        <RollbackModal
          release={rollbackTarget}
          reason={rollbackReason}
          setReason={setRollbackReason}
          onClose={() => setRollbackTarget(null)}
          onSubmit={requestRollback}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  rows,
  onEdit,
  onApprove,
  onDeploy,
  onRollback,
  onRolledBack,
  onDelete,
  navigate,
}: {
  rows: ReleaseRecord[];
  onEdit: (row: ReleaseRecord) => void;
  onApprove: (row: ReleaseRecord) => void;
  onDeploy: (row: ReleaseRecord) => void;
  onRollback: (row: ReleaseRecord) => void;
  onRolledBack: (row: ReleaseRecord) => void;
  onDelete: (row: ReleaseRecord) => void;
  navigate?: (key: string) => void;
}) {
  return (
    <section className="release-card-grid">
      {rows.map((row) => (
        <article key={row.id} className={`release-card ${row.status}`}>
          <div className="release-card-top">
            <span className="release-avatar">{iconForType(row.type)}</span>

            <div className="release-chip-row">
              <Chip tone={statusTone(row.status)}>{labelize(row.status)}</Chip>
              <Chip tone={riskTone(row.risk)}>{labelize(row.risk)}</Chip>
            </div>
          </div>

          <h2>{row.version}</h2>
          <p>{row.title}</p>

          <div className="release-progress">
            <span style={{ width: `${row.rolloutPercent}%` }} />
          </div>

          <div className="release-mini-grid">
            <span>
              <b>Type</b>
              {labelize(row.type)}
            </span>
            <span>
              <b>Environment</b>
              {labelize(row.environment)}
            </span>
            <span>
              <b>Rollout</b>
              {row.rolloutPercent}%
            </span>
            <span>
              <b>Health</b>
              {releaseHealth(row)}%
            </span>
            <span>
              <b>Tests</b>
              {row.testsPassed} passed · {row.testsFailed} failed
            </span>
            <span>
              <b>Updated</b>
              {timeText(row.updatedAt)}
            </span>
          </div>

          <div className="release-pills">
            {row.branchName && <span>{row.branchName}</span>}
            {row.commitSha && <span>{row.commitSha}</span>}
            {row.featuresAdded > 0 && <span>{row.featuresAdded} features</span>}
            {row.bugsFixed > 0 && <span>{row.bugsFixed} fixes</span>}
            {row.breakingChanges > 0 && <span>{row.breakingChanges} breaking</span>}
          </div>

          <p className="release-changelog">{row.changelog || "No changelog added."}</p>

          <div className="release-actions">
            <button type="button" onClick={() => onEdit(row)}>
              Edit
            </button>
            {row.status !== "approved" && row.status !== "deployed" && (
              <button type="button" onClick={() => onApprove(row)}>
                Approve
              </button>
            )}
            {row.status !== "deployed" && row.status !== "rolled_back" && (
              <button type="button" onClick={() => onDeploy(row)}>
                Deploy
              </button>
            )}
            {["deployed", "failed"].includes(row.status) && (
              <button type="button" onClick={() => onRollback(row)}>
                Rollback
              </button>
            )}
            {row.status === "rollback_requested" && (
              <button type="button" onClick={() => onRolledBack(row)}>
                Mark Rolled Back
              </button>
            )}
            <button type="button" onClick={() => navigate?.("auditLogs")}>
              Audit
            </button>
            <button type="button" className="danger" onClick={() => onDelete(row)}>
              Delete
            </button>
          </div>
        </article>
      ))}

      {!rows.length && <Empty text="No releases match your filters." />}
    </section>
  );
}

function TableView({
  rows,
  onEdit,
  onApprove,
  onDeploy,
  onRollback,
  onRolledBack,
  onDelete,
}: {
  rows: ReleaseRecord[];
  onEdit: (row: ReleaseRecord) => void;
  onApprove: (row: ReleaseRecord) => void;
  onDeploy: (row: ReleaseRecord) => void;
  onRollback: (row: ReleaseRecord) => void;
  onRolledBack: (row: ReleaseRecord) => void;
  onDelete: (row: ReleaseRecord) => void;
}) {
  return (
    <section className="release-table-card">
      <div className="release-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Release</th>
              <th>Status</th>
              <th>Type</th>
              <th>Environment</th>
              <th>Risk</th>
              <th>Rollout</th>
              <th>Tests</th>
              <th>Impact</th>
              <th>Deployed</th>
              <th>Branch / Commit</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.version}</strong>
                  <small>{row.title}</small>
                </td>
                <td>
                  <Chip tone={statusTone(row.status)}>{labelize(row.status)}</Chip>
                </td>
                <td>{labelize(row.type)}</td>
                <td>{labelize(row.environment)}</td>
                <td>
                  <Chip tone={riskTone(row.risk)}>{labelize(row.risk)}</Chip>
                </td>
                <td>{row.rolloutPercent}%</td>
                <td>{row.testsPassed} / {row.testsFailed}</td>
                <td>{row.featuresAdded} features · {row.bugsFixed} fixes</td>
                <td>{timeText(row.deployedAt)}</td>
                <td>
                  <small>{row.branchName || "—"} {row.commitSha ? `· ${row.commitSha}` : ""}</small>
                </td>
                <td>
                  <div className="release-table-actions">
                    <button type="button" onClick={() => onEdit(row)}>Edit</button>
                    {row.status !== "approved" && row.status !== "deployed" && (
                      <button type="button" onClick={() => onApprove(row)}>Approve</button>
                    )}
                    {row.status !== "deployed" && row.status !== "rolled_back" && (
                      <button type="button" onClick={() => onDeploy(row)}>Deploy</button>
                    )}
                    {["deployed", "failed"].includes(row.status) && (
                      <button type="button" onClick={() => onRollback(row)}>Rollback</button>
                    )}
                    {row.status === "rollback_requested" && (
                      <button type="button" onClick={() => onRolledBack(row)}>Rolled Back</button>
                    )}
                    <button type="button" className="danger" onClick={() => onDelete(row)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!rows.length && <Empty text="No releases match your filters." />}
    </section>
  );
}

function AnalyticsView({
  statusData,
  typeData,
  envData,
  riskData,
  trendData,
  impactData,
}: {
  statusData: ChartRow[];
  typeData: ChartRow[];
  envData: ChartRow[];
  riskData: ChartRow[];
  trendData: ChartRow[];
  impactData: ChartRow[];
}) {
  return (
    <section className="release-chart-grid">
      <ChartCard title="Release Trend" description="Release activity over the last six months.">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="releaseTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="8%" stopColor="var(--release-primary)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--release-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--release-primary)"
              fill="url(#releaseTrend)"
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Status Overview" description="Pipeline state across all releases.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={statusData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {statusData.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={statusData} />
      </ChartCard>

      <ChartCard title="Release Types" description="Major, minor, patch, hotfix and security releases.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={typeData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={115} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--release-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Environment Split" description="Where releases are being prepared or deployed.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={envData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {envData.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={envData} />
      </ChartCard>

      <ChartCard title="Risk Profile" description="Release risk distribution.">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Tooltip />
            <Pie data={riskData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3}>
              {riskData.map((_, index) => (
                <Cell key={index} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <Legend rows={riskData} />
      </ChartCard>

      <ChartCard title="Release Impact" description="Features, bug fixes, breaking changes and failed tests.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={impactData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis type="category" dataKey="label" width={115} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--release-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

// ======================================================
// MODALS
// ======================================================

function ReleaseModal({
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  form: ReleaseForm;
  setForm: React.Dispatch<React.SetStateAction<ReleaseForm>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const setField = <K extends keyof ReleaseForm>(key: K, value: ReleaseForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <div className="release-modal-backdrop" role="dialog" aria-modal="true">
      <form className="release-modal" onSubmit={onSubmit}>
        <div className="release-modal-head">
          <div>
            <h2>{form.id ? "Edit Release" : "New Release"}</h2>
            <p>Record version, changelog, tests, risk and rollout details.</p>
          </div>

          <button type="button" onClick={onClose} disabled={saving} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="release-form-grid">
          <label>
            Version
            <input
              value={form.version}
              onChange={(event) => setField("version", event.target.value)}
              placeholder="1.2.0"
              required
            />
          </label>

          <label>
            Title
            <input
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              placeholder="Payment checkout redesign"
              required
            />
          </label>

          <label>
            Type
            <select value={form.type} onChange={(event) => setField("type", event.target.value as ReleaseType)}>
              {TYPES.map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select value={form.status} onChange={(event) => setField("status", event.target.value as ReleaseStatus)}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>{labelize(status)}</option>
              ))}
            </select>
          </label>

          <label>
            Environment
            <select value={form.environment} onChange={(event) => setField("environment", event.target.value as ReleaseEnvironment)}>
              {ENVIRONMENTS.map((environment) => (
                <option key={environment} value={environment}>{labelize(environment)}</option>
              ))}
            </select>
          </label>

          <label>
            Risk
            <select value={form.risk} onChange={(event) => setField("risk", event.target.value as ReleaseRisk)}>
              {RISKS.map((risk) => (
                <option key={risk} value={risk}>{labelize(risk)}</option>
              ))}
            </select>
          </label>

          <label>
            Branch
            <input
              value={form.branchName}
              onChange={(event) => setField("branchName", event.target.value)}
              placeholder="feature/my-release"
            />
          </label>

          <label>
            Commit SHA
            <input
              value={form.commitSha}
              onChange={(event) => setField("commitSha", event.target.value)}
              placeholder="abc123"
            />
          </label>

          <label>
            Scheduled date
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setField("scheduledAt", event.target.value)}
            />
          </label>

          <label>
            Rollout %
            <input
              type="number"
              min="0"
              max="100"
              value={form.rolloutPercent}
              onChange={(event) => setField("rolloutPercent", event.target.value)}
            />
          </label>

          <label>
            Tests passed
            <input
              type="number"
              min="0"
              value={form.testsPassed}
              onChange={(event) => setField("testsPassed", event.target.value)}
            />
          </label>

          <label>
            Tests failed
            <input
              type="number"
              min="0"
              value={form.testsFailed}
              onChange={(event) => setField("testsFailed", event.target.value)}
            />
          </label>

          <label>
            Features added
            <input
              type="number"
              min="0"
              value={form.featuresAdded}
              onChange={(event) => setField("featuresAdded", event.target.value)}
            />
          </label>

          <label>
            Bugs fixed
            <input
              type="number"
              min="0"
              value={form.bugsFixed}
              onChange={(event) => setField("bugsFixed", event.target.value)}
            />
          </label>

          <label>
            Breaking changes
            <input
              type="number"
              min="0"
              value={form.breakingChanges}
              onChange={(event) => setField("breakingChanges", event.target.value)}
            />
          </label>

          <label>
            Approved by
            <input
              value={form.approvedBy}
              onChange={(event) => setField("approvedBy", event.target.value)}
              placeholder="developer"
            />
          </label>

          <label>
            Deployed by
            <input
              value={form.deployedBy}
              onChange={(event) => setField("deployedBy", event.target.value)}
              placeholder="developer"
            />
          </label>

          <label className="wide">
            Changelog
            <textarea
              value={form.changelog}
              onChange={(event) => setField("changelog", event.target.value)}
              placeholder="What changed in this release?"
              rows={4}
            />
          </label>

          <label className="wide">
            Release notes
            <textarea
              value={form.releaseNotes}
              onChange={(event) => setField("releaseNotes", event.target.value)}
              placeholder="Internal notes, migration steps, QA notes, etc."
              rows={3}
            />
          </label>
        </div>

        <div className="release-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Release"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RollbackModal({
  release,
  reason,
  setReason,
  onClose,
  onSubmit,
}: {
  release: ReleaseRecord;
  reason: string;
  setReason: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="release-modal-backdrop" role="dialog" aria-modal="true">
      <form className="release-modal small" onSubmit={onSubmit}>
        <div className="release-modal-head">
          <div>
            <h2>Request Rollback</h2>
            <p>{release.version} · {release.title}</p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className="release-warning">
          <strong>Rollback safety</strong>
          <p>
            A real rollback should be performed through your backend/deployment pipeline with audit
            logs, backup verification and a clear recovery plan.
          </p>
        </section>

        <label className="release-rollback-label">
          Rollback reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
            placeholder="Explain why this release needs to be rolled back."
          />
        </label>

        <div className="release-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button type="submit">Request Rollback</button>
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
    <article className="release-stat">
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
  return <span className={`release-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="release-empty">{text}</div>;
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
    <section className="release-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="release-legend">
      {rows.map((row, index) => (
        <span key={`${row.label}-${index}`}>
          <i style={{ background: chartColors[index % chartColors.length] }} />
          {row.label}: {row.value}
        </span>
      ))}
    </div>
  );
}

function iconForType(type: ReleaseType) {
  if (type === "major") return "🌍";
  if (type === "minor") return "✨";
  if (type === "patch") return "🧩";
  if (type === "hotfix") return "🔥";
  if (type === "security") return "🔐";
  return "🚀";
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes releaseSpin { to { transform: rotate(360deg); } }

.release-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--release-primary) 10%, transparent), transparent 34rem),
    #f8fafc;
  color: #0f172a;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}

.release-page *,
.release-page *::before,
.release-page *::after {
  box-sizing: border-box;
}

.release-page button,
.release-page input,
.release-page select,
.release-page textarea {
  font: inherit;
  max-width: 100%;
}

.release-state {
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

.release-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.release-state p {
  max-width: 34rem;
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.release-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--release-primary) 18%, transparent);
  border-top-color: var(--release-primary);
  animation: releaseSpin .8s linear infinite;
}

.release-hero {
  display: grid;
  gap: 16px;
  border-radius: 30px;
  padding: 18px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .18), transparent 20rem),
    linear-gradient(135deg, var(--release-primary), #0f172a 72%);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .18);
  overflow: hidden;
}

.release-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.release-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.release-hero p {
  max-width: 850px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.release-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.release-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.release-switch button {
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

.release-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.release-white-btn,
.release-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.release-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.release-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.release-glass-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.release-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.release-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.release-alert.success {
  background: #dcfce7;
  color: #166534;
}

.release-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.release-stat,
.release-card,
.release-chart-card,
.release-table-card {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.release-stat {
  padding: 16px;
}

.release-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.release-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.release-stat small {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
}

.release-toolbar {
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

.release-toolbar input,
.release-toolbar select {
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

.release-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--release-primary) 10%, white);
  color: var(--release-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.release-card-grid,
.release-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.release-card,
.release-chart-card,
.release-table-card {
  min-width: 0;
  padding: 14px;
}

.release-card.failed,
.release-card.rolled_back {
  border-color: rgba(220, 38, 38, .24);
  background: linear-gradient(180deg, #fff, #fff7f7);
}

.release-card.rollback_requested {
  border-color: rgba(249, 115, 22, .24);
}

.release-card.deploying {
  border-color: rgba(37, 99, 235, .24);
}

.release-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.release-avatar {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--release-primary), #0f172a);
  color: #fff;
  font-size: 18px;
  font-weight: 1000;
}

.release-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.release-card h2 {
  margin: 14px 0 0;
  font-size: 25px;
  font-weight: 1000;
  letter-spacing: -.06em;
}

.release-card p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.release-changelog {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
}

.release-progress {
  height: 9px;
  margin-top: 12px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.release-progress span {
  display: block;
  height: 100%;
  min-width: 4px;
  background: linear-gradient(90deg, var(--release-primary), #16a34a);
}

.release-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.release-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
}

.release-mini-grid b {
  display: block;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.release-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.release-pills span {
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
  max-width: 100%;
  overflow-wrap: anywhere;
}

.release-actions,
.release-table-actions,
.release-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.release-actions {
  margin-top: 14px;
}

.release-actions button,
.release-table-actions button,
.release-modal-actions button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--release-primary) 10%, white);
  color: var(--release-primary);
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.release-actions button:first-child,
.release-table-actions button:first-child,
.release-modal-actions button:last-child {
  background: var(--release-primary);
  color: #fff;
}

.release-actions button.danger,
.release-table-actions button.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.release-chip {
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

.release-chip.green { background: #dcfce7; color: #166534; }
.release-chip.blue { background: #dbeafe; color: #1d4ed8; }
.release-chip.purple { background: #f3e8ff; color: #7e22ce; }
.release-chip.orange { background: #ffedd5; color: #c2410c; }
.release-chip.red { background: #fee2e2; color: #b91c1c; }
.release-chip.gray { background: #f1f5f9; color: #475569; }

.release-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.release-table-wrap table {
  width: 100%;
  min-width: 1280px;
  border-collapse: collapse;
}

.release-table-wrap th {
  text-align: left;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.release-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.release-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.release-table-wrap small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.release-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.release-chart-card p {
  margin: 5px 0 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.release-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.release-legend span {
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

.release-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.release-empty {
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

.release-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.release-modal {
  width: min(1040px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.release-modal.small {
  width: min(680px, 100%);
}

.release-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.release-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.release-modal-head p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.release-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.release-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.release-form-grid label,
.release-rollback-label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
}

.release-form-grid input,
.release-form-grid select,
.release-form-grid textarea,
.release-rollback-label textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .32);
  border-radius: 16px;
  background: #fff;
  color: #0f172a;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 800;
}

.release-form-grid input,
.release-form-grid select {
  min-height: 42px;
}

.release-form-grid textarea,
.release-rollback-label textarea {
  resize: vertical;
}

.release-warning {
  padding: 12px;
  border-radius: 20px;
  background: #fff7ed;
  border: 1px solid rgba(249, 115, 22, .24);
  margin-bottom: 12px;
}

.release-warning strong {
  display: block;
  color: #9a3412;
  font-size: 13px;
  font-weight: 1000;
}

.release-warning p {
  margin: 5px 0 0;
  color: #c2410c;
  font-size: 12px;
  line-height: 1.5;
}

.release-modal-actions {
  position: sticky;
  bottom: -14px;
  justify-content: flex-end;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, #fff 70%, transparent);
}

.release-modal-actions button:first-child {
  background: #f1f5f9;
  color: #0f172a;
}

.release-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

@media (min-width: 520px) {
  .release-stat-grid,
  .release-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .release-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .release-card-grid,
  .release-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .release-form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .release-form-grid .wide {
    grid-column: 1 / -1;
  }

  .release-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .release-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .release-page {
    padding: 14px;
  }

  .release-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .release-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .release-toolbar {
    grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)) auto;
  }

  .release-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .release-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
