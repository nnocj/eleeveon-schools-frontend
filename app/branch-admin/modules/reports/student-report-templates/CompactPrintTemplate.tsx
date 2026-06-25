"use client";

/**
 * reports/student-report-templates/CompactPrintTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT PRINT STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * Template style:
 * - same report data as every other template
 * - optimized for printing many reports
 * - reduced vertical spacing
 * - slim header, tight student info, compact summary and signatures
 * - disabled fields are removed completely, not blanked
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

import CompactPrintHeader from "../shared/headers/CompactPrintHeader";

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

export default function CompactPrintTemplate({
  dataset,
  template,
  settings,
  compact = true,
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
        templateCode: "compact_print",
        layoutKey: "compact_print",
        templateName: "Compact Print",
        density: "compact",
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
      <div className="src-empty-card compact-template-empty">
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
  const reportWatermark = branding.reportCardWatermark || branding.logo || "";
  const reportSignatureImage =
    signatures.officialSignatureImage ||
    branding.reportCardSignatureImage ||
    "";
  const studentPhoto = studentInfo.studentPhoto || "";

  const pageStyle = createReportPageStyle({
    settings: resolvedSettings,
    primaryColor: primary,
    fontFamily,
    compact: true,
    pageBreakAfter,
  });

  const compactPageStyle: React.CSSProperties = {
    ...pageStyle,
    padding: "7mm",
    border: "1px solid #d8d8d8",
    background: "#fff",
    color: "#111",
  };

  const label: React.CSSProperties = {
    fontSize: 6.8,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    color: "#555",
    lineHeight: 1.05,
  };

  const value: React.CSSProperties = {
    marginTop: 1,
    fontSize: 8.3,
    fontWeight: 850,
    color: "#111",
    lineHeight: 1.1,
  };

  const infoCell: React.CSSProperties = {
    border: "1px solid #d2d2d2",
    borderRadius: 5,
    padding: "3px 5px",
    minHeight: 26,
    background: "rgba(255,255,255,0.96)",
    overflow: "hidden",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "auto",
    fontSize: 8.2,
    background: "rgba(255,255,255,0.96)",
  };

  const th: React.CSSProperties = {
    border: "1px solid #666",
    padding: "3px 4px",
    background: primary,
    color: "#fff",
    textAlign: "center",
    fontWeight: 900,
    lineHeight: 1.08,
    fontSize: 7.2,
    textTransform: "uppercase",
  };

  const td: React.CSSProperties = {
    border: "1px solid #888",
    padding: "3px 4px",
    verticalAlign: "middle",
    lineHeight: 1.12,
    color: "#111",
  };

  const stripTitle: React.CSSProperties = {
    marginTop: 5,
    marginBottom: 3,
    padding: "3px 6px",
    borderRadius: 5,
    background: "#f2f2f2",
    border: "1px solid #d4d4d4",
    fontSize: 7.4,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#111",
  };

  const visibleStudentInfoBoxes = [
    {
      key: "studentName",
      label: "Student",
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
      label: "Period",
      value: header.academicPeriod?.name || "-",
      show: true,
    },
    {
      key: "numberOnRoll",
      label: resolvedSettings.numberOnRollLabel || "No. on Roll",
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
      label: "Att. %",
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
      label: resolvedSettings.classPositionLabel || "Class Pos.",
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
      className="print-page report-page-break student-report-card-page src-a4-page compact-print-template-page"
      style={compactPageStyle}
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
            opacity: 0.018,
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
            opacity: 0.025,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img
            src={reportWatermark}
            alt="Watermark"
            style={{
              width: "50%",
              maxHeight: "50%",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <CompactPrintHeader
          header={header}
          dataset={dataset}
          settings={resolvedSettings}
          title="Academic Report"
          compact
          primaryColor={primary}
          fontFamily={fontFamily}
        />

        <div
          style={{
            marginTop: 5,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 58px" : "1fr",
            gap: 5,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 4,
            }}
          >
            {visibleStudentInfoBoxes.map((box) => (
              <div
                key={box.key}
                style={{
                  ...infoCell,
                  gridColumn: box.span ? `span ${box.span}` : undefined,
                }}
              >
                <div style={label}>{box.label}</div>
                <div
                  style={{
                    ...value,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {box.value}
                </div>
              </div>
            ))}
          </div>

          {resolvedSettings.showStudentPhoto && (
            <div
              style={{
                border: "1px solid #d2d2d2",
                borderRadius: 5,
                background: "#fafafa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 58,
                overflow: "hidden",
              }}
            >
              {studentPhoto ? (
                <img
                  src={studentPhoto}
                  alt="Student"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 7.5, fontWeight: 900, color: "#777" }}>PHOTO</span>
              )}
            </div>
          )}
        </div>

        <div style={stripTitle}>Results</div>

        <table style={table}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", minWidth: 86 }}>Subject</th>

              {assessmentColumns.map((column) => (
                <th key={column.assessmentStructureItemId} style={th}>
                  {column.name}
                  <div style={{ fontSize: 6.2, marginTop: 1, opacity: 0.95 }}>
                    W:{formatNumber(column.weight, 0)}
                  </div>
                </th>
              ))}

              <th style={th}>Wtd</th>
              <th style={th}>%</th>

              {resolvedSettings.showGrade && <th style={th}>Grd</th>}

              {resolvedSettings.showSubjectPosition && (
                <th style={th}>{resolvedSettings.subjectPositionLabel || "Pos."}</th>
              )}

              {resolvedSettings.showSubjectRemarks && (
                <th style={{ ...th, minWidth: 75 }}>Remark</th>
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
                        marginTop: 1,
                        fontSize: 6.7,
                        opacity: 0.7,
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
                  style={{ ...td, textAlign: "center", padding: 12 }}
                  colSpan={subjectTableColumnCount}
                >
                  No subject results available for this selected period.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {(summaryCards.length > 0 || nextPeriodLine) && (
          <div
            style={{
              marginTop: 5,
              display: "grid",
              gridTemplateColumns: nextPeriodLine ? "1fr 1fr" : "1fr",
              gap: 5,
              alignItems: "stretch",
            }}
          >
            {summaryCards.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))`,
                  gap: 4,
                }}
              >
                {summaryCards.map((card) => (
                  <div
                    key={card.key}
                    style={{
                      border: "1px solid #d2d2d2",
                      borderRadius: 5,
                      padding: "4px 5px",
                      textAlign: "center",
                      background: "rgba(255,255,255,0.96)",
                    }}
                  >
                    <div style={label}>{card.label}</div>
                    <div style={{ ...value, fontSize: 10.5, fontWeight: 950 }}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {nextPeriodLine && (
              <div
                style={{
                  border: `1px solid ${primary}`,
                  borderRadius: 5,
                  padding: "4px 6px",
                  background: "rgba(255,255,255,0.96)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <div>
                  <div style={label}>Next Period</div>
                  <div style={value}>{nextAcademicPeriod?.name || "Next Period"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={label}>Begins</div>
                  <div style={value}>
                    {nextAcademicPeriod?.formattedStartDate ||
                      nextPeriodLine.replace(/^.*?:\s*/i, "")}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 5,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 5,
          }}
        >
          <div
            style={{
              border: "1px solid #d2d2d2",
              borderRadius: 5,
              padding: "5px 6px",
              minHeight: 39,
              background: "rgba(255,255,255,0.96)",
            }}
          >
            <div style={label}>{resolvedSettings.classTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 3, fontSize: 8.5, lineHeight: 1.25 }}>
              {report.classTeacherRemark || ""}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #d2d2d2",
              borderRadius: 5,
              padding: "5px 6px",
              minHeight: 39,
              background: "rgba(255,255,255,0.96)",
            }}
          >
            <div style={label}>{resolvedSettings.headTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 3, fontSize: 8.5, lineHeight: 1.25 }}>
              {report.headTeacherRemark || ""}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 7,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showParentSignature
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(2, minmax(0, 1fr))",
            gap: 10,
            alignItems: "end",
          }}
        >
          <CompactSignature
            label={resolvedSettings.classTeacherLabel}
            name={signatures.classTeacherName || ""}
          />

          <CompactSignature
            label={resolvedSettings.headTeacherLabel}
            name={firstText(signatures.headTeacherName, signatures.principalName)}
            image={reportSignatureImage}
          />

          {resolvedSettings.showParentSignature && (
            <CompactSignature
              label={resolvedSettings.parentLabel}
              name={firstText(signatures.parentName, signatures.guardianName)}
            />
          )}
        </div>

        <div
          style={{
            marginTop: 5,
            borderTop: `1px solid ${primary}`,
            paddingTop: 3,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 6.8,
            color: "#666",
          }}
        >
          <span>{branding.schoolName}</span>
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

function CompactSignature({
  label,
  name,
  image,
}: {
  label: string;
  name?: string;
  image?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      {image && (
        <img
          src={image}
          alt="Official signature"
          style={{
            height: 23,
            objectFit: "contain",
            marginBottom: 1,
          }}
        />
      )}

      <div
        style={{
          minHeight: 13,
          marginBottom: 3,
          fontSize: 7.8,
          fontWeight: 850,
          color: "#111",
        }}
      >
        {name || ""}
      </div>

      <div
        style={{
          borderTop: "1px solid #111",
          paddingTop: 3,
          fontSize: 7.6,
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
