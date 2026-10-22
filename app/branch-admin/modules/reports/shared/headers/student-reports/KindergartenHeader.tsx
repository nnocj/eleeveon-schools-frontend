"use client";

/**
 * reports/shared/headers/KindergartenHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — KINDERGARTEN EARLY-YEARS REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact soft early-years academic identity
 * - warm rounded shapes with gentle child-friendly accents
 * - school identity, early-years report title and structured metadata
 * - playful but still official for printing and parent records
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
} from "../ReportTemplateUtils";

export default function KindergartenHeader({
  header,
  dataset,
  title = "Early Years Progress Report",
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
      className="kindergarten-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#0f172a",
        background: "#ffffff",
        border: "1px solid #fed7aa",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 8px 22px rgba(15,23,42,.055)",
      }}
    >
      <div data-report-color-block="true" style={{ height: 6, background: "#ea580c" }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `minmax(0, 1fr) ${compact ? 172 : 198}px ${logoSize}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "10px 12px",
          background: "linear-gradient(180deg, #ffffff, #fff7ed)",
          borderBottom: "1px solid #ffedd5",
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
              color: "#ea580c",
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
                color: "#6b7280",
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
            borderLeft: "0",
            background: "linear-gradient(135deg, #fff7ed, #ecfeff)",
            color: "#ea580c",
            borderRadius: 999,
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
          <div style={{ marginTop: 2, fontSize: compact ? 9.2 : 9.8, color: "#78716c", fontWeight: 850 }}>
            Kindergarten progress record
          </div>
        </div>

        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 16,
            border: "1px solid #fed7aa",
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
            <span style={{ fontSize: compact ? 6.6 : 7.2, fontWeight: 950, color: "#78716c", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
              School<br />Logo
            </span>
          )}
        </div>
      </div>

    </header>
  );
}
