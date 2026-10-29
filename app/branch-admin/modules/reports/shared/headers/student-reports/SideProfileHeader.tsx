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

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ].filter(Boolean).join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");

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
          gap: compact ? 8 : 8,
          alignItems: "center",
          padding: compact ? "5px 10px" : "5px 12px",
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
                marginTop: 2,
                fontSize: compact ? 10.3 : 10.6,
                lineHeight: 1.12,
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
            background: primary,
            color: contrast,
            borderRadius: 999,
            padding: compact ? "5px 10px" : "5px 12px",
            maxWidth: 152,
            textAlign: "center",
            fontSize: compact ? 9.2 : 10,
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

    </header>
  );
}
