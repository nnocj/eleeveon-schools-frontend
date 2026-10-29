"use client";

/**
 * reports/shared/headers/LetterHeadPremiumHeader.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — LETTERHEAD PREMIUM REPORT HEADER
 * ---------------------------------------------------------
 *
 * Visual direction:
 * - premium institutional letterhead, not a tall certificate header
 * - compact height so subject results remain the main page content
 * - crest/logo + school identity + report title in one efficient row
 * - thin ornamental divider and metadata strip instead of bulky cards
 * - decorative line work, not heavy floral blocks that waste vertical space
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

export default function LetterHeadPremiumHeader({
  header,
  dataset,
  title = "Terminal / Periodic Academic Report",
  primaryColor,
  fontFamily,
  compact = false,
}: ReportTemplateHeaderProps) {
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
    .join("  •  ");

  const branchLine = [branding.branchName, branding.branchAddress]
    .filter(Boolean)
    .join(" · ");
  const logoSize = compact ? 46 : 52;

  return (
    <header
      className="letterhead-premium-report-header"
      style={{
        fontFamily:
          fontFamily ||
          branding.fontFamily ||
          "Georgia, 'Times New Roman', serif",
        color: "#111827",
        position: "relative",
        overflow: "hidden",
        border: "1px double #b7a981",
        borderRadius: 8,
        background: "linear-gradient(180deg, #fffdf8, #ffffff)",
        boxShadow: "0 6px 18px rgba(15,23,42,.045)",
      }}
    >
      <div
        aria-hidden="true"
        data-report-color-block="true"
        style={{
          height: compact ? 5 : 6,
          background: `linear-gradient(90deg, ${primary}, #111827 50%, ${primary})`,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${logoSize + 7}px minmax(0, 1fr) ${compact ? 126 : 150}px`,
          gap: compact ? 8 : 10,
          alignItems: "center",
          padding: compact ? "0px 9px 1px" : "5px 11px 5px",
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            border: `1px double ${primary}`,
            borderRadius: 6,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 4,
              border: "1px solid #eadfbe",
              borderRadius: 4,
            }}
          />
          {branding.logo ? (
            <img
              src={branding.logo}
              alt="School logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 6,
                boxSizing: "border-box",
                position: "relative",
                zIndex: 1,
              }}
            />
          ) : (
            <span
              style={{
                fontSize: compact ? 8 : 8.7,
                fontWeight: 950,
                color: primary,
                textAlign: "center",
                lineHeight: 1.05,
                textTransform: "uppercase",
                position: "relative",
                zIndex: 1,
              }}
            >
              School
              <br />
              Crest
            </span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 17 : 19.5,
              lineHeight: 1.02,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.35,
              color: "#111827",
              overflowWrap: "anywhere",
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 9.5 : 10.3,
                fontWeight: 760,
                fontStyle: "italic",
                color: "#5f5642",
                lineHeight: 1.08,
              }}
            >
              “{branding.motto}”
            </div>
          )}

          {contactLine && (
            <div
              style={{
                marginTop: 1,
                fontSize: compact ? 9.4 : 10.2,
                lineHeight: 1.08,
                fontWeight: 700,
                color: "#475569",
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
                fontSize: compact ? 9.4 : 10.2,
                lineHeight: 1.08,
                fontWeight: 900,
                color: primary,
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
            alignSelf: "stretch",
            borderRadius: 6,
            background: primary,
            color: contrast,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: compact ? "6px 8px" : "7px 10px",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.24)",
            minHeight: logoSize,
          }}
        >
          <div
            style={{
              fontSize: compact ? 9 : 9.7,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.45,
              lineHeight: 1.12,
            }}
          >
            {title}
          </div>
          <div
            aria-hidden="true"
            style={{
              width: "74%",
              height: 1,
              margin: "3px 0 2px",
              background: "rgba(255,255,255,.72)",
            }}
          />
          <div
            style={{
              fontSize: compact ? 8 : 8.7,
              fontWeight: 850,
              letterSpacing: 0.25,
              opacity: 0.95,
            }}
          >
            Official Academic Record
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 11px",
          color: primary,
          fontWeight: 950,
          lineHeight: 1,
        }}
      >
        <span style={{ flex: 1, height: 1, background: "#e7ddbf" }} />
        <span style={{ fontSize: compact ? 8 : 9}}>◆</span>
        <span style={{ flex: 1, height: 1, background: "#e7ddbf" }} />
      </div>

    </header>
  );
}
