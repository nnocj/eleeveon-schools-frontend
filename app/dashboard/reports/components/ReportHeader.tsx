"use client";

/**
 * reports/components/ReportHeader.tsx
 * ---------------------------------------------------------
 * SHARED INSTITUTIONAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Used by:
 * - StudentReportCard.tsx
 * - SubjectBroadsheet.tsx
 * - ClassBroadsheet.tsx
 *
 * Purpose:
 * Keep branding consistent across every printable academic document.
 */

import React from "react";
import type { ReportHeaderData } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  header: ReportHeaderData;
  title: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  compact?: boolean;
  showLogo?: boolean;
  showContact?: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ReportHeader({
  header,
  title,
  subtitle,
  orientation = "portrait",
  compact = false,
  showLogo = true,
  showContact = true,
}: Props) {
  const branding = header.branding;
  const primary = branding.primaryColor || "var(--primary-color)";

  const logoSize = compact ? 58 : 74;

  return (
    <div
      style={{
        borderBottom: `4px solid ${primary}`,
        paddingBottom: compact ? 8 : 10,
        marginBottom: compact ? 8 : 12,
        color: "#111",
        fontFamily: branding.fontFamily || "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showLogo
            ? `${logoSize}px 1fr ${logoSize}px`
            : "1fr",
          alignItems: "center",
          gap: compact ? 8 : 12,
        }}
      >
        {showLogo && (
          <div
            style={{
              width: logoSize,
              height: logoSize,
              border: "1px solid #ddd",
              borderRadius: 10,
              overflow: "hidden",
              background: "#fafafa",
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
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: 10,
                  color: "#777",
                  fontWeight: 700,
                }}
              >
                LOGO
              </span>
            )}
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              color: primary,
              fontSize: compact
                ? 18
                : orientation === "landscape"
                ? 24
                : 23,
              lineHeight: 1.15,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              fontWeight: 900,
            }}
          >
            {branding.schoolName || "School Name"}
          </h1>

          {branding.motto && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 10 : 12,
                fontStyle: "italic",
                fontWeight: 600,
              }}
            >
              {branding.motto}
            </div>
          )}

          {showContact && (
            <div
              style={{
                marginTop: 5,
                fontSize: compact ? 8.5 : 10,
                lineHeight: 1.35,
              }}
            >
              {branding.branchName && <div>{branding.branchName}</div>}

              {(branding.address || branding.branchAddress) && (
                <div>{branding.address || branding.branchAddress}</div>
              )}

              {(branding.phone || branding.email || branding.website) && (
                <div>
                  {branding.phone && <span>Tel: {branding.phone}</span>}
                  {branding.email && (
                    <span>{branding.phone ? " | " : ""}Email: {branding.email}</span>
                  )}
                  {branding.website && (
                    <span>
                      {branding.phone || branding.email ? " | " : ""}
                      {branding.website}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: compact ? 6 : 8,
              display: "inline-block",
              padding: compact ? "4px 10px" : "6px 16px",
              background: "#111",
              color: "#fff",
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: 0.9,
              textTransform: "uppercase",
              borderRadius: 999,
            }}
          >
            {title}
          </div>

          {subtitle && (
            <div
              style={{
                marginTop: 5,
                fontSize: compact ? 9 : 11,
                fontWeight: 700,
                color: "#333",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {showLogo && <div />}
      </div>

      <div
        style={{
          marginTop: compact ? 8 : 10,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 6,
          fontSize: compact ? 8.5 : 10,
        }}
      >
        <div>
          <strong>Academic Level:</strong>{" "}
          {header.academicStructure?.name || "-"}
        </div>

        <div>
          <strong>Period:</strong> {header.academicPeriod?.name || "-"}
        </div>

        <div>
          <strong>Class:</strong> {header.classData?.name || "-"}
        </div>

        <div>
          <strong>Branch:</strong> {header.branch?.name || "-"}
        </div>
      </div>
    </div>
  );
}
