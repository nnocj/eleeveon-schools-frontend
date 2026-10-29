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

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ].filter(Boolean).join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 38 : 44;

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
          gridTemplateColumns: `${logoSize}px minmax(0, 1fr) ${compact ? 155 : 169}px`,
          gap: compact ? 7 : 8,
          alignItems: "center",
          padding: compact ? "6px 10px" : "4px 12px",
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
            <span style={{ fontSize: compact ? 9.2 : 9.8, fontWeight: 900, color: "#6f6a5f", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
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
                marginTop: 2,
                fontSize: compact ? 10.1 : 10.6,
                lineHeight: 1.12,
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
            padding: compact ? "5px 8px" : "6px 10px",
            textAlign: "left",
            fontSize: compact ? 9.3 : 10,
            fontWeight: 920,
            lineHeight: 1.15,
            textTransform: "uppercase",
            letterSpacing: 0.22,
          }}
        >
          {title}
          <div style={{ marginTop: 2, fontSize: compact ? 9.6 : 10.2, color: "#6f6a5f", fontWeight: 760 }}>
            calm early-years learning record
          </div>
        </div>
      </div>

    </header>
  );
}
