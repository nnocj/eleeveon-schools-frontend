"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db, Payment } from "../lib/db";
import { useSettings } from "../context/settings-context";

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function BillingPage() {
  const { settings } = useSettings();
  const primary = settings?.primaryColor || "var(--primary-color)";

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await db.payments.toArray();
        setPayments(rows.filter((row) => !row.isDeleted));
      } catch (error) {
        console.error("Failed to load billing:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const total = useMemo(
    () => payments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [payments]
  );

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  if (loading) return <div style={card}>Loading billing...</div>;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>
          Billing & Subscription
        </h2>
        <p style={{ marginTop: 6, opacity: 0.68, fontWeight: 650 }}>
          Manage account subscription, invoices, payment history and plan limits.
        </p>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 14,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.68, fontSize: 12, fontWeight: 850 }}>
            Current Plan
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>
            Local / Trial
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.68, fontSize: 12, fontWeight: 850 }}>
            Recorded Payments
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>
            {money(total)}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.68, fontSize: 12, fontWeight: 850 }}>
            Payment Records
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 950 }}>
            {payments.length}
          </div>
        </div>
      </section>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>
          Next Billing Features
        </h3>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
          }}
        >
          {[
            "Subscription plans",
            "Invoice generation",
            "Payment gateway integration",
            "School and branch limits",
            "Cloud sync entitlement",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(0,0,0,0.025)",
                fontWeight: 850,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        <button
          type="button"
          style={{
            marginTop: 16,
            border: "none",
            borderRadius: 14,
            padding: "12px 16px",
            background: primary,
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Upgrade Coming Soon
        </button>
      </div>
    </div>
  );
}