"use client";

/**
 * reports/student-report-templates/MontessoriTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — MONTESSORI CALM EARLY-YEARS STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * Visual direction:
 * - fixed A4/PDF sheet with a calm Montessori learning-record identity
 * - compact MontessoriHeader with calm natural classroom styling
 * - spacious learner profile panel with optional photo and quiet details
 * - minimal learning-record table, growth summary and reflective comment areas
 * - academic dates and generated date using the same report-engine dataset
 *
 * Data rule:
 * - dataset stays exactly the same
 * - this component does not compute results
 * - it only renders data produced by reports/engine/report-engine.ts
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

import MontessoriHeader from "../shared/headers/MontessoriHeader";

import {
  createReportPageStyle,
  createReportTableStyles,
  firstText,
  friendlyReportDate,
  formatNumber,
  formatPercent,
  currentAcademicPeriodEndText,
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

type InfoChip = {
  key: string;
  label: string;
  value: React.ReactNode;
  show: boolean;
};

// ======================================================
// COMPONENT
// ======================================================

export default function MontessoriTemplate({
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

  const zoomOut = () => applyZoomStep("out");
  const zoomIn = () => applyZoomStep("in");

  const fitToScreen = () => {
    stopZoomHold();
    setExpanded(false);
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
      const availableWidth = Math.max(120, rect.width - SAFE_GAP);
      const availableHeight = Math.max(180, window.innerHeight - rect.top - SAFE_GAP);
      const widthScale = availableWidth / A4_WIDTH_PX;
      const heightScale = availableHeight / A4_HEIGHT_PX;
      const nextScale = Math.min(1, widthScale, heightScale);

      setFitScale(Number(nextScale.toFixed(4)));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (previewFrameRef.current) observer.observe(previewFrameRef.current);

    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
    };
  }, [mobilePreview]);

  useEffect(() => stopZoomHold, [stopZoomHold]);

  const resolvedSettings: StudentReportTemplateSettings =
    mergeStudentReportTemplateSettings(
      {
        ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
        ...(settings || {}),
        templateCode: "montessori",
        layoutKey: "montessori",
        templateName: "Montessori",
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
      <div className="src-empty-card montessori-template-empty">
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
  const reportWatermark = branding.reportCardWatermark || branding.logo || "";
  const reportSignatureImage = signatures.officialSignatureImage || branding.reportCardSignatureImage || "";
  const studentPhoto = studentInfo.studentPhoto || "";

  const pageStyle = createReportPageStyle({
    settings: resolvedSettings,
    primaryColor: primary,
    fontFamily,
    compact,
    pageBreakAfter,
  });

  const baseTableStyles = createReportTableStyles({
    settings: resolvedSettings,
    primaryColor: primary,
    compact,
  });

  const pagePadding = compact ? "8mm" : "9mm";

  const upgradedPageStyle: React.CSSProperties = {
    ...pageStyle,
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 18px",
    padding: pagePadding,
    background: "linear-gradient(180deg, #fffdf7, #ffffff 42%, #f8faf4)",
    color: "#243126",
    border: "1px solid #d9cbb3",
    borderRadius: 6,
    boxShadow: "0 24px 70px rgba(15,23,42,.13)",
    overflow: "hidden",
  };

  const tableStyles: ReturnType<typeof createReportTableStyles> = {
    table: {
      ...baseTableStyles.table,
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      overflow: "hidden",
      borderRadius: 6,
      border: "1px solid #d9cbb3",
      fontSize: compact ? 8.5 : 9.2,
    },
    th: {
      ...baseTableStyles.th,
      border: "0",
      borderBottom: "1px solid #111827",
      background: "#6b7f4e",
      color: "#fff",
      padding: compact ? "5px 5px" : "6px 6px",
      fontWeight: 950,
    },
    td: {
      ...baseTableStyles.td,
      border: "0",
      borderBottom: "1px solid #e5e7eb",
      padding: compact ? "4px 5px" : "5px 6px",
      color: "#111827",
    },
    label: baseTableStyles.label,
    value: baseTableStyles.value,
  };

  const smallLabel: React.CSSProperties = {
    fontSize: compact ? 6.9 : 7.6,
    fontWeight: 950,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: "#6f6a5f",
    lineHeight: 1.15,
  };

  const strongValue: React.CSSProperties = {
    fontSize: compact ? 9.6 : 10.6,
    fontWeight: 950,
    color: "#243126",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  };

  const studentInfoChips: InfoChip[] = [
    { key: "admissionNumber", label: "Admission No.", value: report.admissionNumber || "-", show: true },
    { key: "gender", label: "Gender", value: report.gender || student?.gender || "-", show: true },
    { key: "class", label: "Class", value: report.className || "-", show: true },
    { key: "academicPeriod", label: "Period", value: header.academicPeriod?.name || "-", show: true },
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
    { key: "total", label: "Total", value: formatNumber(report.total, 1), show: resolvedSettings.showTotal },
    { key: "average", label: "Average", value: `${formatNumber(report.average, 1)}%`, show: resolvedSettings.showAverage },
    {
      key: "classPosition",
      label: resolvedSettings.classPositionLabel || "Class Standing",
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
  const generatedDateValue = (resolvedSettings as any).showGeneratedDate
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
      className="print-page report-page-break student-report-card-page src-a4-page montessori-template-page"
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
            opacity: 0.032,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img src={reportWatermark} alt="Watermark" style={{ width: "52%", maxHeight: "52%", objectFit: "contain" }} />
        </div>
      )}

      <div aria-hidden="true" className="montessori-frame-line montessori-frame-outer" style={{ borderColor: primary }} />
      <div aria-hidden="true" className="montessori-frame-line montessori-frame-inner" />
      <div aria-hidden="true" className="montessori-corner montessori-corner-tl" style={{ borderColor: primary }} />
      <div aria-hidden="true" className="montessori-corner montessori-corner-tr" style={{ borderColor: primary }} />
      <div aria-hidden="true" className="montessori-corner montessori-corner-bl" style={{ borderColor: primary }} />
      <div aria-hidden="true" className="montessori-corner montessori-corner-br" style={{ borderColor: primary }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <MontessoriHeader
          header={header}
          dataset={dataset}
          settings={resolvedSettings}
          title="Montessori Learning Record"
          compact={compact}
          primaryColor={primary}
          fontFamily={fontFamily}
        />

        <section
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 86px" : "1fr",
            gap: 8,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #d9cbb3",
              background: "linear-gradient(180deg, #ffffff, #fbfaf4)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 10,
                padding: compact ? "7px 9px" : "8px 11px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={smallLabel}>Learner Profile</div>
                <div
                  style={{
                    marginTop: 1,
                    fontSize: compact ? 15.5 : 17.5,
                    lineHeight: 1.05,
                    fontWeight: 950,
                    color: "#243126",
                    textTransform: "uppercase",
                    overflowWrap: "anywhere",
                  }}
                >
                  {report.studentName}
                </div>
              </div>

              <div
                data-report-color-block="true"
                style={{
                  borderRadius: 999,
                  padding: compact ? "5px 9px" : "6px 11px",
                  background: primary,
                  color: "#fff",
                  fontSize: compact ? 8 : 8.8,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {report.className || "Class"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 0,
              }}
            >
              {studentInfoChips.map((chip, index) => (
                <div
                  key={chip.key}
                  style={{
                    padding: compact ? "6px 8px" : "7px 9px",
                    borderRight: (index + 1) % 4 === 0 ? "0" : "1px solid #e5e7eb",
                    borderBottom: index < studentInfoChips.length - 4 ? "1px solid #e5e7eb" : "0",
                    minWidth: 0,
                  }}
                >
                  <div style={smallLabel}>{chip.label}</div>
                  <div style={{ ...strongValue, marginTop: 1 }}>{chip.value}</div>
                </div>
              ))}
            </div>
          </div>

          {resolvedSettings.showStudentPhoto && (
            <div
              style={{
                border: "1px solid #d9cbb3",
                borderRadius: 8,
                overflow: "hidden",
                background: "#faf9f4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 92,
              }}
            >
              {studentPhoto ? (
                <img src={studentPhoto} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 9, fontWeight: 950, color: "#6f6a5f" }}>PHOTO</span>
              )}
            </div>
          )}
        </section>

        <div style={{ marginTop: 8 }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th data-report-color-block="true" style={{ ...tableStyles.th, textAlign: "left", minWidth: 98 }}>Learning Area</th>
                {assessmentColumns.map((column) => (
                  <th data-report-color-block="true" key={column.assessmentStructureItemId} style={tableStyles.th}>
                    {column.name}
                    <div style={{ fontSize: 7.5, marginTop: 2, opacity: 0.88 }}>W:{formatNumber(column.weight, 0)}</div>
                  </th>
                ))}
                <th data-report-color-block="true" style={tableStyles.th}>Total</th>
                <th data-report-color-block="true" style={tableStyles.th}>%</th>
                {resolvedSettings.showGrade && <th data-report-color-block="true" style={tableStyles.th}>Grade</th>}
                {resolvedSettings.showSubjectPosition && (
                  <th data-report-color-block="true" style={tableStyles.th}>{resolvedSettings.subjectPositionLabel || "Pos."}</th>
                )}
                {resolvedSettings.showSubjectRemarks && (
                  <th data-report-color-block="true" style={{ ...tableStyles.th, minWidth: 86 }}>Remark</th>
                )}
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map((subject, rowIndex) => (
                <tr key={subject.classSubjectId}>
                  <td
                    style={{
                      ...tableStyles.td,
                      fontWeight: 950,
                      background: rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff",
                    }}
                  >
                    {subject.subjectName}
                    {resolvedSettings.showTeacherNames && subject.teacherName && (
                      <div style={{ marginTop: 2, fontSize: 7.8, opacity: 0.72, fontWeight: 700 }}>
                        {subject.teacherName}
                      </div>
                    )}
                  </td>

                  {assessmentColumns.map((column) => {
                    const item = subject.breakdown.find(
                      (row) => row.assessmentStructureItemId === column.assessmentStructureItemId
                    );

                    return (
                      <td key={column.assessmentStructureItemId} style={{ ...tableStyles.td, textAlign: "center" }}>
                        {item ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}` : "-"}
                      </td>
                    );
                  })}

                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 950 }}>
                    {formatNumber(subject.weightedTotal, 1)}
                  </td>
                  <td style={{ ...tableStyles.td, textAlign: "center", fontWeight: 950 }}>
                    {formatPercent(subject.percentage, 1, "-")}
                  </td>
                  {resolvedSettings.showGrade && (
                    <td style={{ ...tableStyles.td, textAlign: "center" }}>
                      <span className="montessori-grade-badge" style={{ borderColor: primary, color: primary }}>{subject.grade}</span>
                    </td>
                  )}
                  {resolvedSettings.showSubjectPosition && (
                    <td style={{ ...tableStyles.td, textAlign: "center" }}>{ordinal(subject.subjectPosition)}</td>
                  )}
                  {resolvedSettings.showSubjectRemarks && <td style={tableStyles.td}>{subject.remark}</td>}
                </tr>
              ))}

              {!report.subjectResults.length && (
                <tr>
                  <td style={{ ...tableStyles.td, textAlign: "center", padding: 16 }} colSpan={subjectTableColumnCount}>
                    No learning records available for this selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {summaryCards.length > 0 && (
          <section
            style={{
              marginTop: 8,
              borderRadius: 8,
              border: "1px solid #d9cbb3",
              overflow: "hidden",
              display: "grid",
              gridTemplateColumns: `16px repeat(${summaryCards.length}, minmax(0, 1fr))`,
              background: "#ffffff",
            }}
          >
            <div data-report-color-block="true" style={{ background: primary }} />
            {summaryCards.map((card, index) => (
              <div
                key={card.key}
                style={{
                  padding: compact ? "7px 8px" : "8px 10px",
                  textAlign: "center",
                  borderLeft: index === 0 ? "0" : "1px solid #e5e7eb",
                  background: "linear-gradient(180deg, #ffffff, #f6f3ea)",
                }}
              >
                <div style={smallLabel}>{card.label}</div>
                <div style={{ marginTop: 2, fontSize: compact ? 14 : 15.8, fontWeight: 950, color: "#243126" }}>
                  {card.value}
                </div>
              </div>
            ))}
          </section>
        )}

        <section
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 7,
          }}
        >
          {[
            { label: `${resolvedSettings.classTeacherLabel}'s Comment`, value: report.classTeacherRemark || "" },
            { label: `${resolvedSettings.headTeacherLabel}'s Comment`, value: report.headTeacherRemark || "" },
          ].map((remark) => (
            <div
              key={remark.label}
              style={{
                border: "1px solid #d9cbb3",
                borderRadius: 8,
                minHeight: 52,
                padding: compact ? 8 : 9,
                background: "#ffffff",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: primary }} />
              <div style={smallLabel}>{remark.label}</div>
              <div style={{ marginTop: 5, paddingLeft: 2, fontSize: compact ? 9.6 : 10.5, lineHeight: 1.32, color: "#111827" }}>
                {remark.value}
              </div>
            </div>
          ))}
        </section>

        {(currentPeriodEndLine || nextPeriodLine || generatedDateValue) && (
          <section
            style={{
              marginTop: 8,
              border: "1px solid #d9cbb3",
              borderRadius: 8,
              padding: compact ? 7 : 8,
              background: "#faf9f4",
              display: "grid",
              gridTemplateColumns: [currentPeriodEndLine, nextPeriodLine, generatedDateValue].filter(Boolean).length >= 3
                ? "1fr 26px 1fr 26px 1fr"
                : currentPeriodEndLine && nextPeriodLine
                  ? "1fr 26px 1fr"
                  : "1fr",
              gap: 6,
              alignItems: "center",
            }}
          >
            {currentPeriodEndLine && (
              <div>
                <div style={smallLabel}>Current Academic Period</div>
                <div style={strongValue}>{currentAcademicPeriod?.name || header.academicPeriod?.name || "Current Period"}</div>
                <div style={{ marginTop: 2, fontSize: compact ? 8.8 : 9.7, fontWeight: 900, color: primary }}>
                  Ends: {currentAcademicPeriod?.formattedEndDate || currentPeriodEndLine.replace(/^.*?:\s*/i, "")}
                </div>
              </div>
            )}

            {currentPeriodEndLine && nextPeriodLine && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="montessori-timeline-marker" style={{ borderColor: primary }} />
              </div>
            )}

            {nextPeriodLine && (
              <div style={{ textAlign: currentPeriodEndLine ? "right" : "left" }}>
                <div style={smallLabel}>Next Academic Period</div>
                <div style={strongValue}>{nextAcademicPeriod?.name || "Next Period"}</div>
                <div style={{ marginTop: 2, fontSize: compact ? 8.8 : 9.7, fontWeight: 900, color: primary }}>
                  Begins: {nextAcademicPeriod?.formattedStartDate || nextPeriodLine.replace(/^.*?:\s*/i, "")}
                </div>
              </div>
            )}

            {generatedDateValue && currentPeriodEndLine && nextPeriodLine && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="montessori-timeline-marker" style={{ borderColor: primary }} />
              </div>
            )}

            {generatedDateValue && (
              <div style={{ textAlign: currentPeriodEndLine || nextPeriodLine ? "right" : "left" }}>
                <div style={smallLabel}>{(resolvedSettings as any).generatedDateLabel || "Generated"}</div>
                <div style={strongValue}>Learning Record</div>
                <div style={{ marginTop: 2, fontSize: compact ? 8.8 : 9.7, fontWeight: 900, color: primary }}>
                  {generatedDateValue}
                </div>
              </div>
            )}
          </section>
        )}

        <section
          style={{
            marginTop: 15,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showParentSignature ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
            gap: 20,
            alignItems: "end",
          }}
        >
          {[
            { label: resolvedSettings.classTeacherLabel, name: signatures.classTeacherName || "", image: "", show: true },
            {
              label: resolvedSettings.headTeacherLabel,
              name: firstText(signatures.headTeacherName, signatures.principalName),
              image: reportSignatureImage,
              show: true,
            },
            {
              label: resolvedSettings.parentLabel,
              name: firstText(signatures.parentName, signatures.guardianName),
              image: "",
              show: resolvedSettings.showParentSignature,
            },
          ].filter((item) => item.show).map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              {item.image && <img src={item.image} alt="Official signature" style={{ height: 30, objectFit: "contain", marginBottom: 2 }} />}
              <div style={{ minHeight: 16, marginBottom: 3, fontSize: compact ? 9 : 10, fontWeight: 950, color: "#111827" }}>
                {item.name}
              </div>
              <div style={{ borderTop: "1px solid #111", paddingTop: 5, fontSize: 9.8, fontWeight: 900 }}>
                {item.label}
              </div>
            </div>
          ))}
        </section>

        <footer
          style={{
            marginTop: 8,
            borderTop: `1.5px solid ${primary}`,
            paddingTop: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 7.8,
            color: "#6b7280",
            fontWeight: 700,
          }}
        >
          <span>Official Montessori learning record for {branding.schoolName}</span>
          <span>Powered by Eleeveon School Management System</span>
        </footer>
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
          <span>{report.className} · {header.academicPeriod?.name || "Academic Period"}</span>
        </div>

        <div className="src-zoom-controls" aria-label="Report zoom controls">
          <button type="button" className="src-zoom-icon-button" onClick={zoomOut} onPointerDown={() => startZoomHold("out")} onPointerUp={stopZoomHold} onPointerCancel={stopZoomHold} onPointerLeave={stopZoomHold} aria-label="Zoom out" title="Click or hold to zoom out">−</button>
          <button type="button" className="src-zoom-fit-button" onClick={fitToScreen} aria-label="Fit to screen" title="Fit to screen">Fit</button>

          <div className="src-zoom-menu-wrap">
            <button type="button" className="src-zoom-percent-button" onClick={() => setZoomMenuOpen((prev) => !prev)} aria-label="Choose zoom percentage" aria-expanded={zoomMenuOpen} title="Choose zoom percentage">
              <span>{displayZoomPercent}%</span>
              <span className="src-zoom-caret">▾</span>
            </button>

            {zoomMenuOpen && (
              <div className="src-zoom-menu" role="menu">
                {[30, 40, 50, 60, 70, 80, 90, 100].map((percent) => (
                  <button key={percent} type="button" role="menuitem" onClick={() => selectZoomPercent(percent)} className={`src-zoom-menu-item ${Math.round(previewScale * 100) === percent ? "active" : ""}`}>
                    {percent}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="src-zoom-icon-button" onClick={zoomIn} onPointerDown={() => startZoomHold("in")} onPointerUp={stopZoomHold} onPointerCancel={stopZoomHold} onPointerLeave={stopZoomHold} aria-label="Zoom in" title="Click or hold to zoom in">+</button>
        </div>
      </div>

      <div ref={previewFrameRef} className="src-preview-scroll report-screen-scroll" style={{ "--report-preview-scale": previewScale } as React.CSSProperties}>
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
.src-empty-card {
  padding: 20px;
  border: 1px dashed #ccc;
  border-radius: 16px;
  background: var(--surface, #fff);
  color: var(--text, #1f2937);
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

.src-mobile-toolbar div { min-width: 0; }
.src-mobile-toolbar strong,
.src-mobile-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.src-mobile-toolbar strong { font-size: 13px; font-weight: 950; color: var(--text, #1f2937); }
.src-mobile-toolbar span { margin-top: 2px; color: var(--muted, #78716c); font-size: 11px; font-weight: 750; }

.src-zoom-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #78716c) 10%, transparent);
  border: 1px solid rgba(148,163,184,.18);
}
.src-zoom-controls button { appearance: none; -webkit-appearance: none; border: 0; cursor: pointer; font-family: inherit; }
.src-zoom-icon-button,
.src-zoom-fit-button,
.src-zoom-percent-button {
  height: 32px;
  min-height: 32px;
  border-radius: 999px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-weight: 950;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
}
.src-zoom-icon-button { width: 32px; min-width: 32px; padding: 0; font-size: 18px; }
.src-zoom-fit-button { min-width: 42px; padding: 0 12px; font-size: 12px; }
.src-zoom-percent-button { min-width: 68px; padding: 0 10px; font-size: 12px; gap: 5px; font-variant-numeric: tabular-nums; }
.src-zoom-caret { font-size: 9px; line-height: 1; opacity: .9; transform: translateY(1px); }
.src-zoom-menu-wrap { position: relative; display: inline-flex; flex: 0 0 auto; }
.src-zoom-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 40;
  width: 114px;
  max-height: 252px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
  padding: 7px;
  border-radius: 16px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148,163,184,.34);
  box-shadow: 0 20px 46px rgba(15,23,42,.20);
  box-sizing: border-box;
}
.src-zoom-menu-item {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 11px;
  background: transparent;
  color: var(--text, #1f2937);
  font-size: 12px;
  font-weight: 900;
  display: flex !important;
  align-items: center;
  justify-content: center;
}
.src-zoom-menu-item:hover { background: color-mix(in srgb, var(--primary-color, #2563eb) 10%, transparent); }
.src-zoom-menu-item.active { background: var(--primary-color, #2563eb); color: #fff; }

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
.src-preview-center {
  width: 100%;
  height: calc(297mm * var(--report-preview-scale));
  min-height: calc(297mm * var(--report-preview-scale));
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
}
.src-preview-scale {
  width: 210mm;
  height: 297mm;
  min-width: 210mm;
  min-height: 297mm;
  transform: scale(var(--report-preview-scale));
  transform-origin: top center;
  flex: 0 0 auto;
}
.montessori-template-page,
.student-report-card-page,
.src-a4-page {
  width: 210mm !important;
  min-width: 210mm !important;
  max-width: 210mm !important;
  min-height: 297mm !important;
  box-sizing: border-box !important;
}
.src-preview-shell:not(.expanded) .src-preview-scroll { overflow: hidden; }
.src-preview-shell.expanded .src-preview-scroll { overflow: auto; max-height: none; }
.src-preview-shell.expanded .src-preview-center {
  width: max(100%, calc(210mm * var(--report-preview-scale)));
  height: calc(297mm * var(--report-preview-scale));
  min-height: calc(297mm * var(--report-preview-scale));
  overflow: visible;
  margin: 0 auto;
}

.montessori-frame-line {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  border-radius: 18px;
}
.montessori-frame-outer { inset: 4.5mm; border: 1.5px solid; opacity: .65; }
.montessori-frame-inner { inset: 6.5mm; border: 1px solid #e5e7eb; }
.montessori-corner {
  position: absolute;
  z-index: 0;
  width: 17mm;
  height: 17mm;
  pointer-events: none;
  opacity: .85;
}
.montessori-corner-tl { left: 4.5mm; top: 4.5mm; border-left: 3px solid; border-top: 3px solid; border-top-left-radius: 18px; }
.montessori-corner-tr { right: 4.5mm; top: 4.5mm; border-right: 3px solid; border-top: 3px solid; border-top-right-radius: 18px; }
.montessori-corner-bl { left: 4.5mm; bottom: 4.5mm; border-left: 3px solid; border-bottom: 3px solid; border-bottom-left-radius: 18px; }
.montessori-corner-br { right: 4.5mm; bottom: 4.5mm; border-right: 3px solid; border-bottom: 3px solid; border-bottom-right-radius: 18px; }
.montessori-grade-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 6px;
  font-weight: 950;
  background: #fff;
}
.montessori-timeline-marker {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 3px solid;
  display: inline-block;
  position: relative;
}
.montessori-timeline-marker::before,
.montessori-timeline-marker::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 16px;
  height: 1px;
  background: #cbd5e1;
}
.montessori-timeline-marker::before { right: 100%; }
.montessori-timeline-marker::after { left: 100%; }

@media screen and (max-width: 380px) {
  .src-mobile-toolbar { gap: 6px; padding: 8px; }
  .src-mobile-toolbar strong { font-size: 12px; }
  .src-mobile-toolbar span { font-size: 10px; }
  .src-zoom-controls { gap: 3px; padding: 3px; }
  .src-zoom-icon-button { width: 29px; min-width: 29px; height: 29px; min-height: 29px; font-size: 16px; }
  .src-zoom-fit-button { min-width: 36px; height: 29px; min-height: 29px; padding: 0 8px; font-size: 10px; }
  .src-zoom-percent-button { min-width: 62px; height: 29px; min-height: 29px; padding: 0 8px; font-size: 10px; gap: 4px; }
  .src-zoom-menu { width: 106px; max-height: 210px; padding: 6px; }
  .src-zoom-menu-item { height: 30px; min-height: 30px; font-size: 11px; }
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
  .montessori-template-page,
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

  .montessori-template-page [data-report-color-block="true"] {
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
