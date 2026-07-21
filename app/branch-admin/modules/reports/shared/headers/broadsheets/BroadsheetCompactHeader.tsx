"use client";

/**
 * reports/shared/headers/broadsheets/BroadsheetCompactHeader.tsx
 * -------------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT BROADSHEET HEADER
 * -------------------------------------------------------------
 *
 * Dense, low-height identity header for subject, class and annual broadsheets.
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

export default function BroadsheetCompactHeader({
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

  const meta = [
    academicStructureName,
    academicPeriodName,
    academicYear,
    className,
    subjectName,
    teacherName,
  ].filter(Boolean);

  const generated =
    settings.showBroadsheetGeneratedDate && generatedAt
      ? friendlyDate(generatedAt)
      : "";

  return (
    <header
      className="broadsheet-compact-header"
      style={{
        display: "grid",
        gridTemplateColumns:
          settings.showBroadsheetLogo && branding.logo
            ? `${compact ? 30 : 34}px minmax(0,1fr) auto`
            : "minmax(0,1fr) auto",
        alignItems: "center",
        gap: compact ? 6 : 8,
        marginBottom: compact ? 4 : 5,
        padding: compact ? "5px 7px" : "6px 8px",
        border: "1px solid #cbd5e1",
        borderLeft: `4px solid ${primary}`,
        borderRadius: 6,
        background: "#fff",
        color: "#111827",
        fontFamily: branding.fontFamily || "Arial, sans-serif",
      }}
    >
      {settings.showBroadsheetLogo && branding.logo && (
        <img
          src={branding.logo}
          alt="School logo"
          style={{
            width: compact ? 30 : 34,
            height: compact ? 30 : 34,
            objectFit: "contain",
          }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 11.2 : 12.6,
            fontWeight: 950,
            lineHeight: 1.02,
            textTransform: "uppercase",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {branding.schoolName}
        </div>

        <div
          style={{
            marginTop: 1,
            fontSize: compact ? 5.9 : 6.6,
            fontWeight: 760,
            color: "#64748b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[branding.branchName, ...meta].filter(Boolean).join(" • ")}
        </div>
      </div>

      <div style={{ textAlign: "right", minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 7.2 : 8,
            fontWeight: 950,
            textTransform: "uppercase",
            color: primary,
            whiteSpace: "nowrap",
          }}
        >
          {displayTitle}
        </div>

        {subtitle && (
          <div
            style={{
              marginTop: 1,
              fontSize: compact ? 5.5 : 6.1,
              fontWeight: 700,
              color: "#475569",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}

        {generated && (
          <div
            style={{
              marginTop: 1,
              fontSize: compact ? 5.2 : 5.8,
              fontWeight: 760,
              color: "#64748b",
              whiteSpace: "nowrap",
            }}
          >
            {settings.broadsheetGeneratedDateLabel || "Generated"}: {generated}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .broadsheet-compact-header {
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </header>
  );
}
