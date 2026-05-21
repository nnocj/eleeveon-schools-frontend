"use client";

/**
 * reports/components/StudentCumulativeTranscript.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST CUMULATIVE TRANSCRIPT
 * ---------------------------------------------------------
 *
 * Enhancements:
 * - Exact printable transcript preserved.
 * - Mobile responsive preview mode.
 * - Dashboard overflow protection.
 * - Small-screen scaling.
 * - Expand/full preview mode.
 * - Safer responsive tables.
 * - WhatsApp-style compact review UX.
 */

import React, { useState } from "react";

import ReportHeader from "./ReportHeader";

import type {
  StudentCumulativeTranscript,
  StudentProgressionStep,
} from "../engine/cumulative-report-types";

import type { ReportHeaderData } from "../engine/report-types";

// ======================================================
// PROPS
// ======================================================

type Props = {
  transcript?: StudentCumulativeTranscript;
  header: ReportHeaderData;
  compact?: boolean;
  showWatermark?: boolean;
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

const trendLabel = (trend?: string) => {
  if (trend === "up") return "Improving";
  if (trend === "down") return "Declining";
  if (trend === "stable") return "Stable";
  return "-";
};

const decisionLabel = (decision?: string) => {
  if (!decision) return "-";
  return decision.charAt(0).toUpperCase() + decision.slice(1);
};

// ======================================================
// COMPONENT
// ======================================================

export default function StudentCumulativeTranscript({
  transcript,
  header,
  compact = false,
  showWatermark = true,
  pageBreakAfter = true,
  mobilePreview = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const branding = header.branding;
  const primary = branding.primaryColor || "var(--primary-color)";

  const page: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto 20px",
    padding: compact ? "9mm" : "11mm",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: branding.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
    position: "relative",
    overflow: "hidden",
    pageBreakAfter: pageBreakAfter ? "always" : "auto",
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
    lineHeight: 1.2,
  };

  const td: React.CSSProperties = {
    border: "1px solid #222",
    padding: compact ? 3 : 5,
    verticalAlign: "middle",
    lineHeight: 1.25,
  };

  const label: React.CSSProperties = {
    fontSize: compact ? 8 : 9,
    opacity: 0.72,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: 700,
  };

  const value: React.CSSProperties = {
    marginTop: 2,
    fontSize: compact ? 10 : 11,
    fontWeight: 850,
  };

  const infoBox: React.CSSProperties = {
    border: "1px solid #cfcfcf",
    padding: compact ? 5 : 6,
    background: "rgba(255,255,255,0.92)",
    minHeight: compact ? 35 : 40,
  };

  const sectionTitle: React.CSSProperties = {
    marginTop: 12,
    marginBottom: 6,
    padding: "6px 9px",
    background: "#111",
    color: "#fff",
    fontSize: compact ? 9 : 10.5,
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    borderRadius: 999,
    display: "inline-block",
  };

  const emptyState = (
    <section style={page}>
      <ReportHeader
        header={header}
        title="Cumulative Academic Transcript"
        compact={compact}
        orientation="portrait"
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
        Select a student with historical report snapshots to generate a cumulative academic transcript.
      </div>
    </section>
  );

  if (!transcript) {
    return (
      <div className="sct-shell">
        <style>{css}</style>
        {emptyState}
      </div>
    );
  }

  const reportPage = (
    <section
      className="print-page report-page-break cumulative-transcript-page sct-a4-page"
      style={page}
    >
      {branding.reportCardBackgroundImage && (
        <img
          src={branding.reportCardBackgroundImage}
          alt="Report background"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.03,
            zIndex: 0,
          }}
        />
      )}

      {showWatermark && (branding.reportCardWatermark || branding.logo) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.04,
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
          title="Cumulative Academic Transcript"
          subtitle={`${transcript.totalPeriods} Periods • ${transcript.totalSubjects} Subjects`}
          compact={compact}
          orientation="portrait"
        />

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
              <div style={value}>{transcript.studentName}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Admission No.</div>
              <div style={value}>{transcript.admissionNumber || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Gender</div>
              <div style={value}>{transcript.gender || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Current Class</div>
              <div style={value}>{transcript.currentClassName || "-"}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Periods</div>
              <div style={value}>{transcript.totalPeriods}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Subjects</div>
              <div style={value}>{transcript.totalSubjects}</div>
            </div>

            <div style={infoBox}>
              <div style={label}>Guardian</div>
              <div style={value}>{transcript.guardianName || transcript.parentName || "-"}</div>
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
            {transcript.studentPhoto ? (
              <img
                src={transcript.studentPhoto}
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

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Cumulative Total</div>
            <div style={{ ...value, fontSize: compact ? 13 : 15 }}>
              {formatNumber(transcript.cumulativeTotal, 1)}
            </div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Cumulative Avg.</div>
            <div style={{ ...value, fontSize: compact ? 13 : 15 }}>
              {formatNumber(transcript.cumulativeAverage, 1)}%
            </div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Cumulative GPA</div>
            <div style={{ ...value, fontSize: compact ? 13 : 15 }}>
              {transcript.cumulativeGPA != null
                ? formatNumber(transcript.cumulativeGPA, 2)
                : "-"}
            </div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Highest Avg.</div>
            <div style={{ ...value, fontSize: compact ? 13 : 15 }}>
              {formatNumber(transcript.highestAverage, 1)}%
            </div>
          </div>

          <div style={{ border: "1px solid #222", padding: 7, textAlign: "center" }}>
            <div style={label}>Trend</div>
            <div style={{ ...value, fontSize: compact ? 13 : 15 }}>
              {trendLabel(transcript.overallTrend)}
            </div>
          </div>
        </div>

        <div style={sectionTitle}>Academic Period History</div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Academic Year</th>
                <th style={th}>Period</th>
                <th style={th}>Class</th>
                <th style={th}>Subjects</th>
                <th style={th}>Total</th>
                <th style={th}>Average</th>
                <th style={th}>GPA</th>
                <th style={th}>Position</th>
                <th style={th}>Decision</th>
              </tr>
            </thead>

            <tbody>
              {transcript.periods.map((period, index) => (
                <tr key={`${period.academicPeriodId}-${period.snapshotId || index}`}>
                  <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>
                  <td style={td}>{period.academicYear || "-"}</td>
                  <td style={td}>{period.academicPeriodName}</td>
                  <td style={td}>{period.className}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {period.subjectResults.length}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {formatNumber(period.total, 1)}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {formatNumber(period.average, 1)}%
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {period.gpa != null ? formatNumber(period.gpa, 2) : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {ordinal(period.position)}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {decisionLabel(period.recommendation)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={sectionTitle}>Subject Performance History</div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Subject</th>
                <th style={th}>Periods</th>
                <th style={th}>Average</th>
                <th style={th}>Highest</th>
                <th style={th}>Lowest</th>
                <th style={th}>Latest</th>
                <th style={th}>Trend</th>
              </tr>
            </thead>

            <tbody>
              {transcript.subjectHistories.map((subject) => (
                <tr key={subject.subjectId || subject.subjectName}>
                  <td style={{ ...td, fontWeight: 800 }}>
                    {subject.subjectName}
                    {subject.subjectCode && (
                      <div style={{ fontSize: 8, opacity: 0.7 }}>
                        {subject.subjectCode}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {subject.periods.length}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {formatNumber(subject.average, 1)}%
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {formatNumber(subject.highest, 1)}%
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {formatNumber(subject.lowest, 1)}%
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {subject.latest != null ? `${formatNumber(subject.latest, 1)}%` : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>
                    {trendLabel(subject.trend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={sectionTitle}>Progression / Promotion History</div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>From Class</th>
                <th style={th}>To Class</th>
                <th style={th}>From Period</th>
                <th style={th}>To Period</th>
                <th style={th}>Average</th>
                <th style={th}>Recommendation</th>
                <th style={th}>Final Decision</th>
              </tr>
            </thead>

            <tbody>
              {transcript.progression.map((step: StudentProgressionStep, index) => (
                <tr key={step.id}>
                  <td style={{ ...td, textAlign: "center" }}>{index + 1}</td>
                  <td style={td}>{step.fromClassName || "-"}</td>
                  <td style={td}>{step.toClassName || "-"}</td>
                  <td style={td}>{step.fromAcademicPeriodName || "-"}</td>
                  <td style={td}>{step.toAcademicPeriodName || "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {step.average != null ? `${formatNumber(step.average, 1)}%` : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {decisionLabel(step.recommendation)}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                    {decisionLabel(step.finalDecision)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 22,
            alignItems: "end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ minHeight: 18 }} />
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              Class Teacher
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            {branding.reportCardSignatureImage && (
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
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              Headteacher / Principal
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                minHeight: 16,
                marginBottom: 3,
                fontSize: compact ? 9.5 : 10.5,
                fontWeight: 800,
              }}
            >
              {transcript.guardianName || transcript.parentName || ""}
            </div>
            <div
              style={{
                borderTop: "1px solid #111",
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              Parent / Guardian
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
          <span>Official cumulative academic transcript for {branding.schoolName}</span>
          <span>Powered by Eleeveon School Management System</span>
        </div>
      </div>
    </section>
  );

  if (!mobilePreview) {
    return (
      <div className="sct-shell">
        <style>{css}</style>
        {reportPage}
      </div>
    );
  }

  return (
    <div className={`sct-shell ${expanded ? "expanded" : ""}`}>
      <style>{css}</style>

      <div className="sct-toolbar report-no-print">
        <div>
          <strong>{transcript.studentName}</strong>
          <span>
            {transcript.totalPeriods} periods · {transcript.totalSubjects} subjects
          </span>
        </div>

        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Fit Preview" : "Expand"}
        </button>
      </div>

      <div className="sct-preview-scroll report-screen-scroll">
        <div className="sct-preview-scale">
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
.sct-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.sct-toolbar {
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

.sct-toolbar div {
  min-width: 0;
}

.sct-toolbar strong,
.sct-toolbar span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sct-toolbar strong {
  font-size: 13px;
  font-weight: 950;
  color: var(--text, #0f172a);
}

.sct-toolbar span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
}

.sct-toolbar button {
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

.sct-preview-scroll {
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

.sct-preview-scale {
  width: max-content;
  min-width: 100%;
  transform-origin: top left;
}

@media screen and (max-width: 720px) {
  .sct-toolbar {
    display: flex;
  }

  .sct-shell:not(.expanded) .sct-preview-scroll {
    overflow: hidden;
    max-height: 82vh;
  }

  .sct-shell:not(.expanded) .sct-preview-scale {
    width: 210mm;
    transform: scale(calc((100vw - 28px) / 793.7008));
    transform-origin: top left;
  }

  .sct-shell:not(.expanded) .sct-preview-scroll::after {
    content: "";
    display: block;
    height: calc(1122.5197px * ((100vw - 28px) / 793.7008));
  }

  .sct-shell.expanded .sct-preview-scroll {
    overflow-x: auto;
    max-height: none;
  }

  .sct-shell.expanded .sct-preview-scale {
    transform: none;
  }
}

@media print {
  .sct-shell,
  .sct-preview-scroll,
  .sct-preview-scale {
    display: contents !important;
    transform: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
  }

  .sct-toolbar {
    display: none !important;
  }
}`;