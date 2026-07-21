/**
 * reports/engine/cumulative-report-engine.ts
 * ---------------------------------------------------------
 * ACADEMIC CUMULATIVE REPORTING ENGINE
 * ---------------------------------------------------------
 *
 * Pure computation layer for cumulative / historical reports.
 *
 * Core rule:
 * StudentReportSnapshot is the historical publishing source of truth.
 *
 * Flow:
 * StudentReportSnapshot
 *   -> normalized historical reports
 *   -> student transcript
 *   -> multi-period report
 *   -> annual broadsheet
 *   -> subject history
 *   -> promotion summary
 *   -> progression timeline
 *
 * Header source upgrade:
 * - the cumulative header now resolves branch, academic level and period
 *   from filters first, then matching snapshots/promotions, then safe dataset fallbacks
 * - this keeps report display components pure and lets transcripts, annual
 *   broadsheets and progression timelines inherit the same context automatically
 * - no report layout, styling or computation tables were changed
 */

import type {
  AcademicPeriod,
  Class,
  Parent,
  Student,
  StudentParent,
  StudentPromotion,
  StudentReportSnapshot,
} from "../../../../lib/db/db";

import type {
  AttendanceSummary,
  ReportHeaderData,
  ReportSortMode,
} from "./report-types";

import type {
  AnnualBroadsheet,
  AnnualBroadsheetStudentRow,
  AnnualBroadsheetStudentSubjectCell,
  CumulativeAcademicYearSummary,
  CumulativeAnalyticsData,
  CumulativeDecision,
  CumulativePeriodSummary,
  CumulativeReportEngineDataset,
  CumulativeReportEngineOutput,
  CumulativeReportFiltersState,
  CumulativeTrendDirection,
  MultiPeriodSubjectRow,
  NormalizedSnapshotSubjectResult,
  NormalizedStudentReportSnapshot,
  PromotionSummary,
  PromotionSummaryRow,
  StudentCumulativeTranscript,
  StudentMultiPeriodReport,
  StudentProgressionStep,
  StudentSubjectHistory,
  SubjectHistoryStudentRow,
  SubjectLongitudinalAnalytics,
} from "./cumulative-report-types";

// ======================================================
// BASIC HELPERS
// ======================================================

export function safeNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

export function average(values: number[]): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;

  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

export function isActive<T extends { isDeleted?: boolean; active?: boolean }>(
  row: T,
): boolean {
  return !row.isDeleted && row.active !== false;
}

export function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function safeString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null) continue;
    const stringValue = String(value).trim();
    if (stringValue) return stringValue;
  }

  return undefined;
}

export function uniqueStrings(
  values: Array<string | undefined | null>,
): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

export function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

export function uniqueNumbers(values: Array<number | undefined>): number[] {
  return Array.from(
    new Set(
      values.filter((value): value is number => {
        return typeof value === "number" && Number.isFinite(value);
      }),
    ),
  );
}

export function normalizeDecision(
  value: unknown,
): CumulativeDecision | undefined {
  if (value === "promote" || value === "repeat" || value === "graduate") {
    return value;
  }

  return undefined;
}

export function computeTrend(values: number[]): CumulativeTrendDirection {
  const valid = values.filter((value) => Number.isFinite(value));

  if (valid.length < 2) return "none";

  const first = valid[0];
  const latest = valid[valid.length - 1];
  const difference = latest - first;

  if (Math.abs(difference) < 1) return "stable";
  return difference > 0 ? "up" : "down";
}

export function sortByStudentName<T extends { studentName: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export function sortByAdmissionNumber<T extends { admissionNumber?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) =>
    (a.admissionNumber || "").localeCompare(b.admissionNumber || ""),
  );
}

export function sortByAverage<T extends { average?: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => safeNumber(b.average) - safeNumber(a.average),
  );
}

export function sortByPosition<
  T extends { position?: number; average?: number },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const positionA = a.position || 999999;
    const positionB = b.position || 999999;

    if (positionA !== positionB) return positionA - positionB;

    return safeNumber(b.average) - safeNumber(a.average);
  });
}

export function applySortMode<
  T extends {
    studentName: string;
    admissionNumber?: string;
    average?: number;
    position?: number;
  },
>(rows: T[], sortMode: ReportSortMode): T[] {
  switch (sortMode) {
    case "alphabetical":
      return sortByStudentName(rows);

    case "admission-number":
      return sortByAdmissionNumber(rows);

    case "average":
      return sortByAverage(rows);

    case "position":
    default:
      return sortByPosition(rows);
  }
}

// ======================================================
// LOOKUPS
// ======================================================

export function buildCumulativeLookups(dataset: CumulativeReportEngineDataset) {
  return {
    schoolMap: new Map(dataset.schools.map((item) => [item.id, item])),
    branchMap: new Map(dataset.branches.map((item) => [item.id, item])),

    schoolBranchSettingMap: new Map(
      dataset.schoolBranchSettings.map((item) => [item.branchId, item]),
    ),

    academicStructureMap: new Map(
      dataset.academicStructures.map((item) => [item.id, item]),
    ),

    academicPeriodMap: new Map(
      dataset.academicPeriods.map((item) => [item.id, item]),
    ),

    studentMap: new Map(dataset.students.map((item) => [item.id, item])),
    classMap: new Map(dataset.classes.map((item) => [item.id, item])),
    subjectMap: new Map(dataset.subjects.map((item) => [item.id, item])),
    teacherMap: new Map(dataset.teachers.map((item) => [item.id, item])),
    parentMap: new Map(dataset.parents.map((item) => [item.id, item])),
  };
}

function isUsableRow<T extends { isDeleted?: boolean; active?: boolean }>(
  row?: T,
): row is T {
  return Boolean(row && !row.isDeleted && row.active !== false);
}

function periodOrderOf(
  dataset: CumulativeReportEngineDataset,
  academicPeriodId?: string,
): number {
  if (!academicPeriodId) return 0;
  const period = dataset.academicPeriods.find(
    (item) => item.id === academicPeriodId,
  );
  return safeNumber(period?.order);
}

function sortSnapshotsByAcademicContext(
  dataset: CumulativeReportEngineDataset,
  snapshots: StudentReportSnapshot[],
): StudentReportSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const yearCompare = (a.academicYear || "").localeCompare(
      b.academicYear || "",
    );
    if (yearCompare !== 0) return yearCompare;

    const periodCompare =
      periodOrderOf(dataset, a.academicPeriodId) -
      periodOrderOf(dataset, b.academicPeriodId);

    if (periodCompare !== 0) return periodCompare;

    return safeString(a.id).localeCompare(safeString(b.id));
  });
}

function getHeaderCandidateSnapshots(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): StudentReportSnapshot[] {
  return dataset.studentReportSnapshots.filter((snapshot) => {
    if (!filters.includeDeletedSnapshots && snapshot.isDeleted) return false;

    if (filters.branchId && snapshot.branchId !== filters.branchId)
      return false;
    if (
      filters.academicStructureId &&
      snapshot.academicStructureId !== filters.academicStructureId
    )
      return false;
    if (
      filters.academicPeriodId &&
      snapshot.academicPeriodId !== filters.academicPeriodId
    )
      return false;
    if (filters.classId && snapshot.classId !== filters.classId) return false;
    if (filters.studentId && snapshot.studentId !== filters.studentId)
      return false;
    if (filters.academicYear && snapshot.academicYear !== filters.academicYear)
      return false;

    return true;
  });
}

function getLatestHeaderSnapshot(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): StudentReportSnapshot | undefined {
  const candidates = getHeaderCandidateSnapshots(dataset, filters);
  return sortSnapshotsByAcademicContext(dataset, candidates).at(-1);
}

function firstActiveById<
  T extends { id?: string; isDeleted?: boolean; active?: boolean },
>(rows: T[], id?: string): T | undefined {
  if (!id) return undefined;
  return rows.find((item) => item.id === id && isUsableRow(item));
}

// ======================================================
// HEADER / BRANDING
// ======================================================

export function buildCumulativeReportHeader(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): ReportHeaderData {
  const latestSnapshot = getLatestHeaderSnapshot(dataset, filters);

  const latestPromotion = dataset.studentPromotions.find((promotion) => {
    if (promotion.isDeleted) return false;
    if (filters.branchId && promotion.branchId !== filters.branchId)
      return false;
    if (filters.studentId && promotion.studentId !== filters.studentId)
      return false;
    return true;
  });

  const resolvedBranchId = firstString(
    filters.branchId,
    latestSnapshot?.branchId,
    latestPromotion?.branchId,
    dataset.branches.length === 1 ? dataset.branches[0]?.id : undefined,
  );

  const branch =
    firstActiveById(dataset.branches, resolvedBranchId) ||
    dataset.branches.find((item) => isUsableRow(item));

  const resolvedSchoolId = firstString(
    branch?.schoolId,
    latestSnapshot?.schoolId,
    dataset.schools.length === 1 ? dataset.schools[0]?.id : undefined,
  );

  const school =
    firstActiveById(dataset.schools, resolvedSchoolId) ||
    dataset.schools.find((item) => isUsableRow(item));

  const resolvedAcademicStructureId = firstString(
    filters.academicStructureId,
    latestSnapshot?.academicStructureId,
    latestPromotion?.toAcademicStructureId,
    latestPromotion?.fromAcademicStructureId,
  );

  const academicStructure =
    firstActiveById(dataset.academicStructures, resolvedAcademicStructureId) ||
    dataset.academicStructures.find((item) => {
      if (!isUsableRow(item)) return false;
      if (branch?.id && item.branchId && item.branchId !== branch.id)
        return false;
      return true;
    });

  const resolvedAcademicPeriodId = firstString(
    filters.academicPeriodId,
    latestSnapshot?.academicPeriodId,
    latestPromotion?.toAcademicPeriodId,
    latestPromotion?.fromAcademicPeriodId,
  );

  const academicPeriod =
    firstActiveById(dataset.academicPeriods, resolvedAcademicPeriodId) ||
    dataset.academicPeriods.find((item) => {
      if (!isUsableRow(item)) return false;
      if (branch?.id && item.branchId && item.branchId !== branch.id)
        return false;
      if (
        academicStructure?.id &&
        item.academicStructureId !== academicStructure.id
      )
        return false;
      return true;
    });

  const resolvedClassId = firstString(
    filters.classId,
    latestSnapshot?.classId,
    latestPromotion?.toClassId,
    latestPromotion?.fromClassId,
  );

  const classData =
    firstActiveById(dataset.classes, resolvedClassId) ||
    dataset.classes.find((item) => {
      if (!isUsableRow(item)) return false;
      if (branch?.id && item.branchId && item.branchId !== branch.id)
        return false;
      return true;
    });

  const schoolBranchSetting =
    dataset.schoolBranchSettings.find(
      (item) => branch?.id && item.branchId === branch.id && !item.isDeleted,
    ) ||
    dataset.schoolBranchSettings.find(
      (item) =>
        resolvedBranchId &&
        item.branchId === resolvedBranchId &&
        !item.isDeleted,
    ) ||
    (dataset.schoolBranchSettings.length === 1
      ? dataset.schoolBranchSettings.find((item) => !item.isDeleted)
      : undefined);

  const branding = {
    schoolName: school?.name || branch?.name || "School Name",
    motto: school?.motto,
    logo: schoolBranchSetting?.logo || branch?.logo || school?.logo,
    address: branch?.address ?? school?.address ?? undefined,
    phone: branch?.phone || school?.phone,
    email: branch?.email || school?.email,
    website: school?.website,
    branchName: branch?.name,
    branchAddress: branch?.address ?? undefined,
    primaryColor: schoolBranchSetting?.primaryColor || "var(--primary-color)",
    fontFamily: schoolBranchSetting?.fontFamily,
    reportCardBackgroundImage: schoolBranchSetting?.reportCardBackgroundImage,
    reportCardWatermark: schoolBranchSetting?.reportCardWatermark,
    reportCardSignatureImage: schoolBranchSetting?.reportCardSignatureImage,
  };

  return {
    school,
    branch,
    academicStructure,
    academicPeriod,
    classData,
    schoolBranchSetting,
    branding,
  };
}

// ======================================================
// SNAPSHOT DATA ACCESS
// ======================================================

function getSnapshotReportData(snapshot: StudentReportSnapshot): any {
  return snapshot.reportData || {};
}

function getSnapshotReport(snapshot: StudentReportSnapshot): any {
  const data = getSnapshotReportData(snapshot);

  return (
    data.report ||
    data.studentReport ||
    data.computedReport ||
    data.computedStudentReport ||
    data
  );
}

function getSnapshotSubjectResults(snapshot: StudentReportSnapshot): any[] {
  const report = getSnapshotReport(snapshot);
  const data = getSnapshotReportData(snapshot);

  const possible =
    report.subjectResults ||
    report.subjects ||
    report.reportItems ||
    data.subjectResults ||
    data.subjects ||
    data.reportItems ||
    [];

  return Array.isArray(possible) ? possible : [];
}

function getSnapshotAttendance(
  snapshot: StudentReportSnapshot,
): AttendanceSummary | undefined {
  const report = getSnapshotReport(snapshot);
  const attendance =
    report.attendance || getSnapshotReportData(snapshot).attendance;

  if (!attendance) return undefined;

  return {
    totalDays: safeNumber(attendance.totalDays),
    presentDays: safeNumber(attendance.presentDays),
    absentDays: safeNumber(attendance.absentDays),
    lateDays: safeNumber(attendance.lateDays),
    attendancePercent: safeNumber(attendance.attendancePercent),
  };
}

// ======================================================
// SNAPSHOT NORMALIZATION
// ======================================================

export function normalizeSnapshotSubjectResult(
  subject: any,
): NormalizedSnapshotSubjectResult {
  const percentage =
    firstNumber(
      subject.percentage,
      subject.average,
      subject.totalPercentage,
      subject.score,
      subject.weightedTotal,
    ) || 0;

  return {
    subjectId: firstString(subject.subjectId),
    classSubjectId: firstString(subject.classSubjectId),

    subjectName:
      firstText(
        subject.subjectName,
        subject.name,
        subject.title,
        subject.shortName,
      ) || "Subject",

    subjectCode: firstText(subject.subjectCode, subject.code),
    teacherName: firstText(subject.teacherName, subject.teacher?.fullName),

    total: firstNumber(subject.total, subject.rawTotal),
    average: firstNumber(subject.average),
    weightedTotal: firstNumber(subject.weightedTotal),
    percentage: round(percentage, 2),

    grade: firstText(subject.grade),
    remark: firstText(subject.remark),
    gpa: firstNumber(subject.gpa),
    position: firstNumber(subject.position, subject.subjectPosition),

    raw: subject,
  };
}

export function normalizeStudentReportSnapshot(
  snapshot: StudentReportSnapshot,
): NormalizedStudentReportSnapshot {
  const report = getSnapshotReport(snapshot);

  const total =
    firstNumber(snapshot.total, report.total, report.cumulativeTotal) || 0;

  const averageScore =
    firstNumber(snapshot.average, report.average, report.cumulativeAverage) ||
    0;

  const subjectResults = getSnapshotSubjectResults(snapshot).map((subject) =>
    normalizeSnapshotSubjectResult(subject),
  );

  return {
    snapshotId: safeString(snapshot.id),

    schoolId: snapshot.schoolId,
    branchId: snapshot.branchId,

    studentId: snapshot.studentId,
    classId: snapshot.classId,
    academicStructureId: snapshot.academicStructureId,
    academicPeriodId: snapshot.academicPeriodId,

    academicYear: snapshot.academicYear,
    term: snapshot.term,

    snapshotType: snapshot.snapshotType,

    total: round(total, 2),
    average: round(averageScore, 2),
    position: firstNumber(
      snapshot.position,
      report.overallPosition,
      report.position,
    ),
    gpa: firstNumber(report.overallGPA, report.gpa),

    recommendation: normalizeDecision(snapshot.recommendation),
    promotedToClassId: snapshot.promotedToClassId,

    attendance: getSnapshotAttendance(snapshot),

    subjectResults,

    reportData: report,
    rawSnapshot: snapshot,
  };
}

// ======================================================
// FILTERING
// ======================================================

export function getFilteredSnapshots(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): StudentReportSnapshot[] {
  return dataset.studentReportSnapshots
    .filter((snapshot) => {
      if (!filters.includeDeletedSnapshots && snapshot.isDeleted) return false;

      if (filters.branchId && snapshot.branchId !== filters.branchId)
        return false;

      if (
        filters.academicStructureId &&
        snapshot.academicStructureId !== filters.academicStructureId
      ) {
        return false;
      }

      if (
        filters.academicPeriodId &&
        snapshot.academicPeriodId !== filters.academicPeriodId
      ) {
        return false;
      }

      if (filters.classId && snapshot.classId !== filters.classId) return false;
      if (filters.studentId && snapshot.studentId !== filters.studentId)
        return false;

      if (
        filters.snapshotType !== "all" &&
        snapshot.snapshotType !== filters.snapshotType
      ) {
        return false;
      }

      if (
        snapshot.snapshotType === "manual" &&
        filters.includeManualSnapshots === false
      ) {
        return false;
      }

      if (
        snapshot.snapshotType === "terminal" &&
        filters.includeTerminalSnapshots === false
      ) {
        return false;
      }

      if (
        snapshot.snapshotType === "promotion" &&
        filters.includePromotionRecords === false
      ) {
        return false;
      }

      if (
        filters.academicYear &&
        snapshot.academicYear !== filters.academicYear
      ) {
        return false;
      }

      if (
        filters.fromAcademicYear &&
        snapshot.academicYear &&
        snapshot.academicYear < filters.fromAcademicYear
      ) {
        return false;
      }

      if (
        filters.toAcademicYear &&
        snapshot.academicYear &&
        snapshot.academicYear > filters.toAcademicYear
      ) {
        return false;
      }

      if (filters.decision && filters.decision !== "all") {
        if (snapshot.recommendation !== filters.decision) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const yearCompare = (a.academicYear || "").localeCompare(
        b.academicYear || "",
      );
      if (yearCompare !== 0) return yearCompare;

      return safeString(a.academicPeriodId).localeCompare(safeString(b.academicPeriodId));
    });
}

export function getFilteredPromotions(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): StudentPromotion[] {
  if (!filters.includePromotionRecords) return [];

  return dataset.studentPromotions.filter((promotion) => {
    if (promotion.isDeleted) return false;

    if (filters.branchId && promotion.branchId !== filters.branchId)
      return false;
    if (filters.studentId && promotion.studentId !== filters.studentId)
      return false;

    if (
      filters.classId &&
      promotion.fromClassId !== filters.classId &&
      promotion.toClassId !== filters.classId
    ) {
      return false;
    }

    if (
      filters.academicStructureId &&
      promotion.fromAcademicStructureId !== filters.academicStructureId &&
      promotion.toAcademicStructureId !== filters.academicStructureId
    ) {
      return false;
    }

    if (
      filters.academicPeriodId &&
      promotion.fromAcademicPeriodId !== filters.academicPeriodId &&
      promotion.toAcademicPeriodId !== filters.academicPeriodId
    ) {
      return false;
    }

    if (filters.decision && filters.decision !== "all") {
      if (promotion.finalDecision !== filters.decision) return false;
    }

    return true;
  });
}

// ======================================================
// PERIOD SUMMARIES
// ======================================================

export function buildPeriodSummary(
  dataset: CumulativeReportEngineDataset,
  snapshot: NormalizedStudentReportSnapshot,
): CumulativePeriodSummary {
  const lookups = buildCumulativeLookups(dataset);

  const academicStructure = lookups.academicStructureMap.get(
    snapshot.academicStructureId,
  );

  const academicPeriod = lookups.academicPeriodMap.get(
    snapshot.academicPeriodId,
  );
  const classData = lookups.classMap.get(snapshot.classId);
  const promotedToClass = snapshot.promotedToClassId
    ? lookups.classMap.get(snapshot.promotedToClassId)
    : undefined;

  return {
    academicStructureId: snapshot.academicStructureId,
    academicStructureName: academicStructure?.name,

    academicPeriodId: snapshot.academicPeriodId,
    academicPeriodName:
      academicPeriod?.name || snapshot.term || "Academic Period",
    academicPeriodOrder: academicPeriod?.order,

    academicYear: snapshot.academicYear,
    term: snapshot.term,

    classId: snapshot.classId,
    className: classData?.name || "Class",

    snapshotId: snapshot.snapshotId,
    snapshotType: snapshot.snapshotType,

    total: snapshot.total,
    average: snapshot.average,
    gpa: snapshot.gpa,
    position: snapshot.position,

    recommendation: snapshot.recommendation,
    promotedToClassId: snapshot.promotedToClassId,
    promotedToClassName: promotedToClass?.name,

    attendance: snapshot.attendance,

    subjectResults: snapshot.subjectResults,
  };
}

export function groupPeriodsByAcademicYear(
  periods: CumulativePeriodSummary[],
): CumulativeAcademicYearSummary[] {
  const map = new Map<string, CumulativePeriodSummary[]>();

  periods.forEach((period) => {
    const year = period.academicYear || "Unspecified Year";

    if (!map.has(year)) {
      map.set(year, []);
    }

    map.get(year)!.push(period);
  });

  return Array.from(map.entries()).map(([academicYear, yearPeriods]) => {
    const sortedPeriods = [...yearPeriods].sort((a, b) => {
      return (
        safeNumber(a.academicPeriodOrder) - safeNumber(b.academicPeriodOrder)
      );
    });

    const averages = sortedPeriods.map((period) => period.average);
    const gpas = sortedPeriods
      .map((period) => period.gpa)
      .filter((value): value is number => value != null);

    const latest = sortedPeriods[sortedPeriods.length - 1];

    return {
      academicYear,
      periods: sortedPeriods,

      totalPeriods: sortedPeriods.length,
      totalSubjects: uniqueStrings(
        sortedPeriods.flatMap((period) =>
          period.subjectResults.map((subject) => subject.subjectId),
        ),
      ).length,

      total: round(
        sortedPeriods.reduce((sum, period) => sum + period.total, 0),
        2,
      ),
      average: round(average(averages), 2),
      gpa: gpas.length ? round(average(gpas), 2) : undefined,

      highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
      lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),

      trend: computeTrend(averages),

      finalDecision: latest?.recommendation,
      recommendation: latest?.recommendation,
    };
  });
}

// ======================================================
// SUBJECT HISTORY
// ======================================================

function subjectKey(subject: NormalizedSnapshotSubjectResult): string {
  return subject.subjectId
    ? `subject-${subject.subjectId}`
    : `name-${subject.subjectName.toLowerCase().trim()}`;
}

export function buildStudentSubjectHistories(
  periods: CumulativePeriodSummary[],
): StudentSubjectHistory[] {
  const map = new Map<string, StudentSubjectHistory>();

  periods.forEach((period) => {
    period.subjectResults.forEach((subject) => {
      const key = subjectKey(subject);

      if (!map.has(key)) {
        map.set(key, {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          periods: [],
          average: 0,
          highest: 0,
          lowest: 0,
          latest: undefined,
          trend: "none",
        });
      }

      map.get(key)!.periods.push({
        academicYear: period.academicYear,
        academicPeriodId: period.academicPeriodId,
        academicPeriodName: period.academicPeriodName,
        classId: period.classId,
        className: period.className,
        percentage: subject.percentage,
        grade: subject.grade,
        remark: subject.remark,
        gpa: subject.gpa,
        position: subject.position,
      });
    });
  });

  return Array.from(map.values())
    .map((history) => {
      const scores = history.periods.map((period) => period.percentage);

      return {
        ...history,
        average: round(average(scores), 2),
        highest: round(scores.length ? Math.max(...scores) : 0, 2),
        lowest: round(scores.length ? Math.min(...scores) : 0, 2),
        latest: scores[scores.length - 1],
        trend: computeTrend(scores),
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

// ======================================================
// PROGRESSION
// ======================================================

export function buildStudentProgression(
  dataset: CumulativeReportEngineDataset,
  studentId: string,
  filters: CumulativeReportFiltersState,
): StudentProgressionStep[] {
  const lookups = buildCumulativeLookups(dataset);

  return getFilteredPromotions(dataset, {
    ...filters,
    studentId,
  })
    .map((promotion) => {
      const fromClass = lookups.classMap.get(promotion.fromClassId);
      const toClass = promotion.toClassId
        ? lookups.classMap.get(promotion.toClassId)
        : undefined;

      const fromStructure = lookups.academicStructureMap.get(
        promotion.fromAcademicStructureId,
      );

      const toStructure = promotion.toAcademicStructureId
        ? lookups.academicStructureMap.get(promotion.toAcademicStructureId)
        : undefined;

      const fromPeriod = lookups.academicPeriodMap.get(
        promotion.fromAcademicPeriodId,
      );

      const toPeriod = promotion.toAcademicPeriodId
        ? lookups.academicPeriodMap.get(promotion.toAcademicPeriodId)
        : undefined;

      return {
        id: `promotion-${promotion.id || `${promotion.studentId}-${promotion.fromClassId}`}`,

        studentId: promotion.studentId,

        fromClassId: promotion.fromClassId,
        fromClassName: fromClass?.name,

        toClassId: promotion.toClassId,
        toClassName: toClass?.name,

        fromAcademicStructureId: promotion.fromAcademicStructureId,
        fromAcademicStructureName: fromStructure?.name,

        toAcademicStructureId: promotion.toAcademicStructureId,
        toAcademicStructureName: toStructure?.name,

        fromAcademicPeriodId: promotion.fromAcademicPeriodId,
        fromAcademicPeriodName: fromPeriod?.name,

        toAcademicPeriodId: promotion.toAcademicPeriodId,
        toAcademicPeriodName: toPeriod?.name,

        average: promotion.average,
        recommendation: promotion.recommendation,
        finalDecision: promotion.finalDecision,

        snapshotId: promotion.snapshotId,
        note: promotion.note,

        dateLabel: fromPeriod?.name || fromStructure?.name,
        rawPromotion: promotion,
      };
    })
    .sort((a, b) => {
      return safeString(a.fromAcademicPeriodId).localeCompare(
        safeString(b.fromAcademicPeriodId),
      );
    });
}

// ======================================================
// STUDENT TRANSCRIPT
// ======================================================

function getStudentPrimaryParentName(
  student: Student | undefined,
  parents: Parent[],
  studentParents: StudentParent[],
): string | undefined {
  if (!student?.id) return student?.parentName;

  const primaryLink =
    studentParents.find(
      (link) =>
        !link.isDeleted &&
        link.studentId === student.id &&
        link.isPrimary === true,
    ) ||
    studentParents.find(
      (link) => !link.isDeleted && link.studentId === student.id,
    );

  const parent = primaryLink
    ? parents.find(
        (item) => item.id === primaryLink.parentId && !item.isDeleted,
      )
    : undefined;

  return parent?.fullName || student.parentName;
}

export function buildStudentTranscript(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
  studentId: string,
): StudentCumulativeTranscript | undefined {
  const lookups = buildCumulativeLookups(dataset);
  const student = lookups.studentMap.get(studentId);

  if (!student || student.isDeleted) return undefined;

  const snapshots = getFilteredSnapshots(dataset, {
    ...filters,
    studentId,
  }).map((snapshot) => normalizeStudentReportSnapshot(snapshot));

  const periods = snapshots.map((snapshot) =>
    buildPeriodSummary(dataset, snapshot),
  );

  const academicYears = groupPeriodsByAcademicYear(periods);
  const subjectHistories = buildStudentSubjectHistories(periods);
  const progression = buildStudentProgression(dataset, studentId, filters);

  const averages = periods.map((period) => period.average);
  const gpas = periods
    .map((period) => period.gpa)
    .filter((value): value is number => value != null);

  const latest = periods[periods.length - 1];
  const currentClass = student.currentClassId
    ? lookups.classMap.get(student.currentClassId)
    : latest?.classId
      ? lookups.classMap.get(latest.classId)
      : undefined;

  return {
    studentId: safeString(student.id),
    studentName: student.fullName,
    admissionNumber: student.admissionNumber,
    gender: student.gender,
    studentPhoto: student.photo,

    currentClassId: currentClass?.id,
    currentClassName: currentClass?.name,

    parentName: getStudentPrimaryParentName(
      student,
      dataset.parents,
      dataset.studentParents,
    ),
    guardianName: getStudentPrimaryParentName(
      student,
      dataset.parents,
      dataset.studentParents,
    ),

    periods,
    academicYears,
    subjectHistories,
    progression,

    totalPeriods: periods.length,
    totalSubjects: subjectHistories.length,

    cumulativeTotal: round(
      periods.reduce((sum, period) => sum + period.total, 0),
      2,
    ),
    cumulativeAverage: round(average(averages), 2),
    cumulativeGPA: gpas.length ? round(average(gpas), 2) : undefined,

    highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
    lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),

    latestAverage: latest?.average,
    latestPosition: latest?.position,
    latestDecision: latest?.recommendation,

    overallTrend: computeTrend(averages),
  };
}

// ======================================================
// MULTI-PERIOD REPORT
// ======================================================

export function buildMultiPeriodSubjectRows(
  periods: CumulativePeriodSummary[],
): MultiPeriodSubjectRow[] {
  const histories = buildStudentSubjectHistories(periods);

  return histories.map((history) => {
    const scores = history.periods.map((period) => period.percentage);
    const latestPeriod = history.periods[history.periods.length - 1];

    return {
      subjectId: history.subjectId,
      subjectName: history.subjectName,
      subjectCode: history.subjectCode,

      periodScores: history.periods.map((period) => ({
        academicPeriodId: period.academicPeriodId,
        academicPeriodName: period.academicPeriodName,
        academicYear: period.academicYear,
        percentage: period.percentage,
        grade: period.grade,
        remark: period.remark,
        position: period.position,
      })),

      average: history.average,
      bestScore: history.highest,
      latestScore: history.latest || 0,

      finalGrade: latestPeriod?.grade,
      finalRemark: latestPeriod?.remark,

      trend: computeTrend(scores),
    };
  });
}

export function buildStudentMultiPeriodReport(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
  header: ReportHeaderData,
): StudentMultiPeriodReport | undefined {
  if (!filters.studentId) return undefined;

  const transcript = buildStudentTranscript(
    dataset,
    filters,
    filters.studentId,
  );

  if (!transcript) return undefined;

  const latest = transcript.periods[transcript.periods.length - 1];

  return {
    header,

    studentId: transcript.studentId,
    studentName: transcript.studentName,
    admissionNumber: transcript.admissionNumber,
    gender: transcript.gender,
    studentPhoto: transcript.studentPhoto,

    classId: latest?.classId || transcript.currentClassId,
    className: latest?.className || transcript.currentClassName,

    periods: transcript.periods,
    subjects: buildMultiPeriodSubjectRows(transcript.periods),

    total: transcript.cumulativeTotal,
    average: transcript.cumulativeAverage,
    gpa: transcript.cumulativeGPA,
    position: latest?.position,

    attendance: latest?.attendance,

    recommendation: transcript.latestDecision,
  };
}

// ======================================================
// ANNUAL BROADSHEET
// ======================================================

export function applyAnnualBroadsheetPositions(
  rows: AnnualBroadsheetStudentRow[],
): void {
  const sorted = [...rows].sort((a, b) => b.average - a.average);

  let lastScore: number | undefined;
  let lastPosition = 0;

  sorted.forEach((row, index) => {
    const position = lastScore === row.average ? lastPosition : index + 1;
    row.position = position;
    lastScore = row.average;
    lastPosition = position;
  });
}

function aggregateStudentSubjectsForBroadsheet(
  periods: CumulativePeriodSummary[],
): AnnualBroadsheetStudentSubjectCell[] {
  const histories = buildStudentSubjectHistories(periods);

  return histories.map((history) => {
    const latest = history.periods[history.periods.length - 1];

    return {
      subjectId: history.subjectId,
      subjectName: history.subjectName,

      periodScores: history.periods.map((period) => ({
        academicPeriodId: period.academicPeriodId,
        academicPeriodName: period.academicPeriodName,
        percentage: period.percentage,
        grade: period.grade,
      })),

      average: history.average,
      grade: latest?.grade,
      remark: latest?.remark,
    };
  });
}

export function buildAnnualBroadsheet(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): AnnualBroadsheet | undefined {
  const lookups = buildCumulativeLookups(dataset);

  const snapshots = getFilteredSnapshots(dataset, filters).map((snapshot) =>
    normalizeStudentReportSnapshot(snapshot),
  );

  const studentIds = uniqueStrings(
    snapshots.map((snapshot) => snapshot.studentId),
  );

  const rows: AnnualBroadsheetStudentRow[] = studentIds
    .map((studentId) => {
      const student = lookups.studentMap.get(studentId);
      const studentSnapshots = snapshots.filter(
        (snapshot) => snapshot.studentId === studentId,
      );

      const periods = studentSnapshots.map((snapshot) =>
        buildPeriodSummary(dataset, snapshot),
      );

      const averages = periods.map((period) => period.average);
      const gpas = periods
        .map((period) => period.gpa)
        .filter((value): value is number => value != null);

      const latest = periods[periods.length - 1];

      const promotion = getFilteredPromotions(dataset, {
        ...filters,
        studentId,
      })[0];

      return {
        studentId,
        studentName: student?.fullName || "Unknown Student",
        admissionNumber: student?.admissionNumber,

        classId: latest?.classId || student?.currentClassId,
        className:
          latest?.className ||
          (student?.currentClassId
            ? lookups.classMap.get(student.currentClassId)?.name
            : undefined),

        subjects: aggregateStudentSubjectsForBroadsheet(periods),

        total: round(
          periods.reduce((sum, period) => sum + period.total, 0),
          2,
        ),
        average: round(average(averages), 2),
        gpa: gpas.length ? round(average(gpas), 2) : undefined,

        position: undefined,

        periodsCount: periods.length,
        subjectsCount: buildStudentSubjectHistories(periods).length,

        recommendation: latest?.recommendation || promotion?.recommendation,
        finalDecision: promotion?.finalDecision,
      };
    })
    .filter((row) => {
      if (filters.classId && row.classId !== filters.classId) return false;
      return true;
    });

  applyAnnualBroadsheetPositions(rows);

  const sortedRows = applySortMode(rows, filters.sortMode);
  const averages = sortedRows.map((row) => row.average);

  const subjectMap = new Map<
    string,
    {
      subjectId?: string;
      subjectName: string;
      subjectCode?: string;
      shortName?: string;
    }
  >();

  sortedRows.forEach((row) => {
    row.subjects.forEach((subject) => {
      const key = subject.subjectId
        ? `subject-${subject.subjectId}`
        : `name-${subject.subjectName.toLowerCase()}`;

      if (!subjectMap.has(key)) {
        const subjectRecord = subject.subjectId
          ? lookups.subjectMap.get(subject.subjectId)
          : undefined;

        subjectMap.set(key, {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          subjectCode: subjectRecord?.code,
          shortName:
            subjectRecord?.code ||
            subject.subjectName.slice(0, 4).toUpperCase(),
        });
      }
    });
  });

  const classData = filters.classId
    ? lookups.classMap.get(filters.classId)
    : undefined;

  const academicStructure = filters.academicStructureId
    ? lookups.academicStructureMap.get(filters.academicStructureId)
    : undefined;

  return {
    classId: filters.classId,
    className: classData?.name,

    academicYear: filters.academicYear,
    academicStructureId: filters.academicStructureId,
    academicStructureName: academicStructure?.name,

    periodIds: uniqueStrings(
      snapshots.map((snapshot) => snapshot.academicPeriodId),
    ),
    periodNames: Array.from(
      new Set(
        snapshots.map((snapshot) => {
          return (
            lookups.academicPeriodMap.get(snapshot.academicPeriodId)?.name ||
            snapshot.term ||
            "Period"
          );
        }),
      ),
    ),

    subjectColumns: Array.from(subjectMap.values()).sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName),
    ),

    students: sortedRows,

    totalStudents: sortedRows.length,
    totalSubjects: subjectMap.size,
    totalPeriods: uniqueStrings(
      snapshots.map((snapshot) => snapshot.academicPeriodId),
    ).length,

    highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
    lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),
    classAverage: round(average(averages), 2),

    promotionCount: sortedRows.filter((row) => row.finalDecision === "promote")
      .length,
    repeatCount: sortedRows.filter((row) => row.finalDecision === "repeat")
      .length,
    graduateCount: sortedRows.filter((row) => row.finalDecision === "graduate")
      .length,
  };
}

// ======================================================
// SUBJECT LONGITUDINAL ANALYTICS
// ======================================================

export function buildSubjectLongitudinalAnalytics(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): SubjectLongitudinalAnalytics | undefined {
  if (!filters.subjectId) return undefined;

  const lookups = buildCumulativeLookups(dataset);
  const subject = lookups.subjectMap.get(filters.subjectId);
  const snapshots = getFilteredSnapshots(dataset, filters).map((snapshot) =>
    normalizeStudentReportSnapshot(snapshot),
  );

  const studentRows: SubjectHistoryStudentRow[] = [];

  uniqueStrings(snapshots.map((snapshot) => snapshot.studentId)).forEach(
    (studentId) => {
      const student = lookups.studentMap.get(studentId);

      const periods: SubjectHistoryStudentRow["periods"] = [];

      snapshots
        .filter((snapshot) => snapshot.studentId === studentId)
        .forEach((snapshot) => {
          const period = buildPeriodSummary(dataset, snapshot);

          const subjectResult = period.subjectResults.find((result) => {
            return result.subjectId === filters.subjectId;
          });

          if (!subjectResult) return;

          periods.push({
            academicYear: period.academicYear,
            academicPeriodId: period.academicPeriodId,
            academicPeriodName: period.academicPeriodName,
            percentage: subjectResult.percentage,
            grade: subjectResult.grade,
            position: subjectResult.position,
          });
        });

      if (!periods.length) return;

      const scores = periods.map((period) => period.percentage);
      const latestPeriod = periods[periods.length - 1];

      studentRows.push({
        studentId,
        studentName: student?.fullName || "Unknown Student",
        admissionNumber: student?.admissionNumber,

        classId: student?.currentClassId,
        className: student?.currentClassId
          ? lookups.classMap.get(student.currentClassId)?.name
          : undefined,

        periods,

        average: round(average(scores), 2),
        highest: round(scores.length ? Math.max(...scores) : 0, 2),
        lowest: round(scores.length ? Math.min(...scores) : 0, 2),
        latest: latestPeriod?.percentage,
        trend: computeTrend(scores),
      });
    },
  );

  const sortedRows = applySortMode(studentRows, filters.sortMode);
  const averages = sortedRows.map((row) => row.average);

  const classData = filters.classId
    ? lookups.classMap.get(filters.classId)
    : undefined;

  return {
    subjectId: subject?.id || filters.subjectId,
    subjectName: subject?.name || "Subject",
    subjectCode: subject?.code,

    classId: filters.classId,
    className: classData?.name,

    academicYear: filters.academicYear,

    students: sortedRows,

    totalStudents: sortedRows.length,
    totalPeriods: uniqueStrings(
      sortedRows.flatMap((row) =>
        row.periods.map((period) => period.academicPeriodId),
      ),
    ).length,

    highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
    lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),
    subjectAverage: round(average(averages), 2),

    improvingCount: sortedRows.filter((row) => row.trend === "up").length,
    decliningCount: sortedRows.filter((row) => row.trend === "down").length,
    stableCount: sortedRows.filter((row) => row.trend === "stable").length,
  };
}

// ======================================================
// PROMOTION SUMMARY
// ======================================================

export function buildPromotionSummary(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): PromotionSummary {
  const lookups = buildCumulativeLookups(dataset);

  const rows: PromotionSummaryRow[] = getFilteredPromotions(
    dataset,
    filters,
  ).map((promotion) => {
    const student = lookups.studentMap.get(promotion.studentId);
    const fromClass = lookups.classMap.get(promotion.fromClassId);
    const toClass = promotion.toClassId
      ? lookups.classMap.get(promotion.toClassId)
      : undefined;

    return {
      studentId: promotion.studentId,
      studentName: student?.fullName || "Unknown Student",
      admissionNumber: student?.admissionNumber,

      fromClassId: promotion.fromClassId,
      fromClassName: fromClass?.name,

      toClassId: promotion.toClassId,
      toClassName: toClass?.name,

      average: promotion.average,

      recommendation: promotion.recommendation,
      finalDecision: promotion.finalDecision,

      snapshotId: promotion.snapshotId,
      note: promotion.note,
    };
  });

  const sortedRows = applySortMode(rows, filters.sortMode);

  const averages = sortedRows
    .map((row) => row.average)
    .filter((value): value is number => value != null);

  const promoteCount = sortedRows.filter(
    (row) => row.finalDecision === "promote",
  ).length;
  const repeatCount = sortedRows.filter(
    (row) => row.finalDecision === "repeat",
  ).length;
  const graduateCount = sortedRows.filter(
    (row) => row.finalDecision === "graduate",
  ).length;

  return {
    rows: sortedRows,

    totalStudents: sortedRows.length,

    promoteCount,
    repeatCount,
    graduateCount,

    promotionRate: sortedRows.length
      ? round((promoteCount / sortedRows.length) * 100, 1)
      : 0,

    repeatRate: sortedRows.length
      ? round((repeatCount / sortedRows.length) * 100, 1)
      : 0,

    graduationRate: sortedRows.length
      ? round((graduateCount / sortedRows.length) * 100, 1)
      : 0,

    averageScore: round(average(averages), 2),
  };
}

// ======================================================
// ANALYTICS
// ======================================================

export function buildCumulativeAnalytics(
  output: {
    studentTranscript?: StudentCumulativeTranscript;
    annualBroadsheet?: AnnualBroadsheet;
    subjectHistory?: SubjectLongitudinalAnalytics;
    promotionSummary?: PromotionSummary;
  },
  snapshots: NormalizedStudentReportSnapshot[],
): CumulativeAnalyticsData {
  const snapshotAverages = snapshots.map((snapshot) => snapshot.average);

  const promotionSummary = output.promotionSummary;

  const studentCount =
    output.annualBroadsheet?.totalStudents ||
    output.subjectHistory?.totalStudents ||
    (output.studentTranscript ? 1 : 0);

  const totalPeriods =
    output.annualBroadsheet?.totalPeriods ||
    output.studentTranscript?.totalPeriods ||
    output.subjectHistory?.totalPeriods ||
    uniqueStrings(snapshots.map((snapshot) => snapshot.academicPeriodId))
      .length;

  const totalSubjects =
    output.annualBroadsheet?.totalSubjects ||
    output.studentTranscript?.totalSubjects ||
    uniqueStrings(
      snapshots.flatMap((snapshot) =>
        snapshot.subjectResults.map((subject) => subject.subjectId),
      ),
    ).length;

  const promotionCount =
    promotionSummary?.promoteCount ||
    output.annualBroadsheet?.promotionCount ||
    0;

  const repeatCount =
    promotionSummary?.repeatCount || output.annualBroadsheet?.repeatCount || 0;

  const graduateCount =
    promotionSummary?.graduateCount ||
    output.annualBroadsheet?.graduateCount ||
    0;

  const decisionTotal = promotionCount + repeatCount + graduateCount;

  return {
    totalStudents: studentCount,
    totalSnapshots: snapshots.length,
    totalPeriods,
    totalSubjects,

    cumulativeAverage:
      output.studentTranscript?.cumulativeAverage ||
      output.annualBroadsheet?.classAverage ||
      output.subjectHistory?.subjectAverage ||
      round(average(snapshotAverages), 2),

    highestAverage:
      output.studentTranscript?.highestAverage ||
      output.annualBroadsheet?.highestAverage ||
      output.subjectHistory?.highestAverage ||
      round(snapshotAverages.length ? Math.max(...snapshotAverages) : 0, 2),

    lowestAverage:
      output.studentTranscript?.lowestAverage ||
      output.annualBroadsheet?.lowestAverage ||
      output.subjectHistory?.lowestAverage ||
      round(snapshotAverages.length ? Math.min(...snapshotAverages) : 0, 2),

    promotionCount,
    repeatCount,
    graduateCount,

    promotionRate: decisionTotal
      ? round((promotionCount / decisionTotal) * 100, 1)
      : 0,
    repeatRate: decisionTotal
      ? round((repeatCount / decisionTotal) * 100, 1)
      : 0,
    graduationRate: decisionTotal
      ? round((graduateCount / decisionTotal) * 100, 1)
      : 0,

    improvingCount:
      output.subjectHistory?.improvingCount ||
      output.studentTranscript?.subjectHistories.filter(
        (item) => item.trend === "up",
      ).length ||
      0,

    decliningCount:
      output.subjectHistory?.decliningCount ||
      output.studentTranscript?.subjectHistories.filter(
        (item) => item.trend === "down",
      ).length ||
      0,

    stableCount:
      output.subjectHistory?.stableCount ||
      output.studentTranscript?.subjectHistories.filter(
        (item) => item.trend === "stable",
      ).length ||
      0,
  };
}

// ======================================================
// WARNINGS
// ======================================================

export function buildCumulativeWarnings(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
  snapshots: NormalizedStudentReportSnapshot[],
): string[] {
  const warnings: string[] = [];

  if (!filters.branchId) {
    warnings.push("No active branch is selected.");
  }

  if (!snapshots.length) {
    warnings.push(
      "No student report snapshots were found for the selected filters.",
    );
  }

  if (filters.mode === "student-transcript" && !filters.studentId) {
    warnings.push("Select a student to generate a cumulative transcript.");
  }

  if (filters.mode === "multi-period-report" && !filters.studentId) {
    warnings.push("Select a student to generate a multi-period report.");
  }

  if (filters.mode === "annual-broadsheet" && !filters.classId) {
    warnings.push(
      "Select a class to generate an annual cumulative broadsheet.",
    );
  }

  if (filters.mode === "subject-history" && !filters.subjectId) {
    warnings.push(
      "Select a subject to generate longitudinal subject analytics.",
    );
  }

  const snapshotsWithoutSubjects = snapshots.filter(
    (snapshot) => !snapshot.subjectResults.length,
  );

  if (snapshotsWithoutSubjects.length) {
    warnings.push(
      `${snapshotsWithoutSubjects.length} snapshot(s) do not contain subject result details.`,
    );
  }

  const promotionRecords = getFilteredPromotions(dataset, filters);

  if (
    filters.includePromotionRecords &&
    !promotionRecords.length &&
    (filters.mode === "promotion-summary" ||
      filters.mode === "progression-timeline")
  ) {
    warnings.push("No promotion records were found for the selected filters.");
  }

  return warnings;
}

// ======================================================
// CUMULATIVE TRANSCRIPT TEMPLATE DATASET
// ======================================================
//
// This adapter is the bridge between the cumulative computation engine and
// reports/cumulative-transcript-templates/*.tsx. It keeps templates away from
// raw Dexie rows and gives them a stable, safe shape that matches the existing
// StudentReportSnapshot + StudentPromotion source of truth.

export type CumulativeTranscriptTemplateDataset = {
  header: ReportHeaderData;
  transcript?: StudentCumulativeTranscript;
  generatedAt: string;
  student?: {
    studentId: string;
    studentName: string;
    admissionNumber?: string;
    gender?: string;
    currentClassName?: string;
    studentPhoto?: string;
    parentName?: string;
    guardianName?: string;
  };
  summary?: {
    totalPeriods: number;
    totalSubjects: number;
    cumulativeTotal: number;
    cumulativeAverage: number;
    cumulativeGPA?: number;
    cumulativePosition?: number;
    highestAverage: number;
    lowestAverage: number;
    latestAverage?: number;
    latestPosition?: number;
    latestDecision?: CumulativeDecision;
    overallTrend: CumulativeTrendDirection;
  };
};

export function buildCumulativeTranscriptTemplateDataset(args: {
  header: ReportHeaderData;
  transcript?: StudentCumulativeTranscript;
  generatedAt?: string | number | Date;
}): CumulativeTranscriptTemplateDataset {
  const generatedDate = args.generatedAt
    ? new Date(args.generatedAt)
    : new Date();
  const generatedAt = Number.isNaN(generatedDate.getTime())
    ? new Date().toISOString()
    : generatedDate.toISOString();

  const transcript = args.transcript;

  return {
    header: args.header,
    transcript,
    generatedAt,
    student: transcript
      ? {
          studentId: transcript.studentId,
          studentName: transcript.studentName,
          admissionNumber: transcript.admissionNumber,
          gender: transcript.gender,
          currentClassName: transcript.currentClassName,
          studentPhoto: transcript.studentPhoto,
          parentName: transcript.parentName,
          guardianName: transcript.guardianName,
        }
      : undefined,
    summary: transcript
      ? {
          totalPeriods: transcript.totalPeriods,
          totalSubjects: transcript.totalSubjects,
          cumulativeTotal: transcript.cumulativeTotal,
          cumulativeAverage: transcript.cumulativeAverage,
          cumulativeGPA: transcript.cumulativeGPA,
          cumulativePosition: transcript.latestPosition,
          highestAverage: transcript.highestAverage,
          lowestAverage: transcript.lowestAverage,
          latestAverage: transcript.latestAverage,
          latestPosition: transcript.latestPosition,
          latestDecision: transcript.latestDecision,
          overallTrend: transcript.overallTrend,
        }
      : undefined,
  };
}

// ======================================================
// MAIN ENGINE OUTPUT
// ======================================================

export function buildCumulativeReportEngineOutput(
  dataset: CumulativeReportEngineDataset,
  filters: CumulativeReportFiltersState,
): CumulativeReportEngineOutput {
  const header = buildCumulativeReportHeader(dataset, filters);

  const normalizedSnapshots = getFilteredSnapshots(dataset, filters).map(
    (snapshot) => normalizeStudentReportSnapshot(snapshot),
  );

  const studentTranscript =
    filters.studentId && filters.mode === "student-transcript"
      ? buildStudentTranscript(dataset, filters, filters.studentId)
      : undefined;

  const multiPeriodReport =
    filters.mode === "multi-period-report"
      ? buildStudentMultiPeriodReport(dataset, filters, header)
      : undefined;

  const annualBroadsheet =
    filters.mode === "annual-broadsheet"
      ? buildAnnualBroadsheet(dataset, filters)
      : undefined;

  const subjectHistory =
    filters.mode === "subject-history"
      ? buildSubjectLongitudinalAnalytics(dataset, filters)
      : undefined;

  const promotionSummary =
    filters.mode === "promotion-summary"
      ? buildPromotionSummary(dataset, filters)
      : buildPromotionSummary(dataset, {
          ...filters,
          decision: "all",
        });

  const progressionTimeline =
    filters.mode === "progression-timeline" && filters.studentId
      ? buildStudentProgression(dataset, filters.studentId, filters)
      : undefined;

  const analytics = buildCumulativeAnalytics(
    {
      studentTranscript,
      annualBroadsheet,
      subjectHistory,
      promotionSummary,
    },
    normalizedSnapshots,
  );

  const warnings = buildCumulativeWarnings(
    dataset,
    filters,
    normalizedSnapshots,
  );

  const cumulativeTranscriptDataset = buildCumulativeTranscriptTemplateDataset({
    header,
    transcript: studentTranscript,
  });

  return {
    header,

    studentTranscript,
    cumulativeTranscriptDataset,
    multiPeriodReport,
    annualBroadsheet,
    subjectHistory,
    promotionSummary,
    progressionTimeline,

    analytics,
    warnings,
  } as CumulativeReportEngineOutput & {
    cumulativeTranscriptDataset: CumulativeTranscriptTemplateDataset;
  };
}
