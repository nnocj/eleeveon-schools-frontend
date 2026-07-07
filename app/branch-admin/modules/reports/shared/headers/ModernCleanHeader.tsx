"use client";

/**
 * reports/shared/headers/ModernCleanHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — MODERN FRAMED REPORT HEADER
 * ---------------------------------------------------------
 *
 * Visual direction:
 * - asymmetric modern header instead of classic centered header
 * - logo lives inside a strong identity block
 * - school identity uses clean hierarchy and compact contact text
 * - report title and academic metadata sit in a right-side badge rail
 * - bottom metadata strip keeps structure / period / class visible
 *
 * This component does not compute report results.
 * It only renders already-resolved header/branding data.
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  getContrastTextColor,
  firstText,
} from "../ReportTemplateUtils";

// ======================================================
// COMPONENT
// ======================================================

export default function ModernCleanHeader({
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
  ]
    .filter(Boolean)
    .join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 54 : 64;

  const metaItems = [
    { label: "Structure", value: academicStructureName || "-" },
    { label: "Period", value: academicPeriodName || "-" },
    { label: "Class", value: className || "-" },
  ];

  return (
    <header
      className="modern-framed-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111827",
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        background: "#ffffff",
        border: "1px solid #d9dee8",
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
      }}
    >
      <div
        aria-hidden="true"
        data-report-color-block="true"
        style={{
          height: compact ? 7 : 8,
          background: `linear-gradient(90deg, ${primary}, ${primary} 42%, rgba(15,23,42,.82))`,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize + 20}px minmax(0, 1fr) ${compact ? 150 : 172}px`,
          gap: compact ? 9 : 12,
          alignItems: "stretch",
          padding: compact ? 10 : 12,
        }}
      >
        <div
          data-report-color-block="true"
          style={{
            borderRadius: 18,
            background: primary,
            color: contrast,
            minHeight: logoSize + 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 7,
            boxSizing: "border-box",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22)",
          }}
        >
          <div
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: 16,
              overflow: "hidden",
              background: "rgba(255,255,255,.96)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              border: "1px solid rgba(255,255,255,.75)",
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
                  padding: 5,
                  boxSizing: "border-box",
                }}
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
                School<br />Logo
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "2px 0",
          }}
        >
          <div
            style={{
              fontSize: compact ? 18.5 : 22,
              lineHeight: 1.02,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.18,
              color: "#0f172a",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 8.6 : 9.6,
                fontWeight: 760,
                fontStyle: "italic",
                color: "#475569",
                lineHeight: 1.2,
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 6,
                fontSize: compact ? 7.4 : 8.2,
                lineHeight: 1.25,
                fontWeight: 680,
                color: "#64748b",
                overflowWrap: "anywhere",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 4,
                display: "inline-flex",
                width: "fit-content",
                maxWidth: "100%",
                borderRadius: 999,
                padding: compact ? "3px 8px" : "4px 10px",
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                fontSize: compact ? 7.3 : 8.1,
                lineHeight: 1.15,
                fontWeight: 900,
                color: primary,
                overflowWrap: "anywhere",
              }}
            >
              {branchLine}
            </div>
          )}
        </div>

        <aside
          style={{
            display: "grid",
            gridTemplateRows: "1fr auto",
            gap: 7,
            minWidth: 0,
          }}
        >
          <div
            data-report-color-block="true"
            style={{
              borderRadius: 18,
              background: "#0f172a",
              color: "#ffffff",
              padding: compact ? "9px 10px" : "11px 12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              textAlign: "center",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
            }}
          >
            <div
              style={{
                fontSize: compact ? 7 : 7.8,
                fontWeight: 950,
                letterSpacing: 0.35,
                textTransform: "uppercase",
                opacity: 0.82,
              }}
            >
              Report Card
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: compact ? 10 : 11.4,
                lineHeight: 1.12,
                fontWeight: 950,
                textTransform: "uppercase",
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
              padding: compact ? "6px 8px" : "7px 9px",
              textAlign: "center",
              fontSize: compact ? 8 : 8.8,
              fontWeight: 950,
              color: primary,
              overflowWrap: "anywhere",
            }}
          >
            {academicPeriodName || "Academic Period"}
          </div>
        </aside>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 0,
          borderTop: "1px solid #e5e7eb",
          background: "#f8fafc",
        }}
      >
        {metaItems.map((item, index) => (
          <div
            key={item.label}
            style={{
              padding: compact ? "6px 10px" : "7px 12px",
              borderLeft: index === 0 ? "0" : "1px solid #e5e7eb",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: compact ? 6.8 : 7.3,
                fontWeight: 950,
                letterSpacing: 0.32,
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 8.3 : 9.1,
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
    </header>
  );
}
