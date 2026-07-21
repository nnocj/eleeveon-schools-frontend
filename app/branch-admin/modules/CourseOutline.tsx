"use client";

/**
 * app/branch-admin/modules/CourseOutline.tsx
 * Eleeveon Course Outline V2.
 * Branch-scoped, offline-first, read-only delivery map.
 *
 * Workspace-session aligned:
 * - reads the selected workspace session written by /select-role first
 * - falls back to ActiveMembershipProvider, then ActiveBranchContext/settings
 * - prevents this branch-admin academic setup page from accidentally using stale
 *   school/branch context left behind by another role or portal
 * - all reads and writes now use the resolved workspace schoolId and branchId
 *
 * Data behavior intentionally preserved and clarified:
 * - This module does NOT create a separate courseOutlines table.
 * - Course outlines are projected from classSubjects + curriculumSubjects.
 * - Curriculum, pathway, class, subject, teacher, academic period and assessment readiness
 *   are resolved visually into one delivery map.
 * - No createLocal/updateLocal/softDeleteLocal is used because this page is a generated view.
 *
 * Golden UI upgrade:
 * - Removed the large duplicate hero/header block.
 * - Uses compact search + filter + more strip like Students.tsx.
 * - Filters moved into a bottom sheet to save vertical space.
 * - Table and analytics moved under More so the default page stays clean.
 * - Table header uses theme variables for dark-mode visibility.
 * - Table rows create a clear visual connection between Course/Subject, Class,
 *   Curriculum/Pathway, Teacher and Assessment readiness.
 * - Desktop card view uses dense multi-column cards with a sticky outline detail panel.
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
  type Class,
  type ClassSubject,
  type Curriculum,
  type CurriculumPathway,
  type CurriculumSubject,
  type Subject,
  type Teacher,
} from "../../lib/db/db";

import { useDataRevision } from "../../hooks/useDataRevision";
import { useBackgroundLoader } from "../../hooks/useBackgroundLoader";
type ViewMode = "cards" | "table" | "summary";
type ReadinessFilter =
  | "all"
  | "ready"
  | "incomplete"
  | "locked"
  | "inactive"
  | "unassigned";

type TenantRow = {
  accountId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  isDeleted?: boolean;
  active?: boolean;
  status?: string;
};

type CourseOutlineView = {
  id: string;
  classSubject: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  teacherPhoto: string;
  curriculumName: string;
  pathwayName: string;
  academicStructureName: string;
  academicPeriodName: string;
  type: string;
  credits?: number;
  contactHours?: number;
  minimumPassScore?: number;
  assessmentConfigured: boolean;
  activeApplicability?: AssessmentApplicability;
  applicabilityCount: number;
  statusLabel: "Ready" | "Needs Assessment Setup" | "Locked" | "Inactive";
};

const idOf = (value: any): string => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const OPEN_WORKSPACE_KEY = "eleeveon_open_workspace";

type OpenWorkspaceSession = {
  membership?: Record<string, any> | null;
  membershipId?: string | null;
  role?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  memberName?: string | null;
  fullName?: string | null;
  userName?: string | null;
  openedAt?: number;
};

function safeStorageRead(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return (
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    );
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

function firstPermanentId(...values: unknown[]): string {
  for (const value of values) {
    const parsed = idOf(value);
    if (parsed) return parsed;
  }

  return "";
}

function selectedWorkspaceSchoolId(args: {
  openWorkspace?: OpenWorkspaceSession | null;
  activeMembership?: Record<string, any> | null;
  activeSchoolId?: unknown;
  activeSchool?: Record<string, any> | null;
  settings?: Record<string, any> | null;
}) {
  const storedMembership = readStoredActiveMembership();
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstPermanentId(
    args.openWorkspace?.schoolId,
    membership?.schoolId,
    membership?.school?.id,
    args.activeSchoolId,
    args.activeSchool?.id,
    args.settings?.schoolId,
    safeStorageRead("activeSchoolId"),
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
  const membership =
    args.openWorkspace?.membership ||
    args.activeMembership ||
    storedMembership ||
    null;

  return firstPermanentId(
    args.openWorkspace?.branchId,
    membership?.branchId,
    membership?.schoolBranchId,
    membership?.branch?.id,
    args.activeBranchId,
    args.activeBranch?.id,
    args.settings?.branchId,
    safeStorageRead("activeBranchId"),
  );
}

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");
const safeLower = (value: any) =>
  String(value || "")
    .toLowerCase()
    .trim();
const tableSafe = (name: string) => (db as any)[name];

const isActiveRow = (row: any) => {
  const status = safeLower(row?.status);
  if (row?.isDeleted) return false;
  if (row?.active === false) return false;
  if (["inactive", "deleted", "archived", "suspended"].includes(status))
    return false;
  return true;
};

const timeText = (value?: string | number | null) => {
  if (!value) return "Not set";
  const time = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return "Not set";
  }
};

function Chip({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple";
}) {
  return <span className={`ba-chip ${tone}`}>{children}</span>;
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
    <section className="ba-empty">
      <div className="ba-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <b>{value}</b>
      {label}
    </span>
  );
}

function Avatar({
  name,
  photo,
  primary,
}: {
  name: string;
  photo?: string;
  primary: string;
}) {
  return (
    <div
      className="ba-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(15,23,42,.9))`,
      }}
    >
      {!photo &&
        String(name || "CO")
          .slice(0, 2)
          .toUpperCase()}
    </div>
  );
}

function statusTone(status: string): "green" | "red" | "orange" | "gray" {
  if (status === "Ready") return "green";
  if (status === "Locked") return "orange";
  if (status === "Inactive") return "red";
  return "gray";
}

function typeTone(type: string): "green" | "orange" | "purple" {
  if (type === "elective") return "orange";
  if (type === "optional") return "purple";
  return "green";
}

export default function CourseOutline() {
  const dataRevision = useDataRevision();

  const router = useRouter();
  const { accountId, authenticated, loading: accountLoading } = useAccount();
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

  const { loading, setLoading } = useBackgroundLoader();
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<
    CurriculumSubject[]
  >([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<
    AcademicStructure[]
  >([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [assessmentApplicabilities, setAssessmentApplicabilities] = useState<
    AssessmentApplicability[]
  >([]);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterCurriculumId, setFilterCurriculumId] = useState("");
  const [filterPeriodId, setFilterPeriodId] = useState("");
  const [filterReadiness, setFilterReadiness] =
    useState<ReadinessFilter>("all");
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<
    string | undefined
  >();

  useEffect(() => {
    if (accountLoading || contextLoading) return;
    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }
    // Missing branch workspace is handled locally so the selected-role flow is not broken.
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

  const clearData = () => {
    setClassSubjects([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setPathways([]);
    setSubjects([]);
    setClasses([]);
    setTeachers([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setAssessmentApplicabilities([]);
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
        classSubjectRows,
        curriculumSubjectRows,
        curriculumRows,
        pathwayRows,
        subjectRows,
        classRows,
        teacherRows,
        structureRows,
        periodRows,
        applicabilityRows,
      ] = await Promise.all([
        tableSafe("classSubjects")?.toArray?.() || [],
        tableSafe("curriculumSubjects")?.toArray?.() || [],
        tableSafe("curriculums")?.toArray?.() || [],
        tableSafe("curriculumPathways")?.toArray?.() || [],
        tableSafe("subjects")?.toArray?.() || [],
        tableSafe("classes")?.toArray?.() || [],
        tableSafe("teachers")?.toArray?.() || [],
        tableSafe("academicStructures")?.toArray?.() || [],
        tableSafe("academicPeriods")?.toArray?.() || [],
        tableSafe("assessmentApplicabilities")?.toArray?.() || [],
      ]);

      setClassSubjects(
        (classSubjectRows as ClassSubject[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
      setCurriculumSubjects(
        (curriculumSubjectRows as CurriculumSubject[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort(
            (a: any, b: any) =>
              Number(a.orderIndex || 0) - Number(b.orderIndex || 0),
          ),
      );
      setCurriculums(
        (curriculumRows as Curriculum[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setPathways(
        (pathwayRows as CurriculumPathway[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setSubjects(
        (subjectRows as Subject[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setClasses(
        (classRows as Class[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setTeachers(
        (teacherRows as Teacher[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.fullName || "").localeCompare(String(b.fullName || "")),
          ),
      );
      setAcademicStructures(
        (structureRows as AcademicStructure[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort((a: any, b: any) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          ),
      );
      setAcademicPeriods(
        (periodRows as AcademicPeriod[])
          .filter((row) => sameTenant(row as TenantRow) && isActiveRow(row))
          .sort(
            (a: any, b: any) => Number(a.order || 0) - Number(b.order || 0),
          ),
      );
      setAssessmentApplicabilities(
        (applicabilityRows as AssessmentApplicability[]).filter((row) =>
          sameTenant(row as TenantRow),
        ),
      );
    } catch (error) {
      console.error("Failed to load course outline:", error);
      clearData();
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
    () => new Map(classes.map((row: any) => [idOf(row.id), row])),
    [classes],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((row: any) => [idOf(row.id), row])),
    [subjects],
  );
  const teacherMap = useMemo(
    () => new Map(teachers.map((row: any) => [idOf(row.id), row])),
    [teachers],
  );
  const structureMap = useMemo(
    () => new Map(academicStructures.map((row: any) => [idOf(row.id), row])),
    [academicStructures],
  );
  const periodMap = useMemo(
    () => new Map(academicPeriods.map((row: any) => [idOf(row.id), row])),
    [academicPeriods],
  );
  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((row: any) => [idOf(row.id), row])),
    [curriculumSubjects],
  );
  const curriculumMap = useMemo(
    () => new Map(curriculums.map((row: any) => [idOf(row.id), row])),
    [curriculums],
  );
  const pathwayMap = useMemo(
    () => new Map(pathways.map((row: any) => [idOf(row.id), row])),
    [pathways],
  );

  const applicabilityByClassSubject = useMemo(() => {
    const map = new Map<string, AssessmentApplicability[]>();
    assessmentApplicabilities.forEach((row: any) => {
      const id = idOf(row.classSubjectId);
      if (!id) return;
      const list = map.get(id) || [];
      list.push(row);
      map.set(id, list);
    });
    return map;
  }, [assessmentApplicabilities]);

  const outlineRows = useMemo<CourseOutlineView[]>(() => {
    return classSubjects.map((classSubject: any) => {
      const classRow: any = classMap.get(idOf(classSubject.classId));
      const subject: any = subjectMap.get(idOf(classSubject.subjectId));
      const teacher: any = classSubject.teacherId
        ? teacherMap.get(idOf(classSubject.teacherId))
        : undefined;
      const structure: any = structureMap.get(
        idOf(classSubject.academicStructureId),
      );
      const period: any = classSubject.academicPeriodId
        ? periodMap.get(idOf(classSubject.academicPeriodId))
        : undefined;
      const curriculumSubject: any = curriculumSubjectMap.get(
        idOf(classSubject.curriculumSubjectId),
      );
      const curriculum: any = curriculumSubject
        ? curriculumMap.get(idOf(curriculumSubject.curriculumId))
        : undefined;
      const pathway: any = curriculumSubject?.pathwayId
        ? pathwayMap.get(idOf(curriculumSubject.pathwayId))
        : undefined;
      const applicability = idOf(classSubject.id)
        ? applicabilityByClassSubject.get(idOf(classSubject.id)) || []
        : [];
      const activeApplicability = applicability.find(
        (row: any) => row.active !== false,
      );
      const assessmentConfigured = !!activeApplicability;
      const credits = classSubject.credits ?? curriculumSubject?.credits;
      const contactHours =
        classSubject.contactHours ?? curriculumSubject?.contactHours;
      const type = classSubject.type || curriculumSubject?.type || "core";
      const statusLabel: CourseOutlineView["statusLabel"] = classSubject.locked
        ? "Locked"
        : classSubject.active === false
          ? "Inactive"
          : assessmentConfigured
            ? "Ready"
            : "Needs Assessment Setup";

      return {
        id: idOf(classSubject.id),
        classSubject,
        className: classRow?.name || `Class #${classSubject.classId || "-"}`,
        subjectName:
          classSubject.name ||
          subject?.name ||
          `Subject #${classSubject.subjectId || "-"}`,
        subjectCode: classSubject.code || subject?.code || "",
        teacherName: teacher?.fullName || "No teacher assigned",
        teacherPhoto: teacher?.photo || "",
        curriculumName: curriculum?.name || "Unknown curriculum",
        pathwayName: pathway?.name || "No pathway",
        academicStructureName: structure?.name || "Unknown academic structure",
        academicPeriodName: period?.name || "All / No period selected",
        type,
        credits,
        contactHours,
        minimumPassScore: curriculumSubject?.minimumPassScore,
        assessmentConfigured,
        activeApplicability,
        applicabilityCount: applicability.length,
        statusLabel,
      };
    });
  }, [
    applicabilityByClassSubject,
    classMap,
    classSubjects,
    curriculumMap,
    curriculumSubjectMap,
    pathwayMap,
    periodMap,
    structureMap,
    subjectMap,
    teacherMap,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return outlineRows
      .filter((item) => {
        const row: any = item.classSubject;
        if (filterClassId && !sameId(row.classId, filterClassId)) return false;
        if (filterSubjectId && !sameId(row.subjectId, filterSubjectId))
          return false;
        if (filterTeacherId && !sameId(row.teacherId, filterTeacherId))
          return false;
        if (filterPeriodId && !sameId(row.academicPeriodId, filterPeriodId))
          return false;
        if (filterCurriculumId) {
          const curriculumSubject: any = curriculumSubjectMap.get(
            idOf(row.curriculumSubjectId),
          );
          if (!sameId(curriculumSubject?.curriculumId, filterCurriculumId))
            return false;
        }
        if (filterReadiness === "ready" && !item.assessmentConfigured)
          return false;
        if (filterReadiness === "incomplete" && item.assessmentConfigured)
          return false;
        if (filterReadiness === "locked" && !row.locked) return false;
        if (filterReadiness === "inactive" && row.active !== false)
          return false;
        if (filterReadiness === "unassigned" && !!row.teacherId) return false;
        if (!query) return true;
        return `${item.className} ${item.subjectName} ${item.subjectCode} ${item.teacherName} ${item.curriculumName} ${item.pathwayName} ${item.academicStructureName} ${item.academicPeriodName} ${item.type} ${item.statusLabel}`
          .toLowerCase()
          .includes(query);
      })
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          a.subjectName.localeCompare(b.subjectName),
      );
  }, [
    curriculumSubjectMap,
    filterClassId,
    filterCurriculumId,
    filterPeriodId,
    filterReadiness,
    filterSubjectId,
    filterTeacherId,
    outlineRows,
    search,
  ]);

  const selectedOutline = useMemo(
    () =>
      filteredRows.find((row) => row.id === selectedClassSubjectId) ||
      filteredRows[0] ||
      outlineRows[0],
    [filteredRows, outlineRows, selectedClassSubjectId],
  );

  const summary = useMemo(
    () => ({
      total: outlineRows.length,
      ready: outlineRows.filter((row) => row.assessmentConfigured).length,
      incomplete: outlineRows.filter((row) => !row.assessmentConfigured).length,
      withTeachers: outlineRows.filter(
        (row) => !!(row.classSubject as any).teacherId,
      ).length,
      locked: outlineRows.filter((row) => (row.classSubject as any).locked)
        .length,
      showing: filteredRows.length,
    }),
    [filteredRows.length, outlineRows],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filterClassId,
        filterSubjectId,
        filterTeacherId,
        filterCurriculumId,
        filterPeriodId,
        filterReadiness === "all" ? "" : filterReadiness,
      ].filter(Boolean).length,
    [
      filterClassId,
      filterCurriculumId,
      filterPeriodId,
      filterReadiness,
      filterSubjectId,
      filterTeacherId,
    ],
  );

  const countsByStatus = useMemo(
    () => groupedCounts(outlineRows, (row) => row.statusLabel),
    [outlineRows],
  );
  const countsByClass = useMemo(
    () => groupedCounts(outlineRows, (row) => row.className),
    [outlineRows],
  );
  const countsByCurriculum = useMemo(
    () => groupedCounts(outlineRows, (row) => row.curriculumName),
    [outlineRows],
  );
  const countsByTeacher = useMemo(
    () => groupedCounts(outlineRows, (row) => row.teacherName),
    [outlineRows],
  );

  const clearFilters = () => {
    setFilterClassId("");
    setFilterSubjectId("");
    setFilterTeacherId("");
    setFilterCurriculumId("");
    setFilterPeriodId("");
    setFilterReadiness("all");
  };

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <State
        primary={primary}
        title="Opening Course Outlines..."
        text="Checking account, branch, class subjects, curriculum, teachers, and assessment readiness."
      />
    );
  }

  if (!authenticated || !accountId) {
    return (
      <State
        primary={primary}
        title="Redirecting to login..."
        text="You must sign in before viewing course outlines."
      />
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main
        className="ba-page"
        style={{ "--ba-primary": primary } as React.CSSProperties}
      >
        <style>{css}</style>
        <section className="ba-state">
          <h2>Select a branch first</h2>
          <p>
            Course outlines are generated from class subjects inside one active
            branch.
          </p>
          <button
            type="button"
            className="ba-state-button"
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
      className="ba-page"
      style={{ "--ba-primary": primary } as React.CSSProperties}
    >
      <style>{css}</style>

      <section
        className="ba-search-card"
        aria-label="Course outline search and actions"
      >
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search course outlines..."
            aria-label="Search course outlines"
          />
        </label>

        <button
          type="button"
          className={`ba-filter-button ${activeFilterCount ? "active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Open filters"
          title="Filters"
        >
          <SliderIcon />
          {activeFilterCount ? <b>{activeFilterCount}</b> : null}
        </button>

        <button
          type="button"
          className="ba-icon-button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
        >
          ⋯
        </button>
      </section>

      {activeFilterCount > 0 && (
        <section className="ba-filter-chips" aria-label="Active filters">
          {filterClassId && (
            <button type="button" onClick={() => setFilterClassId("")}>
              Class:{" "}
              {(classMap.get(idOf(filterClassId)) as any)?.name ||
                filterClassId}{" "}
              ×
            </button>
          )}
          {filterSubjectId && (
            <button type="button" onClick={() => setFilterSubjectId("")}>
              Subject:{" "}
              {(subjectMap.get(idOf(filterSubjectId)) as any)?.name ||
                filterSubjectId}{" "}
              ×
            </button>
          )}
          {filterTeacherId && (
            <button type="button" onClick={() => setFilterTeacherId("")}>
              Teacher:{" "}
              {(teacherMap.get(idOf(filterTeacherId)) as any)?.fullName ||
                filterTeacherId}{" "}
              ×
            </button>
          )}
          {filterCurriculumId && (
            <button type="button" onClick={() => setFilterCurriculumId("")}>
              Curriculum:{" "}
              {(curriculumMap.get(idOf(filterCurriculumId)) as any)?.name ||
                filterCurriculumId}{" "}
              ×
            </button>
          )}
          {filterPeriodId && (
            <button type="button" onClick={() => setFilterPeriodId("")}>
              Period:{" "}
              {(periodMap.get(idOf(filterPeriodId)) as any)?.name ||
                filterPeriodId}{" "}
              ×
            </button>
          )}
          {filterReadiness !== "all" && (
            <button type="button" onClick={() => setFilterReadiness("all")}>
              Readiness: {filterReadiness} ×
            </button>
          )}
        </section>
      )}

      {viewMode === "summary" && (
        <section className="ba-analysis-grid course-analysis-grid">
          <AnalysisCard
            title="Readiness by Status"
            rows={countsByStatus}
            total={summary.total}
          />
          <AnalysisCard
            title="Outlines by Class"
            rows={countsByClass}
            total={summary.total}
          />
          <AnalysisCard
            title="Outlines by Curriculum"
            rows={countsByCurriculum}
            total={summary.total}
          />
          <AnalysisCard
            title="Teacher Load"
            rows={countsByTeacher}
            total={summary.total}
          />
          <article className="ba-analysis ba-current-filter">
            <span>Current Filter</span>
            <strong>{summary.showing}</strong>
            <p>
              Course outline record(s) currently match your search and filters.
            </p>
          </article>
        </section>
      )}

      {viewMode === "table" && <TableView rows={filteredRows} />}

      {viewMode === "cards" && (
        <section className="course-layout">
          <div className="ba-grid course-card-grid">
            {filteredRows.map((item) => (
              <button
                key={String(item.id)}
                type="button"
                onClick={() => setSelectedClassSubjectId(item.id)}
                className={`course-row-card ${selectedOutline?.id === item.id ? "active" : ""}`}
              >
                <Avatar
                  name={item.subjectName}
                  photo={item.teacherPhoto}
                  primary={primary}
                />
                <span className="course-row-main">
                  <strong>{item.subjectName}</strong>
                  <small>
                    {item.className} · {item.academicPeriodName}
                  </small>
                  <em>
                    {item.curriculumName} → {item.pathwayName}
                  </em>
                </span>
                <span className="course-row-side">
                  <span
                    className={`status-dot-mini ${statusTone(item.statusLabel)}`}
                    title={item.statusLabel}
                  />
                  <i>⋯</i>
                </span>
              </button>
            ))}
            {!filteredRows.length ? (
              <Empty
                icon="📖"
                title="No course outlines found"
                text="Create Class Subjects first, then this page will project delivery-ready course outlines from them."
              />
            ) : null}
          </div>

          <aside className="ba-card course-detail-card">
            {selectedOutline ? (
              <>
                <div className="course-detail-head">
                  <div>
                    <h3>{selectedOutline.subjectName}</h3>
                    <p>
                      {selectedOutline.className} ·{" "}
                      {selectedOutline.academicPeriodName}
                    </p>
                  </div>
                  <Chip tone={statusTone(selectedOutline.statusLabel)}>
                    {selectedOutline.statusLabel}
                  </Chip>
                </div>

                <section
                  className="connection-map"
                  aria-label="Course outline connection map"
                >
                  <div>
                    <span>Course</span>
                    <strong>{selectedOutline.subjectName}</strong>
                    <small>{selectedOutline.subjectCode || "No code"}</small>
                  </div>
                  <i />
                  <div>
                    <span>Class</span>
                    <strong>{selectedOutline.className}</strong>
                    <small>{selectedOutline.academicPeriodName}</small>
                  </div>
                  <i />
                  <div>
                    <span>Outline</span>
                    <strong>{selectedOutline.curriculumName}</strong>
                    <small>{selectedOutline.pathwayName}</small>
                  </div>
                </section>

                <section className="course-detail-section">
                  <h4>Course Identity</h4>
                  <div className="ba-mini-chips">
                    <Chip tone={typeTone(selectedOutline.type)}>
                      Type: {selectedOutline.type}
                    </Chip>
                    <Chip tone="blue">
                      Credits: {selectedOutline.credits ?? "-"}
                    </Chip>
                    <Chip tone="blue">
                      Hours: {selectedOutline.contactHours ?? "-"}
                    </Chip>
                    <Chip tone="orange">
                      Min Pass: {selectedOutline.minimumPassScore ?? "-"}
                    </Chip>
                  </div>
                </section>

                <section className="course-detail-section">
                  <h4>Academic Context</h4>
                  <InfoGrid
                    items={[
                      ["Curriculum", selectedOutline.curriculumName],
                      ["Pathway", selectedOutline.pathwayName],
                      [
                        "Academic Structure",
                        selectedOutline.academicStructureName,
                      ],
                      ["Academic Period", selectedOutline.academicPeriodName],
                    ]}
                  />
                </section>

                <section className="course-detail-section">
                  <h4>Delivery Ownership</h4>
                  <InfoGrid
                    items={[
                      ["Teacher", selectedOutline.teacherName],
                      [
                        "Locked",
                        (selectedOutline.classSubject as any).locked
                          ? "Yes"
                          : "No",
                      ],
                      [
                        "Active",
                        (selectedOutline.classSubject as any).active === false
                          ? "No"
                          : "Yes",
                      ],
                      [
                        "Applicability Records",
                        `${selectedOutline.applicabilityCount}`,
                      ],
                    ]}
                  />
                </section>

                <section className="course-detail-section readiness">
                  <h4>Assessment Readiness</h4>
                  <div className="ba-mini-chips">
                    <Chip
                      tone={
                        selectedOutline.assessmentConfigured
                          ? "green"
                          : "orange"
                      }
                    >
                      {selectedOutline.assessmentConfigured
                        ? "Assessment applicability configured"
                        : "Assessment applicability not configured"}
                    </Chip>
                  </div>
                  <p>
                    This outline is generated from academic delivery setup. To
                    make this course report-ready, configure Assessment
                    Applicability for this ClassSubject.
                  </p>
                </section>
              </>
            ) : (
              <Empty
                icon="📖"
                title="No outline selected"
                text="Select a course outline to view details."
              />
            )}
          </aside>
        </section>
      )}

      {filterOpen && (
        <FilterSheet
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          curriculums={curriculums}
          academicPeriods={academicPeriods}
          filterClassId={filterClassId}
          filterSubjectId={filterSubjectId}
          filterTeacherId={filterTeacherId}
          filterCurriculumId={filterCurriculumId}
          filterPeriodId={filterPeriodId}
          filterReadiness={filterReadiness}
          setFilterClassId={setFilterClassId}
          setFilterSubjectId={setFilterSubjectId}
          setFilterTeacherId={setFilterTeacherId}
          setFilterCurriculumId={setFilterCurriculumId}
          setFilterPeriodId={setFilterPeriodId}
          setFilterReadiness={setFilterReadiness}
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
      style={{ "--ba-primary": primary } as React.CSSProperties}
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

function TableView({ rows }: { rows: CourseOutlineView[] }) {
  return (
    <section className="ba-table-card">
      <div className="ba-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Course Outlines ({rows.length})</th>
              <th>Delivery Link</th>
              <th>Curriculum Path</th>
              <th>Teacher</th>
              <th>Academic Period</th>
              <th>Type</th>
              <th>Load</th>
              <th>Assessment</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const row: any = item.classSubject;
              return (
                <tr key={String(item.id)}>
                  <td>
                    <div className="table-course-cell">
                      <strong>{item.subjectName}</strong>
                      <span>{item.subjectCode || "No subject code"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="table-link-map">
                      <b>{item.className}</b>
                      <i>→</i>
                      <b>{item.subjectName}</b>
                    </div>
                    <small className="table-note">
                      Class subject delivery record
                    </small>
                  </td>
                  <td>
                    <div className="table-link-map muted">
                      <b>{item.curriculumName}</b>
                      <i>→</i>
                      <b>{item.pathwayName}</b>
                    </div>
                    <small className="table-note">
                      Curriculum outline source
                    </small>
                  </td>
                  <td>{item.teacherName}</td>
                  <td>{item.academicPeriodName}</td>
                  <td>
                    <Chip tone={typeTone(item.type)}>{item.type}</Chip>
                  </td>
                  <td>
                    <div className="table-load">
                      <span>
                        {item.credits ?? "—"}
                        <small>credits</small>
                      </span>
                      <span>
                        {item.contactHours ?? "—"}
                        <small>hours</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {item.applicabilityCount
                      ? `${item.applicabilityCount} record(s)`
                      : "Not configured"}
                  </td>
                  <td>
                    <Chip tone={statusTone(item.statusLabel)}>
                      {item.statusLabel}
                    </Chip>
                  </td>
                  <td>{timeText(row.updatedAt || row.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="ba-empty-table">
            No course outline matches your filters.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FilterSheet(props: {
  classes: Class[];
  subjects: Subject[];
  teachers: Teacher[];
  curriculums: Curriculum[];
  academicPeriods: AcademicPeriod[];
  filterClassId: string;
  filterSubjectId: string;
  filterTeacherId: string;
  filterCurriculumId: string;
  filterPeriodId: string;
  filterReadiness: ReadinessFilter;
  setFilterClassId: (value: string) => void;
  setFilterSubjectId: (value: string) => void;
  setFilterTeacherId: (value: string) => void;
  setFilterCurriculumId: (value: string) => void;
  setFilterPeriodId: (value: string) => void;
  setFilterReadiness: (value: ReadinessFilter) => void;
  clearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet">
        <div className="ba-sheet-head">
          <div>
            <h2>Filters</h2>
            <p>
              Filter by the academic link between class, subject, curriculum and
              readiness.
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
        <div className="ba-form compact">
          <label>
            <span>Class</span>
            <select
              value={props.filterClassId}
              onChange={(e) => props.setFilterClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {props.classes.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Subject</span>
            <select
              value={props.filterSubjectId}
              onChange={(e) => props.setFilterSubjectId(e.target.value)}
            >
              <option value="">All subjects</option>
              {props.subjects.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Teacher</span>
            <select
              value={props.filterTeacherId}
              onChange={(e) => props.setFilterTeacherId(e.target.value)}
            >
              <option value="">All teachers</option>
              {props.teachers.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Curriculum</span>
            <select
              value={props.filterCurriculumId}
              onChange={(e) => props.setFilterCurriculumId(e.target.value)}
            >
              <option value="">All curriculums</option>
              {props.curriculums.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Period</span>
            <select
              value={props.filterPeriodId}
              onChange={(e) => props.setFilterPeriodId(e.target.value)}
            >
              <option value="">All periods</option>
              {props.academicPeriods.map((row: any) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Readiness</span>
            <select
              value={props.filterReadiness}
              onChange={(e) =>
                props.setFilterReadiness(e.target.value as ReadinessFilter)
              }
            >
              <option value="all">All readiness</option>
              <option value="ready">Assessment ready</option>
              <option value="incomplete">Needs assessment setup</option>
              <option value="locked">Locked</option>
              <option value="inactive">Inactive</option>
              <option value="unassigned">No teacher</option>
            </select>
          </label>
        </div>
        <div className="ba-sheet-actions">
          <button type="button" onClick={props.clearFilters}>
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

function MoreSheet({
  viewMode,
  setViewMode,
  onRefresh,
  onClose,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className="ba-sheet small">
        <div className="ba-sheet-head">
          <div>
            <h2>More</h2>
            <p>Advanced views are here so the main page stays simple.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="ba-menu-list">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            <span>☰</span>
            <b>Card view</b>
            <small>Course list with outline detail panel</small>
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            <span>☷</span>
            <b>Table view</b>
            <small>Visual course-to-outline mapping</small>
          </button>
          <button
            type="button"
            className={viewMode === "summary" ? "active" : ""}
            onClick={() => setViewMode("summary")}
          >
            <span>◔</span>
            <b>Analytics</b>
            <small>Readiness, class, curriculum and teacher load</small>
          </button>
          <button type="button" onClick={onRefresh}>
            <span>↻</span>
            <b>Refresh</b>
            <small>Reload local delivery records</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="course-info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function groupedCounts(
  rows: CourseOutlineView[],
  keyFn: (row: CourseOutlineView) => string,
) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row) || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function AnalysisCard({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
  return (
    <article className="ba-analysis">
      <span>{title}</span>
      <strong>{rows.reduce((sum, row) => sum + row.value, 0)}</strong>
      <div className="ba-analysis-list">
        {rows.slice(0, 8).map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <section key={row.label}>
              <div>
                <b>{row.label}</b>
                <small>
                  {row.value} · {share}%
                </small>
              </div>
              <div className="ba-progress">
                <i style={{ width: `${Math.max(4, share)}%` }} />
              </div>
            </section>
          );
        })}
        {!rows.length ? <p>No data available.</p> : null}
      </div>
    </article>
  );
}

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.ba-page{--ease:cubic-bezier(.2,.8,.2,1);min-height:100dvh;width:100%;max-width:100%;min-width:0;padding:calc(8px * var(--local-density-scale,1));padding-bottom:max(40px,env(safe-area-inset-bottom));background:radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),var(--bg,#f7f8fb);color:var(--text,#111827);font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--font-size,14px);overflow-x:hidden}.ba-page *,.ba-page *::before,.ba-page *::after{box-sizing:border-box;min-width:0}.ba-page button,.ba-page input,.ba-page select,.ba-page textarea{font:inherit;max-width:100%}.ba-page input,.ba-page select,.ba-page textarea{width:100%;min-height:44px;border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));border-radius:16px;padding:0 12px;background:var(--input-bg,var(--surface,#fff));color:var(--input-text,var(--text,#111827));outline:none;font-weight:750}.ba-page input:focus,.ba-page select:focus,.ba-page textarea:focus{border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent)}.ba-state,.ba-search-card,.course-row-card,.ba-card,.ba-table-card,.ba-analysis,.ba-empty,.ba-sheet{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.10));box-shadow:0 12px 28px rgba(15,23,42,.045)}.ba-state{min-height:min(420px,calc(100dvh - 32px));width:min(520px,100%);margin:0 auto;display:grid;place-items:center;align-content:center;gap:10px;padding:22px;border-radius:28px;text-align:center}.ba-spinner{width:38px;height:38px;border-radius:999px;border:4px solid color-mix(in srgb,var(--ba-primary) 18%,transparent);border-top-color:var(--ba-primary);animation:spin .8s linear infinite}.ba-state h2{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.04em}.ba-state p{max-width:34rem;margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-state-button{min-height:42px;border:0;border-radius:999px;padding:0 16px;background:var(--ba-primary);color:#fff;font-weight:950;cursor:pointer}.ba-search-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;margin-top:2px;padding:8px;border-radius:24px}.ba-search{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;padding:0 11px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent)}.ba-search span{color:var(--muted,#64748b);font-size:17px;font-weight:1000}.ba-search input{min-height:42px;border:0;padding:0;border-radius:0;background:transparent;box-shadow:none;font-size:14px}.ba-icon-button,.ba-filter-button{width:42px;height:42px;border:1px solid var(--border,rgba(0,0,0,.10));border-radius:999px;display:grid;place-items:center;background:var(--card-bg,var(--surface,#fff));color:var(--text,#111827);font-size:18px;font-weight:1000;cursor:pointer;box-shadow:0 10px 22px rgba(15,23,42,.045)}.ba-filter-button{position:relative;background:color-mix(in srgb,var(--ba-primary) 8%,var(--card-bg,#fff));color:var(--ba-primary)}.ba-filter-button.active{background:var(--ba-primary);color:#fff;border-color:var(--ba-primary)}.ba-filter-button b{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;border:2px solid var(--card-bg,#fff)}.ba-slider-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.ba-filter-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 1px 0;scrollbar-width:none}.ba-filter-chips::-webkit-scrollbar{display:none}.ba-filter-chips button{flex:0 0 auto;min-height:31px;border:0;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--ba-primary) 11%,transparent);color:var(--ba-primary);font-size:11px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-chip{max-width:100%;display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-chip.green{background:rgba(34,197,94,.12);color:#16a34a}.ba-chip.red{background:rgba(239,68,68,.12);color:#dc2626}.ba-chip.blue{background:rgba(59,130,246,.12);color:#2563eb}.ba-chip.gray{background:rgba(107,114,128,.12);color:var(--muted,#64748b)}.ba-chip.orange{background:rgba(245,158,11,.14);color:#b45309}.ba-chip.purple{background:rgba(147,51,234,.12);color:#7e22ce}.course-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px;align-items:start}.ba-grid,.ba-analysis-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:10px}.course-row-card{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border-radius:22px;text-align:left;color:var(--text,#111827);cursor:pointer;transition:transform .16s var(--ease),box-shadow .16s var(--ease),border-color .16s var(--ease)}.course-row-card:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--ba-primary) 26%,var(--border,rgba(0,0,0,.10)))}.course-row-card.active{border-color:var(--ba-primary);box-shadow:0 18px 40px color-mix(in srgb,var(--ba-primary) 14%,transparent)}.ba-avatar{width:44px;height:44px;flex:0 0 auto;display:grid;place-items:center;border-radius:17px;color:#fff;font-size:13px;font-weight:1000;box-shadow:0 12px 24px rgba(15,23,42,.12)}.course-row-main{display:grid;gap:2px;min-width:0}.course-row-main strong,.course-row-main small,.course-row-main em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.course-row-main strong{font-size:14px;font-weight:1000;color:var(--text,#111827)}.course-row-main small{color:var(--muted,#64748b);font-size:11px;font-weight:850}.course-row-main em{color:var(--muted,#64748b);font-size:11px;font-style:normal}.course-row-side{display:flex;align-items:center;gap:8px}.course-row-side i{color:var(--muted,#64748b);font-style:normal;font-size:18px;font-weight:1000}.status-dot-mini{width:9px;height:9px;border-radius:999px;background:var(--muted,#64748b);box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 12%,transparent)}.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.13)}.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.13)}.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}.status-dot-mini.gray{background:var(--muted,#64748b)}.ba-card,.ba-analysis,.ba-table-card,.ba-empty{border-radius:24px;padding:13px}.course-detail-card{min-height:240px;align-self:start}.course-detail-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.course-detail-head div{min-width:0}.course-detail-head h3{margin:0;font-size:22px;font-weight:1000;letter-spacing:-.05em}.course-detail-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;font-weight:750}.connection-map{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr);align-items:stretch;gap:6px;margin-top:12px;padding:10px;border-radius:18px;background:color-mix(in srgb,var(--ba-primary) 7%,transparent);border:1px solid color-mix(in srgb,var(--ba-primary) 14%,var(--border,rgba(0,0,0,.10)))}.connection-map div{padding:8px;border-radius:14px;background:var(--card-bg,var(--surface,#fff));border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}.connection-map span,.connection-map strong,.connection-map small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-map span{font-size:9px;font-weight:1000;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#64748b)}.connection-map strong{margin-top:2px;font-size:12px;font-weight:1000;color:var(--text,#111827)}.connection-map small{margin-top:2px;font-size:10px;color:var(--muted,#64748b);font-weight:850}.connection-map i{align-self:center;width:18px;height:2px;border-radius:999px;background:var(--ba-primary);position:relative}.connection-map i::after{content:"";position:absolute;right:0;top:50%;width:6px;height:6px;border-top:2px solid var(--ba-primary);border-right:2px solid var(--ba-primary);transform:translateY(-50%) rotate(45deg)}.course-detail-section{margin-top:11px;padding:12px;border-radius:18px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);border:1px solid var(--border,rgba(0,0,0,.08))}.course-detail-section h4{margin:0;color:var(--muted,#64748b);font-size:11px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase}.course-detail-section.readiness p{margin:10px 0 0;color:var(--muted,#64748b);font-size:13px;line-height:1.55;font-weight:720}.ba-mini-chips,.ba-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.course-info-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:10px}.course-info-grid div{min-width:0;padding:9px;border-radius:15px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.08));overflow:hidden}.course-info-grid span,.course-info-grid strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.course-info-grid span{color:var(--muted,#64748b);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.course-info-grid strong{margin-top:3px;font-size:13px;font-weight:900}.ba-table-card{margin-top:10px;padding:0}.ba-table-scroll{width:100%;max-width:100%;overflow-x:auto;border-radius:22px;border:1px solid var(--border,rgba(0,0,0,.08));background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll table{width:100%;min-width:1180px;border-collapse:collapse;background:var(--card-bg,var(--surface,#fff))}.ba-table-scroll th,.ba-table-scroll td{padding:11px;border-bottom:1px solid var(--border,rgba(0,0,0,.08));vertical-align:top;text-align:left;font-size:13px;color:var(--text,#111827)}.ba-table-scroll th{background:color-mix(in srgb,var(--ba-primary) 7%,var(--card-bg,var(--surface,#fff)));color:var(--muted,#64748b);font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap}.ba-table-scroll td strong,.ba-table-scroll td span{display:block}.ba-table-scroll td span{margin-top:3px;color:var(--muted,#64748b);font-size:11px}.table-course-cell strong{font-weight:1000}.table-link-map{display:flex;align-items:center;gap:6px;white-space:nowrap}.table-link-map b{display:inline-flex;align-items:center;max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:950;color:var(--text,#111827)}.table-link-map i{color:var(--ba-primary);font-style:normal;font-weight:1000}.table-link-map.muted b{color:var(--muted,#64748b)}.table-note{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:10px;font-weight:850}.table-load{display:flex;gap:6px;white-space:nowrap}.table-load span{display:inline-flex;flex-direction:column;min-width:48px;padding:6px 8px;border-radius:12px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent);font-weight:1000}.table-load small{font-size:9px;color:var(--muted,#64748b);font-weight:900}.ba-empty-table{padding:22px;text-align:center;color:var(--muted,#64748b);font-weight:850}.ba-analysis span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.ba-analysis strong{display:block;margin-top:8px;font-size:clamp(22px,7vw,30px);line-height:1;font-weight:1000;letter-spacing:-.06em;overflow-wrap:anywhere}.ba-analysis p{margin:8px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-analysis-list{display:grid;gap:10px;margin-top:12px}.ba-analysis-list section{display:grid;gap:6px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--muted,#64748b) 8%,transparent)}.ba-analysis-list section>div:first-child{display:flex;justify-content:space-between;gap:10px}.ba-analysis-list b,.ba-analysis-list small{font-size:12px}.ba-analysis-list small{color:var(--muted,#64748b);font-weight:850}.ba-progress{height:8px;border-radius:999px;background:color-mix(in srgb,var(--muted,#64748b) 18%,transparent);overflow:hidden}.ba-progress i{display:block;height:100%;border-radius:inherit;background:var(--ba-primary)}.ba-empty{display:grid;place-items:center;align-content:center;gap:8px;min-height:220px;text-align:center;border-style:dashed}.ba-empty-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:22px;background:color-mix(in srgb,var(--ba-primary) 12%,#fff);font-size:28px}.ba-empty h3{margin:0;font-size:18px;font-weight:1000}.ba-empty p{margin:0;color:var(--muted,#64748b);font-size:13px;line-height:1.6}.ba-sheet-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:end center;padding:10px;background:rgba(15,23,42,.55);backdrop-filter:blur(10px)}.ba-sheet{width:min(760px,100%);max-height:min(88dvh,760px);overflow:auto;border-radius:28px;padding:14px}.ba-sheet.small{width:min(470px,100%)}.ba-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:3px 2px 14px}.ba-sheet-head h2{margin:0;font-size:20px;font-weight:1000;letter-spacing:-.05em;color:var(--text,#111827)}.ba-sheet-head p{margin:4px 0 0;color:var(--muted,#64748b);font-size:12px;line-height:1.5}.ba-sheet-head button{width:38px;height:38px;border-radius:999px;border:1px solid var(--border,rgba(0,0,0,.08));background:var(--surface,#fff);color:var(--muted,#64748b);font-weight:1000;cursor:pointer}.ba-form{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ba-form.compact label{display:grid;gap:6px}.ba-form.compact span{color:var(--muted,#64748b);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.ba-sheet-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.ba-sheet-actions button{min-height:42px;border-radius:999px;border:0;background:color-mix(in srgb,var(--muted,#64748b) 8%,var(--surface,#fff));color:var(--text,#111827);font-weight:950;cursor:pointer}.ba-sheet-actions button.primary{background:var(--ba-primary);color:#fff}.ba-menu-list{display:grid;gap:8px}.ba-menu-list button{display:grid;grid-template-columns:42px minmax(0,1fr);grid-template-areas:"icon title" "icon text";gap:2px 10px;align-items:center;text-align:left;min-height:62px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:18px;padding:9px;background:var(--surface,#fff);color:var(--text,#111827);cursor:pointer}.ba-menu-list button span{grid-area:icon;width:42px;height:42px;display:grid;place-items:center;border-radius:15px;background:color-mix(in srgb,var(--ba-primary) 10%,transparent);color:var(--ba-primary);font-weight:1000}.ba-menu-list button b{grid-area:title;font-size:13px;font-weight:1000}.ba-menu-list button small{grid-area:text;color:var(--muted,#64748b);font-size:11px;font-weight:750}.ba-menu-list button.active{background:var(--ba-primary);border-color:var(--ba-primary);color:#fff;box-shadow:0 14px 32px color-mix(in srgb,var(--ba-primary) 22%,transparent)}.ba-menu-list button.active span{background:rgba(255,255,255,.18);color:#fff}.ba-menu-list button.active small{color:rgba(255,255,255,.82)}@media (min-width:680px){.ba-page{padding:calc(12px * var(--local-density-scale,1))}.ba-grid,.ba-analysis-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.course-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-sheet-backdrop{place-items:center;padding:18px}}@media (min-width:1040px){.ba-page{padding:calc(16px * var(--local-density-scale,1))}.course-layout{grid-template-columns:minmax(300px,.86fr) minmax(390px,1.14fr);gap:14px}.course-card-grid{grid-template-columns:minmax(0,1fr)}.course-detail-card{position:sticky;top:62px}.course-analysis-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (min-width:1400px){.course-layout{grid-template-columns:minmax(620px,1fr) minmax(430px,.68fr)}.course-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:620px){.ba-page{padding:calc(6px * var(--local-density-scale,1))}.connection-map{grid-template-columns:minmax(0,1fr);}.connection-map i{width:2px;height:16px;justify-self:center}.connection-map i::after{right:50%;top:auto;bottom:0;transform:translateX(50%) rotate(135deg)}.ba-card,.ba-analysis,.ba-table-card,.ba-empty,.ba-sheet{border-radius:20px;padding:11px}.course-detail-head{display:grid}.ba-sheet-actions{grid-template-columns:minmax(0,1fr)}}
`;
