/**
 * app/lib/excel/assessments/assessmentExcelTypes.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ASSESSMENT INTEROPERABILITY TYPES
 * --------------------------------------------------------------------------
 *
 * Assessment-specific contracts for:
 * - controlled Eleeveon assessment workbooks;
 * - external assessment spreadsheets;
 * - projected assessment-entry columns;
 * - score validation;
 * - student matching;
 * - locked-entry protection;
 * - offline-first AssessmentEntry import.
 *
 * IMPORTANT:
 * The assessment Excel layer must NEVER invent assessment columns.
 *
 * Editable columns should come from the SAME assessment-entry projection
 * used by AssessmentEntries.tsx.
 */

import type {
  ExcelColumnMapping,
  ExcelProcessedRow,
  ExcelValidationIssue,
  ExcelValidationResult,
} from "../excelTypes";

// ======================================================
// TEMPLATE / IMPORT MODE
// ======================================================

export type AssessmentExcelWorkbookKind =
  | "eleeveon-assessment"
  | "external-assessment";

export type AssessmentExcelTemplateVersion = 1;

// ======================================================
// ASSESSMENT CONTEXT
// ======================================================

/**
 * Full assessment context required for deterministic import.
 */
export interface AssessmentExcelContext {
  accountId: string;
  schoolId: string;
  branchId: string;

  classSubjectId: string;
  classId: string;
  subjectId: string;

  academicStructureId: string;
  academicPeriodId: string;

  assessmentStructureId: string;

  gradingStructureId?: string;
  organizationId?: string;

  /**
   * Human-readable values used by exported workbooks.
   */
  schoolName?: string;
  branchName?: string;

  className?: string;
  subjectName?: string;
  subjectCode?: string;

  academicStructureName?: string;
  academicPeriodName?: string;

  assessmentStructureName?: string;
}

// ======================================================
// PROJECTED EDITABLE COLUMN
// ======================================================

/**
 * One directly-enterable assessment column.
 *
 * These values should come from projectAssessmentEntryColumns()
 * in the assessment-entry layer.
 */
export interface AssessmentExcelProjectedColumn {
  /**
   * AssessmentStructureItem.id
   */
  itemId: string;

  /**
   * Main human-readable label.
   */
  label: string;

  /**
   * Optional compact UI/export label.
   */
  compactLabel?: string;

  /**
   * Optional group heading/path.
   */
  groupLabel?: string;

  /**
   * Optional hierarchy/path labels.
   */
  pathLabels?: string[];

  maxScore: number;

  /**
   * Weight used by the existing assessment calculation.
   */
  weight?: number;

  /**
   * Sort/display order.
   */
  order?: number;
}

// ======================================================
// STUDENT REFERENCE
// ======================================================

export interface AssessmentExcelStudentReference {
  id: string;

  fullName: string;
  admissionNumber?: string;

  active?: boolean;
  isDeleted?: boolean;
}

export interface AssessmentExcelEnrollmentReference {
  id: string;

  studentId: string;
  classId: string;

  academicStructureId: string;
  academicPeriodId?: string;

  status?: string;
  isDeleted?: boolean;
}

// ======================================================
// EXISTING ENTRY
// ======================================================

export interface AssessmentExcelExistingEntry {
  id: string;

  accountId?: string;
  schoolId?: string;
  branchId?: string;

  classSubjectId?: string;

  organizationId?: string;

  academicStructureId?: string;
  academicPeriodId?: string;

  gradingStructureId?: string;
  assessmentStructureId?: string;
  assessmentStructureItemId?: string;

  studentId?: string;

  classId?: string;
  subjectId?: string;

  score?: number;

  grade?: string;
  remark?: string;

  published?: boolean;
  locked?: boolean;

  active?: boolean;
  isDeleted?: boolean;
}

// ======================================================
// GRADE RULE
// ======================================================

/**
 * Normalized grade rule consumed by the Excel importer.
 *
 * The UI integration can map the application's GradeRule records into
 * this shape.
 */
export interface AssessmentExcelGradeRule {
  id?: string;

  minScore: number;
  maxScore: number;

  grade: string;

  remark?: string;
  gpa?: number;

  order?: number;
}

// ======================================================
// WORKBOOK METADATA
// ======================================================

export interface AssessmentExcelMetadata {
  templateKind: "eleeveon-assessment";
  templateVersion: AssessmentExcelTemplateVersion;

  generatedAt?: string;

  accountId: string;
  schoolId: string;
  branchId: string;

  classSubjectId: string;
  classId: string;
  subjectId: string;

  academicStructureId: string;
  academicPeriodId: string;

  assessmentStructureId: string;

  gradingStructureId?: string;
  organizationId?: string;

  /**
   * Assessment sheet name inside the workbook.
   */
  sheetName: string;
}

export interface AssessmentExcelMetadataColumn {
  /**
   * Zero-based column index in the visible assessment sheet.
   */
  sheetColumnIndex: number;

  itemId: string;

  label: string;

  maxScore: number;

  weight?: number;
}

// ======================================================
// PARSED SCORE
// ======================================================

/**
 * One logical score cell.
 *
 * A single student worksheet row can produce many of these.
 */
export interface AssessmentExcelScoreRecord {
  studentId?: string;
  admissionNumber?: string;
  studentName?: string;

  assessmentStructureItemId: string;

  assessmentLabel?: string;

  score?: number;

  /**
   * True when the spreadsheet cell was blank.
   *
   * In an Eleeveon-controlled workbook a blank value can mean:
   * delete/clear an existing unlocked entry.
   */
  blank: boolean;

  maxScore: number;
  weight?: number;

  /**
   * Physical worksheet row.
   */
  rowNumber: number;

  /**
   * Physical worksheet column.
   */
  columnIndex: number;
}

// ======================================================
// STUDENT MATCH
// ======================================================

export type AssessmentExcelStudentMatchReason =
  | "student-id"
  | "admission-number"
  | "student-name"
  | "none";

export interface AssessmentExcelStudentMatch {
  matched: boolean;

  reason: AssessmentExcelStudentMatchReason;

  student?: AssessmentExcelStudentReference;

  issue?: ExcelValidationIssue;
}

// ======================================================
// NORMALIZED SCORE
// ======================================================

export interface AssessmentExcelNormalizedScore {
  studentId: string;

  admissionNumber?: string;
  studentName: string;

  assessmentStructureItemId: string;

  assessmentLabel?: string;

  score?: number;
  blank: boolean;

  maxScore: number;
  weight: number;
}

// ======================================================
// PREPARED SCORE ROW
// ======================================================

export interface AssessmentExcelPreparedScoreRow
  extends ExcelProcessedRow<AssessmentExcelNormalizedScore> {
  studentMatch: AssessmentExcelStudentMatch;

  existingEntry?: AssessmentExcelExistingEntry;

  /**
   * True when an existing locked entry prevents this spreadsheet
   * value from being changed.
   */
  locked: boolean;
}

// ======================================================
// VALIDATION RESULT
// ======================================================

export interface AssessmentExcelValidationResult
  extends Omit<
    ExcelValidationResult<AssessmentExcelNormalizedScore>,
    "rows"
  > {
  rows: AssessmentExcelPreparedScoreRow[];
}

// ======================================================
// PARSED IMPORT
// ======================================================

export interface AssessmentExcelParsedImport {
  kind: AssessmentExcelWorkbookKind;

  sheetName: string;
  headerRowIndex: number;

  metadata?: AssessmentExcelMetadata;

  metadataColumns: AssessmentExcelMetadataColumn[];

  /**
   * Used for external student identity mapping.
   */
  mappings: ExcelColumnMapping[];

  scoreRecords: AssessmentExcelScoreRecord[];
}

// ======================================================
// IMPORT OPTIONS
// ======================================================

export interface AssessmentExcelImportOptions {
  /**
   * Existing unlocked score cells are updated.
   *
   * Defaults true.
   */
  updateExisting?: boolean;

  /**
   * Blank controlled-template score cells clear existing unlocked entries.
   *
   * Defaults true.
   */
  clearExistingWhenBlank?: boolean;

  /**
   * Locked entries are always protected.
   *
   * This option controls whether they appear as an error or warning.
   */
  lockedEntrySeverity?: "error" | "warning";

  /**
   * Whether external sheets may match students by exact name when Student ID
   * and Admission Number are unavailable.
   *
   * Defaults true.
   */
  allowNameMatch?: boolean;
}

// ======================================================
// STUDENT CALCULATION
// ======================================================

export interface AssessmentExcelStudentCalculation {
  studentId: string;

  rawTotal: number;
  weightedTotal: number;
  percentage: number;

  grade?: string;
  remark?: string;
  gpa?: number;
}

// ======================================================
// IMPORT RESULT
// ======================================================

export type AssessmentExcelImportAction =
  | "created"
  | "updated"
  | "deleted"
  | "skipped"
  | "failed";

export interface AssessmentExcelImportRowResult {
  rowNumber: number;
  columnIndex?: number;

  action: AssessmentExcelImportAction;

  studentId?: string;
  studentName?: string;

  assessmentStructureItemId?: string;
  assessmentLabel?: string;

  score?: number;

  entryId?: string;

  issues: ExcelValidationIssue[];

  error?: string;
}

export interface AssessmentExcelImportResult {
  totalScoreCells: number;

  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;

  studentsProcessed: number;

  calculations: AssessmentExcelStudentCalculation[];

  rows: AssessmentExcelImportRowResult[];
}