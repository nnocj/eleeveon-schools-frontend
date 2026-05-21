"use client";

/**
 * assessmentApplicability.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE ASSESSMENT APPLICABILITY ENGINE
 * ---------------------------------------------------------
 *
 * Architecture:
 * ClassSubject is the delivery context.
 * AssessmentApplicability activates assessment rules for a ClassSubject.
 * AssessmentEntry records are counted by matching:
 * - classSubjectId
 * - assessmentStructureId
 * - gradingSystemId when available
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first WhatsApp-style cards.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { SyncStatus } from "../lib/constants/syncStatus";
import { prepareSyncData } from "../lib/sync/syncUtils";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  AssessmentStructure,
  Class,
  ClassSubject,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  GradingSystem,
  Organization,
  Subject,
  Teacher,
} from "../lib/db";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  classSubjectId?: number;
  organizationId?: number;
  assessmentStructureId?: number;
  gradingSystemId?: number;
  active: boolean;
  locked?: boolean;
  isElective?: boolean;
  groupCode?: string;
};

type ClassSubjectOption = {
  id: number;
  raw: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  academicStructureName: string;
  academicPeriodName: string;
  curriculumName: string;
  pathwayName: string;
  organizationId?: number;
  curriculumType?: string;
  display: string;
};

type ApplicabilityView = {
  row: AssessmentApplicability;
  classSubject?: ClassSubjectOption;
  assessmentStructureName: string;
  gradingSystemName: string;
  organizationName: string;
  entryCount: number;
};

const emptyForm = (): FormState => ({
  classSubjectId: undefined,
  organizationId: undefined,
  assessmentStructureId: undefined,
  gradingSystemId: undefined,
  active: true,
  locked: false,
  isElective: false,
  groupCode: "core",
});

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentApplicabilityPage() {
  const router = useRouter();

  const {
    accountId,
    loading: accountLoading,
    authenticated,
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

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<AssessmentApplicability[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [pathways, setPathways] = useState<CurriculumPathway[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [structures, setStructures] = useState<AssessmentStructure[]>([]);
  const [gradings, setGradings] = useState<GradingSystem[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterSubjectId, setFilterSubjectId] = useState<number | undefined>();
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterAssessmentStructureId, setFilterAssessmentStructureId] = useState<number | undefined>();
  const [filterGradingSystemId, setFilterGradingSystemId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "locked">("all");
  const [filterGroupCode, setFilterGroupCode] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

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
  // LOAD DATA
  // ======================================================

  const clearData = () => {
    setRows([]);
    setClassSubjects([]);
    setCurriculumSubjects([]);
    setCurriculums([]);
    setPathways([]);
    setSubjects([]);
    setClasses([]);
    setTeachers([]);
    setAcademicStructures([]);
    setPeriods([]);
    setOrganizations([]);
    setStructures([]);
    setGradings([]);
    setEntries([]);
  };

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [
        applicabilityRows,
        classSubjectRows,
        curriculumSubjectRows,
        curriculumRows,
        pathwayRows,
        subjectRows,
        classRows,
        teacherRows,
        academicStructureRows,
        periodRows,
        organizationRows,
        structureRows,
        gradingRows,
        entryRows,
      ] = await Promise.all([
        db.assessmentApplicabilities.toArray(),
        db.classSubjects.toArray(),
        db.curriculumSubjects.toArray(),
        db.curriculums.toArray(),
        db.curriculumPathways.toArray(),
        db.subjects.toArray(),
        db.classes.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.organizations.toArray(),
        db.assessmentStructures.toArray(),
        db.gradingSystems.toArray(),
        db.assessmentEntries.toArray(),
      ]);

      setRows(applicabilityRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
      setCurriculumSubjects(curriculumSubjectRows.filter(sameTenant));
      setCurriculums(curriculumRows.filter(sameTenant));
      setPathways(pathwayRows.filter(sameTenant));
      setSubjects(subjectRows.filter(sameTenant));
      setClasses(classRows.filter(sameTenant));
      setTeachers(teacherRows.filter(sameTenant));
      setAcademicStructures(academicStructureRows.filter(sameTenant));
      setPeriods(periodRows.filter(sameTenant));
      setOrganizations(organizationRows.filter(sameTenant));
      setStructures(structureRows.filter(sameTenant));
      setGradings(gradingRows.filter(sameTenant));
      setEntries(entryRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load assessment applicability data:", error);
      clearData();
      alert("Failed to load assessment applicability data");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const subjectMap = useMemo(() => new Map(subjects.map((row) => [row.id, row])), [subjects]);
  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const teacherMap = useMemo(() => new Map(teachers.map((row) => [row.id, row])), [teachers]);
  const structureMap = useMemo(() => new Map(academicStructures.map((row) => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map((row) => [row.id, row])), [periods]);
  const organizationMap = useMemo(() => new Map(organizations.map((row) => [row.id, row])), [organizations]);
  const assessmentStructureMap = useMemo(() => new Map(structures.map((row) => [row.id, row])), [structures]);
  const gradingMap = useMemo(() => new Map(gradings.map((row) => [row.id, row])), [gradings]);
  const curriculumSubjectMap = useMemo(() => new Map(curriculumSubjects.map((row) => [row.id, row])), [curriculumSubjects]);
  const curriculumMap = useMemo(() => new Map(curriculums.map((row) => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map((row) => [row.id, row])), [pathways]);

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .filter((row) => row.active !== false)
      .map((row) => {
        const id = row.id || 0;
        const subject = subjectMap.get(row.subjectId);
        const classRow = classMap.get(row.classId);
        const teacher = row.teacherId ? teacherMap.get(row.teacherId) : undefined;
        const academicStructure = structureMap.get(row.academicStructureId);
        const period = row.academicPeriodId ? periodMap.get(row.academicPeriodId) : undefined;
        const curriculumSubject = curriculumSubjectMap.get(row.curriculumSubjectId);
        const curriculum = curriculumSubject ? curriculumMap.get(curriculumSubject.curriculumId) : undefined;
        const pathway = curriculumSubject?.pathwayId ? pathwayMap.get(curriculumSubject.pathwayId) : undefined;

        const subjectName = row.name || subject?.name || "Unknown Subject";
        const className = classRow?.name || "Unknown Class";
        const academicPeriodName = period?.name || "All Periods";
        const subjectCode = row.code || subject?.code;

        return {
          id,
          raw: row,
          className,
          subjectName,
          subjectCode,
          teacherName: teacher?.fullName || "No teacher assigned",
          academicStructureName: academicStructure?.name || "Unknown academic structure",
          academicPeriodName,
          curriculumName: curriculum?.name || "No curriculum",
          pathwayName: pathway?.name || "No pathway",
          organizationId: curriculumSubject?.organizationId,
          curriculumType: row.type || curriculumSubject?.type,
          display: `${className} • ${subjectName}${subjectCode ? ` (${subjectCode})` : ""} • ${academicPeriodName}`,
        };
      });
  }, [
    classSubjects,
    subjectMap,
    classMap,
    teacherMap,
    structureMap,
    periodMap,
    curriculumSubjectMap,
    curriculumMap,
    pathwayMap,
  ]);

  const classSubjectOptionMap = useMemo(
    () => new Map(classSubjectOptions.map((row) => [row.id, row])),
    [classSubjectOptions]
  );

  const selectedClassSubject = useMemo(() => {
    if (!form.classSubjectId) return undefined;
    return classSubjectOptionMap.get(form.classSubjectId);
  }, [form.classSubjectId, classSubjectOptionMap]);

  const availableStructures = useMemo(() => {
    if (!selectedClassSubject) return structures.filter((row) => row.active !== false);

    return structures.filter((row) => {
      if (row.active === false) return false;
      return row.academicStructureId === selectedClassSubject.raw.academicStructureId;
    });
  }, [selectedClassSubject, structures]);

  const availableGradings = useMemo(() => {
    return gradings.filter((row) => row.active !== false);
  }, [gradings]);

  const entryCountByApplicability = useMemo(() => {
    const map = new Map<number, number>();

    rows.forEach((app) => {
      if (!app.id) return;

      const count = entries.filter((entry) => {
        if (entry.classSubjectId !== app.classSubjectId) return false;
        if (entry.assessmentStructureId !== app.assessmentStructureId) return false;

        if (app.gradingSystemId && entry.gradingSystemId) {
          return entry.gradingSystemId === app.gradingSystemId;
        }

        return true;
      }).length;

      map.set(app.id, count);
    });

    return map;
  }, [rows, entries]);

  const groupCodes = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.groupCode).filter(Boolean) as string[])).sort();
  }, [rows]);

  // ======================================================
  // SMART DEFAULTS
  // ======================================================

  useEffect(() => {
    if (!form.classSubjectId || !selectedClassSubject) return;

    const isSelectedElective =
      selectedClassSubject.curriculumType === "elective" || selectedClassSubject.raw.type === "elective";

    setForm((prev) => ({
      ...prev,
      organizationId: prev.organizationId || selectedClassSubject.organizationId,
      isElective: prev.isElective || isSelectedElective,
      groupCode: prev.groupCode || (isSelectedElective ? "elective" : "core"),
      assessmentStructureId: prev.assessmentStructureId || availableStructures[0]?.id,
      gradingSystemId:
        prev.gradingSystemId ||
        availableGradings.find((row) => row.default)?.id ||
        availableGradings[0]?.id,
    }));
  }, [form.classSubjectId, selectedClassSubject, availableStructures, availableGradings]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ApplicabilityView[]>(() => {
    return rows.map((row) => {
      const classSubject = classSubjectOptionMap.get(row.classSubjectId);
      const assessmentStructure = assessmentStructureMap.get(row.assessmentStructureId);
      const grading = row.gradingSystemId ? gradingMap.get(row.gradingSystemId) : undefined;
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;

      return {
        row,
        classSubject,
        assessmentStructureName: assessmentStructure?.name || "Unknown assessment structure",
        gradingSystemName: grading?.name || "No grading system",
        organizationName: organization?.name || "No organization",
        entryCount: entryCountByApplicability.get(row.id || 0) || 0,
      };
    });
  }, [rows, classSubjectOptionMap, assessmentStructureMap, gradingMap, organizationMap, entryCountByApplicability]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;
        const option = item.classSubject;

        if (filterClassId && option?.raw.classId !== filterClassId) return false;
        if (filterSubjectId && option?.raw.subjectId !== filterSubjectId) return false;
        if (filterStructureId && option?.raw.academicStructureId !== filterStructureId) return false;
        if (filterPeriodId && option?.raw.academicPeriodId !== filterPeriodId) return false;
        if (filterAssessmentStructureId && row.assessmentStructureId !== filterAssessmentStructureId) return false;
        if (filterGradingSystemId && row.gradingSystemId !== filterGradingSystemId) return false;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterGroupCode && row.groupCode !== filterGroupCode) return false;
        if (filterStatus === "active" && row.active !== true) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;

        if (!query) return true;

        return `
          ${option?.subjectName || ""}
          ${option?.subjectCode || ""}
          ${option?.className || ""}
          ${option?.teacherName || ""}
          ${option?.academicStructureName || ""}
          ${option?.academicPeriodName || ""}
          ${option?.curriculumName || ""}
          ${option?.pathwayName || ""}
          ${item.assessmentStructureName}
          ${item.gradingSystemName}
          ${item.organizationName}
          ${row.groupCode || ""}
        `.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const classCompare = (a.classSubject?.className || "").localeCompare(b.classSubject?.className || "");
        if (classCompare !== 0) return classCompare;
        return (a.classSubject?.subjectName || "").localeCompare(b.classSubject?.subjectName || "");
      });
  }, [
    viewRows,
    search,
    filterClassId,
    filterSubjectId,
    filterStructureId,
    filterPeriodId,
    filterAssessmentStructureId,
    filterGradingSystemId,
    filterOrganizationId,
    filterGroupCode,
    filterStatus,
  ]);

  const uncoveredClassSubjects = useMemo(() => {
    const covered = new Set(rows.filter((row) => row.active !== false).map((row) => row.classSubjectId));
    return classSubjectOptions.filter((option) => !covered.has(option.id));
  }, [rows, classSubjectOptions]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active).length,
      inactive: rows.filter((row) => !row.active).length,
      locked: rows.filter((row) => row.locked).length,
      elective: rows.filter((row) => row.isElective).length,
      classSubjects: classSubjectOptions.length,
      uncovered: uncoveredClassSubjects.length,
      entries: entries.length,
    };
  }, [rows, classSubjectOptions, uncoveredClassSubjects, entries]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const openCreate = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Select a branch first before creating assessment applicability.");
      return;
    }

    setEditMode(false);
    setForm({
      ...emptyForm(),
      gradingSystemId: availableGradings.find((row) => row.default)?.id || availableGradings[0]?.id,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: AssessmentApplicability) => {
    setEditMode(true);
    setForm({
      id: row.id,
      classSubjectId: row.classSubjectId,
      organizationId: row.organizationId,
      assessmentStructureId: row.assessmentStructureId,
      gradingSystemId: row.gradingSystemId,
      active: row.active,
      locked: row.locked ?? false,
      isElective: row.isElective ?? false,
      groupCode: row.groupCode || "core",
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!form.classSubjectId) return "Select class subject";
    if (!form.assessmentStructureId) return "Select assessment structure";

    const classSubject = classSubjectOptionMap.get(Number(form.classSubjectId));
    const assessmentStructure = assessmentStructureMap.get(Number(form.assessmentStructureId));

    if (!classSubject) return "Class subject not found";
    if (!assessmentStructure) return "Assessment structure not found";

    if (assessmentStructure.academicStructureId !== classSubject.raw.academicStructureId) {
      return "Assessment structure must belong to the same academic structure as the class subject";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;
      return (
        row.classSubjectId === Number(form.classSubjectId) &&
        row.assessmentStructureId === Number(form.assessmentStructureId) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "Applicability already exists for this class subject and assessment structure";
    }

    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) return alert(error);

    try {
      setSaving(true);

      const classSubject = classSubjectOptionMap.get(Number(form.classSubjectId));
      const inferredElective =
        form.isElective ||
        classSubject?.curriculumType === "elective" ||
        classSubject?.raw.type === "elective";

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        classSubjectId: Number(form.classSubjectId),
        assessmentStructureId: Number(form.assessmentStructureId),
        gradingSystemId: form.gradingSystemId ? Number(form.gradingSystemId) : undefined,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        active: form.active,
        locked: !!form.locked,
        isElective: !!inferredElective,
        groupCode: form.groupCode?.trim() || (inferredElective ? "elective" : "core"),
      }) as AssessmentApplicability;

      if (editMode && form.id) {
        await db.assessmentApplicabilities.update(form.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          classSubjectId: payload.classSubjectId,
          assessmentStructureId: payload.assessmentStructureId,
          gradingSystemId: payload.gradingSystemId,
          organizationId: payload.organizationId,
          active: payload.active,
          locked: payload.locked,
          isElective: payload.isElective,
          groupCode: payload.groupCode,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.assessmentApplicabilities.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save applicability:", error);
      alert("Failed to save applicability");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ApplicabilityView) => {
    if (!item.row.id) return;

    if (item.entryCount > 0) {
      const confirmed = confirm(
        `This applicability has ${item.entryCount} assessment entry record(s). Delete anyway?`
      );
      if (!confirmed) return;
    } else if (!confirm("Delete this applicability?")) {
      return;
    }

    await db.assessmentApplicabilities.update(item.row.id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: AssessmentApplicability) => {
    if (!row.id) return;
    await db.assessmentApplicabilities.update(row.id, {
      active: !row.active,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    });
    await load();
  };

  const toggleLocked = async (row: AssessmentApplicability) => {
    if (!row.id) return;
    await db.assessmentApplicabilities.update(row.id, {
      locked: !row.locked,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    });
    await load();
  };

  const createMissingForUncovered = async () => {
    if (!uncoveredClassSubjects.length) return;
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Select a branch first.");
      return;
    }

    if (!confirm(`Create applicability records for ${uncoveredClassSubjects.length} uncovered class subject(s)?`)) return;

    try {
      setSaving(true);

      for (const option of uncoveredClassSubjects) {
        const structure = structures.find(
          (item) => item.active !== false && item.academicStructureId === option.raw.academicStructureId
        );

        if (!structure?.id) continue;

        const elective = option.curriculumType === "elective" || option.raw.type === "elective";

        const payload = prepareSyncData({
          accountId,
          schoolId,
          branchId,
          classSubjectId: option.id,
          assessmentStructureId: structure.id,
          gradingSystemId: availableGradings.find((row) => row.default)?.id || availableGradings[0]?.id,
          organizationId: option.organizationId,
          active: true,
          locked: false,
          isElective: elective,
          groupCode: elective ? "elective" : "core",
        }) as AssessmentApplicability;

        await db.assessmentApplicabilities.add(payload);
      }

      await load();
    } catch (error) {
      console.error("Failed to create missing applicability records:", error);
      alert("Failed to create missing applicability records");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="aa-page" style={{ "--aa-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aa-state-card">
          <div className="aa-spinner" />
          <h2>Opening applicability engine...</h2>
          <p>Checking account, school, branch, class subjects, and assessment rules.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="aa-page" style={{ "--aa-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aa-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing assessment applicability.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="aa-page" style={{ "--aa-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="aa-state-card">
          <h2>Select a branch first</h2>
          <p>Assessment applicability belongs to one active school branch.</p>
          <button type="button" className="aa-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="aa-page" style={{ "--aa-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="aa-hero">
        <div className="aa-hero-left">
          <div className="aa-hero-icon">📚</div>
          <div className="aa-title-wrap">
            <p>Activation Engine</p>
            <h2>Assessment Applicability</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="aa-hero-actions">
          <button type="button" className="aa-ghost-btn" onClick={createMissingForUncovered} disabled={saving || !uncoveredClassSubjects.length}>
            Auto-cover Missing
          </button>
          <button type="button" className="aa-primary-btn" onClick={openCreate}>
            + Create
          </button>
        </div>
      </section>

      <section className="aa-summary-grid" aria-label="Assessment applicability summary">
        <SummaryCard label="Records" value={summary.total} icon="📌" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Class Subjects" value={summary.classSubjects} icon="📖" />
        <SummaryCard label="Uncovered" value={summary.uncovered} icon="⚠️" />
        <SummaryCard label="Entries" value={summary.entries} icon="📝" />
      </section>

      <section className="aa-filter-card">
        <input
          placeholder="Search class, subject, structure, grading, group..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterClassId || ""} onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterSubjectId || ""} onChange={(event) => setFilterSubjectId(Number(event.target.value) || undefined)}>
          <option value="">All Subjects</option>
          {subjects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStructureId || ""} onChange={(event) => setFilterStructureId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Structures</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Periods</option>
          {periods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterAssessmentStructureId || ""} onChange={(event) => setFilterAssessmentStructureId(Number(event.target.value) || undefined)}>
          <option value="">All Assessment Structures</option>
          {structures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterGradingSystemId || ""} onChange={(event) => setFilterGradingSystemId(Number(event.target.value) || undefined)}>
          <option value="">All Grading Systems</option>
          {gradings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterOrganizationId || ""} onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}>
          <option value="">All Organizations</option>
          {organizations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterGroupCode} onChange={(event) => setFilterGroupCode(event.target.value)}>
          <option value="">All Groups</option>
          {groupCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </section>

      {!classSubjectOptions.length && (
        <section className="aa-empty-card">
          <div className="aa-empty-icon">📖</div>
          <h3>No class subjects available</h3>
          <p>Create Class Subjects first before activating assessments.</p>
        </section>
      )}

      <section className="aa-list">
        {filteredRows.map((item) => {
          const row = item.row;
          const option = item.classSubject;

          return (
            <article key={row.id} className="aa-entity-card">
              <div className="aa-card-top">
                <div className="aa-card-main">
                  <div className="aa-card-icon">📝</div>
                  <div>
                    <h3>{option?.subjectName || "Unknown Subject"}</h3>
                    <p>{option?.className || "Unknown Class"} · {option?.academicStructureName || "Unknown structure"} · {option?.academicPeriodName || "All Periods"}</p>
                  </div>
                </div>

                <div className="aa-card-status">
                  <Chip tone={row.active ? "green" : "red"}>{row.active ? "Active" : "Inactive"}</Chip>
                </div>
              </div>

              <div className="aa-chip-row">
                {option?.subjectCode && <Chip tone="gray">{option.subjectCode}</Chip>}
                {row.locked && <Chip tone="orange">Locked</Chip>}
                {row.isElective && <Chip tone="purple">Elective</Chip>}
                {row.groupCode && <Chip tone="blue">{row.groupCode}</Chip>}
              </div>

              <p className="aa-subline">
                {option?.curriculumName || "No curriculum"} · {option?.pathwayName || "No pathway"} · {option?.teacherName || "No teacher"}
              </p>

              <div className="aa-rule-grid">
                <MiniStat label="Assessment" value={item.assessmentStructureName} />
                <MiniStat label="Grading" value={item.gradingSystemName} />
                <MiniStat label="Organization" value={item.organizationName} />
                <MiniStat label="Entries" value={`${item.entryCount}`} />
              </div>

              <div className="aa-action-row">
                <button type="button" onClick={() => toggleLocked(row)}>{row.locked ? "Unlock" : "Lock"}</button>
                <button type="button" onClick={() => toggleActive(row)}>{row.active ? "Deactivate" : "Activate"}</button>
                <button type="button" onClick={() => openEdit(row)}>Edit</button>
                <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
              </div>
            </article>
          );
        })}

        {!!classSubjectOptions.length && !filteredRows.length && (
          <section className="aa-empty-card">
            <div className="aa-empty-icon">🔎</div>
            <h3>No records found</h3>
            <p>No applicability records match your current filters.</p>
          </section>
        )}
      </section>

      {drawerOpen && (
        <div className="aa-drawer-layer">
          <button type="button" className="aa-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="aa-drawer">
            <div className="aa-drawer-head">
              <div>
                <p>{editMode ? "Update activation" : "New activation"}</p>
                <h2>{editMode ? "Edit Applicability" : "Create Applicability"}</h2>
                <span>Activate assessment rules for a class subject delivery context.</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="aa-form-grid">
              <Field label="Class Subject">
                <select
                  value={form.classSubjectId || ""}
                  onChange={(event) =>
                    updateForm({
                      classSubjectId: Number(event.target.value) || undefined,
                      assessmentStructureId: undefined,
                      organizationId: undefined,
                    })
                  }
                >
                  <option value="">Select Class Subject</option>
                  {classSubjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.display}</option>
                  ))}
                </select>
              </Field>

              {selectedClassSubject && (
                <section className="aa-selected-card">
                  <h3>{selectedClassSubject.subjectName}</h3>
                  <p>{selectedClassSubject.className} · {selectedClassSubject.academicStructureName} · {selectedClassSubject.academicPeriodName}</p>
                  <div className="aa-chip-row">
                    <Chip tone="blue">{selectedClassSubject.curriculumName}</Chip>
                    <Chip tone="gray">{selectedClassSubject.teacherName}</Chip>
                  </div>
                </section>
              )}

              <Field label="Assessment Structure">
                <select
                  value={form.assessmentStructureId || ""}
                  onChange={(event) => updateForm({ assessmentStructureId: Number(event.target.value) || undefined })}
                >
                  <option value="">Select Assessment Structure</option>
                  {availableStructures.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Grading System">
                <select
                  value={form.gradingSystemId || ""}
                  onChange={(event) => updateForm({ gradingSystemId: Number(event.target.value) || undefined })}
                >
                  <option value="">No grading system</option>
                  {availableGradings.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} {item.default ? "• Default" : ""}</option>
                  ))}
                </select>
              </Field>

              <Field label="Organization">
                <select
                  value={form.organizationId || ""}
                  onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                >
                  <option value="">No organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} • {item.type}</option>
                  ))}
                </select>
              </Field>

              <div className="aa-form-two">
                <Field label="Group Code">
                  <input
                    value={form.groupCode || ""}
                    onChange={(event) => updateForm({ groupCode: event.target.value })}
                    placeholder="core / elective / custom"
                  />
                </Field>

                <Check
                  label="Elective"
                  checked={!!form.isElective}
                  onChange={(checked) => updateForm({ isElective: checked, groupCode: checked ? "elective" : form.groupCode || "core" })}
                />
              </div>

              <Check label="Active" checked={form.active} onChange={(checked) => updateForm({ active: checked })} />
              <Check label="Locked" checked={!!form.locked} onChange={(checked) => updateForm({ locked: checked })} />
            </div>

            <button type="button" onClick={save} disabled={saving} className="aa-save-btn">
              {saving ? "Saving..." : editMode ? "Save Changes" : "Create Applicability"}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <article className="aa-summary-card">
      <div className="aa-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`aa-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="aa-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="aa-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="aa-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes aaSpin {
  to { transform: rotate(360deg); }
}

.aa-page {
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

.aa-page *,
.aa-page *::before,
.aa-page *::after {
  box-sizing: border-box;
}

.aa-page button,
.aa-page input,
.aa-page select,
.aa-page textarea {
  font: inherit;
  max-width: 100%;
}

.aa-page input,
.aa-page select {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.aa-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}

.aa-state-card h2 {
  margin: 0;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 1000;
  letter-spacing: -.04em;
}

.aa-state-card p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.aa-spinner {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--aa-primary) 18%, transparent);
  border-top-color: var(--aa-primary);
  animation: aaSpin .8s linear infinite;
}

.aa-primary-btn,
.aa-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--aa-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

.aa-primary-btn:disabled,
.aa-save-btn:disabled,
.aa-ghost-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.aa-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--aa-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}

.aa-hero-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
}

.aa-hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--aa-primary);
  color: #fff;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--aa-primary) 28%, transparent);
  font-size: 22px;
}

.aa-title-wrap {
  min-width: 0;
}

.aa-title-wrap p,
.aa-title-wrap h2,
.aa-title-wrap span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aa-title-wrap p {
  margin: 0 0 2px;
  color: var(--aa-primary);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.aa-title-wrap h2 {
  margin: 0;
  font-size: clamp(19px, 5vw, 28px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.aa-title-wrap span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
}

.aa-hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.aa-ghost-btn,
.aa-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.aa-action-row button.danger {
  color: #dc2626;
  background: rgba(239, 68, 68, .08);
  border-color: rgba(239, 68, 68, .12);
}

.aa-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.aa-summary-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .04);
  overflow: hidden;
}

.aa-summary-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--aa-primary) 12%, #fff);
}

.aa-summary-card div:last-child {
  min-width: 0;
}

.aa-summary-card strong,
.aa-summary-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aa-summary-card strong {
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.aa-summary-card span {
  margin-top: 2px;
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 850;
}

.aa-filter-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 16px 40px rgba(15, 23, 42, .055);
}

.aa-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.aa-entity-card,
.aa-empty-card {
  min-width: 0;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}

.aa-entity-card {
  padding: 13px;
}

.aa-empty-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 210px;
  padding: 22px;
  text-align: center;
  border-style: dashed;
}

.aa-empty-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--aa-primary) 12%, #fff);
  font-size: 28px;
}

.aa-empty-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 1000;
}

.aa-empty-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.aa-card-top,
.aa-card-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.aa-card-top {
  justify-content: space-between;
}

.aa-card-main {
  flex: 1 1 auto;
}

.aa-card-main > div:last-child,
.aa-card-status {
  min-width: 0;
}

.aa-card-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: color-mix(in srgb, var(--aa-primary) 12%, #fff);
}

.aa-card-main h3,
.aa-card-main p,
.aa-subline {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aa-card-main h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: -.035em;
}

.aa-card-main p,
.aa-subline {
  margin: 4px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.aa-subline {
  margin-top: 9px;
}

.aa-chip-row,
.aa-action-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.aa-chip {
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
}

.aa-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.aa-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.aa-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.aa-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.aa-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.aa-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }

.aa-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.aa-mini-stat {
  min-width: 0;
  display: block;
  padding: 9px;
  border-radius: 17px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .13);
  overflow: hidden;
}

.aa-mini-stat span,
.aa-mini-stat strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aa-mini-stat span {
  color: var(--muted, #64748b);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.aa-mini-stat strong {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 900;
}

.aa-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.aa-drawer-overlay {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, .52);
}

.aa-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(94vw, 560px);
  max-width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  padding: 14px;
  box-shadow: -24px 0 70px rgba(15, 23, 42, .22);
}

.aa-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 12px;
  background: var(--surface, #fff);
}

.aa-drawer-head div {
  min-width: 0;
}

.aa-drawer-head p {
  margin: 0;
  color: var(--aa-primary);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.aa-drawer-head h2,
.aa-drawer-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aa-drawer-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.aa-drawer-head span {
  margin-top: 3px;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.aa-drawer-head button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 15px;
  background: #fff;
  font-weight: 1000;
  cursor: pointer;
}

.aa-form-grid {
  display: grid;
  gap: 12px;
}

.aa-form-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.aa-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.aa-field > span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.aa-check,
.aa-selected-card {
  padding: 12px;
  border-radius: 18px;
  background: rgba(148, 163, 184, .09);
  border: 1px solid rgba(148, 163, 184, .14);
}

.aa-check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 850;
}

.aa-check input {
  width: 18px;
  min-height: 18px;
  flex: 0 0 auto;
}

.aa-selected-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 1000;
}

.aa-selected-card p {
  margin: 5px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.aa-save-btn {
  width: 100%;
  margin-top: 14px;
}

@media (min-width: 680px) {
  .aa-page {
    padding: 12px;
  }

  .aa-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .aa-filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aa-rule-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .aa-form-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .aa-page {
    padding: 16px;
  }

  .aa-summary-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .aa-filter-card {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .aa-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .aa-page {
    padding: 6px;
  }

  .aa-hero {
    flex-direction: column;
    border-radius: 22px;
    padding: 10px;
  }

  .aa-hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .aa-summary-grid {
    gap: 6px;
  }

  .aa-summary-card {
    padding: 10px;
    border-radius: 19px;
  }

  .aa-entity-card,
  .aa-empty-card {
    border-radius: 20px;
  }

  .aa-card-top {
    flex-direction: column;
  }

  .aa-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aa-action-row button {
    width: 100%;
    padding: 0 8px;
  }

  .aa-drawer {
    width: min(96vw, 560px);
    padding: 12px;
  }
}
`;
