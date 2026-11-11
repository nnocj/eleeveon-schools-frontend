"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import eleeveonIcon from "../public/favicon_io/android-chrome-192x192.png";

type Feature = {
  icon: string;
  title: string;
  description: string;
};

type BillingCycle = "monthly" | "termly" | "yearly";

type Plan = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  currency?: string | null;
  priceMonthly?: number;
  priceTermly?: number;
  priceYearly?: number;
  maxStudents?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  schoolWebsites?: boolean;
  deploymentMode?: string | null;
  licenseModel?: string | null;
  availableAcquisitionModes?: string[] | null;
  priceOneTime?: number | null;
  trialDays?: number | null;
  active?: boolean;
  features?: string[] | null;
  metadata?: {
    pricing?: {
      mode?: "fixed" | "per_student" | "tiered";
      billingPeriod?: BillingCycle;
      perStudentRate?: number;
      minimumAmount?: number;
      tiers?: { upTo: number | null; unitPrice: number }[];
    };
    publicVisible?: boolean;
    visibility?: string;
    trialDays?: number;
    recommended?: boolean;
    badge?: string | null;
    displayOrder?: number | null;
    featureFlags?: Record<string, boolean>;
    featureKeys?: string[];
    [key: string]: unknown;
  } | null;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

const FEATURES: Feature[] = [
  {
    icon: "🏫",
    title: "A recognizable school identity",
    description:
      "Present the school’s approved name, logo, colours, motto, programmes and contact information consistently.",
  },
  {
    icon: "📰",
    title: "News and announcements",
    description:
      "Share approved news, admission updates and announcements without maintaining disconnected copies of school information.",
  },
  {
    icon: "📷",
    title: "Media and galleries",
    description:
      "Organize approved photos of projects, celebrations, activities and school facilities in one public experience.",
  },
  {
    icon: "📚",
    title: "Academic information",
    description:
      "Present programmes, subjects, curriculum pathways and other approved academic information clearly.",
  },
  {
    icon: "📅",
    title: "Calendar-aware",
    description:
      "Keep families informed of reopening dates, events and important school activities when calendar publishing is enabled.",
  },
  {
    icon: "📱",
    title: "Built for every screen",
    description:
      "Make essential school information easy to read on mobile phones, tablets and desktop computers.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Choose an eligible Schools package",
    description:
      "Find a published Cloud, trial or Independent package that includes School Websites. Availability and limitations vary by package.",
  },
  {
    number: "02",
    title: "Prepare public school information",
    description:
      "Set school branding, choose an available design, and review which school details, media and announcements are approved for public display.",
  },
  {
    number: "03",
    title: "Publish and maintain",
    description:
      "Publish through the supported Schools website deployment flow. Domain availability and publishing features depend on your package.",
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

function websiteEnabled(plan: Plan): boolean {
  return plan.schoolWebsites === true ||
    plan.metadata?.featureFlags?.schoolWebsites === true ||
    plan.features?.includes("schoolWebsites") === true ||
    plan.metadata?.featureKeys?.includes("schoolWebsites") === true;
}

function isPublicWebsitePlan(plan: Plan): boolean {
  if (plan.active === false || !websiteEnabled(plan)) return false;
  if (plan.metadata?.publicVisible === false || plan.metadata?.visibility === "private") return false;
  if (plan.licenseModel === "complimentary" || plan.deploymentMode === "private_hosted") return false;
  const modes = plan.availableAcquisitionModes || [];
  return !modes.length || modes.some(mode => ["self_service", "trial", "outright", "installments"].includes(mode));
}

function packageKind(plan: Plan): "trial" | "cloud" | "independent" {
  if (plan.licenseModel === "trial" || plan.code === "trial") return "trial";
  if (plan.deploymentMode?.startsWith("independent") || plan.licenseModel === "perpetual") return "independent";
  return "cloud";
}

function quoteFor(plan: Plan, students: number, cycle: BillingCycle): { amount: number | null; period: string; note: string } {
  const kind = packageKind(plan);
  if (kind === "trial") return { amount: 0, period: "trial", note: `Evaluation access${plan.trialDays || plan.metadata?.trialDays ? ` for ${plan.trialDays || plan.metadata?.trialDays} days` : ""}; limits apply` };
  if (kind === "independent") {
    const price = Number(plan.priceOneTime ?? 0);
    return { amount: price > 0 ? price : null, period: "one-time", note: "Independent installation; activation and purchase require confirmation" };
  }
  const pricing = plan.metadata?.pricing;
  if (pricing && (pricing.mode === "per_student" || pricing.mode === "tiered")) {
    const period = pricing.billingPeriod || "termly";
    if (!Number.isSafeInteger(students) || students < 1 || (plan.maxStudents != null && students > plan.maxStudents)) {
      return { amount: null, period, note: "Choose a student count within this package's limit" };
    }
    let amount = 0;
    if (pricing.mode === "per_student") amount = students * Number(pricing.perStudentRate || 0);
    else {
      let previous = 0;
      for (const tier of pricing.tiers || []) {
        const top = tier.upTo == null ? students : Math.min(students, tier.upTo);
        if (top < previous || !Number.isFinite(tier.unitPrice)) return { amount: null, period, note: "Pricing configuration needs review" };
        amount += (top - previous) * tier.unitPrice;
        previous = top;
        if (previous >= students) break;
      }
      if (previous < students) return { amount: null, period, note: "Pricing configuration needs review" };
    }
    return { amount: Math.round(Math.max(amount, Number(pricing.minimumAmount || 0)) * 100) / 100, period, note: `${students.toLocaleString()} students · indicative quote` };
  }
  const fixed = cycle === "yearly" ? Number(plan.priceYearly || 0) : cycle === "termly" ? Number(plan.priceTermly || 0) : Number(plan.priceMonthly || 0);
  return { amount: fixed > 0 ? fixed : null, period: cycle, note: "Fixed package price" };
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

export default function Home() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [billingCycle, setBillingCycle] =
    useState<BillingCycle>("termly");
  const [studentCount, setStudentCount] = useState(200);
  const [pricingPage, setPricingPage] = useState(0);
  const [pricingCardsPerPage, setPricingCardsPerPage] = useState(1);

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
              ? String(
                  (payload as { message?: unknown }).message || "",
                )
              : "";

          throw new Error(
            message || `Unable to load plans (${response.status}).`,
          );
        }

        const activePlans = normalizePlans(payload)
          .filter(isPublicWebsitePlan)
          .sort((a, b) => {
            const aOrder = Number(
              a.metadata?.displayOrder ?? 999,
            );
            const bOrder = Number(
              b.metadata?.displayOrder ?? 999,
            );

            if (aOrder !== bOrder) return aOrder - bOrder;

            return (
              (quoteFor(a, 200, "termly").amount ?? Infinity) -
              (quoteFor(b, 200, "termly").amount ?? Infinity)
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
    <main className="min-h-screen overflow-x-hidden bg-white text-zinc-950 selection:bg-zinc-950 selection:text-white dark:bg-zinc-950 dark:text-white dark:selection:bg-white dark:selection:text-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-195 overflow-hidden">
        <div className="absolute left-1/2 -top-85 h-170 w-170 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(47,111,237,0.18),rgba(47,111,237,0)_68%)]" />
        <div className="absolute -right-55 top-48 h-120 w-120 rounded-full bg-[radial-gradient(circle,rgba(138,92,246,0.12),rgba(138,92,246,0)_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.045)_1px,transparent_1px)] bg-size-[44px_44px] mask-[linear-gradient(to_bottom,black,transparent_82%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)]" />
      </div>

      <header className="relative z-10 border-b border-zinc-200/80 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/75">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:min-h-18 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <GridMark />
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Eleeveon
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                School Websites
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex dark:text-zinc-300">
            <a href="#features" className="transition hover:text-zinc-950 dark:hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-zinc-950 dark:hover:text-white">
              How it works
            </a>
            <a href="#pricing" className="transition hover:text-zinc-950 dark:hover:text-white">
              Pricing
            </a>
            <a href="#platform" className="transition hover:text-zinc-950 dark:hover:text-white">
              Platform
            </a>
          </nav>

          <a
            href="https://schools.eleeveon.com"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-950 px-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zinc-800 sm:px-4 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <span className="hidden sm:inline">Open Eleeveon Schools</span>
            <span className="sm:hidden">Open</span>
            <ArrowIcon />
          </a>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-14 sm:gap-14 sm:px-8 sm:py-20 lg:min-h-180 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected to Eleeveon Schools
          </div>

          <h1 className="mt-6 max-w-3xl text-[2.55rem] font-semibold leading-[1.02] tracking-[-0.052em] sm:mt-7 sm:text-6xl lg:text-7xl">
            Your school deserves a public presence as thoughtful as the work inside it.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 sm:mt-7 sm:text-xl sm:leading-8 dark:text-zinc-300">
            School Websites is a publishing capability within Eleeveon Schools.
            It helps schools share approved information, news and school identity
            through a responsive website, connected to the records they already manage.
          </p>

          <div className="mt-7 grid gap-3 sm:mt-9 sm:flex sm:flex-row">
            <a
              href="https://schools.eleeveon.com"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 text-sm font-semibold text-white shadow-lg shadow-zinc-950/10 transition hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Visit Eleeveon Schools
              <ArrowIcon />
            </a>

            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              See how it works
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Package-dependent publishing</span>
            <span>Template-based design</span>
            <span>Mobile responsive</span>
            <span>Shared school data</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-10 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(47,111,237,0.16),transparent_65%)] blur-2xl" />

          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/10 sm:rounded-[30px] dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                your-school.eleeveon.com
              </div>
              <div className="w-12" />
            </div>

            <div className="border-b border-zinc-200 bg-linear-to-br from-[#173d8f] via-[#2f6fed] to-[#7a5cf5] px-5 py-9 text-white sm:px-7 sm:py-12 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-lg font-bold backdrop-blur">
                  EA
                </div>
                <div>
                  <div className="font-semibold">Eleeveon Academy</div>
                  <div className="text-xs text-white/70">
                    Knowledge · Character · Excellence
                  </div>
                </div>
              </div>

              <div className="mt-12 max-w-md">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                  Welcome
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Preparing confident learners for a changing world.
                </h2>
                <p className="mt-4 text-sm leading-6 text-white/80">
                  Explore our programmes, school life, announcements and
                  admissions information.
                </p>
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {[
                ["Latest news", "Admissions for the new academic year are open."],
                ["Upcoming event", "Graduation and awards ceremony · 24 August"],
                ["School life", "View recent projects, activities and campus moments."],
              ].map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10 dark:bg-white/3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    {title}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-y border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/2.5">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[#2f6fed]">
              One connected school presence
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              More than a separate website builder.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Rather than repeatedly typing the same school details into separate
              tools, publish selected information from Eleeveon Schools. The school
              decides what belongs on its public pages and what remains private.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="group rounded-3xl border border-zinc-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:border-white/10 dark:bg-zinc-900/70"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 text-xl transition group-hover:scale-105 dark:bg-white/10">
                  {feature.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-14 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-sm font-semibold text-[#2f6fed]">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Update once. Publish with confidence.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Website access depends on the package you choose. Set up approved
              content, choose a design, then publish with the supported tools.
              Internal student and financial records remain separate from public content.
            </p>
          </div>

          <div className="space-y-4">
            {STEPS.map((step) => (
              <article
                key={step.number}
                className="grid gap-5 rounded-3xl border border-zinc-200 bg-white p-6 sm:grid-cols-[72px_1fr] dark:border-white/10 dark:bg-zinc-900/60"
              >
                <div className="text-3xl font-semibold tracking-tight text-zinc-300 dark:text-zinc-700">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="relative z-10 border-y border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/2.5">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-8 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#2f6fed]">Packages with School Websites</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Choose how your school gets started.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              See published Eleeveon Schools packages that include website publishing.
              Compare free trials, Cloud subscriptions and eligible Independent editions.
              Private arrangements and complimentary pilot agreements are not listed.
            </p>
          </div>
          <div className="mt-8 grid gap-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] dark:border-white/10 dark:bg-zinc-900">
            <div>
              <label htmlFor="websites-student-count" className="block text-sm font-semibold">How many student places would you like to prepay?</label>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Choose your future student capacity, even if you have not yet enrolled anyone. Your estimate appears alongside the selector.</p>
              <input id="websites-student-count" type="number" min={1} max={1000000} value={studentCount}
                onChange={event => {
                  const next = Number(event.target.value);
                  setStudentCount(Number.isFinite(next) ? Math.min(1000000, Math.max(1, Math.floor(next))) : 1);
                }}
                className="mt-4 w-full max-w-60 rounded-xl border border-zinc-300 bg-transparent px-4 py-3 text-lg font-semibold outline-none focus:border-[#2f6fed] dark:border-white/20" />
              <div className="mt-3 flex flex-wrap gap-2">{[50, 100, 200, 500].map(quantity => <button type="button" key={quantity} onClick={() => setStudentCount(quantity)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${studentCount === quantity ? "border-[#2f6fed] bg-[#2f6fed] text-white" : "border-zinc-200 dark:border-white/15"}`}>{quantity}</button>)}</div>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">The final payable amount is calculated in the secure Eleeveon Schools Owner checkout.</p>
            </div>
            <div className="rounded-2xl border border-[#2f6fed]/20 bg-[#2f6fed]/5 p-5 dark:border-[#2f6fed]/30 dark:bg-[#2f6fed]/10" aria-live="polite" aria-atomic="true">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6fed]">Your instant quotation</p>
              {plansLoading ? <p className="mt-3 text-sm text-zinc-500">Loading published prices…</p> : plansError ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Unable to load pricing: {plansError}</p> : (
                (() => {
                  const studentPricedPlans = plans.filter(plan => ["per_student", "tiered"].includes(plan.metadata?.pricing?.mode || "") && packageKind(plan) === "cloud");
                  if (!studentPricedPlans.length) return <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No per-student package with School Websites is currently published. You can compare the available fixed-price options below, or visit Eleeveon Schools for all packages.</p>;
                  return <div className="mt-3 space-y-3">{studentPricedPlans.map(plan => {
                    const quote = quoteFor(plan, studentCount, billingCycle);
                    return <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/70 pb-3 last:border-0 last:pb-0 dark:border-white/10">
                      <div><p className="text-sm font-semibold">{plan.name}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{studentCount.toLocaleString()} students · {quote.period}</p></div>
                      <strong className="text-2xl font-semibold tracking-tight">{quote.amount == null ? "Request quote" : formatMoney(quote.amount, plan.currency || "GHS")}</strong>
                    </div>;
                  })}</div>;
                })()
              )}
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Indicative prices only; Eleeveon verifies the final quote before payment.</p>
              <a href="#website-package-list" className="mt-3 inline-flex text-sm font-semibold text-[#2f6fed] hover:underline">Explore package details ↓</a>
            </div>
          </div>
          <div id="website-package-list" className="scroll-mt-24" />

          {plansLoading ? (
            <p className="mt-9 text-sm text-zinc-500">Loading published website-enabled packages...</p>
          ) : plansError ? (
            <div className="mt-9 rounded-2xl border border-amber-200 p-5 text-sm dark:border-amber-500/30">Package information is temporarily unavailable. {plansError}</div>
          ) : plans.length === 0 ? (
            <div className="mt-9 rounded-2xl border border-zinc-200 p-6 text-sm dark:border-white/10">
              No publicly available School Websites packages are published yet. Explore Eleeveon Schools for other available packages.
            </div>
          ) : (
            <>
              <div className="relative mt-9">
                <div className={`grid gap-5 ${pricingCardsPerPage === 3 ? "lg:grid-cols-3" : pricingCardsPerPage === 2 ? "sm:grid-cols-2" : ""}`}>
                  {visiblePricingPlans.map(plan => {
                    const kind = packageKind(plan);
                    const quote = quoteFor(plan, studentCount, billingCycle);
                    const canStartTrial = kind === "trial" && (plan.availableAcquisitionModes?.includes("trial") || plan.code === "trial");
                    const planUrl = new URL("https://schools.eleeveon.com");
                    planUrl.searchParams.set("planId", plan.id);
                    planUrl.searchParams.set("students", String(studentCount));
                    planUrl.searchParams.set("source", "school-websites-pricing");
                    // Linking to the public catalogue avoids implying unsupported instant checkout for Independent packages.
                    planUrl.hash = "pricing";
                    return (
                      <article key={plan.id} className="flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#2f6fed]">
                          {kind === "trial" ? "Try before you decide" : kind === "independent" ? "Independent deployment" : "Cloud subscription"}
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold">{plan.name}</h3>
                        <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{plan.description || "Includes the School Websites capability in Eleeveon Schools."}</p>
                        <div className="mt-6 border-y border-zinc-100 py-5 dark:border-white/10">
                          <strong className="text-3xl font-semibold tracking-tight">
                            {quote.amount == null ? "Ask for a quote" : formatMoney(quote.amount, plan.currency || "GHS")}
                          </strong>
                          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{quote.period === "one-time" ? "one-time" : quote.period === "trial" ? "trial access" : `per ${quote.period}`}</span>
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{quote.note}</p>
                        </div>
                        <div className="mt-5 grid grid-cols-3 gap-2">
                          {([[plan.maxStudents, "students"], [plan.maxBranches, "branches"], [plan.maxUsers, "users"]] as const).map(([value, label]) => (
                            <div key={label} className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                              <strong className="block text-sm">{value == null ? "Flexible" : value.toLocaleString()}</strong>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-auto pt-7">
                          <a href={planUrl.toString()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">
                            {canStartTrial ? "Explore free trial" : kind === "independent" ? "Explore deployment" : "Review package"}
                            <ArrowIcon />
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              {pricingPageCount > 1 && (
                <div className="mt-7 flex items-center justify-center gap-3">
                  <button type="button" onClick={() => goToPricingPage(safePricingPage - 1)} className="rounded-full border px-4 py-2 text-sm dark:border-white/20" aria-label="Previous packages">Previous</button>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{safePricingPage + 1} / {pricingPageCount}</span>
                  <button type="button" onClick={() => goToPricingPage(safePricingPage + 1)} className="rounded-full border px-4 py-2 text-sm dark:border-white/20" aria-label="Next packages">Next</button>
                </div>
              )}
            </>
          )}
          <p className="mt-6 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
            Student-based prices are estimates, not payment authorization. The final quote is confirmed by Eleeveon Schools.
            Website access is subject to each package's published capabilities, installation requirements and service availability.
          </p>
        </div>
      </section>

      <section id="platform" className="relative z-10 px-4 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-zinc-950 px-5 py-12 text-white sm:rounded-4xl sm:px-10 sm:py-16 lg:px-16 dark:bg-white dark:text-zinc-950">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-semibold text-white/60 dark:text-zinc-500">
                Part of the Eleeveon platform
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Run the school. Serve the community. Build what comes next.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70 dark:text-zinc-600">
                Start with the deployment and commercial arrangement that suits
                your school. School Websites is one optional capability of the
                wider Eleeveon Schools system, alongside school reporting and records.
              </p>
            </div>

            <a
              href="https://schools.eleeveon.com"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-800"
            >
              Open Schools
              <ArrowIcon />
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-zinc-200 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
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
            <a href="https://schools.eleeveon.com" className="hover:text-zinc-950 dark:hover:text-white">
              Schools
            </a>
            <span>Learn · Coming soon</span>
            <span>© {currentYear} Eleeveon Systems</span>
          </div>
        </div>
      </footer>
    </main>
  );
}