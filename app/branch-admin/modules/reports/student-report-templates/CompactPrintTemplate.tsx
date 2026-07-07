"use client";

/**
 * reports/student-report-templates/CompactPrintTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT PRINT STUDENT REPORT TEMPLATE
 * ---------------------------------------------------------
 *
 * Compact Print keeps the same report-engine dataset and visibility settings
 * used by ClassicFormalTemplate, but changes only the arrangement and styling.
 *
 * Design goal:
 * - fit more information on one A4 page
 * - reduce decorative space
 * - use a compact letterhead strip instead of a large formal header
 * - keep the same subject table, summary, remarks, period dates and signatures
 * - preserve the same PDF-like mobile preview and print behavior
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

import {
  currentAcademicPeriodEndText,
  firstText,
  friendlyReportDate,
  formatNumber,
  formatPercent,
  getContrastTextColor,
  nextAcademicPeriodText,
  normalizeStudentReportTemplateData,
  ordinal,
  reportTemplateEmptyMessage,
} from "../shared/ReportTemplateUtils";

type Props = StudentReportTemplateBaseProps & {
  dataset?: StudentReportCardDataset;
};

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
    currentAcademicPeriod,
    nextAcademicPeriod,
    signatures,
  } = normalized as any;

  const primary = branding.primaryColor || "var(--primary-color)";
  const contrast = getContrastTextColor(primary);
  const fontFamily = branding.fontFamily || "Arial, sans-serif";
  const reportBackgroundImage = branding.reportCardBackgroundImage || "";
  const reportWatermark = branding.reportCardWatermark || branding.logo || "";
  const reportSignatureImage = signatures.officialSignatureImage || branding.reportCardSignatureImage || "";
  const studentPhoto = studentInfo.studentPhoto || "";

  const label: React.CSSProperties = {
    fontSize: 7.6,
    lineHeight: 1.1,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    fontWeight: 900,
    color: "#4b5563",
  };

  const value: React.CSSProperties = {
    marginTop: 1,
    fontSize: 9.1,
    lineHeight: 1.12,
    fontWeight: 900,
    color: "#111827",
  };

  const infoCell: React.CSSProperties = {
    border: "1px solid #c8ccd3",
    padding: "3.5px 5px",
    minHeight: 26,
    background: "rgba(255,255,255,.97)",
    boxSizing: "border-box",
  };

  const tableBase: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 8.35,
    lineHeight: 1.13,
  };

  const th: React.CSSProperties = {
    border: "1px solid #111827",
    padding: "3px 3px",
    background: primary,
    color: contrast,
    textAlign: "center",
    fontWeight: 950,
    lineHeight: 1.08,
  };

  const td: React.CSSProperties = {
    border: "1px solid #7d8590",
    padding: "2.8px 3px",
    verticalAlign: "middle",
    lineHeight: 1.12,
  };

  const visibleStudentInfoBoxes = [
    { key: "studentName", label: "Student", value: report.studentName, span: 2, show: true },
    { key: "admissionNumber", label: "Admission No.", value: report.admissionNumber || "-", show: true },
    { key: "gender", label: "Gender", value: report.gender || student?.gender || "-", show: true },
    { key: "class", label: "Class", value: report.className, show: true },
    { key: "period", label: "Academic Period", value: header.academicPeriod?.name || "-", show: true },
    {
      key: "numberOnRoll",
      label: resolvedSettings.numberOnRollLabel || "Number On Roll",
      value: studentInfo.numberOnRoll || (report as any).numberOnRoll || (report as any).classSize || (dataset as any)?.numberOnRoll || "-",
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
    { key: "classPosition", label: resolvedSettings.classPositionLabel || "Class Position", value: ordinal(report.overallPosition), show: resolvedSettings.showClassPosition },
    { key: "gpa", label: "GPA", value: report.overallGPA != null ? formatNumber(report.overallGPA, 2) : "-", show: resolvedSettings.showGPA },
  ].filter((item) => item.show);

  const currentPeriodEndLine = currentAcademicPeriodEndText(currentAcademicPeriod, resolvedSettings);
  const nextPeriodLine = nextAcademicPeriodText(nextAcademicPeriod, resolvedSettings);
  const generatedDateValue=(resolvedSettings as any).showGeneratedDate?friendlyReportDate((dataset as any)?.generatedAt):"";

  const subjectTableColumnCount =
    1 +
    assessmentColumns.length +
    2 +
    (resolvedSettings.showGrade ? 1 : 0) +
    (resolvedSettings.showSubjectPosition ? 1 : 0) +
    (resolvedSettings.showSubjectRemarks ? 1 : 0);

  const compactPageStyle: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 18px",
    padding: "6.8mm",
    background: "#fff",
    color: "#111827",
    border: "1px solid #d8d8d8",
    boxShadow: "0 18px 50px rgba(15,23,42,.14)",
    boxSizing: "border-box",
    fontFamily,
    position: "relative",
    overflow: "hidden",
    pageBreakAfter: pageBreakAfter === false ? "auto" : "always",
  };

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
            opacity: 0.03,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <img
            src={reportWatermark}
            alt="Watermark"
            style={{ width: "50%", maxHeight: "50%", objectFit: "contain" }}
          />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <header
          style={{
            display: "grid",
            gridTemplateColumns: branding.logo ? "52px 1fr 150px" : "1fr 150px",
            gap: 8,
            alignItems: "center",
            border: "1.5px solid #111827",
            borderTop: `5px solid ${primary}`,
            padding: "6px 7px",
            background: "rgba(255,255,255,.98)",
          }}
        >
          {branding.logo && (
            <div
              style={{
                width: 50,
                height: 50,
                border: "1px solid #c8ccd3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <img src={branding.logo} alt="School logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17.2, lineHeight: 1, fontWeight: 1000, textTransform: "uppercase", color: "#111827" }}>
              {branding.schoolName}
            </div>
            {branding.motto && (
              <div style={{ marginTop: 2, fontSize: 8.6, fontWeight: 800, color: "#374151" }}>
                {branding.motto}
              </div>
            )}
            <div style={{ marginTop: 3, fontSize: 7.8, fontWeight: 750, color: "#4b5563", lineHeight: 1.25 }}>
              {[branding.branchName, branding.address, branding.phone, branding.email].filter(Boolean).join(" · ")}
            </div>
          </div>

          <div
            data-report-color-block="true"
            style={{
              background: primary,
              color: contrast,
              padding: "6px 7px",
              textAlign: "center",
              fontWeight: 1000,
              textTransform: "uppercase",
              letterSpacing: .45,
              fontSize: 9,
              lineHeight: 1.15,
              border: "1px solid #111827",
            }}
          >
            Compact Academic Report
            <div style={{ marginTop: 2, fontSize: 7.4, opacity: .95 }}>
              {header.academicStructure?.name || "Academic Year"}
            </div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: resolvedSettings.showStudentPhoto ? "1fr 58px" : "1fr",
            gap: 5,
            marginTop: 5,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 3.5,
            }}
          >
            {visibleStudentInfoBoxes.map((box) => (
              <div key={box.key} style={{ ...infoCell, gridColumn: (box as any).span ? `span ${(box as any).span}` : undefined }}>
                <div style={label}>{box.label}</div>
                <div style={{ ...value, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{box.value}</div>
              </div>
            ))}
          </div>

          {resolvedSettings.showStudentPhoto && (
            <div
              style={{
                border: "1px solid #c8ccd3",
                background: "#f8fafc",
                minHeight: 58,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {studentPhoto ? (
                <img src={studentPhoto} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 7.4, fontWeight: 950, color: "#6b7280" }}>PHOTO</span>
              )}
            </div>
          )}
        </section>

        {summaryCards.length > 0 && (
          <section
            style={{
              marginTop: 5,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))`,
              gap: 4,
            }}
          >
            {summaryCards.map((card) => (
              <div
                key={card.key}
                style={{
                  border: "1.2px solid #111827",
                  borderLeft: `5px solid ${primary}`,
                  padding: "4px 5px",
                  background: "rgba(255,255,255,.98)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span style={label}>{card.label}</span>
                <strong style={{ color: "#111827", fontSize: 11.2, lineHeight: 1 }}>{card.value}</strong>
              </div>
            ))}
          </section>
        )}

        <section style={{ marginTop: 5 }}>
          <table style={tableBase}>
            <thead>
              <tr>
                <th data-report-color-block="true" style={{ ...th, textAlign: "left", minWidth: 88 }}>Subject</th>

                {assessmentColumns.map((column) => (
                  <th data-report-color-block="true" key={column.assessmentStructureItemId} style={th}>
                    {column.name}
                    <div style={{ fontSize: 6.7, marginTop: 1, opacity: .95 }}>W:{formatNumber(column.weight, 0)}</div>
                  </th>
                ))}

                <th data-report-color-block="true" style={th}>Weighted</th>
                <th data-report-color-block="true" style={th}>%</th>

                {resolvedSettings.showGrade && <th data-report-color-block="true" style={th}>Grade</th>}

                {resolvedSettings.showSubjectPosition && (
                  <th data-report-color-block="true" style={th}>{resolvedSettings.subjectPositionLabel || "Pos."}</th>
                )}

                {resolvedSettings.showSubjectRemarks && (
                  <th data-report-color-block="true" style={{ ...th, minWidth: 76 }}>Remark</th>
                )}
              </tr>
            </thead>

            <tbody>
              {report.subjectResults.map((subject) => (
                <tr key={subject.classSubjectId}>
                  <td style={{ ...td, fontWeight: 900, color: "#111827" }}>
                    {subject.subjectName}
                    {resolvedSettings.showTeacherNames && subject.teacherName && (
                      <div style={{ marginTop: 1, fontSize: 6.8, color: "#4b5563", fontWeight: 700 }}>
                        {subject.teacherName}
                      </div>
                    )}
                  </td>

                  {assessmentColumns.map((column) => {
                    const item = subject.breakdown.find((row) => row.assessmentStructureItemId === column.assessmentStructureItemId);

                    return (
                      <td key={column.assessmentStructureItemId} style={{ ...td, textAlign: "center" }}>
                        {item ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}` : "-"}
                      </td>
                    );
                  })}

                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{formatNumber(subject.weightedTotal, 1)}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{formatPercent(subject.percentage, 1, "-")}</td>

                  {resolvedSettings.showGrade && (
                    <td style={{ ...td, textAlign: "center", fontWeight: 1000 }}>{subject.grade}</td>
                  )}

                  {resolvedSettings.showSubjectPosition && (
                    <td style={{ ...td, textAlign: "center" }}>{ordinal(subject.subjectPosition)}</td>
                  )}

                  {resolvedSettings.showSubjectRemarks && <td style={td}>{subject.remark}</td>}
                </tr>
              ))}

              {!report.subjectResults.length && (
                <tr>
                  <td style={{ ...td, textAlign: "center", padding: 12 }} colSpan={subjectTableColumnCount}>
                    No subject results available for this selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section
          style={{
            marginTop: 5,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 5,
          }}
        >
          <div style={{ border: "1px solid #111827", minHeight: 42, padding: 5, background: "rgba(255,255,255,.97)" }}>
            <div style={label}>{resolvedSettings.classTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 3, fontSize: 8.4, lineHeight: 1.18, color: "#111827" }}>{report.classTeacherRemark || ""}</div>
          </div>

          <div style={{ border: "1px solid #111827", minHeight: 42, padding: 5, background: "rgba(255,255,255,.97)" }}>
            <div style={label}>{resolvedSettings.headTeacherLabel}'s Remark</div>
            <div style={{ marginTop: 3, fontSize: 8.4, lineHeight: 1.18, color: "#111827" }}>{report.headTeacherRemark || ""}</div>
          </div>
        </section>

        {(currentPeriodEndLine || nextPeriodLine || generatedDateValue) && (
          <section
            style={{
              marginTop: 5,
              display: "grid",
              gridTemplateColumns:[currentPeriodEndLine,nextPeriodLine,generatedDateValue].filter(Boolean).length>=3?"repeat(3,minmax(0,1fr))":[currentPeriodEndLine,nextPeriodLine,generatedDateValue].filter(Boolean).length===2?"repeat(2,minmax(0,1fr))":"1fr",
              gap: 5,
            }}
          >
            {currentPeriodEndLine && (
              <div style={{ border: "1px solid #111827", borderLeft: `5px solid ${primary}`, padding: "4px 6px", background: "rgba(255,255,255,.97)" }}>
                <div style={label}>This Academic Period</div>
                <div style={{ ...value, display: "flex", justifyContent: "space-between", gap: 7 }}>
                  <span>{currentAcademicPeriod?.name || header.academicPeriod?.name || "Current Period"}</span>
                  <span>{currentAcademicPeriod?.formattedEndDate || currentPeriodEndLine.replace(/^.*?:\s*/i, "")}</span>
                </div>
              </div>
            )}

            {nextPeriodLine && (
              <div style={{ border: "1px solid #111827", borderLeft: `5px solid ${primary}`, padding: "4px 6px", background: "rgba(255,255,255,.97)" }}>
                <div style={label}>Next Academic Period</div>
                <div style={{ ...value, display: "flex", justifyContent: "space-between", gap: 7 }}>
                  <span>{nextAcademicPeriod?.name || "Next Period"}</span>
                  <span>{nextAcademicPeriod?.formattedStartDate || nextPeriodLine.replace(/^.*?:\s*/i, "")}</span>
                </div>
              </div>
            )}
            {generatedDateValue && (
              <div style={{ border: "1px solid #111827", borderLeft: `5px solid ${primary}`, padding: "4px 6px", background: "rgba(255,255,255,.97)" }}>
                <div style={label}>{(resolvedSettings as any).generatedDateLabel || "Generated"}</div>
                <div style={{ ...value, display:"flex", justifyContent:"space-between", gap:7 }}>
                  <span>Report Card</span>
                  <span>{generatedDateValue}</span>
                </div>
              </div>
            )}
          </section>
        )}

        <section
          style={{
            marginTop: 13,
            display: "grid",
            gridTemplateColumns: resolvedSettings.showParentSignature ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
            gap: 16,
            alignItems: "end",
          }}
        >
          <CompactSignature
            name={signatures.classTeacherName || ""}
            label={resolvedSettings.classTeacherLabel}
          />

          <div style={{ textAlign: "center" }}>
            {reportSignatureImage && (
              <img src={reportSignatureImage} alt="Official signature" style={{ height: 23, objectFit: "contain", marginBottom: 1 }} />
            )}
            <CompactSignature
              name={firstText(signatures.headTeacherName, signatures.principalName)}
              label={resolvedSettings.headTeacherLabel}
              inline
            />
          </div>

          {resolvedSettings.showParentSignature && (
            <CompactSignature
              name={firstText(signatures.parentName, signatures.guardianName)}
              label={resolvedSettings.parentLabel}
            />
          )}
        </section>

        <footer
          style={{
            marginTop: 6,
            borderTop: `1.2px solid ${primary}`,
            paddingTop: 3,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 6.9,
            color: "#4b5563",
            fontWeight: 700,
          }}
        >
          <span>Official academic report generated for {branding.schoolName}</span>
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
          <button
            type="button"
            className="src-zoom-icon-button"
            onClick={() => applyZoomStep("out")}
            onPointerDown={() => startZoomHold("out")}
            onPointerUp={stopZoomHold}
            onPointerCancel={stopZoomHold}
            onPointerLeave={stopZoomHold}
            aria-label="Zoom out"
            title="Click or hold to zoom out"
          >
            −
          </button>

          <button type="button" className="src-zoom-fit-button" onClick={fitToScreen} aria-label="Fit to screen" title="Fit to screen">
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
                {[30, 40, 50, 60, 70, 80, 90, 100].map((percent) => (
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
            onClick={() => applyZoomStep("in")}
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

function CompactSignature({ name, label, inline = false }: { name?: string; label: string; inline?: boolean }) {
  if (inline) {
    return (
      <>
        <div style={{ minHeight: 13, marginBottom: 2, fontSize: 8.2, fontWeight: 900, color: "#111827" }}>{name || ""}</div>
        <div style={{ borderTop: "1px solid #111827", paddingTop: 3, fontSize: 8.1, fontWeight: 900, color: "#111827" }}>{label}</div>
      </>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ minHeight: 13, marginBottom: 2, fontSize: 8.2, fontWeight: 900, color: "#111827" }}>{name || ""}</div>
      <div style={{ borderTop: "1px solid #111827", paddingTop: 3, fontSize: 8.1, fontWeight: 900, color: "#111827" }}>{label}</div>
    </div>
  );
}

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
  box-shadow: 0 6px 14px rgba(15,23,42,.12);
  white-space: nowrap;
}

.src-zoom-icon-button {
  width: 32px;
  min-width: 32px;
  padding: 0;
  font-size: 18px;
}

.src-zoom-fit-button {
  min-width: 42px;
  padding: 0 12px;
  font-size: 12px;
}

.src-zoom-menu-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.src-zoom-percent-button {
  min-width: 68px;
  padding: 0 10px;
  font-size: 12px;
  gap: 5px;
  font-variant-numeric: tabular-nums;
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

.compact-print-template-page,
.student-report-card-page,
.src-a4-page {
  width: 210mm !important;
  min-width: 210mm !important;
  max-width: 210mm !important;
  min-height: 297mm !important;
  box-sizing: border-box !important;
}

.src-preview-shell:not(.expanded) .src-preview-scroll { overflow: hidden; }
.src-preview-shell:not(.expanded) .src-preview-scale { transform: scale(var(--report-preview-scale)); }

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
  .compact-print-template-page,
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

  .compact-print-template-page [data-report-color-block="true"] {
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
