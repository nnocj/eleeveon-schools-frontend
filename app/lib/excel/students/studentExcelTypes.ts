/**
 * app/lib/excel/students/studentExcelTypes.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — STUDENT INTEROPERABILITY TYPES
 * --------------------------------------------------------------------------
 *
 * Student-specific contracts used by:
 * - student spreadsheet parsing;
 * - configurable column mapping;
 * - import preview;
 * - duplicate detection;
 * - validation;
 * - offline-first student creation/update;
 * - optional initial enrollment creation;
 * - student spreadsheet/template export.
 *
 * IMPORTANT:
 * Shared/domain-agnostic Excel contracts remain in ../excelTypes.ts.
 */

import type {
  ExcelColumnMapping,
  ExcelMappedRecord,
  ExcelProcessedRow,
  ExcelSourceColumn,
  ExcelValidationIssue,
  ExcelValidationResult,
} from "../excelTypes";

/**
 * Student fields that may be supplied by an external spreadsheet.
 *
 * These deliberately use the names already used by Students.tsx / Student.
 */
export interface StudentExcelRecord extends ExcelMappedRecord {
  fullName?: string;
  admissionNumber?: string;

  gender?: string;
  age?: number;
  dateOfBirth?: string;

  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;

  address?: string;

  /**
   * Optional spreadsheet class value.
   *
   * This is human-readable and is NOT trusted as a database ID.
   * The importer may resolve it against the active branch's classes.
   */
  className?: string;

  /**
   * Optional exact class code from the spreadsheet.
   */
  classCode?: string;

  status?: string;
}

/**
 * Student row after student-specific normalization.
 */
export interface StudentExcelNormalizedRecord {
  fullName: string;
  admissionNumber?: string;

  gender?: string;
  age?: number;
  dateOfBirth?: string;

  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;

  address?: string;

  className?: string;
  classCode?: string;

  status: string;
}

/**
 * Academic/workspace scope into which students are imported.
 */
export interface StudentExcelImportContext {
  accountId: string;
  schoolId: string;
  branchId: string;

  /**
   * Optional organization scope used by Student.
   */
  organizationId?: string;

  /**
   * Optional class chosen in the UI.
   *
   * When supplied this normally takes priority over a class name contained
   * in the spreadsheet.
   */
  classId?: string;

  /**
   * Required when the importer should also create an initial enrollment.
   */
  academicStructureId?: string;
  academicPeriodId?: string;

  /**
   * ISO date used for the initial enrollment.
   * Defaults to today's date.
   */
  enrollmentStartDate?: string;
}

/**
 * A class available inside the current branch.
 */
export interface StudentExcelClassOption {
  id: string;
  name: string;
  code?: string;

  active?: boolean;
  isDeleted?: boolean;
}

/**
 * Existing student snapshot used for duplicate matching.
 */
export interface StudentExcelExistingStudent {
  id: string;

  fullName?: string;
  admissionNumber?: string;

  schoolId?: string;
  branchId?: string;

  currentClassId?: string;

  active?: boolean;
  isDeleted?: boolean;
  status?: string;
}

/**
 * Existing enrollment snapshot used to avoid duplicate enrollment rows.
 */
export interface StudentExcelExistingEnrollment {
  id: string;

  studentId?: string;
  classId?: string;

  academicStructureId?: string;
  academicPeriodId?: string;

  status?: string;
  isDeleted?: boolean;
}

/**
 * What to do when the imported row matches an existing student.
 */
export type StudentExcelDuplicateStrategy =
  | "skip"
  | "update";

/**
 * What to do when an imported class value cannot be resolved.
 */
export type StudentExcelUnknownClassStrategy =
  | "use-selected-class"
  | "leave-unassigned"
  | "reject-row";

/**
 * Student import execution options.
 */
export interface StudentExcelImportOptions {
  duplicateStrategy?: StudentExcelDuplicateStrategy;

  unknownClassStrategy?: StudentExcelUnknownClassStrategy;

  /**
   * Whether a spreadsheet class should be considered when classId was not
   * explicitly selected in the import context.
   *
   * Defaults to true.
   */
  resolveSpreadsheetClass?: boolean;

  /**
   * Create StudentEnrollment when a class + academic structure + period
   * can be resolved.
   *
   * Defaults to true.
   */
  createEnrollment?: boolean;

  /**
   * Update Student.currentClassId when a class is resolved.
   *
   * Defaults to true.
   */
  updateCurrentClass?: boolean;
}

/**
 * Duplicate match reason.
 */
export type StudentExcelDuplicateReason =
  | "admission-number"
  | "name"
  | "none";

/**
 * Result of matching one imported student against existing records.
 */
export interface StudentExcelDuplicateMatch {
  matched: boolean;
  reason: StudentExcelDuplicateReason;
  student?: StudentExcelExistingStudent;
}

/**
 * Class resolution result.
 */
export interface StudentExcelClassResolution {
  resolved: boolean;

  classId?: string;
  className?: string;

  source:
    | "selected-class"
    | "spreadsheet-class-code"
    | "spreadsheet-class-name"
    | "none";

  issue?: ExcelValidationIssue;
}

/**
 * Row prepared for import after student-specific validation.
 */
export interface StudentExcelPreparedRow
  extends ExcelProcessedRow<StudentExcelNormalizedRecord> {
  duplicate?: StudentExcelDuplicateMatch;
  classResolution?: StudentExcelClassResolution;
}

/**
 * Student-specific validation result.
 */
export interface StudentExcelValidationResult
  extends Omit<
    ExcelValidationResult<StudentExcelNormalizedRecord>,
    "rows"
  > {
  rows: StudentExcelPreparedRow[];
}

/**
 * Parsed student import preparation result.
 */
export interface StudentExcelPreparedImport {
  sheetName: string;

  sourceColumns: ExcelSourceColumn[];

  mappings: ExcelColumnMapping[];

  records: StudentExcelRecord[];

  rowNumbers: number[];

  validation: StudentExcelValidationResult;
}

/**
 * Per-row import action.
 */
export type StudentExcelImportAction =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

/**
 * Result of one student row during import.
 */
export interface StudentExcelImportRowResult {
  rowNumber: number;

  action: StudentExcelImportAction;

  studentId?: string;

  fullName?: string;
  admissionNumber?: string;

  enrollmentCreated?: boolean;

  issues: ExcelValidationIssue[];

  error?: string;
}

/**
 * Final result of executing the student import.
 */
export interface StudentExcelImportResult {
  totalRows: number;

  created: number;
  updated: number;
  skipped: number;
  failed: number;

  enrollmentsCreated: number;

  rows: StudentExcelImportRowResult[];
}

/**
 * Parameters consumed by the parser.
 */
export interface PrepareStudentExcelOptions {
  /**
   * Zero-based header row.
   * When omitted the parser may try to detect it.
   */
  headerRowIndex?: number;

  /**
   * Existing mappings selected by the user.
   *
   * When absent, automatic mapping is attempted.
   */
  mappings?: ExcelColumnMapping[];

  /**
   * Sheet name/index selection happens before this layer when a parsed
   * worksheet is already supplied.
   */
  skipEmptyRows?: boolean;
}

/**
 * Utility alias used by student mapping screens.
 */
export type StudentExcelMappedRecord = StudentExcelRecord;