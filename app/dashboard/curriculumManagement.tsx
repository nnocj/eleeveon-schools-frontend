"use client";

/**
 * CurriculumManagement.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CURRICULUM MANAGEMENT PAGE
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
 * IMPORTANT ARCHITECTURE
 * ---------------------------------------------------------
 * Program CRUD is handled in Programs.tsx.
 * This page only creates and manages Curriculum records.
 *
 * Active School -> Active Branch -> Curriculum
 *
 * Curriculum is the academic plan.
 * CurriculumSubject defines global subject rules under a curriculum.
 * ClassSubject later delivers those curriculum subjects to real classes/periods.
 */

import React, { useEffect, useMemo, useState } from "react";

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
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

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

// ======================================================
// COMPONENT
// ======================================================

export default function CurriculumManagement() {
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

  const [form, setForm] = useState<FormState>({
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
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
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

      setRows(curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setPrograms(
        programRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setAcademicStructures(
        structureRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setOrganizations(
        organizationRows.filter(row => row.branchId === branchId && !row.isDeleted && row.active !== false)
      );

      setCurriculumSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setCurriculumPathways(
        pathwayRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setStudentCurriculums(
        studentCurriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load curriculums:", error);
      alert("Failed to load curriculums");
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

  const programMap = useMemo(
    () => new Map(programs.map(row => [row.id, row])),
    [programs]
  );

  const structureMap = useMemo(
    () => new Map(academicStructures.map(row => [row.id, row])),
    [academicStructures]
  );

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const usageMaps = useMemo(() => {
    const subjectMap = new Map<number, number>();
    const pathwayMap = new Map<number, number>();
    const studentMap = new Map<number, number>();

    curriculumSubjects.forEach(row => {
      subjectMap.set(row.curriculumId, (subjectMap.get(row.curriculumId) || 0) + 1);
    });

    curriculumPathways.forEach(row => {
      pathwayMap.set(row.curriculumId, (pathwayMap.get(row.curriculumId) || 0) + 1);
    });

    studentCurriculums.forEach(row => {
      studentMap.set(row.curriculumId, (studentMap.get(row.curriculumId) || 0) + 1);
    });

    return {
      subjectMap,
      pathwayMap,
      studentMap,
    };
  }, [curriculumSubjects, curriculumPathways, studentCurriculums]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<CurriculumView[]>(() => {
    return rows.map(row => {
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
      .filter(item => {
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
      active: rows.filter(row => row.active !== false).length,
      inactive: rows.filter(row => row.active === false).length,
      locked: rows.filter(row => row.locked).length,
      curriculumSubjects: curriculumSubjects.length,
      pathways: curriculumPathways.length,
      studentCurriculums: studentCurriculums.length,
    };
  }, [rows, curriculumSubjects, curriculumPathways, studentCurriculums]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>(resolve => {
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

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a curriculum.");
      return;
    }

    setEditMode(false);

    setForm({
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
    });

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
    if (!branchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter curriculum name";
    if (!form.academicStructureId) return "Select academic structure";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() && row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) {
      return "A curriculum with this name or code already exists in this branch";
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
          organizationId: payload.organizationId,
          programId: payload.programId,
          academicStructureId: payload.academicStructureId,
          name: payload.name,
          code: payload.code,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          description: payload.description,
          curriculumVersion: payload.curriculumVersion,
          totalCredits: payload.totalCredits,
          durationPeriods: payload.durationPeriods,
          effectiveFrom: payload.effectiveFrom,
          effectiveTo: payload.effectiveTo,
          active: payload.active,
          locked: payload.locked,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
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
    } else {
      if (!confirm("Delete this curriculum?")) return;
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
    return <div style={{ padding: 20 }}>Loading curriculums...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Curriculums belong to a branch. Select a school and branch from the sidebar before managing curriculums.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Curriculum Management</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing curriculums in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Curriculum
        </button>
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Curriculums</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Locked</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.locked}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Curriculum Subjects</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.curriculumSubjects}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Pathways</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.pathways}</div>
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
          placeholder="Search curriculum, code, version, program..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterProgramId || ""}
          onChange={e => setFilterProgramId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Programs</option>
          {programs.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterStructureId || ""}
          onChange={e => setFilterStructureId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Academic Structures</option>
          {academicStructures.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.level}
            </option>
          ))}
        </select>

        <select
          value={filterOrganizationId || ""}
          onChange={e => setFilterOrganizationId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Organizations</option>
          {organizations.map(row => (
            <option key={row.id} value={row.id}>
              {row.name} • {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {row.bannerImage && (
                <div
                  style={{
                    height: 92,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.08)), url(${row.bannerImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              <div
                style={{
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 18,
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 58px",
                    }}
                  >
                    {!row.photo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.name}</div>
                      {row.code && <span style={badge("gray")}>{row.code}</span>}
                      {row.curriculumVersion && <span style={badge("purple")}>v{row.curriculumVersion}</span>}
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {row.locked && <span style={badge("orange")}>Locked</span>}
                    </div>

                    <div style={{ marginTop: 7, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.programName} • {item.structureName} • {item.organizationName}
                    </div>

                    {row.description && (
                      <div style={{ marginTop: 7, opacity: 0.68, fontSize: 13 }}>
                        {row.description}
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.subjectCount} subject(s)</span>
                      <span style={badge("blue")}>{item.pathwayCount} pathway(s)</span>
                      <span style={badge("gray")}>{item.studentCount} student curriculum(s)</span>
                      <span style={badge("gray")}>Credits: {row.totalCredits ?? "-"}</span>
                      <span style={badge("gray")}>Periods: {row.durationPeriods ?? "-"}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleLocked(row)}>
                    {row.locked ? "Unlock" : "Lock"}
                  </button>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
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

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No curriculums found in this branch.
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
              width: "min(620px, 100vw)",
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
                  {editMode ? "Edit Curriculum" : "Create Curriculum"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Curriculum will be saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Curriculum Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. NaCCA Basic 4 Curriculum"
                  style={input}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Curriculum Code</label>
                  <input
                    value={form.code || ""}
                    onChange={e => updateForm({ code: e.target.value })}
                    placeholder="Code"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Version</label>
                  <input
                    value={form.curriculumVersion || ""}
                    onChange={e => updateForm({ curriculumVersion: e.target.value })}
                    placeholder="e.g. 2026"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Academic Structure</label>
                <select
                  value={form.academicStructureId || ""}
                  onChange={e => updateForm({ academicStructureId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">Select Academic Structure</option>
                  {academicStructures.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Program</label>
                <select
                  value={form.programId || ""}
                  onChange={e => updateForm({ programId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No program</option>
                  {programs.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Organization / Department</label>
                <select
                  value={form.organizationId || ""}
                  onChange={e => updateForm({ organizationId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No organization</option>
                  {organizations.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.type}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Total Credits</label>
                  <input
                    type="number"
                    value={form.totalCredits ?? ""}
                    onChange={e =>
                      updateForm({
                        totalCredits: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Credits"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Duration Periods</label>
                  <input
                    type="number"
                    value={form.durationPeriods ?? ""}
                    onChange={e =>
                      updateForm({
                        durationPeriods: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Periods"
                    style={input}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                <div>
                  <label style={label}>Effective From</label>
                  <input
                    type="date"
                    value={form.effectiveFrom || ""}
                    onChange={e => updateForm({ effectiveFrom: e.target.value })}
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Effective To</label>
                  <input
                    type="date"
                    value={form.effectiveTo || ""}
                    onChange={e => updateForm({ effectiveTo: e.target.value })}
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Description</label>
                <textarea
                  value={form.description || ""}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="Curriculum description"
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ ...card, display: "flex", gap: 10, alignItems: "center", boxShadow: "none" }}>
                  <input
                    type="checkbox"
                    checked={form.active !== false}
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
              </div>

              <div>
                <label style={label}>Curriculum Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Curriculum"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Curriculum Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Curriculum banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Curriculum"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
