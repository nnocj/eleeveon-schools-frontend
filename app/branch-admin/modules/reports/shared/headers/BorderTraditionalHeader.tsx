"use client";

/**
 * reports/shared/headers/BorderedTraditionalHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BORDERED TRADITIONAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - traditional printed school report identity
 * - strong bordered frame
 * - school logo + centered institutional details
 * - formal boxed report title
 * - academic context inside a bordered strip
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

export default function BorderedTraditionalHeader({
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
  ].filter(Boolean).join("  |  ");

  const branchLine = [
    branding.branchName,
    branding.branchAddress,
  ].filter(Boolean).join(" · ");

  const academicItems = [
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

  const logoSize = compact ? 54 : 68;

  return (
    <header
      className="bordered-traditional-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
        border: "2px solid #111",
        background: "#fff",
      }}
    >
      <div
        style={{
          border: "1px solid #111",
          margin: 3,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${logoSize}px 1fr ${logoSize}px`,
            alignItems: "center",
            gap: compact ? 8 : 10,
            padding: compact ? 7 : 9,
            borderBottom: "1.5px solid #111",
          }}
        >
          <div
            style={{
              width: logoSize,
              height: logoSize,
              border: "1.5px solid #111",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
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
                  fontWeight: 900,
                  color: "#555",
                  textAlign: "center",
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                }}
              >
                School<br />Logo
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
                letterSpacing: 0.55,
                color: "#111",
              }}
            >
              {branding.schoolName}
            </div>

            {branding.motto && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: compact ? 8.5 : 9.5,
                  fontWeight: 800,
                  fontStyle: "italic",
                  color: "#333",
                }}
              >
                {branding.motto}
              </div>
            )}

            {contactLine && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: compact ? 7.8 : 8.6,
                  lineHeight: 1.25,
                  fontWeight: 700,
                  color: "#333",
                }}
              >
                {contactLine}
              </div>
            )}

            {branchLine && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: compact ? 7.8 : 8.6,
                  lineHeight: 1.25,
                  fontWeight: 850,
                  color: "#111",
                }}
              >
                {branchLine}
              </div>
            )}
          </div>

          <div
            style={{
              width: logoSize,
              height: logoSize,
              border: "1.5px solid #111",
              background: primary,
              color: contrast,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 5,
              boxSizing: "border-box",
              fontSize: compact ? 7.5 : 8.5,
              fontWeight: 950,
              lineHeight: 1.12,
              textTransform: "uppercase",
            }}
          >
            Official<br />School<br />Report
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 0,
            borderBottom: "1.5px solid #111",
          }}
        >
          <div
            style={{
              height: "100%",
              minHeight: compact ? 28 : 32,
              borderRight: "1px solid #111",
              background:
                "repeating-linear-gradient(45deg, rgba(0,0,0,.025), rgba(0,0,0,.025) 4px, transparent 4px, transparent 8px)",
            }}
          />

          <div
            style={{
              padding: compact ? "6px 18px" : "7px 24px",
              background: primary,
              color: contrast,
              borderLeft: "1.5px solid #111",
              borderRight: "1.5px solid #111",
              fontSize: compact ? 10 : 11.5,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.45,
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            {title}
          </div>

          <div
            style={{
              height: "100%",
              minHeight: compact ? 28 : 32,
              borderLeft: "1px solid #111",
              background:
                "repeating-linear-gradient(45deg, rgba(0,0,0,.025), rgba(0,0,0,.025) 4px, transparent 4px, transparent 8px)",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            borderBottom: "0",
          }}
        >
          {academicItems.map((item, index) => (
            <div
              key={item.label}
              style={{
                padding: compact ? "5px 7px" : "6px 8px",
                borderRight: index === academicItems.length - 1 ? "0" : "1px solid #111",
                background: "#f7f7f7",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: compact ? 7.2 : 8,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: 0.35,
                  color: "#444",
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: compact ? 8.5 : 9.5,
                  fontWeight: 900,
                  color: "#111",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
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
