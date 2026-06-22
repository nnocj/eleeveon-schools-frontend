"use client";

/**
 * reports/components/AnnualBroadsheet.tsx
 * ---------------------------------------------------------
 * CUMULATIVE / ANNUAL CLASS BROADSHEET
 * ---------------------------------------------------------
 *
 * Renders class-wide cumulative performance from historical
 * StudentReportSnapshot records.
 *
 * Mobile Enhancement:
 * - Original landscape print layout preserved.
 * - Mobile-first preview shell added.
 * - Small-screen scaled preview.
 * - Expand mode for detailed inspection.
 * - Dashboard overflow protection.
 * - Safe isolated horizontal scrolling.
 */

import React, { useState } from "react";

import ReportHeader from "./ReportHeader";

import type { AnnualBroadsheet as AnnualBroadsheetData } from "../engine/cumulative-report-types";
import type { ReportHeaderData } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  broadsheet?: AnnualBroadsheetData;
  header: ReportHeaderData;
  compact?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;
};

// ======================================================
// HELPERS
// ======================================================

const formatNumber = (value?: number, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "0";
  return Number(value).toFixed(decimals);
};

const ordinal = (value?: number) => {
  if (!value) return "-";

  const suffixes = ["th", "st", "nd", "rd"];
  const mod100 = value % 100;

  return `${value}${
    suffixes[(mod100 - 20) % 10] ||
    suffixes[mod100] ||
    suffixes[0]
  }`;
};

const decisionLabel = (value?: string) => {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// ======================================================
// COMPONENT
// ======================================================

export default function AnnualBroadsheet({
  broadsheet,
  header,
  compact = false,
  pageBreakAfter = true,
  mobilePreview = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const branding = header.branding;
  const primary = branding.primaryColor || "var(--primary-color)";

  const page: React.CSSProperties = {
    width: "297mm",
    minHeight: "210mm",
    margin: "0 auto 20px",
    padding: compact ? "8mm" : "10mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
    pageBreakAfter: pageBreakAfter ? "always" : "auto",
    overflow: "hidden",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: compact ? 7.5 : 8.5,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 4,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 4,
    verticalAlign: "middle",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };

  const emptyState = (
    <section style={page}>
      <ReportHeader
        header={header}
        title="Annual Cumulative Broadsheet"
        orientation="landscape"
        compact={compact}
      />

      <div
        style={{
          padding: 20,
          border: "1px dashed #bbb",
          borderRadius: 12,
          textAlign: "center",
          fontWeight: 700,
        }}
      >
        Select a class and historical period range to generate the annual cumulative broadsheet.
      </div>
    </section>
  );

  if (!broadsheet) {
    return (
      <div className="ab-shell">
        <style>{css}</style>
        {emptyState}
      </div>
    );
  }

  const reportPage = (
    <section
      className="print-page report-page-break annual-broadsheet-page ab-a4-page"
      style={page}
    >
      <ReportHeader
        header={header}
        title="Annual Cumulative Broadsheet"
        subtitle={`${broadsheet.className || "Class"} • ${broadsheet.academicYear || "Multiple Years"} • ${broadsheet.totalStudents} Students`}
        orientation="landscape"
        compact={compact}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 10,
          fontSize: compact ? 8 : 9,
        }}
      >
        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Class:</strong> {broadsheet.className || "-"}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Year:</strong> {broadsheet.academicYear || "-"}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Periods:</strong> {broadsheet.totalPeriods}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Students:</strong> {broadsheet.totalStudents}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Subjects:</strong> {broadsheet.totalSubjects}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Class Avg.:</strong> {formatNumber(broadsheet.classAverage, 1)}%
        </div>
      </div>

      <div
        style={{
          marginBottom: 8,
          fontSize: compact ? 8 : 9,
          fontWeight: 700,
          opacity: 0.85,
        }}
      >
        Periods: {broadsheet.periodNames.length ? broadsheet.periodNames.join(" • ") : "-"}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>#</th>

              <th
                style={{
                  ...th,
                  textAlign: "left",
                  minWidth: 170,
                }}
              >
                Student Name
              </th>

              {broadsheet.subjectColumns.map((subject) => (
                <th key={subject.subjectId || subject.subjectName} style={th}>
                  {subject.shortName || subject.subjectCode || subject.subjectName}
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 7,
                      opacity: 0.9,
                      maxWidth: 60,
                      whiteSpace: "normal",
                    }}
                  >
                    {subject.subjectName}
                  </div>
                </th>
              ))}

              <th style={th}>Periods</th>
              <th style={th}>Subjects</th>
              <th style={th}>Total</th>
              <th style={th}>Avg.</th>
              <th style={th}>GPA</th>
              <th style={th}>Position</th>
              <th style={th}>Decision</th>
            </tr>
          </thead>

          <tbody>
            {broadsheet.students.map((student, index) => (
              <tr key={student.studentId}>
                <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>

                <td style={{ ...td, fontWeight: 800 }}>
                  {student.studentName}

                  {student.admissionNumber && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 7.5,
                        opacity: 0.7,
                        fontWeight: 600,
                      }}
                    >
                      {student.admissionNumber}
                    </div>
                  )}

                  {student.className && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 7.5,
                        opacity: 0.7,
                        fontWeight: 600,
                      }}
                    >
                      {student.className}
                    </div>
                  )}
                </td>

                {broadsheet.subjectColumns.map((subjectColumn) => {
                  const subject = student.subjects.find((item) => {
                    if (subjectColumn.subjectId && item.subjectId) {
                      return item.subjectId === subjectColumn.subjectId;
                    }

                    return item.subjectName === subjectColumn.subjectName;
                  });

                  return (
                    <td
                      key={`${student.studentId}-${subjectColumn.subjectId || subjectColumn.subjectName}`}
                      style={{
                        ...td,
                        textAlign: "center",
                        fontWeight: 800,
                      }}
                    >
                      {subject ? (
                        <>
                          <div>{formatNumber(subject.average, 1)}%</div>
                          <div
                            style={{
                              fontSize: 7,
                              opacity: 0.72,
                              fontWeight: 700,
                            }}
                          >
                            {subject.grade || "-"}
                          </div>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}

                <td style={{ ...td, textAlign: "center" }}>{student.periodsCount}</td>
                <td style={{ ...td, textAlign: "center" }}>{student.subjectsCount}</td>

                <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                  {formatNumber(student.total, 1)}
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                  {formatNumber(student.average, 1)}%
                </td>

                <td style={{ ...td, textAlign: "center" }}>
                  {student.gpa != null ? formatNumber(student.gpa, 2) : "-"}
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                  {ordinal(student.position)}
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                  {decisionLabel(student.finalDecision || student.recommendation)}
                </td>
              </tr>
            ))}

            {!broadsheet.students.length && (
              <tr>
                <td
                  style={{ ...td, textAlign: "center", padding: 16 }}
                  colSpan={broadsheet.subjectColumns.length + 9}
                >
                  No cumulative student records found for this selected class and period range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Highest Average</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{formatNumber(broadsheet.highestAverage, 1)}%</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Lowest Average</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{formatNumber(broadsheet.lowestAverage, 1)}%</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Class Average</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{formatNumber(broadsheet.classAverage, 1)}%</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Promoted</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{broadsheet.promotionCount}</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Repeated</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{broadsheet.repeatCount}</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 8.5, opacity: 0.75, fontWeight: 700 }}>Graduated</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{broadsheet.graduateCount}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          borderTop: `2px solid ${primary}`,
          paddingTop: 5,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 8.5,
          color: "#555",
        }}
      >
        <span>Official cumulative broadsheet generated for {branding.schoolName}</span>
        <span>Powered by Eleeveon School Management System</span>
      </div>
    </section>
  );

  if (!mobilePreview) {
    return (
      <div className="ab-shell">
        <style>{css}</style>
        {reportPage}
      </div>
    );
  }

  return (
    <div className={`ab-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="ab-toolbar report-no-print">
        <div>
          <strong>{broadsheet.className || "Annual Broadsheet"}</strong>
          <span>
            {broadsheet.academicYear || "Multiple Years"} · {broadsheet.totalStudents} students · {broadsheet.totalSubjects} subjects
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="ab-preview-scroll report-screen-scroll">
        <div className="ab-preview-scale">
          {reportPage}
        </div>
      </div>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.ab-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.ab-toolbar {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 18px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.22);
  box-shadow: 0 10px 24px rgba(15,23,42,.06);
}

.ab-toolbar div {
  min-width: 0;
}

.ab-toolbar strong,
.ab-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ab-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.ab-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.ab-toolbar button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ab-preview-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  padding: 8px;
  border-radius: 22px;
  background: rgba(148,163,184,.08);
  border: 1px solid rgba(148,163,184,.18);
}

.ab-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

@media screen and (max-width: 720px) {
  .ab-toolbar {
    display: flex;
  }

  .ab-shell:not(.expanded) .ab-preview-scroll {
    overflow: hidden;
    max-height: 78vh;
  }

  .ab-shell:not(.expanded) .ab-preview-scale {
    width: 297mm;
    transform: scale(calc((100vw - 28px) / 1122.5197));
    transform-origin: top left;
  }

  .ab-shell:not(.expanded) .ab-preview-scroll::after {
    content: "";
    display: block;
    height: calc(793.7008px * ((100vw - 28px) / 1122.5197));
  }

  .ab-shell.expanded .ab-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .ab-shell.expanded .ab-preview-scale {
    transform: none;
  }
}

@media print {
  .ab-shell,
  .ab-preview-scroll,
  .ab-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .ab-toolbar {
    display: none !important;
  }
}
`;