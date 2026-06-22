"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api/apiClient";
import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";

type Plan = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxSchools?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  maxTeachers?: number | null;
  cloudBackup?: boolean;
  reports?: boolean;
  finance?: boolean;
  parentPortal?: boolean;
  studentPortal?: boolean;
  teacherPortal?: boolean;
  advancedAnalytics?: boolean;
  apiAccess?: boolean;
};

type Subscription = {
  id: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;
  trialEndsAt?: string | null;
  plan?: Plan;
};

const money = (amount: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

export default function SubscriptionPage() {
  const { refreshAccount } = useAccount();
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);

      const [planRows, sub] = await Promise.all([
        apiClient<Plan[]>("/billing/plans"),
        apiClient<Subscription | null>("/billing/subscription").catch(() => null),
      ]);

      setPlans(planRows || []);
      setSubscription(sub || null);

      if (sub?.billingCycle === "yearly" || sub?.billingCycle === "monthly") {
        setBillingCycle(sub.billingCycle);
      }
    } catch (error: any) {
      alert(error?.message || "Failed to load subscription details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentPlanCode = subscription?.plan?.code;

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => Number(a.priceMonthly || 0) - Number(b.priceMonthly || 0));
  }, [plans]);

  const subscribe = async (planCode: string) => {
    try {
      setSavingPlan(planCode);

      const next = await apiClient<Subscription>("/billing/subscribe", {
        method: "POST",
        body: {
          planCode,
          billingCycle,
        },
      });

      setSubscription(next);
      await refreshAccount();
      alert("Subscription updated successfully");
    } catch (error: any) {
      alert(error?.message || "Failed to update subscription");
    } finally {
      setSavingPlan(null);
    }
  };

  if (loading) {
    return (
      <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <StateCard text="Loading subscription plans..." />
      </main>
    );
  }

  return (
    <main className="sub-page" style={{ "--sub-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="sub-hero">
        <div>
          <p>Subscription Control</p>
          <h2>{subscription?.plan?.name || "No active plan"}</h2>
          <span>
            Status: {subscription?.status || "not configured"}
            {subscription?.nextBillingDate
              ? ` · Next billing: ${new Date(subscription.nextBillingDate).toLocaleDateString()}`
              : ""}
            {subscription?.trialEndsAt
              ? ` · Trial ends: ${new Date(subscription.trialEndsAt).toLocaleDateString()}`
              : ""}
          </span>
        </div>

        <div className="cycle-toggle">
          <button
            type="button"
            className={billingCycle === "monthly" ? "active" : ""}
            onClick={() => setBillingCycle("monthly")}
          >
            Monthly
          </button>

          <button
            type="button"
            className={billingCycle === "yearly" ? "active" : ""}
            onClick={() => setBillingCycle("yearly")}
          >
            Yearly
          </button>
        </div>
      </section>

      <section className="plan-grid">
        {sortedPlans.map((plan) => {
          const active = currentPlanCode === plan.code;
          const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;

          return (
            <article key={plan.id} className={`plan-card ${active ? "active" : ""}`}>
              <div className="plan-head">
                <div>
                  <h3>{plan.name}</h3>
                  <p>{plan.description || "Eleeveon subscription package"}</p>
                </div>

                {active && <span className="active-badge">Current</span>}
              </div>

              <div className="price">
                {money(price, plan.currency)}
                <span>/{billingCycle === "yearly" ? "year" : "month"}</span>
              </div>

              <div className="limits">
                <Mini label="Schools" value={plan.maxSchools ?? "Unlimited"} />
                <Mini label="Branches" value={plan.maxBranches ?? "Unlimited"} />
                <Mini label="Users" value={plan.maxUsers ?? "Unlimited"} />
                <Mini label="Students" value={plan.maxStudents ?? "Unlimited"} />
              </div>

              <div className="features">
                <Feature ok={!!plan.cloudBackup} text="Cloud backup" />
                <Feature ok={!!plan.finance} text="Finance module" />
                <Feature ok={!!plan.teacherPortal} text="Teacher portal" />
                <Feature ok={!!plan.studentPortal} text="Student portal" />
                <Feature ok={!!plan.parentPortal} text="Parent portal" />
                <Feature ok={!!plan.advancedAnalytics} text="Advanced analytics" />
              </div>

              <button
                type="button"
                disabled={active || savingPlan === plan.code}
                onClick={() => subscribe(plan.code)}
              >
                {savingPlan === plan.code
                  ? "Updating..."
                  : active
                  ? "Current Plan"
                  : "Choose Plan"}
              </button>
            </article>
          );
        })}

        {!sortedPlans.length && (
          <StateCard text="No subscription plans found. Seed your plans in the backend first." />
        )}
      </section>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Feature({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={ok ? "feature ok" : "feature no"}>
      {ok ? "✓" : "×"} {text}
    </span>
  );
}

function StateCard({ text }: { text: string }) {
  return <section className="state-card">{text}</section>;
}

const css = `
.sub-page{display:grid;gap:12px;color:var(--text,#0f172a)}
.sub-hero,.plan-card,.state-card{background:var(--surface,#fff);border:1px solid rgba(148,163,184,.22);box-shadow:0 14px 34px rgba(15,23,42,.055);border-radius:26px;overflow:hidden}
.sub-hero{display:grid;gap:14px;padding:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--sub-primary) 12%,#fff),#fff 65%)}
.sub-hero p{margin:0;color:var(--sub-primary);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
.sub-hero h2{margin:3px 0 0;font-size:clamp(22px,7vw,34px);font-weight:1000;letter-spacing:-.05em}
.sub-hero span{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:13px;font-weight:750;line-height:1.45}
.cycle-toggle{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;border-radius:999px;background:#f1f5f9}
.cycle-toggle button{border:0;border-radius:999px;min-height:40px;background:transparent;font-weight:950;cursor:pointer;color:#334155}
.cycle-toggle button.active{background:var(--sub-primary);color:#fff}
.plan-grid{display:grid;gap:10px}
.plan-card{padding:14px}
.plan-card.active{border-color:color-mix(in srgb,var(--sub-primary) 50%,rgba(148,163,184,.22))}
.plan-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}
.plan-head h3{margin:0;font-size:20px;font-weight:1000}
.plan-head p{margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.5}
.active-badge{border-radius:999px;background:rgba(34,197,94,.12);color:#16a34a;padding:6px 9px;font-size:11px;font-weight:950;white-space:nowrap}
.price{margin-top:12px;font-size:30px;font-weight:1000;letter-spacing:-.06em}
.price span{font-size:12px;color:#64748b;letter-spacing:0}
.limits{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mini{min-width:0;border-radius:18px;padding:10px;background:#f8fafc;border:1px solid rgba(148,163,184,.18)}
.mini strong,.mini span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mini strong{font-size:16px;font-weight:1000}
.mini span{margin-top:3px;color:#64748b;font-size:11px;font-weight:850}
.features{margin-top:12px;display:flex;flex-wrap:wrap;gap:7px}
.feature{border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900}
.feature.ok{background:rgba(34,197,94,.12);color:#16a34a}
.feature.no{background:rgba(100,116,139,.12);color:#64748b}
.plan-card>button{width:100%;min-height:46px;border:0;border-radius:999px;margin-top:14px;background:var(--sub-primary);color:#fff;font-weight:950;cursor:pointer}
.plan-card>button:disabled{opacity:.55;cursor:not-allowed}
.state-card{padding:22px;text-align:center;font-weight:900;color:#64748b}
@media(min-width:760px){.sub-hero{grid-template-columns:minmax(0,1fr) auto;align-items:center}.cycle-toggle{min-width:230px}.plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1120px){.plan-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;