"use client";

/**
 * reports/student-report-templates/BorderedTraditionalTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BORDERED TRADITIONAL STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * Template style:
 * - traditional printed school report layout
 * - strong outer borders and inner grid lines
 * - student details in boxed/table cells
 * - results shown in a heavy bordered table
 * - summary, remarks, next period and signatures in boxed sections
 *
 * Core rule:
 * - This template uses the exact same report dataset as every other template.
 * - Only the arrangement, borders, spacing and visual style change.
 * - Disabled fields are removed completely instead of leaving blank spaces.
 */

import React, { useMemo, useState } from "react";

import type {
  ReportAssessmentColumn,
  StudentReportCardDataset,
} from "../engine/report-types";

import type {
  StudentReportTemplateBaseProps,
  StudentReportTemplateSettings,
} from "../shared/ReportTemplateTypes";

import {
  DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
  mergeStudentReportTemplateSettings,
} from "../shared/ReportTemplateTypes";

import BorderedTraditionalHeader from "../shared/headers/BorderTraditionalHeader";

import {
  createReportPageStyle,
  firstText,
  formatNumber,
  formatPercent,
  nextAcademicPeriodText,
  normalizeStudentReportTemplateData,
  ordinal,
  reportTemplateEmptyMessage,
} from "../shared/ReportTemplateUtils";

// ======================================================
// TYPES
// ======================================================

type Props = StudentReportTemplateBaseProps & {
  dataset?: StudentReportCardDataset;
};

// ======================================================
// COMPONENT
// ======================================================

export default function BorderedTraditionalTemplate({
  dataset,
  template,
  settings,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const resolvedSettings: StudentReportTemplateSettings =
    mergeStudentReportTemplateSettings(
      {
        ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
        ...(settings || {}),
        templateCode: "bordered_traditional",
        layoutKey: "bordered_traditional",
        templateName: "Bordered Traditional",
        density: settings?.density || "compact",
      },
      template || null,
      null
    );

  const normalized = normalizeStudentReportTemplateData({
    dataset,
    template: template || null,
    settings: resolvedSettings,
  });

  const report = dataset?.report;
  const header = dataset?.header;
  const student = dataset?.student;

  const assessmentColumns = useMemo<ReportAssessmentColumn[]>(() => {
    const map = new Map<number, ReportAssessmentColumn>();

    report?.subjectResults?.forEach((subject) => {
      subject.breakdown?.forEach((item) => {
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

  if (!dataset || !report || !header || !normalized) {
    return (
      <div className="src-empty-card bordered-template-empty">
        <style>{css}</style>
        {reportTemplateEmptyMessage(dataset)}
      </div>
    );
  }

  const {
    branding,
    studentInfo,
    nextAcademicPeriod,
    signatures,
  } = normalized;

  const primary = branding.primaryColor || "var(--primary-color)";
  const fontFamily = branding.fontFamily || "Arial, sans-serif";

  const reportBackgroundImage = branding.reportCardBackgroundImage || "";
  const reportWatermark =
    branding.reportCardWatermark ||
    branding.logo ||
    "";

  const reportSignatureImage =
    signatures.officialSignatureImage ||
    branding.reportCardSignatureImage ||
    "";

  const studentPhoto = studentInfo.studentPhoto || "";

  const pageStyle = createReportPageStyle({
    settings: resolvedSettings,
    primaryColor: primary,
    fontFamily,
    compact,
    pageBreakAfter,
  });

  const borderedPageStyle: React.CSSProperties = {
    ...pageStyle,
    border: "3px double #111",
    padding: compact ? "7mm" : "8mm",
    background: "#fff",
    color: "#111",
  };

  const label: React.CSSProperties = {
    fontSize: compact ? 7.5 : 8.2,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: 0.25,
    color: "#333",
    lineHeight: 1.15,
  };

  const value: React.CSSProperties = {
    marginTop: 2,
    fontSize: compact ? 9.2 : 10,
    fontWeight: 850,
    color: "#111",
    lineHeight: 1.2,
  };

  const boxCell: React.CSSProperties = {
    border: "1px solid #111",
    padding: compact ? 5 : 6,
    background: "rgba(255,255,255,0.95)",
    minHeight: compact ? 35 : 39,
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "auto",
    fontSize: compact ? 8.8 : 9.4,
    background: "rgba(255,255,255,0.96)",
  };

  const th: React.CSSProperties = {
    border: "1px solid #111",
    padding: compact ? 4 : 5,
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 950,
    lineHeight: 1.15,
    textTransform: "uppercase",
    fontSize: compact ? 7.8 : 8.5,
  };

  const td: React.CSSProperties = {
    border: "1px solid #111",
    padding: compact ? 4 : 5,
    verticalAlign: "middle",
    lineHeight: 1.22,
    color: "#111",
  };

  const sectionTitle: React.CSSProperties = {
    border: "1px solid #111",
    background: "#f3f3f3",
    padding: compact ? "4px 6px" : "5px 7px",
    fontSize: compact ? 8 : 8.7,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    color: "#111",
  };

  const visibleStudentInfoBoxes = [
    {
      key: "studentName",
      label: "Student Name",
      value: report.studentName,
      span: 2,
      show: true,
    },
    {
      key: "admissionNumber",
      label: "Admission No.",
      value: report.admissionNumber || "-",
      show: true,
    },
    {
      key: "gender",
      label: "Gender",
      value: report.gender || student?.gender || "-",
      show: true,
    },
    {
      key: "class",
      label: "Class",
      value: report.className,
      show: true,
    },
    {
      key: "academicPeriod",
      label: "Academic Period",
      value: header.academicPeriod?.name || "-",
      show: true,
    },
    {
      key: "numberOnRoll",
      label: resolvedSettings.numberOnRollLabel || "Number On Roll",
      value:
        studentInfo.numberOnRoll ||
        (report as any).numberOnRoll ||
        (report as any).classSize ||
        (dataset as any)?.numberOnRoll ||
        (dataset as any)?.classSize ||
        "-",
      show: resolvedSettings.showNumberOnRoll,
    },
    {
      key: "attendance",
      label: "Attendance",
      value: `${report.attendance?.presentDays || 0}/${report.attendance?.totalDays || 0}`,
      show: resolvedSettings.showAttendance,
    },
    {
      key: "attendancePercent",
      label: "Attendance %",
      value: formatPercent(report.attendance?.attendancePercent, 1, "-"),
      show: resolvedSettings.showAttendance && resolvedSettings.showAttendancePercent,
    },
  ].filter((item) => item.show);

  const summaryCards = [
    {
      key: "total",
      label: "Total",
      value: formatNumber(report.total, 1),
      show: resolvedSettings.showTotal,
    },
    {
      key: "average",
      label: "Average",
      value: `${formatNumber(report.average, 1)}%`,
      show: resolvedSettings.showAverage,
    },
    {
      key: "classPosition",
      label: resolvedSettings.classPositionLabel || "Class Position",
      value: ordinal(report.overallPosition),
      show: resolvedSettings.showClassPosition,
    },
    {
      key: "gpa",
      label: "GPA",
      value: report.overallGPA != null ? formatNumber(report.overallGPA, 2) : "-",
      show: resolvedSettings.showGPA,
    },
  ].filter((item) => item.show);

  const nextPeriodLine = nextAcademicPeriodText(nextAcademicPeriod, resolvedSettings);

  const subjectTableColumnCount =
    1 +
    assessmentColumns.length +
    2 +
    (resolvedSettings.showGrade ? 1 : 0) +
    (resolvedSettings.showSubjectPosition ? 1 : 0) +
    (resolvedSettings.showSubjectRemarks ? 1 : 0);

  const reportPage = (
    <section
      className="print-page report-page-break student-report-card-page src-a4-page bordered-traditional-template-page"
      style={borderedPageStyle}
    >
      {reportBackgroundImage && (
        <img
          src={reportBackgroundImage}
          alt="Report background"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.025,
            zIndex: 0,
          }}
        />
      )}

      {showWatermark && resolvedSettings.showWatermark && reportWatermark && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.035,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img
            src={reportWatermark}
            alt="Watermark"
            style={{
              width: "56%",
              maxHeight: "56%",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <BorderedTraditionalHeader
          header={header}
          dataset={dataset}
          settings={resolvedSettings}
          title="Terminal / Periodic Academic Report"
          compact={compact}
          primaryColor={primary}
          fontFamily={fontFamily}
        />

        <div style={{ marginTop: 8 }}>
          <div style={sectionTitle}>Student Information</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 82px" : "1fr",
              borderLeft: "1px solid #111",
              borderRight: "1px solid #111",
              borderBottom: "1px solid #111",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              }}
            >
              {visibleStudentInfoBoxes.map((box, index) => (
                <div
                  key={box.key}
                  style={{
                    ...boxCell,
                    borderTop: 0,
                    borderLeft: 0,
                    borderRight:
                      index === visibleStudentInfoBoxes.length - 1 &&
                      !resolvedSettings.showStudentPhoto
                        ? 0
                        : "1px solid #111",
                    borderBottom: 0,
                    gridColumn: box.span ? `span ${box.span}` : undefined,
                  }}
                >
                  <div style={label}>{box.label}</div>
                  <div style={value}>{box.value}</div>
                </div>
              ))}
            </div>

            {resolvedSettings.showStudentPhoto && (
              <div
                style={{
                  borderLeft: "1px solid #111",
                  background: "#fafafa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 82,
                  padding: 4,
                  boxSizing: "border-box",
                }}
              >
                {studentPhoto ? (
                  <img
                    src={studentPhoto}
                    alt="Student"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      border: "1px solid #111",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 900, color: "#555" }}>PHOTO</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={sectionTitle}>Academic Performance</div>

          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 95 }}>
                  Subject
                </th>

                {assessmentColumns.map((column) => (
                  <th key={column.assessmentStructureItemId} style={th}>
                    {column.name}
                    <div style={{ fontSize: 7, marginTop: 2, opacity: 0.95 }}>
                      W:{formatNumber(column.weight, 0)}
                    </div>
                  </th>
                ))}

                <th style={th}>Weighted</th>
                <th style={th}>%</th>

                {resolvedSettings.showGrade && (
                  <th style={th}>Grade</th>
                )}

                {resolvedSettings.showSubjectPosition && (
                  <th style={th}>
                    {resolvedSettings.subjectPositionLabel || "Pos."}
                  </th>
                )}

                {resolvedSettings.showSubjectRemarks && (
                  <th style={{ ...th, minWidth: 85 }}>Remark</th>
                )}
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map((subject) => (
                <tr key={subject.classSubjectId}>
                  <td style={{ ...td, fontWeight: 850 }}>
                    {subject.subjectName}
                    {resolvedSettings.showTeacherNames && subject.teacherName && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 7.4,
                          opacity: 0.72,
                          fontWeight: 650,
                        }}
                      >
                        {subject.teacherName}
                      </div>
                    )}
                  </td>

                  {assessmentColumns.map((column) => {
                    const item = subject.breakdown.find(
                      (row) => row.assessmentStructureItemId === column.assessmentStructureItemId
                    );

                    return (
                      <td
                        key={column.assessmentStructureItemId}
                        style={{ ...td, textAlign: "center" }}
                      >
                        {item ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}` : "-"}
                      </td>
                    );
                  })}

                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                    {formatNumber(subject.weightedTotal, 1)}
                  </td>

                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                    {formatPercent(subject.percentage, 1, "-")}
                  </td>

                  {resolvedSettings.showGrade && (
                    <td style={{ ...td, textAlign: "center", fontWeight: 950 }}>
                      {subject.grade}
                    </td>
                  )}

                  {resolvedSettings.showSubjectPosition && (
                    <td style={{ ...td, textAlign: "center" }}>
                      {ordinal(subject.subjectPosition)}
                    </td>
                  )}

                  {resolvedSettings.showSubjectRemarks && (
                    <td style={td}>{subject.remark}</td>
                  )}
                </tr>
              ))}

              {!report.subjectResults.length && (
                <tr>
                  <td
                    style={{ ...td, textAlign: "center", padding: 16 }}
                    colSpan={subjectTableColumnCount}
                  >
                    No subject results available for this selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {summaryCards.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={sectionTitle}>Summary</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))`,
                borderLeft: "1px solid #111",
                borderBottom: "1px solid #111",
              }}
            >
              {summaryCards.map((card) => (
                <div
                  key={card.key}
                  style={{
                    borderRight: "1px solid #111",
                    padding: compact ? 6 : 7,
                    textAlign: "center",
                    background: "rgba(255,255,255,0.96)",
                  }}
                >
                  <div style={label}>{card.label}</div>
                  <div style={{ ...value, fontSize: compact ? 14 : 15.5, fontWeight: 950 }}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <div style={sectionTitle}>Remarks</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderLeft: "1px solid #111",
              borderBottom: "1px solid #111",
            }}
          >
            <div
              style={{
                borderRight: "1px solid #111",
                padding: 7,
                minHeight: 56,
                background: "rgba(255,255,255,0.96)",
              }}
            >
              <div style={label}>{resolvedSettings.classTeacherLabel}'s Remark</div>
              <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.35 }}>
                {report.classTeacherRemark || ""}
              </div>
            </div>

            <div
              style={{
                borderRight: "1px solid #111",
                padding: 7,
                minHeight: 56,
                background: "rgba(255,255,255,0.96)",
              }}
            >
              <div style={label}>{resolvedSettings.headTeacherLabel}'s Remark</div>
              <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.35 }}>
                {report.headTeacherRemark || ""}
              </div>
            </div>
          </div>
        </div>

        {nextPeriodLine && (
          <div style={{ marginTop: 8 }}>
            <div style={sectionTitle}>Next Academic Period</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderLeft: "1px solid #111",
                borderRight: "1px solid #111",
                borderBottom: "1px solid #111",
                background: "rgba(255,255,255,0.96)",
              }}
            >
              <div style={{ padding: 7, borderRight: "1px solid #111" }}>
                <div style={label}>Period</div>
                <div style={value}>{nextAcademicPeriod?.name || "Next Period"}</div>
              </div>

              <div style={{ padding: 7, textAlign: "right" }}>
                <div style={label}>Begins</div>
                <div style={value}>
                  {nextAcademicPeriod?.formattedStartDate ||
                    nextPeriodLine.replace(/^.*?:\s*/i, "")}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={sectionTitle}>Signatures</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: resolvedSettings.showParentSignature
                ? "repeat(3, minmax(0, 1fr))"
                : "repeat(2, minmax(0, 1fr))",
              borderLeft: "1px solid #111",
              borderBottom: "1px solid #111",
              background: "rgba(255,255,255,0.96)",
            }}
          >
            <SignatureBox
              label={resolvedSettings.classTeacherLabel}
              name={signatures.classTeacherName || ""}
              compact={compact}
            />

            <SignatureBox
              label={resolvedSettings.headTeacherLabel}
              name={firstText(signatures.headTeacherName, signatures.principalName)}
              image={reportSignatureImage}
              compact={compact}
            />

            {resolvedSettings.showParentSignature && (
              <SignatureBox
                label={resolvedSettings.parentLabel}
                name={firstText(signatures.parentName, signatures.guardianName)}
                compact={compact}
              />
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            border: "1px solid #111",
            padding: "4px 6px",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 8,
            color: "#333",
            background: "#f7f7f7",
          }}
        >
          <span>Official academic report generated for {branding.schoolName}</span>
          <span>Powered by Eleeveon School Management System</span>
        </div>
      </div>
    </section>
  );

  if (!mobilePreview) return reportPage;

  return (
    <div className={`src-preview-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="src-mobile-toolbar report-no-print">
        <div>
          <strong>{report.studentName}</strong>
          <span>
            {report.className} · {header.academicPeriod?.name || "Academic Period"}
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="src-preview-scroll report-screen-scroll">
        <div className="src-preview-scale">{reportPage}</div>
      </div>
    </div>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SignatureBox({
  label,
  name,
  image,
  compact,
}: {
  label: string;
  name?: string;
  image?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        borderRight: "1px solid #111",
        padding: compact ? 7 : 8,
        textAlign: "center",
        minHeight: compact ? 64 : 72,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {image && (
        <img
          src={image}
          alt="Official signature"
          style={{
            height: compact ? 26 : 32,
            objectFit: "contain",
            marginBottom: 2,
            alignSelf: "center",
          }}
        />
      )}

      <div
        style={{
          minHeight: 15,
          marginBottom: 4,
          fontSize: compact ? 9 : 10,
          fontWeight: 850,
          color: "#111",
        }}
      >
        {name || ""}
      </div>

      <div
        style={{
          borderTop: "1px solid #111",
          paddingTop: 4,
          fontSize: compact ? 8.5 : 9.5,
          fontWeight: 900,
          color: "#111",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.src-empty-card {
  padding: 20px;
  border: 1px dashed #ccc;
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 750;
}

.src-preview-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
}

.src-mobile-toolbar {
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

.src-mobile-toolbar div {
  min-width: 0;
}

.src-mobile-toolbar strong,
.src-mobile-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.src-mobile-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.src-mobile-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.src-mobile-toolbar button {
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

.src-preview-scroll {
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

.src-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

@media screen and (max-width: 720px) {
  .src-mobile-toolbar {
    display: flex;
  }

  .src-preview-shell:not(.expanded) .src-preview-scroll {
    overflow: hidden;
    max-height: 76vh;
  }

  .src-preview-shell:not(.expanded) .src-preview-scale {
    width: 210mm;
    transform: scale(calc((100vw - 28px) / 793.7008));
    transform-origin: top left;
  }

  .src-preview-shell:not(.expanded) .src-preview-scroll::after {
    content: "";
    display: block;
    height: calc(1122.5197px * ((100vw - 28px) / 793.7008));
    max-height: 76vh;
  }

  .src-preview-shell.expanded .src-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .src-preview-shell.expanded .src-preview-scale {
    transform: none;
  }
}

@media screen and (min-width: 721px) {
  .src-preview-scroll {
    overflow-x: auto;
  }
}

@media print {
  .src-preview-shell,
  .src-preview-scroll,
  .src-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .src-mobile-toolbar {
    display: none !important;
  }

  .student-report-card-page {
    transform: none !important;
    margin: 0 auto !important;
  }
}
`;
