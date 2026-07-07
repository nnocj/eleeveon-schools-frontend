/**
 * reports/shared/ReportTemplateTypes.ts
 * ---------------------------------------------------------
 * ELEEVEON SCHOOLS — STUDENT REPORT TEMPLATE CONTRACTS
 * ---------------------------------------------------------
 *
 * This file is the shared contract for every student report card template.
 *
 * Core rule:
 * - The report engine computes the data once.
 * - The selected template only changes layout, styling and arrangement.
 * - Visibility settings remove fields completely instead of leaving blank spaces.
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
 *
 * Used by:
 * - reports/components/StudentReportCard.tsx
 * - reports/student-report-templates/*
 * - reports/shared/headers/*
 * - reports/engine/report-template-resolver.ts
 */

import type React from "react";

import type {
  ReportHeaderData,
  StudentReportCardDataset,
  StudentSubjectResult,
  ComputedStudentReport,
  AttendanceSummary,
} from "../engine/report-types";

// ======================================================
// TEMPLATE IDENTITY
// ======================================================

export type StudentReportTemplateCode =
  | "classic_formal"
  | "modern_clean"
  | "compact_print"
  | "bordered_traditional"
  | "letterhead_premium"
  | "side_profile"
  | "cambridge"
  | "ib"
  | "kindergarten"
  | "montessori"
  | "university_transcript"
  | string;

export type StudentReportTemplateLayoutKey =
  | "classic_formal"
  | "modern_clean"
  | "compact_print"
  | "bordered_traditional"
  | "letterhead_premium"
  | "side_profile"
  | "cambridge"
  | "ib"
  | "kindergarten"
  | "montessori"
  | "university_transcript"
  | string;

export type StudentReportTemplateOrientation =
  | "portrait"
  | "landscape";

export type StudentReportTemplatePaperSize =
  | "A4"
  | "Letter";

export type StudentReportTemplateDensity =
  | "compact"
  | "comfortable"
  | "spacious";

// ======================================================
// TEMPLATE DB ROW SHAPES
// ======================================================

export type ReportTemplateScopeType =
  | "account"
  | "school"
  | "branch"
  | "academicStructure"
  | "academicPeriod"
  | "class"
  | "level"
  | "student"
  | string;

export interface ReportCardTemplateLike {
  id?: number;
  cloudId?: string;

  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;

  name?: string;
  code?: StudentReportTemplateCode;
  layoutKey?: StudentReportTemplateLayoutKey;
  description?: string | null;

  orientation?: StudentReportTemplateOrientation;
  paperSize?: StudentReportTemplatePaperSize;
  density?: StudentReportTemplateDensity;

  previewImage?: string | null;
  active?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;

  metadata?: any;
}

export interface ReportCardTemplateSettingsLike {
  id?: number;
  cloudId?: string;

  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  templateId?: number | string | null;

  orientation?: StudentReportTemplateOrientation;
  paperSize?: StudentReportTemplatePaperSize;
  density?: StudentReportTemplateDensity;

  showSubjectPosition?: boolean;
  showClassPosition?: boolean;
  showNumberOnRoll?: boolean;

  showAttendance?: boolean;
  showAttendancePercent?: boolean;

  showStudentPhoto?: boolean;
  showTeacherNames?: boolean;

  showCurrentAcademicPeriodEnd?: boolean;
  showNextAcademicPeriod?: boolean;
  showPromotionStatus?: boolean;

  showGPA?: boolean;
  showAverage?: boolean;
  showTotal?: boolean;
  showGrade?: boolean;

  showSubjectRemarks?: boolean;

  showWatermark?: boolean;
  showParentSignature?: boolean;
  showGeneratedDate?: boolean;

  classTeacherLabel?: string;
  headTeacherLabel?: string;
  parentLabel?: string;
  principalLabel?: string;

  currentAcademicPeriodEndLabel?: string;
  nextAcademicPeriodLabel?: string;
  numberOnRollLabel?: string;
  classPositionLabel?: string;
  subjectPositionLabel?: string;
  generatedDateLabel?: string;

  active?: boolean;
  isDeleted?: boolean;

  metadata?: any;
}

export interface ReportCardTemplateAssignmentLike {
  id?: number;
  cloudId?: string;

  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;

  templateId?: number | string | null;
  templateSettingsId?: number | string | null;

  scopeType?: ReportTemplateScopeType | null;
  scopeId?: number | string | null;

  academicStructureId?: number | string | null;
  academicPeriodId?: number | string | null;
  classId?: number | string | null;
  level?: string | null;

  isDefault?: boolean;
  active?: boolean;
  isDeleted?: boolean;

  metadata?: any;
}

// ======================================================
// NORMALIZED TEMPLATE SETTINGS
// ======================================================

export interface StudentReportTemplateDefinition {
  id?: number;
  code: StudentReportTemplateCode;
  name: string;
  layoutKey: StudentReportTemplateLayoutKey;
  description?: string;

  orientation: StudentReportTemplateOrientation;
  paperSize: StudentReportTemplatePaperSize;
  density: StudentReportTemplateDensity;

  isDefault?: boolean;
  active?: boolean;
}

export interface StudentReportVisibilitySettings {
  showSubjectPosition: boolean;
  showClassPosition: boolean;
  showNumberOnRoll: boolean;

  showAttendance: boolean;
  showAttendancePercent: boolean;

  showStudentPhoto: boolean;
  showTeacherNames: boolean;

  showCurrentAcademicPeriodEnd: boolean;
  showNextAcademicPeriod: boolean;
  showPromotionStatus: boolean;

  showGPA: boolean;
  showAverage: boolean;
  showTotal: boolean;
  showGrade: boolean;

  showSubjectRemarks: boolean;

  showWatermark: boolean;
  showParentSignature: boolean;
  showGeneratedDate: boolean;
}

export interface StudentReportLabelSettings {
  classTeacherLabel: string;
  headTeacherLabel: string;
  parentLabel: string;
  principalLabel: string;

  currentAcademicPeriodEndLabel: string;
  nextAcademicPeriodLabel: string;
  numberOnRollLabel: string;
  classPositionLabel: string;
  subjectPositionLabel: string;
  generatedDateLabel: string;
}

export interface StudentReportTemplateSettings
  extends StudentReportVisibilitySettings,
    StudentReportLabelSettings {
  templateId?: number;
  templateSettingsId?: number;
  assignmentId?: number;

  templateCode: StudentReportTemplateCode;
  layoutKey: StudentReportTemplateLayoutKey;
  templateName: string;

  orientation: StudentReportTemplateOrientation;
  paperSize: StudentReportTemplatePaperSize;
  density: StudentReportTemplateDensity;

  active: boolean;
}

// ======================================================
// TEMPLATE RENDERING PROPS
// ======================================================

export interface StudentReportTemplateBaseProps {
  dataset?: StudentReportCardDataset;
  template?: StudentReportTemplateDefinition;
  settings?: Partial<StudentReportTemplateSettings>;
  compact?: boolean;
  showWatermark?: boolean;
  pageBreakAfter?: boolean;
  mobilePreview?: boolean;
}

export interface StudentReportTemplateProps extends StudentReportTemplateBaseProps {
  resolvedSettings: StudentReportTemplateSettings;
}

export type StudentReportTemplateComponent = (
  props: StudentReportTemplateBaseProps
) => React.ReactElement;

// ======================================================
// SHARED HEADER PROPS
// ======================================================

export type ReportHeaderVariant =
  | "classic_formal"
  | "modern_clean"
  | "compact_print"
  | "bordered_traditional"
  | "letterhead_premium"
  | "side_profile"
  | "cambridge"
  | "ib"
  | "kindergarten"
  | "montessori"
  | "university_transcript"
  | string;

export interface ReportTemplateHeaderProps {
  header?: ReportHeaderData;
  dataset?: StudentReportCardDataset;

  title?: string;
  variant?: ReportHeaderVariant;

  settings: StudentReportTemplateSettings;

  primaryColor?: string;
  fontFamily?: string;
  compact?: boolean;
}

// ======================================================
// NORMALIZED DISPLAY DATA
// ======================================================

export interface ReportTemplateBrandingData {
  schoolName: string;
  motto?: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  branchName?: string;
  branchAddress?: string;
  primaryColor: string;
  fontFamily?: string;
  reportCardBackgroundImage?: string;
  reportCardWatermark?: string;
  reportCardSignatureImage?: string;
}

export interface ReportTemplateStudentInfo {
  studentId: number;
  studentName: string;
  admissionNumber?: string;
  gender?: string;
  studentPhoto?: string;
  className: string;
  numberOnRoll?: number;
  overallPosition?: number;
  promoted?: boolean;
}

export interface ReportTemplateNextPeriodInfo {
  id?: number;
  academicStructureId?: number;
  name?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  order?: number;
  formattedStartDate?: string;
  label?: string;
}

export interface ReportTemplateCurrentPeriodInfo {
  id?: number;
  academicStructureId?: number;
  name?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  order?: number;
  formattedEndDate?: string;
  label?: string;
}

export interface ReportTemplateSummaryInfo {
  total?: number;
  average?: number;
  overallGPA?: number;
  overallPosition?: number;
  numberOnRoll?: number;
}

export interface ReportTemplateSignatureInfo {
  classTeacherName?: string;
  headTeacherName?: string;
  principalName?: string;
  parentName?: string;
  guardianName?: string;
  officialSignatureImage?: string;
}

export interface NormalizedStudentReportTemplateData {
  header: ReportHeaderData;
  report: ComputedStudentReport;
  student?: any;

  branding: ReportTemplateBrandingData;
  studentInfo: ReportTemplateStudentInfo;
  subjectResults: StudentSubjectResult[];
  attendance?: AttendanceSummary;
  summary: ReportTemplateSummaryInfo;
  currentAcademicPeriod?: ReportTemplateCurrentPeriodInfo;
  nextAcademicPeriod?: ReportTemplateNextPeriodInfo;
  signatures: ReportTemplateSignatureInfo;
  generatedAt?: string | number | Date;

  settings: StudentReportTemplateSettings;
}

// ======================================================
// DEFAULTS
// ======================================================

export const DEFAULT_STUDENT_REPORT_TEMPLATE_CODE: StudentReportTemplateCode =
  "classic_formal";

export const DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS: StudentReportTemplateSettings = {
  templateCode: "classic_formal",
  layoutKey: "classic_formal",
  templateName: "Classic Formal",

  orientation: "portrait",
  paperSize: "A4",
  density: "compact",

  showSubjectPosition: true,
  showClassPosition: true,
  showNumberOnRoll: false,

  showAttendance: true,
  showAttendancePercent: true,

  showStudentPhoto: true,
  showTeacherNames: true,

  showCurrentAcademicPeriodEnd: true,
  showNextAcademicPeriod: true,
  showPromotionStatus: false,

  showGPA: true,
  showAverage: true,
  showTotal: true,
  showGrade: true,

  showSubjectRemarks: true,

  showWatermark: true,
  showParentSignature: true,
  showGeneratedDate: false,

  classTeacherLabel: "Class Teacher",
  headTeacherLabel: "Headteacher / Principal",
  parentLabel: "Parent / Guardian",
  principalLabel: "Principal",

  currentAcademicPeriodEndLabel: "This Academic Period Ends",
  nextAcademicPeriodLabel: "Next Academic Period Begins",
  numberOnRollLabel: "Number On Roll",
  classPositionLabel: "Class Position",
  subjectPositionLabel: "Position",
  generatedDateLabel: "Generated On",

  active: true,
};

export const DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS: StudentReportTemplateDefinition[] = [
  {
    code: "classic_formal",
    name: "Classic Formal",
    layoutKey: "classic_formal",
    description: "Formal Ghana/private-school report style with strong official structure.",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    isDefault: true,
    active: true,
  },
  {
    code: "modern_clean",
    name: "Modern Clean",
    layoutKey: "modern_clean",
    description: "Premium clean layout with softer spacing and modern arrangement.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "compact_print",
    name: "Compact Print",
    layoutKey: "compact_print",
    description: "Space-saving layout for efficient printing while keeping report quality.",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    active: true,
  },
  {
    code: "bordered_traditional",
    name: "Bordered Traditional",
    layoutKey: "bordered_traditional",
    description: "Boxed and table-heavy traditional school report arrangement.",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    active: true,
  },
  {
    code: "letterhead_premium",
    name: "Letterhead Premium",
    layoutKey: "letterhead_premium",
    description: "Institutional letterhead-style report with elegant branding emphasis.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "side_profile",
    name: "Side Profile",
    layoutKey: "side_profile",
    description: "Modern report layout with student identity/profile emphasis.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "cambridge",
    name: "Cambridge",
    layoutKey: "cambridge",
    description: "International-style academic report arrangement inspired by Cambridge-style school reporting.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "ib",
    name: "IB",
    layoutKey: "ib",
    description: "International Baccalaureate-style report arrangement with clean academic structure.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "kindergarten",
    name: "Kindergarten",
    layoutKey: "kindergarten",
    description: "Early-years report card style while still receiving the same Eleeveon report dataset.",
    orientation: "portrait",
    paperSize: "A4",
    density: "comfortable",
    active: true,
  },
  {
    code: "montessori",
    name: "Montessori",
    layoutKey: "montessori",
    description: "Montessori-inspired report design focused on calm presentation and development-friendly structure.",
    orientation: "portrait",
    paperSize: "A4",
    density: "spacious",
    active: true,
  },
  {
    code: "university_transcript",
    name: "University Transcript",
    layoutKey: "university_transcript",
    description: "Transcript-style academic report layout for higher academic or cumulative presentation.",
    orientation: "portrait",
    paperSize: "A4",
    density: "compact",
    active: true,
  },
];

// ======================================================
// HELPERS
// ======================================================

export function normalizeTemplateKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function mergeStudentReportTemplateSettings(
  settings?: Partial<StudentReportTemplateSettings> | ReportCardTemplateSettingsLike | null,
  template?: Partial<StudentReportTemplateDefinition> | ReportCardTemplateLike | null,
  assignment?: ReportCardTemplateAssignmentLike | null
): StudentReportTemplateSettings {
  const merged: StudentReportTemplateSettings = {
    ...DEFAULT_STUDENT_REPORT_TEMPLATE_SETTINGS,
    ...(settings || {}),
  } as StudentReportTemplateSettings;

  const templateCode =
    (template as any)?.code ||
    (settings as any)?.templateCode ||
    merged.templateCode ||
    DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;

  const layoutKey =
    (template as any)?.layoutKey ||
    (settings as any)?.layoutKey ||
    merged.layoutKey ||
    templateCode ||
    "classic_formal";

  const templateDefinition = getStudentReportTemplateDefinitionByCode(templateCode);

  const templateName =
    (template as any)?.name ||
    (settings as any)?.templateName ||
    templateDefinition.name ||
    merged.templateName ||
    "Classic Formal";

  return {
    ...merged,
    templateId: Number((template as any)?.id || (settings as any)?.templateId || merged.templateId || 0) || undefined,
    templateSettingsId:
      Number((settings as any)?.id || (settings as any)?.templateSettingsId || merged.templateSettingsId || 0) || undefined,
    assignmentId:
      Number((assignment as any)?.id || merged.assignmentId || 0) || undefined,

    templateCode,
    layoutKey,
    templateName,

    orientation:
      ((settings as any)?.orientation || (template as any)?.orientation || merged.orientation || templateDefinition.orientation || "portrait") as StudentReportTemplateOrientation,
    paperSize:
      ((settings as any)?.paperSize || (template as any)?.paperSize || merged.paperSize || templateDefinition.paperSize || "A4") as StudentReportTemplatePaperSize,
    density:
      ((settings as any)?.density || (template as any)?.density || merged.density || templateDefinition.density || "compact") as StudentReportTemplateDensity,

    active: (settings as any)?.active !== false && (template as any)?.active !== false,
  };
}

export function normalizeStudentReportTemplateDefinition(
  template?: ReportCardTemplateLike | null
): StudentReportTemplateDefinition {
  const code = template?.code || DEFAULT_STUDENT_REPORT_TEMPLATE_CODE;
  const fallback = getStudentReportTemplateDefinitionByCode(code);

  return {
    id: Number(template?.id || 0) || undefined,
    code,
    name: template?.name || fallback.name,
    layoutKey: template?.layoutKey || fallback.layoutKey,
    description: template?.description || fallback.description,
    orientation: template?.orientation || fallback.orientation,
    paperSize: template?.paperSize || fallback.paperSize,
    density: template?.density || fallback.density,
    isDefault: template?.isDefault ?? fallback.isDefault,
    active: template?.active !== false,
  };
}

export function getStudentReportTemplateDefinitionByCode(
  code?: StudentReportTemplateCode | null
): StudentReportTemplateDefinition {
  const normalized = normalizeTemplateKey(code || DEFAULT_STUDENT_REPORT_TEMPLATE_CODE);

  return (
    DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS.find(
      item =>
        normalizeTemplateKey(item.code) === normalized ||
        normalizeTemplateKey(item.layoutKey) === normalized
    ) || DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS[0]
  );
}

export function getStudentReportTemplateDefinitions() {
  return [...DEFAULT_STUDENT_REPORT_TEMPLATE_DEFINITIONS];
}
