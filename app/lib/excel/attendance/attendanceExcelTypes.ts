/**
 * app/lib/excel/attendance/attendanceExcelTypes.ts
 * --------------------------------------------------------------------------
 * ELEEVEON EXCEL — ATTENDANCE INTEROPERABILITY TYPES
 * --------------------------------------------------------------------------
 *
 * Attendance-specific contracts built on top of the shared Excel layer.
 *
 * Supports:
 * - daily attendance;
 * - daily register/grid attendance;
 * - term attendance totals;
 * - Eleeveon-generated templates;
 * - imported external attendance spreadsheets;
 * - offline-first create/update through existing attendance tables.
 */

import type {
  ExcelColumnMapping,
  ExcelProcessedRow,
  ExcelValidationIssue,
  ExcelValidationResult,
} from "../excelTypes";

// ======================================================
// MODES
// ======================================================

export type AttendanceExcelMode =
  | "daily"
  | "termTotals";

export type AttendanceExcelDailyLayout =
  | "long"
  | "grid";

export type AttendanceExcelStatus =
  | "present"
  | "absent"
  | "late";

// ======================================================
// WORKSPACE CONTEXT
// ======================================================

export interface AttendanceExcelImportContext {
  accountId: string;
  schoolId: string;
  branchId: string;

  classId: string;

  academicStructureId: string;
  academicPeriodId: string;

  /**
   * Used for single-date daily imports when the spreadsheet itself
   * does not contain a Date column.
   */
  date?: string;
}

// ======================================================
// REFERENCE DATA
// ======================================================

export interface AttendanceExcelStudentReference {
  id: string;

  fullName?: string;
  admissionNumber?: string;

  currentClassId?: string;

  active?: boolean;
  isDeleted?: boolean;
}

export interface AttendanceExcelEnrollmentReference {
  id: string;

  studentId: string;
  classId: string;

  academicStructureId: string;
  academicPeriodId?: string;

  status?: string;
  isDeleted?: boolean;
}

// ======================================================
// DAILY ATTENDANCE
// ======================================================

export interface AttendanceExcelDailyRecord {
  studentId?: string;
  admissionNumber?: string;
  studentName?: string;

  date?: string;

  status?: AttendanceExcelStatus | string;
}

export interface AttendanceExcelNormalizedDailyRecord {
  studentId: string;

  admissionNumber?: string;
  studentName: string;

  date: string;

  status: AttendanceExcelStatus;
}

// ======================================================
// TERM TOTALS
// ======================================================

export interface AttendanceExcelTermRecord {
  studentId?: string;
  admissionNumber?: string;
  studentName?: string;

  daysOpened?: number;
  daysPresent?: number;
  daysAbsent?: number;
  timesLate?: number;
  attendancePercent?: number;
}

export interface AttendanceExcelNormalizedTermRecord {
  studentId: string;

  admissionNumber?: string;
  studentName: string;

  daysOpened: number;
  daysPresent: number;
  daysAbsent: number;
  timesLate: number;
  attendancePercent: number;
}

// ======================================================
// STUDENT MATCHING
// ======================================================

export type AttendanceExcelStudentMatchReason =
  | "student-id"
  | "admission-number"
  | "student-name"
  | "none";

export interface AttendanceExcelStudentMatch {
  matched: boolean;

  reason: AttendanceExcelStudentMatchReason;

  student?: AttendanceExcelStudentReference;

  issue?: ExcelValidationIssue;
}

// ======================================================
// PREPARED ROWS
// ======================================================

export interface AttendanceExcelPreparedDailyRow
  extends ExcelProcessedRow<AttendanceExcelNormalizedDailyRecord> {
  studentMatch: AttendanceExcelStudentMatch;
}

export interface AttendanceExcelPreparedTermRow
  extends ExcelProcessedRow<AttendanceExcelNormalizedTermRecord> {
  studentMatch: AttendanceExcelStudentMatch;
}

export interface AttendanceExcelDailyValidationResult
  extends Omit<
    ExcelValidationResult<AttendanceExcelNormalizedDailyRecord>,
    "rows"
  > {
  rows: AttendanceExcelPreparedDailyRow[];
}

export interface AttendanceExcelTermValidationResult
  extends Omit<
    ExcelValidationResult<AttendanceExcelNormalizedTermRecord>,
    "rows"
  > {
  rows: AttendanceExcelPreparedTermRow[];
}

// ======================================================
// PARSER RESULTS
// ======================================================

export interface AttendanceExcelParsedDailyImport {
  mode: "daily";

  layout: AttendanceExcelDailyLayout;

  sheetName: string;
  headerRowIndex: number;

  mappings: ExcelColumnMapping[];

  /**
   * One logical attendance record per student/date after parsing.
   *
   * A grid spreadsheet may therefore create many logical records from
   * one physical worksheet row.
   */
  records: AttendanceExcelDailyRecord[];

  /**
   * Physical Excel row associated with each logical record.
   */
  rowNumbers: number[];
}

export interface AttendanceExcelParsedTermImport {
  mode: "termTotals";

  sheetName: string;
  headerRowIndex: number;

  mappings: ExcelColumnMapping[];

  records: AttendanceExcelTermRecord[];

  rowNumbers: number[];
}

// ======================================================
// EXISTING DATABASE RECORDS
// ======================================================

export interface AttendanceExcelExistingDaily {
  id: string;

  studentId: string;
  classId: string;

  academicStructureId: string;
  academicPeriodId: string;

  date: string;

  status?: string;

  isDeleted?: boolean;
}

export interface AttendanceExcelExistingTermSummary {
  id: string;

  studentId: string;
  classId: string;

  academicStructureId: string;
  academicPeriodId: string;

  daysOpened?: number;
  daysPresent?: number;
  daysAbsent?: number;
  timesLate?: number;
  attendancePercent?: number;

  isDeleted?: boolean;
}

// ======================================================
// IMPORT OPTIONS
// ======================================================

export interface AttendanceExcelImportOptions {
  /**
   * Existing matching rows are updated rather than duplicated.
   * This is normally always true.
   */
  updateExisting?: boolean;

  /**
   * Blank grid cells are ignored.
   *
   * They do NOT delete existing attendance unless a future UI explicitly
   * enables a destructive replacement mode.
   */
  ignoreBlankStatuses?: boolean;

  /**
   * External schools may use alternative status codes.
   *
   * Example:
   * {
   *   "p": "present",
   *   "a": "absent",
   *   "l": "late",
   *   "x": "absent"
   * }
   */
  statusAliases?: Record<string, AttendanceExcelStatus>;
}

// ======================================================
// IMPORT RESULT
// ======================================================

export type AttendanceExcelImportAction =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

export interface AttendanceExcelImportRowResult {
  rowNumber: number;

  action: AttendanceExcelImportAction;

  studentId?: string;
  studentName?: string;

  date?: string;

  recordId?: string;

  issues: ExcelValidationIssue[];

  error?: string;
}

export interface AttendanceExcelImportResult {
  mode: AttendanceExcelMode;

  totalRows: number;

  created: number;
  updated: number;
  skipped: number;
  failed: number;

  rows: AttendanceExcelImportRowResult[];
}

// ======================================================
// TEMPLATE OPTIONS
// ======================================================

export interface AttendanceExcelTemplateStudent {
  id: string;
  admissionNumber?: string;
  fullName: string;
}

export interface AttendanceExcelTemplateContext {
  schoolName?: string;
  branchName?: string;

  className?: string;

  academicStructureName?: string;
  academicPeriodName?: string;

  accountId?: string;
  schoolId?: string;
  branchId?: string;

  classId?: string;
  academicStructureId?: string;
  academicPeriodId?: string;
}