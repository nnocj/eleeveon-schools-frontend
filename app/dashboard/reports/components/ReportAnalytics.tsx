"use client";

/**
 * reports/components/ReportAnalytics.tsx
 * ---------------------------------------------------------
 * REPORT ANALYTICS SUMMARY STRIP
 * ---------------------------------------------------------
 *
 * Purpose:
 * Gives administrators and teachers a quick view of the
 * selected report session before printing/exporting.
 */

import React from "react";
import type { ReportAnalyticsData } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  analytics: ReportAnalyticsData;
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

export default function ReportAnalytics({
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
      label: "Subjects",
      value: analytics.totalSubjects,
      suffix: "",
    },
    {
      label: "Assessment Entries",
      value: analytics.totalAssessmentItems,
      suffix: "",
    },
    {
      label: "Class Average",
      value: formatNumber(analytics.classAverage, 1),
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
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map(card => (
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
            Report readiness notes
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
