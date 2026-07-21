"use client";

import React from "react";
import type {
  CumulativeReportBookDataset,
  CumulativeReportBookSettings,
} from "./cumulative-book-types";
import {
  bookPageStyle,
  resolveBookBranding,
  templateTone,
  firstText,
} from "./cumulative-book-utils";

type Props = {
  dataset?: CumulativeReportBookDataset | null;
  template?: any;
  settings?: CumulativeReportBookSettings | null;
  compact?: boolean;
  pageBreakAfter?: boolean;
};

export default function CumulativeBookBackCover({
  dataset,
  template,
  settings,
  compact = false,
  pageBreakAfter = false,
}: Props) {
  const branding = resolveBookBranding(dataset);
  const tone = templateTone(template, settings);
  const primary = branding.primaryColor || "#1d4ed8";

  const page = bookPageStyle({
    primary,
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    compact,
    pageBreakAfter,
    tone,
  });

  return (
    <section
      className="print-page cumulative-book-page cumulative-book-back-cover"
      style={page}
    >
      <div
        style={{
          minHeight: "267mm",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          textAlign: "center",
        }}
      >
        <div />

        <div style={{ margin: "0 auto", maxWidth: 520 }}>
          {branding.logo && (
            <img
              src={branding.logo}
              alt="School logo"
              style={{
                width: compact ? 70 : 86,
                height: compact ? 70 : 86,
                objectFit: "contain",
                marginBottom: 18,
              }}
            />
          )}

          <div
            style={{
              fontSize: compact ? 18 : 22,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {branding.schoolName}
          </div>

          {branding.motto && (
            <div
              style={{
                marginTop: 6,
                fontSize: compact ? 10 : 11.5,
                fontStyle: "italic",
                color: "#4b5563",
                fontWeight: 750,
              }}
            >
              {branding.motto}
            </div>
          )}

          <div
            style={{
              margin: "20px auto",
              width: 120,
              height: tone === "transcript" ? 2 : 4,
              background: primary,
              borderRadius: 999,
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: compact ? 10 : 11.5,
              lineHeight: 1.55,
              color: "#374151",
              fontWeight: 720,
            }}
          >
            {firstText(
              settings?.footerText,
              "This cumulative academic report book is generated from published school report snapshots and is intended as an official record of the learner's academic journey.",
            )}
          </p>
        </div>

        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: "#4b5563",
            fontWeight: 750,
            display: "grid",
            gap: 3,
          }}
        >
          <span>
            {[
              branding.address,
              branding.phone,
              branding.email,
              branding.website,
            ]
              .filter(Boolean)
              .join(" • ")}
          </span>
          <span>Powered by Eleeveon School Management System</span>
        </div>
      </div>
    </section>
  );
}
