"use client";

/**
 * app/components/payments/PaymentCheckout.tsx
 * ---------------------------------------------------------
 * ELEEVEON PAYMENT CHECKOUT V2
 * ---------------------------------------------------------
 * Generic Golden compact checkout.
 *
 * What changed:
 * - Still supports the old subscription props:
 *   planId + billingCycle -> POST /billing/subscribe
 * - Now also supports student fee payment:
 *   purpose="student_fee" + invoiceId/studentId/schoolId/branchId
 *   -> POST /finance/student-fees/payments/initiate
 * - Keeps the same Paystack redirect behavior.
 * - Keeps compact modal design and theme-safe styling.
 *
 * Important:
 * - Subscription checkout remains backward-compatible with OwnerSubscriptionPage.
 * - StudentPayments should use this instead of custom payment modal logic.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  MomoNetwork,
  PaymentChannel,
  PaymentCheckoutResult,
  PaymentCheckoutValue,
} from "./payment-types";

import {
  authHeaders,
  defaultMomoNetwork,
  getApiBase,
  money,
  paymentMethodLabel,
  providerForMethod,
  readJson,
  getPaymentRedirectUrl,
} from "./payment-utils";

export type PaymentCheckoutPurpose = "subscription" | "student_fee";

type CommonProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  amount: number;
  currency?: string;
  purpose?: PaymentCheckoutPurpose;
  callbackUrl?: string;
  payerNameDefault?: string;
  payerPhoneDefault?: string;
  payerEmailDefault?: string;
  metadata?: Record<string, any>;
  onSuccess?: (result: PaymentCheckoutResult) => void;
  onError?: (error: string) => void;
};

type SubscriptionProps = CommonProps & {
  purpose?: "subscription";
  planId: string;
  billingCycle?: "monthly" | "yearly";
  invoiceId?: never;
  studentId?: never;
  schoolId?: never;
  branchId?: never;
};

type StudentFeeProps = CommonProps & {
  purpose: "student_fee";
  invoiceId: string;
  studentId: string;
  schoolId: string;
  branchId: string;
  planId?: never;
  billingCycle?: never;
};

type Props = SubscriptionProps | StudentFeeProps;

const methods: PaymentChannel[] = ["momo", "card", "bank", "cash", "manual"];

function methodNote(item: PaymentChannel) {
  if (item === "momo") return "Mobile wallet";
  if (item === "card") return "Debit or credit card";
  if (item === "bank") return "Bank payment";
  if (item === "cash") return "Offline cash";
  return "Manual approval";
}

function methodIcon(item: PaymentChannel) {
  if (item === "momo") return "Mo";
  if (item === "card") return "Ca";
  if (item === "bank") return "Ba";
  if (item === "cash") return "Cs";
  return "Mn";
}

function purposeLabel(purpose: PaymentCheckoutPurpose) {
  if (purpose === "student_fee") return "student fee";
  return "subscription";
}

function purposeTitle(purpose: PaymentCheckoutPurpose) {
  if (purpose === "student_fee") return "Pay School Fee";
  return "Complete Subscription";
}

function purposeDescription(purpose: PaymentCheckoutPurpose) {
  if (purpose === "student_fee") return "Choose a payment option and pay this invoice securely.";
  return "Choose a payment option and confirm your subscription securely.";
}

export default function PaymentCheckout(props: Props) {
  const {
    open,
    onClose,
    title,
    description,
    amount,
    currency = "GHS",
    onSuccess,
    onError,
  } = props;

  const purpose = props.purpose || "subscription";
  const billingCycle = purpose === "subscription" ? props.billingCycle || "monthly" : undefined;

  const apiBase = getApiBase();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<PaymentChannel>("momo");
  const [momoNetwork, setMomoNetwork] = useState<MomoNetwork>(defaultMomoNetwork());
  const [payerName, setPayerName] = useState(props.payerNameDefault || "");
  const [payerPhone, setPayerPhone] = useState(props.payerPhoneDefault || "");
  const [payerEmail, setPayerEmail] = useState(props.payerEmailDefault || "");

  const provider = useMemo(() => providerForMethod(method), [method]);

  useEffect(() => {
    if (!open) return;

    setPayerName(props.payerNameDefault || "");
    setPayerPhone(props.payerPhoneDefault || "");
    setPayerEmail(props.payerEmailDefault || "");
  }, [open, props.payerNameDefault, props.payerPhoneDefault, props.payerEmailDefault]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      modalRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    try {
      setLoading(true);

      const payload: PaymentCheckoutValue = {
        method,
        provider,
        momoNetwork,
        payerName,
        payerPhone,
        payerEmail,
      };

      let res: Response;

      if (purpose === "student_fee") {
        const callbackUrl =
          props.callbackUrl ||
          `${window.location.origin}${window.location.pathname}?invoiceId=${encodeURIComponent(String(props.invoiceId))}`;

        res = await fetch(`${apiBase}/finance/student-fees/payments/initiate`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            schoolId: props.schoolId,
            branchId: props.branchId,
            studentId: props.studentId,
            invoiceId: props.invoiceId,
            amount,
            channel: payload.method === "momo" ? "momo" : "card",
            method: payload.method,
            provider: payload.provider,
            momoNetwork: payload.momoNetwork,
            payerName: payload.payerName,
            payerPhone: payload.payerPhone,
            payerEmail: payload.payerEmail,
            callbackUrl,
            currencyCode: currency,
            currencySymbol: currency === "GHS" ? "GH₵" : currency,
            currencyName: currency === "GHS" ? "Ghanaian Cedi" : currency,
            metadata: props.metadata || {},
          }),
        });
      } else {
        res = await fetch(`${apiBase}/billing/subscribe`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            planId: props.planId,
            billingCycle: props.billingCycle || "monthly",
            paymentMethod: payload.method,
            provider: payload.provider,
            momoNetwork: payload.momoNetwork,
            payerName: payload.payerName,
            payerPhone: payload.payerPhone,
            payerEmail: payload.payerEmail,
          }),
        });
      }

      const json: PaymentCheckoutResult = await readJson(res);
      const redirectUrl = getPaymentRedirectUrl(json);

      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }

      onSuccess?.(json);
      onClose();
    } catch (error: any) {
      onError?.(error?.message || "Payment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="payment-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        ref={modalRef}
        className="payment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-checkout-title"
        aria-describedby="payment-checkout-description"
        tabIndex={-1}
      >
        <div className="payment-shell">
          <header className="payment-header">
            <div className="payment-title-row">
              <span className="checkout-dot">💳</span>

              <div className="header-copy">
                <p className="eyebrow">Secure checkout</p>
                <h2 id="payment-checkout-title">{title || purposeTitle(purpose)}</h2>
                <p id="payment-checkout-description" className="desc">
                  {description || purposeDescription(purpose)}
                </p>
              </div>
            </div>

            <button type="button" className="close-btn" onClick={onClose} disabled={loading} aria-label="Close payment checkout">
              ×
            </button>
          </header>

          <main className="payment-body">
            <section className="amount-row" aria-label="Payment amount">
              <span>
                <strong>{money(amount, currency)}</strong>
                <small>{billingCycle ? `${billingCycle} subscription` : purposeLabel(purpose)}</small>
              </span>

              <b>{provider === "paystack" ? "Paystack" : "Manual"}</b>
            </section>

            <section className="compact-section" aria-label="Payment method">
              <div className="section-line">
                <h3>Payment method</h3>
                <p>{paymentMethodLabel(method)} selected</p>
              </div>

              <div className="method-list" role="radiogroup">
                {methods.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={method === item}
                    onClick={() => setMethod(item)}
                    className={method === item ? "method active" : "method"}
                  >
                    <span className="method-icon" aria-hidden="true">{methodIcon(item)}</span>

                    <span className="method-main">
                      <strong>{paymentMethodLabel(item)}</strong>
                      <small>{methodNote(item)}</small>
                    </span>

                    <span className="method-side">
                      <i className={method === item ? "selected" : ""} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="compact-section" aria-label="Payer details">
              <div className="section-line">
                <h3>Payer details</h3>
                <p>Optional contact details for the payer.</p>
              </div>

              <div className="form-list">
                {method === "momo" ? (
                  <label className="field-row" htmlFor="momoNetwork">
                    <span>Network</span>
                    <select id="momoNetwork" value={momoNetwork} onChange={(event) => setMomoNetwork(event.target.value as MomoNetwork)}>
                      <option value="mtn">MTN Mobile Money</option>
                      <option value="telecel">Telecel Cash</option>
                      <option value="airteltigo">AirtelTigo Money</option>
                    </select>
                  </label>
                ) : null}

                <label className="field-row" htmlFor="payerName">
                  <span>Name</span>
                  <input id="payerName" value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Payer name" autoComplete="name" />
                </label>

                <label className="field-row" htmlFor="payerPhone">
                  <span>Phone</span>
                  <input id="payerPhone" value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="024xxxxxxx" inputMode="tel" autoComplete="tel" />
                </label>

                <label className="field-row" htmlFor="payerEmail">
                  <span>Email</span>
                  <input id="payerEmail" type="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} placeholder="example@email.com" autoComplete="email" />
                </label>
              </div>
            </section>

            <section className="payment-note">
              <span className="status-dot" />
              <p>
                {provider === "paystack"
                  ? "You will be redirected securely to Paystack to complete this payment."
                  : "This payment will be created and remain pending until it is manually confirmed."}
              </p>
            </section>
          </main>

          <footer className="actions">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>

            <button type="button" className="pay-btn" disabled={loading} onClick={handleSubmit}>
              {loading ? "Processing..." : provider === "paystack" ? "Continue to Paystack" : "Create Payment"}
            </button>
          </footer>
        </div>
      </section>

      <style jsx>{`
        .payment-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          align-items: end;
          justify-items: center;
          min-height: 100dvh;
          padding: 10px;
          overflow-y: auto;
          background: rgba(2, 6, 23, 0.58);
          backdrop-filter: blur(12px);
          -webkit-overflow-scrolling: touch;
        }

        .payment-modal {
          width: min(100%, 560px);
          margin: 0;
          outline: none;
        }

        .payment-shell {
          width: 100%;
          max-height: min(92dvh, 760px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--border, rgba(226, 232, 240, 0.9));
          border-radius: 28px 28px 20px 20px;
          background: var(--card-bg, var(--surface, #ffffff));
          color: var(--text, #0f172a);
          box-shadow: 0 30px 90px rgba(2, 6, 23, 0.28);
        }

        .payment-header {
          flex: 0 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 13px;
          border-bottom: 1px solid var(--border, rgba(226, 232, 240, 0.9));
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent), transparent 46%),
            var(--card-bg, var(--surface, #ffffff));
        }

        .payment-title-row {
          min-width: 0;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 9px;
        }

        .checkout-dot {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 15px;
          background: linear-gradient(135deg, var(--primary-color, #2563eb), rgba(15, 23, 42, 0.92));
          color: #fff;
          font-size: 15px;
          box-shadow: 0 10px 22px color-mix(in srgb, var(--primary-color, #2563eb) 22%, transparent);
        }

        .header-copy {
          min-width: 0;
        }

        .eyebrow,
        h2,
        .desc {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .eyebrow {
          margin: 0 0 2px;
          font-size: 9px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--primary-color, #2563eb);
        }

        h2 {
          margin: 0;
          color: var(--text, #0f172a);
          font-size: 17px;
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -0.045em;
        }

        .desc {
          max-width: 100%;
          margin: 3px 0 0;
          color: var(--muted, #64748b);
          font-size: 11px;
          font-weight: 750;
          line-height: 1.35;
        }

        .close-btn {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid var(--border, rgba(226, 232, 240, 0.9));
          border-radius: 999px;
          background: var(--card-bg, var(--surface, #ffffff));
          color: var(--text, #0f172a);
          cursor: pointer;
          font-size: 24px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        }

        .close-btn:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .payment-body {
          flex: 1 1 auto;
          overflow-y: auto;
          display: grid;
          gap: 8px;
          padding: 10px;
          background: var(--bg, #f8fafc);
          -webkit-overflow-scrolling: touch;
        }

        .amount-row,
        .compact-section,
        .payment-note {
          border: 1px solid var(--border, rgba(226, 232, 240, 0.95));
          background: var(--card-bg, var(--surface, #ffffff));
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        .amount-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 11px;
          border-radius: 20px;
        }

        .amount-row span {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .amount-row strong,
        .amount-row small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .amount-row strong {
          color: var(--text, #0f172a);
          font-size: 22px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.055em;
        }

        .amount-row small {
          color: var(--muted, #64748b);
          font-size: 10.5px;
          font-weight: 850;
          text-transform: capitalize;
        }

        .amount-row b {
          flex: 0 0 auto;
          min-height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0 9px;
          background: color-mix(in srgb, var(--primary-color, #2563eb) 11%, transparent);
          color: var(--primary-color, #2563eb);
          font-size: 10px;
          font-weight: 1000;
        }

        .compact-section {
          display: grid;
          gap: 8px;
          padding: 10px;
          border-radius: 20px;
        }

        .section-line {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }

        .section-line h3 {
          margin: 0;
          color: var(--text, #0f172a);
          font-size: 12px;
          font-weight: 1000;
          letter-spacing: -0.01em;
        }

        .section-line p {
          margin: 0;
          color: var(--muted, #64748b);
          font-size: 10px;
          font-weight: 850;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .method-list,
        .form-list {
          display: grid;
          gap: 6px;
        }

        .method {
          min-height: 50px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          padding: 7px;
          border: 1px solid var(--border, rgba(203, 213, 225, 0.8));
          border-radius: 16px;
          background: color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 94%, var(--primary-color, #2563eb) 6%);
          color: var(--text, #0f172a);
          cursor: pointer;
          text-align: left;
        }

        .method.active {
          border-color: var(--primary-color, #2563eb);
          background: color-mix(in srgb, var(--card-bg, var(--surface, #ffffff)) 86%, var(--primary-color, #2563eb) 14%);
          box-shadow: 0 10px 22px color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent);
        }

        .method-icon {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: var(--primary-color, #2563eb);
          color: #ffffff;
          font-size: 10px;
          font-weight: 1000;
        }

        .method-main {
          min-width: 0;
          display: grid;
          gap: 1px;
        }

        .method strong,
        .method small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .method strong {
          color: var(--text, #0f172a);
          font-size: 12px;
          font-weight: 1000;
          line-height: 1.15;
        }

        .method small {
          color: color-mix(in srgb, var(--text, #0f172a) 66%, var(--muted, #64748b) 34%);
          font-size: 10px;
          line-height: 1.2;
          font-weight: 800;
        }

        .method-side i {
          width: 9px;
          height: 9px;
          display: block;
          border-radius: 999px;
          background: color-mix(in srgb, var(--text, #0f172a) 45%, var(--muted, #64748b) 55%);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--text, #0f172a) 12%, transparent);
        }

        .method-side i.selected {
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
        }

        :global(html[data-theme="dark"]) .method,
        :global(html.dark) .method {
          background: color-mix(in srgb, var(--card-bg, var(--surface, #111827)) 88%, var(--primary-color, #2563eb) 12%);
          border-color: var(--border, rgba(255, 255, 255, 0.16));
          color: var(--text, #ffffff);
        }

        :global(html[data-theme="dark"]) .method.active,
        :global(html.dark) .method.active {
          background: color-mix(in srgb, var(--card-bg, var(--surface, #111827)) 76%, var(--primary-color, #2563eb) 24%);
          border-color: var(--primary-color, #2563eb);
        }

        :global(html[data-theme="dark"]) .method strong,
        :global(html.dark) .method strong {
          color: var(--text, #ffffff);
        }

        :global(html[data-theme="dark"]) .method small,
        :global(html.dark) .method small {
          color: color-mix(in srgb, var(--text, #ffffff) 78%, var(--muted, rgba(255,255,255,0.72)) 22%);
        }

        :global(html[data-theme="dark"]) .payment-note,
        :global(html.dark) .payment-note {
          background: color-mix(
            in srgb,
            var(--card-bg, var(--surface, #111827)) 84%,
            var(--primary-color, #2563eb) 16%
          );
          border-color: var(--border, rgba(255, 255, 255, 0.16));
          color: var(--text, #ffffff);
        }

        :global(html[data-theme="dark"]) .payment-note p,
        :global(html.dark) .payment-note p {
          color: color-mix(in srgb, var(--text, #ffffff) 82%, var(--muted, rgba(255,255,255,0.72)) 18%);
        }

        :global(html[data-theme="dark"]) .cancel-btn,
        :global(html.dark) .cancel-btn {
          background: var(--card-bg, var(--surface, #111827));
          border-color: var(--border, rgba(255, 255, 255, 0.16));
          color: var(--text, #ffffff);
        }

        :global(html[data-theme="dark"]) .cancel-btn:hover:not(:disabled),
        :global(html.dark) .cancel-btn:hover:not(:disabled) {
          background: color-mix(
            in srgb,
            var(--card-bg, var(--surface, #111827)) 82%,
            var(--primary-color, #2563eb) 18%
          );
        }

        .field-row {
          display: grid;
          grid-template-columns: 82px minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 6px;
          border: 1px solid var(--border, rgba(203, 213, 225, 0.8));
          border-radius: 16px;
          background: color-mix(in srgb, var(--muted, #64748b) 4%, transparent);
        }

        .field-row span {
          color: var(--muted, #64748b);
          font-size: 10px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding-left: 4px;
        }

        input,
        select {
          width: 100%;
          height: 34px;
          border: 0;
          border-radius: 12px;
          background: var(--input-bg, var(--surface, #ffffff));
          color: var(--input-text, var(--text, #0f172a));
          padding: 0 10px;
          font-size: 12px;
          font-weight: 800;
          outline: none;
        }

        input::placeholder {
          color: color-mix(in srgb, var(--muted, #64748b) 70%, transparent);
        }

        input:focus,
        select:focus,
        .method:focus-visible,
        .close-btn:focus-visible,
        .cancel-btn:focus-visible,
        .pay-btn:focus-visible {
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color, #2563eb) 14%, transparent);
        }

        .payment-note {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          padding: 9px 10px;
          border: 1px solid var(--border, rgba(226, 232, 240, 0.95));
          border-radius: 17px;
          background: color-mix(
            in srgb,
            var(--card-bg, var(--surface, #ffffff)) 88%,
            var(--primary-color, #2563eb) 12%
          );
          color: var(--text, #0f172a);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
        }

        .payment-note p {
          margin: 0;
          color: color-mix(in srgb, var(--text, #0f172a) 78%, var(--muted, #64748b) 22%);
          font-size: 10.5px;
          line-height: 1.35;
          font-weight: 800;
        }

        .actions {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
          gap: 8px;
          padding: 10px;
          border-top: 1px solid var(--border, rgba(226, 232, 240, 0.95));
          background: var(--card-bg, var(--surface, #ffffff));
        }

        .cancel-btn,
        .pay-btn {
          min-height: 42px;
          padding: 0 12px;
          border: 0;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 1000;
        }

        .cancel-btn {
          border: 1px solid var(--border, rgba(226, 232, 240, 0.95));
          background: var(--card-bg, var(--surface, #ffffff));
          color: var(--text, #0f172a);
        }

        .cancel-btn:hover:not(:disabled) {
          background: color-mix(
            in srgb,
            var(--primary-color, #2563eb) 8%,
            var(--card-bg, var(--surface, #ffffff))
          );
        }

        .pay-btn {
          color: #ffffff;
          background: linear-gradient(135deg, var(--primary-color, #2563eb), #1d4ed8);
          box-shadow: 0 12px 26px color-mix(in srgb, var(--primary-color, #2563eb) 24%, transparent);
        }

        .cancel-btn:disabled,
        .pay-btn:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        @media (min-width: 640px) {
          .payment-backdrop {
            align-items: center;
          }

          .method-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .method:first-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 420px) {
          .payment-backdrop {
            padding: 0;
          }

          .payment-modal {
            width: 100%;
          }

          .payment-shell {
            max-height: 94dvh;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 26px 26px 0 0;
          }

          .payment-header {
            padding: 12px;
          }

          .payment-body {
            padding: 8px;
          }

          .field-row {
            grid-template-columns: 74px minmax(0, 1fr);
          }

          .amount-row strong {
            font-size: 20px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
