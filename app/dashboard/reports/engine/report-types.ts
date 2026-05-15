/**
 * reports/engine/report-types.ts
 * ---------------------------------------------------------
 * ENTERPRISE REPORTING TYPE SYSTEM
 * ---------------------------------------------------------
 *
 * This file is the shared contract for the whole reporting
 * module. The engine, report page, filters, cards,
 * broadsheets, analytics and export tools all depend on it.
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
} from "../../../lib/db";

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
  branchId?: number;
  academicStructureId?: number;
  academicPeriodId?: number;
  classId?: number;
  classSubjectId?: number;
  studentId?: number;
  sortMode: ReportSortMode;
}

// ======================================================
// BRANDING / HEADER
// ======================================================

export interface ReportBranding {
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

export interface ReportHeaderData {
  school?: School;
  branch?: Branch;
  academicStructure?: AcademicStructure;
  academicPeriod?: AcademicPeriod;
  classData?: Class;
  schoolBranchSetting?: SchoolBranchSetting;
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

  computedResults: import("../../../lib/db").ComputedResult[];
  reportCards: ReportCard[];
  reportCardItems: ReportCardItem[];
}

// ======================================================
// COMPUTED ASSESSMENT STRUCTURES
// ======================================================

export interface ReportAssessmentColumn {
  assessmentStructureItemId: number;
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

// ======================================================
// STUDENT SUBJECT RESULT
// ======================================================

export interface StudentSubjectResult {
  classSubjectId: number;
  subjectId: number;
  subjectName: string;
  subjectCode?: string;
  shortName?: string;
  teacherId?: number;
  teacherName?: string;

  assessmentStructureId?: number;
  gradingSystemId?: number;

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
  studentId: number;
  studentName: string;
  admissionNumber?: string;
  gender?: string;
  studentPhoto?: string;

  classId: number;
  className: string;
  academicStructureId?: number;
  academicPeriodId?: number;

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
}

export interface StudentReportCardDataset {
  header: ReportHeaderData;
  student?: Student;
  report?: ComputedStudentReport;

  classTeacherName?: string;
  headTeacherName?: string;
  principalName?: string;

  parentName?: string;
  guardianName?: string;
}

// ======================================================
// SUBJECT BROADSHEET
// ======================================================

export interface SubjectBroadsheetStudentRow {
  studentId: number;
  studentName: string;
  admissionNumber?: string;

  breakdown: ReportBreakdownItem[];
  weightedTotal: number;
  percentage: number;
  grade: string;
  remark: string;
  gpa?: number;
  position?: number;
}

export interface ComputedSubjectBroadsheet {
  classSubjectId: number;
  classId: number;
  className: string;
  subjectId: number;
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
  classSubjectId: number;
  subjectId: number;
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
  studentId: number;
  studentName: string;
  admissionNumber?: string;

  subjects: ClassBroadsheetSubjectCell[];

  total: number;
  average: number;
  gpa?: number;
  position?: number;
  attendancePercent: number;
}

export interface ComputedClassBroadsheet {
  classId: number;
  className: string;

  subjectColumns: {
    classSubjectId: number;
    subjectId: number;
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
