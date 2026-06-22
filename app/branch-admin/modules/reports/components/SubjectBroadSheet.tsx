"use client";

/**
 * reports/components/SubjectBroadsheet.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL SUBJECT BROADSHEET
 * ---------------------------------------------------------
 *
 * Mobile Enhancement:
 * - Original landscape print layout preserved.
 * - Mobile-first preview shell added.
 * - Beautiful scaled WhatsApp-style preview cards.
 * - Expand mode for detailed inspection.
 * - No dashboard overflow.
 * - Horizontal scrolling isolated safely.
 */

import React, { useState } from "react";

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

export default function SubjectBroadsheet({
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

  const emptyState = (
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

  if (!broadsheet) {
    return (
      <div className="sb-shell">
        <style>{css}</style>
        {emptyState}
      </div>
    );
  }

  const reportPage = (
    <section
      className="print-page report-page-break subject-broadsheet-page sb-a4-page"
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

              {broadsheet.assessmentColumns.map((column) => (
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

                {broadsheet.assessmentColumns.map((column) => {
                  const item = student.breakdown.find(
                    (row) =>
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

  if (!mobilePreview) {
    return (
      <div className="sb-shell">
        <style>{css}</style>
        {reportPage}
      </div>
    );
  }

  return (
    <div className={`sb-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="sb-toolbar report-no-print">
        <div>
          <strong>{broadsheet.subjectName}</strong>
          <span>
            {broadsheet.className} · {broadsheet.students.length} students
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="sb-preview-scroll report-screen-scroll">
        <div className="sb-preview-scale">
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
.sb-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.sb-toolbar {
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

.sb-toolbar div {
  min-width: 0;
}

.sb-toolbar strong,
.sb-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sb-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.sb-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.sb-toolbar button {
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

.sb-preview-scroll {
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

.sb-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

@media screen and (max-width: 720px) {
  .sb-toolbar {
    display: flex;
  }

  .sb-shell:not(.expanded) .sb-preview-scroll {
    overflow: hidden;
    max-height: 78vh;
  }

  .sb-shell:not(.expanded) .sb-preview-scale {
    width: 297mm;
    transform: scale(calc((100vw - 28px) / 1122.5197));
    transform-origin: top left;
  }

  .sb-shell:not(.expanded) .sb-preview-scroll::after {
    content: "";
    display: block;
    height: calc(793.7008px * ((100vw - 28px) / 1122.5197));
  }

  .sb-shell.expanded .sb-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .sb-shell.expanded .sb-preview-scale {
    transform: none;
  }
}

@media print {
  .sb-shell,
  .sb-preview-scroll,
  .sb-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .sb-toolbar {
    display: none !important;
  }
}
`;