
"use client";

/**
 * reports/shared/headers/UniversityTranscriptHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — UNIVERSITY TRANSCRIPT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact registrar-style academic identity
 * - official transcript / academic records tone
 * - institutional typography, double rules and precise metadata
 * - no Montessori, early-years, decorative or classroom styling
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  firstText,
} from "../../ReportTemplateUtils";

export default function UniversityTranscriptHeader({
  header,
  dataset,
  title = "Official Academic Transcript",
  primaryColor,
  fontFamily,
  compact = false,
}: ReportTemplateHeaderProps) {
  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);
  const primary = primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);

  const academicStructureName = firstText(
    (resolvedHeader as any)?.academicStructure?.name,
    (resolvedHeader as any)?.academicStructureName
  );

  const academicPeriodName = firstText(
    (resolvedHeader as any)?.academicPeriod?.name,
    (resolvedHeader as any)?.academicPeriodName
  );

  const className = firstText(
    (resolvedHeader as any)?.classData?.name,
    (resolvedHeader as any)?.className,
    (dataset as any)?.report?.className
  );

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ].filter(Boolean).join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 38 : 44;

  const metaItems = [
    { label: "Academic Division", value: academicStructureName || "-" },
    { label: "Academic Period", value: academicPeriodName || "-" },
    { label: "Programme / Class", value: className || "-" },
  ];

  return (
    <header
      className="university-transcript-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111827",
        background: "#ffffff",
        border: "1px solid #6b7280",
        borderRadius: 3,
        overflow: "hidden",
        boxShadow: "0 8px 22px rgba(15,23,42,.055)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px minmax(0, 1fr) ${compact ? 166 : 190}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "9px 12px",
          background: "#ffffff",
          borderBottom: "3px double #111827",
          position: "relative",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: -1,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${primary}, transparent)`,
            opacity: 0.55,
          }}
        />

        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 3,
            border: "1px solid #6b7280",
            overflow: "hidden",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {branding.logo ? (
            <img
              src={branding.logo}
              alt="School logo"
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4, boxSizing: "border-box" }}
            />
          ) : (
            <span style={{ fontSize: compact ? 6.4 : 7, fontWeight: 900, color: "#4b5563", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
              School<br />Logo
            </span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 14.5 : 16.8,
              lineHeight: 1.08,
              fontWeight: 950,
              letterSpacing: 0.18,
              textTransform: "uppercase",
              color: "#111827",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: compact ? 7.1 : 7.9,
              lineHeight: 1.2,
              fontWeight: 900,
              letterSpacing: 0.22,
              textTransform: "uppercase",
              color: primary,
            }}
          >
            Office of the Registrar / Academic Records Division
          </div>

          {(branding.motto || contactLine || branchLine) && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 6.8 : 7.5,
                lineHeight: 1.24,
                fontWeight: 660,
                color: "#4b5563",
                overflowWrap: "anywhere",
              }}
            >
              {[branding.motto, contactLine, branchLine].filter(Boolean).join("  •  ")}
            </div>
          )}
        </div>

        <div
          data-report-color-block="true"
          style={{
            borderLeft: `4px solid ${primary}`,
            background: "#f3f4f6",
            color: "#111827",
            borderRadius: 2,
            padding: compact ? "6px 8px" : "7px 10px",
            textAlign: "left",
            fontSize: compact ? 8 : 8.8,
            fontWeight: 950,
            lineHeight: 1.15,
            textTransform: "uppercase",
            letterSpacing: 0.24,
          }}
        >
          {title}
          <div style={{ marginTop: 2, fontSize: compact ? 6.3 : 7, color: "#4b5563", fontWeight: 820 }}>
            transcript of academic record
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", background: "#ffffff", borderBottom: "1px solid #d1d5db" }}>
        {metaItems.map((item, index) => (
          <div key={item.label} style={{ minWidth: 0, padding: compact ? "5px 8px" : "6px 9px", borderLeft: index === 0 ? "0" : "1px solid #d1d5db" }}>
            <div style={{ fontSize: compact ? 6.3 : 6.9, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.24, color: "#4b5563" }}>
              {item.label}
            </div>
            <div style={{ marginTop: 1, fontSize: compact ? 7.7 : 8.5, fontWeight: 900, color: "#111827", overflowWrap: "anywhere" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
