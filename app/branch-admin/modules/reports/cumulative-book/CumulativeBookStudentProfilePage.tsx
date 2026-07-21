"use client";

import React from "react";
import type {
  CumulativeReportBookDataset,
  CumulativeReportBookSettings,
} from "./cumulative-book-types";
import {
  bookPageStyle,
  resolveBookBranding,
  resolveBookStudent,
  templateTone,
  sectionTitleStyle,
  firstText,
} from "./cumulative-book-utils";

type Props = {
  dataset?: CumulativeReportBookDataset | null;
  template?: any;
  settings?: CumulativeReportBookSettings | null;
  compact?: boolean;
  pageBreakAfter?: boolean;
};

export default function CumulativeBookStudentProfilePage({
  dataset,
  template,
  settings,
  compact = false,
  pageBreakAfter = true,
}: Props) {
  const branding = resolveBookBranding(dataset);
  const student = resolveBookStudent(dataset);
  const tone = templateTone(template, settings);
  const primary = branding.primaryColor || "#1d4ed8";

  const page = bookPageStyle({
    primary,
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    compact,
    pageBreakAfter,
    tone,
  });

  const info = [
    ["Student Name", student.fullName],
    ["Admission Number", student.admissionNumber],
    ["Gender", student.gender],
    ["Current / Latest Class", student.className],
    ["Date of Birth", student.dateOfBirth],
    ["Parent / Guardian", student.parentName],
    ["Parent Phone", student.parentPhone],
    ["Parent Email", student.parentEmail],
    ["Address", student.address],
  ].filter(([, value]) => firstText(value));

  return (
    <section
      className="print-page cumulative-book-page cumulative-book-student-profile"
      style={page}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: `2px solid ${primary}`,
          paddingBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: compact ? 8 : 9,
              fontWeight: 900,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Cumulative Report Book
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: compact ? 18 : 21,
              fontWeight: 950,
            }}
          >
            {branding.schoolName}
          </div>
        </div>
        {branding.logo && (
          <img
            src={branding.logo}
            alt="School logo"
            style={{
              width: compact ? 40 : 48,
              height: compact ? 40 : 48,
              objectFit: "contain",
            }}
          />
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Student Profile</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              settings?.showStudentPhoto === false ? "1fr" : "116px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {settings?.showStudentPhoto !== false && (
            <div
              style={{
                border: "1px solid #d1d5db",
                borderRadius: tone === "transcript" ? 0 : 16,
                height: 136,
                overflow: "hidden",
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {firstText(
                student.photo,
                (student as any).studentPhoto,
                (student as any).resolvedPhotoUrl,
                (student as any).resolvedStudentPhotoUrl,
              ) ? (
                <img
                  src={firstText(
                    student.photo,
                    (student as any).studentPhoto,
                    (student as any).resolvedPhotoUrl,
                    (student as any).resolvedStudentPhotoUrl,
                  )}
                  alt="Student"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{ fontSize: 10, fontWeight: 900, color: "#6b7280" }}
                >
                  PHOTO
                </span>
              )}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {info.map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: tone === "transcript" ? 0 : 12,
                  padding: compact ? 7 : 9,
                  background: "rgba(255,255,255,.78)",
                }}
              >
                <div
                  style={{
                    fontSize: compact ? 7 : 7.8,
                    color: "#6b7280",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: 0.35,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: compact ? 10 : 11,
                    fontWeight: 850,
                    color: "#111827",
                    overflowWrap: "anywhere",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Report Coverage</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <Stat
            label="Published Periods"
            value={String(dataset?.periods?.length || 0)}
            tone={tone}
            compact={compact}
          />
          <Stat
            label="First Period"
            value={dataset?.summary?.firstPeriodName || "-"}
            tone={tone}
            compact={compact}
          />
          <Stat
            label="Latest Period"
            value={dataset?.summary?.latestPeriodName || "-"}
            tone={tone}
            compact={compact}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={sectionTitleStyle(primary, tone)}>Purpose of This Book</h2>
        <p
          style={{
            margin: 0,
            fontSize: compact ? 10 : 11,
            lineHeight: 1.55,
            color: "#374151",
            fontWeight: 650,
          }}
        >
          This booklet assembles the learner's published academic report cards
          across the available academic periods. It is designed for parent
          review, school archives, transfers, progression discussions and
          long-term academic tracking.
        </p>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string;
  tone: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: tone === "transcript" ? 0 : 12,
        padding: compact ? 8 : 10,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: compact ? 7 : 7.8,
          color: "#6b7280",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: compact ? 11 : 12.5,
          fontWeight: 950,
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}
