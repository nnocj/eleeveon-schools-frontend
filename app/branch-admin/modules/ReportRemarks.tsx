"use client";

/**
 * app/branch-admin/modules/ReportRemarks.tsx
 * ---------------------------------------------------------
 * ELEEVEON BRANCH ADMIN REPORT REMARKS
 * ---------------------------------------------------------
 *
 * Compact golden-standard report remarks center.
 *
 * Purpose:
 * - Branch admins manage class-teacher remarks, head-teacher remarks and published status.
 * - Branch admins can access all active classes in the selected branch.
 *
 * Source rules:
 * - Uses the shared Branch Admin role-portal workspace resolver.
 * - Account, school and branch scope come from useBranchWorkspaceScope().
 * - Uses branch-table-aware revision tracking for local/offline refreshes.
 * - Uses listActiveLocal/createLocal/updateLocal from syncUtils.
 * - Does not write directly with db.add/db.update.
 *
 * Remarks Basis:
 * - Average bands follow the active grading structure and grade rules.
 * - Total bands scale those grading bands to the selected class subject load.
 * - Position bands adapt to the actual selected class size.
 * - Attendance bands adapt to configured school attendance expectations.
 * - Changing basis immediately regenerates minimum/maximum ranges.
 *
 * UI:
 * - Matches compact golden standard from StudentReports.tsx.
 * - Search + save + filter + more top strip.
 * - Filter chips only when active.
 * - Bottom sheet filters and More menu.
 * - Compact student rows with inline remark editor.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import type {
  AcademicPeriod,
  AcademicStructure,
  Class,
  ReportCard,
  Student,
  StudentEnrollment,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import {
  buildClassReports,
} from "./reports/engine/report-engine";

import type {
  ComputedStudentReport,
  ReportEngineDataset,
  ReportFiltersState,
} from "./reports/engine/report-types";


type ViewMode = "single" | "group" | "analytics";
type RemarkFilter =
  | "all"
  | "missing"
  | "complete"
  | "published"
  | "unpublished";

type TenantRow = {
  accountId?: string;
  schoolId?: string | null;
  branchId?: string | null;
  active?: boolean;
  isDeleted?: boolean;
};

type RemarkDraft = {
  reportCardId?: string;
  classTeacherRemark: string;
  headTeacherRemark: string;
  published: boolean;
};


type RemarkBasisMetric =
  | "average"
  | "total"
  | "position"
  | "attendance";

type RemarkBasisTarget =
  | "headTeacherRemark"
  | "classTeacherRemark";

type RemarkBasisRule = {
  id: string;
  label: string;
  minimum: number;
  maximum: number;
  remark: string;
};

type RemarkBasisSource = {
  title: string;
  detail: string;
};



function defaultRemarkForBand(
  label: string,
  metric: RemarkBasisMetric,
) {
  const normalized =
    cleanText(label).toLowerCase();

  if (metric === "position") {
    if (
      normalized.includes("first") ||
      normalized.includes("1st") ||
      normalized.includes("top")
    ) {
      return "Outstanding class position. Maintain this excellent standard.";
    }

    if (
      normalized.includes("upper") ||
      normalized.includes("strong")
    ) {
      return "A strong class position. Continue working consistently.";
    }

    if (
      normalized.includes("middle") ||
      normalized.includes("average")
    ) {
      return "A fair class position. More focused effort can produce stronger results.";
    }

    return "The class position can improve with greater effort and consistency.";
  }

  if (metric === "attendance") {
    if (
      normalized.includes("excellent") ||
      normalized.includes("outstanding")
    ) {
      return "Excellent attendance. Keep maintaining this level of punctuality and commitment.";
    }

    if (
      normalized.includes("good") ||
      normalized.includes("very good")
    ) {
      return "Good attendance. Continue to attend school regularly and punctually.";
    }

    if (
      normalized.includes("satisfactory") ||
      normalized.includes("fair")
    ) {
      return "Attendance is satisfactory but should become more consistent.";
    }

    return "Attendance needs improvement. Regular and punctual attendance is strongly encouraged.";
  }

  if (
    normalized.includes("excellent") ||
    normalized.includes("outstanding") ||
    normalized === "a" ||
    normalized.startsWith("a1")
  ) {
    return "Excellent performance. Keep up the outstanding work.";
  }

  if (
    normalized.includes("very good") ||
    normalized.includes("credit") ||
    normalized.startsWith("b")
  ) {
    return "Very good performance. Continue working hard.";
  }

  if (
    normalized.includes("good") ||
    normalized.includes("satisfactory") ||
    normalized.startsWith("c")
  ) {
    return "Good performance. Greater consistency will produce even better results.";
  }

  if (
    normalized.includes("pass") ||
    normalized.includes("fair") ||
    normalized.startsWith("d")
  ) {
    return "A fair performance. More focused effort is encouraged.";
  }

  return "Performance needs improvement. Work harder and seek support where necessary.";
}

function normalizeGeneratedRules(
  rules: RemarkBasisRule[],
) {
  return rules
    .filter(
      (rule) =>
        Number.isFinite(rule.minimum) &&
        Number.isFinite(rule.maximum) &&
        rule.maximum >= rule.minimum,
    )
    .sort(
      (left, right) =>
        right.minimum -
          left.minimum ||
        right.maximum -
          left.maximum,
    );
}

const DEFAULT_REMARK_BASIS_RULES:
  RemarkBasisRule[] = [
  {
    id: "excellent",
    label: "Excellent",
    minimum: 80,
    maximum: 100,
    remark:
      "Excellent performance. Keep up the outstanding work.",
  },
  {
    id: "very-good",
    label: "Very good",
    minimum: 70,
    maximum: 79.99,
    remark:
      "Very good performance. Continue working hard.",
  },
  {
    id: "good",
    label: "Good",
    minimum: 60,
    maximum: 69.99,
    remark:
      "Good performance. Greater consistency will produce even better results.",
  },
  {
    id: "satisfactory",
    label: "Satisfactory",
    minimum: 50,
    maximum: 59.99,
    remark:
      "Satisfactory performance. More focused effort is encouraged.",
  },
  {
    id: "needs-improvement",
    label: "Needs improvement",
    minimum: 0,
    maximum: 49.99,
    remark:
      "Performance needs improvement. Work harder and seek support where necessary.",
  },
];

type DraftMap = Record<string, RemarkDraft>;

type StudentRemarkRow = {
  student: Student;
  enrollment: StudentEnrollment;
  reportCard?: ReportCard;
  computedReport?: ComputedStudentReport;
  draft: RemarkDraft;
};

function idOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function sameId(a: unknown, b: unknown) {
  const left = idOf(a);
  const right = idOf(b);
  return !!left && !!right && left === right;
}

function accountMatches(
  rowAccountId: unknown,
  selectedAccountId?: string | null,
) {
  if (!selectedAccountId) return true;
  if (!rowAccountId) return true;
  return String(rowAccountId) === String(selectedAccountId);
}

function rowIsUsable(row: TenantRow) {
  return !!row && row.isDeleted !== true && row.active !== false;
}

function defaultDraft(): RemarkDraft {
  return {
    classTeacherRemark: "",
    headTeacherRemark: "",
    published: false,
  };
}

function countWords(text: string) {
  return cleanText(text) ? cleanText(text).split(/\s+/).length : 0;
}

function resolvedBasisRemark(
  value: unknown,
  label: string,
  metric: RemarkBasisMetric,
) {
  const existing = cleanText(value);

  /*
   * Grading rules can legitimately use short descriptors such as
   * "Excellent", "Good" or "Pass". Those are useful grading labels,
   * but they are too short to serve as report-card remarks. Preserve an
   * existing remark only when it is already sentence-like; otherwise build
   * the proper report remark from the grading band.
   */
  if (countWords(existing) >= 4) {
    return existing;
  }

  return defaultRemarkForBand(label, metric);
}


function normalizeBasisNumber(
  value: unknown,
  fallback = 0,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function basisValueForRow(
  row: StudentRemarkRow,
  metric: RemarkBasisMetric,
): number | undefined {
  const computed =
    row.computedReport;

  if (metric === "position") {
    const value =
      computed?.overallPosition;

    return Number.isFinite(
      Number(value),
    )
      ? Number(value)
      : undefined;
  }

  if (metric === "attendance") {
    const value =
      computed?.attendance
        ?.attendancePercent;

    return Number.isFinite(
      Number(value),
    )
      ? Number(value)
      : undefined;
  }

  const engineValue =
    metric === "total"
      ? computed?.total
      : computed?.average;

  if (
    Number.isFinite(
      Number(engineValue),
    )
  ) {
    return Number(engineValue);
  }

  /*
   * Saved report-card totals and averages are retained only as a compatibility
   * fallback. The report engine is authoritative because report-card rows can
   * exist before their numeric summaries have been regenerated.
   */
  const savedValue =
    metric === "total"
      ? row.reportCard?.total
      : row.reportCard?.average;

  return Number.isFinite(
    Number(savedValue),
  )
    ? Number(savedValue)
    : undefined;
}

function matchingBasisRule(
  value: number | undefined,
  rules: RemarkBasisRule[],
) {
  if (value === undefined) return undefined;

  return rules.find(
    (rule) =>
      value >= rule.minimum &&
      value <= rule.maximum,
  );
}

function reportCardKey(
  studentId: string,
  classId: string,
  academicStructureId: string,
  academicPeriodId: string,
) {
  return `${studentId}:${classId}:${academicStructureId}:${academicPeriodId}`;
}

async function activeRows<T>(tableName: string): Promise<T[]> {
  return ((await listActiveLocal(tableName as any)) || []) as T[];
}

function labelOf<T extends { id?: string; name?: string; fullName?: string }>(
  rows: T[],
  id?: string,
) {
  if (!id) return "Not selected";
  const row = rows.find((item) => item.id === id);
  return row?.name || row?.fullName || "Not found";
}

export default function ReportRemarks() {
  const dataRevision = useBranchTableRevision([
    "students",
    "classes",
    "academicStructures",
    "academicPeriods",
    "studentEnrollments",
    "reportCards",
    "subjects",
    "classSubjects",
    "assessmentApplicabilities",
    "assessmentStructures",
    "assessmentStructureItems",
    "assessmentEntries",
    "gradingStructures",
    "gradeRules",
    "attendance",
    "studentAttendanceSummaries",
    "computedResults",
    "reportCardItems",
  ]);

  const { settings, loading: settingsLoading } = useSettings() as any;
  const { activeSchool, activeBranch } = useActiveBranch() as any;

  const workspace = useBranchWorkspaceScope();
  const {
    accountId: selectedAccountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
  } = workspace;

  const primary =
    cleanText(settings?.primaryColor) || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [subjects, setSubjects] =
    useState<any[]>([]);
  const [classSubjects, setClassSubjects] =
    useState<any[]>([]);
  const [
    assessmentApplicabilities,
    setAssessmentApplicabilities,
  ] = useState<any[]>([]);
  const [
    assessmentStructures,
    setAssessmentStructures,
  ] = useState<any[]>([]);
  const [
    assessmentStructureItems,
    setAssessmentStructureItems,
  ] = useState<any[]>([]);
  const [
    assessmentEntries,
    setAssessmentEntries,
  ] = useState<any[]>([]);
  const [gradingStructures, setGradingStructures] =
    useState<any[]>([]);
  const [gradeRules, setGradeRules] =
    useState<any[]>([]);
  const [attendance, setAttendance] =
    useState<any[]>([]);
  const [
    studentAttendanceSummaries,
    setStudentAttendanceSummaries,
  ] = useState<any[]>([]);
  const [computedResults, setComputedResults] =
    useState<any[]>([]);
  const [reportCardItems, setReportCardItems] =
    useState<any[]>([]);


  const [academicStructureId, setAcademicStructureId] = useState<
    string | undefined
  >(idOf(settings?.currentAcademicStructureId) || undefined);
  const [academicPeriodId, setAcademicPeriodId] = useState<string | undefined>(
    idOf(settings?.currentAcademicPeriodId) || undefined,
  );
  const [classId, setClassId] = useState<string | undefined>();
  const [studentId, setStudentId] = useState<string | undefined>();

  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [drafts, setDrafts] = useState<DraftMap>({});
  const [bulkClassRemark, setBulkClassRemark] = useState("");
  const [bulkHeadRemark, setBulkHeadRemark] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);

  const [basisOpen, setBasisOpen] =
    useState(false);
  const [basisMetric, setBasisMetric] =
    useState<RemarkBasisMetric>(
      "average",
    );
  const [basisTarget, setBasisTarget] =
    useState<RemarkBasisTarget>(
      "headTeacherRemark",
    );
  const [basisOverwrite, setBasisOverwrite] =
    useState(false);
  const [basisRules, setBasisRules] =
    useState<RemarkBasisRule[]>(
      DEFAULT_REMARK_BASIS_RULES,
    );

  const [
    basisSource,
    setBasisSource,
  ] = useState<RemarkBasisSource>({
    title: "Default percentage bands",
    detail:
      "Select a class and basis to derive bands from the reporting system.",
  });

  const lastDerivedBasisSignatureRef =
    useRef("");


  const remarksBasisStorageKey =
    useMemo(
      () =>
        [
          "eleeveon_report_remarks_basis_v1",
          selectedAccountId || "account",
          schoolId || "school",
          branchId || "branch",
        ].join(":"),
      [
        branchId,
        schoolId,
        selectedAccountId,
      ],
    );

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(
          remarksBasisStorageKey,
        );

      if (!raw) {
        setBasisMetric("average");
        setBasisTarget(
          "headTeacherRemark",
        );
        setBasisOverwrite(false);
        setBasisRules(
          DEFAULT_REMARK_BASIS_RULES,
        );
        return;
      }

      const stored = JSON.parse(
        raw,
      ) as {
        metric?: RemarkBasisMetric;
        target?: RemarkBasisTarget;
        overwrite?: boolean;
        rules?: RemarkBasisRule[];
      };

      setBasisMetric(
        stored.metric === "total" ||
          stored.metric === "position" ||
          stored.metric === "attendance"
          ? stored.metric
          : "average",
      );
      setBasisTarget(
        stored.target ===
          "classTeacherRemark"
          ? "classTeacherRemark"
          : "headTeacherRemark",
      );
      setBasisOverwrite(
        !!stored.overwrite,
      );
      setBasisRules(
        Array.isArray(stored.rules) &&
          stored.rules.length
          ? stored.rules.map(
              (rule, index) => ({
                id:
                  cleanText(rule.id) ||
                  `rule-${index + 1}`,
                label:
                  cleanText(rule.label) ||
                  `Band ${index + 1}`,
                minimum:
                  normalizeBasisNumber(
                    rule.minimum,
                  ),
                maximum:
                  normalizeBasisNumber(
                    rule.maximum,
                    100,
                  ),
                remark:
                  resolvedBasisRemark(
                    rule.remark,
                    cleanText(rule.label) ||
                      `Band ${index + 1}`,
                    stored.metric === "total" ||
                      stored.metric === "position" ||
                      stored.metric === "attendance"
                      ? stored.metric
                      : "average",
                  ),
              }),
            )
          : DEFAULT_REMARK_BASIS_RULES,
      );
    } catch {
      setBasisRules(
        DEFAULT_REMARK_BASIS_RULES,
      );
    }
  }, [remarksBasisStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        remarksBasisStorageKey,
        JSON.stringify({
          metric: basisMetric,
          target: basisTarget,
          overwrite: basisOverwrite,
          rules: basisRules,
        }),
      );
    } catch {
      // Storage restrictions must not block remark entry.
    }
  }, [
    basisMetric,
    basisOverwrite,
    basisRules,
    basisTarget,
    remarksBasisStorageKey,
  ]);


  const sameTenant = (row: TenantRow) =>
    accountMatches(row.accountId, selectedAccountId) &&
    sameId(row.schoolId, schoolId) &&
    sameId(row.branchId, branchId) &&
    rowIsUsable(row);

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setEnrollments([]);
    setReportCards([]);
    setSubjects([]);
    setClassSubjects([]);
    setAssessmentApplicabilities([]);
    setAssessmentStructures([]);
    setAssessmentStructureItems([]);
    setAssessmentEntries([]);
    setGradingStructures([]);
    setGradeRules([]);
    setAttendance([]);
    setStudentAttendanceSummaries([]);
    setComputedResults([]);
    setReportCardItems([]);
  };

  const load = async () => {
    if (!authenticated || !selectedAccountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const loadResult =
        await Promise.all([
          activeRows<Student>("students"),
          activeRows<Class>("classes"),
          activeRows<AcademicStructure>(
            "academicStructures",
          ),
          activeRows<AcademicPeriod>(
            "academicPeriods",
          ),
          activeRows<StudentEnrollment>(
            "studentEnrollments",
          ),
          activeRows<ReportCard>(
            "reportCards",
          ),
          activeRows<any>("subjects"),
          activeRows<any>("classSubjects"),
          activeRows<any>(
            "assessmentApplicabilities",
          ),
          activeRows<any>(
            "assessmentStructures",
          ),
          activeRows<any>(
            "assessmentStructureItems",
          ),
          activeRows<any>(
            "assessmentEntries",
          ),
          activeRows<any>(
            "gradingStructures",
          ),
          activeRows<any>("gradeRules"),
          activeRows<any>("attendance"),
          activeRows<any>(
            "studentAttendanceSummaries",
          ),
          activeRows<any>(
            "computedResults",
          ),
          activeRows<any>(
            "reportCardItems",
          ),
        ]);

      const studentRows =
        loadResult[0] as Student[];
      const classRows =
        loadResult[1] as Class[];
      const structureRows =
        loadResult[2] as AcademicStructure[];
      const periodRows =
        loadResult[3] as AcademicPeriod[];
      const enrollmentRows =
        loadResult[4] as StudentEnrollment[];
      const reportRows =
        loadResult[5] as ReportCard[];

      setStudents(
        studentRows
          .filter((row: any) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) =>
            cleanText(a.fullName).localeCompare(cleanText(b.fullName)),
          ),
      );

      setClasses(
        classRows
          .filter((row: any) => sameTenant(row))
          .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name))),
      );

      setAcademicStructures(
        structureRows
          .filter((row: any) => sameTenant(row))
          .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name))),
      );

      setAcademicPeriods(
        periodRows
          .filter((row: any) => sameTenant(row))
          .sort(
            (a: any, b: any) => Number(a.order || 0) - Number(b.order || 0),
          ),
      );

      setEnrollments(enrollmentRows.filter((row: any) => sameTenant(row)));
      setReportCards(reportRows.filter((row: any) => sameTenant(row)));
      setSubjects(
        (loadResult[6] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setClassSubjects(
        (loadResult[7] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setAssessmentApplicabilities(
        (loadResult[8] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setAssessmentStructures(
        (loadResult[9] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setAssessmentStructureItems(
        (loadResult[10] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setAssessmentEntries(
        (loadResult[11] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setGradingStructures(
        (loadResult[12] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setGradeRules(
        (loadResult[13] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setAttendance(
        (loadResult[14] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setStudentAttendanceSummaries(
        (loadResult[15] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setComputedResults(
        (loadResult[16] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );
      setReportCardItems(
        (loadResult[17] as any[])
          .filter((row) =>
            sameTenant(row),
          ),
      );

    } catch (error) {
      console.error("Failed to load report remarks:", error);
      clearData();
      alert("Failed to load report remarks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, selectedAccountId, schoolId, branchId, dataRevision]);

  const studentMap = useMemo(
    () => new Map(students.map((row) => [row.id, row])),
    [students],
  );
  const classMap = useMemo(
    () => new Map(classes.map((row) => [row.id, row])),
    [classes],
  );

  const teacherClassIds = useMemo(
    () => undefined as Set<string> | undefined,
    [],
  );

  const filteredPeriods = useMemo(() => {
    if (!academicStructureId) return academicPeriods;
    return academicPeriods.filter((row) =>
      sameId(row.academicStructureId, academicStructureId),
    );
  }, [academicPeriods, academicStructureId]);

  const availableClassIds = useMemo(() => {
    const ids = new Set<string>();

    enrollments.forEach((row) => {
      if (row.status === "withdrawn") return;
      if (
        academicStructureId &&
        !sameId(row.academicStructureId, academicStructureId)
      )
        return;
      if (academicPeriodId && !sameId(row.academicPeriodId, academicPeriodId))
        return;
      if (row.classId) ids.add(row.classId);
    });

    reportCards.forEach((row) => {
      if (
        academicStructureId &&
        !sameId(row.academicStructureId, academicStructureId)
      )
        return;
      if (academicPeriodId && !sameId(row.academicPeriodId, academicPeriodId))
        return;
      if (row.classId) ids.add(row.classId);
    });

    return ids;
  }, [
    academicPeriodId,
    academicStructureId,
    enrollments,
    reportCards,
    teacherClassIds,
  ]);

  const availableClasses = useMemo(() => {
    if (!academicStructureId && !academicPeriodId) {
      return teacherClassIds
        ? classes.filter((row) => row.id && teacherClassIds.has(row.id))
        : classes;
    }

    return classes.filter((row) => row.id && availableClassIds.has(row.id));
  }, [
    academicPeriodId,
    academicStructureId,
    availableClassIds,
    classes,
    teacherClassIds,
  ]);

  const reportCardMap = useMemo(() => {
    const map = new Map<string, ReportCard>();

    reportCards.forEach((row) => {
      if (
        !row.studentId ||
        !row.classId ||
        !row.academicStructureId ||
        !row.academicPeriodId
      )
        return;
      map.set(
        reportCardKey(
          row.studentId,
          row.classId,
          row.academicStructureId,
          row.academicPeriodId,
        ),
        row,
      );
    });

    return map;
  }, [reportCards]);


  const reportEngineDataset =
    useMemo<ReportEngineDataset>(
      () => ({
        schools:
          activeSchool
            ? [activeSchool as any]
            : [],
        branches:
          activeBranch
            ? [activeBranch as any]
            : [],
        schoolBranchSettings:
          settings
            ? [settings as any]
            : [],

        academicStructures,
        academicPeriods,

        students,
        teachers: [],
        parents: [],
        studentParents: [],
        classes,
        subjects,
        classSubjects,
        studentEnrollments:
          enrollments,
        classTeachers: [],

        assessmentApplicabilities,
        assessmentStructures,
        assessmentStructureItems,
        assessmentEntries,
        gradingStructures,
        gradeRules,

        attendance,
        studentAttendanceSummaries,

        computedResults,
        reportCards,
        reportCardItems,
      }),
      [
        activeBranch,
        activeSchool,
        academicPeriods,
        academicStructures,
        assessmentApplicabilities,
        assessmentEntries,
        assessmentStructureItems,
        assessmentStructures,
        attendance,
        classSubjects,
        classes,
        computedResults,
        enrollments,
        gradeRules,
        gradingStructures,
        reportCardItems,
        reportCards,
        settings,
        studentAttendanceSummaries,
        students,
        subjects,
      ],
    );

  const computedClassReports =
    useMemo(() => {
      if (
        !branchId ||
        !academicStructureId ||
        !academicPeriodId ||
        !classId
      ) {
        return [] as ComputedStudentReport[];
      }

      const filters:
        ReportFiltersState = {
        branchId,
        academicStructureId,
        academicPeriodId,
        classId,
        sortMode: "position",
      };

      try {
        return buildClassReports(
          reportEngineDataset,
          filters,
        );
      } catch (error) {
        console.error(
          "Failed to compute report remark basis values:",
          error,
        );

        return [] as ComputedStudentReport[];
      }
    }, [
      academicPeriodId,
      academicStructureId,
      branchId,
      classId,
      reportEngineDataset,
    ]);

  const computedReportMap =
    useMemo(
      () =>
        new Map(
          computedClassReports.map(
            (report) => [
              report.studentId,
              report,
            ],
          ),
        ),
      [computedClassReports],
    );


  const intelligentBasis =
    useMemo<{
      rules: RemarkBasisRule[];
      source: RemarkBasisSource;
      signature: string;
    }>(() => {
      const reports =
        computedClassReports;

      const subjectCounts =
        reports
          .map(
            (report) =>
              report.subjectResults
                .length,
          )
          .filter(
            (count) =>
              count > 0,
          );

      const subjectCount =
        subjectCounts.length
          ? Math.max(
              ...subjectCounts,
            )
          : classSubjects.filter(
              (row: any) =>
                sameId(
                  row.classId,
                  classId,
                ) &&
                row.active !== false &&
                row.isDeleted !== true,
            ).length;

      const gradingStructureFrequency =
        new Map<string, number>();

      reports.forEach((report) => {
        report.subjectResults.forEach(
          (subject) => {
            const gradingStructureId =
              idOf(
                subject.gradingStructureId,
              );

            if (!gradingStructureId) {
              return;
            }

            gradingStructureFrequency.set(
              gradingStructureId,
              (gradingStructureFrequency.get(
                gradingStructureId,
              ) || 0) + 1,
            );
          },
        );
      });

      const dominantGradingStructureId =
        [
          ...gradingStructureFrequency
            .entries(),
        ].sort(
          (left, right) =>
            right[1] - left[1],
        )[0]?.[0] ||
        idOf(
          gradingStructures.find(
            (system: any) =>
              system.default === true &&
              system.active !== false,
          )?.id,
        ) ||
        idOf(
          gradingStructures.find(
            (system: any) =>
              system.active !== false,
          )?.id,
        );

      const activeGradingStructure =
        gradingStructures.find(
          (system: any) =>
            sameId(
              system.id,
              dominantGradingStructureId,
            ),
        );

      const configuredGradeRules =
        gradeRules
          .filter(
            (rule: any) =>
              sameId(
                rule.gradingStructureId,
                dominantGradingStructureId,
              ) &&
              rule.active !== false &&
              rule.isDeleted !== true,
          )
          .sort(
            (left: any, right: any) =>
              Number(right.minScore || 0) -
              Number(left.minScore || 0),
          );

      if (
        basisMetric === "average"
      ) {
        const rules =
          configuredGradeRules.length
            ? configuredGradeRules.map(
                (rule: any, index) => {
                  const label =
                    cleanText(
                      rule.grade,
                    ) ||
                    cleanText(
                      rule.remark,
                    ) ||
                    `Band ${index + 1}`;

                  return {
                    id:
                      idOf(rule.id) ||
                      `average-${index}`,
                    label,
                    minimum:
                      normalizeBasisNumber(
                        rule.minScore,
                      ),
                    maximum:
                      normalizeBasisNumber(
                        rule.maxScore,
                        100,
                      ),
                    remark:
                      resolvedBasisRemark(
                        rule.remark,
                        label,
                        "average",
                      ),
                  };
                },
              )
            : DEFAULT_REMARK_BASIS_RULES;

        return {
          rules:
            normalizeGeneratedRules(
              rules,
            ),
          source: {
            title:
              cleanText(
                activeGradingStructure?.name,
              ) ||
              "Default percentage grading",
            detail:
              configuredGradeRules.length
                ? `${configuredGradeRules.length} grade bands from the active class grading configuration.`
                : "No active grading rules were found, so standard percentage bands are being used.",
          },
          signature: [
            "average",
            dominantGradingStructureId,
            configuredGradeRules
              .map(
                (rule: any) =>
                  [
                    rule.id,
                    rule.minScore,
                    rule.maxScore,
                    rule.grade,
                    rule.remark,
                  ].join(":"),
              )
              .join("|"),
          ].join("::"),
        };
      }

      if (
        basisMetric === "total"
      ) {
        const observedSubjectCount =
          Math.max(
            1,
            subjectCount,
          );

        const observedMaximumTotal =
          reports
            .map((report) => Number(report.total))
            .filter((value) => Number.isFinite(value) && value >= 0)
            .reduce((maximum, value) => Math.max(maximum, value), 0);

        /*
         * A normal Eleeveon report subject contributes up to 100 to the raw
         * class total. The selected class subject load is therefore the stable
         * configured maximum, while observed totals verify that the report
         * engine is producing values in that range.
         */
        const configuredMaximumTotal =
          observedSubjectCount * 100;

        const maximumTotal =
          Math.max(
            configuredMaximumTotal,
            observedMaximumTotal,
            100,
          );

        const multiplier =
          maximumTotal / 100;

        const percentageRules =
          configuredGradeRules.length
            ? configuredGradeRules
            : DEFAULT_REMARK_BASIS_RULES.map(
                (rule) => ({
                  id: rule.id,
                  minScore:
                    rule.minimum,
                  maxScore:
                    rule.maximum,
                  grade: rule.label,
                  remark:
                    rule.remark,
                }),
              );

        const rules =
          percentageRules.map(
            (rule: any, index) => {
              const label =
                cleanText(
                  rule.grade,
                ) ||
                cleanText(
                  rule.label,
                ) ||
                `Band ${index + 1}`;

              return {
                id: `total-${
                  idOf(rule.id) ||
                  index
                }`,
                label,
                minimum:
                  Number(
                    (
                      normalizeBasisNumber(
                        rule.minScore ??
                          rule.minimum,
                      ) *
                      multiplier
                    ).toFixed(2),
                  ),
                maximum:
                  Number(
                    (
                      normalizeBasisNumber(
                        rule.maxScore ??
                          rule.maximum,
                        100,
                      ) *
                      multiplier
                    ).toFixed(2),
                  ),
                remark:
                  resolvedBasisRemark(
                    rule.remark,
                    label,
                    "total",
                  ),
              };
            },
          );

        return {
          rules:
            normalizeGeneratedRules(
              rules,
            ),
          source: {
            title:
              cleanText(
                activeGradingStructure?.name,
              ) ||
              "Percentage grading scaled to total",
            detail:
              `${observedSubjectCount} active subject${
                observedSubjectCount === 1
                  ? ""
                  : "s"
              } give a configured maximum total of ${configuredMaximumTotal}. ${
                observedMaximumTotal
                  ? `Current report data reaches ${Number(observedMaximumTotal.toFixed(2))}.`
                  : "No computed total is available yet, so the configured class subject load is used."
              }`,
          },
          signature: [
            "total",
            dominantGradingStructureId,
            observedSubjectCount,
            maximumTotal,
            percentageRules
              .map(
                (rule: any) =>
                  [
                    rule.id,
                    rule.minScore ??
                      rule.minimum,
                    rule.maxScore ??
                      rule.maximum,
                    rule.grade ??
                      rule.label,
                  ].join(":"),
              )
              .join("|"),
          ].join("::"),
        };
      }

      if (
        basisMetric === "position"
      ) {
        const enrolledClassSize =
          enrollments.filter(
            (row) =>
              row.status !==
                "withdrawn" &&
              sameId(
                row.academicStructureId,
                academicStructureId,
              ) &&
              sameId(
                row.academicPeriodId,
                academicPeriodId,
              ) &&
              sameId(
                row.classId,
                classId,
              ),
          ).length;

        const classSize =
          Math.max(
            reports.length,
            enrolledClassSize,
          );

        if (!classSize) {
          return {
            rules: [
              {
                id: "position-first",
                label: "1st position",
                minimum: 1,
                maximum: 1,
                remark:
                  defaultRemarkForBand(
                    "1st position",
                    "position",
                  ),
              },
            ],
            source: {
              title:
                "Class position bands",
              detail:
                "Select a class with computed reports to derive position ranges.",
            },
            signature:
              "position::0",
          };
        }

        const bands: RemarkBasisRule[] =
          [];

        const addBand = (
          id: string,
          label: string,
          minimum: number,
          maximum: number,
          remarkLabel = label,
        ) => {
          if (
            minimum > classSize ||
            maximum < minimum
          ) {
            return;
          }

          bands.push({
            id,
            label,
            minimum,
            maximum:
              Math.min(
                maximum,
                classSize,
              ),
            remark:
              defaultRemarkForBand(
                remarkLabel,
                "position",
              ),
          });
        };

        addBand(
          "position-first",
          "1st position",
          1,
          1,
          "first",
        );

        addBand(
          "position-top-three",
          classSize >= 3
            ? "2nd–3rd position"
            : "2nd position",
          2,
          Math.min(3, classSize),
          "top",
        );

        const upperEnd =
          Math.max(
            4,
            Math.ceil(
              classSize * 0.25,
            ),
          );

        addBand(
          "position-upper",
          "Upper quarter",
          4,
          upperEnd,
          "upper",
        );

        const middleEnd =
          Math.max(
            upperEnd + 1,
            Math.ceil(
              classSize * 0.6,
            ),
          );

        addBand(
          "position-middle",
          "Middle group",
          upperEnd + 1,
          middleEnd,
          "middle",
        );

        addBand(
          "position-lower",
          "Needs stronger position",
          middleEnd + 1,
          classSize,
          "lower",
        );

        return {
          rules: bands,
          source: {
            title:
              "Actual class position distribution",
            detail:
              `${classSize} student${
                classSize === 1
                  ? ""
                  : "s"
              } with positions assigned by the report engine from computed averages.`,
          },
          signature:
            `position::${classSize}`,
        };
      }

      const configuredAttendanceTarget =
        [
          settings?.minimumAttendancePercentage,
          settings?.requiredAttendancePercentage,
          settings?.attendanceTargetPercentage,
          settings?.attendancePassPercentage,
        ]
          .map((value) =>
            Number(value),
          )
          .find((value) =>
            Number.isFinite(value),
          );

      const target =
        Math.min(
          100,
          Math.max(
            1,
            configuredAttendanceTarget ??
              75,
          ),
        );

      const excellentMin =
        Math.max(
          target,
          90,
        );
      const goodMin =
        Math.max(
          target,
          Math.min(
            excellentMin - 1,
            80,
          ),
        );
      const satisfactoryMin =
        Math.min(
          goodMin - 1,
          target,
        );

      const attendanceRules:
        RemarkBasisRule[] = [
        {
          id:
            "attendance-excellent",
          label:
            "Excellent attendance",
          minimum:
            excellentMin,
          maximum: 100,
          remark:
            defaultRemarkForBand(
              "excellent",
              "attendance",
            ),
        },
        {
          id:
            "attendance-good",
          label: "Good attendance",
          minimum:
            goodMin,
          maximum:
            excellentMin - 0.01,
          remark:
            defaultRemarkForBand(
              "good",
              "attendance",
            ),
        },
        {
          id:
            "attendance-satisfactory",
          label:
            "Satisfactory attendance",
          minimum:
            satisfactoryMin,
          maximum:
            goodMin - 0.01,
          remark:
            defaultRemarkForBand(
              "satisfactory",
              "attendance",
            ),
        },
        {
          id:
            "attendance-poor",
          label:
            "Attendance needs improvement",
          minimum: 0,
          maximum:
            satisfactoryMin - 0.01,
          remark:
            defaultRemarkForBand(
              "needs improvement",
              "attendance",
            ),
        },
      ];

      return {
        rules:
          normalizeGeneratedRules(
            attendanceRules,
          ),
        source: {
          title:
            configuredAttendanceTarget !==
            undefined
              ? "School attendance configuration"
              : "Report attendance percentage",
          detail:
            configuredAttendanceTarget !==
            undefined
              ? `The school attendance expectation is ${target}%. Bands were generated around this configured threshold.`
              : "No school attendance threshold was found, so the report engine’s percentage is grouped around a 75% minimum expectation.",
        },
        signature: [
          "attendance",
          target,
        ].join("::"),
      };
    }, [
      basisMetric,
      classId,
      classSubjects,
      computedClassReports,
      gradeRules,
      gradingStructures,
      settings,
      academicPeriodId,
      academicStructureId,
      enrollments,
    ]);

  useEffect(() => {
    if (!intelligentBasis.signature) return;

    const signatureChanged =
      lastDerivedBasisSignatureRef.current !== intelligentBasis.signature;

    if (!signatureChanged && basisRules.length > 0) return;

    lastDerivedBasisSignatureRef.current =
      intelligentBasis.signature;

    setBasisRules(
      intelligentBasis.rules,
    );
    setBasisSource(
      intelligentBasis.source,
    );
  }, [
    intelligentBasis,
    basisRules.length,
  ]);

  const studentRows = useMemo<StudentRemarkRow[]>(() => {
    if (!academicStructureId || !academicPeriodId || !classId) return [];

    return enrollments
      .filter((row) => {
        return (
          row.status !== "withdrawn" &&
          sameId(row.academicStructureId, academicStructureId) &&
          sameId(row.academicPeriodId, academicPeriodId) &&
          sameId(row.classId, classId)
        );
      })
      .map((enrollment) => {
        const student = studentMap.get(enrollment.studentId);
        if (!student?.id) return undefined;

        const key = reportCardKey(
          student.id,
          enrollment.classId,
          enrollment.academicStructureId,
          enrollment.academicPeriodId,
        );

        const reportCard =
          reportCardMap.get(key);
        const computedReport =
          computedReportMap.get(
            student.id,
          );
        const draft = drafts[student.id] || {
          reportCardId: reportCard?.id,
          classTeacherRemark: reportCard?.classTeacherRemark || "",
          headTeacherRemark: reportCard?.headTeacherRemark || "",
          published: !!reportCard?.published,
        };

        return {
          student,
          enrollment,
          reportCard,
          computedReport,
          draft,
        };
      })
      .filter(Boolean) as StudentRemarkRow[];
  }, [
    academicPeriodId,
    academicStructureId,
    classId,
    drafts,
    computedReportMap,
    enrollments,
    reportCardMap,
    studentMap,
    teacherClassIds,
  ]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentRows
      .filter((row) => {
        const draft = row.draft;
        const complete =
          !!row.draft.classTeacherRemark.trim() &&
          !!row.draft.headTeacherRemark.trim();

        if (viewMode === "single" && studentId && row.student.id !== studentId)
          return false;
        if (remarkFilter === "missing" && complete) return false;
        if (remarkFilter === "complete" && !complete) return false;
        if (remarkFilter === "published" && !draft.published) return false;
        if (remarkFilter === "unpublished" && draft.published) return false;

        if (!query) return true;

        return `${row.student.fullName || ""} ${row.student.admissionNumber || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) =>
        cleanText(a.student.fullName).localeCompare(
          cleanText(b.student.fullName),
        ),
      );
  }, [remarkFilter, search, studentId, studentRows, viewMode]);

  const selectedRow = useMemo(() => {
    if (!studentId) return visibleRows[0];
    return studentRows.find((row) => row.student.id === studentId);
  }, [studentId, studentRows, visibleRows]);

  useEffect(() => {
    if (!academicStructureId || !academicPeriodId || !classId) {
      setDrafts({});
      return;
    }

    const next: DraftMap = {};

    studentRows.forEach((row) => {
      if (!row.student.id) return;

      next[row.student.id] = {
        reportCardId: row.reportCard?.id,
        classTeacherRemark: row.reportCard?.classTeacherRemark || "",
        headTeacherRemark: row.reportCard?.headTeacherRemark || "",
        published: !!row.reportCard?.published,
      };
    });

    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicStructureId, academicPeriodId, classId, reportCards.length]);

  const summary = useMemo(() => {
    const total = studentRows.length;
    const classRemarked = studentRows.filter(
      (row) => !!row.draft.classTeacherRemark.trim(),
    ).length;
    const headRemarked = studentRows.filter(
      (row) => !!row.draft.headTeacherRemark.trim(),
    ).length;
    const complete = studentRows.filter(
      (row) =>
        !!row.draft.classTeacherRemark.trim() &&
        !!row.draft.headTeacherRemark.trim(),
    ).length;
    const published = studentRows.filter((row) => row.draft.published).length;
    const missing = Math.max(0, total - complete);
    const completion = total ? Math.round((complete / total) * 100) : 0;

    return {
      total,
      classRemarked,
      headRemarked,
      complete,
      published,
      missing,
      completion,
    };
  }, [studentRows]);

  const activeFilterCount = useMemo(() => {
    return [
      academicStructureId,
      academicPeriodId,
      classId,
      studentId,
      remarkFilter !== "all" ? remarkFilter : undefined,
      viewMode !== "single" ? viewMode : undefined,
    ].filter(Boolean).length;
  }, [
    academicPeriodId,
    academicStructureId,
    classId,
    remarkFilter,
    studentId,
    viewMode,
  ]);

  const selectedStructureName = labelOf(
    academicStructures,
    academicStructureId,
  );
  const selectedPeriodName = labelOf(academicPeriods, academicPeriodId);
  const selectedClassName = labelOf(classes, classId);
  const selectedStudentName = labelOf(students, studentId);
  const contextName = `${activeSchool?.name || "Selected School"} · ${activeBranch?.name || "Selected Branch"}`;

  const updateDraft = (studentIdValue: string, patch: Partial<RemarkDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [studentIdValue]: {
        ...(prev[studentIdValue] || defaultDraft()),
        ...patch,
      },
    }));
  };


  const changeBasisMetric = (
    metric: RemarkBasisMetric,
  ) => {
    lastDerivedBasisSignatureRef.current = "";
    setBasisMetric(metric);

    /*
     * Do not carry min/max bands from the previous metric into the next one.
     * The intelligentBasis effect below will immediately replace these with
     * ranges derived from the active grading system/class/report configuration.
     */
    setBasisRules([]);
    setBasisSource({
      title: "Updating remarks basis…",
      detail:
        "Recalculating minimum and maximum bands from the selected class and reporting system.",
    });
  };


  const updateBasisRule = (
    id: string,
    patch: Partial<RemarkBasisRule>,
  ) => {
    setBasisRules((current) =>
      current.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    );
  };

  const addBasisRule = () => {
    setBasisRules((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        label: `Band ${current.length + 1}`,
        minimum: 0,
        maximum: 100,
        remark: "",
      },
    ]);
  };

  const removeBasisRule = (
    id: string,
  ) => {
    setBasisRules((current) =>
      current.length <= 1
        ? current
        : current.filter(
            (rule) =>
              rule.id !== id,
          ),
    );
  };

  const applyRemarksBasis = (
    scope:
      | "selected"
      | "shown",
  ) => {
    const candidates =
      scope === "selected"
        ? selectedRow
          ? [selectedRow]
          : []
        : visibleRows;

    if (!candidates.length) {
      return alert(
        scope === "selected"
          ? "Select a student first."
          : "No students match the current filters.",
      );
    }

    const next: DraftMap = {
      ...drafts,
    };

    let applied = 0;
    let skippedNoScore = 0;
    let skippedNoBand = 0;
    let skippedExisting = 0;

    candidates.forEach((row) => {
      const sid =
        row.student.id || "";

      if (!sid) return;

      const value =
        basisValueForRow(
          row,
          basisMetric,
        );

      if (value === undefined) {
        skippedNoScore += 1;
        return;
      }

      const rule =
        matchingBasisRule(
          value,
          basisRules,
        );

      if (!rule?.remark.trim()) {
        skippedNoBand += 1;
        return;
      }

      const current =
        next[sid] ||
        row.draft ||
        defaultDraft();

      if (
        !basisOverwrite &&
        cleanText(
          current[basisTarget],
        )
      ) {
        skippedExisting += 1;
        return;
      }

      next[sid] = {
        ...current,
        [basisTarget]:
          rule.remark.trim(),
      };

      applied += 1;
    });

    setDrafts(next);

    alert(
      [
        `${applied} remark${applied === 1 ? "" : "s"} applied.`,
        skippedNoScore
          ? `${skippedNoScore} without a computed ${basisMetric} value.`
          : "",
        skippedNoBand
          ? `${skippedNoBand} without a matching completed band.`
          : "",
        skippedExisting
          ? `${skippedExisting} kept because overwrite is off.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  const applyBulkRemarks = () => {
    if (!visibleRows.length)
      return alert("No students match the current filters.");
    if (!bulkClassRemark.trim() && !bulkHeadRemark.trim())
      return alert("Enter at least one remark first.");

    const next: DraftMap = { ...drafts };

    visibleRows.forEach((row) => {
      const sid = row.student.id || "";
      const current = next[sid] || row.draft || defaultDraft();

      next[sid] = {
        ...current,
        classTeacherRemark:
          bulkClassRemark.trim() &&
          (bulkOverwrite || !current.classTeacherRemark.trim())
            ? bulkClassRemark.trim()
            : current.classTeacherRemark,
        headTeacherRemark:
          bulkHeadRemark.trim() &&
          (bulkOverwrite || !current.headTeacherRemark.trim())
            ? bulkHeadRemark.trim()
            : current.headTeacherRemark,
      };
    });

    setDrafts(next);
  };

  const togglePublishShown = (published: boolean) => {
    const next: DraftMap = { ...drafts };

    visibleRows.forEach((row) => {
      const sid = row.student.id || "";
      next[sid] = {
        ...(next[sid] || row.draft || defaultDraft()),
        published,
      };
    });

    setDrafts(next);
  };

  const saveRows = async (rows: StudentRemarkRow[]) => {
    if (!authenticated || !selectedAccountId) return alert("Sign in first.");
    if (!schoolId) return alert("Select school first.");
    if (!branchId) return alert("Select branch first.");
    if (!academicStructureId) return alert("Select academic structure.");
    if (!academicPeriodId) return alert("Select academic period.");
    if (!classId) return alert("Select class.");
    if (!rows.length) return alert("No students to save.");

    try {
      setSaving(true);

      for (const row of rows) {
        const sid = row.student.id;
        if (!sid) continue;

        const draft = drafts[sid] || row.draft || defaultDraft();
        const existing =
          row.reportCard ||
          reportCardMap.get(
            reportCardKey(sid, classId, academicStructureId, academicPeriodId),
          );

        if (existing?.id) {
          await updateLocal("reportCards" as any, String(existing.id), {
            accountId: selectedAccountId,
            schoolId: schoolId,
            branchId: branchId,
            classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
            headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
            published: draft.published,
          } as Partial<ReportCard>);
        } else {
          await createLocal(
            "reportCards" as any,
            {
              accountId: selectedAccountId,
              schoolId: schoolId,
              branchId: branchId,
              studentId: sid,
              classId: classId,
              academicStructureId: academicStructureId,
              academicPeriodId: academicPeriodId,
              total: 0,
              average: 0,
              classTeacherRemark: draft.classTeacherRemark.trim() || undefined,
              headTeacherRemark: draft.headTeacherRemark.trim() || undefined,
              published: draft.published,
            } as Partial<ReportCard>,
          );
        }
      }

      await load();
      alert("Report remarks saved.");
    } catch (error) {
      console.error("Failed to save report remarks:", error);
      alert("Failed to save report remarks.");
    } finally {
      setSaving(false);
    }
  };

  const saveCurrent = async () => {
    if (viewMode === "single") {
      if (!selectedRow) return alert("Select a student first.");
      await saveRows([selectedRow]);
      return;
    }

    await saveRows(visibleRows);
  };

  // Branch Admin V4 toolbar: select another student through Add, save via
  // the existing remark editor. Filtering/search remains available in Filter.
  useRegisterBranchWorkspaceToolbar("reportsWorkspace", {
    add: () => setFilterOpen(true),
    search: setSearch,
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
  });

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening report remarks..."
        text="Checking workspace, classes, students and report cards."
      />
    );
  }

  if (!authenticated || !selectedAccountId) {
    return (
      <State
        primary={primary}
        title="Sign in required"
        text="You must sign in before managing report remarks."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <State
        primary={primary}
        title="Branch workspace required"
        text="Report remarks belong to one active school branch."
      />
    );
  }

  return (
    <main
      className="ba-page report-remarks-page"
      style={
        {
          "--ba-primary": primary,
          "--primary-color": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>

      {viewMode === "analytics" && (
        <section className="ba-filter-chips">
          <SummaryChip label="Students" value={summary.total} />
          <SummaryChip label="Class remarks" value={summary.classRemarked} />
          <SummaryChip label="Head remarks" value={summary.headRemarked} />
          <SummaryChip label="Complete" value={summary.complete} />
          <SummaryChip label="Missing" value={summary.missing} />
          <SummaryChip label="Published" value={summary.published} />
          <SummaryChip label="Done" value={`${summary.completion}%`} />
        </section>
      )}

      {viewMode === "group" && (
        <section className="ba-remark-card">
          <div className="ba-remark-head">
            <div>
              <h3>Group tools</h3>
              <p>Apply remarks to the students currently shown.</p>
            </div>
            <label className="ba-publish-line">
              <input
                type="checkbox"
                checked={bulkOverwrite}
                onChange={(event) => setBulkOverwrite(event.target.checked)}
              />
              Overwrite
            </label>
          </div>

          <div className="ba-remark-grid two">
            <label className="ba-remark-field">
              <span>
                <b>Class Teacher Remark</b>
                <em>{countWords(bulkClassRemark)} words</em>
              </span>
              <textarea
                value={bulkClassRemark}
                onChange={(event) => setBulkClassRemark(event.target.value)}
                placeholder="Class teacher remark..."
              />
            </label>

            <label className="ba-remark-field">
              <span>
                <b>Head Teacher Remark</b>
                <em>{countWords(bulkHeadRemark)} words</em>
              </span>
              <textarea
                value={bulkHeadRemark}
                onChange={(event) => setBulkHeadRemark(event.target.value)}
                placeholder="Head teacher / principal remark..."
              />
            </label>
          </div>

          <div className="ba-sheet-actions">
            <button type="button" onClick={applyBulkRemarks}>
              Apply to shown
            </button>
            <button type="button" onClick={() => togglePublishShown(true)}>
              Publish shown
            </button>
            <button type="button" onClick={() => togglePublishShown(false)}>
              Unpublish shown
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => saveRows(visibleRows)}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save shown"}
            </button>
          </div>
        </section>
      )}

      {viewMode === "single" && selectedRow && (
        <RemarkEditor
          row={selectedRow}
          className={classId ? classMap.get(classId)?.name : undefined}
          draft={drafts[selectedRow.student.id || ""] || selectedRow.draft}
          updateDraft={updateDraft}
          canEditHeadRemark
          canPublish
          onSave={saveCurrent}
          saving={saving}
          basisMetric={basisMetric}
          basisValue={basisValueForRow(
            selectedRow,
            basisMetric,
          )}
          basisRule={matchingBasisRule(
            basisValueForRow(
              selectedRow,
              basisMetric,
            ),
            basisRules,
          )}
        />
      )}

      {viewMode === "group" && (
        <section className="ba-list">
          {visibleRows.map((row) => (
            <button
              key={row.student.id}
              type="button"
              className={`ba-student-row ${studentId === row.student.id ? "active" : ""}`}
              onClick={() => {
                setStudentId(row.student.id || undefined);
                setViewMode("single");
              }}
            >
              <span className="ba-avatar">
                {cleanText(row.student.fullName).slice(0, 1).toUpperCase() ||
                  "S"}
              </span>
              <span className="ba-student-main">
                <strong>{row.student.fullName}</strong>
                <small>
                  {row.student.admissionNumber || "No admission no."} ·{" "}
                  {classMap.get(row.enrollment.classId)?.name || "Class"}
                </small>
                <em>
                  {row.draft.classTeacherRemark
                    ? "Class remark entered"
                    : "Class remark missing"}
                  {" · "}
                  {(() => {
                    const value =
                      basisValueForRow(
                        row,
                        basisMetric,
                      );
                    const rule =
                      matchingBasisRule(
                        value,
                        basisRules,
                      );

                    return value === undefined
                      ? `No ${basisMetric}`
                      : `${basisMetric === "average"
                          ? "Avg"
                          : basisMetric === "total"
                            ? "Total"
                            : basisMetric === "position"
                              ? "Position"
                              : "Attendance"} ${basisMetric === "position" ? Math.round(value) : value.toFixed(1)}${basisMetric === "attendance" ? "%" : ""}${rule ? ` · ${rule.label}` : ""}`;
                  })()}
                </em>
              </span>
              <span className="ba-student-side">
                <Chip tone={row.draft.classTeacherRemark ? "green" : "orange"}>
                  {row.draft.classTeacherRemark ? "Ready" : "Missing"}
                </Chip>
                <i>›</i>
              </span>
            </button>
          ))}
        </section>
      )}

      {!studentRows.length && viewMode !== "analytics" && (
        <Empty text="Choose academic structure, academic period and class to load students for report remarks." />
      )}
      {studentRows.length > 0 &&
        !visibleRows.length &&
        viewMode === "group" && (
          <Empty text="No students match the current filters." />
        )}

      {filterOpen && (
        <FilterSheet
          viewMode={viewMode}
          setViewMode={setViewMode}
          remarkFilter={remarkFilter}
          setRemarkFilter={setRemarkFilter}
          academicStructureId={academicStructureId}
          setAcademicStructureId={setAcademicStructureId}
          academicPeriodId={academicPeriodId}
          setAcademicPeriodId={setAcademicPeriodId}
          classId={classId}
          setClassId={setClassId}
          studentId={studentId}
          setStudentId={setStudentId}
          academicStructures={academicStructures}
          academicPeriods={filteredPeriods}
          classes={availableClasses}
          students={studentRows.map((row) => row.student)}
          search={search}
          setSearch={setSearch}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {basisOpen && (
        <RemarksBasisSheet
          metric={basisMetric}
          setMetric={changeBasisMetric}
          target={basisTarget}
          setTarget={setBasisTarget}
          overwrite={basisOverwrite}
          setOverwrite={setBasisOverwrite}
          rules={basisRules}
          source={basisSource}
          updateRule={updateBasisRule}
          addRule={addBasisRule}
          removeRule={removeBasisRule}
          selectedRow={selectedRow}
          shownCount={visibleRows.length}
          applySelected={() =>
            applyRemarksBasis(
              "selected",
            )
          }
          applyShown={() =>
            applyRemarksBasis("shown")
          }
          resetRules={() => {
            lastDerivedBasisSignatureRef.current =
              "";
            setBasisRules(
              intelligentBasis.rules,
            );
            setBasisSource(
              intelligentBasis.source,
            );
          }}
          onClose={() =>
            setBasisOpen(false)
          }
        />
      )}

      {moreOpen && (
        <MoreSheet
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onSingle={() => {
            setViewMode("single");
            setMoreOpen(false);
          }}
          onGroup={() => {
            setViewMode("group");
            setMoreOpen(false);
          }}
          onAnalytics={() => {
            setViewMode("analytics");
            setMoreOpen(false);
          }}
          onRemarksBasis={() => {
            setMoreOpen(false);
            window.requestAnimationFrame(() => {
              lastDerivedBasisSignatureRef.current = "";
              setBasisOpen(true);
            });
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}

function State({
  primary,
  title,
  text,
}: {
  primary: string;
  title: string;
  text: string;
}) {
  return (
    <main
      className="ba-page"
      style={
        {
          "--ba-primary": primary,
          "--primary-color": primary,
        } as React.CSSProperties
      }
    >
      <style>{css}</style>
      <section className="ba-state">
        <div className="ba-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function RemarkEditor({
  row,
  className,
  draft,
  updateDraft,
  canEditHeadRemark,
  canPublish,
  onSave,
  saving,
  basisMetric,
  basisValue,
  basisRule,
}: {
  row: StudentRemarkRow;
  className?: string;
  draft: RemarkDraft;
  updateDraft: (studentIdValue: string, patch: Partial<RemarkDraft>) => void;
  canEditHeadRemark: boolean;
  canPublish: boolean;
  onSave: () => void | Promise<void>;
  saving: boolean;
  basisMetric: RemarkBasisMetric;
  basisValue?: number;
  basisRule?: RemarkBasisRule;
}) {
  const sid = row.student.id || "";
  const complete =
    !!draft.classTeacherRemark.trim() &&
    (!canEditHeadRemark || !!draft.headTeacherRemark.trim());

  return (
    <section className="ba-remark-card">
      <div className="ba-remark-head">
        <div>
          <h3>{row.student.fullName}</h3>
          <p>
            {row.student.admissionNumber || "No admission no."}
            {className ? ` · ${className}` : ""}
          </p>
        </div>
        <div className="ba-v4-remark-actions">
          <Chip tone={complete ? "green" : "orange"}>
            {complete ? "Complete" : "Needs remarks"}
          </Chip>
          <button type="button" className="ba-v4-save-remark" onClick={onSave} disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      <section className="ba-basis-preview">
        <span>
          <b>Remarks basis</b>
          <small>
            {basisMetric === "average"
              ? "Average score"
              : basisMetric === "total"
                ? "Total score"
                : basisMetric === "position"
                  ? "Overall position"
                  : "Attendance percentage"}
          </small>
        </span>

        <strong>
          {basisValue === undefined
            ? "No score"
            : basisValue.toFixed(1)}
        </strong>

        <em>
          {basisRule?.label ||
            "No matching band"}
        </em>
      </section>

      <div
        className={canEditHeadRemark ? "ba-remark-grid two" : "ba-remark-grid"}
      >
        <label className="ba-remark-field">
          <span>
            <b>Class Teacher Remark</b>
            <em>{countWords(draft.classTeacherRemark)} words</em>
          </span>
          <textarea
            value={draft.classTeacherRemark || ""}
            onChange={(event) =>
              updateDraft(sid, { classTeacherRemark: event.target.value })
            }
            placeholder="Enter class teacher remark..."
          />
        </label>

        {canEditHeadRemark && (
          <label className="ba-remark-field">
            <span>
              <b>Head Teacher Remark</b>
              <em>{countWords(draft.headTeacherRemark)} words</em>
            </span>
            <textarea
              value={draft.headTeacherRemark || ""}
              onChange={(event) =>
                updateDraft(sid, { headTeacherRemark: event.target.value })
              }
              placeholder="Enter head teacher / principal remark..."
            />
          </label>
        )}
      </div>

      {canPublish && (
        <label className="ba-publish-line">
          <input
            type="checkbox"
            checked={!!draft.published}
            onChange={(event) =>
              updateDraft(sid, { published: event.target.checked })
            }
          />
          Publish this report card
        </label>
      )}
    </section>
  );
}

function FilterSheet(props: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  remarkFilter: RemarkFilter;
  setRemarkFilter: (filter: RemarkFilter) => void;
  academicStructureId?: string;
  setAcademicStructureId: (id?: string) => void;
  academicPeriodId?: string;
  setAcademicPeriodId: (id?: string) => void;
  classId?: string;
  setClassId: (id?: string) => void;
  studentId?: string;
  setStudentId: (id?: string) => void;
  academicStructures: AcademicStructure[];
  academicPeriods: AcademicPeriod[];
  classes: Class[];
  students: Student[];
  search: string;
  setSearch: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Choose the report remarks scope. School and branch stay locked.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close filters"
          >
            ✕
          </button>
        </div>

        <div className="ba-form">
          <label className="ba-v4-find"><span>Search students</span>
            <input type="search" value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Name or admission number" />
          </label>
          <label>
            <span>View Mode</span>
            <select
              value={props.viewMode}
              onChange={(event) =>
                props.setViewMode(event.target.value as ViewMode)
              }
            >
              <option value="single">Single student</option>
              <option value="group">Group remarks</option>
              <option value="analytics">Analytics</option>
            </select>
          </label>

          <label>
            <span>Academic Structure</span>
            <select
              value={props.academicStructureId || ""}
              onChange={(event) => {
                props.setAcademicStructureId(
                  idOf(event.target.value) || undefined,
                );
                props.setAcademicPeriodId(undefined);
                props.setClassId(undefined);
                props.setStudentId(undefined);
              }}
            >
              <option value="">Select structure</option>
              {props.academicStructures.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Academic Period</span>
            <select
              value={props.academicPeriodId || ""}
              onChange={(event) => {
                props.setAcademicPeriodId(
                  idOf(event.target.value) || undefined,
                );
                props.setClassId(undefined);
                props.setStudentId(undefined);
              }}
            >
              <option value="">Select period</option>
              {props.academicPeriods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Class</span>
            <select
              value={props.classId || ""}
              onChange={(event) => {
                props.setClassId(idOf(event.target.value) || undefined);
                props.setStudentId(undefined);
              }}
            >
              <option value="">Select class</option>
              {props.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {props.viewMode === "single" && (
            <label>
              <span>Student</span>
              <select
                value={props.studentId || ""}
                onChange={(event) =>
                  props.setStudentId(idOf(event.target.value) || undefined)
                }
              >
                <option value="">Auto select</option>
                {props.students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>Remark Filter</span>
            <select
              value={props.remarkFilter}
              onChange={(event) =>
                props.setRemarkFilter(event.target.value as RemarkFilter)
              }
            >
              <option value="all">All remarks</option>
              <option value="missing">Missing remarks</option>
              <option value="complete">Complete remarks</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
          </label>
        </div>

        <div className="ba-sheet-actions">
          <button
            type="button"
            onClick={() => {
              props.setAcademicStructureId(undefined);
              props.setAcademicPeriodId(undefined);
              props.setClassId(undefined);
              props.setStudentId(undefined);
              props.setRemarkFilter("all");
            }}
          >
            Clear
          </button>
          <button type="button" className="primary" onClick={props.onClose}>
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}


function RemarksBasisSheet({
  metric,
  setMetric,
  target,
  setTarget,
  overwrite,
  setOverwrite,
  rules,
  source,
  updateRule,
  addRule,
  removeRule,
  selectedRow,
  shownCount,
  applySelected,
  applyShown,
  resetRules,
  onClose,
}: {
  metric: RemarkBasisMetric;
  setMetric: (
    metric: RemarkBasisMetric,
  ) => void;
  target: RemarkBasisTarget;
  setTarget: (
    target: RemarkBasisTarget,
  ) => void;
  overwrite: boolean;
  setOverwrite: (
    overwrite: boolean,
  ) => void;
  rules: RemarkBasisRule[];
  source: RemarkBasisSource;
  updateRule: (
    id: string,
    patch: Partial<RemarkBasisRule>,
  ) => void;
  addRule: () => void;
  removeRule: (
    id: string,
  ) => void;
  selectedRow?: StudentRemarkRow;
  shownCount: number;
  applySelected: () => void;
  applyShown: () => void;
  resetRules: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="ba-sheet-backdrop ba-basis-backdrop portal-contained-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Remarks basis"
    >
      <section className="ba-sheet ba-basis-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Remarks basis</h2>
            <p>
              Generate consistent remarks from report-card scores. Review the generated text before saving.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close remarks basis"
          >
            ✕
          </button>
        </div>

        <section className="ba-basis-source">
          <span aria-hidden="true">
            ∑
          </span>

          <div>
            <strong>
              {source.title}
            </strong>
            <small>
              {source.detail}
            </small>
          </div>
        </section>

        <div className="ba-basis-controls">
          <label>
            <span>Base remarks on</span>
            <select
              value={metric}
              onChange={(event) =>
                setMetric(
                  event.target
                    .value as RemarkBasisMetric,
                )
              }
            >
              <option value="average">
                Average score
              </option>
              <option value="total">
                Total score
              </option>
              <option value="position">
                Overall class position
              </option>
              <option value="attendance">
                Attendance percentage
              </option>
            </select>
            <small className="ba-basis-field-note">
              Bands update automatically from the selected class, grading structure and report calculations.
            </small>
          </label>

          <label>
            <span>Write generated text to</span>
            <select
              value={target}
              onChange={(event) =>
                setTarget(
                  event.target
                    .value as RemarkBasisTarget,
                )
              }
            >
              <option value="headTeacherRemark">
                Head teacher remark
              </option>
              <option value="classTeacherRemark">
                Class teacher remark
              </option>
            </select>
          </label>

          <label className="ba-basis-overwrite">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) =>
                setOverwrite(
                  event.target.checked,
                )
              }
            />
            <span>
              <b>Overwrite existing remarks</b>
              <small>
                Leave off to preserve remarks already entered manually.
              </small>
            </span>
          </label>
        </div>

        <div className="ba-basis-rule-list">
          {rules.map(
            (rule, index) => (
              <article
                key={rule.id}
                className="ba-basis-rule"
              >
                <div className="ba-basis-rule-head">
                  <strong>
                    Band {index + 1}
                  </strong>

                  <button
                    type="button"
                    onClick={() =>
                      removeRule(rule.id)
                    }
                    disabled={
                      rules.length <= 1
                    }
                    aria-label={`Remove ${rule.label}`}
                  >
                    ✕
                  </button>
                </div>

                <div className="ba-basis-rule-grid">
                  <label>
                    <span>Label</span>
                    <input
                      value={rule.label}
                      onChange={(event) =>
                        updateRule(
                          rule.id,
                          {
                            label:
                              event.target
                                .value,
                          },
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Minimum</span>
                    <input
                      type="number"
                      value={rule.minimum}
                      onChange={(event) =>
                        updateRule(
                          rule.id,
                          {
                            minimum:
                              normalizeBasisNumber(
                                event.target
                                  .value,
                              ),
                          },
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Maximum</span>
                    <input
                      type="number"
                      value={rule.maximum}
                      onChange={(event) =>
                        updateRule(
                          rule.id,
                          {
                            maximum:
                              normalizeBasisNumber(
                                event.target
                                  .value,
                                100,
                              ),
                          },
                        )
                      }
                    />
                  </label>
                </div>

                <label className="ba-basis-remark">
                  <span>Remark</span>
                  <textarea
                    value={rule.remark}
                    onChange={(event) =>
                      updateRule(
                        rule.id,
                        {
                          remark:
                            event.target
                              .value,
                        },
                      )
                    }
                    placeholder="Remark generated for students in this score band..."
                  />
                </label>
              </article>
            ),
          )}
        </div>

        <div className="ba-basis-secondary-actions">
          <button
            type="button"
            onClick={addRule}
          >
            + Add band
          </button>

          <button
            type="button"
            onClick={resetRules}
          >
            Recalculate system bands
          </button>
        </div>

        <div className="ba-basis-apply">
          <button
            type="button"
            onClick={applySelected}
            disabled={!selectedRow}
          >
            Apply to selected
            <small>
              {selectedRow?.student
                .fullName ||
                "No student selected"}
            </small>
          </button>

          <button
            type="button"
            className="primary"
            onClick={applyShown}
            disabled={!shownCount}
          >
            Apply to shown
            <small>
              {shownCount} student
              {shownCount === 1
                ? ""
                : "s"}
            </small>
          </button>
        </div>
      </section>
    </div>
  );
}

function MoreSheet({
  onRefresh,
  onSingle,
  onGroup,
  onAnalytics,
  onRemarksBasis,
  onClose,
}: {
  onRefresh: () => void | Promise<void>;
  onSingle: () => void;
  onGroup: () => void;
  onAnalytics: () => void;
  onRemarksBasis: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Quick report remarks actions.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="ba-menu-list">
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local report remark records</small>
          </button>
          <button type="button" onClick={onSingle}>
            <span>👤</span>
            <b>Single student</b>
            <small>Edit one selected student</small>
          </button>
          <button type="button" onClick={onGroup}>
            <span>👥</span>
            <b>Group remarks</b>
            <small>Apply or save remarks in batches</small>
          </button>
          <button type="button" onClick={onAnalytics}>
            <span>📊</span>
            <b>Analytics</b>
            <small>View completion and publishing status</small>
          </button>
          <button type="button" onClick={onRemarksBasis}>
            <span>⚖</span>
            <b>Remarks basis</b>
            <small>Generate individual or group remarks from score bands</small>
          </button>
        </div>
      </section>
    </div>
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

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
}

function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <button type="button">
      {label}: {value}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <section className="ba-empty">
      <div className="ba-empty-icon">💬</div>
      <h3>No remarks loaded</h3>
      <p>{text}</p>
    </section>
  );
}

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

.ba-page *, .ba-page *::before, .ba-page *::after { box-sizing: border-box; min-width: 0; }
.ba-page button, .ba-page input, .ba-page select, .ba-page textarea { font: inherit; max-width: 100%; }
.ba-page button { -webkit-tap-highlight-color: transparent; }

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

.ba-page textarea {
  min-height: 96px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
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
.ba-empty,
.ba-sheet,
.ba-remark-card,
.ba-student-row {
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

.ba-state h2 { margin: 0; font-size: 22px; font-weight: 1000; letter-spacing: -.04em; }
.ba-state p { max-width: 34rem; margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }

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

.ba-search span { color: var(--muted,#64748b); font-size: 17px; font-weight: 1000; }
.ba-search input { min-height: 42px; border: 0; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 14px; }

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
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  font-size: 20px;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ba-primary) 22%, transparent);
}

.ba-add-inline:disabled { opacity: .65; cursor: not-allowed; }

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

.ba-filter-button.active { background: var(--ba-primary); color: #fff; border-color: var(--ba-primary); }

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

.ba-filter-chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 8px 1px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.ba-filter-chips::-webkit-scrollbar { display: none; }
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

.ba-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 20px;
}
.ba-summary-line div { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.ba-summary-line strong { font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-summary-line span, .ba-summary-line p { color: var(--muted,#64748b); font-size: 12px; font-weight: 850; }
.ba-summary-line p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ba-list { display: grid; gap: 7px; margin-top: 10px; }

.ba-student-row {
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
.ba-student-row:hover, .ba-student-row.active {
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
  background: var(--ba-primary);
  font-size: 17px;
  font-weight: 1000;
  box-shadow: 0 12px 24px rgba(15,23,42,.12);
}
.ba-student-main, .ba-student-main strong, .ba-student-main small, .ba-student-main em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ba-student-main strong { color: var(--text,#111827); font-size: 14px; font-weight: 1000; letter-spacing: -.02em; }
.ba-student-main small { margin-top: 3px; color: var(--muted,#64748b); font-size: 12px; font-weight: 850; font-style: normal; }
.ba-student-main em { margin-top: 3px; color: color-mix(in srgb, var(--muted,#64748b) 86%, var(--text,#111827)); font-size: 11px; font-weight: 750; font-style: normal; }
.ba-student-side { display: grid; justify-items: end; gap: 6px; flex: 0 0 auto; }
.ba-student-side i { color: var(--muted,#64748b); font-style: normal; font-size: 18px; font-weight: 1000; line-height: 1; }

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

.ba-remark-card {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 24px;
}
.ba-remark-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ba-remark-head h3 { margin: 0; color: var(--text,#111827); font-size: 16px; font-weight: 1000; letter-spacing: -.04em; }
.ba-remark-head p { margin: 3px 0 0; color: var(--muted,#64748b); font-size: 12px; font-weight: 800; }
.ba-remark-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 9px; }
.ba-remark-field { display: grid; gap: 6px; }
.ba-remark-field span { display: flex; justify-content: space-between; gap: 8px; color: var(--muted,#64748b); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .06em; }
.ba-publish-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 11px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted,#64748b) 8%, transparent);
  border: 1px solid var(--border,rgba(0,0,0,.08));
  color: var(--text,#111827);
  font-size: 12px;
  font-weight: 900;
}
.ba-publish-line input { width: 16px; min-height: 16px; }

.ba-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  margin-top: 10px;
  padding: 22px;
  border-radius: 24px;
  border-style: dashed;
  text-align: center;
}
.ba-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--ba-primary) 12%, var(--surface,#fff));
  font-size: 28px;
}
.ba-empty h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.ba-empty p { margin: 0; color: var(--muted,#64748b); font-size: 13px; line-height: 1.6; }

.ba-sheet-backdrop {
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
.ba-sheet.small { width: min(520px, 100%); }
@keyframes sheetIn { from { transform: translateY(16px); opacity: .7; } to { transform: translateY(0); opacity: 1; } }
.ba-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.ba-sheet-head h2 { margin: 0; color: var(--text,#111827); font-size: 21px; font-weight: 1000; letter-spacing: -.05em; }
.ba-sheet-head p { margin: 5px 0 0; color: var(--muted,#64748b); font-size: 12px; line-height: 1.5; font-weight: 750; }
.ba-sheet-head button {
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
.ba-sheet-actions {
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
.ba-sheet-actions button {
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
.ba-sheet-actions button.primary {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
  box-shadow: 0 14px 32px color-mix(in srgb, var(--ba-primary) 25%, transparent);
}
.ba-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; }
.ba-form label { display: grid; gap: 6px; min-width: 0; }
.ba-form span { color: var(--muted,#64748b); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.ba-menu-list { display: grid; gap: 8px; }
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
.ba-menu-list button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-menu-list button b { font-size: 13px; font-weight: 1000; }
.ba-menu-list button small { margin-top: 2px; color: var(--muted,#64748b); font-size: 11px; font-weight: 750; }

@media (min-width: 720px) {
  .ba-page { padding: 10px; }
  .ba-remark-grid.two { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .ba-list { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (min-width: 1100px) {
  .ba-page { padding: 12px; }
  .ba-list { grid-template-columns: repeat(3, minmax(0,1fr)); }
}
@media (max-width: 520px) {
  .ba-search-card { grid-template-columns: minmax(0, 1fr) repeat(3, 40px); gap: 6px; padding: 6px; border-radius: 22px; }
  .ba-icon-button, .ba-filter-button, .ba-add-inline { width: 40px; height: 40px; }
  .ba-summary-line { display: grid; }
}


.ba-basis-preview {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    auto
    auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 9px 10px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(--ba-primary) 18%,
      var(--border, rgba(0,0,0,.10))
    );
  border-radius: 16px;
  background:
    color-mix(
      in srgb,
      var(--ba-primary) 6%,
      var(--card-bg, var(--surface,#fff))
    );
}

.ba-basis-preview span {
  min-width: 0;
}

.ba-basis-preview b,
.ba-basis-preview small {
  display: block;
}

.ba-basis-preview b {
  color: var(--text,#111827);
  font-size: 11px;
  font-weight: 950;
}

.ba-basis-preview small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 9px;
  font-weight: 750;
}

.ba-basis-preview strong {
  color: var(--ba-primary);
  font-size: 16px;
  font-weight: 1000;
}

.ba-basis-preview em {
  max-width: 150px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-radius: 999px;
  padding: 5px 8px;
  background:
    color-mix(
      in srgb,
      var(--ba-primary) 11%,
      transparent
    );
  color: var(--ba-primary);
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
}

.ba-basis-sheet {
  width: min(760px, 100%);
}

.ba-basis-controls {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ba-basis-controls > label:not(.ba-basis-overwrite),
.ba-basis-rule label {
  display: grid;
  gap: 5px;
}

.ba-basis-controls label > span,
.ba-basis-rule label > span {
  color: var(--muted,#64748b);
  font-size: 10px;
  font-weight: 900;
}

.ba-basis-overwrite {
  grid-column: 1 / -1;
  min-height: 48px;
  display: grid;
  grid-template-columns:
    20px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border:
    1px solid
    var(--border, rgba(0,0,0,.10));
  border-radius: 15px;
  background:
    var(--card-bg, var(--surface,#fff));
}

.ba-basis-overwrite input {
  width: 18px;
  height: 18px;
  min-height: 0;
}

.ba-basis-overwrite b,
.ba-basis-overwrite small {
  display: block;
}

.ba-basis-overwrite b {
  font-size: 10px;
  font-weight: 950;
}

.ba-basis-overwrite small {
  margin-top: 2px;
  color: var(--muted,#64748b);
  font-size: 8px;
  font-weight: 700;
}

.ba-basis-rule-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.ba-basis-rule {
  display: grid;
  gap: 8px;
  padding: 9px;
  border:
    1px solid
    var(--border, rgba(0,0,0,.10));
  border-radius: 18px;
  background:
    var(--card-bg, var(--surface,#fff));
}

.ba-basis-rule-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ba-basis-rule-head strong {
  font-size: 10px;
  font-weight: 950;
}

.ba-basis-rule-head button {
  width: 28px;
  height: 28px;
  border:
    1px solid
    var(--border, rgba(0,0,0,.10));
  border-radius: 9px;
  background:
    var(--surface, #fff);
  color: var(--muted,#64748b);
  cursor: pointer;
}

.ba-basis-rule-head button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.ba-basis-rule-grid {
  display: grid;
  grid-template-columns:
    minmax(0, 1.4fr)
    minmax(90px, .6fr)
    minmax(90px, .6fr);
  gap: 7px;
}

.ba-basis-rule-grid input {
  min-height: 38px;
  border-radius: 12px;
}

.ba-basis-remark textarea {
  min-height: 74px;
  border-radius: 13px;
}

.ba-basis-secondary-actions,
.ba-basis-apply {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.ba-basis-secondary-actions button,
.ba-basis-apply button {
  min-height: 40px;
  border:
    1px solid
    var(--border, rgba(0,0,0,.10));
  border-radius: 13px;
  padding: 7px 11px;
  background:
    var(--card-bg, var(--surface,#fff));
  color: var(--text,#111827);
  font-size: 10px;
  font-weight: 900;
  cursor: pointer;
}

.ba-basis-apply {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
}

.ba-basis-apply button {
  display: grid;
  gap: 2px;
  text-align: left;
}

.ba-basis-apply button.primary {
  border-color: var(--ba-primary);
  background: var(--ba-primary);
  color: #fff;
}

.ba-basis-apply button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.ba-basis-apply small {
  color: inherit;
  opacity: .78;
  font-size: 8px;
  font-weight: 700;
}

@media (max-width: 620px) {
  .ba-basis-controls,
  .ba-basis-rule-grid,
  .ba-basis-apply {
    grid-template-columns: 1fr;
  }

  .ba-basis-preview {
    grid-template-columns:
      minmax(0, 1fr)
      auto;
  }

  .ba-basis-preview em {
    grid-column: 1 / -1;
    max-width: 100%;
    justify-self: start;
  }
}



.ba-basis-source {
  display: grid;
  grid-template-columns:
    34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
  padding: 9px 10px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(--ba-primary) 22%,
      var(--border, rgba(0,0,0,.10))
    );
  border-radius: 16px;
  background:
    color-mix(
      in srgb,
      var(--ba-primary) 7%,
      var(--card-bg, var(--surface,#fff))
    );
}

.ba-basis-source > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background:
    color-mix(
      in srgb,
      var(--ba-primary) 15%,
      transparent
    );
  color: var(--ba-primary);
  font-size: 16px;
  font-weight: 1000;
}

.ba-basis-source div {
  min-width: 0;
}

.ba-basis-source strong,
.ba-basis-source small {
  display: block;
}

.ba-basis-source strong {
  color: var(--text,#111827);
  font-size: 10px;
  font-weight: 950;
}

.ba-basis-source small {
  margin-top: 3px;
  color: var(--muted,#64748b);
  font-size: 8.5px;
  font-weight: 700;
  line-height: 1.4;
}

.ba-basis-field-note {
  display: block;
  margin-top: 1px;
  color: var(--muted,#64748b);
  font-size: 8px;
  font-weight: 650;
  line-height: 1.35;
}



/* Bounded, centred Remarks Basis dialog ------------------------------- */
.ba-basis-backdrop {
  position: fixed;
  inset:
    max(8px, env(safe-area-inset-top))
    max(8px, env(safe-area-inset-right))
    max(8px, env(safe-area-inset-bottom))
    max(8px, env(safe-area-inset-left));
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: clamp(8px, 2vw, 18px);
  overflow: hidden;
  background: rgba(15, 23, 42, .54);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ba-basis-backdrop .ba-basis-sheet {
  position: relative;
  inset: auto;
  width: min(680px, 100%);
  max-width: 680px;
  min-width: 0;
  height: auto;
  max-height: min(760px, calc(100dvh - 32px));
  margin: 0;
  border-radius: clamp(18px, 2vw, 24px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  box-shadow: 0 28px 90px rgba(15, 23, 42, .30);
}

.ba-basis-backdrop .ba-sheet {
  bottom: auto;
  left: auto;
  right: auto;
  transform: none;
}

.ba-basis-backdrop .ba-sheet-head {
  position: sticky;
  top: 0;
  z-index: 4;
  margin: -1px -1px 8px;
  padding: 10px 10px 9px;
  border-bottom: 1px solid var(--border, rgba(0,0,0,.10));
  background: color-mix(in srgb, var(--card-bg, var(--surface,#fff)) 96%, transparent);
  backdrop-filter: blur(12px) saturate(1.05);
  -webkit-backdrop-filter: blur(12px) saturate(1.05);
}

@media (max-width: 720px) {
  .ba-basis-backdrop {
    inset:
      max(6px, env(safe-area-inset-top))
      max(6px, env(safe-area-inset-right))
      max(6px, env(safe-area-inset-bottom))
      max(6px, env(safe-area-inset-left));
    padding: 6px;
  }

  .ba-basis-backdrop .ba-basis-sheet {
    width: 100%;
    max-width: 100%;
    max-height: calc(100dvh - 20px);
    border-radius: 18px;
  }
}





/* Role-portal-contained sheets --------------------------------------- */
@media (min-width:980px){
  .ba-sheet-backdrop,
  .ba-basis-backdrop,
  .ba-basis-backdrop.portal-contained-modal{
    position:fixed;
    top:var(--eds-shell-top-offset,0px) !important;
    right:0 !important;
    bottom:0 !important;
    left:var(--portal-content-left,0px) !important;
    inset:auto 0 0 var(--portal-content-left,0px) !important;
    width:auto;
    height:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }

  .ba-sheet,
  .ba-basis-sheet,
  .ba-basis-backdrop .ba-basis-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }

  .ba-basis-backdrop,
  .ba-basis-backdrop.portal-contained-modal{
    display:grid;
    place-items:center;
    padding:18px;
  }

  .ba-basis-backdrop .ba-basis-sheet{
    width:min(680px,100%);
    max-height:calc(100dvh - var(--eds-shell-top-offset,0px) - 36px);
    overflow-y:auto;
    overflow-x:hidden;
  }
}

@media (max-width:979px){
  .ba-basis-backdrop,
  .ba-basis-backdrop.portal-contained-modal{
    position:fixed;
    inset:0 !important;
    display:grid;
    place-items:end center;
    padding:10px;
  }

  .ba-basis-backdrop .ba-basis-sheet{
    width:min(680px,100%);
    max-width:100%;
    max-height:min(88dvh,760px);
  }
}


/* V4 records workspace: neutral surface, efficient scroll, no duplicated toolbars. */
.ba-page.student-reports-page, .ba-page.report-remarks-page { min-height:0; padding:3px 4px 18px; background:transparent; overflow-x:clip; }
.ba-page.student-reports-page .ba-search-card, .ba-page.report-remarks-page .ba-search-card,
.ba-page.student-reports-page .ba-filter-chips:not(.ba-remark-analytics),
.ba-page.report-remarks-page .ba-summary-line { display:none; }
.ba-page.student-reports-page .ba-print-card,
.ba-page.report-remarks-page .ba-remark-card,
.ba-page.report-remarks-page .ba-student-row,
.ba-page.report-remarks-page .ba-list,
.ba-page.report-remarks-page .ba-sheet {
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 83%,var(--bg,#f3f5f8) 17%);
  border-color:var(--border,rgba(15,23,42,.13));
  box-shadow:none;
}
.ba-page.student-reports-page .ba-print-card { margin:0; padding:5px; border-radius:11px; box-shadow:none; }
.ba-page.student-reports-page .ba-print-zone { padding:3px; overflow-x:auto; overscroll-behavior-inline:contain; }
.ba-page.report-remarks-page .ba-remark-card { margin-top:0; box-shadow:none; border-radius:11px; }
.ba-page.report-remarks-page .ba-student-row { border-radius:9px; box-shadow:none; transform:none; }
.ba-page.report-remarks-page .ba-list { gap:6px; }
.ba-page.report-remarks-page .ba-student-row:hover { transform:none; }
.ba-page .ba-v4-find { display:grid; gap:5px; grid-column:1/-1; font-size:12px; font-weight:700; color:var(--muted,#64748b); }
.ba-page .ba-v4-find input { min-height:40px; padding:0 10px; border-radius:9px; background:var(--input-bg,var(--surface,#fff)); color:var(--text,#111827); }
@media(max-width:760px){
 .ba-page.student-reports-page,.ba-page.report-remarks-page{padding:0 1px 14px;}
 .ba-page.student-reports-page .ba-print-card{padding:3px;border-radius:9px;}
 .ba-page.report-remarks-page .ba-remark-card{padding:9px;}
}
@media print {
  .ba-page.student-reports-page,.ba-page.report-remarks-page,
  .ba-page.student-reports-page .ba-print-card,
  .ba-page.student-reports-page .ba-print-zone {
    background:#fff!important;box-shadow:none!important;border:0!important;
    margin:0!important;padding:0!important;overflow:visible!important;
  }
}
.ba-page.report-remarks-page .ba-v4-remark-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex:0 0 auto;}
.ba-page.report-remarks-page .ba-v4-save-remark{padding:7px 11px;min-height:30px;width:auto;border-radius:8px;border:0;background:var(--ba-primary);color:#fff;font-size:12px;font-weight:750;cursor:pointer;}
.ba-page.report-remarks-page .ba-v4-save-remark:disabled{opacity:.55;cursor:default;}

/* V6 — quiet neutral records presentation matching Students/Teachers/Classes V5 */

.report-remarks-page {background:var(--bg,var(--background,#f2f4f7));padding:5px;min-height:0;}
.report-remarks-page .ba-student-row,.report-remarks-page .ba-remark-card,
.report-remarks-page .ba-analysis,.report-remarks-page .ba-basis-preview,
.report-remarks-page .ba-sheet:not(.ba-basis-sheet) {
  background:color-mix(in srgb,var(--card-bg,var(--surface,#fff)) 93%,var(--text,#182235) 7%);
  border:1px solid color-mix(in srgb,var(--border,#d4dae3) 85%,var(--text,#182235) 15%);
  border-radius:13px;box-shadow:none;}
.report-remarks-page .ba-student-row:hover {transform:none;box-shadow:none;}
.report-remarks-page .ba-student-row {min-height:64px;transition:border-color .12s ease;}
.report-remarks-page .ba-list {margin-top:2px;gap:9px;}
.report-remarks-page .ba-remark-card {margin-top:2px;padding:10px;}
.report-remarks-page .ba-basis-preview {padding:7px;margin:6px 0;}
.report-remarks-page .ba-remark-field textarea {background:var(--input-bg,var(--surface,#fff));border-radius:10px;}
@media(min-width:1024px){.report-remarks-page .ba-list{grid-template-columns:repeat(4,minmax(0,1fr));}}
@media(max-width:639px){.report-remarks-page{padding:3px;}}
@media(prefers-reduced-motion:reduce){.report-remarks-page .ba-student-row{transition:none;}}

`;
