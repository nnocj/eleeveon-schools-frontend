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

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
} from "../../ReportTemplateUtils";

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

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ]
    .filter(Boolean)
    .join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress].filter(Boolean).join(" · ");
  const logoSize = compact ? 68 : 80;

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
        padding: compact ? 6 : 9,
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
                  fontSize: compact ? 8.1 : 8.8,
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
            marginTop: compact ? 4 : 5,
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
                marginTop: 2,
                fontSize: compact ? 10.2 : 10.9,
                fontWeight: 760,
                fontStyle: "italic",
                color: "#334155",
                lineHeight: 1.1,
              }}
            >
              “{branding.motto}”
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 10.5 : 11.1,
                fontWeight: 700,
                color: "#475569",
                lineHeight: 1.1,
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
                fontSize: compact ? 10.4 : 11,
                fontWeight: 900,
                color: primary,
                lineHeight: 1.1,
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
            margin: compact ? "6px auto 0" : "8px auto 0",
            width: "fit-content",
            maxWidth: "82%",
            border: `2px double ${primary}`,
            background: "#f3efe4",
            padding: compact ? "4px 18px" : "5px 22px",
            textAlign: "center",
            fontSize: compact ? 9.8 : 11,
            fontWeight: 950,
            color: "#111827",
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: 0.42,
          }}
        >
          {title}
        </div>

      </div>
    </header>
  );
}
