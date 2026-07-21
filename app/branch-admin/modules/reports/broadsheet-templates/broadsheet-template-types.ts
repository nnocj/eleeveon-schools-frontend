/**
 * reports/broadsheet-templates/broadsheet-template-types.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — BROADSHEET TEMPLATE FOUNDATION TYPES
 * ---------------------------------------------------------
 *
 * Shared contracts for subject, class and annual broadsheet templates.
 * Templates render normalized engine datasets; they do not calculate results.
 */

import type { ComponentType, CSSProperties, ReactNode } from "react";

import type {
  ReportCardTemplate,
  ReportCardTemplateAssignment,
  ReportCardTemplateSetting,
} from "../../../../lib/db/db";

import type {
  ComputedClassBroadsheet,
  ComputedSubjectBroadsheet,
  ReportHeaderData,
} from "../engine/report-types";

import type { AnnualBroadsheet } from "../engine/cumulative-report-types";

// ======================================================
// DOCUMENT TYPES
// ======================================================

export type BroadsheetKind = "subject" | "class" | "annual";

export type BroadsheetReportType =
  | "subject_broadsheet"
  | "class_broadsheet"
  | "annual_broadsheet";

export type BroadsheetTemplateCode =
  | "broadsheet_classic"
  | "broadsheet_modern"
  | "broadsheet_compact"
  | "broadsheet_executive"
  | "broadsheet_minimal"
  | "broadsheet_cambridge"
  | "broadsheet_university"
  | "broadsheet_analytics"
  | string;

export type BroadsheetLayoutKey = BroadsheetTemplateCode;

export type BroadsheetPaperSize = "A4" | "Letter" | string;
export type BroadsheetOrientation = "portrait" | "landscape";
export type BroadsheetDensity = "compact" | "comfortable" | "spacious" | string;

export type BroadsheetTemplateTone =
  | "classic"
  | "modern"
  | "compact"
  | "executive"
  | "minimal"
  | "cambridge"
  | "university"
  | "analytics";

// ======================================================
// ENGINE DATASETS
// ======================================================

export type BroadsheetDataset =
  | ComputedSubjectBroadsheet
  | ComputedClassBroadsheet
  | AnnualBroadsheet;

export type BroadsheetDatasetByKind = {
  subject: ComputedSubjectBroadsheet;
  class: ComputedClassBroadsheet;
  annual: AnnualBroadsheet;
};

export type BroadsheetDatasetFor<K extends BroadsheetKind> =
  BroadsheetDatasetByKind[K];

export type BroadsheetReportTypeByKind = {
  subject: "subject_broadsheet";
  class: "class_broadsheet";
  annual: "annual_broadsheet";
};

// ======================================================
// TEMPLATE SETTINGS
// ======================================================

/**
 * Runtime settings passed to broadsheet templates.
 *
 * It extends the database setting row so Branch Settings and rendering use
 * one shared contract. Optional properties preserve backwards compatibility
 * with settings saved before the broadsheet template upgrade.
 */
export interface BroadsheetTemplateSettings
  extends Partial<ReportCardTemplateSetting> {
  reportType?: BroadsheetReportType | string;

  templateCode?: BroadsheetTemplateCode;
  layoutKey?: BroadsheetLayoutKey;
  templateKey?: BroadsheetTemplateCode;
  templateName?: string;

  paperSize?: BroadsheetPaperSize;
  orientation?: BroadsheetOrientation;
  density?: BroadsheetDensity;

  // Shared controls
  showBroadsheetLogo?: boolean;
  showBroadsheetWatermark?: boolean;
  showBroadsheetGeneratedDate?: boolean;
  showBroadsheetPageNumber?: boolean;
  showBroadsheetSignatures?: boolean;
  showBroadsheetSummary?: boolean;
  showBroadsheetStatistics?: boolean;
  showBroadsheetStudentPhoto?: boolean;

  // Subject controls
  showBroadsheetAssessmentBreakdown?: boolean;
  showBroadsheetWeightedTotal?: boolean;
  showBroadsheetPercentage?: boolean;
  showBroadsheetGrade?: boolean;
  showBroadsheetRemark?: boolean;
  showBroadsheetGPA?: boolean;
  showBroadsheetPosition?: boolean;
  showBroadsheetHighestScore?: boolean;
  showBroadsheetLowestScore?: boolean;
  showBroadsheetClassAverage?: boolean;

  // Class controls
  showBroadsheetSubjectScores?: boolean;
  showBroadsheetSubjectGrades?: boolean;
  showBroadsheetTotal?: boolean;
  showBroadsheetAverage?: boolean;
  showBroadsheetClassPosition?: boolean;
  showBroadsheetAttendance?: boolean;
  showBroadsheetClassHighestAverage?: boolean;
  showBroadsheetClassLowestAverage?: boolean;

  // Annual controls
  showBroadsheetPeriodScores?: boolean;
  showBroadsheetAnnualAverage?: boolean;
  showBroadsheetAnnualGPA?: boolean;
  showBroadsheetAnnualPosition?: boolean;
  showBroadsheetTrend?: boolean;
  showBroadsheetPromotionDecision?: boolean;
  showBroadsheetBestPeriod?: boolean;
  showBroadsheetLatestPeriod?: boolean;

  // Labels
  broadsheetTitleLabel?: string;
  broadsheetGeneratedDateLabel?: string;
  broadsheetFooterText?: string;
  studentColumnLabel?: string;
  admissionNumberColumnLabel?: string;
  positionColumnLabel?: string;
  gradeColumnLabel?: string;
  remarkColumnLabel?: string;
}

export interface ResolvedBroadsheetTemplateSettings
  extends BroadsheetTemplateSettings {
  reportType: BroadsheetReportType;
  templateCode: BroadsheetTemplateCode;
  layoutKey: BroadsheetLayoutKey;
  templateName: string;
  paperSize: BroadsheetPaperSize;
  orientation: BroadsheetOrientation;
  density: BroadsheetDensity;

  showBroadsheetLogo: boolean;
  showBroadsheetWatermark: boolean;
  showBroadsheetGeneratedDate: boolean;
  showBroadsheetPageNumber: boolean;
  showBroadsheetSignatures: boolean;
  showBroadsheetSummary: boolean;
  showBroadsheetStatistics: boolean;
  showBroadsheetStudentPhoto: boolean;

  broadsheetTitleLabel: string;
  broadsheetGeneratedDateLabel: string;
  broadsheetFooterText: string;
  studentColumnLabel: string;
  admissionNumberColumnLabel: string;
  positionColumnLabel: string;
  gradeColumnLabel: string;
  remarkColumnLabel: string;
}

// ======================================================
// TEMPLATE DEFINITIONS / REGISTRY
// ======================================================

export interface BroadsheetTemplateDefinition {
  code: BroadsheetTemplateCode;
  layoutKey: BroadsheetLayoutKey;
  name: string;
  description: string;
  tone: BroadsheetTemplateTone;
  supportedKinds: BroadsheetKind[];
  orientation: BroadsheetOrientation;
  paperSize: BroadsheetPaperSize;
  density: BroadsheetDensity;
  aliases?: string[];
  fileName: string;
  previewImage?: string;
  isDefault?: boolean;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BroadsheetTemplateRegistryItem
  extends BroadsheetTemplateDefinition {
  /** Undefined until the corresponding visual template is implemented. */
  component?: BroadsheetTemplateComponent;
}

export type BroadsheetTemplateRecord = Partial<ReportCardTemplate> & {
  code?: BroadsheetTemplateCode;
  layoutKey?: BroadsheetLayoutKey;
  reportType?: BroadsheetReportType | string;
};

export type BroadsheetTemplateAssignmentRecord =
  Partial<ReportCardTemplateAssignment> & {
    reportType?: BroadsheetReportType | string;
  };

// ======================================================
// TEMPLATE COMPONENT PROPS
// ======================================================

export interface BroadsheetTemplateBaseProps<
  K extends BroadsheetKind = BroadsheetKind,
> {
  kind: K;
  dataset?: BroadsheetDatasetFor<K> | null;
  header?: ReportHeaderData | null;
  template?: BroadsheetTemplateRecord | BroadsheetTemplateDefinition | null;
  settings?: BroadsheetTemplateSettings | null;

  compact?: boolean;
  pageBreakAfter?: boolean;
  showWatermark?: boolean;
  generatedAt?: string | number | Date;
  pageNumber?: number;
  totalPages?: number;

  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export type BroadsheetTemplateProps =
  | BroadsheetTemplateBaseProps<"subject">
  | BroadsheetTemplateBaseProps<"class">
  | BroadsheetTemplateBaseProps<"annual">;

export type BroadsheetTemplateComponent = ComponentType<any>;

// ======================================================
// NORMALIZED DISPLAY CONTRACTS
// ======================================================

export interface ResolvedBroadsheetBranding {
  schoolName: string;
  branchName: string;
  branchAddress: string;
  motto: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
  watermark: string;
  backgroundImage: string;
  signatureImage: string;
  primaryColor: string;
  fontFamily: string;
}

export interface BroadsheetSummaryMetric {
  key: string;
  label: string;
  value: string | number;
  rawValue?: number | string | null;
}

export interface BroadsheetVisibleColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  minWidth?: number | string;
  visible: boolean;
  group?: "identity" | "assessment" | "result" | "summary" | "annual";
}

// ======================================================
// DEFAULTS
// ======================================================

export const DEFAULT_BROADSHEET_TEMPLATE_CODE: BroadsheetTemplateCode =
  "broadsheet_classic";

export const DEFAULT_BROADSHEET_SETTINGS: ResolvedBroadsheetTemplateSettings = {
  reportType: "subject_broadsheet",
  templateCode: DEFAULT_BROADSHEET_TEMPLATE_CODE,
  layoutKey: DEFAULT_BROADSHEET_TEMPLATE_CODE,
  templateName: "Classic Broadsheet",
  paperSize: "A4",
  orientation: "landscape",
  density: "compact",

  showBroadsheetLogo: true,
  showBroadsheetWatermark: false,
  showBroadsheetGeneratedDate: true,
  showBroadsheetPageNumber: true,
  showBroadsheetSignatures: false,
  showBroadsheetSummary: true,
  showBroadsheetStatistics: true,
  showBroadsheetStudentPhoto: false,

  showBroadsheetAssessmentBreakdown: true,
  showBroadsheetWeightedTotal: true,
  showBroadsheetPercentage: true,
  showBroadsheetGrade: true,
  showBroadsheetRemark: true,
  showBroadsheetGPA: true,
  showBroadsheetPosition: true,
  showBroadsheetHighestScore: true,
  showBroadsheetLowestScore: true,
  showBroadsheetClassAverage: true,

  showBroadsheetSubjectScores: true,
  showBroadsheetSubjectGrades: false,
  showBroadsheetTotal: true,
  showBroadsheetAverage: true,
  showBroadsheetClassPosition: true,
  showBroadsheetAttendance: true,
  showBroadsheetClassHighestAverage: true,
  showBroadsheetClassLowestAverage: true,

  showBroadsheetPeriodScores: true,
  showBroadsheetAnnualAverage: true,
  showBroadsheetAnnualGPA: true,
  showBroadsheetAnnualPosition: true,
  showBroadsheetTrend: true,
  showBroadsheetPromotionDecision: true,
  showBroadsheetBestPeriod: true,
  showBroadsheetLatestPeriod: true,

  broadsheetTitleLabel: "Broadsheet",
  broadsheetGeneratedDateLabel: "Generated",
  broadsheetFooterText:
    "Official academic broadsheet generated by Eleeveon Schools.",
  studentColumnLabel: "Student",
  admissionNumberColumnLabel: "Admission No.",
  positionColumnLabel: "Position",
  gradeColumnLabel: "Grade",
  remarkColumnLabel: "Remark",
};
