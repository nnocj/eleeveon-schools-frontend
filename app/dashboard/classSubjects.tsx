"use client";

/**
 * classSubjects.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CLASS SUBJECT DELIVERY CONTEXT ENGINE
 * ---------------------------------------------------------
 *
 * CurriculumSubject defines the global subject rule.
 * ClassSubject turns that rule into a real class + period + teacher context.
 *
 * Source of truth used by:
 * - Assessment Applicability
 * - Assessment Entries
 * - Reports
 * - Broadsheets
 * - Computed Results
 *
 * DB matched to app/lib/db.ts:
 * - AcademicPeriod uses `order`
 * - CurriculumSubject uses `orderIndex`
 * - ClassSubject has accountId, schoolId, branchId, classId, subjectId,
 *   curriculumSubjectId, academicStructureId, optional academicPeriodId,
 *   optional teacherId, overrides, media, active, locked.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicPeriod,
  AcademicStructure,
  AssessmentApplicability,
  AssessmentEntry,
  Class,
  ClassSubject,
  CurriculumSubject,
  CurriculumSubjectType,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type SettingsLike = {
  currentAcademicStructureId?: number;
  currentAcademicPeriodId?: number;
} | null | undefined;

type FormState = {
  id?: number;
  classId?: number;
  subjectId?: number;
  curriculumSubjectId?: number;
  academicStructureId?: number;
  academicPeriodId?: number;
  teacherId?: number;
  name?: string;
  code?: string;
  credits?: number;
  contactHours?: number;
  type?: CurriculumSubjectType;
  compulsory?: boolean;
  elective?: boolean;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
  locked?: boolean;
};

type ClassSubjectView = {
  row: ClassSubject;
  className: string;
  subjectName: string;
  subjectCode?: string;
  teacherName: string;
  teacherPhoto?: string;
  structureName: string;
  periodName: string;
  curriculumLabel: string;
  applicabilityCount: number;
  entryCount: number;
};

const makeEmptyForm = (settings?: SettingsLike): FormState => ({
  classId: undefined,
  subjectId: undefined,
  curriculumSubjectId: undefined,
  academicStructureId: settings?.currentAcademicStructureId,
  academicPeriodId: settings?.currentAcademicPeriodId,
  teacherId: undefined,
  name: "",
  code: "",
  credits: undefined,
  contactHours: undefined,
  type: "core",
  compulsory: true,
  elective: false,
  photo: "",
  bannerImage: "",
  active: true,
  locked: false,
});

// ======================================================
// COMPONENT
// ======================================================

export default function ClassSubjectPage() {
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
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<ClassSubject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [applicabilities, setApplicabilities] = useState<AssessmentApplicability[]>([]);
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterPeriodId, setFilterPeriodId] = useState<number | undefined>();
  const [filterTeacherId, setFilterTeacherId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"all" | CurriculumSubjectType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "locked" | "unassigned">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(() => makeEmptyForm(settings));

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
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setRows([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAcademicStructures([]);
    setAcademicPeriods([]);
    setCurriculumSubjects([]);
    setApplicabilities([]);
    setEntries([]);
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
        classRows,
        subjectRows,
        teacherRows,
        structureRows,
        periodRows,
        curriculumSubjectRows,
        classSubjectRows,
        applicabilityRows,
        entryRows,
      ] = await Promise.all([
        db.classes.toArray(),
        db.subjects.toArray(),
        db.teachers.toArray(),
        db.academicStructures.toArray(),
        db.academicPeriods.toArray(),
        db.curriculumSubjects.toArray(),
        db.classSubjects.toArray(),
        db.assessmentApplicabilities.toArray(),
        db.assessmentEntries.toArray(),
      ]);

      setClasses(
        classRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setSubjects(
        subjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setTeachers(
        teacherRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicPeriods(
        periodRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      );

      setCurriculumSubjects(
        curriculumSubjectRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
      );

      setRows(classSubjectRows.filter(sameTenant));
      setApplicabilities(applicabilityRows.filter(sameTenant));
      setEntries(entryRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load class subjects:", error);
      clearData();
      alert("Failed to load class subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const classMap = useMemo(() => new Map(classes.map((row) => [row.id, row])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((row) => [row.id, row])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((row) => [row.id, row])), [teachers]);

  const academicStructureMap = useMemo(
    () => new Map(academicStructures.map((row) => [row.id, row])),
    [academicStructures]
  );

  const academicPeriodMap = useMemo(
    () => new Map(academicPeriods.map((row) => [row.id, row])),
    [academicPeriods]
  );

  const curriculumSubjectMap = useMemo(
    () => new Map(curriculumSubjects.map((row) => [row.id, row])),
    [curriculumSubjects]
  );

  const availablePeriods = useMemo(() => {
    return academicPeriods
      .filter((period) => {
        if (!form.academicStructureId) return true;
        return period.academicStructureId === Number(form.academicStructureId);
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }, [academicPeriods, form.academicStructureId]);

  const availableCurriculumSubjects = useMemo(() => {
    return curriculumSubjects
      .filter((row) => {
        if (form.subjectId && row.subjectId !== Number(form.subjectId)) return false;
        return true;
      })
      .sort((a, b) => {
        const orderCompare = Number(a.orderIndex || 0) - Number(b.orderIndex || 0);
        if (orderCompare !== 0) return orderCompare;

        const subjectA = subjectMap.get(a.subjectId)?.name || "";
        const subjectB = subjectMap.get(b.subjectId)?.name || "";
        return subjectA.localeCompare(subjectB);
      });
  }, [curriculumSubjects, form.subjectId, subjectMap]);

  const applicabilityCounts = useMemo(() => {
    const map = new Map<number, number>();

    applicabilities.forEach((row) => {
      map.set(row.classSubjectId, (map.get(row.classSubjectId) || 0) + 1);
    });

    return map;
  }, [applicabilities]);

  const entryCounts = useMemo(() => {
    const map = new Map<number, number>();

    entries.forEach((row) => {
      if (!row.classSubjectId) return;
      map.set(row.classSubjectId, (map.get(row.classSubjectId) || 0) + 1);
    });

    return map;
  }, [entries]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ClassSubjectView[]>(() => {
    return rows.map((row) => {
      const classData = classMap.get(row.classId);
      const subject = subjectMap.get(row.subjectId);
      const teacher = row.teacherId ? teacherMap.get(row.teacherId) : undefined;
      const structure = academicStructureMap.get(row.academicStructureId);
      const period = row.academicPeriodId ? academicPeriodMap.get(row.academicPeriodId) : undefined;
      const curriculumSubject = curriculumSubjectMap.get(row.curriculumSubjectId);
      const curriculumSubjectName = curriculumSubject
        ? subjectMap.get(curriculumSubject.subjectId)?.name || `Curriculum Subject #${curriculumSubject.id}`
        : "No curriculum link";

      return {
        row,
        className: classData?.name || "Unknown Class",
        subjectName: row.name || subject?.name || "Unknown Subject",
        subjectCode: row.code || subject?.code,
        teacherName: teacher?.fullName || "Unassigned",
        teacherPhoto: teacher?.photo,
        structureName: structure?.name || "Unknown Structure",
        periodName: period?.name || "All Periods",
        curriculumLabel: curriculumSubjectName,
        applicabilityCount: applicabilityCounts.get(row.id || 0) || 0,
        entryCount: entryCounts.get(row.id || 0) || 0,
      };
    });
  }, [
    rows,
    classMap,
    subjectMap,
    teacherMap,
    academicStructureMap,
    academicPeriodMap,
    curriculumSubjectMap,
    applicabilityCounts,
    entryCounts,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterClassId && row.classId !== filterClassId) return false;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterPeriodId && row.academicPeriodId !== filterPeriodId) return false;
        if (filterTeacherId && row.teacherId !== filterTeacherId) return false;
        if (filterType !== "all" && row.type !== filterType) return false;

        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && !row.locked) return false;
        if (filterStatus === "unassigned" && !!row.teacherId) return false;

        if (!query) return true;

        return `
          ${item.className}
          ${item.subjectName}
          ${item.subjectCode || ""}
          ${item.teacherName}
          ${item.structureName}
          ${item.periodName}
          ${item.curriculumLabel}
          ${row.type || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const classCompare = a.className.localeCompare(b.className);
        if (classCompare !== 0) return classCompare;
        return a.subjectName.localeCompare(b.subjectName);
      });
  }, [
    viewRows,
    search,
    filterClassId,
    filterStructureId,
    filterPeriodId,
    filterTeacherId,
    filterType,
    filterStatus,
  ]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      locked: rows.filter((row) => row.locked).length,
      teachersAssigned: rows.filter((row) => !!row.teacherId).length,
      withApplicability: rows.filter((row) => applicabilityCounts.get(row.id || 0)).length,
      withEntries: rows.filter((row) => entryCounts.get(row.id || 0)).length,
    };
  }, [rows, applicabilityCounts, entryCounts]);

  // ======================================================
  // SMART DEFAULTS
  // ======================================================

  useEffect(() => {
    if (!form.curriculumSubjectId) return;

    const curriculumSubject = curriculumSubjectMap.get(form.curriculumSubjectId);
    if (!curriculumSubject) return;

    setForm((prev) => {
      const inferredType = prev.type || curriculumSubject.type || "core";

      return {
        ...prev,
        subjectId: curriculumSubject.subjectId,
        credits: prev.credits ?? curriculumSubject.credits,
        contactHours: prev.contactHours ?? curriculumSubject.contactHours,
        type: inferredType,
        compulsory: prev.compulsory ?? inferredType !== "elective",
        elective: prev.elective ?? inferredType === "elective",
      };
    });
  }, [form.curriculumSubjectId, curriculumSubjectMap]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (field: "photo" | "bannerImage", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setEditMode(false);
    setForm(makeEmptyForm(settings));
    setDrawerOpen(true);
  };

  const openEdit = (row: ClassSubject) => {
    setEditMode(true);
    setForm({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      curriculumSubjectId: row.curriculumSubjectId,
      academicStructureId: row.academicStructureId,
      academicPeriodId: row.academicPeriodId,
      teacherId: row.teacherId,
      name: row.name || "",
      code: row.code || "",
      credits: row.credits,
      contactHours: row.contactHours,
      type: row.type || "core",
      compulsory: row.compulsory ?? true,
      elective: row.elective ?? false,
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      active: row.active ?? true,
      locked: row.locked ?? false,
    });
    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId || !branchId) return "Select a branch first";
    if (!form.classId) return "Select a class";
    if (!form.subjectId) return "Select a subject";
    if (!form.curriculumSubjectId) return "Select a curriculum subject";
    if (!form.academicStructureId) return "Select an academic structure";
    if (form.credits !== undefined && Number(form.credits) < 0) return "Credits cannot be negative";
    if (form.contactHours !== undefined && Number(form.contactHours) < 0) return "Contact hours cannot be negative";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      return (
        row.classId === Number(form.classId) &&
        row.subjectId === Number(form.subjectId) &&
        row.academicStructureId === Number(form.academicStructureId) &&
        (row.academicPeriodId || 0) === Number(form.academicPeriodId || 0) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "This class subject already exists for the selected class, structure and period";
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

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        classId: Number(form.classId),
        subjectId: Number(form.subjectId),
        curriculumSubjectId: Number(form.curriculumSubjectId),
        academicStructureId: Number(form.academicStructureId),
        academicPeriodId: form.academicPeriodId ? Number(form.academicPeriodId) : undefined,
        teacherId: form.teacherId ? Number(form.teacherId) : undefined,
        name: form.name?.trim() || undefined,
        code: form.code?.trim() || undefined,
        credits: form.credits == null ? undefined : Number(form.credits),
        contactHours: form.contactHours == null ? undefined : Number(form.contactHours),
        type: form.type,
        compulsory: !!form.compulsory,
        elective: !!form.elective,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        active: form.active !== false,
        locked: !!form.locked,
      }) as ClassSubject;

      if (editMode && form.id) {
        await db.classSubjects.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.classSubjects.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save class subject:", error);
      alert("Failed to save class subject");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const appCount = applicabilityCounts.get(id) || 0;
    const entryCount = entryCounts.get(id) || 0;

    if (appCount || entryCount) {
      const proceed = confirm(
        `This class subject has ${appCount} assessment applicability record(s) and ${entryCount} assessment entry record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this class subject?")) {
      return;
    }

    await db.classSubjects.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: ClassSubject) => {
    if (!row.id) return;

    await db.classSubjects.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleLocked = async (row: ClassSubject) => {
    if (!row.id) return;

    await db.classSubjects.update(row.id, {
      locked: !row.locked,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || loading) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <div className="cs-spinner" />
          <h2>Opening class subjects...</h2>
          <p>Checking account, branch, classes, curriculum subjects, teachers, and delivery contexts.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing class subjects.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cs-state-card">
          <h2>Select a branch first</h2>
          <p>Class subject delivery contexts belong to one active school branch.</p>
          <button type="button" className="cs-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cs-page" style={{ "--cs-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cs-hero">
        <div className="cs-hero-left">
          <div className="cs-hero-icon">📖</div>
          <div className="cs-title-wrap">
            <p>Delivery Context</p>
            <h2>Class Subjects</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="cs-primary-btn" onClick={openCreate}>
          + Create Class Subject
        </button>
      </section>

      <section className="cs-summary-grid" aria-label="Class subject summary">
        <SummaryCard label="Total" value={summary.total} icon="📚" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Locked" value={summary.locked} icon="🔒" />
        <SummaryCard label="Teachers Assigned" value={summary.teachersAssigned} icon="👨‍🏫" />
        <SummaryCard label="Applicability Ready" value={summary.withApplicability} icon="🎯" />
      </section>

      <section className="cs-filter-card">
        <input
          placeholder="Search class, subject, teacher, period..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterClassId || ""} onChange={(event) => setFilterClassId(Number(event.target.value) || undefined)}>
          <option value="">All Classes</option>
          {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStructureId || ""} onChange={(event) => setFilterStructureId(Number(event.target.value) || undefined)}>
          <option value="">All Structures</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterPeriodId || ""} onChange={(event) => setFilterPeriodId(Number(event.target.value) || undefined)}>
          <option value="">All Periods</option>
          {academicPeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterTeacherId || ""} onChange={(event) => setFilterTeacherId(Number(event.target.value) || undefined)}>
          <option value="">All Teachers</option>
          {teachers.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}
        </select>

        <select value={filterType} onChange={(event) => setFilterType(event.target.value as any)}>
          <option value="all">All Types</option>
          <option value="core">Core</option>
          <option value="elective">Elective</option>
          <option value="optional">Optional</option>
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
          <option value="unassigned">Unassigned Teacher</option>
        </select>
      </section>

      <section className="cs-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="cs-entity-card">
              {row.bannerImage && (
                <div
                  className="cs-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="cs-card-body">
                <div className="cs-card-top">
                  <Avatar name={item.subjectName} photo={row.photo} primary={primary} />

                  <div className="cs-card-main">
                    <h3>{item.subjectName}</h3>
                    <p>{item.className} · {item.periodName} · {item.structureName}</p>
                    <div className="cs-chip-row">
                      {item.subjectCode && <Chip tone="gray">{item.subjectCode}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      <Chip tone={row.locked ? "orange" : "gray"}>{row.locked ? "Locked" : "Unlocked"}</Chip>
                      <Chip tone={row.type === "elective" ? "blue" : "gray"}>{row.type || "core"}</Chip>
                      <Chip tone={row.elective ? "blue" : "green"}>{row.elective ? "Elective" : "Compulsory"}</Chip>
                    </div>
                  </div>
                </div>

                <p className="cs-subline">{item.curriculumLabel} · {item.teacherName}</p>

                <div className="cs-stat-grid">
                  <MiniStat label="Credits" value={row.credits ?? "-"} />
                  <MiniStat label="Hours" value={row.contactHours ?? "-"} />
                  <MiniStat label="Rules" value={item.applicabilityCount} />
                  <MiniStat label="Entries" value={item.entryCount} />
                </div>

                <div className="cs-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => toggleLocked(row)}>{row.locked ? "Unlock" : "Lock"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No class subjects found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="cs-drawer-layer">
          <button type="button" className="cs-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="cs-drawer">
            <div className="cs-drawer-head">
              <div>
                <p>Delivery Setup</p>
                <h2>{editMode ? "Edit Class Subject" : "Create Class Subject"}</h2>
                <span>
                  This delivery context will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="cs-form-grid">
              <Field label="Class">
                <select value={form.classId || ""} onChange={(event) => updateForm({ classId: Number(event.target.value) || undefined })}>
                  <option value="">Select Class</option>
                  {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Subject">
                <select
                  value={form.subjectId || ""}
                  onChange={(event) => updateForm({ subjectId: Number(event.target.value) || undefined, curriculumSubjectId: undefined })}
                >
                  <option value="">Select Subject</option>
                  {subjects.map((row) => <option key={row.id} value={row.id}>{row.name} {row.code ? `(${row.code})` : ""}</option>)}
                </select>
              </Field>

              <Field label="Curriculum Subject">
                <select value={form.curriculumSubjectId || ""} onChange={(event) => updateForm({ curriculumSubjectId: Number(event.target.value) || undefined })}>
                  <option value="">Select Curriculum Subject</option>
                  {availableCurriculumSubjects.map((row) => {
                    const subject = subjectMap.get(row.subjectId);
                    return (
                      <option key={row.id} value={row.id}>
                        {subject?.name || "Subject"} • {row.type || "core"}{row.credits ? ` • ${row.credits} credits` : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <div className="cs-form-two">
                <Field label="Academic Structure">
                  <select
                    value={form.academicStructureId || ""}
                    onChange={(event) => updateForm({ academicStructureId: Number(event.target.value) || undefined, academicPeriodId: undefined })}
                  >
                    <option value="">Select Structure</option>
                    {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.level})</option>)}
                  </select>
                </Field>

                <Field label="Academic Period">
                  <select value={form.academicPeriodId || ""} onChange={(event) => updateForm({ academicPeriodId: Number(event.target.value) || undefined })}>
                    <option value="">All Periods / Not Specific</option>
                    {availablePeriods.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Teacher">
                <select value={form.teacherId || ""} onChange={(event) => updateForm({ teacherId: Number(event.target.value) || undefined })}>
                  <option value="">Unassigned</option>
                  {teachers.map((row) => <option key={row.id} value={row.id}>{row.fullName} • {row.role}</option>)}
                </select>
              </Field>

              <div className="cs-form-two">
                <Field label="Display Name Override">
                  <input value={form.name || ""} onChange={(event) => updateForm({ name: event.target.value })} placeholder="Optional subject name override" />
                </Field>

                <Field label="Code Override">
                  <input value={form.code || ""} onChange={(event) => updateForm({ code: event.target.value })} placeholder="Optional code" />
                </Field>
              </div>

              <div className="cs-form-three">
                <Field label="Credits">
                  <input type="number" value={form.credits ?? ""} onChange={(event) => updateForm({ credits: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Credits" />
                </Field>

                <Field label="Contact Hours">
                  <input type="number" value={form.contactHours ?? ""} onChange={(event) => updateForm({ contactHours: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Hours" />
                </Field>

                <Field label="Type">
                  <select
                    value={form.type || "core"}
                    onChange={(event) => updateForm({
                      type: event.target.value as CurriculumSubjectType,
                      elective: event.target.value === "elective",
                      compulsory: event.target.value !== "elective",
                    })}
                  >
                    <option value="core">Core</option>
                    <option value="elective">Elective</option>
                    <option value="optional">Optional</option>
                  </select>
                </Field>
              </div>

              <div className="cs-check-grid">
                <Check label="Compulsory" checked={!!form.compulsory} onChange={(checked) => updateForm({ compulsory: checked })} />
                <Check label="Elective" checked={!!form.elective} onChange={(checked) => updateForm({ elective: checked })} />
                <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />
                <Check label="Locked" checked={!!form.locked} onChange={(checked) => updateForm({ locked: checked })} />
              </div>

              <Field label="Subject Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Subject" className="cs-preview-photo" />}
              </Field>

              <Field label="Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Banner" className="cs-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="cs-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Class Subject"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="cs-summary-card">
      <div className="cs-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div
      className="cs-avatar"
      style={{
        background: photo
          ? `url(${photo}) center/cover`
          : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
      }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" }) {
  return <span className={`cs-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cs-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cs-empty-card">
      <div className="cs-empty-icon">📖</div>
      <h3>No class subjects found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cs-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="cs-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes csSpin { to { transform: rotate(360deg); } }

.cs-page {
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

.cs-page *,
.cs-page *::before,
.cs-page *::after { box-sizing: border-box; }
.cs-page button,
.cs-page input,
.cs-page select,
.cs-page textarea { font: inherit; max-width: 100%; }
.cs-page img { max-width: 100%; }

.cs-page input,
.cs-page select {
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

.cs-state-card {
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
.cs-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.cs-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.cs-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--cs-primary) 18%, transparent); border-top-color: var(--cs-primary); animation: csSpin .8s linear infinite; }

.cs-primary-btn,
.cs-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--cs-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.cs-primary-btn:disabled,
.cs-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.cs-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cs-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.cs-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.cs-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--cs-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--cs-primary) 28%, transparent); font-size: 22px; }
.cs-title-wrap { min-width: 0; }
.cs-title-wrap p,
.cs-title-wrap h2,
.cs-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-title-wrap p { margin: 0 0 2px; color: var(--cs-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cs-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.cs-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.cs-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.cs-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.cs-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--cs-primary) 12%, #fff); }
.cs-summary-card div:last-child { min-width: 0; }
.cs-summary-card strong,
.cs-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cs-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.cs-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.cs-list { display: grid; gap: 10px; margin-top: 10px; }
.cs-entity-card,
.cs-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.cs-card-banner { height: 82px; background-size: cover; background-position: center; }
.cs-card-body { padding: 13px; }
.cs-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.cs-avatar { width: 54px; height: 54px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.cs-card-main { min-width: 0; flex: 1; }
.cs-card-main h3,
.cs-card-main p,
.cs-subline { display: block; overflow: hidden; text-overflow: ellipsis; }
.cs-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.cs-card-main p,
.cs-subline { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.cs-subline { margin-top: 9px; }
.cs-chip-row,
.cs-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.cs-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cs-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cs-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cs-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cs-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.cs-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.cs-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.cs-mini-stat strong,
.cs-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-mini-stat strong { font-size: 17px; font-weight: 1000; }
.cs-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.cs-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.cs-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.cs-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.cs-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--cs-primary) 12%, #fff); font-size: 28px; }
.cs-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.cs-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.cs-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.cs-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.cs-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 580px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.cs-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.cs-drawer-head div { min-width: 0; }
.cs-drawer-head p { margin: 0; color: var(--cs-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cs-drawer-head h2,
.cs-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.cs-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cs-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.cs-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.cs-form-grid { display: grid; gap: 12px; }
.cs-form-two,
.cs-form-three,
.cs-check-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.cs-field { display: grid; gap: 6px; min-width: 0; }
.cs-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.cs-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.cs-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.cs-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cs-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cs-save-btn { width: 100%; }

@media (min-width: 680px) {
  .cs-page { padding: 12px; }
  .cs-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cs-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-form-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cs-check-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .cs-page { padding: 16px; }
  .cs-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cs-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .cs-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .cs-page { padding: 6px; }
  .cs-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cs-primary-btn { width: 100%; }
  .cs-summary-grid { gap: 6px; }
  .cs-summary-card { padding: 10px; border-radius: 19px; }
  .cs-entity-card,
  .cs-empty-card { border-radius: 20px; }
  .cs-card-body { padding: 11px; }
  .cs-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-action-row button { width: 100%; padding: 0 8px; }
  .cs-drawer { width: min(96vw, 580px); padding: 12px; }
}
`;
