"use client";

/**
 * reports/components/PromotionSummary.tsx
 * ---------------------------------------------------------
 * PROMOTION / REPEAT / GRADUATION SUMMARY
 * ---------------------------------------------------------
 *
 * Renders historical promotion intelligence from StudentPromotion
 * records linked to StudentReportSnapshot records.
 *
 * Mobile enhancement:
 * - Original landscape print layout preserved.
 * - Mobile preview shell added.
 * - Compact expandable preview.
 * - Summary labels stay inside cards on small screens.
 * - Dashboard overflow protection.
 * - Safe isolated horizontal scrolling.
 */

import React, { useState } from "react";

import ReportHeader from "./ReportHeader";

import type { PromotionSummary as PromotionSummaryData } from "../engine/cumulative-report-types";
import type { ReportHeaderData } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  summary?: PromotionSummaryData;
  header: ReportHeaderData;
  compact?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;
};

// ======================================================
// HELPERS
// ======================================================

const formatNumber = (value?: number, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "0";
  return Number(value).toFixed(decimals);
};

const decisionLabel = (value?: string) => {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const decisionTone = (value?: string) => {
  if (value === "promote") return "#16a34a";
  if (value === "repeat") return "#dc2626";
  if (value === "graduate") return "#2563eb";
  return "#111";
};

// ======================================================
// COMPONENT
// ======================================================

export default function PromotionSummary({
  summary,
  header,
  compact = false,
  pageBreakAfter = true,
  mobilePreview = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const branding = header.branding;
  const primary = branding.primaryColor || "var(--primary-color)";

  const page: React.CSSProperties = {
    width: "297mm",
    minHeight: "210mm",
    margin: "0 auto 20px",
    padding: compact ? "8mm" : "10mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
    pageBreakAfter: pageBreakAfter ? "always" : "auto",
    overflow: "hidden",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: compact ? 8.5 : 9.5,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 5,
    verticalAlign: "middle",
    lineHeight: 1.2,
  };

  const emptyState = (
    <section style={page}>
      <ReportHeader
        header={header}
        title="Promotion Summary"
        orientation="landscape"
        compact={compact}
      />

      <div className="ps-empty-box">
        Select a class, period, academic year or decision filter to generate
        promotion intelligence.
      </div>
    </section>
  );

  if (!summary) {
    return (
      <div className="ps-shell">
        <style>{css}</style>
        {emptyState}
      </div>
    );
  }

  const reportPage = (
    <section
      className="print-page report-page-break promotion-summary-page ps-a4-page"
      style={page}
    >
      <ReportHeader
        header={header}
        title="Promotion Summary"
        subtitle={`${summary.totalStudents} Students • ${summary.promoteCount} Promoted • ${summary.repeatCount} Repeated • ${summary.graduateCount} Graduated`}
        orientation="landscape"
        compact={compact}
      />

      {/* SUMMARY STRIP */}

      <div className="ps-summary-strip">
        <div className="ps-summary-cell">
          <strong>Students:</strong> {summary.totalStudents}
        </div>

        <div className="ps-summary-cell">
          <strong>Promoted:</strong> {summary.promoteCount}
        </div>

        <div className="ps-summary-cell">
          <strong>Repeated:</strong> {summary.repeatCount}
        </div>

        <div className="ps-summary-cell">
          <strong>Graduated:</strong> {summary.graduateCount}
        </div>

        <div className="ps-summary-cell">
          <strong>Promotion Rate:</strong>{" "}
          {formatNumber(summary.promotionRate, 1)}%
        </div>

        <div className="ps-summary-cell">
          <strong>Repeat Rate:</strong> {formatNumber(summary.repeatRate, 1)}%
        </div>

        <div className="ps-summary-cell">
          <strong>Average:</strong> {formatNumber(summary.averageScore, 1)}%
        </div>
      </div>

      {/* DECISION CARDS */}

      <div className="ps-decision-grid">
        <div className="ps-decision-card">
          <div className="ps-card-label">Promotion Rate</div>
          <div className="ps-card-value green">
            {formatNumber(summary.promotionRate, 1)}%
          </div>
        </div>

        <div className="ps-decision-card">
          <div className="ps-card-label">Repeat Rate</div>
          <div className="ps-card-value red">
            {formatNumber(summary.repeatRate, 1)}%
          </div>
        </div>

        <div className="ps-decision-card">
          <div className="ps-card-label">Graduation Rate</div>
          <div className="ps-card-value blue">
            {formatNumber(summary.graduationRate, 1)}%
          </div>
        </div>
      </div>

      {/* TABLE */}

      <div className="ps-table-wrap">
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>#</th>

              <th
                style={{
                  ...th,
                  textAlign: "left",
                  minWidth: 190,
                }}
              >
                Student Name
              </th>

              <th style={th}>Admission No.</th>
              <th style={th}>From Class</th>
              <th style={th}>To Class</th>
              <th style={th}>Average</th>
              <th style={th}>Recommendation</th>
              <th style={th}>Final Decision</th>
              <th style={{ ...th, minWidth: 190 }}>Note</th>
            </tr>
          </thead>

          <tbody>
            {summary.rows.map((row, index) => (
              <tr key={`${row.studentId}-${index}`}>
                <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>

                <td style={{ ...td, fontWeight: 800 }}>{row.studentName}</td>

                <td style={{ ...td, textAlign: "center" }}>
                  {row.admissionNumber || "-"}
                </td>

                <td style={{ ...td, textAlign: "center" }}>
                  {row.fromClassName || "-"}
                </td>

                <td style={{ ...td, textAlign: "center" }}>
                  {row.toClassName || "-"}
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                  {row.average != null
                    ? `${formatNumber(row.average, 1)}%`
                    : "-"}
                </td>

                <td style={{ ...td, textAlign: "center" }}>
                  {decisionLabel(row.recommendation)}
                </td>

                <td
                  style={{
                    ...td,
                    textAlign: "center",
                    fontWeight: 900,
                    color: decisionTone(row.finalDecision),
                  }}
                >
                  {decisionLabel(row.finalDecision)}
                </td>

                <td style={td}>{row.note || ""}</td>
              </tr>
            ))}

            {!summary.rows.length && (
              <tr>
                <td
                  style={{
                    ...td,
                    textAlign: "center",
                    padding: 16,
                  }}
                  colSpan={9}
                >
                  No promotion records found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}

      <div className="ps-footer" style={{ borderTopColor: primary }}>
        <span>
          Official promotion summary generated for {branding.schoolName}
        </span>
        <span>Powered by Eleeveon School Management System</span>
      </div>
    </section>
  );

  if (!mobilePreview) {
    return (
      <div className="ps-shell">
        <style>{css}</style>
        {reportPage}
      </div>
    );
  }

  return (
    <div className={`ps-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="ps-toolbar report-no-print">
        <div>
          <strong>Promotion Summary</strong>
          <span>
            {summary.totalStudents} students · {summary.promoteCount} promoted ·{" "}
            {summary.repeatCount} repeated
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="ps-preview-scroll report-screen-scroll">
        <div className="ps-preview-scale">{reportPage}</div>
      </div>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.ps-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.ps-toolbar {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 18px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.22);
  box-shadow: 0 10px 24px rgba(15,23,42,.06);
}

.ps-toolbar div {
  min-width: 0;
}

.ps-toolbar strong,
.ps-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ps-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.ps-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.ps-toolbar button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ps-preview-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  padding: 8px;
  border-radius: 22px;
  background: rgba(148,163,184,.08);
  border: 1px solid rgba(148,163,184,.18);
}

.ps-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

.ps-empty-box {
  padding: 20px;
  border: 1px dashed #bbb;
  border-radius: 12px;
  text-align: center;
  font-weight: 700;
}

.ps-summary-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
  font-size: 8.4px;
}

.ps-summary-cell {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #ccc;
  padding: 5px;
  line-height: 1.18;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ps-summary-cell strong {
  font-weight: 900;
}

.ps-decision-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.ps-decision-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #222;
  padding: 7px;
  text-align: center;
}

.ps-card-label {
  display: block;
  max-width: 100%;
  font-size: 8px;
  line-height: 1.15;
  opacity: 0.75;
  font-weight: 900;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ps-card-value {
  margin-top: 3px;
  font-size: 17px;
  line-height: 1;
  font-weight: 900;
}

.ps-card-value.green { color: #16a34a; }
.ps-card-value.red { color: #dc2626; }
.ps-card-value.blue { color: #2563eb; }

.ps-table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
}

.ps-footer {
  margin-top: 10px;
  border-top: 2px solid;
  padding-top: 5px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 8.5px;
  color: #555;
}

@media screen and (max-width: 720px) {
  .ps-toolbar {
    display: flex;
  }

  .ps-shell:not(.expanded) .ps-preview-scroll {
    overflow: hidden;
    max-height: 78vh;
  }

  .ps-shell:not(.expanded) .ps-preview-scale {
    width: 297mm;
    transform: scale(calc((100vw - 28px) / 1122.5197));
    transform-origin: top left;
  }

  .ps-shell:not(.expanded) .ps-preview-scroll::after {
    content: "";
    display: block;
    height: calc(793.7008px * ((100vw - 28px) / 1122.5197));
  }

  .ps-shell.expanded .ps-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .ps-shell.expanded .ps-preview-scale {
    transform: none;
  }

  .ps-summary-strip {
    gap: 4px;
    font-size: 6.4px;
  }

  .ps-summary-cell {
    padding: 4px;
  }

  .ps-decision-grid {
    gap: 4px;
  }

  .ps-decision-card {
    padding: 5px;
  }

  .ps-card-label {
    font-size: 6.8px;
    letter-spacing: -0.15px;
  }

  .ps-card-value {
    font-size: 13px;
  }
}

@media print {
  .ps-shell,
  .ps-preview-scroll,
  .ps-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .ps-toolbar {
    display: none !important;
  }
}
`;
