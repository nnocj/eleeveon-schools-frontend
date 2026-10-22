"use client";

/**
 * reports/shared/headers/CompactPrintHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT PRINT REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - print-efficient and low-height
 * - preserves school identity without consuming much vertical space
 * - logo + school details + report title in one tight band
 * - academic context in a slim metadata row
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

export default function CompactPrintHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  settings,
  primaryColor,
  fontFamily,
  compact = true,
  studentPhoto,
  showStudentPhoto = false,
}: ReportTemplateHeaderProps & { studentPhoto?: string | null; showStudentPhoto?: boolean }) {
  void settings;

  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);

  const primary = primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);
  const contrast = getContrastTextColor(primary);

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

  const logoSize = compact ? 56 : 62;

  return (
    <header
      className="compact-print-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
        border: "1.5px solid #111827",
        borderTop: `5px solid ${primary}`,
        padding: "6px 7px",
        background: "rgba(255,255,255,.98)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showStudentPhoto ? `${logoSize}px minmax(0,1fr) auto 72px` : `${logoSize}px minmax(0,1fr) auto`,
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            border: "1px solid #cfcfcf",
            borderRadius: 6,
            overflow: "hidden",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
                padding: 3,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                color: "#777",
                textAlign: "center",
                lineHeight: 1.05,
              }}
            >
              LOGO
            </span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 17.2 : 18.2,
              lineHeight: 1.05,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.3,
              color: primary,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 1,
                fontSize: 9.8,
                fontWeight: 750,
                fontStyle: "italic",
                color: "#444",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 2,
                fontSize: 9.4,
                lineHeight: 1.2,
                fontWeight: 650,
                color: "#555",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 1,
                fontSize: 9.4,
                lineHeight: 1.2,
                fontWeight: 800,
                color: "#333",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {branchLine}
            </div>
          )}
        </div>

        <div
          style={{
            background: primary,
            color: contrast,
            borderRadius: 6,
            padding: "6px 9px",
            maxWidth: 160,
            textAlign: "center",
            fontSize: 10.5,
            fontWeight: 950,
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: 0.25,
          }}
        >
          {title}
        </div>
        {showStudentPhoto && (
          <div style={{ width: 72, height: 78, border: "1.5px solid #111", overflow: "hidden", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {studentPhoto ? <img src={studentPhoto} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, fontWeight: 900, color: "#64748b" }}>PHOTO</span>}
          </div>
        )}
      </div>

    </header>
  );
}
