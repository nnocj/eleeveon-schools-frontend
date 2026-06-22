"use client";

/**
 * app/parent/modules/Childresults.tsx
 * ---------------------------------------------------------
 * PARENT PORTAL — CHILD RESULTS
 * ---------------------------------------------------------
 *
 * Parent-scoped Academic Results Center:
 * - No school selector.
 * - No branch selector.
 * - Uses active parent membership.
 * - Shows only report cards/results for children linked to the logged-in parent.
 *
 * Supports:
 * - reportCards
 * - reportCardItems
 * - computedResults
 * - assessmentEntries fallback
 *
 * Views:
 * - Cards
 * - Table
 * - Analytics
 *
 * Result modes:
 * - Report Cards
 * - Subject Results
 * - Cumulative / History
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

import {
  AcademicPeriod,
  AcademicStructure,
  AssessmentEntry,
  Class,
  ClassSubject,
  ComputedResult,
  db,
  GradeRule,
  GradingSystem,
  Parent,
  ReportCard,
  ReportCardItem,
  Student,
  StudentEnrollment,
  StudentParent,
  Subject,
} from "../../lib/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type ViewMode = "cards" | "table" | "analytics";
type ResultMode = "report-cards" | "subject-results" | "cumulative-history";

type ChildResultSummary = {
  student: Student;
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  reports: ReportCardView[];
  subjectResults: SubjectResultView[];
  averageScore: number;
  bestSubject?: SubjectResultView;
  weakestSubject?: SubjectResultView;
  latestReport?: ReportCardView;
};

type ReportCardView = {
  report: ReportCard;
  student?: Student;
  className: string;
  academicStructureName: string;
  academicPeriodName: string;
  totalScore: number;
  averageScore: number;
  position?: number;
  grade?: string;
  remarks?: string;
  itemCount: number;
  items: SubjectResultView[];
};

type SubjectResultView = {
  id: string;
  student?: Student;
  subject?: Subject;
  classSubject?: ClassSubject;
  academicPeriod?: AcademicPeriod;
  academicStructure?: AcademicStructure;
  className: string;
  subjectName: string;
  academicPeriodName: string;
  academicStructureName: string;
  score: number;
  maxScore: number;
  percentage: number;
  grade?: string;
  remarks?: string;
  position?: number;
  source: "reportCardItem" | "computedResult" | "assessmentEntry";
};

type Breakdown = {
  name: string;
  count: number;
  average?: number;
};

// ======================================================
// HELPERS
// ======================================================

const textOrDash = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const percent = (score: number, maxScore: number) => {
  if (!maxScore) return 0;
  return Math.round((Number(score || 0) / Number(maxScore || 0)) * 100);
};

const round = (value: number) => Math.round(Number(value || 0) * 10) / 10;

const dateValue = (value?: string | number) => {
  if (typeof value === "number") return value;
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
};

const niceMode = (mode: ResultMode) => mode.replaceAll("-", " ");

function scoreTone(score: number): "green" | "red" | "blue" | "gray" | "orange" | "purple" {
  if (score >= 80) return "green";
  if (score >= 70) return "blue";
  if (score >= 50) return "orange";
  if (score > 0) return "red";
  return "gray";
}

function gradeFromRules(score: number, rules: GradeRule[]) {
  const sorted = [...rules].sort((a: any, b: any) => Number(b.minScore || 0) - Number(a.minScore || 0));
  const rule = sorted.find((r: any) => score >= Number(r.minScore || 0) && score <= Number(r.maxScore ?? 100));
  return rule?.grade || "";
}

function averageOf(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return 0;
  return round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

// ======================================================
// COMPONENT
// ======================================================

export default function Childresults() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const membershipContext = useActiveMembership() as any;

  const activeMembership = membershipContext?.activeMembership;
  const activeParentId =
    membershipContext?.activeParentId ||
    activeMembership?.parentLocalId ||
    undefined;

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [resultMode, setResultMode] = useState<ResultMode>("report-cards");

  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [reportCardItems, setReportCardItems] = useState<ReportCardItem[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<number | "all">("all");
  const [structureFilter, setStructureFilter] = useState<number | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<number | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState<number | "all">("all");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // ======================================================
  // AUTH PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/owner");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setParents([]);
    setStudentParents([]);
    setStudents([]);
    setClasses([]);
    setSubjects([]);
    setClassSubjects([]);
    setEnrollments([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setReportCards([]);
    setReportCardItems([]);
    setComputedResults([]);
    setAssessmentEntries([]);
    setGradingSystems([]);
    setGradeRules([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        parentRows,
        studentParentRows,
        studentRows,
        classRows,
        subjectRows,
        classSubjectRows,
        enrollmentRows,
        academicStructureRows,
        academicPeriodRows,
        reportCardRows,
        reportCardItemRows,
        computedResultRows,
        assessmentEntryRows,
        gradingSystemRows,
        gradeRuleRows,
      ] = await Promise.all([
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.students.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.classSubjects.toArray(),
        db.studentEnrollments.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
        db.computedResults.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
      ]);

      const scopedParents = parentRows.filter(sameTenant);
      const scopedStudentParents = studentParentRows.filter(sameTenant);
      const scopedStudents = studentRows.filter(sameTenant);

      const parentIds = new Set<number>();

      if (activeParentId) parentIds.add(Number(activeParentId));
      if (activeMembership?.parentLocalId) parentIds.add(Number(activeMembership.parentLocalId));

      const userEmail = String((activeMembership as any)?.email || "").toLowerCase();
      scopedParents
        .filter((parent) => userEmail && String(parent.email || "").toLowerCase() === userEmail)
        .forEach((parent) => {
          if (parent.id) parentIds.add(parent.id);
        });

      const linkedStudentParents = scopedStudentParents.filter(
        (link) => !parentIds.size || parentIds.has(link.parentId)
      );

      const childIds = new Set<number>(linkedStudentParents.map((link) => link.studentId));
      const childRows = scopedStudents.filter((student) => student.id && childIds.has(student.id));

      setParents(parentIds.size ? scopedParents.filter((parent) => parent.id && parentIds.has(parent.id)) : scopedParents);
      setStudentParents(linkedStudentParents);
      setStudents(childRows);
      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setSubjects(subjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setClassSubjects(classSubjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setEnrollments(enrollmentRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setAcademicStructures(academicStructureRows.filter((row) => sameTenant(row) && row.active !== false));
      setAcademicPeriods(academicPeriodRows.filter((row) => sameTenant(row) && row.active !== false));
      setReportCards(reportCardRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setReportCardItems(reportCardItemRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setComputedResults(computedResultRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setAssessmentEntries(assessmentEntryRows.filter(sameTenant).filter((row) => childIds.has(row.studentId)));
      setGradingSystems(gradingSystemRows.filter((row) => sameTenant(row) && row.active !== false));
      setGradeRules(gradeRuleRows.filter((row) => sameTenant(row) && row.active !== false));
    } catch (error) {
      console.error("Failed to load child results:", error);
      clearData();
      alert("Failed to load child results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId, activeParentId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(() => new Map(students.map((row) => [row.id, row])), [students]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row) => [row.id, row])), [subjects]);
  const classSubjectMap = useMemo(() => new Map(classSubjects.map((row) => [row.id, row])), [classSubjects]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(academicPeriods.map((row) => [row.id, row])), [academicPeriods]);

  const fallbackGradeRules = useMemo(() => {
    const activeSystem = gradingSystems.find((system: any) => system.active !== false);
    if (!activeSystem?.id) return gradeRules;
    return gradeRules.filter((rule: any) => rule.gradingSystemId === activeSystem.id);
  }, [gradingSystems, gradeRules]);

  // ======================================================
  // SUBJECT RESULT VIEW MODEL
  // ======================================================

  const subjectResults = useMemo<SubjectResultView[]>(() => {
    const fromReportItems: SubjectResultView[] = reportCardItems.map((item: any) => {
      const student = studentMap.get(item.studentId);
      const classSubject = item.classSubjectId ? classSubjectMap.get(item.classSubjectId) : undefined;
      const subject = item.subjectId
        ? subjectMap.get(item.subjectId)
        : classSubject?.subjectId
          ? subjectMap.get(classSubject.subjectId)
          : undefined;

      const academicPeriod = item.academicPeriodId ? periodMap.get(item.academicPeriodId) : undefined;
      const academicStructure = item.academicStructureId ? structureMap.get(item.academicStructureId) : undefined;
      const klass = item.classId ? classMap.get(item.classId) : classSubject?.classId ? classMap.get(classSubject.classId) : undefined;

      const score = Number(item.totalScore ?? item.score ?? item.percentage ?? 0);
      const maxScore = Number(item.maxScore || 100);
      const percentage = item.percentage !== undefined ? Number(item.percentage) : percent(score, maxScore);

      return {
        id: `report-item-${item.id}`,
        student,
        subject,
        classSubject,
        academicPeriod,
        academicStructure,
        className: klass?.name || "Class",
        subjectName: subject?.name || item.subjectName || "Subject",
        academicPeriodName: academicPeriod?.name || "Period",
        academicStructureName: academicStructure?.name || "Structure",
        score,
        maxScore,
        percentage,
        grade: item.grade || gradeFromRules(percentage, fallbackGradeRules),
        remarks: item.remarks || item.comment,
        position: item.position,
        source: "reportCardItem",
      };
    });

    const reportItemKeys = new Set(
      fromReportItems.map((item) => `${item.student?.id || ""}-${item.classSubject?.id || ""}-${item.academicPeriod?.id || ""}`)
    );

    const fromComputedResults: SubjectResultView[] = computedResults
      .filter((result: any) => {
        const key = `${result.studentId || ""}-${result.classSubjectId || ""}-${result.academicPeriodId || ""}`;
        return !reportItemKeys.has(key);
      })
      .map((result: any) => {
        const student = studentMap.get(result.studentId);
        const classSubject = result.classSubjectId ? classSubjectMap.get(result.classSubjectId) : undefined;
        const subject = classSubject?.subjectId ? subjectMap.get(classSubject.subjectId) : undefined;
        const academicPeriod = result.academicPeriodId ? periodMap.get(result.academicPeriodId) : undefined;
        const academicStructure = result.academicStructureId ? structureMap.get(result.academicStructureId) : undefined;
        const klass = result.classId ? classMap.get(result.classId) : classSubject?.classId ? classMap.get(classSubject.classId) : undefined;
        const score = Number(result.totalScore ?? result.score ?? result.percentage ?? 0);
        const maxScore = Number(result.maxScore || 100);
        const percentage = result.percentage !== undefined ? Number(result.percentage) : percent(score, maxScore);

        return {
          id: `computed-${result.id}`,
          student,
          subject,
          classSubject,
          academicPeriod,
          academicStructure,
          className: klass?.name || "Class",
          subjectName: subject?.name || result.subjectName || "Subject",
          academicPeriodName: academicPeriod?.name || "Period",
          academicStructureName: academicStructure?.name || "Structure",
          score,
          maxScore,
          percentage,
          grade: result.grade || gradeFromRules(percentage, fallbackGradeRules),
          remarks: result.remarks || result.comment,
          position: result.position,
          source: "computedResult",
        };
      });

    return [...fromReportItems, ...fromComputedResults].sort(
      (a, b) =>
        (a.student?.fullName || "").localeCompare(b.student?.fullName || "") ||
        a.subjectName.localeCompare(b.subjectName)
    );
  }, [
    reportCardItems,
    computedResults,
    studentMap,
    classSubjectMap,
    subjectMap,
    periodMap,
    structureMap,
    classMap,
    fallbackGradeRules,
  ]);

  // ======================================================
  // REPORT CARD VIEW MODEL
  // ======================================================

  const reportViews = useMemo<ReportCardView[]>(() => {
    return reportCards
      .map((report: any) => {
        const student = studentMap.get(report.studentId);
        const academicPeriod = report.academicPeriodId ? periodMap.get(report.academicPeriodId) : undefined;
        const academicStructure = report.academicStructureId ? structureMap.get(report.academicStructureId) : undefined;
        const klass = report.classId ? classMap.get(report.classId) : undefined;

        const items = subjectResults.filter((item) => {
          if (item.student?.id !== report.studentId) return false;
          if (report.academicPeriodId && item.academicPeriod?.id !== report.academicPeriodId) return false;
          if (report.academicStructureId && item.academicStructure?.id !== report.academicStructureId) return false;
          return true;
        });

        const averageScore = Number(report.averageScore ?? report.average ?? averageOf(items.map((item) => item.percentage)));
        const totalScore = Number(report.totalScore ?? items.reduce((sum, item) => sum + Number(item.score || 0), 0));

        return {
          report,
          student,
          className: klass?.name || "Class",
          academicStructureName: academicStructure?.name || "Structure",
          academicPeriodName: academicPeriod?.name || "Period",
          totalScore,
          averageScore,
          position: report.position || report.classPosition,
          grade: report.grade || gradeFromRules(averageScore, fallbackGradeRules),
          remarks: report.remarks || report.headTeacherRemarks || report.classTeacherRemarks,
          itemCount: items.length,
          items,
        };
      })
      .sort(
        (a, b) =>
          dateValue((b.report as any).updatedAt || b.report.createdAt) -
          dateValue((a.report as any).updatedAt || a.report.createdAt)
      );
  }, [reportCards, studentMap, periodMap, structureMap, classMap, subjectResults, fallbackGradeRules]);

  // ======================================================
  // CHILD SUMMARIES
  // ======================================================

  const childSummaries = useMemo<ChildResultSummary[]>(() => {
    return students
      .map((student) => {
        const activeEnrollment =
          enrollments.find((row) => row.studentId === student.id && row.status === "active") ||
          enrollments.find((row) => row.studentId === student.id);

        const className =
          student.currentClassId && classMap.get(student.currentClassId)
            ? classMap.get(student.currentClassId)?.name || "Class"
            : activeEnrollment?.classId
              ? classMap.get(activeEnrollment.classId)?.name || "Class"
              : "No class assigned";

        const academicStructureName = activeEnrollment?.academicStructureId
          ? structureMap.get(activeEnrollment.academicStructureId)?.name || "Structure"
          : "Not enrolled";

        const academicPeriodName = activeEnrollment?.academicPeriodId
          ? periodMap.get(activeEnrollment.academicPeriodId)?.name || "Period"
          : "Not enrolled";

        const reports = reportViews.filter((report) => report.student?.id === student.id);
        const results = subjectResults.filter((result) => result.student?.id === student.id);
        const averageScore = averageOf(results.map((result) => result.percentage));

        const sortedByScore = [...results].sort((a, b) => b.percentage - a.percentage);

        return {
          student,
          className,
          academicStructureName,
          academicPeriodName,
          reports,
          subjectResults: results,
          averageScore,
          bestSubject: sortedByScore[0],
          weakestSubject: sortedByScore[sortedByScore.length - 1],
          latestReport: reports[0],
        };
      })
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  }, [students, enrollments, classMap, structureMap, periodMap, reportViews, subjectResults]);

  // ======================================================
  // FILTERED DATA
  // ======================================================

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reportViews.filter((item) => {
      if (studentFilter !== "all" && item.student?.id !== studentFilter) return false;
      if (structureFilter !== "all" && item.report.academicStructureId !== structureFilter) return false;
      if (periodFilter !== "all" && item.report.academicPeriodId !== periodFilter) return false;

      if (!query) return true;

      return `
        ${item.student?.fullName || ""}
        ${item.student?.admissionNumber || ""}
        ${item.className}
        ${item.academicStructureName}
        ${item.academicPeriodName}
        ${item.grade || ""}
        ${item.remarks || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [reportViews, search, studentFilter, structureFilter, periodFilter]);

  const filteredSubjectResults = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subjectResults.filter((item) => {
      if (studentFilter !== "all" && item.student?.id !== studentFilter) return false;
      if (structureFilter !== "all" && item.academicStructure?.id !== structureFilter) return false;
      if (periodFilter !== "all" && item.academicPeriod?.id !== periodFilter) return false;
      if (subjectFilter !== "all" && item.subject?.id !== subjectFilter) return false;

      if (!query) return true;

      return `
        ${item.student?.fullName || ""}
        ${item.student?.admissionNumber || ""}
        ${item.className}
        ${item.subjectName}
        ${item.academicStructureName}
        ${item.academicPeriodName}
        ${item.grade || ""}
        ${item.remarks || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [subjectResults, search, studentFilter, structureFilter, periodFilter, subjectFilter]);

  const filteredChildSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return childSummaries.filter((item) => {
      if (studentFilter !== "all" && item.student.id !== studentFilter) return false;

      if (!query) return true;

      return `
        ${item.student.fullName}
        ${item.student.admissionNumber || ""}
        ${item.className}
        ${item.academicStructureName}
        ${item.academicPeriodName}
        ${item.bestSubject?.subjectName || ""}
        ${item.weakestSubject?.subjectName || ""}
      `
        .toLowerCase()
        .includes(query);
    });
  }, [childSummaries, search, studentFilter]);

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    return reportViews.find((report) => report.report.id === selectedReportId) || null;
  }, [selectedReportId, reportViews]);

  const selectedChild = useMemo(() => {
    if (!selectedStudentId) return null;
    return childSummaries.find((child) => child.student.id === selectedStudentId) || null;
  }, [selectedStudentId, childSummaries]);

  // ======================================================
  // SUMMARY + ANALYTICS
  // ======================================================

  const summary = useMemo(() => {
    const activeResults = resultMode === "report-cards" ? filteredReports : filteredSubjectResults;
    const scores =
      resultMode === "report-cards"
        ? filteredReports.map((item) => item.averageScore)
        : filteredSubjectResults.map((item) => item.percentage);

    return {
      children: filteredChildSummaries.length,
      reports: filteredReports.length,
      subjectResults: filteredSubjectResults.length,
      average: averageOf(scores),
      excellent: scores.filter((score) => score >= 80).length,
      needsSupport: scores.filter((score) => score > 0 && score < 50).length,
      activeRecords: activeResults.length,
    };
  }, [resultMode, filteredReports, filteredSubjectResults, filteredChildSummaries]);

  const subjectBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, { name: string; count: number; scores: number[] }>();

    filteredSubjectResults.forEach((result) => {
      const existing = map.get(result.subjectName) || { name: result.subjectName, count: 0, scores: [] };
      existing.count += 1;
      existing.scores.push(result.percentage);
      map.set(result.subjectName, existing);
    });

    return Array.from(map.values())
      .map((item) => ({ name: item.name, count: item.count, average: averageOf(item.scores) }))
      .sort((a, b) => Number(b.average || 0) - Number(a.average || 0));
  }, [filteredSubjectResults]);

  const childBreakdown = useMemo<Breakdown[]>(() => {
    return filteredChildSummaries
      .map((child) => ({
        name: child.student.fullName,
        count: child.subjectResults.length,
        average: child.averageScore,
      }))
      .sort((a, b) => Number(b.average || 0) - Number(a.average || 0));
  }, [filteredChildSummaries]);

  const periodBreakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, { name: string; count: number; scores: number[] }>();

    filteredSubjectResults.forEach((result) => {
      const existing = map.get(result.academicPeriodName) || { name: result.academicPeriodName, count: 0, scores: [] };
      existing.count += 1;
      existing.scores.push(result.percentage);
      map.set(result.academicPeriodName, existing);
    });

    return Array.from(map.values())
      .map((item) => ({ name: item.name, count: item.count, average: averageOf(item.scores) }))
      .sort((a, b) => Number(b.average || 0) - Number(a.average || 0));
  }, [filteredSubjectResults]);

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="pres-page" style={{ "--pres-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pres-state-card">
          <div className="pres-spinner" />
          <h2>Opening child results...</h2>
          <p>Checking parent profile, linked children, report cards and subject scores.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="pres-page" style={{ "--pres-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pres-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before viewing child results.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="pres-page" style={{ "--pres-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="pres-state-card">
          <h2>Assigned school branch required</h2>
          <p>Your parent portal must be linked to a school branch before child results can be shown.</p>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="pres-page" style={{ "--pres-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="pres-hero">
        <div className="pres-hero-left">
          <div className="pres-hero-icon">📊</div>
          <div className="pres-title-wrap">
            <p>Parent Academic Center</p>
            <h2>Child Results</h2>
            <span>
              {activeSchool?.name || "School"} · {activeBranch?.name || "Branch"}
            </span>
          </div>
        </div>

        <div className="pres-hero-actions">
          <button type="button" className="pres-ghost-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      <section className="pres-context-grid">
        <article>
          <div className="pres-context-icon">👨‍👩‍👧</div>
          <div>
            <span>Linked Children</span>
            <strong>{students.length}</strong>
            <p>Only results for your linked children appear here.</p>
          </div>
        </article>

        <article>
          <div className="pres-context-icon">🏫</div>
          <div>
            <span>School Branch</span>
            <strong>{activeBranch?.name || "Assigned branch"}</strong>
            <p>Results are locked to your child’s branch.</p>
          </div>
        </article>
      </section>

      <section className="pres-summary-grid" aria-label="Results summary">
        <SummaryCard label="Children" value={summary.children} icon="🧒" />
        <SummaryCard label="Report Cards" value={summary.reports} icon="📄" />
        <SummaryCard label="Subject Results" value={summary.subjectResults} icon="📚" />
        <SummaryCard label="Average" value={`${summary.average}%`} icon="📊" positive={summary.average >= 70} warning={summary.average > 0 && summary.average < 50} />
        <SummaryCard label="Needs Support" value={summary.needsSupport} icon="⚠️" warning={summary.needsSupport > 0} />
      </section>

      <section className="pres-mode-tabs">
        <button type="button" className={resultMode === "report-cards" ? "active" : ""} onClick={() => setResultMode("report-cards")}>
          Report Cards
        </button>
        <button type="button" className={resultMode === "subject-results" ? "active" : ""} onClick={() => setResultMode("subject-results")}>
          Subject Results
        </button>
        <button type="button" className={resultMode === "cumulative-history" ? "active" : ""} onClick={() => setResultMode("cumulative-history")}>
          History
        </button>
      </section>

      <section className="pres-toolbar">
        <div className="pres-view-tabs">
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            Cards
          </button>
          <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Table
          </button>
          <button type="button" className={viewMode === "analytics" ? "active" : ""} onClick={() => setViewMode("analytics")}>
            Analytics
          </button>
        </div>

        <Chip tone="gray">{niceMode(resultMode)}</Chip>
      </section>

      <section className="pres-filter-card">
        <input
          placeholder="Search child, subject, grade, period..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Children</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName}
              {student.admissionNumber ? ` • ${student.admissionNumber}` : ""}
            </option>
          ))}
        </select>

        <select value={structureFilter} onChange={(event) => setStructureFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Academic Structures</option>
          {academicStructures.map((structure) => (
            <option key={structure.id} value={structure.id}>
              {structure.name}
            </option>
          ))}
        </select>

        <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
          <option value="all">All Periods</option>
          {academicPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name}
            </option>
          ))}
        </select>

        {resultMode === "subject-results" && (
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value === "all" ? "all" : Number(event.target.value))}>
            <option value="all">All Subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {viewMode === "analytics" && (
        <>
          <BreakdownSection title="Performance by Child" items={childBreakdown} tone="purple" />
          <BreakdownSection title="Performance by Subject" items={subjectBreakdown} tone="blue" />
          <BreakdownSection title="Performance by Period" items={periodBreakdown} tone="green" />
        </>
      )}

      {viewMode === "table" && (
        <section className="pres-table-card">
          <div className="pres-section-head">
            <div>
              <p>Academic Register</p>
              <h3>{niceMode(resultMode)} Table</h3>
            </div>
            <Chip tone="blue">Parent Scoped</Chip>
          </div>

          <div className="pres-table-scroll">
            {resultMode === "report-cards" && (
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Structure</th>
                    <th>Period</th>
                    <th>Average</th>
                    <th>Grade</th>
                    <th>Position</th>
                    <th>Subjects</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredReports.map((report) => (
                    <tr key={report.report.id}>
                      <td>
                        <strong>{report.student?.fullName || "Student"}</strong>
                        <span>{report.student?.admissionNumber || "No admission number"}</span>
                      </td>
                      <td>{report.className}</td>
                      <td>{report.academicStructureName}</td>
                      <td>{report.academicPeriodName}</td>
                      <td><Chip tone={scoreTone(report.averageScore)}>{report.averageScore}%</Chip></td>
                      <td>{report.grade || "-"}</td>
                      <td>{textOrDash(report.position)}</td>
                      <td>{report.itemCount}</td>
                      <td><button type="button" className="pres-table-btn" onClick={() => setSelectedReportId(report.report.id || null)}>View</button></td>
                    </tr>
                  ))}

                  {!filteredReports.length && (
                    <tr>
                      <td colSpan={9}><EmptyCard text="No report cards were found for the selected filters." /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {resultMode !== "report-cards" && (
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Subject</th>
                    <th>Class</th>
                    <th>Structure</th>
                    <th>Period</th>
                    <th>Score</th>
                    <th>Grade</th>
                    <th>Position</th>
                    <th>Source</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSubjectResults.map((result) => (
                    <tr key={result.id}>
                      <td>
                        <strong>{result.student?.fullName || "Student"}</strong>
                        <span>{result.student?.admissionNumber || "No admission number"}</span>
                      </td>
                      <td>{result.subjectName}</td>
                      <td>{result.className}</td>
                      <td>{result.academicStructureName}</td>
                      <td>{result.academicPeriodName}</td>
                      <td><Chip tone={scoreTone(result.percentage)}>{result.percentage}%</Chip></td>
                      <td>{result.grade || "-"}</td>
                      <td>{textOrDash(result.position)}</td>
                      <td>{result.source}</td>
                    </tr>
                  ))}

                  {!filteredSubjectResults.length && (
                    <tr>
                      <td colSpan={9}><EmptyCard text="No subject results were found for the selected filters." /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {viewMode === "cards" && resultMode === "report-cards" && (
        <section className="pres-section">
          <div className="pres-section-head">
            <div>
              <p>Report Cards</p>
              <h3>Term / Period Reports</h3>
            </div>
            <Chip tone="gray">{filteredReports.length} report(s)</Chip>
          </div>

          <div className="pres-list">
            {filteredReports.map((report) => (
              <article key={report.report.id} className="pres-card">
                <div className="pres-card-top">
                  <div className="pres-card-icon">📄</div>

                  <div className="pres-card-main">
                    <h3>{report.student?.fullName || "Student"}</h3>
                    <p>{report.academicStructureName} · {report.academicPeriodName}</p>

                    <div className="pres-chip-row">
                      <Chip tone={scoreTone(report.averageScore)}>{report.averageScore}% average</Chip>
                      <Chip tone="blue">{report.className}</Chip>
                      <Chip tone="gray">{report.grade || "No grade"}</Chip>
                    </div>
                  </div>
                </div>

                <div className="pres-mini-grid">
                  <MiniStat label="Total Score" value={round(report.totalScore)} />
                  <MiniStat label="Average" value={`${report.averageScore}%`} />
                  <MiniStat label="Position" value={textOrDash(report.position)} />
                  <MiniStat label="Subjects" value={report.itemCount} />
                </div>

                <div className="pres-action-row">
                  <button type="button" onClick={() => setSelectedReportId(report.report.id || null)}>
                    View Report
                  </button>
                </div>
              </article>
            ))}

            {!filteredReports.length && <EmptyCard text="No report cards were found for the selected filters." />}
          </div>
        </section>
      )}

      {viewMode === "cards" && resultMode === "subject-results" && (
        <section className="pres-section">
          <div className="pres-section-head">
            <div>
              <p>Subject Results</p>
              <h3>Subject Performance</h3>
            </div>
            <Chip tone="gray">{filteredSubjectResults.length} result(s)</Chip>
          </div>

          <div className="pres-list">
            {filteredSubjectResults.map((result) => (
              <article key={result.id} className="pres-card">
                <div className="pres-card-top">
                  <div className="pres-card-icon">📚</div>

                  <div className="pres-card-main">
                    <h3>{result.subjectName}</h3>
                    <p>{result.student?.fullName || "Student"} · {result.academicPeriodName}</p>

                    <div className="pres-chip-row">
                      <Chip tone={scoreTone(result.percentage)}>{result.percentage}%</Chip>
                      <Chip tone="blue">{result.grade || "No grade"}</Chip>
                      <Chip tone="gray">{result.className}</Chip>
                    </div>
                  </div>
                </div>

                <div className="pres-mini-grid">
                  <MiniStat label="Score" value={`${round(result.score)} / ${round(result.maxScore)}`} />
                  <MiniStat label="Percentage" value={`${result.percentage}%`} />
                  <MiniStat label="Position" value={textOrDash(result.position)} />
                  <MiniStat label="Source" value={result.source} />
                </div>
              </article>
            ))}

            {!filteredSubjectResults.length && <EmptyCard text="No subject results were found for the selected filters." />}
          </div>
        </section>
      )}

      {viewMode === "cards" && resultMode === "cumulative-history" && (
        <section className="pres-section">
          <div className="pres-section-head">
            <div>
              <p>Cumulative History</p>
              <h3>Progress by Child</h3>
            </div>
            <Chip tone="gray">{filteredChildSummaries.length} child(ren)</Chip>
          </div>

          <div className="pres-list">
            {filteredChildSummaries.map((child) => (
              <article key={child.student.id} className="pres-card">
                <div className="pres-card-top">
                  <div className="pres-avatar">
                    {child.student.photo ? (
                      <img src={child.student.photo} alt={child.student.fullName} />
                    ) : (
                      child.student.fullName.slice(0, 1).toUpperCase()
                    )}
                  </div>

                  <div className="pres-card-main">
                    <h3>{child.student.fullName}</h3>
                    <p>{child.className} · {child.academicStructureName}</p>

                    <div className="pres-chip-row">
                      <Chip tone={scoreTone(child.averageScore)}>{child.averageScore}% average</Chip>
                      <Chip tone="blue">{child.reports.length} report(s)</Chip>
                      <Chip tone="gray">{child.subjectResults.length} result(s)</Chip>
                    </div>
                  </div>
                </div>

                <div className="pres-mini-grid">
                  <MiniStat label="Best Subject" value={child.bestSubject ? `${child.bestSubject.subjectName} (${child.bestSubject.percentage}%)` : "-"} />
                  <MiniStat label="Needs Support" value={child.weakestSubject ? `${child.weakestSubject.subjectName} (${child.weakestSubject.percentage}%)` : "-"} />
                  <MiniStat label="Latest Period" value={child.latestReport?.academicPeriodName || child.academicPeriodName} />
                  <MiniStat label="Current Class" value={child.className} />
                </div>

                <div className="pres-action-row">
                  <button type="button" onClick={() => setSelectedStudentId(child.student.id || null)}>
                    View History
                  </button>
                </div>
              </article>
            ))}

            {!filteredChildSummaries.length && <EmptyCard text="No cumulative history was found for the selected filters." />}
          </div>
        </section>
      )}

      {selectedReport && (
        <div className="pres-drawer-layer">
          <button type="button" className="pres-drawer-overlay" aria-label="Close report" onClick={() => setSelectedReportId(null)} />

          <aside className="pres-drawer">
            <div className="pres-drawer-head">
              <div>
                <p>Report Card Preview</p>
                <h2>{selectedReport.student?.fullName || "Student"}</h2>
                <span>{selectedReport.academicStructureName} · {selectedReport.academicPeriodName}</span>
              </div>
              <button type="button" onClick={() => setSelectedReportId(null)}>✕</button>
            </div>

            <section className="pres-drawer-grid">
              <MiniStat label="Class" value={selectedReport.className} />
              <MiniStat label="Average" value={`${selectedReport.averageScore}%`} />
              <MiniStat label="Grade" value={selectedReport.grade || "-"} />
              <MiniStat label="Position" value={textOrDash(selectedReport.position)} />
            </section>

            <section className="pres-drawer-section">
              <h3>Subject Breakdown</h3>
              <div className="pres-line-list">
                {selectedReport.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.subjectName}</span>
                    <strong>{item.percentage}% · {item.grade || "-"}</strong>
                  </div>
                ))}

                {!selectedReport.items.length && (
                  <div>
                    <span>No itemized subject records found.</span>
                    <strong>{selectedReport.averageScore}%</strong>
                  </div>
                )}
              </div>
            </section>

            {selectedReport.remarks && (
              <section className="pres-message-body">
                {selectedReport.remarks}
              </section>
            )}
          </aside>
        </div>
      )}

      {selectedChild && (
        <div className="pres-drawer-layer">
          <button type="button" className="pres-drawer-overlay" aria-label="Close history" onClick={() => setSelectedStudentId(null)} />

          <aside className="pres-drawer">
            <div className="pres-drawer-head">
              <div>
                <p>Cumulative History</p>
                <h2>{selectedChild.student.fullName}</h2>
                <span>{selectedChild.className} · {selectedChild.academicStructureName}</span>
              </div>
              <button type="button" onClick={() => setSelectedStudentId(null)}>✕</button>
            </div>

            <section className="pres-drawer-grid">
              <MiniStat label="Average" value={`${selectedChild.averageScore}%`} />
              <MiniStat label="Reports" value={selectedChild.reports.length} />
              <MiniStat label="Subject Results" value={selectedChild.subjectResults.length} />
              <MiniStat label="Current Period" value={selectedChild.academicPeriodName} />
            </section>

            <section className="pres-drawer-section">
              <h3>Subject History</h3>
              <div className="pres-line-list">
                {selectedChild.subjectResults.map((item) => (
                  <div key={item.id}>
                    <span>{item.subjectName} · {item.academicPeriodName}</span>
                    <strong>{item.percentage}% · {item.grade || "-"}</strong>
                  </div>
                ))}

                {!selectedChild.subjectResults.length && (
                  <div>
                    <span>No subject history found.</span>
                    <strong>-</strong>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({
  label,
  value,
  icon,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <article className={`pres-summary-card ${positive ? "positive" : ""} ${warning ? "warning" : ""}`}>
      <div className="pres-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function BreakdownSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: Breakdown[];
  tone: "green" | "blue" | "purple" | "orange";
}) {
  const total = items.length;

  return (
    <section className="pres-section">
      <div className="pres-section-head">
        <div>
          <p>Analytical View</p>
          <h3>{title}</h3>
        </div>
        <Chip tone="gray">{items.length} group(s)</Chip>
      </div>

      <div className="pres-breakdown-grid">
        {items.map((item) => (
          <article key={item.name} className="pres-breakdown-card">
            <div className="pres-breakdown-top">
              <strong>{item.name}</strong>
              <Chip tone={tone}>{item.average !== undefined ? `${item.average}%` : item.count}</Chip>
            </div>

            <div className="pres-bar-track">
              <div style={{ width: `${item.average !== undefined ? item.average : total ? Math.round((item.count / total) * 100) : 0}%` }} />
            </div>

            <div className="pres-chip-row">
              <Chip tone="gray">{item.count} record(s)</Chip>
              {item.average !== undefined && <Chip tone={scoreTone(item.average)}>{item.average}% avg</Chip>}
            </div>
          </article>
        ))}

        {!items.length && <EmptyCard text={`No ${title.toLowerCase()} available for the selected filters.`} />}
      </div>
    </section>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`pres-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pres-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="pres-empty-card">
      <div className="pres-empty-icon">📊</div>
      <h3>No result data</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes presSpin { to { transform: rotate(360deg); } }

.pres-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--pres-primary) 10%, transparent), transparent 34rem),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 16px);
  overflow-x: hidden;
}

.pres-page *,
.pres-page *::before,
.pres-page *::after { box-sizing: border-box; }

.pres-page button,
.pres-page input,
.pres-page select {
  font: inherit;
  max-width: 100%;
}

.pres-page input,
.pres-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid var(--input-border, var(--border, rgba(148,163,184,.28)));
  border-radius: 15px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #0f172a));
  outline: none;
  font-weight: 750;
}

.pres-page input:focus,
.pres-page select:focus {
  border-color: var(--pres-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pres-primary) 12%, transparent);
}

.pres-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: var(--shell-shadow, 0 24px 60px rgba(15,23,42,.08));
  text-align: center;
}

.pres-state-card h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pres-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.pres-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--pres-primary) 18%, transparent);
  border-top-color: var(--pres-primary);
  animation: presSpin .8s linear infinite;
}

.pres-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--pres-primary) 16%, transparent), transparent 20rem),
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--pres-primary) 7%, var(--card, #fff)) 72%);
  border: 1px solid var(--border, rgba(148,163,184,.22));
  box-shadow: 0 18px 46px rgba(15,23,42,.07);
  overflow: hidden;
}

.pres-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.pres-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--pres-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--pres-primary) 28%, transparent);
  font-size: 22px;
}

.pres-title-wrap { min-width: 0; }

.pres-title-wrap p,
.pres-title-wrap h2,
.pres-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pres-title-wrap p {
  margin: 0 0 2px;
  color: var(--pres-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pres-title-wrap h2 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.pres-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pres-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pres-ghost-btn,
.pres-table-btn,
.pres-action-row button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-weight: 950;
  cursor: pointer;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
}

.pres-context-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.pres-context-grid article {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--pres-primary) 10%, var(--card, var(--surface, #fff))), var(--card, var(--surface, #fff)) 70%);
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.04);
}

.pres-context-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--pres-primary);
  color: #fff;
  font-size: 20px;
}

.pres-context-grid article > div:last-child { min-width: 0; }

.pres-context-grid span {
  display: block;
  color: var(--pres-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pres-context-grid strong {
  display: block;
  margin-top: 3px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pres-context-grid p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.pres-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.pres-summary-card,
.pres-toolbar,
.pres-filter-card,
.pres-table-card,
.pres-breakdown-card,
.pres-card,
.pres-empty-card,
.pres-mode-tabs {
  background: var(--card, var(--surface, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.2));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.pres-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  overflow: hidden;
}

.pres-summary-card.positive { background: linear-gradient(135deg, rgba(34,197,94,.10), var(--card, var(--surface, #fff))); }
.pres-summary-card.warning { background: linear-gradient(135deg, rgba(245,158,11,.10), var(--card, var(--surface, #fff))); }

.pres-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--pres-primary) 12%, var(--surface, #fff));
}

.pres-summary-card div:last-child { min-width: 0; }

.pres-summary-card strong,
.pres-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pres-summary-card strong {
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pres-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.pres-mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  padding: 6px;
  border-radius: 22px;
}

.pres-mode-tabs button {
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--text, #0f172a);
  font-weight: 950;
  cursor: pointer;
}

.pres-mode-tabs button.active {
  background: var(--pres-primary);
  color: #fff;
}

.pres-toolbar,
.pres-filter-card,
.pres-table-card {
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
}

.pres-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pres-view-tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  width: min(390px, 100%);
  padding: 4px;
  border-radius: 999px;
  background: var(--shell-section-bg, color-mix(in srgb, var(--pres-primary) 7%, var(--surface, #fff)));
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.pres-view-tabs button {
  min-width: 0;
  min-height: 35px;
  border: 0;
  border-radius: 999px;
  padding: 0 9px;
  background: transparent;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.pres-view-tabs button.active {
  background: var(--pres-primary);
  color: #fff;
}

.pres-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.pres-section { margin-top: 16px; }

.pres-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.pres-section-head p {
  margin: 0;
  color: var(--pres-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pres-section-head h3 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 19px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pres-list,
.pres-breakdown-grid {
  display: grid;
  gap: 10px;
}

.pres-card,
.pres-breakdown-card,
.pres-empty-card {
  min-width: 0;
  border-radius: 24px;
  padding: 13px;
  overflow: hidden;
}

.pres-card {
  background:
    linear-gradient(135deg, var(--card, var(--surface, #fff)), color-mix(in srgb, var(--pres-primary) 4%, var(--card, #fff)));
}

.pres-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pres-card-icon,
.pres-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 19px;
  background: var(--pres-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
  overflow: hidden;
}

.pres-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pres-card-main { min-width: 0; flex: 1; }

.pres-card-main h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.pres-card-main p {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.pres-chip-row,
.pres-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.pres-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.pres-chip.green { background: rgba(34,197,94,.14); color: #22c55e; }
.pres-chip.red { background: rgba(239,68,68,.14); color: #ef4444; }
.pres-chip.blue { background: rgba(59,130,246,.15); color: #60a5fa; }
.pres-chip.gray { background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent); color: var(--muted, #64748b); }
.pres-chip.orange { background: rgba(245,158,11,.16); color: #f59e0b; }
.pres-chip.purple { background: rgba(147,51,234,.15); color: #a855f7; }

.pres-mini-grid,
.pres-drawer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.pres-mini-stat {
  min-width: 0;
  padding: 9px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.13));
  overflow: hidden;
}

.pres-mini-stat strong,
.pres-mini-stat span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pres-mini-stat strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
}

.pres-mini-stat span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 850;
}

.pres-breakdown-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.pres-breakdown-card strong {
  min-width: 0;
  display: block;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pres-bar-track {
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);
  overflow: hidden;
}

.pres-bar-track div {
  height: 100%;
  border-radius: inherit;
  background: var(--pres-primary);
}

.pres-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border, rgba(148,163,184,.18));
}

.pres-table-scroll table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--card, var(--surface, #fff));
}

.pres-table-scroll th,
.pres-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(148,163,184,.16));
  text-align: left;
  vertical-align: top;
  color: var(--text, #0f172a);
  font-size: 13px;
}

.pres-table-scroll th {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
  background: color-mix(in srgb, var(--pres-primary) 6%, var(--card, #fff));
}

.pres-table-scroll td strong,
.pres-table-scroll td span {
  display: block;
}

.pres-table-scroll td span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 11px;
}

.pres-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 190px;
  text-align: center;
  border-style: dashed;
}

.pres-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--pres-primary) 12%, var(--surface, #fff));
  font-size: 28px;
}

.pres-empty-card h3 {
  margin: 0;
  color: var(--text, #0f172a);
  font-size: 18px;
  font-weight: 1000;
}

.pres-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.pres-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.pres-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15,23,42,.52);
}

.pres-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 620px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card, var(--surface, #fff));
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: var(--shell-shadow, -24px 0 70px rgba(15,23,42,.22));
}

.pres-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--card, var(--surface, #fff));
}

.pres-drawer-head div { min-width: 0; }

.pres-drawer-head p {
  margin: 0;
  color: var(--pres-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.pres-drawer-head h2,
.pres-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pres-drawer-head h2 {
  margin: 2px 0 0;
  color: var(--text, #0f172a);
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.pres-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pres-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(148,163,184,.24));
  border-radius: 15px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 1000;
  cursor: pointer;
}

.pres-drawer-section {
  margin-top: 16px;
}

.pres-drawer-section h3 {
  margin: 0 0 10px;
  color: var(--text, #0f172a);
  font-size: 16px;
  font-weight: 1000;
}

.pres-line-list {
  display: grid;
  gap: 7px;
}

.pres-line-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted, #64748b) 9%, transparent);
  border: 1px solid var(--border, rgba(148,163,184,.14));
}

.pres-line-list span {
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.pres-line-list strong {
  color: var(--text, #0f172a);
  font-size: 13px;
  font-weight: 1000;
  text-align: right;
}

.pres-message-body {
  margin-top: 14px;
  padding: 14px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--pres-primary) 7%, var(--card, #fff));
  border: 1px solid var(--border, rgba(148,163,184,.14));
  color: var(--text, #0f172a);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (min-width: 680px) {
  .pres-page { padding: 12px; }
  .pres-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pres-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pres-context-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .pres-page { padding: 16px; }
  .pres-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .pres-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .pres-list,
  .pres-breakdown-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .pres-page { padding: 6px; }
  .pres-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .pres-hero-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
  .pres-ghost-btn { width: 100%; }
  .pres-summary-grid { gap: 6px; }
  .pres-summary-card { padding: 10px; border-radius: 19px; }
  .pres-summary-card strong { font-size: 16px; }
  .pres-mode-tabs { grid-template-columns: 1fr; border-radius: 20px; }
  .pres-toolbar { align-items: stretch; flex-direction: column; border-radius: 20px; }
  .pres-view-tabs { width: 100%; }
  .pres-card,
  .pres-empty-card,
  .pres-breakdown-card { border-radius: 20px; padding: 11px; }
  .pres-card-icon,
  .pres-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .pres-mini-grid,
  .pres-drawer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pres-action-row { display: grid; grid-template-columns: minmax(0, 1fr); }
  .pres-action-row button { width: 100%; }
  .pres-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
