"use client";

/**
 * reports/shared/headers/IBHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — IB CLEAN INTERNATIONAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact international academic identity
 * - restrained navy/learner-profile styling
 * - school identity, report title and structured metadata
 * - precise, non-decorative IB-inspired presentation
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
} from "../../ReportTemplateUtils";

export default function IBHeader({
  header,
  dataset,
  title = "International Learner Progress Report",
  primaryColor,
  fontFamily,
  compact = false,
}: ReportTemplateHeaderProps) {
  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);
  const primary = primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ].filter(Boolean).join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 42 : 48;

  return (
    <header
      className="ib-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#0f172a",
        background: "#ffffff",
        border: "1px solid #99d5cb",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 8px 22px rgba(15,23,42,.055)",
      }}
    >
      <div data-report-color-block="true" style={{ height: 6, background: "#0f766e" }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `minmax(0, 1fr) ${compact ? 172 : 198}px ${logoSize}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "10px 12px",
          background: "linear-gradient(180deg, #ffffff, #f6fffb)",
          borderBottom: "1px solid #c7ebe4",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 15 : 17.5,
              lineHeight: 1.05,
              fontWeight: 950,
              letterSpacing: 0.18,
              textTransform: "uppercase",
              color: "#0f766e",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || contactLine || branchLine) && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 9.2 : 9.8,
                lineHeight: 1.25,
                fontWeight: 720,
                color: "#475569",
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
            border: `1px solid ${primary}`,
            borderLeft: "5px solid #0f766e",
            background: "#ffffff",
            color: "#0f766e",
            borderRadius: 4,
            padding: compact ? "6px 8px" : "7px 10px",
            textAlign: "left",
            fontSize: compact ? 8 : 8.9,
            fontWeight: 950,
            lineHeight: 1.15,
            textTransform: "uppercase",
            letterSpacing: 0.22,
          }}
        >
          {title}
          <div style={{ marginTop: 2, fontSize: compact ? 9.2 : 9.8, color: "#64748b", fontWeight: 850 }}>
            IB-style progress record
          </div>
        </div>

        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 6,
            border: "1px solid #99d5cb",
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
            <span style={{ fontSize: compact ? 6.6 : 7.2, fontWeight: 950, color: "#64748b", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
              School<br />Logo
            </span>
          )}
        </div>
      </div>

    </header>
  );
}
