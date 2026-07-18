"use client";

/**
 * app/branch-admin/modules/AssessmentEntries.tsx
 * Eleeveon Schools — Branch Admin Assessment Entry V2.
 *
 * Built from the old AssessmentEntries logic and upgraded to the compact
 * Students.tsx branch-admin UI pattern:
 * - workspace-session aligned branch resolution
 * - mobile-first card score entry
 * - responsive score table entry for tablet/laptop/desktop
 * - More sheet for cards/table/summary modes
 * - filter sheet for class, subject, period, readiness, completion
 * - offline-first createLocal/updateLocal/softDeleteLocal saving
 * - ClassSubject -> AssessmentApplicability -> AssessmentStructureItems -> AssessmentEntry
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../../context/account-context";
import { useSettings } from "../../context/settings-context";
import { useActiveBranch } from "../../context/active-branch-context";
import { useActiveMembership } from "../../context/active-membership-context";

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
  type GradingSystem,
  type Organization,
  type Student,
  type StudentEnrollment,
  type Subject,
  type Teacher,
} from "../../lib/db/db";

import { createLocal, updateLocal, softDeleteLocal, listActiveLocal } from "../../lib/sync/syncUtils";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "summary";
type ToastTone = "success" | "error" | "info";
type ReadinessFilter = "all" | "ready" | "missing";
type CompletionFilter = "all" | "complete" | "partial" | "empty";
type ScoreValue = number | "";
type ScoreMap = Record<string, ScoreValue>;

type TenantRow = {
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;
  openedAt?: number;
};

type ClassSubjectOption = {
  id: number;
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;
  organizationId?: number;
  ready: boolean;
  display: string;
};

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
  id: number;
  row: Class;
  name: string;
  code: string;
  subjectCount: number;
  readyCount: number;
  missingCount: number;
  studentCount: number;
};

type ClassSubjectEntryView = {
  id: number;
  option: ClassSubjectOption;
  studentCount: number;
  itemCount: number;
  entered: number;
  expected: number;
  completion: number;
};


const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

const idOf = (v: any) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (v: any) => String(v || "").toLowerCase().trim();
const tableSafe = (name: string) => (db as any)[name];
const scoreKey = (studentId?: number, itemId?: number) => `${studentId || 0}-${itemId || 0}`;

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

export default function AssessmentEntriesPage() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
  const { settings, loading: settingsLoading } = useSettings();
  const { activeSchool, activeSchoolId, activeBranch, activeBranchId, loading: contextLoading } = useActiveBranch();
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

  const { loading, setLoading } = useBackgroundLoader();
  const [saving, setSaving] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [applicabilities, setApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [items, setItems] = useState<AssessmentStructureItem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [gradings, setGradings] = useState<GradingSystem[]>([]);
  const [rules, setRules] = useState<GradeRule[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [classSubjectId, setClassSubjectId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [filterClassId, setFilterClassId] = useState("all");
  const [filterSubjectId, setFilterSubjectId] = useState("all");
  const [filterPeriodId, setFilterPeriodId] = useState("all");
  const [filterReadiness, setFilterReadiness] = useState<ReadinessFilter>("all");
  const [filterCompletion, setFilterCompletion] = useState<CompletionFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scores, setScores] = useState<ScoreMap>({});

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) router.replace("/login");
    else if (!schoolId || !branchId) router.replace("/account");
  }, [accountLoading, contextLoading, authenticated, accountId, schoolId, branchId, router]);

  const sameTenant = (row: TenantRow) =>
    (!row.accountId || row.accountId === accountId) &&
    (!row.schoolId || sameId(row.schoolId, schoolId)) &&
    (!row.branchId || sameId(row.branchId, branchId)) &&
    !row.isDeleted;

  const showToast = (tone: ToastTone, message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast((c) => (c?.message === message ? null : c)), 4200);
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
      const tenant = { accountId, schoolId: Number(schoolId), branchId: Number(branchId) } as any;
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
        listActiveLocal("gradingSystems", tenant),
        listActiveLocal("gradeRules", tenant),
        tableSafe("studentEnrollments")?.toArray?.() || [],
      ]);

      setStudents(
        (studentRows as Student[])
          .filter((r) => sameTenant(r as TenantRow))
          .filter((r: any) => !["withdrawn", "deleted", "archived"].includes(safeLower(r.status)))
          .sort((a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || "")))
      );
      setClasses((classRows as Class[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""))));
      setSubjects((subjectRows as Subject[]).sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""))));
      setTeachers((teacherRows as Teacher[]).sort((a: any, b: any) => String(a.fullName || "").localeCompare(String(b.fullName || ""))));
      setAcademicStructures(academicStructureRows as AcademicStructure[]);
      setPeriods(periodRows as AcademicPeriod[]);
      setOrganizations(organizationRows as Organization[]);
      setCurriculums(curriculumRows as Curriculum[]);
      setPathways(pathwayRows as CurriculumPathway[]);
      setCurriculumSubjects(curriculumSubjectRows as CurriculumSubject[]);
      setClassSubjects((classSubjectRows as ClassSubject[]).filter(isActiveRow));
      setApplicabilities((applicabilityRows as AssessmentApplicability[]).filter(isActiveRow));
      setStructures((structureRows as AssessmentStructure[]).filter(isActiveRow));
      setItems((itemRows as AssessmentStructureItem[]).filter(isActiveRow));
      setEntries((entryRows as AssessmentEntry[]).filter((r) => sameTenant(r as TenantRow) && !r.isDeleted));
      setGradings((gradingRows as GradingSystem[]).filter(isActiveRow));
      setRules((ruleRows as GradeRule[]).filter(isActiveRow));
      setEnrollments((enrollmentRows as StudentEnrollment[]).filter((r) => sameTenant(r as TenantRow) && !r.isDeleted));
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
  }, [authenticated, accountId, schoolId, branchId, accountLoading, settingsLoading, contextLoading,
    dataRevision,
  ]);

  const classMap = useMemo(() => new Map(classes.map((r: any) => [idOf(r.id), r])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((r: any) => [idOf(r.id), r])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((r: any) => [idOf(r.id), r])), [teachers]);
  const academicStructureMap = useMemo(() => new Map(academicStructures.map((r: any) => [idOf(r.id), r])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((r: any) => [idOf(r.id), r])), [periods]);
  const organizationMap = useMemo(() => new Map(organizations.map((r: any) => [idOf(r.id), r])), [organizations]);
  const curriculumSubjectMap = useMemo(() => new Map(curriculumSubjects.map((r: any) => [idOf(r.id), r])), [curriculumSubjects]);
  const curriculumMap = useMemo(() => new Map(curriculums.map((r: any) => [idOf(r.id), r])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((r: any) => [idOf(r.id), r])), [pathways]);

  const applicabilityMap = useMemo(() => {
    const m = new Map<number, AssessmentApplicability>();
    applicabilities.forEach((row: any) => {
      if (idOf(row.classSubjectId) && row.active !== false && !row.isDeleted) m.set(idOf(row.classSubjectId), row);
    });
    return m;
  }, [applicabilities]);

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .map((row: any) => {
        const id = idOf(row.id);
        const cls: any = classMap.get(idOf(row.classId));
        const subj: any = subjectMap.get(idOf(row.subjectId));
        const teacher: any = row.teacherId ? teacherMap.get(idOf(row.teacherId)) : undefined;
        const academicStructure: any = academicStructureMap.get(idOf(row.academicStructureId));
        const period: any = row.academicPeriodId ? periodMap.get(idOf(row.academicPeriodId)) : undefined;
        const curriculumSubject: any = curriculumSubjectMap.get(idOf(row.curriculumSubjectId));
        const curriculum: any = curriculumSubject ? curriculumMap.get(idOf(curriculumSubject.curriculumId)) : undefined;
        const pathway: any = curriculumSubject?.pathwayId ? pathwayMap.get(idOf(curriculumSubject.pathwayId)) : undefined;
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
      .filter((option) => option.id > 0)
      .filter((option) => filterClassId === "all" || sameId(option.row.classId, filterClassId))
      .filter((option) => filterSubjectId === "all" || sameId(option.row.subjectId, filterSubjectId))
      .filter((option) => filterPeriodId === "all" || sameId(option.row.academicPeriodId || 0, filterPeriodId))
      .filter((option) => filterReadiness === "all" || (filterReadiness === "ready" ? option.ready : !option.ready))
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
    filterClassId,
    filterSubjectId,
    filterPeriodId,
    filterReadiness,
  ]);

  const selectedClass = useMemo(() => (selectedClassId ? (classMap.get(idOf(selectedClassId)) as any) : null), [classMap, selectedClassId]);

  const selectedClassSubjectOptions = useMemo(() => {
    if (!selectedClassId) return [];
    return classSubjectOptions.filter((option) => sameId((option.row as any).classId, selectedClassId));
  }, [classSubjectOptions, selectedClassId]);

  const classSubjectEntryViews = useMemo<ClassSubjectEntryView[]>(() => {
    return selectedClassSubjectOptions.map((option) => {
      const app = applicabilityMap.get(option.id) as any;
      const optionItems = app?.assessmentStructureId
        ? items.filter((row: any) => sameId(row.assessmentStructureId, app.assessmentStructureId) && isActiveRow(row))
        : [];
      const periodId = idOf((option.row as any).academicPeriodId);
      const studentCount = enrollments.filter((row: any) => {
        if (!sameId(row.classId, (option.row as any).classId)) return false;
        if (!sameId(row.academicStructureId, (option.row as any).academicStructureId)) return false;
        if (periodId && !sameId(row.academicPeriodId, periodId)) return false;
        return row.status === "active" && !row.isDeleted;
      }).length;
      const expected = studentCount * optionItems.length;
      const entered = entries.filter((entry: any) => {
        if (!sameId(entry.classSubjectId, option.id)) return false;
        if (!app || !sameId(entry.assessmentStructureId || 0, app.assessmentStructureId)) return false;
        return !entry.isDeleted && entry.score !== undefined && entry.score !== null && entry.score !== "";
      }).length;
      const completion = expected ? Math.round((Math.min(entered, expected) / expected) * 100) : 0;
      return { id: option.id, option, studentCount, itemCount: optionItems.length, entered, expected, completion };
    });
  }, [selectedClassSubjectOptions, applicabilityMap, items, enrollments, entries]);

  const classCards = useMemo<ClassEntryView[]>(() => {
    const term = search.trim().toLowerCase();
    return classes
      .filter(isActiveRow)
      .map((classRow: any) => {
        const id = idOf(classRow.id);
        const options = classSubjectOptions.filter((option) => sameId((option.row as any).classId, id));
        const readyCount = options.filter((option) => option.ready).length;
        const studentIds = new Set(
          enrollments
            .filter((row: any) => sameId(row.classId, id) && row.status === "active" && !row.isDeleted)
            .map((row: any) => idOf(row.studentId))
            .filter(Boolean)
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
      .filter((item) => !term || `${item.name} ${item.code} ${item.subjectCount} subjects`.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, classSubjectOptions, enrollments, search]);

  const selectedOption = useMemo(() => {
    const selectedId = idOf(classSubjectId);
    return classSubjectOptions.find((option) => sameId(option.id, selectedId));
  }, [classSubjectOptions, classSubjectId]);

  const currentClassSubject = selectedOption?.row;
  const applicability = useMemo(() => (selectedOption ? applicabilityMap.get(selectedOption.id) : undefined), [applicabilityMap, selectedOption]);
  const assessmentStructure = useMemo(
    () => structures.find((row: any) => sameId(row.id, applicability?.assessmentStructureId)),
    [structures, applicability]
  );
  const gradingSystem = useMemo(
    () => gradings.find((row: any) => sameId(row.id, applicability?.gradingSystemId)),
    [gradings, applicability]
  );
  const structureItems = useMemo(() => {
    if (!applicability?.assessmentStructureId) return [];
    return items
      .filter((row: any) => sameId(row.assessmentStructureId, applicability.assessmentStructureId) && isActiveRow(row))
      .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
  }, [items, applicability]);
  const gradeRules = useMemo(() => {
    if (!gradingSystem?.id) return [];
    return rules
      .filter((row: any) => sameId(row.gradingSystemId, gradingSystem.id) && isActiveRow(row))
      .sort((a: any, b: any) => Number(b.minScore || 0) - Number(a.minScore || 0));
  }, [rules, gradingSystem]);

  const relevantEntries = useMemo(() => {
    if (!currentClassSubject || !applicability) return [];
    const academicPeriodId = idOf((currentClassSubject as any).academicPeriodId);
    return entries.filter((entry: any) => {
      if (!sameId(entry.classSubjectId, (currentClassSubject as any).id)) return false;
      if (!sameId(entry.classId, (currentClassSubject as any).classId)) return false;
      if (!sameId(entry.subjectId, (currentClassSubject as any).subjectId)) return false;
      if (!sameId(entry.academicStructureId || 0, (currentClassSubject as any).academicStructureId)) return false;
      if (!sameId(entry.academicPeriodId || 0, academicPeriodId)) return false;
      if (!sameId(entry.assessmentStructureId || 0, applicability.assessmentStructureId)) return false;
      if (applicability.gradingSystemId && !sameId(entry.gradingSystemId || 0, applicability.gradingSystemId)) return false;
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
      nextScores[scoreKey(idOf(entry.studentId), idOf(entry.assessmentStructureItemId))] = Number(entry.score || 0);
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
          if (!sameId(row.classId, (currentClassSubject as any).classId)) return false;
          if (!sameId(row.academicStructureId, (currentClassSubject as any).academicStructureId)) return false;
          if (periodId && !sameId(row.academicPeriodId, periodId)) return false;
          return row.status === "active";
        });
        return enrollment ? { student, enrollment } : undefined;
      })
      .filter(Boolean) as { student: Student; enrollment: StudentEnrollment }[];
  }, [students, enrollments, currentClassSubject]);

  const existingEntryMap = useMemo(() => {
    const m = new Map<string, AssessmentEntry>();
    relevantEntries.forEach((entry: any) => m.set(scoreKey(idOf(entry.studentId), idOf(entry.assessmentStructureItemId)), entry));
    return m;
  }, [relevantEntries]);

  const studentScoreRows = useMemo<StudentScoreRow[]>(() => {
    return enrolledStudents.map(({ student, enrollment }) => {
      let rawTotal = 0;
      let weightedTotal = 0;
      let maxTotal = 0;
      let rowEntered = 0;

      for (const item of structureItems as any[]) {
        const value = scores[scoreKey(idOf((student as any).id), idOf(item.id))];
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
        (rule: any) => percentage >= Number(rule.minScore || 0) && percentage <= Number(rule.maxScore || 100)
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
      if (filterCompletion !== "all") {
        const entered = item.rowEntered;
        const expected = item.rowExpected;
        if (filterCompletion === "empty" && entered !== 0) return false;
        if (filterCompletion === "partial" && !(entered > 0 && entered < expected)) return false;
        if (filterCompletion === "complete" && !(expected > 0 && entered >= expected)) return false;
      }
      if (!q) return true;
      const s: any = item.student;
      return `${s.fullName || ""} ${s.admissionNumber || ""} ${item.grade || ""} ${item.remark || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [studentScoreRows, search, filterCompletion]);

  const completionStats = useMemo(() => {
    const expected = studentScoreRows.length * structureItems.length;
    let entered = 0;
    studentScoreRows.forEach((row) => (entered += row.rowEntered));
    const completion = expected ? Math.round((entered / expected) * 100) : 0;
    const completeStudents = studentScoreRows.filter((row) => row.rowExpected > 0 && row.rowEntered >= row.rowExpected).length;
    return { expected, entered, completion, completeStudents };
  }, [studentScoreRows, structureItems]);

  const activeFilterCount = useMemo(() => {
    return [filterClassId, filterSubjectId, filterPeriodId, filterReadiness, filterCompletion].filter((v) => v !== "all").length;
  }, [filterClassId, filterSubjectId, filterPeriodId, filterReadiness, filterCompletion]);

  const contextSubtitle = selectedOption
    ? `${selectedOption.className} · ${selectedOption.academicStructureName} · ${selectedOption.academicPeriodName}`
    : activeBranch?.name || "Selected branch";

  const updateScore = (studentId: number, item: AssessmentStructureItem, value: string) => {
    const key = scoreKey(studentId, idOf((item as any).id));
    if (value === "") {
      setScores((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    const num = Number(value);
    if (Number.isNaN(num)) return;
    const sanitized = Math.max(0, Math.min(num, Number((item as any).maxScore || 100)));
    setScores((prev) => ({ ...prev, [key]: sanitized }));
  };

  const startSession = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) return showToast("error", "Sign in and select a school branch first.");
    if (!currentClassSubject) return showToast("error", "Select a class subject first.");
    if (!applicability) return showToast("error", "No assessment applicability is configured for this class subject.");
    if (!structureItems.length) return showToast("error", "The selected assessment structure has no active items.");
    if (!studentScoreRows.length) return showToast("error", "No active student enrollment was found for this class subject.");
    setSessionStarted(true);
    showToast("success", "Score entry session started.");
  };

  const saveEntries = async () => {
    if (!sessionStarted) return showToast("error", "Start the score entry session first.");
    if (!authenticated || !accountId || !schoolId || !branchId) return showToast("error", "Sign in and select a school branch first.");
    if (!currentClassSubject || !applicability) return showToast("error", "Select a valid class subject with assessment applicability.");

    try {
      setSaving(true);
      const academicPeriodId = idOf((currentClassSubject as any).academicPeriodId);
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
            schoolId: Number(schoolId),
            branchId: Number(branchId),
            classSubjectId: idOf((currentClassSubject as any).id),
            organizationId: applicability.organizationId || selectedOption?.organizationId,
            academicStructureId: idOf((currentClassSubject as any).academicStructureId),
            academicPeriodId,
            gradingSystemId: applicability.gradingSystemId,
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

          if (existing?.id) await updateLocal("assessmentEntries", idOf(existing.id), payload as AssessmentEntry);
          else await createLocal("assessmentEntries", payload as AssessmentEntry);
          savedCount += 1;
        }
      }

      await load();
      setSessionStarted(false);
      showToast(
        "success",
        `Saved ${savedCount} score${savedCount === 1 ? "" : "s"}${clearedCount ? ` · cleared ${clearedCount}` : ""}${
          lockedCount ? ` · skipped ${lockedCount} locked` : ""
        }.`
      );
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to save assessment scores.");
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setFilterClassId("all");
    setFilterSubjectId("all");
    setFilterPeriodId("all");
    setFilterReadiness("all");
    setFilterCompletion("all");
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return <State primary={primary} title="Opening Assessment Entries..." text="Checking branch workspace, class subjects, assessment structures, students, and saved scores." />;
  }

  if (!authenticated || !accountId) {
    return <State primary={primary} title="Redirecting to login..." text="You must sign in before entering assessment scores." />;
  }

  if (!schoolId || !branchId) {
    return (
      <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="ae-state">
          <h2>No branch workspace selected</h2>
          <p>Assessment entries belong to one selected branch-admin workspace. Use Select Role again if the wrong branch is active.</p>
          <button type="button" className="ae-state-button" onClick={() => router.push("/account")}>Go to Account Setup</button>
        </section>
      </main>
    );
  }

  return (
    <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      {toast && (
        <section className={`ae-toast ${toast.tone}`}>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} aria-label="Close notification">✕</button>
        </section>
      )}

      <section className="ae-search-card" aria-label="Assessment entry search and actions">
        <label className="ae-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={!selectedClassId ? "Search classes..." : classSubjectId === "all" ? "Search class subjects..." : "Search students..."}
            aria-label="Search assessment entries"
          />
        </label>

        <button type="button" className={`ae-filter-button ${activeFilterCount ? "active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Open filters" title="Filters">
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button type="button" className="ae-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">⋯</button>
      </section>

      {activeFilterCount > 0 && selectedClassId && (
        <section className="ae-filter-chips" aria-label="Active filters">
          {filterSubjectId !== "all" && <button type="button" onClick={() => setFilterSubjectId("all")}>Subject: {(subjectMap.get(idOf(filterSubjectId)) as any)?.name || filterSubjectId} ×</button>}
          {filterPeriodId !== "all" && <button type="button" onClick={() => setFilterPeriodId("all")}>Period: {(periodMap.get(idOf(filterPeriodId)) as any)?.name || filterPeriodId} ×</button>}
          {filterReadiness !== "all" && <button type="button" onClick={() => setFilterReadiness("all")}>{filterReadiness === "ready" ? "Ready only" : "Missing setup"} ×</button>}
          {filterCompletion !== "all" && <button type="button" onClick={() => setFilterCompletion("all")}>Completion: {filterCompletion} ×</button>}
        </section>
      )}

      {!selectedClassId ? (
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
          {!classCards.length && <Empty icon="🏫" title="No classes found" text="Create or sync classes first, then enter assessment scores by class subject." />}
        </section>
      ) : classSubjectId === "all" ? (
        <>
          <section className="ae-filter-chips class-breadcrumb" aria-label="Selected class">
            <button type="button" onClick={() => { setSelectedClassId(""); setFilterClassId("all"); setClassSubjectId("all"); setSearch(""); }}>← Classes</button>
            <button type="button" onClick={() => setFilterOpen(true)}>{(selectedClass as any)?.name || "Selected class"} · {selectedClassSubjectOptions.length} class subject(s)</button>
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
            {!classSubjectEntryViews.length && <Empty icon="📝" title="No class subjects" text="This class has no class subjects matching the current filters." />}
          </section>
        </>
      ) : (
        <>
          <section className="ae-filter-chips class-breadcrumb" aria-label="Selected class subject">
            <button type="button" onClick={() => { setClassSubjectId("all"); setSessionStarted(false); setSearch(""); }}>← Class subjects</button>
            <button type="button" onClick={() => setFilterOpen(true)}>{selectedOption?.className || "Class"} · {selectedOption?.subjectName || "Subject"}</button>
          </section>

          {selectedOption && (
            <section className="ae-session-strip">
              <span className={`ae-status-dot ${applicability ? "green" : "orange"}`} />
              <div>
                <strong>{selectedOption.subjectName}</strong>
                <small>{contextSubtitle} · {selectedOption.teacherName}</small>
              </div>
              <button type="button" onClick={startSession}>{sessionStarted ? "Active" : "Start"}</button>
              <button type="button" className="primary" onClick={saveEntries} disabled={!sessionStarted || saving}>{saving ? "Saving" : "Save"}</button>
            </section>
          )}

          {selectedOption && (
            <section className="ae-compact-meta">
              {applicability ? <Chip tone="green">Ready</Chip> : <Chip tone="red">No applicability</Chip>}
              {assessmentStructure && <Chip tone="blue">{assessmentStructure.name}</Chip>}
              {gradingSystem && <Chip tone="purple">{gradingSystem.name}</Chip>}
              <Chip tone="gray">{studentScoreRows.length} students</Chip>
              <Chip tone="gray">{structureItems.length} items</Chip>
              <Chip tone="orange">{completionStats.entered}/{completionStats.expected} entered</Chip>
            </section>
          )}

          {classSubjectId !== "all" && !applicability && <Empty icon="⚠️" title="No assessment applicability" text="Go to Assessment Applicability and connect this class subject to an assessment structure and grading system first." />}
          {applicability && !structureItems.length && <Empty icon="🧩" title="No assessment items" text="The selected assessment structure has no active items to enter." />}
          {selectedOption && applicability && !!structureItems.length && !studentScoreRows.length && <Empty icon="🎓" title="No enrolled students" text="No active student enrollment was found for this class subject, class, academic structure, and period." />}

          {selectedOption && applicability && !!structureItems.length && !!studentScoreRows.length && viewMode === "summary" && (
            <SummaryView rows={studentScoreRows} completion={completionStats} structureItems={structureItems} classSubjectOptions={classSubjectOptions} />
          )}

          {selectedOption && applicability && !!structureItems.length && !!studentScoreRows.length && viewMode === "table" && (
            <ScoreTable rows={filteredRows} items={structureItems} scores={scores} updateScore={updateScore} />
          )}

          {selectedOption && applicability && !!structureItems.length && !!studentScoreRows.length && viewMode === "cards" && (
            <section className="ae-list ae-entry-list">
              {filteredRows.map((row) => (
                <StudentScoreCard key={String((row.student as any).id)} row={row} items={structureItems} scores={scores} updateScore={updateScore} />
              ))}
              {!filteredRows.length && <Empty icon="🔎" title="No student matches" text="Change your search or completion filter to see students." />}
            </section>
          )}
        </>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          subjects={subjects}
          periods={periods}
          filterClassId={filterClassId}
          filterSubjectId={filterSubjectId}
          filterPeriodId={filterPeriodId}
          filterReadiness={filterReadiness}
          filterCompletion={filterCompletion}
          setFilterClassId={setFilterClassId}
          setFilterSubjectId={setFilterSubjectId}
          setFilterPeriodId={setFilterPeriodId}
          setFilterReadiness={setFilterReadiness}
          setFilterCompletion={setFilterCompletion}
          clearFilters={clearFilters}
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
          onRefresh={async () => {
            setMoreOpen(false);
            await load();
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );
}


function ClassPickerRow({ item, onOpen }: { item: ClassEntryView; onOpen: () => void }) {
  return (
    <button type="button" className="student-row assessment-row" onClick={onOpen}>
      <span className="app-icon">🏫</span>
      <span className="student-main">
        <strong>{item.name}</strong>
        <small>{item.subjectCount} class subject(s) · {item.studentCount} active student(s)</small>
        <em>{item.missingCount ? `${item.missingCount} missing setup` : "All class subjects ready"}</em>
      </span>
      <span className="student-side">
        <span className={`status-dot-mini ${item.missingCount ? "orange" : "green"}`} />
        <i>›</i>
      </span>
    </button>
  );
}

function ClassSubjectPickerRow({ item, onOpen }: { item: ClassSubjectEntryView; onOpen: () => void }) {
  const ready = item.option.ready && item.itemCount > 0;
  return (
    <button type="button" className="student-row assessment-row" onClick={onOpen}>
      <span className="app-icon">📝</span>
      <span className="student-main">
        <strong>{item.option.subjectName}</strong>
        <small>{item.option.teacherName} · {item.option.academicPeriodName}</small>
        <em>{ready ? `${item.studentCount} students · ${item.itemCount} items · ${item.completion}% done` : "Needs applicability or assessment items"}</em>
      </span>
      <span className="student-side">
        <span className={`status-dot-mini ${ready ? (item.completion >= 100 ? "green" : "orange") : "red"}`} />
        <i>›</i>
      </span>
    </button>
  );
}

function State({ primary, title, text }: { primary: string; title: string; text: string }) {
  return (
    <main className="ae-page" style={{ "--ae-primary": primary } as React.CSSProperties}>
      <style>{css}</style>
      <section className="ae-state">
        <div className="ae-spinner" />
        <h2>{title}</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

function SummaryPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="ae-empty">
      <div className="ae-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function ScoreInput({
  studentId,
  item,
  scores,
  updateScore,
}: {
  studentId: number;
  item: AssessmentStructureItem;
  scores: ScoreMap;
  updateScore: (studentId: number, item: AssessmentStructureItem, value: string) => void;
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

function StudentScoreCard({
  row,
  items,
  scores,
  updateScore,
}: {
  row: StudentScoreRow;
  items: AssessmentStructureItem[];
  scores: ScoreMap;
  updateScore: (studentId: number, item: AssessmentStructureItem, value: string) => void;
}) {
  const student: any = row.student;
  const studentId = idOf(student.id);
  const complete = row.rowExpected > 0 && row.rowEntered >= row.rowExpected;

  return (
    <article className="ae-score-card">
      <div className="ae-score-head">
        <div>
          <strong>{student.fullName || "Unnamed student"}</strong>
          <span>{student.admissionNumber || "No admission number"}</span>
        </div>
        <i className={complete ? "done" : row.rowEntered ? "partial" : "empty"}>{complete ? "Done" : row.rowEntered ? "Partial" : "Empty"}</i>
      </div>

      <div className="ae-score-grid">
        {items.map((item: any) => (
          <label key={String(item.id)}>
            <span>{item.name}</span>
            <small>Max {Number(item.maxScore || 100)} · Weight {Number(item.weight || 0)}</small>
            <ScoreInput studentId={studentId} item={item} scores={scores} updateScore={updateScore} />
          </label>
        ))}
      </div>

      <div className="ae-result-row">
        <span>Total: <b>{row.weightedTotal}</b></span>
        <span>Grade: <b>{row.grade || "—"}</b></span>
        <span>{row.remark || "No remark"}</span>
      </div>
    </article>
  );
}

function ScoreTable({
  rows,
  items,
  scores,
  updateScore,
}: {
  rows: StudentScoreRow[];
  items: AssessmentStructureItem[];
  scores: ScoreMap;
  updateScore: (studentId: number, item: AssessmentStructureItem, value: string) => void;
}) {
  return (
    <section className="ae-table-card">
      <div className="ae-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Students ({rows.length})</th>
              {items.map((item: any) => <th key={String(item.id)}>{item.name}<span>/{Number(item.maxScore || 100)}</span></th>)}
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
                  <td><strong>{student.fullName || "Unnamed student"}</strong><span>{student.admissionNumber || "—"}</span></td>
                  {items.map((item: any) => (
                    <td key={String(item.id)}><ScoreInput studentId={studentId} item={item} scores={scores} updateScore={updateScore} /></td>
                  ))}
                  <td><b>{row.weightedTotal}</b></td>
                  <td>{row.grade || "—"}</td>
                  <td>{row.remark || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="ae-empty-table">No student matches your filters.</div>}
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
  completion: { expected: number; entered: number; completion: number; completeStudents: number };
  structureItems: AssessmentStructureItem[];
  classSubjectOptions: ClassSubjectOption[];
}) {
  const gradeCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.grade || "Ungraded", (map.get(row.grade || "Ungraded") || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <section className="ae-analysis-grid">
      <article className="ae-analysis ae-current-filter"><span>Completion</span><strong>{completion.completion}%</strong><p>{completion.entered} of {completion.expected} expected score cells entered.</p></article>
      <article className="ae-analysis ae-current-filter"><span>Complete Students</span><strong>{completion.completeStudents}</strong><p>Students with every active assessment item entered.</p></article>
      <article className="ae-analysis ae-current-filter"><span>Assessment Items</span><strong>{structureItems.length}</strong><p>Active score components in the selected assessment structure.</p></article>
      <article className="ae-analysis ae-current-filter"><span>Class Subjects</span><strong>{classSubjectOptions.length}</strong><p>Class subjects currently matching your filters.</p></article>
      <article className="ae-analysis ae-wide"><span>Grade Distribution</span>{gradeCounts.map(([grade, count]) => <p key={grade}><b>{grade}</b> — {count}</p>)}</article>
    </section>
  );
}

function FilterSheet({
  classes,
  subjects,
  periods,
  filterClassId,
  filterSubjectId,
  filterPeriodId,
  filterReadiness,
  filterCompletion,
  setFilterClassId,
  setFilterSubjectId,
  setFilterPeriodId,
  setFilterReadiness,
  setFilterCompletion,
  clearFilters,
  onClose,
}: {
  classes: Class[];
  subjects: Subject[];
  periods: AcademicPeriod[];
  filterClassId: string;
  filterSubjectId: string;
  filterPeriodId: string;
  filterReadiness: ReadinessFilter;
  filterCompletion: CompletionFilter;
  setFilterClassId: (value: string) => void;
  setFilterSubjectId: (value: string) => void;
  setFilterPeriodId: (value: string) => void;
  setFilterReadiness: (value: ReadinessFilter) => void;
  setFilterCompletion: (value: CompletionFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ae-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ae-sheet">
        <div className="ae-sheet-head"><div><h2>Filters</h2><p>Narrow class subjects and score completion.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <div className="ae-form-grid">
          <label><span>Class</span><select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}><option value="all">All classes</option>{classes.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Subject</span><select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value)}><option value="all">All subjects</option>{subjects.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Academic Period</span><select value={filterPeriodId} onChange={(e) => setFilterPeriodId(e.target.value)}><option value="all">All periods</option>{periods.map((row: any) => <option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}</select></label>
          <label><span>Setup Status</span><select value={filterReadiness} onChange={(e) => setFilterReadiness(e.target.value as ReadinessFilter)}><option value="all">All</option><option value="ready">Applicability ready</option><option value="missing">Missing applicability</option></select></label>
          <label><span>Score Completion</span><select value={filterCompletion} onChange={(e) => setFilterCompletion(e.target.value as CompletionFilter)}><option value="all">All</option><option value="empty">Empty</option><option value="partial">Partial</option><option value="complete">Complete</option></select></label>
        </div>
        <div className="ae-sheet-actions"><button type="button" onClick={clearFilters}>Clear</button><button type="button" className="ae-primary" onClick={onClose}>Apply</button></div>
      </section>
    </div>
  );
}

function MoreSheet({
  viewMode,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ae-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ae-sheet ae-more-sheet">
        <div className="ae-sheet-head"><div><h2>More</h2><p>Change how you enter and review scores.</p></div><button type="button" onClick={onClose}>✕</button></div>
        <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Card entry <span>Best for phones</span></button>
        <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>Table entry <span>Best for laptop/tablet</span></button>
        <button type="button" className={viewMode === "summary" ? "active" : ""} onClick={() => setViewMode("summary")}>Summary <span>Completion and grade overview</span></button>
        <button type="button" onClick={onRefresh}>Refresh data <span>Reload records from IndexedDB</span></button>
      </section>
    </div>
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
.ae-table-card{max-width:1180px;margin:0 auto;border-radius:20px;overflow:hidden}.ae-table-scroll{overflow:auto;max-height:72dvh}table{width:100%;border-collapse:separate;border-spacing:0;min-width:760px}th,td{border-bottom:1px solid var(--ae-border);padding:8px 9px;text-align:left;vertical-align:middle;font-size:12.5px}th{position:sticky;top:0;background:var(--ae-card);z-index:1;color:var(--ae-muted);font-size:10.5px;text-transform:uppercase}th span,td span{display:block;color:var(--ae-muted);font-size:10.5px;margin-top:1px}td .ae-score-input{min-width:84px}.ae-empty-table{padding:18px;color:var(--ae-muted);text-align:center}
.ae-empty,.ae-state{max-width:720px;margin:10px auto;border-radius:22px;padding:22px;text-align:center}.ae-empty-icon{font-size:28px}.ae-empty h3,.ae-state h2{margin:7px 0 4px}.ae-empty p,.ae-state p{margin:0;color:var(--ae-muted);font-size:13px}.ae-spinner{width:30px;height:30px;border:3px solid rgba(148,163,184,.35);border-top-color:var(--ae-primary);border-radius:999px;margin:0 auto 10px;animation:ae-spin 1s linear infinite}.ae-state-button{margin-top:12px;border:1px solid transparent;border-radius:14px;padding:10px 12px;font-weight:950;background:var(--ae-primary);color:#fff}
.ae-analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:1180px;margin:0 auto}.ae-analysis{border-radius:18px;padding:12px}.ae-analysis span{display:block;color:var(--ae-muted);font-size:11.5px;font-weight:950}.ae-analysis strong{font-size:26px}.ae-analysis p{margin:5px 0 0;color:var(--ae-muted);font-size:12.5px}.ae-analysis.ae-wide{grid-column:1/-1}.ae-analysis.ae-wide p{display:flex;justify-content:space-between;border-top:1px solid var(--ae-border);padding-top:7px}
.ae-sheet-backdrop{position:fixed;inset:0;z-index:50;background:rgba(15,23,42,.48);display:flex;align-items:flex-end;justify-content:center;padding:12px}.ae-sheet{width:min(680px,100%);max-height:88dvh;overflow:auto;border-radius:26px;padding:14px}.ae-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.ae-sheet-head h2{margin:0}.ae-sheet-head p{margin:2px 0 0;color:var(--ae-muted);font-size:13px}.ae-sheet-head button{border:1px solid var(--ae-border);background:var(--ae-card);border-radius:12px;width:36px;height:36px;color:var(--ae-text)}.ae-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ae-form-grid label{display:grid;gap:5px;font-size:12px;color:var(--ae-muted);font-weight:850}.ae-sheet-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--ae-border);padding-top:12px;margin-top:12px}.ae-sheet-actions button{border:1px solid var(--ae-border);border-radius:14px;padding:10px 12px;background:var(--ae-card);color:var(--ae-text);font-weight:950}.ae-sheet-actions .ae-primary{background:var(--ae-primary);color:#fff;border-color:transparent}.ae-more-sheet{display:grid;gap:8px}.ae-more-sheet .ae-sheet-head{margin-bottom:4px}.ae-more-sheet>button{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;text-align:left;border:1px solid var(--ae-border);background:var(--ae-card);color:var(--ae-text);border-radius:16px;padding:11px;font-weight:950}.ae-more-sheet>button span:first-child{grid-row:1/3;font-size:18px}.ae-more-sheet>button small{display:block;color:var(--ae-muted);font-size:11.5px;font-weight:700}.ae-more-sheet>button.active{border-color:var(--ae-primary);color:var(--ae-primary);background:color-mix(in srgb,var(--ae-primary) 7%,var(--ae-card))}
.ae-toast{position:fixed;z-index:80;left:12px;right:12px;bottom:12px;max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:18px;padding:12px 14px;color:#fff;box-shadow:0 18px 40px rgba(15,23,42,.28);font-weight:850}.ae-toast.success{background:#16a34a}.ae-toast.error{background:#dc2626}.ae-toast.info{background:#2563eb}.ae-toast button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:10px;width:30px;height:30px}
@media (min-width:760px){.ae-page{padding:14px}.ae-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ae-score-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ae-sheet-backdrop{align-items:center}.ae-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (min-width:1120px){.ae-list.ae-entry-list{grid-template-columns:repeat(3,minmax(0,1fr))}.ae-list.ae-picker-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ae-score-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.ae-page{padding:7px}.ae-search-card{border-radius:18px}.ae-session-strip{grid-template-columns:auto 1fr auto auto}.ae-session-strip button{padding:8px 9px}.ae-score-grid,.ae-form-grid{grid-template-columns:1fr}th,td{padding:7px}.ae-sheet{border-radius:22px}.ae-analysis-grid{grid-template-columns:1fr}}
`;
