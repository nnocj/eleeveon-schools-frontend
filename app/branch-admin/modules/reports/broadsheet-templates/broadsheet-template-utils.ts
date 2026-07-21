/**
 * reports/broadsheet-templates/broadsheet-template-utils.ts
 * ---------------------------------------------------------
 * Shared, calculation-free helpers for broadsheet templates and the router.
 */

import type { CSSProperties } from "react";

import type {
  AnnualBroadsheet,
  AnnualBroadsheetStudentRow,
} from "../engine/cumulative-report-types";

import type {
  ClassBroadsheetStudentRow,
  ComputedClassBroadsheet,
  ComputedSubjectBroadsheet,
  ReportHeaderData,
  SubjectBroadsheetStudentRow,
} from "../engine/report-types";

import {
  DEFAULT_BROADSHEET_SETTINGS,
  DEFAULT_BROADSHEET_TEMPLATE_CODE,
} from "./broadsheet-template-types";

import type {
  BroadsheetDataset,
  BroadsheetKind,
  BroadsheetReportType,
  BroadsheetSummaryMetric,
  BroadsheetTemplateCode,
  BroadsheetTemplateDefinition,
  BroadsheetTemplateRecord,
  BroadsheetTemplateSettings,
  BroadsheetTemplateTone,
  ResolvedBroadsheetBranding,
  ResolvedBroadsheetTemplateSettings,
} from "./broadsheet-template-types";

// ======================================================
// TEXT / NUMBER HELPERS
// ======================================================

export function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatNumber(
  value: unknown,
  decimals = 1,
  fallback = "-",
): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(decimals) : fallback;
}

export function formatPercent(
  value: unknown,
  decimals = 1,
  fallback = "-",
): string {
  const formatted = formatNumber(value, decimals, fallback);
  return formatted === fallback ? fallback : `${formatted}%`;
}

export function ordinal(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return "-";
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function friendlyDate(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function normalizeBroadsheetKey(value?: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// ======================================================
// KIND / REPORT TYPE
// ======================================================

export function reportTypeForBroadsheetKind(
  kind: BroadsheetKind,
): BroadsheetReportType {
  if (kind === "class") return "class_broadsheet";
  if (kind === "annual") return "annual_broadsheet";
  return "subject_broadsheet";
}

export function broadsheetKindForReportType(
  reportType?: string | null,
): BroadsheetKind {
  const key = normalizeBroadsheetKey(reportType);
  if (key === "class_broadsheet") return "class";
  if (key === "annual_broadsheet") return "annual";
  return "subject";
}

export function broadsheetTitleForKind(kind: BroadsheetKind): string {
  if (kind === "class") return "Class Broadsheet";
  if (kind === "annual") return "Annual Broadsheet";
  return "Subject Broadsheet";
}

// ======================================================
// DATASET GUARDS
// ======================================================

export function isSubjectBroadsheetDataset(
  dataset?: BroadsheetDataset | null,
): dataset is ComputedSubjectBroadsheet {
  return (
    !!dataset && "assessmentColumns" in dataset && "subjectName" in dataset
  );
}

export function isClassBroadsheetDataset(
  dataset?: BroadsheetDataset | null,
): dataset is ComputedClassBroadsheet {
  return (
    !!dataset &&
    "subjectColumns" in dataset &&
    "students" in dataset &&
    !("periodNames" in dataset)
  );
}

export function isAnnualBroadsheetDataset(
  dataset?: BroadsheetDataset | null,
): dataset is AnnualBroadsheet {
  return !!dataset && "periodNames" in dataset && "promotionCount" in dataset;
}

export function datasetMatchesBroadsheetKind(
  kind: BroadsheetKind,
  dataset?: BroadsheetDataset | null,
): boolean {
  if (kind === "subject") return isSubjectBroadsheetDataset(dataset);
  if (kind === "class") return isClassBroadsheetDataset(dataset);
  return isAnnualBroadsheetDataset(dataset);
}

export function broadsheetDatasetIsEmpty(
  dataset?: BroadsheetDataset | null,
): boolean {
  return (
    !dataset ||
    !Array.isArray((dataset as any).students) ||
    !(dataset as any).students.length
  );
}

// ======================================================
// TEMPLATE / SETTINGS RESOLUTION
// ======================================================

export function templateCodeOf(
  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null,
  settings?: BroadsheetTemplateSettings | null,
): BroadsheetTemplateCode {
  return (
    firstText(
      (template as any)?.code,
      (template as any)?.templateCode,
      template?.layoutKey,
      (template as any)?.templateKey,
      settings?.templateCode,
      settings?.layoutKey,
      settings?.templateKey,
      DEFAULT_BROADSHEET_TEMPLATE_CODE,
    ) || DEFAULT_BROADSHEET_TEMPLATE_CODE
  );
}

export function broadsheetTemplateTone(
  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null,
  settings?: BroadsheetTemplateSettings | null,
): BroadsheetTemplateTone {
  const code = normalizeBroadsheetKey(templateCodeOf(template, settings));
  if (code.includes("modern")) return "modern";
  if (code.includes("compact")) return "compact";
  if (code.includes("executive")) return "executive";
  if (code.includes("minimal")) return "minimal";
  if (code.includes("cambridge")) return "cambridge";
  if (code.includes("university")) return "university";
  if (code.includes("analytics")) return "analytics";
  return "classic";
}

export function resolveBroadsheetTemplateSettings(args: {
  kind: BroadsheetKind;
  settings?: BroadsheetTemplateSettings | null;
  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null;
}): ResolvedBroadsheetTemplateSettings {
  const { kind, settings, template } = args;
  const templateCode = templateCodeOf(template, settings);
  const definition = template as BroadsheetTemplateDefinition | undefined;

  return {
    ...DEFAULT_BROADSHEET_SETTINGS,
    ...(settings || {}),
    reportType: reportTypeForBroadsheetKind(kind),
    templateCode,
    layoutKey:
      firstText(settings?.layoutKey, template?.layoutKey, templateCode) ||
      templateCode,
    templateName:
      firstText(
        settings?.templateName,
        (template as any)?.name,
        definition?.name,
        "Classic Broadsheet",
      ) || "Classic Broadsheet",
    paperSize:
      firstText(settings?.paperSize, (template as any)?.paperSize, "A4") ||
      "A4",
    orientation: (firstText(
      settings?.orientation,
      (template as any)?.orientation,
      "landscape",
    ) || "landscape") as "portrait" | "landscape",
    density:
      firstText(settings?.density, (template as any)?.density, "compact") ||
      "compact",
    broadsheetTitleLabel:
      firstText(settings?.broadsheetTitleLabel, broadsheetTitleForKind(kind)) ||
      broadsheetTitleForKind(kind),
    broadsheetGeneratedDateLabel:
      firstText(settings?.broadsheetGeneratedDateLabel, "Generated") ||
      "Generated",
    broadsheetFooterText:
      firstText(
        settings?.broadsheetFooterText,
        settings?.footerText,
        DEFAULT_BROADSHEET_SETTINGS.broadsheetFooterText,
      ) || DEFAULT_BROADSHEET_SETTINGS.broadsheetFooterText,
    studentColumnLabel:
      firstText(settings?.studentColumnLabel, "Student") || "Student",
    admissionNumberColumnLabel:
      firstText(settings?.admissionNumberColumnLabel, "Admission No.") ||
      "Admission No.",
    positionColumnLabel:
      firstText(settings?.positionColumnLabel, "Position") || "Position",
    gradeColumnLabel: firstText(settings?.gradeColumnLabel, "Grade") || "Grade",
    remarkColumnLabel:
      firstText(settings?.remarkColumnLabel, "Remark") || "Remark",
  } as ResolvedBroadsheetTemplateSettings;
}

// ======================================================
// BRANDING / MEDIA
// ======================================================

export function resolveBroadsheetBranding(
  header?: ReportHeaderData | null,
): ResolvedBroadsheetBranding {
  const value = (header || {}) as any;
  const branding = value.branding || {};
  const settings = value.schoolBranchSetting || {};
  const school = value.school || {};
  const branch = value.branch || {};

  const logo = firstText(
    value.resolvedLogoUrl,
    branding.resolvedLogoUrl,
    branding.logo,
    settings.logo,
    branch.logo,
    school.logo,
  );

  return {
    schoolName: firstText(branding.schoolName, school.name, "School Name"),
    branchName: firstText(
      branding.branchName,
      value.branchName,
      value.branchLabel,
      value.campusName,
      branch.name,
    ),
    branchAddress: firstText(
      branding.branchAddress,
      value.branchAddress,
      branch.address,
    ),
    motto: firstText(branding.motto, school.motto),
    address: firstText(branding.address, school.address),
    phone: firstText(branding.phone, branch.phone, school.phone),
    email: firstText(branding.email, branch.email, school.email),
    website: firstText(branding.website, branch.website, school.website),
    logo,
    watermark: firstText(
      value.resolvedReportCardWatermarkUrl,
      branding.resolvedReportCardWatermarkUrl,
      branding.reportCardWatermark,
      settings.reportCardWatermark,
      logo,
    ),
    backgroundImage: firstText(
      value.resolvedReportCardBackgroundImageUrl,
      branding.resolvedReportCardBackgroundImageUrl,
      branding.reportCardBackgroundImage,
      settings.reportCardBackgroundImage,
    ),
    signatureImage: firstText(
      value.resolvedReportCardSignatureImageUrl,
      branding.resolvedReportCardSignatureImageUrl,
      branding.reportCardSignatureImage,
      settings.reportCardSignatureImage,
    ),
    primaryColor:
      firstText(
        branding.primaryColor,
        value.reportPrimaryColor,
        value.primaryColor,
        settings.primaryColor,
        "#2563eb",
      ) || "#2563eb",
    fontFamily:
      firstText(
        branding.fontFamily,
        settings.fontFamily,
        "Arial, sans-serif",
      ) || "Arial, sans-serif",
  };
}

export function resolveBroadsheetStudentPhoto(
  row?: {
    resolvedStudentPhotoUrl?: string;
    studentPhoto?: string;
    photo?: string;
  } | null,
): string {
  return firstText(row?.resolvedStudentPhotoUrl, row?.studentPhoto, row?.photo);
}

// ======================================================
// DATASET DISPLAY HELPERS
// ======================================================

export function subjectStudentRows(
  dataset?: ComputedSubjectBroadsheet | null,
): SubjectBroadsheetStudentRow[] {
  return dataset?.students || [];
}

export function classStudentRows(
  dataset?: ComputedClassBroadsheet | null,
): ClassBroadsheetStudentRow[] {
  return dataset?.students || [];
}

export function annualStudentRows(
  dataset?: AnnualBroadsheet | null,
): AnnualBroadsheetStudentRow[] {
  return dataset?.students || [];
}

export function computeBroadsheetSummary(
  kind: BroadsheetKind,
  dataset?: BroadsheetDataset | null,
): BroadsheetSummaryMetric[] {
  if (!dataset) return [];

  if (kind === "subject" && isSubjectBroadsheetDataset(dataset)) {
    return [
      { key: "students", label: "Students", value: dataset.students.length },
      {
        key: "highest",
        label: "Highest Score",
        value: formatPercent(dataset.highestScore, 1),
        rawValue: dataset.highestScore,
      },
      {
        key: "lowest",
        label: "Lowest Score",
        value: formatPercent(dataset.lowestScore, 1),
        rawValue: dataset.lowestScore,
      },
      {
        key: "average",
        label: "Class Average",
        value: formatPercent(dataset.classAverage, 1),
        rawValue: dataset.classAverage,
      },
    ];
  }

  if (kind === "class" && isClassBroadsheetDataset(dataset)) {
    return [
      { key: "students", label: "Students", value: dataset.students.length },
      {
        key: "subjects",
        label: "Subjects",
        value: dataset.subjectColumns.length,
      },
      {
        key: "highest",
        label: "Highest Average",
        value: formatPercent(dataset.highestAverage, 1),
        rawValue: dataset.highestAverage,
      },
      {
        key: "average",
        label: "Class Average",
        value: formatPercent(dataset.classAverage, 1),
        rawValue: dataset.classAverage,
      },
    ];
  }

  if (kind === "annual" && isAnnualBroadsheetDataset(dataset)) {
    return [
      { key: "students", label: "Students", value: dataset.totalStudents },
      { key: "subjects", label: "Subjects", value: dataset.totalSubjects },
      { key: "periods", label: "Periods", value: dataset.totalPeriods },
      {
        key: "average",
        label: "Class Average",
        value: formatPercent(dataset.classAverage, 1),
        rawValue: dataset.classAverage,
      },
      { key: "promoted", label: "Promoted", value: dataset.promotionCount },
      { key: "repeated", label: "Repeated", value: dataset.repeatCount },
    ];
  }

  return [];
}

export function subjectCellForStudent(
  row: ClassBroadsheetStudentRow,
  subjectId: string,
) {
  return row.subjects.find((subject) => subject.subjectId === subjectId);
}

export function annualSubjectCellForStudent(
  row: AnnualBroadsheetStudentRow,
  subjectId?: string,
  subjectName?: string,
) {
  return row.subjects.find(
    (subject) =>
      (subjectId != null && subject.subjectId === subjectId) ||
      (!!subjectName && subject.subjectName === subjectName),
  );
}

export function annualPeriodScore(
  cell: AnnualBroadsheetStudentRow["subjects"][number] | undefined,
  academicPeriodId: string,
) {
  return cell?.periodScores.find(
    (period) => period.academicPeriodId === academicPeriodId,
  );
}

// ======================================================
// PAGE / STYLE HELPERS
// ======================================================

export function broadsheetPageStyle(args: {
  branding: ResolvedBroadsheetBranding;
  settings: ResolvedBroadsheetTemplateSettings;
  compact?: boolean;
  pageBreakAfter?: boolean;
  tone?: BroadsheetTemplateTone;
}): CSSProperties {
  const { branding, settings } = args;
  const tone = args.tone || "classic";

  return {
    width: settings.orientation === "portrait" ? "210mm" : "297mm",
    minHeight: settings.orientation === "portrait" ? "297mm" : "210mm",
    margin: "0 auto 18px",
    padding: args.compact ? "8mm" : "10mm",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    background: "#fff",
    color: "#111827",
    fontFamily: branding.fontFamily,
    border: tone === "minimal" ? "0" : "1px solid #d1d5db",
    borderRadius: tone === "modern" || tone === "analytics" ? 16 : 4,
    boxShadow: "0 18px 48px rgba(15,23,42,.10)",
    pageBreakAfter: args.pageBreakAfter ? "always" : "auto",
    breakAfter: args.pageBreakAfter ? "page" : "auto",
  };
}

export function getContrastTextColor(
  value?: string | null,
): "#111827" | "#fff" {
  const color = firstText(value, "#2563eb");
  if (!color.startsWith("#")) return "#fff";
  let hex = color.slice(1);
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  const parsed = Number.parseInt(hex, 16);
  if (!Number.isFinite(parsed)) return "#fff";
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 145 ? "#111827" : "#fff";
}

export function generatedBroadsheetDate(
  generatedAt?: string | number | Date,
  settings?: BroadsheetTemplateSettings | null,
): string {
  if (settings?.showBroadsheetGeneratedDate === false) return "";
  return friendlyDate(generatedAt || new Date());
}

export function defaultBroadsheetEmptyMessage(kind: BroadsheetKind): string {
  if (kind === "class") {
    return "No class broadsheet records are available for the selected filters.";
  }
  if (kind === "annual") {
    return "No annual broadsheet records are available for the selected filters.";
  }
  return "No subject broadsheet records are available for the selected filters.";
}
