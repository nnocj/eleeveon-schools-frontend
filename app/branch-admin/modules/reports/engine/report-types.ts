/**
 * reports/engine/report-types.ts
 * ---------------------------------------------------------
 * ENTERPRISE REPORTING TYPE SYSTEM
 * ---------------------------------------------------------
 *
 * This file is the shared contract for the whole reporting
 * module. The engine, report page, filters, cards,
 * broadsheets, analytics and export tools all depend on it.
 *
 * Workspace-source update:
 * - report display components should not fetch school/branch context by themselves
 * - report pages/engines should resolve the selected workspace first
 * - branch/campus identity can now be passed explicitly through ReportHeaderData
 *   and ReportBranding without relying on component-level Dexie/context lookups
 *
 * Media asset contract update:
 * - report pages can resolve mediaAssets/mediaBlobs once and pass final object URLs
 *   into report datasets before rendering printable components
 * - display components should prefer resolved*Url fields, then fallback to legacy
 *   string fields only when no active media asset exists
 * - this keeps report components display-only while supporting the new media system
 *
 * Academic period display contract update:
 * - the report engine can compute the current academic period end date and the next active academic period
 *   from academicPeriods and pass them into the header/student report card dataset
 * - printable components can display lines such as
 *   "This Academic Period Ends: Jul 25, 2026"
 *   "Next Academic Period Begins: Sep 10, 2026"
 *   without doing Dexie lookups
 */

import type {
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  AssessmentStructureItem,
  Attendance,
  Branch,
  Class,
  ClassSubject,
  GradeRule,
  GradingSystem,
  ReportCard,
  ReportCardItem,
  School,
  SchoolBranchSetting,
  Student,
  Parent,
  StudentParent,
  ClassTeacher,
  StudentEnrollment,
  Subject,
  Teacher,
} from "../../../../lib/db/db";

// ======================================================
// MODES
// ======================================================

export type ReportMode =
  | "student-report"
  | "class-reports"
  | "subject-broadsheet"
  | "class-broadsheet";

export type ReportSortMode =
  | "position"
  | "alphabetical"
  | "average"
  | "admission-number";

export type ReportPrintMode =
  | "current-view"
  | "single-student"
  | "whole-class-reports"
  | "subject-broadsheet"
  | "class-broadsheet";

export type ReportOrientation = "portrait" | "landscape";

// ======================================================
// FILTERS
// ======================================================

export interface ReportFiltersState {
  branchId?: string;
  academicStructureId?: string;
  academicPeriodId?: string;
  classId?: string;
  classSubjectId?: string;
  studentId?: string;
  sortMode: ReportSortMode;
}

// ======================================================
// BRANDING / HEADER
// ======================================================

export interface ReportBranding {
  schoolName: string;
  motto?: string;
  logo?: string;
  resolvedLogoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;

  /**
   * Branch/campus identity should be supplied by the report page/engine
   * after it resolves the selected workspace branch.
   */
  branchName?: string;
  branchLabel?: string;
  campusName?: string;
  branchAddress?: string;

  /**
   * Primary report color should be resolved by the report page/engine
   * from branch settings first, then school/app fallbacks.
   */
  primaryColor: string;
  themePrimaryColor?: string;
  reportPrimaryColor?: string;
  accentColor?: string;

  fontFamily?: string;
  reportCardBackgroundImage?: string;
  reportCardWatermark?: string;
  reportCardSignatureImage?: string;

  /**
   * Resolved media object URLs from mediaAssets/mediaBlobs.
   * These should be preferred by printable components over legacy strings.
   */
  resolvedReportCardBackgroundImageUrl?: string;
  resolvedReportCardWatermarkUrl?: string;
  resolvedReportCardSignatureImageUrl?: string;
}

export interface ReportHeaderData {
  school?: School;
  branch?: Branch;
  academicStructure?: AcademicStructure;
  academicPeriod?: AcademicPeriod;
  currentAcademicPeriod?: CurrentAcademicPeriodInfo;
  nextAcademicPeriod?: NextAcademicPeriodInfo;
  classData?: Class;
  schoolBranchSetting?: SchoolBranchSetting;

  /**
   * Explicit workspace-resolved fields.
   * These keep display components pure and prevent ReportHeader,
   * broadsheets, cards or transcripts from guessing the active branch.
   */
  branchId?: string;
  branchName?: string;
  branchLabel?: string;
  campusName?: string;
  branchAddress?: string;

  primaryColor?: string;
  themePrimaryColor?: string;
  reportPrimaryColor?: string;

  resolvedLogoUrl?: string;
  resolvedReportCardBackgroundImageUrl?: string;
  resolvedReportCardWatermarkUrl?: string;
  resolvedReportCardSignatureImageUrl?: string;

  branding: ReportBranding;
}

// ======================================================
// ENGINE DATASET
// ======================================================

export interface ReportEngineDataset {
  schools: School[];
  branches: Branch[];
  schoolBranchSettings: SchoolBranchSetting[];

  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];

  students: Student[];
  teachers: Teacher[];
  parents: Parent[];
  studentParents: StudentParent[];
  classes: Class[];
  subjects: Subject[];
  classSubjects: ClassSubject[];
  studentEnrollments: StudentEnrollment[];
  classTeachers: ClassTeacher[];

  assessmentApplicabilities: AssessmentApplicability[];
  assessmentStructures: AssessmentStructure[];
  assessmentStructureItems: AssessmentStructureItem[];
  assessmentEntries: AssessmentEntry[];
  gradingSystems: GradingSystem[];
  gradeRules: GradeRule[];

  attendance: Attendance[];

  computedResults: import("../../../../lib/db/db").ComputedResult[];
  reportCards: ReportCard[];
  reportCardItems: ReportCardItem[];
}

// ======================================================
// COMPUTED ASSESSMENT STRUCTURES
// ======================================================

export interface ReportAssessmentColumn {
  assessmentStructureItemId: string;
  name: string;
  weight: number;
  maxScore: number;
  order: number;
}

export interface ReportBreakdownItem extends ReportAssessmentColumn {
  score: number;
  weightedScore: number;
}

export interface GradeResolution {
  grade: string;
  remark: string;
  gpa?: number;
  color?: string;
}

export interface AttendanceSummary {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendancePercent: number;
}

/**
 * Computed by the report engine from the selected/current academic period.
 * This allows printable report cards to display the current period closing line
 * before the next academic period opening line.
 */
export interface CurrentAcademicPeriodInfo {
  id?: string;
  academicStructureId?: string;
  name: string;
  type?: string;
  startDate?: string;
  endDate: string;
  order?: number;
  label?: string;
  formattedEndDate?: string;
}

/**
 * Computed by the report engine from the selected/current academic period.
 * This should normally be the next active period in the same academic structure.
 */
export interface NextAcademicPeriodInfo {
  id?: string;
  academicStructureId?: string;
  name: string;
  type?: string;
  startDate: string;
  endDate?: string;
  order?: number;
  label?: string;
  formattedStartDate?: string;
}

// ======================================================
// STUDENT SUBJECT RESULT
// ======================================================

export interface StudentSubjectResult {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  shortName?: string;
  teacherId?: string;
  teacherName?: string;

  assessmentStructureId?: string;
  gradingSystemId?: string;

  breakdown: ReportBreakdownItem[];

  rawTotal: number;
  rawMaxTotal: number;
  weightedTotal: number;
  totalWeight: number;
  percentage: number;

  grade: string;
  remark: string;
  gpa?: number;
  color?: string;

  subjectPosition?: number;
}

// ======================================================
// STUDENT REPORT CARD
// ======================================================

export interface ComputedStudentReport {
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  gender?: string;
  studentPhoto?: string;
  resolvedStudentPhotoUrl?: string;

  classId: string;
  className: string;
  academicStructureId?: string;
  academicPeriodId?: string;
  currentAcademicPeriod?: CurrentAcademicPeriodInfo;
  nextAcademicPeriod?: NextAcademicPeriodInfo;

  subjectResults: StudentSubjectResult[];

  total: number;
  average: number;
  overallGPA?: number;
  overallPosition?: number;

  attendance: AttendanceSummary;

  classTeacherRemark?: string;
  headTeacherRemark?: string;
  classTeacherName?: string;
  headTeacherName?: string;
  principalName?: string;
  parentName?: string;
  guardianName?: string;
  promoted?: boolean;

  branchId?: string;
  branchName?: string;
  branchLabel?: string;
  campusName?: string;
  primaryColor?: string;
  reportPrimaryColor?: string;
}

export interface StudentReportCardDataset {
  header: ReportHeaderData;
  student?: Student;
  report?: ComputedStudentReport;
  currentAcademicPeriod?: CurrentAcademicPeriodInfo;
  nextAcademicPeriod?: NextAcademicPeriodInfo;

  /**
   * Stable timestamp/date set by the report page or report engine when the
   * report dataset is generated. Templates may display this only when the
   * branch template setting enables the generated-date field.
   */
  generatedAt?: string | number | Date;

  classTeacherName?: string;
  headTeacherName?: string;
  principalName?: string;

  parentName?: string;
  guardianName?: string;

  resolvedStudentPhotoUrl?: string;
  resolvedLogoUrl?: string;
  resolvedReportCardBackgroundImageUrl?: string;
  resolvedReportCardWatermarkUrl?: string;
  resolvedReportCardSignatureImageUrl?: string;

  branchId?: string;
  branchName?: string;
  branchLabel?: string;
  campusName?: string;
  branchAddress?: string;
  primaryColor?: string;
  reportPrimaryColor?: string;
}

// ======================================================
// SUBJECT BROADSHEET
// ======================================================

export interface SubjectBroadsheetStudentRow {
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  resolvedStudentPhotoUrl?: string;

  breakdown: ReportBreakdownItem[];
  weightedTotal: number;
  percentage: number;
  grade: string;
  remark: string;
  gpa?: number;
  position?: number;
}

export interface ComputedSubjectBroadsheet {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  teacherName?: string;

  assessmentColumns: ReportAssessmentColumn[];
  students: SubjectBroadsheetStudentRow[];

  highestScore: number;
  lowestScore: number;
  classAverage: number;
}

// ======================================================
// CLASS BROADSHEET
// ======================================================

export interface ClassBroadsheetSubjectCell {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  shortName?: string;
  percentage: number;
  weightedTotal: number;
  grade: string;
  remark: string;
  position?: number;
}

export interface ClassBroadsheetStudentRow {
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  resolvedStudentPhotoUrl?: string;

  subjects: ClassBroadsheetSubjectCell[];

  total: number;
  average: number;
  gpa?: number;
  position?: number;
  attendancePercent: number;
}

export interface ComputedClassBroadsheet {
  classId: string;
  className: string;

  subjectColumns: {
    classSubjectId: string;
    subjectId: string;
    subjectName: string;
    subjectCode?: string;
    shortName?: string;
  }[];

  students: ClassBroadsheetStudentRow[];

  highestAverage: number;
  lowestAverage: number;
  classAverage: number;
}

// ======================================================
// FULL ENGINE OUTPUT
// ======================================================

export interface ReportEngineOutput {
  header: ReportHeaderData;

  studentReport?: StudentReportCardDataset;
  classReports: StudentReportCardDataset[];
  subjectBroadsheet?: ComputedSubjectBroadsheet;
  classBroadsheet?: ComputedClassBroadsheet;

  analytics: ReportAnalyticsData;
  warnings: string[];
}

// ======================================================
// ANALYTICS
// ======================================================

export interface ReportAnalyticsData {
  totalStudents: number;
  totalSubjects: number;
  totalAssessmentItems: number;

  highestAverage: number;
  lowestAverage: number;
  classAverage: number;

  passCount?: number;
  failCount?: number;
}

// ======================================================
// EXPORT / PRINT
// ======================================================

export interface ReportExportConfig {
  title: string;
  printMode: ReportPrintMode;
  orientation: ReportOrientation;
  pageSize: "A4";
  targetId: string;
}

export interface ReportPrintButton {
  label: string;
  mode: ReportPrintMode;
  orientation: ReportOrientation;
}

// ======================================================
// 1) reports/engine/report-types.ts
// Add these fields inside ComputedStudentReport
// ======================================================

/*
  numberOnRoll?: number;
  classSize?: number;
*/

// Example placement:

export interface ComputedStudentReport {
  numberOnRoll?: number;
  classSize?: number;
}
