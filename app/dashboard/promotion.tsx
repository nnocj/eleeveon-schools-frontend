"use client";

/**
 * app/dashboard/promotion.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE STUDENT PROMOTION CENTER
 * ---------------------------------------------------------
 *
 * Correct report-engine integration:
 * buildReportEngineOutput().classReports returns:
 *   { header, student, report }
 *
 * Promotion rows read:
 *   item.report.total
 *   item.report.average
 *   item.report.overallPosition
 *   item.report.subjectResults
 *
 * Rule:
 *   average < 50  => Repeat
 *   average >= 50 => Promote
 *   no next class => Graduate
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Report engine dataset is same-tenant filtered.
 * - Mobile-first cards; desktop keeps a compact table option.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useActiveBranch } from "../context/active-branch-context";
import { useSettings } from "../context/settings-context";

import {
  db,
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
  ClassTeacher,
  ComputedResult,
  GradeRule,
  GradingSystem,
  Parent,
  ReportCard,
  ReportCardItem,
  School,
  SchoolBranchSetting,
  Student,
  StudentEnrollment,
  StudentParent,
  StudentPromotion,
  StudentReportSnapshot,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

import { buildReportEngineOutput } from "./reports/engine/report-engine";
import type {
  ComputedStudentReport,
  ReportEngineDataset,
  ReportFiltersState,
} from "./reports/engine/report-types";

// ======================================================
// TYPES
// ======================================================

type Decision = "promote" | "repeat" | "graduate";
type DecisionFilter = "all" | Decision | "selected" | "notProcessed";
type ViewMode = "cards" | "table";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type PromotionRow = {
  student: Student;
  enrollment?: StudentEnrollment;
  engineReport?: ComputedStudentReport;
  storedReportCard?: ReportCard;

  fromClassId: number;
  fromAcademicStructureId?: number;
  fromAcademicPeriodId?: number;

  total: number;
  average: number;
  position?: number;
  subjectCount: number;

  recommendation: Decision;
  finalDecision: Decision;
  recommendedClassId?: number;
  finalClassId?: number;

  selected: boolean;
  note: string;
  alreadyProcessed: boolean;
};

type OverrideState = Record<
  number,
  {
    selected?: boolean;
    finalDecision?: Decision;
    finalClassId?: number;
    note?: string;
  }
>;

// ======================================================
// HELPERS
// ======================================================

const todayISO = () => new Date().toISOString().slice(0, 10);

const decisionLabel: Record<Decision, string> = {
  promote: "Promote",
  repeat: "Repeat",
  graduate: "Graduate",
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortNamed<T extends { name?: string; order?: number; id?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    const orderA = safeNumber(a.order, 9999);
    const orderB = safeNumber(b.order, 9999);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function recommendationFromAverage(average: number, hasNextClass: boolean): Decision {
  if (!hasNextClass) return "graduate";
  return average < 50 ? "repeat" : "promote";
}

function decisionTone(decision: Decision): "green" | "orange" | "purple" {
  if (decision === "promote") return "green";
  if (decision === "graduate") return "purple";
  return "orange";
}

function isActiveStudent(student: Student) {
  return !student.isDeleted && student.status !== "withdrawn" && student.status !== "graduated";
}

// ======================================================
// COMPONENT
// ======================================================

export default function PromotionPage() {
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

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schoolBranchSettings, setSchoolBranchSettings] = useState<SchoolBranchSetting[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<StudentEnrollment[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);
  const [assessmentStructureItems, setAssessmentStructureItems] = useState<AssessmentStructureItem[]>([]);
  const [assessmentEntries, setAssessmentEntries] = useState<AssessmentEntry[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystem[]>([]);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [computedResults, setComputedResults] = useState<ComputedResult[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [reportCardItems, setReportCardItems] = useState<ReportCardItem[]>([]);
  const [promotions, setPromotions] = useState<StudentPromotion[]>([]);

  const [fromAcademicStructureId, setFromAcademicStructureId] = useState<number | undefined>();
  const [fromAcademicPeriodId, setFromAcademicPeriodId] = useState<number | undefined>();
  const [fromClassId, setFromClassId] = useState<number | undefined>();

  const [toAcademicStructureId, setToAcademicStructureId] = useState<number | undefined>();
  const [toAcademicPeriodId, setToAcademicPeriodId] = useState<number | undefined>();
  const [defaultToClassId, setDefaultToClassId] = useState<number | undefined>();

  const [rowOverrides, setRowOverrides] = useState<OverrideState>({});
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
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
  // LOAD DB DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const sameTenantLoose = (row: TenantRow) => {
    if (row.isDeleted) return false;
    if (row.accountId && row.accountId !== accountId) return false;
    if (row.schoolId && row.schoolId !== schoolId) return false;
    if (row.branchId && row.branchId !== branchId) return false;
    return true;
  };

  const clearData = () => {
    setSchools([]);
    setBranches([]);
    setSchoolBranchSettings([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setClasses([]);
    setSubjects([]);
    setStudents([]);
    setTeachers([]);
    setParents([]);
    setStudentParents([]);
    setClassTeachers([]);
    setClassSubjects([]);
    setStudentEnrollments([]);
    setAssessmentApplicabilities([]);
    setAssessmentStructures([]);
    setAssessmentStructureItems([]);
    setAssessmentEntries([]);
    setGradingSystems([]);
    setGradeRules([]);
    setAttendance([]);
    setComputedResults([]);
    setReportCards([]);
    setReportCardItems([]);
    setPromotions([]);
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
        schoolRows,
        branchRows,
        settingRows,
        structureRows,
        periodRows,
        classRows,
        subjectRows,
        studentRows,
        teacherRows,
        parentRows,
        studentParentRows,
        classTeacherRows,
        classSubjectRows,
        enrollmentRows,
        applicabilityRows,
        assessmentStructureRows,
        assessmentStructureItemRows,
        assessmentEntryRows,
        gradingSystemRows,
        gradeRuleRows,
        attendanceRows,
        computedRows,
        reportRows,
        reportItemRows,
        promotionRows,
      ] = await Promise.all([
        db.schools.toArray(),
        db.branches.toArray(),
        db.schoolBranchSettings.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.parents.toArray(),
        db.studentParents.toArray(),
        db.classTeachers.toArray(),
        db.classSubjects.toArray(),
        db.studentEnrollments.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentStructures.toArray(),
        db.assessmentStructureItems.toArray(),
        db.assessmentEntries.toArray(),
        db.gradingSystems.toArray(),
        db.gradeRules.toArray(),
        db.attendance.toArray(),
        db.computedResults.toArray(),
        db.reportCards.toArray(),
        db.reportCardItems.toArray(),
        db.studentPromotions.toArray(),
      ]);

      setSchools(schoolRows.filter((row) => sameTenantLoose(row) || row.id === schoolId));
      setBranches(branchRows.filter((row) => sameTenantLoose(row) || row.id === branchId));
      setSchoolBranchSettings(settingRows.filter(sameTenantLoose));
      setAcademicStructures(structureRows.filter((row) => sameTenant(row) && row.active !== false));
      setAcademicPeriods(periodRows.filter((row) => sameTenant(row) && row.active !== false));
      setClasses(classRows.filter((row) => sameTenant(row) && row.active !== false));
      setSubjects(subjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setStudents(studentRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setParents(parentRows.filter(sameTenant));
      setStudentParents(studentParentRows.filter(sameTenant));
      setClassTeachers(classTeacherRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter((row) => sameTenant(row) && row.active !== false));
      setStudentEnrollments(enrollmentRows.filter(sameTenant));
      setAssessmentApplicabilities(applicabilityRows.filter((row) => sameTenant(row) && row.active !== false));
      setAssessmentStructures(assessmentStructureRows.filter((row) => sameTenant(row) && row.active !== false));
      setAssessmentStructureItems(assessmentStructureItemRows.filter(sameTenant));
      setAssessmentEntries(assessmentEntryRows.filter(sameTenant));
      setGradingSystems(gradingSystemRows.filter((row) => sameTenant(row) && row.active !== false));
      setGradeRules(gradeRuleRows.filter(sameTenant));
      setAttendance(attendanceRows.filter(sameTenant));
      setComputedResults(computedRows.filter(sameTenant));
      setReportCards(reportRows.filter(sameTenant));
      setReportCardItems(reportItemRows.filter(sameTenant));
      setPromotions(promotionRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load promotion data:", error);
      clearData();
      alert("Failed to load promotion data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("school-branch-settings-updated", refresh);
    window.addEventListener("school-branch-context-changed", refresh);
    return () => {
      window.removeEventListener("school-branch-settings-updated", refresh);
      window.removeEventListener("school-branch-context-changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // BRANCH DATA
  // ======================================================

  const currentSetting = useMemo(() => {
    return (
      schoolBranchSettings.find((row) => row.schoolId === schoolId && row.branchId === branchId) ||
      settings ||
      undefined
    );
  }, [schoolBranchSettings, schoolId, branchId, settings]);

  const branchAcademicStructures = useMemo(() => sortNamed(academicStructures), [academicStructures]);
  const branchAcademicPeriods = useMemo(() => sortNamed(academicPeriods), [academicPeriods]);
  const branchClasses = useMemo(() => sortNamed(classes), [classes]);
  const branchStudents = useMemo(() => students.filter(isActiveStudent), [students]);
  const branchStudentEnrollments = studentEnrollments;
  const branchReportCards = reportCards;
  const branchPromotions = promotions;

  // ======================================================
  // DEFAULT FILTERS
  // ======================================================

  useEffect(() => {
    if (!fromAcademicStructureId) {
      const next = currentSetting?.currentAcademicStructureId || branchAcademicStructures[0]?.id;
      if (next) {
        setFromAcademicStructureId(next);
        setToAcademicStructureId((prev) => prev || next);
      }
    }

    if (!fromAcademicPeriodId) {
      const next = currentSetting?.currentAcademicPeriodId || branchAcademicPeriods[0]?.id;
      if (next) setFromAcademicPeriodId(next);
    }
  }, [
    currentSetting?.currentAcademicStructureId,
    currentSetting?.currentAcademicPeriodId,
    branchAcademicStructures,
    branchAcademicPeriods,
    fromAcademicStructureId,
    fromAcademicPeriodId,
  ]);

  const fromPeriods = useMemo(() => {
    return branchAcademicPeriods.filter((row) => {
      if (!fromAcademicStructureId) return true;
      return row.academicStructureId === fromAcademicStructureId;
    });
  }, [branchAcademicPeriods, fromAcademicStructureId]);

  const toPeriods = useMemo(() => {
    return branchAcademicPeriods.filter((row) => {
      if (!toAcademicStructureId) return true;
      return row.academicStructureId === toAcademicStructureId;
    });
  }, [branchAcademicPeriods, toAcademicStructureId]);

  const availableFromClasses = useMemo(() => {
    const classIds = new Set<number>();

    branchStudentEnrollments.forEach((enrollment) => {
      if (enrollment.status !== "active") return;
      if (fromAcademicStructureId && enrollment.academicStructureId !== fromAcademicStructureId) return;
      if (fromAcademicPeriodId && enrollment.academicPeriodId !== fromAcademicPeriodId) return;
      classIds.add(enrollment.classId);
    });

    const classesWithEnrollments = branchClasses.filter((row) => row.id && classIds.has(row.id));
    return classesWithEnrollments.length ? classesWithEnrollments : branchClasses;
  }, [branchStudentEnrollments, branchClasses, fromAcademicStructureId, fromAcademicPeriodId]);

  useEffect(() => {
    if (!fromClassId && availableFromClasses[0]?.id) {
      setFromClassId(availableFromClasses[0].id);
    }
  }, [availableFromClasses, fromClassId]);

  const nextAvailableClassId = useMemo(() => {
    if (!fromClassId) return undefined;
    const index = branchClasses.findIndex((row) => row.id === fromClassId);
    if (index < 0) return undefined;
    return branchClasses[index + 1]?.id;
  }, [branchClasses, fromClassId]);

  useEffect(() => {
    if (!defaultToClassId && nextAvailableClassId) {
      setDefaultToClassId(nextAvailableClassId);
    }
  }, [defaultToClassId, nextAvailableClassId]);

  useEffect(() => {
    if (!toAcademicStructureId) {
      setToAcademicStructureId(
        fromAcademicStructureId || currentSetting?.currentAcademicStructureId || branchAcademicStructures[0]?.id
      );
    }
  }, [toAcademicStructureId, fromAcademicStructureId, currentSetting?.currentAcademicStructureId, branchAcademicStructures]);

  useEffect(() => {
    if (!toAcademicPeriodId) {
      const currentIndex = branchAcademicPeriods.findIndex((row) => row.id === fromAcademicPeriodId);
      const nextPeriod = currentIndex >= 0 ? branchAcademicPeriods[currentIndex + 1] : undefined;
      setToAcademicPeriodId(nextPeriod?.id || fromAcademicPeriodId || branchAcademicPeriods[0]?.id);
    }
  }, [toAcademicPeriodId, fromAcademicPeriodId, branchAcademicPeriods]);

  // ======================================================
  // REPORT ENGINE DATASET
  // ======================================================

  const reportDataset = useMemo<ReportEngineDataset>(() => {
    return {
      schools,
      branches,
      schoolBranchSettings,
      academicStructures,
      academicPeriods,
      students,
      teachers,
      parents,
      studentParents,
      classes,
      subjects,
      classSubjects,
      studentEnrollments,
      classTeachers,
      assessmentApplicabilities,
      assessmentStructures,
      assessmentStructureItems,
      assessmentEntries,
      gradingSystems,
      gradeRules,
      attendance,
      computedResults,
      reportCards,
      reportCardItems,
    };
  }, [
    schools,
    branches,
    schoolBranchSettings,
    academicStructures,
    academicPeriods,
    students,
    teachers,
    parents,
    studentParents,
    classes,
    subjects,
    classSubjects,
    studentEnrollments,
    classTeachers,
    assessmentApplicabilities,
    assessmentStructures,
    assessmentStructureItems,
    assessmentEntries,
    gradingSystems,
    gradeRules,
    attendance,
    computedResults,
    reportCards,
    reportCardItems,
  ]);

  const reportFilters = useMemo<ReportFiltersState>(() => {
    return {
      branchId: branchId || undefined,
      academicStructureId: fromAcademicStructureId,
      academicPeriodId: fromAcademicPeriodId,
      classId: fromClassId,
      classSubjectId: undefined,
      studentId: undefined,
      sortMode: "position",
    };
  }, [branchId, fromAcademicStructureId, fromAcademicPeriodId, fromClassId]);

  const reportEngineOutput = useMemo(() => {
    if (!branchId || !fromAcademicStructureId || !fromAcademicPeriodId || !fromClassId) {
      return undefined;
    }

    try {
      return buildReportEngineOutput(reportDataset, reportFilters);
    } catch (error) {
      console.error("Report engine failed inside promotion page:", error);
      return undefined;
    }
  }, [branchId, fromAcademicStructureId, fromAcademicPeriodId, fromClassId, reportDataset, reportFilters]);

  const engineReportMap = useMemo(() => {
    const map = new Map<number, ComputedStudentReport>();

    (reportEngineOutput?.classReports || []).forEach((item: any) => {
      const report = item?.report as ComputedStudentReport | undefined;
      if (report?.studentId) {
        map.set(report.studentId, report);
      }
    });

    return map;
  }, [reportEngineOutput]);

  const engineWarnings = reportEngineOutput?.warnings || [];

  // ======================================================
  // SOURCE ENROLLMENTS
  // ======================================================

  const sourceEnrollments = useMemo(() => {
    if (!fromClassId) return [];

    const strict = branchStudentEnrollments.filter((row) => {
      if (row.status !== "active") return false;
      if (row.classId !== fromClassId) return false;
      if (fromAcademicStructureId && row.academicStructureId !== fromAcademicStructureId) return false;
      if (fromAcademicPeriodId && row.academicPeriodId !== fromAcademicPeriodId) return false;
      return true;
    });

    if (strict.length) return strict;

    return branchStudents
      .filter((student) => student.currentClassId === fromClassId && student.id)
      .map(
        (student) =>
          ({
            id: undefined,
            accountId,
            schoolId: Number(schoolId),
            branchId: Number(branchId || student.branchId),
            studentId: Number(student.id),
            classId: fromClassId,
            academicStructureId: Number(fromAcademicStructureId || currentSetting?.currentAcademicStructureId || 0),
            academicPeriodId: Number(fromAcademicPeriodId || currentSetting?.currentAcademicPeriodId || 0),
            startDate: todayISO(),
            status: "active",
          }) as StudentEnrollment
      );
  }, [
    branchStudentEnrollments,
    branchStudents,
    fromClassId,
    fromAcademicStructureId,
    fromAcademicPeriodId,
    currentSetting?.currentAcademicStructureId,
    currentSetting?.currentAcademicPeriodId,
    accountId,
    schoolId,
    branchId,
  ]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(() => new Map(branchStudents.map((row) => [row.id, row])), [branchStudents]);
  const classMap = useMemo(() => new Map(branchClasses.map((row) => [row.id, row])), [branchClasses]);
  const periodMap = useMemo(() => new Map(branchAcademicPeriods.map((row) => [row.id, row])), [branchAcademicPeriods]);
  const structureMap = useMemo(() => new Map(branchAcademicStructures.map((row) => [row.id, row])), [branchAcademicStructures]);

  // ======================================================
  // PROMOTION ROWS
  // ======================================================

  const generatedRows = useMemo<PromotionRow[]>(() => {
    return sourceEnrollments
      .map((enrollment) => {
        const student = studentMap.get(enrollment.studentId);
        if (!student?.id) return undefined;

        const engineReport = engineReportMap.get(student.id);

        const storedReportCard = branchReportCards.find((row) => {
          if (row.studentId !== student.id) return false;
          if (row.classId !== enrollment.classId) return false;
          if (enrollment.academicStructureId && row.academicStructureId !== enrollment.academicStructureId) return false;
          if (enrollment.academicPeriodId && row.academicPeriodId !== enrollment.academicPeriodId) return false;
          return true;
        });

        const total = safeNumber(engineReport?.total, safeNumber(storedReportCard?.total, 0));
        const average = safeNumber(engineReport?.average, safeNumber(storedReportCard?.average, 0));
        const position = engineReport?.overallPosition || storedReportCard?.position;
        const subjectCount = engineReport?.subjectResults?.length || 0;

        const hasNextClass = !!defaultToClassId || !!nextAvailableClassId;
        const recommendation = recommendationFromAverage(average, hasNextClass);

        const alreadyProcessed = branchPromotions.some((row) => {
          if (row.studentId !== student.id) return false;
          if (row.fromClassId !== enrollment.classId) return false;
          if (enrollment.academicStructureId && row.fromAcademicStructureId !== enrollment.academicStructureId) return false;
          if (enrollment.academicPeriodId && row.fromAcademicPeriodId !== enrollment.academicPeriodId) return false;
          return !row.isDeleted;
        });

        const recommendedClassId =
          recommendation === "promote"
            ? defaultToClassId || nextAvailableClassId
            : recommendation === "repeat"
            ? enrollment.classId
            : undefined;

        const override = rowOverrides[student.id] || {};
        const finalDecision = override.finalDecision || recommendation;
        const finalClassId =
          override.finalClassId ??
          (finalDecision === "promote"
            ? defaultToClassId || recommendedClassId
            : finalDecision === "repeat"
            ? enrollment.classId
            : undefined);

        return {
          student,
          enrollment,
          engineReport,
          storedReportCard,
          fromClassId: enrollment.classId,
          fromAcademicStructureId: enrollment.academicStructureId || fromAcademicStructureId,
          fromAcademicPeriodId: enrollment.academicPeriodId || fromAcademicPeriodId,
          total,
          average,
          position,
          subjectCount,
          recommendation,
          finalDecision,
          recommendedClassId,
          finalClassId,
          selected: override.selected ?? !alreadyProcessed,
          note: override.note || "",
          alreadyProcessed,
        } as PromotionRow;
      })
      .filter((row): row is PromotionRow => !!row)
      .sort((a, b) => b.average - a.average || a.student.fullName.localeCompare(b.student.fullName));
  }, [
    sourceEnrollments,
    studentMap,
    engineReportMap,
    branchReportCards,
    branchPromotions,
    rowOverrides,
    defaultToClassId,
    nextAvailableClassId,
    fromAcademicStructureId,
    fromAcademicPeriodId,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return generatedRows.filter((row) => {
      if (decisionFilter === "selected" && !row.selected) return false;
      if (decisionFilter === "notProcessed" && row.alreadyProcessed) return false;
      if (["promote", "repeat", "graduate"].includes(decisionFilter)) {
        if (row.finalDecision !== decisionFilter) return false;
      }

      if (!query) return true;

      return `${row.student.fullName} ${row.student.admissionNumber || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [generatedRows, search, decisionFilter]);

  const selectedRows = useMemo(
    () => generatedRows.filter((row) => row.selected && !row.alreadyProcessed),
    [generatedRows]
  );

  const summary = useMemo(() => {
    const total = generatedRows.length;
    const selected = selectedRows.length;
    const promote = generatedRows.filter((row) => row.finalDecision === "promote").length;
    const repeat = generatedRows.filter((row) => row.finalDecision === "repeat").length;
    const graduate = generatedRows.filter((row) => row.finalDecision === "graduate").length;
    const processed = generatedRows.filter((row) => row.alreadyProcessed).length;
    const classAverage = total
      ? Number((generatedRows.reduce((sum, row) => sum + row.average, 0) / total).toFixed(2))
      : 0;

    return { total, selected, promote, repeat, graduate, processed, classAverage };
  }, [generatedRows, selectedRows]);

  const warnings = useMemo(() => {
    const list: string[] = [];

    if (!schoolId) list.push("No active school selected.");
    if (!branchId) list.push("No active branch selected.");
    if (branchId && !branchAcademicStructures.length) list.push("No academic structures found for this branch.");
    if (branchId && !branchAcademicPeriods.length) list.push("No academic periods found for this branch.");
    if (branchId && !branchClasses.length) list.push("No classes found for this branch.");
    if (branchId && !branchStudents.length) list.push("No active students found for this branch.");
    if (fromClassId && !sourceEnrollments.length) list.push("No active enrollments/current-class students found for this class.");
    if (fromClassId && sourceEnrollments.length && !engineReportMap.size) {
      list.push("Report engine returned no class reports. Check class subjects, assessment applicability, enrollments, and assessment entries.");
    }
    if (generatedRows.length && generatedRows.some((row) => row.subjectCount === 0)) {
      list.push("Some students have no subject results from the report engine, so their average may show 0%.");
    }

    return [...list, ...engineWarnings];
  }, [
    schoolId,
    branchId,
    branchAcademicStructures.length,
    branchAcademicPeriods.length,
    branchClasses.length,
    branchStudents.length,
    fromClassId,
    sourceEnrollments.length,
    engineReportMap.size,
    generatedRows,
    engineWarnings,
  ]);

  // ======================================================
  // ROW ACTIONS
  // ======================================================

  const updateRow = (studentId: number, patch: Partial<PromotionRow>) => {
    setRowOverrides((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        selected: patch.selected ?? prev[studentId]?.selected,
        finalDecision: patch.finalDecision ?? prev[studentId]?.finalDecision,
        finalClassId: patch.finalClassId ?? prev[studentId]?.finalClassId,
        note: patch.note ?? prev[studentId]?.note,
      },
    }));
  };

  const selectAllFiltered = (selected: boolean) => {
    setRowOverrides((prev) => {
      const next = { ...prev };
      filteredRows.forEach((row) => {
        if (row.alreadyProcessed || !row.student.id) return;
        next[row.student.id] = { ...next[row.student.id], selected };
      });
      return next;
    });
  };

  const applyDecisionToFiltered = (decision: Decision) => {
    setRowOverrides((prev) => {
      const next = { ...prev };

      filteredRows.forEach((row) => {
        if (!row.student.id || row.alreadyProcessed) return;
        const finalClassId =
          decision === "promote"
            ? defaultToClassId || row.recommendedClassId
            : decision === "repeat"
            ? row.fromClassId
            : undefined;

        next[row.student.id] = {
          ...next[row.student.id],
          finalDecision: decision,
          finalClassId,
        };
      });

      return next;
    });
  };

  // ======================================================
  // PROMOTION SAVE
  // ======================================================

  const buildSnapshotData = (row: PromotionRow) => ({
    student: row.student,
    class: classMap.get(row.fromClassId),
    academicPeriod: row.fromAcademicPeriodId ? periodMap.get(row.fromAcademicPeriodId) : undefined,
    academicStructure: row.fromAcademicStructureId ? structureMap.get(row.fromAcademicStructureId) : undefined,
    reportCard: row.storedReportCard,
    engineReport: row.engineReport,
    subjectResults: row.engineReport?.subjectResults || [],
    total: row.total,
    average: row.average,
    position: row.position,
    recommendation: row.recommendation,
    finalDecision: row.finalDecision,
    promotedToClassId: row.finalClassId,
    generatedAt: new Date().toISOString(),
  });

  const promoteSelected = async () => {
    if (!authenticated || !accountId) return alert("Sign in first");
    if (!schoolId) return alert("No active school selected");
    if (!branchId) return alert("No active branch selected");
    if (!fromClassId) return alert("Select the current class first");
    if (!selectedRows.length) return alert("No students selected");

    const invalid = selectedRows.filter((row) => {
      if (row.finalDecision === "graduate") return false;
      return !row.finalClassId || !toAcademicStructureId || !toAcademicPeriodId;
    });

    if (invalid.length) {
      return alert("Some selected students need destination class, next academic structure, and next academic period.");
    }

    const confirmed = window.confirm(
      `Process ${selectedRows.length} selected student(s)? This will save report snapshots and update enrollments.`
    );

    if (!confirmed) return;

    try {
      setPromoting(true);

      for (const row of selectedRows) {
        const studentId = row.student.id;
        if (!studentId || row.alreadyProcessed) continue;

        const fromStructureId = row.fromAcademicStructureId || fromAcademicStructureId || currentSetting?.currentAcademicStructureId;
        const fromPeriodId = row.fromAcademicPeriodId || fromAcademicPeriodId || currentSetting?.currentAcademicPeriodId;

        if (!fromStructureId || !fromPeriodId) continue;

        const snapshotPayload = prepareSyncData({
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          studentId,
          classId: row.fromClassId,
          academicStructureId: fromStructureId,
          academicPeriodId: fromPeriodId,
          academicYear: currentSetting?.academicYear || undefined,
          term: currentSetting?.currentTerm || periodMap.get(fromPeriodId)?.name,
          reportData: buildSnapshotData(row),
          total: row.total,
          average: row.average,
          position: row.position,
          recommendation: row.recommendation,
          promotedToClassId: row.finalClassId,
          snapshotType: "promotion",
        }) as StudentReportSnapshot;

        const snapshotId = await db.studentReportSnapshots.add(snapshotPayload);

        const promotionPayload = prepareSyncData({
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
          studentId,
          fromClassId: row.fromClassId,
          toClassId: row.finalDecision === "graduate" ? undefined : row.finalClassId,
          fromAcademicStructureId: fromStructureId,
          toAcademicStructureId: row.finalDecision === "graduate" ? undefined : toAcademicStructureId,
          fromAcademicPeriodId: fromPeriodId,
          toAcademicPeriodId: row.finalDecision === "graduate" ? undefined : toAcademicPeriodId,
          average: row.average,
          recommendation: row.recommendation,
          finalDecision: row.finalDecision,
          snapshotId: Number(snapshotId),
          note: row.note.trim() || undefined,
        }) as StudentPromotion;

        await db.studentPromotions.add(promotionPayload);

        if (row.enrollment?.id) {
          await db.studentEnrollments.update(row.enrollment.id, {
            status: row.finalDecision === "graduate" ? "completed" : "promoted",
            endDate: todayISO(),
            updatedAt: Date.now(),
            synced: false,
          } as any);
        }

        if (row.finalDecision !== "graduate" && row.finalClassId && toAcademicStructureId && toAcademicPeriodId) {
          const existingNextEnrollment = branchStudentEnrollments.find((item) => {
            return (
              item.studentId === studentId &&
              item.classId === row.finalClassId &&
              item.academicStructureId === toAcademicStructureId &&
              item.academicPeriodId === toAcademicPeriodId &&
              item.status === "active" &&
              !item.isDeleted
            );
          });

          if (!existingNextEnrollment) {
            const enrollmentPayload = prepareSyncData({
              accountId,
              schoolId: Number(schoolId),
              branchId: Number(branchId),
              studentId,
              classId: row.finalClassId,
              academicStructureId: toAcademicStructureId,
              academicPeriodId: toAcademicPeriodId,
              startDate: todayISO(),
              status: "active",
            }) as StudentEnrollment;

            await db.studentEnrollments.add(enrollmentPayload);
          }

          await db.students.update(studentId, {
            currentClassId: row.finalClassId,
            status: "active",
            updatedAt: Date.now(),
            synced: false,
          } as any);
        }

        if (row.finalDecision === "graduate") {
          await db.students.update(studentId, {
            status: "graduated",
            updatedAt: Date.now(),
            synced: false,
          } as any);
        }
      }

      setRowOverrides({});
      await load();
      alert("Promotion completed. Report snapshots were saved for cumulative records.");
    } catch (error) {
      console.error("Promotion failed:", error);
      alert("Promotion failed");
    } finally {
      setPromoting(false);
    }
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="promo-page" style={{ "--promo-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="promo-state-card">
          <div className="promo-spinner" />
          <h2>Opening promotion center...</h2>
          <p>Checking account, school, branch, enrollments, reports, and promotion history.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="promo-page" style={{ "--promo-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="promo-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before processing promotions.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="promo-page" style={{ "--promo-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="promo-state-card">
          <h2>Select a branch first</h2>
          <p>Promotions belong to one active school branch.</p>
          <button type="button" className="promo-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="promo-page" style={{ "--promo-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="promo-hero">
        <div className="promo-hero-left">
          <div className="promo-hero-icon">🚀</div>
          <div className="promo-title-wrap">
            <p>Academic Progression</p>
            <h2>Promotion Center</h2>
            <span>
              {activeSchool?.name || `School #${schoolId}`} · {activeBranch?.name || `Branch #${branchId}`}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={promoteSelected}
          disabled={promoting || !selectedRows.length}
          className="promo-primary-btn"
        >
          {promoting ? "Processing..." : `Process ${selectedRows.length}`}
        </button>
      </section>

      <section className="promo-engine-card">
        <div className="promo-chip-row">
          <Chip tone="green">Branch Context Ready</Chip>
          <Chip tone={reportEngineOutput ? "blue" : "orange"}>{reportEngineOutput ? "Report Engine Ready" : "Waiting for Report Engine"}</Chip>
        </div>
        <h3>Promote students using report-engine totals, averages and positions.</h3>
        <p>
          Students below 50% are recommended to repeat. Students at 50% and above are recommended for promotion. If there is no next class, the recommendation becomes graduation.
        </p>
      </section>

      {!!warnings.length && (
        <section className="promo-warning-card">
          <h3>Setup / Data Notice</h3>
          <div>
            {warnings.map((item) => <p key={item}>• {item}</p>)}
          </div>
        </section>
      )}

      <section className="promo-setup-card">
        <div className="promo-section-head">
          <div>
            <h3>Promotion Setup</h3>
            <p>Select current and destination academic context.</p>
          </div>
        </div>

        <div className="promo-filter-grid">
          <select value={fromAcademicStructureId || ""} onChange={(event) => {
            setFromAcademicStructureId(Number(event.target.value) || undefined);
            setFromAcademicPeriodId(undefined);
            setFromClassId(undefined);
          }}>
            <option value="">Current Academic Structure</option>
            {branchAcademicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
          </select>

          <select value={fromAcademicPeriodId || ""} onChange={(event) => {
            setFromAcademicPeriodId(Number(event.target.value) || undefined);
            setFromClassId(undefined);
          }}>
            <option value="">Current Academic Period</option>
            {fromPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>

          <select value={fromClassId || ""} onChange={(event) => {
            setFromClassId(Number(event.target.value) || undefined);
            setDefaultToClassId(undefined);
          }}>
            <option value="">Current Class</option>
            {availableFromClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>

          <select value={toAcademicStructureId || ""} onChange={(event) => {
            setToAcademicStructureId(Number(event.target.value) || undefined);
            setToAcademicPeriodId(undefined);
          }}>
            <option value="">Next Academic Structure</option>
            {branchAcademicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.level}</option>)}
          </select>

          <select value={toAcademicPeriodId || ""} onChange={(event) => setToAcademicPeriodId(Number(event.target.value) || undefined)}>
            <option value="">Next Academic Period</option>
            {toPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>

          <select value={defaultToClassId || ""} onChange={(event) => setDefaultToClassId(Number(event.target.value) || undefined)}>
            <option value="">Default Next Class</option>
            {branchClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
      </section>

      <section className="promo-summary-grid" aria-label="Promotion summary">
        <SummaryCard label="Students" value={summary.total} icon="🎓" />
        <SummaryCard label="Selected" value={summary.selected} icon="✅" />
        <SummaryCard label="Promote" value={summary.promote} icon="⬆️" />
        <SummaryCard label="Repeat" value={summary.repeat} icon="🔁" />
        <SummaryCard label="Graduate" value={summary.graduate} icon="🎉" />
        <SummaryCard label="Processed" value={summary.processed} icon="📌" />
        <SummaryCard label="Class Avg" value={`${summary.classAverage}%`} icon="📊" />
      </section>

      <section className="promo-control-card">
        <div className="promo-filter-grid controls">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or admission number..." />

          <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value as DecisionFilter)}>
            <option value="all">All</option>
            <option value="selected">Selected</option>
            <option value="notProcessed">Not processed</option>
            <option value="promote">Promote</option>
            <option value="repeat">Repeat</option>
            <option value="graduate">Graduate</option>
          </select>

          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
            <option value="cards">Cards View</option>
            <option value="table">Table View</option>
          </select>
        </div>

        <div className="promo-action-bar">
          <button type="button" onClick={() => selectAllFiltered(true)}>Select Shown</button>
          <button type="button" onClick={() => selectAllFiltered(false)}>Clear Shown</button>
          <button type="button" onClick={() => applyDecisionToFiltered("promote")}>Set Promote</button>
          <button type="button" onClick={() => applyDecisionToFiltered("repeat")}>Set Repeat</button>
          <button type="button" onClick={() => applyDecisionToFiltered("graduate")}>Set Graduate</button>
        </div>
      </section>

      {viewMode === "cards" ? (
        <section className="promo-list">
          {filteredRows.map((row) => {
            const studentId = Number(row.student.id);
            const currentClass = classMap.get(row.fromClassId);
            const currentPeriod = row.fromAcademicPeriodId ? periodMap.get(row.fromAcademicPeriodId) : undefined;

            return (
              <article key={studentId} className="promo-student-card">
                <div className="promo-student-top">
                  <label className="promo-select-box">
                    <input
                      type="checkbox"
                      checked={!!row.selected}
                      disabled={row.alreadyProcessed}
                      onChange={(event) => updateRow(studentId, { selected: event.target.checked })}
                    />
                  </label>

                  <div className="promo-avatar">{row.student.fullName.slice(0, 1).toUpperCase()}</div>

                  <div className="promo-student-main">
                    <h3>{row.student.fullName}</h3>
                    <p>{row.student.admissionNumber || "No admission no."} · {currentClass?.name || "Unknown class"} · {currentPeriod?.name || "Unknown period"}</p>
                    <div className="promo-chip-row">
                      <Chip tone={decisionTone(row.recommendation)}>{decisionLabel[row.recommendation]} recommended</Chip>
                      <Chip tone={row.alreadyProcessed ? "gray" : row.selected ? "blue" : "orange"}>{row.alreadyProcessed ? "Processed" : row.selected ? "Ready" : "Not selected"}</Chip>
                    </div>
                  </div>
                </div>

                <div className="promo-stat-grid">
                  <MiniStat label="Total" value={row.total} />
                  <MiniStat label="Average" value={`${row.average}%`} />
                  <MiniStat label="Position" value={row.position || "—"} />
                  <MiniStat label="Subjects" value={row.subjectCount} />
                </div>

                <div className="promo-row-controls">
                  <label>
                    <span>Final Decision</span>
                    <select
                      value={row.finalDecision}
                      disabled={row.alreadyProcessed}
                      onChange={(event) => {
                        const decision = event.target.value as Decision;
                        const finalClassId =
                          decision === "promote"
                            ? defaultToClassId || row.recommendedClassId
                            : decision === "repeat"
                            ? row.fromClassId
                            : undefined;

                        updateRow(studentId, { finalDecision: decision, finalClassId });
                      }}
                    >
                      <option value="promote">Promote</option>
                      <option value="repeat">Repeat</option>
                      <option value="graduate">Graduate</option>
                    </select>
                  </label>

                  <label>
                    <span>Destination Class</span>
                    <select
                      value={row.finalClassId || ""}
                      disabled={row.alreadyProcessed || row.finalDecision === "graduate"}
                      onChange={(event) => updateRow(studentId, { finalClassId: Number(event.target.value) || undefined })}
                    >
                      <option value="">No class</option>
                      {branchClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                    </select>
                  </label>

                  <label className="promo-note-field">
                    <span>Note</span>
                    <input
                      value={row.note}
                      disabled={row.alreadyProcessed}
                      onChange={(event) => updateRow(studentId, { note: event.target.value })}
                      placeholder="Optional note"
                    />
                  </label>
                </div>
              </article>
            );
          })}

          {!filteredRows.length && <EmptyCard text={fromClassId ? "No students found for this class/period. Check enrollments, current class values, and report engine setup." : "Select a current class to load students."} />}
        </section>
      ) : (
        <section className="promo-table-card">
          <div className="promo-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Student</th>
                  <th>Class / Period</th>
                  <th>Total</th>
                  <th>Average</th>
                  <th>Position</th>
                  <th>Recommendation</th>
                  <th>Decision</th>
                  <th>Destination</th>
                  <th>Note</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const studentId = Number(row.student.id);
                  const currentClass = classMap.get(row.fromClassId);
                  const currentPeriod = row.fromAcademicPeriodId ? periodMap.get(row.fromAcademicPeriodId) : undefined;

                  return (
                    <tr key={studentId}>
                      <td><input type="checkbox" checked={!!row.selected} disabled={row.alreadyProcessed} onChange={(event) => updateRow(studentId, { selected: event.target.checked })} /></td>
                      <td><strong>{row.student.fullName}</strong><span>{row.student.admissionNumber || "No admission no."}</span></td>
                      <td><strong>{currentClass?.name || "Unknown class"}</strong><span>{currentPeriod?.name || "Unknown period"}</span></td>
                      <td><strong>{row.total}</strong><span>{row.subjectCount} subject(s)</span></td>
                      <td><strong>{row.average}%</strong></td>
                      <td><strong>{row.position || "—"}</strong></td>
                      <td><Chip tone={decisionTone(row.recommendation)}>{decisionLabel[row.recommendation]}</Chip></td>
                      <td>
                        <select value={row.finalDecision} disabled={row.alreadyProcessed} onChange={(event) => {
                          const decision = event.target.value as Decision;
                          const finalClassId = decision === "promote" ? defaultToClassId || row.recommendedClassId : decision === "repeat" ? row.fromClassId : undefined;
                          updateRow(studentId, { finalDecision: decision, finalClassId });
                        }}>
                          <option value="promote">Promote</option>
                          <option value="repeat">Repeat</option>
                          <option value="graduate">Graduate</option>
                        </select>
                      </td>
                      <td>
                        <select value={row.finalClassId || ""} disabled={row.alreadyProcessed || row.finalDecision === "graduate"} onChange={(event) => updateRow(studentId, { finalClassId: Number(event.target.value) || undefined })}>
                          <option value="">No class</option>
                          {branchClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                        </select>
                      </td>
                      <td><input value={row.note} disabled={row.alreadyProcessed} onChange={(event) => updateRow(studentId, { note: event.target.value })} placeholder="Optional note" /></td>
                      <td><Chip tone={row.alreadyProcessed ? "gray" : row.selected ? "blue" : "orange"}>{row.alreadyProcessed ? "Processed" : row.selected ? "Ready" : "Not selected"}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!filteredRows.length && <EmptyCard text={fromClassId ? "No students found for this class/period." : "Select a current class to load students."} />}
        </section>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="promo-summary-card">
      <div className="promo-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`promo-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="promo-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="promo-empty-card">
      <div className="promo-empty-icon">🚀</div>
      <h3>No promotion rows</h3>
      <p>{text}</p>
    </section>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes promoSpin { to { transform: rotate(360deg); } }

.promo-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.promo-page *, .promo-page *::before, .promo-page *::after { box-sizing: border-box; }
.promo-page button, .promo-page input, .promo-page select, .promo-page textarea { font: inherit; max-width: 100%; }
.promo-page input, .promo-page select, .promo-page textarea {
  width: 100%; min-height: 43px; border: 1px solid rgba(148,163,184,.28); border-radius: 15px;
  padding: 0 12px; background: var(--surface, #fff); color: var(--text, #0f172a); outline: none; font-weight: 750;
}

.promo-state-card { min-height: min(420px, calc(100dvh - 32px)); display: grid; place-items: center; align-content: center; gap: 10px; width: min(480px, 100%); margin: 0 auto; padding: 22px; border-radius: 28px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 24px 60px rgba(15,23,42,.08); text-align: center; }
.promo-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.promo-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.promo-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--promo-primary) 18%, transparent); border-top-color: var(--promo-primary); animation: promoSpin .8s linear infinite; }

.promo-primary-btn { min-height: 46px; border: 0; border-radius: 999px; padding: 0 18px; background: var(--promo-primary); color: #fff; font-weight: 950; cursor: pointer; }
.promo-primary-btn:disabled { opacity: .55; cursor: not-allowed; }

.promo-hero { display: flex; align-items: stretch; justify-content: space-between; gap: 10px; padding: 12px; border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--promo-primary) 12%, #fff), #fff 64%); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 18px 46px rgba(15,23,42,.07); overflow: hidden; }
.promo-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.promo-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--promo-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--promo-primary) 28%, transparent); font-size: 22px; }
.promo-title-wrap { min-width: 0; }
.promo-title-wrap p, .promo-title-wrap h2, .promo-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.promo-title-wrap p { margin: 0 0 2px; color: var(--promo-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.promo-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.promo-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.promo-engine-card, .promo-warning-card, .promo-setup-card, .promo-control-card, .promo-table-card { margin-top: 10px; min-width: 0; padding: 13px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.045); overflow: hidden; }
.promo-engine-card { color: #fff; background: linear-gradient(135deg, var(--promo-primary), #111827); box-shadow: 0 18px 44px rgba(15,23,42,.18); }
.promo-engine-card h3 { margin: 10px 0 0; font-size: clamp(18px, 5vw, 25px); font-weight: 1000; letter-spacing: -.05em; }
.promo-engine-card p { margin: 8px 0 0; max-width: 900px; opacity: .9; font-size: 13px; line-height: 1.6; }
.promo-warning-card { border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.08); }
.promo-warning-card h3 { margin: 0; color: #b45309; font-size: 17px; font-weight: 1000; }
.promo-warning-card p { margin: 7px 0 0; font-size: 12px; font-weight: 750; color: #92400e; line-height: 1.45; }
.promo-section-head h3 { margin: 0; font-size: 18px; font-weight: 1000; letter-spacing: -.04em; }
.promo-section-head p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.promo-filter-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; }

.promo-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.promo-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.04); overflow: hidden; }
.promo-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--promo-primary) 12%, #fff); }
.promo-summary-card div:last-child { min-width: 0; }
.promo-summary-card strong, .promo-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.promo-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.promo-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.promo-action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.promo-action-bar button { min-height: 40px; border: 1px solid rgba(148,163,184,.24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.promo-list { display: grid; gap: 10px; margin-top: 10px; }
.promo-student-card, .promo-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148,163,184,.2); box-shadow: 0 12px 28px rgba(15,23,42,.045); overflow: hidden; padding: 13px; }
.promo-student-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.promo-select-box { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 14px; background: rgba(148,163,184,.1); border: 1px solid rgba(148,163,184,.15); }
.promo-select-box input { width: 16px; min-height: 16px; }
.promo-avatar { width: 52px; height: 52px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; background: var(--promo-primary); color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15,23,42,.12); }
.promo-student-main { min-width: 0; flex: 1; }
.promo-student-main h3, .promo-student-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.promo-student-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.promo-student-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.promo-chip-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.promo-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.promo-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.promo-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.promo-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.promo-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.promo-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.promo-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.promo-engine-card .promo-chip { background: rgba(255,255,255,.18); color: #fff; }
.promo-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.promo-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148,163,184,.09); border: 1px solid rgba(148,163,184,.13); overflow: hidden; }
.promo-mini-stat strong, .promo-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.promo-mini-stat strong { font-size: 16px; font-weight: 1000; }
.promo-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.promo-row-controls { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; margin-top: 10px; }
.promo-row-controls label { display: grid; gap: 5px; min-width: 0; }
.promo-row-controls span { color: var(--muted, #64748b); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .06em; }
.promo-note-field { grid-column: 1 / -1; }
.promo-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.promo-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--promo-primary) 12%, #fff); font-size: 28px; }
.promo-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.promo-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.promo-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.promo-table-wrap table { width: 100%; min-width: 1080px; border-collapse: collapse; }
.promo-table-wrap th, .promo-table-wrap td { padding: 10px; border-bottom: 1px solid rgba(148,163,184,.18); text-align: left; vertical-align: top; }
.promo-table-wrap th { color: #475569; font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .06em; }
.promo-table-wrap td strong, .promo-table-wrap td span { display: block; }
.promo-table-wrap td span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 750; }
.promo-table-wrap input, .promo-table-wrap select { min-width: 140px; }
.promo-table-wrap input[type='checkbox'] { min-width: 16px; width: 16px; min-height: 16px; }

@media (min-width: 680px) {
  .promo-page { padding: 12px; }
  .promo-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .promo-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .promo-filter-grid.controls { grid-template-columns: minmax(0, 1fr) 180px 160px; }
  .promo-row-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .promo-page { padding: 16px; }
  .promo-summary-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .promo-filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .promo-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .promo-page { padding: 6px; }
  .promo-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .promo-primary-btn { width: 100%; }
  .promo-engine-card, .promo-warning-card, .promo-setup-card, .promo-control-card, .promo-table-card { border-radius: 20px; padding: 11px; }
  .promo-summary-grid { gap: 6px; }
  .promo-summary-card { padding: 10px; border-radius: 19px; }
  .promo-summary-card strong { font-size: 16px; }
  .promo-student-card, .promo-empty-card { border-radius: 20px; padding: 11px; }
  .promo-student-top { align-items: flex-start; }
  .promo-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .promo-action-bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .promo-action-bar button { width: 100%; padding: 0 8px; }
}
`;
