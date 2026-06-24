"use client";

/**
 * reports/shared/headers/ClassicFormalHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC FORMAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Header style:
 * - formal Ghana/private-school report identity
 * - centered school details
 * - logo support
 * - compact institutional metadata
 * - reusable across templates that need a classic official top section
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

export default function ClassicFormalHeader({
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

  const academicLine = [
    academicStructureName,
    academicPeriodName,
    className,
  ].filter(Boolean).join(" · ");

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

  const logoSize = compact ? 52 : 64;

  return (
    <header
      className="classic-formal-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px 1fr ${logoSize}px`,
          alignItems: "center",
          gap: compact ? 8 : 10,
          paddingBottom: compact ? 6 : 8,
          borderBottom: `3px solid ${primary}`,
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 10,
            border: "1px solid #d4d4d4",
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
                padding: 4,
                boxSizing: "border-box",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: compact ? 8 : 9,
                fontWeight: 900,
                color: "#777",
                textAlign: "center",
                lineHeight: 1.1,
              }}
            >
              SCHOOL<br />LOGO
            </span>
          )}
        </div>

        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 19 : 23,
              lineHeight: 1.05,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: primary,
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 9 : 10,
                fontWeight: 800,
                fontStyle: "italic",
                color: "#444",
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 4,
                fontSize: compact ? 8 : 8.8,
                lineHeight: 1.25,
                fontWeight: 700,
                color: "#555",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 8 : 8.8,
                lineHeight: 1.25,
                fontWeight: 800,
                color: "#333",
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
            borderRadius: 10,
            border: `1px solid ${primary}`,
            background: primary,
            color: contrast,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 5,
            boxSizing: "border-box",
            fontSize: compact ? 8 : 9,
            fontWeight: 950,
            lineHeight: 1.12,
            textTransform: "uppercase",
          }}
        >
          Official<br />Report
        </div>
      </div>

      <div
        style={{
          marginTop: compact ? 6 : 8,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, #999)",
          }}
        />

        <div
          style={{
            border: `1px solid ${primary}`,
            background: primary,
            color: contrast,
            borderRadius: 999,
            padding: compact ? "4px 14px" : "5px 18px",
            fontSize: compact ? 9.5 : 10.5,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: 0.35,
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>

        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, #999, transparent)",
          }}
        />
      </div>

      {academicLine && (
        <div
          style={{
            marginTop: compact ? 5 : 6,
            textAlign: "center",
            fontSize: compact ? 8.5 : 9.5,
            fontWeight: 850,
            color: "#333",
          }}
        >
          {academicLine}
        </div>
      )}
    </header>
  );
}
