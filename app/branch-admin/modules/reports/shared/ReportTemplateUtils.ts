/**
 * reports/shared/ReportTemplateUtils.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — STUDENT REPORT TEMPLATE UTILITIES
 * ---------------------------------------------------------
 *
 * Shared helper layer for all student report card templates.
 *
 * Core rule:
 * - Templates should not recompute academic results.
 * - Templates should only format, normalize and decide visual visibility.
 * - Any hidden setting should remove the field completely from the rendered layout.
 *
 * Matched to current template files:
 * - BorderedTraditionalTemplate.tsx
 * - CambridgeTemplate.tsx
 * - ClassicFormalTemplate.tsx
 * - CompactPrintTemplate.tsx
 * - IBTemplate.tsx
 * - KindergartenTemplate.tsx
 * - LetterheadPremiumTemplate.tsx
 * - ModernCleanTemplate.tsx
 * - MontessoriTemplate.tsx
 * - SideProfileTemplate.tsx
 * - UniversityTranscriptTemplate.tsx
 */

import type React from "react";

import type {
  ReportHeaderData,
  StudentReportCardDataset,
  ComputedStudentReport,
  StudentSubjectResult,
} from "../engine/report-types";

import type {
  NormalizedStudentReportTemplateData,
  ReportTemplateBrandingData,
  ReportTemplateNextPeriodInfo,
  ReportTemplateSignatureInfo,
  ReportTemplateStudentInfo,
  ReportTemplateSummaryInfo,
  StudentReportTemplateCode,
  StudentReportTemplateDensity,
  StudentReportTemplateLayoutKey,
  StudentReportTemplatePaperSize,
  StudentReportTemplateSettings,
  ReportCardTemplateAssignmentLike,
  ReportCardTemplateLike,
  ReportCardTemplateSettingsLike,
} from "./ReportTemplateTypes";

import {
  DEFAULT_STUDENT_REPORT_TEMPLATE_CODE,
  DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
  getStudentReportTemplateDefinitionByCode,
  mergeStudentReportTemplateSettings,
  normalizeStudentReportTemplateDefinition,
  normalizeTemplateKey,
} from "./ReportTemplateTypes";

// ======================================================
// TEMPLATE GROUPS
// ======================================================

export const STUDENT_REPORT_TEMPLATE_CODES = [
  "classic_formal",
  "modern_clean",
  "compact_print",
  "bordered_traditional",
  "letterhead_premium",
  "side_profile",
  "cambridge",
  "ib",
  "kindergarten",
  "montessori",
  "university_transcript",
] as const;

export type KnownStudentReportTemplateCode =
  (typeof STUDENT_REPORT_TEMPLATE_CODES)[number];

export const INTERNATIONAL_TEMPLATE_CODES = [
  "cambridge",
  "ib",
] as const;

export const EARLY_YEARS_TEMPLATE_CODES = [
  "kindergarten",
  "montessori",
] as const;

export const TRANSCRIPT_TEMPLATE_CODES = [
  "university_transcript",
] as const;

// ======================================================
// BASIC FORMATTERS
// ======================================================

export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatNumber(value?: number | null, decimals = 1, fallback = "-") {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return Number(value).toFixed(decimals);
}

export function formatPercent(value?: number | null, decimals = 1, fallback = "-") {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return `${Number(value).toFixed(decimals)}%`;
}

export function ordinal(value?: number | null) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "-";

  const suffixes = ["th", "st", "nd", "rd"];
  const mod100 = numberValue % 100;

  return `${numberValue}${
    suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]
  }`;
}

export function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function toISODate(value?: string | number | Date | null): string {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) return "";

  return new Date(time).toISOString().slice(0, 10);
}

export function friendlyReportDate(value?: string | number | Date | null): string {
  const iso = toISODate(value);
  if (!iso) return "";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(`${iso}T00:00:00`));
  } catch {
    return iso;
  }
}

// ======================================================
// TEMPLATE RESOLUTION HELPERS
// ======================================================

export function getTemplateCode(
  value?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | Partial<StudentReportTemplateSettings>
    | ReportCardTemplateLike
    | null
): StudentReportTemplateCode {
  if (!value) return DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;

  if (typeof value === "string") {
    return normalizeTemplateKey(value) || DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;
  }

  return (
    normalizeTemplateKey(
      (value as any).templateCode ||
        (value as any).code ||
        (value as any).layoutKey ||
        DEFAULT_STUDENT_REPORT_TEMPLATE_CODE
    ) || DEFAULT_STUDENT_REPORT_TEMPLATE_CODE
  );
}

export function getTemplateLayoutKey(
  value?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | Partial<StudentReportTemplateSettings>
    | ReportCardTemplateLike
    | null
): StudentReportTemplateLayoutKey {
  if (!value) return DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;

  if (typeof value === "string") {
    const definition = getStudentReportTemplateDefinitionByCode(value);
    return definition.layoutKey;
  }

  const raw =
    (value as any).layoutKey ||
    (value as any).templateCode ||
    (value as any).code ||
    DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;

  return getStudentReportTemplateDefinitionByCode(raw).layoutKey;
}

export function getTemplateDefinition(
  value?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | Partial<StudentReportTemplateSettings>
    | ReportCardTemplateLike
    | null
) {
  return getStudentReportTemplateDefinitionByCode(getTemplateCode(value));
}

export function isTemplateCode(
  value: unknown,
  code: KnownStudentReportTemplateCode
) {
  return normalizeTemplateKey(String(value || "")) === code;
}

export function isClassicFormalTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "classic_formal");
}

export function isModernCleanTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "modern_clean");
}

export function isCompactPrintTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "compact_print");
}

export function isBorderedTraditionalTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "bordered_traditional");
}

export function isLetterheadPremiumTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "letterhead_premium");
}

export function isSideProfileTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "side_profile");
}

export function isCambridgeTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "cambridge");
}

export function isIBTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "ib");
}

export function isKindergartenTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "kindergarten");
}

export function isMontessoriTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "montessori");
}

export function isUniversityTranscriptTemplate(value?: unknown) {
  return isTemplateCode(getTemplateCode(value as any), "university_transcript");
}

export function isInternationalTemplate(value?: unknown) {
  const code = getTemplateCode(value as any);
  return INTERNATIONAL_TEMPLATE_CODES.includes(code as any);
}

export function isEarlyYearsTemplate(value?: unknown) {
  const code = getTemplateCode(value as any);
  return EARLY_YEARS_TEMPLATE_CODES.includes(code as any);
}

export function isTranscriptTemplate(value?: unknown) {
  const code = getTemplateCode(value as any);
  return TRANSCRIPT_TEMPLATE_CODES.includes(code as any);
}

export function getHeaderVariant(
  value?:
    | StudentReportTemplateCode
    | StudentReportTemplateLayoutKey
    | Partial<StudentReportTemplateSettings>
    | ReportCardTemplateLike
    | null
) {
  return getTemplateLayoutKey(value);
}

export function shouldUseLargeStudentPhoto(value?: unknown) {
  return (
    isSideProfileTemplate(value) ||
    isKindergartenTemplate(value) ||
    isMontessoriTemplate(value)
  );
}

export function shouldUseTwoColumnLayout(value?: unknown) {
  return (
    isSideProfileTemplate(value) ||
    isLetterheadPremiumTemplate(value) ||
    isCambridgeTemplate(value) ||
    isIBTemplate(value)
  );
}

export function shouldUseTranscriptHeader(value?: unknown) {
  return isUniversityTranscriptTemplate(value);
}

export function shouldUseInstitutionalLetterhead(value?: unknown) {
  return (
    isLetterheadPremiumTemplate(value) ||
    isUniversityTranscriptTemplate(value) ||
    isCambridgeTemplate(value) ||
    isIBTemplate(value)
  );
}

export function shouldUseNarrativeRemarks(value?: unknown) {
  return isKindergartenTemplate(value) || isMontessoriTemplate(value);
}

// ======================================================
// COLORS / PRINT HELPERS
// ======================================================

export function getContrastTextColor(hex?: string | null) {
  let col = String(hex || "#ffffff").replace("#", "").trim();

  if (col.startsWith("rgb")) return "#fff";

  if (col.length === 3) {
    col = col
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(col, 16);
  if (!Number.isFinite(num)) return "#fff";

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#111" : "#fff";
}

export function resolvePrimaryColor(
  header?: ReportHeaderData,
  fallback = "var(--primary-color)"
) {
  const dynamicHeader = header as any;
  return (
    dynamicHeader?.primaryColor ||
    dynamicHeader?.branding?.primaryColor ||
    dynamicHeader?.schoolBranchSetting?.primaryColor ||
    fallback
  );
}

export function reportPageSize(
  size?: StudentReportTemplatePaperSize,
  orientation: "portrait" | "landscape" = "portrait"
) {
  const paper = size || "A4";

  if (paper === "Letter") {
    return orientation === "landscape"
      ? { width: "279.4mm", minHeight: "215.9mm" }
      : { width: "215.9mm", minHeight: "279.4mm" };
  }

  return orientation === "landscape"
    ? { width: "297mm", minHeight: "210mm" }
    : { width: "210mm", minHeight: "297mm" };
}

export function densitySpacing(density?: StudentReportTemplateDensity) {
  switch (density) {
    case "spacious":
      return {
        pagePadding: "13mm",
        gap: 10,
        cellPadding: 6,
        fontSize: 11,
        smallFontSize: 9.5,
      };
    case "comfortable":
      return {
        pagePadding: "11mm",
        gap: 8,
        cellPadding: 5,
        fontSize: 10.5,
        smallFontSize: 9,
      };
    case "compact":
    default:
      return {
        pagePadding: "9mm",
        gap: 6,
        cellPadding: 4,
        fontSize: 9.5,
        smallFontSize: 8.5,
      };
  }
}

// ======================================================
// SETTINGS HELPERS
// ======================================================

export function normalizeReportTemplateSettings(args?: {
  template?: ReportCardTemplateLike | null;
  settings?: ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;
  assignment?: ReportCardTemplateAssignmentLike | null;
  fallback?: Partial<StudentReportTemplateSettings> | null;
}): StudentReportTemplateSettings {
  return mergeStudentReportTemplateSettings(
    {
      ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
      ...(args?.fallback || {}),
      ...(args?.settings || {}),
    },
    args?.template || null,
    args?.assignment || null
  );
}

export function resolveTemplateSettings(args?: {
  template?: ReportCardTemplateLike | null;
  settings?: ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;
  assignment?: ReportCardTemplateAssignmentLike | null;
  fallback?: Partial<StudentReportTemplateSettings> | null;
}): StudentReportTemplateSettings {
  return normalizeReportTemplateSettings(args);
}

export function shouldShow(
  settings: Partial<StudentReportTemplateSettings> | undefined,
  key: keyof StudentReportTemplateSettings
): boolean {
  const merged = {
    ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
    ...(settings || {}),
  } as any;

  return merged[key] !== false;
}

export function visibleCount(settings: StudentReportTemplateSettings) {
  return [
    settings.showSubjectPosition,
    settings.showClassPosition,
    settings.showNumberOnRoll,
    settings.showAttendance,
    settings.showAttendancePercent,
    settings.showStudentPhoto,
    settings.showTeacherNames,
    settings.showNextAcademicPeriod,
    settings.showPromotionStatus,
    settings.showGPA,
    settings.showAverage,
    settings.showTotal,
    settings.showGrade,
    settings.showSubjectRemarks,
    settings.showWatermark,
    settings.showParentSignature,
  ].filter(Boolean).length;
}

// ======================================================
// DATA NORMALIZATION
// ======================================================

export function resolveBranding(header?: ReportHeaderData): ReportTemplateBrandingData {
  const dynamicHeader = header as any;
  const branding = dynamicHeader?.branding || {};

  return {
    schoolName:
      branding.schoolName ||
      dynamicHeader?.school?.name ||
      dynamicHeader?.branch?.name ||
      "School Name",
    motto:
      branding.motto ||
      dynamicHeader?.school?.motto ||
      "",
    logo:
      branding.resolvedLogoUrl ||
      branding.logo ||
      dynamicHeader?.schoolBranchSetting?.logo ||
      dynamicHeader?.branch?.logo ||
      dynamicHeader?.school?.logo ||
      "",
    address:
      branding.address ||
      dynamicHeader?.branch?.address ||
      dynamicHeader?.school?.address ||
      "",
    phone:
      branding.phone ||
      dynamicHeader?.branch?.phone ||
      dynamicHeader?.school?.phone ||
      "",
    email:
      branding.email ||
      dynamicHeader?.branch?.email ||
      dynamicHeader?.school?.email ||
      "",
    website:
      branding.website ||
      dynamicHeader?.school?.website ||
      "",
    branchName:
      branding.branchName ||
      dynamicHeader?.branch?.name ||
      dynamicHeader?.branchName ||
      "",
    branchAddress:
      branding.branchAddress ||
      dynamicHeader?.branchAddress ||
      dynamicHeader?.branch?.address ||
      "",
    primaryColor:
      branding.primaryColor ||
      dynamicHeader?.primaryColor ||
      "var(--primary-color)",
    fontFamily:
      branding.fontFamily ||
      dynamicHeader?.schoolBranchSetting?.fontFamily ||
      "Arial, sans-serif",
    reportCardBackgroundImage:
      branding.resolvedReportCardBackgroundImageUrl ||
      branding.reportCardBackgroundImage ||
      dynamicHeader?.schoolBranchSetting?.reportCardBackgroundImage ||
      "",
    reportCardWatermark:
      branding.resolvedReportCardWatermarkUrl ||
      branding.reportCardWatermark ||
      dynamicHeader?.schoolBranchSetting?.reportCardWatermark ||
      "",
    reportCardSignatureImage:
      branding.resolvedReportCardSignatureImageUrl ||
      branding.reportCardSignatureImage ||
      dynamicHeader?.schoolBranchSetting?.reportCardSignatureImage ||
      "",
  };
}

export function resolveReportBranding(
  dataset?: StudentReportCardDataset
): ReportTemplateBrandingData {
  return resolveBranding(dataset?.header);
}

export function resolveStudentInfo(
  dataset?: StudentReportCardDataset
): ReportTemplateStudentInfo {
  const report = dataset?.report as any;
  const student = dataset?.student as any;
  const dynamicData = dataset as any;

  return {
    studentId: safeNumber(report?.studentId || student?.id),
    studentName: firstText(report?.studentName, student?.fullName, "Student Name"),
    admissionNumber: firstText(report?.admissionNumber, student?.admissionNumber),
    gender: firstText(report?.gender, student?.gender),
    studentPhoto: firstText(
      report?.resolvedStudentPhotoUrl,
      report?.studentPhoto,
      student?.resolvedStudentPhotoUrl,
      student?.photo
    ),
    className: firstText(report?.className, dynamicData?.className, "Class"),
    numberOnRoll: safeNumber(
      report?.numberOnRoll ||
        report?.classSize ||
        dynamicData?.numberOnRoll ||
        dynamicData?.classSize,
      0
    ) || undefined,
    overallPosition: safeNumber(report?.overallPosition, 0) || undefined,
    promoted: typeof report?.promoted === "boolean" ? report.promoted : undefined,
  };
}

export function resolveSummary(
  report?: ComputedStudentReport | any
): ReportTemplateSummaryInfo {
  return {
    total: report?.total,
    average: report?.average,
    overallGPA: report?.overallGPA,
    overallPosition: report?.overallPosition,
    numberOnRoll: report?.numberOnRoll || report?.classSize,
  };
}

export function resolveNextAcademicPeriod(
  dataset?: StudentReportCardDataset
): ReportTemplateNextPeriodInfo | undefined {
  const dynamicData = dataset as any;
  const dynamicReport = dataset?.report as any;
  const dynamicHeader = dataset?.header as any;

  const next =
    dynamicData?.nextAcademicPeriod ||
    dynamicReport?.nextAcademicPeriod ||
    dynamicHeader?.nextAcademicPeriod;

  if (!next) return undefined;

  const startDate = toISODate(next.startDate);
  const formattedStartDate = next.formattedStartDate || friendlyReportDate(startDate);

  return {
    id: safeNumber(next.id, 0) || undefined,
    academicStructureId: safeNumber(next.academicStructureId, 0) || undefined,
    name: next.name,
    type: next.type,
    startDate,
    endDate: toISODate(next.endDate),
    order: safeNumber(next.order, 0) || undefined,
    formattedStartDate,
    label:
      next.label ||
      (formattedStartDate ? `Next Academic Period Begins: ${formattedStartDate}` : ""),
  };
}

export function formatNextAcademicPeriod(
  datasetOrNext?: StudentReportCardDataset | ReportTemplateNextPeriodInfo,
  settings?: Partial<StudentReportTemplateSettings>
) {
  const next =
    (datasetOrNext as StudentReportCardDataset)?.report ||
    (datasetOrNext as StudentReportCardDataset)?.header
      ? resolveNextAcademicPeriod(datasetOrNext as StudentReportCardDataset)
      : (datasetOrNext as ReportTemplateNextPeriodInfo | undefined);

  const resolvedSettings = {
    ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
    ...(settings || {}),
  } as StudentReportTemplateSettings;

  return nextAcademicPeriodText(next, resolvedSettings);
}

export function resolveSignatures(
  dataset?: StudentReportCardDataset
): ReportTemplateSignatureInfo {
  const dynamicData = dataset as any;
  const dynamicReport = dataset?.report as any;
  const dynamicHeader = dataset?.header as any;
  const branding = resolveBranding(dataset?.header);

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
    dynamicData?.student?.parentName,
    dynamicData?.student?.guardianName
  );

  return {
    classTeacherName,
    headTeacherName,
    principalName: firstText(dynamicReport?.principalName, dynamicData?.principalName),
    parentName,
    guardianName: parentName,
    officialSignatureImage: branding.reportCardSignatureImage,
  };
}

export function normalizeStudentReportTemplateData(args: {
  dataset?: StudentReportCardDataset;
  template?: ReportCardTemplateLike | null;
  settings?: ReportCardTemplateSettingsLike | Partial<StudentReportTemplateSettings> | null;
  assignment?: ReportCardTemplateAssignmentLike | null;
}): NormalizedStudentReportTemplateData | undefined {
  const { dataset } = args;

  if (!dataset?.header || !dataset?.report) {
    return undefined;
  }

  const templateDefinition = normalizeStudentReportTemplateDefinition(args.template || null);
  const settings = resolveTemplateSettings({
    template: args.template || templateDefinition,
    settings: args.settings || null,
    assignment: args.assignment || null,
  });

  const report = dataset.report as ComputedStudentReport;
  const subjectResults = (report.subjectResults || []) as StudentSubjectResult[];

  return {
    header: dataset.header,
    report,
    student: dataset.student,

    branding: resolveBranding(dataset.header),
    studentInfo: resolveStudentInfo(dataset),
    subjectResults,
    attendance: report.attendance,
    summary: resolveSummary(report),
    nextAcademicPeriod: resolveNextAcademicPeriod(dataset),
    signatures: resolveSignatures(dataset),
    settings,
  };
}

// ======================================================
// SUBJECT TABLE HELPERS
// ======================================================

export function getVisibleSubjectResultCells(
  subject: StudentSubjectResult,
  settings: StudentReportTemplateSettings
) {
  const cells: { key: string; label: string; value: string | number | undefined }[] = [
    {
      key: "weightedTotal",
      label: "Weighted",
      value: formatNumber(subject.weightedTotal, 1),
    },
    {
      key: "percentage",
      label: "%",
      value: formatPercent(subject.percentage, 1),
    },
  ];

  if (settings.showGrade) {
    cells.push({
      key: "grade",
      label: "Grade",
      value: subject.grade,
    });
  }

  if (settings.showSubjectPosition) {
    cells.push({
      key: "subjectPosition",
      label: settings.subjectPositionLabel || "Position",
      value: subject.subjectPosition ? ordinal(subject.subjectPosition) : "-",
    });
  }

  if (settings.showSubjectRemarks) {
    cells.push({
      key: "remark",
      label: "Remark",
      value: subject.remark,
    });
  }

  return cells;
}

export function subjectTeacherLine(
  subject: StudentSubjectResult,
  settings: StudentReportTemplateSettings
) {
  if (!settings.showTeacherNames) return "";
  return subject.teacherName || "";
}

// ======================================================
// NEXT PERIOD DISPLAY
// ======================================================

export function nextAcademicPeriodText(
  nextAcademicPeriod: ReportTemplateNextPeriodInfo | undefined,
  settings: StudentReportTemplateSettings
) {
  if (!settings.showNextAcademicPeriod || !nextAcademicPeriod) return "";

  const label = settings.nextAcademicPeriodLabel || "Next Academic Period Begins";
  const date =
    nextAcademicPeriod.formattedStartDate ||
    friendlyReportDate(nextAcademicPeriod.startDate);

  if (!date) return "";

  return `${label}: ${date}`;
}

// ======================================================
// STYLE OBJECT FACTORIES
// ======================================================

export function createReportPageStyle(args: {
  settings: StudentReportTemplateSettings;
  primaryColor?: string;
  fontFamily?: string;
  compact?: boolean;
  pageBreakAfter?: boolean;
}): React.CSSProperties {
  const spacing = densitySpacing(args.compact ? "compact" : args.settings.density);
  const size = reportPageSize(args.settings.paperSize, args.settings.orientation);

  return {
    ...size,
    margin: "0 auto 20px",
    padding: spacing.pagePadding,
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: args.fontFamily || "Arial, sans-serif",
    border: "1px solid #e5e5e5",
    position: "relative",
    overflow: "hidden",
    pageBreakAfter: args.pageBreakAfter === false ? "auto" : "always",
  };
}

export function createReportTableStyles(args: {
  settings: StudentReportTemplateSettings;
  primaryColor?: string;
  compact?: boolean;
}) {
  const spacing = densitySpacing(args.compact ? "compact" : args.settings.density);
  const primary = args.primaryColor || "var(--primary-color)";
  const contrast = getContrastTextColor(primary);

  return {
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: spacing.fontSize,
    } as React.CSSProperties,
    th: {
      border: "1px solid #222",
      padding: spacing.cellPadding,
      background: primary,
      color: contrast,
      textAlign: "center",
      fontWeight: 800,
      lineHeight: 1.2,
    } as React.CSSProperties,
    td: {
      border: "1px solid #222",
      padding: spacing.cellPadding,
      verticalAlign: "middle",
      lineHeight: 1.25,
    } as React.CSSProperties,
    label: {
      fontSize: spacing.smallFontSize,
      opacity: 0.72,
      textTransform: "uppercase",
      letterSpacing: 0.3,
      fontWeight: 700,
    } as React.CSSProperties,
    value: {
      marginTop: 2,
      fontSize: spacing.fontSize + 1,
      fontWeight: 800,
    } as React.CSSProperties,
  };
}

// ======================================================
// FALLBACK / EMPTY STATE
// ======================================================

export function reportTemplateEmptyMessage(dataset?: StudentReportCardDataset) {
  if (!dataset) return "Select a student, class and academic period to generate a report card.";
  if (!dataset.header) return "Report header data is missing.";
  if (!dataset.report) return "Student report data is missing.";
  return "Report data is not ready.";
}
