/**
 * reports/engine/cumulative-report-types.ts
 * ---------------------------------------------------------
 * ACADEMIC CUMULATIVE REPORTING TYPE SYSTEM
 * ---------------------------------------------------------
 *
 * Shared contract for the cumulative academic records engine.
 *
 * This file is intentionally type-only:
 * - no React
 * - no Dexie calls
 * - no UI logic
 *
 * The cumulative engine is snapshot-driven. It reads historical
 * StudentReportSnapshot records and StudentPromotion records, then
 * projects them into transcripts, annual broadsheets, promotion
 * summaries, progression timelines and historical analytics.
 */

import type {
  AcademicPeriod,
  AcademicStructure,
  Branch,
  Class,
  Parent,
  School,
  SchoolBranchSetting,
  Student,
  StudentParent,
  StudentPromotion,
  StudentReportSnapshot,
  Subject,
  Teacher,
} from "../../../../lib/db/db";

import type {
  AttendanceSummary,
  ComputedStudentReport,
  ReportHeaderData,
  ReportOrientation,
  ReportSortMode,
  StudentSubjectResult,
} from "./report-types";

// ======================================================
// MODES
// ======================================================

export type CumulativeReportMode =
  | "student-transcript"
  | "multi-period-report"
  | "annual-broadsheet"
  | "subject-history"
  | "promotion-summary"
  | "progression-timeline";

export type CumulativeSnapshotType =
  | "all"
  | "terminal"
  | "promotion"
  | "manual";

export type CumulativeDecision = "promote" | "repeat" | "graduate";

export type CumulativeTrendDirection = "up" | "down" | "stable" | "none";

export type CumulativePrintMode =
  | "current-view"
  | "student-transcript"
  | "multi-period-report"
  | "annual-broadsheet"
  | "promotion-summary"
  | "progression-timeline";

export type CumulativeGroupingMode =
  | "academic-year"
  | "academic-structure"
  | "class"
  | "period";

export type CumulativeSubjectAggregationMode =
  | "average"
  | "latest"
  | "best"
  | "weighted-average";

// ======================================================
// FILTERS
// ======================================================

export interface CumulativeReportFiltersState {
  branchId?: string;

  academicStructureId?: string;
  academicPeriodId?: string;

  fromAcademicPeriodId?: string;
  toAcademicPeriodId?: string;

  academicYear?: string;
  fromAcademicYear?: string;
  toAcademicYear?: string;

  classId?: string;
  studentId?: string;
  subjectId?: string;

  snapshotType: CumulativeSnapshotType;
  decision?: CumulativeDecision | "all";

  mode: CumulativeReportMode;
  sortMode: ReportSortMode;

  groupingMode: CumulativeGroupingMode;
  subjectAggregationMode: CumulativeSubjectAggregationMode;

  includePromotionRecords: boolean;
  includeManualSnapshots: boolean;
  includeTerminalSnapshots: boolean;
  includeDeletedSnapshots?: boolean;
}

// ======================================================
// ENGINE DATASET
// ======================================================

export interface CumulativeReportEngineDataset {
  schools: School[];
  branches: Branch[];
  schoolBranchSettings: SchoolBranchSetting[];

  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];

  students: Student[];
  parents: Parent[];
  studentParents: StudentParent[];

  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];

  studentReportSnapshots: StudentReportSnapshot[];
  studentPromotions: StudentPromotion[];
}

// ======================================================
// SNAPSHOT NORMALIZATION
// ======================================================

export interface NormalizedSnapshotSubjectResult {
  subjectId?: string;
  classSubjectId?: string;

  subjectName: string;
  subjectCode?: string;
  teacherName?: string;

  total?: number;
  average?: number;
  weightedTotal?: number;
  percentage: number;

  grade?: string;
  remark?: string;
  gpa?: number;
  position?: number;

  raw?: StudentSubjectResult | Record<string, unknown>;
}

export interface NormalizedStudentReportSnapshot {
  snapshotId: string;

  schoolId: string;
  branchId: string;

  studentId: string;
  classId: string;
  academicStructureId: string;
  academicPeriodId: string;

  academicYear?: string;
  term?: string;

  snapshotType: StudentReportSnapshot["snapshotType"];

  total: number;
  average: number;
  position?: number;
  gpa?: number;

  recommendation?: CumulativeDecision;
  promotedToClassId?: string;

  attendance?: AttendanceSummary;

  subjectResults: NormalizedSnapshotSubjectResult[];

  reportData?: ComputedStudentReport | Record<string, unknown>;
  rawSnapshot: StudentReportSnapshot;
}

// ======================================================
// PERIOD / YEAR SUMMARIES
// ======================================================

export interface CumulativePeriodSummary {
  academicStructureId?: string;
  academicStructureName?: string;

  academicPeriodId: string;
  academicPeriodName: string;
  academicPeriodOrder?: number;

  academicYear?: string;
  term?: string;

  classId: string;
  className: string;

  snapshotId?: string;
  snapshotType?: StudentReportSnapshot["snapshotType"];

  total: number;
  average: number;
  gpa?: number;
  position?: number;

  recommendation?: CumulativeDecision;
  promotedToClassId?: string;
  promotedToClassName?: string;

  attendance?: AttendanceSummary;

  subjectResults: NormalizedSnapshotSubjectResult[];
}

export interface CumulativeAcademicYearSummary {
  academicYear: string;

  periods: CumulativePeriodSummary[];

  totalPeriods: number;
  totalSubjects: number;

  total: number;
  average: number;
  gpa?: number;

  highestAverage: number;
  lowestAverage: number;

  trend: CumulativeTrendDirection;

  finalDecision?: CumulativeDecision;
  recommendation?: CumulativeDecision;
}

// ======================================================
// STUDENT TRANSCRIPT
// ======================================================

export interface StudentProgressionStep {
  id: string;

  studentId: string;

  fromClassId?: string;
  fromClassName?: string;

  toClassId?: string;
  toClassName?: string;

  fromAcademicStructureId?: string;
  fromAcademicStructureName?: string;

  toAcademicStructureId?: string;
  toAcademicStructureName?: string;

  fromAcademicPeriodId?: string;
  fromAcademicPeriodName?: string;

  toAcademicPeriodId?: string;
  toAcademicPeriodName?: string;

  average?: number;
  recommendation?: CumulativeDecision;
  finalDecision?: CumulativeDecision;

  snapshotId?: string;
  note?: string;

  dateLabel?: string;
  rawPromotion?: StudentPromotion;
}

export interface StudentSubjectHistory {
  subjectId?: string;
  subjectName: string;
  subjectCode?: string;

  periods: {
    academicYear?: string;
    academicPeriodId: string;
    academicPeriodName: string;
    classId: string;
    className: string;
    percentage: number;
    grade?: string;
    remark?: string;
    gpa?: number;
    position?: number;
  }[];

  average: number;
  highest: number;
  lowest: number;
  latest?: number;

  trend: CumulativeTrendDirection;
}

export interface StudentCumulativeTranscript {
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  gender?: string;
  studentPhoto?: string;

  currentClassId?: string;
  currentClassName?: string;

  parentName?: string;
  guardianName?: string;

  periods: CumulativePeriodSummary[];
  academicYears: CumulativeAcademicYearSummary[];

  subjectHistories: StudentSubjectHistory[];
  progression: StudentProgressionStep[];

  totalPeriods: number;
  totalSubjects: number;

  cumulativeTotal: number;
  cumulativeAverage: number;
  cumulativeGPA?: number;

  highestAverage: number;
  lowestAverage: number;

  latestAverage?: number;
  latestPosition?: number;
  latestDecision?: CumulativeDecision;

  overallTrend: CumulativeTrendDirection;
}

// ======================================================
// MULTI-PERIOD REPORT
// ======================================================

export interface MultiPeriodSubjectRow {
  subjectId?: string;
  subjectName: string;
  subjectCode?: string;

  periodScores: {
    academicPeriodId: string;
    academicPeriodName: string;
    academicYear?: string;
    percentage: number;
    grade?: string;
    remark?: string;
    position?: number;
  }[];

  average: number;
  bestScore: number;
  latestScore: number;

  finalGrade?: string;
  finalRemark?: string;

  trend: CumulativeTrendDirection;
}

export interface StudentMultiPeriodReport {
  header: ReportHeaderData;

  studentId: string;
  studentName: string;
  admissionNumber?: string;
  gender?: string;
  studentPhoto?: string;

  classId?: string;
  className?: string;

  periods: CumulativePeriodSummary[];
  subjects: MultiPeriodSubjectRow[];

  total: number;
  average: number;
  gpa?: number;
  position?: number;

  attendance?: AttendanceSummary;

  recommendation?: CumulativeDecision;
}

// ======================================================
// ANNUAL / CUMULATIVE BROADSHEET
// ======================================================

export interface AnnualBroadsheetSubjectColumn {
  subjectId?: string;
  subjectName: string;
  subjectCode?: string;
  shortName?: string;
}

export interface AnnualBroadsheetStudentSubjectCell {
  subjectId?: string;
  subjectName: string;

  periodScores: {
    academicPeriodId: string;
    academicPeriodName: string;
    percentage: number;
    grade?: string;
  }[];

  average: number;
  grade?: string;
  remark?: string;
}

export interface AnnualBroadsheetStudentRow {
  studentId: string;
  studentName: string;
  admissionNumber?: string;

  classId?: string;
  className?: string;

  subjects: AnnualBroadsheetStudentSubjectCell[];

  total: number;
  average: number;
  gpa?: number;

  position?: number;

  periodsCount: number;
  subjectsCount: number;

  recommendation?: CumulativeDecision;
  finalDecision?: CumulativeDecision;
}

export interface AnnualBroadsheet {
  classId?: string;
  className?: string;

  academicYear?: string;
  academicStructureId?: string;
  academicStructureName?: string;

  periodIds: string[];
  periodNames: string[];

  subjectColumns: AnnualBroadsheetSubjectColumn[];
  students: AnnualBroadsheetStudentRow[];

  totalStudents: number;
  totalSubjects: number;
  totalPeriods: number;

  highestAverage: number;
  lowestAverage: number;
  classAverage: number;

  promotionCount: number;
  repeatCount: number;
  graduateCount: number;
}

// ======================================================
// SUBJECT HISTORY / LONGITUDINAL ANALYTICS
// ======================================================

export interface SubjectHistoryStudentRow {
  studentId: string;
  studentName: string;
  admissionNumber?: string;

  classId?: string;
  className?: string;

  periods: {
    academicYear?: string;
    academicPeriodId: string;
    academicPeriodName: string;
    percentage: number;
    grade?: string;
    position?: number;
  }[];

  average: number;
  highest: number;
  lowest: number;
  latest?: number;
  trend: CumulativeTrendDirection;
}

export interface SubjectLongitudinalAnalytics {
  subjectId?: string;
  subjectName: string;
  subjectCode?: string;

  classId?: string;
  className?: string;

  academicYear?: string;

  students: SubjectHistoryStudentRow[];

  totalStudents: number;
  totalPeriods: number;

  highestAverage: number;
  lowestAverage: number;
  subjectAverage: number;

  improvingCount: number;
  decliningCount: number;
  stableCount: number;
}

// ======================================================
// PROMOTION SUMMARY
// ======================================================

export interface PromotionSummaryRow {
  studentId: string;
  studentName: string;
  admissionNumber?: string;

  fromClassId?: string;
  fromClassName?: string;

  toClassId?: string;
  toClassName?: string;

  average?: number;

  recommendation?: CumulativeDecision;
  finalDecision: CumulativeDecision;

  snapshotId?: string;
  note?: string;
}

export interface PromotionSummary {
  rows: PromotionSummaryRow[];

  totalStudents: number;

  promoteCount: number;
  repeatCount: number;
  graduateCount: number;

  promotionRate: number;
  repeatRate: number;
  graduationRate: number;

  averageScore: number;
}

// ======================================================
// ANALYTICS
// ======================================================

export interface CumulativeAnalyticsData {
  totalStudents: number;
  totalSnapshots: number;
  totalPeriods: number;
  totalSubjects: number;

  cumulativeAverage: number;
  highestAverage: number;
  lowestAverage: number;

  promotionCount: number;
  repeatCount: number;
  graduateCount: number;

  promotionRate: number;
  repeatRate: number;
  graduationRate: number;

  improvingCount: number;
  decliningCount: number;
  stableCount: number;
}

// ======================================================
// OUTPUT
// ======================================================

export interface CumulativeReportEngineOutput {
  header: ReportHeaderData;

  studentTranscript?: StudentCumulativeTranscript;
  multiPeriodReport?: StudentMultiPeriodReport;
  annualBroadsheet?: AnnualBroadsheet;
  subjectHistory?: SubjectLongitudinalAnalytics;
  promotionSummary?: PromotionSummary;
  progressionTimeline?: StudentProgressionStep[];

  analytics: CumulativeAnalyticsData;
  warnings: string[];
}

// ======================================================
// EXPORT / PRINT
// ======================================================

export interface CumulativeReportExportConfig {
  title: string;
  targetId: string;
  printMode: CumulativePrintMode;
  orientation: ReportOrientation;
  pageSize: "A4" | "Letter";
}

export interface CumulativeReportPrintButton {
  label: string;
  mode: CumulativePrintMode;
  orientation: ReportOrientation;
}
