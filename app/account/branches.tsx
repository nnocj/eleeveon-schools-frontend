"use client";

/**
 * Branches.tsx
 * ---------------------------------------------------------
 * SCHOOL-CONTEXT AWARE BRANCH MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: branches
 *
 * Branch belongs to a School.
 * This page now works only within the selected school context:
 *
 * Active School -> Branches
 *
 * It does not show branches from other schools.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  AcademicStructure,
  Branch,
  Class,
  School,
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

type FormState = {
  id?: number;
  schoolId?: number;
  name: string;
  code?: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  photo?: string;
  bannerImage?: string;
  active?: boolean;
};

type BranchView = {
  row: Branch;
  schoolName: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  subjectCount: number;
  structureCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function BranchesPage() {
  const { settings } = useSettings();

  const {
    activeSchoolId,
    activeSchool,
    activeBranchId,
    setActiveBranchId,
    refreshInstitution,
    loading: contextLoading,
  } = useActiveBranch();

  const selectedSchoolId = activeSchoolId || settings?.schoolId;
  const primary = settings?.primaryColor || "var(--primary-color)";

  // ======================================================
  // STATE
  // ======================================================

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Branch[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicStructures, setAcademicStructures] = useState<AcademicStructure[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    schoolId: selectedSchoolId,
    name: "",
    code: "",
    logo: "",
    phone: "",
    email: "",
    address: "",
    city: "",
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
        branchRows,
        schoolRows,
        studentRows,
        teacherRows,
        classRows,
        subjectRows,
        structureRows,
      ] = await Promise.all([
        db.branches.toArray(),
        db.schools.toArray(),
        db.students.toArray(),
        db.teachers.toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.academicStructures.toArray(),
      ]);

      setSchools(schoolRows.filter(row => !row.isDeleted));

      setRows(
        branchRows.filter(
          row =>
            !row.isDeleted &&
            (!selectedSchoolId || Number(row.schoolId) === Number(selectedSchoolId))
        )
      );

      const branchIdsForSchool = new Set(
        branchRows
          .filter(
            row =>
              !row.isDeleted &&
              (!selectedSchoolId || Number(row.schoolId) === Number(selectedSchoolId))
          )
          .map(row => row.id)
      );

      setStudents(
        studentRows.filter(
          row =>
            !row.isDeleted &&
            row.status !== "withdrawn" &&
            branchIdsForSchool.has(row.branchId)
        )
      );

      setTeachers(
        teacherRows.filter(row => !row.isDeleted && branchIdsForSchool.has(row.branchId))
      );

      setClasses(
        classRows.filter(row => !row.isDeleted && branchIdsForSchool.has(row.branchId))
      );

      setSubjects(
        subjectRows.filter(row => !row.isDeleted && branchIdsForSchool.has(row.branchId))
      );

      setAcademicStructures(
        structureRows.filter(row => !row.isDeleted && branchIdsForSchool.has(row.branchId))
      );
    } catch (error) {
      console.error("Failed to load branches:", error);
      alert("Failed to load branches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedSchoolId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const schoolMap = useMemo(
    () => new Map(schools.map(row => [row.id, row])),
    [schools]
  );

  const branchCounts = useMemo(() => {
    const map = new Map<number, Omit<BranchView, "row" | "schoolName">>();

    rows.forEach(branch => {
      if (!branch.id) return;

      map.set(branch.id, {
        studentCount: 0,
        teacherCount: 0,
        classCount: 0,
        subjectCount: 0,
        structureCount: 0,
      });
    });

    students.forEach(row => {
      const count = map.get(row.branchId);
      if (count) count.studentCount += 1;
    });

    teachers.forEach(row => {
      const count = map.get(row.branchId);
      if (count) count.teacherCount += 1;
    });

    classes.forEach(row => {
      const count = map.get(row.branchId);
      if (count) count.classCount += 1;
    });

    subjects.forEach(row => {
      const count = map.get(row.branchId);
      if (count) count.subjectCount += 1;
    });

    academicStructures.forEach(row => {
      const count = map.get(row.branchId);
      if (count) count.structureCount += 1;
    });

    return map;
  }, [rows, students, teachers, classes, subjects, academicStructures]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<BranchView[]>(() => {
    return rows.map(row => {
      const counts = branchCounts.get(row.id || 0);
      const school = schoolMap.get(row.schoolId);

      return {
        row,
        schoolName: school?.name || activeSchool?.name || "Selected School",
        studentCount: counts?.studentCount || 0,
        teacherCount: counts?.teacherCount || 0,
        classCount: counts?.classCount || 0,
        subjectCount: counts?.subjectCount || 0,
        structureCount: counts?.structureCount || 0,
      };
    });
  }, [rows, branchCounts, schoolMap, activeSchool]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.phone || ""}
          ${row.email || ""}
          ${row.address || ""}
          ${row.city || ""}
          ${item.schoolName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterStatus]);

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

  const handleImageUpload = async (
    field: "logo" | "photo" | "bannerImage",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const openCreate = () => {
    if (!selectedSchoolId) {
      alert("Select or create a school first before creating a branch.");
      return;
    }

    setEditMode(false);

    setForm({
      schoolId: selectedSchoolId,
      name: "",
      code: "",
      logo: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      photo: "",
      bannerImage: "",
      active: true,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Branch) => {
    setEditMode(true);

    setForm({
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      code: row.code || "",
      logo: row.logo || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      city: row.city || "",
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
    if (!selectedSchoolId) return "Select or create a school first";
    if (!form.schoolId) return "Selected school is missing";
    if (Number(form.schoolId) !== Number(selectedSchoolId)) {
      return "This branch must belong to the currently selected school";
    }
    if (!form.name.trim()) return "Enter branch name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameSchool = Number(row.schoolId) === Number(selectedSchoolId);
      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return sameSchool && (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) {
      return "A branch with this name or code already exists under the selected school";
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
        schoolId: Number(selectedSchoolId),
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        logo: form.logo || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        active: form.active !== false,
      }) as Branch;

      let savedBranchId = form.id;

      if (editMode && form.id) {
        await db.branches.update(form.id, {
          schoolId: Number(selectedSchoolId),
          name: payload.name,
          code: payload.code,
          logo: payload.logo,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          city: payload.city,
          photo: payload.photo,
          bannerImage: payload.bannerImage,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        const id = await db.branches.add(payload);
        savedBranchId = Number(id);
      }

      await refreshInstitution();

      if (savedBranchId && !activeBranchId) {
        await setActiveBranchId(savedBranchId);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save branch:", error);
      alert("Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const counts = branchCounts.get(id);
    const totalUsage =
      (counts?.studentCount || 0) +
      (counts?.teacherCount || 0) +
      (counts?.classCount || 0) +
      (counts?.subjectCount || 0) +
      (counts?.structureCount || 0);

    if (totalUsage) {
      const proceed = confirm(
        `This branch has related records (${totalUsage} total usage count). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this branch?")) return;
    }

    await db.branches.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    if (activeBranchId === id) {
      await setActiveBranchId(null);
    }

    await refreshInstitution();
    await load();
  };

  const toggleActive = async (row: Branch) => {
    if (!row.id) return;

    await db.branches.update(row.id, {
      active: row.active === false,
      updatedAt: Date.now(),
    });

    if (activeBranchId === row.id && row.active !== false) {
      await setActiveBranchId(null);
    }

    await refreshInstitution();
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

  const badge = (tone: "green" | "red" | "blue" | "gray" | "orange"): React.CSSProperties => {
    const tones = {
      green: { bg: "rgba(34,197,94,0.12)", color: "#16a34a" },
      red: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
      blue: { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
      gray: { bg: "rgba(107,114,128,0.12)", color: "#4b5563" },
      orange: { bg: "rgba(245,158,11,0.14)", color: "#b45309" },
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
  // LOADING / EMPTY SCHOOL STATE
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading branches...</div>;
  }

  if (!selectedSchoolId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a school first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Branches belong to a school. Create or select a school before managing branches.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Branches</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing branches under: <b>{activeSchool?.name || schoolMap.get(selectedSchoolId)?.name || "Selected School"}</b>
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Branch
        </button>
      </div>

      {/* SELECTED SCHOOL CONTEXT */}
      <div
        style={{
          ...card,
          marginTop: 18,
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ opacity: 0.65, fontSize: 12, fontWeight: 800 }}>Active School Context</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900 }}>
            {activeSchool?.name || schoolMap.get(selectedSchoolId)?.name || "Selected School"}
          </div>
        </div>
        <span style={badge("blue")}>School ID: {selectedSchoolId}</span>
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Branches in School</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{rows.length}</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.active !== false).length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{students.length}</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Classes</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{classes.length}</div>
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
          placeholder="Search branch, code, phone, email, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

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
          const isCurrentBranch = activeBranchId === row.id;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {(row.bannerImage || row.photo) && (
                <div
                  style={{
                    height: 96,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.44), rgba(15,23,42,0.10)), url(${row.bannerImage || row.photo})`,
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
                      background: row.logo
                        ? `#fff url(${row.logo}) center/contain no-repeat`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,0.2))`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 950,
                      flex: "0 0 58px",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    {!row.logo && row.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.name}</div>
                      {row.code && <span style={badge("gray")}>{row.code}</span>}
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {isCurrentBranch && <span style={badge("blue")}>Current branch</span>}
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.schoolName} • {row.city || "No city"} • {row.address || "No address"}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.studentCount} students</span>
                      <span style={badge("blue")}>{item.teacherCount} teachers</span>
                      <span style={badge("gray")}>{item.classCount} classes</span>
                      <span style={badge("gray")}>{item.subjectCount} subjects</span>
                      <span style={badge("gray")}>{item.structureCount} academic structures</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!isCurrentBranch && row.active !== false && (
                    <button style={ghostButton} onClick={() => setActiveBranchId(row.id || null)}>
                      Switch to Branch
                    </button>
                  )}
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
            No branches found for the selected school.
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
                  {editMode ? "Edit Branch" : "Create Branch"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Branch will be saved under the selected school.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>Selected School</div>
                <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900 }}>
                  {activeSchool?.name || schoolMap.get(selectedSchoolId)?.name || "Selected School"}
                </div>
              </div>

              <div>
                <label style={label}>Branch Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. Main Campus, East Legon Branch"
                  style={input}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Branch Code</label>
                  <input
                    value={form.code || ""}
                    onChange={e => updateForm({ code: e.target.value })}
                    placeholder="e.g. MAIN, ELG"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>City</label>
                  <input
                    value={form.city || ""}
                    onChange={e => updateForm({ city: e.target.value })}
                    placeholder="e.g. Accra, Tema"
                    style={input}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={label}>Phone</label>
                  <input
                    value={form.phone || ""}
                    onChange={e => updateForm({ phone: e.target.value })}
                    placeholder="Phone number"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Email</label>
                  <input
                    value={form.email || ""}
                    onChange={e => updateForm({ email: e.target.value })}
                    placeholder="Email address"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Address</label>
                <textarea
                  value={form.address || ""}
                  onChange={e => updateForm({ address: e.target.value })}
                  placeholder="Branch address"
                  rows={3}
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
                <label style={label}>Branch Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("logo", e.target.files?.[0])}
                  style={input}
                />
                {form.logo && (
                  <img
                    src={form.logo}
                    alt="Branch logo"
                    style={{ height: 82, borderRadius: 14, marginTop: 8, objectFit: "contain", background: "#fff" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Branch Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Branch"
                    style={{ height: 90, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Branch Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Branch banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
