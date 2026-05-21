"use client";

/**
 * curriculumManagement.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE CURRICULUM MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: curriculums
 * Supporting tables:
 * - programs
 * - academicStructures
 * - organizations
 * - curriculumSubjects
 * - curriculumPathways
 * - studentCurriculums
 *
 * Architecture:
 * Program CRUD is handled in Programs.tsx.
 * This page only creates and manages Curriculum records.
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first cards and drawer UI.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import {
  db,
  AcademicStructure,
  Curriculum,
  CurriculumPathway,
  CurriculumSubject,
  Organization,
  Program,
  StudentCurriculum,
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

type FormState = {
  id?: number;
  organizationId?: number;
  programId?: number;
  academicStructureId?: number;
  name: string;
  code?: string;
  photo?: string;
  bannerImage?: string;
  description?: string;
  curriculumVersion?: string;
  totalCredits?: number;
  durationPeriods?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  active?: boolean;
  locked?: boolean;
};

type CurriculumView = {
  row: Curriculum;
  programName: string;
  structureName: string;
  organizationName: string;
  subjectCount: number;
  pathwayCount: number;
  studentCount: number;
};

const emptyForm: FormState = {
  organizationId: undefined,
  programId: undefined,
  academicStructureId: undefined,
  name: "",
  code: "",
  photo: "",
  bannerImage: "",
  description: "",
  curriculumVersion: "",
  totalCredits: undefined,
  durationPeriods: undefined,
  effectiveFrom: "",
  effectiveTo: "",
  active: true,
  locked: false,
};

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumManagement() {
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

  const [rows, setRows] = useState<Curriculum[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState<CurriculumSubject[]>([]);
  const [curriculumPathways, setCurriculumPathways] = useState<CurriculumPathway[]>([]);
  const [studentCurriculums, setStudentCurriculums] = useState<StudentCurriculum[]>([]);

  const [search, setSearch] = useState("");
  const [filterProgramId, setFilterProgramId] = useState<number | undefined>();
  const [filterStructureId, setFilterStructureId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "locked">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

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
    setPrograms([]);
    setAcademicStructures([]);
    setOrganizations([]);
    setCurriculumSubjects([]);
    setCurriculumPathways([]);
    setStudentCurriculums([]);
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
        curriculumRows,
        programRows,
        structureRows,
        organizationRows,
        subjectRows,
        pathwayRows,
        studentCurriculumRows,
      ] = await Promise.all([
        db.curriculums.toArray(),
        db.programs.toArray(),
        db.academicStructures.toArray(),
        db.organizations.toArray(),
        db.curriculumSubjects.toArray(),
        db.curriculumPathways.toArray(),
        db.studentCurriculums.toArray(),
      ]);

      setRows(curriculumRows.filter(sameTenant));

      setPrograms(
        programRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAcademicStructures(
        structureRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setCurriculumSubjects(subjectRows.filter(sameTenant));
      setCurriculumPathways(pathwayRows.filter(sameTenant));
      setStudentCurriculums(studentCurriculumRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load curriculums:", error);
      clearData();
      alert("Failed to load curriculums");
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

  const programMap = useMemo(
    () => new Map(programs.map((row) => [row.id, row])),
    [programs]
  );

  const structureMap = useMemo(
    () => new Map(academicStructures.map((row) => [row.id, row])),
    [academicStructures]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const usageMaps = useMemo(() => {
    const subjectMap = new Map<number, number>();
    const pathwayMap = new Map<number, number>();
    const studentMap = new Map<number, number>();

    curriculumSubjects.forEach((row) => {
      subjectMap.set(row.curriculumId, (subjectMap.get(row.curriculumId) || 0) + 1);
    });

    curriculumPathways.forEach((row) => {
      pathwayMap.set(row.curriculumId, (pathwayMap.get(row.curriculumId) || 0) + 1);
    });

    studentCurriculums.forEach((row) => {
      studentMap.set(row.curriculumId, (studentMap.get(row.curriculumId) || 0) + 1);
    });

    return { subjectMap, pathwayMap, studentMap };
  }, [curriculumSubjects, curriculumPathways, studentCurriculums]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<CurriculumView[]>(() => {
    return rows.map((row) => {
      const program = row.programId ? programMap.get(row.programId) : undefined;
      const structure = structureMap.get(row.academicStructureId);
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;

      return {
        row,
        programName: program?.name || "No program",
        structureName: structure?.name || "Unknown academic structure",
        organizationName: organization?.name || "No organization",
        subjectCount: usageMaps.subjectMap.get(id) || 0,
        pathwayCount: usageMaps.pathwayMap.get(id) || 0,
        studentCount: usageMaps.studentMap.get(id) || 0,
      };
    });
  }, [rows, programMap, structureMap, organizationMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterProgramId && row.programId !== filterProgramId) return false;
        if (filterStructureId && row.academicStructureId !== filterStructureId) return false;
        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterStatus === "locked" && row.locked !== true) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.description || ""}
          ${row.curriculumVersion || ""}
          ${row.totalCredits || ""}
          ${row.durationPeriods || ""}
          ${item.programName}
          ${item.structureName}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [
    viewRows,
    search,
    filterProgramId,
    filterStructureId,
    filterOrganizationId,
    filterStatus,
  ]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      locked: rows.filter((row) => row.locked).length,
      curriculumSubjects: curriculumSubjects.length,
      pathways: curriculumPathways.length,
      studentCurriculums: studentCurriculums.length,
    };
  }, [rows, curriculumSubjects, curriculumPathways, studentCurriculums]);

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
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: Curriculum) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      programId: row.programId,
      academicStructureId: row.academicStructureId,
      name: row.name,
      code: row.code || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      description: row.description || "",
      curriculumVersion: row.curriculumVersion || "",
      totalCredits: row.totalCredits,
      durationPeriods: row.durationPeriods,
      effectiveFrom: row.effectiveFrom || "",
      effectiveTo: row.effectiveTo || "",
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
    if (!form.name.trim()) return "Enter curriculum name";
    if (!form.academicStructureId) return "Select academic structure";
    if (form.totalCredits !== undefined && Number(form.totalCredits) < 0) return "Total credits cannot be negative";
    if (form.durationPeriods !== undefined && Number(form.durationPeriods) < 0) return "Duration periods cannot be negative";

    if (form.effectiveFrom && form.effectiveTo && form.effectiveFrom > form.effectiveTo) {
      return "Effective From cannot be after Effective To";
    }

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        !!form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) return "A curriculum with this name or code already exists in this branch";

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
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        programId: form.programId ? Number(form.programId) : undefined,
        academicStructureId: Number(form.academicStructureId),
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        description: form.description?.trim() || undefined,
        curriculumVersion: form.curriculumVersion?.trim() || undefined,
        totalCredits: form.totalCredits == null ? undefined : Number(form.totalCredits),
        durationPeriods: form.durationPeriods == null ? undefined : Number(form.durationPeriods),
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || undefined,
        active: form.active !== false,
        locked: !!form.locked,
      }) as Curriculum;

      if (editMode && form.id) {
        await db.curriculums.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        await db.curriculums.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save curriculum:", error);
      alert("Failed to save curriculum");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: CurriculumView) => {
    if (!item.row.id) return;

    const totalUsage = item.subjectCount + item.pathwayCount + item.studentCount;

    if (totalUsage) {
      const proceed = confirm(
        `This curriculum has ${item.subjectCount} subject(s), ${item.pathwayCount} pathway(s), and ${item.studentCount} student curriculum record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this curriculum?")) {
      return;
    }

    await db.curriculums.update(item.row.id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Curriculum) => {
    if (!row.id) return;

    await db.curriculums.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleLocked = async (row: Curriculum) => {
    if (!row.id) return;

    await db.curriculums.update(row.id, {
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
      <main className="cm-page" style={{ "--cm-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cm-state-card">
          <div className="cm-spinner" />
          <h2>Opening curriculums...</h2>
          <p>Checking account, branch, academic structures, programs, organizations, and curriculum records.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="cm-page" style={{ "--cm-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cm-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing curriculums.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="cm-page" style={{ "--cm-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="cm-state-card">
          <h2>Select a branch first</h2>
          <p>Curriculums belong to one active school branch.</p>
          <button type="button" className="cm-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="cm-page" style={{ "--cm-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="cm-hero">
        <div className="cm-hero-left">
          <div className="cm-hero-icon">📚</div>
          <div className="cm-title-wrap">
            <p>Academic Plan</p>
            <h2>Curriculum Management</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="cm-primary-btn" onClick={openCreate}>
          + Create Curriculum
        </button>
      </section>

      <section className="cm-summary-grid" aria-label="Curriculum summary">
        <SummaryCard label="Curriculums" value={summary.total} icon="📚" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Locked" value={summary.locked} icon="🔒" />
        <SummaryCard label="Subjects" value={summary.curriculumSubjects} icon="📖" />
        <SummaryCard label="Pathways" value={summary.pathways} icon="🗺️" />
      </section>

      <section className="cm-filter-card">
        <input
          placeholder="Search curriculum, code, version, program..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterProgramId || ""} onChange={(event) => setFilterProgramId(Number(event.target.value) || undefined)}>
          <option value="">All Programs</option>
          {programs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>

        <select value={filterStructureId || ""} onChange={(event) => setFilterStructureId(Number(event.target.value) || undefined)}>
          <option value="">All Academic Structures</option>
          {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.level}</option>)}
        </select>

        <select value={filterOrganizationId || ""} onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}>
          <option value="">All Organizations</option>
          {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
        </select>

        <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </section>

      <section className="cm-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="cm-entity-card">
              {row.bannerImage && (
                <div
                  className="cm-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.bannerImage})` }}
                />
              )}

              <div className="cm-card-body">
                <div className="cm-card-top">
                  <Avatar name={row.name} photo={row.photo} primary={primary} />

                  <div className="cm-card-main">
                    <h3>{row.name}</h3>
                    <p>{item.programName} · {item.structureName} · {item.organizationName}</p>

                    <div className="cm-chip-row">
                      {row.code && <Chip tone="gray">{row.code}</Chip>}
                      {row.curriculumVersion && <Chip tone="purple">v{row.curriculumVersion}</Chip>}
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {row.locked && <Chip tone="orange">Locked</Chip>}
                    </div>
                  </div>
                </div>

                {row.description && <p className="cm-description">{row.description}</p>}

                <div className="cm-stat-grid">
                  <MiniStat label="Subjects" value={item.subjectCount} />
                  <MiniStat label="Pathways" value={item.pathwayCount} />
                  <MiniStat label="Students" value={item.studentCount} />
                  <MiniStat label="Credits" value={row.totalCredits ?? "-"} />
                  <MiniStat label="Periods" value={row.durationPeriods ?? "-"} />
                </div>

                <div className="cm-date-row">
                  <span>From: {row.effectiveFrom || "-"}</span>
                  <span>To: {row.effectiveTo || "-"}</span>
                </div>

                <div className="cm-action-row">
                  <button type="button" onClick={() => toggleLocked(row)}>{row.locked ? "Unlock" : "Lock"}</button>
                  <button type="button" onClick={() => toggleActive(row)}>{row.active === false ? "Activate" : "Deactivate"}</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No curriculums found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="cm-drawer-layer">
          <button type="button" className="cm-drawer-overlay" aria-label="Close drawer" onClick={() => setDrawerOpen(false)} />

          <aside className="cm-drawer">
            <div className="cm-drawer-head">
              <div>
                <p>Curriculum Setup</p>
                <h2>{editMode ? "Edit Curriculum" : "Create Curriculum"}</h2>
                <span>
                  Curriculum will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="cm-form-grid">
              <Field label="Curriculum Name">
                <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="e.g. NaCCA Basic 4 Curriculum" />
              </Field>

              <div className="cm-form-two">
                <Field label="Curriculum Code">
                  <input value={form.code || ""} onChange={(event) => updateForm({ code: event.target.value })} placeholder="Code" />
                </Field>

                <Field label="Version">
                  <input value={form.curriculumVersion || ""} onChange={(event) => updateForm({ curriculumVersion: event.target.value })} placeholder="e.g. 2026" />
                </Field>
              </div>

              <Field label="Academic Structure">
                <select value={form.academicStructureId || ""} onChange={(event) => updateForm({ academicStructureId: Number(event.target.value) || undefined })}>
                  <option value="">Select Academic Structure</option>
                  {academicStructures.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.level}</option>)}
                </select>
              </Field>

              <Field label="Program">
                <select value={form.programId || ""} onChange={(event) => updateForm({ programId: Number(event.target.value) || undefined })}>
                  <option value="">No program</option>
                  {programs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </Field>

              <Field label="Organization / Department">
                <select value={form.organizationId || ""} onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}>
                  <option value="">No organization</option>
                  {organizations.map((row) => <option key={row.id} value={row.id}>{row.name} • {row.type}</option>)}
                </select>
              </Field>

              <div className="cm-form-two">
                <Field label="Total Credits">
                  <input type="number" value={form.totalCredits ?? ""} onChange={(event) => updateForm({ totalCredits: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Credits" />
                </Field>

                <Field label="Duration Periods">
                  <input type="number" value={form.durationPeriods ?? ""} onChange={(event) => updateForm({ durationPeriods: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Periods" />
                </Field>
              </div>

              <div className="cm-form-two">
                <Field label="Effective From">
                  <input type="date" value={form.effectiveFrom || ""} onChange={(event) => updateForm({ effectiveFrom: event.target.value })} />
                </Field>

                <Field label="Effective To">
                  <input type="date" value={form.effectiveTo || ""} onChange={(event) => updateForm({ effectiveTo: event.target.value })} />
                </Field>
              </div>

              <Field label="Description">
                <textarea value={form.description || ""} onChange={(event) => updateForm({ description: event.target.value })} placeholder="Curriculum description" rows={4} />
              </Field>

              <div className="cm-check-grid">
                <Check label="Active" checked={form.active !== false} onChange={(checked) => updateForm({ active: checked })} />
                <Check label="Locked" checked={!!form.locked} onChange={(checked) => updateForm({ locked: checked })} />
              </div>

              <Field label="Curriculum Photo">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
                {form.photo && <img src={form.photo} alt="Curriculum" className="cm-preview-photo" />}
              </Field>

              <Field label="Curriculum Banner Image">
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerImage", event.target.files?.[0])} />
                {form.bannerImage && <img src={form.bannerImage} alt="Curriculum banner" className="cm-preview-banner" />}
              </Field>

              <button type="button" onClick={save} disabled={saving} className="cm-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Curriculum"}
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
    <article className="cm-summary-card">
      <div className="cm-summary-icon">{icon}</div>
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
      className="cm-avatar"
      style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}
    >
      {!photo && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`cm-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cm-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="cm-empty-card">
      <div className="cm-empty-icon">📚</div>
      <h3>No curriculums found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="cm-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes cmSpin { to { transform: rotate(360deg); } }

.cm-page {
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

.cm-page *, .cm-page *::before, .cm-page *::after { box-sizing: border-box; }
.cm-page button, .cm-page input, .cm-page select, .cm-page textarea { font: inherit; max-width: 100%; }
.cm-page img { max-width: 100%; }

.cm-page input,
.cm-page select,
.cm-page textarea {
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
.cm-page textarea { padding-top: 10px; resize: vertical; }

.cm-state-card {
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
.cm-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.cm-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.cm-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--cm-primary) 18%, transparent); border-top-color: var(--cm-primary); animation: cmSpin .8s linear infinite; }

.cm-primary-btn,
.cm-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--cm-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.cm-primary-btn:disabled,
.cm-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.cm-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cm-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.cm-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.cm-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--cm-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--cm-primary) 28%, transparent); font-size: 22px; }
.cm-title-wrap { min-width: 0; }
.cm-title-wrap p, .cm-title-wrap h2, .cm-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-title-wrap p { margin: 0 0 2px; color: var(--cm-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cm-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.cm-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.cm-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.cm-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.cm-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--cm-primary) 12%, #fff); }
.cm-summary-card div:last-child { min-width: 0; }
.cm-summary-card strong, .cm-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cm-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.cm-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.cm-list { display: grid; gap: 10px; margin-top: 10px; }
.cm-entity-card,
.cm-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.cm-card-banner { height: 92px; background-size: cover; background-position: center; }
.cm-card-body { padding: 13px; }
.cm-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.cm-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.cm-card-main { min-width: 0; flex: 1; }
.cm-card-main h3, .cm-card-main p, .cm-description { display: block; overflow: hidden; text-overflow: ellipsis; }
.cm-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.cm-card-main p, .cm-description { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.cm-description { margin-top: 9px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: normal; }
.cm-chip-row, .cm-action-row, .cm-date-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.cm-date-row span { min-width: 0; border-radius: 999px; padding: 5px 9px; background: rgba(148, 163, 184, .1); color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }
.cm-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.cm-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.cm-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.cm-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.cm-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.cm-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.cm-stat-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.cm-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.cm-mini-stat strong, .cm-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-mini-stat strong { font-size: 17px; font-weight: 1000; }
.cm-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.cm-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.cm-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.cm-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.cm-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--cm-primary) 12%, #fff); font-size: 28px; }
.cm-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.cm-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.cm-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.cm-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.cm-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.cm-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.cm-drawer-head div { min-width: 0; }
.cm-drawer-head p { margin: 0; color: var(--cm-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cm-drawer-head h2, .cm-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.cm-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.cm-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.cm-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.cm-form-grid { display: grid; gap: 12px; }
.cm-form-two, .cm-check-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.cm-field { display: grid; gap: 6px; min-width: 0; }
.cm-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.cm-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.cm-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.cm-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cm-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.cm-save-btn { width: 100%; }

@media (min-width: 680px) {
  .cm-page { padding: 12px; }
  .cm-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cm-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cm-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cm-check-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .cm-page { padding: 16px; }
  .cm-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cm-filter-card { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .cm-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .cm-page { padding: 6px; }
  .cm-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .cm-primary-btn { width: 100%; }
  .cm-summary-grid { gap: 6px; }
  .cm-summary-card { padding: 10px; border-radius: 19px; }
  .cm-entity-card, .cm-empty-card { border-radius: 20px; }
  .cm-card-body { padding: 11px; }
  .cm-card-top { align-items: flex-start; }
  .cm-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .cm-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cm-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cm-action-row button { width: 100%; padding: 0 8px; }
  .cm-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
