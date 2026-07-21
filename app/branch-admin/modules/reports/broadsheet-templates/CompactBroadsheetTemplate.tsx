"use client";

/**
 * reports/broadsheet-templates/CompactBroadsheetTemplate.tsx
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — COMPACT BROADSHEET TEMPLATE
 * ---------------------------------------------------------
 *
 * One dense, print-efficient renderer for:
 * - subject broadsheets
 * - class broadsheets
 * - annual cumulative broadsheets
 *
 * This file does not calculate academic results. It renders engine datasets.
 *
 * Compact design language:
 * - high-density summary bands
 * - tight landscape sheet
 * - compact branded table headers
 * - tight zebra rows
 * - minimal spacing and maximum readable data
 * - black-and-white safe print fallback
 */

import React from "react";

import type {
  AnnualBroadsheet,
  AnnualBroadsheetStudentRow,
} from "../engine/cumulative-report-types";

import type {
  ComputedClassBroadsheet,
  ComputedSubjectBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

import type {
  BroadsheetKind,
  BroadsheetTemplateBaseProps,
  ResolvedBroadsheetTemplateSettings,
} from "./broadsheet-template-types";

import {
  broadsheetPageStyle,
  firstText,
  formatNumber,
  formatPercent,
  friendlyDate,
  ordinal,
  resolveBroadsheetBranding,
  resolveBroadsheetStudentPhoto,
  resolveBroadsheetTemplateSettings,
} from "./broadsheet-template-utils";

import BroadsheetCompactHeader from "../shared/headers/broadsheets/BroadsheetCompactHeader";

// ======================================================
// SHARED TYPES / HELPERS
// ======================================================

type Props = BroadsheetTemplateBaseProps;

type TableStyleSet = {
  table: React.CSSProperties;
  th: React.CSSProperties;
  td: React.CSSProperties;
};

function kindTitle(kind: BroadsheetKind) {
  if (kind === "class") return "Class Broadsheet";
  if (kind === "annual") return "Annual Cumulative Broadsheet";
  return "Subject Broadsheet";
}

function decisionLabel(value?: string | null) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getHeaderContext(header?: ReportHeaderData | null) {
  const source = (header || {}) as any;
  return {
    academicStructureName: firstText(
      source.academicStructure?.name,
      source.academicStructureName,
    ),
    academicPeriodName: firstText(
      source.academicPeriod?.name,
      source.academicPeriodName,
    ),
  };
}

function tableStyles(compact: boolean, primary: string): TableStyleSet {
  return {
    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      tableLayout: "auto",
      fontSize: compact ? 6.1 : 6.9,
      lineHeight: 1.08,
      color: "#172033",
      border: "1px solid #dbe3ee",
      borderRadius: 6,
      overflow: "hidden",
      background: "#fff",
    },
    th: {
      border: "0",
      borderRight: "1px solid rgba(255,255,255,.22)",
      borderBottom: "1px solid #dbe3ee",
      padding: compact ? "2.5px 3px" : "3px 3.5px",
      background: primary,
      color: "#fff",
      textAlign: "center",
      verticalAlign: "middle",
      fontWeight: 900,
      whiteSpace: "nowrap",
    },
    td: {
      border: "0",
      borderRight: "1px solid #e7edf5",
      borderBottom: "1px solid #e7edf5",
      padding: compact ? "2px 3px" : "2.5px 3.5px",
      verticalAlign: "middle",
      whiteSpace: "nowrap",
      background: "#fff",
    },
  };
}

function SummaryStrip({
  items,
  compact,
}: {
  items: { label: string; value: React.ReactNode; show?: boolean }[];
  compact: boolean;
}) {
  const visible = items.filter((item) => item.show !== false);
  if (!visible.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(visible.length, 8)}, minmax(0,1fr))`,
        gap: compact ? 3 : 4,
        marginBottom: compact ? 4 : 5,
      }}
    >
      {visible.map((item) => (
        <div
          key={item.label}
          style={{
            minWidth: 0,
            padding: compact ? "2px 4px" : "2.5px 4.5px",
            border: "1px solid #dbe3ee",
            borderRadius: 5,
            background: "#f8fafc",
            boxShadow: "none",
          }}
        >
          <div
            style={{
              fontSize: compact ? 5.6 : 6.3,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 0.2,
              color: "#64748b",
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              marginTop: 1,
              fontSize: compact ? 7.2 : 8.2,
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StudentIdentityCell({
  student,
  settings,
  compact,
}: {
  student: any;
  settings: ResolvedBroadsheetTemplateSettings;
  compact: boolean;
}) {
  const photo = resolveBroadsheetStudentPhoto(student);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          settings.showBroadsheetStudentPhoto && photo
            ? `${compact ? 17 : 20}px minmax(0,1fr)`
            : "minmax(0,1fr)",
        gap: compact ? 4 : 5,
        alignItems: "center",
        minWidth: compact ? 112 : 128,
      }}
    >
      {settings.showBroadsheetStudentPhoto && photo && (
        <img
          src={photo}
          alt="Student"
          style={{
            width: compact ? 17 : 20,
            height: compact ? 17 : 20,
            objectFit: "cover",
            border: "2px solid #e2e8f0",
            borderRadius: 4,
          }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 850,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {student.studentName || "-"}
        </div>
        {student.admissionNumber && (
          <div style={{ marginTop: 1, fontSize: "0.88em", color: "#64748b" }}>
            {student.admissionNumber}
          </div>
        )}
      </div>
    </div>
  );
}

function Footer({
  settings,
  schoolName,
  pageNumber,
  totalPages,
  compact,
}: {
  settings: ResolvedBroadsheetTemplateSettings;
  schoolName: string;
  pageNumber?: number;
  totalPages?: number;
  compact: boolean;
}) {
  return (
    <footer
      style={{
        marginTop: compact ? 4 : 5,
        paddingTop: compact ? 2 : 3,
        borderTop: "1px solid #dbe3ee",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        fontSize: compact ? 5.8 : 6.6,
        color: "#333",
      }}
    >
      <span>
        {settings.broadsheetFooterText ||
          `Official academic broadsheet generated for ${schoolName}.`}
      </span>
      {settings.showBroadsheetPageNumber && (
        <span style={{ whiteSpace: "nowrap", fontWeight: 800 }}>
          Page {pageNumber || 1}
          {totalPages ? ` of ${totalPages}` : ""}
        </span>
      )}
    </footer>
  );
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function CompactBroadsheetTemplate({
  kind,
  dataset,
  header,
  template,
  settings,
  compact = false,
  pageBreakAfter = true,
  showWatermark = true,
  generatedAt,
  pageNumber,
  totalPages,
  className,
  style,
}: Props) {
  const resolvedSettings = resolveBroadsheetTemplateSettings({
    kind,
    template,
    settings,
  });
  const branding = resolveBroadsheetBranding(header);
  const headerContext = getHeaderContext(header);
  const primary = branding.primaryColor || "#111";

  const pageStyle: React.CSSProperties = {
    ...broadsheetPageStyle({
      branding,
      settings: resolvedSettings,
      compact,
      pageBreakAfter,
      tone: "classic",
    }),
    ...style,
    background: "#fff",
    color: "#172033",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    boxShadow: "0 10px 28px rgba(15,23,42,.08)",
  };

  if (!dataset) return null;

  const details = resolveModeDetails(kind, dataset as any);

  return (
    <section
      className={`print-page report-page-break broadsheet-template-page broadsheet-compact-page ${className || ""}`}
      style={pageStyle}
    >
      {branding.backgroundImage && (
        <img
          src={branding.backgroundImage}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.025,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {showWatermark &&
        resolvedSettings.showBroadsheetWatermark &&
        branding.watermark && (
          <div
            aria-hidden="true"
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
              src={branding.watermark}
              alt=""
              style={{ width: "42%", maxHeight: "58%", objectFit: "contain" }}
            />
          </div>
        )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "none",
            marginBottom: compact ? 4 : 5,
          }}
        >
          <BroadsheetCompactHeader
            kind={kind}
            branding={branding}
            settings={resolvedSettings}
            title={kindTitle(kind)}
            subtitle={details.subtitle}
            academicStructureName={
              details.academicStructureName ||
              headerContext.academicStructureName
            }
            academicPeriodName={headerContext.academicPeriodName}
            academicYear={details.academicYear}
            className={details.className}
            subjectName={details.subjectName}
            teacherName={details.teacherName}
            generatedAt={generatedAt}
            compact={compact}
          />
        </div>

        {kind === "subject" && (
          <SubjectMode
            dataset={dataset as ComputedSubjectBroadsheet}
            settings={resolvedSettings}
            compact={compact}
            primary={primary}
          />
        )}

        {kind === "class" && (
          <ClassMode
            dataset={dataset as ComputedClassBroadsheet}
            settings={resolvedSettings}
            compact={compact}
            primary={primary}
          />
        )}

        {kind === "annual" && (
          <AnnualMode
            dataset={dataset as AnnualBroadsheet}
            settings={resolvedSettings}
            compact={compact}
            primary={primary}
          />
        )}

        {resolvedSettings.showBroadsheetSignatures && (
          <div
            style={{
              marginTop: compact ? 6 : 8,
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: compact ? 18 : 28,
            }}
          >
            {["Prepared By", "Checked By", "Headteacher / Principal"].map(
              (label) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ height: compact ? 15 : 20 }} />
                  <div
                    style={{
                      borderTop: "1px solid #dbe3ee",
                      paddingTop: 3,
                      fontSize: compact ? 6.2 : 7,
                      fontWeight: 850,
                    }}
                  >
                    {label}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        <Footer
          settings={resolvedSettings}
          schoolName={branding.schoolName}
          pageNumber={pageNumber}
          totalPages={totalPages}
          compact={compact}
        />
      </div>
    </section>
  );
}

// ======================================================
// SUBJECT MODE
// ======================================================

function SubjectMode({
  dataset,
  settings,
  compact,
  primary,
}: {
  dataset: ComputedSubjectBroadsheet;
  settings: ResolvedBroadsheetTemplateSettings;
  compact: boolean;
  primary: string;
}) {
  const styles = tableStyles(compact, primary);

  return (
    <>
      {settings.showBroadsheetSummary && (
        <SummaryStrip
          compact={compact}
          items={[
            { label: "Students", value: dataset.students.length },
            {
              label: "Highest Score",
              value: `${formatNumber(dataset.highestScore, 1)}%`,
              show: settings.showBroadsheetHighestScore !== false,
            },
            {
              label: "Lowest Score",
              value: `${formatNumber(dataset.lowestScore, 1)}%`,
              show: settings.showBroadsheetLowestScore !== false,
            },
            {
              label: "Class Average",
              value: `${formatNumber(dataset.classAverage, 1)}%`,
              show: settings.showBroadsheetClassAverage !== false,
            },
          ]}
        />
      )}

      <div style={{ overflow: "hidden" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: 26 }}>#</th>
              <th style={{ ...styles.th, textAlign: "left", minWidth: 145 }}>
                {settings.studentColumnLabel || "Student"}
              </th>

              {settings.showBroadsheetAssessmentBreakdown !== false &&
                dataset.assessmentColumns.map((column) => (
                  <th key={column.assessmentStructureItemId} style={styles.th}>
                    {column.name}
                    <div style={{ marginTop: 1, fontSize: "0.86em" }}>
                      W:{formatNumber(column.weight, 0)}
                    </div>
                  </th>
                ))}

              {settings.showBroadsheetWeightedTotal !== false && (
                <th style={styles.th}>Weighted</th>
              )}
              {settings.showBroadsheetPercentage !== false && (
                <th style={styles.th}>%</th>
              )}
              {settings.showBroadsheetGrade !== false && (
                <th style={styles.th}>
                  {settings.gradeColumnLabel || "Grade"}
                </th>
              )}
              {settings.showBroadsheetGPA !== false && (
                <th style={styles.th}>GPA</th>
              )}
              {settings.showBroadsheetPosition !== false && (
                <th style={styles.th}>
                  {settings.positionColumnLabel || "Position"}
                </th>
              )}
              {settings.showBroadsheetRemark !== false && (
                <th style={{ ...styles.th, minWidth: 80 }}>
                  {settings.remarkColumnLabel || "Remark"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {dataset.students.map((student, index) => (
              <tr
                key={student.studentId}
                style={{ background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}
              >
                <td style={{ ...styles.td, textAlign: "center" }}>
                  {index + 1}
                </td>
                <td style={styles.td}>
                  <StudentIdentityCell
                    student={student}
                    settings={settings}
                    compact={compact}
                  />
                </td>

                {settings.showBroadsheetAssessmentBreakdown !== false &&
                  dataset.assessmentColumns.map((column) => {
                    const item = student.breakdown.find(
                      (entry) =>
                        entry.assessmentStructureItemId ===
                        column.assessmentStructureItemId,
                    );
                    return (
                      <td
                        key={column.assessmentStructureItemId}
                        style={{ ...styles.td, textAlign: "center" }}
                      >
                        {item
                          ? `${formatNumber(item.score, 0)}/${formatNumber(item.maxScore, 0)}`
                          : "-"}
                      </td>
                    );
                  })}

                {settings.showBroadsheetWeightedTotal !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 850,
                    }}
                  >
                    {formatNumber(student.weightedTotal, 1)}
                  </td>
                )}
                {settings.showBroadsheetPercentage !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 850,
                    }}
                  >
                    {formatPercent(student.percentage, 1)}
                  </td>
                )}
                {settings.showBroadsheetGrade !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 900,
                    }}
                  >
                    {student.grade || "-"}
                  </td>
                )}
                {settings.showBroadsheetGPA !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {student.gpa != null ? formatNumber(student.gpa, 2) : "-"}
                  </td>
                )}
                {settings.showBroadsheetPosition !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {ordinal(student.position)}
                  </td>
                )}
                {settings.showBroadsheetRemark !== false && (
                  <td
                    style={{ ...styles.td, whiteSpace: "normal", minWidth: 80 }}
                  >
                    {student.remark || "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ======================================================
// CLASS MODE
// ======================================================

function ClassMode({
  dataset,
  settings,
  compact,
  primary,
}: {
  dataset: ComputedClassBroadsheet;
  settings: ResolvedBroadsheetTemplateSettings;
  compact: boolean;
  primary: string;
}) {
  const styles = tableStyles(compact, primary);

  return (
    <>
      {settings.showBroadsheetSummary && (
        <SummaryStrip
          compact={compact}
          items={[
            { label: "Students", value: dataset.students.length },
            { label: "Subjects", value: dataset.subjectColumns.length },
            {
              label: "Highest Average",
              value: `${formatNumber(dataset.highestAverage, 1)}%`,
              show: settings.showBroadsheetClassHighestAverage !== false,
            },
            {
              label: "Lowest Average",
              value: `${formatNumber(dataset.lowestAverage, 1)}%`,
              show: settings.showBroadsheetClassLowestAverage !== false,
            },
            {
              label: "Class Average",
              value: `${formatNumber(dataset.classAverage, 1)}%`,
            },
          ]}
        />
      )}

      <div style={{ overflow: "hidden" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: 26 }}>#</th>
              <th style={{ ...styles.th, textAlign: "left", minWidth: 145 }}>
                {settings.studentColumnLabel || "Student"}
              </th>

              {settings.showBroadsheetSubjectScores !== false &&
                dataset.subjectColumns.map((subject) => (
                  <th key={subject.classSubjectId} style={styles.th}>
                    {subject.shortName ||
                      subject.subjectCode ||
                      subject.subjectName}
                    <div
                      style={{
                        marginTop: 1,
                        maxWidth: 65,
                        whiteSpace: "normal",
                        fontSize: "0.82em",
                      }}
                    >
                      {subject.subjectName}
                    </div>
                  </th>
                ))}

              {settings.showBroadsheetTotal !== false && (
                <th style={styles.th}>Total</th>
              )}
              {settings.showBroadsheetAverage !== false && (
                <th style={styles.th}>Average</th>
              )}
              {settings.showBroadsheetGPA !== false && (
                <th style={styles.th}>GPA</th>
              )}
              {settings.showBroadsheetClassPosition !== false && (
                <th style={styles.th}>
                  {settings.positionColumnLabel || "Position"}
                </th>
              )}
              {settings.showBroadsheetAttendance !== false && (
                <th style={styles.th}>Attendance</th>
              )}
            </tr>
          </thead>
          <tbody>
            {dataset.students.map((student, index) => (
              <tr
                key={student.studentId}
                style={{ background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}
              >
                <td style={{ ...styles.td, textAlign: "center" }}>
                  {index + 1}
                </td>
                <td style={styles.td}>
                  <StudentIdentityCell
                    student={student}
                    settings={settings}
                    compact={compact}
                  />
                </td>

                {settings.showBroadsheetSubjectScores !== false &&
                  dataset.subjectColumns.map((subject) => {
                    const cell = student.subjects.find(
                      (entry) =>
                        entry.classSubjectId === subject.classSubjectId,
                    );
                    return (
                      <td
                        key={subject.classSubjectId}
                        style={{ ...styles.td, textAlign: "center" }}
                      >
                        {cell ? (
                          <>
                            <strong>{formatNumber(cell.percentage, 1)}</strong>
                            {settings.showBroadsheetSubjectGrades && (
                              <div style={{ marginTop: 1, fontSize: "0.86em" }}>
                                {cell.grade || "-"}
                              </div>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}

                {settings.showBroadsheetTotal !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 850,
                    }}
                  >
                    {formatNumber(student.total, 1)}
                  </td>
                )}
                {settings.showBroadsheetAverage !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 900,
                    }}
                  >
                    {formatPercent(student.average, 1)}
                  </td>
                )}
                {settings.showBroadsheetGPA !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {student.gpa != null ? formatNumber(student.gpa, 2) : "-"}
                  </td>
                )}
                {settings.showBroadsheetClassPosition !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {ordinal(student.position)}
                  </td>
                )}
                {settings.showBroadsheetAttendance !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {formatPercent(student.attendancePercent, 1)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ======================================================
// ANNUAL MODE
// ======================================================

function AnnualMode({
  dataset,
  settings,
  compact,
  primary,
}: {
  dataset: AnnualBroadsheet;
  settings: ResolvedBroadsheetTemplateSettings;
  compact: boolean;
  primary: string;
}) {
  const styles = tableStyles(compact, primary);

  return (
    <>
      {settings.showBroadsheetSummary && (
        <SummaryStrip
          compact={compact}
          items={[
            { label: "Students", value: dataset.totalStudents },
            { label: "Subjects", value: dataset.totalSubjects },
            { label: "Periods", value: dataset.totalPeriods },
            {
              label: "Highest Average",
              value: `${formatNumber(dataset.highestAverage, 1)}%`,
            },
            {
              label: "Lowest Average",
              value: `${formatNumber(dataset.lowestAverage, 1)}%`,
            },
            {
              label: "Class Average",
              value: `${formatNumber(dataset.classAverage, 1)}%`,
            },
            {
              label: "Promote",
              value: dataset.promotionCount,
              show: settings.showBroadsheetPromotionDecision !== false,
            },
            {
              label: "Repeat",
              value: dataset.repeatCount,
              show: settings.showBroadsheetPromotionDecision !== false,
            },
          ]}
        />
      )}

      {settings.showBroadsheetStatistics && dataset.periodNames.length > 0 && (
        <div
          style={{
            marginBottom: compact ? 5 : 7,
            fontSize: compact ? 6.2 : 7,
            fontWeight: 800,
          }}
        >
          Periods: {dataset.periodNames.join("  •  ")}
        </div>
      )}

      <div style={{ overflow: "hidden" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: 26 }}>#</th>
              <th style={{ ...styles.th, textAlign: "left", minWidth: 145 }}>
                {settings.studentColumnLabel || "Student"}
              </th>

              {dataset.subjectColumns.map((subject) => (
                <th
                  key={`${subject.subjectId || subject.subjectName}`}
                  style={styles.th}
                >
                  {subject.shortName ||
                    subject.subjectCode ||
                    subject.subjectName}
                  <div
                    style={{
                      marginTop: 1,
                      maxWidth: 62,
                      whiteSpace: "normal",
                      fontSize: "0.82em",
                    }}
                  >
                    {subject.subjectName}
                  </div>
                </th>
              ))}

              {settings.showBroadsheetAnnualAverage !== false && (
                <th style={styles.th}>Annual Avg.</th>
              )}
              {settings.showBroadsheetAnnualGPA !== false && (
                <th style={styles.th}>GPA</th>
              )}
              {settings.showBroadsheetAnnualPosition !== false && (
                <th style={styles.th}>
                  {settings.positionColumnLabel || "Position"}
                </th>
              )}
              {settings.showBroadsheetPromotionDecision !== false && (
                <th style={styles.th}>Decision</th>
              )}
            </tr>
          </thead>
          <tbody>
            {dataset.students.map((student, index) => (
              <tr
                key={student.studentId}
                style={{ background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}
              >
                <td style={{ ...styles.td, textAlign: "center" }}>
                  {index + 1}
                </td>
                <td style={styles.td}>
                  <AnnualStudentIdentityCell
                    student={student}
                    settings={settings}
                    compact={compact}
                  />
                </td>

                {dataset.subjectColumns.map((subject) => {
                  const cell = student.subjects.find(
                    (entry) =>
                      (subject.subjectId &&
                        entry.subjectId === subject.subjectId) ||
                      entry.subjectName === subject.subjectName,
                  );
                  return (
                    <td
                      key={`${subject.subjectId || subject.subjectName}`}
                      style={{ ...styles.td, textAlign: "center" }}
                    >
                      {cell ? (
                        <>
                          <strong>{formatNumber(cell.average, 1)}</strong>
                          {settings.showBroadsheetPeriodScores &&
                            cell.periodScores.length > 0 && (
                              <div
                                style={{
                                  marginTop: 1,
                                  fontSize: "0.75em",
                                  whiteSpace: "normal",
                                  lineHeight: 1.15,
                                }}
                              >
                                {cell.periodScores
                                  .map(
                                    (period) =>
                                      `${period.academicPeriodName}: ${formatNumber(period.percentage, 0)}`,
                                  )
                                  .join(" · ")}
                              </div>
                            )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}

                {settings.showBroadsheetAnnualAverage !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 900,
                    }}
                  >
                    {formatPercent(student.average, 1)}
                  </td>
                )}
                {settings.showBroadsheetAnnualGPA !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {student.gpa != null ? formatNumber(student.gpa, 2) : "-"}
                  </td>
                )}
                {settings.showBroadsheetAnnualPosition !== false && (
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {ordinal(student.position)}
                  </td>
                )}
                {settings.showBroadsheetPromotionDecision !== false && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      fontWeight: 850,
                    }}
                  >
                    {decisionLabel(
                      student.finalDecision || student.recommendation,
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AnnualStudentIdentityCell({
  student,
  settings,
  compact,
}: {
  student: AnnualBroadsheetStudentRow;
  settings: ResolvedBroadsheetTemplateSettings;
  compact: boolean;
}) {
  return (
    <div style={{ minWidth: compact ? 132 : 155 }}>
      <div
        style={{
          fontWeight: 850,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {student.studentName || "-"}
      </div>
      {student.admissionNumber && (
        <div style={{ marginTop: 1, fontSize: "0.88em", color: "#64748b" }}>
          {student.admissionNumber}
        </div>
      )}
    </div>
  );
}

function resolveModeDetails(kind: BroadsheetKind, dataset: any) {
  if (kind === "subject") {
    return {
      subtitle: `${dataset.className || "Class"} • ${dataset.students?.length || 0} Students`,
      className: dataset.className,
      subjectName: dataset.subjectName,
      teacherName: dataset.teacherName,
      academicStructureName: "",
      academicYear: "",
    };
  }

  if (kind === "class") {
    return {
      subtitle: `${dataset.className || "Class"} • ${dataset.students?.length || 0} Students • ${dataset.subjectColumns?.length || 0} Subjects`,
      className: dataset.className,
      subjectName: "",
      teacherName: "",
      academicStructureName: "",
      academicYear: "",
    };
  }

  return {
    subtitle: `${dataset.className || "Class"} • ${dataset.academicYear || "Academic Year"} • ${dataset.totalStudents || 0} Students`,
    className: dataset.className,
    subjectName: "",
    teacherName: "",
    academicStructureName: dataset.academicStructureName,
    academicYear: dataset.academicYear,
  };
}
