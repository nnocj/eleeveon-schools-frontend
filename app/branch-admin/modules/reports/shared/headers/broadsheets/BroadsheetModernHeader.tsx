"use client";

/**
 * reports/shared/headers/broadsheets/BroadsheetModernHeader.tsx
 * ------------------------------------------------------------
 * ELEEVEON SCHOOLS — MODERN BROADSHEET HEADER
 * ------------------------------------------------------------
 *
 * Compact contemporary header shared by:
 * - subject broadsheets
 * - class broadsheets
 * - annual cumulative broadsheets
 *
 * Design language:
 * - compact horizontal composition
 * - soft identity panel
 * - branded document badge
 * - rounded metadata chips
 * - restrained shadows and borders
 * - safe black-and-white printing
 */

import React from "react";

import type {
  BroadsheetKind,
  ResolvedBroadsheetBranding,
  ResolvedBroadsheetTemplateSettings,
} from "../../../broadsheet-templates/broadsheet-template-types";

import {
  firstText,
  friendlyDate,
} from "../../../broadsheet-templates/broadsheet-template-utils";

type Props = {
  kind: BroadsheetKind;
  branding: ResolvedBroadsheetBranding;
  settings: ResolvedBroadsheetTemplateSettings;
  title?: string;
  subtitle?: string;
  academicStructureName?: string;
  academicPeriodName?: string;
  className?: string;
  subjectName?: string;
  teacherName?: string;
  academicYear?: string;
  generatedAt?: string | number | Date;
  compact?: boolean;
};

function fallbackTitle(kind: BroadsheetKind) {
  if (kind === "class") return "Class Broadsheet";
  if (kind === "annual") return "Annual Cumulative Broadsheet";
  return "Subject Broadsheet";
}

export default function BroadsheetModernHeader({
  kind,
  branding,
  settings,
  title,
  subtitle,
  academicStructureName,
  academicPeriodName,
  className,
  subjectName,
  teacherName,
  academicYear,
  generatedAt,
  compact = false,
}: Props) {
  const primary = branding.primaryColor || "#2563eb";

  const displayTitle = firstText(
    title,
    settings.broadsheetTitleLabel,
    fallbackTitle(kind),
  );

  const generatedDate =
    settings.showBroadsheetGeneratedDate && generatedAt
      ? friendlyDate(generatedAt)
      : "";

  const metadata = [
    academicStructureName
      ? { label: "Structure", value: academicStructureName }
      : null,
    academicPeriodName ? { label: "Period", value: academicPeriodName } : null,
    academicYear ? { label: "Year", value: academicYear } : null,
    className ? { label: "Class", value: className } : null,
    subjectName ? { label: "Subject", value: subjectName } : null,
    teacherName ? { label: "Teacher", value: teacherName } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const contactLine = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email,
    branding.website,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <header
      className="broadsheet-modern-header"
      style={{
        position: "relative",
        overflow: "hidden",
        marginBottom: compact ? 7 : 9,
        padding: compact ? 8 : 10,
        border: "1px solid #dbe3ee",
        borderRadius: compact ? 13 : 16,
        background: "#ffffff",
        color: "#172033",
        fontFamily: branding.fontFamily || "Arial, sans-serif",
        boxShadow: "0 8px 24px rgba(15,23,42,.055)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          width: compact ? 5 : 6,
          background: primary,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            settings.showBroadsheetLogo && branding.logo
              ? `${compact ? 42 : 50}px minmax(0,1fr) ${compact ? 175 : 210}px`
              : `minmax(0,1fr) ${compact ? 175 : 210}px`,
          gap: compact ? 8 : 11,
          alignItems: "center",
          paddingInlineStart: compact ? 3 : 5,
        }}
      >
        {settings.showBroadsheetLogo && branding.logo && (
          <div
            style={{
              width: compact ? 42 : 50,
              height: compact ? 42 : 50,
              border: "1px solid #dbe3ee",
              borderRadius: compact ? 11 : 14,
              overflow: "hidden",
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            <img
              src={branding.logo}
              alt="School logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: compact ? 4 : 5,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 14.5 : 17.5,
              lineHeight: 1.05,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.2,
              color: "#172033",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || branding.branchName) && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 7 : 7.8,
                lineHeight: 1.2,
                fontWeight: 760,
                color: "#475569",
                overflowWrap: "anywhere",
              }}
            >
              {[branding.motto, branding.branchName]
                .filter(Boolean)
                .join("  •  ")}
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 6.3 : 7,
                lineHeight: 1.22,
                fontWeight: 650,
                color: "#64748b",
                overflowWrap: "anywhere",
              }}
            >
              {contactLine}
            </div>
          )}
        </div>

        <div
          data-report-color-block="true"
          style={{
            minWidth: 0,
            borderRadius: compact ? 12 : 14,
            padding: compact ? "7px 9px" : "8px 11px",
            background: `linear-gradient(135deg, ${primary}, ${primary}dd)`,
            color: "#fff",
            textAlign: "left",
            boxShadow: "0 8px 18px rgba(15,23,42,.12)",
          }}
        >
          <div
            style={{
              fontSize: compact ? 8.3 : 9.5,
              fontWeight: 950,
              lineHeight: 1.12,
              textTransform: "uppercase",
              letterSpacing: 0.24,
              overflowWrap: "anywhere",
            }}
          >
            {displayTitle}
          </div>

          {subtitle && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 6.3 : 7,
                fontWeight: 720,
                lineHeight: 1.2,
                opacity: 0.92,
                overflowWrap: "anywhere",
              }}
            >
              {subtitle}
            </div>
          )}

          {generatedDate && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: "1px solid rgba(255,255,255,.28)",
                fontSize: compact ? 5.9 : 6.5,
                fontWeight: 800,
                lineHeight: 1.15,
                opacity: 0.95,
              }}
            >
              {settings.broadsheetGeneratedDateLabel || "Generated"}:{" "}
              {generatedDate}
            </div>
          )}
        </div>
      </div>

      {metadata.length > 0 && (
        <div
          style={{
            marginTop: compact ? 7 : 9,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(metadata.length, 6)}, minmax(0,1fr))`,
            gap: compact ? 4 : 6,
            paddingInlineStart: compact ? 3 : 5,
          }}
        >
          {metadata.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              style={{
                minWidth: 0,
                border: "1px solid #e2e8f0",
                borderRadius: compact ? 9 : 11,
                background: "#f8fafc",
                padding: compact ? "4px 6px" : "5px 7px",
              }}
            >
              <div
                style={{
                  fontSize: compact ? 5.6 : 6.2,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: 0.22,
                  color: "#64748b",
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  marginTop: 1,
                  fontSize: compact ? 7 : 7.8,
                  fontWeight: 880,
                  color: "#172033",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          .broadsheet-modern-header {
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .broadsheet-modern-header [data-report-color-block="true"] {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        }
      `}</style>
    </header>
  );
}
