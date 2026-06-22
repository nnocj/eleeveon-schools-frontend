"use client";

/**
 * app/developer/modules/DeveloperPlans.tsx
 * ---------------------------------------------------------
 * DEVELOPER SUBSCRIPTION PLANS
 * ---------------------------------------------------------
 * Mobile-first SaaS plan manager for the developer portal.
 *
 * Features:
 * - Card / table / charts view switching
 * - Search and filters
 * - Plan pricing analytics
 * - Feature coverage analytics
 * - Safe API normalization for different backend response shapes
 * - Mobile-first, responsive, professional UI
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
type BillingPreview = "monthly" | "yearly";
type Tone = "green" | "blue" | "purple" | "orange" | "red" | "gray";

type PlanRow = {
  id: string;
  name: string;
  code: string;
  description?: string | null;

  currency?: string;
  priceMonthly?: number;
  priceYearly?: number;

  maxSchools?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  maxTeachers?: number | null;
  maxStorageMb?: number | null;

  offlineSync?: boolean;
  cloudBackup?: boolean;
  reports?: boolean;
  finance?: boolean;
  parentPortal?: boolean;
  studentPortal?: boolean;
  teacherPortal?: boolean;
  advancedAnalytics?: boolean;
  apiAccess?: boolean;

  active?: boolean;

  createdAt?: string;
  updatedAt?: string;
};

type SubscriptionRow = {
  id: string;
  accountId: string;
  planId?: string;
  status: string;
  billingCycle?: string;
  createdAt?: string;
  updatedAt?: string;
  plan?: PlanRow;
};

type ChartRow = {
  label: string;
  value: number;
  monthly?: number;
  yearly?: number;
  subscriptions?: number;
};

type PlanFormState = {
  id?: string;
  name: string;
  code: string;
  description: string;
  currency: string;
  priceMonthly: string;
  priceYearly: string;
  maxSchools: string;
  maxBranches: string;
  maxUsers: string;
  maxStudents: string;
  maxTeachers: string;
  maxStorageMb: string;
  offlineSync: boolean;
  cloudBackup: boolean;
  reports: boolean;
  finance: boolean;
  parentPortal: boolean;
  studentPortal: boolean;
  teacherPortal: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  active: boolean;
};

// ======================================================
// CONSTANTS
// ======================================================

const EMPTY_FORM: PlanFormState = {
  name: "",
  code: "",
  description: "",
  currency: "GHS",
  priceMonthly: "0",
  priceYearly: "0",
  maxSchools: "",
  maxBranches: "",
  maxUsers: "",
  maxStudents: "",
  maxTeachers: "",
  maxStorageMb: "",
  offlineSync: true,
  cloudBackup: false,
  reports: true,
  finance: false,
  parentPortal: false,
  studentPortal: false,
  teacherPortal: true,
  advancedAnalytics: false,
  apiAccess: false,
  active: true,
};

const FEATURE_FIELDS: {
  key: keyof PlanFormState;
  planKey: keyof PlanRow;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "offlineSync",
    planKey: "offlineSync",
    label: "Offline Sync",
    description: "PWA local-first data sync.",
    icon: "🔄",
  },
  {
    key: "cloudBackup",
    planKey: "cloudBackup",
    label: "Cloud Backup",
    description: "Cloud recovery and backup tools.",
    icon: "☁️",
  },
  {
    key: "reports",
    planKey: "reports",
    label: "Reports",
    description: "Assessment reports and report cards.",
    icon: "📊",
  },
  {
    key: "finance",
    planKey: "finance",
    label: "Finance",
    description: "Fees, payments, income and expenses.",
    icon: "💰",
  },
  {
    key: "parentPortal",
    planKey: "parentPortal",
    label: "Parent Portal",
    description: "Parent access to reports and records.",
    icon: "👨‍👩‍👧",
  },
  {
    key: "studentPortal",
    planKey: "studentPortal",
    label: "Student Portal",
    description: "Student access to learning records.",
    icon: "🎓",
  },
  {
    key: "teacherPortal",
    planKey: "teacherPortal",
    label: "Teacher Portal",
    description: "Teacher assessments and class tools.",
    icon: "👩‍🏫",
  },
  {
    key: "advancedAnalytics",
    planKey: "advancedAnalytics",
    label: "Advanced Analytics",
    description: "Charts, insights and performance views.",
    icon: "📈",
  },
  {
    key: "apiAccess",
    planKey: "apiAccess",
    label: "API Access",
    description: "External integrations and APIs.",
    icon: "🔌",
  },
];

const chartColors = [
  "var(--dev-primary)",
  "#0f172a",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#64748b",
  "#ca8a04",
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

const numberOrNull = (value: string) => {
  if (value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const intValue = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
};

const money = (amount: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const compactNumber = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const dateText = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-GH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
};

const safeTime = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const planToForm = (plan: PlanRow): PlanFormState => ({
  id: plan.id,
  name: plan.name || "",
  code: plan.code || "",
  description: plan.description || "",
  currency: plan.currency || "GHS",
  priceMonthly: String(plan.priceMonthly ?? 0),
  priceYearly: String(plan.priceYearly ?? 0),
  maxSchools: plan.maxSchools == null ? "" : String(plan.maxSchools),
  maxBranches: plan.maxBranches == null ? "" : String(plan.maxBranches),
  maxUsers: plan.maxUsers == null ? "" : String(plan.maxUsers),
  maxStudents: plan.maxStudents == null ? "" : String(plan.maxStudents),
  maxTeachers: plan.maxTeachers == null ? "" : String(plan.maxTeachers),
  maxStorageMb: plan.maxStorageMb == null ? "" : String(plan.maxStorageMb),
  offlineSync: plan.offlineSync ?? true,
  cloudBackup: plan.cloudBackup ?? false,
  reports: plan.reports ?? true,
  finance: plan.finance ?? false,
  parentPortal: plan.parentPortal ?? false,
  studentPortal: plan.studentPortal ?? false,
  teacherPortal: plan.teacherPortal ?? true,
  advancedAnalytics: plan.advancedAnalytics ?? false,
  apiAccess: plan.apiAccess ?? false,
  active: plan.active ?? true,
});

const formToPayload = (form: PlanFormState) => ({
  name: form.name.trim(),
  code: form.code.trim().toLowerCase().replace(/\s+/g, "_"),
  description: form.description.trim() || null,
  currency: form.currency.trim() || "GHS",
  priceMonthly: intValue(form.priceMonthly),
  priceYearly: intValue(form.priceYearly),
  maxSchools: numberOrNull(form.maxSchools),
  maxBranches: numberOrNull(form.maxBranches),
  maxUsers: numberOrNull(form.maxUsers),
  maxStudents: numberOrNull(form.maxStudents),
  maxTeachers: numberOrNull(form.maxTeachers),
  maxStorageMb: numberOrNull(form.maxStorageMb),
  offlineSync: form.offlineSync,
  cloudBackup: form.cloudBackup,
  reports: form.reports,
  finance: form.finance,
  parentPortal: form.parentPortal,
  studentPortal: form.studentPortal,
  teacherPortal: form.teacherPortal,
  advancedAnalytics: form.advancedAnalytics,
  apiAccess: form.apiAccess,
  active: form.active,
});

const countEnabledFeatures = (plan: PlanRow) =>
  FEATURE_FIELDS.filter((field) => Boolean(plan[field.planKey])).length;

const planUsageCount = (plan: PlanRow, subscriptions: SubscriptionRow[]) =>
  subscriptions.filter((subscription) => subscription.planId === plan.id || subscription.plan?.id === plan.id).length;

// ======================================================
// COMPONENT
// ======================================================

export default function DeveloperPlans({ navigate }: Props) {
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [billingPreview, setBillingPreview] = useState<BillingPreview>("monthly");

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [feature, setFeature] = useState("all");
  const [currency, setCurrency] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);

  // ======================================================
  // LOAD
  // ======================================================

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      setNotice("");

      const [plansResponse, subscriptionsResponse] = await Promise.all([
        apiClient<any>("/billing/plans?includeInactive=true").catch(() => []),
        apiClient<any>("/billing/subscriptions").catch(() => []),
      ]);

      setPlans(toArray<PlanRow>(plansResponse, ["plans", "subscriptionPlans"]));
      setSubscriptions(
        toArray<SubscriptionRow>(subscriptionsResponse, ["subscriptions", "accountSubscriptions"])
      );
    } catch (err: any) {
      setError(err?.message || "Could not load subscription plans.");
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
  // FILTERS + DERIVED
  // ======================================================

  const currencies = useMemo(
    () => Array.from(new Set(plans.map((plan) => plan.currency || "GHS"))).sort(),
    [plans]
  );

  const filteredPlans = useMemo(() => {
    const term = query.trim().toLowerCase();

    return plans
      .filter((plan) => {
        const haystack = `${plan.name || ""} ${plan.code || ""} ${
          plan.description || ""
        }`.toLowerCase();

        const statusOk =
          status === "all" ||
          (status === "active" && plan.active !== false) ||
          (status === "inactive" && plan.active === false);

        const featureOk =
          feature === "all" ||
          Boolean(plan[feature as keyof PlanRow]);

        const currencyOk = currency === "all" || (plan.currency || "GHS") === currency;
        const searchOk = !term || haystack.includes(term);

        return statusOk && featureOk && currencyOk && searchOk;
      })
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) {
          return a.active !== false ? -1 : 1;
        }

        return Number(a.priceMonthly || 0) - Number(b.priceMonthly || 0);
      });
  }, [plans, query, status, feature, currency]);

  const activePlans = useMemo(() => plans.filter((plan) => plan.active !== false), [plans]);
  const inactivePlans = useMemo(() => plans.filter((plan) => plan.active === false), [plans]);

  const freePlans = useMemo(
    () =>
      plans.filter(
        (plan) => Number(plan.priceMonthly || 0) === 0 && Number(plan.priceYearly || 0) === 0
      ),
    [plans]
  );

  const paidPlans = useMemo(() => plans.filter((plan) => !freePlans.includes(plan)), [plans, freePlans]);

  const averageMonthly = useMemo(() => {
    if (!paidPlans.length) return 0;
    return Math.round(
      paidPlans.reduce((sum, plan) => sum + Number(plan.priceMonthly || 0), 0) / paidPlans.length
    );
  }, [paidPlans]);

  const totalPotentialMonthly = useMemo(() => {
    return subscriptions
      .filter((sub) => ["active", "trial"].includes(String(sub.status || "").toLowerCase()))
      .reduce((sum, sub) => {
        const plan = sub.plan || plans.find((item) => item.id === sub.planId);
        return sum + Number(plan?.priceMonthly || 0);
      }, 0);
  }, [subscriptions, plans]);

  // ======================================================
  // CHART DATA
  // ======================================================

  const pricingChart = useMemo<ChartRow[]>(() => {
    return [...plans]
      .sort((a, b) => Number(a.priceMonthly || 0) - Number(b.priceMonthly || 0))
      .map((plan) => ({
        label: plan.name || plan.code,
        monthly: Number(plan.priceMonthly || 0),
        yearly: Number(plan.priceYearly || 0),
        value: Number(plan.priceMonthly || 0),
      }));
  }, [plans]);

  const usageChart = useMemo<ChartRow[]>(() => {
    return plans
      .map((plan) => ({
        label: plan.name || plan.code,
        subscriptions: planUsageCount(plan, subscriptions),
        value: planUsageCount(plan, subscriptions),
      }))
      .sort((a, b) => b.value - a.value);
  }, [plans, subscriptions]);

  const featureCoverageChart = useMemo<ChartRow[]>(() => {
    return FEATURE_FIELDS.map((field) => ({
      label: field.label,
      value: plans.filter((plan) => Boolean(plan[field.planKey])).length,
    })).sort((a, b) => b.value - a.value);
  }, [plans]);

  const statusChart = useMemo<ChartRow[]>(() => {
    return [
      { label: "Active", value: activePlans.length },
      { label: "Inactive", value: inactivePlans.length },
    ];
  }, [activePlans.length, inactivePlans.length]);

  // ======================================================
  // MUTATIONS
  // ======================================================

  const openCreate = () => {
    setError("");
    setNotice("");
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (plan: PlanRow) => {
    setError("");
    setNotice("");
    setForm(planToForm(plan));
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setForm(EMPTY_FORM);
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = formToPayload(form);

    if (!payload.name || !payload.code) {
      setError("Plan name and code are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      if (form.id) {
        const updated = await apiClient<any>(`/billing/plans/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        const nextPlan = updated?.plan || updated?.data || updated;

        setPlans((current) =>
          current.map((plan) =>
            plan.id === form.id ? { ...plan, ...(nextPlan || payload) } : plan
          )
        );

        setNotice("Plan updated successfully.");
      } else {
        const created = await apiClient<any>("/billing/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const nextPlan = created?.plan || created?.data || created;

        if (nextPlan?.id) {
          setPlans((current) => [nextPlan as PlanRow, ...current]);
        } else {
          await load(true);
        }

        setNotice("Plan created successfully.");
      }

      closeForm();
    } catch (err: any) {
      setError(err?.message || "Could not save the plan.");
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (plan: PlanRow) => {
    try {
      setError("");
      setNotice("");

      const nextActive = !(plan.active !== false);

      await apiClient<any>(`/billing/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });

      setPlans((current) =>
        current.map((item) => (item.id === plan.id ? { ...item, active: nextActive } : item))
      );

      setNotice(nextActive ? "Plan activated." : "Plan deactivated.");
    } catch (err: any) {
      setError(err?.message || "Could not update plan status.");
    }
  };

  // ======================================================
  // STATES
  // ======================================================

  if (loading || accountLoading) {
    return (
      <main className="devplans-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devplans-state">
          <div className="devplans-spinner" />
          <h2>Loading subscription plans...</h2>
          <p>Preparing packages, pricing, feature limits and plan analytics.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="devplans-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="devplans-state">
          <h2>Developer access required</h2>
          <p>Sign in with a developer account to manage platform subscription plans.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="devplans-page" style={{ "--dev-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="devplans-hero">
        <div>
          <span className="devplans-eyebrow">SaaS control</span>
          <h1>Subscription Packs</h1>
          <p>
            Create, compare and monitor plan packages for schools using Eleeveon. Switch between
            mobile cards, desktop tables and pricing analytics.
          </p>
        </div>

        <div className="devplans-hero-actions">
          <div className="devplans-switch" role="tablist" aria-label="Plan view">
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

          <button type="button" className="devplans-white-btn" onClick={openCreate}>
            Add Plan
          </button>

          <button
            type="button"
            className="devplans-glass-btn"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <section className={`devplans-alert ${error ? "error" : "success"}`}>
          {error || notice}
        </section>
      )}

      <section className="devplans-stat-grid">
        <StatCard label="Plans" value={plans.length} detail={`${activePlans.length} active`} icon="📦" />
        <StatCard label="Paid Packs" value={paidPlans.length} detail={`${freePlans.length} free/trial`} icon="💳" />
        <StatCard label="Average Price" value={money(averageMonthly)} detail="Average monthly paid pack" icon="📈" />
        <StatCard label="Potential MRR" value={money(totalPotentialMonthly)} detail="From active/trial subscriptions" icon="💰" />
      </section>

      <section className="devplans-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plan name, code or description..."
        />

        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        <select value={feature} onChange={(event) => setFeature(event.target.value)}>
          <option value="all">All features</option>
          {FEATURE_FIELDS.map((item) => (
            <option key={item.planKey} value={item.planKey}>
              Has {item.label}
            </option>
          ))}
        </select>

        <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
          <option value="all">All currencies</option>
          {currencies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={billingPreview}
          onChange={(event) => setBillingPreview(event.target.value as BillingPreview)}
        >
          <option value="monthly">Monthly preview</option>
          <option value="yearly">Yearly preview</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatus("all");
            setFeature("all");
            setCurrency("all");
            setBillingPreview("monthly");
          }}
        >
          Reset
        </button>
      </section>

      {viewMode === "analytics" ? (
        <AnalyticsView
          pricingChart={pricingChart}
          usageChart={usageChart}
          featureCoverageChart={featureCoverageChart}
          statusChart={statusChart}
        />
      ) : viewMode === "table" ? (
        <TableView
          plans={filteredPlans}
          subscriptions={subscriptions}
          billingPreview={billingPreview}
          onEdit={openEdit}
          onToggle={togglePlan}
        />
      ) : (
        <CardsView
          plans={filteredPlans}
          subscriptions={subscriptions}
          billingPreview={billingPreview}
          onEdit={openEdit}
          onToggle={togglePlan}
          navigate={navigate}
        />
      )}

      {formOpen && (
        <PlanModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={closeForm}
          onSubmit={savePlan}
        />
      )}
    </main>
  );
}

// ======================================================
// VIEWS
// ======================================================

function CardsView({
  plans,
  subscriptions,
  billingPreview,
  onEdit,
  onToggle,
  navigate,
}: {
  plans: PlanRow[];
  subscriptions: SubscriptionRow[];
  billingPreview: BillingPreview;
  onEdit: (plan: PlanRow) => void;
  onToggle: (plan: PlanRow) => void;
  navigate?: (key: string) => void;
}) {
  return (
    <section className="devplans-card-grid">
      {plans.map((plan) => {
        const price =
          billingPreview === "yearly"
            ? Number(plan.priceYearly || 0)
            : Number(plan.priceMonthly || 0);

        const usage = planUsageCount(plan, subscriptions);
        const featureCount = countEnabledFeatures(plan);

        return (
          <article key={plan.id} className={`devplans-plan-card ${plan.active === false ? "inactive" : ""}`}>
            <div className="devplans-plan-top">
              <span className="devplans-plan-icon">📦</span>
              <Chip tone={plan.active === false ? "gray" : "green"}>
                {plan.active === false ? "Inactive" : "Active"}
              </Chip>
            </div>

            <h2>{plan.name || "Unnamed plan"}</h2>
            <p>{plan.description || "No description added yet."}</p>

            <div className="devplans-price">
              <strong>{money(price, plan.currency || "GHS")}</strong>
              <span>/{billingPreview === "yearly" ? "year" : "month"}</span>
            </div>

            <div className="devplans-mini-grid">
              <span>
                <b>Code</b>
                {plan.code}
              </span>
              <span>
                <b>Usage</b>
                {usage} subscriptions
              </span>
              <span>
                <b>Features</b>
                {featureCount}/{FEATURE_FIELDS.length}
              </span>
            </div>

            <div className="devplans-feature-pills">
              {FEATURE_FIELDS.filter((field) => Boolean(plan[field.planKey]))
                .slice(0, 5)
                .map((field) => (
                  <span key={field.planKey}>
                    {field.icon} {field.label}
                  </span>
                ))}

              {featureCount > 5 && <span>+{featureCount - 5} more</span>}
              {!featureCount && <span>No features enabled</span>}
            </div>

            <div className="devplans-actions">
              <button type="button" onClick={() => onEdit(plan)}>
                Edit
              </button>
              <button type="button" onClick={() => onToggle(plan)}>
                {plan.active === false ? "Activate" : "Deactivate"}
              </button>
              <button type="button" onClick={() => navigate?.("subscriptions")}>
                Usage
              </button>
            </div>
          </article>
        );
      })}

      {!plans.length && <Empty text="No plans match your filters." />}
    </section>
  );
}

function TableView({
  plans,
  subscriptions,
  billingPreview,
  onEdit,
  onToggle,
}: {
  plans: PlanRow[];
  subscriptions: SubscriptionRow[];
  billingPreview: BillingPreview;
  onEdit: (plan: PlanRow) => void;
  onToggle: (plan: PlanRow) => void;
}) {
  return (
    <section className="devplans-table-card">
      <div className="devplans-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Code</th>
              <th>Price</th>
              <th>Limits</th>
              <th>Features</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <strong>{plan.name}</strong>
                  <small>{plan.description || "No description"}</small>
                </td>
                <td>{plan.code}</td>
                <td>
                  {money(
                    billingPreview === "yearly"
                      ? Number(plan.priceYearly || 0)
                      : Number(plan.priceMonthly || 0),
                    plan.currency || "GHS"
                  )}
                </td>
                <td>
                  {[
                    plan.maxSchools != null ? `${plan.maxSchools} schools` : null,
                    plan.maxBranches != null ? `${plan.maxBranches} branches` : null,
                    plan.maxUsers != null ? `${plan.maxUsers} users` : null,
                    plan.maxStudents != null ? `${plan.maxStudents} students` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Unlimited / not set"}
                </td>
                <td>{countEnabledFeatures(plan)}/{FEATURE_FIELDS.length}</td>
                <td>{planUsageCount(plan, subscriptions)}</td>
                <td>
                  <Chip tone={plan.active === false ? "gray" : "green"}>
                    {plan.active === false ? "Inactive" : "Active"}
                  </Chip>
                </td>
                <td>{dateText(plan.updatedAt || plan.createdAt)}</td>
                <td>
                  <div className="devplans-table-actions">
                    <button type="button" onClick={() => onEdit(plan)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => onToggle(plan)}>
                      {plan.active === false ? "Activate" : "Deactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!plans.length && <Empty text="No plans match your filters." />}
    </section>
  );
}

function AnalyticsView({
  pricingChart,
  usageChart,
  featureCoverageChart,
  statusChart,
}: {
  pricingChart: ChartRow[];
  usageChart: ChartRow[];
  featureCoverageChart: ChartRow[];
  statusChart: ChartRow[];
}) {
  return (
    <section className="devplans-chart-grid">
      <ChartCard
        title="Plan pricing comparison"
        description="Monthly and yearly price levels across your SaaS packages."
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={pricingChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(value) => compactNumber(Number(value))}
            />
            <Tooltip formatter={(value) => money(Number(value))} />
            <Bar dataKey="monthly" name="Monthly" fill="var(--dev-primary)" radius={[12, 12, 0, 0]} />
            <Bar dataKey="yearly" name="Yearly" fill="#0f172a" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Plan adoption"
        description="Subscriptions currently linked to each package."
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={usageChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={96} />
            <Tooltip />
            <Bar dataKey="subscriptions" name="Subscriptions" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Feature coverage"
        description="How many packages include each platform feature."
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={featureCoverageChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={118} />
            <Tooltip />
            <Bar dataKey="value" name="Plans" fill="var(--dev-primary)" radius={[0, 12, 12, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Plan status" description="Active versus inactive packages.">
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
    </section>
  );
}

// ======================================================
// MODAL
// ======================================================

function PlanModal({
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  form: PlanFormState;
  setForm: React.Dispatch<React.SetStateAction<PlanFormState>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const setField = <K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="devplans-modal-backdrop" role="dialog" aria-modal="true">
      <form className="devplans-modal" onSubmit={onSubmit}>
        <div className="devplans-modal-head">
          <div>
            <h2>{form.id ? "Edit Subscription Pack" : "Create Subscription Pack"}</h2>
            <p>Configure pricing, limits and feature access for this plan.</p>
          </div>

          <button type="button" onClick={onClose} disabled={saving} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="devplans-form-grid">
          <label>
            Plan name
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="Starter"
              required
            />
          </label>

          <label>
            Plan code
            <input
              value={form.code}
              onChange={(event) => setField("code", event.target.value)}
              placeholder="starter"
              required
            />
          </label>

          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Best for small schools starting with digital records."
              rows={3}
            />
          </label>

          <label>
            Currency
            <input
              value={form.currency}
              onChange={(event) => setField("currency", event.target.value.toUpperCase())}
              placeholder="GHS"
            />
          </label>

          <label>
            Monthly price
            <input
              type="number"
              min="0"
              value={form.priceMonthly}
              onChange={(event) => setField("priceMonthly", event.target.value)}
            />
          </label>

          <label>
            Yearly price
            <input
              type="number"
              min="0"
              value={form.priceYearly}
              onChange={(event) => setField("priceYearly", event.target.value)}
            />
          </label>

          <label>
            Max schools
            <input
              type="number"
              min="0"
              value={form.maxSchools}
              onChange={(event) => setField("maxSchools", event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Max branches
            <input
              type="number"
              min="0"
              value={form.maxBranches}
              onChange={(event) => setField("maxBranches", event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Max users
            <input
              type="number"
              min="0"
              value={form.maxUsers}
              onChange={(event) => setField("maxUsers", event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Max students
            <input
              type="number"
              min="0"
              value={form.maxStudents}
              onChange={(event) => setField("maxStudents", event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Max teachers
            <input
              type="number"
              min="0"
              value={form.maxTeachers}
              onChange={(event) => setField("maxTeachers", event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Storage MB
            <input
              type="number"
              min="0"
              value={form.maxStorageMb}
              onChange={(event) => setField("maxStorageMb", event.target.value)}
              placeholder="Unlimited"
            />
          </label>
        </div>

        <section className="devplans-feature-editor">
          <h3>Feature access</h3>

          <div>
            {FEATURE_FIELDS.map((item) => (
              <label key={item.key} className="devplans-feature-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(form[item.key])}
                  onChange={(event) => setField(item.key, event.target.checked as any)}
                />

                <span>
                  <b>
                    {item.icon} {item.label}
                  </b>
                  <small>{item.description}</small>
                </span>
              </label>
            ))}

            <label className="devplans-feature-toggle important">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setField("active", event.target.checked)}
              />

              <span>
                <b>✅ Active plan</b>
                <small>Inactive plans can stay saved without being sold.</small>
              </span>
            </label>
          </div>
        </section>

        <div className="devplans-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save Changes" : "Create Plan"}
          </button>
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
    <article className="devplans-stat">
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
  return <span className={`devplans-chip ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="devplans-empty">{text}</div>;
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
    <section className="devplans-chart-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="devplans-chart-shell">{children}</div>
    </section>
  );
}

function Legend({ rows }: { rows: ChartRow[] }) {
  return (
    <div className="devplans-legend">
      {rows.map((row, index) => (
        <span key={row.label}>
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
@keyframes devplansSpin { to { transform: rotate(360deg); } }

.devplans-page {
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

.devplans-page *,
.devplans-page *::before,
.devplans-page *::after {
  box-sizing: border-box;
}

.devplans-page button,
.devplans-page input,
.devplans-page select,
.devplans-page textarea {
  font: inherit;
  max-width: 100%;
}

.devplans-page button {
  -webkit-tap-highlight-color: transparent;
}

.devplans-state {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .08);
  text-align: center;
}

.devplans-state h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devplans-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.devplans-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--dev-primary) 18%, transparent);
  border-top-color: var(--dev-primary);
  animation: devplansSpin .8s linear infinite;
}

.devplans-hero {
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

.devplans-eyebrow {
  display: inline-flex;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .14em;
  opacity: .82;
}

.devplans-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 8vw, 44px);
  line-height: 1.02;
  font-weight: 1000;
  letter-spacing: -.07em;
}

.devplans-hero p {
  max-width: 760px;
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: .9;
}

.devplans-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.devplans-switch {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .2);
  backdrop-filter: blur(14px);
}

.devplans-switch button {
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

.devplans-switch button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
}

.devplans-white-btn,
.devplans-glass-btn {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.devplans-white-btn {
  border: 0;
  background: #fff;
  color: #0f172a;
}

.devplans-glass-btn {
  border: 1px solid rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.devplans-glass-btn:disabled {
  opacity: .7;
  cursor: not-allowed;
}

.devplans-alert {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 850;
}

.devplans-alert.error {
  background: #fee2e2;
  color: #991b1b;
}

.devplans-alert.success {
  background: #dcfce7;
  color: #166534;
}

.devplans-stat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devplans-stat {
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 24px;
  padding: 16px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devplans-stat span {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devplans-stat strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(24px, 8vw, 34px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.devplans-stat small {
  display: block;
  margin-top: 8px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 850;
}

.devplans-toolbar {
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

.devplans-toolbar input,
.devplans-toolbar select {
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

.devplans-toolbar button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--dev-primary) 10%, white);
  color: var(--dev-primary);
  font-size: 13px;
  font-weight: 1000;
  cursor: pointer;
}

.devplans-card-grid,
.devplans-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}

.devplans-plan-card,
.devplans-chart-card,
.devplans-table-card {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, .22);
  border-radius: 26px;
  padding: 14px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}

.devplans-plan-card.inactive {
  opacity: .74;
}

.devplans-plan-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.devplans-plan-icon {
  width: 42px;
  height: 42px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--dev-primary), #0f172a);
  color: #fff;
  font-weight: 1000;
}

.devplans-plan-card h2 {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devplans-plan-card p {
  margin: 6px 0 0;
  min-height: 38px;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.45;
}

.devplans-price {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 14px;
}

.devplans-price strong {
  font-size: clamp(26px, 9vw, 38px);
  line-height: .92;
  font-weight: 1000;
  letter-spacing: -.07em;
  overflow-wrap: anywhere;
}

.devplans-price span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 900;
}

.devplans-mini-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 14px;
}

.devplans-mini-grid span {
  padding: 10px;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 850;
}

.devplans-mini-grid b {
  display: block;
  color: var(--muted, #64748b);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 3px;
}

.devplans-feature-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.devplans-feature-pills span {
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

.devplans-actions,
.devplans-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.devplans-actions {
  margin-top: 14px;
}

.devplans-actions button,
.devplans-table-actions button {
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

.devplans-actions button:first-child,
.devplans-table-actions button:first-child {
  background: var(--dev-primary);
  color: #fff;
}

.devplans-chip {
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

.devplans-chip.green { background: #dcfce7; color: #166534; }
.devplans-chip.blue { background: #dbeafe; color: #1d4ed8; }
.devplans-chip.purple { background: #f3e8ff; color: #7e22ce; }
.devplans-chip.orange { background: #ffedd5; color: #c2410c; }
.devplans-chip.red { background: #fee2e2; color: #b91c1c; }
.devplans-chip.gray { background: #f1f5f9; color: #475569; }

.devplans-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.devplans-table-wrap table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
}

.devplans-table-wrap th {
  text-align: left;
  color: var(--muted, #64748b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .22);
}

.devplans-table-wrap td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, .16);
  font-size: 13px;
  vertical-align: top;
}

.devplans-table-wrap strong {
  display: block;
  font-weight: 1000;
}

.devplans-table-wrap small {
  display: block;
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.35;
}

.devplans-chart-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.devplans-chart-card p {
  margin: 5px 0 10px;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devplans-chart-shell {
  min-width: 0;
  width: 100%;
}

.devplans-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.devplans-legend span {
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

.devplans-legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.devplans-empty {
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

.devplans-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15, 23, 42, .58);
  backdrop-filter: blur(12px);
}

.devplans-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 920px);
  overflow-y: auto;
  border-radius: 28px;
  background: var(--surface, #fff);
  box-shadow: 0 30px 100px rgba(15, 23, 42, .35);
  border: 1px solid rgba(255, 255, 255, .24);
  padding: 14px;
}

.devplans-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 14px;
}

.devplans-modal-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.devplans-modal-head p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.devplans-modal-head button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 1000;
  cursor: pointer;
}

.devplans-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.devplans-form-grid label,
.devplans-feature-editor {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 950;
}

.devplans-form-grid input,
.devplans-form-grid textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, .32);
  border-radius: 16px;
  background: #fff;
  color: #0f172a;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 800;
}

.devplans-form-grid input {
  min-height: 42px;
}

.devplans-form-grid textarea {
  resize: vertical;
}

.devplans-feature-editor {
  margin-top: 12px;
  padding: 12px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, .18);
}

.devplans-feature-editor h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.devplans-feature-editor > div {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 8px;
}

.devplans-feature-toggle {
  display: grid !important;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px !important;
  padding: 10px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, .18);
}

.devplans-feature-toggle.important {
  background: color-mix(in srgb, var(--dev-primary) 8%, white);
}

.devplans-feature-toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--dev-primary);
}

.devplans-feature-toggle b {
  display: block;
  color: #0f172a;
  font-size: 13px;
  font-weight: 1000;
}

.devplans-feature-toggle small {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  line-height: 1.35;
}

.devplans-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--surface, #fff) 70%, transparent);
}

.devplans-modal-actions button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 1000;
  cursor: pointer;
}

.devplans-modal-actions button:first-child {
  background: #f1f5f9;
  color: #0f172a;
}

.devplans-modal-actions button:last-child {
  background: var(--dev-primary);
  color: #fff;
}

.devplans-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

@media (min-width: 520px) {
  .devplans-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devplans-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devplans-mini-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .devplans-feature-editor > div {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 760px) {
  .devplans-card-grid,
  .devplans-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .devplans-form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .devplans-form-grid .wide {
    grid-column: 1 / -1;
  }

  .devplans-modal-backdrop {
    place-items: center;
    padding: 18px;
  }

  .devplans-modal {
    padding: 18px;
  }
}

@media (min-width: 920px) {
  .devplans-page {
    padding: 14px;
  }

  .devplans-hero {
    grid-template-columns: 1fr auto;
    align-items: end;
    padding: 24px;
  }

  .devplans-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .devplans-toolbar {
    grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)) auto;
  }
}

@media (min-width: 1180px) {
  .devplans-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
