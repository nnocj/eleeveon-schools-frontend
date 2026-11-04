"use client";

/**
 * app/developer/modules/DeveloperPlans.tsx
 * --------------------------------------------------------------------------
 * Eleeveon subscription plan manager.
 *
 * Rebuilt to follow the compact Students/Branch Settings interaction pattern:
 * - compact Search + Add + Filter + More toolbar;
 * - mobile-first cards, table and analytics views;
 * - plan editor opens as a responsive sheet;
 * - server-authoritative save flow followed by a fresh reload;
 * - old top-level billing fields remain supported;
 * - newer platform capabilities are persisted in both `features` and
 *   `metadata.featureFlags`, so they remain available even before every feature
 *   receives a dedicated backend column.
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

import { apiClient } from "../../lib/api/apiClient";
import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";

type Props = {
  navigate?: (key: string) => void;
};

type ViewMode = "cards" | "table" | "analytics";
type BillingPreview = "monthly" | "termly" | "yearly" | "one_time";
type AcquisitionMode = "trial" | "self_service" | "private_offer" | "complimentary" | "outright" | "installments";
const ACQUISITION_OPTIONS: { value: AcquisitionMode; title: string; description: string }[] = [
  { value: "trial", title: "Public free trial", description: "Temporary, limited evaluation access" },
  { value: "self_service", title: "Self-service purchase", description: "Public checkout for eligible customers" },
  { value: "private_offer", title: "Private offer", description: "Individually negotiated package or quote" },
  { value: "complimentary", title: "Complimentary / pilot", description: "Platform-controlled special access (not automatically granted)" },
  { value: "outright", title: "Outright purchase", description: "One-time purchase, subject to issued licence" },
  { value: "installments", title: "Flex installments", description: "Purchase agreement with scheduled payments" },
];
const DEPLOYMENT_OPTIONS = [
  { value: "eleeveon_cloud", title: "Eleeveon Cloud" },
  { value: "independent_essentials", title: "Independent Essentials" },
  { value: "independent_multi_device", title: "Independent Multi-device" },
  { value: "private_hosted", title: "Private / school hosted (future)" },
] as const;

type ToastTone = "success" | "error" | "info";

type FeatureKey =
  | "offlineSync"
  | "cloudBackup"
  | "reports"
  | "finance"
  | "attendance"
  | "identityCards"
  | "identitySafety"
  | "transport"
  | "schoolWebsites"
  | "communications"
  | "calendarScheduling"
  | "parentPortal"
  | "studentPortal"
  | "teacherPortal"
  | "advancedAnalytics"
  | "apiAccess";

type PlanFeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
  icon: string;
  group: "Core" | "People" | "Operations" | "Growth";
  legacyTopLevel?: boolean;
};

type PlanFeatureFlags = Record<FeatureKey, boolean>;

type PlanRow = {
  id: string;
  name: string;
  code: string;
  description?: string | null;

  currency?: string;
  priceMonthly?: number;
  priceTermly?: number;
  priceYearly?: number;
  priceOneTime?: number | null;
  deploymentMode?: string;
  licenseModel?: string;
  syncPolicy?: string;
  updatePolicy?: string;
  deviceLimit?: number | null;
  activationLimit?: number | null;
  offlineGraceDays?: number | null;
  validationIntervalDays?: number | null;
  requiresPeriodicValidation?: boolean;
  availableAcquisitionModes?: string[] | null;

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

  attendance?: boolean;
  identityCards?: boolean;
  identitySafety?: boolean;
  transport?: boolean;
  schoolWebsites?: boolean;
  communications?: boolean;
  calendarScheduling?: boolean;

  parentPortal?: boolean;
  studentPortal?: boolean;
  teacherPortal?: boolean;
  advancedAnalytics?: boolean;
  apiAccess?: boolean;

  features?: string[] | null;
  metadata?: Record<string, any> | null;

  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SubscriptionRow = {
  id: string;
  accountId: string;
  planId?: string | null;
  status?: string | null;
  billingCycle?: string | null;
  plan?: PlanRow | null;
};

type PlanFormState = {
  id?: string;
  name: string;
  code: string;
  description: string;
  currency: string;
  priceMonthly: string;
  priceTermly: string;
  priceYearly: string;
  priceOneTime: string;
  deploymentMode: string;
  licenseModel: string;
  syncPolicy: string;
  updatePolicy: string;
  deviceLimit: string;
  activationLimit: string;
  offlineGraceDays: string;
  validationIntervalDays: string;
  requiresPeriodicValidation: boolean;
  trialDays: string;
  pricingMode: "fixed" | "per_student" | "tiered";
  pricingPeriod: "monthly" | "termly" | "yearly";
  perStudentRate: string;
  pricingMinimum: string;
  pricingTiers: { upTo: string; unitPrice: string }[];
  publicVisible: boolean;
  acquisitionModes: AcquisitionMode[];
  originalMetadata: Record<string, any>;

  maxSchools: string;
  maxBranches: string;
  maxUsers: string;
  maxStudents: string;
  maxTeachers: string;
  maxStorageMb: string;

  features: PlanFeatureFlags;
  active: boolean;
};

const FEATURE_DEFINITIONS: PlanFeatureDefinition[] = [
  {
    key: "offlineSync",
    label: "Offline-first sync",
    description: "Local-first records with protected synchronization.",
    icon: "↻",
    group: "Core",
    legacyTopLevel: true,
  },
  {
    key: "cloudBackup",
    label: "Cloud backup",
    description: "Cloud recovery, restore and backup tools.",
    icon: "☁",
    group: "Core",
    legacyTopLevel: true,
  },
  {
    key: "reports",
    label: "Assessments & reports",
    description: "Assessment entry, report cards, broadsheets and templates.",
    icon: "▦",
    group: "Core",
    legacyTopLevel: true,
  },
  {
    key: "finance",
    label: "Finance",
    description: "Fees, payments, income, expenses and payroll.",
    icon: "₵",
    group: "Core",
    legacyTopLevel: true,
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Student and staff attendance workflows.",
    icon: "✓",
    group: "Operations",
  },
  {
    key: "identityCards",
    label: "ID cards & passes",
    description: "Student, staff, parent and visitor identity cards.",
    icon: "▣",
    group: "Operations",
  },
  {
    key: "identitySafety",
    label: "Identity & safety",
    description: "Pickup, visitors, access points and emergency roll calls.",
    icon: "◇",
    group: "Operations",
  },
  {
    key: "transport",
    label: "School transport",
    description: "Vehicles, routes, stops, assignments and journeys.",
    icon: "▰",
    group: "Operations",
  },
  {
    key: "schoolWebsites",
    label: "School websites",
    description: "Template-based public websites and custom domains.",
    icon: "↗",
    group: "Growth",
  },
  {
    key: "communications",
    label: "Communication",
    description: "Announcements, messaging and delivery logs.",
    icon: "✉",
    group: "Growth",
  },
  {
    key: "calendarScheduling",
    label: "Calendar & scheduling",
    description: "Events, timetables, resources and conflict checks.",
    icon: "□",
    group: "Growth",
  },
  {
    key: "parentPortal",
    label: "Parent portal",
    description: "Children, reports, fees and communication.",
    icon: "P",
    group: "People",
    legacyTopLevel: true,
  },
  {
    key: "studentPortal",
    label: "Student portal",
    description: "Results, reports, attendance and learning records.",
    icon: "S",
    group: "People",
    legacyTopLevel: true,
  },
  {
    key: "teacherPortal",
    label: "Teacher portal",
    description: "Classes, attendance, assessment and timetable tools.",
    icon: "T",
    group: "People",
    legacyTopLevel: true,
  },
  {
    key: "advancedAnalytics",
    label: "Advanced analytics",
    description: "Charts, trends, insights and performance views.",
    icon: "⌁",
    group: "Growth",
    legacyTopLevel: true,
  },
  {
    key: "apiAccess",
    label: "API access",
    description: "External integrations and developer APIs.",
    icon: "{ }",
    group: "Growth",
    legacyTopLevel: true,
  },
];

const DEFAULT_FEATURES: PlanFeatureFlags = {
  offlineSync: true,
  cloudBackup: false,
  reports: true,
  finance: false,
  attendance: false,
  identityCards: false,
  identitySafety: false,
  transport: false,
  schoolWebsites: false,
  communications: false,
  calendarScheduling: false,
  parentPortal: false,
  studentPortal: false,
  teacherPortal: true,
  advancedAnalytics: false,
  apiAccess: false,
};

const EMPTY_FORM: PlanFormState = {
  name: "",
  code: "",
  description: "",
  currency: "GHS",
  priceMonthly: "0",
  priceTermly: "0",
  priceYearly: "0",
  priceOneTime: "",
  deploymentMode: "eleeveon_cloud",
  licenseModel: "subscription",
  syncPolicy: "full",
  updatePolicy: "continuous",
  deviceLimit: "",
  activationLimit: "",
  offlineGraceDays: "",
  validationIntervalDays: "",
  requiresPeriodicValidation: false,
  trialDays: "14",
  pricingMode: "fixed",
  pricingPeriod: "termly",
  perStudentRate: "3",
  pricingMinimum: "0",
  pricingTiers: [{ upTo: "100", unitPrice: "3" }, { upTo: "", unitPrice: "2" }],
  publicVisible: true,
  acquisitionModes: ["self_service"],
  originalMetadata: {},
  maxSchools: "",
  maxBranches: "",
  maxUsers: "",
  maxStudents: "",
  maxTeachers: "",
  maxStorageMb: "",
  features: { ...DEFAULT_FEATURES },
  active: true,
};

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

const cleanText = (value: unknown) => String(value ?? "").trim();

const numberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
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
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const featureArray = (plan: PlanRow) =>
  Array.isArray(plan.features)
    ? plan.features.map((value) => cleanText(value)).filter(Boolean)
    : [];

const featureFlagFromPlan = (plan: PlanRow, key: FeatureKey): boolean => {
  const topLevel = plan[key as keyof PlanRow];
  if (typeof topLevel === "boolean") return topLevel;

  const metadataFlags =
    plan.metadata &&
    typeof plan.metadata === "object" &&
    plan.metadata.featureFlags &&
    typeof plan.metadata.featureFlags === "object"
      ? plan.metadata.featureFlags
      : {};

  if (typeof metadataFlags[key] === "boolean") {
    return metadataFlags[key];
  }

  return featureArray(plan).includes(key);
};

const allFeatureFlagsFromPlan = (plan: PlanRow): PlanFeatureFlags =>
  FEATURE_DEFINITIONS.reduce(
    (flags, feature) => {
      flags[feature.key] = featureFlagFromPlan(plan, feature.key);
      return flags;
    },
    { ...DEFAULT_FEATURES },
  );

const normalizePlan = (value: any): PlanRow | null => {
  const row = value?.plan || value?.data || value;
  if (!row || typeof row !== "object") return null;

  const id = cleanText(row.id || row.localId);
  if (!id) return null;

  return {
    ...row,
    id,
    name: cleanText(row.name),
    code: cleanText(row.code),
    currency: cleanText(row.currency) || "GHS",
    priceMonthly: Number(row.priceMonthly || 0),
    priceTermly: Number(row.priceTermly || 0),
    priceYearly: Number(row.priceYearly || 0),
    active: row.active !== false,
    features: Array.isArray(row.features) ? row.features : [],
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
};

const planToForm = (plan: PlanRow): PlanFormState => ({
  id: plan.id,
  name: plan.name || "",
  code: plan.code || "",
  description: plan.description || "",
  currency: plan.currency || "GHS",
  priceMonthly: String(plan.priceMonthly ?? 0),
  priceTermly: String(plan.priceTermly ?? 0),
  priceYearly: String(plan.priceYearly ?? 0),
  priceOneTime: plan.priceOneTime == null ? "" : String(plan.priceOneTime),
  deploymentMode: plan.deploymentMode || "eleeveon_cloud",
  licenseModel: plan.licenseModel || "subscription",
  syncPolicy: plan.syncPolicy || "full",
  updatePolicy: plan.updatePolicy || "continuous",
  deviceLimit: plan.deviceLimit == null ? "" : String(plan.deviceLimit),
  activationLimit: plan.activationLimit == null ? "" : String(plan.activationLimit),
  offlineGraceDays: plan.offlineGraceDays == null ? "" : String(plan.offlineGraceDays),
  validationIntervalDays: plan.validationIntervalDays == null ? "" : String(plan.validationIntervalDays),
  requiresPeriodicValidation: plan.requiresPeriodicValidation === true,
  trialDays: String(plan.metadata?.trialDays ?? 14),
  pricingMode: (["fixed","per_student","tiered"].includes(plan.metadata?.pricing?.mode) ? plan.metadata!.pricing.mode : "fixed"),
  pricingPeriod: (["monthly","termly","yearly"].includes(plan.metadata?.pricing?.billingPeriod) ? plan.metadata!.pricing.billingPeriod : "termly"),
  perStudentRate: String(plan.metadata?.pricing?.perStudentRate ?? 3),
  pricingMinimum: String(plan.metadata?.pricing?.minimumAmount ?? 0),
  pricingTiers: Array.isArray(plan.metadata?.pricing?.tiers)
    ? plan.metadata!.pricing.tiers.map((tier: any) => ({ upTo: tier.upTo == null ? "" : String(tier.upTo), unitPrice: String(tier.unitPrice) }))
    : [{ upTo: "100", unitPrice: "3" }, { upTo: "", unitPrice: "2" }],
  publicVisible: plan.metadata?.publicVisible !== false && plan.metadata?.visibility !== "private",
  acquisitionModes: Array.isArray(plan.availableAcquisitionModes)
    ? plan.availableAcquisitionModes.filter((mode): mode is AcquisitionMode =>
        ACQUISITION_OPTIONS.some((option) => option.value === mode))
    : plan.licenseModel === "trial" ? ["trial"] : plan.licenseModel === "complimentary" ? ["complimentary"] : ["self_service"],
  originalMetadata: { ...(plan.metadata || {}) },
  maxSchools: plan.maxSchools == null ? "" : String(plan.maxSchools),
  maxBranches: plan.maxBranches == null ? "" : String(plan.maxBranches),
  maxUsers: plan.maxUsers == null ? "" : String(plan.maxUsers),
  maxStudents: plan.maxStudents == null ? "" : String(plan.maxStudents),
  maxTeachers: plan.maxTeachers == null ? "" : String(plan.maxTeachers),
  maxStorageMb: plan.maxStorageMb == null ? "" : String(plan.maxStorageMb),
  features: allFeatureFlagsFromPlan(plan),
  active: plan.active !== false,
});

const formToPayload = (form: PlanFormState) => {
  const enabledFeatures = FEATURE_DEFINITIONS.filter(
    (feature) => form.features[feature.key],
  ).map((feature) => feature.key);

  const topLevelFlags = FEATURE_DEFINITIONS.reduce<Record<string, boolean>>(
    (result, feature) => {
      result[feature.key] = form.features[feature.key];
      return result;
    },
    {},
  );

  return {
    name: cleanText(form.name),
    code: cleanText(form.code).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    description: cleanText(form.description) || null,
    currency: cleanText(form.currency) || "GHS",
    priceMonthly: numberOrNull(form.priceMonthly) ?? 0,
    priceTermly: numberOrNull(form.priceTermly) ?? 0,
    priceYearly: numberOrNull(form.priceYearly) ?? 0,
    priceOneTime: numberOrNull(form.priceOneTime),
    deploymentMode: form.deploymentMode,
    licenseModel: form.licenseModel,
    syncPolicy: form.syncPolicy,
    updatePolicy: form.updatePolicy,
    deviceLimit: numberOrNull(form.deviceLimit),
    activationLimit: numberOrNull(form.activationLimit),
    offlineGraceDays: numberOrNull(form.offlineGraceDays),
    validationIntervalDays: numberOrNull(form.validationIntervalDays),
    requiresPeriodicValidation: form.requiresPeriodicValidation,
    availableAcquisitionModes: form.acquisitionModes,
    maxSchools: numberOrNull(form.maxSchools),
    maxBranches: numberOrNull(form.maxBranches),
    maxUsers: numberOrNull(form.maxUsers),
    maxStudents: numberOrNull(form.maxStudents),
    maxTeachers: numberOrNull(form.maxTeachers),
    maxStorageMb: numberOrNull(form.maxStorageMb),

    ...topLevelFlags,

    features: enabledFeatures,
    metadata: {
      ...form.originalMetadata,
      trialDays: numberOrNull(form.trialDays) ?? 14,
      publicVisible: form.publicVisible,
      visibility: form.publicVisible ? "public" : "private",
      pricing: form.pricingMode === "fixed" ? { mode: "fixed" } : {
        mode: form.pricingMode,
        billingPeriod: form.pricingPeriod,
        minimumAmount: Number(form.pricingMinimum || 0),
        ...(form.pricingMode === "per_student" ? { perStudentRate: Number(form.perStudentRate || 0) } : {
          tiers: form.pricingTiers.map((tier) => ({ upTo: tier.upTo.trim() ? Number(tier.upTo) : null, unitPrice: Number(tier.unitPrice || 0) })),
        }),
      },
      featureFlags: { ...form.features },
      featureSchemaVersion: 2,
      featureKeys: enabledFeatures,
    },

    active: form.active,
  };
};

const countEnabledFeatures = (plan: PlanRow) =>
  FEATURE_DEFINITIONS.filter((feature) =>
    featureFlagFromPlan(plan, feature.key),
  ).length;

function readableTextColor(color: string) {
  const value = cleanText(color);
  if (!value.startsWith("#")) return "#fff";

  let hex = value.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((character) => character + character)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#fff";

  const number = Number.parseInt(hex, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 155 ? "#111827" : "#ffffff";
}

function FeatureDot({
  enabled,
  primary,
}: {
  enabled: boolean;
  primary: string;
}) {
  return (
    <span
      className="dp-feature-dot"
      style={{
        background: enabled ? primary : "var(--dp-muted-dot)",
      }}
      aria-label={enabled ? "Included" : "Not included"}
    />
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="dp-empty">
      <div className="dp-empty-icon">◇</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </section>
  );
}

function Toast({
  tone,
  children,
  onClose,
}: {
  tone: ToastTone;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={`dp-toast ${tone}`}>
      <span>{children}</span>
      <button type="button" onClick={onClose} aria-label="Close message">
        ×
      </button>
    </div>
  );
}

export default function DeveloperPlans({ navigate }: Props) {
  void navigate;

  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings } = useSettings();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";
  const primaryText = readableTextColor(primary);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState("");

  const [message, setMessage] = useState<{
    tone: ToastTone;
    text: string;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState<"all" | FeatureKey>("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [billingPreview, setBillingPreview] =
    useState<BillingPreview>("monthly");

  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>({
    ...EMPTY_FORM,
    features: { ...EMPTY_FORM.features },
  });

  const load = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);

      const [plansResponse, subscriptionsResponse] = await Promise.all([
        apiClient<any>("/billing/plans/manage?includeInactive=true"),
        apiClient<any>("/billing/subscriptions").catch(() => []),
      ]);

      const nextPlans = toArray<any>(plansResponse, [
        "plans",
        "subscriptionPlans",
      ])
        .map(normalizePlan)
        .filter(Boolean) as PlanRow[];

      setPlans(nextPlans);
      setSubscriptions(
        toArray<SubscriptionRow>(subscriptionsResponse, [
          "subscriptions",
          "accountSubscriptions",
        ]),
      );
    } catch (error: any) {
      setMessage({
        tone: "error",
        text: error?.message || "Could not load subscription plans.",
      });
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

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, authenticated, accountId]);

  const currencies = useMemo(
    () =>
      Array.from(
        new Set(plans.map((plan) => plan.currency || "GHS").filter(Boolean)),
      ).sort(),
    [plans],
  );

  const filteredPlans = useMemo(() => {
    const term = query.trim().toLowerCase();

    return plans
      .filter((plan) => {
        const searchText = [
          plan.name,
          plan.code,
          plan.description,
          ...featureArray(plan),
        ]
          .join(" ")
          .toLowerCase();

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && plan.active !== false) ||
          (statusFilter === "inactive" && plan.active === false);

        const matchesFeature =
          featureFilter === "all" ||
          featureFlagFromPlan(plan, featureFilter);

        const matchesCurrency =
          currencyFilter === "all" ||
          (plan.currency || "GHS") === currencyFilter;

        return (
          matchesStatus &&
          matchesFeature &&
          matchesCurrency &&
          (!term || searchText.includes(term))
        );
      })
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) {
          return a.active !== false ? -1 : 1;
        }

        return Number(a.priceMonthly || 0) - Number(b.priceMonthly || 0);
      });
  }, [plans, query, statusFilter, featureFilter, currencyFilter]);

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.active !== false),
    [plans],
  );

  const paidPlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          Number(plan.priceMonthly || 0) > 0 ||
          Number(plan.priceTermly || 0) > 0 ||
          Number(plan.priceYearly || 0) > 0 ||
          Number(plan.priceOneTime || 0) > 0,
      ),
    [plans],
  );

  const averageMonthly = useMemo(() => {
    if (!paidPlans.length) return 0;
    return Math.round(
      paidPlans.reduce(
        (total, plan) => total + Number(plan.priceMonthly || 0),
        0,
      ) / paidPlans.length,
    );
  }, [paidPlans]);

  const potentialMrr = useMemo(
    () =>
      subscriptions
        .filter((subscription) =>
          ["active"].includes(
            cleanText(subscription.status).toLowerCase(),
          ),
        )
        .reduce((total, subscription) => {
          const plan =
            subscription.plan ||
            plans.find((item) => item.id === subscription.planId);
          return total + Number(plan?.priceMonthly || 0);
        }, 0),
    [plans, subscriptions],
  );

  const activeFilterCount = [
    statusFilter !== "all",
    featureFilter !== "all",
    currencyFilter !== "all",
  ].filter(Boolean).length;

  const featureCoverage = useMemo(
    () =>
      FEATURE_DEFINITIONS.map((feature) => ({
        label: feature.label,
        value: plans.filter((plan) =>
          featureFlagFromPlan(plan, feature.key),
        ).length,
      })).sort((a, b) => b.value - a.value),
    [plans],
  );

  const pricingChart = useMemo(
    () =>
      filteredPlans.map((plan) => ({
        label: plan.name || plan.code,
        monthly: Number(plan.priceMonthly || 0),
        termly: Number(plan.priceTermly || 0),
        yearly: Number(plan.priceYearly || 0),
      })),
    [filteredPlans],
  );

  const openCreate = () => {
    setMessage(null);
    setForm({
      ...EMPTY_FORM,
      features: { ...EMPTY_FORM.features },
      acquisitionModes: [...EMPTY_FORM.acquisitionModes],
      originalMetadata: {},
    });
    setFormOpen(true);
  };

  const openEdit = (plan: PlanRow) => {
    setMessage(null);
    setForm(planToForm(plan));
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const updateFeature = (key: FeatureKey, value: boolean) => {
    setForm((current) => ({
      ...current,
      features: {
        ...current.features,
        [key]: value,
      },
    }));
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = formToPayload(form);
    if (form.acquisitionModes.length === 0) {
      setMessage({ tone: "error", text: "Select at least one acquisition option." });
      return;
    }
    if (form.acquisitionModes.includes("trial") && (!Number.isInteger(Number(form.trialDays)) || Number(form.trialDays) < 1 || Number(form.trialDays) > 365)) {
      setMessage({ tone: "error", text: "Trial duration must be between 1 and 365 days." });
      return;
    }
    if (form.licenseModel === "perpetual" && form.priceOneTime.trim() === "") {
      setMessage({ tone: "error", text: "Set the one-time price for perpetual packages (0 is permitted)." });
      return;
    }

    if (!payload.name || !payload.code) {
      setMessage({
        tone: "error",
        text: "Plan name and code are required.",
      });
      return;
    }

    if (form.pricingMode !== "fixed") {
      if (form.licenseModel !== "subscription") { setMessage({ tone: "error", text: "Student pricing is available for subscriptions. Use a fixed price for trial, complimentary and perpetual packages." }); return; }
      if (form.pricingMode === "tiered") {
        const tiers = form.pricingTiers;
        let previous = 0;
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i]; const upper = Number(t.upTo);
          if (!Number.isFinite(Number(t.unitPrice)) || Number(t.unitPrice) < 0 || (t.upTo.trim() && (!Number.isSafeInteger(upper) || upper <= previous)) || (!t.upTo.trim() && i !== tiers.length - 1)) {
            setMessage({ tone: "error", text: "Tier thresholds must increase, with an empty final threshold meaning unlimited." }); return;
          }
          if (t.upTo.trim()) previous = upper;
        }
        if (!tiers.length || tiers[tiers.length - 1].upTo.trim()) { setMessage({ tone: "error", text: "The final tier must have an empty upper limit (unlimited)." }); return; }
      }
    }
    try {
      setSaving(true);
      setMessage(null);

      const response = form.id
        ? await apiClient<any>(`/billing/plans/${form.id}`, {
            method: "PATCH",
            body: payload,
          })
        : await apiClient<any>("/billing/plans", {
            method: "POST",
            body: payload,
          });

      const saved = normalizePlan(response);

      if (form.id && saved && saved.id !== form.id) {
        throw new Error("The server returned a different plan after update.");
      }

      if (!form.id && !saved?.id) {
        // Some endpoints return only `{ ok: true }`; reload is still authoritative.
        await load(true);
      } else {
        await load(true);
      }

      setFormOpen(false);
      setMessage({
        tone: "success",
        text: form.id
          ? "Subscription plan updated successfully."
          : "Subscription plan created successfully.",
      });
    } catch (error: any) {
      setMessage({
        tone: "error",
        text: error?.message || "Could not save the subscription plan.",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (plan: PlanRow) => {
    const nextActive = plan.active === false;

    try {
      setBusyPlanId(plan.id);
      setMessage(null);

      await apiClient<any>(`/billing/plans/${plan.id}`, {
        method: "PATCH",
        body: { active: nextActive },
      });

      await load(true);

      setMessage({
        tone: "success",
        text: nextActive ? "Plan activated." : "Plan deactivated.",
      });
    } catch (error: any) {
      setMessage({
        tone: "error",
        text: error?.message || "Could not update plan status.",
      });
    } finally {
      setBusyPlanId("");
    }
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setFeatureFilter("all");
    setCurrencyFilter("all");
  };

  if (loading || accountLoading) {
    return (
      <main
        className="dp-page"
        style={
          {
            "--dp-primary": primary,
            "--dp-primary-text": primaryText,
          } as React.CSSProperties
        }
      >
        <style>{css}</style>
        <section className="dp-loading">
          <span className="dp-spinner" />
          <h2>Loading subscription plans</h2>
          <p>Preparing prices, limits and platform capabilities.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="dp-page">
        <style>{css}</style>
        <EmptyState
          title="Developer access required"
          description="Sign in with a developer workspace to manage platform plans."
        />
      </main>
    );
  }

  return (
    <main
      className="dp-page"
      style={
        {
          "--dp-primary": primary,
          "--dp-primary-text": primaryText,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {message ? (
        <Toast
          tone={message.tone}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Toast>
      ) : null}

      <section className="dp-toolbar">
        <label className="dp-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plans..."
          />
        </label>

        <button
          type="button"
          className="dp-primary-action"
          onClick={openCreate}
          aria-label="Add subscription plan"
        >
          +
        </button>

        <button
          type="button"
          className={`dp-icon-action ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Filter plans"
        >
          <span>≡</span>
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="dp-icon-action"
          onClick={() => setMoreOpen(true)}
          aria-label="More plan options"
        >
          ⋯
        </button>
      </section>

      <section className="dp-summary-grid">
        <article>
          <span>Plans</span>
          <strong>{plans.length}</strong>
          <small>{activePlans.length} active</small>
        </article>
        <article>
          <span>Paid plans</span>
          <strong>{paidPlans.length}</strong>
          <small>{plans.length - paidPlans.length} free or trial</small>
        </article>
        <article>
          <span>Average monthly</span>
          <strong>{money(averageMonthly)}</strong>
          <small>Across paid plans</small>
        </article>
        <article>
          <span>Potential MRR</span>
          <strong>{money(potentialMrr)}</strong>
          <small>Active subscriptions (list-price estimate)</small>
        </article>
      </section>

      {viewMode === "cards" ? (
        filteredPlans.length ? (
          <section className="dp-card-grid">
            {filteredPlans.map((plan) => {
              const enabled = FEATURE_DEFINITIONS.filter((feature) =>
                featureFlagFromPlan(plan, feature.key),
              );

              const price =
                billingPreview === "one_time" ? Number(plan.priceOneTime || 0) :
                billingPreview === "monthly"
                  ? Number(plan.priceMonthly || 0)
                  : billingPreview === "termly"
                    ? Number(plan.priceTermly || 0)
                    : Number(plan.priceYearly || 0);

              return (
                <article
                  key={plan.id}
                  className={`dp-plan-card ${
                    plan.active === false ? "inactive" : ""
                  }`}
                >
                  <header>
                    <div className="dp-plan-mark">
                      {String(plan.name || "P")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div className="dp-plan-heading">
                      <div className="dp-plan-title-row">
                        <h3>{plan.name || "Untitled plan"}</h3>
                        <span
                          className={`dp-status-dot ${
                            plan.active === false ? "inactive" : ""
                          }`}
                          title={plan.active === false ? "Inactive" : "Active"}
                        />
                      </div>
                      <p>{plan.code || "no_code"}</p>
                    </div>
                    <button
                      type="button"
                      className="dp-card-more"
                      onClick={() => openEdit(plan)}
                      aria-label={`Edit ${plan.name}`}
                    >
                      ⋯
                    </button>
                  </header>

                  <div className="dp-price-row">
                    <strong>{money(price, plan.currency || "GHS")}</strong>
                    <span>
                      {billingPreview === "one_time"
                          ? "one-time"
                          : billingPreview === "monthly"
                          ? "month"
                        : billingPreview === "termly"
                          ? "4 months"
                          : "year"}
                    </span>
                  </div>

                  <p className="dp-description">
                    {plan.description || "No plan description has been added."}
                  </p>

                  <div className="dp-limit-row">
                    <span>
                      <b>{plan.maxStudents ?? "∞"}</b>
                      students
                    </span>
                    <span>
                      <b>{plan.maxBranches ?? "∞"}</b>
                      branches
                    </span>
                    <span>
                      <b>{plan.maxStorageMb ?? "∞"}</b>
                      MB
                    </span>
                  </div>

                  <div className="dp-feature-summary">
                    <span>
                      {enabled.slice(0, 5).map((feature) => (
                        <i key={feature.key} title={feature.label}>
                          {feature.icon}
                        </i>
                      ))}
                    </span>
                    <small>
                      {enabled.length}/{FEATURE_DEFINITIONS.length} capabilities
                    </small>
                  </div>

                  <footer>
                    <span>{plan.deploymentMode || "eleeveon_cloud"} · {dateText(plan.updatedAt)}</span>
                    <div>
                      <button
                        type="button"
                        className="dp-secondary-button"
                        onClick={() => openEdit(plan)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="dp-secondary-button"
                        disabled={busyPlanId === plan.id}
                        onClick={() => void togglePlan(plan)}
                      >
                        {busyPlanId === plan.id
                          ? "Saving..."
                          : plan.active === false
                            ? "Activate"
                            : "Deactivate"}
                      </button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState
            title="No plans found"
            description="Adjust the search or filters, or create a new subscription plan."
          />
        )
      ) : null}

      {viewMode === "table" ? (
        <section className="dp-table-card">
          <div className="dp-table-title">Plans ({filteredPlans.length})</div>
          <div className="dp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Monthly</th>
                  <th>Termly</th>
                  <th>Yearly</th>
                  <th>Students</th>
                  <th>Capabilities</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.name}</strong>
                      <small>{plan.code}</small>
                    </td>
                    <td>{money(Number(plan.priceMonthly || 0), plan.currency)}</td>
                    <td>{money(Number(plan.priceTermly || 0), plan.currency)}</td>
                    <td>{money(Number(plan.priceYearly || 0), plan.currency)}</td>
                    <td>{plan.maxStudents ?? "Unlimited"}</td>
                    <td>
                      {countEnabledFeatures(plan)}/{FEATURE_DEFINITIONS.length}
                    </td>
                    <td>
                      <span className="dp-inline-status">
                        <i
                          className={
                            plan.active === false ? "inactive" : "active"
                          }
                        />
                        {plan.active === false ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dp-table-action"
                        onClick={() => openEdit(plan)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {viewMode === "analytics" ? (
        <section className="dp-analytics-grid">
          <article className="dp-chart-card">
            <header>
              <div>
                <h3>Plan pricing</h3>
                <p>Monthly and yearly price comparison.</p>
              </div>
            </header>
            <div className="dp-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pricingChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.2}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-18}
                    height={58}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="monthly"
                    fill="var(--dp-primary)"
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey="termly"
                    fill="#0f766e"
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey="yearly"
                    fill="#64748b"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="dp-chart-card">
            <header>
              <div>
                <h3>Capability coverage</h3>
                <p>How many plans include each platform capability.</p>
              </div>
            </header>
            <div className="dp-coverage-list">
              {featureCoverage.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <div>
                    <i
                      style={{
                        width: `${
                          plans.length
                            ? Math.max(4, (item.value / plans.length) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <b>{item.value}</b>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {filterOpen ? (
        <div
          className="dp-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFilterOpen(false);
          }}
        >
          <section className="dp-sheet dp-small-sheet">
            <header className="dp-sheet-header">
              <div>
                <h2>Filter plans</h2>
                <p>Narrow the list without changing saved data.</p>
              </div>
              <button type="button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </header>

            <div className="dp-sheet-body">
              <label className="dp-field">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <label className="dp-field">
                <span>Capability</span>
                <select
                  value={featureFilter}
                  onChange={(event) =>
                    setFeatureFilter(event.target.value as "all" | FeatureKey)
                  }
                >
                  <option value="all">All capabilities</option>
                  {FEATURE_DEFINITIONS.map((feature) => (
                    <option key={feature.key} value={feature.key}>
                      {feature.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dp-field">
                <span>Currency</span>
                <select
                  value={currencyFilter}
                  onChange={(event) => setCurrencyFilter(event.target.value)}
                >
                  <option value="all">All currencies</option>
                  {currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <footer className="dp-sheet-footer">
              <button
                type="button"
                className="dp-secondary-button"
                onClick={resetFilters}
              >
                Reset
              </button>
              <button
                type="button"
                className="dp-primary-button"
                onClick={() => setFilterOpen(false)}
              >
                Apply
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {moreOpen ? (
        <div
          className="dp-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <section className="dp-sheet dp-small-sheet">
            <header className="dp-sheet-header">
              <div>
                <h2>Plan options</h2>
                <p>Change view or refresh server data.</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </header>

            <div className="dp-option-list">
              {(["cards", "table", "analytics"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? "active" : ""}
                  onClick={() => {
                    setViewMode(mode);
                    setMoreOpen(false);
                  }}
                >
                  <span>
                    {mode === "cards"
                      ? "▦"
                      : mode === "table"
                        ? "☷"
                        : "⌁"}
                  </span>
                  <div>
                    <strong>
                      {mode === "cards"
                        ? "Cards"
                        : mode === "table"
                          ? "Table"
                          : "Analytics"}
                    </strong>
                    <small>
                      {mode === "cards"
                        ? "Compact plan cards"
                        : mode === "table"
                          ? "Dense comparison table"
                          : "Pricing and coverage insights"}
                    </small>
                  </div>
                  <i>{viewMode === mode ? "✓" : ""}</i>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setBillingPreview((current) =>
                      current === "monthly" ? "termly" :
                      current === "termly" ? "yearly" :
                      current === "yearly" ? "one_time" : "monthly",
                  );
                  setMoreOpen(false);
                }}
              >
                <span>₵</span>
                <div>
                      <strong>
                      Show{" "}
                      {billingPreview === "one_time" ? "monthly" : billingPreview === "yearly" ? "one-time" : billingPreview === "monthly"
                      ? "termly"
                      : billingPreview === "termly"
                        ? "yearly"
                        : "monthly"} prices
                  </strong>
                  <small>Changes only the card price preview.</small>
                </div>
                <i />
              </button>

              <button
                type="button"
                disabled={refreshing}
                onClick={() => {
                  void load(true);
                  setMoreOpen(false);
                }}
              >
                <span>↻</span>
                <div>
                  <strong>{refreshing ? "Refreshing..." : "Refresh data"}</strong>
                  <small>Reload plans and subscriptions from the server.</small>
                </div>
                <i />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {formOpen ? (
        <div
          className="dp-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <form className="dp-sheet dp-editor-sheet" onSubmit={savePlan}>
            <header className="dp-sheet-header">
              <div>
                <h2>{form.id ? "Edit plan" : "Create plan"}</h2>
                <p>
                  Pricing, limits and the complete Eleeveon capability package.
                </p>
              </div>
              <button type="button" onClick={closeForm} disabled={saving}>
                ×
              </button>
            </header>

            <div className="dp-sheet-body dp-editor-body">
              <section className="dp-form-section">
                <div className="dp-section-title">
                  <h3>Plan identity</h3>
                  <p>Public name, internal code and description.</p>
                </div>

                <div className="dp-field-grid">
                  <label className="dp-field">
                    <span>Plan name *</span>
                    <input
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Complete"
                      required
                    />
                  </label>

                  <label className="dp-field">
                    <span>Plan code *</span>
                    <input
                      value={form.code}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      placeholder="complete"
                      required
                    />
                  </label>

                  <label className="dp-field dp-field-wide">
                    <span>Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Describe who this plan is for."
                      rows={3}
                    />
                  </label>
                </div>
              </section>

              <section className="dp-form-section">
                <div className="dp-section-title">
                  <h3>Pricing</h3>
                  <p>Monthly, four-month termly and yearly prices shown to customers.</p>
                </div>

                <div className="dp-field-grid dp-three-columns">
                  <label className="dp-field">
                    <span>Currency</span>
                    <input
                      value={form.currency}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="GHS"
                    />
                  </label>

                  <label className="dp-field">
                    <span>Monthly price</span>
                    <input
                      type="number"
                      min="0"
                      value={form.priceMonthly}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          priceMonthly: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="dp-field">
                    <span>Termly price (4 months)</span>
                    <input
                      type="number"
                      min="0"
                      value={form.priceTermly}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          priceTermly: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="dp-field">
                    <span>Yearly price</span>
                    <input
                      type="number"
                      min="0"
                      value={form.priceYearly}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          priceYearly: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="dp-form-section">
                <div className="dp-section-title">
                  <h3>Deployment & ownership</h3>
                  <p>Decide where the application runs and how the school owns access. This is separate from the acquisition route.</p>
                </div>
                <div className="dp-field-grid dp-three-columns">
                  <label className="dp-field"><span>Deployment</span><select value={form.deploymentMode} onChange={(e) => setForm(s => ({...s, deploymentMode:e.target.value}))}>
                    {DEPLOYMENT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.title}</option>)}
                  </select></label>
                  <label className="dp-field"><span>Licence model</span><select value={form.licenseModel} onChange={(e) => setForm(s => ({...s, licenseModel:e.target.value}))}>
                    <option value="subscription">Subscription</option><option value="trial">Trial</option><option value="complimentary">Complimentary / pilot</option><option value="perpetual">Perpetual purchase</option>
                  </select></label>
                  <label className="dp-field"><span>Sync policy</span><select value={form.syncPolicy} onChange={(e) => setForm(s => ({...s, syncPolicy:e.target.value}))}>
                    <option value="full">Full cloud sync</option><option value="platform_only">Platform only</option><option value="disabled">No cloud sync</option>
                  </select></label>
                  <label className="dp-field"><span>Update policy</span><select value={form.updatePolicy} onChange={(e) => setForm(s => ({...s, updatePolicy:e.target.value}))}>
                    <option value="continuous">Continuous</option><option value="security_only">Security only</option><option value="version_locked">Version-locked</option>
                  </select></label>
                  <label className="dp-field"><span>One-time price (GHS)</span><input type="number" min="0" value={form.priceOneTime} onChange={(e) => setForm(s => ({...s,priceOneTime:e.target.value}))} placeholder="Not applicable" /></label>
                  {([ ["deviceLimit", "Device limit"], ["activationLimit", "Activations"], ["offlineGraceDays", "Offline grace days"], ["validationIntervalDays", "Validation interval days"] ] as const).map(([key, title]) =>
                    <label key={key} className="dp-field"><span>{title}</span><input type="number" min="0" value={form[key]} onChange={(e) => setForm(s => ({...s,[key]:e.target.value}))} placeholder="Not configured" /></label>)}
                  <label className="dp-field"><span>Periodic licence validation</span><select value={form.requiresPeriodicValidation ? "yes" : "no"} onChange={(e) => setForm(s => ({...s,requiresPeriodicValidation:e.target.value === "yes"}))}>
                    <option value="no">Not required</option><option value="yes">Required</option>
                  </select></label>
                </div>
              </section>
              <section className="dp-form-section">
                <div className="dp-section-title"><h3>How schools can acquire this package</h3><p>These are catalogue options. Activating a pilot, taking payments, or issuing a licence requires separately authorized backend workflows.</p></div>
                <div className="dp-feature-grid">
                  {ACQUISITION_OPTIONS.map(option => <button key={option.value} type="button" className={`dp-feature-option ${form.acquisitionModes.includes(option.value) ? "enabled" : ""}`} onClick={() => setForm(current => ({ ...current, acquisitionModes:current.acquisitionModes.includes(option.value) ? current.acquisitionModes.filter(m => m !== option.value) : [...current.acquisitionModes, option.value] }))}>
                    <span className="dp-feature-copy"><strong>{option.title}</strong><small>{option.description}</small></span><span className={`dp-toggle ${form.acquisitionModes.includes(option.value) ? "enabled" : ""}`}><i/></span>
                  </button>)}
                </div>
                {form.acquisitionModes.includes("trial") && <div className="dp-field-grid"><label className="dp-field"><span>Trial duration (days)</span><input type="number" min="1" max="365" value={form.trialDays} onChange={(e) => setForm(s => ({...s,trialDays:e.target.value}))}/></label></div>}
                <p style={{fontSize:12,opacity:.75,marginTop:10}}>Trial duration is saved in package metadata. Registration will use it only after the trial bootstrap integration is deployed. Complimentary access must be assigned explicitly to school account IDs.</p>
              </section>
              <section className="dp-form-section">
                <div className="dp-section-title"><h3>Subscription price calculation</h3><p>Keep the billing period separate from the amount calculation. Progressive tiers charge only additional students at the next rate.</p></div>
                <div className="dp-field-grid dp-three-columns">
                  <label className="dp-field"><span>Pricing model</span><select value={form.pricingMode} onChange={(e) => setForm(s => ({ ...s, pricingMode: e.target.value as PlanFormState["pricingMode"] }))}>
                    <option value="fixed">Fixed package price</option><option value="per_student">Flat rate per student</option><option value="tiered">Progressive student tiers</option>
                  </select></label>
                  {form.pricingMode !== "fixed" && <>
                    <label className="dp-field"><span>Rate applies per</span><select value={form.pricingPeriod} onChange={(e) => setForm(s => ({...s,pricingPeriod:e.target.value as PlanFormState["pricingPeriod"]}))}><option value="termly">Term</option><option value="monthly">Month</option><option value="yearly">Year</option></select></label>
                    <label className="dp-field"><span>Minimum charge (GHS)</span><input type="number" min="0" step="0.01" value={form.pricingMinimum} onChange={(e) => setForm(s => ({...s,pricingMinimum:e.target.value}))}/></label>
                  </>}
                  {form.pricingMode === "per_student" && <label className="dp-field"><span>Rate per student (GHS)</span><input type="number" min="0" step="0.01" value={form.perStudentRate} onChange={(e) => setForm(s => ({...s,perStudentRate:e.target.value}))}/></label>}
                </div>
                {form.pricingMode === "tiered" && <div style={{display:"grid",gap:10,marginTop:12}}>
                  {form.pricingTiers.map((tier,index) => <div key={index} className="dp-field-grid dp-three-columns">
                    <label className="dp-field"><span>Through student # (blank = unlimited)</span><input type="number" min="1" value={tier.upTo} onChange={(e) => setForm(s => ({...s,pricingTiers:s.pricingTiers.map((t,i) => i===index ? {...t,upTo:e.target.value}:t)}))}/></label>
                    <label className="dp-field"><span>Rate per student (GHS)</span><input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => setForm(s => ({...s,pricingTiers:s.pricingTiers.map((t,i) => i===index ? {...t,unitPrice:e.target.value}:t)}))}/></label>
                    <button type="button" className="dp-secondary-button" disabled={form.pricingTiers.length<=1} onClick={() => setForm(s => ({...s,pricingTiers:s.pricingTiers.filter((_,i)=>i!==index)}))}>Remove tier</button>
                  </div>)}
                  <button type="button" className="dp-secondary-button" onClick={() => setForm(s => ({...s,pricingTiers:[...s.pricingTiers,{upTo:"",unitPrice:"0"}]}))}>+ Add tier</button>
                </div>}
                <label className="dp-field" style={{marginTop:12}}><span>Public catalogue visibility</span><select value={form.publicVisible ? "public" : "private"} onChange={(e) => setForm(s => ({...s,publicVisible:e.target.value==="public"}))}>
                  <option value="public">Publish for public visitors</option><option value="private">Private — developer only</option>
                </select></label>
                <p style={{opacity:.7,fontSize:12,marginTop:8}}>Complimentary/pilot and private-hosted plans are never listed publicly. Student-priced checkout remains disabled until verified enrollment billing is connected.</p>
              </section>
              <section className="dp-form-section">
                <div className="dp-section-title">
                  <h3>Usage limits</h3>
                  <p>Leave a field blank for no configured limit.</p>
                </div>

                <div className="dp-field-grid dp-three-columns">
                  {[
                    ["maxSchools", "Schools"],
                    ["maxBranches", "Branches"],
                    ["maxUsers", "Users"],
                    ["maxStudents", "Students"],
                    ["maxTeachers", "Teachers"],
                    ["maxStorageMb", "Storage (MB)"],
                  ].map(([key, label]) => (
                    <label className="dp-field" key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={form[key as keyof PlanFormState] as string}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder="Unlimited"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="dp-form-section">
                <div className="dp-section-title dp-feature-heading">
                  <div>
                    <h3>Platform capabilities</h3>
                    <p>
                      Includes websites, ID cards, attendance, safety and the
                      wider system.
                    </p>
                  </div>
                  <span>
                    {
                      FEATURE_DEFINITIONS.filter(
                        (feature) => form.features[feature.key],
                      ).length
                    }
                    /{FEATURE_DEFINITIONS.length}
                  </span>
                </div>

                {(["Core", "People", "Operations", "Growth"] as const).map(
                  (group) => (
                    <div className="dp-feature-group" key={group}>
                      <h4>{group}</h4>
                      <div className="dp-feature-grid">
                        {FEATURE_DEFINITIONS.filter(
                          (feature) => feature.group === group,
                        ).map((feature) => {
                          const enabled = form.features[feature.key];

                          return (
                            <button
                              key={feature.key}
                              type="button"
                              className={`dp-feature-option ${
                                enabled ? "enabled" : ""
                              }`}
                              onClick={() =>
                                updateFeature(feature.key, !enabled)
                              }
                            >
                              <span className="dp-feature-icon">
                                {feature.icon}
                              </span>
                              <span className="dp-feature-copy">
                                <strong>{feature.label}</strong>
                                <small>{feature.description}</small>
                              </span>
                              <span
                                className={`dp-toggle ${
                                  enabled ? "enabled" : ""
                                }`}
                              >
                                <i />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </section>

              <section className="dp-form-section dp-status-section">
                <div>
                  <h3>Plan availability</h3>
                  <p>
                    Inactive plans remain available for history but cannot be
                    newly selected.
                  </p>
                </div>
                <button
                  type="button"
                  className={`dp-toggle dp-large-toggle ${
                    form.active ? "enabled" : ""
                  }`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                  aria-label={form.active ? "Deactivate plan" : "Activate plan"}
                >
                  <i />
                </button>
              </section>
            </div>

            <footer className="dp-sheet-footer">
              <button
                type="button"
                className="dp-secondary-button"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dp-primary-button"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : form.id
                    ? "Save changes"
                    : "Create plan"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}

const css = String.raw`
  .dp-page {
    --dp-bg: var(--bg, #f6f7fb);
    --dp-card: var(--card, #ffffff);
    --dp-surface: var(--surface, #ffffff);
    --dp-text: var(--text, #111827);
    --dp-muted: var(--muted, #6b7280);
    --dp-border: var(--border, #e5e7eb);
    --dp-soft: color-mix(in srgb, var(--dp-primary) 8%, var(--dp-card));
    --dp-muted-dot: color-mix(in srgb, var(--dp-muted) 28%, transparent);
    min-height: 100%;
    color: var(--dp-text);
  }

  * { box-sizing: border-box; }

  button, input, select, textarea { font: inherit; }

  button { color: inherit; }

  .dp-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 42px 42px 42px;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }

  .dp-search {
    min-width: 0;
    height: 42px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 13px;
    border: 1px solid var(--dp-border);
    border-radius: 13px;
    background: var(--dp-card);
    box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
  }

  .dp-search span {
    color: var(--dp-muted);
    font-size: 19px;
    line-height: 1;
  }

  .dp-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--dp-text);
  }

  .dp-search input::placeholder { color: var(--dp-muted); }

  .dp-primary-action,
  .dp-icon-action {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    border: 1px solid var(--dp-border);
    cursor: pointer;
    position: relative;
    transition: .18s ease;
  }

  .dp-primary-action {
    background: var(--dp-primary);
    border-color: var(--dp-primary);
    color: var(--dp-primary-text);
    font-size: 24px;
    box-shadow: 0 7px 18px color-mix(in srgb, var(--dp-primary) 24%, transparent);
  }

  .dp-icon-action {
    background: var(--dp-card);
    color: var(--dp-text);
    font-size: 20px;
  }

  .dp-icon-action.active {
    color: var(--dp-primary-text);
    background: var(--dp-primary);
    border-color: var(--dp-primary);
  }

  .dp-icon-action b {
    position: absolute;
    top: -5px;
    right: -4px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    border: 2px solid var(--dp-bg);
  }

  .dp-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin-bottom: 12px;
  }

  .dp-summary-grid article {
    min-width: 0;
    padding: 13px 14px;
    border: 1px solid var(--dp-border);
    border-radius: 14px;
    background: var(--dp-card);
  }

  .dp-summary-grid span,
  .dp-summary-grid small {
    display: block;
    color: var(--dp-muted);
    font-size: 11px;
  }

  .dp-summary-grid strong {
    display: block;
    margin: 4px 0 3px;
    font-size: clamp(16px, 2vw, 21px);
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dp-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }

  .dp-plan-card {
    min-width: 0;
    padding: 15px;
    border: 1px solid var(--dp-border);
    border-radius: 17px;
    background: var(--dp-card);
    box-shadow: 0 4px 16px rgba(15, 23, 42, .035);
  }

  .dp-plan-card.inactive { opacity: .7; }

  .dp-plan-card > header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dp-plan-mark {
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--dp-primary-text);
    background: var(--dp-primary);
    font-weight: 800;
  }

  .dp-plan-heading { min-width: 0; flex: 1; }

  .dp-plan-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dp-plan-title-row h3 {
    min-width: 0;
    margin: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dp-plan-heading p {
    margin: 3px 0 0;
    color: var(--dp-muted);
    font-size: 11px;
  }

  .dp-status-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #16a34a;
  }

  .dp-status-dot.inactive { background: #94a3b8; }

  .dp-card-more {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--dp-muted);
    cursor: pointer;
    font-size: 20px;
  }

  .dp-card-more:hover { background: var(--dp-soft); }

  .dp-price-row {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-top: 15px;
  }

  .dp-price-row strong { font-size: 24px; letter-spacing: -.03em; }

  .dp-price-row span {
    color: var(--dp-muted);
    font-size: 12px;
  }

  .dp-description {
    min-height: 38px;
    margin: 8px 0 13px;
    color: var(--dp-muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .dp-limit-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  .dp-limit-row span {
    min-width: 0;
    padding: 8px;
    border-radius: 10px;
    background: var(--dp-soft);
    color: var(--dp-muted);
    font-size: 10px;
    text-align: center;
  }

  .dp-limit-row b {
    display: block;
    color: var(--dp-text);
    font-size: 12px;
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dp-feature-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 13px;
  }

  .dp-feature-summary > span {
    display: flex;
    align-items: center;
  }

  .dp-feature-summary i {
    width: 25px;
    height: 25px;
    margin-left: -4px;
    display: grid;
    place-items: center;
    border: 2px solid var(--dp-card);
    border-radius: 999px;
    background: var(--dp-soft);
    color: var(--dp-primary);
    font-size: 10px;
    font-style: normal;
    font-weight: 800;
  }

  .dp-feature-summary i:first-child { margin-left: 0; }

  .dp-feature-summary small { color: var(--dp-muted); font-size: 10px; }

  .dp-plan-card > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--dp-border);
  }

  .dp-plan-card > footer > span {
    color: var(--dp-muted);
    font-size: 10px;
  }

  .dp-plan-card > footer > div { display: flex; gap: 6px; }

  .dp-secondary-button,
  .dp-primary-button {
    min-height: 36px;
    padding: 0 13px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 700;
    font-size: 12px;
    transition: .18s ease;
  }

  .dp-secondary-button {
    border: 1px solid var(--dp-border);
    background: var(--dp-card);
    color: var(--dp-text);
  }

  .dp-primary-button {
    border: 1px solid var(--dp-primary);
    background: var(--dp-primary);
    color: var(--dp-primary-text);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--dp-primary) 20%, transparent);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: .58;
  }

  .dp-table-card,
  .dp-chart-card {
    border: 1px solid var(--dp-border);
    border-radius: 17px;
    background: var(--dp-card);
    overflow: hidden;
  }

  .dp-table-title {
    padding: 13px 15px;
    border-bottom: 1px solid var(--dp-border);
    font-size: 13px;
    font-weight: 800;
  }

  .dp-table-scroll { overflow: auto; }

  .dp-table-scroll table {
    width: 100%;
    min-width: 830px;
    border-collapse: collapse;
  }

  .dp-table-scroll th,
  .dp-table-scroll td {
    padding: 11px 13px;
    border-bottom: 1px solid var(--dp-border);
    text-align: left;
    font-size: 12px;
  }

  .dp-table-scroll th {
    color: var(--dp-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .07em;
  }

  .dp-table-scroll td strong,
  .dp-table-scroll td small {
    display: block;
  }

  .dp-table-scroll td small {
    margin-top: 3px;
    color: var(--dp-muted);
    font-size: 10px;
  }

  .dp-inline-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .dp-inline-status i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  .dp-inline-status i.active { background: #16a34a; }
  .dp-inline-status i.inactive { background: #94a3b8; }

  .dp-table-action {
    border: 0;
    background: transparent;
    color: var(--dp-primary);
    cursor: pointer;
    font-weight: 800;
  }

  .dp-analytics-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(300px, .9fr);
    gap: 10px;
  }

  .dp-chart-card { padding: 15px; }

  .dp-chart-card header h3 {
    margin: 0;
    font-size: 14px;
  }

  .dp-chart-card header p {
    margin: 4px 0 0;
    color: var(--dp-muted);
    font-size: 11px;
  }

  .dp-chart { height: 340px; margin-top: 12px; }

  .dp-coverage-list {
    margin-top: 15px;
    display: grid;
    gap: 10px;
  }

  .dp-coverage-list > div {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(90px, 1.4fr) 24px;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }

  .dp-coverage-list > div > div {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--dp-soft);
  }

  .dp-coverage-list i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--dp-primary);
  }

  .dp-coverage-list b { text-align: right; }

  .dp-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: flex-end;
    background: rgba(15, 23, 42, .36);
    backdrop-filter: blur(3px);
  }

  .dp-sheet {
    width: min(760px, 100%);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--dp-border);
    background: var(--dp-bg);
    box-shadow: -18px 0 45px rgba(15, 23, 42, .18);
  }

  .dp-small-sheet { width: min(390px, 100%); }

  .dp-sheet-header,
  .dp-sheet-footer {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px;
    background: var(--dp-card);
  }

  .dp-sheet-header { border-bottom: 1px solid var(--dp-border); }
  .dp-sheet-footer { border-top: 1px solid var(--dp-border); justify-content: flex-end; }

  .dp-sheet-header h2 {
    margin: 0;
    font-size: 16px;
  }

  .dp-sheet-header p {
    margin: 3px 0 0;
    color: var(--dp-muted);
    font-size: 11px;
  }

  .dp-sheet-header > button {
    width: 36px;
    height: 36px;
    border: 1px solid var(--dp-border);
    border-radius: 11px;
    background: var(--dp-card);
    cursor: pointer;
    font-size: 20px;
  }

  .dp-sheet-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 15px;
  }

  .dp-editor-body { display: grid; gap: 10px; }

  .dp-form-section {
    padding: 15px;
    border: 1px solid var(--dp-border);
    border-radius: 16px;
    background: var(--dp-card);
  }

  .dp-section-title h3,
  .dp-status-section h3 {
    margin: 0;
    font-size: 14px;
  }

  .dp-section-title p,
  .dp-status-section p {
    margin: 4px 0 0;
    color: var(--dp-muted);
    font-size: 11px;
    line-height: 1.5;
  }

  .dp-field-grid {
    margin-top: 13px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .dp-three-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }

  .dp-field-wide { grid-column: 1 / -1; }

  .dp-field {
    display: grid;
    gap: 6px;
  }

  .dp-field > span {
    color: var(--dp-muted);
    font-size: 10px;
    font-weight: 800;
  }

  .dp-field input,
  .dp-field select,
  .dp-field textarea {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--dp-border);
    border-radius: 11px;
    outline: 0;
    padding: 9px 11px;
    background: var(--dp-surface);
    color: var(--dp-text);
    font-size: 12px;
  }

  .dp-field textarea { resize: vertical; }

  .dp-field input:focus,
  .dp-field select:focus,
  .dp-field textarea:focus {
    border-color: var(--dp-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dp-primary) 12%, transparent);
  }

  .dp-feature-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dp-feature-heading > span {
    flex: 0 0 auto;
    padding: 5px 9px;
    border-radius: 999px;
    background: var(--dp-soft);
    color: var(--dp-primary);
    font-size: 10px;
    font-weight: 800;
  }

  .dp-feature-group { margin-top: 15px; }

  .dp-feature-group h4 {
    margin: 0 0 8px;
    color: var(--dp-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .dp-feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .dp-feature-option {
    min-width: 0;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 10px;
    border: 1px solid var(--dp-border);
    border-radius: 13px;
    background: var(--dp-surface);
    text-align: left;
    cursor: pointer;
  }

  .dp-feature-option.enabled {
    border-color: color-mix(in srgb, var(--dp-primary) 38%, var(--dp-border));
    background: var(--dp-soft);
  }

  .dp-feature-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--dp-card);
    color: var(--dp-primary);
    font-weight: 800;
    font-size: 12px;
  }

  .dp-feature-copy { min-width: 0; }

  .dp-feature-copy strong,
  .dp-feature-copy small {
    display: block;
  }

  .dp-feature-copy strong { font-size: 11px; }

  .dp-feature-copy small {
    margin-top: 3px;
    color: var(--dp-muted);
    font-size: 9px;
    line-height: 1.35;
  }

  .dp-toggle {
    width: 36px;
    height: 21px;
    flex: 0 0 auto;
    padding: 2px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--dp-muted) 28%, transparent);
    transition: .18s ease;
  }

  .dp-toggle i {
    display: block;
    width: 17px;
    height: 17px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, .18);
    transition: .18s ease;
  }

  .dp-toggle.enabled { background: var(--dp-primary); }

  .dp-toggle.enabled i { transform: translateX(15px); }

  .dp-large-toggle {
    width: 44px;
    height: 25px;
    cursor: pointer;
  }

  .dp-large-toggle i {
    width: 21px;
    height: 21px;
  }

  .dp-large-toggle.enabled i { transform: translateX(19px); }

  .dp-status-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .dp-option-list {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  .dp-option-list > button {
    width: 100%;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 10px;
    padding: 11px;
    border: 0;
    border-radius: 13px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .dp-option-list > button:hover,
  .dp-option-list > button.active {
    background: var(--dp-soft);
  }

  .dp-option-list > button > span {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: var(--dp-card);
    color: var(--dp-primary);
    font-weight: 800;
  }

  .dp-option-list strong,
  .dp-option-list small {
    display: block;
  }

  .dp-option-list strong { font-size: 12px; }

  .dp-option-list small {
    margin-top: 3px;
    color: var(--dp-muted);
    font-size: 10px;
  }

  .dp-option-list > button > i {
    color: var(--dp-primary);
    font-style: normal;
    font-weight: 900;
  }

  .dp-toast {
    position: fixed;
    z-index: 1200;
    top: 18px;
    right: 18px;
    max-width: min(390px, calc(100vw - 36px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 13px;
    border-radius: 13px;
    color: #fff;
    box-shadow: 0 14px 35px rgba(15, 23, 42, .2);
    font-size: 12px;
  }

  .dp-toast.success { background: #15803d; }
  .dp-toast.error { background: #b91c1c; }
  .dp-toast.info { background: #1d4ed8; }

  .dp-toast button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
  }

  .dp-empty,
  .dp-loading {
    min-height: 330px;
    display: grid;
    place-items: center;
    align-content: center;
    padding: 30px;
    text-align: center;
    border: 1px dashed var(--dp-border);
    border-radius: 17px;
    background: var(--dp-card);
  }

  .dp-empty-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: var(--dp-soft);
    color: var(--dp-primary);
    font-size: 20px;
  }

  .dp-empty h3,
  .dp-loading h2 {
    margin: 13px 0 0;
    font-size: 15px;
  }

  .dp-empty p,
  .dp-loading p {
    max-width: 420px;
    margin: 6px 0 0;
    color: var(--dp-muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .dp-spinner {
    width: 29px;
    height: 29px;
    border: 3px solid var(--dp-border);
    border-top-color: var(--dp-primary);
    border-radius: 999px;
    animation: dp-spin .75s linear infinite;
  }

  @keyframes dp-spin { to { transform: rotate(360deg); } }

  @media (max-width: 860px) {
    .dp-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dp-analytics-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 640px) {
    .dp-toolbar {
      grid-template-columns: minmax(0, 1fr) 40px 40px 40px;
    }

    .dp-primary-action,
    .dp-icon-action {
      width: 40px;
      height: 40px;
    }

    .dp-summary-grid { gap: 7px; }

    .dp-summary-grid article { padding: 11px; }

    .dp-card-grid { grid-template-columns: 1fr; }

    .dp-overlay {
      align-items: flex-end;
    }

    .dp-sheet,
    .dp-small-sheet {
      width: 100%;
      height: min(92dvh, 820px);
      border-left: 0;
      border-top: 1px solid var(--dp-border);
      border-radius: 20px 20px 0 0;
    }

    .dp-field-grid,
    .dp-three-columns,
    .dp-feature-grid {
      grid-template-columns: 1fr;
    }

    .dp-feature-option {
      grid-template-columns: 34px minmax(0, 1fr) auto;
    }

    .dp-sheet-footer {
      padding-bottom: max(14px, env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 430px) {
    .dp-summary-grid { grid-template-columns: 1fr 1fr; }

    .dp-summary-grid article:nth-child(3),
    .dp-summary-grid article:nth-child(4) {
      display: none;
    }

    .dp-plan-card > footer {
      align-items: flex-end;
    }

    .dp-plan-card > footer > div {
      flex-direction: column;
    }
  }
`;