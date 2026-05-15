"use client";

/**
 * reports/components/StudentReportCard.tsx
 * ---------------------------------------------------------
 * PREMIUM PRINTABLE STUDENT REPORT CARD
 * ---------------------------------------------------------
 *
 * This component renders ONE official student report card.
 * It does not compute results. It only renders data produced
 * by reports/engine/report-engine.ts.
 *
 * Design target:
 * - Ghana/private-school ready
 * - A4 portrait
 * - professional institutional branding
 * - dynamic assessment item columns
 * - attendance, positions, remarks and signatures
 *
 * Update:
 * - UI/design preserved.
 * - Signature labels now populate class teacher, headteacher/principal,
 *   and parent/guardian from report/header/student dataset where available.
 */

import React, { useMemo } from "react";

import ReportHeader from "./ReportHeader";

import type {
  ReportAssessmentColumn,
  StudentReportCardDataset,
} from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  dataset?: StudentReportCardDataset;
  compact?: boolean;
  showWatermark?: boolean;
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

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

// ======================================================
// COMPONENT
// ======================================================

export default function StudentReportCard({
  dataset,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
}: Props) {
  const report = dataset?.report;
  const header = dataset?.header;
  const student = dataset?.student;

  const branding = header?.branding;
  const primary = branding?.primaryColor || "var(--primary-color)";

  const dynamicData = dataset as any;
  const dynamicReport = report as any;
  const dynamicHeader = header as any;
  const dynamicStudent = student as any;

  const classTeacherName = firstText(
    dynamicReport?.classTeacherName,
    dynamicReport?.classTeacher?.fullName,
    dynamicReport?.classTeacher?.name,
    dynamicData?.classTeacherName,
    dynamicData?.classTeacher?.fullName,
    dynamicData?.classTeacher?.name,
    dynamicHeader?.classTeacherName,
    dynamicHeader?.classTeacher?.fullName,
    dynamicHeader?.classTeacher?.name
  );

  const headTeacherName = firstText(
    dynamicReport?.headTeacherName,
    dynamicReport?.principalName,
    dynamicReport?.headTeacher?.fullName,
    dynamicReport?.headTeacher?.name,
    dynamicReport?.principal?.fullName,
    dynamicReport?.principal?.name,
    dynamicData?.headTeacherName,
    dynamicData?.principalName,
    dynamicData?.headTeacher?.fullName,
    dynamicData?.headTeacher?.name,
    dynamicData?.principal?.fullName,
    dynamicData?.principal?.name,
    dynamicHeader?.headTeacherName,
    dynamicHeader?.principalName,
    dynamicHeader?.headTeacher?.fullName,
    dynamicHeader?.headTeacher?.name,
    dynamicHeader?.principal?.fullName,
    dynamicHeader?.principal?.name
  );

  const parentName = firstText(
    dynamicReport?.parentName,
    dynamicReport?.guardianName,
    dynamicReport?.parent?.fullName,
    dynamicReport?.parent?.name,
    dynamicReport?.guardian?.fullName,
    dynamicReport?.guardian?.name,
    dynamicData?.parentName,
    dynamicData?.guardianName,
    dynamicData?.parent?.fullName,
    dynamicData?.parent?.name,
    dynamicData?.guardian?.fullName,
    dynamicData?.guardian?.name,
    dynamicStudent?.parentName,
    dynamicStudent?.guardianName,
    dynamicStudent?.parent?.fullName,
    dynamicStudent?.parent?.name,
    dynamicStudent?.guardian?.fullName,
    dynamicStudent?.guardian?.name
  );

  const assessmentColumns = useMemo<ReportAssessmentColumn[]>(() => {
    const map = new Map<number, ReportAssessmentColumn>();

    report?.subjectResults.forEach(subject => {
      subject.breakdown.forEach(item => {
        if (!map.has(item.assessmentStructureItemId)) {
          map.set(item.assessmentStructureItemId, {
            assessmentStructureItemId: item.assessmentStructureItemId,
            name: item.name,
            maxScore: item.maxScore,
            weight: item.weight,
            order: item.order,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [report]);

  if (!dataset || !report || !header) {
    return (
      <div
        style={{
          padding: 20,
          border: "1px dashed #ccc",
          borderRadius: 16,
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        Select a student, class and academic period to generate a report card.
      </div>
    );
  }

  const page: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 20px",
    padding: compact ? "9mm" : "11mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: branding?.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
    position: "relative",
    overflow: "hidden",
    pageBreakAfter: pageBreakAfter ? "always" : "auto",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: compact ? 9.5 : 10.5,
  };

  const th: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 4 : 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 800,
    lineHeight: 1.2,
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 4 : 5,
    verticalAlign: "middle",
    lineHeight: 1.25,
  };

  const label: React.CSSProperties = {
    fontSize: compact ? 8.5 : 9.5,
    opacity: 0.72,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: 700,
  };

  const value: React.CSSProperties = {
    marginTop: 2,
    fontSize: compact ? 10.5 : 11.5,
    fontWeight: 800,
  };

  const infoBox: React.CSSProperties = {
    border: "1px solid #cfcfcf",
    padding: compact ? 5 : 6,
    minHeight: compact ? 38 : 42,
    background: "rgba(255,255,255,0.92)",
  };

  const signatureNameStyle: React.CSSProperties = {
    minHeight: 16,
    marginBottom: 3,
    fontSize: compact ? 9.5 : 10.5,
    fontWeight: 800,
    color: "#111",
  };

  return (
    <section
      className="print-page report-page-break student-report-card-page"
      style={page}
    >
      {/* BACKGROUND */}

      {branding?.reportCardBackgroundImage && (
        <img
          src={branding.reportCardBackgroundImage}
          alt="Report background"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.035,
            zIndex: 0,
          }}
        />
      )}

      {/* WATERMARK */}

      {showWatermark && (branding?.reportCardWatermark || branding?.logo) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.045,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img
            src={branding.reportCardWatermark || branding.logo}
            alt="Watermark"
            style={{
              width: "58%",
              maxHeight: "58%",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <ReportHeader
          header={header}
          title="Terminal / Periodic Academic Report"
          compact={compact}
          orientation="portrait"
        />

        {/* STUDENT DETAILS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 84px",
            gap: 10,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            <div style={{ ...infoBox, gridColumn: "span 2" }}>
              <div style={label}>Student Name</div>
              <div style={value}>{report.studentName}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Admission No.</div>
              <div style={value}>{report.admissionNumber || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Gender</div>
              <div style={value}>{report.gender || student?.gender || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Class</div>
              <div style={value}>{report.className}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Academic Period</div>
              <div style={value}>{header.academicPeriod?.name || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Attendance</div>
              <div style={value}>
                {report.attendance.presentDays}/{report.attendance.totalDays}
              </div>
            </div>

            <div style={infoBox}>
              <div style={label}>Attendance %</div>
              <div style={value}>
                {formatNumber(report.attendance.attendancePercent, 1)}%
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #cfcfcf",
              borderRadius: 8,
              overflow: "hidden",
              background: "#fafafa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 84,
            }}
          >
            {report.studentPhoto || student?.photo ? (
              <img
                src={report.studentPhoto || student?.photo}
                alt="Student"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#777",
                }}
              >
                PHOTO
              </span>
            )}
          </div>
        </div>

        {/* RESULTS TABLE */}

        <div style={{ marginTop: 10 }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 95 }}>
                  Subject
                </th>

                {assessmentColumns.map(column => (
                  <th key={column.assessmentStructureItemId} style={th}>
                    {column.name}
                    <div style={{ fontSize: 8, marginTop: 2, opacity: 0.95 }}>
                      W:{formatNumber(column.weight, 0)}
                    </div>
                  </th>
                ))}

                <th style={th}>Weighted</th>
                <th style={th}>%</th>
                <th style={th}>Grade</th>
                <th style={th}>Pos.</th>
                <th style={{ ...th, minWidth: 85 }}>Remark</th>
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map(subject => (
                <tr key={subject.classSubjectId}>
                  <td style={{ ...td, fontWeight: 800 }}>
                    {subject.subjectName}
                    {subject.teacherName && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 8,
                          opacity: 0.72,
                          fontWeight: 500,
                        }}
                      >
                        {subject.teacherName}
                      </div>
                    )}
                  </td>

                  {assessmentColumns.map(column => {
                    const item = subject.breakdown.find(
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
                    {formatNumber(subject.weightedTotal, 1)}
                  </td>

                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {formatNumber(subject.percentage, 1)}%
                  </td>

                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                    {subject.grade}
                  </td>

                  <td style={{ ...td, textAlign: "center" }}>
                    {ordinal(subject.subjectPosition)}
                  </td>

                  <td style={td}>{subject.remark}</td>
                </tr>
              ))}

              {!report.subjectResults.length && (
                <tr>
                  <td
                    style={{ ...td, textAlign: "center", padding: 16 }}
                    colSpan={assessmentColumns.length + 6}
                  >
                    No subject results available for this selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SUMMARY */}

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 7,
          }}
        >
          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Total</div>
            <div style={{ ...value, fontSize: 16 }}>{formatNumber(report.total, 1)}</div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Average</div>
            <div style={{ ...value, fontSize: 16 }}>
              {formatNumber(report.average, 1)}%
            </div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Class Position</div>
            <div style={{ ...value, fontSize: 16 }}>{ordinal(report.overallPosition)}</div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>GPA</div>
            <div style={{ ...value, fontSize: 16 }}>
              {report.overallGPA != null ? formatNumber(report.overallGPA, 2) : "-"}
            </div>
          </div>
        </div>

        {/* REMARKS */}

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <div
            style={{
              border: "1px solid #222",
              minHeight: 54,
              padding: 7,
            }}
          >
            <div style={label}>Class Teacher's Remark</div>
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}>
              {report.classTeacherRemark || ""}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #222",
              minHeight: 54,
              padding: 7,
            }}
          >
            <div style={label}>Headteacher's Remark</div>
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}>
              {report.headTeacherRemark || ""}
            </div>
          </div>
        </div>

        {/* SIGNATURES */}

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 22,
            alignItems: "end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={signatureNameStyle}>{classTeacherName || ""}</div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 5, fontSize: 10.5, fontWeight: 800 }}>
              Class Teacher
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            {branding?.reportCardSignatureImage && (
              <img
                src={branding.reportCardSignatureImage}
                alt="Official signature"
                style={{
                  height: 34,
                  objectFit: "contain",
                  marginBottom: 2,
                }}
              />
            )}
            <div style={signatureNameStyle}>{headTeacherName || ""}</div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 5, fontSize: 10.5, fontWeight: 800 }}>
              Headteacher / Principal
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={signatureNameStyle}>{parentName || ""}</div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 5, fontSize: 10.5, fontWeight: 800 }}>
              Parent / Guardian
            </div>
          </div>
        </div>

        {/* FOOTER */}

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
          <span>Official academic report generated for {branding?.schoolName}</span>
          <span>Powered by Eleeveon School Management System</span>
        </div>
      </div>
    </section>
  );
}
