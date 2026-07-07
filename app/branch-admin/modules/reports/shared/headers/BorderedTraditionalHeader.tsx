"use client";

/**
 * reports/shared/headers/BorderedTraditionalHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BORDERED TRADITIONAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Visual direction:
 * - centered certificate-style school identity
 * - crest/logo at the top with decorative ruled lines
 * - formal title plate instead of a modern badge
 * - compact official metadata register below the title
 * - square borders and print-safe contrast
 *
 * This component does not compute report results.
 * It only renders already-resolved header/branding data.
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  firstText,
} from "../ReportTemplateUtils";

// ======================================================
// COMPONENT
// ======================================================

export default function BorderedTraditionalHeader({
  header,
  dataset,
  title = "Official Academic Report",
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
  ]
    .filter(Boolean)
    .join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 52 : 62;

  const metaItems = [
    { label: "Academic Structure", value: academicStructureName || "-" },
    { label: "Academic Period", value: academicPeriodName || "-" },
    { label: "Class", value: className || "-" },
  ];

  const rule: React.CSSProperties = {
    height: 0,
    borderTop: `1px solid ${primary}`,
    borderBottom: "1px solid #111827",
  };

  return (
    <header
      className="bordered-traditional-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Georgia, 'Times New Roman', serif",
        color: "#111827",
        background: "#fffdf7",
        border: "2px double #111827",
        padding: compact ? 9 : 11,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 5,
          border: `1px solid ${primary}`,
          pointerEvents: "none",
          opacity: 0.75,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: compact ? 8 : 10,
          }}
        >
          <div style={rule} />

          <div
            style={{
              width: logoSize,
              height: logoSize,
              border: `2px double ${primary}`,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              boxSizing: "border-box",
            }}
          >
            {branding.logo ? (
              <img
                src={branding.logo}
                alt="School logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span
                style={{
                  fontSize: compact ? 7 : 7.8,
                  fontWeight: 950,
                  color: primary,
                  textAlign: "center",
                  lineHeight: 1.05,
                  textTransform: "uppercase",
                }}
              >
                School<br />Crest
              </span>
            )}
          </div>

          <div style={rule} />
        </div>

        <div
          style={{
            marginTop: compact ? 5 : 7,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: compact ? 19 : 23,
              lineHeight: 1.02,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.55,
              color: "#111827",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 8.4 : 9.4,
                fontWeight: 760,
                fontStyle: "italic",
                color: "#334155",
                lineHeight: 1.18,
              }}
            >
              “{branding.motto}”
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 4,
                fontSize: compact ? 7.2 : 8,
                fontWeight: 700,
                color: "#475569",
                lineHeight: 1.22,
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
                fontSize: compact ? 7.2 : 8,
                fontWeight: 900,
                color: primary,
                lineHeight: 1.22,
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
            margin: compact ? "8px auto 0" : "10px auto 0",
            width: "fit-content",
            maxWidth: "82%",
            border: `2px double ${primary}`,
            background: "#f3efe4",
            padding: compact ? "5px 18px" : "6px 22px",
            textAlign: "center",
            fontSize: compact ? 9 : 10.5,
            fontWeight: 950,
            color: "#111827",
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: 0.42,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: compact ? 8 : 10,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            border: "1px solid #111827",
            background: "#fffaf0",
          }}
        >
          {metaItems.map((item, index) => (
            <div
              key={item.label}
              style={{
                minWidth: 0,
                padding: compact ? "4px 7px" : "5px 8px",
                borderLeft: index === 0 ? 0 : "1px solid #111827",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: compact ? 6.8 : 7.4,
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
                  fontSize: compact ? 8.2 : 9,
                  fontWeight: 950,
                  color: "#111827",
                  overflowWrap: "anywhere",
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
