"use client";

/**
 * reports/shared/headers/SideProfileHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — SIDE PROFILE REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact horizontal report identity for the main content column
 * - designed to work beside a left student profile sidebar
 * - keeps school branding visible without taking much vertical space
 * - metadata is rendered as a single slim strip
 *
 * This component does not compute report results.
 * It only renders already-resolved header/branding data.
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  getContrastTextColor,
  firstText,
} from "../../ReportTemplateUtils";

// ======================================================
// COMPONENT
// ======================================================

export default function SideProfileHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  primaryColor,
  fontFamily,
  compact = false,
}: ReportTemplateHeaderProps) {
  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);

  const primary = primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);
  const contrast = getContrastTextColor(primary);

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

  const metaItems = [
    { label: "Structure", value: academicStructureName || "-" },
    { label: "Period", value: academicPeriodName || "-" },
    { label: "Class", value: className || "-" },
  ];

  return (
    <header
      className="side-profile-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#0f172a",
        background: "#ffffff",
        border: "1px solid #dbe3ef",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 8px 22px rgba(15,23,42,.055)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "9px 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "linear-gradient(180deg, #ffffff, #f8fafc)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 14.5 : 16.5,
              lineHeight: 1.05,
              fontWeight: 950,
              letterSpacing: 0.16,
              textTransform: "uppercase",
              color: "#0f172a",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || contactLine || branchLine) && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 7.2 : 8,
                lineHeight: 1.25,
                fontWeight: 720,
                color: "#64748b",
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
            background: primary,
            color: contrast,
            borderRadius: 999,
            padding: compact ? "6px 10px" : "7px 12px",
            maxWidth: 170,
            textAlign: "center",
            fontSize: compact ? 7.8 : 8.6,
            fontWeight: 950,
            lineHeight: 1.12,
            textTransform: "uppercase",
            letterSpacing: 0.22,
            boxShadow: "0 8px 16px rgba(15,23,42,.13)",
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 0,
          background: "#ffffff",
        }}
      >
        {metaItems.map((item, index) => (
          <div
            key={item.label}
            style={{
              minWidth: 0,
              padding: compact ? "5px 8px" : "6px 9px",
              borderLeft: index === 0 ? "0" : "1px solid #e5e7eb",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: compact ? 6.5 : 7.1,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: 0.25,
                color: "#64748b",
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 7.8 : 8.6,
                fontWeight: 900,
                color: "#0f172a",
                overflowWrap: "anywhere",
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
