"use client";

/**
 * reports/components/ClassBroadsheet.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CLASS BROADSHEET
 * ---------------------------------------------------------
 *
 * Mobile Enhancement:
 * - Original landscape print layout preserved.
 * - Mobile-first responsive preview shell added.
 * - Small-screen optimized preview.
 * - Expand mode for inspection.
 * - Dashboard overflow protection.
 * - Safe isolated horizontal scrolling.
 */

import React, { useState } from "react";

import ReportHeader from "./ReportHeader";

import type {
  ComputedClassBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  broadsheet?: ComputedClassBroadsheet;
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

// ======================================================
// COMPONENT
// ======================================================

export default function ClassBroadsheet({
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
    fontSize: compact ? 8 : 9,
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
        title="Class Broadsheet"
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
        Select a branch, academic period and class to generate the class broadsheet.
      </div>
    </section>
  );

  if (!broadsheet) {
    return (
      <div className="cb-shell">
        <style>{css}</style>
        {emptyState}
      </div>
    );
  }

  const reportPage = (
    <section
      className="print-page report-page-break class-broadsheet-page cb-a4-page"
      style={page}
    >
      <ReportHeader
        header={header}
        title="Class Broadsheet"
        subtitle={`${broadsheet.className} • ${broadsheet.students.length} Students`}
        orientation="landscape"
        compact={compact}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 10,
          fontSize: compact ? 8.5 : 9.5,
        }}
      >
        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Class:</strong> {broadsheet.className}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Students:</strong> {broadsheet.students.length}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Subjects:</strong> {broadsheet.subjectColumns.length}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Highest Avg.:</strong> {formatNumber(broadsheet.highestAverage, 1)}%
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Class Avg.:</strong> {formatNumber(broadsheet.classAverage, 1)}%
        </div>
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
                  minWidth: 175,
                }}
              >
                Student Name
              </th>

              {broadsheet.subjectColumns.map((subject) => (
                <th key={subject.classSubjectId} style={th}>
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

              <th style={th}>Total</th>
              <th style={th}>Avg.</th>
              <th style={th}>GPA</th>
              <th style={th}>Position</th>
              <th style={th}>Attend.</th>
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
                </td>

                {broadsheet.subjectColumns.map((subjectColumn) => {
                  const subject = student.subjects.find(
                    (item) => item.classSubjectId === subjectColumn.classSubjectId
                  );

                  return (
                    <td
                      key={subjectColumn.classSubjectId}
                      style={{
                        ...td,
                        textAlign: "center",
                        fontWeight: 800,
                      }}
                    >
                      {subject ? (
                        <>
                          <div>{formatNumber(subject.percentage, 1)}</div>

                          <div
                            style={{
                              fontSize: 7,
                              opacity: 0.72,
                              fontWeight: 700,
                            }}
                          >
                            {subject.grade}
                          </div>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}

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

                <td style={{ ...td, textAlign: "center" }}>
                  {formatNumber(student.attendancePercent, 1)}%
                </td>
              </tr>
            ))}

            {!broadsheet.students.length && (
              <tr>
                <td
                  style={{ ...td, textAlign: "center", padding: 16 }}
                  colSpan={broadsheet.subjectColumns.length + 7}
                >
                  No student report data found for this class and period.
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
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Highest Average</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.highestAverage, 1)}%
          </div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Lowest Average</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.lowestAverage, 1)}%
          </div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Class Average</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.classAverage, 1)}%
          </div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Subjects</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {broadsheet.subjectColumns.length}
          </div>
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
        <span>Official class broadsheet generated for {branding.schoolName}</span>
        <span>Powered by Eleeveon School Management System</span>
      </div>
    </section>
  );

  if (!mobilePreview) {
    return (
      <div className="cb-shell">
        <style>{css}</style>
        {reportPage}
      </div>
    );
  }

  return (
    <div className={`cb-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="cb-toolbar report-no-print">
        <div>
          <strong>{broadsheet.className}</strong>
          <span>
            {broadsheet.students.length} students · {broadsheet.subjectColumns.length} subjects
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="cb-preview-scroll report-screen-scroll">
        <div className="cb-preview-scale">
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
.cb-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.cb-toolbar {
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

.cb-toolbar div {
  min-width: 0;
}

.cb-toolbar strong,
.cb-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cb-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.cb-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.cb-toolbar button {
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

.cb-preview-scroll {
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

.cb-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

@media screen and (max-width: 720px) {
  .cb-toolbar {
    display: flex;
  }

  .cb-shell:not(.expanded) .cb-preview-scroll {
    overflow: hidden;
    max-height: 78vh;
  }

  .cb-shell:not(.expanded) .cb-preview-scale {
    width: 297mm;
    transform: scale(calc((100vw - 28px) / 1122.5197));
    transform-origin: top left;
  }

  .cb-shell:not(.expanded) .cb-preview-scroll::after {
    content: "";
    display: block;
    height: calc(793.7008px * ((100vw - 28px) / 1122.5197));
  }

  .cb-shell.expanded .cb-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .cb-shell.expanded .cb-preview-scale {
    transform: none;
  }
}

@media print {
  .cb-shell,
  .cb-preview-scroll,
  .cb-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .cb-toolbar {
    display: none !important;
  }
}`;
