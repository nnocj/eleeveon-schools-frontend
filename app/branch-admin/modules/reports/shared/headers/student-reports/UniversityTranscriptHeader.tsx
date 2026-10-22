"use client";

/**
 * reports/shared/headers/UniversityTranscriptHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — UNIVERSITY TRANSCRIPT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - compact registrar-style academic identity
 * - formal transcript tones
 * - institutional typography, double rules and precise metadata
 * - school identity, academic-record title and structured metadata
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
} from "../../ReportTemplateUtils";

export default function UniversityTranscriptHeader({
  header,
  dataset,
  title = "Official Academic Transcript",
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
        color: "#111827",
        background: "#ffffff",
        border: "1px solid #9ca3af",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 8px 22px rgba(15,23,42,.055)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px minmax(0, 1fr) ${compact ? 164 : 188}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "8px 10px" : "9px 12px",
          background: "#ffffff",
          borderBottom: "3px double #111827",
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
            border: "1px solid #9ca3af",
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
            <span style={{ fontSize: compact ? 9.2 : 9.8, fontWeight: 900, color: "#4b5563", textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" }}>
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
              color: "#111827",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || contactLine || branchLine) && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 9.2 : 9.7,
                lineHeight: 1.25,
                fontWeight: 680,
                color: "#4b5563",
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
            borderLeft: `4px solid ${primary}`,
            background: "#f3f4f6",
            color: "#111827",
            borderRadius: 3,
            padding: compact ? "6px 8px" : "7px 10px",
            textAlign: "left",
            fontSize: compact ? 8 : 8.8,
            fontWeight: 920,
            lineHeight: 1.15,
            textTransform: "uppercase",
            letterSpacing: 0.22,
          }}
        >
          {title}
          <div style={{ marginTop: 2, fontSize: compact ? 9.2 : 9.8, color: "#4b5563", fontWeight: 760 }}>
            office of academic records
          </div>
        </div>
      </div>

    </header>
  );
}
