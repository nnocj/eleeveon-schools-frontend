"use client";

import React from "react";
import type { CumulativeReportBookDataset, CumulativeReportBookSettings } from "./cumulative-book-types";
import {
  bookPageStyle,
  generatedBookDate,
  getContrastTextColor,
  resolveBookBranding,
  resolveBookStudent,
  templateTone,
  firstText,
} from "./cumulative-book-utils";

type Props = {
  dataset?: CumulativeReportBookDataset | null;
  template?: any;
  settings?: CumulativeReportBookSettings | null;
  compact?: boolean;
  pageBreakAfter?: boolean;
};

export default function CumulativeBookFrontCover({
  dataset,
  template,
  settings,
  compact = false,
  pageBreakAfter = true,
}: Props) {
  const branding = resolveBookBranding(dataset);
  const student = resolveBookStudent(dataset);
  const tone = templateTone(template, settings);
  const primary = branding.primaryColor || "#1d4ed8";
  const contrast = getContrastTextColor(primary);
  const generated = generatedBookDate(dataset, settings);
  const title = firstText(settings?.bookTitleLabel, dataset?.title, "Cumulative Academic Report Book");
  const subtitle = firstText(
    settings?.bookSubtitleLabel,
    dataset?.subtitle,
    "Complete academic record across published report periods"
  );

  const page = bookPageStyle({
    primary,
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    compact,
    pageBreakAfter,
    tone,
  });

  return (
    <section className="print-page cumulative-book-page cumulative-book-front-cover" style={page}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: tone === "transcript" ? "8mm" : "7mm",
          border: tone === "premium" ? `2px double ${primary}` : `1px solid ${tone === "montessori" ? "#c8bda8" : "#d1d5db"}`,
          borderRadius: tone === "transcript" ? 0 : 18,
          pointerEvents: "none",
        }}
      />

      {branding.reportCardWatermark && (
        <img
          src={branding.reportCardWatermark}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            width: "58%",
            maxHeight: "58%",
            objectFit: "contain",
            opacity: tone === "transcript" ? 0.025 : 0.045,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1, minHeight: "267mm", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: compact ? 20 : 25, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.35 }}>
              {branding.schoolName}
            </div>
            {branding.motto && (
              <div style={{ marginTop: 4, fontSize: compact ? 9 : 10.5, fontStyle: "italic", fontWeight: 700, color: "#4b5563" }}>
                {branding.motto}
              </div>
            )}
            {branding.branchName && (
              <div style={{ marginTop: 4, fontSize: compact ? 8.5 : 9.5, fontWeight: 850, color: primary }}>
                {branding.branchName}
              </div>
            )}
          </div>

          <div
            style={{
              width: compact ? 62 : 74,
              height: compact ? 62 : 74,
              border: `1px solid ${tone === "transcript" ? "#111827" : "#d1d5db"}`,
              borderRadius: tone === "transcript" ? 0 : 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {branding.logo ? (
              <img src={branding.logo} alt="School logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }} />
            ) : (
              <span style={{ fontSize: 8, fontWeight: 900, color: "#6b7280", textAlign: "center" }}>SCHOOL<br />LOGO</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ width: "86%", maxWidth: 560 }}>
            <div
              style={{
                display: "inline-flex",
                padding: tone === "transcript" ? "8px 16px" : "9px 18px",
                borderRadius: tone === "transcript" ? 0 : 999,
                background: primary,
                color: contrast,
                fontSize: compact ? 9 : 10.5,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Academic Portfolio
            </div>

            <h1
              style={{
                margin: "22px 0 8px",
                fontSize: compact ? 28 : 38,
                lineHeight: 1.02,
                fontWeight: tone === "montessori" ? 720 : 950,
                textTransform: tone === "kindergarten" || tone === "montessori" ? "none" : "uppercase",
                letterSpacing: tone === "transcript" ? 0.9 : 0.2,
              }}
            >
              {title}
            </h1>

            <div style={{ margin: "0 auto", width: 120, height: tone === "transcript" ? 2 : 4, background: primary, borderRadius: 999 }} />

            <p style={{ margin: "14px auto 0", fontSize: compact ? 10.5 : 12, lineHeight: 1.45, color: "#4b5563", fontWeight: 700 }}>
              {subtitle}
            </p>

            <div
              style={{
                margin: "28px auto 0",
                padding: compact ? 14 : 18,
                border: `1px solid ${tone === "transcript" ? "#111827" : "#e5e7eb"}`,
                borderRadius: tone === "transcript" ? 0 : 18,
                background: tone === "transcript" ? "#fff" : "rgba(255,255,255,.78)",
              }}
            >
              <div style={{ fontSize: compact ? 8 : 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280" }}>
                Prepared For
              </div>
              <div style={{ marginTop: 4, fontSize: compact ? 20 : 24, fontWeight: 950, color: "#111827" }}>
                {student.fullName}
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", fontSize: compact ? 9 : 10, fontWeight: 850, color: "#374151" }}>
                {student.admissionNumber && <span>Admission No: {student.admissionNumber}</span>}
                {student.className && <span>Class: {student.className}</span>}
                <span>{dataset?.periods?.length || 0} Report Periods</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", fontSize: compact ? 8 : 9, color: "#4b5563", fontWeight: 750 }}>
          <span>{branding.address || branding.email || branding.website || "Official school academic record"}</span>
          {generated && <span>{settings?.generatedDateLabel || "Generated"}: {generated}</span>}
        </div>
      </div>
    </section>
  );
}
