"use client";

/**
 * app/branch-admin/modules/AssessmentEntries.tsx
 * Eleeveon Schools — Branch Admin Assessment Entries V2.
 *
 * Built from the old AssessmentEntries logic and upgraded to the compact
 * Students.tsx branch-admin UI pattern:
 * - role-portal workspace scope resolved through useBranchWorkspaceScope()
 * - branch-wide access to every active ClassSubject in the selected branch
 * - mobile-first card score entry
 * - responsive score table entry for tablet/laptop/desktop
 * - More sheet for cards/table/summary modes
 * - filter sheet for class, subject, period, readiness, completion
 * - offline-first createLocal/updateLocal/softDeleteLocal saving
 * - hierarchy-aware leaf-entry projection hides calculated-only parents
 * - ClassSubject -> AssessmentApplicability -> AssessmentStructureItems -> AssessmentEntry
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";

import {
  db,
  type AcademicPeriod,
  type AcademicStructure,
  type AssessmentApplicability,
  type AssessmentEntry,
  type AssessmentStructure,
  type AssessmentStructureItem,
  type Class,
  type ClassSubject,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type GradeRule,
  type GradingStructure,
  type Organization,
  type Student,
  type StudentEnrollment,
  type Subject,
  type Teacher,
} from "../../lib/db/db";

import {
  createLocal,
  updateLocal,
  softDeleteLocal,
  listActiveLocal,
} from "../../lib/sync/syncUtils";

import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { useEntityMediaUrls } from "../../hooks/useEntityMediaUrls";
import { useRegisterBranchWorkspaceToolbar } from "../../components/role-portals/shell/BranchWorkspaceToolbar";
import { printBranchTable } from "../../components/role-portals/shell/BranchTablePrint";
import {
  projectAssessmentEntryColumns,
  type AssessmentEntryProjection,
} from "../../lib/assessments";

import ExcelFilePicker from "../../components/excel/ExcelFilePicker";
import ExcelColumnMappingEditor from "../../components/excel/ExcelColumnMapping";
import ExcelImportPreview from "../../components/excel/ExcelImportPreview";
import ExcelImportSheet, {
  type ExcelImportStep,
} from "../../components/excel/ExcelImportSheet";
import ExcelExportSheet from "../../components/excel/ExcelExportSheet";

import type {
  ExcelColumnMapping,
  ParsedExcelWorkbook,
} from "../../lib/excel/excelTypes";
import {
  detectLikelyHeaderRow,
  getParsedSheet,
  parseExcelFile,
  sheetToRecords,
} from "../../lib/excel/excelWorkbook";
import {
  ASSESSMENT_STUDENT_FIELDS,
  parseAssessmentWorkbookMetadata,
  parseControlledAssessmentWorkbook,
  parseExternalAssessmentSheet,
} from "../../lib/excel/assessments/assessmentExcelParser";
import {
  validateAssessmentExcelImport,
} from "../../lib/excel/assessments/assessmentExcelValidator";
import {
  importAssessmentExcel,
} from "../../lib/excel/assessments/assessmentExcelImporter";
import {
  downloadAssessmentExcelTemplate,
} from "../../lib/excel/assessments/assessmentExcelTemplate";
import type {
  AssessmentExcelContext,
  AssessmentExcelImportResult,
  AssessmentExcelParsedImport,
  AssessmentExcelProjectedColumn,
  AssessmentExcelValidationResult,
} from "../../lib/excel/assessments/assessmentExcelTypes";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type ReadinessFilter = "all" | "ready" | "missing";
type CompletionFilter = "all" | "complete" | "partial" | "empty";
type GenderFilter = "all" | "male" | "female";

/** One Apply action controls which exact class-subject record is rendered. */
type AssessmentFilterSelection = {
  classId: string;
  subjectId: string;
  periodId: string;
  readiness: ReadinessFilter;
  completion: CompletionFilter;
  gender: GenderFilter;
  classSubjectId: string; // "auto" or an actual ClassSubject.id
};

/** Use only explicit sex/gender data; never guess from a student's name. */
function studentGender(student: Student): GenderFilter | "unknown" {
  const value = String(
    (student as any).sex ?? (student as any).gender ?? "",
  ).trim().toLowerCase();
  if (["male", "m", "boy", "boys"].includes(value)) return "male";
  if (["female", "f", "girl", "girls"].includes(value)) return "female";
  return "unknown";
}
type ScoreValue = number | "";
type ScoreMap = Record<string, ScoreValue>;

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type ClassSubjectOption = {
  id: string;
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;
  organizationId?: string;
  ready: boolean;
  display: string;
};

/** Keep the registry independent of the currently applied filters. */
function matchesAssessmentOption(
  option: ClassSubjectOption,
  filters: Pick<AssessmentFilterSelection, "classId" | "subjectId" | "periodId" | "readiness">,
): boolean {
  return (
    (filters.classId === "all" || sameId(option.row.classId, filters.classId)) &&
    (filters.subjectId === "all" || sameId(option.row.subjectId, filters.subjectId)) &&
    (filters.periodId === "all" || sameId(option.row.academicPeriodId, filters.periodId)) &&
    (filters.readiness === "all" ||
      (filters.readiness === "ready" ? option.ready : !option.ready))
  );
}

type StudentScoreRow = {
  student: Student;
  enrollment: StudentEnrollment;
  rowEntered: number;
  rowExpected: number;
  rawTotal: number;
  weightedTotal: number;
  percentage: number;
  grade?: string;
  remark?: string;
  gpa?: number;
};

type ClassEntryView = {
  id: string;
  row: Class;
  name: string;
  code: string;
  subjectCount: number;
  readyCount: number;
  missingCount: number;
  studentCount: number;
};

type ClassSubjectEntryView = {
  id: string;
  option: ClassSubjectOption;
  studentCount: number;
  itemCount: number;
  entered: number;
  expected: number;
  completion: number;
};

const idOf = (v: any): string => {
  if (v === undefined || v === null) return "";
  return String(v).trim();
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) =>
  String(v || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];
const scoreKey = (studentId?: string, itemId?: string) =>
  `${studentId || ""}-${itemId || ""}`;

const isActiveRow = (row: any) => !row?.isDeleted && row?.active !== false;

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ae-chip ${tone}`}>{children}</span>;
}

function SliderIcon() {
  return (
    <svg className="ae-slider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export default function AssessmentEntries() {
  const dataRevision = useBranchTableRevision([
    "students",
    "classes",
    "subjects",
    "teachers",
    "academicStructures",
    "academicPeriods",
    "organizations",
    "curriculums",
    "curriculumPathways",
    "curriculumSubjects",
    "classSubjects",
    "assessmentApplicabilities",
    "assessmentStructures",
    "assessmentStructureItems",
    "assessmentEntries",
    "gradingStructures",
    "gradeRules",
    "studentEnrollments",
  ]);

  const router = useRouter();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeBranch } = useActiveBranch();
  const workspace = useBranchWorkspaceScope();
  const {
    accountId,
    schoolId,
    branchId,
    authenticated,
    restoring: accountLoading,
    branchLoading: contextLoading,
  } = workspace;

  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [toast, setToast] = useState<{
    tone: ToastTone;
    message: string;
  } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [applicabilities, setApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [gradings, setGradings] = useState<GradingStructure[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const mediaByStudent = useEntityMediaUrls({
    accountId,
    ownerTable: "students",
    rows: students,
    fields: [{ fieldKey: "photo", mediaIdKey: "photoMediaId" }],
  });
  const studentPhoto = (student: Student): string | undefined => {
    const row = student as any;
    const raw = mediaByStudent[idOf(row.id)]?.photo || row.photo;
    if (typeof raw !== "string" || !raw.trim() || raw.startsWith("blob:")) return undefined;
    return raw;
  };

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  // Desktop uses the compact table; touch-sized viewports start with cards.
  // MatchMedia is deferred until mount to avoid SSR/hydration differences.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const useDeviceDefault = () => setViewMode(mq.matches ? "table" : "cards");
    useDeviceDefault();
    // Intentionally only initialize once: preserve any explicit user selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState("");
  const [classSubjectId, setClassSubjectId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // V27: Class/subject navigation replaces the content inside the persistent
  // V19 workspace scroller. Without resetting that scroller, opening a subject
  // near the bottom of its card list can begin halfway down the student roster.
  // Reset after React commits the new screen, before it is painted; this also
  // handles returning to subjects/classes and changing subjects via Filters.
  const previousAssessmentScreen = React.useRef({ selectedClassId, classSubjectId });
  React.useLayoutEffect(() => {
    const previous = previousAssessmentScreen.current;
    if (
      previous.selectedClassId === selectedClassId &&
      previous.classSubjectId === classSubjectId
    ) return;

    previousAssessmentScreen.current = { selectedClassId, classSubjectId };
    const workspace = document.querySelector<HTMLElement>(
      ".role-shell.workspace-locked-scroll .app-content",
    ) || document.querySelector<HTMLElement>(
      ".role-shell.branch-workspace-layout .app-content",
    );

    if (workspace) {
      workspace.scrollTop = 0;
    } else {
      // Fallback for legacy/direct routes that still scroll the document.
      window.scrollTo(0, 0);
    }
  }, [selectedClassId, classSubjectId]);
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterSubjectId, setFilterSubjectId] = useState("all");
  const [filterPeriodId, setFilterPeriodId] = useState("all");
  const [filterReadiness, setFilterReadiness] =
    useState<ReadinessFilter>("all");
  const [filterCompletion, setFilterCompletion] =
    useState<CompletionFilter>("all");
  const [filterGender, setFilterGender] = useState<GenderFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scores, setScores] = useState<ScoreMap>({});
  // Excel interoperability: controlled Eleeveon assessment sheets and external school workbooks.
  const [excelExportOpen, setExcelExportOpen] = useState(false);
  const [excelExportBusyKey, setExcelExportBusyKey] = useState<string | null>(null);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [excelImportStep, setExcelImportStep] = useState<ExcelImportStep>("file");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelWorkbook, setExcelWorkbook] = useState<ParsedExcelWorkbook | null>(null);
  const [excelSheetName, setExcelSheetName] = useState("");
  const [excelHeaderRowIndex, setExcelHeaderRowIndex] = useState(0);
  const [excelIdentityMappings, setExcelIdentityMappings] = useState<ExcelColumnMapping[]>([]);
  const [excelParsedImport, setExcelParsedImport] = useState<AssessmentExcelParsedImport | null>(null);
  const [excelValidation, setExcelValidation] = useState<AssessmentExcelValidationResult | null>(null);
  const [excelImportResult, setExcelImportResult] = useState<AssessmentExcelImportResult | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    schoolId,
    branchId,
    router,
  ]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(
      () => setToast((c) => (c?.message === message ? null : c)),
      4200,
    );
  };

  const clearData = () => {
    setStudents([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAcademicStructures([]);
    setPeriods([]);
    setOrganizations([]);
    setCurriculums([]);
    setPathways([]);
    setCurriculumSubjects([]);
    setClassSubjects([]);
    setApplicabilities([]);
    setStructures([]);
    setItems([]);
    setEntries([]);
    setGradings([]);
    setRules([]);
    setEnrollments([]);
    setScores({});
    setSessionStarted(false);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const tenant = {
        accountId,
        schoolId: schoolId,
        branchId: branchId,
      } as any;
      const [
        studentRows,
        classRows,
        subjectRows,
        teacherRows,
        academicStructureRows,
        periodRows,
        organizationRows,
        curriculumRows,
        pathwayRows,
        curriculumSubjectRows,
        classSubjectRows,
        applicabilityRows,
        structureRows,
        itemRows,
        entryRows,
        gradingRows,
        ruleRows,
        enrollmentRows,
      ] = await Promise.all([
        tableSafe("students")?.toArray?.() || [],
        listActiveLocal("classes", tenant),
        listActiveLocal("subjects", tenant),
        listActiveLocal("teachers", tenant),
        listActiveLocal("academicStructures", tenant),
        listActiveLocal("academicPeriods", tenant),
        listActiveLocal("organizations", tenant),
        listActiveLocal("curriculums", tenant),
        listActiveLocal("curriculumPathways", tenant),
        listActiveLocal("curriculumSubjects", tenant),
        listActiveLocal("classSubjects", tenant),
        listActiveLocal("assessmentApplicabilities", tenant),
        listActiveLocal("assessmentStructures", tenant),
        listActiveLocal("assessmentStructureItems", tenant),
        tableSafe("assessmentEntries")?.toArray?.() || [],
        listActiveLocal("gradingStructures", tenant),
        listActiveLocal("gradeRules", tenant),
        tableSafe("studentEnrollments")?.toArray?.() || [],
      ]);

      setStudents(
        (studentRows as Student[])
          .filter((r) => sameTenant(r as TenantRow))
          .filter(
            (r: any) =>
              !["withdrawn", "deleted", "archived"].includes(
                safeLower(r.status),
              ),
          )
          .sort((a: any, b: any) =>
            String(a.fullName || "").localeCompare(String(b.fullName || "")),
          ),
      );
      setClasses(
        (classRows as Class[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setSubjects(
        (subjectRows as Subject[]).sort((a: any, b: any) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        ),
      );
      setTeachers(
        (teacherRows as Teacher[]).sort((a: any, b: any) =>
          String(a.fullName || "").localeCompare(String(b.fullName || "")),
        ),
      );
      setAcademicStructures(academicStructureRows as AcademicStructure[]);
      setPeriods(periodRows as AcademicPeriod[]);
      setOrganizations(organizationRows as Organization[]);
      setCurriculums(curriculumRows as Curriculum[]);
      setPathways(pathwayRows as CurriculumPathway[]);
      setCurriculumSubjects(curriculumSubjectRows as CurriculumSubject[]);
      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter(isActiveRow),
      );
      setApplicabilities(
        (applicabilityRows as AssessmentApplicability[]).filter(isActiveRow),
      );
      setStructures(
        (structureRows as AssessmentStructure[]).filter(isActiveRow),
      );
      setItems((itemRows as AssessmentStructureItem[]).filter(isActiveRow));
      setEntries(
        (entryRows as AssessmentEntry[]).filter(
          (r) => sameTenant(r as TenantRow) && !r.isDeleted,
        ),
      );
      setGradings((gradingRows as GradingStructure[]).filter(isActiveRow));
      setRules((ruleRows as GradeRule[]).filter(isActiveRow));
      setEnrollments(
        (enrollmentRows as StudentEnrollment[]).filter(
          (r) => sameTenant(r as TenantRow) && !r.isDeleted,
        ),
      );
    } catch (error) {
      console.error(error);
      clearData();
      showToast("error", "Failed to load assessment entries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountLoading || settingsLoading || contextLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    accountId,
    schoolId,
    branchId,
    accountLoading,
    settingsLoading,
    contextLoading,
    dataRevision,
  ]);

  const classMap = useMemo(
    () => new Map(classes.map((r: any) => [idOf(r.id), r])),
    [classes],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((r: any) => [idOf(r.id), r])),
    [subjects],
  );
  const teacherMap = useMemo(
    () => new Map(teachers.map((r: any) => [idOf(r.id), r])),
    [teachers],
  );
  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((r: any) => [idOf(r.id), r])),
    [academicStructures],
  );
  const periodMap = useMemo(
    () => new Map(periods.map((r: any) => [idOf(r.id), r])),
    [periods],
  );
  const organizationMap = useMemo(
    () => new Map(organizations.map((r: any) => [idOf(r.id), r])),
    [organizations],
  );
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((r: any) => [idOf(r.id), r])),
    [curriculumSubjects],
  );
  const curriculumMap = useMemo(
    () => new Map(curriculums.map((r: any) => [idOf(r.id), r])),
    [curriculums],
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map((r: any) => [idOf(r.id), r])),
    [pathways],
  );

  const applicabilityMap = useMemo(() => {
    const m = new Map<string, AssessmentApplicability>();
    applicabilities.forEach((row: any) => {
      if (idOf(row.classSubjectId) && row.active !== false && !row.isDeleted)
        m.set(idOf(row.classSubjectId), row);
    });
    return m;
  }, [applicabilities]);

  const allClassSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .map((row: any) => {
        const id = idOf(row.id);
        const cls: any = classMap.get(idOf(row.classId));
        const subj: any = subjectMap.get(idOf(row.subjectId));
        const teacher: any = row.teacherId
          ? teacherMap.get(idOf(row.teacherId))
          : undefined;
        const academicStructure: any = academicStructureMap.get(
          idOf(row.academicStructureId),
        );
        const period: any = row.academicPeriodId
          ? periodMap.get(idOf(row.academicPeriodId))
          : undefined;
        const curriculumSubject: any = curriculumSubjectMap.get(
          idOf(row.curriculumSubjectId),
        );
        const curriculum: any = curriculumSubject
          ? curriculumMap.get(idOf(curriculumSubject.curriculumId))
          : undefined;
        const pathway: any = curriculumSubject?.pathwayId
          ? pathwayMap.get(idOf(curriculumSubject.pathwayId))
          : undefined;
        const subjectName = row.name || subj?.name || "Unknown Subject";
        const subjectCode = row.code || subj?.code || "";
        const className = cls?.name || "Unknown Class";
        const academicPeriodName = period?.name || "All Periods";
        const ready = !!applicabilityMap.get(id);

        return {
          id,
          row,
          className,
          subjectName,
          subjectCode,
          teacherName: teacher?.fullName || "No teacher assigned",
          academicStructureName: academicStructure?.name || "Unknown structure",
          academicPeriodName,
          curriculumName: curriculum?.name || "No curriculum",
          pathwayName: pathway?.name || "No pathway",
          organizationId: curriculumSubject?.organizationId,
          ready,
          display: `${className} • ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} • ${academicPeriodName}`,
        };
      })
      .filter((option) => Boolean(option.id))
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [
    classSubjects,
    classMap,
    subjectMap,
    teacherMap,
    academicStructureMap,
    periodMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
    applicabilityMap,
  ]);

  // Used for class/subject navigation lists, never for resolving the open
  // editor. Filtering these options must not make an existing applicability
  // disappear from the selected editor.
  const classSubjectOptions = useMemo(
    () => allClassSubjectOptions.filter((option) =>
      matchesAssessmentOption(option, {
        classId: filterClassId,
        subjectId: filterSubjectId,
        periodId: filterPeriodId,
        readiness: filterReadiness,
      }),
    ),
    [allClassSubjectOptions, filterClassId, filterSubjectId, filterPeriodId, filterReadiness],
  );

  /**
   * V26 navigation: always enter at the root class cards on every screen size.
   * Users can browse Class -> Subject, or use the shared Filter button to
   * open a specific ClassSubject directly (V25 filter-owned rendering).
   * No asynchronous data load may automatically move them into score entry.
   */

  const selectedClass = useMemo(
    () =>
      selectedClassId ? (classMap.get(idOf(selectedClassId)) as any) : null,
    [classMap, selectedClassId],
  );

  const selectedClassSubjectOptions = useMemo(() => {
    if (!selectedClassId) return [];
    return classSubjectOptions.filter((option) =>
      sameId((option.row as any).classId, selectedClassId),
    );
  }, [classSubjectOptions, selectedClassId]);

  const classSubjectEntryViews = useMemo<ClassSubjectEntryView[]>(() => {
    return selectedClassSubjectOptions.map((option) => {
      const app = applicabilityMap.get(option.id) as any;
      const optionItems = app?.assessmentStructureId
        ? items.filter(
            (row: any) =>
              sameId(row.assessmentStructureId, app.assessmentStructureId) &&
              isActiveRow(row),
          )
        : [];
      const periodId = idOf((option.row as any).academicPeriodId);
      const studentCount = enrollments.filter((row: any) => {
        if (!sameId(row.classId, (option.row as any).classId)) return false;
        if (
          !sameId(
            row.academicStructureId,
            (option.row as any).academicStructureId,
          )
        )
          return false;
        if (periodId && !sameId(row.academicPeriodId, periodId)) return false;
        return row.status === "active" && !row.isDeleted;
      }).length;
      const expected = studentCount * optionItems.length;
      const entered = entries.filter((entry: any) => {
        if (!sameId(entry.classSubjectId, option.id)) return false;
        if (
          !app ||
          !sameId(entry.assessmentStructureId || "", app.assessmentStructureId)
        )
          return false;
        return (
          !entry.isDeleted &&
          entry.score !== undefined &&
          entry.score !== null &&
          entry.score !== ""
        );
      }).length;
      const completion = expected
        ? Math.round((Math.min(entered, expected) / expected) * 100)
        : 0;
      return {
        id: option.id,
        option,
        studentCount,
        itemCount: optionItems.length,
        entered,
        expected,
        completion,
      };
    });
  }, [
    selectedClassSubjectOptions,
    applicabilityMap,
    items,
    enrollments,
    entries,
  ]);

  const classCards = useMemo<ClassEntryView[]>(() => {
    const term = search.trim().toLowerCase();
    return classes
      .filter(isActiveRow)
      .map((classRow: any) => {
        const id = idOf(classRow.id);
        const options = classSubjectOptions.filter((option) =>
          sameId((option.row as any).classId, id),
        );
        const readyCount = options.filter((option) => option.ready).length;
        const studentIds = new Set(
          enrollments
            .filter(
              (row: any) =>
                sameId(row.classId, id) &&
                row.status === "active" &&
                !row.isDeleted,
            )
            .map((row: any) => idOf(row.studentId))
            .filter(Boolean),
        );
        return {
          id,
          row: classRow,
          name: classRow.name || `Class ${id}`,
          code: classRow.code || "",
          subjectCount: options.length,
          readyCount,
          missingCount: Math.max(0, options.length - readyCount),
          studentCount: studentIds.size,
        };
      })
      .filter(
        (item) =>
          !term ||
          `${item.name} ${item.code} ${item.subjectCount} subjects`
            .toLowerCase()
            .includes(term),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, classSubjectOptions, enrollments, search]);

  const selectedOption = useMemo(() => {
    const selectedId = idOf(classSubjectId);
    // Never search the filtered list: the filter sheet may change while an
    // editor is already open. Its real ClassSubject record still exists.
    return allClassSubjectOptions.find((option) => sameId(option.id, selectedId));
  }, [allClassSubjectOptions, classSubjectId]);

  const currentClassSubject = selectedOption?.row;
  const applicability = useMemo(
    () =>
      selectedOption ? applicabilityMap.get(selectedOption.id) : undefined,
    [applicabilityMap, selectedOption],
  );
  const assessmentStructure = useMemo(
    () =>
      structures.find((row: any) =>
        sameId(row.id, applicability?.assessmentStructureId),
      ),
    [structures, applicability],
  );
  const gradingSystem = useMemo(
    () =>
      gradings.find((row: any) =>
        sameId(row.id, applicability?.gradingStructureId),
      ),
    [gradings, applicability],
  );
  /**
   * Keep the complete hierarchy for validation and calculation, but expose
   * only direct-entry leaves/explicit direct parents to the score-entry UI.
   */
  const structureHierarchyItems = useMemo(() => {
    if (!applicability?.assessmentStructureId) return [];

    return items.filter(
      (row: any) =>
        sameId(
          row.assessmentStructureId,
          applicability.assessmentStructureId,
        ) && isActiveRow(row),
    );
  }, [items, applicability]);

  const entryProjection = useMemo<AssessmentEntryProjection>(() => {
    if (!applicability?.assessmentStructureId) {
      return {
        structureId: "",
        columns: [],
        groups: [],
        hiddenCalculatedNodes: [],
        warnings: [],
      };
    }

    return projectAssessmentEntryColumns({
      items: structureHierarchyItems,
      structureId: idOf(applicability.assessmentStructureId),
      existingEntries: entries,
    });
  }, [structureHierarchyItems, applicability, entries]);

  /**
   * Existing entry components expect AssessmentStructureItem rows. Decorate
   * the projected rows with display-only hierarchy metadata while preserving
   * the permanent item id used by assessmentEntries.
   */
  const structureItems = useMemo<AssessmentStructureItem[]>(() => {
    const itemById = new Map(
      structureHierarchyItems.map((item) => [idOf((item as any).id), item]),
    );

    return entryProjection.columns
      .map((column) => {
        const item = itemById.get(column.itemId);
        if (!item) return null;

        return {
          ...item,
          __entryPathLabels: column.pathLabels,
          __entryDepth: column.depth,
          __entryGroupLabel:
            column.pathLabels.length > 1
              ? column.pathLabels.slice(0, -1).join(" · ")
              : "",
          __entryCompactLabel: column.pathLabels.join(" · "),
        } as AssessmentStructureItem;
      })
      .filter((item): item is AssessmentStructureItem => Boolean(item));
  }, [structureHierarchyItems, entryProjection]);
  const gradeRules = useMemo(() => {
    if (!gradingSystem?.id) return [];
    return rules
      .filter(
        (row: any) =>
          sameId(row.gradingStructureId, gradingSystem.id) && isActiveRow(row),
      )
      .sort(
        (a: any, b: any) => Number(b.minScore || 0) - Number(a.minScore || 0),
      );
  }, [rules, gradingSystem]);


  const assessmentExcelProjectedColumns = useMemo<
    AssessmentExcelProjectedColumn[]
  >(() => {
    return (structureItems as any[]).map((item, index) => ({
      itemId: idOf(item.id),
      label: entryCompactLabel(item) || item.name || `Assessment ${index + 1}`,
      compactLabel: item.__entryCompactLabel || item.name || undefined,
      groupLabel: item.__entryGroupLabel || undefined,
      pathLabels: Array.isArray(item.__entryPathLabels)
        ? item.__entryPathLabels
        : [item.name || `Assessment ${index + 1}`],
      maxScore: Math.max(1, Number(item.maxScore || 100)),
      weight: Number(item.weight || 0),
      order: Number(item.order ?? index),
    }));
  }, [structureItems]);

  const assessmentExcelContext = useMemo<AssessmentExcelContext | null>(() => {
    if (!currentClassSubject || !selectedOption || !applicability) return null;

    return {
      accountId: idOf(accountId),
      schoolId: idOf(schoolId),
      branchId: idOf(branchId),
      classSubjectId: idOf((currentClassSubject as any).id),
      classId: idOf((currentClassSubject as any).classId),
      subjectId: idOf((currentClassSubject as any).subjectId),
      academicStructureId: idOf((currentClassSubject as any).academicStructureId),
      academicPeriodId: idOf((currentClassSubject as any).academicPeriodId),
      assessmentStructureId: idOf(applicability.assessmentStructureId),
      gradingStructureId: idOf(applicability.gradingStructureId) || undefined,
      organizationId:
        idOf(applicability.organizationId || selectedOption.organizationId) || undefined,
      branchName: (activeBranch as any)?.name || undefined,
      className: selectedOption.className,
      subjectName: selectedOption.subjectName,
      subjectCode: selectedOption.subjectCode,
      academicStructureName: selectedOption.academicStructureName,
      academicPeriodName: selectedOption.academicPeriodName,
      assessmentStructureName: (assessmentStructure as any)?.name || undefined,
    };
  }, [
    currentClassSubject,
    selectedOption,
    applicability,
    accountId,
    schoolId,
    branchId,
    activeBranch,
    assessmentStructure,
  ]);

  const relevantEntries = useMemo(() => {
    if (!currentClassSubject || !applicability) return [];
    const academicPeriodId = idOf(
      (currentClassSubject as any).academicPeriodId,
    );
    return entries.filter((entry: any) => {
      if (!sameId(entry.classSubjectId, (currentClassSubject as any).id))
        return false;
      if (!sameId(entry.classId, (currentClassSubject as any).classId))
        return false;
      if (!sameId(entry.subjectId, (currentClassSubject as any).subjectId))
        return false;
      if (
        !sameId(
          entry.academicStructureId || "",
          (currentClassSubject as any).academicStructureId,
        )
      )
        return false;
      if (!sameId(entry.academicPeriodId || "", academicPeriodId)) return false;
      if (
        !sameId(
          entry.assessmentStructureId || "",
          applicability.assessmentStructureId,
        )
      )
        return false;
      if (
        applicability.gradingStructureId &&
        !sameId(entry.gradingStructureId || "", applicability.gradingStructureId)
      )
        return false;
      return !entry.isDeleted;
    });
  }, [entries, currentClassSubject, applicability]);

  useEffect(() => {
    if (!currentClassSubject || !applicability) {
      setScores({});
      setSessionStarted(false);
      return;
    }

    const nextScores: ScoreMap = {};
    relevantEntries.forEach((entry: any) => {
      nextScores[
        scoreKey(idOf(entry.studentId), idOf(entry.assessmentStructureItemId))
      ] = Number(entry.score || 0);
    });
    setScores(nextScores);
    setSessionStarted(false);
  }, [currentClassSubject, applicability, relevantEntries]);

  const enrolledStudents = useMemo(() => {
    if (!currentClassSubject) return [];
    const periodId = idOf((currentClassSubject as any).academicPeriodId);
    return students
      .map((student: any) => {
        const enrollment = enrollments.find((row: any) => {
          if (!sameId(row.studentId, student.id)) return false;
          if (!sameId(row.classId, (currentClassSubject as any).classId))
            return false;
          if (
            !sameId(
              row.academicStructureId,
              (currentClassSubject as any).academicStructureId,
            )
          )
            return false;
          if (periodId && !sameId(row.academicPeriodId, periodId)) return false;
          return row.status === "active";
        });
        return enrollment ? { student, enrollment } : undefined;
      })
      .filter(Boolean) as { student: Student; enrollment: StudentEnrollment }[];
  }, [students, enrollments, currentClassSubject]);

  const existingEntryMap = useMemo(() => {
    const m = new Map<string, AssessmentEntry>();
    relevantEntries.forEach((entry: any) =>
      m.set(
        scoreKey(idOf(entry.studentId), idOf(entry.assessmentStructureItemId)),
        entry,
      ),
    );
    return m;
  }, [relevantEntries]);

  const studentScoreRows = useMemo<StudentScoreRow[]>(() => {
    return enrolledStudents.map(({ student, enrollment }) => {
      let rawTotal = 0;
      let weightedTotal = 0;
      let maxTotal = 0;
      let rowEntered = 0;

      for (const item of structureItems as any[]) {
        const value =
          scores[scoreKey(idOf((student as any).id), idOf(item.id))];
        const hasScore = value !== "" && value !== undefined && value !== null;
        const score = hasScore ? Number(value) : 0;
        const maxScore = Math.max(1, Number(item.maxScore || 100));
        const weight = Number(item.weight || 0);

        if (hasScore) rowEntered += 1;
        rawTotal += score;
        maxTotal += maxScore;
        weightedTotal += (score / maxScore) * weight;
      }

      const percentage = structureItems.length
        ? Number(weightedTotal.toFixed(2))
        : maxTotal
          ? Number(((rawTotal / maxTotal) * 100).toFixed(2))
          : 0;
      const matchedRule = gradeRules.find(
        (rule: any) =>
          percentage >= Number(rule.minScore || 0) &&
          percentage <= Number(rule.maxScore || 100),
      );

      return {
        student,
        enrollment,
        rowEntered,
        rowExpected: structureItems.length,
        rawTotal: Number(rawTotal.toFixed(2)),
        weightedTotal: Number(weightedTotal.toFixed(2)),
        percentage,
        grade: matchedRule?.grade,
        remark: matchedRule?.remark,
        gpa: matchedRule?.gpa,
      };
    });
  }, [enrolledStudents, structureItems, scores, gradeRules]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studentScoreRows.filter((item) => {
      // Gender filtering applies to the actual students being displayed in
      // card/table view. Unspecified gender remains visible under "All".
      if (
        filterGender !== "all" &&
        studentGender(item.student) !== filterGender
      ) return false;
      if (filterCompletion !== "all") {
        const entered = item.rowEntered;
        const expected = item.rowExpected;
        if (filterCompletion === "empty" && entered !== 0) return false;
        if (
          filterCompletion === "partial" &&
          !(entered > 0 && entered < expected)
        )
          return false;
        if (
          filterCompletion === "complete" &&
          !(expected > 0 && entered >= expected)
        )
          return false;
      }
      if (!q) return true;
      const s: any = item.student;
      return `${s.fullName || ""} ${s.admissionNumber || ""} ${item.grade || ""} ${item.remark || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [studentScoreRows, search, filterCompletion, filterGender]);

  const completionStats = useMemo(() => {
    const expected = studentScoreRows.length * structureItems.length;
    let entered = 0;
    studentScoreRows.forEach((row) => (entered += row.rowEntered));
    const completion = expected ? Math.round((entered / expected) * 100) : 0;
    const completeStudents = studentScoreRows.filter(
      (row) => row.rowExpected > 0 && row.rowEntered >= row.rowExpected,
    ).length;
    return { expected, entered, completion, completeStudents };
  }, [studentScoreRows, structureItems]);

  const activeFilterCount = useMemo(() => {
    return [
      filterClassId,
      filterSubjectId,
      filterPeriodId,
      filterReadiness,
      filterCompletion,
      filterGender,
    ].filter((v) => v !== "all").length;
  }, [
    filterClassId,
    filterSubjectId,
    filterPeriodId,
    filterReadiness,
    filterCompletion,
    filterGender,
  ]);

  const contextSubtitle = selectedOption
    ? `${selectedOption.className} · ${selectedOption.academicStructureName} · ${selectedOption.academicPeriodName}`
    : activeBranch?.name || "Selected branch";

  const updateScore = (
    studentId: string,
    item: AssessmentStructureItem,
    value: string,
  ) => {
    const key = scoreKey(studentId, idOf((item as any).id));
    if (value === "") {
      setScores((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    const num = Number(value);
    if (Number.isNaN(num)) return;
    const sanitized = Math.max(
      0,
      Math.min(num, Number((item as any).maxScore || 100)),
    );
    setScores((prev) => ({ ...prev, [key]: sanitized }));
  };

  const startSession = () => {
    if (!authenticated || !accountId || !schoolId || !branchId)
      return showToast("error", "Sign in and select a school branch first.");
    if (!currentClassSubject)
      return showToast("error", "Select a class subject first.");
    if (!applicability)
      return showToast(
        "error",
        "No assessment applicability is configured for this class subject.",
      );
    if (!structureItems.length)
      return showToast(
        "error",
        "The selected assessment structure has no active items.",
      );
    if (!studentScoreRows.length)
      return showToast(
        "error",
        "No active student enrollment was found for this class subject.",
      );
    setSessionStarted(true);
    showToast("success", "Score entry session started.");
  };

  const saveEntries = async () => {
    if (!sessionStarted)
      return showToast("error", "Start the score entry session first.");
    if (!authenticated || !accountId || !schoolId || !branchId)
      return showToast("error", "Sign in and select a school branch first.");
    if (!currentClassSubject || !applicability)
      return showToast(
        "error",
        "Select a valid class subject with assessment applicability.",
      );

    try {
      setSaving(true);
      const academicPeriodId = idOf(
        (currentClassSubject as any).academicPeriodId,
      );
      let savedCount = 0;
      let clearedCount = 0;
      let lockedCount = 0;

      for (const row of studentScoreRows) {
        const studentId = idOf((row.student as any).id);
        if (!studentId) continue;

        for (const item of structureItems as any[]) {
          const itemId = idOf(item.id);
          const key = scoreKey(studentId, itemId);
          const value = scores[key];
          const existing: any = existingEntryMap.get(key);

          if (existing?.locked) {
            lockedCount += 1;
            continue;
          }

          if (value === "" || value === undefined || value === null) {
            if (existing?.id) {
              await softDeleteLocal("assessmentEntries", idOf(existing.id));
              clearedCount += 1;
            }
            continue;
          }

          const payload: Partial<AssessmentEntry> = {
            accountId,
            schoolId: schoolId,
            branchId: branchId,
            classSubjectId: idOf((currentClassSubject as any).id),
            organizationId:
              applicability.organizationId || selectedOption?.organizationId,
            academicStructureId: idOf(
              (currentClassSubject as any).academicStructureId,
            ),
            academicPeriodId,
            gradingStructureId: applicability.gradingStructureId,
            assessmentStructureId: applicability.assessmentStructureId,
            assessmentStructureItemId: itemId,
            studentId,
            classId: idOf((currentClassSubject as any).classId),
            subjectId: idOf((currentClassSubject as any).subjectId),
            score: Number(value),
            grade: row.grade,
            remark: row.remark,
            published: false,
            locked: false,
            active: true,
            isDeleted: false,
          } as Partial<AssessmentEntry>;

          if (existing?.id)
            await updateLocal(
              "assessmentEntries",
              idOf(existing.id),
              payload as AssessmentEntry,
            );
          else
            await createLocal("assessmentEntries", payload as AssessmentEntry);
          savedCount += 1;
        }
      }

      await load();
      setSessionStarted(false);
      showToast(
        "success",
        `Saved ${savedCount} score${savedCount === 1 ? "" : "s"}${clearedCount ? ` · cleared ${clearedCount}` : ""}${
          lockedCount ? ` · skipped ${lockedCount} locked` : ""
        }.`,
      );
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to save assessment scores.");
    } finally {
      setSaving(false);
    }
  };

  const assessmentExcelStudents = () =>
    enrolledStudents.map(({ student }: any) => ({
      id: idOf(student.id),
      fullName: student.fullName || "Unnamed student",
      admissionNumber: student.admissionNumber || undefined,
      active: student.active,
      isDeleted: student.isDeleted,
    }));

  const assessmentExcelEnrollments = () =>
    enrollments.map((row: any) => ({
      id: idOf(row.id),
      studentId: idOf(row.studentId),
      classId: idOf(row.classId),
      academicStructureId: idOf(row.academicStructureId),
      academicPeriodId: idOf(row.academicPeriodId) || undefined,
      status: row.status,
      isDeleted: row.isDeleted,
    }));

  const assessmentExcelExistingEntries = () =>
    relevantEntries.map((row: any) => ({
      id: idOf(row.id),
      accountId: idOf(row.accountId) || undefined,
      schoolId: idOf(row.schoolId) || undefined,
      branchId: idOf(row.branchId) || undefined,
      classSubjectId: idOf(row.classSubjectId) || undefined,
      organizationId: idOf(row.organizationId) || undefined,
      academicStructureId: idOf(row.academicStructureId) || undefined,
      academicPeriodId: idOf(row.academicPeriodId) || undefined,
      gradingStructureId: idOf(row.gradingStructureId) || undefined,
      assessmentStructureId: idOf(row.assessmentStructureId) || undefined,
      assessmentStructureItemId: idOf(row.assessmentStructureItemId) || undefined,
      studentId: idOf(row.studentId) || undefined,
      classId: idOf(row.classId) || undefined,
      subjectId: idOf(row.subjectId) || undefined,
      score: row.score === undefined || row.score === null ? undefined : Number(row.score),
      grade: row.grade,
      remark: row.remark,
      published: row.published,
      locked: row.locked,
      active: row.active,
      isDeleted: row.isDeleted,
    }));

  const assessmentExcelGradeRules = () =>
    gradeRules.map((row: any, index) => ({
      id: idOf(row.id) || undefined,
      minScore: Number(row.minScore || 0),
      maxScore: Number(row.maxScore || 100),
      grade: row.grade || "",
      remark: row.remark || undefined,
      gpa: row.gpa === undefined || row.gpa === null ? undefined : Number(row.gpa),
      order: Number(row.order ?? index),
    }));

  const ensureAssessmentExcelContext = () => {
    if (!assessmentExcelContext || !selectedOption || !applicability) {
      showToast("error", "Select a ready class subject before using Excel.");
      return null;
    }
    if (!assessmentExcelProjectedColumns.length) {
      showToast("error", "This assessment structure has no directly enterable score columns.");
      return null;
    }
    if (!enrolledStudents.length) {
      showToast("error", "No active students are enrolled in this assessment context.");
      return null;
    }
    return assessmentExcelContext;
  };

  const buildCurrentAssessmentScoreMatrix = () => {
    const matrix: Record<string, Record<string, number | undefined>> = {};

    enrolledStudents.forEach(({ student }: any) => {
      const studentId = idOf(student.id);
      if (!studentId) return;
      matrix[studentId] = {};

      assessmentExcelProjectedColumns.forEach((column) => {
        const value = scores[scoreKey(studentId, column.itemId)];
        matrix[studentId][column.itemId] =
          value === "" || value === undefined || value === null
            ? undefined
            : Number(value);
      });
    });

    return matrix;
  };

  const handleAssessmentTemplateDownload = async () => {
    const context = ensureAssessmentExcelContext();
    if (!context) return;

    try {
      setExcelExportBusyKey("template");
      await Promise.resolve(
        downloadAssessmentExcelTemplate({
          context,
          students: assessmentExcelStudents(),
          projectedColumns: assessmentExcelProjectedColumns,
        }),
      );
      showToast("success", "Assessment template downloaded.");
    } catch (error: any) {
      console.error("Failed to download assessment template:", error);
      showToast("error", error?.message || "Failed to download assessment template.");
    } finally {
      setExcelExportBusyKey(null);
    }
  };

  const handleAssessmentCurrentExport = async () => {
    const context = ensureAssessmentExcelContext();
    if (!context) return;

    try {
      setExcelExportBusyKey("export");
      await Promise.resolve(
        downloadAssessmentExcelTemplate({
          context,
          students: assessmentExcelStudents(),
          projectedColumns: assessmentExcelProjectedColumns,
          scores: buildCurrentAssessmentScoreMatrix(),
          fileName: `Eleeveon Assessment - ${selectedOption?.className || "Class"} - ${selectedOption?.subjectName || "Subject"}.xlsx`,
        }),
      );
      showToast("success", "Current assessment sheet exported.");
    } catch (error: any) {
      console.error("Failed to export assessment sheet:", error);
      showToast("error", error?.message || "Failed to export assessment sheet.");
    } finally {
      setExcelExportBusyKey(null);
    }
  };

  const resetAssessmentExcelImport = () => {
    setExcelFile(null);
    setExcelWorkbook(null);
    setExcelSheetName("");
    setExcelHeaderRowIndex(0);
    setExcelIdentityMappings([]);
    setExcelParsedImport(null);
    setExcelValidation(null);
    setExcelImportResult(null);
    setExcelImportStep("file");
  };

  const openAssessmentExcelImport = () => {
    if (!ensureAssessmentExcelContext()) return;
    setMoreOpen(false);
    setExcelExportOpen(false);
    resetAssessmentExcelImport();
    setExcelImportOpen(true);
  };

  const closeAssessmentExcelImport = () => {
    if (excelBusy) return;
    setExcelImportOpen(false);
    resetAssessmentExcelImport();
  };

  const setAssessmentExcelSheet = (
    workbook: ParsedExcelWorkbook,
    sheetName: string,
  ) => {
    setExcelSheetName(sheetName);
    const sheet = getParsedSheet(workbook, sheetName);
    setExcelHeaderRowIndex(sheet ? detectLikelyHeaderRow(sheet) : 0);
    setExcelIdentityMappings([]);
    setExcelParsedImport(null);
    setExcelValidation(null);
  };

  const handleAssessmentExcelFileChange = async (file: File | null) => {
    setExcelFile(file);
    setExcelWorkbook(null);
    setExcelSheetName("");
    setExcelIdentityMappings([]);
    setExcelParsedImport(null);
    setExcelValidation(null);
    setExcelImportResult(null);

    if (!file) {
      setExcelImportStep("file");
      return;
    }

    try {
      setExcelBusy(true);
      const workbook = await parseExcelFile(file);
      const metadata = parseAssessmentWorkbookMetadata(workbook).metadata;
      const preferredName = metadata?.sheetName;
      const firstSheet =
        (preferredName ? getParsedSheet(workbook, preferredName) : undefined) ||
        workbook.sheets.find((sheet) => sheet.name !== "_Eleeveon_Metadata");

      if (!firstSheet) {
        throw new Error("The workbook does not contain a usable assessment worksheet.");
      }

      setExcelWorkbook(workbook);
      setAssessmentExcelSheet(workbook, firstSheet.name);
      setExcelImportStep("sheet");
    } catch (error: any) {
      console.error("Failed to open assessment workbook:", error);
      showToast("error", error?.message || "Failed to open Excel workbook.");
      setExcelFile(null);
    } finally {
      setExcelBusy(false);
    }
  };

  const validateParsedAssessmentImport = (
    parsed: AssessmentExcelParsedImport,
  ) => {
    const context = assessmentExcelContext;
    if (!context) {
      throw new Error("The assessment context is no longer available.");
    }

    const validation = validateAssessmentExcelImport({
      parsed,
      context,
      projectedColumns: assessmentExcelProjectedColumns,
      students: assessmentExcelStudents(),
      enrollments: assessmentExcelEnrollments(),
      existingEntries: assessmentExcelExistingEntries(),
      options: {
        lockedEntrySeverity: "error",
        allowNameMatch: true,
      },
    });

    setExcelParsedImport(parsed);
    setExcelValidation(validation);
    setExcelImportStep("preview");
  };

  const prepareAssessmentExcelImport = () => {
    if (!excelWorkbook || !excelSheetName) {
      showToast("error", "Choose an assessment worksheet first.");
      return;
    }

    const context = ensureAssessmentExcelContext();
    if (!context) return;

    try {
      const metadata = parseAssessmentWorkbookMetadata(excelWorkbook).metadata;

      if (metadata) {
        const parsed = parseControlledAssessmentWorkbook({
          workbook: excelWorkbook,
          sheetName: excelSheetName,
          headerRowIndex: excelHeaderRowIndex,
        });
        validateParsedAssessmentImport(parsed);
        return;
      }

      const sheet = getParsedSheet(excelWorkbook, excelSheetName);
      if (!sheet) {
        throw new Error("The selected worksheet could not be found.");
      }

      const parsed = parseExternalAssessmentSheet({
        sheet,
        projectedColumns: assessmentExcelProjectedColumns,
        headerRowIndex: excelHeaderRowIndex,
      });

      if (!parsed.metadataColumns.length) {
        throw new Error(
          "No assessment score columns could be matched. Use an Eleeveon assessment template or keep assessment headings aligned with the current assessment structure.",
        );
      }

      setExcelParsedImport(parsed);
      setExcelIdentityMappings(parsed.mappings);
      setExcelValidation(null);
      setExcelImportStep("mapping");
    } catch (error: any) {
      console.error("Failed to prepare assessment workbook:", error);
      showToast("error", error?.message || "Failed to prepare assessment workbook.");
    }
  };

  const reviewExternalAssessmentImport = () => {
    if (!excelWorkbook || !excelSheetName) return;

    const sheet = getParsedSheet(excelWorkbook, excelSheetName);
    if (!sheet) {
      showToast("error", "The selected worksheet could not be found.");
      return;
    }

    try {
      const parsed = parseExternalAssessmentSheet({
        sheet,
        projectedColumns: assessmentExcelProjectedColumns,
        headerRowIndex: excelHeaderRowIndex,
        identityMappings: excelIdentityMappings,
      });

      if (!parsed.metadataColumns.length) {
        throw new Error("No assessment score columns are mapped to the current structure.");
      }

      validateParsedAssessmentImport(parsed);
    } catch (error: any) {
      console.error("Failed to review external assessment workbook:", error);
      showToast("error", error?.message || "Failed to review assessment workbook.");
    }
  };

  const commitAssessmentExcelImport = async () => {
    const context = ensureAssessmentExcelContext();
    if (!context || !excelValidation || !excelParsedImport) return;

    if (!excelValidation.validRows) {
      showToast("error", "There are no valid score cells ready to import.");
      return;
    }

    try {
      setExcelBusy(true);

      const result = await importAssessmentExcel(
        excelValidation,
        context,
        {
          updateExisting: true,
          clearExistingWhenBlank:
            excelParsedImport.kind === "eleeveon-assessment",
          lockedEntrySeverity: "error",
          allowNameMatch: true,
        },
        {
          projectedColumns: assessmentExcelProjectedColumns,
          gradeRules: assessmentExcelGradeRules(),
          existingEntries: assessmentExcelExistingEntries(),
        },
      );

      setExcelImportResult(result);
      setExcelImportStep("result");
      setSessionStarted(false);
      await load();

      showToast(
        result.failed ? "info" : "success",
        `Assessment import finished: ${result.created} created, ${result.updated} updated${result.deleted ? `, ${result.deleted} cleared` : ""}.`,
      );
    } catch (error: any) {
      console.error("Failed to import assessment workbook:", error);
      showToast("error", error?.message || "Failed to import assessment workbook.");
    } finally {
      setExcelBusy(false);
    }
  };

  /**
   * Filters are navigation, not just decorations on class-card lists.
   * Apply resolves a concrete ClassSubject from the complete branch registry,
   * preferring one with real assessment setup and active enrolled students.
   */
  const applyAssessmentFilters = (next: AssessmentFilterSelection) => {
    const candidates = allClassSubjectOptions.filter((option) =>
      matchesAssessmentOption(option, next),
    );

    const specific = next.classSubjectId !== "auto"
      ? candidates.find((option) => sameId(option.id, next.classSubjectId))
      : undefined;
    const current = candidates.find((option) => sameId(option.id, classSubjectId));
    const preferredPeriodId = idOf(settings?.currentAcademicPeriodId);
    const preferredStructureId = idOf(settings?.currentAcademicStructureId);

    // Exact choice wins. Otherwise retain the open subject if still matching;
    // for a new selection prefer a usable configuration, roster and term.
    const ranked = [...candidates].sort((left, right) => {
      const quality = (option: ClassSubjectOption) => {
        const row = option.row as any;
        const app = applicabilityMap.get(option.id) as any;
        const structureId = idOf(app?.assessmentStructureId);
        const hasItems = !!structureId && items.some((item: any) =>
          isActiveRow(item) && sameId(item.assessmentStructureId, structureId),
        );
        const hasStudents = enrollments.some((enrollment: any) =>
          enrollment.status === "active" && !enrollment.isDeleted &&
          sameId(enrollment.classId, row.classId) &&
          sameId(enrollment.academicStructureId, row.academicStructureId) &&
          (!row.academicPeriodId || sameId(enrollment.academicPeriodId, row.academicPeriodId)),
        );
        const hasScores = entries.some((entry: any) =>
          !entry.isDeleted && sameId(entry.classSubjectId, option.id) &&
          entry.score !== null && entry.score !== undefined && entry.score !== "",
        );
        return (option.ready ? 100000 : 0) + (hasItems ? 50000 : 0) +
          (hasStudents ? 20000 : 0) +
          (preferredPeriodId && sameId(row.academicPeriodId, preferredPeriodId) ? 2000 : 0) +
          (preferredStructureId && sameId(row.academicStructureId, preferredStructureId) ? 1000 : 0) +
          (hasScores ? 100 : 0);
      };
      return quality(right) - quality(left) || left.display.localeCompare(right.display);
    });
    const sameSubjectScope = next.classId === filterClassId &&
      next.subjectId === filterSubjectId &&
      next.periodId === filterPeriodId &&
      next.readiness === filterReadiness;
    // Gender/completion-only changes keep the open subject. A new class/term/
    // subject selection uses the best available match instead.
    const target = specific || (sameSubjectScope ? current : undefined) || ranked[0];
    const nextSubjectId = target?.id || "all";

    // Switching a subject resets its score drafts; do not discard changes
    // without an explicit decision from the user.
    if (nextSubjectId !== classSubjectId && sessionStarted) {
      const hasEdits = studentScoreRows.some((row) =>
        structureItems.some((item: any) => {
          const key = scoreKey(idOf((row.student as any).id), idOf(item.id));
          const before = existingEntryMap.get(key) as any;
          const after = scores[key];
          const oldScore = before?.score;
          return (after === "" || after === undefined)
            ? oldScore !== null && oldScore !== undefined && oldScore !== ""
            : Number(after) !== Number(oldScore);
        }),
      );
      if (hasEdits && !window.confirm(
        "You have unsaved assessment scores. Change class subject and discard those edits?",
      )) return;
    }

    // Filter Apply is an explicit navigation action, independent of class cards.
    setFilterClassId(next.classId);
    setFilterSubjectId(next.subjectId);
    setFilterPeriodId(next.periodId);
    setFilterReadiness(next.readiness);
    setFilterCompletion(next.completion);
    setFilterGender(next.gender);
    setSelectedClassId(target ? idOf((target.row as any).classId) : "");
    setClassSubjectId(nextSubjectId);
    if (nextSubjectId !== classSubjectId) {
      setSessionStarted(false);
      setSearch("");
    }
    setFilterOpen(false);
  };

  // The FilterSheet's Clear button resets its local draft. The new values
  // are committed only when Apply is pressed, preventing accidental navigation.

  const printAssessmentTable = () => {
    if (classSubjectId === "all" || !selectedOption || !applicability || !structureItems.length) {
      showToast("info", "Select a class subject with a scoring structure before printing.");
      return;
    }
    printBranchTable({
      title: "Assessment Scores",
      subtitle: `${selectedOption.className} · ${selectedOption.subjectName} · ${selectedOption.academicStructureName} · ${selectedOption.academicPeriodName}`,
      columns: [
        { key: "student", label: "Students" },
        ...structureItems.map((item: any) => ({
          key: `item_${idOf(item.id)}`,
          label: `${entryCompactLabel(item) || item.name} /${Number(item.maxScore || 100)}`,
        })),
        { key: "total", label: "Total" },
        { key: "grade", label: "Grade" },
        { key: "remark", label: "Remark" },
      ],
      rows: filteredRows.map((row) => {
        const student: any = row.student;
        const studentId = idOf(student.id);
        const record: Record<string, any> = {
          student: { text: student.fullName || "Unnamed student", detail: student.admissionNumber || undefined, image: studentPhoto(row.student) },
          total: row.weightedTotal,
          grade: row.grade || "—",
          remark: row.remark || "—",
        };
        structureItems.forEach((item: any) => {
          const score = scores[scoreKey(studentId, idOf(item.id))];
          record[`item_${idOf(item.id)}`] = score === "" || score == null ? "—" : score;
        });
        return record;
      }),
    });
  };

  // One shared action bar: adding starts score entry or opens the score-sheet
  // import/export workflow. Search is kept inside Filters, not duplicated.
  useRegisterBranchWorkspaceToolbar("assessmentEntries", {
    add: () => {
      if (classSubjectId === "all") {
        setFilterOpen(true);
      } else if (!sessionStarted) {
        startSession();
      } else {
        setExcelExportOpen(true);
      }
    },
    filter: () => setFilterOpen(true),
    more: () => setMoreOpen(true),
    search: setSearch,
    print: printAssessmentTable,
  });

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Assessment Entries..."
        text="Checking branch classes, class subjects, students, assessment structures, and saved scores."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before entering assessment scores."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ae-page"
        style={{ "--ae-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ae-state">
          <h2>No branch workspace selected</h2>
          <p>
            Assessment entries belong to your selected teacher workspace. Use Select Role again if the wrong school or branch is active.
          </p>
          <button
            type="button"
            className="ae-state-button"
            onClick={() => router.push("/account")}
          >
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }


  return (
    <main
      className="ae-page"
      style={{ "--ae-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      {toast && (
        <section className={`ae-toast ${toast.tone}`}>
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </section>
      )}

      {classSubjectOptions.length === 0 &&
        (filterClassId !== "all" || filterSubjectId !== "all" ||
         filterPeriodId !== "all" || filterReadiness !== "all") ? (
        <section>
          <Empty
            icon="🔎"
            title="No matching class subjects"
            text="No class subject matches these filters. Choose a different class, subject or term; existing assessment setup has not been removed."
          />
          <div className="ae-filter-empty-action">
            <button type="button" onClick={() => setFilterOpen(true)}>Change filters</button>
          </div>
        </section>
      ) : !selectedClassId ? (
        <section className="ae-list ae-picker-list">
          {classCards.map((item) => (
            <ClassPickerRow
              key={String(item.id)}
              item={item}
              onOpen={() => {
                setSelectedClassId(String(item.id));
                setFilterClassId(String(item.id));
                setClassSubjectId("all");
                setSearch("");
              }}
            />
          ))}
          {!classCards.length && (
            <Empty
              icon="🏫"
              title="No classes available"
              text="No active class subjects are available in the selected branch."
            />
          )}
        </section>
      ) : classSubjectId === "all" ? (
        <>
          <section
            className="ae-filter-chips class-breadcrumb"
            aria-label="Selected class"
          >
            <button
              type="button"
              onClick={() => {
                setSelectedClassId("");
                setFilterClassId("all");
                setClassSubjectId("all");
                setSearch("");
              }}
            >
              ← Classes
            </button>
            <button type="button" onClick={() => setFilterOpen(true)}>
              {(selectedClass as any)?.name || "Selected class"} ·{" "}
              {selectedClassSubjectOptions.length} class subject(s)
            </button>
          </section>

          <section className="ae-list ae-picker-list">
            {classSubjectEntryViews.map((item) => (
              <ClassSubjectPickerRow
                key={String(item.id)}
                item={item}
                onOpen={() => {
                  setClassSubjectId(String(item.id));
                  setSessionStarted(false);
                  setSearch("");
                }}
              />
            ))}
            {!classSubjectEntryViews.length && (
              <Empty
                icon="📝"
                title="No subjects available"
                text="No class subjects in this class match the current filters."
              />
            )}
          </section>
        </>
      ) : (
        <>
          <section className="ae-entry-topbar" aria-label="Selected class and scoring actions">
            <button
              type="button"
              className="ae-entry-back"
              onClick={() => {
                setClassSubjectId("all");
                setSessionStarted(false);
                setSearch("");
              }}
              aria-label="Back to class subjects"
              title="Class subjects"
            >
              ← <span>Class subjects</span>
            </button>
            <span className="ae-entry-location" title={`${selectedOption?.className || "Class"} · ${selectedOption?.subjectName || "Subject"}`}>
              {selectedOption?.className || "Class"} · {selectedOption?.subjectName || "Subject"}
            </span>
            <span className="ae-entry-count" title="Entered score cells" aria-live="polite">
              {completionStats.entered}/{completionStats.expected}
            </span>
            <button type="button" className="ae-entry-start" onClick={startSession} disabled={sessionStarted}>
              {sessionStarted ? "Active" : "Start"}
            </button>
            <button
              type="button"
              className="ae-entry-save"
              onClick={saveEntries}
              disabled={!sessionStarted || saving}
            >
              {saving ? "Saving" : "Save"}
            </button>
          </section>

          {classSubjectId !== "all" && !selectedOption && (
            <Empty
              icon="🔎"
              title="Class subject unavailable"
              text="The selected class subject could not be found in this branch. Choose another one through Filters."
            />
          )}
          {selectedOption && !applicability && (
            <Empty
              icon="⚠️"
              title="No assessment applicability"
              text="This specific class subject does not yet have an active applicability. Choose a ready class subject in Filters or configure its assessment structure."
            />
          )}
          {applicability && !structureItems.length && (
            <Empty
              icon="🧩"
              title="No directly enterable assessment items"
              text="This structure contains no active leaf or explicitly direct-entry item. Calculated parents are intentionally hidden from score entry."
            />
          )}

          {applicability && entryProjection.warnings.length > 0 && (
            <section className="ae-entry-projection-warning">
              <strong>Assessment hierarchy needs review</strong>
              <span>
                {entryProjection.warnings.length} hierarchy warning
                {entryProjection.warnings.length === 1 ? "" : "s"}. Score entry is showing only safe, directly enterable items.
              </span>
            </section>
          )}
          {selectedOption &&
            applicability &&
            !!structureItems.length &&
            !studentScoreRows.length && (
              <Empty
                icon="🎓"
                title="No enrolled students"
                text="No active student enrollment was found for this class subject, class, academic structure, and period."
              />
            )}

          {selectedOption &&
            applicability &&
            !!structureItems.length &&
            !!studentScoreRows.length &&
            viewMode === "summary" && (
              <SummaryView
                rows={studentScoreRows}
                completion={completionStats}
                structureItems={structureItems}
                classSubjectOptions={classSubjectOptions}
              />
            )}

          {selectedOption &&
            applicability &&
            !!structureItems.length &&
            !!studentScoreRows.length &&
            viewMode === "table" && (
              <ScoreTable
                rows={filteredRows}
                photoFor={studentPhoto}
                items={structureItems}
                scores={scores}
                updateScore={updateScore}
              />
            )}

          {selectedOption &&
            applicability &&
            !!structureItems.length &&
            !!studentScoreRows.length &&
            viewMode === "cards" && (
              <section className="ae-list ae-entry-list">
                {filteredRows.map((row) => (
                  <StudentScoreCard
                    key={String((row.student as any).id)}
                    row={row}
                    photo={studentPhoto(row.student)}
                    items={structureItems}
                    scores={scores}
                    updateScore={updateScore}
                  />
                ))}
                {!filteredRows.length && (
                  <Empty
                    icon="🔎"
                    title="No student matches"
                    text="Change your search or completion filter to see students."
                  />
                )}
              </section>
            )}
        </>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          subjects={subjects}
          periods={periods}
          search={search}
          setSearch={setSearch}
          filterClassId={filterClassId}
          filterSubjectId={filterSubjectId}
          filterPeriodId={filterPeriodId}
          filterReadiness={filterReadiness}
          filterCompletion={filterCompletion}
          filterGender={filterGender}
          allOptions={allClassSubjectOptions}
          activeClassSubjectId={classSubjectId}
          onApply={applyAssessmentFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          viewMode={viewMode}
          setViewMode={(mode) => {
            setViewMode(mode);
            setMoreOpen(false);
          }}
          onExcel={() => {
            setMoreOpen(false);
            setExcelExportOpen(true);
          }}
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {excelExportOpen && (
        <ExcelExportSheet
          open={excelExportOpen}
          onClose={() => {
            if (!excelExportBusyKey) setExcelExportOpen(false);
          }}
          title="Assessment Excel"
          subtitle={
            selectedOption
              ? `${selectedOption.className} · ${selectedOption.subjectName}`
              : "Choose a ready class subject first."
          }
          busyKey={excelExportBusyKey}
          actions={[
            {
              key: "import",
              title: "Import assessment scores",
              description:
                "Bring back an Eleeveon score sheet or import a compatible school workbook.",
              badge: "Import",
              disabled: !assessmentExcelContext,
              onClick: async () => openAssessmentExcelImport(),
            },
            {
              key: "template",
              title: "Download blank score sheet",
              description:
                "Create the controlled workbook for this class, subject and assessment structure.",
              badge: `${studentScoreRows.length} students`,
              disabled: !assessmentExcelContext,
              onClick: handleAssessmentTemplateDownload,
            },
            {
              key: "export",
              title: "Export current scores",
              description:
                "Download the same controlled workbook prefilled with the scores currently in Eleeveon.",
              badge: `${completionStats.entered} scores`,
              disabled: !assessmentExcelContext,
              onClick: handleAssessmentCurrentExport,
            },
          ]}
        />
      )}

      <ExcelImportSheet
        open={excelImportOpen}
        onClose={closeAssessmentExcelImport}
        title="Import assessment scores"
        subtitle="Validate the workbook against the active class, subject, period and assessment structure before any score is changed."
        step={excelImportStep}
        busy={excelBusy}
        width={980}
        footer={
          <div className="assessment-excel-footer-actions">
            {excelImportStep === "file" && (
              <button type="button" className="secondary" onClick={closeAssessmentExcelImport}>
                Cancel
              </button>
            )}

            {excelImportStep === "sheet" && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setExcelImportStep("file")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={prepareAssessmentExcelImport}
                >
                  Continue
                </button>
              </>
            )}

            {excelImportStep === "mapping" && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setExcelImportStep("sheet")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={reviewExternalAssessmentImport}
                >
                  Review scores
                </button>
              </>
            )}

            {excelImportStep === "preview" && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setExcelImportStep(
                      excelParsedImport?.kind === "external-assessment"
                        ? "mapping"
                        : "sheet",
                    )
                  }
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!excelValidation?.validRows}
                  onClick={commitAssessmentExcelImport}
                >
                  Import {excelValidation?.validRows || 0} score cell
                  {(excelValidation?.validRows || 0) === 1 ? "" : "s"}
                </button>
              </>
            )}

            {excelImportStep === "result" && (
              <button type="button" className="primary" onClick={closeAssessmentExcelImport}>
                Done
              </button>
            )}
          </div>
        }
      >
        {excelImportStep === "file" && (
          <ExcelFilePicker
            value={excelFile}
            onChange={handleAssessmentExcelFileChange}
            disabled={excelBusy}
            label="Choose assessment workbook"
            description="Use an Eleeveon assessment sheet or a compatible school score workbook."
          />
        )}

        {excelImportStep === "sheet" && excelWorkbook && (
          <section className="assessment-excel-stage">
            <div className="assessment-excel-stage-head">
              <h3>Choose score worksheet</h3>
              <p>
                Eleeveon-controlled workbooks carry hidden context metadata. External workbooks are matched to the assessment columns currently shown on this page.
              </p>
            </div>

            <div className="assessment-excel-context-grid">
              <label>
                <span>Worksheet</span>
                <select
                  value={excelSheetName}
                  onChange={(event) =>
                    setAssessmentExcelSheet(excelWorkbook, event.target.value)
                  }
                >
                  {excelWorkbook.sheets
                    .filter((sheet) => sheet.name !== "_Eleeveon_Metadata")
                    .map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>
                        {sheet.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                <span>Header row</span>
                <input
                  type="number"
                  min={1}
                  value={excelHeaderRowIndex + 1}
                  onChange={(event) =>
                    setExcelHeaderRowIndex(
                      Math.max(0, Number(event.target.value || 1) - 1),
                    )
                  }
                />
              </label>
            </div>

            <div className="assessment-excel-context-card">
              <strong>{excelFile?.name}</strong>
              <span>
                {parseAssessmentWorkbookMetadata(excelWorkbook).metadata
                  ? "Controlled Eleeveon assessment workbook"
                  : "External assessment workbook"}
              </span>
              <small>
                Active context: {selectedOption?.className || "Class"} · {selectedOption?.subjectName || "Subject"} · {selectedOption?.academicPeriodName || "Period"}
              </small>
            </div>
          </section>
        )}

        {excelImportStep === "mapping" && excelWorkbook && (
          <section className="assessment-excel-stage">
            <div className="assessment-excel-stage-head">
              <h3>Match student identity columns</h3>
              <p>
                Assessment score columns are matched against the current projected assessment structure. Confirm how this external sheet identifies each student.
              </p>
            </div>

            {(() => {
              const sheet = getParsedSheet(excelWorkbook, excelSheetName);
              if (!sheet) return null;
              const extracted = sheetToRecords(sheet, {
                headerRowIndex: excelHeaderRowIndex,
                skipEmptyRows: true,
                trimStrings: true,
              });

              return (
                <>
                  <ExcelColumnMappingEditor
                    columns={extracted.columns}
                    fields={ASSESSMENT_STUDENT_FIELDS}
                    mappings={excelIdentityMappings}
                    onChange={(next) => {
                      setExcelIdentityMappings(next);
                      setExcelValidation(null);
                    }}
                    disabled={excelBusy}
                    title="Match student columns"
                    description="Student ID is strongest, followed by Admission Number. Exact Student Name is used only when unambiguous."
                  />

                  <div className="assessment-excel-column-note">
                    <strong>{excelParsedImport?.metadataColumns.length || 0} score column{(excelParsedImport?.metadataColumns.length || 0) === 1 ? "" : "s"} recognized</strong>
                    <span>
                      {excelParsedImport?.metadataColumns
                        .map((column) => column.label)
                        .filter(Boolean)
                        .join(" · ") || "No score columns recognized yet."}
                    </span>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {excelImportStep === "preview" && excelValidation && (
          <ExcelImportPreview
            validation={excelValidation}
            title="Assessment import preview"
            description="Locked or invalid score cells are not changed. Controlled Eleeveon workbooks may clear an existing unlocked score when its cell is blank; external workbooks never clear existing scores from blanks."
            columns={[
              { key: "studentName", label: "Student" },
              { key: "assessmentLabel", label: "Assessment" },
              {
                key: "score",
                label: "Score",
                render: (data: any) =>
                  data.blank ? "Blank" : `${data.score ?? "—"} / ${data.maxScore}`,
              },
              {
                key: "assessmentStructureItemId",
                label: "Item ID",
              },
            ]}
            maxRows={40}
          />
        )}

        {excelImportStep === "result" && excelImportResult && (
          <section className="assessment-excel-result">
            <div className="assessment-excel-result-icon">✓</div>
            <h3>Assessment import completed</h3>
            <p>
              Scores were written through the same offline-first assessmentEntries flow used by manual score entry.
            </p>

            <div className="assessment-excel-result-grid">
              <span><strong>{excelImportResult.created}</strong><small>Created</small></span>
              <span><strong>{excelImportResult.updated}</strong><small>Updated</small></span>
              <span><strong>{excelImportResult.deleted}</strong><small>Cleared</small></span>
              <span><strong>{excelImportResult.skipped}</strong><small>Skipped</small></span>
              <span className={excelImportResult.failed ? "danger" : ""}>
                <strong>{excelImportResult.failed}</strong><small>Failed</small>
              </span>
              <span><strong>{excelImportResult.studentsProcessed}</strong><small>Students</small></span>
            </div>

            {excelImportResult.failed > 0 && (
              <div className="assessment-excel-result-errors">
                {excelImportResult.rows
                  .filter((row) => row.action === "failed")
                  .slice(0, 12)
                  .map((row, index) => (
                    <div key={`${row.rowNumber}-${row.columnIndex || 0}-${index}`}>
                      <strong>Row {row.rowNumber}</strong>
                      <span>{row.error || "Score import failed."}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
      </ExcelImportSheet>
    </main>
  );
}

function ClassPickerRow({
  item,
  onOpen,
}: {
  item: ClassEntryView;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="student-row assessment-row"
      onClick={onOpen}
    >
      <span className="app-icon">🏫</span>
      <span className="student-main">
        <strong>{item.name}</strong>
        <small>
          {item.subjectCount} class subject(s) · {item.studentCount} active
          student(s)
        </small>
        <em>
          {item.missingCount
            ? `${item.missingCount} missing setup`
            : "All class subjects ready"}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${item.missingCount ? "orange" : "green"}`}
        />
        <i>›</i>
      </span>
    </button>
  );
}

function ClassSubjectPickerRow({
  item,
  onOpen,
}: {
  item: ClassSubjectEntryView;
  onOpen: () => void;
}) {
  const ready = item.option.ready && item.itemCount > 0;
  return (
    <button
      type="button"
      className="student-row assessment-row"
      onClick={onOpen}
    >
      <span className="app-icon">📝</span>
      <span className="student-main">
        <strong>{item.option.subjectName}</strong>
        <small>
          {item.option.teacherName} · {item.option.academicPeriodName}
        </small>
        <em>
          {ready
            ? `${item.studentCount} students · ${item.itemCount} items · ${item.completion}% done`
            : "Needs applicability or assessment items"}
        </em>
      </span>
      <span className="student-side">
        <span
          className={`status-dot-mini ${ready ? (item.completion >= 100 ? "green" : "orange") : "red"}`}
        />
        <i>›</i>
      </span>
    </button>
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
      className="ae-page"
      style={{ "--ae-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>
      <section className="ae-state">
        <div className="ae-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <section className="ae-empty">
      <div className="ae-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function entryPathLabels(
  item: AssessmentStructureItem,
): string[] {
  const value = (item as AssessmentStructureItem & {
    __entryPathLabels?: unknown;
  }).__entryPathLabels;

  return Array.isArray(value)
    ? value.filter((label): label is string => typeof label === "string")
    : [item.name];
}

function entryGroupLabel(
  item: AssessmentStructureItem,
): string {
  return entryPathLabels(item).slice(0, -1).join(" · ");
}

function entryCompactLabel(
  item: AssessmentStructureItem,
): string {
  return entryPathLabels(item).join(" · ");
}

function ScoreInput({
  studentId,
  item,
  scores,
  updateScore,
}: {
  studentId: string;
  item: AssessmentStructureItem;
  scores: ScoreMap;
  updateScore: (
    studentId: string,
    item: AssessmentStructureItem,
    value: string,
  ) => void;
}) {
  const value = scores[scoreKey(studentId, idOf((item as any).id))];
  return (
    <input
      className="ae-score-input"
      type="number"
      inputMode="decimal"
      min={0}
      max={Number((item as any).maxScore || 100)}
      step="0.01"
      value={value ?? ""}
      placeholder={`/${Number((item as any).maxScore || 100)}`}
      onChange={(event) => updateScore(studentId, item, event.target.value)}
    />
  );
}

const StudentPortrait = React.memo(function StudentPortrait({
  name,
  photo,
}: {
  name?: string;
  photo?: string;
}) {
  return (
    <span className="ae-portrait" aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" loading="lazy" decoding="async" />
      ) : (
        <span>{String(name || "S").trim().slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
});

function StudentScoreCard({
  row,
  photo,
  items,
  scores,
  updateScore,
}: {
  row: StudentScoreRow;
  photo?: string;
  items: AssessmentStructureItem[];
  scores: ScoreMap;
  updateScore: (
    studentId: string,
    item: AssessmentStructureItem,
    value: string,
  ) => void;
}) {
  const student: any = row.student;
  const studentId = idOf(student.id);
  const complete = row.rowExpected > 0 && row.rowEntered >= row.rowExpected;

  return (
    <article className="ae-score-card">
      <div className="ae-score-head">
        <StudentPortrait name={student.fullName} photo={photo} />
        <div className="ae-student-label">
          <strong>{student.fullName || "Unnamed student"}</strong>
          <span>{student.admissionNumber || "No admission number"}</span>
        </div>
        <i className={complete ? "done" : row.rowEntered ? "partial" : "empty"}>
          {complete ? "Done" : row.rowEntered ? "Partial" : "Empty"}
        </i>
      </div>

      <div className="ae-score-grid">
        {items.map((item: any) => (
          <label key={String(item.id)}>
            <span>{entryCompactLabel(item)}</span>
            <small>/{Number(item.maxScore || 100)}</small>
            <ScoreInput
              studentId={studentId}
              item={item}
              scores={scores}
              updateScore={updateScore}
            />
          </label>
        ))}
      </div>

      <div className="ae-result-row">
        <span>
          Total: <b>{row.weightedTotal}</b>
        </span>
        <span>
          Grade: <b>{row.grade || "—"}</b>
        </span>
        <span>{row.remark || "No remark"}</span>
      </div>
    </article>
  );
}

function ScoreTable({
  rows,
  photoFor,
  items,
  scores,
  updateScore,
}: {
  rows: StudentScoreRow[];
  photoFor: (student: Student) => string | undefined;
  items: AssessmentStructureItem[];
  scores: ScoreMap;
  updateScore: (
    studentId: string,
    item: AssessmentStructureItem,
    value: string,
  ) => void;
}) {
  return (
    <section className="ae-table-card">
      <div className="ae-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              {items.map((item: any) => (
                <th key={String(item.id)}>
                  {entryGroupLabel(item) ? (
                    <small className="ae-assessment-group">
                      {entryGroupLabel(item)}
                    </small>
                  ) : null}
                  {item.name}
                  <span>/{Number(item.maxScore || 100)}</span>
                </th>
              ))}
              <th>Total</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const student: any = row.student;
              const studentId = idOf(student.id);
              return (
                <tr key={String(studentId)}>
                  <td>
                    <div className="ae-table-student">
                      <StudentPortrait name={student.fullName} photo={photoFor(row.student)} />
                      <span className="ae-student-label">
                        <strong>{student.fullName || "Unnamed student"}</strong>
                        <small>{student.admissionNumber || "—"}</small>
                      </span>
                    </div>
                  </td>
                  {items.map((item: any) => (
                    <td key={String(item.id)}>
                      <ScoreInput
                        studentId={studentId}
                        item={item}
                        scores={scores}
                        updateScore={updateScore}
                      />
                    </td>
                  ))}
                  <td>
                    <b>{row.weightedTotal}</b>
                  </td>
                  <td>{row.grade || "—"}</td>
                  <td>{row.remark || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="ae-empty-table">No student matches your filters.</div>
        )}
      </div>
    </section>
  );
}

function SummaryView({
  rows,
  completion,
  structureItems,
  classSubjectOptions,
}: {
  rows: StudentScoreRow[];
  completion: {
    expected: number;
    entered: number;
    completion: number;
    completeStudents: number;
  };
  structureItems: AssessmentStructureItem[];
  classSubjectOptions: ClassSubjectOption[];
}) {
  const gradeCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) =>
      map.set(
        row.grade || "Ungraded",
        (map.get(row.grade || "Ungraded") || 0) + 1,
      ),
    );
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <section className="ae-analysis-grid">
      <article className="ae-analysis ae-current-filter">
        <span>Completion</span>
        <strong>{completion.completion}%</strong>
        <p>
          {completion.entered} of {completion.expected} expected score cells
          entered.
        </p>
      </article>
      <article className="ae-analysis ae-current-filter">
        <span>Complete Students</span>
        <strong>{completion.completeStudents}</strong>
        <p>Students with every active assessment item entered.</p>
      </article>
      <article className="ae-analysis ae-current-filter">
        <span>Assessment Items</span>
        <strong>{structureItems.length}</strong>
        <p>Active score components in the selected assessment structure.</p>
      </article>
      <article className="ae-analysis ae-current-filter">
        <span>Class Subjects</span>
        <strong>{classSubjectOptions.length}</strong>
        <p>Class subjects currently matching your filters.</p>
      </article>
      <article className="ae-analysis ae-wide">
        <span>Grade Distribution</span>
        {gradeCounts.map(([grade, count]) => (
          <p key={grade}>
            <b>{grade}</b> — {count}
          </p>
        ))}
      </article>
    </section>
  );
}

function FilterSheet({
  classes,
  subjects,
  periods,
  search,
  setSearch,
  filterClassId,
  filterSubjectId,
  filterPeriodId,
  filterReadiness,
  filterCompletion,
  filterGender,
  allOptions,
  activeClassSubjectId,
  onApply,
  onClose,
}: {
  classes: Class[];
  subjects: Subject[];
  periods: AcademicPeriod[];
  search: string;
  setSearch: (value: string) => void;
  filterClassId: string;
  filterSubjectId: string;
  filterPeriodId: string;
  filterReadiness: ReadinessFilter;
  filterCompletion: CompletionFilter;
  filterGender: GenderFilter;
  allOptions: ClassSubjectOption[];
  activeClassSubjectId: string;
  onApply: (filters: AssessmentFilterSelection) => void;
  onClose: () => void;
}) {
  // Edit filters locally. Cancel never changes the rendered score sheet.
  const [draft, setDraft] = useState<AssessmentFilterSelection>(() => ({
    classId: filterClassId,
    subjectId: filterSubjectId,
    periodId: filterPeriodId,
    readiness: filterReadiness,
    completion: filterCompletion,
    gender: filterGender,
    classSubjectId: activeClassSubjectId === "all" ? "auto" : activeClassSubjectId,
  }));

  const update = (patch: Partial<AssessmentFilterSelection>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const candidates = allOptions.filter((option) => matchesAssessmentOption(option, draft));
  const candidateIds = new Set(candidates.map((option) => option.id));
  const chosenId = candidateIds.has(draft.classSubjectId) ? draft.classSubjectId : "auto";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ae-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="ae-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Assessment filters"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ae-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>Choose class, subject, gender and score completion.</p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="ae-filter-search">
          <span>Search</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find student or class..." />
        </label>
        <div className="ae-form-grid">
          <label>
            <span>Class</span>
            <select
              value={draft.classId}
              onChange={(e) => update({ classId: e.target.value, classSubjectId: "auto" })}
            >
              <option value="all">All classes</option>
              {classes.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Subject</span>
            <select
              value={draft.subjectId}
              onChange={(e) => update({ subjectId: e.target.value, classSubjectId: "auto" })}
            >
              <option value="all">All subjects</option>
              {subjects.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Academic Period</span>
            <select
              value={draft.periodId}
              onChange={(e) => update({ periodId: e.target.value, classSubjectId: "auto" })}
            >
              <option value="all">All periods</option>
              {periods.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ae-filter-exact-subject">
            <span>Class subject to open ({candidates.length} matching)</span>
            <select
              value={chosenId}
              onChange={(e) => update({ classSubjectId: e.target.value })}
            >
              <option value="auto">Automatically choose a ready match</option>
              {candidates.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.display}{option.ready ? " · Ready" : " · Needs setup"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Setup Status</span>
            <select
              value={draft.readiness}
              onChange={(e) => update({ readiness: e.target.value as ReadinessFilter, classSubjectId: "auto" })}
            >
              <option value="all">All</option>
              <option value="ready">Applicability ready</option>
              <option value="missing">Missing applicability</option>
            </select>
          </label>
          <label>
            <span>Student gender</span>
            <select
              value={draft.gender}
              onChange={(e) => update({ gender: e.target.value as GenderFilter })}
            >
              <option value="all">All students</option>
              <option value="male">Male students</option>
              <option value="female">Female students</option>
            </select>
          </label>
          <label>
            <span>Score Completion</span>
            <select
              value={draft.completion}
              onChange={(e) => update({ completion: e.target.value as CompletionFilter })}
            >
              <option value="all">All</option>
              <option value="empty">Empty</option>
              <option value="partial">Partial</option>
              <option value="complete">Complete</option>
            </select>
          </label>
        </div>
        <div className="ae-sheet-actions">
          <button type="button" onClick={() => setDraft({
            classId: "all", subjectId: "all", periodId: "all",
            readiness: "all", completion: "all", gender: "all",
            classSubjectId: "auto",
          })}>
            Clear
          </button>
          <button type="button" className="ae-primary" onClick={() => onApply({
            ...draft,
            classSubjectId: chosenId,
          })}>
            Apply · Open subject
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onExcel,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onExcel: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ae-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="ae-sheet ae-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More assessment options"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ae-sheet-head">
          <div>
            <h2>More</h2>
            <p>Change how you enter and review scores.</p>
          </div>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <button
          type="button"
          className={viewMode === "cards" ? "active" : ""}
          onClick={() => setViewMode("cards")}
        >
          Card entry <span>Best for phones</span>
        </button>
        <button
          type="button"
          className={viewMode === "table" ? "active" : ""}
          onClick={() => setViewMode("table")}
        >
          Table entry <span>Best for laptop/tablet</span>
        </button>
        <button
          type="button"
          className={viewMode === "summary" ? "active" : ""}
          onClick={() => setViewMode("summary")}
        >
          Summary <span>Completion and grade overview</span>
        </button>
        <button type="button" onClick={onExcel}>
          Excel <span>Import, template and score-sheet export</span>
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh data <span>Reload records from IndexedDB</span>
        </button>
      </section>
    </div>,
    document.body,
  );
}

const css = `
@keyframes ae-spin { to { transform: rotate(360deg); } }
.ae-page{--ae-bg:var(--bg,#f7f8fb);--ae-card:var(--card-bg,var(--surface,#fff));--ae-text:var(--text,#111827);--ae-muted:var(--muted,#6b7280);--ae-border:var(--border,rgba(15,23,42,.10));min-height:100dvh;width:100%;max-width:100%;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ae-primary) 9%,transparent),transparent 30rem),var(--ae-bg);color:var(--ae-text);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}
.ae-page *,.ae-page *::before,.ae-page *::after{box-sizing:border-box;min-width:0}.ae-page button,.ae-page input,.ae-page select{font:inherit}.ae-page button{-webkit-tap-highlight-color:transparent;cursor:pointer}.ae-page input,.ae-page select{width:100%;min-height:42px;border:1px solid var(--input-border,var(--ae-border));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--ae-card));color:var(--input-text,var(--ae-text));outline:none;font-weight:750}.ae-page input:focus,.ae-page select:focus{border-color:color-mix(in srgb,var(--ae-primary) 52%,var(--ae-border));box-shadow:0 0 0 4px color-mix(in srgb,var(--ae-primary) 12%,transparent)}
.ae-state,.ae-search-card,.student-row,.ae-table-card,.ae-score-card,.ae-empty,.ae-analysis,.ae-sheet,.ae-session-strip,.ae-compact-meta{background:var(--ae-card);border:1px solid var(--ae-border);box-shadow:0 18px 45px rgba(15,23,42,.07)}
.ae-search-card{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:1fr auto auto;gap:7px;align-items:center;padding:8px;border-radius:22px;margin:0 auto 8px;backdrop-filter:blur(18px);max-width:1180px}.ae-search{display:flex;align-items:center;gap:8px;min-width:0;background:color-mix(in srgb,var(--ae-primary) 5%,var(--ae-card));border:1px solid var(--ae-border);border-radius:16px;padding:0 10px}.ae-search span{color:var(--ae-muted);font-weight:900}.ae-search input{height:40px;min-height:40px;border:0;background:transparent;box-shadow:none;padding:0}.ae-icon-button,.ae-filter-button{height:40px;width:40px;border:1px solid var(--ae-border);border-radius:15px;background:var(--ae-card);color:var(--ae-text);display:grid;place-items:center;position:relative;font-weight:950}.ae-filter-button.active{border-color:color-mix(in srgb,var(--ae-primary) 58%,var(--ae-border));color:var(--ae-primary);background:color-mix(in srgb,var(--ae-primary) 8%,var(--ae-card))}.ae-filter-button b{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;border-radius:99px;background:var(--ae-primary);color:#fff;font-size:11px;display:grid;place-items:center}.ae-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.ae-filter-chips{display:flex;gap:7px;overflow:auto;padding:1px 0 8px;max-width:1180px;margin:0 auto}.ae-filter-chips button{white-space:nowrap;border:1px solid var(--ae-border);background:var(--ae-card);color:var(--ae-text);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:850}.class-breadcrumb button:first-child{background:color-mix(in srgb,var(--ae-primary) 10%,var(--ae-card));color:var(--ae-primary);border-color:color-mix(in srgb,var(--ae-primary) 22%,var(--ae-border))}
.ae-list{display:grid;gap:8px;max-width:1180px;margin:0 auto}.student-row{width:100%;border-radius:18px;padding:9px 10px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;text-align:left;color:var(--ae-text)}.student-row:hover{border-color:color-mix(in srgb,var(--ae-primary) 35%,var(--ae-border));transform:translateY(-1px)}.app-icon{width:36px;height:36px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--ae-primary) 18%,transparent),color-mix(in srgb,var(--ae-primary) 5%,transparent));font-size:18px}.student-main{display:grid;gap:1px}.student-main strong{font-size:13.5px;line-height:1.2}.student-main small,.student-main em{font-size:11.5px;color:var(--ae-muted);font-style:normal;line-height:1.25}.student-side{display:grid;justify-items:end;gap:3px;color:var(--ae-muted);font-weight:950}.status-dot-mini,.ae-status-dot{width:9px;height:9px;border-radius:99px;background:var(--ae-muted);box-shadow:0 0 0 3px color-mix(in srgb,currentColor 12%,transparent)}.status-dot-mini.green,.ae-status-dot.green{background:#16a34a}.status-dot-mini.orange,.ae-status-dot.orange{background:#f97316}.status-dot-mini.red{background:#dc2626}.status-dot-mini.gray{background:#94a3b8}
.ae-session-strip{max-width:1180px;margin:0 auto 8px;border-radius:18px;padding:8px 9px;display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center}.ae-session-strip strong{display:block;font-size:13.5px}.ae-session-strip small{display:block;color:var(--ae-muted);font-size:11.5px;margin-top:1px}.ae-session-strip button{border:1px solid var(--ae-border);border-radius:14px;padding:8px 10px;background:var(--ae-card);color:var(--ae-text);font-weight:950}.ae-session-strip button.primary{border-color:transparent;background:var(--ae-primary);color:#fff}.ae-session-strip button:disabled{opacity:.55}.ae-compact-meta{max-width:1180px;margin:0 auto 8px;border-radius:18px;padding:7px;display:flex;gap:6px;overflow:auto}.ae-chip{white-space:nowrap;display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:950;border:1px solid var(--ae-border);background:color-mix(in srgb,var(--ae-card) 90%,transparent)}.ae-chip.green{background:rgba(34,197,94,.12);color:#15803d}.ae-chip.red{background:rgba(239,68,68,.12);color:#b91c1c}.ae-chip.blue{background:rgba(59,130,246,.12);color:#1d4ed8}.ae-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.ae-chip.orange{background:rgba(249,115,22,.12);color:#c2410c}.ae-chip.gray{color:var(--ae-muted)}
.ae-score-card{border-radius:18px;padding:9px}.ae-score-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px}.ae-score-head strong{display:block;font-size:13.5px}.ae-score-head span{display:block;color:var(--ae-muted);font-size:11.5px;margin-top:1px}.ae-score-head i{font-style:normal;font-size:10.5px;font-weight:950;border-radius:999px;padding:4px 7px;background:rgba(148,163,184,.12)}.ae-score-head i.done{background:rgba(34,197,94,.12);color:#15803d}.ae-score-head i.partial{background:rgba(249,115,22,.12);color:#c2410c}.ae-score-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ae-score-grid label{display:grid;gap:3px;border:1px solid var(--ae-border);border-radius:15px;padding:7px;background:color-mix(in srgb,var(--ae-primary) 3%,var(--ae-card))}.ae-score-grid span{font-size:11.5px;font-weight:950}.ae-score-grid small{font-size:10px;color:var(--ae-muted)}.ae-score-input{width:100%;height:36px;min-height:36px;border:1px solid var(--ae-border);border-radius:12px;background:var(--ae-card);color:var(--ae-text);padding:0 8px;font:inherit;font-weight:950}.ae-result-row{display:flex;gap:8px;flex-wrap:wrap;color:var(--ae-muted);font-size:11.5px;border-top:1px solid var(--ae-border);margin-top:8px;padding-top:8px}.ae-result-row b{color:var(--ae-text)}
.ae-entry-projection-warning{max-width:1180px;margin:0 auto 10px;padding:11px 13px;border:1px solid #f59e0b;border-radius:14px;background:color-mix(in srgb,#f59e0b 10%,var(--ae-card));display:grid;gap:3px}.ae-entry-projection-warning span{font-size:12px;color:var(--ae-muted)}.ae-assessment-group{display:block!important;margin:0 0 2px!important;color:var(--ae-primary)!important;font-size:9px!important;letter-spacing:.02em;text-transform:none!important}.ae-table-card{max-width:1180px;margin:0 auto;border-radius:20px;overflow:hidden}.ae-table-scroll{overflow:auto;max-height:72dvh}table{width:100%;border-collapse:separate;border-spacing:0;min-width:760px}th,td{border-bottom:1px solid var(--ae-border);padding:8px 9px;text-align:left;vertical-align:middle;font-size:12.5px}th{position:sticky;top:0;background:var(--ae-card);z-index:1;color:var(--ae-muted);font-size:10.5px;text-transform:uppercase}th span,td span{display:block;color:var(--ae-muted);font-size:10.5px;margin-top:1px}td .ae-score-input{min-width:84px}.ae-empty-table{padding:18px;color:var(--ae-muted);text-align:center}
.ae-empty,.ae-state{max-width:720px;margin:10px auto;border-radius:22px;padding:22px;text-align:center}.ae-empty-icon{font-size:28px}.ae-empty h3,.ae-state h2{margin:7px 0 4px}.ae-empty p,.ae-state p{margin:0;color:var(--ae-muted);font-size:13px}.ae-spinner{width:30px;height:30px;border:3px solid rgba(148,163,184,.35);border-top-color:var(--ae-primary);border-radius:999px;margin:0 auto 10px;animation:ae-spin 1s linear infinite}.ae-state-button{margin-top:12px;border:1px solid transparent;border-radius:14px;padding:10px 12px;font-weight:950;background:var(--ae-primary);color:#fff}
.ae-analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:1180px;margin:0 auto}.ae-analysis{border-radius:18px;padding:12px}.ae-analysis span{display:block;color:var(--ae-muted);font-size:11.5px;font-weight:950}.ae-analysis strong{font-size:26px}.ae-analysis p{margin:5px 0 0;color:var(--ae-muted);font-size:12.5px}.ae-analysis.ae-wide{grid-column:1/-1}.ae-analysis.ae-wide p{display:flex;justify-content:space-between;border-top:1px solid var(--ae-border);padding-top:7px}
.ae-sheet-backdrop{position:fixed;inset:0;z-index:50;background:rgba(15,23,42,.48);display:flex;align-items:flex-end;justify-content:center;padding:12px}.ae-sheet{width:min(680px,100%);max-height:88dvh;overflow:auto;border-radius:26px;padding:14px}.ae-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ae-sheet-head h2{margin:0}.ae-sheet-head p{margin:2px 0 0;color:var(--ae-muted);font-size:13px}.ae-sheet-head button{border:1px solid var(--ae-border);background:var(--ae-card);border-radius:12px;width:36px;height:36px;color:var(--ae-text)}.ae-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ae-form-grid label{display:grid;gap:5px;font-size:12px;color:var(--ae-muted);font-weight:850}.ae-sheet-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--ae-border);padding-top:12px;margin-top:12px}.ae-sheet-actions button{border:1px solid var(--ae-border);border-radius:14px;padding:10px 12px;background:var(--ae-card);color:var(--ae-text);font-weight:950}.ae-sheet-actions .ae-primary{background:var(--ae-primary);color:#fff;border-color:transparent}.ae-more-sheet{display:grid;gap:8px}.ae-more-sheet .ae-sheet-head{margin-bottom:4px}.ae-more-sheet>button{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;text-align:left;border:1px solid var(--ae-border);background:var(--ae-card);color:var(--ae-text);border-radius:16px;padding:11px;font-weight:950}.ae-more-sheet>button span:first-child{grid-row:1/3;font-size:18px}.ae-more-sheet>button small{display:block;color:var(--ae-muted);font-size:11.5px;font-weight:700}.ae-more-sheet>button.active{border-color:var(--ae-primary);color:var(--ae-primary);background:color-mix(in srgb,var(--ae-primary) 7%,var(--ae-card))}
.ae-toast{position:fixed;z-index:80;left:12px;right:12px;bottom:12px;max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:18px;padding:12px 14px;color:#fff;box-shadow:0 18px 40px rgba(15,23,42,.28);font-weight:850}.ae-toast.success{background:#16a34a}.ae-toast.error{background:#dc2626}.ae-toast.info{background:#2563eb}.ae-toast button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:10px;width:30px;height:30px}
@media (min-width:760px){.ae-page{padding:14px}.ae-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ae-score-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ae-sheet-backdrop{align-items:center}.ae-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (min-width:1120px){.ae-list.ae-entry-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ae-list.ae-picker-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ae-score-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.ae-page{padding:7px}.ae-search-card{border-radius:18px}.ae-session-strip{grid-template-columns:auto 1fr auto auto}.ae-session-strip button{padding:8px 9px}.ae-score-grid,.ae-form-grid{grid-template-columns:1fr}th,td{padding:7px}.ae-sheet{border-radius:22px}.ae-analysis-grid{grid-template-columns:1fr}}

@media (min-width:980px){
  .ae-sheet-backdrop{
    top:var(--eds-shell-top-offset,0px);
    right:0;
    bottom:0;
    left:var(--portal-content-left,0px);
    width:auto;
    max-width:calc(100vw - var(--portal-content-left,0px));
    min-width:0;
    overflow-x:hidden;
  }

  .ae-sheet{
    min-width:0;
    max-width:calc(100vw - var(--portal-content-left,0px) - 20px);
  }
}


.assessment-excel-footer-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.assessment-excel-footer-actions button{min-height:40px;border-radius:12px;padding:0 14px;border:1px solid var(--ae-border);font-weight:900}.assessment-excel-footer-actions button.secondary{background:var(--ae-card);color:var(--ae-text)}.assessment-excel-footer-actions button.primary{background:var(--ae-primary);border-color:var(--ae-primary);color:#fff}.assessment-excel-footer-actions button:disabled{opacity:.5;cursor:not-allowed}.assessment-excel-stage{display:grid;gap:14px}.assessment-excel-stage-head h3{margin:0;font-size:15px}.assessment-excel-stage-head p{margin:5px 0 0;color:var(--ae-muted);font-size:12px;line-height:1.5}.assessment-excel-context-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.assessment-excel-context-grid label{display:grid;gap:5px}.assessment-excel-context-grid label>span{font-size:11px;font-weight:900;color:var(--ae-muted)}.assessment-excel-context-card,.assessment-excel-column-note{display:grid;gap:3px;padding:12px;border:1px solid var(--ae-border);border-radius:14px;background:var(--ae-card)}.assessment-excel-context-card span,.assessment-excel-context-card small,.assessment-excel-column-note span{font-size:11px;color:var(--ae-muted);line-height:1.45}.assessment-excel-result{text-align:center;padding:10px 0}.assessment-excel-result-icon{width:56px;height:56px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:rgba(34,197,94,.13);color:#15803d;font-size:28px;font-weight:950}.assessment-excel-result h3{margin:0;font-size:17px}.assessment-excel-result>p{margin:6px auto 16px;max-width:620px;color:var(--ae-muted);font-size:12px;line-height:1.5}.assessment-excel-result-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.assessment-excel-result-grid span{padding:11px 7px;border-radius:12px;background:var(--ae-card);border:1px solid var(--ae-border)}.assessment-excel-result-grid span.danger{background:#fff1f0}.assessment-excel-result-grid strong{display:block;font-size:18px}.assessment-excel-result-grid small{display:block;margin-top:2px;color:var(--ae-muted);font-size:10px}.assessment-excel-result-errors{margin-top:14px;display:grid;gap:6px;text-align:left}.assessment-excel-result-errors div{display:grid;gap:2px;padding:9px 10px;border-radius:11px;background:#fff7f6;border:1px solid #ffd3cf}.assessment-excel-result-errors strong{font-size:11px}.assessment-excel-result-errors span{font-size:10px;color:#b42318}@media(max-width:720px){.assessment-excel-context-grid{grid-template-columns:1fr}.assessment-excel-result-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.assessment-excel-footer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.assessment-excel-footer-actions button:only-child{grid-column:1/-1}}

/* ============================================================
   PORTAL-SAFE CENTERED MODALS + RESPONSIVE ASSESSMENT CONTEXT
   ============================================================ */
.ae-sheet-backdrop,
[class*="excel"][class*="backdrop"] {
  top: calc(var(--eds-shell-top-offset, 0px) + var(--portal-header-height, 48px)) !important;
  right: 0 !important;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important;
  left: 0 !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 10px !important;
  overflow: hidden !important;
  z-index: 58 !important;
}

.ae-sheet,
[class*="excel"][class*="sheet"]:not([class*="backdrop"]),
[class*="excel"][class*="modal"]:not([class*="backdrop"]) {
  margin: 0 auto !important;
  max-height: calc(100% - 4px) !important;
  max-width: calc(100% - 2px) !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-padding-bottom: 84px;
}

.ae-sheet-actions {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: linear-gradient(to top, var(--ae-card) 78%, transparent);
}

/* Replace the single horizontally-scrolling metadata line with a true
   responsive grid so labels never sit on top of one another. */
.ae-compact-meta {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)) !important;
  gap: 7px !important;
  overflow: visible !important;
  align-items: stretch;
}

.ae-compact-meta .ae-chip {
  min-width: 0;
  width: 100%;
  min-height: 32px;
  justify-content: center;
  text-align: center;
  white-space: normal !important;
  overflow-wrap: anywhere;
  line-height: 1.2;
}

/* Let the subject/session strip breathe on phones instead of squeezing
   title + Start + Save into one narrow row. */
@media (max-width: 560px) {
  .ae-session-strip {
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center;
  }

  .ae-session-strip > div {
    min-width: 0;
  }

  .ae-session-strip > div strong,
  .ae-session-strip > div small {
    overflow-wrap: anywhere;
  }

  .ae-session-strip > button {
    width: 100%;
  }

  .ae-session-strip > button:nth-last-child(2) {
    grid-column: 1 / 2;
  }

  .ae-session-strip > button:last-child {
    grid-column: 2 / 3;
  }

  .ae-compact-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 360px) {
  .ae-compact-meta {
    grid-template-columns: 1fr !important;
  }
}

@media (min-width: 980px) {
  .ae-sheet-backdrop,
  [class*="excel"][class*="backdrop"] {
    top: calc(var(--eds-shell-top-offset, 0px) + var(--portal-header-height, 48px)) !important;
    right: 0 !important;
    bottom: 0 !important;
    left: var(--portal-content-left, 0px) !important;
    max-width: calc(100vw - var(--portal-content-left, 0px)) !important;
    padding: 18px !important;
    z-index: 80 !important;
  }

  .ae-compact-meta {
    grid-template-columns: repeat(auto-fit, minmax(130px, max-content)) !important;
    justify-content: start;
  }

  .ae-compact-meta .ae-chip {
    width: auto;
    padding-inline: 11px;
  }
}

/* ============================================================
   ASSESSMENT FILTER / MORE MODALS — TRUE FULL-SCREEN PORTALS
   ============================================================ */
.ae-sheet-backdrop {
  --ae-bg: var(--bg, #f7f8fb);
  --ae-card: var(--card-bg, var(--surface, #ffffff));
  --ae-text: var(--text, var(--foreground, #111827));
  --ae-muted: var(--muted, var(--muted-foreground, #64748b));
  --ae-border: var(--border, rgba(15, 23, 42, .12));
  --ae-primary: var(--primary-color, #2563eb);

  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  min-height: 100dvh !important;
  z-index: 2147482000 !important;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  box-sizing: border-box !important;
  padding:
    calc(var(--eds-shell-top-offset, 0px) + var(--portal-header-height, 48px) + 10px)
    10px
    calc(82px + env(safe-area-inset-bottom, 0px))
    10px !important;

  overflow: hidden !important;

  background:
    color-mix(
      in srgb,
      #020617 62%,
      transparent
    ) !important;

  -webkit-backdrop-filter: blur(10px) saturate(.92);
  backdrop-filter: blur(10px) saturate(.92);
}

.ae-sheet-backdrop .ae-sheet {
  width: min(680px, calc(100vw - 20px)) !important;
  max-width: 100% !important;
  max-height: calc(100% - 4px) !important;
  min-height: 0 !important;
  margin: 0 !important;

  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;

  border: 1px solid var(--ae-border) !important;
  border-radius: 22px !important;
  background: var(--ae-card) !important;
  color: var(--ae-text) !important;
  box-shadow: 0 26px 80px rgba(2, 6, 23, .28) !important;
}

.ae-sheet-backdrop .ae-sheet-head {
  position: sticky;
  top: -14px;
  z-index: 5;

  margin: -14px -14px 12px;
  padding: 14px;
  border-bottom: 1px solid var(--ae-border);

  background: var(--ae-card);
}

.ae-sheet-backdrop .ae-sheet-head h2 {
  color: var(--ae-text) !important;
}

.ae-sheet-backdrop .ae-sheet-head p {
  color: var(--ae-muted) !important;
}

.ae-sheet-backdrop .ae-sheet-head > button {
  position: relative;
  z-index: 6;

  width: 44px !important;
  min-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;

  display: grid;
  place-items: center;

  border: 1px solid var(--ae-border) !important;
  border-radius: 999px !important;

  background:
    color-mix(
      in srgb,
      var(--ae-text) 6%,
      var(--ae-card)
    ) !important;

  color: var(--ae-text) !important;
  box-shadow: none !important;

  font-size: 20px;
  font-weight: 900;

  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  pointer-events: auto;
}

.ae-sheet-backdrop .ae-sheet-head > button:hover {
  background:
    color-mix(
      in srgb,
      var(--ae-primary) 10%,
      var(--ae-card)
    ) !important;

  border-color:
    color-mix(
      in srgb,
      var(--ae-primary) 36%,
      var(--ae-border)
    ) !important;
}

.ae-sheet-backdrop .ae-form-grid label {
  color: var(--ae-muted);
}

.ae-sheet-backdrop input,
.ae-sheet-backdrop select,
.ae-sheet-backdrop textarea {
  background: var(--ae-card) !important;
  color: var(--ae-text) !important;
  border-color: var(--ae-border) !important;
}

.ae-sheet-backdrop select option {
  background: var(--ae-card);
  color: var(--ae-text);
}

.ae-sheet-backdrop .ae-sheet-actions {
  position: sticky;
  bottom: -14px;
  z-index: 4;

  margin: 12px -14px -14px;
  padding: 12px 14px 14px;

  border-top: 1px solid var(--ae-border);

  background:
    linear-gradient(
      to top,
      var(--ae-card) 86%,
      color-mix(in srgb, var(--ae-card) 94%, transparent)
    );
}

.ae-sheet-backdrop .ae-sheet-actions button,
.ae-sheet-backdrop .ae-more-sheet > button {
  min-height: 46px;

  border-color: var(--ae-border) !important;
  background:
    color-mix(
      in srgb,
      var(--ae-text) 4%,
      var(--ae-card)
    ) !important;
  color: var(--ae-text) !important;

  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  pointer-events: auto;
}

.ae-sheet-backdrop .ae-sheet-actions .ae-primary {
  background: var(--ae-primary) !important;
  border-color: var(--ae-primary) !important;
  color: #ffffff !important;
}

.ae-sheet-backdrop .ae-more-sheet > button.active {
  background:
    color-mix(
      in srgb,
      var(--ae-primary) 10%,
      var(--ae-card)
    ) !important;
  border-color: var(--ae-primary) !important;
  color: var(--ae-primary) !important;
}

@media (prefers-color-scheme: dark) {
  .ae-sheet-backdrop {
    background:
      color-mix(
        in srgb,
        #020617 78%,
        transparent
      ) !important;
  }

  .ae-sheet-backdrop .ae-sheet-head > button {
    background: rgba(255, 255, 255, .12) !important;
    color: #f8fafc !important;
    border-color: rgba(255, 255, 255, .22) !important;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, .28),
      inset 0 0 0 1px rgba(255, 255, 255, .04) !important;
  }

  .ae-sheet-backdrop .ae-sheet-head > button:hover {
    background: rgba(255, 255, 255, .18) !important;
    border-color: rgba(255, 255, 255, .32) !important;
  }
}

@media (max-width: 520px) {
  .ae-sheet-backdrop {
    padding:
      calc(var(--eds-shell-top-offset, 0px) + var(--portal-header-height, 48px) + 8px)
      8px
      calc(82px + env(safe-area-inset-bottom, 0px))
      8px !important;
  }

  .ae-sheet-backdrop .ae-sheet {
    width: calc(100vw - 16px) !important;
    border-radius: 20px !important;
  }

  .ae-sheet-backdrop .ae-more-sheet > button {
    min-height: 52px;
  }

  .ae-sheet-backdrop .ae-sheet-actions button {
    min-height: 48px;
    flex: 1 1 120px;
  }
}


/* ============================================================
   MODAL VISIBILITY HARDENING — STRONG BACKDROP + CLOSE BUTTON
   Applies to assessment portals and shared Excel portals rendered
   directly under document.body.
   ============================================================ */
.ae-sheet-backdrop,
.excel-export-overlay,
.excel-import-overlay {
  background: rgba(2, 6, 23, .66) !important;
  -webkit-backdrop-filter: blur(12px) saturate(.9) !important;
  backdrop-filter: blur(12px) saturate(.9) !important;
}

/* Branch Admin assessment — lean, neutral, scroll-efficient */
.ae-page{min-height:0;background:transparent;padding:4px 5px 20px;overflow-x:clip}
.ae-page .ae-search-card{display:none}
.ae-page .student-row,.ae-page .ae-score-card,.ae-page .ae-table-card,.ae-page .ae-session-strip{box-shadow:none;background:var(--ae-card);border:1px solid var(--ae-border)}
.ae-page .ae-list{gap:10px;align-items:stretch;max-width:none}
.ae-page .ae-picker-list .student-row{min-height:128px;align-items:center;padding:18px 16px;border-radius:13px;transform:none;box-shadow:none}
.ae-page .ae-picker-list .student-row:focus-visible,.ae-page .ae-picker-list .student-row:hover{border-color:var(--ae-primary)}
.ae-page .app-icon{background:var(--ae-bg)!important;color:var(--ae-text)!important;box-shadow:none!important}
.ae-page .ae-session-strip{padding:6px 10px;margin:4px auto 8px;border-radius:12px;min-height:44px}
.ae-page .ae-active-context{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ae-page .ae-active-context strong{font-size:13px}
.ae-page .ae-active-context small{font-size:11px;color:var(--ae-muted);white-space:nowrap}
.ae-page .ae-score-card{border-radius:13px;padding:11px;min-width:0;content-visibility:auto;contain-intrinsic-size:auto 230px}
.ae-page .ae-score-grid label{background:transparent;border-radius:9px;padding:6px;gap:2px}
.ae-page .ae-score-grid small{font-size:10px}
.ae-page .ae-score-head{align-items:center;justify-content:flex-start;gap:9px}
.ae-page .ae-score-head i{margin-left:auto;background:var(--ae-bg);color:var(--ae-muted);font-weight:650}
.ae-page .ae-score-head i.done,.ae-page .ae-score-head i.partial{background:var(--ae-bg);color:var(--ae-text)}
.ae-page .ae-student-label{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ae-page .ae-student-label strong{font-size:12.5px;line-height:1.25}
.ae-page .ae-student-label small{font-size:10.5px;color:var(--ae-muted)}
.ae-page .ae-portrait{width:36px;height:36px;flex:0 0 36px;border-radius:50%;border:1px solid var(--ae-border);overflow:hidden;display:grid;place-items:center;background:var(--ae-bg);color:var(--ae-muted);font-size:14px;font-weight:700}
.ae-page .ae-portrait img{width:100%;height:100%;object-fit:cover;display:block}
.ae-page .ae-table-student{display:flex;gap:8px;align-items:center;min-width:155px}
.ae-page .ae-table-card{max-width:none;border-radius:12px}
.ae-page .ae-table-scroll{max-height:none;overflow:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.ae-page .ae-table-card tr{content-visibility:auto;contain-intrinsic-size:auto 57px}
.ae-page .ae-score-grid span{font-size:10.5px;font-weight:700}
.ae-page .ae-result-row{font-size:10.5px}
.ae-page .ae-compact-meta{display:none}
.ae-page .ae-score-head .ae-student-label span{font-size:10.5px;color:var(--ae-muted)}
@media(min-width:1120px){.ae-page .ae-list.ae-entry-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(min-width:760px){.ae-page .ae-list.ae-picker-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:759px){.ae-page{padding:2px 0 12px}.ae-page .ae-list.ae-picker-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ae-page .ae-picker-list .student-row{padding:13px 10px;min-height:112px}.ae-page .ae-list.ae-entry-list{grid-template-columns:1fr}.ae-page .ae-score-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ae-page .ae-score-card{content-visibility:visible}}
@media(max-width:380px){.ae-page .ae-list.ae-picker-list{grid-template-columns:1fr}.ae-page .ae-score-grid{grid-template-columns:1fr}}
/* Excel is portaled outside .ae-page, so the styling must be global. */
.excel-export-overlay,
.excel-import-overlay {
  isolation: isolate;
}

.excel-export-close,
.excel-import-close,
.ae-sheet-backdrop .ae-sheet-head > button,
.ae-sheet-backdrop .ae-modal-close {
  position: relative !important;
  z-index: 20 !important;
  width: 42px !important;
  min-width: 42px !important;
  height: 42px !important;
  min-height: 42px !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  border: 1px solid rgba(15, 23, 42, .20) !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  color: #111827 !important;
  opacity: 1 !important;
  visibility: visible !important;
  box-shadow: 0 5px 16px rgba(15, 23, 42, .16) !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  line-height: 1 !important;
  cursor: pointer !important;
  pointer-events: auto !important;
}

.excel-export-close:hover,
.excel-import-close:hover,
.ae-sheet-backdrop .ae-sheet-head > button:hover,
.ae-sheet-backdrop .ae-modal-close:hover {
  border-color: color-mix(in srgb, var(--ae-primary, #2563eb) 42%, rgba(15, 23, 42, .20)) !important;
  background: color-mix(in srgb, var(--ae-primary, #2563eb) 8%, #ffffff) !important;
  color: #111827 !important;
}

@media (prefers-color-scheme: dark) {
  .ae-sheet-backdrop,
  .excel-export-overlay,
  .excel-import-overlay {
    background: rgba(2, 6, 23, .78) !important;
  }

  .excel-export-close,
  .excel-import-close,
  .ae-sheet-backdrop .ae-sheet-head > button,
  .ae-sheet-backdrop .ae-modal-close {
    border-color: rgba(255, 255, 255, .22) !important;
    background: #1f2937 !important;
    color: #ffffff !important;
    box-shadow: 0 5px 18px rgba(0, 0, 0, .36) !important;
  }
}


/* V4: dense, neutral score-entry workspace — preserve theme and fast scrolling. */
.ae-page { --ae-panel:color-mix(in srgb,var(--ae-card) 76%,var(--ae-bg) 24%); background:transparent; }
.ae-page .ae-score-card, .ae-page .ae-table-card,
.ae-page .ae-picker-list .student-row, .ae-page .ae-analysis {
  background:var(--ae-panel); border-color:color-mix(in srgb,var(--ae-border) 85%,var(--ae-muted) 15%);
  box-shadow:none; transform:none; transition:border-color .12s ease;
}
.ae-page .ae-picker-list .student-row { min-height:132px; }
.ae-page .ae-score-grid label { background:color-mix(in srgb,var(--ae-panel) 84%,var(--ae-bg) 16%); }
.ae-page .ae-table-scroll th { background:color-mix(in srgb,var(--ae-panel) 88%,var(--ae-bg) 12%); }
.ae-page .ae-table-scroll tbody tr:nth-child(even) { background:color-mix(in srgb,var(--ae-panel) 79%,var(--ae-bg) 21%); }
.ae-page .ae-table-scroll tbody tr:nth-child(odd) { background:var(--ae-panel); }
.ae-page .ae-table-scroll tbody tr { content-visibility:visible; }
.ae-page .ae-table-scroll td { background:transparent; }
.ae-page .ae-entry-topbar {display:flex;align-items:center;gap:7px;min-height:37px;margin:0 0 7px;min-width:0;white-space:nowrap;}
.ae-page .ae-entry-topbar button { flex:0 0 auto;min-height:30px;padding:5px 9px;border:1px solid var(--ae-border);border-radius:8px;background:var(--ae-panel);color:var(--ae-text);font-size:11px;font-weight:700;line-height:1.15;}
.ae-page .ae-entry-back {max-width:130px;}
.ae-page .ae-entry-location { flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:650;color:var(--ae-text); }
.ae-page .ae-entry-count { flex:0 0 auto;color:var(--ae-muted);font-size:11px;font-variant-numeric:tabular-nums; }
.ae-page .ae-entry-topbar .ae-entry-save {background:var(--ae-primary);color:#fff;border-color:transparent;}
.ae-page .ae-entry-topbar button:disabled {opacity:.55;}
.ae-filter-search {display:grid;gap:5px;margin-bottom:12px;font-size:12px;font-weight:700;color:var(--ae-muted);}
.ae-filter-search input {min-height:40px;border:1px solid var(--ae-border);border-radius:10px;padding:0 11px;background:var(--ae-card);color:var(--ae-text);}
@media(max-width:759px){
 .ae-page .ae-entry-topbar{gap:4px;}
 .ae-page .ae-entry-back{padding:5px 7px;max-width:35px;}
 .ae-page .ae-entry-back span{display:none;}
 .ae-page .ae-entry-location{font-size:11px;}
 .ae-page .ae-entry-count{font-size:10px;}
 .ae-page .ae-entry-topbar button{padding:5px 7px;font-size:10px;}
 .ae-page .ae-picker-list .student-row{min-height:120px;}
}
@media(min-width:1120px){.ae-page .ae-list.ae-entry-list{grid-template-columns:repeat(4,minmax(0,1fr));}}
@media(prefers-reduced-motion:reduce){.ae-page *, .ae-page *::before,.ae-page *::after{scroll-behavior:auto!important;animation-duration:0.01ms!important;transition-duration:0.01ms!important;}}

/* V25: filter-driven subject navigation; the exact ClassSubject id is offered
   alongside class/subject/term selectors to avoid ambiguous term records. */
.ae-filter-exact-subject { grid-column: 1 / -1; }
.ae-filter-empty-action { display:flex;justify-content:center;margin:10px auto; }
.ae-filter-empty-action button { padding:9px 16px;border-radius:10px;border:1px solid var(--ae-border);background:var(--ae-card);color:var(--ae-text);font-weight:750; }

/* V6 — quiet neutral records presentation matching Students/Teachers/Classes V5 */

.ae-page {
  --ae-bg:var(--bg,var(--background,#f2f4f7));
  --ae-card:var(--card-bg,var(--surface,#fff));
  --ae-panel:color-mix(in srgb,var(--ae-card) 91%,var(--ae-text,#182235) 9%);
  --ae-border:color-mix(in srgb,var(--border,#d4dae3) 85%,var(--ae-text,#182235) 15%);
  background:var(--ae-bg); padding:5px; min-height:0;
}
.ae-page .ae-score-card,.ae-page .ae-table-card,.ae-page .ae-analysis,
.ae-page .ae-picker-list .student-row,.ae-page .ae-list:not(.ae-picker-list) .student-row {
  background:color-mix(in srgb,var(--ae-card) 93%,var(--ae-text) 7%);
  border:1px solid var(--ae-border); box-shadow:none; border-radius:13px;
}
.ae-page .ae-picker-list .student-row {min-height:130px;}
.ae-page .ae-table-card {padding:4px; margin-top:2px;}
.ae-page .ae-table-scroll {border-radius:10px;}
.ae-page .ae-table-scroll table {background:color-mix(in srgb,var(--ae-card) 95%,var(--ae-text) 5%);}
.ae-page .ae-table-scroll th {position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--ae-card) 85%,var(--ae-text) 15%);}
.ae-page .ae-table-scroll tbody tr:nth-child(even) {background:color-mix(in srgb,var(--ae-card) 89%,var(--ae-text) 11%);}
.ae-page .ae-table-scroll tbody tr:nth-child(odd) {background:color-mix(in srgb,var(--ae-card) 95%,var(--ae-text) 5%);}
.ae-page .ae-table-scroll td {background:transparent;}
.ae-page .ae-score-grid label {background:color-mix(in srgb,var(--ae-card) 89%,var(--ae-text) 11%);border-radius:9px;}
.ae-page .ae-portrait {box-shadow:none;border-radius:12px;}
.ae-page .ae-score-card {box-shadow:none;}
.ae-page .ae-entry-topbar {margin-bottom:5px;}
.ae-page .ae-entry-topbar button {background:var(--ae-panel);}
.ae-page .ae-entry-topbar .ae-entry-save {background:var(--ae-primary);color:#fff;}
.ae-page .ae-analysis {box-shadow:none;}
@media(min-width:1024px){.ae-page .ae-list.ae-entry-list {grid-template-columns:repeat(4,minmax(0,1fr));}}
@media(max-width:639px){.ae-page {padding:3px;}}
@media(prefers-reduced-motion:reduce){.ae-page .student-row,.ae-page .ae-score-card {transition:none;}}

/* V23 FINAL — Mobile: one STUDENT card per row, with TWO assessment
   item cells side by side INSIDE the card. No squeezed student cards. */
@media (max-width: 759px) {
  .ae-page .ae-list.ae-entry-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 8px;
    width: 100%;
    max-width: none;
    align-items: stretch;
  }

  .ae-page .ae-entry-list > .ae-score-card {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 10px;
    border-radius: 12px;
    content-visibility: visible;
  }

  .ae-page .ae-entry-list .ae-score-head {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
    margin-bottom: 8px;
  }

  .ae-page .ae-entry-list .ae-portrait {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
  }

  .ae-page .ae-entry-list .ae-student-label {
    flex: 1 1 0;
    min-width: 0;
  }
  .ae-page .ae-entry-list .ae-student-label strong {
    font-size: 12px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .ae-page .ae-entry-list .ae-student-label span {
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .ae-page .ae-entry-list .ae-score-head i {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 10px;
  }

  /* This is the requested 2-COLUMN arrangement: assessment ITEMS. */
  .ae-page .ae-entry-list .ae-score-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 7px;
    width: 100%;
    min-width: 0;
  }

  .ae-page .ae-entry-list .ae-score-grid label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 3px 4px;
    align-content: start;
    min-width: 0;
    padding: 7px;
    border-radius: 9px;
  }

  .ae-page .ae-entry-list .ae-score-grid label > span {
    min-width: 0;
    font-size: 10.5px;
    line-height: 1.22;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .ae-page .ae-entry-list .ae-score-grid label > small {
    align-self: start;
    justify-self: end;
    font-size: 9.5px;
    white-space: nowrap;
  }
  .ae-page .ae-entry-list .ae-score-grid .ae-score-input {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    min-height: 38px;
    height: 38px;
    padding: 0 9px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .ae-page .ae-entry-list .ae-result-row {
    margin-top: 8px;
    padding-top: 7px;
    font-size: 10.5px;
    line-height: 1.3;
  }
}

/* Preserve two assessment-item columns even on narrow Android phones.
   The separate class/subject picker grids are not affected. */
@media (max-width: 380px) {
  .ae-page .ae-list.ae-entry-list {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .ae-page .ae-entry-list .ae-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px;
  }
  .ae-page .ae-entry-list .ae-score-grid label {
    padding: 5px;
    gap: 3px;
  }
  .ae-page .ae-entry-list .ae-score-grid label > span { font-size: 10px; }
  .ae-page .ae-entry-list .ae-score-grid label > small { font-size: 9px; }
}

`;
