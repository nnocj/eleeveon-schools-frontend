/**
 * reports/engine/report-engine.ts
 * ---------------------------------------------------------
 * ENTERPRISE ACADEMIC REPORT ENGINE
 * ---------------------------------------------------------
 *
 * This is the pure computation layer for the reporting module.
 * It contains no React and no UI rendering.
 *
 * Core rule:
 * ClassSubject is the academic execution source of truth.
 *
 * Flow:
 * ClassSubject
 *   -> AssessmentApplicability
 *   -> AssessmentStructure
 *   -> AssessmentStructureItems
 *   -> GradingSystem
 *   -> GradeRules
 *   -> AssessmentEntries
 *   -> Student Reports / Broadsheets / Analytics
 */

import type {
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructureItem,
  Attendance,
  ClassSubject,
  GradeRule,
  Student,
  StudentParent,
 
  StudentEnrollment,
} from "../../../../lib/db";

import type {
  AttendanceSummary,
  ClassBroadsheetStudentRow,
  ClassBroadsheetSubjectCell,
  ComputedClassBroadsheet,
  ComputedStudentReport,
  ComputedSubjectBroadsheet,
  GradeResolution,
  ReportAssessmentColumn,
  ReportBreakdownItem,
  ReportEngineDataset,
  ReportEngineOutput,
  ReportFiltersState,
  ReportHeaderData,
  StudentReportCardDataset,
  StudentSubjectResult,
  SubjectBroadsheetStudentRow,
} from "./report-types";

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
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

export function isActive<T extends { isDeleted?: boolean; active?: boolean }>(
  row: T
): boolean {
  return !row.isDeleted && row.active !== false;
}

export function byName<T extends { name?: string }>(a: T, b: T): number {
  return (a.name || "").localeCompare(b.name || "");
}

export function byStudentName(
  a: { studentName: string },
  b: { studentName: string }
): number {
  return a.studentName.localeCompare(b.studentName);
}

export function byAdmissionNumber(
  a: { admissionNumber?: string },
  b: { admissionNumber?: string }
): number {
  return (a.admissionNumber || "").localeCompare(b.admissionNumber || "");
}

// ======================================================
// LOOKUPS
// ======================================================

export function buildLookups(dataset: ReportEngineDataset) {
  return {
    schoolMap: new Map(dataset.schools.map(item => [item.id, item])),
    branchMap: new Map(dataset.branches.map(item => [item.id, item])),
    schoolBranchSettingsMap: new Map(
      (dataset.schoolBranchSettings || []).map(item => [item.branchId, item])
    ),

    academicStructureMap: new Map(
      dataset.academicStructures.map(item => [item.id, item])
    ),
    academicPeriodMap: new Map(dataset.academicPeriods.map(item => [item.id, item])),

    studentMap: new Map(dataset.students.map(item => [item.id, item])),
    teacherMap: new Map(dataset.teachers.map(item => [item.id, item])),
    classMap: new Map(dataset.classes.map(item => [item.id, item])),
    subjectMap: new Map(dataset.subjects.map(item => [item.id, item])),
    classSubjectMap: new Map(dataset.classSubjects.map(item => [item.id, item])),
    gradingSystemMap: new Map(dataset.gradingSystems.map(item => [item.id, item])),
    assessmentStructureMap: new Map(
      dataset.assessmentStructures.map(item => [item.id, item])
    ),
  };
}

// ======================================================
// HEADER / BRANDING
// ======================================================

export function buildReportHeader(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): ReportHeaderData {
  const school = dataset.schools.find(item => !item.isDeleted);

  const branch = dataset.branches.find(
    item => item.id === filters.branchId && !item.isDeleted
  );

  const schoolBranchSetting = (dataset.schoolBranchSettings || []).find(
  item => item.branchId === filters.branchId && !item.isDeleted
);

  const academicStructure = dataset.academicStructures.find(
    item => item.id === filters.academicStructureId && !item.isDeleted
  );

  const academicPeriod = dataset.academicPeriods.find(
    item => item.id === filters.academicPeriodId && !item.isDeleted
  );

  const classData = dataset.classes.find(
    item => item.id === filters.classId && !item.isDeleted
  );

  const branding = {
    schoolName:
       school?.name || branch?.name || "School Name",
    motto: school?.motto,
    logo: schoolBranchSetting?.logo || branch?.logo || school?.logo,
    address: branch?.address || school?.address,
    phone: branch?.phone || school?.phone,
    email: branch?.email || school?.email,
    website: school?.website,
    branchName: branch?.name,
    branchAddress: branch?.address,
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
// FILTERING
// ======================================================

export function getClassSubjectsForReport(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): ClassSubject[] {
  return dataset.classSubjects
    .filter(item => {
      if (!isActive(item)) return false;
      if (filters.branchId && item.branchId !== filters.branchId) return false;
      if (filters.classId && item.classId !== filters.classId) return false;
      if (
        filters.academicStructureId &&
        item.academicStructureId !== filters.academicStructureId
      ) {
        return false;
      }
      if (
        filters.academicPeriodId &&
        item.academicPeriodId !== filters.academicPeriodId
      ) {
        return false;
      }
      if (filters.classSubjectId && item.id !== filters.classSubjectId) return false;
      return true;
    })
    .sort((a, b) => a.subjectId - b.subjectId);
}

export function getActiveEnrollmentsForReport(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): StudentEnrollment[] {
  return dataset.studentEnrollments.filter(item => {
    if (item.isDeleted) return false;
    if (item.status !== "active") return false;
    if (filters.branchId && item.branchId !== filters.branchId) return false;
    if (filters.classId && item.classId !== filters.classId) return false;
    if (
      filters.academicStructureId &&
      item.academicStructureId !== filters.academicStructureId
    ) {
      return false;
    }
    if (filters.academicPeriodId && item.academicPeriodId !== filters.academicPeriodId) {
      return false;
    }
    return true;
  });
}

export function getStudentsForReport(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): Student[] {
  const enrollments = getActiveEnrollmentsForReport(dataset, filters);
  const enrollmentStudentIds = new Set(enrollments.map(item => item.studentId));

  return dataset.students.filter(student => {
    if (student.isDeleted) return false;
    if (filters.branchId && student.branchId !== filters.branchId) return false;
    if (filters.studentId && student.id !== filters.studentId) return false;
    return !!student.id && enrollmentStudentIds.has(student.id);
  });
}

// ======================================================
// ASSESSMENT CONFIG RESOLUTION
// ======================================================

export function getApplicabilityForClassSubject(
  dataset: ReportEngineDataset,
  classSubjectId?: number
): AssessmentApplicability | undefined {
  if (!classSubjectId) return undefined;

  return dataset.assessmentApplicabilities.find(
    item => item.classSubjectId === classSubjectId && isActive(item)
  );
}

export function getAssessmentColumns(
  dataset: ReportEngineDataset,
  applicability?: AssessmentApplicability
): ReportAssessmentColumn[] {
  if (!applicability?.assessmentStructureId) return [];

  return dataset.assessmentStructureItems
    .filter(
      item =>
        item.assessmentStructureId === applicability.assessmentStructureId &&
        isActive(item)
    )
    .sort((a, b) => a.order - b.order)
    .map(item => ({
      assessmentStructureItemId: item.id || 0,
      name: item.name,
      maxScore: safeNumber(item.maxScore),
      weight: safeNumber(item.weight),
      order: safeNumber(item.order),
    }));
}

export function getAssessmentEntriesForSubject(
  dataset: ReportEngineDataset,
  studentId: number,
  classSubjectId?: number,
  academicPeriodId?: number
): AssessmentEntry[] {
  return dataset.assessmentEntries.filter(item => {
    if (item.isDeleted) return false;
    if (item.studentId !== studentId) return false;
    if (classSubjectId && item.classSubjectId !== classSubjectId) return false;
    if (academicPeriodId && item.academicPeriodId !== academicPeriodId) return false;
    return true;
  });
}

// ======================================================
// GRADING
// ======================================================

export function resolveGrade(
  dataset: ReportEngineDataset,
  percentage: number,
  gradingSystemId?: number
): GradeResolution {
  if (!gradingSystemId) {
    return {
      grade: "N/A",
      remark: "No grading system",
    };
  }

  const rule = dataset.gradeRules
    .filter(
      item =>
        item.gradingSystemId === gradingSystemId &&
        isActive(item)
    )
    .sort((a, b) => b.minScore - a.minScore)
    .find(item => percentage >= item.minScore && percentage <= item.maxScore);

  return {
    grade: rule?.grade || "N/A",
    remark: rule?.remark || "No remark defined",
    gpa: rule?.gpa,
    color: rule?.color,
  };
}

// ======================================================
// ATTENDANCE
// ======================================================

export function computeAttendanceSummary(
  attendanceRows: Attendance[]
): AttendanceSummary {
  const totalDays = attendanceRows.length;
  const presentDays = attendanceRows.filter(item => item.status === "present").length;
  const absentDays = attendanceRows.filter(item => item.status === "absent").length;
  const lateDays = attendanceRows.filter(item => item.status === "late").length;

  return {
    totalDays,
    presentDays,
    absentDays,
    lateDays,
    attendancePercent: totalDays ? round((presentDays / totalDays) * 100, 1) : 0,
  };
}

export function getStudentAttendance(
  dataset: ReportEngineDataset,
  studentId: number,
  filters: ReportFiltersState
): AttendanceSummary {
  const rows = dataset.attendance.filter(item => {
    if (item.isDeleted) return false;
    if (item.studentId !== studentId) return false;
    if (filters.classId && item.classId !== filters.classId) return false;
    if (
      filters.academicStructureId &&
      item.academicStructureId !== filters.academicStructureId
    ) {
      return false;
    }
    if (filters.academicPeriodId && item.academicPeriodId !== filters.academicPeriodId) {
      return false;
    }
    return true;
  });

  return computeAttendanceSummary(rows);
}

// ======================================================
// SUBJECT RESULT COMPUTATION
// ======================================================

export function computeStudentSubjectResult(
  dataset: ReportEngineDataset,
  student: Student,
  classSubject: ClassSubject,
  filters: ReportFiltersState
): StudentSubjectResult {
  const lookups = buildLookups(dataset);
  const subject = lookups.subjectMap.get(classSubject.subjectId);
  const teacher = classSubject.teacherId
    ? lookups.teacherMap.get(classSubject.teacherId)
    : undefined;

  const applicability = getApplicabilityForClassSubject(dataset, classSubject.id);
  const columns = getAssessmentColumns(dataset, applicability);
  const entries = getAssessmentEntriesForSubject(
    dataset,
    student.id || 0,
    classSubject.id,
    filters.academicPeriodId || classSubject.academicPeriodId
  );

  let rawTotal = 0;
  let rawMaxTotal = 0;
  let weightedTotal = 0;
  let totalWeight = 0;

  const breakdown: ReportBreakdownItem[] = columns.map(column => {
    const entry = entries.find(
      item => item.assessmentStructureItemId === column.assessmentStructureItemId
    );

    const score = safeNumber(entry?.score);
    const maxScore = safeNumber(column.maxScore);
    const weight = safeNumber(column.weight);
    const weightedScore = maxScore > 0 ? (score / maxScore) * weight : 0;

    rawTotal += score;
    rawMaxTotal += maxScore;
    weightedTotal += weightedScore;
    totalWeight += weight;

    return {
      ...column,
      score: round(score, 2),
      weightedScore: round(weightedScore, 2),
    };
  });

  const percentage = totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : 0;
  const grade = resolveGrade(dataset, percentage, applicability?.gradingSystemId);

  return {
    classSubjectId: classSubject.id || 0,
    subjectId: classSubject.subjectId,
    subjectName: classSubject.name || subject?.name || "Unknown Subject",
    subjectCode: classSubject.code || subject?.code,
    shortName: classSubject.code || subject?.code || subject?.name?.slice(0, 4),
    teacherId: teacher?.id,
    teacherName: teacher?.fullName,

    assessmentStructureId: applicability?.assessmentStructureId,
    gradingSystemId: applicability?.gradingSystemId,

    breakdown,

    rawTotal: round(rawTotal, 2),
    rawMaxTotal: round(rawMaxTotal, 2),
    weightedTotal: round(weightedTotal, 2),
    totalWeight: round(totalWeight, 2),
    percentage: round(percentage, 2),

    grade: grade.grade,
    remark: grade.remark,
    gpa: grade.gpa,
    color: grade.color,

    subjectPosition: undefined,
  };
}

// ======================================================
// STUDENT REPORT COMPUTATION
// ======================================================

export function buildStudentReport(
  dataset: ReportEngineDataset,
  student: Student,
  filters: ReportFiltersState,
  classSubjects: ClassSubject[]
): ComputedStudentReport {
  const lookups = buildLookups(dataset);

  const subjectResults = classSubjects.map(classSubject =>
    computeStudentSubjectResult(dataset, student, classSubject, filters)
  );

  const percentages = subjectResults.map(item => item.percentage);
  const gpas = subjectResults
    .map(item => item.gpa)
    .filter((item): item is number => item != null);

  return {
    studentId: student.id || 0,
    studentName: student.fullName,
    admissionNumber: student.admissionNumber,
    gender: student.gender,
    studentPhoto: student.photo,

    classId: filters.classId || student.currentClassId || 0,
    className: lookups.classMap.get(filters.classId)?.name || "Class",
    academicStructureId: filters.academicStructureId,
    academicPeriodId: filters.academicPeriodId,

    subjectResults,

    total: round(percentages.reduce((sum, item) => sum + item, 0), 2),
    average: round(average(percentages), 2),
    overallGPA: gpas.length ? round(average(gpas), 2) : undefined,
    overallPosition: undefined,

    attendance: getStudentAttendance(dataset, student.id || 0, filters),

    classTeacherRemark: "",
    headTeacherRemark: "",
    promoted: undefined,
  };
}

// ======================================================
// POSITIONS
// ======================================================

export function applyOverallPositions(reports: ComputedStudentReport[]): void {
  const sorted = [...reports].sort((a, b) => b.average - a.average);

  let lastScore: number | undefined;
  let lastPosition = 0;

  sorted.forEach((report, index) => {
    const position = lastScore === report.average ? lastPosition : index + 1;
    report.overallPosition = position;
    lastScore = report.average;
    lastPosition = position;
  });
}

export function applySubjectPositions(
  reports: ComputedStudentReport[],
  classSubjects: ClassSubject[]
): void {
  classSubjects.forEach(classSubject => {
    const subjectRows = reports
      .map(report =>
        report.subjectResults.find(item => item.classSubjectId === classSubject.id)
      )
      .filter((item): item is StudentSubjectResult => !!item)
      .sort((a, b) => b.percentage - a.percentage);

    let lastScore: number | undefined;
    let lastPosition = 0;

    subjectRows.forEach((row, index) => {
      const position = lastScore === row.percentage ? lastPosition : index + 1;
      row.subjectPosition = position;
      lastScore = row.percentage;
      lastPosition = position;
    });
  });
}

export function sortReports(
  reports: ComputedStudentReport[],
  filters: ReportFiltersState
): ComputedStudentReport[] {
  const sorted = [...reports];

  switch (filters.sortMode) {
    case "alphabetical":
      return sorted.sort(byStudentName);
    case "admission-number":
      return sorted.sort(byAdmissionNumber);
    case "average":
    case "position":
    default:
      return sorted.sort((a, b) => (a.overallPosition || 9999) - (b.overallPosition || 9999));
  }
}

// ======================================================
// CLASS REPORTS
// ======================================================

export function buildClassReports(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): ComputedStudentReport[] {
  const students = getStudentsForReport(dataset, filters);
  const classSubjects = getClassSubjectsForReport(dataset, {
    ...filters,
    classSubjectId: undefined,
  });

  const reports = students.map(student =>
    buildStudentReport(dataset, student, filters, classSubjects)
  );

  applyOverallPositions(reports);
  applySubjectPositions(reports, classSubjects);

  return sortReports(reports, filters);
}

// ======================================================
// SUBJECT BROADSHEET
// ======================================================

export function buildSubjectBroadsheet(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState,
  reports: ComputedStudentReport[]
): ComputedSubjectBroadsheet | undefined {
  const lookups = buildLookups(dataset);
  const classSubject = lookups.classSubjectMap.get(filters.classSubjectId);

  if (!classSubject) return undefined;

  const subject = lookups.subjectMap.get(classSubject.subjectId);
  const teacher = classSubject.teacherId
    ? lookups.teacherMap.get(classSubject.teacherId)
    : undefined;

  const students: SubjectBroadsheetStudentRow[] = reports
    .reduce<SubjectBroadsheetStudentRow[]>((rows, report) => {
      const result = report.subjectResults.find(
        item => item.classSubjectId === classSubject.id
      );

      if (!result) {
        return rows;
      }

      rows.push({
        studentId: report.studentId,
        studentName: report.studentName,
        admissionNumber: report.admissionNumber,
        breakdown: result.breakdown,
        weightedTotal: result.weightedTotal,
        percentage: result.percentage,
        grade: result.grade,
        remark: result.remark,
        gpa: result.gpa,
        position: result.subjectPosition,
      });

      return rows;
    }, [])
    .sort(
      (a, b) =>
        (a.position || 9999) -
        (b.position || 9999)
    );

  const percentages = students.map(item => item.percentage);
  const applicability = getApplicabilityForClassSubject(dataset, classSubject.id);

  return {
    classSubjectId: classSubject.id || 0,
    classId: classSubject.classId,
    className: lookups.classMap.get(classSubject.classId)?.name || "Class",
    subjectId: classSubject.subjectId,
    subjectName: classSubject.name || subject?.name || "Subject",
    subjectCode: classSubject.code || subject?.code,
    teacherName: teacher?.fullName,
    assessmentColumns: getAssessmentColumns(dataset, applicability),
    students,
    highestScore: round(percentages.length ? Math.max(...percentages) : 0, 2),
    lowestScore: round(percentages.length ? Math.min(...percentages) : 0, 2),
    classAverage: round(average(percentages), 2),
  };
}

// ======================================================
// CLASS BROADSHEET
// ======================================================

export function buildClassBroadsheet(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState,
  reports: ComputedStudentReport[]
): ComputedClassBroadsheet {
  const lookups = buildLookups(dataset);
  const classSubjects = getClassSubjectsForReport(dataset, {
    ...filters,
    classSubjectId: undefined,
  });

  const subjectColumns = classSubjects.map(classSubject => {
    const subject = lookups.subjectMap.get(classSubject.subjectId);

    return {
      classSubjectId: classSubject.id || 0,
      subjectId: classSubject.subjectId,
      subjectName: classSubject.name || subject?.name || "Subject",
      subjectCode: classSubject.code || subject?.code,
      shortName: classSubject.code || subject?.code || subject?.name?.slice(0, 4),
    };
  });

  const students: ClassBroadsheetStudentRow[] = reports.map(report => {
    const subjects: ClassBroadsheetSubjectCell[] = report.subjectResults.map(result => ({
      classSubjectId: result.classSubjectId,
      subjectId: result.subjectId,
      subjectName: result.subjectName,
      subjectCode: result.subjectCode,
      shortName: result.shortName,
      percentage: result.percentage,
      weightedTotal: result.weightedTotal,
      grade: result.grade,
      remark: result.remark,
      position: result.subjectPosition,
    }));

    return {
      studentId: report.studentId,
      studentName: report.studentName,
      admissionNumber: report.admissionNumber,
      subjects,
      total: report.total,
      average: report.average,
      gpa: report.overallGPA,
      position: report.overallPosition,
      attendancePercent: report.attendance.attendancePercent,
    };
  });

  const averages = students.map(item => item.average);

  return {
    classId: filters.classId || 0,
    className: lookups.classMap.get(filters.classId)?.name || "Class",
    subjectColumns,
    students,
    highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
    lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),
    classAverage: round(average(averages), 2),
  };
}

// ======================================================
// ANALYTICS
// ======================================================

export function buildAnalytics(
  reports: ComputedStudentReport[],
  classSubjects: ClassSubject[]
) {
  const averages = reports.map(item => item.average);
  const allBreakdowns = reports.flatMap(report =>
    report.subjectResults.flatMap(subject => subject.breakdown)
  );

  return {
    totalStudents: reports.length,
    totalSubjects: classSubjects.length,
    totalAssessmentItems: allBreakdowns.length,
    highestAverage: round(averages.length ? Math.max(...averages) : 0, 2),
    lowestAverage: round(averages.length ? Math.min(...averages) : 0, 2),
    classAverage: round(average(averages), 2),
  };
}

// ======================================================
// MASTER ENGINE
// ======================================================

// Replace ONLY your existing buildReportEngineOutput function with this corrected version.
// It resolves class teacher per report.classId, not only from filters.classId.

export function buildReportEngineOutput(
  dataset: ReportEngineDataset,
  filters: ReportFiltersState
): ReportEngineOutput {
  const header = buildReportHeader(dataset, filters);
  const warnings: string[] = [];

  if (!filters.branchId) warnings.push("No branch selected.");
  if (!filters.academicPeriodId) warnings.push("No academic period selected.");
  if (!filters.classId) warnings.push("No class selected.");

  const classSubjects = getClassSubjectsForReport(dataset, {
    ...filters,
    classSubjectId: undefined,
  });

  if (!classSubjects.length && filters.classId) {
    warnings.push("No class subjects found for the selected class and period.");
  }

  const classReports = buildClassReports(dataset, filters);

  const selectedReport = filters.studentId
    ? classReports.find(item => item.studentId === filters.studentId)
    : classReports[0];

  // ======================================================
  // SIGNATORY / RELATION HELPERS
  // ======================================================

  const getClassTeacherName = (classId?: number) => {
    if (!classId) return undefined;

    const classTeacherRecord = dataset.classTeachers.find(
      item =>
        item.classId === classId &&
        item.branchId === filters.branchId &&
        !item.isDeleted
    );

    const classTeacher = classTeacherRecord
      ? dataset.teachers.find(
          teacher =>
            teacher.id === classTeacherRecord.teacherId &&
            teacher.branchId === filters.branchId &&
            !teacher.isDeleted
        )
      : undefined;

    return classTeacher?.fullName;
  };

  const getHeadTeacherName = () => {
    const headTeacher = dataset.teachers.find(
      teacher =>
        teacher.branchId === filters.branchId &&
        teacher.role === "head_teacher" &&
        !teacher.isDeleted
    );

    return headTeacher?.fullName;
  };

  const getPrincipalName = () => {
    const principal = dataset.teachers.find(
      teacher =>
        teacher.branchId === filters.branchId &&
        teacher.role === "principal" &&
        !teacher.isDeleted
    );

    return principal?.fullName;
  };

  const getParentName = (studentId?: number) => {
    if (!studentId) return undefined;

    const parentLink = dataset.studentParents.find(
      item =>
        item.studentId === studentId &&
        item.branchId === filters.branchId &&
        !item.isDeleted
    );

    const parent = parentLink
      ? dataset.parents.find(
          item =>
            item.id === parentLink.parentId &&
            item.branchId === filters.branchId &&
            !item.isDeleted
        )
      : undefined;

    return parent?.fullName;
  };

  const headTeacherName = getHeadTeacherName();
  const principalName = getPrincipalName();

  const buildStudentReportDataset = (
    report: ComputedStudentReport
  ): StudentReportCardDataset => {
    const student = dataset.students.find(item => item.id === report.studentId);
    const classTeacherName = getClassTeacherName(report.classId);
    const parentName = getParentName(report.studentId);

    const savedReportCard = dataset.reportCards.find(
      item =>
        item.branchId === filters.branchId &&
        item.studentId === report.studentId &&
        item.classId === report.classId &&
        item.academicStructureId === report.academicStructureId &&
        item.academicPeriodId === report.academicPeriodId &&
        !item.isDeleted
    );

    return {
      header,
      student,

      report: {
        ...report,

        classTeacherRemark:
          savedReportCard?.classTeacherRemark || report.classTeacherRemark,

        headTeacherRemark:
          savedReportCard?.headTeacherRemark || report.headTeacherRemark,

        classTeacherName,
        headTeacherName,
        principalName,
        parentName,
        guardianName: parentName,
      },

      classTeacherName,
      headTeacherName,
      principalName,
      parentName,
      guardianName: parentName,
    };
  };

  const studentReport: StudentReportCardDataset | undefined = selectedReport
    ? buildStudentReportDataset(selectedReport)
    : undefined;

  const subjectBroadsheet = filters.classSubjectId
    ? buildSubjectBroadsheet(dataset, filters, classReports)
    : undefined;

  const classBroadsheet = buildClassBroadsheet(dataset, filters, classReports);

  const analytics = buildAnalytics(classReports, classSubjects);

  return {
    header,
    studentReport,
    classReports: classReports.map(report => buildStudentReportDataset(report)),
    subjectBroadsheet,
    classBroadsheet,
    analytics,
    warnings,
  };
}
