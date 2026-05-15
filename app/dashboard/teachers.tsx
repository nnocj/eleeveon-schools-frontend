"use client";

/**
 * Teachers.tsx
 * ---------------------------------------------------------
 * PROFESSIONAL TEACHER MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: teachers
 *
 * Teacher belongs to a Branch.
 * School context is inherited through selected branch:
 *
 * Active School -> Active Branch -> Teachers
 *
 * Teacher connects to:
 * - Organizations / departments
 * - Assignments
 * - ClassSubject teacher assignment
 * - ClassTeacher
 * - Teacher Attendance
 */

import React, { useEffect, useMemo, useState } from "react";

import {
  db,
  Assignment,
  ClassSubject,
  ClassTeacher,
  Organization,
  Teacher,
  TeacherAttendance,
} from "../lib/db";

import { prepareSyncData } from "../lib/sync/syncUtils";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

// ======================================================
// TYPES
// ======================================================

type TeacherRole = "teacher" | "head_teacher" | "lecturer" | "principal";

type FormState = {
  id?: number;
  organizationId?: number;
  fullName: string;
  gender?: string;
  age?: number;
  photo?: string;
  coverPhoto?: string;
  email?: string;
  phone?: string;
  relativePhone?: string;
  employmentDate?: string;
  salary?: number;
  role: TeacherRole;
  qualification?: string;
  signature?: string;
  active?: boolean;
};

type TeacherView = {
  row: Teacher;
  organizationName: string;
  assignmentCount: number;
  classSubjectCount: number;
  classTeacherCount: number;
  attendanceCount: number;
};

// ======================================================
// COMPONENT
// ======================================================

export default function TeachersPage() {
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

  const [rows, setRows] = useState<Teacher[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendance[]>([]);

  const [search, setSearch] = useState("");
  const [filterOrganizationId, setFilterOrganizationId] = useState<number | undefined>();
  const [filterRole, setFilterRole] = useState<"all" | TeacherRole>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterGender, setFilterGender] = useState<"all" | string>("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>({
    organizationId: undefined,
    fullName: "",
    gender: "",
    age: undefined,
    photo: "",
    coverPhoto: "",
    email: "",
    phone: "",
    relativePhone: "",
    employmentDate: "",
    salary: undefined,
    role: "teacher",
    qualification: "",
    signature: "",
    active: true,
  });

  // ======================================================
  // LOAD DATA
  // ======================================================

  const load = async () => {
    try {
      setLoading(true);

      const [
        teacherRows,
        organizationRows,
        assignmentRows,
        classSubjectRows,
        classTeacherRows,
        attendanceRows,
      ] = await Promise.all([
        db.teachers.toArray(),
        db.organizations.toArray(),
        db.assignments.toArray(),
        db.classSubjects.toArray(),
        db.classTeachers.toArray(),
        db.teacherAttendance.toArray(),
      ]);

      setRows(teacherRows.filter(row => row.branchId === branchId && !row.isDeleted));

      setOrganizations(
        organizationRows.filter(
          row => row.branchId === branchId && !row.isDeleted && row.active !== false
        )
      );

      setAssignments(
        assignmentRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setClassSubjects(
        classSubjectRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setClassTeachers(
        classTeacherRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );

      setTeacherAttendance(
        attendanceRows.filter(row => row.branchId === branchId && !row.isDeleted)
      );
    } catch (error) {
      console.error("Failed to load teachers:", error);
      alert("Failed to load teachers");
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

  const usageMaps = useMemo(() => {
    const assignmentMap = new Map<number, number>();
    const classSubjectMap = new Map<number, number>();
    const classTeacherMap = new Map<number, number>();
    const attendanceMap = new Map<number, number>();

    assignments.forEach(row => {
      assignmentMap.set(row.teacherId, (assignmentMap.get(row.teacherId) || 0) + 1);
    });

    classSubjects.forEach(row => {
      if (!row.teacherId) return;
      classSubjectMap.set(row.teacherId, (classSubjectMap.get(row.teacherId) || 0) + 1);
    });

    classTeachers.forEach(row => {
      classTeacherMap.set(row.teacherId, (classTeacherMap.get(row.teacherId) || 0) + 1);
    });

    teacherAttendance.forEach(row => {
      attendanceMap.set(row.teacherId, (attendanceMap.get(row.teacherId) || 0) + 1);
    });

    return {
      assignmentMap,
      classSubjectMap,
      classTeacherMap,
      attendanceMap,
    };
  }, [assignments, classSubjects, classTeachers, teacherAttendance]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<TeacherView[]>(() => {
    return rows.map(row => {
      const organization = row.organizationId ? organizationMap.get(row.organizationId) : undefined;
      const id = row.id || 0;

      return {
        row,
        organizationName: organization?.name || "No organization",
        assignmentCount: usageMaps.assignmentMap.get(id) || 0,
        classSubjectCount: usageMaps.classSubjectMap.get(id) || 0,
        classTeacherCount: usageMaps.classTeacherMap.get(id) || 0,
        attendanceCount: usageMaps.attendanceMap.get(id) || 0,
      };
    });
  }, [rows, organizationMap, usageMaps]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter(item => {
        const row = item.row;

        if (filterOrganizationId && row.organizationId !== filterOrganizationId) return false;
        if (filterRole !== "all" && row.role !== filterRole) return false;
        if (filterStatus === "active" && row.active === false) return false;
        if (filterStatus === "inactive" && row.active !== false) return false;
        if (filterGender !== "all" && row.gender !== filterGender) return false;

        if (!query) return true;

        return `
          ${row.fullName}
          ${row.gender || ""}
          ${row.email || ""}
          ${row.phone || ""}
          ${row.relativePhone || ""}
          ${row.role || ""}
          ${row.qualification || ""}
          ${item.organizationName}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName));
  }, [viewRows, search, filterOrganizationId, filterRole, filterStatus, filterGender]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter(row => row.active !== false).length,
      inactive: rows.filter(row => row.active === false).length,
      teachers: rows.filter(row => row.role === "teacher").length,
      leaders: rows.filter(row => row.role === "head_teacher" || row.role === "principal").length,
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

  const handleImageUpload = async (
    field: "photo" | "coverPhoto" | "signature",
    file?: File
  ) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const openCreate = () => {
    if (!activeBranchId) {
      alert("Select a branch first before creating a teacher.");
      return;
    }

    setEditMode(false);

    setForm({
      organizationId: undefined,
      fullName: "",
      gender: "",
      age: undefined,
      photo: "",
      coverPhoto: "",
      email: "",
      phone: "",
      relativePhone: "",
      employmentDate: "",
      salary: undefined,
      role: "teacher",
      qualification: "",
      signature: "",
      active: true,
    });

    setDrawerOpen(true);
  };

  const openEdit = (row: Teacher) => {
    setEditMode(true);

    setForm({
      id: row.id,
      organizationId: row.organizationId,
      fullName: row.fullName,
      gender: row.gender || "",
      age: row.age,
      photo: row.photo || "",
      coverPhoto: row.coverPhoto || "",
      email: row.email || "",
      phone: row.phone || "",
      relativePhone: row.relativePhone || "",
      employmentDate: row.employmentDate || "",
      salary: row.salary,
      role: row.role || "teacher",
      qualification: row.qualification || "",
      signature: row.signature || "",
      active: row.active ?? true,
    });

    setDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE
  // ======================================================

  const validate = () => {
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter teacher full name";
    if (!form.role) return "Select teacher role";

    const duplicate = rows.find(row => {
      if (editMode && row.id === form.id) return false;

      const sameEmail =
        form.email?.trim() &&
        row.email?.trim().toLowerCase() === form.email.trim().toLowerCase();

      const samePhone =
        form.phone?.trim() &&
        row.phone?.trim().toLowerCase() === form.phone.trim().toLowerCase();

      return (sameEmail || samePhone) && !row.isDeleted;
    });

    if (duplicate) return "A teacher with this email or phone already exists in this branch";

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
        fullName: form.fullName.trim(),
        gender: form.gender?.trim() || undefined,
        age: form.age == null ? undefined : Number(form.age),
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        relativePhone: form.relativePhone?.trim() || undefined,
        employmentDate: form.employmentDate || undefined,
        salary: form.salary == null ? undefined : Number(form.salary),
        role: form.role,
        qualification: form.qualification?.trim() || undefined,
        signature: form.signature || undefined,
        active: form.active !== false,
      }) as Teacher;

      if (editMode && form.id) {
        await db.teachers.update(form.id, {
          organizationId: payload.organizationId,
          fullName: payload.fullName,
          gender: payload.gender,
          age: payload.age,
          photo: payload.photo,
          coverPhoto: payload.coverPhoto,
          email: payload.email,
          phone: payload.phone,
          relativePhone: payload.relativePhone,
          employmentDate: payload.employmentDate,
          salary: payload.salary,
          role: payload.role,
          qualification: payload.qualification,
          signature: payload.signature,
          active: payload.active,
          updatedAt: payload.updatedAt,
          version: payload.version,
          deviceId: payload.deviceId,
          synced: payload.synced,
          isDeleted: false,
        });
      } else {
        await db.teachers.add(payload);
      }

      setDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to save teacher:", error);
      alert("Failed to save teacher");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;

    const usage = viewRows.find(item => item.row.id === id);
    const totalUsage = usage
      ? usage.assignmentCount +
        usage.classSubjectCount +
        usage.classTeacherCount +
        usage.attendanceCount
      : 0;

    if (totalUsage) {
      const proceed = confirm(
        `This teacher has ${totalUsage} related record(s). Delete anyway?`
      );
      if (!proceed) return;
    } else {
      if (!confirm("Delete this teacher?")) return;
    }

    await db.teachers.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });

    await load();
  };

  const toggleActive = async (row: Teacher) => {
    if (!row.id) return;

    await db.teachers.update(row.id, {
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

  const roleLabel = (role: TeacherRole) => {
    if (role === "head_teacher") return "Head Teacher";
    if (role === "principal") return "Principal";
    if (role === "lecturer") return "Lecturer";
    return "Teacher";
  };

  const roleTone = (role: TeacherRole): "green" | "blue" | "purple" | "orange" => {
    if (role === "principal") return "purple";
    if (role === "head_teacher") return "orange";
    if (role === "lecturer") return "blue";
    return "green";
  };

  // ======================================================
  // LOADING / NO BRANCH
  // ======================================================

  if (loading || contextLoading) {
    return <div style={{ padding: 20 }}>Loading teachers...</div>;
  }

  if (!activeBranchId) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        <div style={{ ...card, textAlign: "center", padding: 34 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Select a branch first</h2>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Teachers belong to a branch. Select a school and branch from the sidebar before managing teachers.
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
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Teachers</h2>
          <div style={{ marginTop: 4, opacity: 0.68, fontSize: 13, fontWeight: 650 }}>
            Managing teachers in <b>{activeBranch?.name || "selected branch"}</b>
            {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
          </div>
        </div>

        <button onClick={openCreate} style={button}>
          + Add Teacher
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
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Total Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.total}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Active</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.active}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Classroom Teachers</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.teachers}</div>
        </div>
        <div style={card}>
          <div style={{ opacity: 0.72, fontSize: 12, fontWeight: 800 }}>Leadership</div>
          <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>{summary.leaders}</div>
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
          placeholder="Search name, phone, email, qualification..."
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
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as any)}
          style={input}
        >
          <option value="all">All Roles</option>
          <option value="teacher">Teacher</option>
          <option value="head_teacher">Head Teacher</option>
          <option value="lecturer">Lecturer</option>
          <option value="principal">Principal</option>
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
                      <span style={badge(roleTone(row.role))}>{roleLabel(row.role)}</span>
                      <span style={badge(row.active === false ? "red" : "green")}>
                        {row.active === false ? "Inactive" : "Active"}
                      </span>
                      {row.gender && <span style={badge("blue")}>{row.gender}</span>}
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.72, fontSize: 13, fontWeight: 650 }}>
                      {item.organizationName}
                      {row.qualification ? ` • ${row.qualification}` : ""}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("blue")}>{item.assignmentCount} assignment(s)</span>
                      <span style={badge("gray")}>{item.classSubjectCount} class subject(s)</span>
                      <span style={badge("gray")}>{item.classTeacherCount} class teacher role(s)</span>
                      {row.phone && <span style={badge("gray")}>{row.phone}</span>}
                      {row.email && <span style={badge("gray")}>{row.email}</span>}
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
            No teachers found in this branch.
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
                  {editMode ? "Edit Teacher" : "Add Teacher"}
                </h3>
                <div style={{ marginTop: 4, opacity: 0.66, fontSize: 13 }}>
                  Teacher will be saved under {activeBranch?.name || "the selected branch"}.
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
                  placeholder="Teacher full name"
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
                <label style={label}>Role</label>
                <select
                  value={form.role}
                  onChange={e => updateForm({ role: e.target.value as TeacherRole })}
                  style={input}
                >
                  <option value="teacher">Teacher</option>
                  <option value="head_teacher">Head Teacher</option>
                  <option value="lecturer">Lecturer</option>
                  <option value="principal">Principal</option>
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

              <div>
                <label style={label}>Qualification</label>
                <input
                  value={form.qualification || ""}
                  onChange={e => updateForm({ qualification: e.target.value })}
                  placeholder="Qualification"
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
                  <label style={label}>Email</label>
                  <input
                    value={form.email || ""}
                    onChange={e => updateForm({ email: e.target.value })}
                    placeholder="Email address"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Phone</label>
                  <input
                    value={form.phone || ""}
                    onChange={e => updateForm({ phone: e.target.value })}
                    placeholder="Phone number"
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
                  <label style={label}>Relative Phone</label>
                  <input
                    value={form.relativePhone || ""}
                    onChange={e => updateForm({ relativePhone: e.target.value })}
                    placeholder="Emergency / relative phone"
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>Employment Date</label>
                  <input
                    type="date"
                    value={form.employmentDate || ""}
                    onChange={e => updateForm({ employmentDate: e.target.value })}
                    style={input}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Salary</label>
                <input
                  type="number"
                  value={form.salary ?? ""}
                  onChange={e =>
                    updateForm({ salary: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  placeholder="Salary"
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
                <label style={label}>Teacher Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("photo", e.target.files?.[0])}
                  style={input}
                />
                {form.photo && (
                  <img
                    src={form.photo}
                    alt="Teacher"
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
                    alt="Teacher cover"
                    style={{ width: "100%", height: 120, borderRadius: 14, marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div>
                <label style={label}>Signature</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageUpload("signature", e.target.files?.[0])}
                  style={input}
                />
                {form.signature && (
                  <img
                    src={form.signature}
                    alt="Teacher signature"
                    style={{ height: 70, borderRadius: 10, marginTop: 8, objectFit: "contain", background: "#fff" }}
                  />
                )}
              </div>

              <button onClick={save} disabled={saving} style={{ ...button, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Teacher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
