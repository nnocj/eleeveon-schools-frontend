"use client";

/**
 * reports/shared/headers/CompactPrintHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT PRINT REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - print-efficient and low-height
 * - preserves school identity without consuming much vertical space
 * - logo + school details + report title in one tight band
 * - academic context in a slim metadata row
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

export default function CompactPrintHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  settings,
  primaryColor,
  fontFamily,
  compact = true,
}: ReportTemplateHeaderProps) {
  void settings;

  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);

  const primary =
    primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);
  const contrast = getContrastTextColor(primary);

  const academicStructureName = firstText(
    (resolvedHeader as any)?.academicStructure?.name,
    (resolvedHeader as any)?.academicStructureName,
  );

  const academicPeriodName = firstText(
    (resolvedHeader as any)?.academicPeriod?.name,
    (resolvedHeader as any)?.academicPeriodName,
  );

  const className = firstText(
    (resolvedHeader as any)?.classData?.name,
    (resolvedHeader as any)?.className,
    (dataset as any)?.report?.className,
  );

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ]
    .filter(Boolean)
    .join("  |  ");

  const branchLine = [branding.branchName, branding.branchAddress]
    .filter(Boolean)
    .join(" · ");

  const logoSize = compact ? 42 : 48;

  const metaItems = [
    { label: "Structure", value: academicStructureName || "-" },
    { label: "Period", value: academicPeriodName || "-" },
    { label: "Class", value: className || "-" },
  ];

  return (
    <header
      className="compact-print-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
        borderBottom: `2px solid ${primary}`,
        paddingBottom: 4,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px 1fr auto`,
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            border: "1px solid #cfcfcf",
            borderRadius: 6,
            overflow: "hidden",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {branding.logo ? (
            <img
              src={branding.logo}
              alt="School logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 3,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 7,
                fontWeight: 900,
                color: "#777",
                textAlign: "center",
                lineHeight: 1.05,
              }}
            >
              LOGO
            </span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 15.5 : 17,
              lineHeight: 1.05,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.3,
              color: primary,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 1,
                fontSize: 8,
                fontWeight: 750,
                fontStyle: "italic",
                color: "#444",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 2,
                fontSize: 7.4,
                lineHeight: 1.2,
                fontWeight: 650,
                color: "#555",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 1,
                fontSize: 7.4,
                lineHeight: 1.2,
                fontWeight: 800,
                color: "#333",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {branchLine}
            </div>
          )}
        </div>

        <div
          style={{
            background: primary,
            color: contrast,
            borderRadius: 6,
            padding: "6px 9px",
            maxWidth: 160,
            textAlign: "center",
            fontSize: 8.5,
            fontWeight: 950,
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: 0.25,
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          marginTop: 4,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {metaItems.map((item) => (
          <div
            key={item.label}
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: 5,
              padding: "3px 5px",
              background: "#fafafa",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 6.8,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: 0.25,
                color: "#555",
              }}
            >
              {item.label}:{" "}
            </span>
            <span
              style={{
                fontSize: 7.8,
                fontWeight: 850,
                color: "#111",
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}
