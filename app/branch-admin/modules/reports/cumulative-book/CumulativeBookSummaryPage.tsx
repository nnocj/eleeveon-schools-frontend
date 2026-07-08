"use client";

import React from "react";
import type { CumulativeReportBookDataset, CumulativeReportBookSettings } from "./cumulative-book-types";
import {
  bookPageStyle,
  resolveBookBranding,
  computeBookSummary,
  templateTone,
  sectionTitleStyle,
  formatNumber,
  ordinal,
  trendText,
  decisionText,
} from "./cumulative-book-utils";

type Props = {
  dataset?: CumulativeReportBookDataset | null;
  template?: any;
  settings?: CumulativeReportBookSettings | null;
  compact?: boolean;
  pageBreakAfter?: boolean;
};

export default function CumulativeBookSummaryPage({
  dataset,
  template,
  settings,
  compact = false,
  pageBreakAfter = true,
}: Props) {
  const branding = resolveBookBranding(dataset);
  const tone = templateTone(template, settings);
  const primary = branding.primaryColor || "#1d4ed8";
  const summary = computeBookSummary(dataset);

  const page = bookPageStyle({
    primary,
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    compact,
    pageBreakAfter,
    tone,
  });

  const cards = [
    ["Report Periods", String(summary.totalPeriods || 0)],
    ["First Average", summary.firstAverage == null ? "-" : `${formatNumber(summary.firstAverage, 1)}%`],
    ["Latest Average", summary.latestAverage == null ? "-" : `${formatNumber(summary.latestAverage, 1)}%`],
    ["Best Average", summary.bestAverage == null ? "-" : `${formatNumber(summary.bestAverage, 1)}%`],
    ["Cumulative Average", summary.cumulativeAverage == null ? "-" : `${formatNumber(summary.cumulativeAverage, 1)}%`],
    ["Cumulative GPA", summary.cumulativeGPA == null ? "-" : formatNumber(summary.cumulativeGPA, 2)],
    ["Best Position", summary.bestPosition == null ? "-" : ordinal(summary.bestPosition)],
    ["Latest Position", summary.latestPosition == null ? "-" : ordinal(summary.latestPosition)],
    ["Trend", trendText(summary.trend)],
    ["Recommendation", decisionText(summary.finalRecommendation)],
  ];

  return (
    <section className="print-page cumulative-book-page cumulative-book-summary" style={page}>
      <div style={{ borderBottom: `2px solid ${primary}`, paddingBottom: 8 }}>
        <div style={{ fontSize: compact ? 8 : 9, fontWeight: 900, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Academic Summary</div>
        <div style={{ marginTop: 2, fontSize: compact ? 18 : 21, fontWeight: 950 }}>{branding.schoolName}</div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Cumulative Performance Snapshot</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
          {cards.map(([label, value]) => (
            <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: tone === "transcript" ? 0 : 14, padding: compact ? 8 : 10, background: "#fff", minHeight: 54 }}>
              <div style={{ fontSize: compact ? 6.8 : 7.4, fontWeight: 900, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.25 }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: compact ? 10.5 : 12, fontWeight: 950, color: "#111827", overflowWrap: "anywhere" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Academic Reading Guide</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Info title="How to read this book" text="Each report-card page after this section represents one published academic period. The page uses the same selected student report template, so the book remains visually consistent from period to period." />
          <Info title="How cumulative values are estimated" text="The summary values are derived from the available published report snapshots. If a period has no published snapshot, it is not included in this booklet." />
        </div>
      </div>

      {Array.isArray(dataset?.notes) && dataset!.notes!.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h2 style={sectionTitleStyle(primary, tone)}>School Notes</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: compact ? 9.5 : 10.5, lineHeight: 1.55, color: "#374151", fontWeight: 650 }}>
            {dataset!.notes!.map((note, index) => <li key={index}>{note}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 11, background: "rgba(255,255,255,.78)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 950, color: "#111827" }}>{title}</div>
      <p style={{ margin: "5px 0 0", fontSize: 9.5, lineHeight: 1.45, color: "#4b5563", fontWeight: 650 }}>{text}</p>
    </div>
  );
}
