"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import eleeveonIcon from "./favicon_io/android-chrome-192x192.png";

import { apiRequest, extractToken, saveAuthToken } from "./lib/platformApi";
import { setAccountId } from "./lib/sync/syncConfig";
import {
  clearStoredActiveMembership,
  setStoredActiveMembership,
} from "./lib/auth/activeMembership";
import type { UserMembership } from "./lib/auth/roleRedirect";
import { calculateStudentPrice, type StudentPricing } from "./lib/commercial/studentPricing";

type Capability = {
  icon: string;
  title: string;
  description: string;
};

type BillingCycle = "monthly" | "termly" | "yearly";

type PlanFeatureKey =
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
  | "apiAccess"
  | string;

type Plan = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  currency?: string | null;
  priceMonthly?: number;
  priceTermly?: number;
  priceYearly?: number;
  priceOneTime?: number | null;
  deploymentMode?: string;
  licenseModel?: string;
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

  features?: PlanFeatureKey[] | null;
  metadata?: {
    featureFlags?: Record<string, boolean>;
    featureKeys?: PlanFeatureKey[];
    recommended?: boolean;
    pricing?: StudentPricing;
    publicVisible?: boolean;
    visibility?: "public" | "private";
    badge?: string | null;
    displayOrder?: number | null;
    [key: string]: unknown;
  } | null;

  active?: boolean;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

const PLAN_FEATURE_LABELS: Record<string, string> = {
  offlineSync: "Offline-first access",
  cloudBackup: "Protected cloud backup",
  reports: "Assessments, reports & broadsheets",
  finance: "Fees, payments & finance",
  attendance: "Student and staff attendance",
  identityCards: "ID cards and digital passes",
  identitySafety: "Pickup, visitors & school safety",
  transport: "School transport management",
  schoolWebsites: "Professional school website",
  communications: "Announcements and communication",
  calendarScheduling: "Calendar and timetable tools",
  parentPortal: "Parent portal",
  studentPortal: "Student portal",
  teacherPortal: "Teacher workspace",
  advancedAnalytics: "Advanced analytics",
  apiAccess: "API and integration access",
};

const PLAN_FEATURE_ORDER: PlanFeatureKey[] = [
  "offlineSync",
  "cloudBackup",
  "reports",
  "attendance",
  "identityCards",
  "identitySafety",
  "schoolWebsites",
  "communications",
  "calendarScheduling",
  "parentPortal",
  "studentPortal",
  "teacherPortal",
  "finance",
  "transport",
  "advancedAnalytics",
  "apiAccess",
];

const PLATFORM_BENEFITS = [
  {
    title: "Reduce repeated work",
    description:
      "Enter school information once and reuse it across reports, portals, identity tools and public websites.",
  },
  {
    title: "Keep working through weak internet",
    description:
      "Offline-first workflows help schools continue essential work and synchronize when connectivity returns.",
  },
  {
    title: "Give every person a focused experience",
    description:
      "Owners, administrators, teachers, students and parents receive role-appropriate workspaces from one system.",
  },
  {
    title: "Grow without replacing the platform",
    description:
      "Start with the package that fits today, then move to a larger plan as student numbers and school needs grow.",
  },
];

const CAPABILITIES: Capability[] = [
  {
    icon: "◎",
    title: "Offline-first operations",
    description:
      "Keep essential school work available on unreliable connections, then synchronize safely when connectivity returns.",
  },
  {
    icon: "▦",
    title: "Assessments and reports",
    description:
      "Manage scores, grading structures, report cards, broadsheets and reusable report templates from one connected system.",
  },
  {
    icon: "◫",
    title: "Connected school records",
    description:
      "Bring students, teachers, parents, classes, subjects, branches and academic structures into one source of truth.",
  },
  {
    icon: "◌",
    title: "Role-based workspaces",
    description:
      "Give owners, administrators, teachers, students and parents focused portals shaped around what each person needs.",
  },
  {
    icon: "◇",
    title: "Identity and attendance",
    description:
      "Support attendance, identity cards, QR workflows, access points, pickup, visitors and future verification systems.",
  },
  {
    icon: "↗",
    title: "Public school websites",
    description:
      "Extend approved school data into professional websites that remain connected to the same Eleeveon infrastructure.",
  },
];

const WORKSPACES = [
  {
    label: "Owner",
    detail: "Account-wide oversight",
  },
  {
    label: "School Admin",
    detail: "School-level coordination",
  },
  {
    label: "Branch Admin",
    detail: "Daily branch operations",
  },
  {
    label: "Teacher",
    detail: "Classes, attendance and assessments",
  },
  {
    label: "Student",
    detail: "Learning records and results",
  },
  {
    label: "Parent",
    detail: "Children, reports and communication",
  },
];


function normalizePlans(payload: unknown): Plan[] {
  if (Array.isArray(payload)) return payload as Plan[];

  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;

    for (const key of ["plans", "data", "items", "results"]) {
      if (Array.isArray(value[key])) return value[key] as Plan[];
    }
  }

  return [];
}

function planFeatureEnabled(plan: Plan, key: PlanFeatureKey): boolean {
  const topLevel = plan[key as keyof Plan];

  if (typeof topLevel === "boolean") {
    return topLevel;
  }

  const metadataFlag = plan.metadata?.featureFlags?.[key];
  if (typeof metadataFlag === "boolean") {
    return metadataFlag;
  }

  return Array.isArray(plan.features) && plan.features.includes(key);
}

function humanizeFeatureKey(key: string): string {
  return (
    PLAN_FEATURE_LABELS[key] ||
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function planFeatureLabels(plan: Plan): string[] {
  const known = PLAN_FEATURE_ORDER.filter((key) =>
    planFeatureEnabled(plan, key),
  ).map((key) => humanizeFeatureKey(String(key)));

  const extras = Array.from(
    new Set([
      ...(Array.isArray(plan.features) ? plan.features : []),
      ...(Array.isArray(plan.metadata?.featureKeys)
        ? plan.metadata.featureKeys
        : []),
      ...Object.keys(plan.metadata?.featureFlags || {}).filter(
        (key) => plan.metadata?.featureFlags?.[key] === true,
      ),
    ]),
  )
    .filter((key) => !PLAN_FEATURE_ORDER.includes(key))
    .map((key) => humanizeFeatureKey(String(key)));

  return [...known, ...extras];
}

function planPrice(plan: Plan, cycle: BillingCycle): number {
  if (cycle === "yearly") return Number(plan.priceYearly || 0);

  if (cycle === "termly") {
    const configured = Number(plan.priceTermly || 0);
    return configured > 0
      ? configured
      : Number(plan.priceMonthly || 0) * 4;
  }

  return Number(plan.priceMonthly || 0);
}

function publicAmount(plan: Plan, cycle: BillingCycle, students: number): number {
  const pricing = plan.metadata?.pricing;
  if (pricing && pricing.mode !== "fixed") return calculateStudentPrice(pricing, students) ?? 0;
  if (plan.licenseModel === "perpetual") return Number(plan.priceOneTime || 0);
  if (plan.licenseModel === "trial") return 0;
  return planPrice(plan, cycle);
}

function packageLabel(plan: Plan): string {
  if (plan.licenseModel === "trial") return "Free trial";
  if (plan.deploymentMode === "independent_essentials") return "Independent Essentials";
  if (plan.deploymentMode === "independent_multi_device") return "Independent Multi-device";
  return "Eleeveon Cloud";
}

function billingCycleLabel(cycle: BillingCycle): string {
  if (cycle === "termly") return "4 months";
  if (cycle === "yearly") return "year";
  return "month";
}

function stringIdOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = String(value).trim();
  return parsed || null;
}

function normalizeRegistrationMembership(
  value: UserMembership,
): UserMembership {
  const source = value as any;
  const branchId = stringIdOrNull(
    source.branchId || source.schoolBranchId || source.branch?.id,
  );

  return {
    ...value,
    id:
      stringIdOrNull(source.id) ||
      `membership-${source.role}-${Date.now()}`,
    accountId: stringIdOrNull(source.accountId),
    schoolId: stringIdOrNull(source.schoolId || source.school?.id),
    branchId,
    schoolBranchId: branchId,
    teacherId: stringIdOrNull(source.teacherId || source.teacher?.id),
    studentId: stringIdOrNull(source.studentId || source.student?.id),
    parentId: stringIdOrNull(source.parentId || source.parent?.id),
    active: source.active !== false,
  };
}

function formatMoney(amount: number, currency = "GHS"): string {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString()}`;
  }
}

function PlanLimit({
  value,
  label,
}: {
  value?: number | null;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-3 py-3 dark:bg-white/5">
      <strong className="block text-sm font-semibold">
        {value == null ? "Flexible" : value.toLocaleString()}
      </strong>
      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GridMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/10"
    >
      <Image
        src={eleeveonIcon}
        alt=""
        width={40}
        height={40}
        priority
        className="h-full w-full object-contain"
      />
    </span>
  );
}


type ThemeMode = "light" | "dark";

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: ThemeMode;
  onToggle: () => void;
}) {
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
    >
      {dark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 2.75v2M12 19.25v2M21.25 12h-2M4.75 12h-2M18.54 5.46l-1.42 1.42M6.88 17.12l-1.42 1.42M18.54 18.54l-1.42-1.42M6.88 6.88 5.46 5.46"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
          <path
            d="M20.25 15.1A8.3 8.3 0 0 1 8.9 3.75 8.5 8.5 0 1 0 20.25 15.1Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export default function Home() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("termly");
  const [studentCount, setStudentCount] = useState(200);
  const [pricingPage, setPricingPage] = useState(0);
  const [pricingCardsPerPage, setPricingCardsPerPage] = useState(1);
  const [signupPlan, setSignupPlan] = useState<Plan | null>(null);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupForm, setSignupForm] = useState({
    fullName: "",
    accountName: "",
    email: "",
    phone: "",
    password: "",
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("eleeveon-public-theme");
    const initial: ThemeMode =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.style.colorScheme = initial;
    setTheme(initial);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    const updatePricingLayout = () => {
      const width = window.innerWidth;

      setPricingCardsPerPage(
        width >= 1024 ? 3 : width >= 640 ? 2 : 1,
      );
    };

    updatePricingLayout();
    window.addEventListener("resize", updatePricingLayout);

    return () => {
      window.removeEventListener("resize", updatePricingLayout);
    };
  }, []);

  useEffect(() => {
    setPricingPage(0);
  }, [billingCycle, pricingCardsPerPage, plans.length]);

  useEffect(() => {
    let cancelled = false;

    const loadPlans = async () => {
      try {
        setPlansLoading(true);
        setPlansError("");

        const response = await fetch(`${API_BASE_URL}/billing/plans`, {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });

        const text = await response.text();
        let payload: unknown = null;

        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text;
        }

        if (!response.ok) {
          const message =
            payload &&
            typeof payload === "object" &&
            "message" in payload
              ? String((payload as { message?: unknown }).message || "")
              : "";

          throw new Error(
            message || `Unable to load plans (${response.status}).`,
          );
        }

        const activePlans = normalizePlans(payload)
          .filter((plan) => plan.active !== false && plan.metadata?.publicVisible !== false && plan.metadata?.visibility !== "private" && plan.licenseModel !== "complimentary" && plan.deploymentMode !== "private_hosted" && (!plan.availableAcquisitionModes?.length || plan.availableAcquisitionModes.some(m => ["self_service","trial","outright","installments"].includes(m))))
          .sort((a, b) => {
            const aOrder = Number(a.metadata?.displayOrder ?? 999);
            const bOrder = Number(b.metadata?.displayOrder ?? 999);

            if (aOrder !== bOrder) return aOrder - bOrder;

            return (
              Number(a.priceMonthly || 0) -
              Number(b.priceMonthly || 0)
            );
          });

        if (!cancelled) {
          setPlans(activePlans);
        }
      } catch (error) {
        if (!cancelled) {
          setPlansError(
            error instanceof Error
              ? error.message
              : "Unable to load subscription plans.",
          );
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    };

    void loadPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem("eleeveon-public-theme", next);
    setTheme(next);
  };

  const openPublicSignup = (plan: Plan) => {
    setSignupError("");
    setSignupPlan(plan);
  };

  const closePublicSignup = () => {
    if (signupLoading) return;
    setSignupPlan(null);
    setSignupError("");
  };

  const submitPublicSignup = async () => {
    if (!signupPlan) return;
    if (signupPlan.licenseModel !== "trial" && (signupPlan.metadata?.pricing?.mode && signupPlan.metadata.pricing.mode !== "fixed" || signupPlan.deploymentMode !== "eleeveon_cloud" || signupPlan.licenseModel === "perpetual")) {
      setSignupError("This package requires a verified quote or installation arrangement. Online checkout is not enabled for it yet.");
      return;
    }

    if (!signupForm.fullName.trim()) {
      setSignupError("Enter your full name.");
      return;
    }

    if (!signupForm.accountName.trim()) {
      setSignupError("Enter the school or account name.");
      return;
    }

    if (!signupForm.email.trim()) {
      setSignupError("Enter your email address.");
      return;
    }

    if (signupForm.password.trim().length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }

    try {
      setSignupLoading(true);
      setSignupError("");

      const response = await apiRequest<{
        token?: string;
        accessToken?: string;
        access_token?: string;
        user: {
          id: string;
          accountId: string;
          email: string;
          role: string;
          fullName?: string;
          name?: string;
          memberships?: UserMembership[];
        };
        memberships?: UserMembership[];
        account?: {
          id: string;
          name: string;
        } | null;
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: signupForm.fullName.trim(),
          email: signupForm.email.trim().toLowerCase(),
          phone: signupForm.phone.trim() || undefined,
          password: signupForm.password,
          accountName: signupForm.accountName.trim(),
          selectedPlanId: signupPlan.id,
          selectedBillingCycle: billingCycle,
        }),
      });

      if (!response.user?.accountId) {
        throw new Error(
          "Account created, but no account ID was returned.",
        );
      }

      const token = extractToken(response);

      if (!token) {
        throw new Error(
          "Account created, but no login token was returned.",
        );
      }

      const memberships = (
        response.user.memberships ||
        response.memberships ||
        []
      )
        .filter((membership) => membership.active !== false)
        .map(normalizeRegistrationMembership);

      const userToStore = {
        ...response.user,
        memberships,
        userMemberships: memberships,
      };

      const accountToStore = response.account
        ? {
            ...response.account,
            memberships,
            userMemberships: memberships,
          }
        : {
            id: response.user.accountId,
            name: signupForm.accountName.trim(),
            memberships,
            userMemberships: memberships,
          };

      clearStoredActiveMembership();
      saveAuthToken(token);
      setAccountId(response.user.accountId);

      const storageValues: Record<string, unknown> = {
        eleeveon_auth_user: userToStore,
        eleeveon_auth_account: accountToStore,
        eleeveon_account_user: userToStore,
        eleeveon_account_info: accountToStore,
        eleeveon_user_memberships: memberships,
        user: userToStore,
        account: accountToStore,
      };

      for (const [key, value] of Object.entries(storageValues)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }

      window.sessionStorage.setItem(
        "eleeveon_auth_user",
        JSON.stringify(userToStore),
      );
      window.sessionStorage.setItem(
        "eleeveon_auth_account",
        JSON.stringify(accountToStore),
      );
      window.sessionStorage.setItem(
        "eleeveon_user_memberships",
        JSON.stringify(memberships),
      );

      const ownerMembership =
        memberships.find((membership) =>
          ["super_admin", "owner"].includes(
            String(membership.role || ""),
          ),
        ) ||
        memberships[0] || {
          id: `owner-${response.user.id}`,
          accountId: response.user.accountId,
          role: "super_admin",
          active: true,
        };

      setStoredActiveMembership(ownerMembership as UserMembership);

      const destination = new URL(
        "/owner/subscription",
        window.location.origin,
      );

      destination.searchParams.set("planId", signupPlan.id);
      if (signupPlan.licenseModel === "trial") {
        window.location.replace(new URL("/owner", window.location.origin).toString());
        return;
      }
      destination.searchParams.set("billingCycle", billingCycle);
      destination.searchParams.set("checkout", "1");
      destination.searchParams.set("source", "public-pricing");

      window.location.replace(destination.toString());
    } catch (error) {
      setSignupError(
        error instanceof Error
          ? error.message
          : "Unable to create your account.",
      );
    } finally {
      setSignupLoading(false);
    }
  };

  const pricingPageCount = Math.max(
    1,
    Math.ceil(plans.length / pricingCardsPerPage),
  );

  const safePricingPage = Math.min(
    pricingPage,
    pricingPageCount - 1,
  );

  const visiblePricingPlans = plans.slice(
    safePricingPage * pricingCardsPerPage,
    safePricingPage * pricingCardsPerPage +
      pricingCardsPerPage,
  );

  const goToPricingPage = (page: number) => {
    const normalized =
      (page + pricingPageCount) % pricingPageCount;

    setPricingPage(normalized);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-white text-zinc-950 selection:bg-zinc-950 selection:text-white dark:bg-zinc-950 dark:text-white dark:selection:bg-white dark:selection:text-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-195 overflow-hidden">
        <div className="absolute left-1/2 -top-85 h-170 w-170 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(47,111,237,0.17),rgba(47,111,237,0)_68%)]" />
        <div className="absolute -right-55 top-48 h-120 w-120 rounded-full bg-[radial-gradient(circle,rgba(87,109,146,0.1),rgba(87,109,146,0)_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.045)_1px,transparent_1px)] bg-size-[44px_44px] mask-[linear-gradient(to_bottom,black,transparent_82%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)]" />
      </div>

      <header className="relative z-10 border-b border-zinc-200/80 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/75">
        <div className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <GridMark />
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Eleeveon
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Schools
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex dark:text-zinc-300">
            <a
              href="#capabilities"
              className="transition hover:text-zinc-950 dark:hover:text-white"
            >
              Capabilities
            </a>
            <a
              href="#workspaces"
              className="transition hover:text-zinc-950 dark:hover:text-white"
            >
              Workspaces
            </a>
            <a
              href="#pricing"
              className="transition hover:text-zinc-950 dark:hover:text-white"
            >
              Pricing
            </a>
            <a
              href="#ecosystem"
              className="transition hover:text-zinc-950 dark:hover:text-white"
            >
              Ecosystem
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {themeReady ? (
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            ) : (
              <div className="h-10 w-10" aria-hidden="true" />
            )}

            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <span className="hidden sm:inline">Open workspace</span>
              <span className="sm:hidden">Open</span>
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid min-h-180 w-full max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:py-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            School work that continues—even when the internet does not
          </div>

          <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Run the whole school from one connected platform.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-600 sm:text-xl dark:text-zinc-300">
            Prepare reports faster, keep records connected and give every role
            the right workspace—online or offline, across one school or many
            branches.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 text-sm font-semibold text-white shadow-lg shadow-zinc-950/10 transition hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Start with Eleeveon
              <ArrowIcon />
            </Link>

            <a
              href="#capabilities"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              See how it works
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Offline-first</span>
            <span>Multi-role</span>
            <span>Multi-branch</span>
            <span>Template-powered</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-10 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(47,111,237,0.15),transparent_65%)] blur-2xl" />

          <div className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/10 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                A connected school platform
              </div>
              <div className="w-12" />
            </div>

            <div className="relative min-h-130 overflow-hidden bg-zinc-50 p-6 dark:bg-zinc-950 sm:p-8">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.04)_1px,transparent_1px)] bg-size-[32px_32px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)]"
              />

              <div className="relative">
                <div className="mx-auto max-w-md text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6fed]">
                    One source of truth
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    School information moves through one connected system.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    This is a conceptual platform map—not a screenshot of the current application interface.
                  </p>
                </div>

                <div className="relative mx-auto mt-10 max-w-lg">
                  <div className="absolute left-1/2 top-16 h-40 w-px -translate-x-1/2 bg-zinc-300 dark:bg-white/15" />
                  <div className="absolute left-[18%] right-[18%] top-36 h-px bg-zinc-300 dark:bg-white/15" />

                  <div className="relative z-10 mx-auto flex w-44 flex-col items-center rounded-3xl border border-zinc-200 bg-white p-5 text-center shadow-lg shadow-zinc-950/5 dark:border-white/10 dark:bg-zinc-900">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">
                      ES
                    </div>
                    <p className="mt-3 text-sm font-semibold">Eleeveon Schools</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Shared school foundation
                    </p>
                  </div>

                  <div className="relative z-10 mt-16 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      ["Records", "Students · Staff · Classes"],
                      ["Academics", "Assessment · Reports"],
                      ["Operations", "Attendance · Identity"],
                      ["People", "Role-based workspaces"],
                      ["Communication", "News · Calendar"],
                      ["Public presence", "School websites"],
                    ].map(([title, detail]) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900"
                      >
                        <div className="h-1.5 w-8 rounded-full bg-[#2f6fed]" />
                        <p className="mt-3 text-sm font-semibold">{title}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          {detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-4 py-3 text-center text-xs leading-5 text-zinc-500 backdrop-blur dark:border-white/15 dark:bg-white/3 dark:text-zinc-400">
                    Individual portals use the same protected data foundation while presenting role-appropriate tools.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="relative z-10 border-y border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/2.5"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[#2f6fed]">
              A connected operating system for schools
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Powerful where it matters. Quiet where it should be.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Eleeveon is designed to reduce repeated work, preserve school
              identity and make complex operations feel clear across devices
              and roles.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <article
                key={capability.title}
                className="group rounded-3xl border border-zinc-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:border-white/10 dark:bg-zinc-900/70"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 text-xl font-semibold transition group-hover:scale-105 dark:bg-white/10">
                  {capability.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold">
                  {capability.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {capability.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workspaces"
        className="relative z-10 mx-auto w-full max-w-7xl px-5 py-24 sm:px-8"
      >
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-[#2f6fed]">
              One platform, focused workspaces
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Everyone sees what helps them move forward.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              The platform shares one trusted data foundation while giving each
              role a cleaner, more relevant experience.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {WORKSPACES.map((workspace, index) => (
              <article
                key={workspace.label}
                className="flex items-center gap-4 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/60"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3 className="font-semibold">{workspace.label}</h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {workspace.detail}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>


      <section className="relative z-10 border-y border-zinc-200 bg-zinc-950 text-white dark:border-white/10 dark:bg-white dark:text-zinc-950">
        <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-blue-300 dark:text-[#2f6fed]">
                Own it your way
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Choose how your school uses Eleeveon.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/70 dark:text-zinc-600">
                Begin with connected cloud services, keep essential work
                available offline, or discuss a version-locked desktop licence.
                Your school can move forward without rebuilding its records.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Cloud",
                  title: "Connected everywhere",
                  description:
                    "Continuous updates, protected backup, remote access and connected portals.",
                  points: ["Subscription", "Automatic updates", "Remote access"],
                },
                {
                  label: "Desktop",
                  title: "Own a fixed version",
                  description:
                    "A version-locked, capacity-limited installation for schools that prefer a one-time licence.",
                  points: ["One-time licence", "Fixed version", "Paid upgrades"],
                },
                {
                  label: "Hybrid",
                  title: "Offline strength, cloud reach",
                  description:
                    "Keep working locally and synchronize safely when a connection becomes available.",
                  points: ["Offline-first", "Cloud synchronization", "Migration-ready"],
                },
              ].map((option) => (
                <article
                  key={option.label}
                  className="rounded-3xl border border-white/15 bg-white/7 p-6 backdrop-blur dark:border-zinc-200 dark:bg-zinc-50"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300 dark:text-[#2f6fed]">
                    {option.label}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">{option.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/65 dark:text-zinc-600">
                    {option.description}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-white/80 dark:text-zinc-700">
                    {option.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-300 dark:bg-[#2f6fed]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-white/15 bg-white/7 p-5 text-sm leading-6 text-white/70 dark:border-zinc-200 dark:bg-zinc-50 dark:text-zinc-600">
            Current online checkout shows published subscription packages.
            Desktop perpetual licences can be introduced once their one-time
            prices, device rules, version entitlement and upgrade policy are
            configured in the billing system.
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="relative z-10 border-y border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/2.5"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-[#2f6fed]">Pricing</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                One core platform. A price that grows with your school.
              </h2>
              <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Choose by student capacity and branch needs. Every package keeps the
                same connected Eleeveon foundation, while deployment features
                such as offline access and cloud backup remain clearly shown
                for each plan.
              </p>
            </div>

            <div className="inline-flex w-full rounded-full border border-zinc-200 bg-white p-1 shadow-sm sm:w-auto dark:border-white/10 dark:bg-zinc-900">
              {(["termly", "monthly", "yearly"] as BillingCycle[]).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`flex-1 rounded-full px-5 py-2.5 text-sm font-semibold capitalize transition sm:flex-none ${
                    billingCycle === cycle
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {cycle === "termly" ? "Termly · 4 months" : cycle}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <label htmlFor="school-student-count" className="text-sm font-semibold">How many students?</label>
            <input id="school-student-count" type="number" min="1" max="1000000" step="1" value={studentCount} onChange={(e) => setStudentCount(Math.max(1,Math.min(1000000,Math.floor(Number(e.target.value)||1))))} className="w-32 rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-white/20"/>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">See estimates for student-priced Cloud plans. The final invoice uses the verified student count.</span>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_BENEFITS.map((benefit, index) => (
              <article
                key={benefit.title}
                className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/70"
              >
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-xs font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-5 font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {benefit.description}
                </p>
              </article>
            ))}
          </div>

          {plansLoading ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({
                length: pricingCardsPerPage,
              }).map((_, item) => (
                <div
                  key={item}
                  className="h-150 animate-pulse rounded-4xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900"
                />
              ))}
            </div>
          ) : plansError ? (
            <div className="mt-12 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <h3 className="font-semibold">
                Pricing is temporarily unavailable
              </h3>
              <p className="mt-2 text-sm leading-6 opacity-80">
                {plansError} You can still enter Eleeveon Schools and
                contact the team about the right package.
              </p>
            </div>
          ) : plans.length ? (
            <div className="mt-12">
              <div className="relative">
                {pricingPageCount > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        goToPricingPage(safePricingPage - 1)
                      }
                      aria-label="Show previous pricing packages"
                      className="absolute left-0 top-1/2 z-20 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-zinc-200 bg-white text-xl shadow-lg transition hover:-translate-x-1/2 hover:-translate-y-[54%] hover:bg-zinc-50 lg:grid dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        goToPricingPage(safePricingPage + 1)
                      }
                      aria-label="Show next pricing packages"
                      className="absolute right-0 top-1/2 z-20 hidden h-11 w-11 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-zinc-200 bg-white text-xl shadow-lg transition hover:translate-x-1/2 hover:-translate-y-[54%] hover:bg-zinc-50 lg:grid dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      ›
                    </button>
                  </>
                ) : null}

                <div
                  className={`grid items-stretch gap-5 transition-all duration-300 ${
                    pricingCardsPerPage === 3
                      ? "lg:grid-cols-3"
                      : pricingCardsPerPage === 2
                        ? "sm:grid-cols-2"
                        : "grid-cols-1"
                  }`}
                >
                  {visiblePricingPlans.map((plan) => {
                    const index = plans.findIndex(
                      (item) => item.id === plan.id,
                    );
                    const features = planFeatureLabels(plan);
                    const price = publicAmount(plan, billingCycle, studentCount);
                    const studentPriced = plan.metadata?.pricing?.mode && plan.metadata.pricing.mode !== "fixed";
                    const specialPurchase = plan.licenseModel === "perpetual";
                    const trial = plan.licenseModel === "trial";
                    const availableOnline = plan.deploymentMode === "eleeveon_cloud" && !studentPriced && !specialPurchase;
                    const currency = plan.currency || "GHS";
                    const monthlyPrice = Number(
                      plan.priceMonthly || 0,
                    );
                    const termlyPrice = planPrice(
                      plan,
                      "termly",
                    );
                    const yearlyPrice = Number(
                      plan.priceYearly || 0,
                    );
                    const termlySaving =
                      monthlyPrice * 4 - termlyPrice;
                    const yearlySaving =
                      monthlyPrice * 12 - yearlyPrice;
                    const recommended =
                      plan.metadata?.recommended === true ||
                      index === Math.min(1, plans.length - 1);

                    return (
                      <article
                        key={plan.id}
                        className={`relative flex min-h-full flex-col overflow-hidden rounded-4xl border bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-zinc-950/8 dark:bg-zinc-900 ${
                          recommended
                            ? "border-[#2f6fed] shadow-xl shadow-[#2f6fed]/10"
                            : "border-zinc-200 dark:border-white/10"
                        }`}
                      >
                        {recommended ? (
                          <div className="absolute right-5 top-5 rounded-full bg-[#2f6fed] px-3 py-1 text-xs font-semibold text-white">
                            {plan.metadata?.badge || "Popular"}
                          </div>
                        ) : null}

                        <div className="pr-20">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f6fed]">
                            {packageLabel(plan)} · {plan.code}
                          </p>
                          <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                            {plan.name}
                          </h3>
                        </div>

                        <p className="mt-4 min-h-18 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                          {plan.description ||
                            "A flexible Eleeveon Schools package designed around your school’s size and operational needs."}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                            {planFeatureEnabled(plan, "offlineSync")
                              ? planFeatureEnabled(plan, "cloudBackup")
                                ? "Hybrid-ready"
                                : "Offline-enabled"
                              : "Cloud-connected"}
                          </span>
                          {planFeatureEnabled(plan, "cloudBackup") ? (
                            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#2f6fed] dark:bg-blue-500/10 dark:text-blue-300">
                              Protected cloud backup
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-6">
                          <div className="flex items-end gap-2">
                            <strong className="text-4xl font-semibold tracking-tighter">
                              {formatMoney(price, currency)}
                            </strong>
                            <span className="pb-1 text-sm text-zinc-500 dark:text-zinc-400">
                              {specialPurchase ? "one-time purchase" : trial ? "trial access" : studentPriced ? `/${plan.metadata?.pricing?.billingPeriod || "termly"}` : `/${billingCycleLabel(billingCycle)}`}
                            </span>
                          </div>

                          {!studentPriced && !specialPurchase && !trial && billingCycle === "termly" &&
                          termlySaving > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Save{" "}
                              {formatMoney(
                                termlySaving,
                                currency,
                              )}{" "}
                              compared with four monthly payments.
                            </p>
                          ) : !studentPriced && !specialPurchase && !trial && billingCycle === "yearly" &&
                            yearlySaving > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Save{" "}
                              {formatMoney(
                                yearlySaving,
                                currency,
                              )}{" "}
                              compared with twelve monthly payments.
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-zinc-400">
                              One clear price for the enabled Eleeveon capabilities.
                            </p>
                          )}
                        </div>

                        {studentPriced ? <div className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400"><p>Estimate for {studentCount.toLocaleString()} students · {plan.metadata?.pricing?.mode === "tiered" ? "progressive tiers" : "flat student rate"}. Final amount is confirmed by Eleeveon.</p>{plan.metadata?.pricing?.mode === "per_student" ? <p>GH₵{plan.metadata.pricing.perStudentRate} per student · minimum GH₵{plan.metadata.pricing.minimumAmount || 0}</p> : <p>{(plan.metadata?.pricing?.tiers || []).map(t => `${t.upTo == null ? "Additional students" : `Up to ${t.upTo}`} at GH₵${t.unitPrice}`).join(" · ")}</p>}</div> : null}
                        {trial ? <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Trial duration: {Number(plan.metadata?.trialDays || 14)} days. No upfront payment.</p> : null}
                        <div className="mt-6 grid grid-cols-3 gap-2">
                          <PlanLimit
                            value={plan.maxStudents}
                            label="students"
                          />
                          <PlanLimit
                            value={plan.maxBranches}
                            label="branches"
                          />
                          <PlanLimit
                            value={plan.maxUsers}
                            label="users"
                          />
                        </div>

                        <div className="mt-7 border-t border-zinc-200 pt-6 dark:border-white/10">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                            Included in this package
                          </p>

                          <ul className="mt-4 space-y-3">
                            {features
                              .slice(0, 10)
                              .map((feature) => (
                                <li
                                  key={feature}
                                  className="flex gap-3 text-sm leading-5 text-zinc-700 dark:text-zinc-200"
                                >
                                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                    ✓
                                  </span>
                                  <span>{feature}</span>
                                </li>
                              ))}
                          </ul>

                          {features.length > 10 ? (
                            <p className="mt-4 text-xs font-semibold text-[#2f6fed]">
                              +{features.length - 10} more included
                              capabilities
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-auto pt-7">
                          <button
                            type="button"
                            onClick={() =>
                              availableOnline ? openPublicSignup(plan) : undefined
                            }
                            disabled={!availableOnline}
                            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition hover:-translate-y-0.5 ${
                              recommended
                                ? "bg-[#2f6fed] text-white hover:bg-[#245ed0] disabled:opacity-50"
                                : "bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                            }`}
                          >
                            {availableOnline ? (trial ? "Start free trial" : `Choose ${plan.name}`) : (studentPriced ? "Quotation only — checkout pending" : "Installation enquiry — coming soon")}
                            <ArrowIcon />
                          </button>
                          <p className="mt-3 text-center text-xs text-zinc-400">
                            {availableOnline ? "Create an owner account to continue." : "This package is visible for comparison; online purchase is not yet enabled."}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              {pricingPageCount > 1 ? (
                <div className="mt-7 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      goToPricingPage(safePricingPage - 1)
                    }
                    aria-label="Previous pricing page"
                    className="mr-2 grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-lg shadow-sm transition hover:bg-zinc-50 lg:hidden dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    ‹
                  </button>

                  {Array.from({
                    length: pricingPageCount,
                  }).map((_, page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() =>
                        goToPricingPage(page)
                      }
                      aria-label={`Show pricing page ${page + 1}`}
                      aria-current={
                        safePricingPage === page
                          ? "true"
                          : undefined
                      }
                      className={`h-2.5 rounded-full transition-all ${
                        safePricingPage === page
                          ? "w-8 bg-[#2f6fed]"
                          : "w-2.5 bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                      }`}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      goToPricingPage(safePricingPage + 1)
                    }
                    aria-label="Next pricing page"
                    className="ml-2 grid h-9 w-9 place-items-center rounded-full border border-zinc-200 bg-white text-lg shadow-sm transition hover:bg-zinc-50 lg:hidden dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    ›
                  </button>
                </div>
              ) : null}

              <p className="mt-3 text-center text-xs text-zinc-400">
                {pricingCardsPerPage === 1
                  ? "Use the dots or arrows to view each package."
                  : pricingCardsPerPage === 2
                    ? "Two packages are shown at a time."
                    : "Three packages are shown at a time."}
              </p>
            </div>
          ) : (
            <div className="mt-12 rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-white/15 dark:bg-zinc-900">
              <h3 className="font-semibold">
                Packages are being prepared
              </h3>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Active subscription plans will appear here
                automatically when they are published from the
                developer workspace.
              </p>
            </div>
          )}

          <div className="mt-10 grid gap-4 rounded-4xl border border-zinc-200 bg-white p-6 lg:grid-cols-[1fr_auto] lg:items-center dark:border-white/10 dark:bg-zinc-900">
            <div>
              <h3 className="text-xl font-semibold">
                Start with the school you have today.
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Choose according to current enrolment and branch count. You can move
                upward later without recreating students, users, assessments
                or reports.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-300 px-5 text-sm font-semibold transition hover:bg-zinc-50 dark:border-white/15 dark:hover:bg-white/5"
            >
              Open Eleeveon Schools
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-5 py-24 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold text-[#2f6fed]">
              One complete core
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              The essentials should not feel like upgrades.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Students, staff, classes, assessments, reports, attendance,
              communication and focused role workspaces belong to one connected
              school foundation.
            </p>

            <div className="mt-8 rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Growth without replacement
              </p>
              <p className="mt-3 text-lg font-semibold">
                Start with the capacity you need today.
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                When enrolment or branch count increases, move to the next
                package while retaining the same records, users and reports.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Reports & broadsheets", "Assessment structures, grading, reusable report templates and school-ready exports."],
              ["Offline continuity", "Keep essential work available during weak or unavailable internet, where enabled."],
              ["Connected portals", "Focused owner, administrator, teacher, student and parent experiences."],
              ["School identity", "ID cards, digital passes, pickup, visitor and future verification workflows."],
              ["Public website", "A professional school presence connected to approved Eleeveon information."],
              ["Multi-branch growth", "Expand school operations without changing the platform or rebuilding records."],
            ].map(([title, description]) => (
              <article
                key={title}
                className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900/60"
              >
                <div className="h-1.5 w-10 rounded-full bg-[#2f6fed]" />
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#2f6fed]">
              Optional services
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Add only the operations your school actually runs.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Keep the core clear, then activate specialist services as the
              school grows. Final prices should be published only after each
              service is production-ready.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Transport", "Routes, vehicles, stops and parent visibility.", "Planned"],
              ["Health Office", "Restricted medical records and visit history.", "Planned"],
              ["Inventory", "Stock, suppliers, school items and internal requests.", "Planned"],
              ["Eleeveon Learn", "Connected learning experiences, content and assessment.", "Coming soon"],
            ].map(([title, description, status]) => (
              <article
                key={title}
                className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{title}</h3>
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
                    {status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="ecosystem" className="relative z-10 px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-zinc-950 px-6 py-16 text-white sm:px-10 lg:px-16 dark:bg-white dark:text-zinc-950">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-semibold text-white/60 dark:text-zinc-500">
                Built as part of Eleeveon Systems
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Schools today. Learning experiences next.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70 dark:text-zinc-600">
                Eleeveon Schools forms the operational foundation for a wider
                education ecosystem, including public school websites and the
                future Eleeveon Learn platform.
              </p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                <span className="rounded-full border border-white/15 px-4 py-2 text-white/80 dark:border-zinc-200 dark:text-zinc-700">
                  Eleeveon Schools
                </span>
                <span className="rounded-full border border-white/15 px-4 py-2 text-white/80 dark:border-zinc-200 dark:text-zinc-700">
                  School Websites
                </span>
                <span className="rounded-full border border-white/15 px-4 py-2 text-white/55 dark:border-zinc-200 dark:text-zinc-500">
                  Eleeveon Learn · Coming soon
                </span>
              </div>
            </div>

            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-800"
            >
              Open workspace
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-zinc-200 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <GridMark />
            <div>
              <p className="text-sm font-semibold">Eleeveon Systems</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Building thoughtful technology for education.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-zinc-500 dark:text-zinc-400">
            <a
              href="https://eleeveon.com"
              className="hover:text-zinc-950 dark:hover:text-white"
            >
              Eleeveon
            </a>
            <a
              href="https://websites.eleeveon.com"
              className="hover:text-zinc-950 dark:hover:text-white"
            >
              School Websites
            </a>
            <a
              href="#pricing"
              className="hover:text-zinc-950 dark:hover:text-white"
            >
              Pricing
            </a>
            <span>© {currentYear} Eleeveon Systems</span>
          </div>
        </div>
      </footer>

      {signupPlan ? (
        <div
          className="fixed inset-0 z-100 flex items-end justify-center bg-zinc-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-signup-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePublicSignup();
          }}
        >
          <section className="max-h-[94dvh] w-full overflow-auto rounded-t-[30px] border border-zinc-200 bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-[30px] sm:p-7 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f6fed]">
                  Create your Eleeveon owner account
                </p>
                <h2
                  id="public-signup-title"
                  className="mt-2 text-2xl font-semibold tracking-tight"
                >
                  Start with {signupPlan.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  We will create the owner account, attach the selected package and
                  {` ${billingCycle}`} billing choice, then continue to secure
                  payment. School and branch records can be created afterward.
                </p>
              </div>

              <button
                type="button"
                onClick={closePublicSignup}
                disabled={signupLoading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-200 text-lg dark:border-white/10"
                aria-label="Close account form"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-50 p-3 dark:bg-white/5">
              <div>
                <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
                  Package
                </span>
                <strong className="mt-1 block text-sm">{signupPlan.name}</strong>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
                  Billing
                </span>
                <strong className="mt-1 block text-sm capitalize">
                  {billingCycle}
                </strong>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
                  Amount
                </span>
                <strong className="mt-1 block text-sm">
                  {formatMoney(
                    publicAmount(signupPlan, billingCycle, studentCount),
                    signupPlan.currency || "GHS",
                  )}
                </strong>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-zinc-500">
                  Your full name
                </span>
                <input
                  value={signupForm.fullName}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  autoComplete="name"
                  className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 outline-none focus:border-[#2f6fed] dark:border-white/10 dark:bg-zinc-950"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-zinc-500">
                  School or account name
                </span>
                <input
                  value={signupForm.accountName}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      accountName: event.target.value,
                    }))
                  }
                  autoComplete="organization"
                  className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 outline-none focus:border-[#2f6fed] dark:border-white/10 dark:bg-zinc-950"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-zinc-500">
                  Email address
                </span>
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  autoComplete="email"
                  className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 outline-none focus:border-[#2f6fed] dark:border-white/10 dark:bg-zinc-950"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-zinc-500">
                  Phone number
                </span>
                <input
                  value={signupForm.phone}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  autoComplete="tel"
                  placeholder="Optional"
                  className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 outline-none focus:border-[#2f6fed] dark:border-white/10 dark:bg-zinc-950"
                />
              </label>

              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-zinc-500">
                  Create password
                </span>
                <div className="relative">
                  <input
                    type={showSignupPassword ? "text" : "password"}
                    value={signupForm.password}
                    onChange={(event) =>
                      setSignupForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 pr-14 outline-none focus:border-[#2f6fed] dark:border-white/10 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSignupPassword((current) => !current)
                    }
                    className="absolute right-1.5 top-1.5 h-9 rounded-xl px-3 text-xs font-semibold text-zinc-500"
                  >
                    {showSignupPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>

            {signupError ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                {signupError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submitPublicSignup()}
              disabled={signupLoading}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#2f6fed] px-5 text-sm font-semibold text-white transition hover:bg-[#245ed0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signupLoading
                ? "Creating your account..."
                : Number(publicAmount(signupPlan, billingCycle, studentCount)) > 0
                  ? "Create your Eleeveon owner account to payment"
                  : "Create account and activate package"}
              {!signupLoading ? <ArrowIcon /> : null}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-zinc-400">
              Already registered?{" "}
              <Link href="/login" className="font-semibold text-[#2f6fed]">
                Sign in
              </Link>{" "}
              and choose the package from your owner workspace.
            </p>
          </section>
        </div>
      ) : null}

    </main>
  );
}