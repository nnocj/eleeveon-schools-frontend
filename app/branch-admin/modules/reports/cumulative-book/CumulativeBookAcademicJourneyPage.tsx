"use client";

import React from "react";
import type { CumulativeReportBookDataset, CumulativeReportBookSettings } from "./cumulative-book-types";
import {
  bookPageStyle,
  resolveBookBranding,
  templateTone,
  sectionTitleStyle,
  periodName,
  periodDateRange,
  formatNumber,
  ordinal,
} from "./cumulative-book-utils";

type Props = {
  dataset?: CumulativeReportBookDataset | null;
  template?: any;
  settings?: CumulativeReportBookSettings | null;
  compact?: boolean;
  pageBreakAfter?: boolean;
};

export default function CumulativeBookAcademicJourneyPage({
  dataset,
  template,
  settings,
  compact = false,
  pageBreakAfter = true,
}: Props) {
  const branding = resolveBookBranding(dataset);
  const tone = templateTone(template, settings);
  const primary = branding.primaryColor || "#1d4ed8";

  const page = bookPageStyle({
    primary,
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    compact,
    pageBreakAfter,
    tone,
  });

  const periods = dataset?.periods || [];

  return (
    <section className="print-page cumulative-book-page cumulative-book-academic-journey" style={page}>
      <div style={{ borderBottom: `2px solid ${primary}`, paddingBottom: 8 }}>
        <div style={{ fontSize: compact ? 8 : 9, fontWeight: 900, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Academic Journey</div>
        <div style={{ marginTop: 2, fontSize: compact ? 18 : 21, fontWeight: 950 }}>{branding.schoolName}</div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Timeline of Published Reports</h2>

        <div style={{ display: "grid", gap: 8 }}>
          {periods.map((period, index) => {
            const report = (period.dataset as any)?.report || {};
            const average = Number(period.average ?? report.average);
            const position = Number(period.position ?? report.overallPosition);
            const gpa = Number(period.gpa ?? report.overallGPA);

            return (
              <div
                key={String(period.id || period.academicPeriodId || index)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "34px minmax(0, 1fr) repeat(3, 76px)",
                  gap: 8,
                  alignItems: "center",
                  border: "1px solid #e5e7eb",
                  borderRadius: tone === "transcript" ? 0 : 14,
                  padding: compact ? 7 : 9,
                  background: index % 2 ? "#fff" : "rgba(248,250,252,.78)",
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: tone === "transcript" ? 0 : 999, background: primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 950, fontSize: 10 }}>
                  {index + 1}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: compact ? 10 : 11.3, fontWeight: 950, color: "#111827" }}>{periodName(period)}</div>
                  <div style={{ marginTop: 2, fontSize: compact ? 7.5 : 8.3, color: "#6b7280", fontWeight: 750 }}>{periodDateRange(period) || period.academicYear || "Published report period"}</div>
                </div>

                <Metric label="Average" value={Number.isFinite(average) ? `${formatNumber(average, 1)}%` : "-"} compact={compact} />
                <Metric label="Position" value={Number.isFinite(position) ? ordinal(position) : "-"} compact={compact} />
                <Metric label="GPA" value={Number.isFinite(gpa) ? formatNumber(gpa, 2) : "-"} compact={compact} />
              </div>
            );
          })}

          {!periods.length && (
            <div style={{ border: "1px dashed #cbd5e1", padding: 18, borderRadius: 14, textAlign: "center", color: "#64748b", fontWeight: 800 }}>
              No published report snapshots are available for this cumulative book.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div style={{ textAlign: "center", borderLeft: "1px solid #e5e7eb", paddingLeft: 8 }}>
      <div style={{ fontSize: compact ? 6.8 : 7.4, color: "#6b7280", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: compact ? 9.5 : 10.5, fontWeight: 950 }}>{value}</div>
    </div>
  );
}
