"use client";

/**
 * reports/student-report-templates/ClassicFormalTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — CLASSIC FORMAL STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * This is the upgraded classic/formal report-card design.
 *
 * Upgrade goals:
 * - keep the same report data and official quality
 * - use shared template settings from Branch Settings
 * - use ClassicFormalHeader.tsx for the header area
 * - hide disabled fields completely instead of leaving empty spaces
 * - support current Eleeveon report-engine dataset
 * - show as a real A4/PDF-like sheet on mobile, tablet and desktop
 * - print cleanly without app shell/sidebar/hamburger controls
 * - remain readable in black-and-white printing
 *
 * This component does not compute results.
 * It only renders data produced by reports/engine/report-engine.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  currentAcademicPeriodEndText,
  nextAcademicPeriodText,
  friendlyReportDate,
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
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const previewScale = expanded ? zoomScale : fitScale;
  const displayZoomPercent = Math.round(previewScale * 100);

  const ZOOM_STEP = 1.01;

  const applyZoomStep = useCallback((direction: "in" | "out") => {
    /*
     * If currently fitted, start from the fitted scale.
     * Then change only 1% relative to that fitted/current size.
     */
    setZoomScale((prev) => {
      const baseScale = expanded ? prev : fitScale;
      const nextScale = direction === "in" ? baseScale * ZOOM_STEP : baseScale / ZOOM_STEP;
      return Math.min(2, Math.max(0.25, Number(nextScale.toFixed(4))));
    });

    setExpanded(true);
  }, [expanded, fitScale]);

  const stopZoomHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (holdIntervalRef.current != null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const startZoomHold = useCallback((direction: "in" | "out") => {
    stopZoomHold();
    applyZoomStep(direction);

    holdTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        applyZoomStep(direction);
      }, 55);
    }, 260);
  }, [applyZoomStep, stopZoomHold]);

  const zoomOut = () => {
    applyZoomStep("out");
  };

  const zoomIn = () => {
    applyZoomStep("in");
  };

  const fitToScreen = () => {
    stopZoomHold();
    setExpanded(false);
    setZoomScale(1);
    setZoomMenuOpen(false);
  };

  const actualSize = () => {
    stopZoomHold();
    setExpanded(true);
    setZoomScale(1);
    setZoomMenuOpen(false);
  };

  const selectZoomPercent = (percent: number) => {
    stopZoomHold();
    setExpanded(true);
    setZoomScale(Number((percent / 100).toFixed(4)));
    setZoomMenuOpen(false);
  };

  useEffect(() => {
    if (!mobilePreview) return;

    const A4_WIDTH_PX = 793.7008;
    const A4_HEIGHT_PX = 1122.5197;
    const SAFE_GAP = 8;

    const updateScale = () => {
      const frame = previewFrameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();

      /*
       * PDF viewer behavior:
       * - fixed A4 page
       * - fit mode scales the full sheet to available width and height
       * - zoom mode lets the user magnify or reduce manually
       */
      const availableWidth = Math.max(120, rect.width - SAFE_GAP);
      const availableHeight = Math.max(180, window.innerHeight - rect.top - SAFE_GAP);

      const widthScale = availableWidth / A4_WIDTH_PX;
      const heightScale = availableHeight / A4_HEIGHT_PX;
      const nextScale = Math.min(1, widthScale, heightScale);

      setFitScale(Number(nextScale.toFixed(4)));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);

    if (previewFrameRef.current) {
      observer.observe(previewFrameRef.current);
    }

    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
    };
  }, [mobilePreview]);

  useEffect(() => {
    return () => {
      stopZoomHold();
    };
  }, [stopZoomHold]);



  const resolvedSettings: StudentReportTemplateSettings =
    mergeStudentReportTemplateSettings(
      {
        ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
        ...(settings || {}),
        templateCode: "classic_formal",
        layoutKey: "classic_formal",
        templateName: "Classic Formal",
        density: settings?.density || (compact ? "compact" : "comfortable"),
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
    currentAcademicPeriod,
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

  const upgradedPageStyle: React.CSSProperties = {
    ...pageStyle,
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 18px",
    padding: compact ? "8mm" : "9mm",
    background: "#fff",
    color: "#111",
    border: "1px solid #d8d8d8",
    boxShadow: "0 18px 50px rgba(15,23,42,.14)",
  };

  const tableStyles = createReportTableStyles({
    settings: resolvedSettings,
    primaryColor: primary,
    compact,
  });

  const label: React.CSSProperties = {
    ...tableStyles.label,
    color: "#404040",
    opacity: 1,
  };

  const value: React.CSSProperties = {
    ...tableStyles.value,
    color: "#111",
  };

  const infoBox: React.CSSProperties = {
    border: "1px solid #bdbdbd",
    borderRadius: 7,
    padding: compact ? 5 : 6,
    minHeight: compact ? 36 : 40,
    background: "rgba(255,255,255,0.96)",
    boxSizing: "border-box",
  };

  const signatureNameStyle: React.CSSProperties = {
    minHeight: 16,
    marginBottom: 3,
    fontSize: compact ? 9.2 : 10.2,
    fontWeight: 850,
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

  const currentPeriodEndLine = currentAcademicPeriodEndText(currentAcademicPeriod, resolvedSettings);
  const nextPeriodLine = nextAcademicPeriodText(nextAcademicPeriod, resolvedSettings);
  const generatedDateValue =
    (resolvedSettings as any).showGeneratedDate
      ? friendlyReportDate((dataset as any)?.generatedAt)
      : "";

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
      style={upgradedPageStyle}
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
            opacity: 0.038,
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
            gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 78px" : "1fr",
            gap: 8,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 5,
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
                <div
                  style={{
                    ...value,
                    overflow: "hidden",
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
                border: "1px solid #bdbdbd",
                borderRadius: 8,
                overflow: "hidden",
                background: "#fafafa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 78,
              }}
            >
              {studentPhoto ? (
                <img
                  src={studentPhoto}
                  alt="Student"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 9, fontWeight: 900, color: "#666" }}>PHOTO</span>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 9 }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th
                  data-report-color-block="true"
                  style={{ ...tableStyles.th, textAlign: "left", minWidth: 95, borderColor: "#111" }}
                >
                  Subject
                </th>

                {assessmentColumns.map((column) => (
                  <th
                    data-report-color-block="true"
                    key={column.assessmentStructureItemId}
                    style={{ ...tableStyles.th, borderColor: "#111" }}
                  >
                    {column.name}
                    <div style={{ fontSize: 8, marginTop: 2, opacity: 0.95 }}>
                      W:{formatNumber(column.weight, 0)}
                    </div>
                  </th>
                ))}

                <th data-report-color-block="true" style={{ ...tableStyles.th, borderColor: "#111" }}>Weighted</th>
                <th data-report-color-block="true" style={{ ...tableStyles.th, borderColor: "#111" }}>%</th>

                {resolvedSettings.showGrade && (
                  <th data-report-color-block="true" style={{ ...tableStyles.th, borderColor: "#111" }}>Grade</th>
                )}

                {resolvedSettings.showSubjectPosition && (
                  <th data-report-color-block="true" style={{ ...tableStyles.th, borderColor: "#111" }}>
                    {resolvedSettings.subjectPositionLabel || "Pos."}
                  </th>
                )}

                {resolvedSettings.showSubjectRemarks && (
                  <th
                    data-report-color-block="true"
                    style={{ ...tableStyles.th, minWidth: 85, borderColor: "#111" }}
                  >
                    Remark
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map((subject) => (
                <tr key={subject.classSubjectId}>
                  <td style={{ ...tableStyles.td, fontWeight: 850, borderColor: "#9a9a9a" }}>
                    {subject.subjectName}
                    {resolvedSettings.showTeacherNames && subject.teacherName && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 8,
                          opacity: 0.78,
                          fontWeight: 600,
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
                        style={{ ...tableStyles.td, textAlign: "center", borderColor: "#9a9a9a" }}
                      >
                        {item ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}` : "-"}
                      </td>
                    );
                  })}

                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 850, borderColor: "#9a9a9a" }}>
                    {formatNumber(subject.weightedTotal, 1)}
                  </td>

                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 850, borderColor: "#9a9a9a" }}>
                    {formatPercent(subject.percentage, 1, "-")}
                  </td>

                  {resolvedSettings.showGrade && (
                    <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 950, borderColor: "#9a9a9a" }}>
                      {subject.grade}
                    </td>
                  )}

                  {resolvedSettings.showSubjectPosition && (
                    <td style={{ ...tableStyles.td, textAlign: "center", borderColor: "#9a9a9a" }}>
                      {ordinal(subject.subjectPosition)}
                    </td>
                  )}

                  {resolvedSettings.showSubjectRemarks && (
                    <td style={{ ...tableStyles.td, borderColor: "#9a9a9a" }}>{subject.remark}</td>
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
              marginTop: 9,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))`,
              gap: 6,
            }}
          >
            {summaryCards.map((card) => (
              <div
                key={card.key}
                style={{
                  border: "1px solid #111",
                  borderRadius: 8,
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
        )}

        <div
          style={{
            marginTop: 9,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 7,
          }}
        >
          <div style={{ border: "1px solid #111", borderRadius: 8, minHeight: 50, padding: 7 }}>
            <div style={label}>{resolvedSettings.classTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.3 }}>
              {report.classTeacherRemark || ""}
            </div>
          </div>

          <div style={{ border: "1px solid #111", borderRadius: 8, minHeight: 50, padding: 7 }}>
            <div style={label}>{resolvedSettings.headTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.3 }}>
              {report.headTeacherRemark || ""}
            </div>
          </div>
        </div>

        {(currentPeriodEndLine || nextPeriodLine || generatedDateValue) && (
          <div
            style={{
              marginTop: 8,
              display: "grid",
              gridTemplateColumns:
                [currentPeriodEndLine, nextPeriodLine, generatedDateValue].filter(Boolean).length >= 3
                  ? "repeat(3, minmax(0, 1fr))"
                  : [currentPeriodEndLine, nextPeriodLine, generatedDateValue].filter(Boolean).length === 2
                    ? "repeat(2, minmax(0, 1fr))"
                    : "1fr",
              gap: 7,
            }}
          >
            {currentPeriodEndLine && (
              <div
                style={{
                  border: `1.5px solid #111`,
                  borderRadius: 8,
                  padding: "6px 9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "rgba(255,255,255,0.96)",
                  borderLeft: `6px solid ${primary}`,
                }}
              >
                <div>
                  <div style={label}>Current Academic Period</div>
                  <div style={{ ...value, fontSize: compact ? 10.2 : 11.2 }}>
                    {currentAcademicPeriod?.name || header.academicPeriod?.name || "Current Period"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={label}>Ends</div>
                  <div style={{ ...value, fontSize: compact ? 10.8 : 12 }}>
                    {currentAcademicPeriod?.formattedEndDate ||
                      currentPeriodEndLine.replace(/^.*?:\s*/i, "")}
                  </div>
                </div>
              </div>
            )}

            {nextPeriodLine && (
              <div
                style={{
                  border: `1.5px solid #111`,
                  borderRadius: 8,
                  padding: "6px 9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "rgba(255,255,255,0.96)",
                  borderLeft: `6px solid ${primary}`,
                }}
              >
                <div>
                  <div style={label}>Next Academic Period</div>
                  <div style={{ ...value, fontSize: compact ? 10.2 : 11.2 }}>
                    {nextAcademicPeriod?.name || "Next Period"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={label}>Begins</div>
                  <div style={{ ...value, fontSize: compact ? 10.8 : 12 }}>
                    {nextAcademicPeriod?.formattedStartDate ||
                      nextPeriodLine.replace(/^.*?:\s*/i, "")}
                  </div>
                </div>
              </div>
            )}

            {generatedDateValue && (
              <div
                style={{
                  border: `1.5px solid #111`,
                  borderRadius: 8,
                  padding: "6px 9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "rgba(255,255,255,0.96)",
                  borderLeft: `6px solid ${primary}`,
                }}
              >
                <div>
                  <div style={label}>
                    {(resolvedSettings as any).generatedDateLabel || "Generated"}
                  </div>
                  <div style={{ ...value, fontSize: compact ? 10.2 : 11.2 }}>
                    Report Card
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={label}>Date</div>
                  <div style={{ ...value, fontSize: compact ? 10.8 : 12 }}>
                    {generatedDateValue}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showParentSignature
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(2, minmax(0, 1fr))",
            gap: 20,
            alignItems: "end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={signatureNameStyle}>{signatures.classTeacherName || ""}</div>
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10,
                fontWeight: 850,
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
                  height: 30,
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
                fontSize: 10,
                fontWeight: 850,
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
                  fontSize: 10,
                  fontWeight: 850,
                }}
              >
                {resolvedSettings.parentLabel}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 9,
            borderTop: `1.5px solid ${primary}`,
            paddingTop: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 8,
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

        <div className="src-zoom-controls" aria-label="Report zoom controls">
          <button
            type="button"
            className="src-zoom-icon-button"
            onClick={zoomOut}
            onPointerDown={() => startZoomHold("out")}
            onPointerUp={stopZoomHold}
            onPointerCancel={stopZoomHold}
            onPointerLeave={stopZoomHold}
            aria-label="Zoom out"
            title="Click or hold to zoom out"
          >
            −
          </button>

          <button
            type="button"
            className="src-zoom-fit-button"
            onClick={fitToScreen}
            aria-label="Fit to screen"
            title="Fit to screen"
          >
            Fit
          </button>

          <div className="src-zoom-menu-wrap">
            <button
              type="button"
              className="src-zoom-percent-button"
              onClick={() => setZoomMenuOpen((prev) => !prev)}
              aria-label="Choose zoom percentage"
              aria-expanded={zoomMenuOpen}
              title="Choose zoom percentage"
            >
              <span>{displayZoomPercent}%</span>
              <span className="src-zoom-caret">▾</span>
            </button>

            {zoomMenuOpen && (
              <div className="src-zoom-menu" role="menu">
                {[ 30, 40, 50, 60, 70, 80, 90, 100].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    role="menuitem"
                    onClick={() => selectZoomPercent(percent)}
                    className={`src-zoom-menu-item ${Math.round(previewScale * 100) === percent ? "active" : ""}`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="src-zoom-icon-button"
            onClick={zoomIn}
            onPointerDown={() => startZoomHold("in")}
            onPointerUp={stopZoomHold}
            onPointerCancel={stopZoomHold}
            onPointerLeave={stopZoomHold}
            aria-label="Zoom in"
            title="Click or hold to zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={previewFrameRef}
        className="src-preview-scroll report-screen-scroll"
        style={{ "--report-preview-scale": previewScale } as React.CSSProperties}
      >
        <div className="src-preview-center">
          <div className="src-preview-scale">{reportPage}</div>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
/*
 * IMPORTANT DESIGN RULE
 * ---------------------------------------------------------
 * This report is NOT responsive like normal app UI.
 * It is a fixed A4/PDF sheet.
 *
 * The report page remains 210mm × 297mm at all times.
 * The preview frame measures its real available width AND height,
 * then scales the whole A4 sheet like a PDF viewer.
 *
 * Fit mode should not need horizontal or vertical scrolling.
 */

.src-empty-card {
  padding: 20px;
  border: 1px dashed #ccc;
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 750;
}

.src-preview-shell {
  --a4-width-px: 793.7008;
  --a4-height-px: 1122.5197;

  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
}

/*
 * Toolbar is app control UI, not part of the PDF/A4 sheet.
 */
.src-mobile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 8px;
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

.src-zoom-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 10%, transparent);
  border: 1px solid rgba(148,163,184,.18);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
}

.src-zoom-controls button {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.src-zoom-icon-button {
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 18px;
  font-weight: 950;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
}

.src-zoom-fit-button {
  height: 32px;
  min-height: 32px;
  min-width: 42px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
}

.src-zoom-menu-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.src-zoom-percent-button {
  height: 32px;
  min-height: 32px;
  min-width: 68px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
}

.src-zoom-caret {
  font-size: 9px;
  line-height: 1;
  opacity: .9;
  transform: translateY(1px);
}

.src-zoom-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 40;
  width: 114px;
  max-height: 252px;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  padding: 7px;
  border-radius: 16px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.34);
  box-shadow: 0 20px 46px rgba(15,23,42,.20);
  box-sizing: border-box;
}

.src-zoom-menu::before {
  content: "";
  position: absolute;
  top: -5px;
  right: 24px;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  background: var(--surface, #fff);
  border-left: 1px solid rgba(148,163,184,.34);
  border-top: 1px solid rgba(148,163,184,.34);
}

.src-zoom-menu-item {
  width: 100%;
  min-width: 0;
  height: 32px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 11px;
  background: transparent;
  color: var(--text, #0f172a); 
  box-shadow: none;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  display: flex !important;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  box-sizing: border-box;
}

.src-zoom-menu-item:hover {
  background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent);
}

.src-zoom-menu-item.active {
  background: var(--primary-color, #2563eb);
  color: #fff;
}

/*
 * Preview area is the PDF viewer frame.
 */
.src-preview-scroll {
  --report-preview-scale: 1;

  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 4px;
  border-radius: 22px;
  background: rgba(148,163,184,.10);
  border: 1px solid rgba(148,163,184,.18);
  box-sizing: border-box;
}

/*
 * Center holder reserves the scaled A4 dimensions.
 * This is what makes the report stay centered without overflow.
 */
.src-preview-center {
  width: 100%;
  height: calc(297mm * var(--report-preview-scale));
  min-height: calc(297mm * var(--report-preview-scale));
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
}

/*
 * This inner holder is the only thing that scales.
 */
.src-preview-scale {
  width: 210mm;
  height: 297mm;
  min-width: 210mm;
  min-height: 297mm;
  transform: scale(var(--report-preview-scale));
  transform-origin: top center;
  flex: 0 0 auto;
}

.classic-formal-template-page,
.student-report-card-page,
.src-a4-page {
  width: 210mm !important;
  min-width: 210mm !important;
  max-width: 210mm !important;
  min-height: 297mm !important;
  box-sizing: border-box !important;
}

/*
 * FIT MODE
 * ---------------------------------------------------------
 * No scroll. Whole A4 page fits inside the current view.
 */
.src-preview-shell:not(.expanded) .src-preview-scroll {
  overflow: hidden;
}

.src-preview-shell:not(.expanded) .src-preview-scale {
  transform: scale(var(--report-preview-scale));
}

/*
 * EXPANDED MODE
 * ---------------------------------------------------------
 * Show true A4 size and allow scrolling only when the user asks for it.
 */
.src-preview-shell.expanded .src-preview-scroll {
  overflow: auto;
  max-height: none;
}

.src-preview-shell.expanded .src-preview-center {
  width: max(100%, calc(210mm * var(--report-preview-scale)));
  height: calc(297mm * var(--report-preview-scale));
  min-height: calc(297mm * var(--report-preview-scale));
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: visible;
  margin: 0 auto;
}

.src-preview-shell.expanded .src-preview-scale {
  transform: scale(var(--report-preview-scale));
  width: 210mm;
  height: 297mm;
  min-width: 210mm;
  min-height: 297mm;
}

/*
 * PRINT MODE
 * ---------------------------------------------------------
 * Printing uses the real A4 page. The preview frame disappears.
 */
@media screen and (max-width: 380px) {
  .src-mobile-toolbar {
    gap: 6px;
    padding: 8px;
  }

  .src-mobile-toolbar strong {
    font-size: 12px;
  }

  .src-mobile-toolbar span {
    font-size: 10px;
  }

  .src-zoom-controls {
    gap: 3px;
    padding: 3px;
  }

  .src-zoom-icon-button {
    width: 29px;
    min-width: 29px;
    height: 29px;
    min-height: 29px;
    font-size: 16px;
  }

  .src-zoom-fit-button {
    min-width: 36px;
    height: 29px;
    min-height: 29px;
    padding: 0 8px;
    font-size: 10px;
  }

  .src-zoom-percent-button {
    min-width: 62px;
    height: 29px;
    min-height: 29px;
    padding: 0 8px;
    font-size: 10px;
    gap: 4px;
  }

  .src-zoom-menu {
    width: 106px;
    max-height: 210px;
    padding: 6px;
  }

  .src-zoom-menu-item {
    height: 30px;
    min-height: 30px;
    font-size: 11px;
  }
}

@media print {
  .src-preview-shell,
  .src-preview-scroll,
  .src-preview-center,
  .src-preview-scale {
    display: contents !important;
    transform: none !important;
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .src-mobile-toolbar,
  .report-no-print {
    display: none !important;
    visibility: hidden !important;
  }

  .student-report-card-page,
  .classic-formal-template-page,
  .src-a4-page {
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    min-height: 297mm !important;
    transform: none !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    border-color: #111 !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .classic-formal-template-page [data-report-color-block="true"] {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  table,
  tr,
  td,
  th {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
`;
