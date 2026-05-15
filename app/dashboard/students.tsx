"use client";

/**
 * Students.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL STUDENT MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: students
 *
 * Student belongs to a Branch.
 * School context is inherited through the selected branch:
 *
 * Active School -> Active Branch -> Students
 *
 * This page only works inside the currently selected branch.
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Class,
  Organization,
  Student,
  StudentEnrollment,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";

type FormState = {
  id?: number;
  organizationId?: number;
  currentClassId?: number;
  admissionNumber?: string;
  fullName: string;
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  photo?: string;
  coverPhoto?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  status?: StudentStatus;
};

type StudentView = {
  row: Student;
  className: string;
  organizationName: string;
  enrollmentCount: number;
  activeEnrollment?: StudentEnrollment;
};

// ======================================================
// COMPONENT
// ======================================================

export default function StudentsPage() {
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

  const [rows, setRows] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);

  const [search, setSearch] = useState("");
  const [filterClassId, setFilterClassId] = useState<number | undefined>();
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<"all" | StudentStatus>("all");
  const [filterGender, setFilterGender] = useState<"all" | string>("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    organizationId: undefined,
    currentClassId: undefined,
    admissionNumber: "",
    fullName: "",
    gender: "",
    age: undefined,
    dateOfBirth: "",
    photo: "",
    coverPhoto: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    address: "",
    status: "active",
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [studentRows, classRows, organizationRows, enrollmentRows] = await Promise.all([
        db.students.toArray(),
        db.classes.toArray(),
        db.organizations.toArray(),
        db.studentEnrollments.toArray(),
      ]);

      setRows(studentRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setClasses(
        classRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setOrganizations(
        organizationRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setEnrollments(
        enrollmentRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load students:", error);
      alert("Failed to load students");
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

  const classMap = useMemo(() => new Map(classes.map(row => [row.id, row])), [classes]);

  const organizationMap = useMemo(
    () => new Map(organizations.map(row => [row.id, row])),
    [organizations]
  );

  const enrollmentMap = useMemo(() => {
    const map = new Map<number, StudentEnrollment[]>();

    enrollments.forEach(row => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [enrollments]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<StudentView[]>(() => {
    return rows.map(row => {
      const studentEnrollments = enrollmentMap.get(row.id || 0) || [];
      const activeEnrollment = studentEnrollments.find(e => e.status === "active");
      const resolvedClassId = activeEnrollment?.classId || row.currentClassId;
      const classData = resolvedClassId ? classMap.get(resolvedClassId) : undefined;
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;

      return {
        row,
        className: classData?.name || "No class assigned",
        organizationName: organization?.name || "No organization",
        enrollmentCount: studentEnrollments.length,
        activeEnrollment,
      };
    });
  }, [rows, enrollmentMap, classMap, organizationMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterClassId) {
          const activeClassId = item.activeEnrollment?.classId || row.currentClassId;
          if (activeClassId !== filterClassId) return false;
        }

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (filterGender !== "all" && row.gender !== filterGender) return false;

        if (!query) return true;

        return `
          ${row.fullName}
          ${row.admissionNumber || ""}
          ${row.gender || ""}
          ${row.parentName || ""}
          ${row.parentPhone || ""}
          ${row.parentEmail || ""}
          ${row.address || ""}
          ${row.status || ""}
          ${item.className}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName));
  }, [viewRows, search, filterClassId, filterOrganizationId, filterStatus, filterGender]);

  const statusCounts = useMemo(() => {
    return {
      active: rows.filter(row => row.status === "active" || !row.status).length,
      graduated: rows.filter(row => row.status === "graduated").length,
      transferred: rows.filter(row => row.status === "transferred").length,
      withdrawn: rows.filter(row => row.status === "withdrawn").length,
    };
  }, [rows]);

  const genderOptions = useMemo(() => {
    return Array.from(new Set(rows.map(row => row.gender).filter(Boolean))) as string[];
  }, [rows]);

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

  const handleImageUpload = async (field: "photo" | "coverPhoto", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a student.");
      return;
    }

    setEditMode(false);

    setForm({
      organizationId: undefined,
      currentClassId: undefined,
      admissionNumber: "",
      fullName: "",
      gender: "",
      age: undefined,
      dateOfBirth: "",
      photo: "",
      coverPhoto: "",
      parentName: "",
      parentPhone: "",
      parentEmail: "",
      address: "",
      status: "active",
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Student) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      currentClassId: row.currentClassId,
      admissionNumber: row.admissionNumber || "",
      fullName: row.fullName,
      gender: row.gender || "",
      age: row.age,
      dateOfBirth: row.dateOfBirth || "",
      photo: row.photo || "",
      coverPhoto: row.coverPhoto || "",
      parentName: row.parentName || "",
      parentPhone: row.parentPhone || "",
      parentEmail: row.parentEmail || "",
      address: row.address || "",
      status: row.status || "active",
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter student full name";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameAdmission =
        form.admissionNumber?.trim() &&
        row.admissionNumber?.trim().toLowerCase() === form.admissionNumber.trim().toLowerCase();

      return !!sameAdmission && !row.isDeleted;
    });

    if (duplicate) return "A student with this admission number already exists in this branch";

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
        currentClassId: form.currentClassId ? Number(form.currentClassId) : undefined,
        admissionNumber: form.admissionNumber?.trim() || undefined,
        fullName: form.fullName.trim(),
        gender: form.gender?.trim() || undefined,
        age: form.age == null ? undefined : Number(form.age),
        dateOfBirth: form.dateOfBirth || undefined,
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        parentName: form.parentName?.trim() || undefined,
        parentPhone: form.parentPhone?.trim() || undefined,
        parentEmail: form.parentEmail?.trim() || undefined,
        address: form.address?.trim() || undefined,
        status: form.status || "active",
      }) as Student;

      if (editMode && form.id) {
        await db.students.update(form.id, {
          organizationId: payload.organizationId,
          currentClassId: payload.currentClassId,
          admissionNumber: payload.admissionNumber,
          fullName: payload.fullName,
          gender: payload.gender,
          age: payload.age,
          dateOfBirth: payload.dateOfBirth,
          photo: payload.photo,
          coverPhoto: payload.coverPhoto,
          parentName: payload.parentName,
          parentPhone: payload.parentPhone,
          parentEmail: payload.parentEmail,
          address: payload.address,
          status: payload.status,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.students.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save student:", error);
      alert("Failed to save student");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const enrollmentCount = enrollmentMap.get(id)?.length || 0;

    if (enrollmentCount) {
      const proceed = confirm(
        `This student has ${enrollmentCount} enrollment record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this student?")) return;
    }

    await db.students.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const setStatus = async (row: Student, status: StudentStatus) => {
    if (!row.id) return;

    await db.students.update(row.id, {
      status,
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

  const statusTone = (status?: string): "green" | "red" | "blue" | "orange" | "gray" => {
    if (!status || status === "active") return "green";
    if (status === "graduated") return "blue";
    if (status === "transferred") return "orange";
    if (status === "withdrawn") return "red";
    return "gray";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading students...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Students belong to a branch. Select a school and branch from the sidebar before managing students.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Students</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing students in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Add Student
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total Students</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{rows.length}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{statusCounts.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Graduated</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{statusCounts.graduated}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Withdrawn</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{statusCounts.withdrawn}</div>
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
          placeholder="Search name, admission number, parent, class..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={input}
        />

        <select
          value={filterClassId || ""}
          onChange={e => setFilterClassId(Number(e.target.value) || undefined)}
          style={input}
        >
          <option value="">All Classes</option>
          {classes.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
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
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <select
          value={filterGender}
          onChange={e => setFilterGender(e.target.value)}
          style={input}
        >
          <option value="all">All Gender</option>
          {genderOptions.map(gender => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </select>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {filteredRows.map(item => {
          const row = item.row;

          return (
            <div key={row.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
              {row.coverPhoto && (
                <div
                  style={{
                    height: 88,
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.08)), url(${row.coverPhoto})`,
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
                    {!row.photo && row.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{row.fullName}</div>
                      {row.admissionNumber && <span style={badge("gray")}>{row.admissionNumber}</span>}
                      <span style={badge(statusTone(row.status))}>{row.status || "active"}</span>
                      {row.gender && <span style={badge("blue")}>{row.gender}</span>}
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.className} • {item.organizationName}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.enrollmentCount} enrollment(s)</span>
                      {row.parentName && <span style={badge("gray")}>Parent: {row.parentName}</span>}
                      {row.parentPhone && <span style={badge("gray")}>{row.parentPhone}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {row.status !== "active" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "active")}>
                      Activate
                    </button>
                  )}
                  {row.status !== "withdrawn" && (
                    <button style={ghostButton} onClick={() => setStatus(row, "withdrawn")}>
                      Withdraw
                    </button>
                  )}
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
            No students found in this branch.
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
                  {editMode ? "Edit Student" : "Add Student"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Student will be saved under {activeBranch?.name || "the selected branch"}.
                </div>
              </div>

              <button style={ghostButton} onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Full Name</label>
                <input
                  value={form.fullName}
                  onChange={e => updateForm({ fullName: e.target.value })}
                  placeholder="Student full name"
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
                  <label style={label}>Admission Number</label>
                  <input
                    value={form.admissionNumber || ""}
                    onChange={e => updateForm({ admissionNumber: e.target.value })}
                    placeholder="Admission number"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Gender</label>
                  <select
                    value={form.gender || ""}
                    onChange={e => updateForm({ gender: e.target.value || undefined })}
                    style={input}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
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
                  <label style={label}>Date of Birth</label>
                  <input
                    type="date"
                    value={form.dateOfBirth || ""}
                    onChange={e => updateForm({ dateOfBirth: e.target.value })}
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Age</label>
                  <input
                    type="number"
                    value={form.age ?? ""}
                    onChange={e =>
                      updateForm({ age: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    placeholder="Age"
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Current Class</label>
                <select
                  value={form.currentClassId || ""}
                  onChange={e => updateForm({ currentClassId: Number(e.target.value) || undefined })}
                  style={input}
                >
                  <option value="">No class assigned</option>
                  {classes.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Organization / House / Department</label>
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
                <label style={label}>Status</label>
                <select
                  value={form.status || "active"}
                  onChange={e => updateForm({ status: e.target.value as StudentStatus })}
                  style={input}
                >
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="transferred">Transferred</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <div style={{ ...card, boxShadow: "none", borderRadius: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Parent / Guardian Information</div>

                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    value={form.parentName || ""}
                    onChange={e => updateForm({ parentName: e.target.value })}
                    placeholder="Parent / guardian name"
                    style={input}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                      gap: 12,
                    }}
                  >
                    <input
                      value={form.parentPhone || ""}
                      onChange={e => updateForm({ parentPhone: e.target.value })}
                      placeholder="Parent phone"
                      style={input}
                    />
                    <input
                      value={form.parentEmail || ""}
                      onChange={e => updateForm({ parentEmail: e.target.value })}
                      placeholder="Parent email"
                      style={input}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={label}>Address</label>
                <textarea
                  value={form.address || ""}
                  onChange={e => updateForm({ address: e.target.value })}
                  placeholder="Student address"
                  rows={3}
                  style={{ ...input, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={label}>Student Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Student"
                    style={{ height: 88, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Cover Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("coverPhoto", e.target.files?.[0])}
                  style={input}
                />
                {form.coverPhoto && (
                  <img
                    src={form.coverPhoto}
                    alt="Student cover"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
