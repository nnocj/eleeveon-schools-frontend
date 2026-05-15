"use client";

/**
 * reports/components/ClassBroadsheet.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CLASS BROADSHEET
 * ---------------------------------------------------------
 *
 * This renders the master class performance sheet.
 * Rows = students.
 * Columns = subjects + total + average + GPA + position + attendance.
 *
 * Subject cells are already computed by the report engine from:
 * ClassSubject -> AssessmentApplicability -> AssessmentStructureItems.
 */

import React from "react";

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
}: Props) {
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

  if (!broadsheet) {
    return (
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
  }

  return (
    <section
      className="print-page report-page-break class-broadsheet-page"
      style={page}
    >
      <ReportHeader
        header={header}
        title="Class Broadsheet"
        subtitle={`${broadsheet.className} • ${broadsheet.students.length} Students`}
        orientation="landscape"
        compact={compact}
      />

      {/* SUMMARY STRIP */}

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

      {/* TABLE */}

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

              {broadsheet.subjectColumns.map(subject => (
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

                {broadsheet.subjectColumns.map(subjectColumn => {
                  const subject = student.subjects.find(
                    item => item.classSubjectId === subjectColumn.classSubjectId
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

      {/* FOOTER ANALYTICS */}

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
}
