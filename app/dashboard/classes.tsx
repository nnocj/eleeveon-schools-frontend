"use client";

/**
 * Class.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL CLASS MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: classes
 *
 * Class is the institutional academic grouping used by:
 * - StudentEnrollment
 * - ClassSubject
 * - AssessmentEntry
 * - Attendance
 * - Report cards and broadsheets
 *
 * This page manages the class identity and administrative
 * metadata, while ClassSubject manages the actual subject
 * delivery context.
 *
 * Context-aware:
 * Active School -> Active Branch -> Classes
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Class,
  Organization,
  Student,
  StudentEnrollment,
  ClassSubject,
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
  name: string;
  code?: string;
  level?: string;
  photo?: string;
  bannerImage?: string;
  capacity?: number;
  active?: boolean;
};

type ClassView = {
  row: Class;
  organizationName: string;
  studentCount: number;
  subjectCount: number;
  capacityUsed: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function ClassesPage() {
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

  const [rows, setRows] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    organizationId: undefined,
    name: "",
    code: "",
    level: "",
    photo: "",
    bannerImage: "",
    capacity: undefined,
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        classRows,
        organizationRows,
        studentRows,
        enrollmentRows,
        classSubjectRows,
      ] = await Promise.all([
        db.classes.toArray(),
        db.organizations.toArray(),
        db.students.toArray(),
        db.studentEnrollments.toArray(),
        db.classSubjects.toArray(),
      ]);

      setRows(classRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setOrganizations(
        organizationRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setStudents(
        studentRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.status !== "withdrawn"
        )
      );

      setEnrollments(
        enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load classes:", error);
      alert("Failed to load classes");
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
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const activeEnrollmentCounts = useMemo(() => {
    const map = new Map<number, number>();

    enrollments.forEach(enrollment => {
      if (enrollment.status !== "active") return;
      map.set(enrollment.classId, (map.get(enrollment.classId) || 0) + 1);
    });

    return map;
  }, [enrollments]);

  const fallbackCurrentClassCounts = useMemo(() => {
    const map = new Map<number, number>();

    students.forEach(student => {
      if (!student.currentClassId) return;
      map.set(student.currentClassId, (map.get(student.currentClassId) || 0) + 1);
    });

    return map;
  }, [students]);

  const classSubjectCounts = useMemo(() => {
    const map = new Map<number, number>();

    classSubjects.forEach(classSubject => {
      if (classSubject.active === false) return;
      map.set(classSubject.classId, (map.get(classSubject.classId) || 0) + 1);
    });

    return map;
  }, [classSubjects]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ClassView[]>(() => {
    return rows.map(row => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const studentCount =
        activeEnrollmentCounts.get(row.id || 0) || fallbackCurrentClassCounts.get(row.id || 0) || 0;
      const subjectCount = classSubjectCounts.get(row.id || 0) || 0;
      const capacity = Number(row.capacity || 0);

      return {
        row,
        organizationName: organization?.name || "No organization",
        studentCount,
        subjectCount,
        capacityUsed: capacity ? Math.min(100, Math.round((studentCount / capacity) * 100)) : 0,
      };
    });
  }, [rows, organizationMap, activeEnrollmentCounts, fallbackCurrentClassCounts, classSubjectCounts]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;

        if (!query) return true;

        return `
          ${row.name}
          ${row.code || ""}
          ${row.level || ""}
          ${item.organizationName}
          ${row.capacity || ""}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name));
  }, [viewRows, search, filterOrganizationId, filterStatus]);

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
      alert("Select a branch first before creating a class.");
      return;
    }

    setEditMode(false);

    setForm({
      organizationId: undefined,
      name: "",
      code: "",
      level: "",
      photo: "",
      bannerImage: "",
      capacity: undefined,
      active: true,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Class) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code || "",
      level: row.level || "",
      photo: row.photo || "",
      bannerImage: row.bannerImage || "",
      capacity: row.capacity,
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!activeBranchId) return "Select a branch first";
    if (!form.name.trim()) return "Enter class name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameName = row.name.trim().toLowerCase() === form.name.trim().toLowerCase();
      const sameCode =
        form.code?.trim() &&
        row.code?.trim().toLowerCase() === form.code.trim().toLowerCase();

      return (sameName || sameCode) && !row.isDeleted;
    });

    if (duplicate) {
      return "A class with this name or code already exists";
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
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        level: form.level?.trim() || undefined,
        photo: form.photo || undefined,
        bannerImage: form.bannerImage || undefined,
        capacity: form.capacity == null ? undefined : Number(form.capacity),
        active: form.active !== false,
      }) as Class;

      if (editMode && form.id) {
        await db.classes.update(form.id, payload);
      } else {
        await db.classes.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save class:", error);
      alert("Failed to save class");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const studentCount = activeEnrollmentCounts.get(id) || fallbackCurrentClassCounts.get(id) || 0;
    const subjectCount = classSubjectCounts.get(id) || 0;

    if (studentCount || subjectCount) {
      const proceed = confirm(
        `This class has ${studentCount} active student(s) and ${subjectCount} class subject(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this class?")) return;
    }

    await db.classes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Class) => {
    if (!row.id) return;

    await db.classes.update(row.id, {
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
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading classes...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Classes belong to a branch. Select a school and branch from the sidebar before managing classes.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Classes</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing classes in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Create Class
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total Classes</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{rows.length}</div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {rows.filter(row => row.active !== false).length}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Students Assigned</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {viewRows.reduce((sum, item) => sum + item.studentCount, 0)}
          </div>
        </div>

        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Class Subjects</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
            {viewRows.reduce((sum, item) => sum + item.subjectCount, 0)}
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
          placeholder="Search class, code, level, organization..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

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
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;
          const overCapacity = !!row.capacity && item.studentCount > row.capacity;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {row.bannerImage && (
                <div
                  style={{
                    height: 82,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.38), rgba(15,23,42,0.08)), url(${row.bannerImage})`,
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
                      {row.code && <span style={badge("gray")}>{row.code}</span>}
                      {row.level && <span style={badge("blue")}>{row.level}</span>}
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {overCapacity && <span style={badge("orange")}>Over capacity</span>}
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.organizationName} • {item.studentCount} student(s) • {item.subjectCount} class subject(s)
                    </div>

                    {!!row.capacity && (
                      <div style={{ marginTop: 10, maxWidth: 360 }}>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(0,0,0,0.08)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${item.capacityUsed}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: overCapacity ? "#f59e0b" : primary,
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.62, fontWeight: 750 }}>
                          Capacity: {item.studentCount}/{row.capacity}
                        </div>
                      </div>
                    )}
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
            No classes found in this branch.
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
              width: "min(540px, 100vw)",
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
                  {editMode ? "Edit Class" : "Create Class"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  This class will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Class Name</label>
                <input
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  placeholder="e.g. Basic 5, JHS 1, Nursery 2"
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
                  <label style={label}>Class Code</label>
                  <input
                    value={form.code || ""}
                    onChange={e => updateForm({ code: e.target.value })}
                    placeholder="e.g. B5, JHS1"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Level</label>
                  <input
                    value={form.level || ""}
                    onChange={e => updateForm({ level: e.target.value })}
                    placeholder="e.g. Primary, JHS, SHS"
                    style={input}
                  />
                </div>
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

              <div>
                <label style={label}>Capacity</label>
                <input
                  type="number"
                  value={form.capacity ?? ""}
                  onChange={e =>
                    updateForm({
                      capacity: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="Maximum number of students"
                  style={input}
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
                <label style={label}>Class Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Class"
                    style={{ height: 82, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Class Banner Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("bannerImage", e.target.files?.[0])}
                  style={input}
                />
                {form.bannerImage && (
                  <img
                    src={form.bannerImage}
                    alt="Class Banner"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Create Class"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
