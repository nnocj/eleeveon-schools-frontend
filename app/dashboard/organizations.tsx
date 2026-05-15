"use client";

/**
 * Organizations.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL ORGANIZATION MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: organizations
 *
 * Organization represents departments, faculties, houses,
 * clubs, committees and administrative units inside a branch.
 *
 * It connects to:
 * - Classes
 * - Subjects
 * - Students
 * - Teachers
 * - Curriculums
 * - Finance records
 * - Assessment configuration
 *
 * Context-aware:
 * Active School -> Active Branch -> Organizations
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AssessmentStructure,
  Class,
  Curriculum,
  Expense,
  Income,
  Organization,
  Student,
  Subject,
  Teacher,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type OrganizationType =
  | "department"
  | "faculty"
  | "house"
  | "club"
  | "committee"
  | "administration";

type FormState = {
  id?: number;
  parentOrganizationId?: number;
  name: string;
  type: OrganizationType;
  description?: string;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
};

type OrganizationView = {
  row: Organization;
  parentName: string;
  childrenCount: number;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  curriculumCount: number;
  financeCount: number;
  assessmentStructureCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function OrganizationsPage() {
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

  const [rows, setRows] = useState<Organization[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [assessmentStructures, setAssessmentStructures] = useState<AssessmentStructure[]>([]);

  const [search, setSearch] = useState("");
  const [filterParentId, setFilterParentId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"all" | OrganizationType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    parentOrganizationId: undefined,
    name: "",
    type: "department",
    description: "",
    photo: "",
    bannerImage: "",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        organizationRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        curriculumRows,
        incomeRows,
        expenseRows,
        assessmentStructureRows,
      ] = await Promise.all([
        db.organizations.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.curriculums.toArray(),
        db.incomes.toArray(),
        db.expenses.toArray(),
        db.assessmentStructures.toArray(),
      ]);

      setRows(
        organizationRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setStudents(
        studentRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setTeachers(
        teacherRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setClasses(
        classRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setSubjects(
        subjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setCurriculums(
        curriculumRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setIncomes(
        incomeRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setExpenses(
        expenseRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setAssessmentStructures(
        assessmentStructureRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load organizations:", error);
      alert("Failed to load organizations");
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

  const organizationMap = useMemo(
    () => new Map(rows.map(row => [row.id, row])),
    [rows]
  );

  const availableParents = useMemo(() => {
    return rows
      .filter(row => {
        if (editMode && form.id && row.id === form.id) return false;
        return row.active !== false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, editMode, form.id]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<OrganizationView[]>(() => {
    return rows.map(row => {
      const id = row.id || 0;
      const parent = row.parentOrganizationId
        ? organizationMap.get(row.parentOrganizationId)
        : undefined;

      const financeCount =
        incomes.filter(income => income.organizationId === id).length +
        expenses.filter(expense => expense.organizationId === id).length;

      return {
        row,
        parentName: parent?.name || "No parent",
        childrenCount: rows.filter(child => child.parentOrganizationId === id).length,
        studentCount: students.filter(student => student.organizationId === id).length,
        teacherCount: teachers.filter(teacher => teacher.organizationId === id).length,
        classCount: classes.filter(item => item.organizationId === id).length,
        subjectCount: subjects.filter(item => item.organizationId === id).length,
        curriculumCount: curriculums.filter(item => item.organizationId === id).length,
        financeCount,
        assessmentStructureCount: assessmentStructures.filter(item => item.organizationId === id).length,
      };
    });
  }, [
    rows,
    organizationMap,
    students,
    teachers,
    classes,
    subjects,
    curriculums,
    incomes,
    expenses,
    assessmentStructures,
  ]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterParentId && row.parentOrganizationId !== filterParentId) return false;
        if (filterType !== "all" && row.type !== filterType) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.type}
          ${row.description || ""}
          ${item.parentName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (a.row.type !== b.row.type) return a.row.type.localeCompare(b.row.type);
        return a.row.name.localeCompare(b.row.name);
      });
  }, [viewRows, search, filterParentId, filterType, filterStatus]);

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
      alert("Select a branch first before creating an organization.");
      return;
    }

    setEditMode(false);

    setForm({
      parentOrganizationId: undefined,
      name: "",
      type: "department",
      description: "",
      photo: "",
      bannerImage: "",
      active: true,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Organization) => {
    setEditMode(true);

    setForm({
      id: row.id,
      parentOrganizationId: row.parentOrganizationId,
      name: row.name,
      type: row.type,
      description: row.description || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!activeBranchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter organization name";
    if (!form.type) return "Select organization type";

    if (form.parentOrganizationId && form.parentOrganizationId === form.id) {
      return "An organization cannot be its own parent";
    }

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      return (
        row.name.trim().toLowerCase() === form.name.trim().toLowerCase() &&
        row.type === form.type &&
        (row.parentOrganizationId || 0) === Number(form.parentOrganizationId || 0) &&
        !row.isDeleted
      );
    });

    if (duplicate) {
      return "An organization with this name, type and parent already exists";
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
        parentOrganizationId: form.parentOrganizationId
          ? Number(form.parentOrganizationId)
          : undefined,
        name: form.name.trim(),
        type: form.type,
        description: form.description?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        active: form.active !== false,
      }) as Organization;

      if (editMode && form.id) {
        await db.organizations.update(form.id, {
          parentOrganizationId: payload.parentOrganizationId,
          name: payload.name,
          type: payload.type,
          description: payload.description,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: payload.isDeleted,
        });
      } else {
        await db.organizations.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save organization:", error);
      alert("Failed to save organization");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const usage = viewRows.find(item => item.row.id === id);
    const totalUsage = usage
      ? usage.childrenCount +
        usage.studentCount +
        usage.teacherCount +
        usage.classCount +
        usage.subjectCount +
        usage.curriculumCount +
        usage.financeCount +
        usage.assessmentStructureCount
      : 0;

    if (totalUsage) {
      const proceed = confirm(
        `This organization has ${totalUsage} related record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this organization?")) return;
    }

    await db.organizations.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Organization) => {
    if (!row.id) return;

    await db.organizations.update(row.id, {
      active: row.active === false,
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

  const typeTone = (type: OrganizationType): "green" | "blue" | "gray" | "orange" | "purple" => {
    if (type === "department") return "blue";
    if (type === "faculty") return "purple";
    if (type === "house") return "green";
    if (type === "club") return "orange";
    if (type === "committee") return "gray";
    return "blue";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading organizations...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Organizations belong to a branch. Select a school and branch from the sidebar before managing organizations.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Organizations</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing organizations in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Organization
        </button>
      </div>

      {/* ANALYTICS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Organizations</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{rows.length}</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Departments</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.type === "department").length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Houses / Clubs</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.type === "house" || row.type === "club").length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.active !== false).length}
          </div>
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
          placeholder="Search organization, type, description, parent..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterParentId || ""}
          onChange={e => setFilterParentId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Parents</option>
          {rows.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          style={input}
        >
          <option value="all">All Types</option>
          <option value="department">Department</option>
          <option value="faculty">Faculty</option>
          <option value="house">House</option>
          <option value="club">Club</option>
          <option value="committee">Committee</option>
          <option value="administration">Administration</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          style={input}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
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
                    height: 84,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.10)), url(${row.bannerImage})`,
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
                      width: 56,
                      height: 56,
                      borderRadius: 18,
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 56px",
                    }}
                  >
                    {!row.photo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.name}</div>
                      <span style={badge(typeTone(row.type))}>{row.type}</span>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      Parent: {item.parentName}
                      {row.description ? ` • ${row.description}` : ""}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.childrenCount} children</span>
                      <span style={badge("green")}>{item.studentCount} students</span>
                      <span style={badge("green")}>{item.teacherCount} teachers</span>
                      <span style={badge("gray")}>{item.classCount} classes</span>
                      <span style={badge("gray")}>{item.subjectCount} subjects</span>
                      <span style={badge("orange")}>{item.financeCount} finance</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button style={ghostButton} onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button style={ghostButton} onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button style={{ ...ghostButton, color: "#dc2626" }} onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!filteredRows.length && (
          <div style={{ ...card, textAlign: "center", padding: 30 }}>
            No organizations found in this branch.
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
              width: "min(560px, 100vw)",
              height: "100vh",
              background: "var(--surface)",
              color: "var(--text)",
              boxShadow: "-20px 0 50px rgba(0,0,0,0.25)",
              padding: 22,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                  {editMode ? "Edit Organization" : "Create Organization"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  This organization will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Organization Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. Mathematics Department, Red House"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Type</label>
                <select
                  value={form.type}
                  onChange={e => updateForm({ type: e.target.value as OrganizationType })}
                  style={input}
                >
                  <option value="department">Department</option>
                  <option value="faculty">Faculty</option>
                  <option value="house">House</option>
                  <option value="club">Club</option>
                  <option value="committee">Committee</option>
                  <option value="administration">Administration</option>
                </select>
              </div>

              <div>
                <label style={label}>Parent Organization</label>
                <select
                  value={form.parentOrganizationId || ""}
                  onChange={e =>
                    updateForm({ parentOrganizationId: Number(e.target.value) || undefined })
                  }
                  style={input}
                >
                  <option value="">No parent</option>
                  {availableParents.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name} • {row.type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Description</label>
                <textarea
                  value={form.description || ""}
                  onChange={e => updateForm({ description: e.target.value })}
                  placeholder="Brief description"
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <label style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => updateForm({ active: e.target.checked })}
                />
                Active
              </label>

              <div>
                <label style={label}>Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Organization"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Organization banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Organization"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
