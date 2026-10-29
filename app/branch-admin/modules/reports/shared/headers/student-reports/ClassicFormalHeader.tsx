"use client";

/**
 * reports/shared/headers/student-reports/ClassicFormalHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC FORMAL REPORT HEADER
 * ---------------------------------------------------------
 *
 * Keeps the established Classic Formal styling while:
 * - showing a larger school logo at the left;
 * - displaying the student's photo where "Official Report" previously appeared;
 * - removing duplicate Academic Structure, Academic Period and Class cards.
 *
 * Academic and student information is rendered once in ClassicFormalTemplate.
 * This component only presents the report dataset. It does not compute grades.
 */

import React from "react";

import type { ReportTemplateHeaderProps } from "../../ReportTemplateTypes";

import {
  resolveBranding,
  resolvePrimaryColor,
  getContrastTextColor,
} from "../../ReportTemplateUtils";

type Props = ReportTemplateHeaderProps & {
  /** Already-resolved media URL provided by the Classic Formal template. */
  studentPhoto?: string | null;
  /** Honor the existing Branch Settings control for showing student images. */
  showStudentPhoto?: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ClassicFormalHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  primaryColor,
  fontFamily,
  compact = false,
  studentPhoto,
  showStudentPhoto = true,
}: Props) {
  const resolvedHeader = header || dataset?.header;
  const branding = resolveBranding(resolvedHeader);

  const primary =
    primaryColor || resolvePrimaryColor(resolvedHeader, branding.primaryColor);
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

  // Both images sit in the original two side columns; only their size grows.
  const logoSize = compact ? 76 : 92;

  return (
    <header
      className="classic-formal-report-header"
      style={{
        fontFamily: fontFamily || branding.fontFamily || "Arial, sans-serif",
        color: "#111",
        background: "#fff",
        borderBottom: `2px solid ${primary}`,
        paddingBottom: compact ? 3 : 5,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize}px 1fr ${logoSize}px`,
          alignItems: "center",
          gap: compact ? 7 : 9,
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 9,
            border: "1.4px solid #111",
            overflow: "hidden",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
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
                fontSize: compact ? 8.5 : 9.2,
                fontWeight: 950,
                color: "#555",
                textAlign: "center",
                lineHeight: 1.05,
                textTransform: "uppercase",
              }}
            >
              School
              <br />
              Logo
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
              letterSpacing: 0.42,
              color: primary,
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 9.8 : 10.6,
                fontWeight: 800,
                fontStyle: "italic",
                color: "#333",
                lineHeight: 1.1,
              }}
            >
              {branding.motto}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 10 : 10.7,
                lineHeight: 1.1,
                fontWeight: 700,
                color: "#444",
                overflowWrap: "anywhere",
              }}
            >
              {contactLine}
            </div>
          )}

          {branchLine && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 9.9 : 10.7,
                lineHeight: 1.1,
                fontWeight: 850,
                color: "#111",
                overflowWrap: "anywhere",
              }}
            >
              {branchLine}
            </div>
          )}
        </div>

        {showStudentPhoto ? (
          <div
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: 9,
              border: "1.4px solid #111",
              background: "#fafafa",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            {studentPhoto ? (
              <img
                src={studentPhoto}
                alt="Student"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: compact ? 10 : 11,
                  fontWeight: 900,
                  color: "#666",
                  textAlign: "center",
                }}
              >
                PHOTO
              </span>
            )}
          </div>
        ) : (
          // Retain the symmetrical header columns if photos are disabled.
          <div aria-hidden="true" style={{ width: logoSize, height: logoSize }} />
        )}
      </div>

      <div
        style={{
          marginTop: compact ? 3 : 5,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: compact ? 5 : 7,
        }}
      >
        <div
          style={{
            height: 1,
            background: "#111",
            opacity: 0.42,
          }}
        />

        <div
          data-report-color-block="true"
          style={{
            border: "1.2px solid #111",
            background: primary,
            color: contrast,
            borderRadius: 999,
            padding: compact ? "3.5px 12px" : "4.5px 16px",
            fontSize: compact ? 9.5 : 10.5,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {title}
        </div>

        <div
          style={{
            height: 1,
            background: "#111",
            opacity: 0.42,
          }}
        />
      </div>
    </header>
  );
}
