"use client";

/**
 * reports/broadsheet-templates/shared/BroadsheetClassicHeader.tsx
 * ----------------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC BROADSHEET HEADER
 * ----------------------------------------------------------------
 * Compact formal header shared by subject, class and annual broadsheets.
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

export default function BroadsheetClassicHeader({
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
  const displayTitle = firstText(
    title,
    settings.broadsheetTitleLabel,
    fallbackTitle(kind),
  );

  const meta = [
    academicStructureName
      ? { label: "Academic Structure", value: academicStructureName }
      : null,
    academicPeriodName
      ? { label: "Academic Period", value: academicPeriodName }
      : null,
    academicYear ? { label: "Academic Year", value: academicYear } : null,
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
      style={{
        color: "#111",
        fontFamily: branding.fontFamily || "Arial, sans-serif",
        marginBottom: compact ? 7 : 9,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            settings.showBroadsheetLogo && branding.logo
              ? `${compact ? 45 : 54}px minmax(0,1fr) auto`
              : "minmax(0,1fr) auto",
          alignItems: "center",
          gap: compact ? 8 : 11,
          padding: compact ? "4px 7px" : "6px 9px",
          borderTop: "3px double #111",
          borderBottom: "3px double #111",
          background: "#fff",
        }}
      >
        {settings.showBroadsheetLogo && branding.logo && (
          <div
            style={{
              width: compact ? 45 : 54,
              height: compact ? 45 : 54,
              border: "1px solid #111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              background: "#fff",
            }}
          >
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
          </div>
        )}

        <div style={{ minWidth: 0, textAlign: "center" }}>
          <div
            style={{
              fontSize: compact ? 14 : 17,
              lineHeight: 1.06,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.35,
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {(branding.motto || branding.branchName) && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 9.1 : 9.9,
                fontWeight: 750,
                lineHeight: 1.06,
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
                marginTop: 1,
                fontSize: compact ? 9.2 : 10,
                lineHeight: 1.06,
                color: "#333",
                overflowWrap: "anywhere",
              }}
            >
              {contactLine}
            </div>
          )}
        </div>

        <div
          style={{
            minWidth: compact ? 170 : 205,
            maxWidth: compact ? 215 : 250,
            border: "1px solid #111",
            padding: compact ? "5px 8px" : "6px 10px",
            textAlign: "center",
            background: "#f5f5f5",
          }}
        >
          <div
            style={{
              fontSize: compact ? 9.5 : 11,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.35,
              lineHeight: 1.15,
            }}
          >
            {displayTitle}
          </div>
          {subtitle && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 8.5 : 9.2,
                lineHeight: 1.06,
                fontWeight: 750,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {meta.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(meta.length, 6)}, minmax(0,1fr))`,
            borderLeft: "1px solid #111",
            borderBottom: "1px solid #111",
            background: "#fff",
          }}
        >
          {meta.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              style={{
                minWidth: 0,
                padding: compact ? "1px 5px" : "1px 6px",
                borderRight: "1px solid #111",
              }}
            >
              <div
                style={{
                  fontSize: compact ? 7.8 : 8.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: 0.08,
                  color: "#444",
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  marginTop: 0,
                  fontSize: compact ? 9 : 9.7,
                  fontWeight: 850,
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

      {settings.showBroadsheetGeneratedDate && (
        <div
          style={{
            marginTop: 2,
            textAlign: "right",
            fontSize: compact ? 8.2 : 8.9,
            fontWeight: 750,
          }}
        >
          {settings.broadsheetGeneratedDateLabel || "Generated"}:{" "}
          {friendlyDate(generatedAt || new Date())}
        </div>
      )}
    </header>
  );
}
