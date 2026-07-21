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
 * - AnnualBroadsheet.tsx
 * - StudentCumulativeTranscript.tsx
 *
 * Mobile Improvements:
 * - Better small-screen rendering.
 * - No dashboard overflow.
 * - Compact WhatsApp-style responsive behavior.
 * - Safer text wrapping.
 * - Better logo scaling.
 * - Cleaner institutional appearance.
 *
 * Workspace-source update:
 * - this component does not fetch or decide school/branch context
 * - it displays the branch/campus supplied by the parent report page/engine
 * - branch display now falls back safely through header.branch, header.branding.branchName,
 *   header.branchName, header.branchLabel and campusName fields
 * - no styling, report computation, or filter behavior changed
 *
 * Media asset display update:
 * - prefers resolved logo URLs supplied by report pages such as StudentReports.tsx
 * - keeps branding.logo as the legacy fallback only
 * - this header remains display-only and does not query Dexie/mediaAssets directly
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

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

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
  const dynamicHeader = header as any;
  const dynamicBranding = branding as any;

  const primary = branding.primaryColor || "var(--primary-color)";

  const logoUrl = firstText(
    dynamicBranding.resolvedLogoUrl,
    dynamicHeader.resolvedLogoUrl,
    dynamicHeader.schoolBranchSetting?.resolvedLogoUrl,
    dynamicHeader.schoolBranchSetting?.logo,
    dynamicHeader.branch?.resolvedLogoUrl,
    dynamicHeader.branch?.logo,
    dynamicHeader.school?.resolvedLogoUrl,
    dynamicHeader.school?.logo,
    branding.logo,
  );

  const branchName = firstText(
    header.branch?.name,
    dynamicHeader.branchName,
    dynamicHeader.branchLabel,
    dynamicHeader.campusName,
    dynamicBranding.branchName,
    dynamicBranding.branchLabel,
    dynamicBranding.campusName,
  );

  const branchAddress = firstText(
    dynamicBranding.branchAddress,
    dynamicHeader.branchAddress,
    dynamicHeader.branch?.address,
    dynamicBranding.address,
  );

  const logoSize = compact ? 56 : orientation === "landscape" ? 74 : 70;

  return (
    <>
      <style>{css}</style>

      <div
        className={`rh-wrapper ${compact ? "compact" : ""} ${orientation}`}
        style={{
          borderBottom: `4px solid ${primary}`,
          color: "#111",
          fontFamily: branding.fontFamily || "Arial, sans-serif",
          ["--report-primary" as any]: primary,
          ["--logo-size" as any]: `${logoSize}px`,
        }}
      >
        <div className="rh-top">
          {showLogo && (
            <div className="rh-logo-wrap">
              {logoUrl ? (
                <img src={logoUrl} alt="School logo" className="rh-logo" />
              ) : (
                <div className="rh-logo-placeholder">LOGO</div>
              )}
            </div>
          )}

          <div className="rh-center">
            <h1 className="rh-school-name">
              {branding.schoolName || "School Name"}
            </h1>

            {branding.motto && <div className="rh-motto">{branding.motto}</div>}

            {showContact && (
              <div className="rh-contact">
                {branchName && <div className="rh-line">{branchName}</div>}

                {branchAddress && (
                  <div className="rh-line">{branchAddress}</div>
                )}

                {(branding.phone || branding.email || branding.website) && (
                  <div className="rh-line rh-contact-row">
                    {branding.phone && <span>Tel: {branding.phone}</span>}

                    {branding.email && <span>Email: {branding.email}</span>}

                    {branding.website && <span>{branding.website}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="rh-title-pill">{title}</div>

            {subtitle && <div className="rh-subtitle">{subtitle}</div>}
          </div>

          {showLogo && <div className="rh-spacer" />}
        </div>

        <div className="rh-meta-grid">
          <div className="rh-meta-item">
            <strong>Academic Level:</strong>
            <span>{header.academicStructure?.name || "-"}</span>
          </div>

          <div className="rh-meta-item">
            <strong>Period:</strong>
            <span>{header.academicPeriod?.name || "-"}</span>
          </div>

          <div className="rh-meta-item">
            <strong>Class:</strong>
            <span>{header.classData?.name || "-"}</span>
          </div>

          <div className="rh-meta-item">
            <strong>Branch:</strong>
            <span>{branchName || "-"}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.rh-wrapper {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding-bottom: 10px;
  margin-bottom: 12px;
}

.rh-top {
  display: grid;
  grid-template-columns: var(--logo-size) minmax(0, 1fr) var(--logo-size);
  align-items: center;
  gap: 12px;
}

.rh-logo-wrap,
.rh-spacer {
  width: var(--logo-size);
  height: var(--logo-size);
  flex: 0 0 auto;
}

.rh-logo-wrap {
  border: 1px solid #ddd;
  border-radius: 14px;
  overflow: hidden;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rh-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.rh-logo-placeholder {
  font-size: 10px;
  color: #777;
  font-weight: 700;
}

.rh-center {
  min-width: 0;
  text-align: center;
}

.rh-school-name {
  margin: 0;
  color: var(--report-primary);
  font-size: 24px;
  line-height: 1.12;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 950;
  overflow-wrap: anywhere;
}

.rh-wrapper.compact .rh-school-name {
  font-size: 18px;
}

.rh-wrapper.landscape .rh-school-name {
  font-size: 24px;
}

.rh-motto {
  margin-top: 3px;
  font-size: 12px;
  font-style: italic;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.rh-wrapper.compact .rh-motto {
  font-size: 10px;
}

.rh-contact {
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.35;
}

.rh-wrapper.compact .rh-contact {
  font-size: 8.5px;
}

.rh-line {
  overflow-wrap: anywhere;
}

.rh-contact-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.rh-title-pill {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  background: #111;
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.9px;
  text-transform: uppercase;
  border-radius: 999px;
  text-align: center;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.rh-wrapper.compact .rh-title-pill {
  padding: 4px 10px;
  font-size: 10px;
}

.rh-subtitle {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #333;
  overflow-wrap: anywhere;
}

.rh-wrapper.compact .rh-subtitle {
  font-size: 9px;
}

.rh-meta-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  font-size: 10px;
}

.rh-wrapper.compact .rh-meta-grid {
  font-size: 8.5px;
}

.rh-meta-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(148,163,184,.08);
  border: 1px solid rgba(148,163,184,.18);
}

.rh-meta-item strong,
.rh-meta-item span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.rh-meta-item span {
  white-space: nowrap;
}

@media (max-width: 720px) {
  .rh-wrapper {
    padding-bottom: 8px;
    margin-bottom: 10px;
  }

  .rh-top {
    grid-template-columns: 54px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
  }

  .rh-spacer {
    display: none;
  }

  .rh-logo-wrap {
    width: 54px;
    height: 54px;
    border-radius: 12px;
  }

  .rh-center {
    text-align: left;
  }

  .rh-school-name {
    font-size: 16px !important;
    letter-spacing: 0.2px;
    line-height: 1.15;
  }

  .rh-motto {
    margin-top: 2px;
    font-size: 9px !important;
  }

  .rh-contact {
    margin-top: 4px;
    font-size: 8px !important;
  }

  .rh-contact-row {
    justify-content: flex-start;
  }

  .rh-title-pill {
    margin-top: 6px;
    width: 100%;
    justify-content: center;
    padding: 5px 10px;
    font-size: 9px !important;
    border-radius: 999px;
  }

  .rh-subtitle {
    margin-top: 4px;
    font-size: 8px !important;
    line-height: 1.35;
  }

  .rh-meta-grid {
    margin-top: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    font-size: 8px !important;
  }

  .rh-meta-item {
    padding: 5px 6px;
    border-radius: 9px;
  }
}

@media (max-width: 420px) {
  .rh-top {
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 8px;
  }

  .rh-logo-wrap {
    width: 46px;
    height: 46px;
    border-radius: 10px;
  }

  .rh-school-name {
    font-size: 14px !important;
  }

  .rh-motto {
    font-size: 8px !important;
  }

  .rh-contact {
    font-size: 7.5px !important;
  }

  .rh-title-pill {
    font-size: 8px !important;
    padding: 4px 8px;
  }

  .rh-subtitle {
    font-size: 7.5px !important;
  }

  .rh-meta-grid {
    grid-template-columns: 1fr;
  }
}

@media print {
  .rh-wrapper {
    overflow: visible !important;
  }
}
`;
