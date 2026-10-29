"use client";

/**
 * reports/shared/headers/broadsheets/BroadsheetExecutiveHeader.tsx
 * ---------------------------------------------------------------
 * ELEEVEON SCHOOLS — EXECUTIVE BROADSHEET HEADER
 * ---------------------------------------------------------------
 *
 * Premium leadership-facing header for subject, class and annual broadsheets.
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
  if (kind === "class") return "Class Performance Broadsheet";
  if (kind === "annual") return "Annual Performance Review";
  return "Subject Performance Broadsheet";
}

export default function BroadsheetExecutiveHeader({
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
  const primary = branding.primaryColor || "#1e293b";

  const displayTitle = firstText(
    title,
    settings.broadsheetTitleLabel,
    fallbackTitle(kind),
  );

  const generated =
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

  return (
    <header
      className="broadsheet-executive-header"
      style={{
        position: "relative",
        marginBottom: compact ? 8 : 10,
        border: "1px solid #cbd5e1",
        borderRadius: 14,
        overflow: "hidden",
        background: "#fff",
        fontFamily: branding.fontFamily || "Arial, sans-serif",
        boxShadow: "0 12px 30px rgba(15,23,42,.08)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            settings.showBroadsheetLogo && branding.logo
              ? `${compact ? 44 : 52}px minmax(0,1fr) ${compact ? 195 : 230}px`
              : `minmax(0,1fr) ${compact ? 195 : 230}px`,
          gap: compact ? 10 : 13,
          alignItems: "center",
          padding: compact ? "5px 11px" : "9px 14px",
          background: "#ffffff",
        }}
      >
        {settings.showBroadsheetLogo && branding.logo && (
          <div
            style={{
              width: compact ? 44 : 52,
              height: compact ? 44 : 52,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={branding.logo}
              alt="School logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 5,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 15.5 : 18.5,
              fontWeight: 950,
              lineHeight: 1.03,
              textTransform: "uppercase",
              letterSpacing: 0.25,
              color: "#0f172a",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || branding.branchName) && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 9.2 : 10,
                fontWeight: 760,
                color: "#475569",
              }}
            >
              {[branding.motto, branding.branchName]
                .filter(Boolean)
                .join("  •  ")}
            </div>
          )}

          <div
            style={{
              marginTop: 4,
              fontSize: compact ? 9.2 : 10,
              fontWeight: 650,
              color: "#475569",
            }}
          >
            {[branding.address, branding.phone, branding.email]
              .filter(Boolean)
              .join("  •  ")}
          </div>
        </div>

        <div
          data-report-color-block="true"
          style={{
            minWidth: 0,
            padding: compact ? "7px 11px" : "9px 13px",
            borderRadius: 12,
            background: `linear-gradient(135deg, ${primary}, #0f172a)`,
            color: "#fff",
            boxShadow: "0 10px 24px rgba(15,23,42,.16)",
          }}
        >
          <div
            style={{
              fontSize: compact ? 9.5 : 10.4,
              fontWeight: 950,
              lineHeight: 1.07,
              textTransform: "uppercase",
              letterSpacing: 0.28,
            }}
          >
            {displayTitle}
          </div>

          {subtitle && (
            <div
              style={{
                marginTop: 2,
                fontSize: compact ? 8.5 : 9.3,
                fontWeight: 720,
                opacity: 0.92,
                lineHeight: 1.08,
              }}
            >
              {subtitle}
            </div>
          )}

          {generated && (
            <div
              style={{
                marginTop: 5,
                paddingTop: 3,
                borderTop: "1px solid rgba(255,255,255,.25)",
                fontSize: compact ? 8 : 8.7,
                fontWeight: 760,
              }}
            >
              {settings.broadsheetGeneratedDateLabel || "Generated"}:{" "}
              {generated}
            </div>
          )}
        </div>
      </div>

      {metadata.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(metadata.length, 6)}, minmax(0,1fr))`,
            borderTop: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          {metadata.map((item, index) => (
            <div
              key={`${item.label}-${item.value}`}
              style={{
                minWidth: 0,
                padding: compact ? "2px 8px" : "4px 9px",
                borderLeft: index === 0 ? "0" : "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: compact ? 7.8 : 8.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: 0.25,
                  color: "#475569",
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  marginTop: 1,
                  fontSize: compact ? 9 : 9.7,
                  fontWeight: 900,
                  color: "#0f172a",
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

      <div
        aria-hidden="true"
        style={{
          height: 4,
          background: `linear-gradient(90deg, ${primary}, #0f172a, ${primary})`,
        }}
      />

      <style>{`
        @media print {
          .broadsheet-executive-header {
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .broadsheet-executive-header [data-report-color-block="true"] {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        }
      `}</style>
    </header>
  );
}
