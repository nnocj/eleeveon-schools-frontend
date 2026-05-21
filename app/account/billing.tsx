"use client";

/**
 * billing.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE BILLING & SUBSCRIPTION PAGE
 * ---------------------------------------------------------
 *
 * Purpose:
 * - Show account-scoped billing overview.
 * - Summarize payment records already stored in Dexie.
 * - Prepare future subscription, invoice, limits, and gateway features.
 *
 * Rules:
 * - Signed-in account required.
 * - School/branch are optional on account setup pages.
 * - Reads are scoped by accountId.
 * - Mobile-first cards.
 * - Account-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { db, Payment } from "../lib/db";

// ======================================================
// HELPERS
// ======================================================

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// ======================================================
// TYPES
// ======================================================

type BillingFeature = {
  title: string;
  description: string;
  icon: string;
  tone: "green" | "blue" | "purple" | "orange" | "gray";
};

// ======================================================
// COMPONENT
// ======================================================

export default function BillingPage() {
  const {
    accountId,
    authenticated,
    user,
    account,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeBranch,
    activeSchoolId,
    activeBranchId,
    schools,
    allBranches,
    loading: contextLoading,
  } = useActiveBranch();

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);

  // ======================================================
  // LOAD ACCOUNT-SCOPED BILLING DATA
  // ======================================================

  const clearData = () => {
    setPayments([]);
  };

  const load = async () => {
    if (!authenticated || !accountId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const rows = await db.payments.toArray();

      setPayments(
        rows
          .filter((row) => row.accountId === accountId && !row.isDeleted)
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      );
    } catch (error) {
      console.error("Failed to load billing:", error);
      clearData();
      alert("Failed to load billing records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId]);

  // ======================================================
  // ANALYTICS
  // ======================================================

  const total = useMemo(
    () => payments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [payments]
  );

  const momoTotal = useMemo(
    () => payments.filter((row) => row.method === "momo").reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [payments]
  );

  const cashTotal = useMemo(
    () => payments.filter((row) => row.method === "cash").reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [payments]
  );

  const latestPayments = useMemo(() => payments.slice(0, 6), [payments]);

  const nextFeatures = useMemo<BillingFeature[]>(() => {
    return [
      {
        title: "Subscription plans",
        description: "Create plan tiers for school count, branch count, users, storage, and sync.",
        icon: "📦",
        tone: "blue",
      },
      {
        title: "Invoice generation",
        description: "Generate official account invoices for subscription and service payments.",
        icon: "🧾",
        tone: "purple",
      },
      {
        title: "Payment gateway",
        description: "Connect MoMo, card, bank, or payment processor checkout flows.",
        icon: "💳",
        tone: "green",
      },
      {
        title: "School & branch limits",
        description: "Control how many institutions each account can operate under a plan.",
        icon: "🏫",
        tone: "orange",
      },
      {
        title: "Cloud sync entitlement",
        description: "Enable cloud backup and multi-device sync based on subscription status.",
        icon: "☁️",
        tone: "blue",
      },
      {
        title: "Billing audit trail",
        description: "Track plan changes, receipts, invoices, and admin billing actions.",
        icon: "🔐",
        tone: "gray",
      },
    ];
  }, []);

  const baseLoading = accountLoading || settingsLoading || contextLoading || loading;

  // ======================================================
  // STATES
  // ======================================================

  if (baseLoading) {
    return (
      <main className="bi-page" style={{ "--bi-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="bi-state-card">
          <div className="bi-spinner" />
          <h2>Opening billing...</h2>
          <p>Checking account context and loading account-scoped payment records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="bi-page" style={{ "--bi-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="bi-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing billing information.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="bi-page" style={{ "--bi-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="bi-hero">
        <div className="bi-hero-left">
          <div className="bi-hero-icon">💳</div>
          <div className="bi-title-wrap">
            <p>Account Billing</p>
            <h2>Billing & Subscription</h2>
            <span>Manage account subscription, invoices, payment history and plan limits.</span>
          </div>
        </div>

        <button type="button" className="bi-primary-btn" disabled>
          Upgrade Coming Soon
        </button>
      </section>

      <section className="bi-context-card">
        <div>
          <p>Current Workspace</p>
          <h3>{account?.name || "Account Workspace"}</h3>
          <span>{user?.email || user?.fullName || "Signed-in user"}</span>
        </div>

        <div className="bi-pill-row">
          <Chip tone="blue">Account Scoped</Chip>
          <Chip tone={activeSchoolId ? "green" : "orange"}>
            {activeSchool?.name || "No school selected"}
          </Chip>
          <Chip tone={activeBranchId ? "green" : "orange"}>
            {activeBranch?.name || "No branch selected"}
          </Chip>
        </div>
      </section>

      <section className="bi-summary-grid" aria-label="Billing summary">
        <SummaryCard label="Current Plan" value="Local / Trial" icon="📦" />
        <SummaryCard label="Recorded Payments" value={money(total)} icon="💰" />
        <SummaryCard label="Payment Records" value={payments.length} icon="🧾" />
        <SummaryCard label="Schools" value={schools?.length || 0} icon="🏫" />
        <SummaryCard label="Branches" value={allBranches?.length || 0} icon="🏢" />
      </section>

      <section className="bi-section-card">
        <div className="bi-section-head">
          <div>
            <p>Payment Overview</p>
            <h3>Account-scoped recorded payments</h3>
          </div>
          <Chip tone="green">{money(total)}</Chip>
        </div>

        <div className="bi-method-grid">
          <MiniStat label="Cash" value={money(cashTotal)} icon="💵" />
          <MiniStat label="MoMo" value={money(momoTotal)} icon="📱" />
          <MiniStat label="Other" value={money(Math.max(total - cashTotal - momoTotal, 0))} icon="💳" />
        </div>
      </section>

      <section className="bi-section-card">
        <div className="bi-section-head">
          <div>
            <p>Recent Records</p>
            <h3>Latest payment history</h3>
          </div>
          <Chip tone="gray">{latestPayments.length} shown</Chip>
        </div>

        <div className="bi-payment-list">
          {latestPayments.map((payment) => (
            <article key={payment.id} className="bi-payment-card">
              <div className="bi-payment-icon">{payment.method === "momo" ? "📱" : payment.method === "cash" ? "💵" : "💳"}</div>
              <div>
                <strong>{money(Number(payment.amount || 0))}</strong>
                <span>
                  {payment.method || "payment"} · {formatDate(payment.date)}
                </span>
                {(payment.receiptNumber || payment.note) && (
                  <p>
                    {payment.receiptNumber ? `Receipt: ${payment.receiptNumber}` : ""}
                    {/* {payment.referenceNumber ? ` Ref: ${payment.referenceNumber}` : ""} */}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </p>
                )}
              </div>
            </article>
          ))}

          {!latestPayments.length && (
            <section className="bi-empty-card">
              <div className="bi-empty-icon">🧾</div>
              <h3>No payment records yet</h3>
              <p>When student payments are recorded under this account, billing totals will appear here.</p>
            </section>
          )}
        </div>
      </section>

      <section className="bi-section-card">
        <div className="bi-section-head with-action">
          <div>
            <p>Next Billing Features</p>
            <h3>Subscription roadmap</h3>
          </div>

          <button type="button" disabled>
            Upgrade Coming Soon
          </button>
        </div>

        <div className="bi-feature-grid">
          {nextFeatures.map((item) => (
            <article key={item.title} className="bi-feature-card">
              <div className="bi-feature-icon">{item.icon}</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <Chip tone={item.tone}>Planned</Chip>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="bi-summary-card">
      <div className="bi-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="bi-mini-stat">
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`bi-chip ${tone}`}>{children}</span>;
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes biSpin {
  to { transform: rotate(360deg); }
}

.bi-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.bi-page *,
.bi-page *::before,
.bi-page *::after {
  box-sizing: border-box;
}

.bi-page button,
.bi-page input,
.bi-page select,
.bi-page textarea {
  font: inherit;
  max-width: 100%;
}

.bi-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.bi-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.bi-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.bi-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--bi-primary) 18%, transparent);
  border-top-color: var(--bi-primary);
  animation: biSpin .8s linear infinite;
}

.bi-primary-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--bi-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.bi-primary-btn:disabled,
.bi-section-head button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.bi-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bi-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.bi-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.bi-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--bi-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--bi-primary) 28%, transparent);
  font-size: 22px;
}

.bi-title-wrap {
  min-width: 0;
}

.bi-title-wrap p,
.bi-title-wrap h2,
.bi-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-title-wrap p,
.bi-context-card p,
.bi-section-head p {
  margin: 0;
  color: var(--bi-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.bi-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.bi-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.bi-context-card,
.bi-section-card {
  min-width: 0;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.bi-context-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.bi-context-card div:first-child {
  min-width: 0;
}

.bi-context-card h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-context-card span {
  display: block;
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-pill-row {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.bi-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.bi-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.bi-summary-icon,
.bi-payment-icon,
.bi-feature-icon,
.bi-empty-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--bi-primary) 12%, #fff);
  font-size: 20px;
}

.bi-summary-card div:last-child {
  min-width: 0;
}

.bi-summary-card strong,
.bi-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-summary-card strong {
  font-size: 20px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.bi-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.bi-section-head {
  min-width: 0;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.bi-section-head h3 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.bi-section-head button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: var(--bi-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.bi-method-grid,
.bi-feature-grid,
.bi-payment-list {
  display: grid;
  gap: 8px;
}

.bi-mini-stat,
.bi-payment-card,
.bi-feature-card,
.bi-empty-card {
  min-width: 0;
  padding: 11px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .08);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}

.bi-mini-stat {
  display: grid;
  gap: 3px;
}

.bi-mini-stat div {
  font-size: 21px;
}

.bi-mini-stat strong,
.bi-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-mini-stat strong {
  font-size: 18px;
  font-weight: 1000;
}

.bi-mini-stat span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.bi-payment-card,
.bi-feature-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.bi-payment-card div:last-child,
.bi-feature-card div:last-child {
  min-width: 0;
}

.bi-payment-card strong,
.bi-payment-card span,
.bi-feature-card h4,
.bi-feature-card p {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bi-payment-card strong,
.bi-feature-card h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
}

.bi-payment-card span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.bi-payment-card p,
.bi-feature-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 720;
  overflow-wrap: anywhere;
}

.bi-empty-card {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
  border-style: dashed;
}

.bi-empty-card h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
}

.bi-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.55;
}

.bi-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bi-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.bi-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.bi-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.bi-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.bi-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.bi-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

@media (min-width: 680px) {
  .bi-page {
    padding: 12px;
  }

  .bi-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bi-method-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .bi-feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .bi-page {
    padding: 16px;
  }

  .bi-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .bi-feature-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .bi-page {
    padding: 6px;
  }

  .bi-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .bi-primary-btn {
    width: 100%;
  }

  .bi-context-card {
    align-items: stretch;
  }

  .bi-summary-grid {
    gap: 6px;
  }

  .bi-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .bi-payment-card,
  .bi-feature-card {
    flex-direction: column;
  }
}
`;
