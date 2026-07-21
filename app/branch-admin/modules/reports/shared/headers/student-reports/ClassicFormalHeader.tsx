"use client";

/**
 * reports/shared/headers/ClassicFormalHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC FORMAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - formal Ghana/private-school report identity
 * - centered school details
 * - logo support
 * - compact institutional metadata
 * - reusable across templates that need a classic official top section
 *
 * Mobile / print upgrade:
 * - keeps an A4/PDF-like look on small screens
 * - uses strong borders and typography so black-and-white printing still works
 * - avoids relying on color alone for structure
 * - remains compact enough for report-card printing
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

export default function ClassicFormalHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  settings,
  primaryColor,
  fontFamily,
  compact = false,
}: ReportTemplateHeaderProps) {
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

  const logoSize = compact ? 50 : 62;

  const metaItems = [
    {
      label: "Academic Structure",
      value: academicStructureName || "-",
    },
    {
      label: "Academic Period",
      value: academicPeriodName || "-",
    },
    {
      label: "Class",
      value: className || "-",
    },
  ];

  return (
    <header
      className="classic-formal-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
        background: "#fff",
        borderBottom: `2px solid ${primary}`,
        paddingBottom: compact ? 5 : 7,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px 1fr ${logoSize}px`,
          alignItems: "center",
          gap: compact ? 7 : 9,
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 9,
            border: "1.4px solid #111",
            overflow: "hidden",
            background: "#fff",
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 4,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: compact ? 7.5 : 8.5,
                fontWeight: 950,
                color: "#555",
                textAlign: "center",
                lineHeight: 1.05,
                textTransform: "uppercase",
              }}
            >
              School
              <br />
              Logo
            </span>
          )}
        </div>

        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 18 : 22,
              lineHeight: 1.05,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.42,
              color: primary,
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 8.6 : 9.6,
                fontWeight: 800,
                fontStyle: "italic",
                color: "#333",
                lineHeight: 1.18,
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 7.5 : 8.4,
                lineHeight: 1.22,
                fontWeight: 700,
                color: "#444",
                overflowWrap: "anywhere",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 7.5 : 8.4,
                lineHeight: 1.22,
                fontWeight: 850,
                color: "#111",
                overflowWrap: "anywhere",
              }}
            >
              {branchLine}
            </div>
          )}
        </div>

        <div
          data-report-color-block="true"
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 9,
            border: "1.4px solid #111",
            background: primary,
            color: contrast,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 5,
            boxSizing: "border-box",
            fontSize: compact ? 7.6 : 8.8,
            fontWeight: 950,
            lineHeight: 1.1,
            textTransform: "uppercase",
          }}
        >
          Official
          <br />
          Report
        </div>
      </div>

      <div
        style={{
          marginTop: compact ? 5 : 7,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: compact ? 5 : 7,
        }}
      >
        <div
          style={{
            height: 1,
            background: "#111",
            opacity: 0.42,
          }}
        />

        <div
          data-report-color-block="true"
          style={{
            border: "1.2px solid #111",
            background: primary,
            color: contrast,
            borderRadius: 999,
            padding: compact ? "3.5px 12px" : "4.5px 16px",
            fontSize: compact ? 8.8 : 10,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {title}
        </div>

        <div
          style={{
            height: 1,
            background: "#111",
            opacity: 0.42,
          }}
        />
      </div>

      <div
        style={{
          marginTop: compact ? 5 : 6,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {metaItems.map((item) => (
          <div
            key={item.label}
            style={{
              border: "1px solid #cfcfcf",
              borderRadius: 6,
              background: "#fafafa",
              padding: compact ? "3.5px 5px" : "4px 6px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: compact ? 6.9 : 7.5,
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
                fontSize: compact ? 7.9 : 8.7,
                fontWeight: 850,
                color: "#111",
                overflowWrap: "anywhere",
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
