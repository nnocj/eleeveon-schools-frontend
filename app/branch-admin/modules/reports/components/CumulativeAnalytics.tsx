"use client";

/**
 * reports/components/CumulativeAnalytics.tsx
 * ---------------------------------------------------------
 * CUMULATIVE REPORT ANALYTICS SUMMARY STRIP
 * ---------------------------------------------------------
 *
 * Gives administrators and teachers a quick historical summary
 * before printing/exporting cumulative academic records.
 */

import React from "react";

import type { CumulativeAnalyticsData } from "../engine/cumulative-report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  analytics: CumulativeAnalyticsData;
  warnings?: string[];
  primaryColor?: string;
};

// ======================================================
// HELPERS
// ======================================================

const formatNumber = (value?: number, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "0";
  return Number(value).toFixed(decimals);
};

// ======================================================
// COMPONENT
// ======================================================

export default function CumulativeAnalytics({
  analytics,
  warnings = [],
  primaryColor = "var(--primary-color)",
}: Props) {
  const cards = [
    {
      label: "Students",
      value: analytics.totalStudents,
      suffix: "",
    },
    {
      label: "Snapshots",
      value: analytics.totalSnapshots,
      suffix: "",
    },
    {
      label: "Periods",
      value: analytics.totalPeriods,
      suffix: "",
    },
    {
      label: "Subjects",
      value: analytics.totalSubjects,
      suffix: "",
    },
    {
      label: "Cumulative Average",
      value: formatNumber(analytics.cumulativeAverage, 1),
      suffix: "%",
    },
    {
      label: "Highest Average",
      value: formatNumber(analytics.highestAverage, 1),
      suffix: "%",
    },
    {
      label: "Lowest Average",
      value: formatNumber(analytics.lowestAverage, 1),
      suffix: "%",
    },
    {
      label: "Promoted",
      value: analytics.promotionCount,
      suffix: "",
    },
    {
      label: "Repeated",
      value: analytics.repeatCount,
      suffix: "",
    },
    {
      label: "Graduated",
      value: analytics.graduateCount,
      suffix: "",
    },
    {
      label: "Promotion Rate",
      value: formatNumber(analytics.promotionRate, 1),
      suffix: "%",
    },
    {
      label: "Repeat Rate",
      value: formatNumber(analytics.repeatRate, 1),
      suffix: "%",
    },
  ];

  const trendCards = [
    {
      label: "Improving",
      value: analytics.improvingCount,
      tone: "green",
    },
    {
      label: "Declining",
      value: analytics.decliningCount,
      tone: "red",
    },
    {
      label: "Stable",
      value: analytics.stableCount,
      tone: "blue",
    },
  ];

  const trendColor = (tone: string) => {
    if (tone === "green") return "#16a34a";
    if (tone === "red") return "#dc2626";
    if (tone === "blue") return "#2563eb";
    return primaryColor;
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 10px 24px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                opacity: 0.72,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              {card.label}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "baseline",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: primaryColor,
                  lineHeight: 1,
                }}
              >
                {card.value}
              </span>

              {card.suffix && (
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    opacity: 0.8,
                  }}
                >
                  {card.suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 10px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            opacity: 0.72,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            marginBottom: 12,
          }}
        >
          Historical Performance Movement
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          {trendCards.map((card) => (
            <div
              key={card.label}
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 14,
                padding: 12,
                background: "rgba(0,0,0,0.025)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.72,
                  fontWeight: 800,
                }}
              >
                {card.label}
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 25,
                  fontWeight: 900,
                  color: trendColor(card.tone),
                  lineHeight: 1,
                }}
              >
                {card.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!!warnings.length && (
        <div
          style={{
            border: "1px solid rgba(255,170,0,0.35)",
            background: "rgba(255,170,0,0.08)",
            color: "var(--text)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 6,
              color: "#8a5a00",
            }}
          >
            Cumulative report readiness notes
          </div>

          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
