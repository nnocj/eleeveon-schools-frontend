"use client";

/**
 * app/branch-admin/modules/Promotion.tsx
 * ---------------------------------------------------------
 * BRANCH ADMIN — STUDENT PROMOTION CENTER
 * Golden compact rewrite
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
 * - All reads/writes are scoped by the selected workspace accountId + schoolId + branchId.
 * - Workspace source follows StudentReports: open workspace -> active membership -> active branch/settings.
 * - Tenant matching is tolerant so string/number IDs and partially synced rows are not wrongly filtered out.
 * - Report engine dataset is same-tenant filtered.
 * - Mobile-first compact row cards like StudentEnrollment; desktop keeps a compact table option.
 * - Card view is now truly dense: smaller padding, avatar, stats, inputs,
 *   chips and grid gaps so more students fit on screen.
 * - Sheets close immediately after choosing a view or bulk action.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";
import { useSettings } from "../../context/settings-context";

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
} from "../../lib/db/db";

import { prepareSyncData } from "../../lib/sync/syncUtils";

import { buildReportEngineOutput } from "./reports/engine/report-engine";
import type {
  ComputedStudentReport,
  ReportEngineDataset,
  ReportFiltersState,
} from "./reports/engine/report-types";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
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
  engineReportItem?: any;
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

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  teacherLocalId?: number | string | null;
  studentLocalId?: number | string | null;
  parentLocalId?: number | string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function idOf(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameTextId(a: unknown, b: unknown) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  return !!left && !!right && left === right;
}

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeJsonRead<T>(key: string): T | null {
  const raw = safeStorageRead(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readOpenWorkspaceSession() {
  return safeJsonRead<OpenWorkspaceSession>(OPEN_WORKSPACE_KEY);
}

function readStoredActiveMembership() {
  return safeJsonRead<Record<string, any>>("activeMembership");
}

function firstLocalId(...values: unknown[]) {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId")
  );
}

function selectedWorkspaceBranchId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeBranchId?: unknown;
  activeBranch?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership = args.openWorkspace?.membership || args.activeMembership || storedMembership || null;

  return firstLocalId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId")
  );
}

function tenantMatches(row: TenantRow, args: { accountId?: string | null; schoolId?: number; branchId?: number }) {
  if (row.isDeleted) return false;

  if (row.accountId && args.accountId && !sameTextId(row.accountId, args.accountId)) return false;
  if (row.schoolId && args.schoolId && idOf(row.schoolId) !== idOf(args.schoolId)) return false;
  if (row.branchId && args.branchId && idOf(row.branchId) !== idOf(args.branchId)) return false;

  return true;
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
  const dataRevision = useDataRevision();

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
  const { activeMembership } = useActiveMembership();

  const openWorkspace = useMemo(() => readOpenWorkspaceSession(), []);

  const schoolId = selectedWorkspaceSchoolId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeSchoolId,
    activeSchool: activeSchool as any,
    settings: settings as any,
  });

  const branchId = selectedWorkspaceBranchId({
    openWorkspace,
    activeMembership: activeMembership as any,
    activeBranchId,
    activeBranch: activeBranch as any,
    settings: settings as any,
  });

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const { loading, setLoading } = useBackgroundLoader();
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedPromotionStudentId, setSelectedPromotionStudentId] = useState<number | null>(null);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    router,
  ]);

  // ======================================================
  // LOAD DB DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    tenantMatches(row, {
      accountId,
      schoolId: idOf(schoolId),
      branchId: idOf(branchId),
    });

  const sameTenantLoose = sameTenant;

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

      setSchools(schoolRows.filter((row) => sameTenantLoose(row) || idOf(row.id) === idOf(schoolId)));
      setBranches(branchRows.filter((row) => sameTenantLoose(row) || idOf(row.id) === idOf(branchId) || (activeBranch && idOf((activeBranch as any).id) === idOf(branchId))));
      setSchoolBranchSettings(settingRows.filter(sameTenantLoose));
      setAcademicStructures(sortNamed(structureRows.filter((row) => sameTenantLoose(row) && row.active !== false)));
      setAcademicPeriods(sortNamed(periodRows.filter((row) => sameTenantLoose(row) && row.active !== false)));
      setClasses(sortNamed(classRows.filter((row) => sameTenantLoose(row) && row.active !== false)));
      setSubjects(sortNamed(subjectRows.filter((row) => sameTenantLoose(row) && row.active !== false)));
      setStudents(studentRows.filter(sameTenantLoose));
      setTeachers(teacherRows.filter(sameTenantLoose));
      setParents(parentRows.filter(sameTenantLoose));
      setStudentParents(studentParentRows.filter(sameTenantLoose));
      setClassTeachers(classTeacherRows.filter(sameTenantLoose));
      setClassSubjects(classSubjectRows.filter((row) => sameTenantLoose(row) && row.active !== false));
      setStudentEnrollments(enrollmentRows.filter(sameTenantLoose));
      setAssessmentApplicabilities(applicabilityRows.filter((row) => sameTenantLoose(row) && row.active !== false));
      setAssessmentStructures(assessmentStructureRows.filter((row) => sameTenantLoose(row) && row.active !== false));
      setAssessmentStructureItems(assessmentStructureItemRows.filter(sameTenantLoose));
      setAssessmentEntries(assessmentEntryRows.filter(sameTenantLoose));
      setGradingSystems(gradingSystemRows.filter((row) => sameTenantLoose(row) && row.active !== false));
      setGradeRules(gradeRuleRows.filter(sameTenantLoose));
      setAttendance(attendanceRows.filter(sameTenantLoose));
      setComputedResults(computedRows.filter(sameTenantLoose));
      setReportCards(reportRows.filter(sameTenantLoose));
      setReportCardItems(reportItemRows.filter(sameTenantLoose));
      setPromotions(promotionRows.filter(sameTenantLoose));
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
  }, [authenticated, accountId, schoolId, branchId,
    dataRevision,
  ]);

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
      schoolBranchSettings.find((row) => idOf(row.schoolId) === idOf(schoolId) && idOf(row.branchId) === idOf(branchId)) ||
      settings ||
      undefined
    );
  }, [schoolBranchSettings, schoolId, branchId, settings]);

  /**
   * `currentSetting` may resolve to full branch settings or appearance-only
   * settings. Normalize academic IDs before placing them in number state.
   */
  const currentAcademicStructureId: number | undefined =
    idOf(currentSetting?.currentAcademicStructureId) || undefined;

  const currentAcademicPeriodId: number | undefined =
    idOf(currentSetting?.currentAcademicPeriodId) || undefined;

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
      const next = currentAcademicStructureId || branchAcademicStructures[0]?.id;
      if (next) {
        setFromAcademicStructureId(next);
        setToAcademicStructureId((prev) => prev || next);
      }
    }

    if (!fromAcademicPeriodId) {
      const next = currentAcademicPeriodId || branchAcademicPeriods[0]?.id;
      if (next) setFromAcademicPeriodId(next);
    }
  }, [
    currentAcademicStructureId,
    currentAcademicPeriodId,
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
        fromAcademicStructureId || currentAcademicStructureId || branchAcademicStructures[0]?.id
      );
    }
  }, [toAcademicStructureId, fromAcademicStructureId, currentAcademicStructureId, branchAcademicStructures]);

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

  /*
   * Keep the full report-engine item too.
   * The promotion snapshot must now be a reusable StudentReportCardDataset,
   * not only a small promotion summary. Cumulative Report Book later reads
   * StudentReportSnapshot.reportData and re-renders the original report card
   * through the selected student report template.
   */
  const engineReportItemMap = useMemo(() => {
    const map = new Map<number, any>();

    (reportEngineOutput?.classReports || []).forEach((item: any) => {
      const report = item?.report as ComputedStudentReport | undefined;
      if (report?.studentId) {
        map.set(report.studentId, item);
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
      if (idOf(row.classId) !== idOf(fromClassId)) return false;
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
            academicStructureId: Number(fromAcademicStructureId || currentAcademicStructureId || 0),
            academicPeriodId: Number(fromAcademicPeriodId || currentAcademicPeriodId || 0),
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
    currentAcademicStructureId,
    currentAcademicPeriodId,
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
        const engineReportItem = engineReportItemMap.get(student.id);

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
          engineReportItem,
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
    engineReportItemMap,
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

  const formatSnapshotDate = (value?: string | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  const countStudentsInClassPeriod = (classId?: number, academicStructureId?: number, academicPeriodId?: number) => {
    const strictCount = branchStudentEnrollments.filter((enrollment) => {
      if (enrollment.isDeleted) return false;
      if (enrollment.status !== "active") return false;
      if (classId && idOf(enrollment.classId) !== idOf(classId)) return false;
      if (academicStructureId && idOf(enrollment.academicStructureId) !== idOf(academicStructureId)) return false;
      if (academicPeriodId && idOf(enrollment.academicPeriodId) !== idOf(academicPeriodId)) return false;
      return true;
    }).length;

    if (strictCount) return strictCount;

    return branchStudents.filter((student) => {
      if (!isActiveStudent(student)) return false;
      if (classId && idOf(student.currentClassId) !== idOf(classId)) return false;
      return true;
    }).length;
  };

  const buildSnapshotData = (row: PromotionRow) => {
    const generatedAt = new Date().toISOString();

    const schoolRecord =
      schools.find((item) => idOf(item.id) === idOf(schoolId)) || activeSchool;

    const branchRecord =
      branches.find((item) => idOf(item.id) === idOf(branchId)) || activeBranch;

    const fromClass = classMap.get(row.fromClassId);
    const toClass = row.finalClassId ? classMap.get(row.finalClassId) : undefined;

    const fromAcademicPeriod = row.fromAcademicPeriodId
      ? periodMap.get(row.fromAcademicPeriodId)
      : undefined;

    const toAcademicPeriod = toAcademicPeriodId
      ? periodMap.get(toAcademicPeriodId)
      : undefined;

    const fromAcademicStructure = row.fromAcademicStructureId
      ? structureMap.get(row.fromAcademicStructureId)
      : undefined;

    const toAcademicStructure = toAcademicStructureId
      ? structureMap.get(toAcademicStructureId)
      : undefined;

    const engineItem = row.engineReportItem || {};
    const engineHeader = engineItem.header || reportEngineOutput?.header || {};
    const engineStudent = engineItem.student || row.student;
    const report = row.engineReport || engineItem.report || {};

    const branding = {
      ...(engineHeader as any)?.branding,
      schoolName:
        (engineHeader as any)?.branding?.schoolName ||
        (schoolRecord as any)?.name ||
        "School Name",
      branchName:
        (engineHeader as any)?.branding?.branchName ||
        (branchRecord as any)?.name ||
        "",
      logo:
        (engineHeader as any)?.branding?.logo ||
        (currentSetting as any)?.logo ||
        (branchRecord as any)?.logo ||
        (schoolRecord as any)?.logo ||
        "",
      address:
        (engineHeader as any)?.branding?.address ||
        (branchRecord as any)?.address ||
        (schoolRecord as any)?.address ||
        "",
      phone:
        (engineHeader as any)?.branding?.phone ||
        (branchRecord as any)?.phone ||
        (schoolRecord as any)?.phone ||
        "",
      email:
        (engineHeader as any)?.branding?.email ||
        (branchRecord as any)?.email ||
        (schoolRecord as any)?.email ||
        "",
      website:
        (engineHeader as any)?.branding?.website ||
        (schoolRecord as any)?.website ||
        "",
      motto:
        (engineHeader as any)?.branding?.motto ||
        (schoolRecord as any)?.motto ||
        "",
      branchAddress:
        (engineHeader as any)?.branding?.branchAddress ||
        (branchRecord as any)?.address ||
        "",
      primaryColor:
        (engineHeader as any)?.branding?.primaryColor ||
        (currentSetting as any)?.primaryColor ||
        primary,
      fontFamily:
        (engineHeader as any)?.branding?.fontFamily ||
        (currentSetting as any)?.fontFamily ||
        "Arial, sans-serif",
      reportCardBackgroundImage:
        (engineHeader as any)?.branding?.reportCardBackgroundImage ||
        (currentSetting as any)?.reportCardBackgroundImage ||
        "",
      reportCardWatermark:
        (engineHeader as any)?.branding?.reportCardWatermark ||
        (currentSetting as any)?.reportCardWatermark ||
        (currentSetting as any)?.logo ||
        "",
      reportCardSignatureImage:
        (engineHeader as any)?.branding?.reportCardSignatureImage ||
        (currentSetting as any)?.reportCardSignatureImage ||
        "",
    };

    const currentAcademicPeriod = {
      ...(fromAcademicPeriod || {}),
      id: row.fromAcademicPeriodId || fromAcademicPeriod?.id,
      name:
        fromAcademicPeriod?.name ||
        (engineHeader as any)?.academicPeriod?.name ||
        currentSetting?.currentTerm ||
        "Academic Period",
      startDate: fromAcademicPeriod?.startDate,
      endDate: fromAcademicPeriod?.endDate,
      formattedStartDate: formatSnapshotDate(fromAcademicPeriod?.startDate),
      formattedEndDate: formatSnapshotDate(fromAcademicPeriod?.endDate),
    };

    const nextAcademicPeriod = toAcademicPeriod
      ? {
          ...toAcademicPeriod,
          id: toAcademicPeriod.id,
          name: toAcademicPeriod.name,
          startDate: toAcademicPeriod.startDate,
          endDate: toAcademicPeriod.endDate,
          formattedStartDate: formatSnapshotDate(toAcademicPeriod.startDate),
          formattedEndDate: formatSnapshotDate(toAcademicPeriod.endDate),
        }
      : undefined;

    const classTeacher = classTeachers.find((item) => {
      return !item.isDeleted && idOf(item.classId) === idOf(row.fromClassId);
    });

    const classTeacherRecord = classTeacher?.teacherId
      ? teachers.find((teacher) => idOf(teacher.id) === idOf(classTeacher.teacherId))
      : undefined;

    const headTeacherRecord =
      teachers.find((teacher) => teacher.role === "head_teacher" && !teacher.isDeleted) ||
      teachers.find((teacher) => teacher.role === "principal" && !teacher.isDeleted);

    const studentParentLink =
      studentParents.find((link) => {
        return !link.isDeleted && idOf(link.studentId) === idOf(row.student.id) && link.isPrimary === true;
      }) ||
      studentParents.find((link) => {
        return !link.isDeleted && idOf(link.studentId) === idOf(row.student.id);
      });

    const parentRecord = studentParentLink
      ? parents.find((parent) => idOf(parent.id) === idOf(studentParentLink.parentId) && !parent.isDeleted)
      : undefined;

    /*
     * Store a complete StudentReportCardDataset-compatible object.
     * Cumulative Report Book can later read snapshot.reportData directly and
     * render it with any selected student-report template.
     */
    return {
      generatedAt,

      header: {
        ...engineHeader,
        school: schoolRecord,
        branch: branchRecord,
        academicStructure: fromAcademicStructure,
        academicStructureName:
          fromAcademicStructure?.name || (engineHeader as any)?.academicStructureName,
        academicPeriod: currentAcademicPeriod,
        academicPeriodName: currentAcademicPeriod.name,
        classData: fromClass,
        className: fromClass?.name || (report as any)?.className || "",
        branding,
      },

      branding,

      currentAcademicPeriod,
      nextAcademicPeriod,

      student: {
        ...engineStudent,
        ...row.student,
        id: row.student.id,
        name: row.student.fullName,
        fullName: row.student.fullName,
        admissionNumber: row.student.admissionNumber,
        gender: row.student.gender,
        photo: row.student.photo,
      },

      studentInfo: {
        studentPhoto: row.student.photo || "",
        numberOnRoll: countStudentsInClassPeriod(
          row.fromClassId,
          row.fromAcademicStructureId,
          row.fromAcademicPeriodId,
        ),
        parentName: parentRecord?.fullName || row.student.parentName || "",
        parentPhone: parentRecord?.phone || row.student.parentPhone || "",
        parentEmail: parentRecord?.email || row.student.parentEmail || "",
      },

      signatures: {
        classTeacherName:
          classTeacherRecord?.fullName ||
          (report as any)?.classTeacherName ||
          "",
        headTeacherName:
          headTeacherRecord?.fullName ||
          (report as any)?.headTeacherName ||
          "",
        principalName:
          headTeacherRecord?.fullName ||
          (report as any)?.principalName ||
          "",
        parentName:
          parentRecord?.fullName ||
          row.student.parentName ||
          "Parent / Guardian",
        guardianName:
          parentRecord?.fullName ||
          row.student.parentName ||
          "Parent / Guardian",
        officialSignatureImage:
          (headTeacherRecord as any)?.signature ||
          (currentSetting as any)?.reportCardSignatureImage ||
          "",
      },

      report: {
        ...report,
        studentId: row.student.id,
        studentName: (report as any)?.studentName || row.student.fullName,
        admissionNumber:
          (report as any)?.admissionNumber || row.student.admissionNumber,
        gender: (report as any)?.gender || row.student.gender,
        className: (report as any)?.className || fromClass?.name || "",
        total: row.total,
        average: row.average,
        overallPosition:
          row.position ||
          (report as any)?.overallPosition ||
          (report as any)?.position,
        subjectResults: Array.isArray((report as any)?.subjectResults)
          ? (report as any).subjectResults
          : [],
      },

      promotion: {
        recommendation: row.recommendation,
        finalDecision: row.finalDecision,
        fromClassId: row.fromClassId,
        fromClassName: fromClass?.name,
        toClassId: row.finalDecision === "graduate" ? undefined : row.finalClassId,
        toClassName: row.finalDecision === "graduate" ? undefined : toClass?.name,
        fromAcademicStructureId: row.fromAcademicStructureId,
        fromAcademicStructureName: fromAcademicStructure?.name,
        toAcademicStructureId:
          row.finalDecision === "graduate" ? undefined : toAcademicStructureId,
        toAcademicStructureName:
          row.finalDecision === "graduate" ? undefined : toAcademicStructure?.name,
        fromAcademicPeriodId: row.fromAcademicPeriodId,
        fromAcademicPeriodName: fromAcademicPeriod?.name,
        toAcademicPeriodId:
          row.finalDecision === "graduate" ? undefined : toAcademicPeriodId,
        toAcademicPeriodName:
          row.finalDecision === "graduate" ? undefined : toAcademicPeriod?.name,
        note: row.note.trim() || undefined,
      },

      snapshotMeta: {
        source: "promotion",
        snapshotType: "promotion",
        academicYear: currentSetting?.academicYear || undefined,
        term: currentSetting?.currentTerm || fromAcademicPeriod?.name,
        reportEngineVersion: "student-report-engine",
        savedAt: generatedAt,
      },
    };
  };

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

        const fromStructureId = row.fromAcademicStructureId || fromAcademicStructureId || currentAcademicStructureId;
        const fromPeriodId = row.fromAcademicPeriodId || fromAcademicPeriodId || currentAcademicPeriodId;

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
  // GOLDEN COMPACT UI
  // ======================================================

  const activeFilterCount = useMemo(() => {
    return [
      fromAcademicStructureId,
      fromAcademicPeriodId,
      fromClassId,
      toAcademicStructureId,
      toAcademicPeriodId,
      defaultToClassId,
      decisionFilter !== "all" ? decisionFilter : undefined,
    ].filter(Boolean).length;
  }, [
    fromAcademicStructureId,
    fromAcademicPeriodId,
    fromClassId,
    toAcademicStructureId,
    toAcademicPeriodId,
    defaultToClassId,
    decisionFilter,
  ]);

  const selectedFromClassName = fromClassId ? classMap.get(fromClassId)?.name || "Not found" : "Not selected";
  const selectedToClassName = defaultToClassId ? classMap.get(defaultToClassId)?.name || "Not found" : "Not selected";
  const selectedPromotion = selectedPromotionStudentId
    ? filteredRows.find((row) => Number(row.student.id) === selectedPromotionStudentId) || null
    : null;

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Promotion Center..."
        text="Checking account, school, branch, enrollments, reports and promotion history."
      />
    );
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before processing promotions." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ba-page promotion-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ba-state">
          <h2>Assigned branch required</h2>
          <p>Promotions are locked to the branch-admin assigned school branch.</p>
          <button type="button" className="ba-state-button" onClick={load}>
            Refresh Context
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-page promotion-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="ba-search-card" aria-label="Promotion search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search promotions..."
            aria-label="Search promotion rows"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={promoteSelected}
          disabled={promoting || !selectedRows.length}
          aria-label="Process selected promotions"
          title="Process selected"
        >
          Run
        </button>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open promotion filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active promotion filters">
          {fromClassId && (
            <button type="button" onClick={() => setFromClassId(undefined)}>
              From: {selectedFromClassName} ×
            </button>
          )}
          {defaultToClassId && (
            <button type="button" onClick={() => setDefaultToClassId(undefined)}>
              To: {selectedToClassName} ×
            </button>
          )}
          {decisionFilter !== "all" && (
            <button type="button" onClick={() => setDecisionFilter("all")}>
              Decision: {decisionFilter} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "cards" && (
        <section className="ba-list promotion-list">
          {filteredRows.map((row) => {
            const studentId = Number(row.student.id);
            const currentClass = classMap.get(row.fromClassId);
            const currentPeriod = row.fromAcademicPeriodId ? periodMap.get(row.fromAcademicPeriodId) : undefined;

            return (
              <article key={studentId} className="promo-row-card compact-row">
                <label className="promo-check compact" aria-label={`Select ${row.student.fullName}`}>
                  <input
                    type="checkbox"
                    checked={!!row.selected}
                    disabled={row.alreadyProcessed}
                    onChange={(event) => updateRow(studentId, { selected: event.target.checked })}
                  />
                </label>

                <button
                  type="button"
                  className="promo-compact-open"
                  onClick={() => setSelectedPromotionStudentId(studentId)}
                  aria-label={`Open ${row.student.fullName} promotion actions`}
                >
                  <div className="promo-avatar">{row.student.fullName.slice(0, 1).toUpperCase()}</div>

                  <span className="student-main">
                    <strong>{row.student.fullName}</strong>
                    <small>
                      {currentClass?.name || "Unknown class"}{row.student.admissionNumber ? ` · ${row.student.admissionNumber}` : ""}
                    </small>
                    <em>
                      {currentPeriod?.name || "Unknown period"} · Avg {row.average}% · Pos {row.position || "—"} · {decisionLabel[row.finalDecision]}
                    </em>
                  </span>

                  <span className="promo-compact-stats" aria-hidden="true">
                    <b>{row.average}%</b>
                    <small>{row.subjectCount} subj</small>
                  </span>

                  <span className="student-side">
                    <span className={`status-dot-mini ${row.alreadyProcessed ? "gray" : row.selected ? "green" : "orange"}`} />
                    <i>⋯</i>
                  </span>
                </button>
              </article>
            );
          })}

          {!filteredRows.length && (
            <Empty
              icon="🚀"
              title="No promotion rows"
              text={fromClassId ? "No students found for this class/period. Check enrollments, current class values, and report engine setup." : "Select a current class to load students."}
            />
          )}
        </section>
      )}

      {viewMode === "table" && (
        <section className="ba-table-card promotion-table-card">
          <div className="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Students ({filteredRows.length})</th>
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
                      <td>
                        <div className="promo-table-student">
                          <input
                            type="checkbox"
                            checked={!!row.selected}
                            disabled={row.alreadyProcessed}
                            onChange={(event) => updateRow(studentId, { selected: event.target.checked })}
                          />
                          <span>
                            <strong>{row.student.fullName}</strong>
                            <small>{row.student.admissionNumber || "No admission no."}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{currentClass?.name || "Unknown class"}</strong>
                        <span>{currentPeriod?.name || "Unknown period"}</span>
                      </td>
                      <td>
                        <strong>{row.total}</strong>
                        <span>{row.subjectCount} subject(s)</span>
                      </td>
                      <td>{row.average}%</td>
                      <td>{row.position || "—"}</td>
                      <td>
                        <Chip tone={decisionTone(row.recommendation)}>{decisionLabel[row.recommendation]}</Chip>
                      </td>
                      <td>
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
                      </td>
                      <td>
                        <select
                          value={row.finalClassId || ""}
                          disabled={row.alreadyProcessed || row.finalDecision === "graduate"}
                          onChange={(event) => updateRow(studentId, { finalClassId: Number(event.target.value) || undefined })}
                        >
                          <option value="">No class</option>
                          {branchClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          value={row.note}
                          disabled={row.alreadyProcessed}
                          onChange={(event) => updateRow(studentId, { note: event.target.value })}
                          placeholder="Optional note"
                        />
                      </td>
                      <td>
                        <Chip tone={row.alreadyProcessed ? "gray" : row.selected ? "blue" : "orange"}>
                          {row.alreadyProcessed ? "Processed" : row.selected ? "Ready" : "Not selected"}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredRows.length && (
              <div className="ba-empty-table">
                {fromClassId ? "No students found for this class/period." : "Select a current class to load students."}
              </div>
            )}
          </div>
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          fromAcademicStructureId={fromAcademicStructureId}
          fromAcademicPeriodId={fromAcademicPeriodId}
          fromClassId={fromClassId}
          toAcademicStructureId={toAcademicStructureId}
          toAcademicPeriodId={toAcademicPeriodId}
          defaultToClassId={defaultToClassId}
          decisionFilter={decisionFilter}
          branchAcademicStructures={branchAcademicStructures}
          fromPeriods={fromPeriods}
          toPeriods={toPeriods}
          availableFromClasses={availableFromClasses}
          branchClasses={branchClasses}
          setFromAcademicStructureId={setFromAcademicStructureId}
          setFromAcademicPeriodId={setFromAcademicPeriodId}
          setFromClassId={setFromClassId}
          setToAcademicStructureId={setToAcademicStructureId}
          setToAcademicPeriodId={setToAcademicPeriodId}
          setDefaultToClassId={setDefaultToClassId}
          setDecisionFilter={setDecisionFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedCount={selectedRows.length}
          promoting={promoting}
          onProcess={async () => {
            setMoreOpen(false);
            await promoteSelected();
          }}
          onBulk={() => {
            setMoreOpen(false);
            setBulkOpen(true);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {bulkOpen && (
        <BulkSheet
          onSelectShown={() => selectAllFiltered(true)}
          onClearShown={() => selectAllFiltered(false)}
          onPromote={() => applyDecisionToFiltered("promote")}
          onRepeat={() => applyDecisionToFiltered("repeat")}
          onGraduate={() => applyDecisionToFiltered("graduate")}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {selectedPromotion && (
        <PromotionActionSheet
          row={selectedPromotion}
          branchClasses={branchClasses}
          defaultToClassId={defaultToClassId}
          updateRow={updateRow}
          onClose={() => setSelectedPromotionStudentId(null)}
        />
      )}
    </main>
  );
}

// ======================================================
// GOLDEN SMALL COMPONENTS
// ======================================================

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ba-page promotion-page" style={{ "--ba-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function SliderIcon() {
  return (
    <svg className="ba-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="promo-mini-stat">
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function FilterSheet({
  fromAcademicStructureId,
  fromAcademicPeriodId,
  fromClassId,
  toAcademicStructureId,
  toAcademicPeriodId,
  defaultToClassId,
  decisionFilter,
  branchAcademicStructures,
  fromPeriods,
  toPeriods,
  availableFromClasses,
  branchClasses,
  setFromAcademicStructureId,
  setFromAcademicPeriodId,
  setFromClassId,
  setToAcademicStructureId,
  setToAcademicPeriodId,
  setDefaultToClassId,
  setDecisionFilter,
  onClose,
}: {
  fromAcademicStructureId?: number;
  fromAcademicPeriodId?: number;
  fromClassId?: number;
  toAcademicStructureId?: number;
  toAcademicPeriodId?: number;
  defaultToClassId?: number;
  decisionFilter: DecisionFilter;
  branchAcademicStructures: AcademicStructure[];
  fromPeriods: AcademicPeriod[];
  toPeriods: AcademicPeriod[];
  availableFromClasses: Class[];
  branchClasses: Class[];
  setFromAcademicStructureId: (id?: number) => void;
  setFromAcademicPeriodId: (id?: number) => void;
  setFromClassId: (id?: number) => void;
  setToAcademicStructureId: (id?: number) => void;
  setToAcademicPeriodId: (id?: number) => void;
  setDefaultToClassId: (id?: number) => void;
  setDecisionFilter: (value: DecisionFilter) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Promotion Setup</h2>
            <p>Select current and destination academic context for this assigned branch only.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters">
            ✕
          </button>
        </div>

        <div className="ba-form compact">
          <label>
            <span>Current Academic Structure</span>
            <select
              value={fromAcademicStructureId || ""}
              onChange={(event) => {
                setFromAcademicStructureId(Number(event.target.value) || undefined);
                setFromAcademicPeriodId(undefined);
                setFromClassId(undefined);
              }}
            >
              <option value="">Current Academic Structure</option>
              {branchAcademicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {(row as any).level || ""}</option>)}
            </select>
          </label>

          <label>
            <span>Current Academic Period</span>
            <select
              value={fromAcademicPeriodId || ""}
              onChange={(event) => {
                setFromAcademicPeriodId(Number(event.target.value) || undefined);
                setFromClassId(undefined);
              }}
            >
              <option value="">Current Academic Period</option>
              {fromPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          <label>
            <span>Current Class</span>
            <select
              value={fromClassId || ""}
              onChange={(event) => {
                setFromClassId(Number(event.target.value) || undefined);
                setDefaultToClassId(undefined);
              }}
            >
              <option value="">Current Class</option>
              {availableFromClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          <label>
            <span>Next Academic Structure</span>
            <select
              value={toAcademicStructureId || ""}
              onChange={(event) => {
                setToAcademicStructureId(Number(event.target.value) || undefined);
                setToAcademicPeriodId(undefined);
              }}
            >
              <option value="">Next Academic Structure</option>
              {branchAcademicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} · {(row as any).level || ""}</option>)}
            </select>
          </label>

          <label>
            <span>Next Academic Period</span>
            <select value={toAcademicPeriodId || ""} onChange={(event) => setToAcademicPeriodId(Number(event.target.value) || undefined)}>
              <option value="">Next Academic Period</option>
              {toPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          <label>
            <span>Default Next Class</span>
            <select value={defaultToClassId || ""} onChange={(event) => setDefaultToClassId(Number(event.target.value) || undefined)}>
              <option value="">Default Next Class</option>
              {branchClasses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          <label>
            <span>Decision Filter</span>
            <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value as DecisionFilter)}>
              <option value="all">All</option>
              <option value="selected">Selected</option>
              <option value="notProcessed">Not processed</option>
              <option value="promote">Promote</option>
              <option value="repeat">Repeat</option>
              <option value="graduate">Graduate</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" onClick={() => setDecisionFilter("all")}>
            Clear Status
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  selectedCount,
  promoting,
  onProcess,
  onBulk,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedCount: number;
  promoting: boolean;
  onProcess: () => void | Promise<void>;
  onBulk: () => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Promotion actions are kept here so the main page stays clean.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => {
              setViewMode("cards");
              onClose();
            }}
          >
            <span>☰</span>
            <b>Cards view</b>
            <small>Compact mobile-first promotion cards</small>
          </button>

          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => {
              setViewMode("table");
              onClose();
            }}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Dense laptop view for many students</small>
          </button>

          <button type="button" onClick={onProcess} disabled={promoting || !selectedCount}>
            <span>✓</span>
            <b>{promoting ? "Processing..." : `Process ${selectedCount}`}</b>
            <small>Save snapshots, promotions, and next enrollments</small>
          </button>

          <button
            type="button"
            onClick={() => {
              onBulk();
              onClose();
            }}
          >
            <span>☷</span>
            <b>Bulk actions</b>
            <small>Select shown, clear shown, or apply decisions</small>
          </button>

          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local branch promotion data</small>
          </button>
        </div>
      </section>
    </div>
  );
}


function PromotionActionSheet({
  row,
  branchClasses,
  defaultToClassId,
  updateRow,
  onClose,
}: {
  row: PromotionRow;
  branchClasses: Class[];
  defaultToClassId?: number;
  updateRow: (studentId: number, patch: Partial<PromotionRow>) => void;
  onClose: () => void;
}) {
  const studentId = Number(row.student.id);

  const setDecision = (decision: Decision) => {
    const finalClassId =
      decision === "promote"
        ? defaultToClassId || row.recommendedClassId
        : decision === "repeat"
        ? row.fromClassId
        : undefined;

    updateRow(studentId, { finalDecision: decision, finalClassId });
  };

  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-profile compact-promo-profile">
          <div>
            <h2>{row.student.fullName}</h2>
            <p>Avg {row.average}% · Pos {row.position || "—"} · {row.subjectCount} subject(s)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close promotion actions">✕</button>
        </div>

        <div className="promo-sheet-summary">
          <span><b>Total</b>{row.total}</span>
          <span><b>Average</b>{row.average}%</span>
          <span><b>Decision</b>{decisionLabel[row.finalDecision]}</span>
        </div>

        <div className="ba-form compact promo-sheet-form">
          <label>
            <span>Decision</span>
            <select
              value={row.finalDecision}
              disabled={row.alreadyProcessed}
              onChange={(event) => setDecision(event.target.value as Decision)}
            >
              <option value="promote">Promote</option>
              <option value="repeat">Repeat</option>
              <option value="graduate">Graduate</option>
            </select>
          </label>

          <label>
            <span>Destination</span>
            <select
              value={row.finalClassId || ""}
              disabled={row.alreadyProcessed || row.finalDecision === "graduate"}
              onChange={(event) => updateRow(studentId, { finalClassId: Number(event.target.value) || undefined })}
            >
              <option value="">No class</option>
              {branchClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          </label>

          <label className="wide">
            <span>Note</span>
            <input
              value={row.note}
              disabled={row.alreadyProcessed}
              onChange={(event) => updateRow(studentId, { note: event.target.value })}
              placeholder="Optional note"
            />
          </label>
        </div>

        <div className="ba-menu-list promo-decision-list">
          <button type="button" onClick={() => setDecision("promote")} disabled={row.alreadyProcessed}>
            <span>⬆</span><b>Promote</b><small>Move student to the destination class</small>
          </button>
          <button type="button" onClick={() => setDecision("repeat")} disabled={row.alreadyProcessed}>
            <span>↻</span><b>Repeat</b><small>Keep student in the current class</small>
          </button>
          <button type="button" onClick={() => setDecision("graduate")} disabled={row.alreadyProcessed}>
            <span>🎓</span><b>Graduate</b><small>Mark student as graduated</small>
          </button>
        </div>

        <div className="ba-sheet-actions">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function BulkSheet({
  onSelectShown,
  onClearShown,
  onPromote,
  onRepeat,
  onGraduate,
  onClose,
}: {
  onSelectShown: () => void;
  onClearShown: () => void;
  onPromote: () => void;
  onRepeat: () => void;
  onGraduate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>Bulk Actions</h2>
            <p>Apply actions to the currently shown promotion rows.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close bulk actions">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button
            type="button"
            onClick={() => {
              onSelectShown();
              onClose();
            }}
          >
            <span>✓</span>
            <b>Select shown</b>
            <small>Prepare all visible unprocessed students</small>
          </button>

          <button
            type="button"
            onClick={() => {
              onClearShown();
              onClose();
            }}
          >
            <span>○</span>
            <b>Clear shown</b>
            <small>Unselect visible students</small>
          </button>

          <button
            type="button"
            onClick={() => {
              onPromote();
              onClose();
            }}
          >
            <span>⬆</span>
            <b>Set promote</b>
            <small>Apply promote to visible rows</small>
          </button>

          <button
            type="button"
            onClick={() => {
              onRepeat();
              onClose();
            }}
          >
            <span>↻</span>
            <b>Set repeat</b>
            <small>Apply repeat to visible rows</small>
          </button>

          <button
            type="button"
            onClick={() => {
              onGraduate();
              onClose();
            }}
          >
            <span>🎓</span>
            <b>Set graduate</b>
            <small>Apply graduation to visible rows</small>
          </button>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes spin { to { transform: rotate(360deg); } }

.ba-page {
  --ease: cubic-bezier(.2,.8,.2,1);
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: calc(8px * var(--local-density-scale, 1));
  padding-bottom: max(40px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ba-primary) 9%, transparent), transparent 30rem),
    var(--bg, #f7f8fb);
  color: var(--text, #111827);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--font-size, 14px);
  overflow-x: hidden;
}

.ba-page *,
.ba-page *::before,
.ba-page *::after {
  box-sizing: border-box;
  min-width: 0;
}

.ba-page button,
.ba-page input,
.ba-page select,
.ba-page textarea {
  font: inherit;
  max-width: 100%;
}

.ba-page button {
  -webkit-tap-highlight-color: transparent;
}

.ba-page input,
.ba-page select,
.ba-page textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--input-border, var(--border, rgba(0,0,0,.10)));
  border-radius: 16px;
  padding: 0 12px;
  background: var(--input-bg, var(--surface, #fff));
  color: var(--input-text, var(--text, #111827));
  outline: none;
  font-weight: 750;
}

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus {
  border-color: color-mix(in srgb, var(--ba-primary) 52%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ba-primary) 12%, transparent);
}

.ba-state,
.ba-search-card,
.ba-summary-line,
.ba-card,
.ba-table-card,
.ba-analysis,
.ba-empty,
.ba-sheet,
.ba-modal,
.student-row {
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
}

.ba-state {
  min-height: min(420px, calc(100dvh - 32px));
  width: min(520px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  border-radius: 28px;
  text-align: center;
}

.ba-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--ba-primary) 18%, transparent);
  border-top-color: var(--ba-primary);
  animation: spin .8s linear infinite;
}

.ba-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.ba-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-state-button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--ba-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.ba-toast {
  position: sticky;
  top: 8px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15,23,42,.12);
}

.ba-toast.success { background: rgba(34,197,94,.14); color: #166534; }
.ba-toast.error { background: rgba(239,68,68,.12); color: #991b1b; }
.ba-toast.info { background: rgba(59,130,246,.13); color: #1d4ed8; }

.ba-toast button {
  border: 0;
  background: transparent;
  color: currentColor;
  font-weight: 1000;
  cursor: pointer;
}

/* Compact search/action strip. The page intentionally has no duplicate title header. */
.ba-topbar,
.ba-title,
.ba-topbar-actions {
  display: none;
}

.ba-icon-button,
.ba-filter-button,
.ba-add-inline {
  width: 42px;
  height: 42px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 18px;
  font-weight: 1000;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15,23,42,.045);
}


.ba-add-inline {
  flex: 0 0 42px;
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

.ba-search-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 42px);
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  padding: 8px;
  border-radius: 24px;
}

.ba-search {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 11px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.ba-search span {
  color: var(--muted,#64748b);
  font-size: 17px;
  font-weight: 1000;
}

.ba-search input {
  min-height: 42px;
  border: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14px;
}

.ba-slider-icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ba-filter-button {
  position: relative;
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.ba-filter-button.active {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-filter-button b {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  border: 2px solid var(--card-bg,#fff);
}

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}

.ba-summary-line div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ba-summary-line strong {
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-summary-line span,
.ba-summary-line p {
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
}

.ba-summary-line p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-filter-chips::-webkit-scrollbar {
  display: none;
}

.ba-filter-chips button {
  flex: 0 0 auto;
  min-height: 31px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
  cursor: pointer;
}

.ba-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.student-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 22px;
  text-align: left;
  cursor: pointer;
  transition: transform .16s var(--ease), box-shadow .16s var(--ease), border-color .16s var(--ease);
}

.student-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ba-primary) 24%, var(--border, rgba(0,0,0,.10)));
  box-shadow: 0 16px 34px rgba(15,23,42,.07);
}

.ba-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fff;
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}

.student-main,
.student-main strong,
.student-main small,
.student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-main strong {
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.02em;
}

.student-main small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 12px;
  font-weight: 850;
  font-style: normal;
}

.student-main em {
  margin-top: 3px;
  color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827));
  font-size: 11px;
  font-weight: 750;
  font-style: normal;
}

.student-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex: 0 0 auto;
}

.student-side i {
  color: var(--muted,#64748b);
  font-style: normal;
  font-size: 18px;
  font-weight: 1000;
  line-height: 1;
}

.ba-chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 950;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}

.ba-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.ba-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.ba-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.ba-chip.gray { background: color-mix(in srgb,var(--muted,#64748b) 14%,transparent); color: var(--muted,#64748b); }
.ba-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.ba-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.status-dot-mini {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted,#64748b);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent);
}

.status-dot-mini.green { background: #22c55e; }
.status-dot-mini.red { background: #ef4444; }
.status-dot-mini.blue { background: #3b82f6; }
.status-dot-mini.orange { background: #f59e0b; }
.status-dot-mini.gray { background: var(--muted,#64748b); }

.status-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 8px;
}

.status-sheet-grid span {
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--muted,#64748b) 7%, transparent);
}

.status-sheet-grid b {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.status-sheet-grid em {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text,#111827);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.ba-sheet-backdrop,
.ba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 10px;
  background: rgba(15,23,42,.50);
  backdrop-filter: blur(12px);
}

.ba-sheet {
  width: min(760px, 100%);
  max-height: min(88dvh, 760px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px 28px 22px 22px;
  box-shadow: 0 30px 90px rgba(15,23,42,.32);
  animation: sheetIn .18s var(--ease);
}

.ba-sheet.small {
  width: min(520px, 100%);
}

@keyframes sheetIn {
  from { transform: translateY(16px); opacity: .7; }
  to { transform: translateY(0); opacity: 1; }
}

.ba-sheet-head,
.ba-sheet-profile {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.ba-sheet-head h2,
.ba-sheet-profile h2,
.ba-modal-head h2 {
  margin: 0;
  color: var(--text,#111827);
  font-size: 21px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.ba-sheet-head p,
.ba-sheet-profile p,
.ba-modal-head p {
  margin: 5px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 750;
}

.ba-sheet-head button,
.ba-sheet-profile button,
.ba-modal-head button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-weight: 1000;
  cursor: pointer;
  flex: 0 0 auto;
}

.ba-sheet-actions,
.ba-modal-actions {
  position: sticky;
  bottom: -14px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 0 2px;
  background: linear-gradient(to top, var(--card-bg,var(--surface,#fff)) 70%, transparent);
}

.ba-sheet-actions button,
.ba-modal-actions button {
  min-height: 42px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-sheet-actions button.primary,
.ba-modal-actions button:last-child {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-modal-actions button:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.ba-menu-list {
  display: grid;
  gap: 8px;
}

.ba-menu-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 58px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 18px;
  padding: 9px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  text-align: left;
  cursor: pointer;
}

.ba-menu-list button span {
  grid-row: span 2;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 10%, transparent);
  color: var(--ba-primary);
  font-weight: 1000;
}

.ba-menu-list button b,
.ba-menu-list button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-menu-list button b {
  font-size: 13px;
  font-weight: 1000;
}

.ba-menu-list button small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
}

.ba-menu-list button.active {
  border-color: color-mix(in srgb, var(--ba-primary) 34%, var(--border,rgba(0,0,0,.10)));
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--surface,#fff));
}

.ba-menu-list button.danger span {
  background: color-mix(in srgb, #dc2626 10%, transparent);
  color: #dc2626;
}

.ba-menu-list button.danger b {
  color: #991b1b;
}

.student-detail-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.student-detail-strip span {
  display: block;
  padding: 9px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-detail-strip b {
  display: block;
  margin-bottom: 3px;
  color: var(--text,#111827);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.ba-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ba-form.two {
  grid-template-columns: minmax(0,1fr);
}

.ba-form.compact {
  gap: 9px;
}

.ba-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ba-form span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.ba-media-hint {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
}

.ba-form .wide {
  grid-column: 1 / -1;
}

.ba-form-section {
  padding: 12px 0;
  border-top: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-form-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.ba-form-section h3 {
  margin: 0 0 10px;
  color: var(--text,#111827);
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.ba-page textarea {
  min-height: 92px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ba-media-button {
  width: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--ba-primary);
  color: #fff !important;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0 !important;
  text-transform: none !important;
  cursor: pointer;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary) !important;
  box-shadow: none;
}

.ba-media-button input {
  display: none;
}

.ba-preview-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-preview-banner {
  width: 100%;
  height: 130px;
  object-fit: cover;
  border-radius: 22px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
}

.ba-modal {
  width: min(980px, 100%);
  max-height: min(92dvh, 900px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px;
}

.ba-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 10px;
  margin-top: 10px;
}

.ba-analysis,
.ba-table-card,
.ba-empty {
  padding: 13px;
  border-radius: 24px;
}

.ba-analysis span {
  color: var(--muted,#64748b);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-analysis strong {
  display: block;
  margin-top: 8px;
  font-size: clamp(22px,7vw,30px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}

.ba-analysis p {
  margin: 8px 0 0;
  color: var(--muted,#64748b);
  font-size: 12px;
  line-height: 1.5;
}

.ba-analysis-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.ba-analysis-list section {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb,var(--muted,#64748b) 8%,transparent);
}

.ba-analysis-list section > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ba-analysis-list b,
.ba-analysis-list small {
  font-size: 12px;
}

.ba-analysis-list small {
  color: var(--muted,#64748b);
  font-weight: 850;
}

.ba-progress {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb,var(--muted,#64748b) 18%,transparent);
  overflow: hidden;
}

.ba-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ba-primary);
}

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  border-style: dashed;
}

.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb,var(--ba-primary) 12%,var(--surface,#fff));
  font-size: 28px;
}

.ba-empty h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.ba-empty p {
  margin: 0;
  color: var(--muted,#64748b);
  font-size: 13px;
  line-height: 1.6;
}

.ba-table-card {
  margin-top: 10px;
}

.ba-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 18px;
  border: 1px solid var(--border,rgba(0,0,0,.08));
}

.ba-table-scroll table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  background: var(--card-bg, var(--surface, var(--bg, transparent)));
}

.ba-table-scroll th,
.ba-table-scroll td {
  padding: 10px;
  border-bottom: 1px solid var(--border,rgba(0,0,0,.08));
  vertical-align: top;
  text-align: left;
  font-size: 13px;
}

.ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface, var(--bg, transparent)))));
  color: var(--table-header-text, var(--muted, var(--text)));
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.ba-table-scroll td strong,
.ba-table-scroll td span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-table-scroll td span {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 11px;
}

.ba-table-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 7px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ba-table-actions::-webkit-scrollbar {
  display: none;
}

.ba-table-actions button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border,rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 10px;
  background: var(--surface,#fff);
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-table-actions button:first-child {
  background: var(--ba-primary);
  color: #fff;
  border-color: var(--ba-primary);
}

.ba-delete,
.ba-table-actions button.ba-delete {
  color: #991b1b;
  background: color-mix(in srgb,#dc2626 7%,var(--surface,#fff));
  border-color: color-mix(in srgb,#dc2626 24%,var(--border,rgba(0,0,0,.10)));
}

.ba-empty-table {
  padding: 22px;
  text-align: center;
  color: var(--muted,#64748b);
  font-weight: 850;
}

@media (min-width: 680px) {
  .ba-page {
    padding: calc(12px * var(--local-density-scale,1));
    padding-bottom: 44px;
  }

  .ba-search-card {
    grid-template-columns: minmax(0,1fr) repeat(3, 42px);
  }

  .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .student-row {
    border-radius: 24px;
    padding: 12px;
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .ba-modal-backdrop,
  .ba-sheet-backdrop {
    place-items: center;
    padding: 18px;
  }

  .ba-sheet {
    border-radius: 28px;
    padding: 18px;
  }

  .ba-modal {
    padding: 18px;
  }

}

@media (min-width: 1040px) {
  .ba-page {
    padding: calc(16px * var(--local-density-scale,1));
    padding-bottom: 48px;
  }

  .ba-search-card,
  .ba-summary-line,
  .ba-list,
  .ba-analysis-grid,
  .ba-table-card,
  .ba-filter-chips {
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }

  .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ba-analysis-grid {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  .ba-current-filter {
    grid-column: span 2;
  }

  .ba-form {
    grid-template-columns: repeat(3, minmax(0,1fr));
  }

  .ba-form.two {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

}

@media (max-width: 520px) {
  .ba-page {
    padding: calc(7px * var(--local-density-scale,1));
    padding-bottom: max(38px, env(safe-area-inset-bottom));
  }

  .ba-title h1 {
    font-size: 28px;
  }

  .ba-icon-button,
  .ba-filter-button,
  .ba-add-inline {
    width: 40px;
    height: 40px;
  }

  .ba-summary-line {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .student-detail-strip {
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet,
  .ba-modal {
    border-radius: 24px 24px 18px 18px;
    padding: 12px;
  }

  .ba-sheet-actions,
  .ba-modal-actions {
    display: grid;
    grid-template-columns: minmax(0,1fr);
  }

  .ba-sheet-actions button,
  .ba-modal-actions button {
    width: 100%;
  }
}


.ba-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.ba-media-button {
  min-height: 40px;
  border: 1px solid var(--ba-primary);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--ba-primary) 18%, transparent);
}

.ba-media-button.secondary {
  background: var(--surface, #fff);
  color: var(--ba-primary);
  box-shadow: none;
}

.ba-media-hint {
  display: block;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.camera-backdrop {
  z-index: 100;
  place-items: center;
}

.ba-camera-modal {
  width: min(720px, 100%);
  max-height: min(92dvh, 880px);
  overflow-y: auto;
  padding: 14px;
  border-radius: 28px;
  background: var(--card-bg, var(--surface, #fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  box-shadow: 0 30px 90px rgba(15,23,42,.35);
}

.ba-camera-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 24px;
  background: #020617;
  border: 1px solid var(--border, rgba(0,0,0,.10));
}

.ba-camera-preview video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #020617;
}

.ba-camera-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(2,6,23,.72);
  color: #fff;
  font-size: 13px;
  font-weight: 950;
}

.ba-camera-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.ba-camera-actions button {
  min-height: 42px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-camera-secondary {
  border: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--muted, #64748b) 8%, var(--surface, #fff));
  color: var(--text, #111827);
}

.ba-camera-primary {
  border: 1px solid var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}

.ba-camera-actions button:disabled {
  opacity: .62;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .ba-media-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ba-media-button,
  .ba-camera-actions button {
    width: 100%;
  }

  .ba-camera-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .ba-camera-modal {
    border-radius: 22px;
    padding: 11px;
  }
}

/* Broadsheets golden additions */

/* Extra compact report-only layout */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}


.student-reports-page .ba-list {
  grid-template-columns: minmax(0, 1fr);
}

.ba-report-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ba-primary) 11%, transparent);
  font-size: 18px;
  color: var(--ba-primary);
}

.ba-print-card {
  margin-top: 10px;
  background: var(--card-bg, var(--surface,#fff));
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 24px;
  box-shadow: 0 12px 28px rgba(15,23,42,.045);
  overflow: hidden;
}

.ba-print-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.08));
  background: color-mix(in srgb, var(--muted,#64748b) 6%, transparent);
}

.ba-print-head span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ba-print-head strong {
  display: block;
  margin-top: 3px;
  color: var(--text,#111827);
  font-size: 15px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-print-head p {
  margin: 3px 0 0;
  color: var(--muted,#64748b);
  font-size: 11px;
  line-height: 1.4;
}

.ba-print-zone {
  padding: 10px;
  background: var(--card-bg, var(--surface,#fff));
}

.ba-report-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
}

.ba-report-toolbar button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ba-primary) 10%, var(--card-bg,#fff));
  color: var(--ba-primary);
  font-size: 11px;
  font-weight: 950;
  cursor: pointer;
  white-space: nowrap;
}

.ba-report-toolbar button.primary {
  background: var(--ba-primary);
  color: #fff;
}

.report-analytics-card {
  grid-column: 1 / -1;
}

.report-analytics-card > div {
  margin-top: 10px;
}

@media (min-width: 680px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1320px) {
  .student-reports-page .ba-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media print {
  .report-no-print,
  .ba-search-card,
  .ba-filter-chips,
  .ba-sheet-backdrop,
  .ba-modal-backdrop,
  .ba-toast,
  .ba-print-head,
  .ba-report-toolbar {
    display: none !important;
  }

  .ba-page,
  .ba-print-card,
  .ba-print-zone {
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
}


/* StudentReports final golden fixes: one-row action strip, theme-safe buttons/tables, clean preview */
.student-reports-page .ba-search-card {
  grid-template-columns: minmax(0, 1fr) repeat(4, 42px) !important;
  gap: 7px;
  align-items: center;
  overflow: hidden;
}

.student-reports-page .ba-search {
  min-width: 0;
  overflow: hidden;
}

.student-reports-page .ba-icon-button,
.student-reports-page .ba-filter-button,
.student-reports-page .ba-view-button,
.student-reports-page .ba-add-inline {
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  flex: 0 0 42px;
  border-color: var(--border, rgba(0,0,0,.10));
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-add-inline {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-filter-button {
  background: color-mix(in srgb, var(--ba-primary) 8%, var(--card-bg,#fff));
  color: var(--ba-primary);
}

.student-reports-page .ba-filter-button.active {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.student-reports-page .ba-view-button {
  background: color-mix(in srgb, var(--muted,#64748b) 8%, var(--card-bg,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-icon-button:hover,
.student-reports-page .ba-view-button:hover {
  border-color: color-mix(in srgb, var(--ba-primary) 28%, var(--border,rgba(0,0,0,.10)));
  color: var(--ba-primary);
}

.student-reports-page .ba-table-scroll th {
  background: var(--table-header-bg, color-mix(in srgb, var(--ba-primary) 6%, var(--card-bg, var(--surface,#fff))));
  color: var(--table-header-text, var(--muted, var(--text,#111827)));
}

.student-reports-page .ba-table-scroll table,
.student-reports-page .ba-table-scroll td {
  background: var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
}

.student-reports-page .ba-print-head {
  align-items: center;
}

@media (max-width: 520px) {
  .student-reports-page .ba-search-card {
    grid-template-columns: minmax(0, 1fr) repeat(4, 38px) !important;
    gap: 5px;
    padding: 6px;
  }

  .student-reports-page .ba-icon-button,
  .student-reports-page .ba-filter-button,
  .student-reports-page .ba-view-button,
  .student-reports-page .ba-add-inline {
    width: 38px;
    height: 38px;
    min-width: 38px;
    min-height: 38px;
    flex-basis: 38px;
  }

  .student-reports-page .ba-search {
    min-height: 38px;
    padding: 0 8px;
  }

  .student-reports-page .ba-search input {
    min-height: 38px;
    font-size: 13px;
  }
}



/* Broadsheets compact overrides */
.student-reports-page .ba-print-card{margin-top:8px;border-radius:22px}
.student-reports-page .ba-print-head{padding:8px 10px}
.student-reports-page .ba-print-head strong{font-size:14px}
.student-reports-page .ba-print-head p{font-size:11px;margin-top:2px}
.student-reports-page .ba-print-zone{padding:8px}



/* Promotion compact golden additions */

/* Promotion table view */
.promotion-table-card{margin-top:8px}
.promotion-table-card .ba-table-scroll table{min-width:1180px}
.promotion-table-card select,
.promotion-table-card input{
  min-height:34px;
  border-radius:12px;
  font-size:11px;
  padding:0 9px;
}
.promo-table-student{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  gap:8px;
  align-items:center;
}
.promo-table-student input{
  width:15px;
  min-height:15px;
  accent-color:var(--ba-primary);
}
.promo-table-student span,
.promo-table-student strong,
.promo-table-student small{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.promo-table-student small{
  margin-top:3px;
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:750;
}


/* Extra compact promotion cleanup */
.promotion-page .ba-list{margin-top:8px;gap:7px}
.promotion-page .ba-add-inline{
  width:42px;
  min-width:42px;
  padding:0;
  font-size:11px;
  letter-spacing:0;
}
.promo-row-card{
  border-radius:18px;
  padding:8px;
}
.promo-row-top{
  gap:8px;
}
.promo-check{
  width:24px;
  height:24px;
  border-radius:10px;
}
.promo-check input{
  width:14px;
  min-height:14px;
}
.promo-avatar{
  width:34px;
  height:34px;
  border-radius:13px;
  font-size:13px;
}
.promotion-page .student-main strong{
  font-size:13px;
}
.promotion-page .student-main small{
  font-size:11px;
}
.promotion-page .student-main em{
  font-size:10px;
}
.promo-mini-grid{
  gap:5px;
  margin-top:7px;
}
.promo-mini-stat{
  padding:6px 7px;
  border-radius:12px;
}
.promo-mini-stat b{
  font-size:12px;
}
.promo-mini-stat small{
  font-size:9px;
}
.promo-row-controls{
  gap:6px;
  margin-top:7px;
}
.promo-row-controls span{
  font-size:9px;
}
.promotion-page input,
.promotion-page select{
  min-height:38px;
  border-radius:13px;
  font-size:12px;
}
.promo-chip-row{
  gap:5px;
  margin-top:7px;
}
.promotion-page .ba-chip{
  min-height:22px;
  padding:3px 7px;
  font-size:10px;
}

.promotion-page .promotion-list{grid-template-columns:minmax(0,1fr)}
.promo-row-card{min-width:0;border-radius:22px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045);padding:10px;overflow:hidden}
.promo-row-top{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:10px}
.promo-check{width:28px;height:28px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));border:1px solid var(--border,rgba(0,0,0,.08))}
.promo-check input{width:15px;min-height:15px;accent-color:var(--ba-primary)}
.promo-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--ba-primary) 14%,transparent);color:var(--ba-primary);font-size:15px;font-weight:1000}
.promo-mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}
.promo-mini-stat{display:grid;gap:2px;min-width:0;padding:8px;border-radius:15px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}
.promo-mini-stat b,.promo-mini-stat small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.promo-mini-stat b{color:var(--text,#111827);font-size:14px;font-weight:1000}
.promo-mini-stat small{color:var(--muted,#64748b);font-size:10px;font-weight:850}
.promo-row-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:9px}
.promo-row-controls label{display:grid;gap:5px}
.promo-row-controls span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}
.promo-row-controls .wide{grid-column:1/-1}
.promo-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.ba-menu-list button:disabled{opacity:.55;cursor:not-allowed}

@media(min-width:680px){
  .promotion-page .promotion-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .promo-row-controls{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:1040px){
  .promotion-page .promotion-list{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(min-width:1320px){
  .promotion-page .promotion-list{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:520px){
  .promo-row-top{grid-template-columns:auto minmax(0,1fr) auto}
  .promo-check{grid-row:1;grid-column:1}
  .promo-avatar{display:none}
  .promo-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .promo-context-card{border-radius:18px}
}


/* Final dense promotion card overrides.
   Keep this after the earlier promo-row-card rules so it wins the cascade. */
.promotion-page .promotion-list{
  gap:6px;
  margin-top:8px;
}

.promotion-page .promo-row-card{
  border-radius:16px;
  padding:7px;
  box-shadow:0 8px 18px rgba(15,23,42,.035);
}

.promotion-page .promo-row-top{
  gap:7px;
}

.promotion-page .promo-check{
  width:22px;
  height:22px;
  border-radius:9px;
}

.promotion-page .promo-check input{
  width:13px;
  min-height:13px;
}

.promotion-page .promo-avatar{
  width:30px;
  height:30px;
  border-radius:12px;
  font-size:12px;
}

.promotion-page .student-main{
  gap:1px;
}

.promotion-page .student-main strong{
  font-size:12.5px;
  line-height:1.15;
}

.promotion-page .student-main small,
.promotion-page .student-main em{
  font-size:9.5px;
  line-height:1.18;
}

.promotion-page .student-side{
  gap:5px;
}

.promotion-page .status-dot-mini{
  width:8px;
  height:8px;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.promotion-page .promo-mini-grid{
  gap:4px;
  margin-top:6px;
}

.promotion-page .promo-mini-stat{
  padding:5px 6px;
  border-radius:11px;
  gap:1px;
}

.promotion-page .promo-mini-stat b{
  font-size:11px;
  line-height:1.1;
}

.promotion-page .promo-mini-stat small{
  font-size:8.5px;
  line-height:1.1;
}

.promotion-page .promo-row-controls{
  gap:5px;
  margin-top:6px;
}

.promotion-page .promo-row-controls label{
  gap:3px;
}

.promotion-page .promo-row-controls span{
  font-size:8.5px;
  letter-spacing:.04em;
}

.promotion-page .promo-row-controls input,
.promotion-page .promo-row-controls select{
  min-height:32px;
  border-radius:11px;
  padding:0 8px;
  font-size:11px;
  font-weight:800;
}

.promotion-page .promo-chip-row{
  gap:4px;
  margin-top:6px;
}

.promotion-page .ba-chip{
  min-height:20px;
  padding:2px 6px;
  font-size:9px;
}

@media(min-width:680px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:7px;
  }

  .promotion-page .promo-row-controls{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }

  .promotion-page .promo-row-controls .wide{
    grid-column:auto;
  }
}

@media(min-width:1040px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(4,minmax(0,1fr));
  }
}

@media(min-width:1320px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(5,minmax(0,1fr));
  }
}

@media(max-width:520px){
  .promotion-page .promo-row-card{
    padding:7px;
    border-radius:16px;
  }

  .promotion-page .promo-mini-grid{
    grid-template-columns:repeat(4,minmax(0,1fr));
  }

  .promotion-page .promo-row-controls{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .promotion-page .promo-row-controls .wide{
    grid-column:1/-1;
  }
}



/* ======================================================
   STUDENT-ENROLLMENT STYLE PROMOTION ROWS
   Keep this last so it overrides the earlier full-card rules.
   ====================================================== */
.promotion-page .promotion-list{
  display:grid;
  grid-template-columns:minmax(0,1fr);
  gap:7px;
  margin-top:10px;
}

.promotion-page .promo-row-card.compact-row{
  width:100%;
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  padding:8px;
  border-radius:18px;
  background:var(--card-bg,var(--surface,#fff));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
  overflow:hidden;
}

.promotion-page .promo-check.compact{
  width:26px;
  height:26px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
  border:1px solid var(--border,rgba(0,0,0,.08));
}

.promotion-page .promo-check.compact input{
  width:15px;
  min-height:15px;
  accent-color:var(--ba-primary);
}

.promotion-page .promo-compact-open{
  width:100%;
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto auto;
  align-items:center;
  gap:9px;
  padding:0;
  border:0;
  background:transparent;
  color:var(--text,#111827);
  text-align:left;
  cursor:pointer;
}

.promotion-page .promo-compact-open:hover .student-main strong{
  color:var(--ba-primary);
}

.promotion-page .promo-avatar{
  width:38px!important;
  height:38px!important;
  display:grid!important;
  place-items:center;
  border-radius:15px!important;
  background:linear-gradient(135deg,var(--ba-primary),rgba(15,23,42,.9))!important;
  color:#fff!important;
  font-size:13px!important;
  font-weight:1000!important;
  box-shadow:0 10px 20px rgba(15,23,42,.10)!important;
}

.promotion-page .student-main{
  min-width:0;
  display:grid;
  gap:1px;
}

.promotion-page .student-main strong,
.promotion-page .student-main small,
.promotion-page .student-main em{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.promotion-page .student-main strong{
  font-size:13px;
  line-height:1.15;
  font-weight:1000;
  color:var(--text,#111827);
}

.promotion-page .student-main small,
.promotion-page .student-main em{
  color:var(--muted,#64748b);
  font-size:10.5px;
  line-height:1.25;
  font-weight:800;
  font-style:normal;
}

.promotion-page .promo-compact-stats{
  display:grid;
  justify-items:end;
  gap:1px;
  min-width:44px;
}

.promotion-page .promo-compact-stats b{
  font-size:13px;
  line-height:1;
  font-weight:1000;
  color:var(--text,#111827);
}

.promotion-page .promo-compact-stats small{
  color:var(--muted,#64748b);
  font-size:9px;
  font-weight:900;
  white-space:nowrap;
}

.promotion-page .student-side{
  display:flex;
  align-items:center;
  gap:7px;
}

.promotion-page .student-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:18px;
  line-height:1;
  font-weight:1000;
}

.promotion-page .status-dot-mini{
  width:8px;
  height:8px;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.promotion-page .promo-sheet-summary{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:7px;
  margin-bottom:10px;
}

.promotion-page .promo-sheet-summary span{
  min-width:0;
  padding:9px;
  border-radius:15px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
  border:1px solid var(--border,rgba(0,0,0,.08));
  color:var(--text,#111827);
  font-size:12px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.promotion-page .promo-sheet-summary b{
  display:block;
  margin-bottom:2px;
  color:var(--muted,#64748b);
  font-size:9px;
  font-weight:950;
  text-transform:uppercase;
  letter-spacing:.06em;
}

.promotion-page .compact-promo-profile{
  margin-bottom:10px;
}

.promotion-page .promo-sheet-form{
  margin-bottom:10px;
}

@media(min-width:680px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}

@media(min-width:1040px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media(min-width:1320px){
  .promotion-page .promotion-list{
    grid-template-columns:repeat(4,minmax(0,1fr));
  }
}

@media(max-width:520px){
  .promotion-page .promo-row-card.compact-row{
    padding:8px;
    border-radius:17px;
  }

  .promotion-page .promo-compact-open{
    grid-template-columns:auto minmax(0,1fr) auto;
    gap:8px;
  }

  .promotion-page .promo-compact-stats{
    display:none;
  }
}

`;
