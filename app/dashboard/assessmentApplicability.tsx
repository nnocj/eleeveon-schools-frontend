"use client";

/**
 * assessmentApplicability.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL ASSESSMENT APPLICABILITY ENGINE
 * ---------------------------------------------------------
 *
 * IMPORTANT DB ALIGNMENT FIX
 * ---------------------------------------------------------
 * This version fixes the TypeScript errors caused by assuming
 * fields that do NOT exist in your current db.ts:
 *
 * - ClassSubject does NOT have organizationId
 * - AssessmentEntry does NOT have assessmentApplicabilityId
 * - AssessmentEntry is linked by classSubjectId / assessmentStructureId / gradingSystemId
 * - Avoids mixing ?? and || without parentheses
 *
 * ACTUAL ARCHITECTURE
 * ---------------------------------------------------------
 * ClassSubject is the real delivery context.
 * AssessmentApplicability activates assessment rules for a ClassSubject.
 * AssessmentEntry records are counted by matching:
 * - classSubjectId
 * - assessmentStructureId
 * - gradingSystemId when available
 *
 * ClassSubject -> AssessmentApplicability -> AssessmentEntries -> ComputedResults -> Reports
 */

import React, { useEffect, useMemo, useState } from "react";

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

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

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

// ======================================================
// COMPONENT
// ======================================================

export default function AssessmentApplicabilityPage() {
  const { settings } = useSettings();
  const {
    activeSchool,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const branchId = activeBranchId || settings?.branchId || 1;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
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
  const [filterGroupCode, setFilterGroupCode] = useState<string>("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
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
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

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

      setRows(applicabilityRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClassSubjects(classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculumSubjects(curriculumSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setCurriculums(curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPathways(pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setSubjects(subjectRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setClasses(classRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setTeachers(teacherRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setAcademicStructures(academicStructureRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setPeriods(periodRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setOrganizations(organizationRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setStructures(structureRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setGradings(gradingRows.filter(row => row.branchId === branchId && !row.isDeleted));
      setEntries(entryRows.filter(row => row.branchId === branchId && !row.isDeleted));
    } catch (error) {
      console.error("Failed to load assessment applicability data:", error);
      alert("Failed to load assessment applicability data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const subjectMap = useMemo(() => new Map(subjects.map(row => [row.id, row])), [subjects]);
  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);
  const teacherMap = useMemo(() => new Map(teachers.map(row => [row.id, row])), [teachers]);
  const structureMap = useMemo(() => new Map(academicStructures.map(row => [row.id, row])), [academicStructures]);
  const periodMap = useMemo(() => new Map(periods.map(row => [row.id, row])), [periods]);
  const organizationMap = useMemo(() => new Map(organizations.map(row => [row.id, row])), [organizations]);
  const assessmentStructureMap = useMemo(() => new Map(structures.map(row => [row.id, row])), [structures]);
  const gradingMap = useMemo(() => new Map(gradings.map(row => [row.id, row])), [gradings]);
  const curriculumSubjectMap = useMemo(() => new Map(curriculumSubjects.map(row => [row.id, row])), [curriculumSubjects]);
  const curriculumMap = useMemo(() => new Map(curriculums.map(row => [row.id, row])), [curriculums]);
  const pathwayMap = useMemo(() => new Map(pathways.map(row => [row.id, row])), [pathways]);

  const classSubjectOptions = useMemo<ClassSubjectOption[]>(() => {
    return classSubjects
      .filter(row => row.active !== false)
      .map(row => {
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
    () => new Map(classSubjectOptions.map(row => [row.id, row])),
    [classSubjectOptions]
  );

  const selectedClassSubject = useMemo(() => {
    if (!form.classSubjectId) return undefined;
    return classSubjectOptionMap.get(form.classSubjectId);
  }, [form.classSubjectId, classSubjectOptionMap]);

  const availableStructures = useMemo(() => {
    if (!selectedClassSubject) return structures.filter(row => row.active !== false);

    return structures.filter(row => {
      if (row.active === false) return false;
      return row.academicStructureId === selectedClassSubject.raw.academicStructureId;
    });
  }, [selectedClassSubject, structures]);

  const availableGradings = useMemo(() => {
    return gradings.filter(row => row.active !== false);
  }, [gradings]);

  const entryCountByApplicability = useMemo(() => {
    const map = new Map<number, number>();

    rows.forEach(app => {
      if (!app.id) return;

      const count = entries.filter(entry => {
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
    return Array.from(new Set(rows.map(row => row.groupCode).filter(Boolean) as string[])).sort();
  }, [rows]);

  // ======================================================
  // SMART DEFAULTS
  // ======================================================

  useEffect(() => {
    if (!form.classSubjectId || !selectedClassSubject) return;

    const isSelectedElective =
      selectedClassSubject.curriculumType === "elective" || selectedClassSubject.raw.type === "elective";

    setForm(prev => ({
      ...prev,
      organizationId: prev.organizationId || selectedClassSubject.organizationId,
      isElective: prev.isElective || isSelectedElective,
      groupCode: prev.groupCode || (isSelectedElective ? "elective" : "core"),
      assessmentStructureId: prev.assessmentStructureId || availableStructures[0]?.id,
      gradingSystemId:
        prev.gradingSystemId ||
        availableGradings.find(row => row.default)?.id ||
        availableGradings[0]?.id,
    }));
  }, [form.classSubjectId, selectedClassSubject, availableStructures, availableGradings]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ApplicabilityView[]>(() => {
    return rows.map(row => {
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
      .filter(item => {
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
    const covered = new Set(rows.filter(row => row.active !== false).map(row => row.classSubjectId));
    return classSubjectOptions.filter(option => !covered.has(option.id));
  }, [rows, classSubjectOptions]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter(row => row.active).length,
      inactive: rows.filter(row => !row.active).length,
      locked: rows.filter(row => row.locked).length,
      elective: rows.filter(row => row.isElective).length,
      classSubjects: classSubjectOptions.length,
      uncovered: uncoveredClassSubjects.length,
      entries: entries.length,
    };
  }, [rows, classSubjectOptions, uncoveredClassSubjects, entries]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating assessment applicability.");
      return;
    }

    setEditMode(false);
    setForm({
      classSubjectId: undefined,
      organizationId: undefined,
      assessmentStructureId: undefined,
      gradingSystemId: availableGradings.find(row => row.default)?.id || availableGradings[0]?.id,
      active: true,
      locked: false,
      isElective: false,
      groupCode: "core",
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
    if (!branchId) return "Select a branch first";
    if (!form.classSubjectId) return "Select class subject";
    if (!form.assessmentStructureId) return "Select assessment structure";

    const classSubject = classSubjectOptionMap.get(Number(form.classSubjectId));
    const assessmentStructure = assessmentStructureMap.get(Number(form.assessmentStructureId));

    if (!classSubject) return "Class subject not found";
    if (!assessmentStructure) return "Assessment structure not found";

    if (assessmentStructure.academicStructureId !== classSubject.raw.academicStructureId) {
      return "Assessment structure must belong to the same academic structure as the class subject";
    }

    const duplicate = rows.find(row => {
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
    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const classSubject = classSubjectOptionMap.get(Number(form.classSubjectId));
      const inferredElective =
        form.isElective ||
        classSubject?.curriculumType === "elective" ||
        classSubject?.raw.type === "elective";

      const payload = prepareSyncData({
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
    } else {
      if (!confirm("Delete this applicability?")) return;
    }

    await db.assessmentApplicabilities.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: AssessmentApplicability) => {
    if (!row.id) return;
    await db.assessmentApplicabilities.update(row.id, {
      active: !row.active,
      updatedAt: Date.now(),
    });
    await load();
  };

  const toggleLocked = async (row: AssessmentApplicability) => {
    if (!row.id) return;
    await db.assessmentApplicabilities.update(row.id, {
      locked: !row.locked,
      updatedAt: Date.now(),
    });
    await load();
  };

  const createMissingForUncovered = async () => {
    if (!uncoveredClassSubjects.length) return;
    if (!confirm(`Create applicability records for ${uncoveredClassSubjects.length} uncovered class subject(s)?`)) return;

    try {
      setSaving(true);

      for (const option of uncoveredClassSubjects) {
        const structure = structures.find(
          item => item.active !== false && item.academicStructureId === option.raw.academicStructureId
        );

        if (!structure?.id) continue;

        const elective = option.curriculumType === "elective" || option.raw.type === "elective";

        const payload = prepareSyncData({
          branchId,
          classSubjectId: option.id,
          assessmentStructureId: structure.id,
          gradingSystemId: availableGradings.find(row => row.default)?.id || availableGradings[0]?.id,
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
  // STYLES
  // ======================================================

  const card: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(0,0,0,0.05)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 650,
  };

  const label: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    opacity: 0.72,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  const button: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    background: primary,
    color: "#fff",
    fontWeight: 850,
    cursor: "pointer",
  };

  const ghostButton: React.CSSProperties = {
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 750,
    cursor: "pointer",
  };

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange" | "purple"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
      purple: { bg: "rgba(147,51,234,0.12)", color: "#7e22ce" },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: tones.bg,
      color: tones.color,
      fontSize: 11,
      fontWeight: 850,
    };
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading assessment applicability engine...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Assessment applicability belongs to a branch. Select a school and branch first.
          </p>
        </div>
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Assessment Applicability</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Activating assessment rules for class subjects in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={createMissingForUncovered} style={ghostButton} disabled={saving}>
            Auto-cover Missing
          </button>
          <button type="button" onClick={openCreate} style={button}>
            + Create Applicability
          </button>
        </div>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Applicability Records</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Class Subjects</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.classSubjects}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Uncovered</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.uncovered}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Entry Records</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.entries}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 12,
        }}
      >
        <input
          placeholder="Search class, subject, structure, grading, group..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select value={filterClassId || ""} onChange={e => setFilterClassId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Classes</option>
          {classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterSubjectId || ""} onChange={e => setFilterSubjectId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Subjects</option>
          {subjects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStructureId || ""} onChange={e => setFilterStructureId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Academic Structures</option>
          {academicStructures.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPeriodId || ""} onChange={e => setFilterPeriodId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Academic Periods</option>
          {periods.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterAssessmentStructureId || ""} onChange={e => setFilterAssessmentStructureId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Assessment Structures</option>
          {structures.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterGradingSystemId || ""} onChange={e => setFilterGradingSystemId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Grading Systems</option>
          {gradings.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterOrganizationId || ""} onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)} style={input}>
          <option value="">All Organizations</option>
          {organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterGroupCode} onChange={e => setFilterGroupCode(e.target.value)} style={input}>
          <option value="">All Groups</option>
          {groupCodes.map(code => <option key={code} value={code}>{code}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={input}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {!classSubjectOptions.length && (
        <div style={{ ...card, marginTop: 18, textAlign: "center", padding: 30 }}>
          No class subjects available. Create Class Subjects first before activating assessments.
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;
          const option = item.classSubject;

          return (
            <div key={row.id} style={card}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{option?.subjectName || "Unknown Subject"}</div>
                    {option?.subjectCode && <span style={badge("gray")}>{option.subjectCode}</span>}
                    <span style={badge(row.active ? "green" : "red")}>{row.active ? "Active" : "Inactive"}</span>
                    {row.locked && <span style={badge("orange")}>Locked</span>}
                    {row.isElective && <span style={badge("purple")}>Elective</span>}
                    {row.groupCode && <span style={badge("blue")}>{row.groupCode}</span>}
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                    {option?.className || "Unknown Class"} • {option?.academicStructureName || "Unknown structure"} • {option?.academicPeriodName || "All Periods"}
                  </div>

                  <div style={{ marginTop: 7, opacity: 0.68, fontSize: 13 }}>
                    {option?.curriculumName || "No curriculum"} • {option?.pathwayName || "No pathway"} • {option?.teacherName || "No teacher"}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>{item.assessmentStructureName}</span>
                    <span style={badge("purple")}>{item.gradingSystemName}</span>
                    <span style={badge("gray")}>{item.organizationName}</span>
                    <span style={badge(item.entryCount ? "green" : "gray")}>{item.entryCount} entry record(s)</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleLocked(row)}>
                    {row.locked ? "Unlock" : "Lock"}
                  </button>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(item)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!!classSubjectOptions.length && !filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No applicability records found in this branch.
          </div>
        )}
      </div>

      {/* DRAWER */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              width: "min(650px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Applicability" : "Create Applicability"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Activate assessment for a class subject delivery context.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Class Subject</label>
                <select
                  value={form.classSubjectId || ""}
                  onChange={e =>
                    updateForm({
                      classSubjectId: Number(e.target.value) || undefined,
                      assessmentStructureId: undefined,
                      organizationId: undefined,
                    })
                  }
                  style={input}
                >
                  <option value="">Select Class Subject</option>
                  {classSubjectOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>

              {selectedClassSubject && (
                <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>{selectedClassSubject.subjectName}</div>
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
                    {selectedClassSubject.className} • {selectedClassSubject.academicStructureName} • {selectedClassSubject.academicPeriodName}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={badge("blue")}>{selectedClassSubject.curriculumName}</span>
                    <span style={badge("gray")}>{selectedClassSubject.teacherName}</span>
                  </div>
                </div>
              )}

              <div>
                <label style={label}>Assessment Structure</label>
                <select
                  value={form.assessmentStructureId || ""}
                  onChange={e => updateForm({ assessmentStructureId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Assessment Structure</option>
                  {availableStructures.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Grading System</label>
                <select
                  value={form.gradingSystemId || ""}
                  onChange={e => updateForm({ gradingSystemId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No grading system</option>
                  {availableGradings.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.default ? "• Default" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Organization</label>
                <select
                  value={form.organizationId || ""}
                  onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No organization</option>
                  {organizations.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} • {item.type}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Group Code</label>
                  <input
                    value={form.groupCode || ""}
                    onChange={e => updateForm({ groupCode: e.target.value })}
                    placeholder="core / elective / custom"
                    style={input}
                  />
                </div>

                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input
                    type="checkbox"
                    checked={!!form.isElective}
                    onChange={e => updateForm({ isElective: e.target.checked, groupCode: e.target.checked ? "elective" : form.groupCode || "core" })}
                  />
                  Elective
                </label>
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => updateForm({ active: e.target.checked })}
                />
                Active
              </label>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                <input
                  type="checkbox"
                  checked={!!form.locked}
                  onChange={e => updateForm({ locked: e.target.checked })}
                />
                Locked
              </label>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Applicability"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
