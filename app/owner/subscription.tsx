"use client";

/**
 * app/owner/subscriptions.tsx
 * ---------------------------------------------------------
 * OWNER — SUBSCRIPTIONS
 * Golden compact rewrite
 * ---------------------------------------------------------
 *
 * Data/payment behavior preserved:
 * - Loads plans from /billing/plans.
 * - Loads current subscription from /billing/my-subscription.
 * - Verifies Paystack redirect reference.
 * - Uses PaymentCheckout with planId + billingCycle.
 * - A plan becomes Current only when backend confirms an active subscription
 *   with a paid payment or paid invoice.
 *
 * UI upgrade:
 * - Removed large hero/header block.
 * - Removed large current subscription card.
 * - Replaced all non-plan UI with the compact golden pattern:
 *   search + cycle + refresh + More top row.
 * - Current subscription, notices, loading and empty states are compact rows.
 * - More sheet holds billing cycle, current subscription details and refresh.
 * - Subscription plan cards remain as selling cards, as requested.
 * - Theme-safe variables are used for dark mode and local density support.
 */

import React, { useEffect, useMemo, useState } from "react";
import PaymentCheckout from "../components/payments/PaymentCheckout";
import {
  authHeaders,
  getApiBase,
  money,
  readJson,
} from "../components/payments/payment-utils";

type Plan = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  currency?: string | null;
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
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  status: string;
  dueDate?: string | null;
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  provider?: string | null;
  status: string;
};

type CurrentSubscription = {
  id?: string;
  planId?: string;
  status?: string;
  billingCycle?: "monthly" | "yearly" | string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;
  plan?: Plan;
  invoices?: Invoice[];
  payments?: Payment[];
};

type BillingCycle = "monthly" | "yearly";

function niceDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function normalizeArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.plans)) return payload.plans;
  return [];
}

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function hasConfirmedPayment(current: CurrentSubscription | null) {
  if (!current) return false;

  const hasPaidPayment = current.payments?.some(
    (payment) => normalizeStatus(payment.status) === "paid"
  );

  const hasPaidInvoice = current.invoices?.some(
    (invoice) => normalizeStatus(invoice.status) === "paid"
  );

  return Boolean(hasPaidPayment || hasPaidInvoice);
}

function isActiveConfirmedSubscription(current: CurrentSubscription | null) {
  if (!current) return false;

  return (
    Boolean(current.id || current.planId || current.plan?.id) &&
    normalizeStatus(current.status) === "active" &&
    hasConfirmedPayment(current)
  );
}

function isPendingSubscription(current: CurrentSubscription | null) {
  if (!current) return false;
  return Boolean(current.id || current.planId || current.plan?.id) && !isActiveConfirmedSubscription(current);
}

function subscriptionDisplayStatus(current: CurrentSubscription | null) {
  if (!current) return "No subscription";

  if (isActiveConfirmedSubscription(current)) {
    return current.status || "active";
  }

  if (normalizeStatus(current.status) === "active" && !hasConfirmedPayment(current)) {
    return "pending payment confirmation";
  }

  return current.status || "pending payment";
}

function planPrice(plan: Plan, cycle: BillingCycle) {
  return cycle === "yearly" ? Number(plan.priceYearly || 0) : Number(plan.priceMonthly || 0);
}

function planFeatures(plan: Plan) {
  return [
    plan.maxSchools ? `${plan.maxSchools} school(s)` : "Flexible schools",
    plan.maxBranches ? `${plan.maxBranches} branch(es)` : "Flexible branches",
    plan.maxUsers ? `${plan.maxUsers} users` : "Flexible users",
    plan.maxStudents ? `${plan.maxStudents} students` : "Flexible students",
    plan.maxTeachers ? `${plan.maxTeachers} teachers` : "Flexible teachers",
    plan.maxStorageMb ? `${plan.maxStorageMb} MB storage` : null,
    plan.offlineSync ? "Offline sync" : null,
    plan.cloudBackup ? "Cloud backup" : null,
    plan.reports ? "Reports" : null,
    plan.finance ? "Finance" : null,
    plan.parentPortal ? "Parent portal" : null,
    plan.studentPortal ? "Student portal" : null,
    plan.teacherPortal ? "Teacher portal" : null,
    plan.advancedAnalytics ? "Advanced analytics" : null,
    plan.apiAccess ? "API access" : null,
  ].filter(Boolean);
}

export default function OwnerSubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const apiBase = getApiBase();

  async function load(options?: { preserveNotice?: boolean }) {
    try {
      setLoading(true);
      setError("");
      if (!options?.preserveNotice) setNotice("");

      const [plansRes, currentRes] = await Promise.all([
        fetch(`${apiBase}/billing/plans`, { headers: authHeaders() }),
        fetch(`${apiBase}/billing/my-subscription`, { headers: authHeaders() }),
      ]);

      const plansJson = await readJson(plansRes);
      const currentJson = await readJson(currentRes);

      const activePlans = normalizeArray(plansJson).filter(
        (plan) => plan.active !== false
      );

      setPlans(activePlans);
      setCurrent(currentJson?.id || currentJson?.planId ? currentJson : null);

      if (currentJson?.billingCycle === "yearly") {
        setCycle("yearly");
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load subscription plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");

    if (reference) {
      verifyAfterRedirect(reference);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyAfterRedirect(reference: string) {
    try {
      setError("");
      setNotice("Verifying payment...");

      const res = await fetch(
        `${apiBase}/billing/payments/verify/${reference}?provider=paystack`,
        { headers: authHeaders() }
      );

      await readJson(res);
      await load({ preserveNotice: true });

      setNotice(
        "Payment verification completed. Your package will show as Current only after the backend confirms the payment as paid and activates the subscription."
      );

      const url = new URL(window.location.href);
      url.searchParams.delete("reference");
      window.history.replaceState({}, "", url.toString());
    } catch (err: any) {
      setError(err?.message || "Unable to verify payment.");
    }
  }

  const confirmedSubscriptionActive = isActiveConfirmedSubscription(current);
  const pendingSubscription = isPendingSubscription(current);

  const sortedPlans = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...plans]
      .filter((plan) => {
        if (!query) return true;
        const features = planFeatures(plan).join(" ");
        return `${plan.name} ${plan.code} ${plan.description || ""} ${features}`.toLowerCase().includes(query);
      })
      .sort((a, b) => Number(a.priceMonthly || 0) - Number(b.priceMonthly || 0));
  }, [plans, search]);

  const currentInvoice = current?.invoices?.[0];
  const currentPlanName = current?.plan?.name || "Selected Plan";
  const currentStatus = subscriptionDisplayStatus(current);

  return (
    <main className="ba-page subscription-page">
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Subscription search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search packages..."
            aria-label="Search subscription plans"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={() => setCycle((value) => (value === "monthly" ? "yearly" : "monthly"))}
          aria-label="Toggle billing cycle"
          title="Toggle billing cycle"
        >
          {cycle === "monthly" ? "Month" : "Year"}
        </button>

        <button
          type="button"
          className="ba-filter-button"
          onClick={() => load()}
          disabled={loading}
          aria-label="Refresh subscriptions"
          title="Refresh"
        >
          ↻
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      <section className="ba-list compact-status-list" aria-label="Subscription status">
        {current ? (
          <button type="button" className="status-row" onClick={() => setMoreOpen(true)}>
            <span className="status-icon">{confirmedSubscriptionActive ? "✓" : "!"}</span>

            <span className="status-main">
              <strong>{currentPlanName}</strong>
              <small>
                {confirmedSubscriptionActive ? "Current subscription" : "Pending subscription"} · {current.billingCycle || "monthly"}
              </small>
              <em>
                {currentStatus} · Ends {confirmedSubscriptionActive ? niceDate(current.currentPeriodEnd) : "after confirmation"}
              </em>
            </span>

            <span className="status-side">
              <span className={`status-dot-mini ${confirmedSubscriptionActive ? "green" : "orange"}`} />
              <i>⋯</i>
            </span>
          </button>
        ) : (
          <button type="button" className="status-row" onClick={() => setMoreOpen(true)}>
            <span className="status-icon">○</span>
            <span className="status-main">
              <strong>No active subscription</strong>
              <small>Choose a package below</small>
              <em>Plans are available in monthly and yearly billing.</em>
            </span>
            <span className="status-side">
              <span className="status-dot-mini gray" />
              <i>⋯</i>
            </span>
          </button>
        )}

        {pendingSubscription ? (
          <SlimNotice tone="orange">
            Your selected package is waiting for payment confirmation. It will not be marked as Current until the backend confirms a paid payment or paid invoice.
          </SlimNotice>
        ) : null}

        {notice ? <SlimNotice tone="green">{notice}</SlimNotice> : null}
        {error ? <SlimNotice tone="red">{error}</SlimNotice> : null}
        {loading ? <SlimNotice tone="gray">Loading subscription plans...</SlimNotice> : null}
      </section>

      {!loading && !sortedPlans.length ? (
        <section className="ba-empty">
          <div className="ba-empty-icon">💳</div>
          <h3>No active subscription plans found</h3>
          <p>{search ? "No package matches your search." : "The developer must create and activate subscription plans first."}</p>
        </section>
      ) : null}

      <section className="plans-grid" aria-label="Subscription plans">
        {sortedPlans.map((plan) => {
          const currency = plan.currency || "GHS";
          const monthlyPrice = Number(plan.priceMonthly || 0);
          const yearlyPrice = Number(plan.priceYearly || 0);
          const expectedYearlyCost = monthlyPrice * 12;
          const yearlyDifference = expectedYearlyCost - yearlyPrice;
          const hasYearlySaving = cycle === "yearly" && yearlyDifference > 0;
          const hasYearlyIncrease = cycle === "yearly" && yearlyDifference < 0;
          const price = planPrice(plan, cycle);

          const planMatchesCurrent =
            current?.planId === plan.id || current?.plan?.id === plan.id;

          const isCurrent = confirmedSubscriptionActive && planMatchesCurrent;
          const isWaitingConfirmation = !confirmedSubscriptionActive && planMatchesCurrent;
          const features = planFeatures(plan);

          return (
            <article
              key={plan.id}
              className={isCurrent ? "plan current" : isWaitingConfirmation ? "plan waiting" : "plan"}
            >
              {isCurrent ? <div className="ribbon">Current</div> : null}
              {isWaitingConfirmation ? <div className="ribbon waiting-ribbon">Pending</div> : null}

              <div>
                <span className="badge">{plan.code}</span>
                <h2>{plan.name}</h2>
                <p>{plan.description || "A flexible package for your school."}</p>
              </div>

              <div className="price">
                <div>
                  <strong>{money(price, currency)}</strong>
                  <span>/{cycle === "yearly" ? "year" : "month"}</span>
                </div>

                {cycle === "yearly" ? (
                  <small>
                    Expected yearly cost: <b>{money(expectedYearlyCost, currency)}</b>
                  </small>
                ) : null}
              </div>

              {hasYearlySaving ? (
                <div className="saving-pill">
                  Save {money(yearlyDifference, currency)} yearly
                </div>
              ) : null}

              {hasYearlyIncrease ? (
                <div className="saving-pill warning">
                  Yearly is {money(Math.abs(yearlyDifference), currency)} higher
                </div>
              ) : null}

              {isWaitingConfirmation ? (
                <div className="saving-pill warning">
                  Waiting for confirmed payment
                </div>
              ) : null}

              <ul>
                {features.slice(0, 12).map((feature) => (
                  <li key={String(feature)}>✓ {feature}</li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => setSelectedPlan(plan)}
              >
                {isCurrent
                  ? "Current plan"
                  : isWaitingConfirmation
                  ? Number(price || 0) > 0
                    ? "Retry or complete payment"
                    : "Complete activation"
                  : Number(price || 0) > 0
                  ? "Choose payment"
                  : "Activate free plan"}
              </button>
            </article>
          );
        })}
      </section>

      {moreOpen ? (
        <MoreSheet
          cycle={cycle}
          setCycle={setCycle}
          current={current}
          currentInvoice={currentInvoice}
          confirmedSubscriptionActive={confirmedSubscriptionActive}
          currentStatus={currentStatus}
          loading={loading}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}

      {selectedPlan ? (
        <PaymentCheckout
          open={Boolean(selectedPlan)}
          onClose={() => setSelectedPlan(null)}
          title={selectedPlan.name}
          description={selectedPlan.description || "Complete your subscription payment."}
          amount={planPrice(selectedPlan, cycle)}
          currency={selectedPlan.currency || "GHS"}
          planId={selectedPlan.id}
          billingCycle={cycle}
          onSuccess={async (result) => {
            setNotice(
              result.message ||
                "Payment started. Your package will become Current only after payment is confirmed."
            );
            setSelectedPlan(null);
            await load({ preserveNotice: true });
          }}
          onError={(message) => setError(message)}
        />
      ) : null}
    </main>
  );
}

function SlimNotice({ tone, children }: { tone: "green" | "red" | "orange" | "gray"; children: React.ReactNode }) {
  return (
    <section className={`slim-notice ${tone}`}>
      <span className={`status-dot-mini ${tone === "red" ? "red" : tone === "orange" ? "orange" : tone === "green" ? "green" : "gray"}`} />
      <p>{children}</p>
    </section>
  );
}

function MoreSheet({
  cycle,
  setCycle,
  current,
  currentInvoice,
  confirmedSubscriptionActive,
  currentStatus,
  loading,
  onRefresh,
  onClose,
}: {
  cycle: BillingCycle;
  setCycle: (cycle: BillingCycle) => void;
  current: CurrentSubscription | null;
  currentInvoice?: Invoice;
  confirmedSubscriptionActive: boolean;
  currentStatus: string;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Billing cycle, subscription state and quick refresh.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <div className="cycle-sheet">
          <button
            type="button"
            className={cycle === "monthly" ? "active" : ""}
            onClick={() => setCycle("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={cycle === "yearly" ? "active" : ""}
            onClick={() => setCycle("yearly")}
          >
            Yearly
          </button>
        </div>

        <div className="sub-info-list">
          <InfoLine label="Plan" value={current?.plan?.name || "No subscription"} />
          <InfoLine label="Status" value={currentStatus} />
          <InfoLine label="Billing" value={current?.billingCycle || cycle} />
          <InfoLine label="Current" value={confirmedSubscriptionActive ? "Confirmed" : current ? "Pending" : "None"} />
          <InfoLine label="Ends" value={confirmedSubscriptionActive ? niceDate(current?.currentPeriodEnd) : "After confirmation"} />
          {currentInvoice ? (
            <InfoLine
              label="Invoice"
              value={`${currentInvoice.invoiceNumber} · ${money(currentInvoice.total, currentInvoice.currency)} · ${currentInvoice.status}`}
            />
          ) : null}
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={onRefresh} disabled={loading}>
            <span>↻</span>
            <b>{loading ? "Refreshing..." : "Refresh subscription"}</b>
            <small>Reload plans, invoices and current package</small>
          </button>

          <button type="button" onClick={onClose}>
            <span>✓</span>
            <b>Close</b>
            <small>Return to package cards</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const css = `
@keyframes spin{to{transform:rotate(360deg)}}

.ba-page{
  --ease:cubic-bezier(.2,.8,.2,1);
  min-height:100dvh;
  width:100%;
  max-width:100%;
  min-width:0;
  padding:calc(8px * var(--local-density-scale,1));
  padding-bottom:max(40px,env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--primary-color,#2563eb) 9%,transparent),transparent 30rem),
    var(--bg,#f7f8fb);
  color:var(--text,#0f172a);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
  font-size:var(--font-size,14px);
  overflow-x:hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after{
  box-sizing:border-box;
  min-width:0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea{
  font:inherit;
  max-width:100%;
}

.subscription-page{
  display:grid;
  gap:10px;
}

.ba-search-card,
.status-row,
.slim-notice,
.ba-empty,
.ba-sheet{
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.ba-search-card{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto auto;
  gap:8px;
  align-items:center;
  padding:8px;
  border-radius:24px;
}

.ba-search{
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:0 11px;
  border-radius:18px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
}

.ba-search span{
  color:var(--muted,#64748b);
  font-size:17px;
  font-weight:1000;
}

.ba-search input{
  width:100%;
  min-height:42px;
  border:0;
  padding:0;
  border-radius:0;
  background:transparent;
  color:var(--text,#0f172a);
  outline:none;
  box-shadow:none;
  font-size:14px;
  font-weight:750;
}

.ba-add-inline,
.ba-filter-button,
.ba-icon-button{
  min-width:42px;
  height:42px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  display:grid;
  place-items:center;
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  color:var(--text,#0f172a);
  font-size:14px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline{
  padding:0 13px;
  border-color:var(--primary-color,#2563eb);
  background:var(--primary-color,#2563eb);
  color:#fff;
  font-size:11px;
}

.ba-filter-button{
  color:var(--primary-color,#2563eb);
  background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,var(--card-bg,#fff));
}

.ba-icon-button{
  width:42px;
  font-size:18px;
}

.ba-list{
  display:grid;
  gap:7px;
}

.status-row{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:9px;
  padding:9px;
  border-radius:20px;
  color:var(--text,#0f172a);
  text-align:left;
  cursor:pointer;
}

.status-icon{
  width:34px;
  height:34px;
  border-radius:14px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,var(--primary-color,#2563eb),rgba(15,23,42,.9));
  color:#fff;
  font-size:13px;
  font-weight:1000;
  box-shadow:0 10px 20px rgba(15,23,42,.12);
}

.status-main{
  display:grid;
  gap:1px;
}

.status-main strong,
.status-main small,
.status-main em{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.status-main strong{
  font-size:13px;
  font-weight:1000;
  line-height:1.15;
}

.status-main small,
.status-main em{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-style:normal;
  font-weight:800;
  line-height:1.25;
}

.status-side{
  display:flex;
  align-items:center;
  gap:6px;
}

.status-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:17px;
  font-weight:1000;
}

.status-dot-mini{
  width:8px;
  height:8px;
  border-radius:999px;
  background:var(--muted,#64748b);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.slim-notice{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:9px;
  border-radius:17px;
  padding:8px 10px;
}

.slim-notice p{
  margin:0;
  font-size:11px;
  line-height:1.35;
  font-weight:850;
}

.slim-notice.green{background:#f0fdf4;color:#166534;border-color:#bbf7d0}
.slim-notice.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}
.slim-notice.orange{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
.slim-notice.gray{background:var(--card-bg,var(--surface,#fff));color:var(--muted,#64748b)}

.ba-empty{
  display:grid;
  place-items:center;
  align-content:center;
  gap:8px;
  min-height:180px;
  padding:18px;
  border-radius:24px;
  text-align:center;
  border-style:dashed;
}

.ba-empty-icon{
  width:50px;
  height:50px;
  display:grid;
  place-items:center;
  border-radius:20px;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,var(--surface,#fff));
  font-size:24px;
}

.ba-empty h3{
  margin:0;
  font-size:17px;
  font-weight:1000;
}

.ba-empty p{
  margin:0;
  color:var(--muted,#64748b);
  font-size:12px;
  line-height:1.5;
}

/* Selling cards intentionally preserved and lightly theme-safe. */
.plans-grid{
  width:100%;
  min-width:0;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,max-content));
  justify-content:start;
  align-items:start;
  gap:14px;
}

.plan{
  position:relative;
  isolation:isolate;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  gap:9px;
  width:100%;
  max-width:365px;
  min-width:0;
  padding:13px;
  border-radius:22px;
  background:
    linear-gradient(var(--card-bg,var(--card,#fff)),var(--card-bg,var(--card,#fff))) padding-box,
    linear-gradient(145deg,rgba(37,99,235,.18),rgba(15,23,42,.05),rgba(14,165,233,.13)) border-box;
  border:1px solid transparent;
  box-shadow:0 12px 28px rgba(15,23,42,.065);
  transition:transform .18s ease,box-shadow .18s ease;
}

.plan:before{
  content:"";
  position:absolute;
  inset:0;
  z-index:-1;
  background:
    radial-gradient(circle at top right,rgba(37,99,235,.075),transparent 33%),
    radial-gradient(circle at bottom left,rgba(14,165,233,.055),transparent 31%);
}

.plan:hover{
  transform:translateY(-2px);
  box-shadow:0 18px 42px rgba(15,23,42,.1);
}

.plan.current{
  border:2px solid var(--primary-color,#2563eb);
  box-shadow:0 16px 40px rgba(37,99,235,.13);
}

.plan.waiting{
  border:2px solid #f59e0b;
  box-shadow:0 16px 40px rgba(245,158,11,.13);
}

.ribbon{
  position:absolute;
  right:-40px;
  top:15px;
  transform:rotate(38deg);
  background:linear-gradient(135deg,var(--primary-color,#2563eb),#1d4ed8);
  color:#fff;
  font-size:8.5px;
  font-weight:1000;
  padding:5px 42px;
  text-transform:uppercase;
  letter-spacing:.1em;
  box-shadow:0 7px 18px rgba(37,99,235,.23);
}

.waiting-ribbon{
  background:linear-gradient(135deg,#f59e0b,#c2410c);
}

.badge{
  display:inline-flex;
  width:max-content;
  max-width:100%;
  padding:5px 8px;
  border-radius:999px;
  background:rgba(37,99,235,.085);
  color:var(--primary-color,#2563eb);
  border:1px solid rgba(37,99,235,.14);
  font-size:9.5px;
  font-weight:1000;
  text-transform:uppercase;
  overflow-wrap:anywhere;
}

.plan h2{
  margin:6px 0 3px;
  color:var(--text,#0f172a);
  font-size:18px;
  line-height:1.05;
  font-weight:1000;
  letter-spacing:-.04em;
  overflow-wrap:anywhere;
}

.plan p{
  margin:0;
  min-height:auto;
  color:var(--muted,#64748b);
  font-size:11.5px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.price{
  display:grid;
  gap:4px;
  padding:10px;
  border-radius:16px;
  background:color-mix(in srgb,var(--muted,#64748b) 6%,transparent);
  border:1px solid var(--border,rgba(148,163,184,.2));
}

.price>div{
  display:flex;
  align-items:flex-end;
  gap:5px;
}

.price strong{
  color:var(--text,#0f172a);
  font-size:clamp(1.22rem,2.4vw,1.6rem);
  line-height:1;
  font-weight:1000;
  letter-spacing:-.055em;
}

.price span{
  color:var(--muted,#64748b);
  font-size:10.5px;
  font-weight:900;
  padding-bottom:2px;
}

.price small{
  display:block;
  color:var(--muted,#64748b);
  font-size:10px;
  line-height:1.25;
  font-weight:800;
}

.price small b{
  color:var(--text,#0f172a);
}

.saving-pill{
  display:inline-flex;
  width:max-content;
  max-width:100%;
  align-items:center;
  border-radius:999px;
  padding:5px 8px;
  background:#ecfdf5;
  color:#047857;
  border:1px solid #bbf7d0;
  font-size:10px;
  font-weight:1000;
  overflow-wrap:anywhere;
}

.saving-pill.warning{
  background:#fff7ed;
  color:#c2410c;
  border-color:#fed7aa;
}

.plan ul{
  list-style:none;
  margin:0;
  padding:0;
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:5px 8px;
}

.plan li{
  display:flex;
  align-items:flex-start;
  gap:5px;
  color:var(--text,#334155);
  font-size:11px;
  font-weight:800;
  line-height:1.2;
}

.plan button{
  margin-top:4px;
  border:0;
  border-radius:999px;
  padding:10px 12px;
  background:linear-gradient(135deg,var(--primary-color,#2563eb),#1d4ed8);
  color:#fff;
  font-size:11.5px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 9px 18px rgba(37,99,235,.18);
}

.plan button:hover:not(:disabled){
  filter:brightness(1.04);
}

.plan button:disabled{
  background:#e5e7eb;
  color:#64748b;
  cursor:not-allowed;
  box-shadow:none;
}

.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:80;
  background:rgba(2,6,23,.46);
  display:grid;
  align-items:end;
  padding:10px;
}

.ba-sheet{
  width:min(540px,100%);
  margin:0 auto;
  border-radius:28px 28px 20px 20px;
  padding:14px;
  background:var(--card-bg,var(--card,var(--surface,#fff)));
  color:var(--text,#0f172a);
}

.ba-sheet.small{
  width:min(440px,100%);
}

.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  margin-bottom:12px;
}

.ba-sheet-head h2{
  margin:0;
  font-size:20px;
  font-weight:1000;
  letter-spacing:-.04em;
}

.ba-sheet-head p{
  margin:3px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:750;
  line-height:1.45;
}

.ba-sheet-head button{
  width:38px;
  height:38px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#0f172a);
  font-weight:1000;
  cursor:pointer;
}

.cycle-sheet{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
  padding:4px;
  border-radius:999px;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 8%,transparent);
  border:1px solid var(--border,rgba(0,0,0,.10));
}

.cycle-sheet button{
  min-height:38px;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:1000;
  cursor:pointer;
}

.cycle-sheet button.active{
  background:var(--primary-color,#2563eb);
  color:#fff;
}

.sub-info-list{
  display:grid;
  gap:7px;
  margin:10px 0;
}

.sub-info-list div{
  display:flex;
  justify-content:space-between;
  gap:10px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:15px;
  padding:9px 10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
}

.sub-info-list span{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:900;
}

.sub-info-list strong{
  color:var(--text,#0f172a);
  font-size:11px;
  font-weight:1000;
  text-align:right;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list{
  display:grid;
  gap:8px;
  margin-top:10px;
}

.ba-menu-list button{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px;
  text-align:left;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:18px;
  padding:10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color:var(--text,#0f172a);
  cursor:pointer;
}

.ba-menu-list span{
  grid-row:1 / span 2;
  width:32px;
  height:32px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,transparent);
  color:var(--primary-color,#2563eb);
  font-weight:1000;
}

.ba-menu-list b{
  font-size:13px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:800;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

@media(max-width:720px){
  .subscription-page{gap:9px}
  .ba-search-card{grid-template-columns:minmax(0,1fr) auto auto auto}
  .plans-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),max-content));gap:12px}
  .plan{max-width:365px;padding:12px;border-radius:21px}
  .plan ul{grid-template-columns:1fr}
}

@media(max-width:460px){
  .ba-search-card{gap:6px;padding:7px;border-radius:22px}
  .ba-add-inline{padding:0 10px}
  .plans-grid{grid-template-columns:1fr}
  .plan{max-width:100%}
}

@media(prefers-reduced-motion:reduce){
  .plan{transition:none!important}
  .plan:hover{transform:none!important}
}
`;
