"use client";

/**
 * reports/components/SubjectBroadsheet.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL SUBJECT BROADSHEET
 * ---------------------------------------------------------
 *
 * This renders one subject's full class score sheet.
 * Rows = students.
 * Columns = assessment structure items + weighted total + grade + position.
 *
 * It is driven by ClassSubject through the report engine output.
 */

import React from "react";

import ReportHeader from "./ReportHeader";

import type {
  ComputedSubjectBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  broadsheet?: ComputedSubjectBroadsheet;
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

export default function SubjectBroadsheet({
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
    fontSize: compact ? 8.5 : 9.5,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 5,
    verticalAlign: "middle",
    lineHeight: 1.2,
  };

  if (!broadsheet) {
    return (
      <section style={page}>
        <ReportHeader
          header={header}
          title="Subject Broadsheet"
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
          Select a class subject to generate the subject broadsheet.
        </div>
      </section>
    );
  }

  return (
    <section
      className="print-page report-page-break subject-broadsheet-page"
      style={page}
    >
      <ReportHeader
        header={header}
        title="Subject Broadsheet"
        subtitle={`${broadsheet.className} • ${broadsheet.subjectName}${
          broadsheet.teacherName ? ` • ${broadsheet.teacherName}` : ""
        }`}
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
          fontSize: compact ? 9 : 10,
        }}
      >
        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Class:</strong> {broadsheet.className}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Subject:</strong> {broadsheet.subjectName}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Students:</strong> {broadsheet.students.length}
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Highest:</strong> {formatNumber(broadsheet.highestScore, 1)}%
        </div>

        <div style={{ border: "1px solid #ccc", padding: 6 }}>
          <strong>Average:</strong> {formatNumber(broadsheet.classAverage, 1)}%
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
                  minWidth: 190,
                }}
              >
                Student Name
              </th>

              {broadsheet.assessmentColumns.map(column => (
                <th key={column.assessmentStructureItemId} style={th}>
                  {column.name}
                  <div style={{ fontSize: 8, marginTop: 2 }}>
                    Max:{formatNumber(column.maxScore, 0)} | W:{formatNumber(column.weight, 0)}
                  </div>
                </th>
              ))}

              <th style={th}>Weighted</th>
              <th style={th}>%</th>
              <th style={th}>Grade</th>
              <th style={th}>Position</th>
              <th style={{ ...th, minWidth: 120 }}>Remark</th>
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
                        fontSize: 8,
                        opacity: 0.7,
                        fontWeight: 600,
                      }}
                    >
                      {student.admissionNumber}
                    </div>
                  )}
                </td>

                {broadsheet.assessmentColumns.map(column => {
                  const item = student.breakdown.find(
                    row =>
                      row.assessmentStructureItemId ===
                      column.assessmentStructureItemId
                  );

                  return (
                    <td
                      key={column.assessmentStructureItemId}
                      style={{ ...td, textAlign: "center" }}
                    >
                      {item
                        ? `${formatNumber(item.score, 0)}/${formatNumber(
                            item.maxScore,
                            0
                          )}`
                        : "-"}
                    </td>
                  );
                })}

                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                  {formatNumber(student.weightedTotal, 1)}
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                  {formatNumber(student.percentage, 1)}%
                </td>

                <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                  {student.grade}
                </td>

                <td style={{ ...td, textAlign: "center" }}>
                  {ordinal(student.position)}
                </td>

                <td style={td}>{student.remark}</td>
              </tr>
            ))}

            {!broadsheet.students.length && (
              <tr>
                <td
                  style={{ ...td, textAlign: "center", padding: 16 }}
                  colSpan={broadsheet.assessmentColumns.length + 7}
                >
                  No student scores found for this subject and period.
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
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Students</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{broadsheet.students.length}</div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Highest Score</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.highestScore, 1)}%
          </div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Lowest Score</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.lowestScore, 1)}%
          </div>
        </div>

        <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
          <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 700 }}>Class Average</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {formatNumber(broadsheet.classAverage, 1)}%
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
        <span>Official subject broadsheet generated for {branding.schoolName}</span>
        <span>Powered by Eleeveon School Management System</span>
      </div>
    </section>
  );
}
