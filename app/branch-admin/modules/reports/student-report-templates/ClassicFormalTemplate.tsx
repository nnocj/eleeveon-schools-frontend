"use client";

/**
 * reports/student-report-templates/ClassicFormalTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC FORMAL STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * This is the upgraded version of your current report-card design.
 *
 * Upgrade goals:
 * - keep the same report data and official quality
 * - move template logic out of the old single StudentReportCard design
 * - use shared template settings from Branch Settings
 * - use ClassicFormalHeader.tsx for the header area
 * - hide disabled fields completely instead of leaving empty spaces
 * - support current Eleeveon report-engine dataset
 *
 * This component does not compute results.
 * It only renders data produced by reports/engine/report-engine.ts.
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

import ClassicFormalHeader from "../shared/headers/ClassicFormalHeader";

import {
  createReportPageStyle,
  createReportTableStyles,
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

export default function ClassicFormalTemplate({
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
        templateCode: "classic_ghana",
        layoutKey: "classic",
        templateName: "Classic Ghana Report",
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
      <div className="src-empty-card classic-template-empty">
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

  const tableStyles = createReportTableStyles({
    settings: resolvedSettings,
    primaryColor: primary,
    compact,
  });

  const label: React.CSSProperties = tableStyles.label;
  const value: React.CSSProperties = tableStyles.value;

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
      value: studentInfo.numberOnRoll  || "-",
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
      className="print-page report-page-break student-report-card-page src-a4-page classic-formal-template-page"
      style={pageStyle}
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
            opacity: 0.035,
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
            opacity: 0.045,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img
            src={reportWatermark}
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
        <ClassicFormalHeader
          header={header}
          dataset={dataset}
          settings={resolvedSettings}
          title="Terminal / Periodic Academic Report"
          compact={compact}
          primaryColor={primary}
          fontFamily={fontFamily}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 84px" : "1fr",
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
            {visibleStudentInfoBoxes.map((box) => (
              <div
                key={box.key}
                style={{
                  ...infoBox,
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
              {studentPhoto ? (
                <img
                  src={studentPhoto}
                  alt="Student"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: "#777" }}>PHOTO</span>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={{ ...tableStyles.th, textAlign: "left", minWidth: 95 }}>
                  Subject
                </th>

                {assessmentColumns.map((column) => (
                  <th key={column.assessmentStructureItemId} style={tableStyles.th}>
                    {column.name}
                    <div style={{ fontSize: 8, marginTop: 2, opacity: 0.95 }}>
                      W:{formatNumber(column.weight, 0)}
                    </div>
                  </th>
                ))}

                <th style={tableStyles.th}>Weighted</th>
                <th style={tableStyles.th}>%</th>

                {resolvedSettings.showGrade && (
                  <th style={tableStyles.th}>Grade</th>
                )}

                {resolvedSettings.showSubjectPosition && (
                  <th style={tableStyles.th}>
                    {resolvedSettings.subjectPositionLabel || "Pos."}
                  </th>
                )}

                {resolvedSettings.showSubjectRemarks && (
                  <th style={{ ...tableStyles.th, minWidth: 85 }}>Remark</th>
                )}
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map((subject) => (
                <tr key={subject.classSubjectId}>
                  <td style={{ ...tableStyles.td, fontWeight: 800 }}>
                    {subject.subjectName}
                    {resolvedSettings.showTeacherNames && subject.teacherName && (
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

                  {assessmentColumns.map((column) => {
                    const item = subject.breakdown.find(
                      (row) => row.assessmentStructureItemId === column.assessmentStructureItemId
                    );

                    return (
                      <td
                        key={column.assessmentStructureItemId}
                        style={{ ...tableStyles.td, textAlign: "center" }}
                      >
                        {item ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}` : "-"}
                      </td>
                    );
                  })}

                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 800 }}>
                    {formatNumber(subject.weightedTotal, 1)}
                  </td>

                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 800 }}>
                    {formatPercent(subject.percentage, 1, "-")}
                  </td>

                  {resolvedSettings.showGrade && (
                    <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 900 }}>
                      {subject.grade}
                    </td>
                  )}

                  {resolvedSettings.showSubjectPosition && (
                    <td style={{ ...tableStyles.td, textAlign: "center" }}>
                      {ordinal(subject.subjectPosition)}
                    </td>
                  )}

                  {resolvedSettings.showSubjectRemarks && (
                    <td style={tableStyles.td}>{subject.remark}</td>
                  )}
                </tr>
              ))}

              {!report.subjectResults.length && (
                <tr>
                  <td
                    style={{ ...tableStyles.td, textAlign: "center", padding: 16 }}
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
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))`,
              gap: 7,
            }}
          >
            {summaryCards.map((card) => (
              <div
                key={card.key}
                style={{
                  border: "1px solid #222",
                  padding: 7,
                  textAlign: "center",
                  background: "rgba(255,255,255,0.92)",
                }}
              >
                <div style={label}>{card.label}</div>
                <div style={{ ...value, fontSize: 16 }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <div style={{ border: "1px solid #222", minHeight: 54, padding: 7 }}>
            <div style={label}>{resolvedSettings.classTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}>
              {report.classTeacherRemark || ""}
            </div>
          </div>

          <div style={{ border: "1px solid #222", minHeight: 54, padding: 7 }}>
            <div style={label}>{resolvedSettings.headTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}>
              {report.headTeacherRemark || ""}
            </div>
          </div>
        </div>

        {nextPeriodLine && (
          <div
            style={{
              marginTop: 9,
              border: `1.5px solid ${primary}`,
              borderRadius: 8,
              padding: "7px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              background: "rgba(255,255,255,0.94)",
            }}
          >
            <div>
              <div style={label}>Next Academic Period</div>
              <div style={{ ...value, fontSize: compact ? 10.5 : 11.5 }}>
                {nextAcademicPeriod?.name || "Next Period"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={label}>Begins</div>
              <div style={{ ...value, fontSize: compact ? 11 : 12.5 }}>
                {nextAcademicPeriod?.formattedStartDate ||
                  nextPeriodLine.replace(/^.*?:\s*/i, "")}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showParentSignature
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(2, minmax(0, 1fr))",
            gap: 22,
            alignItems: "end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={signatureNameStyle}>{signatures.classTeacherName || ""}</div>
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              {resolvedSettings.classTeacherLabel}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            {reportSignatureImage && (
              <img
                src={reportSignatureImage}
                alt="Official signature"
                style={{
                  height: 34,
                  objectFit: "contain",
                  marginBottom: 2,
                }}
              />
            )}
            <div style={signatureNameStyle}>
              {firstText(signatures.headTeacherName, signatures.principalName)}
            </div>
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              {resolvedSettings.headTeacherLabel}
            </div>
          </div>

          {resolvedSettings.showParentSignature && (
            <div style={{ textAlign: "center" }}>
              <div style={signatureNameStyle}>
                {firstText(signatures.parentName, signatures.guardianName)}
              </div>
              <div
                style={{
                  borderTop: "1px solid #111",
                  paddingTop: 5,
                  fontSize: 10.5,
                  fontWeight: 800,
                }}
              >
                {resolvedSettings.parentLabel}
              </div>
            </div>
          )}
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
