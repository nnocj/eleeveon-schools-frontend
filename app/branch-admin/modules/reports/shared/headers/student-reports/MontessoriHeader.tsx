"use client";

/**
 * reports/shared/headers/MontessoriHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — MONTESSORI REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact calm academic identity
 * - nature-inspired Montessori tones
 * - quiet typography, generous spacing and thin separators
 * - school identity, progress-record title and structured metadata
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  firstText,
} from "../../ReportTemplateUtils";

export default function MontessoriHeader({
  header,
  dataset,
  title = "Montessori Progress Record",
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
    { label: "Programme", value: academicStructureName || "-" },
    { label: "Cycle / Period", value: academicPeriodName || "-" },
    { label: "Class / Community", value: className || "-" },
  ];

  return (
    <header
      className="montessori-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#243126",
        background: "#fffdf7",
        border: "1px solid #d9cbb3",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 7px 18px rgba(80,64,38,.055)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px minmax(0, 1fr) ${compact ? 164 : 188}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "9px 12px",
          background: "linear-gradient(180deg, #fffdf7, #ffffff)",
          borderBottom: "1px solid #e7ddc8",
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
            opacity: 0.45,
          }}
        />

        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 999,
            border: "1px solid #d9cbb3",
            overflow: "hidden",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {branding.logo ? (
            <img src={branding.logo} alt="School logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4, boxSizing: "border-box" }} />
          ) : (
            <span style={{ fontSize: compact ? 6.4 : 7, fontWeight: 900, color: "#6f6a5f", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
              School<br />Logo
            </span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 14.5 : 16.8,
              lineHeight: 1.08,
              fontWeight: 920,
              letterSpacing: 0.16,
              textTransform: "uppercase",
              color: "#243126",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || contactLine || branchLine) && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 7 : 7.8,
                lineHeight: 1.25,
                fontWeight: 680,
                color: "#6f6a5f",
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
            borderLeft: `3px solid ${primary}`,
            background: "#f6f3ea",
            color: "#243126",
            borderRadius: 6,
            padding: compact ? "6px 8px" : "7px 10px",
            textAlign: "left",
            fontSize: compact ? 8 : 8.8,
            fontWeight: 920,
            lineHeight: 1.15,
            textTransform: "uppercase",
            letterSpacing: 0.22,
          }}
        >
          {title}
          <div style={{ marginTop: 2, fontSize: compact ? 6.4 : 7, color: "#6f6a5f", fontWeight: 760 }}>
            calm early-years learning record
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", background: "#ffffff" }}>
        {metaItems.map((item, index) => (
          <div key={item.label} style={{ minWidth: 0, padding: compact ? "5px 8px" : "6px 9px", borderLeft: index === 0 ? "0" : "1px solid #e7ddc8" }}>
            <div style={{ fontSize: compact ? 6.3 : 6.9, fontWeight: 920, textTransform: "uppercase", letterSpacing: 0.24, color: "#6f6a5f" }}>
              {item.label}
            </div>
            <div style={{ marginTop: 1, fontSize: compact ? 7.7 : 8.5, fontWeight: 860, color: "#243126", overflowWrap: "anywhere" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
